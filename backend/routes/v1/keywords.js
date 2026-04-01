/**
 * Keywords Route - POST /api/v1/keywords
 * Trending keyword suggestions grounded in page content or AI-generated text.
 *
 * Accepts:
 *   { url }      — crawls the page, extracts topic, finds trending keywords
 *   { content }  — analyzes raw text directly (AI-generated drafts, product copy, etc.)
 */

import express from 'express';
import { analyzeKeywords } from '../../lib/keywordEngine.js';
import { auditPage } from '../../lib/seoEngine.js';
import { featureAccess, sendApiError } from '../../middleware/apiKey.js';
import crypto from 'crypto';

const router = express.Router();

router.post('/', featureAccess('keywords'), async (req, res) => {
  const { url, content } = req.body;
  const requestId = `req_${crypto.randomBytes(6).toString('hex')}`;

  if (!url && !content) {
    return sendApiError(res, 'MISSING_INPUT', 'Provide either url or content', 400, {
      examples: [
        { url: 'https://example.com/blog/protein-powder' },
        { content: 'Your AI-generated article text here...' },
      ],
    });
  }

  try {
    const startTime = Date.now();
    let title = '', metaDescription = '', pageContent = '';

    if (url) {
      try { new URL(url); } catch {
        return sendApiError(res, 'INVALID_URL', 'Invalid URL format', 400);
      }
      const audit = await auditPage(url);
      if (!audit.success) return sendApiError(res, 'FETCH_FAILED', 'Failed to fetch page', 500);
      title           = audit.data.pageData.title || '';
      metaDescription = audit.data.pageData.metaDescription || '';
      pageContent     = audit.rawHtml || content || '';
    } else {
      // Raw content mode — extract title from first line or H1-like opening
      pageContent = content;
      const firstLine = content.split('\n').find(l => l.trim().length > 0) || '';
      title = firstLine.replace(/^#+\s*/, '').trim().slice(0, 100);
    }

    const analysis = await analyzeKeywords(title, metaDescription, pageContent);

    if (!analysis.success) {
      return sendApiError(res, 'ANALYSIS_FAILED', analysis.error, 500);
    }

    return res.status(200).json({
      success: true,
      data: analysis.data,
      meta: {
        requestId,
        version: '2.0',
        processingMs: Date.now() - startTime,
        creditsUsed: 2,
        input_type: url ? 'url' : 'content',
      },
    });
  } catch (error) {
    console.error('Keywords error:', error);
    return sendApiError(res, 'INTERNAL_ERROR', error.message, 500);
  }
});

export default router;
