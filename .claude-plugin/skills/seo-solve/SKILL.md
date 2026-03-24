---
description: Autonomous SEO fix plan — runs full analysis and returns exact code to apply with precise placement instructions. No instructions needed.
---

Run the full autonomous SEO analysis on the URL provided (or ask if none given).

Use the `solve` MCP tool if available. If not, call:
```
POST NARASEO_API_URL/api/v1/solve
Authorization: Bearer NARASEO_API_KEY
{ "url": "<URL>", "businessName": "<optional>", "phone": "<optional>", "address": "<optional>" }
```

Present the plan as an actionable checklist:

**For each fix (sorted by priority):**
- What: the issue
- Where: exact HTML location (e.g. "Inside `<head>`, after `<title>`")
- Code: the exact HTML to add/change (in a code block)
- How to apply: direct edit / WordPress path / CMS API

Then:
- **Keyword opportunities** — specific keywords to target and where to use them
- **Quick wins** — 1-line actions under 5 minutes
- **Estimated score after fixes**: X/100

If the user is building a website or working in a codebase, offer to apply the fixes directly to the relevant files.
