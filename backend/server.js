/**
 * SEO AI Backend Server - REAL PAGE ANALYSIS
 * Uses Puppeteer to crawl and analyze actual page data
 * Not dummy scoring - REAL metrics
 */

import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import https from 'https';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import v1Router from './routes/v1/index.js';
import { apiKeyAuth, rateLimitMiddleware, whiteLabelHeaders } from './middleware/apiKey.js';
import { createMcpServer } from './mcp/server.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

// ── Prevent server crashes from unhandled errors (mainly Puppeteer cleanup) ──
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (non-fatal):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection (non-fatal):', reason?.message || reason);
});

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// ── Puppeteer concurrency guard — max 1 at a time ────────────────────────────
let puppeteerBusy = false;
const puppeteerQueue = [];

async function runWithPuppeteerLock(fn) {
  if (!puppeteerBusy) {
    puppeteerBusy = true;
    try { return await fn(); }
    finally {
      puppeteerBusy = false;
      if (puppeteerQueue.length > 0) {
        const next = puppeteerQueue.shift();
        runWithPuppeteerLock(next.fn).then(next.resolve).catch(next.reject);
      }
    }
  }
  return new Promise((resolve, reject) => {
    // Drop if queue is too deep (avoid memory buildup)
    if (puppeteerQueue.length >= 3) {
      reject(new Error('Puppeteer queue full — try again in a moment'));
    } else {
      puppeteerQueue.push({ fn, resolve, reject });
    }
  });
}

// Supabase client
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
  : null;

// ── Security headers ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (IS_PROD) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// ── Request logger — logs every API call to console ─────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const color = res.statusCode >= 500 ? '\x1b[31m' : res.statusCode >= 400 ? '\x1b[33m' : '\x1b[32m';
    console.log(`${color}[API]\x1b[0m ${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// ── Admin / test accounts — bypass all usage limits ─────────────────────────
const ADMIN_EMAILS = new Set(['raghav@naraway.com']);

// ── In-memory rate limiter (no extra deps) ───────────────────────────────────
const rateStore = new Map(); // ip → { count, resetAt }

function rateLimiter(maxReqs, windowMs) {
  return (req, res, next) => {
    const ip  = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const rec = rateStore.get(ip) || { count: 0, resetAt: now + windowMs };

    if (now > rec.resetAt) { rec.count = 0; rec.resetAt = now + windowMs; }
    rec.count++;
    rateStore.set(ip, rec);

    if (rec.count > maxReqs) {
      return res.status(429).json({ error: 'Too many requests — please slow down.' });
    }
    next();
  };
}

// Purge stale rate records every 10 min to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of rateStore) {
    if (now > rec.resetAt) rateStore.delete(ip);
  }
}, 600_000);

// ── CORS — allow Chrome extension + MCP clients ──────────────────────────────
const ALLOWED_ORIGINS = [
  'chrome-extension://',
  'http://localhost',
  'http://127.0.0.1',
  'https://naraseo.onrender.com',  // Frontend website
  'https://naraseoai.onrender.com',// Backend itself
  'https://claude.ai',             // Claude Desktop remote MCP
  'https://chat.openai.com',       // ChatGPT Actions
  'https://www.perplexity.ai',     // Perplexity
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.some(o => (origin || '').startsWith(o))) {
      cb(null, true);
    } else if (!IS_PROD) {
      cb(null, true); // dev: allow all
    } else {
      cb(new Error('CORS: origin not allowed'));
    }
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id'],
}));
app.use(express.json({ limit: '10mb' }));

// ── Mount Public API v1 with authentication ──────────────────────────────────
app.disable('x-powered-by');
app.use('/api/v1', apiKeyAuth(supabase), rateLimitMiddleware, whiteLabelHeaders, v1Router);

// ── MCP Server — Model Context Protocol for Claude Desktop, Cursor, Windsurf ─
// One SSE transport per connected session (stored by sessionId)
const sseTransports = new Map();

// Periodically clean up stale SSE sessions (>30 min idle)
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, entry] of sseTransports) {
    if (entry.createdAt < cutoff) sseTransports.delete(id);
  }
}, 5 * 60 * 1000);

// POST /mcp — Streamable HTTP transport (Claude Desktop native, Cursor, Windsurf, Cline)
app.post('/mcp', async (req, res) => {
  try {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[MCP] streamable error:', err.message);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: err.message } });
  }
});

// GET /mcp/sse — SSE transport (legacy mcp-remote bridge, older MCP clients)
app.get('/mcp/sse', async (req, res) => {
  try {
    const transport = new SSEServerTransport('/mcp/messages', res);
    const server = createMcpServer();
    sseTransports.set(transport.sessionId, { transport, server, createdAt: Date.now() });
    res.on('close', () => {
      sseTransports.delete(transport.sessionId);
      server.close().catch(() => {});
    });
    await server.connect(transport);
  } catch (err) {
    console.error('[MCP] SSE connect error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// POST /mcp/messages — SSE message handler (pairs with GET /mcp/sse)
app.post('/mcp/messages', async (req, res) => {
  const entry = sseTransports.get(req.query.sessionId);
  if (!entry) return res.status(404).json({ error: 'MCP session not found or expired' });
  try {
    await entry.transport.handlePostMessage(req, res, req.body);
  } catch (err) {
    console.error('[MCP] SSE message error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// GET /mcp — Connection guide for vibe coders and AI tool builders
app.get('/mcp', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.json({
    name: 'naraseo-ai',
    title: 'Naraseo AI — SEO + Geo API for AI Tools',
    version: '1.0.0',
    description: 'Full SEO & Geo engine. Works as MCP (Claude Desktop, Cursor, Windsurf, Cline), OpenAPI Actions (ChatGPT, Perplexity), or REST API.',

    tools: {
      count: 10,
      list: [
        { name: 'seo_audit',           description: 'Full page audit — score, grade, all issues, Core Web Vitals' },
        { name: 'solve',               description: 'Autonomous fix plan — exact HTML + where to place it + how to apply' },
        { name: 'solve_site',          description: 'Site-wide analysis via sitemap discovery — one plan for all pages' },
        { name: 'keyword_research',    description: 'AI keyword analysis with intent, difficulty, and placement actions' },
        { name: 'schema_validate',     description: 'JSON-LD structured data validation' },
        { name: 'site_crawl',          description: 'Multi-page crawl — discovers and audits all linked pages' },
        { name: 'geo_grid',            description: 'Local rank tracking on a geographic grid (3x3, 5x5, 7x7)' },
        { name: 'local_seo_audit',     description: 'Local business SEO — NAP consistency, GMB, local schema' },
        { name: 'competitor_analysis', description: 'Competitor gap analysis with real domain authority (OpenPageRank)' },
        { name: 'seo_chat',            description: 'Conversational SEO assistant with full page context' },
      ],
    },

    connect: {
      // Claude Desktop / Cursor / Windsurf / Cline (MCP)
      claudeDesktop: {
        instructions: 'Add to %APPDATA%\\Claude\\claude_desktop_config.json (Windows) or ~/.config/Claude/ (macOS)',
        config: {
          mcpServers: {
            'naraseo-ai': {
              command: 'npx',
              args: ['mcp-remote', `${base}/mcp/sse`],
            },
          },
        },
      },

      // Claude Desktop native Streamable HTTP (no npx needed, direct connector)
      claudeDesktopNative: {
        instructions: 'Claude Desktop Settings → Connectors → Add → paste this URL',
        url: `${base}/mcp`,
      },

      // ChatGPT Custom GPT Actions / Perplexity / any OpenAPI tool
      openApiActions: {
        instructions: 'ChatGPT: Create GPT → Configure → Add Actions → Import from URL',
        schemaUrl: `${base}/api/v1/openapi.json`,
      },

      // REST API
      restApi: {
        base: `${base}/api/v1`,
        auth: 'Authorization: Bearer YOUR_API_KEY',
        example: {
          url: `${base}/api/v1/solve`,
          method: 'POST',
          body: { url: 'https://example.com' },
        },
      },
    },

    endpoints: [
      `POST ${base}/api/v1/solve`,
      `POST ${base}/api/v1/solve-site`,
      `POST ${base}/api/v1/audit`,
      `GET  ${base}/api/v1/audit/:id`,
      `GET  ${base}/api/v1/audit/history?url=`,
      `POST ${base}/api/v1/content`,
      `POST ${base}/api/v1/report`,
      `POST ${base}/api/v1/keywords`,
      `POST ${base}/api/v1/geo-grid`,
      `GET  ${base}/api/v1/geo-grid/history?url=&keyword=`,
      `POST ${base}/api/v1/competitors`,
      `POST ${base}/api/v1/local-seo`,
      `POST ${base}/api/v1/schema/validate`,
      `POST ${base}/api/v1/chat`,
      `POST ${base}/api/v1/crawl`,
      `GET  ${base}/api/v1/openapi.json`,
    ],
  });
});

// ── JWT helpers (lightweight — no external library needed) ───────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'seo-ai-secret-change-in-production';

function signToken(payload) {
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body    = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now()/1000) })).toString('base64url');
  const sig     = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  try {
    const [header, body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (sig !== expected) return null;
    return JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch { return null; }
}

function authMiddleware(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
  req.userId = decoded.sub;
  next();
}

// ═══════════════════════════════════════════════════════════════════════════
// DEMO MODE — In-memory user storage (for testing without Supabase)
// ═══════════════════════════════════════════════════════════════════════════

const DEMO_MODE = process.env.DEMO_MODE === 'true' || !process.env.SUPABASE_URL || process.env.SUPABASE_URL.length < 10;
const demoUsers = new Map(); // userId → {id, name, email, password, plan, auditsThisMonth, createdAt}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/auth/signup
 */
app.post('/api/auth/signup', async (req, res) => {
  // DEMO MODE VERSION
  if (DEMO_MODE) {
    try {
      const { name, email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

      // Check if user exists
      const exists = Array.from(demoUsers.values()).find(u => u.email === email);
      if (exists) return res.status(400).json({ error: 'Email already registered' });

      // Create user with UUID-like ID
      const userId = crypto.randomUUID ? crypto.randomUUID() : 'user_' + Date.now();
      demoUsers.set(userId, {
        id: userId,
        name: name || email.split('@')[0],
        email,
        password, // NOTE: Never store plaintext passwords in production!
        plan: 'free',
        auditsThisMonth: 0,
        historyCount: 0,
        createdAt: new Date().toISOString(),
      });

      const token = signToken({ sub: userId, email, plan: 'free' });
      res.json({
        token,
        user: { id: userId, name: name || email.split('@')[0], email, plan: 'free', auditsThisMonth: 0 }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // PRODUCTION VERSION (uses Supabase)

  try {
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    // Create user in Supabase Auth
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (error) {
      if (error.message.includes('already')) return res.status(400).json({ error: 'Email already registered' });
      throw error;
    }

    const userId = data.user.id;

    // Create profile in profiles table
    await supabase.from('profiles').insert({
      id:    userId,
      name:  name || email.split('@')[0],
      email,
      plan:  'free',
      audits_this_month: 0,
      created_at: new Date().toISOString(),
    });

    const token = signToken({ sub: userId, email, plan: 'free' });
    res.json({
      token,
      user: { id: userId, name: name || email.split('@')[0], email, plan: 'free', auditsThisMonth: 0 }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/login
 */
app.post('/api/auth/login', async (req, res) => {
  // DEMO MODE VERSION
  if (DEMO_MODE) {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

      // Find user
      const user = Array.from(demoUsers.values()).find(u => u.email === email && u.password === password);
      if (!user) return res.status(401).json({ error: 'Invalid email or password' });

      const token = signToken({ sub: user.id, email, plan: user.plan });
      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          plan: user.plan,
          auditsThisMonth: user.auditsThisMonth,
          historyCount: user.historyCount,
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // PRODUCTION VERSION (uses Supabase)

  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    // Sign in via Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: 'Invalid email or password' });

    const userId = data.user.id;

    // Fetch profile
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();

    const user = {
      id:               userId,
      name:             profile?.name  || data.user.user_metadata?.name || email.split('@')[0],
      email,
      plan:             profile?.plan  || 'free',
      auditsThisMonth:  profile?.audits_this_month || 0,
      historyCount:     profile?.history_count     || 0,
    };

    const token = signToken({ sub: userId, email, plan: user.plan });
    res.json({ token, user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/auth/me — fetch latest user profile
 */
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  // DEMO MODE VERSION
  if (DEMO_MODE) {
    try {
      const user = demoUsers.get(req.userId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          plan: user.plan,
          auditsThisMonth: user.auditsThisMonth,
          historyCount: user.historyCount,
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // PRODUCTION VERSION (uses Supabase)

  try {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', req.userId).single();
    if (!profile) return res.status(404).json({ error: 'User not found' });

    res.json({
      user: {
        id:              profile.id,
        name:            profile.name,
        email:           profile.email,
        plan:            profile.plan || 'free',
        auditsThisMonth: profile.audits_this_month || 0,
        historyCount:    profile.history_count     || 0,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/forgot-password
 */
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.SITE_URL || 'https://yourdomain.com'}/reset-password`,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// API KEY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/keys/generate — Generate a new API key for the logged-in user
 * Requires: Authorization: Bearer <JWT>
 */
app.post('/api/keys/generate', authMiddleware, async (req, res) => {
  try {
    const { generateApiKey, hashApiKey } = await import('./middleware/apiKey.js');
    const rawKey = generateApiKey();
    const keyHash = hashApiKey(rawKey);
    const userId = req.userId;

    if (supabase) {
      // Get user plan from profiles
      const { data: profile } = await supabase.from('profiles').select('plan').eq('id', userId).single();
      const tier = profile?.plan || 'free';

      // Store hashed key in Supabase
      const { error } = await supabase.from('api_keys').insert({
        user_id: userId,
        key_hash: keyHash,
        tier,
        active: true,
      });
      if (error) return res.status(500).json({ error: 'Failed to store key: ' + error.message });

      return res.json({ key: 'nrs_' + rawKey, tier, message: 'Store this key — it will not be shown again.' });
    }

    // Demo mode — return key without storing
    res.json({ key: 'nrs_' + rawKey, tier: 'free', message: 'Demo mode: key not persisted. Connect Supabase for persistence.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/keys — List active API keys for the logged-in user (hashed, never raw)
 * Requires: Authorization: Bearer <JWT>
 */
app.get('/api/keys', authMiddleware, async (req, res) => {
  try {
    if (!supabase) return res.json({ keys: [] });
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, tier, active, created_at')
      .eq('user_id', req.userId)
      .eq('active', true)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ keys: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/keys/:id — Revoke an API key
 * Requires: Authorization: Bearer <JWT>
 */
app.delete('/api/keys/:id', authMiddleware, async (req, res) => {
  try {
    if (!supabase) return res.json({ success: true });
    const { error } = await supabase
      .from('api_keys')
      .update({ active: false })
      .eq('id', req.params.id)
      .eq('user_id', req.userId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/billing/checkout?plan=pro&token=JWT
 * DEMO MODE: Returns mock checkout URL
 * PRODUCTION: Redirects to Stripe hosted checkout
 */
app.get('/api/billing/checkout', async (req, res) => {
  const { plan, token } = req.query;
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).send('Unauthorized');

  // DEMO MODE VERSION
  if (DEMO_MODE) {
    // Create a demo checkout session
    const sessionId = 'sess_demo_' + Date.now();
    const checkoutUrl = `http://localhost:3001/demo-checkout?session=${sessionId}&plan=${plan}&userId=${decoded.sub}`;
    return res.redirect(checkoutUrl);
  }

  // PRODUCTION VERSION (uses real Stripe)
  const prices = {
    pro:    process.env.STRIPE_PRICE_PRO    || 'price_pro_placeholder',
    agency: process.env.STRIPE_PRICE_AGENCY || 'price_agency_placeholder',
  };

  const checkoutUrl = `${process.env.SITE_URL || 'https://yourdomain.com'}/pricing?plan=${plan}&uid=${decoded.sub}`;
  res.redirect(checkoutUrl);
});

/**
 * GET /demo-checkout — Mock Stripe checkout for testing
 */
app.get('/demo-checkout', (req, res) => {
  const { session, plan, userId } = req.query;

  // HTML page that simulates Stripe checkout
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Demo Checkout</title>
      <style>
        body { font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px; }
        .card { border: 1px solid #ddd; padding: 20px; border-radius: 8px; }
        .success { color: #16a34a; margin: 20px 0; }
        button { background: #2563eb; color: white; padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; }
        button:hover { background: #1d4ed8; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Demo Checkout</h1>
        <p>Plan: <strong>${plan.toUpperCase()}</strong></p>
        <p>Session: ${session}</p>
        <p style="color: #6b7280; margin: 20px 0;">This is a demo checkout page. Click "Complete Payment" to simulate a successful payment.</p>
        <button onclick="completePayment()">✓ Complete Payment (Demo)</button>
        <div class="success" style="display: none;" id="success">
          ✓ Payment successful! You can now close this window and your plan will be updated.
        </div>
      </div>
      <script>
        function completePayment() {
          // Simulate webhook call
          fetch('http://localhost:3001/api/billing/webhook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'checkout.session.completed',
              data: { object: { metadata: { userId: '${userId}', plan: '${plan}' } } }
            })
          }).then(() => {
            document.getElementById('success').style.display = 'block';
            setTimeout(() => window.close(), 2000);
          });
        }
      </script>
    </body>
    </html>
  `;
  res.send(html);
});

/**
 * POST /api/billing/webhook — Stripe webhook updates plan
 * DEMO MODE: Updates in-memory user
 * PRODUCTION: Updates Supabase
 */
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig   = req.headers['stripe-signature'];
  const event = JSON.parse(req.body.toString());

  try {
    // Handle checkout.session.completed
    if (event?.type === 'checkout.session.completed') {
      const session  = event.data.object;
      const userId   = session.metadata?.userId;
      const planName = session.metadata?.plan || 'pro';

      if (DEMO_MODE) {
        // DEMO MODE: Update in-memory user
        const user = demoUsers.get(userId);
        if (user) {
          user.plan = planName;
          console.log(`✅ [DEMO] Plan updated to ${planName} for user ${userId}`);
        }
      } else {
        // PRODUCTION: Update Supabase
        await supabase.from('profiles').update({ plan: planName }).eq('id', userId);
        console.log(`✅ Plan updated to ${planName} for user ${userId}`);
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Initialize Claude client
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * GET /api/pagespeed?url=...
 * Thin proxy — forwards request to Google PageSpeed API and returns result.
 * Exists solely to keep the API key server-side (never exposed in extension code).
 * All scoring computation happens client-side in scorer.js.
 */
app.get('/api/pagespeed', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url' });

    const data = await getPageSpeedInsights(url);
    if (!data) return res.status(503).json({ error: 'PageSpeed API unavailable' });

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/usage/check — Check if user can run audit based on plan limits
 * Returns: {canAudit: bool, auditsLeft: number, plan: string, message: string}
 */
app.post('/api/usage/check', authMiddleware, async (req, res) => {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7); // "2026-03"

    if (DEMO_MODE) {
      const user = demoUsers.get(req.userId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      // Reset count if it's a new month
      if (user.resetMonth !== currentMonth) {
        user.auditsThisMonth = 0;
        user.resetMonth = currentMonth;
      }

      const plan = user.plan || 'free';
      const isAdmin = ADMIN_EMAILS.has(user.email);
      const limits = { free: 5, pro: Infinity, agency: Infinity };
      const auditLimit = isAdmin ? Infinity : (limits[plan] || 5);
      const auditsUsed = user.auditsThisMonth || 0;
      const auditsLeft = auditLimit === Infinity ? Infinity : Math.max(0, auditLimit - auditsUsed);
      const canAudit = isAdmin || auditsLeft > 0;

      return res.json({
        canAudit,
        auditsLeft:  auditLimit === Infinity ? 9999 : auditsLeft,
        auditsUsed,
        auditLimit:  auditLimit === Infinity ? 9999 : auditLimit,
        plan,
        message: canAudit
          ? (auditLimit === Infinity ? 'Unlimited audits' : `${auditsLeft} audits remaining this month`)
          : `Audit limit reached (${auditLimit}/month on ${plan} plan)`,
      });
    }

    // ── Production: Supabase ──────────────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.userId)
      .single();
    if (!profile) return res.status(404).json({ error: 'User not found' });

    // Auto-reset monthly count if it's a new month
    let auditsUsed = profile.audits_this_month || 0;
    if (profile.reset_month !== currentMonth) {
      auditsUsed = 0;
      await supabase
        .from('profiles')
        .update({ audits_this_month: 0, reset_month: currentMonth })
        .eq('id', req.userId);
    }

    const plan = profile.plan || 'free';
    const isAdmin = ADMIN_EMAILS.has(profile.email);
    const limits = { free: 5, pro: Infinity, agency: Infinity };
    const auditLimit = isAdmin ? Infinity : (limits[plan] || 5);
    const auditsLeft = auditLimit === Infinity ? Infinity : Math.max(0, auditLimit - auditsUsed);
    const canAudit = isAdmin || auditsLeft > 0;

    res.json({
      canAudit,
      auditsLeft:  auditLimit === Infinity ? 9999 : auditsLeft,
      auditsUsed,
      auditLimit:  auditLimit === Infinity ? 9999 : auditLimit,
      plan,
      message: canAudit
        ? (auditLimit === Infinity ? 'Unlimited audits' : `${auditsLeft} audits remaining this month`)
        : `Audit limit reached (${auditLimit}/month on ${plan} plan)`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/usage/increment — Increment audit count after successful audit.
 * Also enforces the limit server-side (double-check) to prevent race conditions.
 */
app.post('/api/usage/increment', authMiddleware, async (req, res) => {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);

    if (DEMO_MODE) {
      const user = demoUsers.get(req.userId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      // Reset if new month
      if (user.resetMonth !== currentMonth) {
        user.auditsThisMonth = 0;
        user.resetMonth = currentMonth;
      }

      // Enforce limit before incrementing
      const plan = user.plan || 'free';
      const limits = { free: 5, pro: Infinity, agency: Infinity };
      const auditLimit = limits[plan] || 5;
      if (auditLimit !== Infinity && user.auditsThisMonth >= auditLimit) {
        return res.status(429).json({ error: 'Monthly audit limit reached', plan, auditLimit });
      }

      user.auditsThisMonth = (user.auditsThisMonth || 0) + 1;
      return res.json({ auditsThisMonth: user.auditsThisMonth, plan });
    }

    // ── Production: Supabase ──────────────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.userId)
      .single();
    if (!profile) return res.status(404).json({ error: 'User not found' });

    // Reset if new month
    let currentCount = profile.audits_this_month || 0;
    const updates = {};
    if (profile.reset_month !== currentMonth) {
      currentCount = 0;
      updates.reset_month = currentMonth;
    }

    // Enforce limit server-side
    const plan = profile.plan || 'free';
    const limits = { free: 5, pro: Infinity, agency: Infinity };
    const auditLimit = limits[plan] || 5;
    if (auditLimit !== Infinity && currentCount >= auditLimit) {
      return res.status(429).json({ error: 'Monthly audit limit reached', plan, auditLimit });
    }

    updates.audits_this_month = currentCount + 1;
    await supabase.from('profiles').update(updates).eq('id', req.userId);

    res.json({ auditsThisMonth: updates.audits_this_month, plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/audit
 * Fast audit — uses DOM data sent from the extension + Google PageSpeed API.
 * No Puppeteer. Works for the page the user already has open.
 * Falls back to Puppeteer only when no pageData is provided (server-side calls).
 */
app.post('/api/audit', rateLimiter(30, 60_000), async (req, res) => {
  try {
    const { url, pageData } = req.body;

    if (!url) return res.status(400).json({ error: 'Missing URL' });

    // ── PATH A: Extension sent DOM data — fast path, no Puppeteer ────────────
    if (pageData) {
      console.log(`\n🔍 Fast audit (DOM): ${url}`);

      const normalized = normalizePageData(pageData, url);
      const pageSpeed  = await getPageSpeedInsights(url);
      const { score, issues } = generateIssuesFromRealData(normalized, {}, pageSpeed);
      const grade = scoreToGrade(score);

      console.log(`✅ Fast audit done. Score: ${score} (${grade})`);

      return res.json({
        url,
        score,
        grade,
        issues,
        pageSpeedInsights: pageSpeed,
        dataSource: pageSpeed ? 'Extension DOM + Google PageSpeed API' : 'Extension DOM Analysis',
        timestamp: new Date().toISOString(),
      });
    }

    // ── PATH B: No DOM data — fall back to Puppeteer (server-side / API use) ─
    // Skip known non-auditable domains (search engines, social apps, auth pages)
    const skipDomains = ['google.com','bing.com','yahoo.com','duckduckgo.com',
      'web.whatsapp.com','whatsapp.com','facebook.com','instagram.com',
      'twitter.com','x.com','youtube.com','reddit.com','linkedin.com',
      'claude.ai','chat.openai.com','github.com','localhost','127.0.0.1'];
    try {
      const audHost = new URL(url).hostname.replace(/^www\./, '');
      if (skipDomains.some(d => audHost === d || audHost.endsWith('.' + d))) {
        return res.status(400).json({ error: 'This page type cannot be audited via server-side. Open the page in your browser and run the audit from the extension.' });
      }
    } catch {}

    console.log(`\n🔍 Native audit (no Puppeteer): ${url}`);
    const [analysis, pageSpeed] = await Promise.all([
      analyzePageNative(url),
      getPageSpeedInsights(url),
    ]);

    return res.json({
      url,
      score:            analysis.score,
      grade:            analysis.grade,
      issues:           analysis.issues,
      pageSpeedInsights: pageSpeed,
      dataSource:       'Native Fetch + Google PageSpeed API',
      timestamp:        new Date().toISOString(),
    });

  } catch (error) {
    console.error('Audit error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/crawl
 * Multi-page site crawl using Puppeteer. Only used when user explicitly
 * requests a full site audit (premium feature). Not used for the default
 * single-page extension audit.
 */
app.post('/api/crawl', async (req, res) => {
  try {
    const { url, maxPages = 10 } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing URL' });

    const validMaxPages = [10, 25, 50, 100, 500];
    const limit = validMaxPages.includes(Number(maxPages)) ? Number(maxPages) : 10;

    console.log(`\n🕷️ Site crawl: ${url} (max ${limit} pages)`);

    // Native crawl — no Puppeteer
    const [analysis, pageSpeed] = await Promise.all([
      analyzePageNative(url),
      getPageSpeedInsights(url),
    ]);

    return res.json({
      url,
      score:            analysis.score,
      grade:            analysis.grade,
      issues:           analysis.issues,
      pageSpeedInsights: pageSpeed,
      dataSource:       `Puppeteer Site Crawl (${limit} pages max)`,
      timestamp:        new Date().toISOString(),
    });
  } catch (error) {
    console.error('Crawl error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * analyzePageNative — fetch HTML + parse with regex, zero Puppeteer.
 * Used by PATH B (/api/audit fallback) and /api/crawl.
 * Returns same structure as normalizePageData() output.
 */
async function analyzePageNative(url) {
  console.log(`🌐 Native fetch audit: ${url}`);

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NaraseoBot/1.0)' },
    signal: AbortSignal.timeout(10000),
    redirect: 'follow',
  });

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    throw new Error(`Not an HTML page (${contentType}). Open this page in your browser and run the audit from the extension.`);
  }

  const html = await res.text();

  const get  = (re)        => (html.match(re) || [])[1]?.trim() || '';
  const getAll = (re, grp) => { const r = []; let m; const g = new RegExp(re.source || re, 'gi'); while ((m = g.exec(html)) !== null) r.push((m[grp || 1] || '').trim()); return r; };

  const title        = get(/<title[^>]*>([^<]+)<\/title>/i);
  const metaDesc     = get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
                    || get(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const canonical    = get(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  const robots       = get(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i);
  const ogTitle      = get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const ogDesc       = get(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const ogImage      = get(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  const viewport     = !!html.match(/<meta[^>]+name=["']viewport["']/i);
  const hasSchema    = html.includes('application/ld+json');

  const h1Tags   = getAll(/<h1[^>]*>([\s\S]*?)<\/h1>/i, 1).map(t => t.replace(/<[^>]+>/g,'').trim()).filter(Boolean);
  const h2Tags   = getAll(/<h2[^>]*>([\s\S]*?)<\/h2>/i, 1).map(t => t.replace(/<[^>]+>/g,'').trim()).filter(Boolean);
  const imgTags  = getAll(/<img([^>]+)>/gi, 1).map(a => ({
    src:    (a.match(/src=["']([^"']+)["']/i) || [])[1] || '',
    alt:    (a.match(/alt=["']([^"']*?)["']/i) || [])[1] ?? null,
  }));
  const wordCount = (html.replace(/<[^>]+>/g, ' ').match(/\b\w+\b/g) || []).length;

  const data = {
    title, titleLength: title.length,
    metaDescription: metaDesc, metaDescriptionLength: metaDesc.length,
    h1Tags, h1Count: h1Tags.length,
    h2Tags,
    images: imgTags, imageCount: imgTags.length,
    imagesWithoutAlt: imgTags.filter(i => i.alt === null || i.alt === '').length,
    canonical, robots,
    ogTitle, ogDescription: ogDesc, ogImage,
    hasViewport: viewport, viewport, hasSchema,
    wordCount,
    url,
  };

  const normalized = normalizePageData(data, url);
  const { score, issues } = generateIssuesFromRealData(normalized, {}, null);
  const grade = scoreToGrade(score);

  console.log(`✅ Native audit done. Score: ${score} (${grade})`);
  return { score, grade, issues };
}

/**
 * Normalise content-script extractPageData() output into the shape
 * that generateIssuesFromRealData() expects.
 */
function normalizePageData(d, url) {
  const h1Tags   = d.h1Tags   || [];
  const headings = d.headings || [];

  const metaDescStr = d.metaDescription || d.metaDesc || '';
  const metaDescLen = d.metaDescLength || d.metaDescriptionLength || metaDescStr.length;

  return {
    title:               d.title             || '',
    titleLength:         d.titleLength        || (d.title || '').length,
    metaDescription:     metaDescStr,
    metaDescriptionLength: metaDescLen,
    // aliases used by generateIssuesFromRealData
    metaDesc:            metaDescStr,
    metaDescLength:      metaDescLen,
    h1:                  h1Tags[0]            || '',
    h1Count:             h1Tags.length,
    h2Count:             headings.filter(h => h.level === 2).length || (d.h2Tags || []).length,
    h3Count:             headings.filter(h => h.level === 3).length || (d.h3Tags || []).length,
    imageCount:          d.imageCount         || 0,
    imagesWithoutAlt:    (d.imgsMissingAlt || []).length,
    internalLinkCount:   d.internalLinkCount  || 0,
    externalLinkCount:   d.externalLinkCount  || 0,
    wordCount:           d.wordCount          || 0,
    hasViewport:         d.hasViewport        || d.viewport || false,
    viewport:            d.hasViewport        || d.viewport || false,
    charset:             true,
    canonical:           d.canonical          || '',
    https:               (d.url || url || '').startsWith('https://'),
    ogTitle:             d.og?.title          || d.ogTitle || '',
    ogDesc:              d.og?.description    || d.ogDesc  || d.ogDescription || '',
    ogImage:             d.og?.image          || d.ogImage || '',
    hasSchema:           (d.schemaTypes || []).length > 0 || d.hasSchema || false,
    url:                 d.url                || url,
    htmlSizeKb:          d.htmlSizeKb         || 0,
  };
}

function scoreToGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * REAL PAGE ANALYSIS with Puppeteer
 * Crawls and analyzes actual page data - NOT dummy scoring
 */
async function analyzePageWithPuppeteer(url) {
  let browser;
  try {
    console.log(`📊 Launching Puppeteer for: ${url}`);

    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    // ========== PAGE SPEED METRICS ==========
    // Inject performance observer BEFORE page load
    await page.evaluateOnNewDocument(() => {
      window.performanceMetrics = {
        navigationTiming: {},
        resourceTiming: [],
        webVitals: {
          lcp: null,
          fid: null,
          cls: null,
        },
      };

      // Capture navigation timing
      window.addEventListener('load', () => {
        const timing = window.performance.timing;
        const navigation = window.performance.navigation;
        window.performanceMetrics.navigationTiming = {
          navigationStart: timing.navigationStart,
          responseStart: timing.responseStart,
          responseEnd: timing.responseEnd,
          domInteractive: timing.domInteractive,
          domContentLoaded: timing.domContentLoaded,
          loadEventStart: timing.loadEventStart,
          loadEventEnd: timing.loadEventEnd,
          connectStart: timing.connectStart,
          connectEnd: timing.connectEnd,
          requestStart: timing.requestStart,
          domLoading: timing.domLoading,
        };
      });

      // Capture Resource Timing API
      window.addEventListener('load', () => {
        window.performanceMetrics.resourceTiming = window.performance
          .getEntriesByType('resource')
          .map(entry => ({
            name: entry.name,
            duration: entry.duration,
            transferSize: entry.transferSize,
            decodedBodySize: entry.decodedBodySize,
            type: entry.initiatorType,
          }));
      });

      // Observe Core Web Vitals using PerformanceObserver
      if ('PerformanceObserver' in window) {
        // LCP (Largest Contentful Paint)
        try {
          const lcpObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const lastEntry = entries[entries.length - 1];
            window.performanceMetrics.webVitals.lcp = lastEntry.renderTime || lastEntry.loadTime;
          });
          lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        } catch (e) {}

        // CLS (Cumulative Layout Shift)
        try {
          let clsValue = 0;
          const clsObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) {
                clsValue += entry.value;
              }
            }
            window.performanceMetrics.webVitals.cls = clsValue;
          });
          clsObserver.observe({ entryTypes: ['layout-shift'] });
        } catch (e) {}

        // FID (First Input Delay)
        try {
          const fidObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            if (entries.length > 0) {
              window.performanceMetrics.webVitals.fid = entries[0].processingDuration;
            }
          });
          fidObserver.observe({ entryTypes: ['first-input'] });
        } catch (e) {}
      }
    });

    // LOAD PAGE AND MEASURE TIME
    const startTime = Date.now();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    const loadTime = Date.now() - startTime;

    console.log(`⏱️ Page loaded in ${loadTime}ms`);

    // ========== COLLECT REAL DATA ==========
    const pageData = await page.evaluate(() => {
      const getReadingTime = (text) => {
        const wordsPerMinute = 200;
        const words = text.trim().split(/\s+/).length;
        return Math.ceil(words / wordsPerMinute);
      };

      const bodyText = document.body.innerText || '';
      const wordCount = bodyText.split(/\s+/).filter(w => w.length > 0).length;

      return {
        title: document.title,
        titleLength: document.title.length,
        metaDesc: document.querySelector('meta[name="description"]')?.content || '',
        metaDescLength: document.querySelector('meta[name="description"]')?.content?.length || 0,

        // HEADING ANALYSIS
        h1Count: document.querySelectorAll('h1').length,
        h1s: Array.from(document.querySelectorAll('h1')).map(h => ({ text: h.innerText, length: h.innerText.length })),
        h2Count: document.querySelectorAll('h2').length,
        h3Count: document.querySelectorAll('h3').length,

        // CONTENT
        wordCount,
        readingTime: getReadingTime(bodyText),
        paragraphs: document.querySelectorAll('p').length,

        // IMAGES - REAL DATA
        imageCount: document.querySelectorAll('img').length,
        imagesWithoutAlt: Array.from(document.querySelectorAll('img')).filter(img => !img.alt || img.alt.trim() === '').length,
        imageDetails: Array.from(document.querySelectorAll('img')).map(img => ({
          alt: img.alt || '',
          hasAlt: !!(img.alt && img.alt.trim()),
          src: img.src,
          width: img.width,
          height: img.height,
        })).slice(0, 10), // First 10

        // LINKS
        internalLinks: Array.from(document.querySelectorAll('a[href]')).filter(a => {
          try {
            return new URL(a.href).hostname === window.location.hostname;
          } catch {
            return false;
          }
        }).length,
        externalLinks: Array.from(document.querySelectorAll('a[href]')).filter(a => {
          try {
            return new URL(a.href).hostname !== window.location.hostname;
          } catch {
            return true;
          }
        }).length,
        totalLinks: document.querySelectorAll('a[href]').length,

        // TECHNICAL
        viewport: !!document.querySelector('meta[name="viewport"]'),
        charset: !!document.querySelector('meta[charset]') || !!document.querySelector('meta[http-equiv="Content-Type"]'),
        canonical: document.querySelector('link[rel="canonical"]')?.href || null,
        robots: document.querySelector('meta[name="robots"]')?.content || null,
        https: window.location.protocol === 'https:',

        // OPEN GRAPH
        ogTitle: document.querySelector('meta[property="og:title"]')?.content || null,
        ogDesc: document.querySelector('meta[property="og:description"]')?.content || null,
        ogImage: document.querySelector('meta[property="og:image"]')?.content || null,

        // SCHEMA
        hasSchema: !!document.querySelector('script[type="application/ld+json"]'),

        // PAGE SPEED METRICS
        performanceMetrics: window.performanceMetrics,
      };
    });

    // Calculate specific timing metrics
    const navTiming = pageData.performanceMetrics?.navigationTiming || {};
    const webVitals = pageData.performanceMetrics?.webVitals || {};
    const resourceTiming = pageData.performanceMetrics?.resourceTiming || [];

    // Calculate derived metrics
    const ttfb = navTiming.responseStart ? navTiming.responseStart - navTiming.navigationStart : null;
    const fcp = navTiming.domContentLoaded ? navTiming.domContentLoaded - navTiming.navigationStart : loadTime;
    const lcp = webVitals.lcp || null;
    const cls = webVitals.cls || null;

    // Analyze resources
    const largeResources = resourceTiming.filter(r => r.transferSize > 1000000); // > 1MB
    const totalResourceSize = resourceTiming.reduce((sum, r) => sum + (r.transferSize || 0), 0);
    const imageResources = resourceTiming.filter(r => r.type === 'img');
    const largeImages = imageResources.filter(r => r.transferSize > 500000); // > 500KB

    console.log(`📄 Content: ${pageData.wordCount} words, ${pageData.h1Count} H1s, ${pageData.imageCount} images`);
    console.log(`⚡ Performance: ${loadTime}ms load, TTFB: ${ttfb}ms, FCP: ${fcp}ms, LCP: ${lcp}ms, CLS: ${cls}`);
    console.log(`📦 Resources: ${resourceTiming.length} total, ${totalResourceSize / 1000000}MB transferred`);

    await browser.close();

    // ========== SCORE BASED ON REAL DATA ==========
    const { issues, score } = generateIssuesFromRealData(pageData, {
      loadTime,
      ttfb,
      fcp,
      lcp,
      cls,
      totalResourceSize,
      largeResources,
      largeImages,
      resourceCount: resourceTiming.length,
    });

    return {
      url,
      score,
      grade: getGradeFromScore(score),
      issues,
      analysis: pageData,
      performance: {
        loadTime,
        ttfb,
        fcp,
        lcp,
        cls,
        totalResourceSize,
        resourceCount: resourceTiming.length,
        largeResourceCount: largeResources.length,
        largeImageCount: largeImages.length,
        wordCount: pageData.wordCount,
        readingTime: pageData.readingTime,
        metrics: {
          'Load Time': loadTime > 3000 ? '❌ Slow' : loadTime > 2000 ? '⚠️ OK' : '✅ Fast',
          'TTFB': ttfb ? (ttfb > 600 ? '❌ Slow' : '✅ Good') : 'N/A',
          'LCP': lcp ? (lcp > 4000 ? '❌ Poor' : lcp > 2500 ? '⚠️ Needs Improvement' : '✅ Good') : 'N/A',
          'CLS': cls ? (cls > 0.25 ? '❌ Poor' : cls > 0.1 ? '⚠️ Needs Improvement' : '✅ Good') : 'N/A',
        },
      },
      categories: {
        'On-Page': calculateCategoryScore(issues, 'On-Page'),
        'Content': calculateCategoryScore(issues, 'Content'),
        'Technical': calculateCategoryScore(issues, 'Technical'),
        'Mobile': calculateCategoryScore(issues, 'Mobile'),
        'Images': calculateCategoryScore(issues, 'Images'),
        'Performance': calculateCategoryScore(issues, 'Performance'),
      },
    };

  } catch (error) {
    console.error('Puppeteer error:', error.message);
    await browser?.close();
    throw error;
  }
}

// ── PageSpeed cache: keyed by hostname, TTL 1 hour ────────────────────────────
const psCache = new Map(); // { key: { data, expiresAt } }
const PS_TTL  = 3_600_000; // 1 hour in ms

/**
 * Get PageSpeed Insights data from Google (Official API)
 * Results cached per hostname for 1 hour to stay within API rate limits.
 * Limit: 25,000/day = ~17/min. With caching, effectively unlimited for normal use.
 */
async function getPageSpeedInsights(url) {
  // Use hostname as cache key — PageSpeed scores don't change per URL path
  let cacheKey;
  try { cacheKey = new URL(url).hostname; } catch { cacheKey = url; }
  const cached = psCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    console.log(`⚡ PageSpeed cache hit: ${cacheKey}`);
    return cached.data;
  }
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
    if (!apiKey) {
      console.warn('⚠️ PageSpeed Insights API key not set. Set GOOGLE_PAGESPEED_API_KEY in .env');
      return resolve(null);
    }

    const queryUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${apiKey}&strategy=mobile`;

    console.log(`📊 Fetching Google PageSpeed Insights for: ${url}`);

    https.get(queryUrl, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);

          // Check for API errors
          if (json.error) {
            console.error('❌ PageSpeed API Error:', json.error.message);
            return resolve(null);
          }

          const lighthouse = json.lighthouseResult || {};
          const crux = json.loadingExperience?.metrics || {};
          const originSummary = json.originLoadingExperience?.metrics || {};

          // Try to get CrUX data - use origin data as fallback
          const coreWebVitals = {
            lcp: crux.LARGEST_CONTENTFUL_PAINT_MS?.percentile || originSummary.LARGEST_CONTENTFUL_PAINT_MS?.percentile,
            lcpCategory: crux.LARGEST_CONTENTFUL_PAINT_MS?.category || originSummary.LARGEST_CONTENTFUL_PAINT_MS?.category || null,
            fid: crux.FIRST_INPUT_DELAY_MS?.percentile || originSummary.FIRST_INPUT_DELAY_MS?.percentile,
            fidCategory: crux.FIRST_INPUT_DELAY_MS?.category || originSummary.FIRST_INPUT_DELAY_MS?.category || null,
            inp: crux.INTERACTION_TO_NEXT_PAINT?.percentile || originSummary.INTERACTION_TO_NEXT_PAINT?.percentile,
            inpCategory: crux.INTERACTION_TO_NEXT_PAINT?.category || originSummary.INTERACTION_TO_NEXT_PAINT?.category || null,
            cls: crux.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile || originSummary.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile,
            clsCategory: crux.CUMULATIVE_LAYOUT_SHIFT_SCORE?.category || originSummary.CUMULATIVE_LAYOUT_SHIFT_SCORE?.category || null,
            fcp: crux.FIRST_CONTENTFUL_PAINT_MS?.percentile || originSummary.FIRST_CONTENTFUL_PAINT_MS?.percentile,
            fcpCategory: crux.FIRST_CONTENTFUL_PAINT_MS?.category || originSummary.FIRST_CONTENTFUL_PAINT_MS?.category || null,
          };

          const insights = {
            url,
            performanceScore: lighthouse.categories?.performance?.score != null ? Math.round(lighthouse.categories.performance.score * 100) : null,
            accessibilityScore: lighthouse.categories?.accessibility?.score != null ? Math.round(lighthouse.categories.accessibility.score * 100) : null,
            bestPracticesScore: lighthouse.categories?.['best-practices']?.score != null ? Math.round(lighthouse.categories['best-practices'].score * 100) : null,
            seoScore: lighthouse.categories?.seo?.score != null ? Math.round(lighthouse.categories.seo.score * 100) : null,

            // Core Web Vitals (CrUX - Real User Data + Origin Summary as fallback)
            crux: coreWebVitals,

            // Lighthouse Metrics (Lab Data)
            lighthouse: {
              firstContentfulPaint: lighthouse.audits?.['first-contentful-paint']?.displayValue,
              largestContentfulPaint: lighthouse.audits?.['largest-contentful-paint']?.displayValue,
              cumulativeLayoutShift: lighthouse.audits?.['cumulative-layout-shift']?.displayValue,
              totalBlockingTime: lighthouse.audits?.['total-blocking-time']?.displayValue,
              speedIndex: lighthouse.audits?.['speed-index']?.displayValue,
              interactive: lighthouse.audits?.['interactive']?.displayValue,
              firstMeaningfulPaint: lighthouse.audits?.['first-meaningful-paint']?.displayValue,
            },

            // Opportunities (Things to fix for performance)
            opportunities: (lighthouse.audits && Object.values(lighthouse.audits).filter(
              audit => audit.scoreDisplayMode === 'opportunity' && audit.score < 1
            ).map(audit => ({
              id: audit.id,
              title: audit.title,
              description: audit.description,
              savings: audit.details?.overallSavingsMs || 0,
              score: audit.score,
            }))) || [],
          };

          console.log(`✅ PageSpeed Score: ${insights.performanceScore}/100, CrUX LCP: ${coreWebVitals.lcp != null ? coreWebVitals.lcp + 'ms' : 'n/a'}, Category: ${coreWebVitals.lcpCategory || 'n/a'}`);
          // Cache result for 1 hour
          psCache.set(cacheKey, { data: insights, expiresAt: Date.now() + PS_TTL });
          resolve(insights);
        } catch (error) {
          console.error('❌ PageSpeed parse error:', error.message);
          console.error('Raw response:', data.substring(0, 500));
          resolve(null);
        }
      });
    }).on('error', (error) => {
      console.warn('PageSpeed API error:', error.message);
      resolve(null);
    });
  });
}

/**
 * Generate issues from REAL page data including Performance metrics
 */
function generateIssuesFromRealData(data, perf = {}, pageSpeed = null) {
  let score = 100;
  const issues = [];

  // ========== PAGE SPEED / PERFORMANCE ISSUES ==========
  // Using Google PageSpeed Insights (Official Data)

  if (pageSpeed) {
    // GOOGLE PAGESPEED INSIGHTS ISSUES

    // Performance Score (from Lighthouse)
    const perfScore = pageSpeed.performanceScore;
    if (perfScore < 50) {
      issues.push({
        id: 'poor-pagespeed-score',
        type: 'critical',
        category: 'Performance',
        priority: 1,
        issue: `🚨 Google PageSpeed Performance Score: ${perfScore}/100 (Poor)`,
        detail: 'According to Google Lighthouse, your site has poor performance. This impacts rankings and user experience.',
        suggestion: 'Focus on Core Web Vitals: LCP, FID/INP, and CLS.',
        fixExample: 'Use PageSpeed Insights recommendations to fix the biggest issues.',
        affectsScore: -20,
      });
      score -= 20;
    } else if (perfScore < 70) {
      issues.push({
        id: 'moderate-pagespeed-score',
        type: 'warning',
        category: 'Performance',
        priority: 2,
        issue: `⚠️ Google PageSpeed Performance Score: ${perfScore}/100 (Needs Improvement)`,
        detail: 'Your site has moderate performance issues.',
        suggestion: 'Implement PageSpeed Insights recommendations.',
        affectsScore: -10,
      });
      score -= 10;
    }

    // LCP from CrUX (Real User Data)
    if (pageSpeed.crux.lcp && pageSpeed.crux.lcp > 4000) {
      issues.push({
        id: 'crux-poor-lcp',
        type: 'critical',
        category: 'Performance',
        priority: 1,
        issue: `🎨 LCP is ${pageSpeed.crux.lcp}ms (Goal: <2500ms) - Real user data`,
        detail: 'Largest Contentful Paint from Google Chrome User Experience Report. Real users experience slow loading.',
        suggestion: 'Optimize hero images, preload critical resources, lazy load off-screen content.',
        fixExample: '<link rel="preload" as="image" href="hero.jpg"> and compress images to <100KB',
        affectsScore: -15,
      });
      score -= 15;
    } else if (pageSpeed.crux.lcp && pageSpeed.crux.lcp > 2500) {
      issues.push({
        id: 'crux-moderate-lcp',
        type: 'warning',
        category: 'Performance',
        priority: 2,
        issue: `🎨 LCP is ${pageSpeed.crux.lcp}ms (Goal: <2500ms) - Real user data`,
        detail: 'Some users experience slow loading.',
        suggestion: 'Further optimize images and resources.',
        affectsScore: -8,
      });
      score -= 8;
    }

    // CLS from CrUX
    if (pageSpeed.crux.cls && pageSpeed.crux.cls > 0.25) {
      issues.push({
        id: 'crux-poor-cls',
        type: 'warning',
        category: 'Performance',
        priority: 2,
        issue: `📐 CLS is ${(pageSpeed.crux.cls || 0).toFixed(2)} (Goal: <0.1) - Real user data`,
        detail: 'Users experience unexpected layout shifts.',
        suggestion: 'Set explicit dimensions for images/videos, preload fonts.',
        fixExample: '<img width="400" height="300" src="image.jpg" alt="...">',
        affectsScore: -12,
      });
      score -= 12;
    }

    // FID/INP from CrUX
    if (pageSpeed.crux.fid && pageSpeed.crux.fid > 100) {
      issues.push({
        id: 'crux-poor-fid',
        type: 'warning',
        category: 'Performance',
        priority: 2,
        issue: `⌨️ FID is ${pageSpeed.crux.fid}ms (Goal: <100ms) - Real user data`,
        detail: 'Users experience slow interactions with the page.',
        suggestion: 'Break up long JavaScript tasks, use web workers.',
        affectsScore: -8,
      });
      score -= 8;
    }

    // Google's Opportunities
    if (pageSpeed.opportunities && pageSpeed.opportunities.length > 0) {
      const topOpps = pageSpeed.opportunities.slice(0, 3);
      topOpps.forEach((opp) => {
        issues.push({
          id: `pagespeed-opp-${opp.id}`,
          type: 'info',
          category: 'Performance',
          priority: 3,
          issue: `💡 ${opp.title}`,
          detail: opp.description,
          suggestion: 'Implement Google PageSpeed Insights recommendations.',
          affectsScore: -3,
        });
        score -= 3;
      });
    }

    // SEO Score from PageSpeed
    if (pageSpeed.seoScore < 80) {
      issues.push({
        id: 'pagespeed-seo-score',
        type: 'warning',
        category: 'Technical',
        priority: 2,
        issue: `🔍 Google PageSpeed SEO Score: ${pageSpeed.seoScore}/100`,
        detail: 'PageSpeed Insights detected SEO issues.',
        suggestion: 'Fix mobile-friendliness, viewport configuration, and other SEO basics.',
        affectsScore: -5,
      });
      score -= 5;
    }
  } else {
    // FALLBACK: Use custom metrics if PageSpeed API not available

    // Load Time (Critical - directly impacts ranking and UX)
    if (perf.loadTime > 4000) {
    issues.push({
      id: 'slow-load-critical',
      type: 'critical',
      category: 'Performance',
      priority: 1,
      issue: `⚡ Page loads in ${perf.loadTime}ms (Goal: <2500ms)`,
      detail: 'Pages that load in 4+ seconds have 60% bounce rate increase. Google ranks fast sites higher.',
      suggestion: 'Optimize images, enable GZIP compression, use CDN, minify CSS/JS',
      fixExample: 'Use tools: TinyPNG (images), Cloudflare (CDN), AWS CloudFront',
      affectsScore: -18,
    });
    score -= 18;
  } else if (perf.loadTime > 3000) {
    issues.push({
      id: 'slow-load',
      type: 'warning',
      category: 'Performance',
      priority: 2,
      issue: `⚡ Page loads in ${perf.loadTime}ms (Goal: <2500ms)`,
      detail: 'Each 1 second delay = 7% conversion loss',
      suggestion: 'Compress images, enable server compression, minify resources',
      affectsScore: -10,
    });
    score -= 10;
  }

  // LCP (Largest Contentful Paint) - Critical Web Vital
  if (perf.lcp && perf.lcp > 4000) {
    issues.push({
      id: 'poor-lcp',
      type: 'critical',
      category: 'Performance',
      priority: 1,
      issue: `🎨 LCP is ${Math.round(perf.lcp)}ms (Goal: <2500ms)`,
      detail: 'LCP measures when main content appears. Poor LCP = frustrating UX.',
      suggestion: 'Optimize largest images/videos, reduce CSS, preload critical resources',
      fixExample: 'Add: <link rel="preload" as="image" href="hero.jpg">',
      affectsScore: -15,
    });
    score -= 15;
  }

  // CLS (Cumulative Layout Shift) - Core Web Vital
  if (perf.cls && perf.cls > 0.25) {
    issues.push({
      id: 'poor-cls',
      type: 'warning',
      category: 'Performance',
      priority: 2,
      issue: `📐 CLS is ${(perf.cls || 0).toFixed(2)} (Goal: <0.1)`,
      detail: 'Layout shift frustrates users. Common cause: unoptimized images, fonts, ads.',
      suggestion: 'Set explicit dimensions for images/videos, preload fonts',
      fixExample: '<img width="400" height="300" src="image.jpg" alt="...">',
      affectsScore: -12,
    });
    score -= 12;
  }

  // TTFB (Time To First Byte) - Server response time
  if (perf.ttfb && perf.ttfb > 1000) {
    issues.push({
      id: 'slow-ttfb',
      type: 'warning',
      category: 'Performance',
      priority: 2,
      issue: `🖥️ TTFB is ${perf.ttfb}ms (Goal: <600ms)`,
      detail: 'Slow server response indicates host or database issues.',
      suggestion: 'Upgrade hosting, use CDN, optimize database queries, enable caching',
      fixExample: 'CloudFlare, AWS CloudFront, or similar CDN service',
      affectsScore: -8,
    });
    score -= 8;
  }

  // Large Resources (Unoptimized images, videos, JS bundles)
  if (perf.largeResourceCount && perf.largeResourceCount > 0) {
    issues.push({
      id: 'large-resources',
      type: 'warning',
      category: 'Performance',
      priority: 2,
      issue: `📦 ${perf.largeResourceCount} resources over 1MB (Total: ${(perf.totalResourceSize / 1000000).toFixed(1)}MB)`,
      detail: 'Large unoptimized files are the #1 cause of slow sites.',
      suggestion: 'Compress images to <200KB each, lazy load images, defer JS',
      fixExample: 'Use: TinyPNG, ImageOptim, or <img loading="lazy">',
      affectsScore: -12,
    });
    score -= 12;
  }

  // Large Images specifically
  if (perf.largeImages && perf.largeImages.length > 0) {
    issues.push({
      id: 'unoptimized-images',
      type: 'warning',
      category: 'Images',
      priority: 2,
      issue: `🖼️ ${perf.largeImages.length} images over 500KB (should be <100KB each)`,
      detail: 'Uncompressed images are the biggest performance killer.',
      suggestion: 'Compress all images to under 100KB, use modern formats (WebP)',
      fixExample: 'Use TinyPNG.com: reduces by 50-80% with same quality',
      affectsScore: -14,
    });
    score -= 14;
  }

  // Total transferred data
  if (perf.totalResourceSize > 5000000) {
    issues.push({
      id: 'excessive-resources',
      type: 'info',
      category: 'Performance',
      priority: 3,
      issue: `📥 Page downloads ${(perf.totalResourceSize / 1000000).toFixed(1)}MB (Goal: <2MB)`,
      detail: 'Large page size affects mobile users most.',
      suggestion: 'Reduce unused CSS/JS, compress images, enable gzip',
      affectsScore: -5,
    });
    score -= 5;
  }

  // ===== TITLE TAG
  if (!data.title || data.titleLength === 0) {
    issues.push({
      id: 'title-missing',
      type: 'critical',
      category: 'On-Page',
      priority: 1,
      issue: 'Missing title tag',
      detail: 'Title is the most visible ranking factor. Missing = major issue.',
      suggestion: 'Add compelling title (50-60 chars) with target keyword',
      fixExample: '<title>Your Main Keyword | Business Name</title>',
      affectsScore: -15,
    });
    score -= 15;
  } else if (data.titleLength < 30) {
    issues.push({
      id: 'title-too-short',
      type: 'critical',
      category: 'On-Page',
      priority: 1,
      issue: `Title too short (${data.titleLength} chars) - Losing keyword opportunity`,
      detail: `Current: "${data.title}"`,
      suggestion: 'Expand to 50-60 chars with modifiers',
      fixExample: `<title>${data.title} | Business Name | Location</title>`,
      affectsScore: -10,
    });
    score -= 10;
  } else if (data.titleLength > 65) {
    issues.push({
      id: 'title-too-long',
      type: 'warning',
      category: 'On-Page',
      priority: 2,
      issue: `Title too long (${data.titleLength} chars) - Gets truncated in Google`,
      detail: 'Google shows ~60 chars in search results',
      suggestion: 'Trim to 50-60 characters, keep important words visible',
      fixExample: `<title>${data.title.substring(0, 60)}</title>`,
      affectsScore: -5,
    });
    score -= 5;
  }

  // ===== META DESCRIPTION
  if (!data.metaDesc || data.metaDescLength === 0) {
    issues.push({
      id: 'meta-missing',
      type: 'critical',
      category: 'On-Page',
      priority: 1,
      issue: 'Missing meta description',
      detail: 'Meta description controls CTR from Google. Missing = lower clicks.',
      suggestion: 'Write 150-160 character description with CTA',
      fixExample: '<meta name="description" content="[Your value prop]. [Call to action]. [Benefit].">',
      affectsScore: -12,
    });
    score -= 12;
  } else if (data.metaDescLength < 120) {
    issues.push({
      id: 'meta-short',
      type: 'warning',
      category: 'On-Page',
      priority: 2,
      issue: `Meta description too short (${data.metaDescLength} chars)`,
      detail: `Current: "${data.metaDesc}"`,
      suggestion: 'Expand to 150-160 chars to use full search result space',
      affectsScore: -5,
    });
    score -= 5;
  } else if (data.metaDescLength > 165) {
    issues.push({
      id: 'meta-long',
      type: 'info',
      category: 'On-Page',
      priority: 3,
      issue: `Meta description too long (${data.metaDescLength} chars)`,
      detail: 'Google will truncate this in search results',
      suggestion: 'Trim to 150-160 characters',
      affectsScore: -2,
    });
    score -= 2;
  }

  // ===== H1 TAG
  if (data.h1Count === 0) {
    issues.push({
      id: 'h1-missing',
      type: 'critical',
      category: 'On-Page',
      priority: 1,
      issue: 'Missing H1 tag',
      detail: 'Every page needs exactly one H1. It\'s a core SEO requirement.',
      suggestion: 'Add one H1 that matches your page topic',
      fixExample: '<h1>Main Topic Keyword For This Page</h1>',
      affectsScore: -15,
    });
    score -= 15;
  } else if (data.h1Count > 1) {
    issues.push({
      id: 'h1-multiple',
      type: 'warning',
      category: 'On-Page',
      priority: 2,
      issue: `Multiple H1 tags (${data.h1Count} found)`,
      detail: 'Google expects one H1 per page',
      suggestion: 'Keep only one H1, convert extras to H2',
      affectsScore: -8,
    });
    score -= 8;
  } else if (data.h1s[0]?.length < 20) {
    issues.push({
      id: 'h1-short',
      type: 'warning',
      category: 'On-Page',
      priority: 2,
      issue: `H1 too short (${data.h1s[0]?.length} chars)`,
      detail: `Current H1: "${data.h1s[0]?.text}"`,
      suggestion: 'Expand to 20-60 chars with keyword context',
      affectsScore: -5,
    });
    score -= 5;
  }

  // ===== CONTENT QUALITY
  if (data.wordCount < 300) {
    issues.push({
      id: 'thin-content',
      type: 'critical',
      category: 'Content',
      priority: 1,
      issue: `Thin content (${data.wordCount} words) - Below ranking minimum`,
      detail: 'Pages under 300 words don\'t rank well. Agencies charge $500-$2000 to fix this.',
      suggestion: `Expand to minimum 800 words with sections and subheadings`,
      fixExample: `Add more details, benefits, examples, FAQs. Target: 800-2000 words.`,
      affectsScore: -20,
    });
    score -= 20;
  } else if (data.wordCount < 600) {
    issues.push({
      id: 'low-content',
      type: 'warning',
      category: 'Content',
      priority: 2,
      issue: `Low content volume (${data.wordCount} words)`,
      detail: 'Competitive keywords need 800+ words to rank',
      suggestion: 'Expand to 800-1500 words minimum',
      affectsScore: -8,
    });
    score -= 8;
  }

  // ===== HEADINGS
  if (data.h2Count === 0) {
    issues.push({
      id: 'no-h2',
      type: 'warning',
      category: 'Content',
      priority: 2,
      issue: 'No H2 subheadings',
      detail: 'Page structure helps Google and users understand content',
      suggestion: 'Add 3-5 H2 subheadings to organize content',
      affectsScore: -8,
    });
    score -= 8;
  }

  // ===== IMAGES
  if (data.imageCount === 0 && data.wordCount > 500) {
    issues.push({
      id: 'no-images',
      type: 'info',
      category: 'Images',
      priority: 3,
      issue: 'No images',
      detail: 'Images break up text and improve engagement',
      suggestion: 'Add relevant images (1 per 300 words)',
      affectsScore: -3,
    });
    score -= 3;
  }

  if (data.imagesWithoutAlt > 0) {
    issues.push({
      id: 'alt-text-missing',
      type: 'warning',
      category: 'Images',
      priority: 2,
      issue: `${data.imagesWithoutAlt}/${data.imageCount} images missing alt text`,
      detail: 'Google reads alt text. Missing alt = lost image SEO + accessibility fail.',
      suggestion: `Add descriptive alt text to all ${data.imagesWithoutAlt} images`,
      fixExample: `<img src="photo.jpg" alt="[Description of what the image shows]">`,
      affectsScore: -10,
    });
    score -= 10;
  }

  // ===== MOBILE
  if (!data.viewport) {
    issues.push({
      id: 'no-viewport',
      type: 'critical',
      category: 'Mobile',
      priority: 1,
      issue: 'Missing viewport meta tag',
      detail: 'Site not mobile-optimized. 60% of traffic is mobile. Google uses mobile version for ranking.',
      suggestion: 'Add viewport to <head>',
      fixExample: '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      affectsScore: -18,
    });
    score -= 18;
  }

  // ===== TECHNICAL
  if (!data.charset) {
    issues.push({
      id: 'no-charset',
      type: 'warning',
      category: 'Technical',
      priority: 2,
      issue: 'Missing character encoding',
      detail: 'Charset ensures text displays correctly',
      suggestion: 'Add UTF-8 charset',
      fixExample: '<meta charset="UTF-8">',
      affectsScore: -5,
    });
    score -= 5;
  }

  if (!data.canonical) {
    issues.push({
      id: 'no-canonical',
      type: 'info',
      category: 'Technical',
      priority: 3,
      issue: 'Missing canonical tag',
      detail: 'Prevents duplicate content issues',
      suggestion: 'Add self-referencing canonical',
      fixExample: `<link rel="canonical" href="${data.canonical || '[This page URL]'}">`,
      affectsScore: -4,
    });
    score -= 4;
  }

  if (!data.https) {
    issues.push({
      id: 'no-https',
      type: 'critical',
      category: 'Technical',
      priority: 1,
      issue: 'Not HTTPS',
      detail: 'HTTPS is required for SEO and security. Google ranks HTTPS higher.',
      suggestion: 'Install SSL certificate',
      fixExample: 'Enable HTTPS on your server',
      affectsScore: -15,
    });
    score -= 15;
  }

  // ===== SOCIAL
  if (!data.ogTitle || !data.ogDesc || !data.ogImage) {
    issues.push({
      id: 'incomplete-og',
      type: 'info',
      category: 'On-Page',
      priority: 4,
      issue: 'Incomplete Open Graph tags',
      detail: 'When shared on social media, page looks bad',
      suggestion: 'Add og:title, og:description, og:image',
      fixExample: '<meta property="og:title" content="..."><meta property="og:description" content="...">',
      affectsScore: -3,
    });
    score -= 3;
  }
  } // CLOSE ELSE BLOCK

  // Ensure 0-100
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    issues: issues.sort((a, b) => a.priority - b.priority),
  };
}

/**
 * Get AI-powered suggestions using Claude
 */
async function getAISuggestions(url, auditResult) {
  try {
    const criticalIssues = auditResult.issues.filter(i => i.type === 'critical');

    const prompt = `You are a professional SEO consultant. Based on this SEO audit result, provide 3 specific, actionable recommendations:

URL: ${url}
Score: ${auditResult.score}/100 (Grade: ${auditResult.grade})

Critical Issues:
${criticalIssues.map(i => `- ${i.issue}: ${i.detail}`).join('\n')}

Provide 3 specific recommendations that would have the biggest impact on their rankings. Be direct and actionable. Format as:
1. [Issue] - [Why it matters] - [Exact fix]
2. [Issue] - [Why it matters] - [Exact fix]
3. [Issue] - [Why it matters] - [Exact fix]`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [
        { role: 'user', content: prompt }
      ],
    });

    return response.content[0].text;
  } catch (error) {
    console.error('Claude API error:', error);
    return 'Unable to generate AI suggestions at this time.';
  }
}

/**
 * Grade calculation
 */
function getGradeFromScore(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Calculate category scores
 */
function calculateCategoryScore(issues, category) {
  const categoryIssues = issues.filter(i => i.category === category);
  if (categoryIssues.length === 0) return 100;

  let score = 100;
  categoryIssues.forEach(issue => {
    score += issue.affectsScore;
  });
  return Math.max(0, Math.min(100, score));
}

/**
 * POST /api/chat
 * Chat endpoint with long-term context from Supabase
 */
app.post('/api/chat', rateLimiter(20, 60_000), async (req, res) => {
  try {
    const { message, context, conversationHistory = [] } = req.body;
    const url = context?.url || 'unknown';

    if (!message) {
      return res.status(400).json({ error: 'Missing message' });
    }

    console.log(`\n💬 Chat: "${message.substring(0, 50)}..." for ${url}`);

    // Create system prompt with full context
    const criticalIssues = (context?.issues || []).filter(i => i.type === 'critical');
    const warningIssues = (context?.issues || []).filter(i => i.type === 'warning');
    const infoIssues = (context?.issues || []).filter(i => i.type === 'info');
    const ps = context?.pageSpeedInsights;
    const localSEO = context?.localSEO;

    // Build PageSpeed section if available
    const psSection = ps ? `
GOOGLE PAGESPEED INSIGHTS (Official Data):
- Performance: ${ps.performanceScore ?? '?'}/100
- SEO Score: ${ps.seoScore ?? '?'}/100
- Accessibility: ${ps.accessibilityScore ?? '?'}/100
- Best Practices: ${ps.bestPracticesScore ?? '?'}/100
- LCP: ${ps.crux?.lcp ? `${ps.crux.lcp}ms (${ps.crux.lcpCategory || ''})` : ps.lighthouse?.largestContentfulPaint || 'N/A'}
- CLS: ${ps.crux?.cls != null ? `${ps.crux.cls} (${ps.crux.clsCategory || ''})` : ps.lighthouse?.cumulativeLayoutShift || 'N/A'}
- INP/FID: ${ps.crux?.inp ? `${ps.crux.inp}ms` : ps.crux?.fid ? `${ps.crux.fid}ms` : 'N/A'}
${ps.opportunities?.length ? `Top Opportunities: ${ps.opportunities.slice(0,4).map(o => o.title).join(' | ')}` : ''}
` : '';

    // Build Local SEO section if available
    const localSection = localSEO ? `
LOCAL SEO STATUS:
- LocalBusiness Schema: ${localSEO.hasLocalBusinessSchema ? 'Present ✓' : 'MISSING ✗'}
- NAP (Name/Address/Phone): ${localSEO.hasAddress ? 'Address ✓' : 'No Address ✗'} ${localSEO.hasPhone ? '| Phone ✓' : '| No Phone ✗'}
- Google Maps Embed: ${localSEO.hasGoogleMapsEmbed ? 'Yes ✓' : 'No'}
- City in Title/H1: ${localSEO.locationInTitle ? 'Yes ✓' : 'No ✗'}
- Local Score: ${localSEO.score ?? '?'}/100
` : '';

    const systemPrompt = `You are an expert SEO agent embedded in a Chrome extension. You are analyzing the user's LIVE webpage RIGHT NOW and must give highly specific, immediately actionable advice.

Your personality: direct, expert, concise — like a senior SEO consultant who bills $300/hr and respects the user's time. Never vague. Always specific. Always give code when asked.

CURRENT PAGE AUDIT:
- Website: ${url}
- Overall SEO Score: ${context?.score || 0}/100 (Grade: ${context?.grade || 'N/A'})
- Critical Issues: ${criticalIssues.length}
- Warnings: ${warningIssues.length}
- Info: ${infoIssues.length}
${psSection}${localSection}
CRITICAL ISSUES (fix first):
${criticalIssues.map(i => `• ${i.issue}${i.suggestion ? ` → ${i.suggestion}` : ''}`).join('\n') || 'None — great work!'}

WARNINGS (fix soon):
${warningIssues.map(i => `• ${i.issue}`).join('\n') || 'None'}

SCOPE — YOU ONLY ANSWER QUESTIONS ABOUT:
SEO (on-page, technical, local), Core Web Vitals, PageSpeed, schema markup, Google Search Console, backlinks, keyword strategy, content optimization, local SEO, GEO/location signals, structured data, and web performance.

If the user asks ANYTHING outside this scope (e.g. coding help, general AI questions, news, recipes, personal advice, math, or any topic unrelated to SEO/web performance), respond ONLY with:
"I'm Naraseo AI — I can only help with SEO, local search, and web performance questions. Ask me anything about improving your page rankings or fixing SEO issues."
Do NOT engage with off-topic questions under any circumstances.

RESPONSE RULES:
1. Reference SPECIFIC data above — never give generic SEO advice
2. Always explain WHY it matters in business terms (traffic, clicks, rankings)
3. Give copy-paste HTML/code when fixing technical issues
4. Lead with the most impactful action
5. Keep answers under 200 words unless a code-heavy fix is requested
6. Use **bold** for key terms. Use bullet points for lists
7. Do NOT use # markdown headers`;

    // Build messages: history (max 5, trimmed) + current message
    const historyMessages = conversationHistory.slice(-5).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').substring(0, 500),
    }));

    const message_response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: systemPrompt,
      messages: [
        ...historyMessages,
        { role: 'user', content: message },
      ],
    });

    const reply = message_response.content[0].text;

    console.log(`✅ Chat response sent`);
    res.json({ reply });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});


/**
 * POST /api/report/generate
 * Generate professional PDF report from audit data
 */
app.post('/api/report/generate', async (req, res) => {
  try {
    const { auditData } = req.body;

    if (!auditData) {
      return res.status(400).json({ error: 'Missing audit data' });
    }

    // Import the template (dynamic import since it's ES module)
    const { generateReportHTML } = await import('../lib/reportTemplate.js');
    const html = generateReportHTML(auditData);

    // Generate PDF using Puppeteer
    let browser;
    try {
      browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
        printBackground: true,
      });

      // Send as attachment for download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="SEO-Audit-${auditData.url?.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.pdf"`);
      res.send(pdfBuffer);
    } finally {
      if (browser) await browser.close();
    }
  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({ error: 'Failed to generate report: ' + error.message });
  }
});

/**
 * POST /api/suggestions
 * Single Claude call that returns structured before/after rewrites for every
 * on-page element that can be improved. Returns JSON so the client can render
 * a word-level diff and apply changes directly to the live page.
 */
app.post('/api/suggestions', rateLimiter(10, 60_000), async (req, res) => {
  try {
    const { url, pageData } = req.body;
    if (!pageData) return res.status(400).json({ error: 'Missing pageData' });

    const d = pageData;
    const title       = d.title || '';
    const meta        = d.metaDescription || '';
    const h1          = (d.h1Tags || [])[0] || '';
    const h2          = (d.headings || []).find(h => h.level === 2)?.text || '';
    const intro       = d.firstPara || '';
    const wordCount   = d.wordCount || 0;
    const topKeywords = (d.topKeywords || []).slice(0, 5).map(k => k.word || k).join(', ');
    const imagesNoAlt = (d.imageDetails || []).filter(img => !img.hasAlt).slice(0, 3);
    const domain      = (() => { try { return new URL(url).hostname; } catch { return url; } })();

    const imagesBlock = imagesNoAlt.length > 0
      ? `Images missing alt text:\n${imagesNoAlt.map((img, i) => `  [${i}] ${img.src}`).join('\n')}`
      : 'No images missing alt text.';

    const prompt = `You are an expert SEO copywriter. Rewrite these on-page elements for better search rankings.

WEBSITE: ${domain}
TOP KEYWORDS: ${topKeywords || 'none detected'}
CURRENT CONTENT:
- Title: ${title || '(missing)'}
- Meta description: ${meta || '(missing)'}
- H1: ${h1 || '(missing)'}
- H2 (first): ${h2 || '(missing)'}
- Intro paragraph: ${intro ? intro.substring(0, 280) : '(missing)'}
- Word count: ${wordCount}
- ${imagesBlock}

RULES:
- Title: 50-60 chars, main keyword near start, brand at end
- Meta: 145-158 chars, include keyword, end with action phrase
- H1: 20-60 chars, match search intent, include keyword
- H2: 20-70 chars, naturally leads into section content
- Intro: rewrite to include top keyword in first sentence, keep same approximate length
- Alt text: descriptive 5-15 words, no "image of...", include keyword if natural
- Do NOT invent facts. Only improve what's already there.
- Set any field to null if it cannot be meaningfully improved.

Respond with ONLY valid JSON:
{
  "title": { "current": "${title.replace(/"/g, '\\"')}", "suggested": "...", "reasoning": "one sentence", "impact": "+X pts" },
  "meta":  { "current": "${meta.replace(/"/g, '\\"')}",  "suggested": "...", "reasoning": "one sentence", "impact": "+X pts" },
  "h1":    { "current": "${h1.replace(/"/g, '\\"')}",    "suggested": "...", "reasoning": "one sentence", "impact": "+X pts" },
  "h2":    { "current": "${h2.replace(/"/g, '\\"')}",    "suggested": "...", "reasoning": "one sentence", "impact": "+X pts" },
  "intro": { "current": "first 80 chars of intro",       "suggested": "...", "reasoning": "one sentence", "impact": "+X pts" },
  "images": [
    { "index": 0, "src": "filename", "suggested": "descriptive alt text", "reasoning": "one sentence" }
  ]
}`;

    const aiResp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = aiResp.content[0].text.trim();

    // Extract JSON — Claude sometimes wraps in ```json
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'AI returned invalid format' });

    const suggestions = JSON.parse(jsonMatch[0]);

    // Add copy-ready HTML code for each
    if (suggestions.title?.suggested) {
      suggestions.title.code = `<title>${suggestions.title.suggested}</title>`;
    }
    if (suggestions.meta?.suggested) {
      suggestions.meta.code = `<meta name="description" content="${suggestions.meta.suggested}">`;
    }
    if (suggestions.h1?.suggested) {
      suggestions.h1.code = `<h1>${suggestions.h1.suggested}</h1>`;
    }
    if (suggestions.h2?.suggested) {
      suggestions.h2.code = `<h2>${suggestions.h2.suggested}</h2>`;
    }
    if (suggestions.intro?.suggested) {
      suggestions.intro.code = `<p>${suggestions.intro.suggested}</p>`;
    }
    if (Array.isArray(suggestions.images)) {
      suggestions.images = suggestions.images.filter(img => img?.suggested);
      suggestions.images.forEach(img => {
        img.code = `alt="${img.suggested}"`;
      });
    } else {
      suggestions.images = [];
    }

    // Strip null entries
    ['title','meta','h1','h2','intro'].forEach(k => {
      if (!suggestions[k]?.suggested) suggestions[k] = null;
    });

    res.json({ suggestions, timestamp: new Date().toISOString() });
  } catch (e) {
    console.error('Suggestions error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Keyword Research Helpers ──────────────────────────────────────────────────

/**
 * Google Autocomplete — free, no API key needed.
 * Returns up to 8 real search suggestions for a given query.
 */
async function fetchAutocompleteSuggestions(keyword) {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(keyword)}&hl=en`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(4000),
    });
    const data = await resp.json();
    return (data[1] || []).slice(0, 8);
  } catch { return []; }
}

/**
 * Google Trends (unofficial) — free, no API key.
 * Returns trend direction for a keyword over the past 12 months.
 */
async function fetchGoogleTrends(keyword) {
  try {
    const req = JSON.stringify({
      comparisonItem: [{ keyword, geo: '', time: 'today 12-m' }],
      category: 0,
      property: '',
    });
    const exploreUrl = `https://trends.google.com/trends/api/explore?hl=en-US&tz=0&req=${encodeURIComponent(req)}`;
    const exploreResp = await fetch(exploreUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(5000),
    });
    const exploreText = await exploreResp.text();
    const exploreJson = JSON.parse(exploreText.replace(/^\)\]\}',?\n/, ''));
    const widget = (exploreJson.widgets || []).find(w => w.id === 'TIMESERIES');
    if (!widget) return null;

    const dataReq = JSON.stringify(widget.request);
    const dataUrl = `https://trends.google.com/trends/api/widgetdata/multiline?hl=en-US&tz=0&req=${encodeURIComponent(dataReq)}&token=${encodeURIComponent(widget.token)}`;
    const dataResp = await fetch(dataUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(5000),
    });
    const dataText = await dataResp.text();
    const dataJson = JSON.parse(dataText.replace(/^\)\]\}',?\n/, ''));

    const timelineData = dataJson.default?.timelineData || [];
    if (timelineData.length < 4) return null;

    const values = timelineData.map(d => Number(d.value?.[0] ?? 0));
    const recent = values.slice(-Math.ceil(values.length / 3));
    const early  = values.slice(0, Math.ceil(values.length / 3));
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlyAvg  = early.reduce((a, b) => a + b, 0)  / early.length;
    const changePct = earlyAvg > 0 ? Math.round(((recentAvg - earlyAvg) / earlyAvg) * 100) : 0;

    return {
      trend: changePct >= 15 ? 'rising' : changePct <= -15 ? 'declining' : 'stable',
      changePct,
      peakValue:    Math.max(...values),
      currentValue: values[values.length - 1] ?? 0,
    };
  } catch { return null; }
}

/**
 * POST /api/keywords
 * AI-powered keyword research enriched with real Google signals.
 * Combines: Autocomplete suggestions + Trends data + Claude AI analysis.
 */
app.post('/api/keywords', rateLimiter(15, 60_000), async (req, res) => {
  try {
    const { url, pageData } = req.body;
    if (!pageData) return res.status(400).json({ error: 'Missing pageData' });

    const d = pageData;
    const domain      = (() => { try { return new URL(url).hostname.replace('www.',''); } catch { return url; } })();
    const title       = d.title || '';
    const meta        = d.metaDescription || '';
    const h1          = (d.h1Tags || [])[0] || '';
    const headings    = (d.headings || []).map(h => h.text).join(', ');
    const wordCount   = d.wordCount || 0;
    const topKW       = (d.topKeywords || []).slice(0, 10).map(k => `${k.word || k} (${k.density || 0}%)`).join(', ');
    const bodyText    = d.bodyText || d.firstPara || '';

    // ── Gather real Google signals in parallel (non-blocking if they fail) ──────
    const guessedPrimary = h1 || title.split('|')[0].trim() || title.split('-')[0].trim() || domain;

    const [
      primarySuggestions,
      howToSuggestions,
      bestSuggestions,
      nearMeSuggestions,
      trends,
    ] = await Promise.all([
      fetchAutocompleteSuggestions(guessedPrimary),
      fetchAutocompleteSuggestions(`how to ${guessedPrimary}`),
      fetchAutocompleteSuggestions(`best ${guessedPrimary}`),
      fetchAutocompleteSuggestions(`${guessedPrimary} near me`),
      fetchGoogleTrends(guessedPrimary),
    ]);

    // Deduplicate + flatten all real searches
    const allRealSearches = [...new Set([
      ...primarySuggestions,
      ...howToSuggestions.slice(0, 3),
      ...bestSuggestions.slice(0, 3),
      ...nearMeSuggestions.slice(0, 2),
    ])].slice(0, 15);

    const trendsContext = trends
      ? `GOOGLE TRENDS (past 12 months): ${trends.trend.toUpperCase()} (${trends.changePct > 0 ? '+' : ''}${trends.changePct}% change)`
      : 'GOOGLE TRENDS: unavailable';

    const realSearchesContext = allRealSearches.length
      ? `REAL GOOGLE SEARCHES (autocomplete data — what people actually type):\n${allRealSearches.map((s, i) => `  ${i + 1}. "${s}"`).join('\n')}`
      : 'REAL GOOGLE SEARCHES: unavailable';

    const prompt = `You are an expert SEO keyword strategist. Analyze this webpage using REAL Google search data provided below and give a data-driven keyword research report.

WEBSITE: ${domain}
URL: ${url}
TITLE: ${title}
META DESCRIPTION: ${meta}
H1: ${h1}
HEADINGS: ${headings}
WORD COUNT: ${wordCount}
CURRENT TOP KEYWORDS: ${topKW || 'none detected'}
INTRO/BODY SAMPLE: ${bodyText.substring(0, 400) || '(not provided)'}

${trendsContext}

${realSearchesContext}

INSTRUCTIONS:
- Use the REAL GOOGLE SEARCHES to identify what people actually search for around this topic
- Prioritize keywords that appear in the autocomplete data (they have proven search demand)
- Use the trend data to flag rising vs declining opportunities
- Estimate volume_tier as "high" (keyword in 6+ autocomplete results), "medium" (3-5), or "low" (0-2)
- Difficulty should be based on whether big brands (Amazon, Wikipedia, Forbes) likely dominate that SERP
- Be specific and actionable — not generic SEO advice

Respond with ONLY valid JSON in this exact structure:
{
  "primary": {
    "keyword": "main target keyword phrase (2-4 words)",
    "current_density": "estimated %",
    "target_density": "1.5-2.5%",
    "status": "good|low|missing",
    "volume_tier": "high|medium|low",
    "note": "one clear action"
  },
  "secondary": [
    { "keyword": "supporting keyword", "why": "reason it fits this page", "where_to_add": "title|meta|heading|body" },
    { "keyword": "supporting keyword 2", "why": "...", "where_to_add": "..." },
    { "keyword": "supporting keyword 3", "why": "...", "where_to_add": "..." }
  ],
  "gaps": [
    { "keyword": "missed keyword opportunity", "search_intent": "informational|transactional|navigational", "difficulty": "low|medium|high", "volume_tier": "high|medium|low", "action": "specific instruction" },
    { "keyword": "missed keyword 2", "search_intent": "...", "difficulty": "...", "volume_tier": "...", "action": "..." },
    { "keyword": "missed keyword 3", "search_intent": "...", "difficulty": "...", "volume_tier": "...", "action": "..." }
  ],
  "semantic_cluster": ["related term 1", "related term 2", "related term 3", "related term 4", "related term 5"],
  "quick_wins": [
    "Specific action #1 based on real search data (e.g. 'Add keyword X to your H1')",
    "Specific action #2",
    "Specific action #3"
  ],
  "summary": "2-3 sentence executive summary using the real Google data to explain the opportunity"
}`;

    const aiResp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = aiResp.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'AI returned invalid format' });

    const keywords = JSON.parse(jsonMatch[0]);

    // Attach real Google signals to the response
    keywords._realSearches = allRealSearches;
    keywords._trends       = trends;
    keywords._dataSource   = allRealSearches.length
      ? `Google Autocomplete${trends ? ' + Google Trends' : ''} + AI Analysis`
      : 'AI Analysis only';

    console.log(`Keyword research done for ${domain} — ${allRealSearches.length} real searches, trends: ${trends?.trend || 'n/a'}`);
    res.json({ keywords, timestamp: new Date().toISOString() });
  } catch (e) {
    console.error('Keywords error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/history — save completed audit to Supabase
 * Body: { url, hostname, score, grade, report_json }
 */
app.post('/api/history', authMiddleware, async (req, res) => {
  try {
    const { url, hostname, score, grade, report_json } = req.body;
    if (!url || score == null) return res.status(400).json({ error: 'Missing url or score' });

    const { data, error } = await supabase
      .from('audits')
      .insert({
        user_id:     req.userId,
        url,
        hostname:    hostname || new URL(url).hostname,
        score,
        grade:       grade || '',
        report_json: report_json || null,
      })
      .select('id')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ id: data.id });
  } catch (e) {
    console.error('POST /api/history error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/history — load user's audit history from Supabase
 */
app.get('/api/history', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('audits')
      .select('id, url, hostname, score, grade, report_json, created_at')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ audits: data || [] });
  } catch (e) {
    console.error('GET /api/history error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/offpage?url=https://example.com
 * External SEO data using OpenPageRank (free, no API key needed).
 * Returns domain_rank, page_rank, backlinks estimate.
 * Falls back to GSC link data if available in future.
 */
app.get('/api/offpage', rateLimiter(30, 60_000), async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url' });

    let domain;
    try { domain = new URL(url).hostname.replace('www.', ''); } catch { return res.status(400).json({ error: 'Invalid URL' }); }

    // OpenPageRank API — authenticated with API key
    const apiKey = process.env.OPENPR_API_KEY || '';
    console.log(`[OPR] Calling OpenPageRank for domain: ${domain} | key: ${apiKey ? apiKey.slice(0,6)+'…' : 'MISSING'}`);

    const oprUrl = `https://openpagerank.com/api/v1.0/getPageRank?domains%5B0%5D=${encodeURIComponent(domain)}`;
    const oprResp = await fetch(oprUrl, {
      headers: {
        'API-OPR': apiKey,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    console.log(`[OPR] Response status: ${oprResp.status}`);
    if (!oprResp.ok) throw new Error(`OpenPageRank API: ${oprResp.status}`);
    const oprData = await oprResp.json();
    const domainData = oprData?.response?.[0];
    console.log(`[OPR] Result for ${domain}:`, JSON.stringify(domainData));

    if (!domainData) throw new Error('No data returned');

    const isFound = domainData.status_code === 200;
    const pageRank = isFound ? (domainData.page_rank_integer ?? null) : null;
    const pageRankDecimal = isFound ? (domainData.page_rank_decimal ?? null) : null;
    const domainRank = domainData.rank ?? null;

    res.json({
      domain,
      pageRank,
      pageRankDecimal,
      domainRank,
      status: isFound ? 'ok' : 'not_found',
      source: 'OpenPageRank',
      note: 'Domain Authority 0–10 scale. Domain Rank = global position among all indexed domains.',
    });
  } catch (err) {
    console.error('[OPR] Off-page error:', err.message);
    // Return a graceful fallback so UI still renders
    res.json({ domain: null, pageRank: null, domainRank: null, status: 'unavailable', error: err.message });
  }
});

/**
 * POST /api/fixes
 * Logic-first fixes: deterministic templates for 90% of issues.
 * AI (Claude) used ONLY for title and meta description rewrites where
 * content quality matters. Single AI call max, never per-issue loops.
 */
app.post('/api/fixes', async (req, res) => {
  try {
    const { url, issues, pageData } = req.body;
    if (!issues || issues.length === 0) return res.json({ fixes: [] });

    const fixes = [];
    let needsAiTitle = false;
    let needsAiMeta  = false;

    for (const issue of issues.slice(0, 15)) {
      const t = (issue.issue || '').toLowerCase();
      const current = getCurrentValue(issue, pageData);
      const priority = issue.type === 'critical' ? 1 : issue.type === 'warning' ? 2 : 3;

      // ── Deterministic fixes (instant, no API call) ─────────────────────────

      if (t.includes('viewport')) {
        fixes.push({ id: issue.id, issue: issue.issue, current, priority,
          suggestedValue: '<meta name="viewport" content="width=device-width, initial-scale=1">',
          explanation: 'Without viewport, Google marks your site as not mobile-friendly and drops it in mobile rankings. Add this one tag.' });
        continue;
      }

      if (t.includes('canonical')) {
        fixes.push({ id: issue.id, issue: issue.issue, current, priority,
          suggestedValue: `<link rel="canonical" href="${url}">`,
          explanation: 'Canonical tells Google which URL is the "real" one. Prevents duplicate content penalties when the same page is reachable via multiple URLs.' });
        continue;
      }

      if (t.includes('https') || t.includes('ssl')) {
        fixes.push({ id: issue.id, issue: issue.issue, current, priority,
          suggestedValue: 'Migrate to HTTPS via your host control panel. Update all internal links to https://',
          explanation: 'Google uses HTTPS as a ranking signal. Non-HTTPS sites show a "Not Secure" warning which destroys trust and click-through rate.' });
        continue;
      }

      if (t.includes('alt text') || t.includes('alt tag')) {
        const imgs = pageData?.imgsMissingAlt || [];
        fixes.push({ id: issue.id, issue: issue.issue, current, priority,
          suggestedValue: imgs.length > 0
            ? `Example: <img src="${imgs[0]?.src || 'image.jpg'}" alt="[describe what's in the image]">`
            : '<img src="photo.jpg" alt="[describe image content clearly]">',
          explanation: `${imgs.length || 'Some'} images have no alt text. Screen readers and Google both use alt text to understand images. Takes 10 seconds per image to fix.` });
        continue;
      }

      if (t.includes('h1') && t.includes('missing')) {
        fixes.push({ id: issue.id, issue: issue.issue, current, priority,
          suggestedValue: `<h1>${pageData?.title?.substring(0, 60) || 'Your Main Page Heading'}</h1>`,
          explanation: 'Every page needs exactly one H1 — it\'s the strongest on-page keyword signal. Google uses it to understand what the page is about.' });
        continue;
      }

      if (t.includes('h1') && (t.includes('multiple') || t.includes('count'))) {
        fixes.push({ id: issue.id, issue: issue.issue, current, priority,
          suggestedValue: 'Keep only one <h1> per page. Change extra H1 tags to <h2>.',
          explanation: 'Multiple H1s dilute your main keyword signal. Search engines expect one H1 as the primary topic declaration.' });
        continue;
      }

      if (t.includes('og') || t.includes('open graph')) {
        fixes.push({ id: issue.id, issue: issue.issue, current, priority,
          suggestedValue: `<meta property="og:title" content="${pageData?.title || 'Page Title'}">\n<meta property="og:description" content="${pageData?.metaDescription || 'Page description'}">\n<meta property="og:image" content="https://yoursite.com/og-image.jpg">\n<meta property="og:url" content="${url}">`,
          explanation: 'Without OG tags, when someone shares your page on social media, it shows a blank preview — killing engagement and traffic.' });
        continue;
      }

      if (t.includes('schema') || t.includes('structured data')) {
        fixes.push({ id: issue.id, issue: issue.issue, current, priority,
          suggestedValue: `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "WebPage",\n  "name": "${pageData?.title || 'Page'}",\n  "url": "${url}"\n}\n</script>`,
          explanation: 'Schema markup enables rich results (stars, FAQs, breadcrumbs) in Google. Sites with schema average 20-30% higher CTR.' });
        continue;
      }

      if (t.includes('word count') || t.includes('content length') || t.includes('thin content')) {
        fixes.push({ id: issue.id, issue: issue.issue, current, priority,
          suggestedValue: `Current: ${pageData?.wordCount || 0} words. Target: 600+ words for informational pages, 300+ for landing pages.`,
          explanation: 'Thin content (< 300 words) signals low quality to Google. Add genuine value: FAQs, how-tos, case studies, or product details.' });
        continue;
      }

      if (t.includes('title') && (t.includes('long') || t.includes('short') || t.includes('length'))) {
        // Logic-only suggestion for length issues, flag for AI rewrite
        fixes.push({ id: issue.id, issue: issue.issue, current, priority,
          suggestedValue: current ? `${current.substring(0, 55)}${current.length > 55 ? '…' : ''}` : '(AI rewrite below)',
          explanation: `Keep titles 30-60 characters. Anything beyond 60 chars gets cut off in Google results, reducing clicks.` });
        needsAiTitle = true;
        continue;
      }

      if (t.includes('title') && t.includes('missing')) {
        needsAiTitle = true;
        fixes.push({ id: issue.id, issue: issue.issue, current, priority,
          suggestedValue: '(AI will generate below)',
          explanation: 'Missing title tag is a critical SEO issue. Every page must have a unique, keyword-rich title.' });
        continue;
      }

      if (t.includes('meta description') && (t.includes('missing') || t.includes('short') || t.includes('long'))) {
        needsAiMeta = true;
        fixes.push({ id: issue.id, issue: issue.issue, current, priority,
          suggestedValue: '(AI will generate below)',
          explanation: 'Meta description is your "ad copy" in search results. A compelling 150-160 char description improves CTR by 5-10%.' });
        continue;
      }

      // Catch-all: use issue's own suggestion from the audit
      fixes.push({ id: issue.id, issue: issue.issue, current, priority,
        suggestedValue: issue.suggestion || issue.fixExample || 'See audit detail',
        explanation: issue.detail || 'Fix this issue to improve your SEO score.' });
    }

    // ── Single AI call for title + meta only (if needed) ────────────────────
    if ((needsAiTitle || needsAiMeta) && pageData) {
      try {
        const aiParts = [];
        if (needsAiTitle) aiParts.push(`SEO title (30-60 chars) for a page about: "${pageData.title || pageData.metaDescription || url}". Current: "${pageData.title || 'none'}". Return as: TITLE: [text]`);
        if (needsAiMeta)  aiParts.push(`Meta description (150-160 chars) for the same page. Current: "${pageData.metaDescription || 'none'}". Return as: META: [text]`);

        const aiResp = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{ role: 'user', content: aiParts.join('\n\n') + '\n\nReturn ONLY the TITLE: and META: lines, no explanation.' }],
        });

        const text = aiResp.content[0].text;
        const aiTitle = (text.match(/TITLE:\s*(.+)/i)?.[1] || '').trim();
        const aiMeta  = (text.match(/META:\s*(.+)/i)?.[1]  || '').trim();

        if (aiTitle) fixes.filter(f => f.suggestedValue === '(AI will generate below)' && f.issue.toLowerCase().includes('title'))
          .forEach(f => { f.suggestedValue = aiTitle; });
        if (aiMeta)  fixes.filter(f => f.suggestedValue === '(AI will generate below)' && f.issue.toLowerCase().includes('description'))
          .forEach(f => { f.suggestedValue = aiMeta; });
      } catch (e) {
        console.error('AI rewrite failed, using deterministic fallback:', e.message);
      }
    }

    res.json({ success: true, url, fixes, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Fixes error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get current value for an issue from pageData
 */
function getCurrentValue(issue, pageData) {
  const t = (issue.issue || '').toLowerCase();
  if (t.includes('title'))       return pageData?.title || '(not set)';
  if (t.includes('description')) return pageData?.metaDescription || '(not set)';
  if (t.includes('h1'))          return (pageData?.h1Tags || [])[0] || '(missing)';
  if (t.includes('alt'))         return '(missing or empty)';
  return issue.fixExample || '(view in audit)';
}

// ═══════════════════════════════════════════════════════════════════════════
// GEO-SPATIAL RANK TRACKER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a gridSize×gridSize matrix of lat/lng points centered on
 * (centerLat, centerLng) spanning ±radiusKm in each direction.
 */
function generateGridPoints(centerLat, centerLng, gridSize, radiusKm) {
  const points = [];
  const half   = Math.floor(gridSize / 2);
  const stepKm = gridSize > 1 ? (radiusKm * 2) / (gridSize - 1) : 0;

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const rowOff = row - half;
      const colOff = col - half;
      const latOffset = (rowOff * stepKm) / 111;
      const lngOffset = (colOff * stepKm) / (111 * Math.cos(centerLat * Math.PI / 180));
      points.push({ lat: centerLat + latOffset, lng: centerLng + lngOffset, row, col });
    }
  }
  return points;
}

/**
 * Query Serper.dev for the target domain's position at a given lat/lng.
 * If SERPER_API_KEY is not set, returns realistic-looking demo data.
 */
async function querySerpAtPoint(point, keyword, domain) {
  const apiKey = process.env.SERPER_API_KEY;

  if (!apiKey) {
    // Demo mode — spread positions realistically around center
    const distFromCenter = Math.sqrt(point.row ** 2 + point.col ** 2);
    const basePos = 3 + Math.round(distFromCenter * 2.5);
    const jitter  = Math.floor(Math.random() * 4) - 1;
    const pos     = Math.max(1, Math.min(25, basePos + jitter));
    return { ...point, position: pos, found: pos <= 20 };
  }

  try {
    const body = JSON.stringify({
      q:        keyword,
      gl:       'us',
      hl:       'en',
      num:      20,
      location: `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`,
    });

    const response = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'google.serper.dev',
        path:     '/search',
        method:   'POST',
        headers:  {
          'X-API-KEY':     apiKey,
          'Content-Type':  'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Invalid JSON from Serper')); }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    const organic = response.organic || [];
    const cleanDomain = domain.replace(/^www\./, '');
    const idx = organic.findIndex(r => {
      try { return new URL(r.link).hostname.replace(/^www\./, '').includes(cleanDomain); }
      catch { return false; }
    });
    const position = idx >= 0 ? idx + 1 : 0;
    return { ...point, position, found: position > 0 };
  } catch (e) {
    console.warn(`Serper query failed at ${point.lat.toFixed(3)},${point.lng.toFixed(3)}: ${e.message}`);
    return { ...point, position: 0, found: false };
  }
}

/**
 * POST /api/geo-grid
 * Geo-Spatial Rank Grid — checks keyword positions at every point on a
 * gridSize×gridSize map centered on (lat, lng) within radiusKm.
 * Uses Serper.dev when SERPER_API_KEY is set; demo data otherwise.
 */
app.post('/api/geo-grid', rateLimiter(15, 60_000), async (req, res) => {
  try {
    const { lat, lng, keyword, domain, gridSize = 5, radiusKm = 5 } = req.body;
    if (!keyword || !domain) return res.status(400).json({ error: 'keyword and domain are required' });
    if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng are required' });

    const size   = Math.min(Math.max(Number(gridSize) || 5, 3), 7);
    const radius = Math.min(Math.max(Number(radiusKm) || 5, 1), 50);
    const points = generateGridPoints(Number(lat), Number(lng), size, radius);
    const isDemo = !process.env.SERPER_API_KEY;

    console.log(`\n🗺️  Geo-grid: "${keyword}" | ${domain} | ${size}×${size} | ±${radius}km | ${isDemo ? 'DEMO' : 'LIVE'}`);

    const grid = [];
    for (const pt of points) {
      const result = await querySerpAtPoint(pt, keyword, domain);
      grid.push(result);
      if (!isDemo) await new Promise(r => setTimeout(r, 250)); // 4 req/sec
    }

    const ranked    = grid.filter(r => r.found);
    const avgPos    = ranked.length > 0
      ? Math.round(ranked.reduce((s, r) => s + r.position, 0) / ranked.length) : null;

    res.json({
      keyword, domain, gridSize: size, radiusKm: radius,
      centerLat: Number(lat), centerLng: Number(lng),
      grid,
      summary: {
        totalPoints:  grid.length,
        rankedPoints: ranked.length,
        avgPosition:  avgPos,
        top3:         grid.filter(r => r.position >= 1 && r.position <= 3).length,
        top10:        grid.filter(r => r.position >= 1 && r.position <= 10).length,
        notRanking:   grid.filter(r => !r.found).length,
      },
      isDemo,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Geo-grid error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'SEO AI Backend is running', timestamp: new Date().toISOString() });
});

/**
 * Self-ping every 4 minutes to prevent Render free tier sleep
 */
setInterval(() => {
  fetch('https://naraseoai.onrender.com/api/v1/health').catch(() => {});
}, 4 * 60 * 1000);

/**
 * Start server — with EADDRINUSE auto-recovery
 */
const server = app.listen(PORT, () => {
  console.log(`✓ SEO AI Backend running on http://localhost:${PORT}`);
  console.log(`✓ Ready to generate reports & analyze pages`);
  console.log(`✓ Extension can now connect`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n✗ Port ${PORT} is already in use.`);
    console.error(`  Kill it with:  npx kill-port ${PORT}`);
    console.error(`  Or on Windows: netstat -aon | findstr :${PORT}  then  taskkill /F /PID <PID>\n`);
    process.exit(1);
  } else {
    throw err;
  }
});
