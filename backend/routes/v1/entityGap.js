/**
 * Entity Gap Route - POST /api/v1/entity-gap
 * Information Gain analysis — what entities your competitors have that you don't
 */

import express from 'express';
import { analyzeEntityGap } from '../../lib/entityEngine.js';
import { featureAccess, creditCheck, sendApiError } from '../../middleware/apiKey.js';
import supabase from '../../supabase.js';
import crypto from 'crypto';

const router = express.Router();

router.post('/', featureAccess('audit'), creditCheck('audit', supabase), async (req, res) => {
  const { url, keyword, competitorUrls = [] } = req.body;

  if (!url) return sendApiError(res, 'MISSING_URL', 'url required', 400);
  if (!keyword) return sendApiError(res, 'MISSING_KEYWORD', 'keyword required', 400);
  if (!Array.isArray(competitorUrls) || competitorUrls.length === 0) {
    return sendApiError(res, 'MISSING_COMPETITORS', 'competitorUrls array required (1-3 URLs)', 400, {
      tip: 'Pass your top 1-3 competitor URLs for this keyword. Find them by Googling your target keyword.',
      example: {
        url: 'https://yoursite.com/page',
        keyword: 'best seo tools 2025',
        competitorUrls: ['https://competitor1.com', 'https://competitor2.com']
      }
    });
  }

  try {
    new URL(url);
    competitorUrls.forEach(u => new URL(u));
  } catch {
    return sendApiError(res, 'INVALID_URL', 'Invalid URL format', 400);
  }

  try {
    const startTime = Date.now();
    const result = await analyzeEntityGap(url, keyword, competitorUrls);

    if (req.deductCredit) req.deductCredit().catch(() => {});

    return res.status(200).json({
      success: true,
      data: {
        id: `gap_${crypto.randomBytes(6).toString('hex')}`,
        ...result,
        analyzedAt: new Date().toISOString(),
      },
      meta: {
        processingMs: Date.now() - startTime,
        creditsUsed: 1,
        note: 'Entity extraction uses Claude Haiku NLP on live page content',
      },
    });
  } catch (error) {
    console.error('Entity gap error:', error);
    return sendApiError(res, 'ANALYSIS_FAILED', error.message, 500);
  }
});

export default router;
