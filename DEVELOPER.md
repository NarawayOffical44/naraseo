# Naraseo AI — Developer Reference

> Last updated: March 2026
> For anyone picking this up: read this first. It tells you what's real, what's fake, and what needs work.

---

## What This Product Is

A multi-access-point SEO platform. Same intelligence, three ways to reach it:

| Access Point | Who Uses It | URL |
|---|---|---|
| Chrome Extension | SEO teams, agencies, end users | Sidebar on any page |
| REST API | Developers, SaaS builders, AI agents | `POST /api/v1/...` |
| MCP Server | Claude, Cursor, Windsurf, any LLM | `POST /mcp` or `GET /mcp/sse` |

The backend is one Express server that powers all three.

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js 20, Express 4, ES Modules (`"type": "module"`) |
| AI | Anthropic SDK (`claude-haiku-4-5` for fast ops, `claude-opus-4-6` for synthesis) |
| Database | Supabase (Postgres) — audits, rank snapshots, user profiles |
| Auth | JWT (custom) — `signToken` / `verifyToken` in `server.js` |
| PDF | Puppeteer (headless Chrome) |
| Deployment | Render (production) — `backend/` is the deploy root |
| Extension | Chrome MV3 — sidebar panel, service worker, content script |

---

## Repo Structure

```
/
├── backend/                  ← Deploy this to Render
│   ├── server.js             ← Main Express app (legacy routes still here, ~2600 lines)
│   ├── routes/v1/            ← All v1 API routes (one file per feature)
│   │   ├── index.js          ← Mounts all routes + OpenAPI
│   │   ├── audit.js          ← POST /audit, GET /audit/:id, GET /audit/history
│   │   ├── keywords.js       ← POST /keywords
│   │   ├── competitors.js    ← POST /competitors
│   │   ├── geoGrid.js        ← POST /geo-grid, GET /geo-grid/history
│   │   ├── solve.js          ← POST /solve (autonomous: audit+keywords+schema+fixes)
│   │   ├── solveSite.js      ← POST /solve-site (site-wide via sitemap)
│   │   ├── content.js        ← POST /content (keyword placement)
│   │   ├── report.js         ← POST /report (PDF download)
│   │   ├── deploy.js         ← POST /deploy (generates patch script)
│   │   ├── crawl.js          ← POST /crawl
│   │   ├── localSeo.js       ← POST /local-seo
│   │   ├── schema.js         ← POST /schema/validate
│   │   ├── chat.js           ← POST /chat
│   │   ├── fixes.js          ← POST /fixes
│   │   └── openapi.js        ← GET /openapi.json (OpenAPI 3.0 spec)
│   ├── lib/                  ← Core engines (pure functions, no Express)
│   │   ├── seoEngine.js      ← Page fetch + audit logic
│   │   ├── keywordEngine.js  ← Keyword extraction + Google Suggest + Claude
│   │   ├── geoEngine.js      ← Geo-grid via Google Custom Search
│   │   ├── backlinks.js      ← OpenPageRank API wrapper
│   │   ├── schemaValidator.js← JSON-LD schema parser + validator
│   │   ├── pageSpeed.js      ← Google PageSpeed Insights API
│   │   ├── crawlEngine.js    ← Site crawler (sitemap + HTML link following)
│   │   └── history.js        ← Supabase read/write for audits + rank snapshots
│   ├── mcp/
│   │   └── server.js         ← MCP server factory (10 tools)
│   ├── middleware/
│   │   └── apiKey.js         ← API key auth + rate limiting + tier feature gates
│   └── supabase.js           ← Supabase client (export default supabase)
│
├── extension/                ← Chrome Extension (MV3)
│   ├── manifest.json
│   ├── sidebar.html/js/css   ← Main UI (side panel)
│   ├── popup.html/js         ← Toolbar popup
│   ├── background.js         ← Service worker
│   └── content.js            ← Injected into every page
│
├── website/                  ← Marketing + auth website (served from backend)
│   ├── index.html            ← Landing page
│   ├── login.html            ← Sign up / Login
│   └── dashboard.html        ← API key, usage, subscription
│
├── landing-page.html         ← Old static landing page (being replaced by website/)
├── CONNECT.md                ← How to connect Claude Desktop, ChatGPT, Cursor
└── DEVELOPER.md              ← This file
```

---

## Environment Variables

Create `backend/.env`:

```env
# Required
ANTHROPIC_API_KEY=sk-ant-...        # Claude API — all AI features

# Recommended (features degrade without these)
GOOGLE_PAGESPEED_API_KEY=...        # PageSpeed Insights — free, get at console.cloud.google.com
GOOGLE_CSE_API_KEY=...              # Custom Search — geo-grid feature
GOOGLE_CSE_ID=...                   # Custom Search Engine ID
OPENPR_API_KEY=...                  # OpenPageRank — domain authority, free 100/day

# Auth
JWT_SECRET=any-random-string-here   # Signs JWT tokens

# Database (optional — falls back to in-memory demo mode)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJ...                 # Service role key (not anon)

# Billing (add when Stripe account created)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_AGENCY=price_...

# Deployment
SITE_URL=https://your-render-url.onrender.com
PORT=3001                           # Render sets this automatically
```

**Demo mode**: If `SUPABASE_URL` is missing, the server runs with in-memory users (resets on restart). Good for local testing, not production.

---

## Feature Logic — What's Real vs What's AI

### SEO Audit (`/api/v1/audit`)
**Real data. This is the strongest feature.**

1. Fetches raw HTML from the URL
2. Parses: title, meta description, H1-H6, images, links, canonical, viewport, robots, OG tags, JSON-LD schema, word count
3. Calls **Google PageSpeed Insights API** → real Lighthouse scores, Core Web Vitals (LCP, FID, CLS), performance score
4. Scores each issue by impact (critical / warning / info)
5. Returns: overall score (0–100), grade (A–F), all issues with fix suggestions
6. Saves result to Supabase `audits` table

**What it cannot do**: Check server-side rendering issues, JavaScript-heavy SPAs (only sees the HTML, not executed JS output), or paid backlink data.

---

### Keyword Research (`/api/v1/keywords`)
**Now real. Updated March 2026.**

1. Extracts word frequency from page HTML (top 30 words, top 20 phrases)
2. Calls **Google Suggest API** (free, no auth, `suggestqueries.google.com`) with `gl=us&hl=en`
   - Queries 2–3 word phrases for relevance (single words give generic results)
   - Returns what Google actually autocompletes = real searches people do
3. Sends everything to **Claude Haiku** which returns:
   - Primary keyword + search intent
   - Semantic cluster (related terms from real suggestions)
   - Content gaps (what Google suggests that the page doesn't cover)
   - Quick wins (specific actions: "add to H2", "add to meta description")
   - Missing keywords (real suggestion terms not on the page at all)
   - Improved title + meta suggestions

**What it cannot do**: Give search volume numbers (e.g. "1,200 searches/month"). That requires DataForSEO API (~$0.0005/call) or Google Ads API. The suggestions are real but unquantified.

**Note on locale**: Google Suggest uses server IP for geolocation. On local dev in India you may see India-biased results. On Render (US servers) results will be US English. Always use `gl=us` parameter.

---

### Backlinks (`lib/backlinks.js`)
**Real data, limited scope.**

- Calls **OpenPageRank API** (`openpagerank.com`)
- Returns: Domain Authority score (0–10, Google PageRank scale) + global rank among all domains
- 24-hour in-memory cache per domain
- Free tier: 100 API calls/day

**What it cannot do**: List actual backlinks (which sites link to you), anchor text analysis, new/lost link tracking. This is domain-level authority only.

Used by: `/competitors` route to show real DA side-by-side comparison.

---

### Geo-Grid (`/api/v1/geo-grid`)
**Real Google ranking data. Limitation: not truly hyper-local.**

1. Generates a grid of lat/lng points around a center coordinate
2. For each point, calls **Google Custom Search API** with the keyword
3. Checks if the target domain appears in results → records rank (1–10) or not found
4. Returns: rank per grid point, average rank, coverage percentage

**Limitation**: Google Custom Search API searches are national/regional, not street-level. The grid points are visual but the search result doesn't actually change based on which lat/lng you pass (CSE doesn't take location as a search parameter the way Google Maps does). For true hyper-local ranking you'd need Google Maps Places API or DataForSEO Local Pack API.

**Free tier**: 100 CSE queries/day. A 3x3 grid = 9 queries. A 5x5 grid = 25 queries.

---

### Competitor Analysis (`/api/v1/competitors`)
**Real structural comparison. No traffic data.**

1. Audits each competitor URL (same seoEngine as `/audit`)
2. Fetches domain authority for each via OpenPageRank
3. Compares: score, DA, title quality, meta quality, word count, schema presence, page speed
4. Claude generates: gap analysis, what they do better, specific actions to close the gap

**What it cannot do**: Show competitor keyword rankings, traffic estimates, backlink lists. Those require paid SEO data providers.

---

### Schema Validation (`/api/v1/schema`)
**Fully real. Parses and validates JSON-LD against Schema.org.**

- Extracts all `<script type="application/ld+json">` blocks
- Validates required fields per type (Article, Product, LocalBusiness, FAQPage, etc.)
- Returns: valid/invalid per block, missing required fields, warnings

---

### Site Crawl (`/api/v1/crawl`)
**Real crawler. Respects robots.txt.**

- Starts from a URL, follows internal links
- Extracts sitemap.xml if present
- Audits each page found
- Returns: all pages, scores per page, site-wide issue summary

---

### PDF Report (`/api/v1/report`)
**Real Puppeteer render.**

- Takes audit JSON, renders HTML template, Puppeteer saves to PDF
- Requires Chromium installed (handled by `puppeteer` package)
- On Render: needs `PUPPETEER_EXECUTABLE_PATH` or use `puppeteer-core` with system Chrome

---

### Solve (`/api/v1/solve`)
**The flagship. Runs everything and returns a complete action plan.**

1. Runs audit
2. Runs keyword research
3. Validates schema
4. Sends all results to **Claude Opus** which generates:
   - Prioritised fix list with exact HTML to copy-paste
   - Placement instructions (exactly where to add what)
   - Business impact estimate per fix

---

### MCP Server (`/mcp`)
**10 tools, production-ready.**

| Tool | Does |
|---|---|
| `seo_audit` | Full audit of any URL |
| `solve` | Autonomous audit + keywords + schema + fix plan |
| `solve_site` | Site-wide via sitemap |
| `keyword_research` | Keyword analysis + Google Suggest |
| `schema_validate` | JSON-LD validation |
| `site_crawl` | Multi-page crawl |
| `geo_grid` | Local rank map |
| `local_seo_audit` | Local business SEO |
| `competitor_analysis` | Gap analysis + DA |
| `seo_chat` | AI SEO assistant |

**Connect to Claude Desktop**: Add to `%APPDATA%\Claude\claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "naraseo-ai": {
      "command": "npx",
      "args": ["mcp-remote", "https://YOUR-RENDER-URL/mcp/sse"]
    }
  }
}
```

---

## API Auth + Tiers

All v1 routes go through `middleware/apiKey.js`.

| Tier | Rate Limit | Features | Price |
|---|---|---|---|
| Free | 10 req/min, 100 req/day | audit, keywords, schema, competitors, chat, fixes | Free |
| Pro | 60 req/min, 1000 req/day | + crawl, geo-grid | $49/mo |
| Agency | 200 req/min, unlimited | Everything + white-label headers | $199/mo |

**API Key format**: JWT token returned from `POST /api/auth/login`. Pass as `Authorization: Bearer <token>`.

**White-label**: Agency tier users can pass `X-Brand: YourBrandName` header — responses will show their brand instead of Naraseo AI.

---

## Supabase Tables

```sql
-- User profiles
CREATE TABLE profiles (
  id uuid PRIMARY KEY,           -- matches Supabase auth user ID
  name text,
  email text UNIQUE,
  plan text DEFAULT 'free',      -- 'free' | 'pro' | 'agency'
  audits_this_month int DEFAULT 0,
  api_key text,
  created_at timestamptz DEFAULT now()
);

-- Audit history
CREATE TABLE audits (
  id text PRIMARY KEY,           -- random hex
  url text NOT NULL,
  domain text,
  user_id text,
  score int,
  grade text,                    -- 'A' | 'B' | 'C' | 'D' | 'F'
  data jsonb,                    -- full audit result
  created_at timestamptz DEFAULT now()
);

-- Geo-grid rank snapshots
CREATE TABLE rank_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  domain text,
  keyword text NOT NULL,
  user_id text,
  avg_rank numeric,
  coverage numeric,
  grid_size int,
  points jsonb,
  created_at timestamptz DEFAULT now()
);
```

---

## What's NOT Built Yet

| Feature | Priority | Notes |
|---|---|---|
| **AI Visibility** | HIGH | Track brand mentions in ChatGPT, Gemini, Perplexity — Semrush charges $500/mo for this |
| **WordPress Auto-Apply** | HIGH | `POST /api/v1/wordpress/apply` — use WP REST API + Application Passwords |
| **Search Volume Numbers** | MEDIUM | Needs DataForSEO API (~$0.0005/call) — keywords work but no "X searches/month" |
| **GBP AI Agent** | MEDIUM | Auto-manage Google Business Profile — needs Google My Business OAuth |
| **True Hyper-Local Grid** | LOW | Google Maps Places API for street-level rank data |
| **Backlink List** | LOW | Actual links pointing to a domain — needs Ahrefs/Majestic API |

---

## Running Locally

```bash
cd backend
cp .env.example .env   # fill in your keys
npm install
npm run dev            # nodemon server.js, port 3001
```

Test the API:
```bash
curl -X POST http://localhost:3001/api/v1/audit \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

Test keywords:
```bash
curl -X POST http://localhost:3001/api/v1/keywords \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

---

## Deployment (Render)

1. Push to GitHub (`github.com/NarawayOffical44/naraseo`)
2. Render → New Web Service → connect repo
3. Root directory: `backend`
4. Build command: `npm install`
5. Start command: `node server.js`
6. Add all env vars in Render dashboard

Puppeteer on Render requires adding a `puppeteer` buildpack or using `puppeteer-core` with system Chrome. See Render docs for Puppeteer deployment.

---

## Common Issues

| Problem | Cause | Fix |
|---|---|---|
| `DEMO_MODE=true` in logs | `SUPABASE_URL` not set | Add Supabase env vars |
| Keyword suggestions look India-based | Running locally in India | Deploy to Render (US) — Google Suggest uses server IP for locale |
| PageSpeed returns no data | `GOOGLE_PAGESPEED_API_KEY` missing | Get free key at console.cloud.google.com |
| Geo-grid returns 0 results | CSE credentials missing | Add `GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_ID` |
| PDF fails on Render | Puppeteer can't find Chrome | Add `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` and use system Chrome path |
| MCP not connecting | Wrong URL format | Use `/mcp/sse` for SSE transport, `/mcp` for Streamable HTTP |
