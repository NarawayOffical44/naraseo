# Naraseo AI — Product & Technical Reference

Last updated: 2026-04-01

---

## What It Is
AI generates content. Naraseo makes it rank.
Audit + verify + optimise AI content before it goes live — automatically.
One API. Works via REST, MCP (Claude Desktop/Cursor), or Chrome extension.

---

## Live Endpoints (all working)

| Endpoint | Input | Output |
|---|---|---|
| POST /api/v1/audit | url (+ optional keyword) | SEO score, fixes[], CWV, SERP features if keyword passed |
| POST /api/v1/keywords | url OR content | 8-10 trending keyword suggestions (volume, trend, where_to_use) |
| POST /api/v1/verify | url OR content | Claims verified, E-E-A-T score, drift index, schema conflicts |
| POST /api/v1/risk | content | publishable: true/false, risk_score, 6-pattern scan, fix list |
| POST /api/v1/entity-gap | url | Missing entities, BLOCKING vs RECOMMENDED, Schema.org JSON-LD |
| POST /api/v1/competitors | url + competitorUrls[] | Side-by-side audit + domain authority comparison |
| POST /api/v1/schema/validate | url | JSON-LD validation |
| POST /api/v1/local-seo | url | Local SEO signals |
| POST /api/v1/chat | messages[] | SEO-aware AI chat |
| GET /api/v1/proof/:id | — | HTML Certificate of Accuracy with drift index |
| GET /mcp | — | MCP tool list (13 tools) |
| POST /mcp | — | Streamable HTTP for Claude Desktop |
| GET /mcp/sse | — | SSE for Cursor/Cline |

---

## Core Engines (backend/lib/)

### seoEngine.js
- HTML fetch, parse, score (0-100, A-F grade)
- fixes[] — actionable JSON diffs: `{action, field, current, suggested, code, reason, impact}`
- SPA detection → falls back to Lighthouse data

### keywordEngine.js (rebuilt 2026-04-01)
- Input: `{ title, metaDescription, content }`
- DataForSEO `keyword_suggestions/live` → real volume + monthly trend data
- Google Suggest (free fallback if DataForSEO unavailable)
- Claude Haiku synthesises 8-10 keywords:
  - 3-4 primary (high volume, title/H1)
  - 3-4 secondary (medium volume, H2/body)
  - 2-3 questions (PAA-style, FAQ section)
- Returns: `keyword_suggestions[]`, `content_gaps[]`, `title_suggestion`, `meta_suggestion`

### serpFeatures.js (new 2026-04-01)
- DataForSEO SERP API (`/v3/serp/google/organic/live/advanced`)
- Detects: AI Overview, Featured Snippet, PAA, Knowledge Panel, Local Pack
- Returns: `features[]`, `people_also_ask[]`, `target_position`, `total_results`
- Only fires when `keyword` passed in audit request — $0.0006/call

### verifyEngine.js
- Wikipedia REST — claim grounding
- OpenAlex — scholarly citations, full citation string, CONTRADICTION_DETECTED flag
- Wikidata — entity QID grounding
- NewsAPI / Google News RSS — recency claim verification (Pattern 2)
- 8 claims extracted via Claude Haiku
- 7 E-E-A-T signals scored
- Schema conflict detection (JSON-LD vs body text cross-check)
- Drift index: volatile(7d) / moderate(30d) / stable(90d) / permanent(365d) + re_verify_recommended

### riskEngine.js
- 6 universal LLM failure patterns (run on ALL content):
  1. fabricated_specificity
  2. stale_recency
  3. confidence_overreach
  4. authority_fabrication
  5. high_stakes_specificity
  6. urgency_manipulation
- Industry (medical/legal/financial) = severity multiplier only (medium→high, high→critical)
- Output: `publishable`, `risk_level`, `risk_score`, `legal_risk_signals[]`, `fix_before_publishing[]`

### entityEngine.js
- Google CSE → competitor discovery
- Claude Haiku → entity extraction from content
- Wikidata QID grounding for each entity
- BLOCKING (must-add) vs RECOMMENDED verdicts
- Schema.org JSON-LD injection ready

### backlinks.js (updated 2026-04-01)
- OpenPageRank API → pageRank (0-10), domainRank
- RDAP (rdap.org, free, no key) → domain_age: `{ registration_date, age_years }`
- Both run in parallel, both fail silently
- 24h cache per domain

### pageSpeed.js
- Google PageSpeed Insights API
- CWV: LCP, CLS, INP, FCP (CrUX field data)
- Lighthouse scores: performance, SEO, accessibility, best practices

---

## External APIs

| API | Key Env Var | Free Tier | Used For |
|---|---|---|---|
| Anthropic Claude | ANTHROPIC_API_KEY | — | All AI synthesis (Haiku model) |
| Google PageSpeed | GOOGLE_PAGESPEED_API_KEY | 25k req/day | CWV + Lighthouse |
| Google CSE | GOOGLE_SEARCH_API_KEY + GOOGLE_CSE_ID | 100/day | Competitor discovery |
| OpenPageRank | OPENPR_API_KEY | 100/day | Domain authority |
| DataForSEO | DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD | Pay-as-you-go $0.0006/SERP | Keyword suggestions + SERP features |
| OpenAlex | None (polite pool via User-Agent email) | Unlimited | Scholarly citations |
| Wikipedia REST | None | Unlimited | Claim verification |
| Wikidata | None | Unlimited | Entity QID grounding |
| Google Suggest | None | Unlimited | Keyword fallback |
| NewsAPI | NEWS_API_KEY (optional) | 100/day | Recency claim verification |
| Google News RSS | None | Unlimited | Recency fallback |
| RDAP (rdap.org) | None | Unlimited | Domain age |
| Supabase | SUPABASE_URL + SUPABASE_KEY | — | User data, audit history, API keys |
| Bing Webmaster | BING_WEBMASTER_API_KEY | — | Parked — Phase 2 only |

---

## Auth Flow
- Signup/login → custom HMAC-SHA256 JWT (`signToken()` in server.js)
- JWT payload: `{ sub, email, plan, iat }`
- All `/api/v1/*` → verify custom JWT first, then Supabase JWT, then api_keys table
- API keys: `nrs_` prefix, stored as SHA256 hash in `api_keys` table

## MCP (13 tools)
seo_audit, solve, keyword_research, schema_validate, site_crawl, geo_grid,
local_seo_audit, competitor_analysis, seo_chat, solve_site, verify_content,
entity_gap, risk_audit

---

## Pitch Deck (Naraseo-AI.pptx) — Fixes Needed
1. **Slide 2** — add hallucination/legal risk pain alongside SEO gap
2. **Slide 9** — fix competitor table: add GPTZero, Frase, DataForSEO. Remove Screaming Frog.
3. **Slide 10** — fill `$K/month` burn rate placeholder
4. **Slide 3** — mention verify + risk, not just audit
5. **Slide 8** — replace with Before/After comparison table (duplicate of slide 6 currently)

---

## Pending
- Add DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD to Render env vars
- Extension: "audit [url]" in chat → trigger runAudit()
- Login page redesign (split layout + value prop)
- Redis rate limiter (current is in-memory, resets on restart)
