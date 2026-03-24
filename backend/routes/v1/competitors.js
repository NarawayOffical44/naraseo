/**
 * Competitors Route - POST /api/v1/competitors
 * Competitor gap analysis
 */

import express from 'express';
import { featureAccess, sendApiError } from '../../middleware/apiKey.js';
import crypto from 'crypto';
import { auditPage } from '../../lib/seoEngine.js';
import { getBacklinkData } from '../../lib/backlinks.js';

const router = express.Router();

router.post('/', featureAccess('competitors'), async (req, res) => {
  const { url, competitorUrls = [] } = req.body;
  const requestId = `req_${crypto.randomBytes(6).toString('hex')}`;

  if (!url || competitorUrls.length === 0) {
    return sendApiError(res, 'MISSING_PARAMS', 'url and competitorUrls array required', 400);
  }

  try {
    new URL(url);
    competitorUrls.forEach(cu => new URL(cu));
  } catch (e) {
    return sendApiError(res, 'INVALID_URL', 'Invalid URL format', 400);
  }

  try {
    const startTime = Date.now();

    // Audit main URL + backlinks in parallel
    const [mainAudit, mainBacklinks] = await Promise.all([
      auditPage(url),
      getBacklinkData(url),
    ]);

    if (!mainAudit.success) {
      return sendApiError(res, 'AUDIT_FAILED', 'Failed to audit main URL', 500);
    }

    // Audit competitors + their backlinks in parallel
    const competitorAudits = [];
    const competitorBatches = await Promise.all(
      competitorUrls.slice(0, 5).map(compUrl =>
        Promise.all([auditPage(compUrl), getBacklinkData(compUrl)])
      )
    );
    for (let i = 0; i < competitorBatches.length; i++) {
      const [audit, backlinks] = competitorBatches[i];
      if (audit.success) {
        competitorAudits.push({
          url: competitorUrls[i],
          score: audit.data.score,
          wordCount: audit.data.pageData.wordCount,
          h1: audit.data.pageData.h1,
          images: audit.data.pageData.images.length,
          domainAuthority: backlinks ? { pageRank: backlinks.pageRank, domainRank: backlinks.domainRank } : null,
        });
      }
    }

    // Calculate gaps
    const avgCompetitorScore = competitorAudits.length > 0
      ? Math.round(competitorAudits.reduce((sum, c) => sum + c.score, 0) / competitorAudits.length)
      : 0;

    const gaps = {
      scoreGap: avgCompetitorScore - mainAudit.data.score,
      wordCountGap: Math.max(...competitorAudits.map(c => c.wordCount), 0) - mainAudit.data.pageData.wordCount,
      opportunities: [
        mainAudit.data.pageData.wordCount < 500 && 'Expand content word count',
        mainAudit.data.pageData.images.length < 3 && 'Add more images',
        !mainAudit.data.pageData.h2.length && 'Add subheadings (H2)',
      ].filter(Boolean),
    };

    const processingMs = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      data: {
        url,
        mainScore: mainAudit.data.score,
        domainAuthority: mainBacklinks ? { pageRank: mainBacklinks.pageRank, domainRank: mainBacklinks.domainRank } : null,
        competitors: competitorAudits,
        analysis: {
          avgCompetitorScore,
          ...gaps,
        },
      },
      meta: {
        requestId,
        version: '1.0',
        processingMs,
        creditsUsed: 1 + competitorAudits.length,
      },
    });
  } catch (error) {
    console.error('Competitors error:', error);
    return sendApiError(res, 'INTERNAL_ERROR', error.message, 500);
  }
});

export default router;
