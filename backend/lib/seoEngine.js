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

  // Headings (h1-h6)
  for (let i = 1; i <= 6; i++) {
    const regex = new RegExp(`<h${i}[^>]*>([^<]+)<\\/h${i}>`, 'gi');
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
    const httpModule = isHttps ? https : https; // Force HTTPS

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      timeout: DEFAULT_TIMEOUT,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
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

export async function auditPage(url) {
  try {
    const html = await fetchURL(url);
    const pageData = parseHTML(html);
    const { score, issues } = calculateScore(pageData);

    return {
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
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export { fetchURL };

export default {
  auditPage,
  parseHTML,
  fetchURL,
  calculateScore,
};
