/**
 * Solve Route - POST /api/v1/solve
 * Autonomous full-stack SEO analysis + execution plan.
 * One call → audit + keywords + schema → Claude synthesises → precise fixes with exact placement.
 */

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { auditPage, fetchURL } from '../../lib/seoEngine.js';
import { analyzeKeywords } from '../../lib/keywordEngine.js';
import { validatePageSchemas } from '../../lib/schemaValidator.js';
import { getPageSpeedInsights, cwvToScore } from '../../lib/pageSpeed.js';
import { featureAccess, sendApiError } from '../../middleware/apiKey.js';
import crypto from 'crypto';

const router = express.Router();
const anthropic = new Anthropic();

router.post('/', featureAccess('audit'), async (req, res) => {
  const { url, businessName, phone, address } = req.body;
  const requestId = `req_${crypto.randomBytes(6).toString('hex')}`;

  if (!url) return sendApiError(res, 'MISSING_URL', 'url parameter required', 400);
  try { new URL(url); } catch { return sendApiError(res, 'INVALID_URL', 'Invalid URL format', 400); }

  try {
    const startTime = Date.now();

    // ── Step 1: Fetch page + audit + PageSpeed in parallel ───────────────────
    const [auditResult, html, ps] = await Promise.all([
      auditPage(url),
      fetchURL(url).catch(() => ''),
      getPageSpeedInsights(url),
    ]);

    if (!auditResult.success) {
      return sendApiError(res, 'FETCH_FAILED', `Could not fetch page: ${auditResult.error}`, 502);
    }

    const { pageData, issues, score, grade } = auditResult.data;

    // ── Step 2: Keyword analysis + schema validation in parallel ──────────────
    const [keywordResult, schemaResult] = await Promise.all([
      analyzeKeywords(pageData.title, pageData.metaDescription, html).catch(() => null),
      html ? Promise.resolve(validatePageSchemas(html)) : Promise.resolve(null),
    ]);

    // ── Step 3: Claude synthesises everything into a precise action plan ───────
    const { score: perfScore, issues: cwvIssues } = cwvToScore(ps);
    const allIssues = [...issues, ...cwvIssues];

    const issueList = allIssues.slice(0, 12).map(i => `- ${i.id} (impact: ${i.impact || 'medium'}${i.detail ? ' — ' + i.detail : ''})`).join('\n');
    const schemaTypes = pageData.jsonLD.map(s => s['@type']).filter(Boolean).join(', ') || 'none';
    const localContext = businessName ? `Business: ${businessName}${phone ? `, Phone: ${phone}` : ''}${address ? `, Address: ${address}` : ''}` : '';
    const cwvBlock = ps ? `
Core Web Vitals (Google PageSpeed Insights):
- Performance score: ${ps.performanceScore ?? 'n/a'}/100
- SEO score (Google): ${ps.seoScore ?? 'n/a'}/100
- LCP: ${ps.crux?.lcp ? ps.crux.lcp + 'ms (' + ps.crux.lcpCategory + ')' : 'no data'}
- CLS: ${ps.crux?.cls != null ? ps.crux.cls + ' (' + ps.crux.clsCategory + ')' : 'no data'}
- INP: ${ps.crux?.inp ? ps.crux.inp + 'ms (' + ps.crux.inpCategory + ')' : 'no data'}
- Top opportunity: ${ps.opportunities?.[0]?.title || 'none'}` : '';

    const synthesisPrompt = `You are a senior SEO engineer. Analyse this page data and return a complete, executable action plan as valid JSON only (no markdown, no explanation outside JSON).

URL: ${url}
SEO Score: ${score}/100 (Grade: ${grade})
Title: ${pageData.title || 'MISSING'}
Meta description: ${pageData.metaDescription || 'MISSING'}
H1: ${pageData.h1.join(' | ') || 'MISSING'}
H2 count: ${pageData.h2.length}
Word count: ${pageData.wordCount}
Canonical: ${pageData.canonical || 'not set'}
Viewport: ${pageData.viewport ? 'yes' : 'MISSING'}
Open Graph tags: ${Object.keys(pageData.openGraph).length}
Schema types: ${schemaTypes}
${cwvBlock}
Issues detected:
${issueList || 'none'}
${localContext}

Return this exact JSON structure:
{
  "summary": "2 sentence plain-English assessment of the page SEO health",
  "fixes": [
    {
      "priority": 1,
      "issue": "issue-id-slug",
      "impact": "high",
      "where": "Exact location e.g. Inside <head>, after <title> tag",
      "code": "<exact html to add or change>",
      "explanation": "Why this matters for SEO",
      "applyVia": {
        "directEdit": "Open the HTML file, find <head>, paste after <title>",
        "wordpress": "Settings > General > Tagline or use Yoast SEO plugin > Edit snippet",
        "api": "PATCH /wp-json/wp/v2/pages/:id with { excerpt: '...' } or CMS-specific endpoint"
      }
    }
  ],
  "keywordOpportunities": [
    {
      "keyword": "target keyword",
      "intent": "informational",
      "action": "Add this keyword to H2 subheadings and first paragraph"
    }
  ],
  "quickWins": [
    "Specific 1-line action the user can do in under 5 minutes"
  ],
  "estimatedScoreAfterFixes": 85
}`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: synthesisPrompt }],
    });

    let plan = {};
    try {
      const text = response.content[0]?.text || '{}';
      const clean = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
      plan = JSON.parse(clean);
    } catch {
      plan = {
        summary: response.content[0]?.text?.slice(0, 300) || 'Analysis complete.',
        fixes: [],
        quickWins: [],
        estimatedScoreAfterFixes: score,
      };
    }

    const processingMs = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      data: {
        url,
        score,
        grade,
        ...plan,
        pageData: {
          title: pageData.title,
          metaDescription: pageData.metaDescription,
          h1: pageData.h1,
          wordCount: pageData.wordCount,
          imageCount: pageData.images.length,
          schemaTypes,
          hasViewport: pageData.viewport,
          hasCanonical: !!pageData.canonical,
        },
        schemaStatus: schemaResult?.data || null,
        keywords: keywordResult?.data?.analysis || null,
        coreWebVitals: ps ? {
          performanceScore: ps.performanceScore,
          seoScore: ps.seoScore,
          lcp: ps.crux?.lcp,
          lcpCategory: ps.crux?.lcpCategory,
          cls: ps.crux?.cls,
          clsCategory: ps.crux?.clsCategory,
          inp: ps.crux?.inp,
          inpCategory: ps.crux?.inpCategory,
          lighthouse: ps.lighthouse,
          opportunities: ps.opportunities?.slice(0, 3),
          source: 'Google PageSpeed Insights API',
        } : null,
      },
      meta: {
        requestId,
        version: '1.0',
        processingMs,
        creditsUsed: 3,
      },
    });
  } catch (error) {
    console.error('[solve] error:', error);
    return sendApiError(res, 'INTERNAL_ERROR', error.message, 500);
  }
});

export default router;
