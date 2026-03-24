/**
 * PageSpeed lib — Google PageSpeed Insights API wrapper.
 * Shared by v1 audit, solve, solve-site routes and the legacy server routes.
 *
 * Returns: { performanceScore, seoScore, accessibilityScore, bestPracticesScore,
 *            crux: { lcp, lcpCategory, fid, cls, clsCategory, inp, inpCategory, fcp },
 *            lighthouse: { largestContentfulPaint, firstContentfulPaint, ... },
 *            opportunities: [{ id, title, description, savings }] }
 *
 * Caches per hostname for 1 hour. Resolves null if API key missing or request fails.
 */

import https from 'https';

const psCache = new Map(); // hostname → { data, expiresAt }
const PS_TTL  = 3_600_000; // 1 hour

export async function getPageSpeedInsights(url) {
  let cacheKey;
  try { cacheKey = new URL(url).hostname; } catch { cacheKey = url; }

  const cached = psCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  return new Promise((resolve) => {
    const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
    if (!apiKey) return resolve(null);

    const queryUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${apiKey}&strategy=mobile`;

    https.get(queryUrl, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return resolve(null);

          const lh   = json.lighthouseResult || {};
          const crux = json.loadingExperience?.metrics || {};
          const orig = json.originLoadingExperience?.metrics || {};

          const pick = (field) =>
            crux[field]?.percentile ?? orig[field]?.percentile ?? null;
          const cat = (field) =>
            crux[field]?.category   ?? orig[field]?.category   ?? null;

          const insights = {
            url,
            performanceScore:   lh.categories?.performance?.score    != null ? Math.round(lh.categories.performance.score    * 100) : null,
            accessibilityScore: lh.categories?.accessibility?.score  != null ? Math.round(lh.categories.accessibility.score  * 100) : null,
            bestPracticesScore: lh.categories?.['best-practices']?.score != null ? Math.round(lh.categories['best-practices'].score * 100) : null,
            seoScore:           lh.categories?.seo?.score            != null ? Math.round(lh.categories.seo.score            * 100) : null,

            crux: {
              lcp: pick('LARGEST_CONTENTFUL_PAINT_MS'),
              lcpCategory: cat('LARGEST_CONTENTFUL_PAINT_MS'),
              fid: pick('FIRST_INPUT_DELAY_MS'),
              fidCategory: cat('FIRST_INPUT_DELAY_MS'),
              inp: pick('INTERACTION_TO_NEXT_PAINT'),
              inpCategory: cat('INTERACTION_TO_NEXT_PAINT'),
              cls: pick('CUMULATIVE_LAYOUT_SHIFT_SCORE'),
              clsCategory: cat('CUMULATIVE_LAYOUT_SHIFT_SCORE'),
              fcp: pick('FIRST_CONTENTFUL_PAINT_MS'),
              fcpCategory: cat('FIRST_CONTENTFUL_PAINT_MS'),
            },

            lighthouse: {
              firstContentfulPaint:    lh.audits?.['first-contentful-paint']?.displayValue    ?? null,
              largestContentfulPaint:  lh.audits?.['largest-contentful-paint']?.displayValue  ?? null,
              cumulativeLayoutShift:   lh.audits?.['cumulative-layout-shift']?.displayValue   ?? null,
              totalBlockingTime:       lh.audits?.['total-blocking-time']?.displayValue        ?? null,
              speedIndex:              lh.audits?.['speed-index']?.displayValue                ?? null,
              interactive:             lh.audits?.['interactive']?.displayValue                ?? null,
            },

            opportunities: Object.values(lh.audits || {})
              .filter(a => a.scoreDisplayMode === 'opportunity' && a.score < 1)
              .map(a => ({ id: a.id, title: a.title, description: a.description, savingsMs: a.details?.overallSavingsMs || 0, score: a.score }))
              .sort((a, b) => b.savingsMs - a.savingsMs)
              .slice(0, 5),
          };

          psCache.set(cacheKey, { data: insights, expiresAt: Date.now() + PS_TTL });
          resolve(insights);
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null))
      .setTimeout(15000, function () { this.destroy(); resolve(null); });
  });
}

/**
 * Maps PageSpeed data into the v1 performance category score (0-100)
 * and a list of CWV issues in the standard issue format.
 */
export function cwvToScore(ps) {
  if (!ps || ps.performanceScore == null) return { score: null, issues: [] };

  const issues = [];
  const perf = ps.performanceScore;

  if (perf < 50) {
    issues.push({ id: 'poor-performance', type: 'critical', impact: 15,
      detail: `Google PageSpeed score: ${perf}/100 — poor. Directly impacts rankings and bounce rate.` });
  } else if (perf < 70) {
    issues.push({ id: 'moderate-performance', type: 'warning', impact: 8,
      detail: `Google PageSpeed score: ${perf}/100 — needs improvement.` });
  }

  const { lcp, lcpCategory, cls, clsCategory, inp, inpCategory } = ps.crux || {};

  if (lcpCategory === 'SLOW' || (lcp != null && lcp > 4000)) {
    issues.push({ id: 'poor-lcp', type: 'critical', impact: 10,
      detail: `LCP ${lcp ? lcp + 'ms' : 'slow'} — Google threshold: under 2500ms. Affects Core Web Vitals ranking signal.` });
  } else if (lcpCategory === 'AVERAGE' || (lcp != null && lcp > 2500)) {
    issues.push({ id: 'slow-lcp', type: 'warning', impact: 5,
      detail: `LCP ${lcp}ms — needs improvement (target: under 2500ms).` });
  }

  if (clsCategory === 'SLOW' || (cls != null && cls > 250)) {
    issues.push({ id: 'poor-cls', type: 'warning', impact: 6,
      detail: `CLS ${cls != null ? cls / 1000 : 'poor'} — layout shifts detected. Hurts user experience and CWV score.` });
  }

  if (inpCategory === 'SLOW') {
    issues.push({ id: 'poor-inp', type: 'warning', impact: 5,
      detail: `INP slow — interaction responsiveness is poor. Google uses INP as a ranking signal.` });
  }

  for (const opp of (ps.opportunities || []).slice(0, 3)) {
    if (opp.savingsMs > 500) {
      issues.push({ id: `perf-${opp.id}`, type: 'info', impact: 2,
        detail: `${opp.title} — potential saving: ${Math.round(opp.savingsMs)}ms` });
    }
  }

  return { score: perf, issues };
}
