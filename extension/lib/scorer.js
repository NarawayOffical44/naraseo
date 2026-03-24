/**
 * SEO Scorer — runs entirely in the browser (background service worker or content script).
 * No dependencies. No API calls. Pure deterministic logic.
 *
 * Input:  pageData from content.js extractPageData()
 *         pageSpeed from /api/pagespeed proxy response (optional)
 * Output: { score, grade, issues, categoryScores }
 */

/**
 * Main entry point.
 * @param {object} pageData  — raw output from content.js extractPageData()
 * @param {object|null} pageSpeed — response from Google PageSpeed Insights proxy
 */
function scorePageData(pageData, pageSpeed = null) {
  const d = pageData || {};
  let score = 100;
  const issues = [];

  const push = (issue, deduction) => {
    issues.push(issue);
    score -= deduction;
  };

  // ── PAGESPEED / PERFORMANCE (from Google API) ──────────────────────────────
  if (pageSpeed) {
    const perf = pageSpeed.performanceScore;
    if (perf != null && perf < 50) {
      push({ id: 'poor-pagespeed', type: 'critical', category: 'Performance', priority: 1,
        issue: `PageSpeed Performance Score: ${perf}/100 (Poor)`,
        detail: 'Google Lighthouse rates your site\'s performance as poor. Directly impacts rankings.',
        suggestion: 'Address Core Web Vitals: LCP, INP, CLS.',
        affectsScore: -20 }, 20);
    } else if (perf != null && perf < 70) {
      push({ id: 'moderate-pagespeed', type: 'warning', category: 'Performance', priority: 2,
        issue: `PageSpeed Performance Score: ${perf}/100 (Needs Improvement)`,
        detail: 'Moderate performance issues detected by Google Lighthouse.',
        suggestion: 'Implement PageSpeed Insights recommendations.',
        affectsScore: -10 }, 10);
    }

    const { lcp, lcpCategory, cls, clsCategory, fid, inp } = pageSpeed.crux || {};

    if (lcp > 4000) {
      push({ id: 'crux-poor-lcp', type: 'critical', category: 'Performance', priority: 1,
        issue: `LCP is ${lcp}ms — Real users see slow loading (Goal: <2500ms)`,
        detail: 'Largest Contentful Paint from Chrome User Experience Report. Real visitor data.',
        suggestion: 'Compress hero images, preload critical assets, lazy-load below fold.',
        fixExample: '<link rel="preload" as="image" href="hero.jpg">',
        affectsScore: -15 }, 15);
    } else if (lcp > 2500) {
      push({ id: 'crux-moderate-lcp', type: 'warning', category: 'Performance', priority: 2,
        issue: `LCP is ${lcp}ms (Goal: <2500ms)`,
        detail: 'Some visitors experience slow loading.',
        suggestion: 'Optimise images and defer non-critical resources.',
        affectsScore: -8 }, 8);
    }

    if (cls > 0.25) {
      push({ id: 'crux-poor-cls', type: 'warning', category: 'Performance', priority: 2,
        issue: `CLS is ${cls.toFixed(2)} — Layout shifts frustrate users (Goal: <0.1)`,
        detail: 'Pages shift around as they load. Causes mis-clicks and poor UX.',
        suggestion: 'Set explicit width/height on images and video elements.',
        fixExample: '<img width="800" height="450" src="photo.jpg" alt="...">',
        affectsScore: -12 }, 12);
    }

    const inputDelay = inp || fid;
    if (inputDelay > 200) {
      push({ id: 'crux-poor-inp', type: 'warning', category: 'Performance', priority: 2,
        issue: `Interaction delay: ${inputDelay}ms (Goal: <200ms)`,
        detail: 'Page feels unresponsive to clicks/taps.',
        suggestion: 'Break up long JavaScript tasks. Consider a web worker for heavy processing.',
        affectsScore: -8 }, 8);
    }

    // Top PageSpeed opportunities
    (pageSpeed.opportunities || []).slice(0, 3).forEach(opp => {
      push({ id: `ps-opp-${opp.id}`, type: 'info', category: 'Performance', priority: 3,
        issue: opp.title,
        detail: opp.description,
        suggestion: 'Implement this Google PageSpeed recommendation.',
        affectsScore: -3 }, 3);
    });

    if (pageSpeed.seoScore != null && pageSpeed.seoScore < 80) {
      push({ id: 'ps-seo-score', type: 'warning', category: 'Technical', priority: 2,
        issue: `Google Lighthouse SEO Score: ${pageSpeed.seoScore}/100`,
        detail: 'Lighthouse detected SEO-level technical issues.',
        suggestion: 'Fix mobile-friendliness, viewport, and crawlability issues.',
        affectsScore: -5 }, 5);
    }
  }

  // ── ON-PAGE ────────────────────────────────────────────────────────────────
  const title    = d.title || '';
  const titleLen = d.titleLength || title.length;

  if (!title) {
    push({ id: 'title-missing', type: 'critical', category: 'On-Page', priority: 1,
      issue: 'Missing title tag',
      detail: 'Title is the single most visible ranking factor. Missing = major drop.',
      suggestion: 'Add a unique 50-60 character title with your primary keyword.',
      fixExample: '<title>Primary Keyword | Brand Name</title>',
      affectsScore: -15 }, 15);
  } else if (titleLen < 30) {
    push({ id: 'title-short', type: 'critical', category: 'On-Page', priority: 1,
      issue: `Title too short (${titleLen} chars) — wasted keyword space`,
      detail: `Current: "${title}"`,
      suggestion: 'Expand to 50-60 chars. Add keyword modifiers and brand name.',
      fixExample: `<title>${title} | Brand Name | City</title>`,
      affectsScore: -10 }, 10);
  } else if (titleLen > 65) {
    push({ id: 'title-long', type: 'warning', category: 'On-Page', priority: 2,
      issue: `Title too long (${titleLen} chars) — truncated in Google results`,
      detail: 'Google shows ~60 chars. Anything beyond is cut off with "…"',
      suggestion: 'Trim to 50-60 characters. Keep most important words first.',
      fixExample: `<title>${title.substring(0, 58).trim()}</title>`,
      affectsScore: -5 }, 5);
  }

  const metaDesc    = d.metaDescription || '';
  const metaDescLen = d.metaDescLength || metaDesc.length;

  if (!metaDesc) {
    push({ id: 'meta-missing', type: 'critical', category: 'On-Page', priority: 1,
      issue: 'Missing meta description',
      detail: 'Meta description is your search result "ad copy". Missing = lower CTR.',
      suggestion: 'Write 150-160 chars with a clear value prop and call to action.',
      fixExample: '<meta name="description" content="[Value prop]. [CTA]. [Benefit].">',
      affectsScore: -12 }, 12);
  } else if (metaDescLen < 120) {
    push({ id: 'meta-short', type: 'warning', category: 'On-Page', priority: 2,
      issue: `Meta description too short (${metaDescLen} chars)`,
      detail: `Current: "${metaDesc}"`,
      suggestion: 'Expand to 150-160 chars to use the full search result space.',
      affectsScore: -5 }, 5);
  } else if (metaDescLen > 165) {
    push({ id: 'meta-long', type: 'info', category: 'On-Page', priority: 3,
      issue: `Meta description too long (${metaDescLen} chars) — will be truncated`,
      detail: 'Google truncates at ~160 chars. Your CTA may be hidden.',
      suggestion: 'Trim to 150-160 characters.',
      affectsScore: -2 }, 2);
  }

  const h1Tags  = d.h1Tags || [];
  const h1Count = h1Tags.length;
  const h1Text  = h1Tags[0] || '';

  if (h1Count === 0) {
    push({ id: 'h1-missing', type: 'critical', category: 'On-Page', priority: 1,
      issue: 'Missing H1 tag',
      detail: 'Every page needs exactly one H1. Core SEO requirement.',
      suggestion: 'Add one H1 that summarises the page topic with your keyword.',
      fixExample: '<h1>Primary Keyword For This Page</h1>',
      affectsScore: -15 }, 15);
  } else if (h1Count > 1) {
    push({ id: 'h1-multiple', type: 'warning', category: 'On-Page', priority: 2,
      issue: `Multiple H1 tags found (${h1Count})`,
      detail: 'Google expects one H1. Multiple H1s dilute the keyword signal.',
      suggestion: 'Keep one H1. Change the rest to H2.',
      affectsScore: -8 }, 8);
  } else if (h1Text.length < 20) {
    push({ id: 'h1-short', type: 'warning', category: 'On-Page', priority: 2,
      issue: `H1 too short (${h1Text.length} chars): "${h1Text}"`,
      detail: 'Short H1s miss keyword context.',
      suggestion: 'Expand to 20-60 chars with keyword and context.',
      affectsScore: -5 }, 5);
  }

  // ── CONTENT ────────────────────────────────────────────────────────────────
  const wordCount = d.wordCount || 0;

  if (wordCount < 300) {
    push({ id: 'thin-content', type: 'critical', category: 'Content', priority: 1,
      issue: `Thin content: ${wordCount} words (Google minimum: 300+)`,
      detail: 'Pages under 300 words rarely rank. Google treats them as low-quality.',
      suggestion: 'Add 500-1500 words: sections, FAQs, case studies, benefits.',
      affectsScore: -20 }, 20);
  } else if (wordCount < 600) {
    push({ id: 'low-content', type: 'warning', category: 'Content', priority: 2,
      issue: `Low content volume: ${wordCount} words`,
      detail: 'Competitive keywords need 800+ words to rank.',
      suggestion: 'Expand to 800-1500 words minimum.',
      affectsScore: -8 }, 8);
  }

  const headings = d.headings || [];
  const h2Count  = headings.filter(h => h.level === 2).length;

  if (h2Count === 0 && wordCount > 300) {
    push({ id: 'no-h2', type: 'warning', category: 'Content', priority: 2,
      issue: 'No H2 subheadings',
      detail: 'Subheadings help Google and users understand page structure.',
      suggestion: 'Add 3-5 H2 subheadings to organise your content.',
      affectsScore: -8 }, 8);
  }

  // ── IMAGES ─────────────────────────────────────────────────────────────────
  const imageCount     = d.imageCount || 0;
  const missingAlt     = (d.imgsMissingAlt || []).length;

  if (imageCount === 0 && wordCount > 500) {
    push({ id: 'no-images', type: 'info', category: 'Images', priority: 3,
      issue: 'No images on page',
      detail: 'Images improve engagement and dwell time.',
      suggestion: 'Add at least one relevant image per 300 words.',
      affectsScore: -3 }, 3);
  }

  if (missingAlt > 0) {
    push({ id: 'alt-missing', type: 'warning', category: 'Images', priority: 2,
      issue: `${missingAlt} of ${imageCount} images missing alt text`,
      detail: 'Google reads alt text for image ranking. Missing alt = lost traffic + accessibility fail.',
      suggestion: `Add descriptive alt text to all ${missingAlt} images.`,
      fixExample: '<img src="photo.jpg" alt="[describe what the image shows]">',
      affectsScore: -10 }, 10);
  }

  // ── TECHNICAL ──────────────────────────────────────────────────────────────
  const url = d.url || '';

  if (!d.hasViewport) {
    push({ id: 'no-viewport', type: 'critical', category: 'Technical', priority: 1,
      issue: 'Missing viewport meta tag — site not mobile-friendly',
      detail: '60% of searches are mobile. Google uses mobile version for ranking.',
      suggestion: 'Add this one line to <head>:',
      fixExample: '<meta name="viewport" content="width=device-width, initial-scale=1">',
      affectsScore: -18 }, 18);
  }

  if (!d.canonical) {
    push({ id: 'no-canonical', type: 'info', category: 'Technical', priority: 3,
      issue: 'Missing canonical tag',
      detail: 'Canonical prevents duplicate content penalties when pages are reachable via multiple URLs.',
      suggestion: 'Add a self-referencing canonical.',
      fixExample: `<link rel="canonical" href="${url || '[this page URL]'}">`,
      affectsScore: -4 }, 4);
  }

  if (url && !url.startsWith('https://')) {
    push({ id: 'no-https', type: 'critical', category: 'Technical', priority: 1,
      issue: 'Not HTTPS — shows "Not Secure" warning in Chrome',
      detail: 'HTTPS is a Google ranking signal. HTTP sites rank lower and lose user trust.',
      suggestion: 'Install an SSL certificate (free via Let\'s Encrypt or your host).',
      affectsScore: -15 }, 15);
  }

  // ── SOCIAL / OPEN GRAPH ────────────────────────────────────────────────────
  const og = d.og || {};
  if (!og.title || !og.description || !og.image) {
    push({ id: 'incomplete-og', type: 'info', category: 'On-Page', priority: 4,
      issue: 'Incomplete Open Graph tags',
      detail: 'Without OG tags, social media previews show blank or wrong content.',
      suggestion: 'Add og:title, og:description, and og:image to <head>.',
      fixExample: '<meta property="og:title" content="...">\n<meta property="og:description" content="...">\n<meta property="og:image" content="https://...">',
      affectsScore: -3 }, 3);
  }

  // ── SCHEMA ─────────────────────────────────────────────────────────────────
  const hasSchema = d.hasSchema || (d.schemaTypes || []).length > 0;
  if (!hasSchema) {
    push({ id: 'no-schema', type: 'info', category: 'Technical', priority: 3,
      issue: 'No structured data (schema markup)',
      detail: 'Schema enables rich results in Google — stars, FAQs, breadcrumbs. Sites with schema average 20-30% higher CTR.',
      suggestion: 'Add JSON-LD schema appropriate for your page type.',
      fixExample: '<script type="application/ld+json">\n{"@context":"https://schema.org","@type":"WebPage","name":"' + (title || 'Page') + '"}\n</script>',
      affectsScore: -3 }, 3);
  }

  // ── FINAL SCORE ────────────────────────────────────────────────────────────
  score = Math.max(0, Math.min(100, score));
  const grade = scoreToGrade(score);

  return {
    score,
    grade,
    issues: issues.sort((a, b) => a.priority - b.priority),
    categoryScores: calcCategoryScores(issues),
  };
}

function scoreToGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function calcCategoryScores(issues) {
  const cats = ['On-Page', 'Technical', 'Content', 'Performance', 'Images', 'Mobile'];
  const out = {};
  for (const cat of cats) {
    const catIssues = issues.filter(i => i.category === cat);
    let s = 100;
    catIssues.forEach(i => { s += (i.affectsScore || 0); });
    out[cat] = Math.max(0, Math.min(100, s));
  }
  return out;
}

// Export for Node.js (backend fallback) and browser (service worker)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { scorePageData, scoreToGrade, calcCategoryScores };
}
