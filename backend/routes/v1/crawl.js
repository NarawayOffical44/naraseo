/**
 * Crawl Route - POST /api/v1/crawl
 * Multi-page site crawl with per-page audit
 */

import express from 'express';
import { crawlSite } from '../../lib/crawlEngine.js';
import { featureAccess, sendApiError } from '../../middleware/apiKey.js';
import crypto from 'crypto';

const router = express.Router();

router.post('/', featureAccess('crawl'), async (req, res) => {
  const { url, maxPages = 50, maxDepth = 2, concurrency = 3 } = req.body;
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

    const crawlResult = await crawlSite(url, {
      maxPages: Math.min(maxPages, 500),
      maxDepth,
      concurrency,
    });

    if (!crawlResult.success) {
      return sendApiError(res, 'CRAWL_FAILED', crawlResult.error, 500);
    }

    const processingMs = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      data: crawlResult.data,
      meta: {
        requestId,
        version: '1.0',
        processingMs,
        creditsUsed: crawlResult.data.totalPagesFound,
      },
    });
  } catch (error) {
    console.error('Crawl error:', error);
    return sendApiError(res, 'INTERNAL_ERROR', error.message, 500);
  }
});

export default router;
