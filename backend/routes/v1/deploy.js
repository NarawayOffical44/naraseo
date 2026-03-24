/**
 * Deploy Route - POST /api/v1/deploy
 *
 * The implementation endpoint. Audits a URL, generates AI-improved content,
 * then returns a ready-to-paste <script> block that permanently fixes all
 * detectable SEO issues client-side — no server access needed.
 *
 * Works on EVERY website: WordPress, Wix, Squarespace, Webflow, Shopify,
 * Ghost, HTML files. User pastes one code block, done.
 *
 * Also returns:
 *  - htmlSnippet   — raw <head> tags (for users with HTML file access)
 *  - wpPlugin      — WP "Insert Headers and Footers" ready code
 *  - fixesList     — what was fixed and why
 *  - instructions  — platform-specific paste instructions
 */

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { auditPage, fetchURL } from '../../lib/seoEngine.js';
import { featureAccess, sendApiError } from '../../middleware/apiKey.js';
import crypto from 'crypto';

const router = express.Router();
const anthropic = new Anthropic();

router.post('/', featureAccess('audit'), async (req, res) => {
  const { url, businessName, businessType = 'LocalBusiness', phone, address } = req.body;
  const requestId = `req_${crypto.randomBytes(6).toString('hex')}`;

  if (!url) return sendApiError(res, 'MISSING_URL', 'url parameter required', 400);
  try { new URL(url); } catch { return sendApiError(res, 'INVALID_URL', 'Invalid URL format', 400); }

  try {
    const startTime = Date.now();
    const parsedUrl = new URL(url);

    // Audit + fetch in parallel
    const [auditResult, html] = await Promise.all([
      auditPage(url),
      fetchURL(url).catch(() => ''),
    ]);

    if (!auditResult.success) {
      return sendApiError(res, 'FETCH_FAILED', `Could not fetch page: ${auditResult.error}`, 502);
    }

    const { pageData, issues, score, grade } = auditResult.data;

    // Ask Claude to generate improved SEO content — title, meta, OG, schema
    const needsTitle = !pageData.title || pageData.title.length < 10 || pageData.title.length > 70;
    const needsMeta  = !pageData.metaDescription || pageData.metaDescription.length < 50;
    const needsH1    = pageData.h1.length === 0;

    const contentPrompt = `You are writing SEO metadata for a real website. Return valid JSON only — no markdown, no explanation.

URL: ${url}
Domain: ${parsedUrl.hostname}
Current title: ${pageData.title || 'MISSING'}
Current meta description: ${pageData.metaDescription || 'MISSING'}
Current H1: ${pageData.h1[0] || 'MISSING'}
Word count: ${pageData.wordCount}
${businessName ? `Business name: ${businessName}` : ''}
${phone ? `Phone: ${phone}` : ''}
${address ? `Address: ${address}` : ''}
${businessType ? `Business type (schema.org): ${businessType}` : ''}

Generate:
{
  "title": "optimised 50-60 char title — keyword first, brand last",
  "metaDescription": "compelling 140-155 char meta description with a call to action",
  "ogTitle": "same as title or slight variant for social",
  "ogDescription": "social-optimised description, same length",
  "schemaType": "LocalBusiness or WebPage or WebSite or Organization — pick most accurate",
  "schemaName": "business or site name",
  "schemaDescription": "1-2 sentence description for schema"
}`;

    const aiRes = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: contentPrompt }],
    });

    let ai = {};
    try {
      const raw = aiRes.content[0]?.text || '{}';
      ai = JSON.parse(raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim());
    } catch { /* fall through — use page data */ }

    // ── Build the values to inject ──────────────────────────────────────────
    const finalTitle    = ai.title || pageData.title || parsedUrl.hostname;
    const finalMeta     = ai.metaDescription || pageData.metaDescription || '';
    const finalOgTitle  = ai.ogTitle || finalTitle;
    const finalOgDesc   = ai.ogDescription || finalMeta;
    const schemaName    = ai.schemaName || businessName || parsedUrl.hostname;
    const schemaType    = ai.schemaType || businessType || 'WebPage';
    const schemaDesc    = ai.schemaDescription || finalMeta;

    // ── Determine what needs fixing ─────────────────────────────────────────
    const fixes = [];
    const htmlTags = [];

    if (needsTitle) {
      fixes.push({ what: 'Title tag', from: pageData.title || '(missing)', to: finalTitle });
      htmlTags.push(`<title>${esc(finalTitle)}</title>`);
    }

    if (needsMeta) {
      fixes.push({ what: 'Meta description', from: pageData.metaDescription || '(missing)', to: finalMeta });
      htmlTags.push(`<meta name="description" content="${esc(finalMeta)}">`);
    }

    if (!pageData.viewport) {
      fixes.push({ what: 'Viewport meta', from: '(missing)', to: 'width=device-width, initial-scale=1' });
      htmlTags.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
    }

    if (!pageData.canonical) {
      fixes.push({ what: 'Canonical tag', from: '(missing)', to: url });
      htmlTags.push(`<link rel="canonical" href="${esc(url)}">`);
    }

    const ogKeys = Object.keys(pageData.openGraph);
    if (ogKeys.length < 4) {
      const ogNeeded = [
        !ogKeys.includes('og:title')       && `<meta property="og:title" content="${esc(finalOgTitle)}">`,
        !ogKeys.includes('og:description') && finalOgDesc && `<meta property="og:description" content="${esc(finalOgDesc)}">`,
        !ogKeys.includes('og:url')         && `<meta property="og:url" content="${esc(url)}">`,
        !ogKeys.includes('og:type')        && `<meta property="og:type" content="website">`,
      ].filter(Boolean);
      if (ogNeeded.length) {
        fixes.push({ what: 'Open Graph tags', from: `${ogKeys.length} of 4 present`, to: `All 4 present` });
        htmlTags.push(...ogNeeded);
      }
    }

    if (!pageData.twitterCard) {
      fixes.push({ what: 'Twitter Card', from: '(missing)', to: 'summary_large_image' });
      htmlTags.push('<meta name="twitter:card" content="summary_large_image">');
      htmlTags.push(`<meta name="twitter:title" content="${esc(finalTitle)}">`);
      htmlTags.push(`<meta name="twitter:description" content="${esc(finalMeta)}">`);
    }

    const hasSchema = pageData.jsonLD.length > 0;
    if (!hasSchema) {
      const schema = buildSchema(schemaType, schemaName, schemaDesc, url, phone, address);
      fixes.push({ what: 'JSON-LD Schema', from: '(missing)', to: `${schemaType} structured data` });
      htmlTags.push(`<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n<\/script>`);
    }

    if (fixes.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          url, score, grade,
          message: 'No auto-fixable issues found. Page is well-optimised for the items this tool can deploy.',
          fixCount: 0,
          fixes: [],
        },
        meta: { requestId, version: '1.0', processingMs: Date.now() - startTime, creditsUsed: 2 },
      });
    }

    // ── Generate the universal <script> block ───────────────────────────────
    const scriptBody = buildScript(pageData, finalTitle, finalMeta, finalOgTitle, finalOgDesc, url,
      !pageData.viewport, !pageData.canonical, ogKeys, !pageData.twitterCard, !hasSchema,
      schemaType, schemaName, schemaDesc, phone, address, needsTitle, needsMeta);

    const scriptTag = `<!-- Naraseo AI SEO Patch — ${parsedUrl.hostname} — ${new Date().toISOString().split('T')[0]} -->\n<script>\n${scriptBody}\n</script>`;

    // ── Raw HTML snippet (for users with <head> access) ──────────────────────
    const htmlSnippet = `<!-- Naraseo AI SEO Patch — paste inside <head> -->\n${htmlTags.join('\n')}`;

    return res.status(200).json({
      success: true,
      data: {
        url, score, grade,
        fixCount: fixes.length,
        fixes,
        // The deployable outputs
        script: scriptTag,         // paste before </body> or in <head>
        htmlSnippet,               // paste inside <head> — for those with file access
        // How to deploy on each platform
        instructions: {
          html:          'Open your HTML file. Paste the HTML Snippet inside <head> before </head>.',
          wordpress:     'Install "Insert Headers and Footers" plugin (free) → Settings → Insert Headers and Footers → Paste in "Scripts in Header" box → Save.',
          wix:           'Site → Settings → Custom Code → Add Code at Top of Page → Paste → Apply to All Pages → Save.',
          squarespace:   'Pages → (click page) → ... → Page Settings → Advanced → Header Code Injection → Paste → Save.',
          webflow:       'Project Settings → Custom Code → Head Code → Paste → Save & Publish.',
          shopify:       'Online Store → Themes → Actions → Edit Code → Find theme.liquid → Find </head> → Paste above it → Save.',
          ghost:         'Settings → Code Injection → Site Header → Paste → Save.',
          framer:        'Site Settings → General → Custom Code → <head> → Paste → Publish.',
          any:           'Find where your site allows custom <head> code injection. Paste the HTML Snippet there. Works on any CMS.',
        },
      },
      meta: { requestId, version: '1.0', processingMs: Date.now() - startTime, creditsUsed: 2 },
    });
  } catch (error) {
    console.error('[deploy] error:', error);
    return sendApiError(res, 'INTERNAL_ERROR', error.message, 500);
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildSchema(type, name, desc, url, phone, address) {
  const s = { '@context': 'https://schema.org', '@type': type, name, description: desc, url };
  if (phone) s.telephone = phone;
  if (address) s.address = { '@type': 'PostalAddress', streetAddress: address };
  return s;
}

function buildScript(pd, title, meta, ogTitle, ogDesc, url,
  addViewport, addCanonical, existingOgKeys, addTwitter, addSchema,
  schemaType, schemaName, schemaDesc, phone, address, fixTitle, fixMeta) {

  const lines = ['(function(){', "  var d=document,h=d.head,f=d.createElement.bind(d);"];

  lines.push("  function m(n,c){var e=d.querySelector('meta[name=\"'+n+'\"]')||f('meta');e.name=n;e.content=c;h.appendChild(e);}");
  lines.push("  function og(p,c){var e=d.querySelector('meta[property=\"'+p+'\"]')||f('meta');e.setAttribute('property',p);e.content=c;h.appendChild(e);}");

  if (fixTitle)  lines.push(`  document.title=${JSON.stringify(title)};`);
  if (fixMeta)   lines.push(`  m('description',${JSON.stringify(meta)});`);
  if (addViewport) lines.push("  if(!d.querySelector('meta[name=\"viewport\"]'))m('viewport','width=device-width,initial-scale=1');");
  if (addCanonical) {
    lines.push("  if(!d.querySelector('link[rel=\"canonical\"]')){var cl=f('link');cl.rel='canonical';cl.href="+JSON.stringify(url)+";h.appendChild(cl);}");
  }
  if (!existingOgKeys.includes('og:title'))        lines.push(`  og('og:title',${JSON.stringify(ogTitle)});`);
  if (!existingOgKeys.includes('og:description') && ogDesc) lines.push(`  og('og:description',${JSON.stringify(ogDesc)});`);
  if (!existingOgKeys.includes('og:url'))          lines.push(`  og('og:url',${JSON.stringify(url)});`);
  if (!existingOgKeys.includes('og:type'))         lines.push("  og('og:type','website');");
  if (addTwitter) {
    lines.push("  m('twitter:card','summary_large_image');");
    lines.push(`  m('twitter:title',${JSON.stringify(title)});`);
    if (meta) lines.push(`  m('twitter:description',${JSON.stringify(meta)});`);
  }
  if (addSchema) {
    const schema = buildSchema(schemaType, schemaName, schemaDesc, url, phone, address);
    lines.push("  if(!d.querySelector('script[type=\"application/ld+json\"]')){var s=f('script');s.type='application/ld+json';s.textContent="+JSON.stringify(JSON.stringify(schema))+";h.appendChild(s);}");
  }
  lines.push('})();');
  return lines.join('\n');
}

export default router;
