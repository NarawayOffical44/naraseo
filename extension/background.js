/**
 * SEO AI — Background Service Worker (Agent Mode)
 *
 * Behaves as a persistent SEO agent:
 *  - Auto-audits every page the user visits (silently, in background)
 *  - Shows grade badge on the icon for every tab
 *  - Restores badge when switching tabs
 *  - Periodic hourly re-audit of the active tab
 *  - Daily reminder notification
 *  - Keyboard shortcut (Ctrl+Shift+S) opens sidebar
 *  - Notification click opens sidebar
 */

// Load scorer for client-side audit scoring (avoids server round-trip)
importScripts('lib/scorer.js');

// API URL - uses production URL, falls back to localhost for development
const API_URL = (typeof PROD_API_URL !== 'undefined' && PROD_API_URL)
  ? PROD_API_URL
  : 'https://naraseoai.onrender.com';

// Domains that should never be auto-audited (search engines, social, apps, etc.)
const SKIP_AUDIT_DOMAINS = new Set([
  'google.com', 'google.co.uk', 'google.in', 'google.ca', 'google.com.au',
  'bing.com', 'yahoo.com', 'duckduckgo.com', 'baidu.com', 'yandex.com',
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com',
  'youtube.com', 'reddit.com', 'tiktok.com', 'pinterest.com', 'whatsapp.com',
  'web.whatsapp.com', 'mail.google.com', 'gmail.com', 'outlook.com',
  'claude.ai', 'chat.openai.com', 'gemini.google.com',
  'github.com', 'stackoverflow.com', 'npmjs.com',
  'localhost', '127.0.0.1',
]);

function shouldSkipUrl(url) {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== 'http:' && protocol !== 'https:') return true;
    const bare = hostname.replace(/^www\./, '');
    return SKIP_AUDIT_DOMAINS.has(bare) || SKIP_AUDIT_DOMAINS.has(hostname);
  } catch { return true; }
}

// ── On Install ───────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  console.log('✓ SEO AI agent installed');

  chrome.action.setBadgeText({ text: '' });

  // Right-click context menu
  chrome.contextMenus.create({
    id: 'audit-page',
    title: '🔍 SEO AI — Audit This Page',
    contexts: ['page'],
  });

  // Daily reminder (24h)
  chrome.alarms.get('daily-reminder', (alarm) => {
    if (!alarm) {
      chrome.alarms.create('daily-reminder', {
        delayInMinutes: 1440,
        periodInMinutes: 1440,
      });
    }
  });

  // Periodic background re-audit (every 60 min)
  chrome.alarms.get('periodic-reaudit', (alarm) => {
    if (!alarm) {
      chrome.alarms.create('periodic-reaudit', {
        delayInMinutes: 60,
        periodInMinutes: 60,
      });
    }
  });
});

// ── Icon click → open sidebar ─────────────────────────────────────────────────
chrome.action.onClicked.addListener((tab) => {
  chrome.storage.session.remove('sidebarClosed');
  if (chrome.sidePanel) chrome.sidePanel.open({ tabId: tab.id });
});

// ── Context menu → open sidebar ───────────────────────────────────────────────
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'audit-page' && chrome.sidePanel) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// ── Tab navigation — auto-audit when page fully loads ────────────────────────
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Clear badge on URL change
  if (changeInfo.url) {
    chrome.action.setBadgeText({ tabId, text: '' });
  }

  // Auto-audit when the page is fully loaded on an http(s) URL
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || !tab.url.startsWith('http')) return;
  if (shouldSkipUrl(tab.url)) return; // Skip search engines, social, etc.

  const { autoAuditEnabled } = await chrome.storage.sync.get({ autoAuditEnabled: true });
  if (!autoAuditEnabled) return;

  // Use cached result if it's fresh (< 1 hour old)
  const cacheKey = auditCacheKey(tab.url);
  const cached = await chrome.storage.local.get(cacheKey);
  const existing = cached[cacheKey];

  if (existing && (Date.now() - new Date(existing.timestamp).getTime()) < 3_600_000) {
    restoreBadge(tabId, existing.grade);
    return;
  }

  // Run a silent background audit
  backgroundAudit(tabId, tab.url);
});

// ── Tab switch — restore badge from cached audit ──────────────────────────────
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs.find(t => t.id === tabId);
  if (!tab?.url?.startsWith('http')) return;

  const cacheKey = auditCacheKey(tab.url);
  const cached = await chrome.storage.local.get(cacheKey);
  const existing = cached[cacheKey];
  if (existing?.grade) restoreBadge(tabId, existing.grade);
});

// ── Alarms ────────────────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'daily-reminder') {
    chrome.notifications.create('daily-reminder', {
      type: 'basic',
      iconUrl: 'icons/icon.svg',
      title: 'SEO AI — Daily Check',
      message: 'Your SEO agent is ready. Open any page to run an audit.',
      priority: 1,
    });
  }

  if (alarm.name === 'periodic-reaudit') {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab?.url?.startsWith('http')) {
      backgroundAudit(tab.id, tab.url);
    }
  }

  if (alarm.name === 'user-scheduled-audit') {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab?.url?.startsWith('http')) {
      await backgroundAudit(tab.id, tab.url);
      const cached = await chrome.storage.local.get('currentAudit');
      const result = cached.currentAudit;
      if (result) {
        chrome.notifications.create('scheduled-audit-complete', {
          type: 'basic',
          iconUrl: 'icons/icon.svg',
          title: `Scheduled Audit — Grade ${result.grade}`,
          message: `${new URL(result.url).hostname}\nScore: ${result.score}/100 — ${result.issues?.length || 0} issues found`,
          priority: 2,
        });
      }
    }
  }
});

// ── Notification click → open sidebar ────────────────────────────────────────
chrome.notifications.onClicked.addListener((notifId) => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab && chrome.sidePanel) chrome.sidePanel.open({ tabId: tab.id });
  });
  chrome.notifications.clear(notifId);
});

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === 'SET_BADGE') {
    const { tabId, grade } = request;
    restoreBadge(tabId, grade);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'SHOW_NOTIFICATION') {
    const { score, grade, domain } = request;
    chrome.notifications.create('audit-complete', {
      type: 'basic',
      iconUrl: 'icons/icon.svg',
      title: `Audit Complete — Grade ${grade}`,
      message: `${domain}\nSEO Score: ${score}/100`,
      priority: 1,
    });
    return true;
  }

  if (request.action === 'GET_CACHED_AUDIT') {
    const { url } = request;
    const key = auditCacheKey(url);
    chrome.storage.local.get(key, (res) => sendResponse({ result: res[key] || null }));
    return true;
  }

  if (request.action === 'RUN_AUDIT') {
    handleAudit(request.url, sender.tab?.id)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Native multi-page crawl — no Puppeteer, no server, no cost
  if (request.action === 'CRAWL_SITE') {
    const { rootUrl, maxPages = 10 } = request;
    crawlSiteNative(rootUrl, maxPages)
      .then(result => sendResponse({ success: true, result }))
      .catch(err  => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'CHAT') {
    handleChat(request.message, request.context, request.conversationHistory || [])
      .then(reply => sendResponse({ success: true, reply }))
      .catch(error => {
        console.error('Chat error:', error);
        sendResponse({ success: true, reply: `Connection error. Make sure backend is running at ${API_URL}` });
      });
    return true;
  }

  if (request.action === 'SET_SCHEDULE') {
    const SCHEDULE_INTERVALS = { daily: 1440, weekly: 10080, monthly: 43200 };
    const { frequency } = request;
    chrome.alarms.clear('user-scheduled-audit', () => {
      if (frequency && frequency !== 'off' && SCHEDULE_INTERVALS[frequency]) {
        chrome.alarms.create('user-scheduled-audit', {
          delayInMinutes: SCHEDULE_INTERVALS[frequency],
          periodInMinutes: SCHEDULE_INTERVALS[frequency],
        });
      }
      chrome.storage.local.set({ scheduleFrequency: frequency || 'off' });
      sendResponse({ success: true, frequency: frequency || 'off' });
    });
    return true;
  }
});

// ── Background auto-audit ─────────────────────────────────────────────────────
/**
 * Computation split:
 *  - DOM analysis:  content script (already on the page, instant)
 *  - Issue scoring: this service worker via scorer.js (no network, instant)
 *  - PageSpeed:     server proxy /api/pagespeed (hides API key)
 *  - AI chat:       server proxy /api/chat (hides API key)
 *
 * Server does zero computation — it is a secure key proxy only.
 */
async function backgroundAudit(tabId, url) {
  try {
    chrome.action.setBadgeText({ tabId, text: '···' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#6b7280' });

    // Step 1: Get live DOM data from content script (zero latency — page already loaded)
    let pageData = null;
    try {
      pageData = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { action: 'GET_PAGE_DATA' }, (r) => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(r || null);
        });
      });
    } catch {}

    // Step 2: Get PageSpeed data via server proxy (API key stays server-side)
    let pageSpeed = null;
    try {
      const psResp = await fetch(`${API_URL}/api/pagespeed?url=${encodeURIComponent(url)}`);
      if (psResp.ok) pageSpeed = await psResp.json();
    } catch {}

    // Step 3: Score entirely client-side — no server computation
    // If content script didn't respond (login-wall, blocked page), skip silently
    if (!pageData) {
      chrome.action.setBadgeText({ tabId, text: '' });
      return;
    }

    let result;
    if (typeof scorePageData === 'function') {
      const { score, grade, issues, categoryScores } = scorePageData(pageData, pageSpeed);
      result = {
        url, score, grade, issues, categoryScores,
        pageSpeedInsights: pageSpeed,
        dataSource: pageSpeed ? 'DOM + Google PageSpeed' : 'DOM Analysis',
        timestamp: new Date().toISOString(),
      };
    } else {
      // Fallback: server DOM-only path (sends pageData — never triggers Puppeteer)
      const resp = await fetch(`${API_URL}/api/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, pageData }), // pageData always present here
      });
      if (!resp.ok) throw new Error(`Backend ${resp.status}`);
      result = await resp.json();
    }

    const cacheKey = auditCacheKey(url);
    await chrome.storage.local.set({
      [cacheKey]: { ...result, timestamp: new Date().toISOString() },
      currentAudit: result,
    });

    restoreBadge(tabId, result.grade);
    chrome.tabs.sendMessage(tabId, { action: 'AUDIT_UPDATED', result }).catch(() => {});
    console.log(`✓ Auto-audit ${new URL(url).hostname}: ${result.score}/100 (${result.grade})`);
  } catch (error) {
    chrome.action.setBadgeText({ tabId, text: '' });
    console.log('Background audit failed:', error.message);
  }
}

// ── Fallback audit via content script ────────────────────────────────────────
async function handleAudit(url, tabId) {
  const response = await chrome.tabs.sendMessage(tabId, { action: 'ANALYZE_PAGE' });
  const pageData = response?.analysis || {};
  const issues = pageData.issues || [];
  const score = calculateScore(issues);
  const grade = getGrade(score);
  return { url, score, grade, issues, timestamp: new Date().toISOString() };
}

// ── Chat ──────────────────────────────────────────────────────────────────────
async function handleChat(message, context, conversationHistory = []) {
  const response = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context, conversationHistory }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    return `⚠️ Backend error: ${err.error || response.status}`;
  }
  const data = await response.json();
  return data.reply || 'No response from AI';
}

// ── Native site crawler (no Puppeteer) ────────────────────────────────────────
/**
 * Crawls multiple pages using fetch() + regex HTML parsing.
 * Works for all server-rendered sites. Runs entirely in the browser — free,
 * unlimited, no RAM overhead. JS-rendered SPAs will only get shell HTML.
 */
async function crawlSiteNative(rootUrl, maxPages = 25) {
  const origin  = new URL(rootUrl).origin;
  const visited = new Set();
  const queue   = [rootUrl];
  const pages   = [];

  // Batch size controls how many pages we fetch in parallel (avoids hammering server)
  const BATCH_SIZE = 5;

  while (queue.length > 0 && pages.length < maxPages) {
    // Take a batch of up to BATCH_SIZE URLs
    const batch = [];
    while (queue.length > 0 && batch.length < BATCH_SIZE && (pages.length + batch.length) < maxPages) {
      const url = queue.shift();
      if (!visited.has(url)) { visited.add(url); batch.push(url); }
    }
    if (batch.length === 0) break;

    // Fetch batch in parallel
    const batchResults = await Promise.allSettled(
      batch.map(url => fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
      }).then(async (res) => {
        if (!res.ok) return null;
        const html = await res.text();
        return { url, html };
      }).catch(() => null))
    );

    for (const r of batchResults) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      const { url, html } = r.value;
      const data = extractSEOFromHTML(html, url);

      // Score each page client-side using the shared scorer
      if (typeof scorePageData === 'function') {
        const { score, grade, issues } = scorePageData(data, null); // no PageSpeed per-page (too expensive)
        data.score = score;
        data.grade = grade;
        data.issues = issues;
      }

      pages.push(data);

      // Discover same-origin links
      if (pages.length < maxPages) {
        const linkRe = /href=["']([^"'#?\s]+)["']/gi;
        let m;
        while ((m = linkRe.exec(html)) !== null) {
          try {
            const abs = new URL(m[1], url).href;
            if (abs.startsWith(origin) && !visited.has(abs) && !queue.includes(abs)) {
              queue.push(abs);
            }
          } catch {}
        }
      }
    }

    // Small pause between batches to be a polite crawler
    if (queue.length > 0 && pages.length < maxPages) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return { pages, crawledCount: pages.length, rootUrl };
}

/** Extract SEO + GEO signals from raw HTML using regex (no DOM needed in SW) */
function extractSEOFromHTML(html, url) {
  const get  = (re)  => { const m = re.exec(html);           return m ? m[1].trim() : ''; };
  const getAll = (re) => [...html.matchAll(re)].map(m => m[1].trim());

  // ── Core SEO ───────────────────────────────────────────────────────────────
  const title     = get(/<title[^>]*>([^<]*)<\/title>/i);
  const metaDesc  = get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
                 || get(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const canonical = get(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i);
  const ogTitle   = get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i);
  const ogImage   = get(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i);
  const h1Tags    = getAll(/<h1[^>]*>([^<]*)<\/h1>/gi);
  const h2Count   = (html.match(/<h2[\s>]/gi) || []).length;
  const imgCount  = (html.match(/<img[\s>]/gi) || []).length;
  const missingAlt = (html.match(/<img(?![^>]*\balt=["'][^"']+["'])[^>]*>/gi) || []).length;
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  const hasSchema   = /application\/ld\+json/i.test(html);
  const wordCount   = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').length;

  // ── GEO / Local signals ────────────────────────────────────────────────────
  // NAP (Name, Address, Phone) detection
  const phoneMatch  = html.match(/(?:tel:|phone|ph:|call us)[^0-9]*(\+?[\d\s\-().]{7,17})/i)
                   || html.match(/(\+?1?\s*[-.]?\s*\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/);
  const phone       = phoneMatch ? phoneMatch[1].trim() : '';

  // Address patterns: street number + street name
  const addrMatch   = html.match(/(\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl))/);
  const address     = addrMatch ? addrMatch[1] : '';

  // Local business schema signals
  const schemaTypes = getAll(/"@type"\s*:\s*"([^"]+)"/g);
  const localBiz    = schemaTypes.some(t => /LocalBusiness|Restaurant|Store|Hotel|Doctor|Lawyer|Service/i.test(t));

  // City mentions in meta geo tags
  const geoRegion   = get(/<meta[^>]+name=["']geo\.region["'][^>]+content=["']([^"']*)["']/i);
  const geoPlace    = get(/<meta[^>]+name=["']geo\.placename["'][^>]+content=["']([^"']*)["']/i);

  // hreflang for international targeting
  const hreflangTags = getAll(/<link[^>]+hreflang=["']([^"']*)["'][^>]*>/gi);

  // Map embed detection (embeds map = local presence signal)
  const hasMapEmbed  = /maps\.google\.com|google\.com\/maps|maps\.googleapis/i.test(html);

  return {
    url,
    title,       titleLength: title.length,
    metaDescription: metaDesc, metaDescLength: metaDesc.length,
    h1Tags,      h2Count,
    imageCount: imgCount, imgsMissingAlt: Array(missingAlt).fill(''),
    hasViewport, hasSchema, schemaTypes,
    wordCount,   canonical,
    og: { title: ogTitle, image: ogImage },
    // GEO signals
    geo: { phone, address, localBiz, geoRegion, geoPlace, hreflangTags, hasMapEmbed },
    isServerRendered: true,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function auditCacheKey(url) {
  try { return `audit_${new URL(url).hostname}`; } catch { return `audit_${url}`; }
}

function restoreBadge(tabId, grade) {
  const colors = { A: '#22c55e', B: '#84cc16', C: '#eab308', D: '#f97316', F: '#ef4444' };
  chrome.action.setBadgeText({ tabId, text: grade || '' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: colors[grade] || '#6b7280' });
}

function calculateScore(issues) {
  if (!issues?.length) return 95;
  let score = 100;
  issues.forEach(i => {
    if (i.type === 'critical') score -= 10;
    else if (i.type === 'warning') score -= 3;
    else if (i.type === 'info') score -= 1;
  });
  return Math.max(score, 0);
}

function getGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

console.log('✓ SEO AI agent service worker loaded');
