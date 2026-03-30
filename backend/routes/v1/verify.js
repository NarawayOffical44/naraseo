/**
 * Verify Route - POST /api/v1/verify
 * Hallucination detection + E-E-A-T scoring for AI-generated content
 */

import express from 'express';
import { verifyClaims } from '../../lib/verifyEngine.js';
import { featureAccess, creditCheck, sendApiResponse, sendApiError } from '../../middleware/apiKey.js';
import supabase from '../../supabase.js';
import crypto from 'crypto';

const router = express.Router();

// POST /api/v1/verify
router.post('/', featureAccess('audit'), creditCheck('audit', supabase), async (req, res) => {
  const { content, url } = req.body;

  if (!content || typeof content !== 'string') {
    return sendApiError(res, 'MISSING_CONTENT', 'content (string) parameter required', 400, {
      example: { content: 'The interest rate is 4%. Studies show 90% of users prefer mobile.', url: 'https://example.com/blog-post' }
    });
  }

  if (content.length < 50) {
    return sendApiError(res, 'CONTENT_TOO_SHORT', 'content must be at least 50 characters', 400);
  }

  if (content.length > 10000) {
    return sendApiError(res, 'CONTENT_TOO_LONG', 'content must be under 10,000 characters. Split into sections.', 400);
  }

  try {
    const startTime = Date.now();
    const result = await verifyClaims(content);

    if (req.deductCredit) req.deductCredit().catch(() => {});

    return res.status(200).json({
      success: true,
      data: {
        id: `verify_${crypto.randomBytes(6).toString('hex')}`,
        url: url || null,
        ...result,
        analyzedAt: new Date().toISOString(),
      },
      meta: {
        processingMs: Date.now() - startTime,
        creditsUsed: 1,
        model: 'claude-haiku + wikipedia',
      },
    });
  } catch (error) {
    console.error('Verify error:', error);
    return sendApiError(res, 'VERIFY_FAILED', error.message, 500);
  }
});

export default router;
