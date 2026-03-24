# Naraseo AI - Public API v1 Implementation Complete ✓

## Overview
Built a **production-ready SEO API** (`/api/v1`) that provides real, actionable SEO analysis without any external SEO tools (Moz, Ahrefs, SEMrush, BrightLocal). Everything is built in-house.

---

## ✅ What Was Built

### Core Libraries (backend/lib/)
1. **seoEngine.js** - Full page SEO audit
   - HTML fetch with proper headers, redirects, timeout
   - Extracts: title, meta, headings, images, links, schema, OG, Twitter Card, robots, hreflang
   - Native scoring algorithm across 6 categories
   - Returns: `{ score, grade, pageData, issues, schema, robots }`

2. **geoEngine.js** - Local rank tracking
   - Uses Google Custom Search API (free 100 queries/day)
   - Generates geographic grid points (3×3, 5×5, 7×7)
   - Finds target domain rank at each point
   - Returns: heatmap with `{ avgRank, coverage, points[] }`

3. **keywordEngine.js** - AI keyword intelligence
   - Extracts keywords and phrases from page content
   - Uses Claude to analyze:
     - Primary keyword identification
     - Semantic clusters (10 related keywords)
     - Search intent classification
     - Content gaps
     - Quick win opportunities
   - Returns: structured keyword analysis with AI insights

4. **schemaValidator.js** - Schema.org validation
   - Extracts and validates all JSON-LD blocks
   - Checks required/recommended properties per type
   - Validates: Article, Product, LocalBusiness, FAQPage, BreadcrumbList, etc.
   - Determines rich results eligibility
   - Returns: validation results with actionable recommendations

5. **crawlEngine.js** - Multi-page site crawler
   - Respects robots.txt crawl-delay
   - Parallel batch crawling (configurable concurrency)
   - Per-page SEO audit via seoEngine
   - Deduplication and link extraction
   - Returns: crawl summary with per-page scores and top issues

### Middleware (backend/middleware/)
**apiKey.js** - Authentication & Rate Limiting
- Two auth modes: Bearer JWT (existing users) or Bearer API key (public API)
- API key storage: hashed in Supabase `api_keys` table
- Per-tier rate limits (in-memory, no Redis needed):
  - **Free**: 10 req/min, 100 req/day, audit+keywords+localSeo+schema+chat+fixes
  - **Pro**: 60 req/min, 1000 req/day, +crawl, +geoGrid, +competitors
  - **Agency**: 200 req/min, unlimited, all features + white-label
- Standard response format with metadata

### API Routes (backend/routes/v1/)
| Endpoint | Method | Description | Tier |
|----------|--------|-------------|------|
| `/audit` | POST | Full page SEO audit | Free |
| `/audit/:id` | GET | Retrieve stored audit | Free |
| `/crawl` | POST | Multi-page site crawl (up to 500 pages) | Pro |
| `/keywords` | POST | AI keyword research | Free |
| `/geo-grid` | POST | Local rank grid (Google CSE) | Pro |
| `/local-seo` | POST | Local SEO signals audit | Free |
| `/schema/validate` | POST | Validate structured data | Free |
| `/competitors` | POST | Competitor gap analysis | Free |
| `/chat` | POST | AI SEO consultant | Free |
| `/fixes` | POST | Generate code fixes | Free |
| `/fixes/suggestions` | POST | AI content rewrites | Free |
| `/health` | GET | API health check | Free |
| `/` | GET | API info & endpoints | Free |

---

## 🚀 Getting Started

### 1. Environment Setup
Add to `backend/.env`:
```env
GOOGLE_CSE_API_KEY=AIzaSy_xxxxxxxxxxxxxxxxxxxxx
GOOGLE_CSE_ID=xxxxxxxxxxxxxxxx:xxxxxxxxxxxxxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxx
```

See `backend/.env.example` for full configuration.

### 2. Start Backend
```bash
cd backend
node server.js
```

Server runs on port 3001 (or `PORT` env var).

### 3. Test the API

#### Test Full Audit (unauthenticated - Free tier)
```bash
curl -X POST http://localhost:3001/api/v1/audit \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "audit_xyz",
    "url": "https://example.com",
    "score": 74,
    "grade": "C",
    "categoryScores": {
      "onPage": 82,
      "technical": 68,
      "content": 71,
      "performance": 55,
      "mobile": 90,
      "social": 40
    },
    "issues": [
      {
        "id": "missing-meta-description",
        "type": "critical",
        "category": "On-Page",
        "impact": 12
      }
    ],
    "pageData": {
      "title": "...",
      "wordCount": 850,
      "h1": ["..."],
      "imageCount": 5,
      "linkCount": 23
    }
  },
  "meta": {
    "requestId": "req_abc123",
    "version": "1.0",
    "processingMs": 2341,
    "creditsUsed": 1
  }
}
```

#### Test Keyword Research
```bash
curl -X POST http://localhost:3001/api/v1/keywords \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

#### Test Schema Validation
```bash
curl -X POST http://localhost:3001/api/v1/schema/validate \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

#### Test Local SEO
```bash
curl -X POST http://localhost:3001/api/v1/local-seo \
  -H "Content-Type: application/json" \
  -d '{
    "url":"https://example.com",
    "businessName":"Example Business",
    "phone":"+1-555-0123",
    "address":"123 Main St, City, State"
  }'
```

#### Test with API Key (authenticated)
```bash
curl -X POST http://localhost:3001/api/v1/crawl \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY_HERE" \
  -d '{"url":"https://example.com", "maxPages":50}'
```

---

## 📊 Standard Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "req_abc123",
    "version": "1.0",
    "processingMs": 1240,
    "creditsUsed": 1
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "INVALID_URL",
    "message": "Invalid URL format"
  }
}
```

### Rate Limit Headers
- `X-RateLimit-Limit`: Max requests per minute
- `X-RateLimit-Remaining`: Requests remaining

---

## 🔑 API Key Management

### Generate API Key (Backend)
```javascript
import { generateApiKey, hashApiKey } from './middleware/apiKey.js';

const apiKey = generateApiKey(); // "abc123..."
const hash = hashApiKey(apiKey);  // Store hash in DB
```

### Store in Supabase
```javascript
const { data, error } = await supabase
  .from('api_keys')
  .insert({
    user_id: 'user123',
    key_hash: hashApiKey(apiKey),
    tier: 'pro',
    active: true,
  });
```

### Use in Requests
```bash
curl -H "Authorization: Bearer abc123..." http://localhost:3001/api/v1/crawl
```

---

## 🔄 Feature Access Control

Each endpoint checks tier access:

| Feature | Free | Pro | Agency |
|---------|------|-----|--------|
| audit | ✓ | ✓ | ✓ |
| keywords | ✓ | ✓ | ✓ |
| localSeo | ✓ | ✓ | ✓ |
| schema | ✓ | ✓ | ✓ |
| competitors | ✓ | ✓ | ✓ |
| chat | ✓ | ✓ | ✓ |
| fixes | ✓ | ✓ | ✓ |
| crawl | ✗ | ✓ | ✓ |
| geoGrid | ✗ | ✓ | ✓ |

---

## 🔗 Extension Backward Compatibility

Existing extension routes (`/api/audit`, `/api/chat`, etc.) remain unchanged.
New code can use v1 API with `Bearer <api_key>` header.

Extension updated to support production API URL via `PROD_API_URL` variable.

---

## 📝 Notes

- **No External SEO Tools**: All analysis is in-house (seoEngine, geoEngine, keywordEngine, etc.)
- **Real Data**: Every endpoint returns actual analysis results, not simulated/dummy data
- **Google CSE Free Tier**: 100 queries/day for geo-grid (enough for ~4 full grids)
- **Claude for AI**: Uses Anthropic Claude for keyword analysis and content suggestions
- **Scalable Auth**: In-memory rate limiter can be replaced with Redis/Memcached for distributed systems

---

## 🎯 What's Next

1. ✅ Core API endpoints built
2. ✅ Authentication & rate limiting implemented
3. ⏳ Deploy to production (Heroku, Vercel, Railway, etc.)
4. ⏳ Create API documentation portal
5. ⏳ Build client SDKs (JavaScript, Python)
6. ⏳ Add database persistence for audit history
7. ⏳ Implement credit/usage billing system

---

## Files Created/Modified

### New Files (16)
- `backend/lib/seoEngine.js`
- `backend/lib/geoEngine.js`
- `backend/lib/keywordEngine.js`
- `backend/lib/schemaValidator.js`
- `backend/lib/crawlEngine.js`
- `backend/middleware/apiKey.js`
- `backend/routes/v1/index.js`
- `backend/routes/v1/audit.js`
- `backend/routes/v1/crawl.js`
- `backend/routes/v1/keywords.js`
- `backend/routes/v1/geoGrid.js`
- `backend/routes/v1/localSeo.js`
- `backend/routes/v1/schema.js`
- `backend/routes/v1/competitors.js`
- `backend/routes/v1/chat.js`
- `backend/routes/v1/fixes.js`

### Modified Files (3)
- `backend/server.js` - Added v1 router mounting
- `backend/.env.example` - Added Google CSE + Supabase config
- `extension/background.js` - Added production API URL support
