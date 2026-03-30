/**
 * Risk Audit Route - POST /api/v1/audit/risk
 * Hallucination Risk Audit for AI-generated or human content.
 * Returns publishable verdict, legal risk signals, and fixes before publishing.
 */

import express from 'express';
import { analyzeRisk } from '../../lib/riskEngine.js';
import { fetchURL } from '../../lib/seoEngine.js';
import { featureAccess, creditCheck, sendApiError } from '../../middleware/apiKey.js';
import supabase from '../../supabase.js';
import crypto from 'crypto';

const router = express.Router();

router.post('/', featureAccess('audit'), creditCheck('audit', supabase), async (req, res) => {
  const { content, url, industry } = req.body;

  // Must have content OR url
  if (!content && !url) {
    return sendApiError(res, 'MISSING_INPUT', 'Provide content (text) or url to analyse', 400, {
      example: {
        content: 'OpenAI was founded in 2015. The treatment requires 500mg daily for 30 days.',
        industry: 'medical', // optional: medical | legal | financial | general
      },
    });
  }

  if (content && content.length < 30) {
    return sendApiError(res, 'CONTENT_TOO_SHORT', 'Content must be at least 30 characters', 400);
  }

  if (content && content.length > 15000) {
    return sendApiError(res, 'CONTENT_TOO_LARGE', 'Content must be under 15,000 characters', 400);
  }

  if (industry && !['medical', 'legal', 'financial', 'general'].includes(industry)) {
    return sendApiError(res, 'INVALID_INDUSTRY', 'industry must be: medical | legal | financial | general', 400);
  }

  try {
    const startTime = Date.now();

    let textToAnalyse = content;

    // Fetch from URL if no content provided
    if (!textToAnalyse && url) {
      try { new URL(url); } catch { return sendApiError(res, 'INVALID_URL', 'Invalid URL format', 400); }
      const html = await fetchURL(url).catch(() => null);
      if (!html) return sendApiError(res, 'FETCH_FAILED', 'Could not fetch content from URL', 422);
      textToAnalyse = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 10000);
    }

    const result = await analyzeRisk(textToAnalyse, industry || null);

    if (req.deductCredit) req.deductCredit().catch(() => {});

    return res.status(200).json({
      success: true,
      data: {
        id: `risk_${crypto.randomBytes(6).toString('hex')}`,
        ...result,
        analysedAt: new Date().toISOString(),
        source_url: url || null,
      },
      meta: {
        processingMs: Date.now() - startTime,
        creditsUsed: 1,
        note: 'Risk audit combines factual claim analysis with industry-specific signal detection.',
      },
    });
  } catch (error) {
    console.error('Risk audit error:', error);
    return sendApiError(res, 'ANALYSIS_FAILED', error.message, 500);
  }
});

export default router;
