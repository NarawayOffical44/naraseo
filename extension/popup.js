/**
 * Extension Popup Logic - Complete rewrite
 * Handles audit, chat, tabs, and settings
 */

// DOM Elements
const stateReady = document.getElementById('state-ready');
const stateAnalyzing = document.getElementById('state-analyzing');
const stateResults = document.getElementById('state-results');
const stateHighlights = document.getElementById('state-highlights');

const urlDisplay = document.getElementById('url-display');
const btnAudit = document.getElementById('btn-audit');
const btnHighlight = document.getElementById('btn-highlight');
const btnReport = document.getElementById('btn-report');
const btnClear = document.getElementById('btn-clear');
const btnChat2 = document.getElementById('btn-chat-2');
const btnSettings = document.getElementById('btn-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');

const scoreValue = document.getElementById('score-value');
const gradeValue = document.getElementById('grade-value');
const criticalCount = document.getElementById('critical-count');
const warningCount = document.getElementById('warning-count');
const infoCount = document.getElementById('info-count');
const topIssuesList = document.getElementById('top-issues-list');

const chatInput = document.getElementById('chat-input');
const btnSend = document.getElementById('btn-send');
const chatMessages = document.getElementById('chat-messages');

const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// State
let currentAudit = null;
let currentUrl = '';
let highlightsActive = false;

/**
 * Initialize on popup open
 */
document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentUrl = tab.url;
  urlDisplay.textContent = new URL(currentUrl).hostname;

  // Check for cached results
  const cached = await getCachedAudit(currentUrl);
  if (cached) {
    showResults(cached);
  } else {
    showState('ready');
  }

  // Event listeners
  btnAudit.addEventListener('click', runAudit);
  btnHighlight.addEventListener('click', toggleHighlights);
  btnChat2.addEventListener('click', () => switchTab('chat'));
  btnClear.addEventListener('click', clearHighlights);
  btnReport.addEventListener('click', openReport);
  btnSettings.addEventListener('click', () => switchTab('settings'));
  btnSaveSettings.addEventListener('click', saveSettings);
  btnSend.addEventListener('click', sendMessage);

  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });

  // Load settings
  loadSettings();
});

/**
 * Show/hide states
 */
function showState(state) {
  [stateReady, stateAnalyzing, stateResults, stateHighlights].forEach(el => {
    el.classList.remove('active');
  });

  if (state === 'ready') stateReady.classList.add('active');
  else if (state === 'analyzing') stateAnalyzing.classList.add('active');
  else if (state === 'results') {
    stateResults.classList.add('active');
    switchTab('audit');
  }
  else if (state === 'highlights') stateHighlights.classList.add('active');
}

/**
 * Switch tabs
 */
function switchTab(tabName) {
  tabs.forEach(t => t.classList.remove('active'));
  tabContents.forEach(c => c.classList.remove('active'));

  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.add('active');

  if (tabName === 'chat') {
    setTimeout(() => chatInput.focus(), 100);
  }
}

/**
 * Run SEO audit
 */
async function runAudit() {
  showState('analyzing');

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'RUN_AUDIT',
      url: currentUrl,
    });

    if (response.success) {
      currentAudit = response.result;
      await cacheAudit(currentUrl, currentAudit);
      showResults(currentAudit);
    } else {
      alert('Audit failed: ' + (response.error || 'Unknown error'));
      showState('ready');
    }
  } catch (error) {
    console.error('Audit error:', error);
    alert('Audit failed: ' + error.message);
    showState('ready');
  }
}

/**
 * Display audit results
 */
function showResults(audit) {
  if (!audit) return;

  currentAudit = audit;

  // Store in chrome storage for sidebar
  chrome.storage.local.set({ currentAudit: audit });

  // Animate score
  animateScore(audit.score, audit.grade);

  // Update counts
  const issues = audit.issues || [];
  const critical = issues.filter(i => i.type === 'critical').length;
  const warning = issues.filter(i => i.type === 'warning').length;
  const info = issues.filter(i => i.type === 'info').length;

  criticalCount.textContent = critical;
  warningCount.textContent = warning;
  infoCount.textContent = info;

  // Show top 3 issues
  const topIssues = issues.slice(0, 3);
  topIssuesList.innerHTML = topIssues.map(issue => `
    <div class="issue-item ${issue.type}">
      <div class="issue-title">${issue.issue}</div>
      <div class="issue-category">${issue.category}</div>
    </div>
  `).join('');

  showState('results');
}

/**
 * Animate score gauge
 */
function animateScore(score, grade) {
  let current = 0;
  const target = score;
  const duration = 1500;
  const startTime = Date.now();
  const circumference = 2 * Math.PI * 45;

  const animate = () => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    current = Math.round(target * progress);

    scoreValue.textContent = current;
    gradeValue.textContent = grade;

    // Update gauge
    const percentage = (current / 100) * circumference;
    const gaugeProgress = document.getElementById('gauge-progress');
    if (gaugeProgress) {
      gaugeProgress.style.strokeDasharray = `${percentage} ${circumference}`;
    }

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  };

  animate();
}

/**
 * Toggle highlights - Opens sidebar with highlights
 */
async function toggleHighlights() {
  if (!currentAudit) return;

  // Open sidebar panel
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (chrome.sidePanel) {
    chrome.sidePanel.open({ tabId: tab.id });
  }

  // Inject highlights
  await injectHighlights();
  highlightsActive = true;
}

/**
 * Inject highlights into page
 */
async function injectHighlights() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  await chrome.tabs.sendMessage(tab.id, {
    action: 'INJECT_HIGHLIGHTS',
    issues: currentAudit.issues || [],
  }).catch(err => {
    console.error('Inject error:', err);
  });
}

/**
 * Clear highlights
 */
async function clearHighlights() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.tabs.sendMessage(tab.id, {
    action: 'CLEAR_HIGHLIGHTS',
  }).catch(() => {});

  highlightsActive = false;
  showState('results');
}

/**
 * Generate and download PDF report
 */
async function openReport() {
  if (!currentAudit) {
    alert('No audit data available');
    return;
  }

  try {
    // Show downloading status
    const originalText = btnReport.textContent;
    btnReport.textContent = '📥 Generating PDF...';
    btnReport.disabled = true;

    // Call backend to generate PDF
    const response = await fetch('https://naraseoai.onrender.com/api/report/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auditData: currentAudit }),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.statusText}`);
    }

    // Download the PDF
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SEO-Audit-${new URL(currentAudit.url).hostname}-${Date.now()}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();

    // Reset button
    btnReport.textContent = originalText;
    btnReport.disabled = false;
  } catch (error) {
    console.error('PDF download error:', error);
    alert('Failed to generate report. Make sure backend is running at localhost:3000');
    btnReport.textContent = originalText;
    btnReport.disabled = false;
  }
}

/**
 * Chat Functions
 */
async function sendMessage() {
  const message = chatInput.value.trim();
  if (!message) return;

  addChatMessage(message, 'user');
  chatInput.value = '';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'CHAT',
      message,
      context: {
        url: currentUrl,
        issues: currentAudit?.issues || [],
        score: currentAudit?.score || 0,
        title: document.title,
      }
    });

    if (response.success) {
      addChatMessage(response.reply, 'ai');
    } else {
      addChatMessage('Error: ' + (response.error || 'Try again'), 'ai');
    }
  } catch (error) {
    addChatMessage('Connection error. Retrying...', 'ai');
  }
}

function renderMarkdown(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<strong class="chat-section">$1</strong>')
    .replace(/^## (.+)$/gm, '<strong class="chat-section">$1</strong>')
    .replace(/^# (.+)$/gm, '<strong class="chat-section">$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:#edf2f7;padding:1px 4px;border-radius:3px;font-size:11px;color:#e53e3e;">$1</code>')
    .replace(/^\d+\. (.+)$/gm, '<div style="margin:3px 0;padding-left:2px;">$1</div>')
    .replace(/^[-•] (.+)$/gm, '<div style="margin:3px 0;">• $1</div>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function addChatMessage(text, role) {
  const msgEl = document.createElement('div');
  msgEl.className = `chat-message ${role}`;
  const content = role === 'ai' ? renderMarkdown(text) : text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  msgEl.innerHTML = `<p>${content}</p>`;
  chatMessages.appendChild(msgEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Settings
 */
async function saveSettings() {
  const apiKey = document.getElementById('api-key').value;
  const trackKeywords = document.getElementById('track-keywords').checked;
  const weeklyReports = document.getElementById('weekly-reports').checked;

  await chrome.storage.local.set({
    seoAiSettings: {
      apiKey,
      trackKeywords,
      weeklyReports,
    }
  });

  // Show success
  const originalText = btnSaveSettings.textContent;
  btnSaveSettings.textContent = '✓ Saved!';
  setTimeout(() => {
    btnSaveSettings.textContent = originalText;
  }, 2000);
}

async function loadSettings() {
  const stored = await chrome.storage.local.get('seoAiSettings');
  const settings = stored.seoAiSettings || {};

  if (settings.apiKey) {
    document.getElementById('api-key').value = settings.apiKey;
  }
  document.getElementById('track-keywords').checked = settings.trackKeywords || false;
  document.getElementById('weekly-reports').checked = settings.weeklyReports || false;
}

/**
 * Cache & Retrieve
 */
async function getCachedAudit(url) {
  const cacheKey = `audit_${url}`;
  const cached = await chrome.storage.local.get(cacheKey);

  if (cached[cacheKey]) {
    const audit = cached[cacheKey];
    if (Date.now() - audit.timestamp < 3600000) {
      return audit.data;
    }
  }

  return null;
}

async function cacheAudit(url, data) {
  const cacheKey = `audit_${url}`;
  await chrome.storage.local.set({
    [cacheKey]: {
      data,
      timestamp: Date.now(),
    }
  });
}

console.log('✓ SEO AI popup loaded');
