/**
 * Keywords Route - POST /api/v1/keywords
 * AI-powered keyword research from page content
 */

import express from 'express';
import { analyzeKeywords } from '../../lib/keywordEngine.js';
import { auditPage } from '../../lib/seoEngine.js';
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

router.post('/', featureAccess('keywords'), async (req, res) => {
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

    // Fetch page
    const html = await fetchPageContent(url);
    const audit = await auditPage(url);

    if (!audit.success) {
      return sendApiError(res, 'AUDIT_FAILED', 'Failed to fetch page', 500);
    }

    const { title, metaDescription } = audit.data.pageData;

    // Analyze keywords
    const analysis = await analyzeKeywords(title, metaDescription, html);

    if (!analysis.success) {
      return sendApiError(res, 'ANALYSIS_FAILED', analysis.error, 500);
    }

    const processingMs = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      data: analysis.data,
      meta: {
        requestId,
        version: '1.0',
        processingMs,
        creditsUsed: 2,
      },
    });
  } catch (error) {
    console.error('Keywords error:', error);
    return sendApiError(res, 'INTERNAL_ERROR', error.message, 500);
  }
});

export default router;
