/**
 * Audit Route - POST /api/v1/audit
 * Full page SEO audit with all pillars
 */

import express from 'express';
import { auditPage } from '../../lib/seoEngine.js';
import seoEngine from '../../lib/seoEngine.js';
import { validatePageSchemas } from '../../lib/schemaValidator.js';
import { featureAccess, creditCheck, sendApiResponse, sendApiError } from '../../middleware/apiKey.js';
import { getPageSpeedInsights, cwvToScore } from '../../lib/pageSpeed.js';
import { saveAudit, getAudit, getAuditHistory } from '../../lib/history.js';
import supabase from '../../supabase.js';
import crypto from 'crypto';

const router = express.Router();

// POST /api/v1/audit - Full page audit
// Accepts: { url } OR { url, html } (html bypasses fetch — for local/pre-deploy testing)
router.post('/', featureAccess('audit'), creditCheck('audit', supabase), async (req, res) => {
  const { url, html: rawHtml } = req.body;
  const requestId = `req_${crypto.randomBytes(6).toString('hex')}`;

  if (!url) {
    return sendApiError(res, 'MISSING_URL', 'URL parameter required', 400, {
      example: { url: 'https://example.com' },
      tip: 'Pass html parameter to audit local or pre-deploy pages without fetching via HTTPS',
    });
  }

  // Validate URL format (still required as the canonical label for the audit)
  try {
    new URL(url);
  } catch (e) {
    return sendApiError(res, 'INVALID_URL', 'Invalid URL format', 400);
  }

  try {
    const startTime = Date.now();

    let auditResult, ps;

    if (rawHtml) {
      // Enforce size limit (5MB max) to prevent abuse
      if (rawHtml.length > 5_000_000) {
        return sendApiError(res, 'HTML_TOO_LARGE', 'html parameter must be under 5MB', 400);
      }
      // Direct HTML mode — parse provided HTML, skip fetch and PageSpeed (needs public URL)
      const pageData = seoEngine.parseHTML(rawHtml);
      const { score, issues } = seoEngine.calculateScore(pageData);
      auditResult = {
        success: true,
        data: {
          url,
          score,
          grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
          pageData,
          issues,
          analyzedAt: new Date().toISOString(),
        },
      };
      ps = null; // PageSpeed requires a public HTTPS URL — skip in HTML mode
    } else {
      // URL fetch mode — normal flow
      [auditResult, ps] = await Promise.all([
        auditPage(url),
        getPageSpeedInsights(url),
      ]);
    }

    if (!auditResult.success) {
      return sendApiError(res, 'AUDIT_FAILED', `Failed to audit page: ${auditResult.error}`, 500);
    }

    const { score, grade, pageData, issues } = auditResult.data;
    const fetchedHtml = auditResult.rawHtml;
    const isSPA = fetchedHtml ? seoEngine.detectSPA(fetchedHtml, pageData) : false;

    // If SPA detected, fallback to Lighthouse-rendered data for missing fields
    if (isSPA && ps?.seoAudits) {
      if (!pageData.title && ps.seoAudits.title) pageData.title = ps.seoAudits.title;
      if (!pageData.metaDescription && ps.seoAudits.metaDescription) pageData.metaDescription = ps.seoAudits.metaDescription;
      if (!pageData.canonical && ps.seoAudits.canonical) pageData.canonical = ps.seoAudits.canonical;
    }

    const { score: perfScore, issues: cwvIssues } = cwvToScore(ps);

    // Merge CWV issues into the issues list
    const allIssues = [...issues, ...cwvIssues];

    const categoryScores = {
      onPage: Math.min(100, 50 +
        (pageData.title ? 10 : 0) +
        (pageData.metaDescription ? 10 : 0) +
        (pageData.h1.length > 0 ? 10 : 0) +
        (pageData.canonical ? 10 : 0) +
        (pageData.wordCount > 300 ? 10 : 0)
      ),
      technical: Math.min(100, 50 +
        (pageData.viewport ? 15 : 0) +
        (pageData.charset ? 10 : 0) +
        (pageData.robots ? 10 : 0) +
        (pageData.pageSize < 3000000 ? 15 : 0)
      ),
      content: Math.min(100, 50 +
        (pageData.wordCount >= 300 ? 15 : 0) +
        (pageData.h2.length > 0 ? 15 : 0) +
        (pageData.images.length > 0 ? 10 : 0) +
        (pageData.images.filter(i => i.hasAlt).length / Math.max(1, pageData.images.length) > 0.5 ? 10 : 0)
      ),
      performance: perfScore ?? 55,
      mobile: ps?.seoScore ?? (pageData.viewport ? 85 : 50),
      social: Math.min(100, 50 +
        (Object.keys(pageData.openGraph).length >= 4 ? 30 : 0) +
        (pageData.twitterCard ? 20 : 0)
      ),
    };

    const auditData = {
      id: `audit_${crypto.randomBytes(8).toString('hex')}`,
      url,
      score,
      grade,
      isSPA,
      ...(isSPA && { spaNote: 'Content extracted via Google Lighthouse (JS-rendered)' }),
      categoryScores,
      onPageScore: categoryScores.onPage,
      techScore: categoryScores.technical,
      contentScore: categoryScores.content,
      keywords: [], // Will be populated by keywords endpoint
      geoGrid: null, // Will be populated by geo-grid endpoint
      _localSEO: {}, // Will be populated by local-seo endpoint
      issues: allIssues.map(issue => ({
        id: issue.id,
        type: issue.type,
        category: issue.id.startsWith('perf') || issue.id.includes('lcp') || issue.id.includes('cls') || issue.id.includes('inp') ? 'Performance' : 'SEO',
        detail: issue.detail || issue.id.replace(/-/g, ' '),
        impact: issue.impact || 3,
      })),
      pageData: {
        title: pageData.title,
        titleLength: pageData.title?.length || 0,
        metaDescription: pageData.metaDescription,
        metaDescLength: pageData.metaDescription?.length || 0,
        h1: pageData.h1,
        h1Tags: pageData.h1,
        h2: pageData.h2,
        h3: pageData.h3,
        h4: pageData.h4,
        h5: pageData.h5,
        h6: pageData.h6,
        headings: [
          ...pageData.h1.map(t => ({ level: 1, text: t })),
          ...pageData.h2.map(t => ({ level: 2, text: t })),
          ...pageData.h3.map(t => ({ level: 3, text: t })),
          ...pageData.h4.map(t => ({ level: 4, text: t })),
          ...pageData.h5.map(t => ({ level: 5, text: t })),
          ...pageData.h6.map(t => ({ level: 6, text: t })),
        ],
        wordCount: pageData.wordCount,
        imageCount: pageData.images.length,
        imageDetails: pageData.images.map(img => ({ src: img.src, alt: img.alt, hasAlt: img.hasAlt })),
        imgsMissingAlt: pageData.images.filter(img => !img.hasAlt).map(img => img.src),
        linkCount: pageData.allLinks.length,
        internalLinks: pageData.internalLinks.length,
        externalLinks: pageData.externalLinks.length,
        internalLinkDetails: pageData.internalLinks,
        externalLinkDetails: pageData.externalLinks,
        canonical: pageData.canonical,
        robots: pageData.robots,
        og: pageData.openGraph,
        twitter: pageData.twitterCard,
        schemaTypes: pageData.jsonLD.map(s => s['@type']).filter(Boolean),
        viewport: pageData.viewport,
        charset: pageData.charset,
      },
      pageSpeedInsights: ps ? {
        performanceScore: ps.performanceScore,
        seoScore: ps.seoScore,
        accessibilityScore: ps.accessibilityScore,
        bestPracticesScore: ps.bestPracticesScore,
        crux: {
          lcp: ps.crux?.lcp,
          lcpCategory: ps.crux?.lcpCategory,
          cls: ps.crux?.cls,
          clsCategory: ps.crux?.clsCategory,
          inp: ps.crux?.inp,
          inpCategory: ps.crux?.inpCategory,
          fcp: ps.crux?.fcp,
          fcpCategory: ps.crux?.fcpCategory,
        },
        lighthouse: ps.lighthouse,
        opportunities: ps.opportunities,
        source: 'Google PageSpeed Insights API',
      } : null,
      coreWebVitals: ps ? {
        performanceScore: ps.performanceScore,
        seoScore: ps.seoScore,
        accessibilityScore: ps.accessibilityScore,
        bestPracticesScore: ps.bestPracticesScore,
        lcp: ps.crux?.lcp,
        lcpCategory: ps.crux?.lcpCategory,
        cls: ps.crux?.cls,
        clsCategory: ps.crux?.clsCategory,
        inp: ps.crux?.inp,
        inpCategory: ps.crux?.inpCategory,
        fcp: ps.crux?.fcp,
        lighthouse: ps.lighthouse,
        opportunities: ps.opportunities,
        source: 'Google PageSpeed Insights API',
      } : null,
      schema: {
        types: pageData.jsonLD.map(s => s['@type']).filter(Boolean),
        count: pageData.jsonLD.length,
      },
      mobile: { hasViewport: pageData.viewport },
      robots: {
        indexable: !pageData.robots || !pageData.robots.includes('noindex'),
        followable: !pageData.robots || !pageData.robots.includes('nofollow'),
      },
      createdAt: new Date().toISOString(),
    };

    const processingMs = Date.now() - startTime;

    // Deduct credit on success (fire-and-forget)
    if (req.deductCredit) req.deductCredit().catch(() => {});

    // Persist to Supabase (fire-and-forget — never blocks response)
    saveAudit(supabase, {
      id: auditData.id,
      url,
      score,
      grade,
      report_json: auditData,
      userId: req.user?.id,
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      data: auditData,
      meta: {
        requestId,
        version: '1.0',
        processingMs,
        creditsUsed: 1,
      },
    });
  } catch (error) {
    console.error('Audit error:', error);
    return sendApiError(res, 'INTERNAL_ERROR', error.message, 500);
  }
});

// GET /api/v1/audit/history?url= - Score trend for a URL
router.get('/history', async (req, res) => {
  const { url, limit = 20 } = req.query;
  if (!url) return sendApiError(res, 'MISSING_URL', 'url query param required', 400);

  const history = await getAuditHistory(supabase, url, parseInt(limit, 10));
  return res.status(200).json({ success: true, data: history });
});

// GET /api/v1/audit/:id - Retrieve stored audit by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const record = await getAudit(supabase, id);
  if (!record) return sendApiError(res, 'NOT_FOUND', 'Audit not found', 404);
  return res.status(200).json({ success: true, data: record });
});

export default router;
