/**
 * Content Optimization Route - POST /api/v1/content
 * Identifies exactly WHERE to place keywords in existing page content.
 * Does NOT rewrite or restructure — changes are minimal and invisible.
 *
 * Input:  { url, targetKeywords?: string[] }
 * Output: { placements[] } — each item: which element to change, current text, suggested text
 */

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { auditPage, fetchURL } from '../../lib/seoEngine.js';
import { analyzeKeywords } from '../../lib/keywordEngine.js';
import { featureAccess, sendApiError } from '../../middleware/apiKey.js';
import crypto from 'crypto';

const router = express.Router();
const anthropic = new Anthropic();

router.post('/', featureAccess('keywords'), async (req, res) => {
  const { url, targetKeywords = [] } = req.body;
  const requestId = `req_${crypto.randomBytes(6).toString('hex')}`;

  if (!url) return sendApiError(res, 'MISSING_URL', 'url parameter required', 400);
  try { new URL(url); } catch { return sendApiError(res, 'INVALID_URL', 'Invalid URL format', 400); }

  try {
    const startTime = Date.now();

    // Fetch page + audit in parallel
    const [auditResult, html] = await Promise.all([
      auditPage(url),
      fetchURL(url).catch(() => ''),
    ]);

    if (!auditResult.success) {
      return sendApiError(res, 'FETCH_FAILED', `Could not fetch page: ${auditResult.error}`, 502);
    }

    const { pageData } = auditResult.data;

    // Get target keywords — use provided ones or derive from keyword research
    let keywords = targetKeywords.filter(Boolean);
    if (keywords.length === 0 && html) {
      const kwResult = await analyzeKeywords(pageData.title, pageData.metaDescription, html).catch(() => null);
      const aiKws = kwResult?.data?.analysis?.primaryKeywords || [];
      keywords = aiKws.slice(0, 5).map(k => (typeof k === 'string' ? k : k.keyword)).filter(Boolean);
    }

    if (keywords.length === 0) {
      return sendApiError(res, 'NO_KEYWORDS', 'Could not determine target keywords. Provide targetKeywords in request body.', 422);
    }

    // Build a compact content snapshot for Claude — just the editable elements
    const h2Sample = pageData.h2.slice(0, 5).join(' | ') || 'none';
    const firstBodyText = html
      ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 800)
      : '';
    const imageAlts = (pageData.images || []).filter(i => i.hasAlt).slice(0, 5).map(i => i.alt).join(', ') || 'none';

    const prompt = `You are an expert SEO strategist. Your job is to suggest MINIMAL keyword insertions into existing page content.

RULES:
- Do NOT rewrite sentences. Only add 1-4 words at a natural point.
- Do NOT change the meaning or tone.
- Insertions must feel like they were always there.
- Only suggest a change if the keyword fits naturally. Skip if forced.
- Target elements: title, meta description, H1, H2s, first paragraph, image alt text.

PAGE DATA:
URL: ${url}
Title: ${pageData.title || 'MISSING'}
Meta description: ${pageData.metaDescription || 'MISSING'}
H1: ${pageData.h1.join(' | ') || 'MISSING'}
H2s (first 5): ${h2Sample}
Image alts (first 5): ${imageAlts}
First ~800 chars of visible text:
${firstBodyText}

TARGET KEYWORDS: ${keywords.join(', ')}

Return valid JSON only (no markdown):
{
  "placements": [
    {
      "element": "title",
      "keyword": "target keyword",
      "currentText": "exact current text of this element",
      "suggestedText": "exact new text with keyword naturally inserted",
      "changeType": "insert" | "append" | "replace_word",
      "impact": "high" | "medium" | "low",
      "reason": "1-sentence SEO reason"
    }
  ],
  "skipped": ["keyword that could not be placed naturally"],
  "summary": "1-sentence summary of changes"
}`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    let result = { placements: [], skipped: [], summary: '' };
    try {
      const text = response.content[0]?.text || '{}';
      const clean = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
      result = JSON.parse(clean);
    } catch {
      result.summary = response.content[0]?.text?.slice(0, 200) || 'Analysis complete.';
    }

    return res.status(200).json({
      success: true,
      data: {
        url,
        targetKeywords: keywords,
        ...result,
      },
      meta: {
        requestId,
        version: '1.0',
        processingMs: Date.now() - startTime,
        creditsUsed: 2,
      },
    });
  } catch (error) {
    console.error('[content] error:', error);
    return sendApiError(res, 'INTERNAL_ERROR', error.message, 500);
  }
});

export default router;
