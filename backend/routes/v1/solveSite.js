/**
 * Solve-Site Route - POST /api/v1/solve-site
 * Site-wide autonomous SEO analysis.
 *
 * Flow:
 *  1. Discover all URLs via sitemap.xml (or fall back to crawl)
 *  2. Audit every page in parallel batches
 *  3. ONE Claude call on aggregated results → site-wide priority action plan
 *
 * Cost-efficient: Claude is called once regardless of page count.
 */

import express from 'express';
import https from 'https';
import http from 'http';
import Anthropic from '@anthropic-ai/sdk';
import { auditPage } from '../../lib/seoEngine.js';
import { featureAccess, sendApiError } from '../../middleware/apiKey.js';
import crypto from 'crypto';

const router = express.Router();
const anthropic = new Anthropic();

// ── Sitemap fetcher ───────────────────────────────────────────────────────────
async function fetchText(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'NaraseoBot/1.0' } }, (res) => {
      // Follow single redirect
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return fetchText(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return resolve('');
      let data = '';
      res.on('data', c => { if (data.length < 500000) data += c; });
      res.on('end', () => resolve(data));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(''); });
    req.on('error', () => resolve(''));
  });
}

// Extract URLs from sitemap XML (handles sitemap index + regular sitemaps)
function extractSitemapUrls(xml, domain) {
  const urls = new Set();
  // Sitemap index — extract child sitemap locations
  const locRegex = /<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi;
  let m;
  while ((m = locRegex.exec(xml)) !== null) {
    const u = m[1].trim();
    if (u.includes(domain)) urls.add(u);
  }
  return [...urls];
}

async function discoverUrls(rootUrl, maxPages = 100) {
  const { hostname, origin, protocol } = new URL(rootUrl);

  // Try robots.txt for Sitemap directive
  const robots = await fetchText(`${origin}/robots.txt`);
  const sitemapFromRobots = robots.match(/Sitemap:\s*(https?:\/\/[^\s]+)/i)?.[1];

  // Candidate sitemap URLs to try
  const candidates = [
    sitemapFromRobots,
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
  ].filter(Boolean);

  let allUrls = [];

  for (const sitemapUrl of candidates) {
    const xml = await fetchText(sitemapUrl);
    if (!xml || !xml.includes('<urlset') && !xml.includes('<sitemapindex')) continue;

    if (xml.includes('<sitemapindex')) {
      // It's an index — fetch each child sitemap
      const childSitemaps = extractSitemapUrls(xml, hostname).filter(u => u.endsWith('.xml'));
      for (const child of childSitemaps.slice(0, 5)) {
        const childXml = await fetchText(child);
        allUrls.push(...extractSitemapUrls(childXml, hostname));
      }
    } else {
      allUrls.push(...extractSitemapUrls(xml, hostname));
    }

    if (allUrls.length > 0) break;
  }

  // Remove XML sitemap URLs themselves, deduplicate
  const pageUrls = [...new Set(
    allUrls.filter(u => !u.endsWith('.xml') && !u.endsWith('.xsl'))
  )].slice(0, maxPages);

  // If sitemap found nothing, fall back to root URL only (crawl is handled by /crawl endpoint)
  return pageUrls.length > 0 ? pageUrls : [rootUrl];
}

// ── Batch audit — runs N audits in parallel, respects concurrency limit ───────
async function auditBatch(urls, concurrency = 5) {
  const results = [];
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(u => auditPage(u).catch(e => ({ success: false, url: u, error: e.message }))));
    results.push(...batchResults);
  }
  return results;
}

// ── Main route ────────────────────────────────────────────────────────────────
router.post('/', featureAccess('audit'), async (req, res) => {
  const { url, maxPages = 50 } = req.body;
  const requestId = `req_${crypto.randomBytes(6).toString('hex')}`;

  if (!url) return sendApiError(res, 'MISSING_URL', 'url parameter required', 400);
  try { new URL(url); } catch { return sendApiError(res, 'INVALID_URL', 'Invalid URL format', 400); }

  const cap = Math.min(Number(maxPages) || 50, 100);

  try {
    const startTime = Date.now();

    // Step 1 — Discover all pages
    const urls = await discoverUrls(url, cap);
    const discoveryMethod = urls.length > 1 ? 'sitemap' : 'root-only';

    // Step 2 — Audit every page in parallel batches
    const auditResults = await auditBatch(urls, 5);

    const successful = auditResults.filter(r => r.success);
    const failed = auditResults.filter(r => !r.success).map(r => r.url || r.error);

    if (successful.length === 0) {
      return sendApiError(res, 'ALL_AUDITS_FAILED', 'Could not audit any pages on this site', 502);
    }

    // Step 3 — Aggregate for Claude synthesis
    const scores = successful.map(r => r.data.score);
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);

    // Collect all unique issues across the site with frequency count
    const issueFreq = {};
    for (const r of successful) {
      for (const issue of r.data.issues || []) {
        issueFreq[issue.id] = (issueFreq[issue.id] || 0) + 1;
      }
    }
    const topIssues = Object.entries(issueFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([id, count]) => ({ id, affectedPages: count, pct: Math.round((count / successful.length) * 100) }));

    // Worst 5 pages
    const worstPages = successful
      .sort((a, b) => a.data.score - b.data.score)
      .slice(0, 5)
      .map(r => ({ url: r.data.url, score: r.data.score, grade: r.data.grade, issues: (r.data.issues || []).slice(0, 3).map(i => i.id) }));

    // Best 3 pages (reference)
    const bestPages = successful
      .sort((a, b) => b.data.score - a.data.score)
      .slice(0, 3)
      .map(r => ({ url: r.data.url, score: r.data.score, grade: r.data.grade }));

    // Missing meta across site
    const missingMeta = successful.filter(r => !r.data.pageData?.metaDescription).length;
    const missingH1 = successful.filter(r => !r.data.pageData?.h1?.length).length;
    const missingCanonical = successful.filter(r => !r.data.pageData?.canonical).length;
    const missingViewport = successful.filter(r => !r.data.pageData?.viewport).length;
    const noSchema = successful.filter(r => !r.data.pageData?.jsonLD?.length).length;

    // Step 4 — One Claude call to synthesise site-wide plan
    const synthPrompt = `You are a senior SEO engineer reviewing a full site audit. Generate a site-wide action plan as valid JSON only.

Site: ${url}
Total pages audited: ${successful.length}
Average SEO score: ${avgScore}/100
Score range: ${minScore} (worst) to ${maxScore} (best)

Site-wide issues (% of pages affected):
${topIssues.map(i => `- ${i.id}: ${i.pct}% of pages (${i.affectedPages} pages)`).join('\n')}

Missing across site:
- Meta description missing: ${missingMeta}/${successful.length} pages
- H1 missing: ${missingH1}/${successful.length} pages
- Canonical missing: ${missingCanonical}/${successful.length} pages
- Viewport missing: ${missingViewport}/${successful.length} pages
- No schema markup: ${noSchema}/${successful.length} pages

Worst pages:
${worstPages.map(p => `- ${p.url} (score: ${p.score}, issues: ${p.issues.join(', ')})`).join('\n')}

Return ONLY this JSON structure:
{
  "summary": "2-3 sentence site-wide assessment",
  "siteScore": ${avgScore},
  "criticalSiteIssues": [
    {
      "issue": "issue-id",
      "affectedPages": 12,
      "impact": "high",
      "fix": "Exact what to do globally (e.g. add to CMS template so all pages get it)",
      "where": "CMS template / _document.js / layout.html / etc",
      "code": "<meta name=\\"...\\" content=\\"...\\">",
      "applyVia": "CMS global settings or template file"
    }
  ],
  "pageSpecificFixes": [
    {
      "url": "specific page url",
      "priority": 1,
      "issue": "issue-id",
      "fix": "what to change on this specific page"
    }
  ],
  "quickWins": ["1-line action 1", "1-line action 2"],
  "estimatedScoreAfterFixes": 82
}`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: synthPrompt }],
    });

    let plan = {};
    try {
      const text = response.content[0]?.text || '{}';
      const clean = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
      plan = JSON.parse(clean);
    } catch {
      plan = { summary: response.content[0]?.text?.slice(0, 400), criticalSiteIssues: [], pageSpecificFixes: [], quickWins: [] };
    }

    return res.status(200).json({
      success: true,
      data: {
        url,
        discoveryMethod,
        pagesDiscovered: urls.length,
        pagesAudited: successful.length,
        pagesFailed: failed.length,
        siteScore: avgScore,
        scoreRange: { min: minScore, max: maxScore },
        ...plan,
        topIssues,
        worstPages,
        bestPages,
        siteWideGaps: {
          missingMeta: `${missingMeta}/${successful.length}`,
          missingH1: `${missingH1}/${successful.length}`,
          missingCanonical: `${missingCanonical}/${successful.length}`,
          missingViewport: `${missingViewport}/${successful.length}`,
          noSchema: `${noSchema}/${successful.length}`,
        },
      },
      meta: {
        requestId,
        version: '1.0',
        processingMs: Date.now() - startTime,
        creditsUsed: Math.ceil(successful.length / 10) + 2,
      },
    });
  } catch (error) {
    console.error('[solve-site] error:', error);
    return sendApiError(res, 'INTERNAL_ERROR', error.message, 500);
  }
});

export default router;
