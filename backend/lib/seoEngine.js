/**
 * SEO Engine - Unified HTML fetch + parse + score
 * Extracts and analyzes all SEO signals without external tools
 */

import https from 'https';
import { URL } from 'url';

const DEFAULT_TIMEOUT = 15000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Simple HTML parser (no deps)
function parseHTML(html) {
  const data = {
    title: '',
    metaDescription: '',
    canonical: '',
    h1: [],
    h2: [],
    h3: [],
    h4: [],
    h5: [],
    h6: [],
    images: [],
    internalLinks: [],
    externalLinks: [],
    allLinks: [],
    openGraph: {},
    twitterCard: {},
    jsonLD: [],
    robots: '',
    hreflang: [],
    viewport: false,
    charset: '',
    wordCount: 0,
    pageSize: html.length,
    https: false,
  };

  // Title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) data.title = titleMatch[1].trim();

  // Meta description
  const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
  if (descMatch) data.metaDescription = descMatch[1];

  // Canonical
  const canonMatch = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  if (canonMatch) data.canonical = canonMatch[1];

  // Viewport
  data.viewport = /<meta\s+name=["']viewport["']/i.test(html);

  // Charset
  const charsetMatch = html.match(/<meta\s+charset=["']?([^"'\s>]+)/i);
  if (charsetMatch) data.charset = charsetMatch[1];

  // Robots
  const robotsMatch = html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i);
  if (robotsMatch) data.robots = robotsMatch[1];

  // Headings (h1-h6) — allow child tags like <br>, <span> inside headings
  for (let i = 1; i <= 6; i++) {
    const regex = new RegExp(`<h${i}[^>]*>([\\s\\S]*?)<\\/h${i}>`, 'gi');
    let match;
    while ((match = regex.exec(html)) !== null) {
      const text = match[1].replace(/<[^>]+>/g, '').trim();
      if (text) data[`h${i}`].push(text);
    }
  }

  // Images (with alt text)
  const imgRegex = /<img[^>]+(?:src=["']([^"']+)["'][^>]*)?(?:alt=["']([^"']+)["'])?[^>]*>/gi;
  let imgMatch;
  while ((imgMatch = imgRegex.exec(html)) !== null) {
    const src = imgMatch[1] || '';
    const alt = imgMatch[2] || '';
    if (src) {
      data.images.push({
        src,
        alt,
        hasAlt: !!alt,
      });
    }
  }

  // Links
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
  let linkMatch;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const href = linkMatch[1];
    const text = linkMatch[2].replace(/<[^>]+>/g, '').trim();
    data.allLinks.push({ href, text });

    if (href.startsWith('http://') || href.startsWith('https://')) {
      data.externalLinks.push({ href, text });
    } else if (!href.startsWith('#') && !href.startsWith('mailto')) {
      data.internalLinks.push({ href, text });
    }
  }

  // Open Graph
  const ogRegex = /<meta\s+property=["']og:([^"']+)["']\s+content=["']([^"']+)["']/gi;
  let ogMatch;
  while ((ogMatch = ogRegex.exec(html)) !== null) {
    data.openGraph[ogMatch[1]] = ogMatch[2];
  }

  // Twitter Card
  const twitterRegex = /<meta\s+name=["']twitter:([^"']+)["']\s+content=["']([^"']+)["']/gi;
  let twitterMatch;
  while ((twitterMatch = twitterRegex.exec(html)) !== null) {
    data.twitterCard[twitterMatch[1]] = twitterMatch[2];
  }

  // JSON-LD
  const jsonldRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([^<]+)<\/script>/gi;
  let jsonldMatch;
  while ((jsonldMatch = jsonldRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(jsonldMatch[1]);
      data.jsonLD.push(parsed);
    } catch (e) {
      // Invalid JSON-LD, skip
    }
  }

  // hreflang
  const hrefLangRegex = /<link[^>]+rel=["']alternate["'][^>]+hreflang=["']([^"']+)["']/gi;
  let hrefLangMatch;
  while ((hrefLangMatch = hrefLangRegex.exec(html)) !== null) {
    data.hreflang.push(hrefLangMatch[1]);
  }

  // Word count (rough - text between tags)
  const textOnly = html.replace(/<[^>]+>/g, ' ').trim();
  data.wordCount = textOnly.split(/\s+/).filter(w => w.length > 0).length;

  return data;
}

// Fetch URL with proper headers and timeout
async function fetchURL(urlString) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      timeout: DEFAULT_TIMEOUT,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'identity',
        'DNT': '1',
        'Connection': 'close',
      },
    };

    const req = httpModule.request(options, (res) => {
      let data = '';

      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(fetchURL(res.headers.location));
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      res.on('data', (chunk) => {
        data += chunk;
        if (data.length > 5000000) { // 5MB limit
          req.abort();
          reject(new Error('Response too large'));
        }
      });

      res.on('end', () => {
        resolve(data);
      });
    });

    req.on('timeout', () => {
      req.abort();
      reject(new Error('Request timeout'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

// Detect if page is a Client-Side Rendered SPA (React, Vue, Angular)
function detectSPA(html, pageData) {
  const hasSPARoot = /<div[^>]+id=["'](root|app)["']/i.test(html);
  const hasReactBundle = /chunk\.js|bundle\.js|react|vue|angular/i.test(html);
  const isEmpty = pageData.wordCount < 50 && pageData.h1.length === 0 && !pageData.title;
  return hasSPARoot && (isEmpty || hasReactBundle);
}

// Calculate SEO score based on signals
function calculateScore(pageData) {
  let score = 50; // Start at 50
  let issues = [];

  // Title (5 points)
  if (!pageData.title) {
    issues.push({ id: 'missing-title', type: 'critical', impact: 5 });
  } else if (pageData.title.length < 30) {
    issues.push({ id: 'short-title', type: 'warning', impact: 2 });
  } else if (pageData.title.length > 60) {
    issues.push({ id: 'long-title', type: 'warning', impact: 1 });
  } else {
    score += 5;
  }

  // Meta description (5 points)
  if (!pageData.metaDescription) {
    issues.push({ id: 'missing-meta-description', type: 'critical', impact: 5 });
  } else if (pageData.metaDescription.length < 120) {
    issues.push({ id: 'short-description', type: 'warning', impact: 2 });
  } else if (pageData.metaDescription.length > 160) {
    issues.push({ id: 'long-description', type: 'warning', impact: 1 });
  } else {
    score += 5;
  }

  // H1 (5 points)
  if (pageData.h1.length === 0) {
    issues.push({ id: 'missing-h1', type: 'critical', impact: 5 });
  } else if (pageData.h1.length > 1) {
    issues.push({ id: 'multiple-h1', type: 'warning', impact: 2 });
  } else {
    score += 5;
  }

  // Heading hierarchy (3 points)
  if (pageData.h2.length > 0 && pageData.h3.length > 0) {
    score += 3;
  }

  // Images with alt text (5 points)
  const totalImages = pageData.images.length;
  const imagesWithAlt = pageData.images.filter(img => img.hasAlt).length;
  if (totalImages > 0) {
    const altRatio = imagesWithAlt / totalImages;
    if (altRatio === 1) {
      score += 5;
    } else if (altRatio > 0.5) {
      score += 3;
      issues.push({ id: 'missing-alt-text', type: 'warning', impact: 2 });
    } else {
      issues.push({ id: 'missing-alt-text', type: 'critical', impact: 4 });
    }
  }

  // Canonical (3 points)
  if (pageData.canonical) {
    score += 3;
  }

  // Viewport (5 points - mobile important)
  if (pageData.viewport) {
    score += 5;
  } else {
    issues.push({ id: 'missing-viewport', type: 'critical', impact: 5 });
  }

  // Charset (2 points)
  if (pageData.charset) {
    score += 2;
  }

  // Word count (3 points - 300+ words)
  if (pageData.wordCount >= 300) {
    score += 3;
  } else if (pageData.wordCount < 100) {
    issues.push({ id: 'low-word-count', type: 'warning', impact: 2 });
  }

  // JSON-LD schema (5 points)
  if (pageData.jsonLD.length > 0) {
    score += 5;
  }

  // Open Graph (3 points)
  const ogCount = Object.keys(pageData.openGraph).length;
  if (ogCount >= 4) {
    score += 3;
  }

  // Robots meta (2 points)
  if (pageData.robots && !pageData.robots.includes('noindex')) {
    score += 2;
  }

  return { score: Math.min(100, score), issues };
}

// Generate actionable JSON fix payloads from issues + pageData
function generateFixes(pageData, issues) {
  const fixes = [];

  for (const issue of issues) {
    switch (issue.id) {
      case 'missing-title':
        fixes.push({
          action: 'add_title',
          field: 'title',
          current: null,
          suggested: `${pageData.h1[0] || 'Page Title'} | Your Brand`,
          code: `<title>${pageData.h1[0] || 'Page Title'} | Your Brand</title>`,
          reason: 'Missing title tag. Search engines use this as the primary ranking signal.',
          impact: 'critical'
        });
        break;
      case 'short-title':
        fixes.push({
          action: 'update_title',
          field: 'title',
          current: pageData.title,
          suggested: `${pageData.title} | Add keywords here (target 50-60 chars)`,
          code: `<title>${pageData.title} | Add keywords here</title>`,
          reason: `Title is ${pageData.title.length} chars. Expand to 50-60 chars with target keyword.`,
          impact: 'warning'
        });
        break;
      case 'long-title':
        fixes.push({
          action: 'update_title',
          field: 'title',
          current: pageData.title,
          suggested: pageData.title.substring(0, 57) + '...',
          code: `<title>${pageData.title.substring(0, 57)}...</title>`,
          reason: `Title is ${pageData.title.length} chars. Truncate to under 60 chars to avoid cutoff in SERPs.`,
          impact: 'warning'
        });
        break;
      case 'missing-meta-description':
        fixes.push({
          action: 'add_meta_description',
          field: 'meta_description',
          current: null,
          suggested: `Describe this page in 120-160 chars. Include your main keyword and a clear call to action.`,
          code: `<meta name="description" content="Describe this page in 120-160 chars. Include your main keyword.">`,
          reason: 'Missing meta description reduces click-through rate from search results.',
          impact: 'critical'
        });
        break;
      case 'short-description':
        fixes.push({
          action: 'update_meta_description',
          field: 'meta_description',
          current: pageData.metaDescription,
          suggested: `${pageData.metaDescription} Add more detail and a call to action to reach 120-160 chars.`,
          code: `<meta name="description" content="${pageData.metaDescription} Add more detail here.">`,
          reason: `Meta description is ${pageData.metaDescription.length} chars. Expand to 120-160 chars.`,
          impact: 'warning'
        });
        break;
      case 'missing-h1':
        fixes.push({
          action: 'add_h1',
          field: 'h1',
          current: null,
          suggested: pageData.title || 'Add your primary keyword as H1',
          code: `<h1>${pageData.title || 'Add your primary keyword as H1'}</h1>`,
          reason: 'No H1 tag found. Every page needs exactly one H1 with the primary keyword.',
          impact: 'critical'
        });
        break;
      case 'multiple-h1':
        fixes.push({
          action: 'remove_duplicate_h1',
          field: 'h1',
          current: pageData.h1,
          suggested: pageData.h1[0],
          reason: `Found ${pageData.h1.length} H1 tags. Keep only the first, change others to H2.`,
          impact: 'warning'
        });
        break;
      case 'missing-alt-text': {
        const missingAlt = pageData.images.filter(img => !img.hasAlt).map(img => img.src).slice(0, 5);
        fixes.push({
          action: 'add_alt_text',
          field: 'img_alt',
          current: missingAlt,
          suggested: missingAlt.map(src => ({ src, alt: 'Describe this image with keywords' })),
          code: missingAlt.map(src => `<img src="${src}" alt="Describe this image">`).join('\n'),
          reason: `${pageData.images.filter(img => !img.hasAlt).length} images missing alt text. Required for accessibility and image SEO.`,
          impact: issue.type
        });
        break;
      }
      case 'missing-viewport':
        fixes.push({
          action: 'add_viewport',
          field: 'viewport',
          current: null,
          suggested: 'width=device-width, initial-scale=1',
          code: `<meta name="viewport" content="width=device-width, initial-scale=1">`,
          reason: 'Missing viewport meta tag. Required for mobile-friendly ranking.',
          impact: 'critical'
        });
        break;
      case 'low-word-count':
        fixes.push({
          action: 'expand_content',
          field: 'word_count',
          current: pageData.wordCount,
          target: 300,
          reason: `Page has ${pageData.wordCount} words. Add at least ${300 - pageData.wordCount} more words. Thin content ranks poorly.`,
          impact: 'warning'
        });
        break;
    }
  }

  return fixes;
}

export async function auditPage(url) {
  try {
    const html = await fetchURL(url);
    const pageData = parseHTML(html);
    const { score, issues } = calculateScore(pageData);
    const fixes = generateFixes(pageData, issues);

    return {
      success: true,
      rawHtml: html,
      data: {
        url,
        score,
        grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
        pageData,
        issues,
        fixes,
        analyzedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export { fetchURL, detectSPA };

export default {
  auditPage,
  parseHTML,
  fetchURL,
  calculateScore,
  detectSPA,
};
