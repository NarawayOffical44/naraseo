/**
 * Proof Route - GET /api/v1/proof/:cert_id
 * Renders a human-readable Certificate of Accuracy HTML page.
 * Shareable URL — immutable proof that content was verified at a specific timestamp.
 * Content hash (SHA-256) cryptographically links the certificate to the exact text verified.
 */

import express from 'express';
import { getVerification } from '../../lib/history.js';
import supabase from '../../supabase.js';

const router = express.Router();

function renderCertificate(record) {
  const publishable = record.publishable;
  const verdict = record.verdict || 'unknown';

  const dt = new Date(record.created_at);
  const verifiedAt = dt.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  }) + ' at ' + dt.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });

  const verdictColor = publishable ? '#22c55e' : (verdict === 'review_needed' ? '#eab308' : '#ef4444');
  const verdictLabel = publishable ? '&#10003; VERIFIED' : (verdict === 'review_needed' ? '&#9888; REVIEW NEEDED' : '&#10005; DO NOT PUBLISH');
  const verdictDesc = publishable
    ? 'Content passed factual verification and risk screening.'
    : verdict === 'review_needed'
      ? 'Content requires human review before publishing.'
      : 'Critical risk signals detected. Do not publish without compliance review.';

  const eeatScore = record.eeat_score || 0;
  const eeatColor = eeatScore >= 60 ? '#22c55e' : eeatScore >= 40 ? '#eab308' : '#ef4444';
  const eeatGrade = eeatScore >= 60 ? 'Strong' : eeatScore >= 40 ? 'Moderate' : 'Weak';

  const totalClaims = record.result_json?.summary?.total_claims || 0;
  const flaggedClaims = record.flagged_count || 0;
  const safeClaims = Math.max(0, totalClaims - flaggedClaims);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Certificate of Accuracy &mdash; Naraseo AI</title>
  <meta name="robots" content="noindex,nofollow">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #f1f5f9;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
    }
    .watermark {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      display: flex; align-items: center; justify-content: center;
      pointer-events: none; z-index: 0; overflow: hidden;
    }
    .watermark-text {
      font-size: 110px; font-weight: 900;
      color: rgba(99, 102, 241, 0.04);
      transform: rotate(-28deg);
      user-select: none; white-space: nowrap; letter-spacing: -2px;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 16px;
      max-width: 620px;
      width: 100%;
      position: relative;
      z-index: 1;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
    }
    .card-header {
      background: linear-gradient(145deg, #1a2340 0%, #0f172a 100%);
      border-bottom: 1px solid #334155;
      padding: 36px 32px 28px;
      text-align: center;
      border-radius: 16px 16px 0 0;
    }
    .brand {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.14em; color: #6366f1; margin-bottom: 22px;
      display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .brand-mark {
      width: 24px; height: 24px; background: #6366f1; border-radius: 5px;
      display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .verdict-badge {
      display: inline-block; padding: 10px 30px; border-radius: 100px;
      font-size: 16px; font-weight: 800; letter-spacing: 0.05em;
      background: ${verdictColor}1a; color: ${verdictColor};
      border: 2px solid ${verdictColor}50; margin-bottom: 12px;
    }
    .cert-desc { font-size: 13px; color: #94a3b8; margin-bottom: 6px; }
    .cert-date { font-size: 12px; color: #475569; }
    .card-body { padding: 24px 32px 28px; }
    .section-title {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.1em; color: #475569; margin: 22px 0 10px;
    }
    .section-title:first-child { margin-top: 0; }
    .stat-row {
      display: flex; align-items: flex-start; justify-content: space-between;
      padding: 10px 0; border-bottom: 1px solid #263248; gap: 16px;
    }
    .stat-row:last-child { border-bottom: none; }
    .stat-label { font-size: 13px; color: #64748b; flex-shrink: 0; padding-top: 1px; }
    .stat-value { font-size: 13px; font-weight: 600; color: #f1f5f9; text-align: right; word-break: break-all; }
    .mono { font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; font-size: 11px; color: #94a3b8; }
    .claims-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; }
    .claim-stat {
      background: #263248; border-radius: 8px; padding: 14px 16px; text-align: center;
    }
    .claim-num { font-size: 28px; font-weight: 800; line-height: 1; margin-bottom: 4px; }
    .claim-lbl { font-size: 11px; color: #64748b; }
    .bar-wrap { width: 100%; background: #263248; border-radius: 4px; height: 7px; overflow: hidden; margin-top: 10px; }
    .bar-fill { height: 100%; border-radius: 4px; background: ${eeatColor}; width: ${eeatScore}%; }
    .method-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 9px 0; border-bottom: 1px solid #263248; gap: 16px;
    }
    .method-row:last-child { border-bottom: none; }
    .method-label { font-size: 12px; color: #64748b; }
    .method-value { font-size: 12px; color: #94a3b8; text-align: right; }
    .card-footer {
      background: #0d1424; border-top: 1px solid #334155;
      padding: 18px 32px; border-radius: 0 0 16px 16px;
      display: flex; align-items: center; justify-content: space-between;
      flex-wrap: wrap; gap: 12px;
    }
    .footer-note { font-size: 11px; color: #475569; max-width: 360px; line-height: 1.5; }
    .footer-link {
      font-size: 12px; color: #6366f1; text-decoration: none;
      padding: 6px 14px; border: 1px solid #334155; border-radius: 6px; white-space: nowrap;
    }
    .footer-link:hover { background: #1e293b; }
    @media (max-width: 480px) {
      .card-header, .card-body, .card-footer { padding-left: 20px; padding-right: 20px; }
    }
  </style>
</head>
<body>
  <div class="watermark"><div class="watermark-text">NARASEO AI</div></div>

  <div class="card">
    <div class="card-header">
      <div class="brand">
        <div class="brand-mark">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M1 2.5h11v1.5H1V2.5zm0 3.2h7v1.5H1V5.7zm0 3.2h9v1.5H1V8.9z" fill="white"/>
          </svg>
        </div>
        Naraseo AI &mdash; Certificate of Accuracy
      </div>
      <div class="verdict-badge">${verdictLabel}</div>
      <div class="cert-desc">${verdictDesc}</div>
      <div class="cert-date">Verified: ${verifiedAt}</div>
    </div>

    <div class="card-body">

      <div class="section-title">Certificate Identity</div>
      <div class="stat-row">
        <span class="stat-label">Certificate ID</span>
        <span class="stat-value mono">${record.id}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Content Fingerprint (SHA-256)</span>
        <span class="stat-value mono">${record.content_hash || '&mdash;'}</span>
      </div>
      ${record.source_url ? `<div class="stat-row">
        <span class="stat-label">Source URL</span>
        <span class="stat-value" style="font-size:12px">${record.source_url}</span>
      </div>` : ''}

      <div class="section-title">Claim Verification</div>
      <div class="claims-grid">
        <div class="claim-stat">
          <div class="claim-num">${totalClaims}</div>
          <div class="claim-lbl">Claims Checked</div>
        </div>
        <div class="claim-stat">
          <div class="claim-num" style="color:${flaggedClaims > 0 ? '#ef4444' : '#22c55e'}">${flaggedClaims}</div>
          <div class="claim-lbl">Flagged</div>
        </div>
      </div>

      <div class="section-title" style="margin-top:20px">E-E-A-T Score</div>
      <div class="stat-row" style="flex-direction:column;align-items:flex-start;gap:6px;border-bottom:none">
        <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
          <span class="stat-label">Experience &middot; Expertise &middot; Authoritativeness &middot; Trust</span>
          <span class="stat-value" style="color:${eeatColor}">${eeatScore}/100 &middot; ${eeatGrade}</span>
        </div>
        <div class="bar-wrap"><div class="bar-fill"></div></div>
      </div>

      <div class="section-title">Verification Method</div>
      <div class="method-row">
        <span class="method-label">Ground-truth sources</span>
        <span class="method-value">Wikipedia REST API &middot; Wikidata</span>
      </div>
      <div class="method-row">
        <span class="method-label">Claim extraction</span>
        <span class="method-value">Claude Haiku (Anthropic)</span>
      </div>
      <div class="method-row">
        <span class="method-label">Risk pattern detection</span>
        <span class="method-value">Deterministic regex (medical, legal, financial)</span>
      </div>
      <div class="method-row">
        <span class="method-label">Verification API</span>
        <span class="method-value">Naraseo AI &mdash; naraseoai.onrender.com</span>
      </div>

    </div>

    <div class="card-footer">
      <span class="footer-note">
        This certificate is cryptographically bound to the content fingerprint above.
        Any modification to the original text produces a different hash, invalidating this certificate.
      </span>
      <a href="/api/v1/verify/${record.id}" class="footer-link">Raw JSON &rarr;</a>
    </div>
  </div>
</body>
</html>`;
}

// GET /api/v1/proof/:cert_id — render Certificate of Accuracy as HTML
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  if (!id.startsWith('cert_')) {
    return res.status(400).send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Invalid ID</title></head><body style="font-family:sans-serif;background:#0f172a;color:#f1f5f9;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center"><h2 style="margin-bottom:8px">Invalid Certificate ID</h2><p style="color:#64748b">IDs must start with <code>cert_</code></p></div></body></html>`);
  }

  const record = await getVerification(supabase, id);

  if (!record) {
    return res.status(404).send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Not Found</title></head><body style="font-family:sans-serif;background:#0f172a;color:#f1f5f9;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center"><h2 style="margin-bottom:8px">Certificate Not Found</h2><p style="color:#64748b">ID: ${id}</p><p style="color:#475569;margin-top:6px;font-size:13px">Certificates are stored for 90 days.</p></div></body></html>`);
  }

  // Certificates are immutable — cache aggressively
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  return res.status(200).send(renderCertificate(record));
});

export default router;
