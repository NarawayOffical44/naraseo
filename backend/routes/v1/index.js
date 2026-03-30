/**
 * V1 API Router - Aggregates all API v1 routes
 */

import express from 'express';
import auditRouter from './audit.js';
import crawlRouter from './crawl.js';
import keywordsRouter from './keywords.js';
import geoGridRouter from './geoGrid.js';
import localSeoRouter from './localSeo.js';
import schemaRouter from './schema.js';
import competitorsRouter from './competitors.js';
import chatRouter from './chat.js';
import fixesRouter from './fixes.js';
import solveRouter from './solve.js';
import solveSiteRouter from './solveSite.js';
import contentRouter from './content.js';
import reportRouter from './report.js';
import deployRouter from './deploy.js';
import verifyRouter from './verify.js';
import entityGapRouter from './entityGap.js';
import riskRouter from './risk.js';
import { openapiSpec } from './openapi.js';

const router = express.Router();

// Mount all sub-routers
router.use('/verify', verifyRouter);
router.use('/entity-gap', entityGapRouter);
router.use('/audit/risk', riskRouter);
router.use('/solve', solveRouter);
router.use('/solve-site', solveSiteRouter);
router.use('/audit', auditRouter);
router.use('/content', contentRouter);
router.use('/report', reportRouter);
router.use('/deploy', deployRouter);
router.use('/crawl', crawlRouter);
router.use('/keywords', keywordsRouter);
router.use('/geo-grid', geoGridRouter);
router.use('/local-seo', localSeoRouter);
router.use('/schema', schemaRouter);
router.use('/competitors', competitorsRouter);
router.use('/chat', chatRouter);
router.use('/fixes', fixesRouter);

// OpenAPI spec — for ChatGPT Actions, Perplexity, any OpenAPI tool
router.get('/openapi.json', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.json(openapiSpec);
});

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      version: '1.0',
      timestamp: new Date().toISOString(),
    },
  });
});

// API info
router.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'Naraseo AI - SEO Analysis API v1',
      version: '1.0',
      endpoints: [
        'POST /api/v1/solve         ← autonomous: full analysis + fixes in one call',
        'POST /api/v1/solve-site    ← site-wide: discover all pages, audit all, one plan',
        'POST /api/v1/audit         ← full page audit with Core Web Vitals',
        'GET  /api/v1/audit/:id     ← retrieve stored audit',
        'GET  /api/v1/audit/history?url= ← score trend over time',
        'POST /api/v1/content       ← keyword placement: find where to add keywords invisibly',
        'POST /api/v1/report        ← download full PDF audit report',
        'POST /api/v1/deploy        ← generate deployable SEO patch script (any CMS)',
        'POST /api/v1/keywords',
        'POST /api/v1/schema/validate',
        'POST /api/v1/local-seo',
        'POST /api/v1/geo-grid',
        'GET  /api/v1/geo-grid/history?url=&keyword= ← rank trend over time',
        'POST /api/v1/crawl',
        'POST /api/v1/competitors   ← includes real domain authority (OpenPageRank)',
        'POST /api/v1/chat',
        'POST /api/v1/fixes',
        'POST /api/v1/verify        ← hallucination detection + E-E-A-T scoring for AI content',
        'POST /api/v1/entity-gap   ← information gain: what entities competitors have that you lack',
        'POST /api/v1/audit/risk   ← hallucination risk audit: publishable verdict + legal risk signals',
        'GET  /api/v1/health',
        'GET  /api/v1/openapi.json',
      ],
      mcp: 'POST /mcp  (Streamable HTTP) | GET /mcp/sse  (SSE legacy)',
      auth: 'Bearer <api_key> — or unauthenticated (Free tier, IP rate-limited)',
      docs: '/api/v1/openapi.json',
    },
  });
});

export default router;
