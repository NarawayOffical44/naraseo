/**
 * Demo Route - POST /api/v1/demo
 * Public endpoint for website demo — no API key required.
 * IP rate-limited (5 requests per IP per day).
 * Returns score + grade + top 5 issues only (teaser).
 */

import express from 'express';
import { auditPage } from '../../lib/seoEngine.js';
import { sendApiError } from '../../middleware/apiKey.js';

const router = express.Router();

// In-memory IP rate limiter (5 demo requests per IP per day)
const ipLimiter = new Map();

function checkIpLimit(ip) {
  const today = new Date().toDateString();
  const record = ipLimiter.get(ip) || { count: 0, date: today };

  if (record.date !== today) {
    record.count = 0;
    record.date = today;
  }

  if (record.count >= 5) {
    return false;
  }

  record.count++;
  ipLimiter.set(ip, record);
  return true;
}

// Prune old IPs every hour
setInterval(() => {
  const today = new Date().toDateString();
  for (const [ip, rec] of ipLimiter.entries()) {
    if (rec.date !== today) ipLimiter.delete(ip);
  }
}, 3600_000);

router.post('/', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';

  if (!checkIpLimit(ip)) {
    return res.status(429).json({
      success: false,
      error: {
        code: 'DEMO_LIMIT',
        message: 'Demo limit reached (5/day). Sign up free for unlimited audits.',
        cta: 'https://naraseo.onrender.com/login.html',
      },
    });
  }

  const { url } = req.body;
  if (!url) return sendApiError(res, 'MISSING_URL', 'url parameter required', 400);

  try { new URL(url); } catch {
    return sendApiError(res, 'INVALID_URL', 'Invalid URL format', 400);
  }

  try {
    const auditResult = await auditPage(url);

    if (!auditResult.success) {
      return sendApiError(res, 'FETCH_FAILED', `Could not fetch page: ${auditResult.error}`, 502);
    }

    const { pageData, issues, score, grade } = auditResult.data;

    // Return limited data — teaser only (top 5 issues)
    const topIssues = (issues || []).slice(0, 5).map(i => ({
      field: i.field,
      issue: i.issue,
      fix: i.fix,
      priority: i.priority,
    }));

    return res.json({
      success: true,
      data: {
        url,
        score,
        grade,
        summary: `Your page scored ${score}/100 (Grade ${grade}). ${topIssues.length} issues found.`,
        fixes: topIssues,
        title: pageData?.title || '',
        meta_description: pageData?.metaDescription || '',
        note: 'Sign up free to see all issues, full fixes, and keyword opportunities.',
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL', message: 'Audit failed. Please try again.' },
    });
  }
});

export default router;
