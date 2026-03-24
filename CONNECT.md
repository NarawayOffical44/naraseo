# Naraseo AI — Add SEO + Geo to Any AI Tool

**One hosted API. Works as MCP, REST, or OpenAPI Actions.**
Built for AI builders, vibe coders, and anyone who wants SEO intelligence inside their tools.

---

## Claude Code plugin (one command)

```shell
/plugin marketplace add https://github.com/your-org/naraseo-ai
/plugin install naraseo-ai@naraseo-ai
```

You now have `/seo-audit`, `/seo-solve`, `/geo-grid`, `/content-optimize` as native Claude Code skills.

---

---

## What you get

Paste a URL. Get back:
- SEO score + grade (A–F)
- Every issue found + impact level
- Core Web Vitals (Google PageSpeed)
- Exact fixes with copy-paste code + where to place it
- Keyword opportunities
- Geo-grid local rank map
- Competitor domain authority comparison
- PDF report (one call, Puppeteer rendered)

No SEO knowledge needed in your code. This is the engine.

---

## Connect to Claude Desktop / Cursor / Windsurf / Cline

Add to `claude_desktop_config.json`
(`%APPDATA%\Claude\claude_desktop_config.json` on Windows, `~/.config/Claude/` on macOS):

```json
{
  "mcpServers": {
    "naraseo-ai": {
      "command": "npx",
      "args": ["mcp-remote", "https://YOUR-DEPLOY.up.railway.app/mcp/sse"]
    }
  }
}
```

Restart the app. Now type in Claude Desktop or Cursor:

> "Audit https://example.com and tell me the top 3 fixes"

> "Run a geo-grid for 'plumber london' centred on 51.5, -0.1 for mybusiness.com"

> "Compare my site to competitor.com and show the SEO gaps"

No setup. No code. It just works.

---

## Connect to ChatGPT Custom GPTs / Perplexity

1. Go to **ChatGPT** → Explore GPTs → Create → Configure → Add Actions
2. Import schema from URL:
   ```
   https://YOUR-DEPLOY.up.railway.app/api/v1/openapi.json
   ```
3. Set Auth: `Bearer YOUR_API_KEY`

Same for **Perplexity** custom actions and any OpenAPI-compatible tool.

---

## Connect via REST API (any language, any tool)

```bash
# Full autonomous audit + exact fixes — one call
curl -X POST https://YOUR-DEPLOY.up.railway.app/api/v1/solve \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Keyword placement — where to add keywords without rewriting content
curl -X POST .../api/v1/content \
  -d '{"url": "https://example.com", "targetKeywords": ["emergency plumber london"]}'

# Geo-grid local rank tracking
curl -X POST .../api/v1/geo-grid \
  -d '{"url": "https://example.com", "keyword": "plumber", "centerLat": 51.5, "centerLng": -0.1, "gridSize": 5}'

# One-click PDF report (returns binary PDF)
curl -X POST .../api/v1/report \
  -d '{"url": "https://example.com"}' \
  --output report.pdf
```

---

## Use it in your vibe-coded app (Node / Python / any)

```js
// Node.js — audit any URL and get exact fixes
const res = await fetch('https://YOUR-DEPLOY.up.railway.app/api/v1/solve', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer YOUR_API_KEY', 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://example.com' })
});
const { data } = await res.json();
// data.fixes[] — ranked list with exact HTML, where to place it, and how to apply
// data.score — current SEO score
// data.coreWebVitals — LCP, CLS, INP from Google
```

```python
# Python — same thing
import requests
r = requests.post('https://YOUR-DEPLOY.up.railway.app/api/v1/solve',
  headers={'Authorization': 'Bearer YOUR_API_KEY'},
  json={'url': 'https://example.com'})
data = r.json()['data']
print(data['score'], data['grade'])
for fix in data['fixes']:
    print(fix['priority'], fix['issue'], fix['code'])
```

---

## All 13 endpoints

| Endpoint | What it does | Credits |
|----------|-------------|---------|
| `POST /api/v1/solve` | Full autonomous analysis — score + all fixes with exact placement | 3 |
| `POST /api/v1/solve-site` | Site-wide: discovers all pages via sitemap, audits all, one plan | 5+ |
| `POST /api/v1/audit` | Full page audit + Core Web Vitals | 1 |
| `GET /api/v1/audit/:id` | Retrieve a stored audit by ID | 0 |
| `GET /api/v1/audit/history?url=` | Score trend over time for a URL | 0 |
| `POST /api/v1/content` | Keyword placement — exact spots to insert keywords invisibly | 2 |
| `POST /api/v1/report` | Download full PDF audit report | 2 |
| `POST /api/v1/keywords` | Keyword research + AI analysis | 2 |
| `POST /api/v1/geo-grid` | Local rank tracking on a geographic grid | grid² |
| `GET /api/v1/geo-grid/history?url=&keyword=` | Rank trend over time | 0 |
| `POST /api/v1/competitors` | Competitor gap analysis + domain authority | 1+n |
| `POST /api/v1/local-seo` | Local SEO audit (NAP, schema, GMB) | 1 |
| `POST /api/v1/schema/validate` | JSON-LD schema validation | 1 |
| `POST /api/v1/chat` | AI SEO chat with full page context | 1 |
| `POST /api/v1/crawl` | Multi-page site crawl | n |
| `POST /api/v1/fixes` | Specific fix suggestions for any issue | 1 |
| `GET /api/v1/openapi.json` | Full OpenAPI 3.1 spec | 0 |

---

## Self-host in 5 minutes (Railway)

Deploy your own instance — use your own API keys, keep full control:

```bash
# 1. Fork / clone this repo
# 2. Create a Railway project from the Dockerfile
# 3. Set env vars in Railway dashboard:
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_PAGESPEED_API_KEY=AIza...
OPENPR_API_KEY=...
SUPABASE_URL=https://...supabase.co
SUPABASE_KEY=...
GOOGLE_CSE_API_KEY=...
GOOGLE_CSE_ID=...
```

Railway auto-deploys from the `Dockerfile` at the repo root.

**Cost to run**: ~$5/month on Railway starter, or free tier if traffic is low.
**Free APIs used**: Google PageSpeed (free), OpenPageRank (100 req/day free).
**Paid APIs**: Anthropic Claude Haiku (~$0.001 per audit). Google CSE ($5/1000 queries, only for geo-grid).

---

## MCP tools available in Claude Desktop

When connected via MCP, Claude gets these tools automatically:

- `seo_audit` — full audit
- `solve` — autonomous fix plan
- `solve_site` — site-wide analysis
- `keyword_research` — keyword analysis
- `schema_validate` — structured data check
- `site_crawl` — multi-page crawl
- `geo_grid` — local rank map
- `local_seo_audit` — local business SEO
- `competitor_analysis` — gap analysis with domain authority
- `seo_chat` — conversational SEO assistant

---

## White-label (Agency tier)

Pass `X-Brand: YourAgencyName` in your request headers.
All responses come back with `X-Powered-By: YourAgencyName` — completely invisible to your clients.

---

## Auth

```
Authorization: Bearer YOUR_API_KEY
```

No auth = Free tier (10 req/min, 100/day).
Tiers: Free → Pro → Agency. API keys managed via Supabase.

---

**Deploy → share your URL → any AI tool that supports MCP or OpenAPI Actions can use it as a native SEO skill.**
