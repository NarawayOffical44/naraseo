/**
 * Verify Route - POST /api/v1/verify
 * Hallucination detection + E-E-A-T scoring for AI-generated content.
 * Every verification is logged as a Certificate of Accuracy (retrievable by ID).
 */

import express from 'express';
import { verifyClaims } from '../../lib/verifyEngine.js';
import { saveVerification, getVerification } from '../../lib/history.js';
import { featureAccess, creditCheck, sendApiError } from '../../middleware/apiKey.js';
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

    const certificateId = `cert_${crypto.randomBytes(8).toString('hex')}`;
    const contentHash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);

    // Save certificate (fire-and-forget)
    saveVerification(supabase, {
      id: certificateId,
      contentHash,
      userId: req.user?.id,
      verdict: result.summary.verdict,
      publishable: result.summary.verdict === 'clean',
      riskLevel: null,
      flaggedCount: result.summary.flagged,
      eeatScore: result.eeat?.score,
      resultJson: result,
      sourceUrl: url || null,
    }).catch(() => {});

    if (req.deductCredit) req.deductCredit().catch(() => {});

    return res.status(200).json({
      success: true,
      data: {
        certificate_id: certificateId,
        certificate_url: `${req.protocol}://${req.get('host')}/api/v1/verify/${certificateId}`,
        content_hash: contentHash,
        url: url || null,
        ...result,
        analyzedAt: new Date().toISOString(),
      },
      meta: {
        processingMs: Date.now() - startTime,
        creditsUsed: 1,
        note: 'Certificate of Accuracy — share certificate_id or certificate_url as proof this content was verified.',
      },
    });
  } catch (error) {
    console.error('Verify error:', error);
    return sendApiError(res, 'VERIFY_FAILED', error.message, 500);
  }
});

// GET /api/v1/verify/:id — retrieve a Certificate of Accuracy by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  if (!id.startsWith('cert_')) {
    return sendApiError(res, 'INVALID_ID', 'Certificate ID must start with cert_', 400);
  }
  const record = await getVerification(supabase, id);
  if (!record) return sendApiError(res, 'NOT_FOUND', 'Certificate not found', 404);

  return res.status(200).json({
    success: true,
    data: {
      certificate_id: record.id,
      content_hash: record.content_hash,
      verdict: record.verdict,
      publishable: record.publishable,
      flagged_claims: record.flagged_count,
      eeat_score: record.eeat_score,
      source_url: record.source_url,
      verified_at: record.created_at,
      full_report: record.result_json,
    },
  });
});

export default router;
