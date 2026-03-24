import puppeteer from 'puppeteer';

class SEOAnalyzer {
  constructor() {
    this.issues = [];
    this.pageResults = [];
    this.aggregatedScore = 0;
  }

  /**
   * Crawl entire website (multiple pages)
   * @param {string} rootUrl - Starting URL
   * @param {number} maxPages - Max pages to crawl (free:10, pro:50, agency:500)
   * @returns {Object} Site-wide audit report
   */
  async crawlSite(rootUrl, maxPages = 10) {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const visitedUrls = new Set();
      const urlsToVisit = [rootUrl];
      const results = [];

      while (urlsToVisit.length > 0 && results.length < maxPages) {
        const url = urlsToVisit.shift();
        if (visitedUrls.has(url)) continue;
        visitedUrls.add(url);

        try {
          const pageResult = await this.analyzeSinglePage(browser, url);
          results.push(pageResult);

          // Extract internal links for crawling
          if (results.length < maxPages) {
            const internalLinks = await this.extractInternalLinks(browser, url, rootUrl);
            internalLinks.forEach(link => {
              if (!visitedUrls.has(link) && results.length < maxPages) {
                urlsToVisit.push(link);
              }
            });
          }
        } catch (err) {
          console.error(`Error analyzing ${url}:`, err.message);
        }
      }

      await browser.close();

      // Aggregate results
      return this.aggregateResults(results, rootUrl);
    } catch (error) {
      if (browser) await browser.close();
      throw new Error(`Failed to crawl site: ${error.message}`);
    }
  }

  /**
   * Analyze single page (used by extension or single page audit)
   * @param {string} url - Page URL
   * @returns {Object} Single page audit result
   */
  async analyze(url) {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const result = await this.analyzeSinglePage(browser, url);
      await browser.close();

      return result;
    } catch (error) {
      if (browser) await browser.close();
      throw new Error(`Failed to analyze ${url}: ${error.message}`);
    }
  }

  /**
   * Core analysis logic for a single page
   */
  async analyzeSinglePage(browser, url) {
    const page = await browser.newPage();

    try {
      // Set viewport for mobile-friendly test
      await page.setViewport({ width: 375, height: 812 });
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Take screenshot for report visualization
      const screenshotBuffer = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 80 });
      const screenshotBase64 = screenshotBuffer.toString('base64');

      // Gather all page data with CSS selectors
      const pageData = await page.evaluate(() => {
        // Helper function to get unique CSS selector
        function getSelectorFor(el) {
          if (!el || !el.parentElement) return null;
          if (el.id) return `#${CSS.escape(el.id)}`;

          const parts = [];
          let node = el;

          while (node && node.nodeType === Node.ELEMENT_NODE && node.tagName.toUpperCase() !== 'HTML') {
            let part = node.tagName.toLowerCase();

            if (node.id) {
              parts.unshift(`#${CSS.escape(node.id)}`);
              break;
            }

            const siblings = Array.from(node.parentElement?.children || [])
              .filter(s => s.tagName === node.tagName);

            if (siblings.length > 1) {
              const index = siblings.indexOf(node) + 1;
              part += `:nth-of-type(${index})`;
            }

            parts.unshift(part);
            node = node.parentElement;
          }

          return parts.join(' > ');
        }

        // Collect all data with selectors
        const titleTag = document.querySelector('title');
        const metaDescription = document.querySelector('meta[name="description"]');
        const h1Tags = document.querySelectorAll('h1');
        const h2Tags = document.querySelectorAll('h2');
        const images = document.querySelectorAll('img');
        const links = document.querySelectorAll('a[href]');
        const viewport = document.querySelector('meta[name="viewport"]');
        const canonical = document.querySelector('link[rel="canonical"]');
        const ogTitle = document.querySelector('meta[property="og:title"]');
        const ogDescription = document.querySelector('meta[property="og:description"]');
        const ogImage = document.querySelector('meta[property="og:image"]');
        const twitterCard = document.querySelector('meta[name="twitter:card"]');
        const charset = document.querySelector('meta[charset]');

        // Structure data with selectors
        return {
          title: titleTag?.innerText || '',
          description: metaDescription?.content || '',
          h1Count: h1Tags.length,
          h1s: Array.from(h1Tags).map((h, i) => ({
            text: h.innerText,
            selector: getSelectorFor(h),
          })),
          h2Count: h2Tags.length,
          images: Array.from(images).map((img, i) => ({
            src: img.src,
            alt: img.alt,
            width: img.width,
            height: img.height,
            hasAlt: !!img.alt && img.alt.trim().length > 0,
            selector: getSelectorFor(img),
          })),
          links: Array.from(links).map(link => ({
            href: link.href,
            rel: link.rel,
            hasNoopener: link.rel.includes('noopener'),
            isExternal: !link.href.includes(window.location.hostname),
            selector: getSelectorFor(link),
          })),
          hasViewport: !!viewport,
          hasCanonical: !!canonical,
          canonicalUrl: canonical?.href || null,
          hasOG: { title: !!ogTitle, description: !!ogDescription, image: !!ogImage },
          hasTwitterCard: !!twitterCard,
          hasCharset: !!charset,
          pageTitle: document.title,
          contentLength: document.body.innerText.length,
        };
      });

      // Analyze data and generate issues
      const issues = this.generateIssues(pageData, url);
      const score = this.calculateScore(issues);
      const metrics = await page.metrics();

      await page.close();

      return {
        url,
        score,
        grade: this.getGrade(score),
        pageData,
        issues,
        screenshotBase64,
        performedAt: new Date().toISOString(),
        performance: {
          loadTime: Math.round(metrics.JSHeapUsedSize || 0),
          firstContentfulPaint: Math.round(metrics.FirstMeaningfulPaint || 0),
        }
      };
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  /**
   * Generate issues with full structure (id, type, category, etc.)
   */
  generateIssues(pageData, url) {
    const issues = [];
    let id = 0;

    // 1. Title tag checks
    if (!pageData.title) {
      issues.push(this.createIssue(id++, 'critical', 'On-Page',
        'Page has no title tag',
        'Google uses your title tag to understand what your page is about. Without one, your page is unlikely to rank well.',
        'Add a descriptive title tag inside your <head>.',
        '<title>Your Keyword - Your Brand</title>',
        null,
        15
      ));
    } else if (pageData.title.length < 30) {
      issues.push(this.createIssue(id++, 'warning', 'On-Page',
        `Title too short (${pageData.title.length} chars, should be 50-60)`,
        'Titles shorter than 50 characters may not fully display in Google search results.',
        `Expand your title to 50-60 characters. Current: "${pageData.title}"`,
        '<title>Better, Longer Title Tag With Keywords (50-60 chars)</title>',
        null,
        8
      ));
    } else if (pageData.title.length > 60) {
      issues.push(this.createIssue(id++, 'warning', 'On-Page',
        `Title too long (${pageData.title.length} chars, should be 50-60)`,
        'Titles longer than 60 characters get truncated in Google search results.',
        `Shorten your title to 50-60 characters. Current: "${pageData.title}"`,
        '<title>Shorter Title Tag With Keywords (50-60 chars)</title>',
        null,
        5
      ));
    }

    // 2. Meta description checks
    if (!pageData.description) {
      issues.push(this.createIssue(id++, 'critical', 'On-Page',
        'Missing meta description',
        'Google displays the meta description under your page title in search results. Without one, Google picks random text from your page.',
        'Write a 150-160 character summary of what this page is about.',
        '<meta name="description" content="A 150-160 character description that summarizes your page content clearly.">',
        null,
        15
      ));
    } else if (pageData.description.length < 120) {
      issues.push(this.createIssue(id++, 'warning', 'On-Page',
        `Meta description too short (${pageData.description.length} chars, should be 150-160)`,
        'Descriptions shorter than 150 characters miss opportunities to persuade users to click.',
        `Expand your description to 150-160 characters. Current: "${pageData.description}"`,
        '<meta name="description" content="This is a longer description (150-160 chars) that fully explains page content">',
        null,
        5
      ));
    } else if (pageData.description.length > 160) {
      issues.push(this.createIssue(id++, 'warning', 'On-Page',
        `Meta description too long (${pageData.description.length} chars, should be 150-160)`,
        'Descriptions longer than 160 characters get truncated in Google search results.',
        `Shorten your description to 150-160 characters. Current length: ${pageData.description.length}`,
        '<meta name="description" content="Shorter description (150-160 chars) that is more focused">',
        null,
        3
      ));
    }

    // 3. H1 tag checks
    if (pageData.h1Count === 0) {
      issues.push(this.createIssue(id++, 'critical', 'On-Page',
        'Missing H1 tag',
        'Every page needs exactly one H1 tag. It tells Google what the main topic of the page is.',
        'Add one H1 tag at the beginning of your page content with your main keyword.',
        '<h1>Your Main Topic or Keyword Here</h1>',
        null,
        15
      ));
    } else if (pageData.h1Count > 1) {
      issues.push(this.createIssue(id++, 'warning', 'On-Page',
        `Multiple H1 tags found (${pageData.h1Count})`,
        'Google expects exactly one H1 per page. Multiple H1s confuse search engines about your page topic.',
        `You have ${pageData.h1Count} H1 tags. Remove all but one, keeping the one with your main keyword.`,
        '<h1>Keep only one H1 per page</h1>',
        null,
        8
      ));
    } else {
      // One good H1 exists
      issues.push(this.createIssue(id++, 'info', 'On-Page',
        '✓ One H1 tag present',
        'Good: Your page has exactly one H1 tag.',
        '',
        '',
        null,
        -5
      ));
    }

    // 4. Images without alt text
    const imagesWithoutAlt = pageData.images.filter(img => !img.hasAlt);
    if (imagesWithoutAlt.length > 0) {
      imagesWithoutAlt.forEach((img, idx) => {
        issues.push(this.createIssue(id++, 'warning', 'Accessibility',
          `Image missing alt text: ${img.src.split('/').pop() || 'image'}`,
          'Google cannot see images — it reads the alt text to understand what your image shows. This also helps visually impaired users.',
          `Add descriptive alt text to: ${img.src}`,
          `<img src="${img.src}" alt="Descriptive text about what this image shows">`,
          img.selector,
          5
        ));
      });
    }

    // 5. Images without dimensions
    const imagesWithoutDims = pageData.images.filter(img => !img.width || !img.height);
    if (imagesWithoutDims.length > 0) {
      imagesWithoutDims.forEach((img, idx) => {
        issues.push(this.createIssue(id++, 'info', 'Performance',
          `Image missing width/height: ${img.src.split('/').pop()}`,
          'Specifying image dimensions prevents layout shift, which improves Core Web Vitals.',
          `Add width and height attributes to your images`,
          `<img src="${img.src}" alt="..." width="800" height="600">`,
          img.selector,
          2
        ));
      });
    }

    // 6. Mobile viewport
    if (!pageData.hasViewport) {
      issues.push(this.createIssue(id++, 'critical', 'Mobile',
        'Missing viewport meta tag',
        'Without viewport meta tag, your site won\'t display correctly on mobile devices. Google prioritizes mobile-friendly sites.',
        'Add this line to your <head> section',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
        null,
        15
      ));
    }

    // 7. Canonical tag
    if (!pageData.hasCanonical) {
      issues.push(this.createIssue(id++, 'warning', 'Technical',
        'Missing canonical tag',
        'Canonical tags tell Google which version of a page is the "main" version if you have duplicate content.',
        'Add a self-referencing canonical tag (recommended for all sites)',
        `<link rel="canonical" href="${url}">`,
        null,
        5
      ));
    }

    // 8. Open Graph tags
    if (!pageData.hasOG.title) {
      issues.push(this.createIssue(id++, 'info', 'Social',
        'Missing Open Graph title tag',
        'Open Graph tags control how your page appears when shared on Facebook, Twitter, LinkedIn, etc.',
        'Add Open Graph tags for better social sharing',
        '<meta property="og:title" content="Your Page Title">',
        null,
        3
      ));
    }

    // 9. Twitter Card
    if (!pageData.hasTwitterCard) {
      issues.push(this.createIssue(id++, 'info', 'Social',
        'Missing Twitter Card tag',
        'Twitter Card tags make your content look better when shared on Twitter.',
        'Add Twitter Card meta tag',
        '<meta name="twitter:card" content="summary_large_image">',
        null,
        2
      ));
    }

    // 10. Charset
    if (!pageData.hasCharset) {
      issues.push(this.createIssue(id++, 'info', 'Technical',
        'Missing charset declaration',
        'Charset tells browsers how to decode your page. UTF-8 is the standard.',
        'Add charset to your <head>',
        '<meta charset="utf-8">',
        null,
        1
      ));
    }

    // 11. Heading hierarchy (H2 after H1)
    if (pageData.h1Count > 0 && pageData.h2Count === 0) {
      issues.push(this.createIssue(id++, 'warning', 'On-Page',
        'No H2 tags found',
        'H2 tags help organize your content and make it easier for Google to understand page structure.',
        'Add H2 tags to break up your content into sections',
        '<h2>Section Heading Here</h2>',
        null,
        5
      ));
    }

    // 12. External links without rel="noopener"
    const externalLinksWithoutNoopener = pageData.links.filter(link => link.isExternal && !link.hasNoopener);
    if (externalLinksWithoutNoopener.length > 0) {
      issues.push(this.createIssue(id++, 'info', 'Technical',
        `${externalLinksWithoutNoopener.length} external links missing rel="noopener"`,
        'rel="noopener" prevents external sites from accessing your page object and improves security.',
        `Add rel="noopener" to all external links`,
        '<a href="https://external-site.com" rel="noopener">Link Text</a>',
        null,
        2
      ));
    }

    return issues;
  }

  /**
   * Create structured issue object
   */
  createIssue(id, type, category, issue, detail, suggestion, fixExample, selector, affectsScore) {
    return {
      id: `${category.toLowerCase().replace(/\s+/g, '-')}-${id}`,
      type,
      category,
      issue,
      detail,
      suggestion,
      fixExample,
      selector,
      elementInfo: {},
      affectsScore: affectsScore || 0,
    };
  }

  /**
   * Calculate overall score
   */
  calculateScore(issues) {
    let score = 100;
    issues.forEach(issue => {
      score += issue.affectsScore;
    });
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get letter grade (A-F)
   */
  getGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 60) return 'C';
    if (score >= 45) return 'D';
    return 'F';
  }

  /**
   * Extract internal links for crawling
   */
  async extractInternalLinks(browser, url, rootDomain) {
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href]'))
          .map(a => a.href)
          .filter(href => href && href.startsWith('http'));
      });

      const internalLinks = links.filter(link => {
        try {
          const urlObj = new URL(link);
          const rootObj = new URL(rootDomain);
          return urlObj.hostname === rootObj.hostname;
        } catch {
          return false;
        }
      });

      await page.close();
      return [...new Set(internalLinks)]; // Remove duplicates
    } catch (error) {
      await page.close();
      return [];
    }
  }

  /**
   * Aggregate results from multiple pages
   */
  aggregateResults(pageResults, rootUrl) {
    const allIssues = [];
    const issuesByPage = {};

    pageResults.forEach(result => {
      allIssues.push(...result.issues);
      issuesByPage[result.url] = {
        score: result.score,
        grade: result.grade,
        issues: result.issues,
      };
    });

    // Calculate site-wide score
    const avgScore = Math.round(
      pageResults.reduce((sum, r) => sum + r.score, 0) / pageResults.length
    );

    const criticalCount = allIssues.filter(i => i.type === 'critical').length;
    const warningCount = allIssues.filter(i => i.type === 'warning').length;

    return {
      url: rootUrl,
      score: avgScore,
      grade: this.getGrade(avgScore),
      pagesCrawled: pageResults.length,
      issuesSummary: {
        critical: criticalCount,
        warning: warningCount,
        info: allIssues.filter(i => i.type === 'info').length,
      },
      issues: allIssues,
      pageResults,
      issuesByPage,
      performedAt: new Date().toISOString(),
    };
  }
}

export default SEOAnalyzer;
