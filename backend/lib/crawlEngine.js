/**
 * Crawl Engine - Multi-page site crawler with per-page SEO analysis
 * Uses native HTTP (no Puppeteer) for speed and low resource usage
 */

import { auditPage } from './seoEngine.js';
import https from 'https';
import { URL } from 'url';

// Parse robots.txt to check crawl-delay
async function parseRobotsTxt(domain) {
  return new Promise((resolve) => {
    const url = `https://${domain}/robots.txt`;
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          const lines = data.split('\n');
          let crawlDelay = 0;

          for (const line of lines) {
            const match = line.match(/Crawl-delay:\s*(\d+)/i);
            if (match) {
              crawlDelay = parseInt(match[1], 10) * 1000;
              break;
            }
          }

          resolve({ crawlDelay, robotsTxt: data });
        });
      })
      .on('error', () => {
        resolve({ crawlDelay: 1000, robotsTxt: '' });
      });
  });
}

// Extract links from HTML
function extractLinksFromHTML(html, baseUrl) {
  const links = new Set();
  const baseUrlObj = new URL(baseUrl);
  const baseDomain = baseUrlObj.hostname;

  const linkRegex = /<a[^>]+href=["']([^"']+)["']/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    let href = match[1];

    // Skip fragments, javascript, mailto
    if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
      continue;
    }

    // Resolve relative URLs
    try {
      if (!href.startsWith('http')) {
        href = new URL(href, baseUrl).href;
      }

      const hrefUrl = new URL(href);

      // Only include same-domain links
      if (hrefUrl.hostname === baseDomain) {
        // Remove fragment and query parameters for deduplication
        const cleanUrl = `${hrefUrl.protocol}//${hrefUrl.hostname}${hrefUrl.pathname}`;
        links.add(cleanUrl);
      }
    } catch (e) {
      // Invalid URL, skip
    }
  }

  return Array.from(links);
}

// Fetch URL with timeout
async function fetchURL(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
        if (data.length > 5000000) {
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

    req.on('error', reject);
  });
}

export async function crawlSite(startUrl, options = {}) {
  const {
    maxPages = 50,
    maxDepth = 3,
    concurrency = 3,
    respectRobots = true,
  } = options;

  try {
    const baseUrlObj = new URL(startUrl);
    const domain = baseUrlObj.hostname;

    // Check robots.txt
    const robotsInfo = respectRobots ? await parseRobotsTxt(domain) : { crawlDelay: 1000 };

    const visited = new Set();
    const toVisit = [startUrl];
    const results = [];
    const errors = [];
    let activeCrawls = 0;

    const crawlPage = async (url, depth) => {
      if (visited.has(url) || visited.size >= maxPages || depth > maxDepth) {
        return;
      }

      visited.add(url);
      activeCrawls++;

      try {
        // Fetch and audit
        const html = await fetchURL(url);
        const auditResult = await auditPage(url);

        if (auditResult.success) {
          const pageResult = {
            url,
            depth,
            status: 'ok',
            score: auditResult.data.score,
            grade: auditResult.data.grade,
            title: auditResult.data.pageData.title,
            wordCount: auditResult.data.pageData.wordCount,
            issues: auditResult.data.issues,
          };

          results.push(pageResult);

          // Extract and queue new links
          if (depth < maxDepth && visited.size < maxPages) {
            const newLinks = extractLinksFromHTML(html, url);
            for (const link of newLinks) {
              if (!visited.has(link) && toVisit.length < maxPages) {
                toVisit.push(link);
              }
            }
          }
        } else {
          errors.push({
            url,
            error: auditResult.error,
          });
        }
      } catch (error) {
        errors.push({
          url,
          error: error.message,
        });
      }

      // Respect robots.txt crawl-delay
      await new Promise(resolve => setTimeout(resolve, robotsInfo.crawlDelay));
      activeCrawls--;
    };

    // Crawl with concurrency control
    while (toVisit.length > 0 || activeCrawls > 0) {
      while (activeCrawls < concurrency && toVisit.length > 0 && visited.size < maxPages) {
        const url = toVisit.shift();
        const depth = url === startUrl ? 0 : 1;
        crawlPage(url, depth);
      }

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Calculate summary stats
    const avgScore = results.length > 0 ? Math.round(results.reduce((sum, p) => sum + p.score, 0) / results.length) : 0;
    const criticalPages = results.filter(p => p.score < 60);
    const issueFrequency = {};

    results.forEach(page => {
      page.issues.forEach(issue => {
        issueFrequency[issue.id] = (issueFrequency[issue.id] || 0) + 1;
      });
    });

    const topIssues = Object.entries(issueFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([issue, count]) => ({ issue, count, affectedPages: `${count}/${results.length}` }));

    return {
      success: true,
      data: {
        startUrl,
        domain,
        totalPagesFound: results.length,
        totalErrors: errors.length,
        pages: results,
        errors,
        summary: {
          avgScore,
          bestScore: Math.max(...results.map(p => p.score), 0),
          worstScore: Math.min(...results.map(p => p.score), 100),
          criticalPageCount: criticalPages.length,
          topIssues,
        },
        crawlTime: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export default {
  crawlSite,
  extractLinksFromHTML,
  parseRobotsTxt,
};
