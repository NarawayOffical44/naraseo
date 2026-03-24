/**
 * Schema Route - POST /api/v1/schema/validate
 * Validate structured data
 */

import express from 'express';
import { validatePageSchemas } from '../../lib/schemaValidator.js';
import { featureAccess, sendApiError } from '../../middleware/apiKey.js';
import crypto from 'crypto';
import https from 'https';

const router = express.Router();

async function fetchPageContent(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve(data);
        });
      })
      .on('error', reject);
  });
}

router.post('/validate', featureAccess('schema'), async (req, res) => {
  const { url } = req.body;
  const requestId = `req_${crypto.randomBytes(6).toString('hex')}`;

  if (!url) {
    return sendApiError(res, 'MISSING_URL', 'URL parameter required', 400);
  }

  try {
    new URL(url);
  } catch (e) {
    return sendApiError(res, 'INVALID_URL', 'Invalid URL format', 400);
  }

  try {
    const startTime = Date.now();

    const html = await fetchPageContent(url);
    const validation = validatePageSchemas(html);

    if (!validation.success) {
      return sendApiError(res, 'VALIDATION_FAILED', validation.error, 500);
    }

    const processingMs = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      data: validation.data,
      meta: {
        requestId,
        version: '1.0',
        processingMs,
        creditsUsed: 1,
      },
    });
  } catch (error) {
    console.error('Schema validation error:', error);
    return sendApiError(res, 'INTERNAL_ERROR', error.message, 500);
  }
});

export default router;
