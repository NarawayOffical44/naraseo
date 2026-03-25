/**
 * Naraseo AI Sidebar - Complete Analysis + Report Download
 */

// DOM refs
const btnHighlight   = document.getElementById('btn-highlight');
const btnAudit       = document.getElementById('btn-audit');
const btnAuditMain   = document.getElementById('btn-audit-main');
const btnSendSidebar = document.getElementById('btn-send-sidebar');
const btnDownload    = document.getElementById('btn-download');
const sidebarChatInput   = document.getElementById('sidebar-chat-input');
const sidebarChatMessages = document.getElementById('sidebar-chat-messages');
const fixesList      = document.getElementById('fixes-list');
const sidebarUrl     = document.getElementById('sidebar-url');

let currentAudit     = null;
let currentUrl       = '';
let currentPageTitle = '';
let pendingAuditAfterAuth = false; // set true when audit button triggers auth overlay

//  Plan limits 
const PLAN_LIMITS = {
  free:   { audits: 5,         crawlPages: 0,   history: 5,  chat: 5,  pdf: false },
  pro:    { audits: Infinity,  crawlPages: 500, history: 100, chat: Infinity, pdf: true },
  agency: { audits: Infinity,  crawlPages: Infinity, history: Infinity, chat: Infinity, pdf: true },
};
const FREE_HISTORY_LIMIT = 3;
const AUDIT_FREE_LIMIT   = PLAN_LIMITS.free.audits;

// ─── PDF REPORT TEMPLATE ──────────────────────────────────────────────────────
//  Single reusable HTML shell — sections are injected via {{placeholder}} tokens
//  Repopulate for any audit: buildReportJson() → buildReportHtml() → pdf
// ──────────────────────────────────────────────────────────────────────────────
const PDF_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SEO Audit Report — {{pageUrl}}</title>
  <style>
    /* ── Reset & Base ── */
    *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
    html { font-size:13px; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #1e293b;
      background: #f1f5f9;
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
    }

    /* ── Layout ── */
    .wrap { max-width: 900px; margin: 0 auto; padding: 28px 18px 40px; }

    /* ── Cards ── */
    .card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04);
    }
    .card-body { padding: 18px 20px; }

    /* ── Typography ── */
    strong { font-weight: 700; }
    a { color: #2563eb; text-decoration: none; }

    /* ── Tables ── */
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; vertical-align: top; }

    /* ── Page breaks ── */
    .pb-before { page-break-before: always; break-before: page; }
    .pb-avoid  { page-break-inside: avoid; break-inside: avoid; }

    /* ── Print overrides ── */
    @media print {
      body    { background: #ffffff; font-size: 11px; }
      .wrap   { padding: 0; max-width: 100%; }
      .card   {
        border-radius: 8px;
        box-shadow: none;
        border: 1px solid #cbd5e1;
        margin-bottom: 10px;
        break-inside: avoid;
      }
      .card-body { padding: 12px 14px; }
      .no-print  { display: none !important; }
    }
  </style>
</head>
<body>
<div class="wrap">

{{headerSection}}

{{executiveSummarySection}}

{{scoreBreakdownSection}}

<div class="pb-before"></div>

{{onPageAnalysisSection}}

{{technicalAnalysisSection}}

{{localSeoSection}}

<div class="pb-before"></div>

{{issuesSection}}

{{actionPlanSection}}

{{keywordsSection}}

{{businessImpactSection}}

{{offPageSection}}

{{recommendationsSection}}

{{footerSection}}

</div>
</body>
</html>`;

//  HELPER: Populate PDF template with data 
function populatePdfTemplate(data) {
  let html = PDF_TEMPLATE;

  // Replace all placeholders with actual data
  Object.keys(data).forEach(key => {
    const placeholder = new RegExp(`{{${key}}}`, 'g');
    html = html.replace(placeholder, data[key] || '');
  });

  return html;
}

//  CREDITS / USAGE TRACKING 
async function getUsageThisMonth() {
  const monthKey = `usage_${new Date().toISOString().substring(0, 7)}`; // YYYY-MM
  const stored = await chrome.storage.local.get(monthKey);
  return { count: stored[monthKey] || 0, key: monthKey };
}

async function checkAndShowUsage() {
  const usage = await getUsageThisMonth();
  const remaining = AUDIT_FREE_LIMIT - usage.count;
  updateCreditsChip(remaining);
  return remaining > 0;
}

// Returns true if increment succeeded, false if limit hit server-side
async function incrementAuditCount() {
  const { authToken } = await chrome.storage.local.get('authToken');

  if (authToken) {
    try {
      const response = await fetch('https://naraseoai.onrender.com/api/usage/increment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (response.status === 429) {
        // Server-side limit enforced — block here even if client thinks it's ok
        const { error, auditLimit, plan } = await response.json();
        addChatMessage(
          `**Audit limit reached** — ${auditLimit} audits/month on ${plan} plan.\n\nUpgrade to Pro for unlimited audits.`,
          'ai', true
        );
        return false;
      }

      if (response.ok) {
        const { auditsThisMonth } = await response.json();
        // Sync local chip with server count
        const planLimits = { free: 5, pro: Infinity, agency: Infinity };
        const { userPlan = 'free' } = await chrome.storage.local.get('userPlan');
        const limit = planLimits[userPlan] || AUDIT_FREE_LIMIT;
        const remaining = limit === Infinity ? 9999 : Math.max(0, limit - auditsThisMonth);
        updateCreditsChip(remaining);
        return true;
      }
    } catch (err) {
      console.error('Failed to increment on server:', err);
      // Network error — fall through to local increment
    }
  }

  // Fallback: Local increment (offline / unauthenticated)
  const usage = await getUsageThisMonth();
  await chrome.storage.local.set({ [usage.key]: usage.count + 1 });
  const remaining = Math.max(0, AUDIT_FREE_LIMIT - (usage.count + 1));
  updateCreditsChip(remaining);
  return true;
}

function updateCreditsChip(remaining) {
  const chip = document.getElementById('credits-chip');
  if (chip) {
    if (remaining <= 0) {
      chip.textContent = '0 left';
      chip.className = 'credits-chip empty';
    } else if (remaining === 1) {
      chip.textContent = `1/${AUDIT_FREE_LIMIT}`;
      chip.className = 'credits-chip low';
    } else {
      chip.textContent = `${remaining}/${AUDIT_FREE_LIMIT}`;
      chip.className = 'credits-chip';
    }
  }
  // Also update usage bar inside score container (shown post-audit)
  const usageText = document.getElementById('usage-text');
  const usageBar  = document.getElementById('score-usage-bar');
  const used = AUDIT_FREE_LIMIT - remaining;
  if (usageText) usageText.textContent = `${used} of ${AUDIT_FREE_LIMIT} free audits used this month`;
  if (usageBar) usageBar.style.display = remaining <= 0 ? 'flex' : (used > 0 ? 'flex' : 'none');
}

//  INIT 
document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    currentUrl = new URL(tab.url).hostname;
    // Show page title in topbar + score-domain, fall back to hostname
    currentPageTitle = tab.title ? tab.title.split('|')[0].split('–')[0].trim() : currentUrl;
    const truncated  = currentPageTitle.length > 40 ? currentPageTitle.substring(0, 38) + '…' : currentPageTitle;
    sidebarUrl.textContent = truncated;
    document.getElementById('score-domain').textContent = truncated;
  } catch {}

  // Load cached audit into memory but don't auto-show results.
  // The welcome screen is always first — user runs audit explicitly.
  chrome.storage.local.get(['currentAudit'], (result) => {
    if (result.currentAudit) {
      currentAudit = result.currentAudit;
      // Show a subtle "view last audit" indicator if cached result exists
      const prevBtn = document.getElementById('btn-view-last-audit');
      if (prevBtn) prevBtn.style.display = 'block';
    }
  });

  // Populate page context strips
  const ctxUrlEl = document.getElementById('ctx-url');
  const chatPageUrl = document.getElementById('chat-page-url');
  if (ctxUrlEl) ctxUrlEl.textContent = currentUrl || 'Loading page...';
  if (chatPageUrl) chatPageUrl.textContent = currentUrl || 'Current page';

  //  Right nav (no inline onclick — all wired here) 
  document.getElementById('rnav-home')?.addEventListener('click', () => switchView('home'));
  document.getElementById('rnav-chat')?.addEventListener('click', () => switchView('chat'));
  document.getElementById('rnav-fixes')?.addEventListener('click', () => switchView('fixes'));
  document.getElementById('rnav-account')?.addEventListener('click', () => switchView('account'));
  document.getElementById('rnav-schedulers')?.addEventListener('click', () => switchView('schedulers'));
  document.getElementById('rnav-history')?.addEventListener('click', openHistoryPanel);
  document.getElementById('rnav-report')?.addEventListener('click', downloadReport);

  //  Action buttons 
  btnAuditMain?.addEventListener('click', runAudit);
  btnAudit?.addEventListener('click', runAudit);
  document.getElementById('btn-apply-fixes')?.addEventListener('click', applyQuickFixes);
  document.getElementById('btn-audit-ctx')?.addEventListener('click', runAudit);
  document.getElementById('btn-audit-featured')?.addEventListener('click', runAudit);
  btnHighlight?.addEventListener('click', highlightIssues);
  btnDownload?.addEventListener('click', downloadReport);
  btnSendSidebar?.addEventListener('click', sendChatMessage);
  sidebarChatInput?.addEventListener('keypress', e => { if (e.key === 'Enter') sendChatMessage(); });

  //  History panel 
  document.getElementById('btn-history')?.addEventListener('click', openHistoryPanel);
  document.getElementById('btn-close-history')?.addEventListener('click', closeHistoryPanel);
  document.getElementById('history-backdrop')?.addEventListener('click', closeHistoryPanel);

  //  Geo-Grid panel 
  document.getElementById('btn-open-geo')?.addEventListener('click', openGeoPanel);
  document.getElementById('btn-close-geo')?.addEventListener('click', closeGeoPanel);
  document.getElementById('geo-backdrop')?.addEventListener('click', closeGeoPanel);
  document.getElementById('geo-form')?.addEventListener('submit', runGeoGrid);
  document.getElementById('btn-geo-rerun')?.addEventListener('click', () => {
    document.getElementById('geo-results').style.display  = 'none';
    document.getElementById('geo-form').style.display     = 'flex';
  });
  document.getElementById('btn-geo-locate')?.addEventListener('click', useMyLocation);

  //  Auth overlay (audit-auth-overlay)
  document.getElementById('audit-auth-close-btn')?.addEventListener('click', closeAuditAuthOverlay);
  document.getElementById('overlay-btn-login')?.addEventListener('click',  () => showOverlayForm('login'));
  document.getElementById('overlay-btn-signup')?.addEventListener('click', () => showOverlayForm('signup'));
  document.getElementById('overlay-login-form')?.addEventListener('submit',  handleOverlayLogin);
  document.getElementById('overlay-signup-form')?.addEventListener('submit', handleOverlaySignup);

  //  Account tab auth gate
  document.getElementById('btn-show-login')?.addEventListener('click',  () => showAuthForm('login'));
  document.getElementById('btn-show-signup')?.addEventListener('click', () => showAuthForm('signup'));
  document.getElementById('login-form')?.addEventListener('submit',  handleLogin);
  document.getElementById('signup-form')?.addEventListener('submit', handleSignup);

  // Load persisted chat history
  loadChatHistory();

  // Load history badge count
  refreshHistoryBadge();

  // Show current credit usage
  checkAndShowUsage();

  // Init auth state
  initAuth();

  // Listen for background agent audit updates (auto-audit completed)
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'AUDIT_UPDATED' && request.result) {
      const prev = currentAudit?.score;
      currentAudit = request.result;
      chrome.storage.local.set({ currentAudit });
      // Show results if score changed significantly (>5 pts) or no previous audit
      if (!prev || Math.abs(prev - request.result.score) > 5) {
        showResults();
      } else {
        updateOverallScore();
        updateIssueCounts();
      }
    }
  });

  // Check for a cached background audit for this tab
  chrome.runtime.sendMessage({ action: 'GET_CACHED_AUDIT', url: tab.url }, (res) => {
    if (res?.result && !currentAudit) {
      currentAudit = res.result;
      showResults();
    }
  });
});

//  VIEW SWITCHING (right-nav icon bar)
function switchView(name) {
  ['home','chat','fixes','account','schedulers'].forEach(v => {
    document.getElementById(`rnav-${v}`)?.classList.toggle('active', v === name);
  });
  document.querySelectorAll('.panel-view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(`view-${name}`);
  if (target) target.classList.add('active');
  // Show/hide chat input based on view
  const chatBar = document.getElementById('chat-bottom-bar');
  if (chatBar) chatBar.style.display = name === 'chat' ? 'flex' : 'none';
  if (name === 'chat') setTimeout(() => sidebarChatInput?.focus(), 100);
  if (name === 'schedulers') loadSchedulersView();
}
function switchTab(name) { switchView(name); }

// Quick chat shortcut from bottom chips
function quickChat(text) {
  switchView('chat');
  if (sidebarChatInput) {
    sidebarChatInput.value = text;
    setTimeout(() => sendChatMessage(), 100);
  }
}

//  Expose to global scope for inline HTML onclick handlers
// NOTE: function declarations are hoisted so these names are already defined.
// Assign directly (no wrappers) to avoid self-reference loops.
window.switchView           = switchView;
window.quickChat            = quickChat;
window.clearChatHistory     = clearChatHistory;
window.openCheckout         = openCheckout;
window.showAuthForm         = showAuthForm;
window.handleLogin          = handleLogin;
window.handleSignup         = handleSignup;
window.handleLogout         = handleLogout;
window.handleForgotPassword = handleForgotPassword;
window.refreshPlanStatus    = refreshPlanStatus;
window.openPrivacyPolicy    = () => chrome.tabs.create({ url: 'https://seoai.app/privacy' });
window.openSupport          = () => chrome.tabs.create({ url: 'https://seoai.app/support' });
window.openChangelog        = () => chrome.tabs.create({ url: 'https://seoai.app/changelog' });

//  SHOW RESULTS 
function showResults() {
  switchView('home');
  const preAuditEl = document.getElementById('pre-audit-state') || document.querySelector('.sider-welcome');
  if (preAuditEl) preAuditEl.style.display = 'none';
  document.getElementById('audit-loading').style.display  = 'none';
  document.getElementById('audit-results').style.display  = 'flex';
  document.getElementById('audit-results').style.flexDirection = 'column';
  document.getElementById('audit-results').style.gap = '12px';

  // Show report download buttons now that audit data is available
  const btnDl = document.getElementById('btn-download');
  const rnavRpt = document.getElementById('rnav-report');
  if (btnDl) btnDl.style.display = '';
  if (rnavRpt) rnavRpt.style.display = '';

  updateOverallScore();
  updatePillars();
  updateIssueCounts();
  renderSerpPreview();
  updateOnPageBreakdown();
  updateTechnicalBreakdown();
  updateWebVitals();
  updateLighthouse();
  renderPriorityActions();

  // INJECT VISUAL OVERLAYS ON PAGE (red/orange boxes)
  highlightIssues();

  // Load local/GEO SEO data from content script (non-blocking)
  loadLocalSEOData();

  // Load rich visual page data (heading tree, content, images, links)
  loadPageDetails();

  // Auto-run keyword research as part of full audit (non-blocking)
  setTimeout(() => runKeywordResearch(), 800);
}

//  OVERALL SCORE 
function updateOverallScore() {
  const score = currentAudit.score || 0;
  const grade = currentAudit.grade || '--';

  animateNumber('summary-score', score);
  document.getElementById('summary-grade').textContent = grade;
  document.getElementById('score-domain').textContent = currentPageTitle || currentUrl;

  const circumference = 2 * Math.PI * 60;
  const target = (score / 100) * circumference;
  setTimeout(() => {
    const el = document.getElementById('gauge-progress');
    if (el) el.style.strokeDasharray = `${target} ${circumference}`;
  }, 100);
}

function animateNumber(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let current = 0;
  const step = target / 40;
  const interval = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = Math.round(current);
    if (current >= target) clearInterval(interval);
  }, 30);
}

//  SERP & SOCIAL PREVIEW 
function renderSerpPreview() {
  const section = document.getElementById('preview-section');
  const body    = document.getElementById('preview-body');
  if (!section || !body || !currentAudit) return;

  const d     = currentAudit;
  const title = d.title || d.analysis?.title || '';
  const meta  = d.metaDescription || d.analysis?.metaDesc || '';
  const url   = currentUrl || '';
  const ogImg = d.ogImage || d.analysis?.ogImage || '';
  const ogTitle = d.ogTitle || d.analysis?.ogTitle || title;
  const ogDesc  = d.ogDescription || d.analysis?.ogDesc || meta;

  // Character warnings
  const titleLen = title.length;
  const metaLen  = meta.length;
  const titleWarn  = titleLen === 0 ? 'missing' : titleLen < 30 ? 'short' : titleLen > 60 ? 'long' : 'ok';
  const metaWarn   = metaLen  === 0 ? 'missing' : metaLen  < 120 ? 'short' : metaLen  > 160 ? 'long' : 'ok';

  const titleColor = titleWarn === 'ok' ? '#16a34a' : titleWarn === 'missing' ? '#dc2626' : '#d97706';
  const metaColor  = metaWarn  === 'ok' ? '#16a34a' : metaWarn  === 'missing' ? '#dc2626' : '#d97706';

  const titleDisplay = title   || '(No title tag)';
  const metaDisplay  = meta    || '(No meta description)';
  const truncTitle   = titleDisplay.length > 60  ? titleDisplay.substring(0, 57) + '…' : titleDisplay;
  const truncMeta    = metaDisplay.length  > 155 ? metaDisplay.substring(0, 152) + '…'  : metaDisplay;

  body.innerHTML = `
    <!-- Google SERP Snippet Preview -->
    <div class="serp-preview-wrap">
      <div class="serp-preview-label">Google Search Preview</div>
      <div class="serp-box">
        <div class="serp-site-row">
          <div class="serp-favicon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5f6368" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
          </div>
          <div>
            <div class="serp-site-name">${escapeHtml(currentPageTitle || url)}</div>
            <div class="serp-url">https://${escapeHtml(url)}</div>
          </div>
        </div>
        <div class="serp-title">${escapeHtml(truncTitle)}</div>
        <div class="serp-desc">${escapeHtml(truncMeta)}</div>
      </div>
      <div class="serp-char-row">
        <span class="serp-char-badge" style="color:${titleColor}">
          Title: ${titleLen}/60 ${titleWarn !== 'ok' ? `— ${titleWarn}` : ''}
        </span>
        <span class="serp-char-badge" style="color:${metaColor}">
          Meta: ${metaLen}/155 ${metaWarn !== 'ok' ? `— ${metaWarn}` : ''}
        </span>
      </div>
    </div>

    <!-- Social / OG Card Preview -->
    <div class="social-preview-wrap">
      <div class="serp-preview-label">Social Share Preview (OG)</div>
      <div class="social-card ${ogImg ? '' : 'social-card-no-img'}">
        ${ogImg ? `<div class="social-card-img"><img src="${escapeAttr(ogImg)}" alt="OG Image" onerror="this.parentElement.style.display='none'" /></div>` : `<div class="social-card-img-placeholder"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>No OG image</span></div>`}
        <div class="social-card-body">
          <div class="social-card-domain">${escapeHtml(url)}</div>
          <div class="social-card-title">${escapeHtml(ogTitle || '(No OG title)')}</div>
          <div class="social-card-desc">${escapeHtml((ogDesc || '').substring(0, 120) || '(No OG description)')}</div>
        </div>
      </div>
      ${!ogImg ? `<div class="serp-char-badge" style="color:#dc2626;display:block;margin-top:6px;"> No OG image — social shares will show a blank card</div>` : ''}
    </div>
  `;

  section.style.display = 'block';
}

//  3 PILLARS 
function updatePillars() {
  const issues = currentAudit.issues || [];

  // On-Page score: based on on-page checks
  const onPageChecks = ['title','meta','h1','images','canonical','og','links','content'];
  const onPageIssues = issues.filter(i => isOnPageIssue(i));
  const onPageScore  = calcPillarScore(onPageIssues, 8);

  // Technical score: from Page Speed API or fallback from tech issues
  const ps = currentAudit.pageSpeedInsights;
  const techScore = ps?.performanceScore != null
    ? Math.round((ps.performanceScore + (ps.seoScore || 80)) / 2)
    : calcPillarScore(issues.filter(i => isTechnicalIssue(i)), 6);

  // Off-page: no data yet — async fetch in background
  const offPageScore = currentAudit._offPage?.pageRank != null
    ? Math.min(100, currentAudit._offPage.pageRank * 10)
    : null;

  setPillar('onpage',   onPageScore,  onPageScore != null);
  setPillar('technical', techScore,   techScore != null);
  setPillar('offpage',  offPageScore, offPageScore != null);

  // Store for report
  currentAudit._pillarScores = { onPage: onPageScore, technical: techScore };

  // Fetch off-page data asynchronously (doesn't block UI)
  if (!currentAudit._offPage && currentUrl) fetchOffPageData();
}

function setPillar(key, score, active) {
  const scoreEl = document.getElementById(`pillar-${key}`);
  const barEl   = document.getElementById(`bar-${key}`);
  const badgeEl = document.getElementById(`${key}-badge`);

  if (!active || score == null) {
    if (scoreEl) scoreEl.textContent = '--';
    if (badgeEl) badgeEl.textContent = key === 'offpage' ? 'Connect GSC' : '--';
    return;
  }

  if (scoreEl) scoreEl.textContent = score;
  if (badgeEl) badgeEl.textContent = score + '/100';
  setTimeout(() => {
    if (barEl) barEl.style.width = score + '%';
  }, 200);
}

async function fetchOffPageData() {
  if (!currentAudit || !currentUrl) return;
  try {
    const fullUrl = currentAudit.url || `https://${currentUrl}`;
    const resp = await fetch(`https://naraseoai.onrender.com/api/offpage?url=${encodeURIComponent(fullUrl)}`);
    if (!resp.ok) return;
    const data = await resp.json();
    if (data.status === 'unavailable') return;

    // Store and update UI
    currentAudit._offPage = data;

    // Update off-page pillar
    if (data.pageRank != null) {
      const score = Math.min(100, data.pageRank * 10);
      setPillar('offpage', score, true);

      // Update the off-page items section if visible
      const offSection = document.getElementById('offpage-items');
      if (offSection) renderOffPageData(data, offSection);
    }
  } catch {}
}

function renderOffPageData(data, container) {
  const pr = data.pageRank != null ? data.pageRank : '--';
  const rank = data.domainRank != null ? '#' + data.domainRank.toLocaleString() : '--';
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px 14px;">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:24px;font-weight:900;color:#2563eb;">${pr}</div>
        <div style="font-size:10px;color:#6b7280;font-weight:600;margin-top:2px;">PAGE RANK (0–10)</div>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:20px;font-weight:900;color:#374151;">${rank}</div>
        <div style="font-size:10px;color:#6b7280;font-weight:600;margin-top:2px;">DOMAIN RANK</div>
      </div>
    </div>
    <div style="padding:4px 14px 12px;font-size:11px;color:#9ca3af;text-align:center;">
      Data from OpenPageRank · ${data.source || 'Free Tier'} ·
      <a href="https://www.domcop.com/openpagerank/" target="_blank" style="color:#2563eb;">About</a>
    </div>
  `;
}

function calcPillarScore(issuesInCategory, totalChecks) {
  const critical = issuesInCategory.filter(i => i.type === 'critical').length;
  const warning  = issuesInCategory.filter(i => i.type === 'warning').length;
  const deductions = (critical * 15) + (warning * 7);
  return Math.max(0, Math.min(100, 100 - deductions));
}

//  ISSUE COUNTS 
function updateIssueCounts() {
  const issues = currentAudit.issues || [];
  document.getElementById('summary-critical').textContent = issues.filter(i => i.type === 'critical').length;
  document.getElementById('summary-warning').textContent  = issues.filter(i => i.type === 'warning').length;
  document.getElementById('summary-info').textContent     = issues.filter(i => i.type === 'info').length;
}

//  ON-PAGE BREAKDOWN 
function updateOnPageBreakdown() {
  const issues = currentAudit.issues || [];
  const container = document.getElementById('onpage-items');
  if (!container) return;

  // Map each check to its status
  const checks = [
    {
      label: 'Title Tag',
      icon: '',
      evaluate: () => {
        const issue = issues.find(i => i.issue?.toLowerCase().includes('title'));
        if (!issue) return { status: 'good', detail: 'Present & optimized' };
        if (issue.type === 'critical') return { status: 'bad', detail: issue.issue };
        return { status: 'warn', detail: issue.issue };
      }
    },
    {
      label: 'Meta Description',
      icon: '',
      evaluate: () => {
        const issue = issues.find(i => i.issue?.toLowerCase().includes('meta description'));
        if (!issue) return { status: 'good', detail: '150-160 chars, good' };
        if (issue.type === 'critical') return { status: 'bad', detail: issue.issue };
        return { status: 'warn', detail: issue.issue };
      }
    },
    {
      label: 'H1 Tag',
      icon: '',
      evaluate: () => {
        const issue = issues.find(i => i.issue?.toLowerCase().includes('h1'));
        if (!issue) return { status: 'good', detail: 'One H1 found' };
        if (issue.type === 'critical') return { status: 'bad', detail: issue.issue };
        return { status: 'warn', detail: issue.issue };
      }
    },
    {
      label: 'Image Alt Text',
      icon: '',
      evaluate: () => {
        const imgIssues = issues.filter(i => i.issue?.toLowerCase().includes('alt'));
        if (imgIssues.length === 0) return { status: 'good', detail: 'All images have alt text' };
        return { status: imgIssues[0].type === 'critical' ? 'bad' : 'warn', detail: `${imgIssues.length} image(s) missing alt text` };
      }
    },
    {
      label: 'Canonical Tag',
      icon: '',
      evaluate: () => {
        const issue = issues.find(i => i.issue?.toLowerCase().includes('canonical'));
        if (!issue) return { status: 'good', detail: 'Canonical set' };
        return { status: 'warn', detail: 'Missing canonical tag' };
      }
    },
    {
      label: 'Open Graph Tags',
      icon: '',
      evaluate: () => {
        const issue = issues.find(i => i.issue?.toLowerCase().includes('open graph'));
        if (!issue) return { status: 'good', detail: 'OG tags present' };
        return { status: 'warn', detail: 'Missing OG tags (affects social shares)' };
      }
    },
    {
      label: 'Viewport / Mobile',
      icon: '',
      evaluate: () => {
        const issue = issues.find(i => i.issue?.toLowerCase().includes('viewport'));
        if (!issue) return { status: 'good', detail: 'Mobile-friendly' };
        return { status: 'bad', detail: 'Missing viewport meta tag' };
      }
    },
  ];

  container.innerHTML = checks.map(check => {
    const result = check.evaluate();
    return `
      <div class="breakdown-row">
        <div class="breakdown-row-icon">${check.icon}</div>
        <div class="breakdown-row-info">
          <div class="breakdown-row-label">${check.label}</div>
          <div class="breakdown-row-detail">${result.detail}</div>
        </div>
        <div class="breakdown-row-status status-${result.status}">${statusLabel(result.status)}</div>
      </div>
    `;
  }).join('');
}

//  LOCAL / GEO SEO 

async function loadLocalSEOData() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'ANALYZE_LOCAL_SEO' });
    if (response?.localData) {
      currentAudit._localSEO = response.localData;
      chrome.storage.local.set({ currentAudit });
      updateLocalSEOBreakdown(response.localData);
    }
  } catch (e) {
    // Content script may not be available on chrome:// pages
    console.log('Local SEO unavailable:', e.message);
  }
}

function updateLocalSEOBreakdown(d) {
  const section   = document.getElementById('local-section');
  const container = document.getElementById('local-items');
  const badge     = document.getElementById('local-badge');
  if (!section || !container) return;

  section.style.display = 'block';
  if (badge) {
    badge.textContent = d.score + '/100';
    badge.style.background = d.score >= 80 ? 'rgba(34,197,94,0.15)' : d.score >= 50 ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.15)';
    badge.style.color = d.score >= 80 ? '#166534' : d.score >= 50 ? '#854d0e' : '#991b1b';
  }

  const rows = [
    {
      label: 'LocalBusiness Schema',
      icon: '',
      status: d.hasLocalBusinessSchema ? 'good' : 'bad',
      detail: d.hasLocalBusinessSchema
        ? `Schema type: ${d.businessType || 'LocalBusiness'}`
        : 'Missing — add LocalBusiness JSON-LD',
    },
    {
      label: 'Business Address (NAP)',
      icon: '',
      status: d.hasAddress ? 'good' : 'bad',
      detail: d.hasAddress
        ? (d.napData?.address || 'Address detected on page')
        : 'No address found — add to schema + page',
    },
    {
      label: 'Phone Number',
      icon: '',
      status: d.hasPhone ? 'good' : 'warn',
      detail: d.hasPhone
        ? (d.napData?.phone || 'Phone detected on page')
        : 'No phone number found',
    },
    {
      label: 'Location in Title',
      icon: '',
      status: d.locationInTitle ? 'good' : d.detectedCity ? 'warn' : 'na',
      detail: d.locationInTitle
        ? `City "${d.detectedCity}" in title`
        : d.detectedCity
          ? `Add "${d.detectedCity}" to title tag`
          : 'No city/location detected',
    },
    {
      label: 'Location in Meta Desc',
      icon: '',
      status: d.locationInMeta ? 'good' : d.detectedCity ? 'warn' : 'na',
      detail: d.locationInMeta ? 'Location found in meta description' : d.detectedCity ? 'Add city to meta description' : '—',
    },
    {
      label: 'Location in H1',
      icon: '',
      status: d.locationInH1 ? 'good' : d.detectedCity ? 'warn' : 'na',
      detail: d.locationInH1 ? 'City/location in H1' : d.detectedCity ? 'Add city to H1 for local boost' : '—',
    },
    {
      label: 'Google Maps Embed',
      icon: '',
      status: d.hasGoogleMapsEmbed ? 'good' : 'warn',
      detail: d.hasGoogleMapsEmbed ? 'Maps embed found' : 'Add Google Maps embed to contact page',
    },
    {
      label: 'Opening Hours Schema',
      icon: '',
      status: d.hasOpeningHours ? 'good' : d.isLocalBusiness ? 'warn' : 'na',
      detail: d.hasOpeningHours ? 'openingHours in schema' : d.isLocalBusiness ? 'Add openingHours to LocalBusiness schema' : 'N/A',
    },
    {
      label: 'Reviews & Ratings',
      icon: '',
      status: d.hasReviewSchema ? 'good' : 'warn',
      detail: d.hasReviewSchema
        ? (d.napData?.rating ? `Rating: ${d.napData.rating}` : 'AggregateRating schema found')
        : 'Add review schema — boosts Google CTR',
    },
    {
      label: 'Service Area',
      icon: '',
      status: d.hasServiceArea ? 'good' : d.isLocalBusiness ? 'warn' : 'na',
      detail: d.hasServiceArea ? (d.napData?.serviceArea || 'areaServed defined') : d.isLocalBusiness ? 'Add areaServed to schema' : 'N/A',
    },
    {
      label: 'Geo Meta Tags',
      icon: '',
      status: d.hasGeoMeta ? 'good' : 'na',
      detail: d.hasGeoMeta ? `geo.region / geo.placename: ${d.napData?.geoRegion || 'Present'}` : 'Optional geo meta tags (geo.region)',
    },
    {
      label: 'hreflang (Multi-Region)',
      icon: '',
      status: d.hasHreflang ? 'good' : 'na',
      detail: d.hasHreflang ? 'hreflang tags present' : 'Only needed for multi-language sites',
    },
  ];

  container.innerHTML = rows.map(row => `
    <div class="breakdown-row">
      <div class="breakdown-row-icon">${row.icon}</div>
      <div class="breakdown-row-info">
        <div class="breakdown-row-label">${row.label}</div>
        <div class="breakdown-row-detail">${row.detail}</div>
      </div>
      <div class="breakdown-row-status status-${row.status}">${statusLabel(row.status)}</div>
    </div>
  `).join('');
}

//  TECHNICAL BREAKDOWN 
function updateTechnicalBreakdown() {
  const container = document.getElementById('technical-items');
  if (!container) return;

  const ps = currentAudit.pageSpeedInsights;

  const rows = [
    {
      label: 'SSL / HTTPS',
      icon: '',
      status: currentUrl.startsWith('http:') ? 'bad' : 'good',
      detail: currentUrl.startsWith('http:') ? 'Not secure — switch to HTTPS' : 'Secure connection',
    },
    {
      label: 'Page Speed Score',
      icon: '',
      status: ps?.performanceScore >= 90 ? 'good' : ps?.performanceScore >= 50 ? 'warn' : 'bad',
      detail: ps?.performanceScore != null ? `${ps.performanceScore}/100` : 'Connect backend to measure',
    },
    {
      label: 'Google SEO Score',
      icon: '',
      status: ps?.seoScore >= 90 ? 'good' : ps?.seoScore >= 70 ? 'warn' : ps?.seoScore != null ? 'bad' : 'na',
      detail: ps?.seoScore != null ? `${ps.seoScore}/100 (Google Lighthouse)` : 'Run Page Speed API',
    },
    {
      label: 'Mobile Friendly',
      icon: '',
      status: ps?.performanceScore >= 60 ? 'good' : ps?.performanceScore != null ? 'warn' : 'na',
      detail: ps ? 'Checked via Page Speed API' : 'Run audit to check',
    },
    {
      label: 'Structured Data',
      icon: '',
      status: (currentAudit.issues || []).find(i => i.issue?.toLowerCase().includes('schema')) ? 'bad' : 'good',
      detail: (currentAudit.issues || []).find(i => i.issue?.toLowerCase().includes('schema'))
        ? 'Schema markup missing' : 'Schema detected',
    },
    {
      label: 'Accessibility Score',
      icon: '',
      status: ps?.accessibilityScore >= 90 ? 'good' : ps?.accessibilityScore >= 70 ? 'warn' : ps?.accessibilityScore != null ? 'bad' : 'na',
      detail: ps?.accessibilityScore != null ? `${ps.accessibilityScore}/100` : 'Run audit to check',
    },
  ];

  container.innerHTML = rows.map(row => `
    <div class="breakdown-row">
      <div class="breakdown-row-icon">${row.icon}</div>
      <div class="breakdown-row-info">
        <div class="breakdown-row-label">${row.label}</div>
        <div class="breakdown-row-detail">${row.detail}</div>
      </div>
      <div class="breakdown-row-status status-${row.status}">${statusLabel(row.status)}</div>
    </div>
  `).join('');
}

//  CORE WEB VITALS 
function updateWebVitals() {
  const ps = currentAudit.pageSpeedInsights;
  if (!ps) return;

  const hasCrux = ps.crux && (ps.crux.lcp || ps.crux.fid || ps.crux.inp || ps.crux.cls);
  const lh = ps.lighthouse;

  if (!hasCrux && !lh) return;

  document.getElementById('cwv-section').style.display = 'block';

  if (hasCrux) {
    const lcp = ps.crux.lcp;
    const fid = ps.crux.fid || ps.crux.inp;
    const cls = ps.crux.cls;
    setVital('lcp', lcp ? `${lcp}ms` : '--', ps.crux.lcpCategory || '');
    setVital('fid', fid ? `${fid}ms` : '--', ps.crux.fidCategory || ps.crux.inpCategory || '');
    setVital('cls', cls != null ? (cls / 1000).toFixed(3) : '--', ps.crux.clsCategory || '');
    const badge = document.getElementById('cwv-badge');
    if (badge) badge.textContent = 'Real Users';
  } else {
    // Fallback: Lighthouse lab data (available for all sites)
    setVital('lcp', lh?.largestContentfulPaint || '--', '');
    setVital('fid', lh?.totalBlockingTime ? `TBT: ${lh.totalBlockingTime}` : '--', '');
    setVital('cls', lh?.cumulativeLayoutShift || '--', '');
    const badge = document.getElementById('cwv-badge');
    if (badge) badge.textContent = 'Lab Data';
  }
}

function setVital(key, value, category) {
  document.getElementById(`vital-${key}`).textContent = value;
  const catEl = document.getElementById(`vital-${key}-cat`);
  if (catEl) {
    catEl.textContent = category;
    if (category.toLowerCase().includes('poor')) catEl.className = 'vital-category poor';
    else if (category.toLowerCase().includes('needs')) catEl.className = 'vital-category needs-improvement';
    else catEl.className = 'vital-category';
  }
}

//  LIGHTHOUSE 
function updateLighthouse() {
  const ps = currentAudit.pageSpeedInsights;
  if (ps?.performanceScore == null) return;

  document.getElementById('lighthouse-section').style.display = 'block';

  setLhScore('lh-performance',   ps.performanceScore);
  setLhScore('lh-seo',           ps.seoScore);
  setLhScore('lh-accessibility', ps.accessibilityScore);
  setLhScore('lh-best-practices', ps.bestPracticesScore);
}

function setLhScore(id, score) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = score != null ? score : '--';
  if (score >= 90) el.className = 'lh-score good';
  else if (score >= 50) el.className = 'lh-score average';
  else el.className = 'lh-score poor';
}

//  PAGE DETAILS (content analysis, heading tree, images, links) 

async function loadPageDetails() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const pageData = await getPageData(tab.id);
    if (!pageData) return;
    renderContentAnalysis(pageData);
    initKeywordsSection();
    renderHeadingTree(pageData);
    renderImageAudit(pageData);
    renderLinksMap(pageData);
  } catch (e) {
    console.log('Page details unavailable:', e.message);
  }
}

//  1. Content Analysis 
function renderContentAnalysis(d) {
  const section = document.getElementById('content-section');
  const body    = document.getElementById('content-analysis-body');
  const badge   = document.getElementById('content-badge');
  if (!section || !body) return;
  section.style.display = 'block';

  const wc = d.wordCount || 0;
  const wcIdeal = 1500;
  const wcPct = Math.min(100, Math.round((wc / wcIdeal) * 100));
  const wcColor = wc >= 1500 ? 'green' : wc >= 800 ? 'yellow' : 'red';
  const wcLabel = wc >= 1500 ? 'Great' : wc >= 800 ? 'OK' : 'Too short';

  const rl = (d.readingLevel || 'Medium').toLowerCase();
  const sentences = d.sentences || 0;
  const aws = d.avgWordsPerSentence || 0;

  const keywords = d.topKeywords || [];
  const titleKw = (d.title || '').toLowerCase().split(/\s+/).filter(w => w.length > 3)[0] || '';

  if (badge) badge.textContent = wcLabel;

  body.innerHTML = `
    <div class="ca-stats">
      <div class="ca-stat">
        <div class="ca-stat-num">${wc.toLocaleString()}</div>
        <div class="ca-stat-label">Words</div>
      </div>
      <div class="ca-stat">
        <div class="ca-stat-num">${sentences}</div>
        <div class="ca-stat-label">Sentences</div>
      </div>
      <div class="ca-stat">
        <div class="ca-stat-num">${aws}</div>
        <div class="ca-stat-label">Wds/Sentence</div>
      </div>
    </div>

    <div class="ca-metric">
      <div class="ca-metric-top">
        <span class="ca-metric-label">Word Count</span>
        <span class="ca-metric-value">${wc} / ${wcIdeal} ideal</span>
      </div>
      <div class="ca-bar-track">
        <div class="ca-bar-fill ${wcColor}" style="width:0%" data-target="${wcPct}%"></div>
      </div>
    </div>

    <div class="ca-metric">
      <div class="ca-metric-top">
        <span class="ca-metric-label">Reading Level</span>
      </div>
      <div class="reading-pills">
        <div class="r-pill ${rl === 'easy' ? 'active easy' : ''}">Easy</div>
        <div class="r-pill ${rl === 'medium' ? 'active medium' : ''}">Medium</div>
        <div class="r-pill ${rl === 'complex' ? 'active complex' : ''}">Complex</div>
      </div>
    </div>

    ${keywords.length > 0 ? `
    <div class="ca-metric">
      <div class="ca-metric-top">
        <span class="ca-metric-label">Top Keywords</span>
        <span class="ca-metric-value" style="color:#6b7280">density %</span>
      </div>
      <div class="ca-keywords">
        ${keywords.map((k, i) => `
          <div class="kw-chip ${i === 0 ? 'top1' : ''}">
            <span class="kw-chip-word">${k.word}</span>
            <span class="kw-chip-pct">${k.density}%</span>
          </div>
        `).join('')}
      </div>
    </div>` : ''}

    ${keywords.length > 0 ? `
    <div class="ca-metric">
      <div class="ca-metric-top">
        <span class="ca-metric-label">Primary Keyword Density</span>
        <span class="ca-metric-value">${keywords[0]?.density || 0}%</span>
      </div>
      <div class="ca-bar-track">
        <div class="ca-bar-fill ${keywords[0]?.density > 3 ? 'red' : keywords[0]?.density > 1 ? 'green' : 'yellow'}"
             style="width:0%"
             data-target="${Math.min(100, (keywords[0]?.density || 0) * 20)}%"></div>
      </div>
    </div>` : ''}
  `;

  // Animate bars
  setTimeout(() => {
    body.querySelectorAll('.ca-bar-fill[data-target]').forEach(el => {
      el.style.width = el.dataset.target;
    });
  }, 100);
}

//  Keyword Research 
let currentKeywords = null;

async function runKeywordResearch() {
  const section = document.getElementById('keywords-section');
  const body    = document.getElementById('keywords-body');
  const btn     = document.getElementById('btn-run-keywords');
  if (!section || !body) return;

  // Show keywords section if not visible
  section.style.display = 'block';

  if (!currentAudit) {
    body.innerHTML = '<div class="kw-placeholder"><p>Run an audit first, then click Analyse →</p></div>';
    return;
  }

  btn.textContent = 'Analysing...';
  btn.disabled    = true;
  body.innerHTML  = '<div class="kw-loading"> Running AI keyword analysis…</div>';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const pageData = await getPageData(tab.id);

    const resp = await fetch('https://naraseoai.onrender.com/api/keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: currentUrl, pageData }),
    });

    if (!resp.ok) throw new Error(await resp.text());
    const { keywords } = await resp.json();
    currentKeywords = keywords;
    renderKeywords(keywords, body);
  } catch (err) {
    body.innerHTML = `<div class="kw-placeholder"><p style="color:#dc2626;">Error: ${escapeHtml(err.message)}</p></div>`;
  } finally {
    btn.textContent = 'Re-analyse';
    btn.disabled    = false;
  }
}

function renderKeywords(kw, container) {
  if (!kw) return;
  const E = s => escapeHtml(String(s || ''));

  const diffClass   = d => d === 'low' ? 'kw-diff-low' : d === 'medium' ? 'kw-diff-medium' : 'kw-diff-high';
  const statusClass = s => s === 'good' ? 'kw-status-good' : s === 'low' ? 'kw-status-low' : 'kw-status-missing';
  const volClass    = v => v === 'high' ? 'kw-vol-high' : v === 'medium' ? 'kw-vol-medium' : 'kw-vol-low';
  const volLabel    = v => v === 'high' ? 'High Volume' : v === 'medium' ? 'Med Volume' : 'Low Volume';

  // Trend badge
  const trendHtml = kw._trends ? (() => {
    const t = kw._trends;
    const cls = t.trend === 'rising' ? 'kw-trend-rising' : t.trend === 'declining' ? 'kw-trend-declining' : 'kw-trend-stable';
    const arrow = t.trend === 'rising' ? '↑' : t.trend === 'declining' ? '↓' : '→';
    const pct = t.changePct !== 0 ? ` ${t.changePct > 0 ? '+' : ''}${t.changePct}%` : '';
    return `<span class="kw-trend-badge ${cls}">${arrow} ${t.trend.charAt(0).toUpperCase() + t.trend.slice(1)}${pct}</span>`;
  })() : '';

  // Data source chip
  const sourceHtml = kw._dataSource
    ? `<div class="kw-data-source">${E(kw._dataSource)}</div>` : '';

  // Primary keyword card
  const primaryHtml = kw.primary ? `
    <div class="kw-primary-card">
      <div class="kw-primary-label-row">
        <div class="kw-primary-label">Primary Keyword</div>
        <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
          ${trendHtml}
          ${kw.primary.volume_tier ? `<span class="${volClass(kw.primary.volume_tier)}">${volLabel(kw.primary.volume_tier)}</span>` : ''}
        </div>
      </div>
      <div class="kw-primary-keyword-row">
        <div class="kw-primary-keyword">"${E(kw.primary.keyword)}"</div>
        <button class="kw-copy-btn" onclick="navigator.clipboard.writeText('${E(kw.primary.keyword).replace(/'/g,"\\'")}').then(()=>{this.textContent='Copied';setTimeout(()=>this.textContent='Copy',1200)})">Copy</button>
      </div>
      <div class="kw-primary-meta">
        <span>Density: <strong>${E(kw.primary.current_density)}</strong> → target ${E(kw.primary.target_density)}</span>
        <span class="${statusClass(kw.primary.status)}">${(kw.primary.status || '').toUpperCase()}</span>
      </div>
      ${kw.primary.note ? `<div class="kw-primary-note">${E(kw.primary.note)}</div>` : ''}
    </div>` : '';

  // Real Google searches section
  const realSearchesHtml = (kw._realSearches || []).length ? `
    <div class="kw-section-title">Real Google Searches
      <span class="kw-section-badge">Live data</span>
    </div>
    <div class="kw-real-list">
      ${(kw._realSearches || []).map(s => `
        <div class="kw-real-item">
          <span class="kw-real-icon">↗</span>
          <span class="kw-real-text">${E(s)}</span>
          <button class="kw-copy-btn" onclick="navigator.clipboard.writeText('${E(s).replace(/'/g,"\\'")}').then(()=>{this.textContent='Copied';setTimeout(()=>this.textContent='Copy',1200)})">Copy</button>
        </div>`).join('')}
    </div>` : '';

  // Secondary keywords
  const secondaryHtml = (kw.secondary || []).length ? `
    <div class="kw-section-title">Supporting Keywords</div>
    <div class="kw-secondary-list">
      ${(kw.secondary || []).map(s => `
        <span class="kw-secondary-tag" title="${E(s.where_to_add)}: ${E(s.why)}">
          ${E(s.keyword)}
          <span class="kw-tag-where">${E(s.where_to_add)}</span>
        </span>`).join('')}
    </div>` : '';

  // Keyword gaps
  const gapsHtml = (kw.gaps || []).length ? `
    <div class="kw-section-title">Keyword Gaps
      <span class="kw-section-badge kw-badge-opportunity">Opportunities</span>
    </div>
    ${(kw.gaps || []).map(g => `
      <div class="kw-gap-item">
        <div class="kw-gap-top-row">
          <div class="kw-gap-kw">${E(g.keyword)}</div>
          <button class="kw-copy-btn" onclick="navigator.clipboard.writeText('${E(g.keyword).replace(/'/g,"\\'")}').then(()=>{this.textContent='Copied';setTimeout(()=>this.textContent='Copy',1200)})">Copy</button>
        </div>
        <div class="kw-gap-meta">
          <span>${E(g.search_intent)}</span>
          <span class="${diffClass(g.difficulty)}">${E(g.difficulty)} difficulty</span>
          ${g.volume_tier ? `<span class="${volClass(g.volume_tier)}">${volLabel(g.volume_tier)}</span>` : ''}
        </div>
        <div class="kw-gap-action">${E(g.action)}</div>
      </div>`).join('')}` : '';

  // Semantic cluster
  const semanticHtml = (kw.semantic_cluster || []).length ? `
    <div class="kw-section-title">Semantic Keywords to Include</div>
    <div class="kw-semantic-list">
      ${(kw.semantic_cluster || []).map(w => `
        <span class="kw-semantic-tag" onclick="navigator.clipboard.writeText('${E(w).replace(/'/g,"\\'")}');this.style.background='#dbeafe';setTimeout(()=>this.style.background='',1000)" title="Click to copy">${E(w)}</span>`).join('')}
    </div>` : '';

  // Quick wins
  const quickWinsHtml = (kw.quick_wins || []).length ? `
    <div class="kw-section-title">Quick Wins</div>
    <div class="kw-quick-wins">
      ${(kw.quick_wins || []).map(w => `<div class="kw-quick-win-item">${E(w)}</div>`).join('')}
    </div>` : '';

  container.innerHTML = `
    ${sourceHtml}
    ${kw.summary ? `<div class="kw-summary">${E(kw.summary)}</div>` : ''}
    ${primaryHtml}
    ${realSearchesHtml}
    ${secondaryHtml}
    ${gapsHtml}
    ${semanticHtml}
    ${quickWinsHtml}
  `;
}

// Show keywords section after audit (collapsed by default, with placeholder)
function initKeywordsSection() {
  const section = document.getElementById('keywords-section');
  if (section) section.style.display = 'block';
}

//  2. Heading Tree 
function renderHeadingTree(d) {
  const section = document.getElementById('headings-section');
  const tree    = document.getElementById('heading-tree');
  const badge   = document.getElementById('headings-badge');
  if (!section || !tree) return;
  section.style.display = 'block';

  const headings = d.headings || [];
  if (!headings.length) { tree.innerHTML = '<div style="padding:12px;color:#9ca3af;font-size:11px;">No headings found</div>'; return; }

  const h1Count = headings.filter(h => h.level === 1).length;
  if (badge) {
    badge.textContent = h1Count === 1 ? 'Good' : h1Count === 0 ? 'Missing H1' : `${h1Count} H1s`;
    badge.style.background = h1Count === 1 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)';
    badge.style.color = h1Count === 1 ? '#15803d' : '#b91c1c';
  }

  // Issues
  let issues = [];
  if (h1Count === 0) issues.push(' No H1 found — critical for SEO');
  if (h1Count > 1) issues.push(` ${h1Count} H1 tags found — should be exactly 1`);
  const hasH3WithoutH2 = headings.some((h, i) => h.level === 3 && !headings.slice(0, i).some(p => p.level === 2));
  if (hasH3WithoutH2) issues.push(' H3 used without H2 parent — fix hierarchy');

  const issueHtml = issues.map(i => `<div class="h-tree-issue"><span></span><span>${i.replace(' ', '')}</span></div>`).join('');

  const indent = { 1: 0, 2: 14, 3: 28, 4: 42 };
  const nodeHtml = headings.slice(0, 25).map(h => `
    <div class="h-node h${h.level}" style="padding-left:${indent[h.level] || 0}px">
      <div class="h-node-indent">
        ${h.level > 1 ? '<div class="h-node-line"></div>' : ''}
        <div class="h-node-dot"></div>
      </div>
      <span class="h-node-text">${escapeHtml(h.text.substring(0, 55))}${h.text.length > 55 ? '…' : ''}</span>
      <span class="h-node-tag">H${h.level}</span>
    </div>
  `).join('');

  tree.innerHTML = issueHtml + nodeHtml +
    (headings.length > 25 ? `<div style="padding:8px 14px;font-size:10px;color:#9ca3af;">+${headings.length - 25} more headings</div>` : '');
}

//  3. Image Audit 
function renderImageAudit(d) {
  const section = document.getElementById('images-section');
  const body    = document.getElementById('images-audit-body');
  const badge   = document.getElementById('images-badge');
  if (!section || !body) return;
  section.style.display = 'block';

  const total    = d.imageCount || 0;
  const details  = d.imageDetails || [];
  const withAlt  = details.filter(i => i.hasAlt).length;
  const noAlt    = total - withAlt;
  const lazyCount = details.filter(i => i.lazy).length;
  const pctAlt   = total > 0 ? Math.round((withAlt / total) * 100) : 100;

  if (badge) {
    badge.textContent = noAlt === 0 ? ' All Good' : `${noAlt} Missing Alt`;
    badge.style.background = noAlt === 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)';
    badge.style.color = noAlt === 0 ? '#15803d' : '#b91c1c';
  }

  body.innerHTML = `
    <div class="img-summary">
      <div class="img-stat"><div class="img-stat-num">${total}</div><div class="img-stat-label">Total</div></div>
      <div class="img-stat"><div class="img-stat-num" style="color:${noAlt > 0 ? '#ef4444' : '#22c55e'}">${noAlt}</div><div class="img-stat-label">No Alt</div></div>
      <div class="img-stat"><div class="img-stat-num" style="color:#3b82f6">${lazyCount}</div><div class="img-stat-label">Lazy Load</div></div>
    </div>

    <div class="img-alt-bar">
      <div class="ca-metric-top">
        <span class="ca-metric-label">Alt Text Coverage</span>
        <span class="ca-metric-value" style="color:${pctAlt >= 90 ? '#16a34a' : '#dc2626'}">${pctAlt}%</span>
      </div>
      <div class="img-alt-bar-track">
        <div class="img-alt-fill-good" style="width:0%" data-target="${pctAlt}%"></div>
        <div class="img-alt-fill-bad"  style="width:0%" data-target="${100 - pctAlt}%"></div>
      </div>
    </div>

    ${details.length > 0 ? `
    <div class="img-list">
      ${details.slice(0, 15).map(img => `
        <div class="img-row">
          <span class="img-row-icon">${img.hasAlt ? '🟢' : ''}</span>
          <div class="img-row-info">
            <div class="img-row-name">${escapeHtml(img.src || 'image')}</div>
            <div class="img-row-alt">${img.hasAlt ? escapeHtml(img.alt.substring(0, 50)) : 'No alt text'}</div>
          </div>
          ${img.lazy ? '<span class="img-row-badge lazy">lazy</span>' : ''}
          <span class="img-row-badge ${img.hasAlt ? 'good' : 'bad'}">${img.hasAlt ? 'alt ' : 'no alt'}</span>
        </div>
      `).join('')}
    </div>` : ''}
  `;

  setTimeout(() => {
    body.querySelectorAll('[data-target]').forEach(el => { el.style.width = el.dataset.target; });
  }, 100);
}

//  4. Links Map 
function renderLinksMap(d) {
  const section = document.getElementById('links-section');
  const body    = document.getElementById('links-map-body');
  const badge   = document.getElementById('links-badge');
  if (!section || !body) return;
  section.style.display = 'block';

  const intCount = d.internalLinkCount || 0;
  const extCount = d.externalLinkCount || 0;
  const total    = intCount + extCount || 1;
  const intPct   = Math.round((intCount / total) * 100);
  const extPct   = 100 - intPct;

  const intLinks = d.internalLinkDetails || [];
  const extLinks = d.externalLinkDetails || [];

  if (badge) badge.textContent = `${intCount} int · ${extCount} ext`;

  body.innerHTML = `
    <div class="links-ratio-bar">
      <div class="links-ratio-internal" style="width:0%" data-target="${intPct}%"></div>
      <div class="links-ratio-external" style="width:0%" data-target="${extPct}%"></div>
    </div>
    <div class="links-legend">
      <div class="links-legend-item">
        <div class="links-legend-dot internal"></div>
        <span>Internal: ${intCount} (${intPct}%)</span>
      </div>
      <div class="links-legend-item">
        <div class="links-legend-dot external"></div>
        <span>External: ${extCount} (${extPct}%)</span>
      </div>
    </div>

    ${intLinks.length > 0 ? `
    <div class="links-list-label">Internal Links</div>
    <div class="links-list">
      ${intLinks.slice(0, 8).map(l => `
        <div class="link-row">
          <span class="link-row-icon"></span>
          <span class="link-row-text">${escapeHtml(l.text || l.href.split('/').pop() || l.href)}</span>
        </div>
      `).join('')}
    </div>` : ''}

    ${extLinks.length > 0 ? `
    <div class="links-list-label" style="margin-top:8px">External Links</div>
    <div class="links-list">
      ${extLinks.slice(0, 6).map(l => `
        <div class="link-row">
          <span class="link-row-icon">🟡</span>
          <span class="link-row-text">${escapeHtml(l.text || l.href)}</span>
          <span class="link-row-badge ${l.nofollow ? 'nofollow' : 'follow'}">${l.nofollow ? 'nofollow' : 'follow'}</span>
        </div>
      `).join('')}
    </div>` : ''}
  `;

  setTimeout(() => {
    body.querySelectorAll('[data-target]').forEach(el => { el.style.width = el.dataset.target; });
  }, 100);
}

//  PRIORITY ACTIONS ("Fix These First") 
// Maps generic SEO issues to plain English business-impact descriptions
const ISSUE_IMPACT_MAP = {
  'title': { why: 'Google shows your title in search results — getting cut off loses ~20% of clicks', effort: '2 min' },
  'meta description': { why: "Google writes its own if missing — usually poor quality, hurts CTR", effort: '3 min' },
  'h1': { why: "Google uses H1 to understand your page topic — no H1 means lower rankings", effort: '2 min' },
  'alt': { why: 'Image search traffic + accessibility — affects Google Image rankings', effort: '5 min' },
  'canonical': { why: 'Prevents duplicate content penalty — can split your page authority', effort: '2 min' },
  'open graph': { why: 'Controls how your page looks on social media — affects social traffic', effort: '3 min' },
  'viewport': { why: "Google uses mobile-first indexing since 2023 — this is a critical ranking signal", effort: '1 min' },
  'schema': { why: 'Structured data enables rich results (stars, FAQs) in Google — higher CTR', effort: '10 min' },
  'performance': { why: "Page speed is a confirmed Google ranking factor — every second costs ~7% conversions", effort: '30 min' },
  'lcp': { why: "LCP is a Core Web Vital — Google uses this to rank pages. >2.5s hurts rankings", effort: '20 min' },
  'cls': { why: 'CLS is a Core Web Vital — layout shifts frustrate users and hurt rankings', effort: '15 min' },
};

function getIssueImpact(issueText) {
  const lower = issueText.toLowerCase();
  for (const [key, val] of Object.entries(ISSUE_IMPACT_MAP)) {
    if (lower.includes(key)) return val;
  }
  return { why: 'Fixing this improves your SEO score and search visibility', effort: '10 min' };
}

function buildActionList(issues, ps) {
  const actions = [];

  // 1. PageSpeed opportunities (real Google data — highest credibility)
  if (ps?.opportunities?.length) {
    ps.opportunities.slice(0, 3).forEach(opp => {
      actions.push({
        type: 'speed',
        title: opp.title,
        why: opp.description?.substring(0, 100) || 'Improving page speed boosts rankings and conversions',
        fix: 'See PageSpeed Insights for implementation details',
        points: 8,
        effort: '20-60 min',
        chatPrompt: `My site ${currentUrl} has a PageSpeed issue: "${opp.title}". Explain exactly how to fix it with specific code examples.`,
      });
    });
  }

  // 2. Critical issues (must fix — direct ranking impact)
  issues.filter(i => i.type === 'critical').forEach(issue => {
    const impact = getIssueImpact(issue.issue);
    actions.push({
      type: 'critical',
      title: issue.issue.replace(/^[🟡]\s*/, '').trim(),
      why: impact.why,
      fix: issue.suggestion || issue.fixExample || 'Fix this issue',
      code: issue.fixExample,
      points: Math.abs(issue.affectsScore || 10),
      effort: impact.effort,
      chatPrompt: `On ${currentUrl}: "${issue.issue}". Give me the exact code to fix this. Current value: ${issue.detail || 'see audit'}`,
    });
  });

  // 3. High-impact warnings (should fix soon)
  issues.filter(i => i.type === 'warning').slice(0, 3).forEach(issue => {
    const impact = getIssueImpact(issue.issue);
    actions.push({
      type: 'warning',
      title: issue.issue.replace(/^[🟡]\s*/, '').trim(),
      why: impact.why,
      fix: issue.suggestion || issue.fixExample || 'Address this issue',
      code: issue.fixExample,
      points: Math.abs(issue.affectsScore || 5),
      effort: impact.effort,
      chatPrompt: `On ${currentUrl}: "${issue.issue}". How do I fix this? Give me specific code.`,
    });
  });

  return actions.sort((a, b) => b.points - a.points).slice(0, 5);
}

function renderPriorityActions() {
  const section = document.getElementById('priority-actions');
  if (!section || !currentAudit) return;

  const issues = currentAudit.issues || [];
  const ps = currentAudit.pageSpeedInsights;
  const actions = buildActionList(issues, ps);

  if (!actions.length) { section.style.display = 'none'; return; }

  const currentScore = currentAudit.score || 0;
  const potentialGain = Math.min(40, actions.reduce((s, a) => s + a.points, 0));
  const targetScore = Math.min(100, currentScore + potentialGain);

  section.style.display = 'block';
  section.innerHTML = `
    <div class="pa-header">
      <div class="pa-title"> Fix These First</div>
      <div class="pa-potential" title="Estimated score gain if all fixed">
        ${currentScore} → <strong>${targetScore}</strong> pts possible
      </div>
    </div>
    <div class="pa-list">
      ${actions.map((a, i) => `
        <div class="pa-card pa-${a.type}">
          <div class="pa-card-top">
            <div class="pa-card-num">${i + 1}</div>
            <div class="pa-card-body">
              <div class="pa-card-title">${escapeHtml(a.title.substring(0, 70))}${a.title.length > 70 ? '…' : ''}</div>
              <div class="pa-card-why">${escapeHtml(a.why)}</div>
            </div>
            <div class="pa-card-pts">+${a.points}<span>pts</span></div>
          </div>
          <div class="pa-card-actions">
            <span class="pa-effort">⏱ ${a.effort}</span>
            ${a.code ? `<button class="pa-btn-copy" onclick="copyActionFix('${escapeAttr(a.code)}', this)"> Copy Code</button>` : ''}
            <button class="pa-btn-ai" onclick="askAIAbout('${escapeAttr(a.chatPrompt)}')">Fix with AI →</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function copyActionFix(code, btn) {
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = ' Copied!';
    setTimeout(() => { btn.textContent = ' Copy Code'; }, 2000);
  });
}

function askAIAbout(prompt) {
  switchView('chat');
  if (sidebarChatInput) {
    sidebarChatInput.value = prompt;
    setTimeout(() => sendChatMessage(), 150);
  }
}

window.copyActionFix = copyActionFix;
window.askAIAbout   = askAIAbout;

//  HELPERS 
function isOnPageIssue(i) {
  const s = (i.issue || '').toLowerCase();
  return s.includes('title') || s.includes('meta') || s.includes('h1') ||
         s.includes('alt') || s.includes('canonical') || s.includes('og') ||
         s.includes('content') || s.includes('link') || s.includes('viewport');
}
function isTechnicalIssue(i) {
  const s = (i.issue || '').toLowerCase();
  return s.includes('speed') || s.includes('ssl') || s.includes('mobile') ||
         s.includes('schema') || s.includes('redirect') || s.includes('404');
}
function statusLabel(s) {
  return { good: ' Good', warn: ' Warn', bad: ' Fix', na: '—' }[s] || s;
}

//  APPLY QUICK FIXES (Agent Mode) 
async function applyQuickFixes() {
  if (!currentAudit?.issues?.length) {
    addChatMessage('Run an audit first to detect issues before applying fixes.', 'ai', false);
    switchView('chat');
    return;
  }

  const btn = document.getElementById('btn-apply-fixes');
  if (btn) { btn.textContent = ' Applying...'; btn.disabled = true; }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'APPLY_AUTO_FIXES',
      issues: currentAudit.issues,
    });

    const fixed = response?.fixed || [];
    if (btn) { btn.textContent = fixed.length > 0 ? ` ${fixed.length} Fixed!` : ' Apply Quick Fixes'; btn.disabled = false; }

    if (fixed.length > 0) {
      switchView('chat');
      addChatMessage(
        `** Auto-Fix Applied ${fixed.length} issue${fixed.length > 1 ? 's' : ''}!**\n\n` +
        fixed.map(f => `• ${f.issue}\n  \`${f.code.substring(0, 80)}...\``).join('\n\n') +
        '\n\nThese changes are live on the page until reload. Copy the code from the **Fixes tab** to make them permanent.',
        'ai', true
      );
      // Trigger fixes tab update
      setTimeout(() => updateFixesList(), 300);
    } else {
      addChatMessage('No auto-fixable issues found. Check the Fixes tab for manual recommendations.', 'ai', false);
      switchView('chat');
    }
  } catch (e) {
    if (btn) { btn.textContent = ' Apply Quick Fixes'; btn.disabled = false; }
    addChatMessage('Could not apply fixes: ' + e.message, 'ai', false);
    switchView('chat');
  }
}

//  HIGHLIGHT ISSUES 
async function highlightIssues() {
  if (!currentAudit) return alert('Run an audit first');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { action: 'INJECT_HIGHLIGHTS', issues: currentAudit.issues || [] })
    .catch(err => console.error(err));
}

//  PROGRESS LOADER 
// Progress steps — driven by real audit milestones, not timers
const STEP_PCT = { 1: 15, 2: 40, 3: 70, 4: 90 };

function startProgressSteps() {
  // Reset all steps to pending
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`step-${i}`);
    if (el) el.className = 'progress-step';
  }
  const fill = document.getElementById('progress-bar-fill');
  if (fill) fill.style.width = '0%';
}

function activateStep(n) {
  // Mark all previous steps done, activate step n
  for (let i = 1; i < n; i++) {
    const el = document.getElementById(`step-${i}`);
    if (el) el.className = 'progress-step done';
  }
  const el = document.getElementById(`step-${n}`);
  if (el) el.className = 'progress-step active';
  const fill = document.getElementById('progress-bar-fill');
  if (fill) fill.style.width = (STEP_PCT[n] || 90) + '%';
}

function finishProgressSteps() {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`step-${i}`);
    if (el) el.className = 'progress-step done';
  }
  const fill = document.getElementById('progress-bar-fill');
  if (fill) fill.style.width = '100%';
}

//  RUN AUDIT 
async function runAudit() {
  //  REQUIRE LOGIN 
  const { authToken } = await chrome.storage.local.get('authToken');

  if (!authToken) {
    // Show inline auth overlay — user stays on home view
    pendingAuditAfterAuth = true;
    showAuditAuthOverlay();
    return;
  }

  //  Check monthly credit limit (from backend, real enforcement) 

  if (authToken) {
    // User is logged in — check backend limits
    try {
      const response = await fetch('https://naraseoai.onrender.com/api/usage/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (response.ok) {
        const { canAudit, auditsLeft, plan, message } = await response.json();

        if (!canAudit) {
          addChatMessage(
            `**Audit limit reached!** \n\n` +
            `Plan: **${plan.toUpperCase()}**\n` +
            `Audits this month: ${message}\n\n` +
            `**Upgrade to Pro ($149/mo)** for unlimited audits, 500-page crawls, AI chat, and PDF reports.`,
            'ai', true
          );
          switchView('chat');
          return;
        }
      }
    } catch (err) {
      console.error('Usage check failed:', err);
      // Continue anyway (network error)
    }
  } else {
    // Not logged in — use local demo limit
    const canRun = await checkAndShowUsage();
    if (!canRun) {
      addChatMessage(
        `You've used all **${AUDIT_FREE_LIMIT} free audits** this month.\n\n` +
        'Sign in to upgrade to **Pro ($149/mo)** for unlimited audits, or create a free account.',
        'ai', true
      );
      switchView('chat');
      return;
    }
  }

  switchView('home');
  const preAuditEl2 = document.getElementById('pre-audit-state') || document.querySelector('.sider-welcome');
  if (preAuditEl2) preAuditEl2.style.display = 'none';
  document.getElementById('audit-results').style.display   = 'none';
  document.getElementById('audit-loading').style.display   = 'flex';
  startProgressSteps();
  activateStep(1); // Step 1: Reading page

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Can't audit browser-internal pages
  if (!tab?.url?.startsWith('http')) {
    document.getElementById('audit-loading').style.display = 'none';
    const preEl = document.getElementById('pre-audit-state') || document.querySelector('.sider-welcome');
    if (preEl) preEl.style.display = 'flex';
    addChatMessage('Navigate to a website first. Naraseo AI cannot audit browser internal pages (chrome://, new tab, etc.).', 'ai', false);
    switchView('chat');
    return;
  }

  // Step 1: DOM data from content script — instant, no network
  let pageData = null;
  try { pageData = await getPageData(tab.id); } catch (err) {
    console.error('getPageData failed:', err);
  }

  activateStep(2); // Step 2: Core Web Vitals + AI Keyword Analysis (parallel)

  // Run PageSpeed, keywords, and off-page data in parallel to save time
  let pageSpeed = null;
  const [psResult, kwResult, opResult] = await Promise.allSettled([
    fetch(`https://naraseoai.onrender.com/api/pagespeed?url=${encodeURIComponent(tab.url)}`).then(r => r.ok ? r.json() : null).catch(() => null),
    pageData ? fetch('https://naraseoai.onrender.com/api/keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: tab.url, pageData }),
    }).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null),
    fetch(`https://naraseoai.onrender.com/api/offpage?url=${encodeURIComponent(tab.url)}`).then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  pageSpeed = psResult.status === 'fulfilled' ? psResult.value : null;
  const kwData = kwResult.status === 'fulfilled' ? kwResult.value : null;
  const offPageData = opResult.status === 'fulfilled' ? opResult.value : null;
  if (kwData?.keywords) currentKeywords = kwData.keywords;

  activateStep(3); // Step 3: Scoring (fast, client-side)

  try {
    let result;

    // Step 3: Score client-side if scorer loaded; fallback to server otherwise
    if (pageData && typeof scorePageData === 'function') {
      const scored = scorePageData(pageData, pageSpeed);
      result = {
        url: tab.url,
        score: scored.score,
        grade: scored.grade,
        issues: scored.issues,
        categoryScores: scored.categoryScores,
        pageSpeedInsights: pageSpeed,
        dataSource: pageSpeed ? 'DOM + Google PageSpeed' : 'DOM Analysis',
        timestamp: new Date().toISOString(),
      };
    } else if (pageData) {
      // scorePageData not loaded — send DOM data to server for scoring (never Puppeteer)
      const response = await fetch('https://naraseoai.onrender.com/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: tab.url, pageData }),
      });
      if (!response.ok) throw new Error(`Server error ${response.status}`);
      result = await response.json();
    } else {
      // No DOM data — page behind login wall or content script blocked
      const errorMsg = 'Could not read page content. This can happen if:\n' +
        '• The page requires login — make sure you\'re logged in\n' +
        '• The page is still loading — wait and try again\n' +
        '• The page is restricted (chrome://, file://, PDF, etc.)\n\n' +
        'Try reloading the page and auditing again.';
      throw new Error(errorMsg);
    }

    // Merge pageData fields so SERP preview, report etc. can access title/meta/OG
    if (pageData) {
      result.title           = result.title           || pageData.title           || pageData.pageTitle || '';
      result.metaDescription = result.metaDescription || pageData.metaDescription || pageData.metaDesc  || '';
      result.ogTitle         = result.ogTitle         || pageData.ogTitle         || '';
      result.ogDescription   = result.ogDescription   || pageData.ogDescription   || pageData.ogDesc   || '';
      result.ogImage         = result.ogImage         || pageData.ogImage         || '';
      result.categories      = result.categories      || pageData.categories      || {};
      result._pageData       = pageData;
    }

    // Merge keyword data
    if (kwData?.keywords) {
      result.keywords    = kwData.keywords;
      result._kwData     = kwData;
      currentKeywords    = kwData.keywords;
    }

    // Merge off-page data (domain authority, backlinks)
    if (offPageData && offPageData.status !== 'unavailable') {
      result.backlinks = offPageData;
      result._offPage  = offPageData;
    }

    // Merge any cached geo-grid result for this domain
    try {
      const { geoGridResult } = await chrome.storage.local.get('geoGridResult');
      if (geoGridResult) result.geoGrid = geoGridResult;
    } catch {}

    activateStep(4); // Step 4: Generating fixes
    currentAudit = result;
    chrome.storage.local.set({ currentAudit });
    await incrementAuditCount();
    await saveAuditToHistory(result, pageData);

    // Auto-render keywords section if we got keyword data in this audit
    if (currentKeywords) {
      const kwBody = document.getElementById('keywords-body');
      const kwSection = document.getElementById('keywords-section');
      if (kwBody && kwSection) {
        kwSection.style.display = 'block';
        renderKeywords(currentKeywords, kwBody);
      }
    }

    finishProgressSteps();
    setTimeout(() => showResults(), 200);
    addChatMessage(`Audit complete. Score: ${result.score}/100 (${result.grade}). Open Fixes tab for recommendations.`, 'ai', false);

    chrome.runtime.sendMessage({ action: 'SET_BADGE', tabId: tab.id, grade: result.grade });
    chrome.runtime.sendMessage({ action: 'SHOW_NOTIFICATION', score: result.score, grade: result.grade, domain: currentUrl });
  } catch (error) {
    document.getElementById('audit-loading').style.display = 'none';
    const preAuditEl3 = document.getElementById('pre-audit-state') || document.querySelector('.sider-welcome');
    if (preAuditEl3) preAuditEl3.style.display = 'flex';
    const msg = error.message.includes('Failed to fetch')
      ? 'Could not reach backend. Start with: npm start in the backend folder.'
      : error.message;
    addChatMessage(`Audit failed: ${msg}`, 'ai', false);
    switchTab('chat');
  }
}

//  SITE CRAWL (native — no Puppeteer) 
async function runSiteCrawl(maxPages) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith('http')) return;

  // Get user's plan to enforce crawl limits
  const { userPlan = 'free' } = await chrome.storage.local.get('userPlan');
  const planLimit = PLAN_LIMITS[userPlan]?.crawlPages ?? PLAN_LIMITS.free.crawlPages;

  // Show a page-count picker first if not specified
  if (!maxPages) {
    const crawlEl = document.getElementById('crawl-results');
    if (crawlEl) {
      crawlEl.style.display = 'block';
      const makeBtn = (n, label, time) => {
        const locked = n > planLimit;
        return `<button class="crawl-pick-btn${locked ? ' locked' : ''}" onclick="${locked ? `showUpgradePrompt('${n > 100 ? 'agency' : 'pro'}')` : `runSiteCrawl(${n})`}">
          ${n} pages${locked ? ' ' : ''}<br><span>${locked ? 'Pro/Agency' : `~${time}`}</span>
        </button>`;
      };
      crawlEl.innerHTML = `
        <div class="crawl-card">
          <div class="crawl-header">
            <span class="crawl-title"> Crawl Whole Site</span>
            <span class="crawl-sub">Pick how many pages to scan (SEO + GEO signals)</span>
          </div>
          <div class="crawl-picker">
            ${makeBtn(25,  '25 pages',  '~30s, small site')}
            ${makeBtn(100, '100 pages', '~2 min, medium')}
            ${makeBtn(500, '500 pages', '~8 min, full site')}
          </div>
          <div class="crawl-note"> Native browser fetch — no Puppeteer, works offline</div>
        </div>`;
    }
    return;
  }

  // Enforce plan limit
  if (maxPages > planLimit) {
    const tier = maxPages > 100 ? 'agency' : 'pro';
    showUpgradePrompt(tier);
    return;
  }

  const crawlEl = document.getElementById('crawl-results');
  if (crawlEl) {
    crawlEl.style.display = 'block';
    crawlEl.innerHTML = `
      <div class="crawl-card">
        <div class="crawl-header">
          <span class="crawl-title"> Crawling Site…</span>
          <span class="crawl-sub">Up to ${maxPages} pages · scanning SEO + GEO</span>
        </div>
        <div class="crawl-progress" id="crawl-progress">Fetching pages… (this may take a moment)</div>
      </div>`;
  }

  try {
    const result = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'CRAWL_SITE', rootUrl: tab.url, maxPages },
        (r) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (!r?.success) reject(new Error(r?.error || 'Crawl failed'));
          else resolve(r.result);
        }
      );
    });

    renderCrawlResults(result, crawlEl);
  } catch (err) {
    if (crawlEl) {
      crawlEl.innerHTML = `<div class="crawl-card">
        <div class="crawl-error">Crawl failed: ${err.message}</div>
        <div class="crawl-note" style="margin-top:8px;">This may happen if the site blocks cross-origin requests. Try a different site, or use the single-page audit instead.</div>
      </div>`;
    }
  }
}

function renderCrawlResults({ pages = [], crawledCount = 0, rootUrl = '' }, container) {
  if (!container) return;

  // Use pre-scored issues from background scorer if available, otherwise derive locally
  const issuesAcross = pages.map(p => {
    let issues = [];
    if (p.issues && p.issues.length > 0) {
      // Background scorer already ran scorePageData() on each page
      issues = p.issues.map(i => ({
        type: i.type,
        msg: i.issue.substring(0, 50),
      }));
    } else {
      // Fallback: lightweight local check
      if (!p.title)                              issues.push({ type: 'critical', msg: 'Missing title' });
      else if ((p.titleLength || 0) > 60)        issues.push({ type: 'warning',  msg: `Title too long (${p.titleLength}c)` });
      if (!p.metaDescription)                    issues.push({ type: 'critical', msg: 'No meta desc' });
      if (!p.h1Tags?.length)                     issues.push({ type: 'critical', msg: 'Missing H1' });
      if ((p.imgsMissingAlt?.length || 0) > 0)   issues.push({ type: 'warning',  msg: `${p.imgsMissingAlt.length} imgs no alt` });
      if (!p.hasViewport)                        issues.push({ type: 'critical', msg: 'No viewport' });
      if (!p.canonical)                          issues.push({ type: 'warning',  msg: 'No canonical' });
    }
    return { url: p.url, issues, title: p.title || '(no title)', geo: p.geo, score: p.score };
  });

  const totalIssues   = issuesAcross.reduce((s, p) => s + p.issues.length, 0);
  const criticalPages = issuesAcross.filter(p => p.issues.some(i => i.type === 'critical')).length;

  // Aggregate geo signals across all pages
  const geoSignals = pages.reduce((acc, p) => {
    if (p.geo?.phone   && !acc.phone)   acc.phone = p.geo.phone;
    if (p.geo?.address && !acc.address) acc.address = p.geo.address;
    if (p.geo?.geoRegion)    acc.regions.add(p.geo.geoRegion);
    if (p.geo?.localBiz)     acc.localBiz = true;
    if (p.geo?.hasMapEmbed)  acc.hasMap = true;
    (p.geo?.hreflangTags || []).forEach(t => acc.hreflang.add(t));
    return acc;
  }, { phone: '', address: '', regions: new Set(), localBiz: false, hasMap: false, hreflang: new Set() });

  const geoScore = [
    geoSignals.phone    ? 1 : 0,
    geoSignals.address  ? 1 : 0,
    geoSignals.localBiz ? 1 : 0,
    geoSignals.hasMap   ? 1 : 0,
  ].reduce((a,b) => a+b, 0);

  const geoIssues = [];
  if (!geoSignals.phone)   geoIssues.push('No phone number found on any page');
  if (!geoSignals.address) geoIssues.push('No street address detected');
  if (!geoSignals.localBiz) geoIssues.push('No LocalBusiness schema markup');
  if (!geoSignals.hasMap)   geoIssues.push('No Google Maps embed found');

  container.innerHTML = `
    <div class="crawl-card">
      <div class="crawl-header">
        <span class="crawl-title"> Site Crawl Complete</span>
        <span class="crawl-sub">${crawledCount} pages · ${totalIssues} issues · ${criticalPages} critical</span>
      </div>
      <div class="crawl-summary-row">
        <div class="crawl-stat"><span class="crawl-stat-num">${crawledCount}</span><span class="crawl-stat-lbl">Pages</span></div>
        <div class="crawl-stat critical"><span class="crawl-stat-num">${issuesAcross.reduce((s,p) => s + p.issues.filter(i=>i.type==='critical').length, 0)}</span><span class="crawl-stat-lbl">Critical</span></div>
        <div class="crawl-stat warning"><span class="crawl-stat-num">${issuesAcross.reduce((s,p) => s + p.issues.filter(i=>i.type==='warning').length, 0)}</span><span class="crawl-stat-lbl">Warnings</span></div>
      </div>

      ${geoIssues.length > 0 ? `
      <div class="crawl-geo-box">
        <div class="crawl-geo-header">
          <span class="crawl-geo-score ${geoScore >= 3 ? 'good' : geoScore >= 2 ? 'ok' : 'bad'}">${geoScore}/4</span>
          <span class="crawl-geo-title"> Local / GEO Signals</span>
        </div>
        <div class="crawl-geo-found">
          ${geoSignals.phone ? `<span class="crawl-geo-tag found"> Phone: ${geoSignals.phone}</span>` : ''}
          ${geoSignals.address ? `<span class="crawl-geo-tag found"> Address found</span>` : ''}
          ${geoSignals.localBiz ? '<span class="crawl-geo-tag found"> LocalBusiness schema</span>' : ''}
          ${geoSignals.hasMap ? '<span class="crawl-geo-tag found"> Map embed</span>' : ''}
          ${[...geoSignals.hreflang].map(h => `<span class="crawl-geo-tag found">hreflang: ${h}</span>`).join('')}
        </div>
        <div class="crawl-geo-missing">
          ${geoIssues.map(i => `<div class="crawl-geo-issue"> ${i}</div>`).join('')}
        </div>
      </div>` : `
      <div class="crawl-geo-box">
        <div class="crawl-geo-header">
          <span class="crawl-geo-score good">4/4</span>
          <span class="crawl-geo-title"> Local / GEO — All signals present </span>
        </div>
      </div>`}

      <div class="crawl-pages-list">
        ${issuesAcross.map(p => {
          const scoreColor = !p.score ? '' : p.score >= 80 ? 'score-good' : p.score >= 60 ? 'score-ok' : 'score-bad';
          const topIssues = p.issues.slice(0, 3); // Show max 3 tags per row
          return `
          <div class="crawl-page-row ${p.issues.length === 0 ? 'crawl-page-ok' : ''}">
            <div class="crawl-page-meta">
              ${p.score != null ? `<span class="crawl-page-score ${scoreColor}">${p.score}</span>` : ''}
              <div>
                <div class="crawl-page-title" title="${p.url}">${(p.title||'').substring(0, 42)}${(p.title||'').length > 42 ? '…' : ''}</div>
                <div class="crawl-page-url">${safePathname(p.url)}</div>
              </div>
            </div>
            <div class="crawl-page-issues">
              ${topIssues.length === 0
                ? '<span class="crawl-ok-badge">OK</span>'
                : topIssues.map(i => `<span class="crawl-issue-tag ${i.type}">${i.msg}</span>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>
      <button class="crawl-ask-ai-btn" onclick="askAIAbout('Site crawl found ${totalIssues} SEO issues across ${crawledCount} pages. ${criticalPages} pages have critical issues. GEO score: ${geoScore}/4. Issues: ${geoIssues.join(', ')}. What should I prioritize?')">
        Ask AI about site-wide issues →
      </button>
    </div>`;
}
function safePathname(url) {
  try { return new URL(url).pathname.substring(0, 40) || '/'; } catch { return url.substring(0, 40); }
}

function showUpgradePrompt(tier = 'pro') {
  const prices = { pro: '$149/mo', agency: '$299/mo' };
  const features = {
    pro: [
      'Unlimited single-page audits',
      '500-page full site crawl with GEO signals',
      'AI consultant chat — unlimited',
      'Agency-grade PDF reports',
    ],
    agency: [
      'Everything in Pro',
      'Unlimited crawl pages',
      '10 client sites',
      'White-label PDF reports',
      'API access + priority support',
    ],
  };
  addChatMessage(
    `**${tier === 'agency' ? 'Agency' : 'Pro'} plan required — ${prices[tier]}**\n\n` +
    features[tier].map(f => `— ${f}`).join('\n') +
    `\n\nUpgrade under Account to unlock. Agencies charge $3,000+/mo for this work.`,
    'ai', true
  );
  switchView('chat');
}

window.showUpgradePrompt = showUpgradePrompt;
window.runSiteCrawl = runSiteCrawl;

//  AI SUGGESTIONS (diff view + live apply) 

/**
 * Word-level diff between two strings.
 * Returns an HTML string with <del> for removed words and <ins> for added words.
 */
function wordDiff(before, after) {
  if (!before && !after) return '';
  if (!before) return `<ins>${escapeHtml(after)}</ins>`;
  if (!after)  return `<del>${escapeHtml(before)}</del>`;

  const bWords = before.split(/(\s+)/);
  const aWords = after.split(/(\s+)/);

  // LCS-based word diff (simplified — good enough for short strings)
  const bLen = bWords.length, aLen = aWords.length;
  const dp = Array.from({ length: bLen + 1 }, () => new Array(aLen + 1).fill(0));
  for (let i = 1; i <= bLen; i++)
    for (let j = 1; j <= aLen; j++)
      dp[i][j] = bWords[i-1] === aWords[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);

  // Backtrack
  const ops = [];
  let i = bLen, j = aLen;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && bWords[i-1] === aWords[j-1]) {
      ops.unshift({ type: 'eq', val: bWords[i-1] }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      ops.unshift({ type: 'ins', val: aWords[j-1] }); j--;
    } else {
      ops.unshift({ type: 'del', val: bWords[i-1] }); i--;
    }
  }

  return ops.map(op => {
    const v = escapeHtml(op.val);
    if (op.type === 'ins') return `<ins>${v}</ins>`;
    if (op.type === 'del') return `<del>${v}</del>`;
    return v;
  }).join('');
}

/**
 * Fetch AI suggestions and render the diff view.
 * Called when user opens the Suggestions tab (or after an audit completes).
 */
async function loadSuggestions() {
  const container = document.getElementById('suggestions-list');
  if (!container) return;

  if (!currentAudit) {
    container.innerHTML = '<div class="sugg-empty">Run an audit first to get AI-powered suggestions.</div>';
    return;
  }

  container.innerHTML = '<div class="sugg-loading"><div class="loader"></div><p>Generating suggestions...</p></div>';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let pageData = null;
  try { pageData = await getPageData(tab.id); } catch {}

  try {
    const resp = await fetch('https://naraseoai.onrender.com/api/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: tab.url, pageData }),
    });

    if (!resp.ok) throw new Error(`Server error ${resp.status}`);
    const { suggestions } = await resp.json();

    renderSuggestions(suggestions, container, tab.id);
  } catch (err) {
    container.innerHTML = `<div class="sugg-error">Could not generate suggestions: ${err.message.includes('fetch') ? 'Backend not running.' : err.message}</div>`;
  }
}

const ELEMENT_LABELS = {
  title: 'Title Tag',
  meta:  'Meta Description',
  h1:    'H1 Heading',
  h2:    'H2 Heading',
  intro: 'Intro Paragraph',
};

function renderSuggestions(suggestions, container, tabId) {
  const mainKeys = ['title', 'meta', 'h1', 'h2', 'intro'];
  let cards = mainKeys
    .filter(k => suggestions[k]?.suggested)
    .map(key => buildSuggestionCard(key, suggestions[key]));

  // Image alt text suggestions
  const images = Array.isArray(suggestions.images) ? suggestions.images.filter(img => img?.suggested) : [];
  images.forEach((img, i) => cards.push(buildImageSuggestionCard(`image_${i}`, img)));

  if (cards.length === 0) {
    container.innerHTML = '<div class="sugg-empty">No content suggestions at this time.</div>';
    return;
  }

  const acceptBar = `
    <div class="sugg-accept-all-bar">
      <span class="sugg-count">${cards.length} suggestion${cards.length !== 1 ? 's' : ''}</span>
      <button class="sugg-btn-accept-all" onclick="acceptAllSuggestions()">Accept All</button>
    </div>`;

  container.innerHTML = acceptBar + cards.join('');

  // Highlight relevant visible elements on the live page (skip title/meta — they're not visible DOM)
  const highlightKeys = mainKeys
    .filter(k => suggestions[k]?.suggested && !['title', 'meta'].includes(k));
  images.forEach((_, i) => highlightKeys.push(`image_${i}`));

  if (highlightKeys.length > 0) {
    chrome.tabs.sendMessage(tabId, { action: 'HIGHLIGHT_SUGGESTIONS', elements: highlightKeys });
  }
}

function buildSuggestionCard(key, s) {
  const before  = s.current || '(missing)';
  const after   = s.suggested || '';
  const diff    = wordDiff(before === '(missing)' ? '' : before, after);
  const isEmpty = !before || before === '(missing)';
  return `
    <div class="sugg-card" id="sugg-card-${key}">
      <div class="sugg-card-head">
        <span class="sugg-element">${ELEMENT_LABELS[key] || key}</span>
        <span class="sugg-impact">${s.impact || ''}</span>
      </div>
      <div class="sugg-diff-wrap">
        <div class="sugg-diff-label">Before</div>
        <div class="sugg-before ${isEmpty ? 'sugg-missing' : ''}">${isEmpty ? 'Not set' : escapeHtml(before)}</div>
        <div class="sugg-diff-label">After</div>
        <div class="sugg-after">${diff}</div>
      </div>
      <div class="sugg-reasoning">${escapeHtml(s.reasoning || '')}</div>
      <div class="sugg-actions">
        <button class="sugg-btn-copy" onclick="copySuggestion('${escapeAttr(s.code || after)}', this)">Copy code</button>
        <button class="sugg-btn-apply" onclick="applySuggestion('${key}', '${escapeAttr(after)}', '${escapeAttr(s.code || '')}', this)">Apply to page</button>
      </div>
    </div>`;
}

function buildImageSuggestionCard(key, img) {
  const after = img.suggested || '';
  return `
    <div class="sugg-card" id="sugg-card-${key}">
      <div class="sugg-card-head">
        <span class="sugg-element">Image Alt Text</span>
        <span class="sugg-impact">Accessibility + SEO</span>
      </div>
      <div class="sugg-diff-wrap">
        <div class="sugg-diff-label">File</div>
        <div class="sugg-before sugg-missing">${escapeHtml(img.src || 'unnamed image')}</div>
        <div class="sugg-diff-label">Add alt text</div>
        <div class="sugg-after"><ins>${escapeHtml(after)}</ins></div>
      </div>
      <div class="sugg-reasoning">${escapeHtml(img.reasoning || '')}</div>
      <div class="sugg-actions">
        <button class="sugg-btn-copy" onclick="copySuggestion('alt=&quot;${escapeAttr(after)}&quot;', this)">Copy</button>
        <button class="sugg-btn-apply" onclick="applySuggestion('${key}', '${escapeAttr(after)}', '', this)">Apply to page</button>
      </div>
    </div>`;
}

/**
 * Apply a suggestion directly to the live page via content script.
 */
async function applySuggestion(element, value, code, btn) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  btn.textContent = 'Applying…';
  btn.disabled = true;

  try {
    const result = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(
        tab.id,
        { action: 'APPLY_SUGGESTION', element, value },
        (r) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(r);
        }
      );
    });

    if (result?.success) {
      btn.textContent = 'Applied';
      btn.classList.add('applied');
      const card = document.getElementById(`sugg-card-${element}`);
      if (card) card.classList.add('sugg-card-applied');
      // Remove the dashed indigo highlight from the live page
      chrome.tabs.sendMessage(tab.id, { action: 'CLEAR_SUGGESTION_HIGHLIGHT', element });
    } else {
      throw new Error(result?.error || 'Apply failed');
    }
  } catch (err) {
    btn.textContent = 'Failed — copy instead';
    btn.disabled = false;
    navigator.clipboard.writeText(code).catch(() => {});
  }
}

function showFixesSubtab(tab) {
  document.getElementById('fixes-panel').style.display       = tab === 'fixes'       ? 'block' : 'none';
  document.getElementById('suggestions-panel').style.display = tab === 'suggestions' ? 'block' : 'none';
  document.getElementById('subtab-fixes').classList.toggle('active',       tab === 'fixes');
  document.getElementById('subtab-suggestions').classList.toggle('active', tab === 'suggestions');
  if (tab === 'suggestions') loadSuggestions();
}

async function acceptAllSuggestions() {
  const bar = document.querySelector('.sugg-btn-accept-all');
  if (bar) { bar.textContent = 'Accepting…'; bar.disabled = true; }

  const btns = Array.from(document.querySelectorAll('.sugg-btn-apply:not(.applied):not([disabled])'));
  for (const btn of btns) {
    btn.click();
    await new Promise(r => setTimeout(r, 400)); // stagger — avoid overwhelming content script
  }

  if (bar) { bar.textContent = 'All Applied'; }
}

window.loadSuggestions      = loadSuggestions;
window.applySuggestion      = applySuggestion;
window.showFixesSubtab      = showFixesSubtab;
window.acceptAllSuggestions = acceptAllSuggestions;
window.buildSuggestionCard      = buildSuggestionCard;
window.buildImageSuggestionCard = buildImageSuggestionCard;

//  FIXES LIST 
async function updateFixesList() {
  if (!currentAudit?.issues?.length) {
    fixesList.innerHTML = '<div class="empty-state"><div class="empty-icon"></div><p>Run an audit to see fixes</p></div>';
    return;
  }

  fixesList.innerHTML = '<div class="empty-state"><div class="loader"></div><p>Generating fixes...</p></div>';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const pageData = await getPageData(tab.id);

    const response = await fetch('https://naraseoai.onrender.com/api/fixes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: tab.url, issues: currentAudit.issues, pageData }),
    });

    if (!response.ok) throw new Error(response.statusText);

    const { fixes = [] } = await response.json();

    fixesList.innerHTML = fixes.length > 0
      ? fixes.map((fix, idx) => {
          const pIcon  = fix.priority === 1 ? '' : fix.priority === 2 ? '🟡' : '🟢';
          const pLabel = fix.priority === 1 ? 'Critical' : fix.priority === 2 ? 'Warning' : 'Info';
          const pClass = fix.priority === 1 ? 'critical' : fix.priority === 2 ? 'warning' : 'info';
          return `
            <div class="fix-card ${pClass}">
              <div class="fix-card-header">
                <div class="fix-issue-title">${fix.issue}</div>
                <span class="fix-priority-badge">${pIcon} ${pLabel}</span>
              </div>
              <div class="fix-section">
                <span class="fix-section-label">Current State</span>
                <div class="fix-code-block current">${escapeHtml(fix.currentValue || '')}</div>
              </div>
              <div class="fix-section">
                <span class="fix-section-label">Suggested Fix</span>
                <div class="fix-code-block suggested">${escapeHtml(fix.suggestedValue || '')}</div>
              </div>
              <div class="fix-explanation-box">
                <div class="explanation-title">Why This Matters</div>
                <div class="explanation-text">${(fix.explanation || '').substring(0, 180)}</div>
              </div>
              <div class="fix-card-actions">
                <button class="action-btn" onclick="copySuggestion('${escapeAttr(fix.suggestedValue || '')}', this)"> Copy Fix</button>
              </div>
            </div>`;
        }).join('')
      : '<div class="empty-state"><div class="empty-icon"></div><p>No fixes needed!</p></div>';

  } catch (err) {
    fixesList.innerHTML = `<div class="empty-state"><div class="empty-icon"></div><p>${err.message}</p></div>`;
  }
}

/**
 * Get page data from content script.
 * If no content script is running on the tab (e.g. page was open before extension
 * installed/reloaded), injects it programmatically then retries.
 */
async function getPageData(tabId) {
  // First attempt
  try {
    const first = await _sendGetPageData(tabId);
    if (first && Object.keys(first).length > 3) return first; // got real data
  } catch (err) {
    console.warn('First attempt failed:', err.message);
  }

  // Content script not responding — try injecting it
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await new Promise(r => setTimeout(r, 250)); // let script initialise
  } catch (err) {
    // Restricted page (chrome://, PDF, etc.) — can't inject
    console.warn('Content script injection failed:', err.message);
    return null;
  }

  // Second attempt after injection
  try {
    return await _sendGetPageData(tabId);
  } catch (err) {
    console.warn('Second attempt failed:', err.message);
    return null;
  }
}

function _sendGetPageData(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Content script timeout'));
    }, 5000); // 5 second timeout

    chrome.tabs.sendMessage(tabId, { action: 'GET_PAGE_DATA' }, r => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        reject(new Error(`Content script error: ${chrome.runtime.lastError.message}`));
      } else {
        resolve(r || null);
      }
    });
  });
}

function copySuggestion(value, btn) {
  navigator.clipboard.writeText(value).then(() => {
    btn.textContent = ' Copied!';
    setTimeout(() => { btn.textContent = ' Copy Fix'; }, 2000);
  });
}

//  CHAT AGENT 
// Detects SEO action commands and executes them without an AI API call.
// Falls back to Claude AI for questions and open-ended requests.

const CHAT_AGENT_ACTIONS = [
  {
    patterns: [/\brun.?audit\b/i, /\banalyze\s+(this\s+)?page\b/i, /\bcheck\s+seo\b/i, /\bscan\s+page\b/i, /\bstart audit\b/i],
    label: 'Running SEO audit on this page...',
    reply: 'Starting audit now. Check the Summary tab for results.',
    action: async () => { switchView('home'); runAudit(); },
  },
  {
    patterns: [/\bhighlight (issues?|problems?|errors?)\b/i, /\bshow (me )?(the )?issues? on page\b/i, /\bmark issues\b/i, /\bshow issues\b/i],
    label: 'Highlighting issues on the page...',
    reply: 'Highlighting all SEO issues directly on the page. Look for colored pulsing boxes.',
    action: async () => { highlightIssues(); },
  },
  {
    patterns: [/\bclear highlights?\b/i, /\bremove highlights?\b/i, /\bhide highlights?\b/i, /\bstop highlighting\b/i],
    label: 'Clearing page highlights...',
    reply: 'Highlights cleared.',
    action: async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.tabs.sendMessage(tab.id, { action: 'CLEAR_HIGHLIGHTS' });
    },
  },
  {
    patterns: [/\bdownload report\b/i, /\bgenerate.?pdf\b/i, /\bexport report\b/i, /\bget report\b/i, /\bpdf\b/i],
    label: 'Generating PDF report...',
    reply: 'Generating your agency-grade PDF report...',
    action: async () => { downloadReport(); },
  },
  {
    patterns: [/\bapply.?fix(es)?\b/i, /\bquick fix(es)?\b/i, /\bauto.?fix\b/i, /\bfix missing tags\b/i],
    label: 'Applying quick fixes to the page...',
    reply: 'Applying quick fixes — injecting missing meta tags, OG tags, and schema into the live page.',
    action: async () => { applyQuickFixes(); },
  },
  {
    patterns: [/\bcrawl (site|all pages?)\b/i, /\bfull site (scan|crawl|audit)\b/i, /\bscan all pages?\b/i, /\bmulti.?page\b/i, /\bcrawl multiple\b/i],
    label: 'Starting full site crawl...',
    reply: 'Opening site crawl. You can pick 25, 100, or 500 pages depending on your plan.',
    action: async () => { switchView('home'); runSiteCrawl(); },
  },
  {
    patterns: [/\bai rewrite\b/i, /\bcontent suggest\b/i, /\brewrite (my )?(title|meta|heading|h1|h2)\b/i, /\bimprove (my )?content\b/i, /\bsuggestions?\b/i],
    label: 'Loading AI content suggestions...',
    reply: 'Opening AI Rewrites — showing word-level diff for every element that can be improved.',
    action: async () => { switchView('fixes'); showFixesSubtab('suggestions'); },
  },
  {
    patterns: [/\bshow fix(es)?\b/i, /\bcode fix\b/i, /\bopen fix(es)?\b/i, /\bfix tab\b/i, /\bwhat.?fix\b/i],
    label: 'Opening code fixes...',
    reply: 'Opening the Fixes tab with copy-ready code for every issue found.',
    action: async () => { switchView('fixes'); showFixesSubtab('fixes'); },
  },
  {
    patterns: [/\bupgrade\b/i, /\bget pro\b/i, /\bpro plan\b/i, /\bpricing\b/i, /\bplans?\b/i, /\bsubscribe\b/i],
    label: 'Opening account & plans...',
    reply: 'Opening the Account tab. Pro is $149/mo — replaces your SEO agency.',
    action: async () => { switchView('account'); },
  },
  {
    patterns: [/\baccept all\b/i, /\bapply all suggestions?\b/i, /\baccept all rewrites?\b/i],
    label: 'Accepting all AI suggestions...',
    reply: 'Applying all AI rewrite suggestions to the live page.',
    action: async () => { switchView('fixes'); showFixesSubtab('suggestions'); setTimeout(() => acceptAllSuggestions(), 1500); },
  },
  {
    patterns: [/\bkeyword research\b/i, /\bkeyword analysis\b/i, /\bcheck keywords?\b/i, /\banalyze keywords?\b/i, /\bkeyword gaps?\b/i],
    label: 'Running keyword research...',
    reply: 'Running AI keyword analysis on this page. Scroll to the **Keyword Research** section in the audit results to see primary keywords, gaps, and quick wins.',
    action: async () => { switchView('home'); runKeywordResearch(); },
  },
  {
    patterns: [/\bschedule\s+(daily|weekly|monthly)\b/i, /\bauto.?audit\b/i, /\brun\s+audit\s+(daily|weekly|monthly)\b/i],
    label: 'Setting up scheduled audit...',
    reply: 'Scheduled audits configured. Go to **Account** tab to adjust the frequency. You will receive notifications when audits complete.',
    action: async (msg) => {
      const m = msg.match(/\b(daily|weekly|monthly)\b/i);
      const freq = m ? m[1].toLowerCase() : 'daily';
      await setScheduleFromChat(freq);
      switchView('account');
    },
  },
];

async function detectChatIntent(message) {
  for (const a of CHAT_AGENT_ACTIONS) {
    if (a.patterns.some(p => p.test(message))) return a;
  }
  return null;
}

//  CHAT 
async function sendChatMessage() {
  const message = sidebarChatInput.value.trim();
  if (!message) return;
  addChatMessage(message, 'user', false);
  sidebarChatInput.value = '';

  //  Step 1: check for agent action commands 
  const intent = await detectChatIntent(message);
  if (intent) {
    addTypingIndicator();
    await new Promise(r => setTimeout(r, 350));
    removeTypingIndicator();
    addChatMessage(intent.reply, 'ai', true);
    try { await intent.action(); } catch (e) { console.error('Agent action failed:', e); }
    return;
  }

  //  Step 2: fall back to Claude AI for questions
  addTypingIndicator();
  try {
    // Last 5 messages as context window (trimmed to save tokens)
    const { chatHistory = [] } = await chrome.storage.local.get('chatHistory');
    const conversationHistory = chatHistory.slice(-5).map(m => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.text.substring(0, 500)
    }));

    const response = await chrome.runtime.sendMessage({
      action: 'CHAT',
      message,
      conversationHistory,
      context: {
        url: currentUrl,
        score: currentAudit?.score || 0,
        grade: currentAudit?.grade || 'N/A',
        issues: currentAudit?.issues || [],
        categories: currentAudit?.categories || {},
        pageSpeedInsights: currentAudit?.pageSpeedInsights || null,
        localSEO: currentAudit?._localSEO || null,
      }
    });
    removeTypingIndicator();
    addChatMessage(response?.reply || 'Unable to get response.', 'ai', true);
  } catch {
    removeTypingIndicator();
    addChatMessage('Connection error. Make sure backend is running.', 'ai', false);
  }
}

const CHAT_MAX_PERSIST = 60; // max messages kept in storage

function addChatMessage(text, role, stream = false) {
  const el = document.createElement('div');
  el.className = `chat-message ${role}`;
  if (stream && role === 'ai') {
    const p = document.createElement('div');
    p.className = 'chat-text';
    el.appendChild(p);
    sidebarChatMessages.appendChild(el);
    const words = text.split(/(\s+)/);
    let built = '';
    let wi = 0;
    const t = setInterval(() => {
      if (wi < words.length) {
        built += words[wi++];
        p.innerHTML = renderMarkdown(built) + '<span class="chat-cursor">|</span>';
        sidebarChatMessages.scrollTop = 9999;
      } else {
        clearInterval(t);
        p.innerHTML = renderMarkdown(text);
        sidebarChatMessages.scrollTop = 9999;
        persistChatMessage(text, role); // save after animation finishes
      }
    }, 28);
  } else {
    el.innerHTML = `<div class="chat-text">${role === 'ai' ? renderMarkdown(text) : escapeHtml(text)}</div>`;
    sidebarChatMessages.appendChild(el);
    sidebarChatMessages.scrollTop = 9999;
    persistChatMessage(text, role);
  }
}

function persistChatMessage(text, role) {
  chrome.storage.local.get('chatHistory', ({ chatHistory = [] }) => {
    chatHistory.push({ text, role, ts: Date.now() });
    if (chatHistory.length > CHAT_MAX_PERSIST) chatHistory = chatHistory.slice(-CHAT_MAX_PERSIST);
    chrome.storage.local.set({ chatHistory });
  });
}

async function loadChatHistory() {
  const { chatHistory = [] } = await chrome.storage.local.get('chatHistory');
  if (!chatHistory.length) return;
  chatHistory.forEach(({ text, role }) => {
    const el = document.createElement('div');
    el.className = `chat-message ${role}`;
    el.innerHTML = `<div class="chat-text">${role === 'ai' ? renderMarkdown(text) : escapeHtml(text)}</div>`;
    sidebarChatMessages.appendChild(el);
  });
  sidebarChatMessages.scrollTop = 9999;
}

function clearChatHistory() {
  chrome.storage.local.remove('chatHistory');
  sidebarChatMessages.innerHTML = '';
}

function renderMarkdown(text) {
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/^### (.+)$/gm,'<strong class="chat-section">$1</strong>')
    .replace(/^## (.+)$/gm,'<strong class="chat-section">$1</strong>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/`([^`]+)`/g,'<code class="inline-code">$1</code>')
    .replace(/^\d+\. (.+)$/gm,'<div class="chat-list-item num">$1</div>')
    .replace(/^[-•] (.+)$/gm,'<div class="chat-list-item">• $1</div>')
    .replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>');
}

function addTypingIndicator() {
  const el = document.createElement('div');
  el.className = 'chat-message ai typing';
  el.id = 'typing-indicator';
  el.innerHTML = `<p><span class="dot"></span><span class="dot"></span><span class="dot"></span></p>`;
  sidebarChatMessages.appendChild(el);
  sidebarChatMessages.scrollTop = 9999;
}
function removeTypingIndicator() {
  document.getElementById('typing-indicator')?.remove();
}

// ─── REPORT SYSTEM ────────────────────────────────────────────────────────────
//  buildReportJson — canonical audit data structure
//  Single source of truth: store in DB, repopulate report, drive history
// ──────────────────────────────────────────────────────────────────────────────

function buildReportJson(audit, pageData, url, keywords) {
  const issues   = audit.issues || [];
  const critical = issues.filter(i => i.type === 'critical');
  const warnings = issues.filter(i => i.type === 'warning');
  const ps       = audit.pageSpeedInsights || {};
  const local    = audit._localSEO || {};

  // On-page fields
  const titleLen  = pageData.titleLength || (pageData.title || '').length;
  const metaLen   = pageData.metaDescLength || (pageData.metaDescription || '').length;
  const h1s       = pageData.h1Tags || [];
  const wordCount = pageData.wordCount || 0;
  const imgMissing = pageData.imgsMissingAlt || [];

  // Build onPage first so we can count passed checks from actual statuses
  const onPageData = {
    title:           { value: pageData.title || '', length: titleLen, status: !pageData.title ? 'bad' : (titleLen >= 50 && titleLen <= 60 ? 'good' : 'warn') },
    metaDescription: { value: pageData.metaDescription || '', length: metaLen, status: !pageData.metaDescription ? 'bad' : (metaLen >= 140 && metaLen <= 165 ? 'good' : 'warn') },
    h1:              { count: h1s.length, values: h1s.slice(0, 3), status: h1s.length === 1 ? 'good' : h1s.length === 0 ? 'bad' : 'warn' },
    canonical:       { url: pageData.canonical || '', status: pageData.canonical ? 'good' : 'warn' },
    robots:          { value: pageData.robots || 'index,follow', status: !(pageData.robots || '').includes('noindex') ? 'good' : 'bad' },
    og:              { title: pageData.og?.title || '', description: pageData.og?.description || '', image: pageData.og?.image || '', status: (pageData.og?.title && pageData.og?.description && pageData.og?.image) ? 'good' : pageData.og?.title ? 'warn' : 'bad' },
    schema:          { types: pageData.schemaTypes || [], status: (pageData.schemaTypes || []).length > 0 ? 'good' : 'warn' },
    images:          { total: pageData.imageCount || (pageData.imageDetails || []).length || 0, missingAlt: imgMissing.length, status: imgMissing.length === 0 ? 'good' : imgMissing.length <= 3 ? 'warn' : 'bad' },
    wordCount,
    headings: pageData.headings || [],
  };
  const passedCount = Object.values(onPageData).filter(v => v && typeof v === 'object' && v.status === 'good').length;

  // Composite scores
  const onPageScore  = audit.onPageScore  ?? Math.round(100 - (critical.length * 12) - (warnings.length * 5));
  const techScore    = audit.techScore    ?? (ps.performanceScore != null ? Math.round(ps.performanceScore) : null);
  const contentScore = audit.contentScore ?? (wordCount >= 1000 ? 85 : wordCount >= 500 ? 65 : 40);
  const localScore   = audit.localScore   ?? null;

  // CLS from CrUX is stored as integer × 1000 (e.g. 19 = 0.019)
  const clsValue = ps.crux?.cls != null ? +(ps.crux.cls / 1000).toFixed(3) : null;

  return {
    version: '2.0',
    meta: {
      url:        url || audit.url || '',
      hostname:   (() => { try { return new URL(audit.url || url || '').hostname; } catch { return url || ''; } })(),
      title:      pageData.title || currentPageTitle || '',
      auditDate:  audit.timestamp || new Date().toISOString(),
      auditor:    'Naraseo AI v2',
    },
    scores: {
      overall:  audit.score  || 0,
      grade:    audit.grade  || '--',
      onPage:   Math.max(0, Math.min(100, onPageScore)),
      technical: techScore,
      content:  Math.max(0, Math.min(100, contentScore)),
      local:    localScore,
    },
    issueSummary: {
      critical: critical.length,
      warnings: warnings.length,
      passed:   passedCount,
      total:    issues.length,
    },
    onPage: onPageData,
    technical: {
      pageSpeed: {
        mobile:  { score: ps.performanceScore ?? null, fcp: ps.crux?.fcp ?? null, lcp: ps.crux?.lcp ?? null, cls: clsValue, tbt: ps.tbt ?? null },
        desktop: { score: ps.desktopScore ?? null },
      },
      opportunities: (ps.opportunities || []).slice(0, 6),
      ssl:    { status: (audit.url || '').startsWith('https') ? 'good' : 'bad' },
      mobile: { score: ps.mobileScore ?? null, status: (ps.mobileScore ?? 80) >= 70 ? 'good' : 'warn' },
    },
    localSeo: {
      hasSchema:   !!(pageData.schemaTypes || []).find(t => /local|business|organization/i.test(t)),
      hasNAP:      !!(local.phone || local.address),
      hasMapEmbed: !!local.mapEmbed,
      phone:       local.phone || '',
      address:     local.address || '',
      signals:     local.signals || [],
    },
    backlinks: audit.backlinks || null,
    issues: issues.map(i => ({
      type:       i.type,
      issue:      i.issue || i.title || '',
      suggestion: i.suggestion || i.detail || '',
      effort:     i.effort || '',
      category:   i.category || '',
    })),
    keywords: keywords || null,
    actionPlan: (audit.priorityActions || critical.concat(warnings).slice(0, 8)).map((i, idx) => ({
      priority: idx + 1,
      action:   i.issue || i.title || '',
      impact:   i.impact || i.suggestion || '',
      effort:   i.effort || (i.type === 'critical' ? '15 min' : '30 min'),
      type:     i.type,
    })),
  };
}

// ─── SECTION RENDERERS ────────────────────────────────────────────────────────

function rptEsc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function rptBadge(status) {
  const map = { good: ['#dcfce7','#15803d','Good'], warn: ['#fef9c3','#a16207','Needs Work'], bad: ['#fee2e2','#b91c1c','Fix Now'] };
  const [bg, fg, label] = map[status] || map.bad;
  return `<span style="background:${bg};color:${fg};padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.3px;">${label}</span>`;
}

function rptScoreCircle(val, color, size = 64) {
  if (val == null) return `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#94a3b8;">N/A</div>`;
  const r = size * 0.38, cx = size / 2, cy = size / 2;
  const c = 2 * Math.PI * r, dash = (val / 100) * c;
  const col = val >= 80 ? '#16a34a' : val >= 60 ? '#d97706' : '#dc2626';
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="5"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="5"
      stroke-dasharray="${dash} ${c}" stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"/>
    <text x="${cx}" y="${cy}" text-anchor="middle" dy=".35em"
      style="font-size:${size * 0.22}px;font-weight:800;fill:#1e293b;">${val}</text>
  </svg>`;
}

function rptCard(title, accentColor, bodyHtml) {
  return `<div class="card">
    <div style="padding:16px 20px 0;display:flex;align-items:center;gap:8px;">
      <div style="width:3px;height:18px;background:${accentColor};border-radius:2px;"></div>
      <span style="font-size:14px;font-weight:700;color:#0f172a;">${rptEsc(title)}</span>
    </div>
    <div class="card-body">${bodyHtml}</div>
  </div>`;
}

function rptTable(rows) {
  return `<table style="width:100%;border-collapse:collapse;font-size:12px;">
    <tbody>${rows.map((r, i) => `<tr style="${i % 2 ? 'background:#f8fafc;' : ''}border-bottom:1px solid #f1f5f9;">
      <td style="padding:9px 12px;font-weight:600;color:#374151;width:150px;white-space:nowrap;">${rptEsc(r[0])}</td>
      <td style="padding:9px 12px;color:#475569;max-width:300px;word-break:break-word;">${r[1]}</td>
      <td style="padding:9px 12px;text-align:right;white-space:nowrap;">${rptBadge(r[2])}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function rptIssueTable(issues, emptyMsg) {
  if (!issues.length) return `<p style="padding:12px;text-align:center;color:#94a3b8;font-size:12px;">${emptyMsg || 'None — great job!'}</p>`;
  return `<table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead><tr style="background:#f8fafc;border-bottom:1.5px solid #e2e8f0;">
      <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;">#</th>
      <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;">Issue</th>
      <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;">Fix</th>
    </tr></thead>
    <tbody>${issues.map((i, idx) => `<tr style="${idx % 2 ? 'background:#fafbff;' : ''}border-bottom:1px solid #f1f5f9;">
      <td style="padding:9px 12px;color:#94a3b8;font-weight:700;">${idx + 1}</td>
      <td style="padding:9px 12px;font-weight:600;color:#1e293b;">${rptEsc(i.issue)}</td>
      <td style="padding:9px 12px;color:#475569;line-height:1.5;">${rptEsc(i.suggestion || 'Review and fix.')}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// Section: Cover / Header
function rptHeaderSection(d) {
  const { meta, scores, issueSummary } = d;
  const dateStr = new Date(meta.auditDate).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
  const gradeColor = scores.overall >= 80 ? '#16a34a' : scores.overall >= 60 ? '#d97706' : '#dc2626';
  const gradeBg    = scores.overall >= 80 ? '#dcfce7' : scores.overall >= 60 ? '#fef9c3' : '#fee2e2';
  return `<div class="card" style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);border:none;">
  <div class="card-body" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:20px;padding:28px 28px;">
    <div>
      <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#94a3b8;margin-bottom:6px;">SEO Audit Report</div>
      <div style="font-size:20px;font-weight:800;color:#f1f5f9;margin-bottom:4px;">${rptEsc(meta.hostname)}</div>
      <div style="font-size:11px;color:#64748b;">${rptEsc(meta.url)}</div>
      <div style="font-size:11px;color:#475569;margin-top:8px;">${dateStr} &nbsp;|&nbsp; Naraseo AI v2</div>
    </div>
    <div style="display:flex;align-items:center;gap:16px;">
      <div style="text-align:center;">
        <div style="font-size:44px;font-weight:900;line-height:1;color:${gradeColor};background:${gradeBg};width:80px;height:80px;display:flex;align-items:center;justify-content:center;border-radius:16px;">${rptEsc(scores.grade)}</div>
        <div style="font-size:10px;color:#64748b;margin-top:4px;">Grade</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:44px;font-weight:900;line-height:1;color:#f1f5f9;">${scores.overall}</div>
        <div style="font-size:10px;color:#64748b;margin-top:4px;">Score / 100</div>
      </div>
    </div>
  </div>
  <div style="display:flex;gap:0;border-top:1px solid rgba(255,255,255,0.08);">
    ${[['Critical Issues', issueSummary.critical, '#dc2626'], ['Warnings', issueSummary.warnings, '#d97706'], ['Passed Checks', issueSummary.passed, '#16a34a']].map(([label, val, col]) =>
      `<div style="flex:1;padding:12px;text-align:center;border-right:1px solid rgba(255,255,255,0.06);">
        <div style="font-size:22px;font-weight:800;color:${col};">${val}</div>
        <div style="font-size:10px;color:#64748b;">${label}</div>
      </div>`
    ).join('')}
  </div>
</div>`;
}

// Section: Executive Summary
function rptExecutiveSummarySection(d) {
  const { meta, scores, issueSummary, issues } = d;
  const topCritical = issues.filter(i => i.type === 'critical').slice(0, 4);
  const healthLabel = scores.overall >= 80 ? 'strong' : scores.overall >= 60 ? 'moderate — with key areas to improve' : 'needs urgent attention';
  return rptCard('Executive Summary', '#2563eb', `
    <p style="font-size:13px;color:#374151;line-height:1.7;margin-bottom:12px;">
      <strong>${rptEsc(meta.hostname)}</strong> has an overall SEO health of <strong>${healthLabel}</strong>,
      scoring <strong>${scores.overall}/100</strong>. There are <strong>${issueSummary.critical} critical issue${issueSummary.critical !== 1 ? 's' : ''}</strong>
      and <strong>${issueSummary.warnings} warning${issueSummary.warnings !== 1 ? 's' : ''}</strong> that, if resolved,
      could meaningfully improve organic search visibility and traffic.
    </p>
    ${topCritical.length ? `<div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:8px;">Top issues to fix:</div>
    <ul style="margin:0 0 0 16px;padding:0;">
      ${topCritical.map(i => `<li style="font-size:12px;color:#374151;margin-bottom:5px;line-height:1.5;"><strong>${rptEsc(i.issue)}</strong> — ${rptEsc(i.suggestion)}</li>`).join('')}
    </ul>` : ''}
  `);
}

// Section: Score Breakdown (4 pillars)
function rptScoreBreakdownSection(d) {
  const { scores } = d;
  const pillars = [
    { label: 'On-Page SEO',   score: scores.onPage,    desc: 'Title, meta, H1, schema, OG tags' },
    { label: 'Technical',     score: scores.technical, desc: 'PageSpeed, mobile, HTTPS' },
    { label: 'Content',       score: scores.content,   desc: 'Word count, readability, structure' },
    { label: 'Local / GEO',   score: scores.local,     desc: 'NAP, schema, map embed' },
  ];
  return rptCard('Score Breakdown', '#7c3aed', `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
      ${pillars.map(p => `<div style="text-align:center;padding:16px 8px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
        ${rptScoreCircle(p.score, '#2563eb', 64)}
        <div style="font-size:11px;font-weight:700;color:#0f172a;margin-top:8px;">${p.label}</div>
        <div style="font-size:10px;color:#94a3b8;margin-top:3px;line-height:1.4;">${p.desc}</div>
      </div>`).join('')}
    </div>
  `);
}

// Section: On-Page Analysis
function rptOnPageSection(d) {
  const { onPage } = d;
  const titleDisplay = onPage.title.value ? `${rptEsc(onPage.title.value.substring(0, 45))}${onPage.title.value.length > 45 ? '…' : ''} <span style="color:#94a3b8;">(${onPage.title.length}ch)</span>` : '<span style="color:#dc2626;">Missing</span>';
  const metaDisplay  = onPage.metaDescription.value ? `${rptEsc(onPage.metaDescription.value.substring(0, 55))}… <span style="color:#94a3b8;">(${onPage.metaDescription.length}ch)</span>` : '<span style="color:#dc2626;">Missing</span>';
  const rows = [
    ['Title Tag',        titleDisplay,                                                     onPage.title.status],
    ['Meta Description', metaDisplay,                                                      onPage.metaDescription.status],
    ['H1 Tag',           `${onPage.h1.count} found${onPage.h1.values[0] ? ': ' + rptEsc(onPage.h1.values[0].substring(0,40)) : ''}`, onPage.h1.status],
    ['Canonical URL',    onPage.canonical.url ? rptEsc(onPage.canonical.url.substring(0,50)) : 'Not set',   onPage.canonical.status],
    ['Robots Meta',      rptEsc(onPage.robots.value || 'index,follow'),                   onPage.robots.status],
    ['Open Graph',       onPage.og.title ? 'Title, description, image set' : 'Incomplete', onPage.og.status],
    ['Schema Markup',    onPage.schema.types.length ? rptEsc(onPage.schema.types.slice(0,3).join(', ')) : 'None found', onPage.schema.status],
    ['Image Alt Text',   `${onPage.images.missingAlt} of ${onPage.images.total} missing`,  onPage.images.status],
    ['Word Count',       `${onPage.wordCount} words`,                                      onPage.wordCount >= 1000 ? 'good' : onPage.wordCount >= 500 ? 'warn' : 'bad'],
  ];
  return rptCard('On-Page Analysis', '#2563eb', rptTable(rows));
}

// Section: Technical Performance
function rptTechnicalSection(d) {
  const { technical } = d;
  const mob = technical.pageSpeed.mobile;
  const vitals = [
    mob.fcp  && `<div style="display:inline-block;background:#f1f5f9;border-radius:7px;padding:8px 12px;margin:4px;text-align:center;min-width:70px;"><div style="font-size:14px;font-weight:700;color:#0f172a;">${mob.fcp}</div><div style="font-size:10px;color:#64748b;">FCP</div></div>`,
    mob.lcp  && `<div style="display:inline-block;background:#f1f5f9;border-radius:7px;padding:8px 12px;margin:4px;text-align:center;min-width:70px;"><div style="font-size:14px;font-weight:700;color:#0f172a;">${mob.lcp}</div><div style="font-size:10px;color:#64748b;">LCP</div></div>`,
    mob.tbt  && `<div style="display:inline-block;background:#f1f5f9;border-radius:7px;padding:8px 12px;margin:4px;text-align:center;min-width:70px;"><div style="font-size:14px;font-weight:700;color:#0f172a;">${mob.tbt}</div><div style="font-size:10px;color:#64748b;">TBT</div></div>`,
    mob.cls != null && `<div style="display:inline-block;background:#f1f5f9;border-radius:7px;padding:8px 12px;margin:4px;text-align:center;min-width:70px;"><div style="font-size:14px;font-weight:700;color:#0f172a;">${mob.cls}</div><div style="font-size:10px;color:#64748b;">CLS</div></div>`,
  ].filter(Boolean).join('');

  const scores = [
    technical.pageSpeed.mobile.score != null  && `<div style="text-align:center;">${rptScoreCircle(technical.pageSpeed.mobile.score, '#2563eb', 60)}<div style="font-size:10px;color:#64748b;margin-top:4px;">Mobile Speed</div></div>`,
    technical.pageSpeed.desktop.score != null && `<div style="text-align:center;">${rptScoreCircle(technical.pageSpeed.desktop.score, '#7c3aed', 60)}<div style="font-size:10px;color:#64748b;margin-top:4px;">Desktop Speed</div></div>`,
    technical.mobile.score != null            && `<div style="text-align:center;">${rptScoreCircle(technical.mobile.score, '#0891b2', 60)}<div style="font-size:10px;color:#64748b;margin-top:4px;">Mobile UX</div></div>`,
  ].filter(Boolean).join('');

  const opps = technical.opportunities.length
    ? `<div style="font-size:12px;font-weight:700;color:#0f172a;margin:14px 0 8px;">Top Opportunities</div>
       ${technical.opportunities.map(o => `<div style="background:#fefce8;border:1px solid #fde68a;border-radius:7px;padding:9px 12px;margin-bottom:6px;font-size:12px;">
         <strong style="color:#92400e;">${rptEsc(o.title || o.id)}</strong>
         ${o.displayValue ? `<span style="color:#a16207;"> — ${rptEsc(o.displayValue)}</span>` : ''}
       </div>`).join('')}` : '';

  return rptCard('Technical Performance', '#0891b2', `
    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:${vitals ? '12px' : '0'};">
      ${scores}
    </div>
    ${vitals ? `<div style="margin-bottom:4px;">${vitals}</div>` : ''}
    ${opps}
    <div style="display:flex;gap:8px;margin-top:12px;">
      <div style="flex:1;background:#f8fafc;border-radius:7px;padding:9px 12px;font-size:12px;">
        <strong>HTTPS:</strong> <span style="color:${d.technical.ssl.status === 'good' ? '#16a34a' : '#dc2626'}">${d.technical.ssl.status === 'good' ? 'Secure' : 'Not secure'}</span>
      </div>
    </div>
  `);
}

// Section: Local SEO
function rptLocalSeoSection(d) {
  const { localSeo } = d;
  const rows = [
    ['Business Schema', localSeo.hasSchema ? 'LocalBusiness schema found' : 'Not found',   localSeo.hasSchema ? 'good' : 'bad'],
    ['NAP (Name/Address/Phone)', (localSeo.hasNAP ? (localSeo.phone || localSeo.address || 'Found') : 'Not detected'), localSeo.hasNAP ? 'good' : 'warn'],
    ['Map Embed',       localSeo.hasMapEmbed ? 'Found' : 'Not found',                       localSeo.hasMapEmbed ? 'good' : 'warn'],
  ];
  return rptCard('Local & GEO SEO', '#16a34a', rptTable(rows));
}

// Section: Issues
function rptIssuesSection(d) {
  const critical = d.issues.filter(i => i.type === 'critical');
  const warnings = d.issues.filter(i => i.type === 'warning');
  return `
    ${rptCard(`Critical Issues (${critical.length})`, '#dc2626', rptIssueTable(critical, 'No critical issues — great work!'))}
    ${rptCard(`Warnings (${warnings.length})`, '#d97706', rptIssueTable(warnings, 'No warnings.'))}
  `;
}

// Section: Action Plan
function rptActionPlanSection(d) {
  if (!d.actionPlan.length) return '';
  const effortColor = e => e && e.includes('min') && parseInt(e) <= 15 ? '#16a34a' : e && e.includes('hr') ? '#d97706' : '#2563eb';
  return rptCard('Prioritized Action Plan', '#7c3aed', `
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="background:#f8fafc;border-bottom:1.5px solid #e2e8f0;">
        <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;">#</th>
        <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;">Action</th>
        <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;">Impact</th>
        <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;">Effort</th>
      </tr></thead>
      <tbody>${d.actionPlan.map((a, idx) => `<tr style="${idx % 2 ? 'background:#fafbff;' : ''}border-bottom:1px solid #f1f5f9;">
        <td style="padding:9px 12px;color:#94a3b8;font-weight:700;">${a.priority}</td>
        <td style="padding:9px 12px;font-weight:600;color:#1e293b;">${rptEsc(a.action)}</td>
        <td style="padding:9px 12px;color:#475569;line-height:1.5;">${rptEsc(a.impact)}</td>
        <td style="padding:9px 12px;"><span style="color:${effortColor(a.effort)};font-weight:700;">${rptEsc(a.effort || '--')}</span></td>
      </tr>`).join('')}</tbody>
    </table>
  `);
}

// Section: Business Impact (ROI estimate)
function rptBusinessImpactSection(d) {
  const { scores, issueSummary } = d;
  const trafficGain = issueSummary.critical >= 3 ? '25–45%' : issueSummary.critical >= 1 ? '10–25%' : '5–15%';
  const rankingBoost = issueSummary.critical >= 3 ? '3–8 positions' : '1–3 positions';
  return rptCard('Estimated Business Impact', '#d97706', `
    <p style="font-size:12px;color:#374151;line-height:1.7;margin-bottom:14px;">
      Based on identified issues and current score of <strong>${scores.overall}/100</strong>, resolving all critical issues could realistically produce:
    </p>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
      ${[
        ['Organic Traffic', `+${trafficGain}`, 'within 60–90 days of fixes'],
        ['Ranking Improvement', rankingBoost, 'for target keywords'],
        ['Click-Through Rate', '+10–20%', 'from improved titles/meta'],
      ].map(([label, val, note]) => `<div style="background:#fefce8;border:1px solid #fde68a;border-radius:9px;padding:12px;text-align:center;">
        <div style="font-size:18px;font-weight:800;color:#92400e;">${val}</div>
        <div style="font-size:11px;font-weight:700;color:#a16207;margin:3px 0;">${label}</div>
        <div style="font-size:10px;color:#b45309;">${note}</div>
      </div>`).join('')}
    </div>
  `);
}

// Section: Keywords
function rptKeywordsSection(d) {
  if (!d.keywords) return '';
  const kw = d.keywords;
  // Trend label for report
  const trendLabel = kw._trends
    ? ` — ${kw._trends.trend.charAt(0).toUpperCase() + kw._trends.trend.slice(1)} ${kw._trends.changePct > 0 ? '+' : ''}${kw._trends.changePct}% (12 months)`
    : '';

  const volBadge = v => {
    const map = { high: ['#dbeafe','#1e40af','High Volume'], medium: ['#fef9c3','#a16207','Med Volume'], low: ['#f1f5f9','#64748b','Low Volume'] };
    const [bg, fg, label] = map[v] || map.low;
    return `<span style="background:${bg};color:${fg};font-size:10px;font-weight:700;padding:1px 6px;border-radius:99px;">${label}</span>`;
  };

  return rptCard('Keyword Research', '#0891b2', `
    ${kw._dataSource ? `<div style="font-size:10px;color:#94a3b8;text-align:right;margin-bottom:8px;">${rptEsc(kw._dataSource)}</div>` : ''}
    ${kw.summary ? `<p style="font-size:12px;color:#374151;margin-bottom:12px;line-height:1.6;">${rptEsc(kw.summary)}</p>` : ''}

    ${kw.primary ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 14px;margin-bottom:14px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;margin-bottom:4px;">Primary Keyword</div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
        <span style="font-size:15px;font-weight:800;color:#0f172a;">"${rptEsc(kw.primary.keyword)}"</span>
        ${kw.primary.volume_tier ? volBadge(kw.primary.volume_tier) : ''}
        ${kw._trends ? `<span style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:99px;background:${kw._trends.trend==='rising'?'#dcfce7':kw._trends.trend==='declining'?'#fee2e2':'#f1f5f9'};color:${kw._trends.trend==='rising'?'#15803d':kw._trends.trend==='declining'?'#b91c1c':'#475569'};">${kw._trends.trend==='rising'?'↑':kw._trends.trend==='declining'?'↓':'→'} ${kw._trends.trend}${trendLabel}</span>` : ''}
      </div>
      <div style="font-size:11px;color:#6b7280;">Density: <strong>${rptEsc(kw.primary.current_density)}</strong> (target: ${rptEsc(kw.primary.target_density)}) &nbsp;|&nbsp; Status: <strong style="color:${kw.primary.status==='good'?'#16a34a':kw.primary.status==='low'?'#d97706':'#dc2626'}">${rptEsc((kw.primary.status||'').toUpperCase())}</strong></div>
      ${kw.primary.note ? `<div style="font-size:11px;color:#374151;margin-top:6px;padding:5px 8px;background:#fff;border-radius:5px;">${rptEsc(kw.primary.note)}</div>` : ''}
    </div>` : ''}

    ${(kw._realSearches || []).length ? `
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#374151;margin:0 0 6px;display:flex;align-items:center;gap:6px;">
      Search Intelligence
      <span style="background:#dbeafe;color:#1e40af;font-size:9px;font-weight:700;padding:1px 6px;border-radius:99px;text-transform:none;">Live data</span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px;">
      ${(kw._realSearches || []).map(s => `<span style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:3px 9px;font-size:11px;color:#1e293b;">↗ ${rptEsc(s)}</span>`).join('')}
    </div>` : ''}

    ${(kw.gaps || []).length ? `
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#374151;margin:0 0 6px;">Keyword Gaps — Opportunities</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px;">
      <thead><tr style="background:#f8fafc;border-bottom:1.5px solid #e2e8f0;">
        <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;">Keyword</th>
        <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;">Intent</th>
        <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;">Difficulty</th>
        <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;">Volume</th>
        <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;">Action</th>
      </tr></thead>
      <tbody>${(kw.gaps || []).map((g, i) => `<tr style="${i%2?'background:#fafbff;':''}border-bottom:1px solid #f1f5f9;">
        <td style="padding:8px 12px;font-weight:600;color:#1e293b;">${rptEsc(g.keyword)}</td>
        <td style="padding:8px 12px;color:#475569;">${rptEsc(g.search_intent)}</td>
        <td style="padding:8px 12px;color:#475569;">${rptEsc(g.difficulty)}</td>
        <td style="padding:8px 12px;">${g.volume_tier ? volBadge(g.volume_tier) : '--'}</td>
        <td style="padding:8px 12px;color:#475569;font-size:11px;">${rptEsc(g.action)}</td>
      </tr>`).join('')}</tbody>
    </table>` : ''}

    ${(kw.quick_wins || []).length ? `
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#374151;margin:0 0 6px;">Quick Wins</div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 12px;">
      ${(kw.quick_wins).map(w => `<div style="display:flex;gap:8px;font-size:12px;color:#374151;padding:3px 0;line-height:1.5;"><span style="color:#16a34a;font-weight:800;flex-shrink:0;">→</span>${rptEsc(w)}</div>`).join('')}
    </div>` : ''}
  `);
}

// Section: Off-Page / Backlinks
function rptOffPageSection(d) {
  if (!d.backlinks) return '';
  const bl = d.backlinks;
  const pr = bl.pageRank ?? bl.openPageRank ?? bl.domainRating ?? '--';
  const dr = bl.domainRank != null ? `#${Number(bl.domainRank).toLocaleString()}` : (bl.referringDomains ?? '--');
  const tbl = bl.totalBacklinks ?? (bl.domainRank != null ? 'See OpenPageRank' : '--');
  return rptCard('Off-Page / Domain Authority', '#7c3aed', `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
      ${[
        ['Google PageRank', pr, 'scale 0–10'],
        ['Domain Rank', dr, 'global position'],
        ['Source', rptEsc(bl.source || 'OpenPageRank'), bl.status === 'ok' ? 'live data' : 'unavailable'],
      ].map(([label, val, note]) => `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;padding:14px;text-align:center;">
        <div style="font-size:${String(val).length > 6 ? '14' : '24'}px;font-weight:800;color:#1e293b;">${rptEsc(String(val))}</div>
        <div style="font-size:11px;font-weight:700;color:#0f172a;margin:3px 0;">${label}</div>
        <div style="font-size:10px;color:#94a3b8;">${note}</div>
      </div>`).join('')}
    </div>
  `);
}

// Section: Recommendations
function rptRecommendationsSection(d) {
  const { scores, issueSummary } = d;
  const recs = [
    issueSummary.critical > 0 && `Fix all <strong>${issueSummary.critical} critical issue${issueSummary.critical !== 1 ? 's' : ''}</strong> immediately — these have the highest SEO impact.`,
    issueSummary.warnings > 0 && `Address <strong>${issueSummary.warnings} warning${issueSummary.warnings !== 1 ? 's' : ''}</strong> within the next 2 weeks.`,
    scores.technical && scores.technical < 70 && 'Improve page speed — Google uses Core Web Vitals as a ranking factor.',
    !d.localSeo.hasSchema && 'Add LocalBusiness schema markup to improve local search visibility.',
    !d.onPage.og.title && 'Add Open Graph tags to improve click-through rates on social media.',
    'Monitor Core Web Vitals monthly via Google Search Console.',
    'Schedule a follow-up audit in 30 days to track progress.',
  ].filter(Boolean);
  return rptCard('Recommendations', '#2563eb', `
    <ol style="margin:0 0 0 18px;padding:0;">${recs.map(r => `<li style="font-size:12px;color:#374151;margin-bottom:8px;line-height:1.6;">${r}</li>`).join('')}</ol>
  `);
}

// Section: Footer
function rptFooterSection(d, userPlan) {
  const dateStr = new Date(d.meta.auditDate).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
  const branding = userPlan === 'free'
    ? `<span style="margin-left:12px;padding:2px 10px;background:#f1f5f9;border-radius:20px;font-size:10px;color:#64748b;">Generated by Naraseo AI — Professional SEO worth $1,500–$5,000 agency rates</span>`
    : '';
  return `<div style="text-align:center;padding:20px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;margin-top:8px;">
    Naraseo AI &nbsp;|&nbsp; ${rptEsc(d.meta.hostname)} &nbsp;|&nbsp; ${dateStr}
    ${branding}
  </div>`;
}

// ─── MAIN RENDERER ────────────────────────────────────────────────────────────
function buildReportHtml(reportJson, userPlan) {
  return populatePdfTemplate({
    pageUrl:                   rptEsc(reportJson.meta.url),
    headerSection:             rptHeaderSection(reportJson),
    executiveSummarySection:   rptExecutiveSummarySection(reportJson),
    scoreBreakdownSection:     rptScoreBreakdownSection(reportJson),
    onPageAnalysisSection:     rptOnPageSection(reportJson),
    technicalAnalysisSection:  rptTechnicalSection(reportJson),
    localSeoSection:           rptLocalSeoSection(reportJson),
    issuesSection:             rptIssuesSection(reportJson),
    actionPlanSection:         rptActionPlanSection(reportJson),
    keywordsSection:           rptKeywordsSection(reportJson),
    businessImpactSection:     rptBusinessImpactSection(reportJson),
    offPageSection:            rptOffPageSection(reportJson),
    recommendationsSection:    rptRecommendationsSection(reportJson),
    footerSection:             rptFooterSection(reportJson, userPlan),
  });
}

// ─── DOWNLOAD REPORT ─────────────────────────────────────────────────────────
async function downloadReport() {
  if (!currentAudit) {
    alert('Run an audit first to generate a report.');
    return;
  }

  const btnDl = document.getElementById('btn-download');
  if (btnDl) { btnDl.textContent = 'Generating...'; btnDl.disabled = true; }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const pageData = await getPageData(tab.id);
    const { userPlan = 'free' } = await chrome.storage.local.get('userPlan');

    const reportJson = buildReportJson(currentAudit, pageData || {}, currentUrl, currentKeywords);
    currentAudit._reportJson = reportJson;
    chrome.storage.local.set({ currentAudit });

    const html = buildReportHtml(reportJson, userPlan);
    const hostname = reportJson.meta?.hostname || 'report';
    const dateSlug = new Date().toISOString().split('T')[0];
    const filename = `naraseo_seo_report.pdf`;

    // Get html2pdf library source from extension bundle
    const html2pdfUrl = chrome.runtime.getURL('lib/html2pdf.bundle.min.js');
    const html2pdfResp = await fetch(html2pdfUrl);
    const html2pdfSrc = await html2pdfResp.text();

    // Inject html2pdf + auto-save script into report HTML — opens in new tab, auto-downloads
    const autoSaveScript = `
<script>
${html2pdfSrc}
window.addEventListener('load', function() {
  var opt = {
    margin: [8, 8, 8, 8],
    filename: '${filename}',
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  html2pdf().set(opt).from(document.body).save().then(function() {
    setTimeout(function() { window.close(); }, 1000);
  });
});
</script>`;
    const fullHtml = html.replace('</body>', autoSaveScript + '</body>');

    // Open in new tab — html2pdf runs there and auto-downloads the PDF
    await chrome.tabs.create({ url: 'data:text/html;charset=utf-8,' + encodeURIComponent(fullHtml) });

  } catch (err) {
    console.error('[Report] Failed:', err);
    // Final fallback: open with print dialog
    try {
      const { userPlan = 'free' } = await chrome.storage.local.get('userPlan');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const pageData = await getPageData(tab.id);
      const reportJson = buildReportJson(currentAudit, pageData || {}, currentUrl, currentKeywords);
      let html = buildReportHtml(reportJson, userPlan);
      html = html.replace('</body>', '<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),600));</script></body>');
      await chrome.tabs.create({ url: 'data:text/html;charset=utf-8,' + encodeURIComponent(html) });
    } catch (e2) {
      alert('Report failed: ' + err.message);
    }
  } finally {
    if (btnDl) { btnDl.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Report'; btnDl.disabled = false; }
  }
}

//  AUTH OVERLAY (shown when audit clicked without login) 

function showAuditAuthOverlay() {
  const overlay = document.getElementById('audit-auth-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
    // Reset to login tab
    showOverlayForm('login');
    // Focus email field
    setTimeout(() => document.getElementById('overlay-login-email')?.focus(), 100);
  }
}

function closeAuditAuthOverlay() {
  const overlay = document.getElementById('audit-auth-overlay');
  if (overlay) overlay.style.display = 'none';
  pendingAuditAfterAuth = false;
}

function showOverlayForm(type) {
  const loginForm  = document.getElementById('overlay-login-form');
  const signupForm = document.getElementById('overlay-signup-form');
  const btnLogin   = document.getElementById('overlay-btn-login');
  const btnSignup  = document.getElementById('overlay-btn-signup');
  if (type === 'login') {
    loginForm.style.display  = 'flex';
    signupForm.style.display = 'none';
    btnLogin.classList.add('active');
    btnSignup.classList.remove('active');
  } else {
    loginForm.style.display  = 'none';
    signupForm.style.display = 'flex';
    btnSignup.classList.add('active');
    btnLogin.classList.remove('active');
  }
}

async function handleOverlayLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('overlay-login-email').value.trim();
  const password = document.getElementById('overlay-login-password').value;
  const errEl    = document.getElementById('overlay-login-error');
  const btn      = document.getElementById('overlay-login-submit');

  errEl.classList.remove('visible');
  btn.textContent = 'Signing in...';
  btn.disabled    = true;

  try {
    const res  = await fetch(`${BACKEND}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    await chrome.storage.local.set({ authUser: data.user, authToken: data.token, userPlan: data.user.plan || 'free' });
    showAccountView(data.user);
    closeAuditAuthOverlay();
    if (pendingAuditAfterAuth) {
      pendingAuditAfterAuth = false;
      runAudit();
    }
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.add('visible');
  } finally {
    btn.textContent = 'Sign In & Start Audit';
    btn.disabled    = false;
  }
}

async function handleOverlaySignup(e) {
  e.preventDefault();
  const name     = document.getElementById('overlay-signup-name').value.trim();
  const email    = document.getElementById('overlay-signup-email').value.trim();
  const password = document.getElementById('overlay-signup-password').value;
  const errEl    = document.getElementById('overlay-signup-error');
  const btn      = document.getElementById('overlay-signup-submit');

  errEl.classList.remove('visible');
  btn.textContent = 'Creating account...';
  btn.disabled    = true;

  try {
    const res  = await fetch(`${BACKEND}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Signup failed');

    await chrome.storage.local.set({ authUser: data.user, authToken: data.token, userPlan: data.user.plan || 'free' });
    showAccountView(data.user);
    closeAuditAuthOverlay();
    if (pendingAuditAfterAuth) {
      pendingAuditAfterAuth = false;
      runAudit();
    }
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.add('visible');
  } finally {
    btn.textContent = 'Create Account & Start Audit';
    btn.disabled    = false;
  }
}

//  AUTH SYSTEM 

const BACKEND = 'https://naraseoai.onrender.com';

//  Check auth state on init and update account tab 
async function initAuth() {
  const { authUser } = await chrome.storage.local.get('authUser');
  if (authUser) {
    showAccountView(authUser);
  } else {
    // PRODUCTION: Require login/signup - no demo users
    showAuthGate();
  }
}

function showAuthGate() {
  document.getElementById('auth-gate').style.display    = 'flex';
  document.getElementById('account-view').style.display = 'none';
  document.getElementById('account-tab-label').textContent = 'Account';
}

function showAccountView(user) {
  document.getElementById('auth-gate').style.display    = 'none';
  document.getElementById('account-view').style.display = 'block';

  const initials = (user.name || user.email || 'U').charAt(0).toUpperCase();
  document.getElementById('account-avatar').textContent = initials;
  document.getElementById('account-name').textContent   = user.name || 'User';
  document.getElementById('account-email').textContent  = user.email || '';

  const badge = document.getElementById('account-plan-badge');
  badge.textContent = (user.plan || 'FREE').toUpperCase();
  badge.className   = `account-plan-badge plan-${(user.plan || 'free').toLowerCase()}`;

  const tabLabel = document.getElementById('account-tab-label');
  if (tabLabel) tabLabel.textContent = initials;
  updatePlanUI(user.plan || 'free');
  updateUsageUI(user);
  initScheduleUI();
}

function updatePlanUI(plan) {
  // Hide all current badges
  ['free','pro','agency'].forEach(p => {
    const badge = document.getElementById(`${p}-current-badge`);
    if (badge) badge.style.display = 'none';
    document.getElementById(`plan-${p}`)?.classList.remove('active-plan');
  });
  // Show current plan badge
  const current = document.getElementById(`${plan}-current-badge`);
  if (current) current.style.display = 'block';
  document.getElementById(`plan-${plan}`)?.classList.add('active-plan');

  // Hide upgrade buttons for current/lower plans
  if (plan === 'pro') {
    document.getElementById('btn-upgrade-pro').style.display = 'none';
  }
  if (plan === 'agency') {
    document.getElementById('btn-upgrade-pro').style.display    = 'none';
    document.getElementById('btn-upgrade-agency').style.display = 'none';
  }
}

function updateUsageUI(user) {
  const auditLimit   = user.plan === 'free' ? 5 : Infinity;
  const historyLimit = user.plan === 'free' ? 5 : Infinity;
  const auditUsed    = user.auditsThisMonth || 0;
  const historyUsed  = user.historyCount    || 0;

  if (user.plan !== 'free') {
    document.getElementById('usage-card').style.display = 'none';
    return;
  }

  document.getElementById('usage-audits-count').textContent  = `${auditUsed} / 5`;
  document.getElementById('usage-history-count').textContent = `${historyUsed} / 5`;

  const auditBar   = document.getElementById('usage-bar-audits');
  const historyBar = document.getElementById('usage-bar-history');
  auditBar.style.width   = Math.min((auditUsed   / 5) * 100, 100) + '%';
  historyBar.style.width = Math.min((historyUsed / 5) * 100, 100) + '%';
  if (auditUsed   >= 5) auditBar.classList.add('over-limit');
  if (historyUsed >= 5) historyBar.classList.add('over-limit');
}

//  Auth form toggle 
function showAuthForm(type) {
  const loginForm  = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const btnLogin   = document.getElementById('btn-show-login');
  const btnSignup  = document.getElementById('btn-show-signup');

  if (type === 'login') {
    loginForm.style.display  = 'flex';
    signupForm.style.display = 'none';
    btnLogin.classList.add('active');
    btnSignup.classList.remove('active');
  } else {
    loginForm.style.display  = 'none';
    signupForm.style.display = 'flex';
    btnSignup.classList.add('active');
    btnLogin.classList.remove('active');
  }
}

//  Login 
async function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('btn-login-submit');

  errEl.classList.remove('visible');
  btn.textContent = 'Signing in...';
  btn.disabled    = true;

  try {
    const res  = await fetch(`${BACKEND}/api/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Login failed');

    await chrome.storage.local.set({ authUser: data.user, authToken: data.token, userPlan: data.user.plan || 'free' });
    showAccountView(data.user);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.add('visible');
  } finally {
    btn.textContent = 'Sign In';
    btn.disabled    = false;
  }
}

//  Signup 
async function handleSignup(e) {
  e.preventDefault();
  const name     = document.getElementById('signup-name').value.trim();
  const email    = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const errEl    = document.getElementById('signup-error');
  const btn      = document.getElementById('btn-signup-submit');

  errEl.classList.remove('visible');
  btn.textContent = 'Creating account...';
  btn.disabled    = true;

  try {
    const res  = await fetch(`${BACKEND}/api/auth/signup`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, email, password }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Signup failed');

    await chrome.storage.local.set({ authUser: data.user, authToken: data.token, userPlan: data.user.plan || 'free' });
    showAccountView(data.user);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.add('visible');
  } finally {
    btn.textContent = 'Create Account';
    btn.disabled    = false;
  }
}

//  Logout 
async function handleLogout() {
  if (!confirm('Sign out of Naraseo AI?')) return;

  // Clear auth credentials only — keep audit history and current audit
  await chrome.storage.local.remove(['authUser', 'authToken', 'userPlan']);

  // Reset to login/signup view
  showAuthGate();
  switchView('account');

  // Show confirmation
  addChatMessage('You have been signed out. See you next time! ', 'ai', true);
}

//  Forgot password 
async function handleForgotPassword() {
  const email = document.getElementById('login-email').value.trim();
  if (!email) {
    alert('Enter your email address first, then click Forgot password.');
    return;
  }
  try {
    await fetch(`${BACKEND}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    alert(`Password reset link sent to ${email}`);
  } catch {
    alert('Could not send reset email. Check your connection.');
  }
}

//  Open Stripe checkout in new tab 
async function openCheckout(plan) {
  const { authUser, authToken } = await chrome.storage.local.get(['authUser','authToken']);
  if (!authUser) {
    addChatMessage(
      `You need to **sign up or log in** first before upgrading.\n\nGo to the **Account** tab and create your account, then come back to upgrade.`,
      'ai', true
    );
    switchView('account');
    return;
  }

  try {
    // Opens hosted Stripe checkout — backend redirects to Stripe or demo page
    const checkoutUrl = `${BACKEND}/api/billing/checkout?plan=${plan}&token=${encodeURIComponent(authToken)}`;
    chrome.tabs.create({ url: checkoutUrl });
  } catch (err) {
    addChatMessage(
      `**Upgrade system is temporarily unavailable.** \n\n` +
      `Please try again in a moment, or email support@seoai.app for early access to Pro.`,
      'ai', true
    );
    switchView('chat');
  }
}

//  Refresh plan status after payment 
async function refreshPlanStatus() {
  const { authToken } = await chrome.storage.local.get('authToken');
  if (!authToken) return;

  const btn = document.getElementById('btn-refresh-plan');
  btn.querySelector('.settings-label').textContent = 'Refreshing...';

  try {
    const res  = await fetch(`${BACKEND}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    await chrome.storage.local.set({ authUser: data.user });
    showAccountView(data.user);
    btn.querySelector('.settings-label').textContent = 'Plan updated! ';
    setTimeout(() => { btn.querySelector('.settings-label').textContent = 'Refresh Plan Status'; }, 2000);
  } catch (err) {
    btn.querySelector('.settings-label').textContent = 'Refresh Plan Status';
    alert('Could not refresh plan: ' + err.message);
  }
}

//  Utility links 
function openPrivacyPolicy() { chrome.tabs.create({ url: 'https://yourdomain.com/privacy' }); }
function openSupport()       { chrome.tabs.create({ url: 'https://yourdomain.com/support' }); }
function openChangelog()     { chrome.tabs.create({ url: 'https://yourdomain.com/changelog' }); }

//  HISTORY SYSTEM 

/**
 * Save completed audit to history JSON in chrome.storage.local
 * Free tier: keeps latest FREE_HISTORY_LIMIT entries
 */
async function saveAuditToHistory(audit, pageData) {
  const { auditHistory = [], isPro = false, authToken } = await chrome.storage.local.get(['auditHistory','isPro','authToken']);

  // Build canonical report JSON for this audit (zero AI, pure data)
  let report_json = null;
  try {
    report_json = buildReportJson(audit, pageData || {}, currentUrl, currentKeywords);
  } catch (e) {
    console.warn('buildReportJson failed in saveAuditToHistory:', e);
  }

  const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  const entry = {
    id:        Date.now().toString(),
    timestamp: Date.now(),
    url:       currentUrl,
    fullUrl:   tab?.url || '',
    score:     audit.score,
    grade:     audit.grade,
    issues:    audit.issues || [],
    pageSpeedInsights: audit.pageSpeedInsights || null,
    categories:        audit.categories || {},
    _pillarScores:     audit._pillarScores || {},
    _reportJson:       report_json,
  };

  // Insert newest first
  const updated = [entry, ...auditHistory];
  const maxStore = isPro ? 100 : FREE_HISTORY_LIMIT * 2;
  const trimmed  = updated.slice(0, maxStore);
  await chrome.storage.local.set({ auditHistory: trimmed });
  refreshHistoryBadge();

  // Sync to Supabase if logged in (best-effort, non-blocking)
  if (authToken && report_json) {
    fetch('https://naraseoai.onrender.com/api/history', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body:    JSON.stringify({
        url:         entry.fullUrl || currentUrl,
        hostname:    currentUrl,
        score:       audit.score,
        grade:       audit.grade,
        report_json: report_json,
      }),
    }).catch(() => {}); // silent fail — local storage is the source of truth
  }
}

/**
 * Update the badge count on the history button
 */
async function refreshHistoryBadge() {
  const { auditHistory = [] } = await chrome.storage.local.get('auditHistory');
  const badge = document.getElementById('history-badge');
  if (!badge) return;
  if (auditHistory.length > 0) {
    badge.textContent = auditHistory.length > 99 ? '99+' : auditHistory.length;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

/**
 * Open history slide-in panel
 */
async function openHistoryPanel() {
  const panel    = document.getElementById('history-panel');
  const backdrop = document.getElementById('history-backdrop');
  backdrop.style.display = 'block';
  panel.classList.add('open');
  await renderHistoryList();
}

/**
 * Close history panel
 */
function closeHistoryPanel() {
  document.getElementById('history-panel').classList.remove('open');
  document.getElementById('history-backdrop').style.display = 'none';
}

/**
 * Render the list of history items
 */
async function renderHistoryList() {
  const { auditHistory = [], isPro = false, authToken } = await chrome.storage.local.get(['auditHistory','isPro','authToken']);
  const listEl    = document.getElementById('history-list');
  const countEl   = document.getElementById('history-count-label');
  const bannerEl  = document.getElementById('history-upgrade-banner');

  // Try to load from Supabase if logged in — merge with local (Supabase wins for report_json)
  let mergedHistory = [...auditHistory];
  if (authToken) {
    try {
      const resp = await fetch('https://naraseoai.onrender.com/api/history', {
        headers: { 'Authorization': `Bearer ${authToken}` },
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const { audits = [] } = await resp.json();
        // Merge: remote entries that aren't already in local (by url+score proximity)
        const localUrls = new Set(auditHistory.map(e => e.url + '_' + e.score));
        const remoteOnly = audits
          .filter(r => !localUrls.has((r.hostname || r.url) + '_' + r.score))
          .map(r => ({
            id:          r.id,
            timestamp:   new Date(r.created_at).getTime(),
            url:         r.hostname || r.url,
            fullUrl:     r.url,
            score:       r.score,
            grade:       r.grade,
            issues:      r.report_json?.issues || [],
            _reportJson: r.report_json,
            _fromCloud:  true,
          }));
        mergedHistory = [...auditHistory, ...remoteOnly]
          .sort((a, b) => b.timestamp - a.timestamp);
      }
    } catch { /* offline or server down — use local */ }
  }

  const visibleCount = Math.min(mergedHistory.length, FREE_HISTORY_LIMIT);
  countEl.textContent = isPro
    ? `${mergedHistory.length} audits saved`
    : `${visibleCount} / ${FREE_HISTORY_LIMIT} free audits used`;

  bannerEl.style.display = (!isPro && mergedHistory.length >= FREE_HISTORY_LIMIT) ? 'flex' : 'none';

  if (mergedHistory.length === 0) {
    listEl.innerHTML = '<div class="history-empty">No previous audits yet.<br>Run your first audit to see history here.</div>';
    return;
  }

  listEl.innerHTML = mergedHistory.map((entry, idx) => {
    const locked     = !isPro && idx >= FREE_HISTORY_LIMIT;
    const isActive   = currentAudit && entry.id === currentAudit._historyId;
    const critical   = (entry.issues || []).filter(i => i.type === 'critical').length;
    const warnings   = (entry.issues || []).filter(i => i.type === 'warning').length;
    const info       = (entry.issues || []).filter(i => i.type === 'info').length;
    const timeAgo    = getTimeAgo(entry.timestamp);
    const gradeColor = entry.score >= 80 ? '#059669' : entry.score >= 60 ? '#d97706' : '#dc2626';
    const hasPdf     = !!entry._reportJson;
    const cloudIcon  = entry._fromCloud ? '<span class="hist-cloud-icon" title="Synced from cloud">&#9729;</span>' : '';

    return `
      <div class="history-item ${isActive ? 'active' : ''} ${locked ? 'locked' : ''}" data-id="${entry.id}">
        <div class="history-item-header">
          <div class="history-item-domain" title="${entry.url}">${entry.url}${cloudIcon}</div>
          <div class="history-item-grade" style="color:${gradeColor};">${entry.grade}</div>
        </div>
        <div class="history-item-meta">
          <span class="history-item-score">${entry.score}/100</span>
          <span class="history-item-date">${timeAgo}</span>
        </div>
        <div class="history-item-issues">
          ${critical > 0 ? `<span class="hist-issue-dot hist-critical">${critical} critical</span>` : ''}
          ${warnings > 0 ? `<span class="hist-issue-dot hist-warning">${warnings} warn</span>` : ''}
          ${info     > 0 ? `<span class="hist-issue-dot hist-info">${info} tips</span>` : ''}
          ${critical === 0 && warnings === 0 ? '<span class="hist-issue-dot" style="background:#d1fae5;color:#065f46;">Clean</span>' : ''}
        </div>
        ${!locked ? `
        <div class="history-item-actions">
          <button class="hist-btn hist-btn-view" onclick="loadHistoryEntry('${entry.id}')">View</button>
          <button class="hist-btn hist-btn-pdf" onclick="downloadHistoryReport('${entry.id}')">PDF</button>
        </div>` : `<div class="history-lock-overlay"></div>`}
      </div>`;
  }).join('');

  // Store merged list in memory for downloadHistoryReport lookup
  window._mergedHistory = mergedHistory;
}

/**
 * Load a history entry as the current audit view
 */
async function loadHistoryEntry(id) {
  const { auditHistory = [] } = await chrome.storage.local.get('auditHistory');
  // Check local first, then merged (cloud) list
  const entry = auditHistory.find(e => e.id === id)
             || (window._mergedHistory || []).find(e => e.id === id);
  if (!entry) return;

  currentAudit = { ...entry, _historyId: entry.id };
  closeHistoryPanel();
  showResults();

  addChatMessage(
    `Viewing audit from ${new Date(entry.timestamp).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})} — Score: ${entry.score}/100 (${entry.grade})`,
    'ai', false
  );
}

/**
 * Download PDF for any past audit entry using stored report_json
 * Zero AI calls — pure renderer
 */
async function downloadHistoryReport(id) {
  const entry = (window._mergedHistory || []).find(e => e.id === id);
  if (!entry) return;

  const { userPlan = 'free' } = await chrome.storage.local.get('userPlan');

  // Use stored report JSON if available, otherwise build a basic one from audit data
  const reportJson = entry._reportJson || buildReportJson(entry, {}, entry.url, []);

  try {
    const html = buildReportHtml(reportJson, userPlan);
    const domain = (entry.url || 'report').replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    const dateStr = new Date(entry.timestamp).toISOString().slice(0, 10);
    const filename = `naraseo-${domain}-${dateStr}.pdf`;

    const resp = await fetch('https://naraseoai.onrender.com/api/v1/report/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, filename }),
    });

    if (!resp.ok) throw new Error(`Server ${resp.status}`);

    const blob = await resp.blob();
    const dataUrl = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.readAsDataURL(blob);
    });
    await chrome.downloads.download({ url: dataUrl, filename });
  } catch (e) {
    console.error('downloadHistoryReport error:', e);
    addChatMessage('Could not generate PDF. Please try again.', 'ai', false);
  }
}

// showUpgradePrompt() is defined earlier — removed duplicate

/**
 * Format timestamp as "2 hours ago", "3 days ago" etc.
 */
function getTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);

  if (mins  < 1)   return 'Just now';
  if (mins  < 60)  return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days  < 7)   return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

//  ESCAPE HELPERS 
function escapeHtml(text) {
  return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escapeAttr(text) {
  return String(text).replace(/'/g,"&apos;").replace(/"/g,'&quot;');
}

// 
// GEO-GRID RANK TRACKER
// 

function openGeoPanel() {
  const panel    = document.getElementById('geo-panel');
  const backdrop = document.getElementById('geo-backdrop');
  if (panel) panel.style.display = 'flex';
  if (backdrop) backdrop.style.display = 'block';
  // Pre-fill domain from current page
  const domainInput = document.getElementById('geo-domain');
  if (domainInput && !domainInput.value) domainInput.value = currentUrl;
}

function closeGeoPanel() {
  const panel    = document.getElementById('geo-panel');
  const backdrop = document.getElementById('geo-backdrop');
  if (panel) panel.style.display = 'none';
  if (backdrop) backdrop.style.display = 'none';
}

function useMyLocation() {
  const btn = document.getElementById('btn-geo-locate');
  if (btn) { btn.textContent = 'Detecting…'; btn.disabled = true; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      document.getElementById('geo-lat').value = pos.coords.latitude.toFixed(5);
      document.getElementById('geo-lng').value = pos.coords.longitude.toFixed(5);
      if (btn) { btn.textContent = ' Location set'; btn.disabled = false; }
    },
    () => {
      if (btn) { btn.textContent = 'Location unavailable'; btn.disabled = false; }
    }
  );
}

async function runGeoGrid(e) {
  e.preventDefault();
  const keyword  = document.getElementById('geo-keyword').value.trim();
  const domain   = document.getElementById('geo-domain').value.trim();
  const lat      = parseFloat(document.getElementById('geo-lat').value);
  const lng      = parseFloat(document.getElementById('geo-lng').value);
  const gridSize = Number(document.getElementById('geo-size').value);
  const radiusKm = Number(document.getElementById('geo-radius').value);

  if (!keyword || !domain || isNaN(lat) || isNaN(lng)) return;

  // Switch to loading state
  document.getElementById('geo-form').style.display    = 'none';
  document.getElementById('geo-results').style.display = 'none';
  document.getElementById('geo-loading').style.display = 'flex';
  document.getElementById('geo-loading-sub').textContent = `Querying 0 / ${gridSize * gridSize} points`;

  try {
    const resp = await fetch('https://naraseoai.onrender.com/api/geo-grid', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ lat, lng, keyword, domain, gridSize, radiusKm }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Server error');

    // Save geo result so it can be included in report
    chrome.storage.local.set({ geoGridResult: data });
    if (currentAudit) { currentAudit.geoGrid = data; chrome.storage.local.set({ currentAudit }); }

    document.getElementById('geo-loading').style.display = 'none';
    renderGeoHeatmap(data);
    document.getElementById('geo-results').style.display = 'flex';
  } catch (err) {
    document.getElementById('geo-loading').style.display = 'none';
    document.getElementById('geo-form').style.display    = 'flex';
    alert(`Geo-grid failed: ${err.message}\nMake sure the backend is running.`);
  }
}

function renderGeoHeatmap(data) {
  const { grid, gridSize, summary, isDemo } = data;

  // Summary bar
  const sumEl = document.getElementById('geo-summary-bar');
  if (sumEl) {
    const avgLabel = summary.avgPosition ? `#${summary.avgPosition}` : 'N/A';
    sumEl.innerHTML = `
      <div class="geo-stat top3"><div class="geo-stat-value">${summary.top3}</div><div class="geo-stat-label">Top 3</div></div>
      <div class="geo-stat top10"><div class="geo-stat-value">${summary.top10}</div><div class="geo-stat-label">Top 10</div></div>
      <div class="geo-stat none"><div class="geo-stat-value">${summary.notRanking}</div><div class="geo-stat-label">Not Ranked</div></div>
      <div class="geo-stat"><div class="geo-stat-value">${avgLabel}</div><div class="geo-stat-label">Avg Rank</div></div>
    `;
  }

  // SVG heatmap
  const cellSize = 46;
  const pad      = 2;
  const svgSize  = gridSize * (cellSize + pad) + pad;
  const center   = Math.floor(gridSize / 2);

  const colorFor = (pos, found) => {
    if (!found || pos === 0) return '#6b7280';
    if (pos <= 3)  return '#16a34a';
    if (pos <= 10) return '#d97706';
    return '#ef4444';
  };

  let cells = '';
  grid.forEach((pt) => {
    const x    = pt.col * (cellSize + pad) + pad;
    const y    = pt.row * (cellSize + pad) + pad;
    const fill = colorFor(pt.position, pt.found);
    const text = pt.found ? String(pt.position) : '20+';
    const isCenter = pt.row === center && pt.col === center;

    cells += `
      <rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${fill}" rx="5" opacity="${isCenter ? 1 : 0.88}"/>
      ${isCenter ? `<rect x="${x+2}" y="${y+2}" width="${cellSize-4}" height="${cellSize-4}" fill="none" stroke="#fff" stroke-width="2" rx="3" opacity="0.6"/>` : ''}
      <text x="${x + cellSize/2}" y="${y + cellSize/2 + 5}" text-anchor="middle" fill="#fff" font-size="${text.length > 2 ? 10 : 14}" font-weight="800" font-family="Inter, sans-serif">${text}</text>
    `;
  });

  const heatmapEl = document.getElementById('geo-heatmap');
  if (heatmapEl) {
    heatmapEl.innerHTML = `
      <svg width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}" xmlns="http://www.w3.org/2000/svg">
        ${cells}
      </svg>
    `;
  }

  // Demo notice
  const noticeEl = document.getElementById('geo-demo-notice');
  if (noticeEl) noticeEl.style.display = isDemo ? 'block' : 'none';
}

// ─── SCHEDULED AUDITS ─────────────────────────────────────────────────────────

const SCHEDULE_INTERVALS = {
  off:     0,
  daily:   1440,    // minutes
  weekly:  10080,
  monthly: 43200,
};

async function initScheduleUI() {
  const { auditSchedule = 'off' } = await chrome.storage.local.get('auditSchedule');
  const sel = document.getElementById('schedule-frequency');
  if (sel) sel.value = auditSchedule;
  updateScheduleStatus(auditSchedule);
}

async function updateSchedule() {
  const freq = document.getElementById('schedule-frequency').value;
  await chrome.storage.local.set({ auditSchedule: freq });

  // Tell background.js to update the alarm
  chrome.runtime.sendMessage({ action: 'SET_SCHEDULE', frequency: freq });
  updateScheduleStatus(freq);
}

function updateScheduleStatus(freq) {
  const statusEl = document.getElementById('schedule-status');
  if (!statusEl) return;
  if (freq === 'off') {
    statusEl.style.display = 'none';
  } else {
    statusEl.style.display = 'block';
    const labels = { daily: 'Audits run daily — you will be notified of changes', weekly: 'Audits run weekly', monthly: 'Audits run monthly' };
    statusEl.textContent = labels[freq] || '';
  }
}

// ─── CHAT AGENT: schedule command ─────────────────────────────────────────────
// Already handled by CHAT_AGENT_ACTIONS if user types "schedule daily audit" etc.
// This function is called by agent action
window.setScheduleFromChat = async function(freq) {
  await chrome.storage.local.set({ auditSchedule: freq });
  chrome.runtime.sendMessage({ action: 'SET_SCHEDULE', frequency: freq });
  const sel = document.getElementById('schedule-frequency');
  if (sel) sel.value = freq;
  updateScheduleStatus(freq);
};

// ─── SCHEDULERS VIEW ──────────────────────────────────────────────────────────

const ALARM_LABELS = {
  'daily-reminder':      'Daily Check Reminder',
  'periodic-reaudit':    'Background Re-audit',
  'user-scheduled-audit':'Auto-Audit Schedule',
};

function formatDuration(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

async function loadSchedulersView() {
  const listEl = document.getElementById('schedulers-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="schedulers-empty">Loading…</div>';

  // Sync frequency dropdown
  const { auditSchedule = 'off' } = await chrome.storage.local.get('auditSchedule');
  const freqSel = document.getElementById('schedulers-frequency');
  if (freqSel) freqSel.value = auditSchedule;
  const statusEl = document.getElementById('schedulers-status');
  if (statusEl) {
    const labels = { daily: 'Audits run daily', weekly: 'Audits run weekly', monthly: 'Audits run monthly' };
    statusEl.style.display = auditSchedule !== 'off' ? 'block' : 'none';
    statusEl.textContent = labels[auditSchedule] || '';
  }

  chrome.alarms.getAll((alarms) => {
    if (!alarms || alarms.length === 0) {
      listEl.innerHTML = '<div class="schedulers-empty">No active schedulers.</div>';
      return;
    }
    const now = Date.now();
    listEl.innerHTML = alarms.map(alarm => {
      const label = ALARM_LABELS[alarm.name] || alarm.name;
      const nextMs = alarm.scheduledTime - now;
      const nextStr = nextMs > 0 ? `in ${formatDuration(nextMs)}` : 'soon';
      const period  = alarm.periodInMinutes ? `every ${formatDuration(alarm.periodInMinutes * 60000)}` : 'one-time';
      return `<div class="scheduler-row">
        <div class="scheduler-dot-active"></div>
        <div class="scheduler-info">
          <div class="scheduler-name">${label}</div>
          <div class="scheduler-meta">${period} &middot; next ${nextStr}</div>
        </div>
      </div>`;
    }).join('');
  });
}

async function updateScheduleFromPanel() {
  const freq = document.getElementById('schedulers-frequency')?.value;
  if (!freq) return;
  await chrome.storage.local.set({ auditSchedule: freq });
  chrome.runtime.sendMessage({ action: 'SET_SCHEDULE', frequency: freq });
  // Sync account-view select
  const sel = document.getElementById('schedule-frequency');
  if (sel) sel.value = freq;
  updateScheduleStatus(freq);
  const statusEl = document.getElementById('schedulers-status');
  if (statusEl) {
    const labels = { daily: 'Audits run daily', weekly: 'Audits run weekly', monthly: 'Audits run monthly' };
    statusEl.style.display = freq !== 'off' ? 'block' : 'none';
    statusEl.textContent = labels[freq] || '';
  }
  // Refresh alarm list after alarm is set
  setTimeout(loadSchedulersView, 600);
}

window.loadSchedulersView      = loadSchedulersView;
window.updateScheduleFromPanel = updateScheduleFromPanel;

console.log('Naraseo AI sidebar loaded');
