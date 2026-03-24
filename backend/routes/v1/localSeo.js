/**
 * Local SEO Route - POST /api/v1/local-seo
 * Local SEO signals audit
 */

import express from 'express';
import { auditPage } from '../../lib/seoEngine.js';
import { featureAccess, sendApiError } from '../../middleware/apiKey.js';
import crypto from 'crypto';

const router = express.Router();

router.post('/', featureAccess('localSeo'), async (req, res) => {
  const { url, businessName, phone, address } = req.body;
  const requestId = `req_${crypto.randomBytes(6).toString('hex')}`;

  if (!url) {
    return sendApiError(res, 'MISSING_URL', 'URL parameter required', 400);
  }

  try {
    new URL(url);
  } catch (e) {
    return sendApiError(res, 'INVALID_URL', 'Invalid URL format', 400);
  }

  try {
    const startTime = Date.now();

    const audit = await auditPage(url);

    if (!audit.success) {
      return sendApiError(res, 'AUDIT_FAILED', 'Failed to fetch page', 500);
    }

    const { pageData, issues } = audit.data;

    // Check for local business schema
    const hasLocalBusinessSchema = pageData.jsonLD.some(s => s['@type'] === 'LocalBusiness');

    // Check for NAP (Name, Address, Phone)
    const hasNAP = businessName && address && phone;
    const nap = {
      name: businessName || null,
      address: address || null,
      phone: phone || null,
      consistent: hasNAP,
    };

    // Build local SEO report
    const localSeoData = {
      url,
      businessInfo: nap,
      signals: {
        hasLocalBusinessSchema,
        hasNAP,
        hasOpeningHours: pageData.jsonLD.some(s => s['openingHoursSpecification']),
        hasTelephone: phone !== undefined,
        hasAddress: address !== undefined,
      },
      issues: issues.filter(i => i.id.includes('local')),
      recommendations: [
        !hasLocalBusinessSchema && 'Add LocalBusiness schema markup',
        !hasNAP && 'Ensure NAP (Name, Address, Phone) consistency',
        !pageData.openGraph['og:image'] && 'Add Open Graph image for sharing',
      ].filter(Boolean),
      score: calculateLocalScore(hasNAP, hasLocalBusinessSchema),
      analyzedAt: new Date().toISOString(),
    };

    const processingMs = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      data: localSeoData,
      meta: {
        requestId,
        version: '1.0',
        processingMs,
        creditsUsed: 1,
      },
    });
  } catch (error) {
    console.error('Local SEO error:', error);
    return sendApiError(res, 'INTERNAL_ERROR', error.message, 500);
  }
});

function calculateLocalScore(hasNAP, hasSchema) {
  let score = 50;
  if (hasNAP) score += 30;
  if (hasSchema) score += 20;
  return Math.min(100, score);
}

export default router;
