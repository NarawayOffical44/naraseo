/**
 * Report Route - POST /api/v1/report
 * One-click full-site PDF report. Runs a full audit then generates a
 * professional PDF — the agency deliverable, automated.
 *
 * Input:  { url, brandName? }   (brandName for Agency white-label)
 * Output: application/pdf binary
 */

import express from 'express';
import puppeteer from 'puppeteer';
import { auditPage } from '../../lib/seoEngine.js';
import { getPageSpeedInsights, cwvToScore } from '../../lib/pageSpeed.js';
import { featureAccess, sendApiError } from '../../middleware/apiKey.js';
import { generateReportHTML } from '../../../lib/reportTemplate.js';

const router = express.Router();

router.post('/', featureAccess('audit'), async (req, res) => {
  const { url, brandName } = req.body;

  if (!url) return sendApiError(res, 'MISSING_URL', 'url parameter required', 400);
  try { new URL(url); } catch { return sendApiError(res, 'INVALID_URL', 'Invalid URL format', 400); }

  try {
    // Full audit + PageSpeed in parallel
    const [auditResult, ps] = await Promise.all([
      auditPage(url),
      getPageSpeedInsights(url),
    ]);

    if (!auditResult.success) {
      return sendApiError(res, 'AUDIT_FAILED', `Could not fetch page: ${auditResult.error}`, 502);
    }

    const { score, grade, pageData, issues } = auditResult.data;
    const { issues: cwvIssues } = cwvToScore(ps);

    const auditData = {
      url,
      score,
      grade,
      issues: [...issues, ...cwvIssues],
      pageData,
      coreWebVitals: ps || null,
      timestamp: new Date().toISOString(),
      brandName: brandName || null,
    };

    const html = generateReportHTML(auditData);

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
        printBackground: true,
      });

      const filename = `SEO-Report-${new URL(url).hostname}-${Date.now()}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Report-Score', String(score));
      res.setHeader('X-Report-Grade', grade);
      return res.send(pdfBuffer);
    } finally {
      if (browser) await browser.close();
    }
  } catch (error) {
    console.error('[report] error:', error);
    return sendApiError(res, 'INTERNAL_ERROR', error.message, 500);
  }
});

export default router;
