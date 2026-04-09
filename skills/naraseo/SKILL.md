---
name: naraseo
description: >
  AI trust verification layer. Verifies LLM-generated content against Wikipedia, Wikidata,
  OpenAlex, and Crossref. Detects hallucinations, unattributed statistics, stale recency
  claims, and fabricated authority. Returns enriched content with inline source badges.
  Use when user says "verify this", "check this", "is this accurate", "fact-check",
  "naraseo verify", or invokes /naraseo. Also triggers when user asks to verify AI output,
  check claims for accuracy, or audit content before publishing.
---

When /naraseo is invoked, use the `verify_content` MCP tool on the content to verify.

If MCP tool unavailable, call REST API directly:
```
POST https://naraseoai.onrender.com/api/v1/verify
Authorization: Bearer {NARASEO_API_KEY}
{ "content": "<text>", "format": "inline" }
```

Default format: **inline**. Switch: `/naraseo inline|markdown|json`.

## What Naraseo Checks

Six universal hallucination risk patterns:
1. **fabricated_specificity** — precise stats with no attributed source ("87% of users")
2. **stale_recency** — present-tense claims from training data ("currently", "as of now")
3. **confidence_overreach** — absolute certainty ("guaranteed", "100% effective")
4. **authority_fabrication** — vague expert attribution ("experts say", "studies show")
5. **high_stakes_specificity** — numeric precision that could cause harm (dosage, legal)
6. **urgency_manipulation** — pressure tactics ("act now", "limited time")

Sources checked: Wikipedia · Wikidata · OpenAlex · Crossref · News API

## Output Formats

| Format | What it returns |
|--------|----------------|
| **inline** | Original text with ✅ ⚠️ 🔴 badges + inline source links |
| **markdown** | Formatted report with flagged claims, sources, suggestions table |
| **json** | Structured `{ text, verified, verdict, claims[], suggestions[], validity }` |

## Verdict Labels

- ✅ `clean` — All claims verified or safe. Publish with confidence.
- ⚠️ `review_needed` — 1-2 flagged claims. Human review recommended.
- 🔴 `high_risk` — Critical signals detected. Do not publish without revision.

## Claim Status Badges

- ✅ `verifiable` / `likely_safe` — Confirmed against sources
- ⚠️ `needs_review` — High-risk pattern, unconfirmed
- ❓ `unverified` — Could not find supporting source
- 🔴 `contradicted` — Source contradicts claim (correction provided)
- 💭 `opinion` — Subjective, not fact-checkable

## Usage Examples

```
User: "Write about Python performance"
Claude: [generates response with claims]
User: /naraseo inline

Naraseo: "Python ✅ [Wikipedia: Python programming language] is a high-level
language. It was created in 1991 ✅ [Wikipedia: Guido van Rossum] by Guido van
Rossum. Studies show ⚠️ [NEEDS SOURCE] it is 10x slower than C..."

Verdict: ⚠️ REVIEW NEEDED
Risk score: 33%
Claims: 3 total (2 verified, 1 flagged)
Suggestion: Remove "Studies show" or add specific citation
```

## Boundaries

Do not verify: opinions, creative writing, hypotheticals, code blocks.
Always verify: statistics, named entities, dates, scientific claims, legal/medical claims.
After `/naraseo stop` or "disable naraseo": revert to normal mode.
Verification persists for current content block only — next response starts fresh.

## Certificate

Every verification generates a shareable certificate:
`https://naraseoai.onrender.com/api/v1/proof/{cert_id}`
Share with clients as proof of content accuracy.
