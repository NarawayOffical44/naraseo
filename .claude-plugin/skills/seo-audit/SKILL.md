---
description: Full SEO audit — score, grade, all issues, Core Web Vitals, schema. Use on any URL.
---

Run a complete SEO audit on the URL provided (or ask the user for a URL if none given).

Use the `seo_audit` MCP tool if available. If not, call the REST API:
```
POST NARASEO_API_URL/api/v1/audit
Authorization: Bearer NARASEO_API_KEY
{ "url": "<URL>" }
```

Present results clearly:
1. **Score and grade** (e.g. 67/100 — Grade C)
2. **Critical issues** — list each with impact and what to fix
3. **Core Web Vitals** — LCP, CLS, INP with pass/fail
4. **Quick wins** — things fixable in under 5 minutes
5. Ask if they want the full fix plan (`/seo-solve`)
