/**
 * Geo-Grid Route - POST /api/v1/geo-grid
 * Local rank tracking across geographic points
 */

import express from 'express';
import { trackGeoGrid } from '../../lib/geoEngine.js';
import { featureAccess, sendApiError } from '../../middleware/apiKey.js';
import { saveRankSnapshot, getRankHistory } from '../../lib/history.js';
import supabase from '../../supabase.js';
import crypto from 'crypto';

const router = express.Router();

router.post('/', featureAccess('geoGrid'), async (req, res) => {
  const {
    url,
    keyword,
    centerLat,
    centerLng,
    gridSize = 3,
    countryCode = 'us',
  } = req.body;
  const requestId = `req_${crypto.randomBytes(6).toString('hex')}`;

  // Validate inputs
  if (!url || !keyword) {
    return sendApiError(res, 'MISSING_PARAMS', 'url and keyword required', 400);
  }

  if (typeof centerLat !== 'number' || typeof centerLng !== 'number') {
    return sendApiError(res, 'INVALID_COORDS', 'centerLat and centerLng must be numbers', 400);
  }

  if (![3, 5, 7].includes(gridSize)) {
    return sendApiError(res, 'INVALID_GRID', 'gridSize must be 3, 5, or 7', 400);
  }

  try {
    new URL(url);
  } catch (e) {
    return sendApiError(res, 'INVALID_URL', 'Invalid URL format', 400);
  }

  try {
    const startTime = Date.now();

    const geoResult = await trackGeoGrid(
      process.env.GOOGLE_CSE_API_KEY,
      process.env.GOOGLE_CSE_ID,
      url,
      keyword,
      centerLat,
      centerLng,
      gridSize,
      countryCode
    );

    if (!geoResult.success) {
      return sendApiError(res, 'GEO_TRACKING_FAILED', geoResult.error, 500);
    }

    const processingMs = Date.now() - startTime;

    // Persist rank snapshot (fire-and-forget)
    const { avgRank, coverage, points } = geoResult.data;
    saveRankSnapshot(supabase, {
      url,
      keyword,
      userId: req.user?.id,
      avgRank,
      coverage,
      gridSize,
      points,
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      data: geoResult.data,
      meta: {
        requestId,
        version: '1.0',
        processingMs,
        creditsUsed: gridSize * gridSize,
      },
    });
  } catch (error) {
    console.error('Geo-grid error:', error);
    return sendApiError(res, 'INTERNAL_ERROR', error.message, 500);
  }
});

// GET /api/v1/geo-grid/history?url=&keyword= - Rank trend over time
router.get('/history', featureAccess('geoGrid'), async (req, res) => {
  const { url, keyword, limit = 30 } = req.query;
  if (!url || !keyword) {
    return sendApiError(res, 'MISSING_PARAMS', 'url and keyword query params required', 400);
  }
  const history = await getRankHistory(supabase, url, keyword, parseInt(limit, 10));
  return res.status(200).json({ success: true, data: history });
});

export default router;
