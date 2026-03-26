/**
 * Content Script - Visual Overlay Audit
 * Highlights SEO issues directly on the page with animated red/yellow/green boxes
 */

// Guard against double-injection (content scripts can run more than once)
if (window.__naraseoCS) {
  // Already loaded — skip re-execution to avoid duplicate declarations
} else {
window.__naraseoCS = true;

// Inject CSS animations for pulsing overlays
injectStyles();

// Listen for messages from sidebar/popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ANALYZE_PAGE') {
    const pageData = analyzePageElements();
    sendResponse({ analysis: pageData });
  } else if (request.action === 'INJECT_HIGHLIGHTS') {
    injectHighlights(request.issues);
    sendResponse({ success: true });
  } else if (request.action === 'CLEAR_HIGHLIGHTS') {
    clearHighlights();
    sendResponse({ success: true });
  } else if (request.action === 'GET_PAGE_DATA') {
    try {
      const pageData = extractPageData();
      sendResponse(pageData);
    } catch (err) {
      console.error('extractPageData error:', err);
      // Return partial data even if extraction fails
      sendResponse({
        url: window.location.href,
        title: document.title,
        metaDescription: document.querySelector('meta[name="description"]')?.content || '',
        error: err.message
      });
    }
  } else if (request.action === 'ANALYZE_LOCAL_SEO') {
    const localData = analyzeLocalSEO();
    sendResponse({ localData });
  } else if (request.action === 'APPLY_AUTO_FIXES') {
    const fixed = applyAutoFixes(request.issues || []);
    sendResponse({ fixed });
  } else if (request.action === 'APPLY_SUGGESTION') {
    const result = applySuggestion(request.element, request.value);
    sendResponse(result);
  } else if (request.action === 'HIGHLIGHT_SUGGESTIONS') {
    highlightSuggestions(request.elements || []);
    sendResponse({ success: true });
  } else if (request.action === 'CLEAR_SUGGESTION_HIGHLIGHT') {
    clearSuggestionHighlight(request.element);
    sendResponse({ success: true });
  } else if (request.action === 'CLEAR_ALL_SUGGESTION_HIGHLIGHTS') {
    clearAllSuggestionHighlights();
    sendResponse({ success: true });
  } else if (request.action === 'AUDIT_UPDATED') {
    console.log('SEO AI background audit updated:', request.result?.score);
    sendResponse({ ok: true });
  }
  return true;
});

/**
 * Inject CSS for animations
 */
function injectStyles() {
  if (document.getElementById('seo-ai-styles')) return;

  const style = document.createElement('style');
  style.id = 'seo-ai-styles';
  style.innerHTML = `
    @keyframes seo-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
      50% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
    }
    @keyframes seo-pulse-warning {
      0%, 100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.7); }
      50% { box-shadow: 0 0 0 10px rgba(249, 115, 22, 0); }
    }
    @keyframes seo-pulse-info {
      0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      50% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
    }
    .seo-highlight {
      position: fixed !important;
      pointer-events: none !important;
      z-index: 999999 !important;
      border: 2px solid !important;
      border-radius: 4px !important;
    }
    .seo-highlight-critical {
      border-color: #ef4444 !important;
      animation: seo-pulse 2s infinite;
    }
    .seo-highlight-warning {
      border-color: #f97316 !important;
      animation: seo-pulse-warning 2s infinite;
    }
    .seo-highlight-info {
      border-color: #10b981 !important;
      animation: seo-pulse-info 2s infinite;
    }
    .seo-label {
      position: fixed !important;
      background: rgba(0, 0, 0, 0.8) !important;
      color: white !important;
      padding: 4px 8px !important;
      border-radius: 3px !important;
      font-size: 11px !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      z-index: 1000000 !important;
      pointer-events: none !important;
      max-width: 200px !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

/**
 * Extract rich page data for report & fix context
 */
function extractPageData() {
  const allImgs = Array.from(document.querySelectorAll('img'));
  const allLinks = Array.from(document.querySelectorAll('a[href]'));
  const currentHost = window.location.hostname;

  const internalLinks = allLinks.filter(a => {
    try { return new URL(a.href).hostname === currentHost; } catch { return false; }
  });
  const externalLinks = allLinks.filter(a => {
    try { return new URL(a.href).hostname !== currentHost; } catch { return false; }
  });

  // All headings structure
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4')).map(h => ({
    level: parseInt(h.tagName[1]),
    text: h.textContent.trim().substring(0, 100),
  }));

  // Images missing alt
  const imgsMissingAlt = allImgs
    .filter(img => !img.alt || img.alt.trim() === '')
    .map(img => img.src.split('/').pop().substring(0, 60));

  // OG tags
  const og = {
    title:       document.querySelector('meta[property="og:title"]')?.content || '',
    description: document.querySelector('meta[property="og:description"]')?.content || '',
    image:       document.querySelector('meta[property="og:image"]')?.content || '',
    url:         document.querySelector('meta[property="og:url"]')?.content || '',
  };

  // Twitter card
  const twitter = {
    card:        document.querySelector('meta[name="twitter:card"]')?.content || '',
    title:       document.querySelector('meta[name="twitter:title"]')?.content || '',
    description: document.querySelector('meta[name="twitter:description"]')?.content || '',
  };

  // Schema types
  const schemaScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
  const schemaTypes = schemaScripts.map(s => {
    try { return JSON.parse(s.textContent)['@type'] || 'Unknown'; } catch { return 'Invalid JSON'; }
  });

  // Canonical
  const canonical = document.querySelector('link[rel="canonical"]')?.href || '';

  // Robots meta
  const robots = document.querySelector('meta[name="robots"]')?.content || 'index, follow';

  // Word count (main content area)
  const mainEl = document.querySelector('main, article, [role="main"], .content, #content, .main') || document.body;
  const rawText = mainEl.innerText || mainEl.textContent || '';
  const wordCount = rawText.trim().split(/\s+/).filter(w => w.length > 0).length;

  // First paragraph text
  const firstPara = document.querySelector('p')?.textContent?.trim().substring(0, 200) || '';

  // Page size estimate
  const htmlSize = Math.round(document.documentElement.outerHTML.length / 1024);

  // ── Keyword density analysis ──────────────────────────────────────────────
  const stopWords = new Set(['the','and','for','are','but','not','you','all','can','her','was','one','our','out','from','with','this','that','have','they','what','will','your','been','has','had','were','said','each','which','their','when','there','than','then','these','some','more','also','into','just','its','like','only','over','such','about','after','before','between','other','through','much','many','time','very','would','could','should','most','make','made','know','take','than','even','back','good','need','does','how','being']);
  const bodyWords = rawText.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
  const freq = {};
  bodyWords.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  const topKeywords = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word, count]) => ({
      word,
      count,
      density: bodyWords.length > 0 ? Math.round((count / bodyWords.length) * 1000) / 10 : 0,
    }));

  // ── Reading level (avg words/sentence) ───────────────────────────────────
  const sentences = rawText.split(/[.!?]+/).filter(s => s.trim().length > 10).length || 1;
  const avgWordsPerSentence = Math.round(wordCount / sentences);
  const readingLevel = avgWordsPerSentence < 14 ? 'Easy' : avgWordsPerSentence < 20 ? 'Medium' : 'Complex';

  // ── Image details ─────────────────────────────────────────────────────────
  const imageDetails = allImgs.slice(0, 40).map(img => ({
    src:    (img.src || '').split('/').pop().substring(0, 60) || img.src.substring(0, 60),
    alt:    img.alt || '',
    hasAlt: !!(img.alt && img.alt.trim()),
    width:  img.naturalWidth || img.width || 0,
    height: img.naturalHeight || img.height || 0,
    lazy:   img.loading === 'lazy',
  }));

  // ── Link details ──────────────────────────────────────────────────────────
  const internalLinkDetails = internalLinks.slice(0, 20).map(a => ({
    text: (a.textContent || '').trim().substring(0, 60),
    href: a.href,
    hasText: !!(a.textContent && a.textContent.trim()),
  }));
  const externalLinkDetails = externalLinks.slice(0, 10).map(a => ({
    text: (a.textContent || '').trim().substring(0, 50),
    href: a.href,
    nofollow: (a.rel || '').includes('nofollow'),
  }));

  return {
    url:               window.location.href,
    title:             document.title,
    titleLength:       document.title.length,
    metaDescription:   document.querySelector('meta[name="description"]')?.content || '',
    metaDescLength:    (document.querySelector('meta[name="description"]')?.content || '').length,
    h1Tags:            headings.filter(h => h.level === 1).map(h => h.text),
    headings,
    wordCount,
    sentences,
    avgWordsPerSentence,
    readingLevel,
    topKeywords,
    firstPara,
    canonical,
    robots,
    og,
    twitter,
    schemaTypes,
    imageCount:        allImgs.length,
    imageDetails,
    imgsMissingAlt,
    internalLinkCount: internalLinks.length,
    externalLinkCount: externalLinks.length,
    internalLinkDetails,
    externalLinkDetails,
    htmlSizeKb:        htmlSize,
    businessType:      detectBusinessType(),
    location:          detectLocation(),
    hasViewport:       !!document.querySelector('meta[name="viewport"]'),
  };
}

/**
 * Get summary of page content (first 200 chars of main text)
 */
function getPageContentSummary() {
  const main = document.querySelector('main, article, [role="main"]');
  const text = (main?.textContent || document.body.textContent || '').substring(0, 200);
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Detect business type from page content
 */
function detectBusinessType() {
  const types = ['dental', 'law', 'medical', 'restaurant', 'hotel', 'agency', 'shop', 'consulting'];
  const content = document.body.textContent.toLowerCase();
  for (const type of types) {
    if (content.includes(type)) return type;
  }
  return 'service';
}

/**
 * Detect location from schema markup or content
 */
function detectLocation() {
  const schema = document.querySelector('script[type="application/ld+json"]');
  if (schema) {
    try {
      const data = JSON.parse(schema.textContent);
      return data.address?.addressLocality || data.areaServed || '';
    } catch (e) {}
  }
  return '';
}

/**
 * Analyze page elements and identify issues
 */
function analyzePageElements() {
  const issues = [];

  // 1. Check title tag
  const title = document.title || '';
  if (!title) {
    issues.push({ type: 'critical', issue: 'Missing title tag', element: null });
  } else if (title.length < 30 || title.length > 60) {
    issues.push({ type: 'warning', issue: `Title too ${title.length < 30 ? 'short' : 'long'} (${title.length} chars)`, element: null });
  }

  // 2. Check meta description
  const metaDesc = document.querySelector('meta[name="description"]');
  if (!metaDesc) {
    issues.push({ type: 'critical', issue: 'Missing meta description', element: null });
  } else if (!metaDesc.content || metaDesc.content.length < 150 || metaDesc.content.length > 160) {
    issues.push({ type: 'warning', issue: `Meta description ${metaDesc.content?.length || 0} chars (target: 150-160)`, element: null });
  }

  // 3. Check H1 tags
  const h1s = document.querySelectorAll('h1');
  if (h1s.length === 0) {
    issues.push({ type: 'critical', issue: 'Missing H1 tag', element: null });
  } else if (h1s.length > 1) {
    issues.push({ type: 'warning', issue: `Multiple H1 tags (${h1s.length})`, elements: Array.from(h1s) });
  }

  // 4. Check images without alt text
  const images = document.querySelectorAll('img');
  const imagesNoAlt = Array.from(images).filter(img => !img.alt || img.alt.trim() === '');
  imagesNoAlt.forEach(img => {
    issues.push({ type: 'warning', issue: 'Image missing alt text', element: img, selector: getSelectorFor(img) });
  });

  // 5. Check for viewport meta tag
  if (!document.querySelector('meta[name="viewport"]')) {
    issues.push({ type: 'critical', issue: 'Missing viewport meta tag', element: null });
  }

  // 6. Check for canonical tag
  if (!document.querySelector('link[rel="canonical"]')) {
    issues.push({ type: 'warning', issue: 'Missing canonical tag', element: null });
  }

  // 7. Check for Open Graph tags
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (!ogTitle || !ogDesc) {
    issues.push({ type: 'info', issue: 'Missing Open Graph tags', element: null });
  }

  // 8. Check for external links without noopener
  const externalLinks = Array.from(document.querySelectorAll('a[href]')).filter(a => {
    try {
      const href = new URL(a.href);
      return href.hostname !== new URL(window.location.href).hostname && a.target === '_blank';
    } catch {
      return false;
    }
  });
  externalLinks.forEach(link => {
    if (!link.rel?.includes('noopener')) {
      issues.push({ type: 'info', issue: 'External link missing noopener', element: link, selector: getSelectorFor(link) });
    }
  });

  return { issues, elementCount: images.length + h1s.length + externalLinks.length };
}

/**
 * Get a simple CSS selector for an element
 */
function getSelectorFor(el) {
  if (el.id) return `#${el.id}`;

  let path = [];
  while (el) {
    let name = el.tagName.toLowerCase();
    if (el.id) {
      path.unshift(`#${el.id}`);
      break;
    } else {
      let sibling = el;
      let nth = 1;
      while (sibling = sibling.previousElementSibling) {
        if (sibling.tagName.toLowerCase() === name) nth++;
      }
      if (nth > 1) name += `:nth-of-type(${nth})`;
      path.unshift(name);
    }
    el = el.parentElement;
  }
  return path.join(' > ');
}

/**
 * Inject visual highlights on page
 */
function injectHighlights(issues) {
  clearHighlights();

  // Create container for all overlays
  const container = document.createElement('div');
  container.id = 'seo-ai-overlay-container';
  document.body.appendChild(container);

  issues.forEach((issue, idx) => {
    // For issues with specific elements (images, links, etc.)
    if (issue.element) {
      highlightElement(issue.element, issue.type, issue.issue);
    }
  });

  // Count and log
  const count = {
    critical: issues.filter(i => i.type === 'critical').length,
    warning: issues.filter(i => i.type === 'warning').length,
    info: issues.filter(i => i.type === 'info').length,
  };
  console.log(`🔴 SEO Issues: ${count.critical} critical, ${count.warning} warnings, ${count.info} tips`);
}

/**
 * Highlight a specific element on the page
 */
function highlightElement(el, type, label) {
  if (!el || !el.offsetParent) return; // Element not visible

  const rect = el.getBoundingClientRect();
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

  // Create highlight box
  const highlight = document.createElement('div');
  highlight.className = `seo-highlight seo-highlight-${type}`;
  highlight.style.left = (rect.left + scrollLeft) + 'px';
  highlight.style.top = (rect.top + scrollTop) + 'px';
  highlight.style.width = rect.width + 'px';
  highlight.style.height = rect.height + 'px';
  document.body.appendChild(highlight);

  // Create label
  const labelEl = document.createElement('div');
  labelEl.className = 'seo-label';
  labelEl.style.left = (rect.left + scrollLeft) + 'px';
  labelEl.style.top = (rect.top + scrollTop - 25) + 'px';
  const shortLabel = label.length > 25 ? label.substring(0, 22) + '...' : label;
  labelEl.textContent = `${type.toUpperCase()}: ${shortLabel}`;
  document.body.appendChild(labelEl);
}

/**
 * Clear all highlights
 */
function clearHighlights() {
  document.querySelectorAll('.seo-highlight, .seo-label').forEach(el => el.remove());
  const container = document.getElementById('seo-ai-overlay-container');
  if (container) container.remove();
}

// ─── AUTO-FIX INJECTOR ────────────────────────────────────────────────────────
/**
 * Injects missing SEO elements directly into the live page DOM.
 * Fixes are temporary (cleared on page reload) but allow the user to:
 *  1. Preview how the page looks with fixes applied
 *  2. Copy the exact code to paste into their CMS/template
 */
/**
 * Apply a single AI-suggested rewrite directly to the live page.
 * Used by the Suggestions diff view "Apply to page" button.
 * Changes are in-memory only — they don't modify the actual source files.
 */
function applySuggestion(element, value) {
  try {
    if (!value) return { success: false, error: 'No value provided' };

    switch (element) {
      case 'title': {
        document.title = value;
        // Also update og:title if it matches the old title
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle && ogTitle.content === document.title) ogTitle.content = value;
        return { success: true };
      }
      case 'meta': {
        let meta = document.querySelector('meta[name="description"]');
        if (!meta) {
          meta = document.createElement('meta');
          meta.name = 'description';
          (document.head || document.documentElement).appendChild(meta);
        }
        meta.content = value;
        // Also update og:description
        const ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc) ogDesc.content = value;
        return { success: true };
      }
      case 'h1': {
        const h1 = document.querySelector('h1');
        if (!h1) return { success: false, error: 'No H1 element found on this page' };
        // Animate the change
        h1.style.transition = 'background 0.4s';
        h1.style.background = '#fef9c3';
        h1.textContent = value;
        setTimeout(() => { h1.style.background = ''; }, 1500);
        return { success: true };
      }
      case 'h2': {
        const h2 = document.querySelector('h2');
        if (!h2) return { success: false, error: 'No H2 element found on this page' };
        h2.style.transition = 'background 0.4s';
        h2.style.background = '#fef9c3';
        h2.textContent = value;
        setTimeout(() => { h2.style.background = ''; }, 1500);
        return { success: true };
      }
      case 'intro': {
        const mainEl = document.querySelector('main, article, [role="main"], .content, #content, .main');
        const para = mainEl ? mainEl.querySelector('p') : document.querySelector('p');
        if (!para) return { success: false, error: 'No paragraph element found' };
        para.style.transition = 'background 0.4s';
        para.style.background = '#fef9c3';
        para.textContent = value;
        setTimeout(() => { para.style.background = ''; }, 1500);
        return { success: true };
      }
      default: {
        // Handle image alt: key = 'image_0', 'image_1', etc.
        if (element.startsWith('image_')) {
          const idx = parseInt(element.split('_')[1]);
          const imgsNoAlt = Array.from(document.querySelectorAll('img')).filter(img => !img.alt || !img.alt.trim());
          const img = imgsNoAlt[idx];
          if (!img) return { success: false, error: `Image ${idx} not found` };
          img.alt = value;
          img.style.outline = '3px solid #22c55e';
          img.style.transition = 'outline 0.4s';
          setTimeout(() => { img.style.outline = ''; }, 1500);
          return { success: true };
        }
        return { success: false, error: `Unknown element: ${element}` };
      }
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── SUGGESTION HIGHLIGHTS ────────────────────────────────────────────────────
// Dashed indigo borders — visually distinct from audit red/orange highlights

function injectSuggestionStyles() {
  if (document.getElementById('seo-ai-suggest-styles')) return;
  const style = document.createElement('style');
  style.id = 'seo-ai-suggest-styles';
  style.innerHTML = `
    @keyframes seo-suggest-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.6); }
      50% { box-shadow: 0 0 0 8px rgba(99, 102, 241, 0); }
    }
    .seo-suggest-highlight {
      position: absolute !important;
      pointer-events: none !important;
      z-index: 999997 !important;
      border: 2px dashed #6366f1 !important;
      border-radius: 6px !important;
      animation: seo-suggest-pulse 2.5s infinite;
      background: rgba(99, 102, 241, 0.05) !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

// Maps element keys to a DOM selector function
const SUGGEST_SELECTORS = {
  h1:    () => document.querySelector('h1'),
  h2:    () => document.querySelector('h2'),
  intro: () => {
    const main = document.querySelector('main, article, [role="main"], .content, #content, .main');
    return main ? main.querySelector('p') : document.querySelector('p');
  },
};

function highlightSuggestions(elements) {
  injectSuggestionStyles();
  clearAllSuggestionHighlights();
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollTop  = window.pageYOffset || document.documentElement.scrollTop;

  elements.forEach(key => {
    let el = null;
    if (SUGGEST_SELECTORS[key]) {
      el = SUGGEST_SELECTORS[key]();
    } else if (key.startsWith('image_')) {
      const idx = parseInt(key.split('_')[1]);
      const imgsNoAlt = Array.from(document.querySelectorAll('img')).filter(img => !img.alt || !img.alt.trim());
      el = imgsNoAlt[idx] || null;
    }
    if (!el) return;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const highlight = document.createElement('div');
    highlight.className = 'seo-suggest-highlight';
    highlight.dataset.suggestionKey = key;
    highlight.style.left   = (rect.left + scrollLeft - 4) + 'px';
    highlight.style.top    = (rect.top  + scrollTop  - 4) + 'px';
    highlight.style.width  = (rect.width  + 8) + 'px';
    highlight.style.height = (rect.height + 8) + 'px';
    document.body.appendChild(highlight);
  });
}

function clearSuggestionHighlight(key) {
  document.querySelectorAll(`.seo-suggest-highlight[data-suggestion-key="${CSS.escape(key)}"]`).forEach(el => el.remove());
}

function clearAllSuggestionHighlights() {
  document.querySelectorAll('.seo-suggest-highlight').forEach(el => el.remove());
}

function applyAutoFixes(issues) {
  const fixed = [];

  issues.forEach(issue => {
    const text = (issue.issue || '').toLowerCase();

    // ── Viewport meta ────────────────────────────────────────────────────────
    if (text.includes('viewport') && !document.querySelector('meta[name="viewport"]')) {
      const meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width, initial-scale=1';
      (document.head || document.documentElement).appendChild(meta);
      fixed.push({
        issue: 'Missing viewport',
        code: '<meta name="viewport" content="width=device-width, initial-scale=1">',
        applied: true,
      });
    }

    // ── Canonical tag ─────────────────────────────────────────────────────────
    if (text.includes('canonical') && !document.querySelector('link[rel="canonical"]')) {
      const link = document.createElement('link');
      link.rel = 'canonical';
      link.href = window.location.href;
      (document.head || document.documentElement).appendChild(link);
      fixed.push({
        issue: 'Missing canonical',
        code: `<link rel="canonical" href="${window.location.href}">`,
        applied: true,
      });
    }

    // ── Open Graph tags ───────────────────────────────────────────────────────
    if (text.includes('open graph')) {
      const title = document.title || '';
      const desc = document.querySelector('meta[name="description"]')?.content || '';

      if (!document.querySelector('meta[property="og:title"]')) {
        const m = document.createElement('meta');
        m.setAttribute('property', 'og:title');
        m.content = title;
        (document.head || document.documentElement).appendChild(m);
        fixed.push({ issue: 'Missing og:title', code: `<meta property="og:title" content="${escapeAttr(title)}">`, applied: true });
      }
      if (!document.querySelector('meta[property="og:description"]') && desc) {
        const m = document.createElement('meta');
        m.setAttribute('property', 'og:description');
        m.content = desc;
        (document.head || document.documentElement).appendChild(m);
        fixed.push({ issue: 'Missing og:description', code: `<meta property="og:description" content="${escapeAttr(desc)}">`, applied: true });
      }
      if (!document.querySelector('meta[property="og:url"]')) {
        const m = document.createElement('meta');
        m.setAttribute('property', 'og:url');
        m.content = window.location.href;
        (document.head || document.documentElement).appendChild(m);
        fixed.push({ issue: 'Missing og:url', code: `<meta property="og:url" content="${window.location.href}">`, applied: true });
      }
      if (!document.querySelector('meta[property="og:type"]')) {
        const m = document.createElement('meta');
        m.setAttribute('property', 'og:type');
        m.content = 'website';
        (document.head || document.documentElement).appendChild(m);
        fixed.push({ issue: 'Missing og:type', code: '<meta property="og:type" content="website">', applied: true });
      }
    }

    // ── Twitter card ──────────────────────────────────────────────────────────
    if (text.includes('twitter') && !document.querySelector('meta[name="twitter:card"]')) {
      const m = document.createElement('meta');
      m.name = 'twitter:card';
      m.content = 'summary_large_image';
      (document.head || document.documentElement).appendChild(m);
      fixed.push({ issue: 'Missing twitter:card', code: '<meta name="twitter:card" content="summary_large_image">', applied: true });
    }

    // ── LocalBusiness schema ──────────────────────────────────────────────────
    if (text.includes('localbusiness schema') && !document.querySelector('script[type="application/ld+json"]')) {
      const businessName = document.title.split('|')[0].trim() || document.title;
      const schema = {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: businessName,
        url: window.location.origin,
        description: document.querySelector('meta[name="description"]')?.content || '',
      };
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(schema, null, 2);
      (document.head || document.documentElement).appendChild(script);
      fixed.push({
        issue: 'Missing LocalBusiness schema',
        code: `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`,
        applied: true,
      });
    }
  });

  // ── Show "Fixes Applied" banner on page ────────────────────────────────────
  if (fixed.length > 0) {
    showFixesBanner(fixed.length);
  }

  return fixed;
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showFixesBanner(count) {
  const existing = document.getElementById('seo-fixes-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'seo-fixes-banner';
  banner.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
    background: #1e293b; color: #f8fafc; padding: 12px 18px;
    border-radius: 10px; font-size: 13px; font-family: -apple-system, sans-serif;
    border-left: 4px solid #22c55e; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    display: flex; align-items: center; gap: 10px; max-width: 280px;
  `;
  banner.innerHTML = `
    <span style="font-size:18px;">✅</span>
    <div>
      <strong style="color:#22c55e;">SEO AI Applied ${count} Fix${count > 1 ? 'es' : ''}</strong><br>
      <span style="color:#94a3b8;font-size:11px;">Temporary — copy code from Fixes tab</span>
    </div>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:16px;padding:0;margin-left:auto;">✕</button>
  `;
  document.body.appendChild(banner);
  setTimeout(() => banner?.remove(), 6000);
}

// ─── LOCAL / GEO SEO ANALYZER ────────────────────────────────────────────────

/**
 * Full local SEO analysis — schema, NAP, maps, location signals, geo tags
 */
function analyzeLocalSEO() {
  const result = {
    isLocalBusiness: false,
    businessType: null,
    hasLocalBusinessSchema: false,
    hasAddress: false,
    hasPhone: false,
    hasGoogleMapsEmbed: false,
    locationInTitle: false,
    locationInMeta: false,
    locationInH1: false,
    hasHreflang: false,
    hasGeoMeta: false,
    hasReviewSchema: false,
    hasOpeningHours: false,
    hasServiceArea: false,
    napData: null,
    detectedCity: null,
    issues: [],
    score: 100,
  };

  // ── Parse all JSON-LD schemas ──────────────────────────────────────────────
  const schemas = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
    try {
      const data = JSON.parse(s.textContent);
      const items = Array.isArray(data) ? data : [data];
      items.forEach(item => schemas.push(item));
      if (data['@graph']) data['@graph'].forEach(item => schemas.push(item));
    } catch (e) {}
  });

  // ── LocalBusiness schema check ─────────────────────────────────────────────
  const LOCAL_TYPES = [
    'LocalBusiness', 'Restaurant', 'MedicalBusiness', 'DentalClinic',
    'LegalService', 'FinancialService', 'Hotel', 'Store', 'FoodEstablishment',
    'HealthAndBeautyBusiness', 'AutoDealer', 'RealEstateAgent', 'Dentist',
    'Physician', 'Lawyer', 'AccountingService', 'Plumber', 'Electrician',
    'HomeAndConstructionBusiness', 'LodgingBusiness', 'ProfessionalService',
    'TravelAgency', 'SportsActivityLocation', 'EntertainmentBusiness',
    'ChildCare', 'Optician', 'VeterinaryCare',
  ];

  const localSchema = schemas.find(s => {
    const type = s['@type'] || '';
    return LOCAL_TYPES.some(t => type === t || type.includes(t));
  });

  if (localSchema) {
    result.hasLocalBusinessSchema = true;
    result.isLocalBusiness = true;
    result.businessType = localSchema['@type'];

    const addr = localSchema.address;
    if (addr) {
      result.hasAddress = true;
      result.napData = result.napData || {};
      result.napData.address = typeof addr === 'string'
        ? addr
        : [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode]
            .filter(Boolean).join(', ');
      result.napData.city = addr.addressLocality || '';
    }

    if (localSchema.telephone) {
      result.hasPhone = true;
      result.napData = result.napData || {};
      result.napData.phone = localSchema.telephone;
    }

    if (localSchema.name) {
      result.napData = result.napData || {};
      result.napData.name = localSchema.name;
    }

    if (localSchema.openingHours || localSchema.openingHoursSpecification) {
      result.hasOpeningHours = true;
    }

    if (localSchema.areaServed) {
      result.hasServiceArea = true;
      result.napData = result.napData || {};
      result.napData.serviceArea = typeof localSchema.areaServed === 'string'
        ? localSchema.areaServed
        : JSON.stringify(localSchema.areaServed);
    }
  }

  // ── AggregateRating schema ─────────────────────────────────────────────────
  if (schemas.some(s => s.aggregateRating || s['@type'] === 'AggregateRating')) {
    result.hasReviewSchema = true;
    const ratingSchema = schemas.find(s => s.aggregateRating);
    if (ratingSchema?.aggregateRating) {
      result.napData = result.napData || {};
      const r = ratingSchema.aggregateRating;
      result.napData.rating = `${r.ratingValue || '?'}/5 (${r.reviewCount || '?'} reviews)`;
    }
  }

  // ── NAP fallback — detect address from DOM text ────────────────────────────
  if (!result.hasAddress) {
    const bodyText = document.body.innerText;
    const addressRx = /\d{1,5}\s[\w\s]{1,30}(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl)\b/i;
    const match = bodyText.match(addressRx);
    if (match) {
      result.hasAddress = true;
      result.napData = result.napData || {};
      result.napData.address = match[0];
    }
  }

  if (!result.hasPhone) {
    const bodyText = document.body.innerText;
    const phoneRx = /(?:\+1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/;
    const match = bodyText.match(phoneRx);
    if (match) {
      result.hasPhone = true;
      result.napData = result.napData || {};
      result.napData.phone = match[0];
    }
  }

  // ── Google Maps embed ──────────────────────────────────────────────────────
  result.hasGoogleMapsEmbed = !!(
    document.querySelector('iframe[src*="maps.google.com"]') ||
    document.querySelector('iframe[src*="google.com/maps"]') ||
    document.querySelector('iframe[src*="maps.googleapis.com"]')
  );

  // ── hreflang tags ──────────────────────────────────────────────────────────
  result.hasHreflang = document.querySelectorAll('link[rel="alternate"][hreflang]').length > 0;

  // ── Geo meta tags ──────────────────────────────────────────────────────────
  result.hasGeoMeta = !!(
    document.querySelector('meta[name="geo.region"]') ||
    document.querySelector('meta[name="geo.placename"]') ||
    document.querySelector('meta[name="ICBM"]') ||
    document.querySelector('meta[name="geo.position"]')
  );

  if (result.hasGeoMeta) {
    const geoPlace = document.querySelector('meta[name="geo.placename"]')?.content ||
                     document.querySelector('meta[name="geo.region"]')?.content;
    if (geoPlace) {
      result.napData = result.napData || {};
      result.napData.geoRegion = geoPlace;
    }
  }

  // ── Location keyword matching ──────────────────────────────────────────────
  const cityKeywords = [];
  if (result.napData?.city) cityKeywords.push(result.napData.city.toLowerCase());
  schemas.filter(s => s.areaServed).forEach(s => {
    if (typeof s.areaServed === 'string') cityKeywords.push(s.areaServed.toLowerCase());
  });
  const geoPlace = document.querySelector('meta[name="geo.placename"]')?.content;
  if (geoPlace) cityKeywords.push(geoPlace.toLowerCase());

  if (cityKeywords.length > 0) {
    result.detectedCity = cityKeywords[0];
    const title    = document.title.toLowerCase();
    const metaDesc = (document.querySelector('meta[name="description"]')?.content || '').toLowerCase();
    const h1Text   = (document.querySelector('h1')?.textContent || '').toLowerCase();
    result.locationInTitle = cityKeywords.some(k => title.includes(k));
    result.locationInMeta  = cityKeywords.some(k => metaDesc.includes(k));
    result.locationInH1    = cityKeywords.some(k => h1Text.includes(k));
  }

  // ── Generate issues ────────────────────────────────────────────────────────
  const issues = [];

  if (!result.hasLocalBusinessSchema) {
    issues.push({ type: 'critical', issue: 'Missing LocalBusiness schema markup', category: 'local' });
  }
  if (!result.hasAddress) {
    issues.push({ type: 'critical', issue: 'No business address found on page', category: 'local' });
  }
  if (!result.hasPhone) {
    issues.push({ type: 'warning', issue: 'No phone number detected on page', category: 'local' });
  }
  if (result.isLocalBusiness && !result.locationInTitle) {
    issues.push({ type: 'warning', issue: 'Location/city not in title tag', category: 'local' });
  }
  if (result.isLocalBusiness && !result.locationInMeta) {
    issues.push({ type: 'warning', issue: 'Location/city not in meta description', category: 'local' });
  }
  if (result.isLocalBusiness && !result.locationInH1) {
    issues.push({ type: 'info', issue: 'Location/city not in H1 tag', category: 'local' });
  }
  if (!result.hasGoogleMapsEmbed) {
    issues.push({ type: 'info', issue: 'No Google Maps embed found', category: 'local' });
  }
  if (result.isLocalBusiness && !result.hasOpeningHours) {
    issues.push({ type: 'warning', issue: 'No opening hours in schema markup', category: 'local' });
  }
  if (!result.hasReviewSchema) {
    issues.push({ type: 'info', issue: 'No review/rating schema (boosts CTR)', category: 'local' });
  }
  if (result.isLocalBusiness && !result.hasServiceArea) {
    issues.push({ type: 'info', issue: 'No areaServed defined in schema', category: 'local' });
  }

  result.issues = issues;

  // ── Calculate local score ──────────────────────────────────────────────────
  let score = 100;
  issues.forEach(i => {
    if (i.type === 'critical') score -= 20;
    else if (i.type === 'warning') score -= 10;
    else if (i.type === 'info') score -= 5;
  });
  result.score = Math.max(0, score);

  return result;
}

console.log('✓ SEO AI visual audit loaded');
} // end double-injection guard
