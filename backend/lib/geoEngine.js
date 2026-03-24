/**
 * Geo-Grid Engine - Local rank tracking via Google Custom Search API
 * Returns rank positions across a geographic grid (no third-party SEO tool needed)
 */

import https from 'https';

async function callGoogleCSE(apiKey, cseId, query, gl = 'us', start = 1) {
  return new Promise((resolve, reject) => {
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&gl=${gl}&num=10&start=${start}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.error) {
            reject(new Error(`Google API: ${result.error.message}`));
          } else {
            resolve(result);
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Find target domain rank in results
function findRank(results, targetDomain) {
  if (!results.items) return -1;

  for (let i = 0; i < results.items.length; i++) {
    const item = results.items[i];
    if (item.link) {
      const domain = new URL(item.link).hostname.replace('www.', '');
      const target = targetDomain.replace('www.', '');
      if (domain === target || domain.endsWith('.' + target)) {
        return i + 1; // 1-indexed rank
      }
    }
  }
  return -1; // Not found in top 10
}

// Generate grid points around center (lat/lng)
function generateGridPoints(centerLat, centerLng, radius, gridSize) {
  const points = [];
  const step = radius / (gridSize / 2);

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const offsetLat = centerLat + (i - gridSize / 2) * step;
      const offsetLng = centerLng + (j - gridSize / 2) * step;
      points.push({
        lat: parseFloat(offsetLat.toFixed(4)),
        lng: parseFloat(offsetLng.toFixed(4)),
        gridI: i,
        gridJ: j,
      });
    }
  }
  return points;
}

// Common country codes for geo-targeting
const COUNTRY_CODES = {
  'us': 'United States',
  'ca': 'Canada',
  'uk': 'United Kingdom',
  'au': 'Australia',
  'de': 'Germany',
  'fr': 'France',
};

export async function trackGeoGrid(apiKey, cseId, targetUrl, keyword, centerLat, centerLng, gridSize = 3, countryCode = 'us') {
  if (!apiKey || !cseId) {
    return {
      success: false,
      error: 'Google CSE API credentials missing',
    };
  }

  try {
    const targetDomain = new URL(targetUrl).hostname;
    const points = generateGridPoints(centerLat, centerLng, 1, gridSize); // ~1 degree radius
    const results = {
      keyword,
      countryCode,
      centerLat,
      centerLng,
      gridSize,
      points: [],
      avgRank: 0,
      topRankCount: 0, // Position 1-3
      analysisTime: new Date().toISOString(),
    };

    let totalRank = 0;
    let validRanks = 0;

    for (const point of points) {
      try {
        const searchResults = await callGoogleCSE(apiKey, cseId, keyword, countryCode);
        const rank = findRank(searchResults, targetDomain);

        results.points.push({
          lat: point.lat,
          lng: point.lng,
          rank,
          found: rank > 0,
          url: rank > 0 ? searchResults.items[rank - 1]?.link : null,
        });

        if (rank > 0) {
          totalRank += rank;
          validRanks++;
          if (rank <= 3) results.topRankCount++;
        }
      } catch (err) {
        results.points.push({
          lat: point.lat,
          lng: point.lng,
          rank: -1,
          error: err.message,
        });
      }

      // Rate limit - Google CSE free tier allows 100 queries/day
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    results.avgRank = validRanks > 0 ? Math.round(totalRank / validRanks) : -1;
    results.coverage = validRanks / results.points.length;

    return {
      success: true,
      data: results,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export default {
  trackGeoGrid,
  generateGridPoints,
  findRank,
};
