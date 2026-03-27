/**
 * Naraseo AI — MCP Server
 * Exposes all SEO & Geo tools as Model Context Protocol skills.
 * Supports: Streamable HTTP (modern) + SSE (legacy / mcp-remote bridge)
 *
 * Compatible with: Claude Desktop, Cursor, Windsurf, Cline, ChatGPT, any MCP client
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';

import { auditPage, fetchURL } from '../lib/seoEngine.js';
import { crawlSite } from '../lib/crawlEngine.js';
import { analyzeKeywords } from '../lib/keywordEngine.js';
import { trackGeoGrid } from '../lib/geoEngine.js';
import { validatePageSchemas } from '../lib/schemaValidator.js';

const anthropic = new Anthropic();

/**
 * Factory — creates a fresh McpServer instance with all 9 SEO tools.
 * Called once per connection (stateless Streamable HTTP) or once per session (SSE).
 */
export function createMcpServer() {
  const server = new McpServer({
    name: 'naraseo-ai',
    version: '1.0.0',
  });

  // ── Tool 1: seo_audit ──────────────────────────────────────────────────────
  server.tool(
    'seo_audit',
    'Full technical SEO audit of any URL. Returns score (0-100), grade (A-F), all issues with impact scores, and complete page data including title, meta, headings, images, links, schema, robots, canonical, and Open Graph.',
    { url: z.string().url().describe('The page URL to audit') },
    async ({ url }) => {
      const result = await auditPage(url);
      if (!result.success) throw new Error(result.error);
      return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
    }
  );

  // ── Tool 2: solve ──────────────────────────────────────────────────────────
  server.tool(
    'solve',
    'Autonomous full-stack SEO solve: audits the page, researches keywords, validates schema, then generates precise copy-paste HTML fixes with exact placement instructions. No instructions needed — just pass a URL and get a complete action plan.',
    {
      url: z.string().url().describe('The page URL to fully analyse and solve'),
      businessName: z.string().optional().describe('Business name for local SEO context'),
    },
    async ({ url, businessName }) => {
      // Run all analysis in parallel
      const [auditResult, html] = await Promise.all([
        auditPage(url),
        fetchURL(url).catch(() => ''),
      ]);

      if (!auditResult.success) throw new Error(auditResult.error);

      const { pageData, issues, score, grade } = auditResult.data;

      // Keyword analysis
      const keywordResult = await analyzeKeywords(pageData.title, pageData.metaDescription, html).catch(() => null);

      // Schema validation
      const schemaResult = html ? validatePageSchemas(html) : null;

      // Claude synthesis — generates precise fixes with exact placement
      const synthesisPrompt = `You are an expert SEO engineer. Analyse this page data and generate a complete, executable action plan.

URL: ${url}
Score: ${score}/100 (Grade: ${grade})
Title: ${pageData.title || 'MISSING'}
Meta description: ${pageData.metaDescription || 'MISSING'}
H1 tags: ${pageData.h1.join(', ') || 'MISSING'}
Word count: ${pageData.wordCount}
Canonical: ${pageData.canonical || 'MISSING'}
Viewport: ${pageData.viewport ? 'yes' : 'MISSING'}
Issues found: ${issues.map(i => i.id).join(', ')}
Schema types: ${pageData.jsonLD.map(s => s['@type']).join(', ') || 'none'}
${businessName ? `Business: ${businessName}` : ''}

Return ONLY valid JSON matching this exact structure:
{
  "summary": "2 sentence plain-English assessment",
  "priorityScore": 0-10,
  "fixes": [
    {
      "priority": 1,
      "issue": "missing-meta-description",
      "impact": "high|medium|low",
      "where": "Inside <head> tag, after <title>",
      "htmlTag": "meta",
      "code": "<meta name=\\"description\\" content=\\"Your description here (120-160 chars)\\">",
      "explanation": "Why this matters",
      "applyVia": "Direct HTML edit | WordPress: Settings > General | CMS API: PATCH /pages/:id { seo: { description } }"
    }
  ],
  "keywordOpportunities": [
    { "keyword": "...", "intent": "informational|navigational|transactional|commercial", "action": "..." }
  ],
  "quickWins": ["Specific action item 1", "Specific action item 2"]
}`;

      const response = await anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 2048,
        messages: [{ role: 'user', content: synthesisPrompt }],
      });

      let plan;
      try {
        const text = response.content[0]?.text || '{}';
        // Strip markdown code fences if present
        const jsonText = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        plan = JSON.parse(jsonText);
      } catch {
        plan = { summary: response.content[0]?.text, fixes: [], quickWins: [] };
      }

      const result = {
        url, score, grade,
        ...plan,
        schemaStatus: schemaResult?.data || null,
        keywords: keywordResult?.data?.aiAnalysis || null,
      };

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Tool 3: keyword_research ───────────────────────────────────────────────
  server.tool(
    'keyword_research',
    'AI-powered keyword analysis from page content. Returns primary keyword, semantic cluster (10 related keywords), search intent classification, content gaps, and quick win opportunities.',
    { url: z.string().url().describe('The page URL to analyse for keywords') },
    async ({ url }) => {
      const [auditResult, html] = await Promise.all([
        auditPage(url),
        fetchURL(url).catch(() => ''),
      ]);
      if (!auditResult.success) throw new Error(auditResult.error);
      const { title, metaDescription } = auditResult.data.pageData;
      const analysis = await analyzeKeywords(title, metaDescription, html);
      if (!analysis.success) throw new Error(analysis.error);
      return { content: [{ type: 'text', text: JSON.stringify(analysis.data, null, 2) }] };
    }
  );

  // ── Tool 4: schema_validate ────────────────────────────────────────────────
  server.tool(
    'schema_validate',
    'Validate all JSON-LD structured data on a page. Checks against schema.org rules, determines Google Rich Results eligibility, returns errors/warnings with fix recommendations.',
    { url: z.string().url().describe('The page URL to validate schemas on') },
    async ({ url }) => {
      const html = await fetchURL(url);
      const validation = validatePageSchemas(html);
      if (!validation.success) throw new Error(validation.error);
      return { content: [{ type: 'text', text: JSON.stringify(validation.data, null, 2) }] };
    }
  );

  // ── Tool 5: site_crawl ─────────────────────────────────────────────────────
  server.tool(
    'site_crawl',
    'Crawl an entire website and audit every page. Returns per-page scores, top issues across the site, and a summary with average score and critical page count. Requires Pro/Agency tier.',
    {
      url: z.string().url().describe('The start URL to crawl from'),
      maxPages: z.number().int().min(1).max(500).optional().describe('Max pages to crawl (default 50)'),
      maxDepth: z.number().int().min(1).max(5).optional().describe('Max link depth (default 2)'),
    },
    async ({ url, maxPages = 50, maxDepth = 2 }) => {
      const result = await crawlSite(url, { maxPages, maxDepth, concurrency: 3 });
      if (!result.success) throw new Error(result.error);
      return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
    }
  );

  // ── Tool 6: geo_grid ───────────────────────────────────────────────────────
  server.tool(
    'geo_grid',
    'Track local search ranking across a geographic grid for a keyword. Returns heatmap with rank position at each grid point, average rank, and coverage percentage. Requires Google CSE API key.',
    {
      url: z.string().url().describe('The business URL to track'),
      keyword: z.string().describe('Search keyword to track'),
      lat: z.number().describe('Center latitude of the grid'),
      lng: z.number().describe('Center longitude of the grid'),
      gridSize: z.union([z.literal(3), z.literal(5), z.literal(7)]).optional()
        .describe('Grid size: 3 (3x3=9 pts), 5 (5x5=25 pts), 7 (7x7=49 pts). Default 3.'),
    },
    async ({ url, keyword, lat, lng, gridSize = 3 }) => {
      const apiKey = process.env.GOOGLE_CSE_API_KEY;
      const cseId = process.env.GOOGLE_CSE_ID;
      if (!apiKey || !cseId) throw new Error('Google CSE API key not configured on this server');
      const result = await trackGeoGrid(apiKey, cseId, url, keyword, lat, lng, gridSize);
      if (!result.success) throw new Error(result.error);
      return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
    }
  );

  // ── Tool 7: local_seo_audit ────────────────────────────────────────────────
  server.tool(
    'local_seo_audit',
    'Audit local SEO signals: LocalBusiness schema presence, NAP (Name, Address, Phone) consistency, opening hours, geo coordinates, and local ranking factors.',
    {
      url: z.string().url().describe('The local business page URL'),
      businessName: z.string().optional().describe('Business name for NAP check'),
      phone: z.string().optional().describe('Business phone for NAP check'),
      address: z.string().optional().describe('Business address for NAP check'),
    },
    async ({ url, businessName, phone, address }) => {
      const [audit, html] = await Promise.all([auditPage(url), fetchURL(url).catch(() => '')]);
      if (!audit.success) throw new Error(audit.error);
      const { pageData } = audit.data;

      const localBizSchema = pageData.jsonLD.find(s => s['@type'] === 'LocalBusiness' || s['@type']?.includes?.('LocalBusiness'));
      const hasNAP = !!(businessName && address && phone);
      const napInSchema = !!(localBizSchema?.name && localBizSchema?.address && localBizSchema?.telephone);

      const issues = [];
      if (!localBizSchema) issues.push({ id: 'no-local-business-schema', impact: 'critical', fix: 'Add LocalBusiness JSON-LD schema' });
      if (!hasNAP && !napInSchema) issues.push({ id: 'missing-nap', impact: 'high', fix: 'Add Name, Address, Phone consistently across page' });
      if (!localBizSchema?.openingHoursSpecification) issues.push({ id: 'no-opening-hours', impact: 'medium', fix: 'Add openingHoursSpecification to LocalBusiness schema' });
      if (!localBizSchema?.geo) issues.push({ id: 'no-geo-coordinates', impact: 'medium', fix: 'Add geo coordinates to LocalBusiness schema' });

      const score = Math.max(0, 100 - (issues.filter(i => i.impact === 'critical').length * 30) - (issues.filter(i => i.impact === 'high').length * 20) - (issues.filter(i => i.impact === 'medium').length * 10));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            url, score,
            businessInfo: { name: businessName, address, phone },
            signals: {
              hasLocalBusinessSchema: !!localBizSchema,
              hasNAPInSchema: napInSchema,
              hasOpeningHours: !!localBizSchema?.openingHoursSpecification,
              hasGeoCoordinates: !!localBizSchema?.geo,
            },
            issues,
            schemaFound: localBizSchema || null,
          }, null, 2),
        }],
      };
    }
  );

  // ── Tool 8: competitor_analysis ────────────────────────────────────────────
  server.tool(
    'competitor_analysis',
    'Audit your page vs 1-5 competitor URLs. Returns score gap, word count gap, and specific content opportunities where competitors outperform you.',
    {
      url: z.string().url().describe('Your page URL'),
      competitorUrls: z.array(z.string().url()).min(1).max(5)
        .describe('Array of 1-5 competitor page URLs to compare against'),
    },
    async ({ url, competitorUrls }) => {
      const [mainAudit, ...compAudits] = await Promise.all([
        auditPage(url),
        ...competitorUrls.map(u => auditPage(u)),
      ]);
      if (!mainAudit.success) throw new Error(mainAudit.error);

      const compData = compAudits
        .filter(a => a.success)
        .map((a, i) => ({
          url: competitorUrls[i],
          score: a.data.score,
          wordCount: a.data.pageData.wordCount,
          h1: a.data.pageData.h1,
          hasSchema: a.data.pageData.jsonLD.length > 0,
          imageCount: a.data.pageData.images.length,
        }));

      const avgScore = compData.length > 0
        ? Math.round(compData.reduce((s, c) => s + c.score, 0) / compData.length) : 0;
      const maxWordCount = Math.max(...compData.map(c => c.wordCount), 0);

      const opportunities = [
        mainAudit.data.pageData.wordCount < maxWordCount * 0.8 && `Expand content: competitors average ${maxWordCount} words, you have ${mainAudit.data.pageData.wordCount}`,
        mainAudit.data.pageData.images.length < Math.max(...compData.map(c => c.imageCount)) && 'Add more images — competitors use more visual content',
        !mainAudit.data.pageData.jsonLD.length && compData.some(c => c.hasSchema) && 'Add structured data — competitors have schema markup',
        !mainAudit.data.pageData.h2.length && 'Add H2 subheadings to improve content structure',
      ].filter(Boolean);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            url, myScore: mainAudit.data.score,
            competitors: compData,
            analysis: { avgCompetitorScore: avgScore, scoreGap: avgScore - mainAudit.data.score, opportunities },
          }, null, 2),
        }],
      };
    }
  );

  // ── Tool 9: seo_chat ───────────────────────────────────────────────────────
  server.tool(
    'seo_chat',
    'Chat with an expert AI SEO consultant (Claude-powered). Provide conversation history and optionally an audit context for grounded advice.',
    {
      messages: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })).min(1).describe('Conversation history array'),
      auditContext: z.object({
        url: z.string().optional(),
        score: z.number().optional(),
        title: z.string().optional(),
        wordCount: z.number().optional(),
        issues: z.array(z.string()).optional(),
      }).optional().describe('Optional audit data to provide context'),
    },
    async ({ messages, auditContext }) => {
      const contextBlock = auditContext
        ? `\n\nPage audit context:\n- URL: ${auditContext.url}\n- Score: ${auditContext.score}/100\n- Title: ${auditContext.title}\n- Word count: ${auditContext.wordCount}\n- Issues: ${(auditContext.issues || []).join(', ')}`
        : '';

      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: `You are Naraseo AI, an expert SEO assistant. Your name is Naraseo AI. Never say you are Claude, never mention Anthropic, and never reveal the underlying AI technology. If asked who you are, say: "I'm Naraseo AI, your SEO intelligence assistant." Give actionable, precise SEO advice. Always explain the "why" and include specific implementation steps.${contextBlock}`,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      });

      return { content: [{ type: 'text', text: response.content[0]?.text || '' }] };
    }
  );

  // ── Tool 10: solve_site ────────────────────────────────────────────────────
  server.tool(
    'solve_site',
    'Site-wide autonomous SEO analysis. Discovers ALL pages via sitemap.xml, audits every page, then generates ONE prioritised site-wide action plan with global template fixes and page-specific fixes. One Claude call regardless of page count — cost efficient.',
    {
      url: z.string().url().describe('Root URL of the site to analyse (e.g. https://example.com)'),
      maxPages: z.number().int().min(1).max(100).optional().describe('Max pages to audit (default 50, max 100)'),
    },
    async ({ url, maxPages = 50 }) => {
      // Reuse the HTTP route logic by calling the same internal functions
      const cap = Math.min(maxPages, 100);

      // Fetch robots.txt for sitemap hint
      const robotsTxt = await fetchURL(`${new URL(url).origin}/robots.txt`).catch(() => '');
      const sitemapHint = robotsTxt.match(/Sitemap:\s*(https?:\/\/[^\s]+)/i)?.[1];

      // Try sitemaps
      const { origin, hostname } = new URL(url);
      const candidates = [sitemapHint, `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`].filter(Boolean);

      async function fetchText(u) {
        return fetchURL(u).catch(() => '');
      }

      function extractUrls(xml) {
        const urls = [];
        const re = /<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi;
        let m;
        while ((m = re.exec(xml)) !== null) {
          const u = m[1].trim();
          if (u.includes(hostname) && !u.endsWith('.xml')) urls.push(u);
        }
        return urls;
      }

      let pageUrls = [];
      for (const s of candidates) {
        const xml = await fetchText(s);
        if (!xml) continue;
        if (xml.includes('<sitemapindex')) {
          const childXmls = extractUrls(xml).filter(u => u.endsWith('.xml'));
          for (const cx of childXmls.slice(0, 3)) {
            pageUrls.push(...extractUrls(await fetchText(cx)));
          }
        } else {
          pageUrls.push(...extractUrls(xml));
        }
        if (pageUrls.length > 0) break;
      }

      pageUrls = [...new Set(pageUrls)].slice(0, cap);
      if (pageUrls.length === 0) pageUrls = [url];

      // Audit all pages in batches of 5
      const results = [];
      for (let i = 0; i < pageUrls.length; i += 5) {
        const batch = await Promise.all(pageUrls.slice(i, i + 5).map(u => auditPage(u).catch(() => null)));
        results.push(...batch.filter(Boolean).filter(r => r.success));
      }

      if (results.length === 0) throw new Error('Could not audit any pages on this site');

      const scores = results.map(r => r.data.score);
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      const issueFreq = {};
      for (const r of results) {
        for (const i of r.data.issues || []) {
          issueFreq[i.id] = (issueFreq[i.id] || 0) + 1;
        }
      }
      const topIssues = Object.entries(issueFreq).sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([id, count]) => `${id}: ${count}/${results.length} pages`);

      const worstPages = results.sort((a, b) => a.data.score - b.data.score).slice(0, 5)
        .map(r => `${r.data.url} (score ${r.data.score})`);

      const synthPrompt = `Site audit for ${url}. ${results.length} pages audited. Average score: ${avg}/100.
Top issues: ${topIssues.join('; ')}
Worst pages: ${worstPages.join('; ')}
Generate a prioritised site-wide action plan as JSON: { summary, criticalSiteIssues[{issue,affectedPages,fix,where,code}], pageSpecificFixes[{url,fix}], quickWins[], estimatedScoreAfterFixes }`;

      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: synthPrompt }],
      });

      let plan = {};
      try {
        const text = response.content[0]?.text || '{}';
        plan = JSON.parse(text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim());
      } catch {
        plan = { summary: response.content[0]?.text?.slice(0, 500) };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ url, pagesAudited: results.length, siteScore: avg, topIssues, ...plan }, null, 2),
        }],
      };
    }
  );

  return server;
}
