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

  // competitorUrls is optional — if omitted, auto-discovers via Google CSE
  const hasAutoDiscover = !!(process.env.GOOGLE_CSE_API_KEY || process.env.GOOGLE_SEARCH_API_KEY) && !!process.env.GOOGLE_CSE_ID;
  if (!Array.isArray(competitorUrls) || competitorUrls.length === 0) {
    if (!hasAutoDiscover) {
      return sendApiError(res, 'MISSING_COMPETITORS', 'competitorUrls required when auto-discovery is not configured', 400, {
        tip: 'Pass 1-3 competitor URLs to compare against.',
        example: { url: 'https://yoursite.com/page', keyword: 'best seo tools 2025', competitorUrls: ['https://competitor1.com'] },
      });
    }
    // auto-discover top-ranking competitors — proceed with empty array
  }

  try {
    new URL(url);
    (competitorUrls || []).forEach(u => new URL(u));
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
        competitor_discovery: competitorUrls?.length > 0 ? 'manual' : 'auto',
        note: 'Entity gap uses live page content analysis and semantic comparison across competitors',
      },
    });
  } catch (error) {
    console.error('Entity gap error:', error);
    return sendApiError(res, 'ANALYSIS_FAILED', error.message, 500);
  }
});

export default router;
