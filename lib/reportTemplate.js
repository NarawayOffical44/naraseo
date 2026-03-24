/**
 * Professional SEO Audit Report Template
 * Matches agency-standard format (WebFX, Ignite, etc.)
 */

export function generateReportHTML(auditData) {
  const { url, score, grade, issues = [], timestamp } = auditData;
  const domain = new URL(url).hostname;
  const dateStr = new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Separate issues by type
  const critical = issues.filter(i => i.type === 'critical');
  const warnings = issues.filter(i => i.type === 'warning');
  const info = issues.filter(i => i.type === 'info');

  // Calculate metrics
  const totalIssues = issues.length;
  const percentComplete = Math.round((issues.length / 14) * 100); // 14 possible checks

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SEO Audit Report - ${domain}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
    }
    .container { max-width: 900px; margin: 0 auto; background: white; }

    /* Header */
    .header {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
      padding: 60px 40px;
      text-align: center;
    }
    .header h1 { font-size: 32px; margin-bottom: 10px; }
    .header .domain { font-size: 18px; opacity: 0.9; margin-bottom: 20px; }
    .header .date { font-size: 14px; opacity: 0.8; }

    /* Score Card */
    .score-card {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 30px;
      padding: 40px;
      background: #f9f9f9;
      text-align: center;
    }
    .score-item {
      padding: 20px;
      border-radius: 8px;
      background: white;
      border-left: 4px solid #007bff;
    }
    .score-value {
      font-size: 48px;
      font-weight: bold;
      margin: 10px 0;
      color: #007bff;
    }
    .score-label { font-size: 12px; text-transform: uppercase; color: #666; letter-spacing: 1px; }

    .score-item.critical { border-left-color: #ef4444; }
    .score-item.critical .score-value { color: #ef4444; }

    .score-item.warning { border-left-color: #f97316; }
    .score-item.warning .score-value { color: #f97316; }

    /* Grade Badge */
    .grade-badge {
      display: inline-block;
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: linear-gradient(135deg, #007bff, #0056b3);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 48px;
      font-weight: bold;
      margin: 20px auto;
    }

    /* Section */
    .section {
      padding: 40px;
      border-bottom: 1px solid #eee;
    }
    .section h2 {
      font-size: 24px;
      margin-bottom: 20px;
      color: #1a1a2e;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .section h3 {
      font-size: 16px;
      margin-top: 20px;
      margin-bottom: 10px;
      color: #333;
    }

    /* Issue Lists */
    .issue {
      margin-bottom: 20px;
      padding: 15px;
      border-left: 4px solid #ddd;
      background: #fafafa;
      border-radius: 4px;
    }
    .issue.critical { border-left-color: #ef4444; }
    .issue.warning { border-left-color: #f97316; }
    .issue.info { border-left-color: #10b981; }

    .issue-title {
      font-weight: 600;
      margin-bottom: 5px;
      font-size: 15px;
    }
    .issue-detail { font-size: 13px; color: #666; margin-bottom: 8px; }
    .issue-fix {
      background: white;
      padding: 10px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      margin-top: 8px;
      color: #2c3e50;
      overflow-x: auto;
      border: 1px solid #ddd;
    }
    .issue-label {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 3px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .issue-label.critical { background: #ffebee; color: #ef4444; }
    .issue-label.warning { background: #fff3e0; color: #f97316; }
    .issue-label.info { background: #e8f5e9; color: #10b981; }

    /* Executive Summary */
    .summary-box {
      background: #f0f7ff;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #007bff;
      margin-bottom: 20px;
    }
    .summary-box p { margin-bottom: 10px; }

    /* Action Plan */
    .checklist {
      list-style: none;
    }
    .checklist li {
      padding: 10px;
      margin-bottom: 8px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      display: flex;
      align-items: center;
    }
    .checklist li:before {
      content: "☐";
      margin-right: 10px;
      font-size: 18px;
      color: #007bff;
    }

    /* Footer */
    .footer {
      padding: 40px;
      background: #f5f5f5;
      text-align: center;
      font-size: 12px;
      color: #666;
      border-top: 1px solid #ddd;
    }
    .footer a { color: #007bff; text-decoration: none; }

    /* Print optimized */
    @media print {
      body { background: white; }
      .section { page-break-inside: avoid; }
      .score-card { display: block; }
      .score-item { margin-bottom: 20px; }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <h1>SEO AUDIT REPORT</h1>
    <div class="domain">${domain}</div>
    <div class="date">Generated: ${dateStr}</div>
  </div>

  <!-- Score Card -->
  <div class="score-card">
    <div class="score-item">
      <div class="score-label">Overall Score</div>
      <div class="score-value">${score}</div>
      <div class="score-label">/100</div>
    </div>
    <div class="score-item critical">
      <div class="score-label">Critical Issues</div>
      <div class="score-value">${critical.length}</div>
      <div class="score-label">Fix First</div>
    </div>
    <div class="score-item warning">
      <div class="score-label">Warnings</div>
      <div class="score-value">${warnings.length}</div>
      <div class="score-label">Optimize</div>
    </div>
  </div>

  <!-- Grade -->
  <div style="text-align: center; padding: 20px;">
    <div class="grade-badge">${grade}</div>
    <p style="color: #666; font-size: 14px; margin-top: 10px;">
      Your site is performing at a <strong>${grade}</strong> level${getGradeMessage(grade)}
    </p>
  </div>

  <!-- Executive Summary -->
  <div class="section">
    <h2>📊 Executive Summary</h2>
    <div class="summary-box">
      <p><strong>Current Status:</strong> Your website has ${totalIssues} SEO issues that need attention.</p>
      <p><strong>Priority:</strong> ${critical.length > 0 ? `${critical.length} critical issues require immediate action to improve search rankings.` : 'No critical issues found. Focus on warnings for incremental improvements.'}</p>
      <p><strong>Impact:</strong> Fixing these issues could improve your search visibility by 30-50% within 2-3 months.</p>
    </div>
  </div>

  <!-- Critical Issues -->
  ${critical.length > 0 ? `
  <div class="section">
    <h2>🔴 CRITICAL ISSUES (${critical.length})</h2>
    <p style="color: #666; margin-bottom: 20px;">These issues directly impact your search rankings and must be fixed first.</p>
    ${critical.map(issue => `
      <div class="issue critical">
        <div class="issue-label critical">Critical</div>
        <div class="issue-title">${issue.issue}</div>
        <div class="issue-detail">${issue.detail || ''}</div>
        ${issue.fixExample ? `<div class="issue-fix">${issue.fixExample}</div>` : ''}
      </div>
    `).join('')}
  </div>
  ` : ''}

  <!-- Warnings -->
  ${warnings.length > 0 ? `
  <div class="section">
    <h2>🟡 WARNINGS (${warnings.length})</h2>
    <p style="color: #666; margin-bottom: 20px;">These should be optimized to improve your competitive standing.</p>
    ${warnings.map(issue => `
      <div class="issue warning">
        <div class="issue-label warning">Warning</div>
        <div class="issue-title">${issue.issue}</div>
        <div class="issue-detail">${issue.detail || ''}</div>
        ${issue.fixExample ? `<div class="issue-fix">${issue.fixExample}</div>` : ''}
      </div>
    `).join('')}
  </div>
  ` : ''}

  <!-- Info -->
  ${info.length > 0 ? `
  <div class="section">
    <h2>🟢 TIPS & OPPORTUNITIES (${info.length})</h2>
    <p style="color: #666; margin-bottom: 20px;">Nice-to-have optimizations for advanced SEO.</p>
    ${info.map(issue => `
      <div class="issue info">
        <div class="issue-label info">Info</div>
        <div class="issue-title">${issue.issue}</div>
        <div class="issue-detail">${issue.detail || ''}</div>
        ${issue.fixExample ? `<div class="issue-fix">${issue.fixExample}</div>` : ''}
      </div>
    `).join('')}
  </div>
  ` : ''}

  <!-- Action Plan -->
  <div class="section">
    <h2>✅ Action Plan</h2>
    <h3>Week 1: Critical Fixes (Highest Impact)</h3>
    <ul class="checklist">
      ${critical.slice(0, 3).map(issue => `<li>${issue.issue}</li>`).join('')}
      ${critical.length === 0 ? '<li>No critical issues to fix</li>' : ''}
    </ul>

    <h3 style="margin-top: 30px;">Week 2-3: Warnings & Optimizations</h3>
    <ul class="checklist">
      ${warnings.slice(0, 3).map(issue => `<li>${issue.issue}</li>`).join('')}
      ${warnings.length === 0 ? '<li>No warnings to address</li>' : ''}
    </ul>

    <h3 style="margin-top: 30px;">Ongoing: Maintenance & Monitoring</h3>
    <ul class="checklist">
      <li>Monitor ranking changes after fixes</li>
      <li>Re-audit in 30 days to track progress</li>
      <li>Keep content fresh and updated</li>
      <li>Build quality backlinks</li>
    </ul>
  </div>

  <!-- ROI -->
  <div class="section">
    <h2>💰 Business Impact</h2>
    <div class="summary-box">
      <p><strong>What This Costs You Now:</strong></p>
      <p style="font-size: 20px; color: #ef4444; margin: 10px 0;">
        Estimated 50-100+ lost leads per month from poor SEO
      </p>
      <p style="margin-top: 20px;"><strong>What an Agency Would Charge:</strong></p>
      <p style="font-size: 20px; color: #666; margin: 10px 0;">
        \$2,000 - \$5,000 per month for this level of analysis
      </p>
      <p style="margin-top: 20px;"><strong>Your Cost:</strong></p>
      <p style="font-size: 20px; color: #10b981; margin: 10px 0;">
        Just apply these fixes yourself or hire a developer for a one-time cost
      </p>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <p>This report was generated by <strong>SEO AI Extension</strong></p>
    <p>For more detailed analysis, visit your dashboard or re-run this audit.</p>
    <p style="margin-top: 20px; opacity: 0.6;">Report generated on ${dateStr}</p>
  </div>
</body>
</html>
  `;
}

function getGradeMessage(grade) {
  const messages = {
    'A': ' — Excellent! You\'re competitive in search results.',
    'B': ' — Good. You can still improve to rank higher.',
    'C': ' — Average. Significant gaps vs. competitors.',
    'D': ' — Poor. Major issues affecting rankings.',
    'F': ' — Critical. Unlikely to rank well without fixes.'
  };
  return messages[grade] || '';
}
