# naraseo

**Build with AI. Verify before you ship.**

One npm package to audit SEO, verify AI content for hallucinations, and find topic gaps — before a wrong fact costs your agency a client.

## Install

```bash
npm install naraseo
```

## Quick Start

```js
import { naraseo } from 'naraseo';

const client = naraseo({ apiKey: 'nrs_your_key_here' });

// Verify AI content before publishing
const result = await client.verify(`
  OpenAI was founded in 2015 by Elon Musk and Sam Altman.
  The treatment requires 500mg daily for 30 days with no side effects.
`);

console.log(result.publishable);          // false
console.log(result.summary.verdict);     // 'high_risk'
console.log(result.fix_before_publishing); // ['REMOVE: "500mg daily" — unverified medical dosage...']
console.log(result.certificate_id);      // 'cert_abc123' — shareable proof of verification
```

## Methods

### `client.verify(content, url?)`
Detect hallucinations and score E-E-A-T signals. Returns a `certificate_id` as a shareable Certificate of Accuracy.

### `client.getCertificate(certificateId)`
Retrieve a stored verification certificate by ID — use as proof content was checked.

### `client.audit(url)`
Full SEO audit: score, grade, issues, actionable `fixes[]`, GEO readiness score.

### `client.entityGap({ url, keyword, competitorUrls? })`
Find what topics competitors cover that your page is missing. Returns `information_gain_score` and ranked `entity_gaps`.

### `client.riskAudit(content, industry?)`
Industry-aware risk audit for `medical`, `legal`, `financial`, or `general` content. Detects dosage claims, financial guarantees, liability statements.

### `client.keywords(url)`
Keyword research and semantic cluster from page content.

### `client.validateSchema(url)`
Validate JSON-LD structured data for Rich Results eligibility.

### `client.crawl(url, { maxPages, maxDepth })`
Crawl an entire site and audit every page. Pro/Agency tier.

### `client.competitors(url, competitorUrls[])`
Compare your page vs 1–5 competitors on score, word count, schema.

## Free tier

No API key required for up to 100 requests/day. Get a key at [naraseo.onrender.com](https://naraseo.onrender.com).

```js
// Works without an API key (free tier, IP rate-limited)
const client = naraseo();
const audit = await client.audit('https://yoursite.com');
```
