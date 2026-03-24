/**
 * Audit Route - POST /api/v1/audit
 * Full page SEO audit with all pillars
 */

import express from 'express';
import { auditPage } from '../../lib/seoEngine.js';
import { validatePageSchemas } from '../../lib/schemaValidator.js';
import { featureAccess, sendApiResponse, sendApiError } from '../../middleware/apiKey.js';
import { getPageSpeedInsights, cwvToScore } from '../../lib/pageSpeed.js';
import { saveAudit, getAudit, getAuditHistory } from '../../lib/history.js';
import supabase from '../../supabase.js';
import crypto from 'crypto';

const router = express.Router();

// POST /api/v1/audit - Full page audit
router.post('/', featureAccess('audit'), async (req, res) => {
  const { url } = req.body;
  const requestId = `req_${crypto.randomBytes(6).toString('hex')}`;

  if (!url) {
    return sendApiError(res, 'MISSING_URL', 'URL parameter required', 400, {
      example: { url: 'https://example.com' },
    });
  }

  // Validate URL
  try {
    new URL(url);
  } catch (e) {
    return sendApiError(res, 'INVALID_URL', 'Invalid URL format', 400);
  }

  try {
    const startTime = Date.now();

    // Run SEO audit + PageSpeed in parallel
    const [auditResult, ps] = await Promise.all([
      auditPage(url),
      getPageSpeedInsights(url),
    ]);

    if (!auditResult.success) {
      return sendApiError(res, 'AUDIT_FAILED', `Failed to audit page: ${auditResult.error}`, 500);
    }

    const { score, grade, pageData, issues } = auditResult.data;
    const { score: perfScore, issues: cwvIssues } = cwvToScore(ps);

    // Merge CWV issues into the issues list
    const allIssues = [...issues, ...cwvIssues];

    const categoryScores = {
      onPage: Math.min(100, 50 +
        (pageData.title ? 10 : 0) +
        (pageData.metaDescription ? 10 : 0) +
        (pageData.h1.length > 0 ? 10 : 0) +
        (pageData.canonical ? 10 : 0) +
        (pageData.wordCount > 300 ? 10 : 0)
      ),
      technical: Math.min(100, 50 +
        (pageData.viewport ? 15 : 0) +
        (pageData.charset ? 10 : 0) +
        (pageData.robots ? 10 : 0) +
        (pageData.pageSize < 3000000 ? 15 : 0)
      ),
      content: Math.min(100, 50 +
        (pageData.wordCount >= 300 ? 15 : 0) +
        (pageData.h2.length > 0 ? 15 : 0) +
        (pageData.images.length > 0 ? 10 : 0) +
        (pageData.images.filter(i => i.hasAlt).length / Math.max(1, pageData.images.length) > 0.5 ? 10 : 0)
      ),
      performance: perfScore ?? 55,
      mobile: ps?.seoScore ?? (pageData.viewport ? 85 : 50),
      social: Math.min(100, 50 +
        (Object.keys(pageData.openGraph).length >= 4 ? 30 : 0) +
        (pageData.twitterCard ? 20 : 0)
      ),
    };

    const auditData = {
      id: `audit_${crypto.randomBytes(8).toString('hex')}`,
      url,
      score,
      grade,
      categoryScores,
      issues: allIssues.map(issue => ({
        id: issue.id,
        type: issue.type,
        category: issue.id.startsWith('perf') || issue.id.includes('lcp') || issue.id.includes('cls') || issue.id.includes('inp') ? 'Performance' : 'SEO',
        detail: issue.detail || issue.id.replace(/-/g, ' '),
        impact: issue.impact || 3,
      })),
      pageData: {
        title: pageData.title,
        metaDescription: pageData.metaDescription,
        h1: pageData.h1,
        h2: pageData.h2,
        wordCount: pageData.wordCount,
        imageCount: pageData.images.length,
        linkCount: pageData.allLinks.length,
        internalLinks: pageData.internalLinks.length,
        externalLinks: pageData.externalLinks.length,
      },
      coreWebVitals: ps ? {
        performanceScore: ps.performanceScore,
        seoScore: ps.seoScore,
        accessibilityScore: ps.accessibilityScore,
        bestPracticesScore: ps.bestPracticesScore,
        lcp: ps.crux?.lcp,
        lcpCategory: ps.crux?.lcpCategory,
        cls: ps.crux?.cls,
        clsCategory: ps.crux?.clsCategory,
        inp: ps.crux?.inp,
        inpCategory: ps.crux?.inpCategory,
        fcp: ps.crux?.fcp,
        lighthouse: ps.lighthouse,
        opportunities: ps.opportunities,
        source: 'Google PageSpeed Insights API',
      } : null,
      schema: {
        types: pageData.jsonLD.map(s => s['@type']).filter(Boolean),
        count: pageData.jsonLD.length,
      },
      mobile: { hasViewport: pageData.viewport },
      robots: {
        indexable: !pageData.robots || !pageData.robots.includes('noindex'),
        followable: !pageData.robots || !pageData.robots.includes('nofollow'),
      },
      createdAt: new Date().toISOString(),
    };

    const processingMs = Date.now() - startTime;

    // Persist to Supabase (fire-and-forget — never blocks response)
    saveAudit(supabase, {
      id: auditData.id,
      url,
      score,
      grade,
      data: auditData,
      userId: req.user?.id,
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      data: auditData,
      meta: {
        requestId,
        version: '1.0',
        processingMs,
        creditsUsed: 1,
      },
    });
  } catch (error) {
    console.error('Audit error:', error);
    return sendApiError(res, 'INTERNAL_ERROR', error.message, 500);
  }
});

// GET /api/v1/audit/history?url= - Score trend for a URL
router.get('/history', async (req, res) => {
  const { url, limit = 20 } = req.query;
  if (!url) return sendApiError(res, 'MISSING_URL', 'url query param required', 400);

  const history = await getAuditHistory(supabase, url, parseInt(limit, 10));
  return res.status(200).json({ success: true, data: history });
});

// GET /api/v1/audit/:id - Retrieve stored audit by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const record = await getAudit(supabase, id);
  if (!record) return sendApiError(res, 'NOT_FOUND', 'Audit not found', 404);
  return res.status(200).json({ success: true, data: record });
});

export default router;
