# Naraseo AI - MCP Server

Enterprise-grade SEO audit and content verification tools via Model Context Protocol.

## Features

- **SEO Audit**: Technical SEO analysis, scoring, and actionable fixes
- **Keyword Research**: Data-driven keyword suggestions with trend analysis
- **Content Verification**: Hallucination detection, E-E-A-T scoring, fact-checking
- **Schema Validation**: JSON-LD structured data validation
- **Site Crawl**: Multi-page audits with issue prioritization
- **Entity Gap**: Competitor analysis and content gaps
- **Risk Audit**: LLM hallucination pattern detection

## Installation

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "naraseo-ai": {
      "command": "node",
      "args": ["/path/to/backend/mcp/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "your-key",
        "GOOGLE_CSE_API_KEY": "optional",
        "GOOGLE_PAGESPEED_API_KEY": "optional",
        "DATAFORSEO_LOGIN": "optional",
        "DATAFORSEO_PASSWORD": "optional"
      }
    }
  }
}
```

### Remote Server (Cloudflare, Railway, etc.)

```bash
node backend/mcp/index.js --port 3001
```

## Tools

All tools are **read-only** — they perform analysis and verification without modifying any data.

1. **seo_audit** — Full technical SEO audit
2. **solve** — Autonomous SEO fix generation
3. **keyword_research** — Data-driven keyword suggestions
4. **schema_validate** — JSON-LD validation
5. **site_crawl** — Multi-page site analysis
6. **geo_grid** — Local search ranking heatmap
7. **local_seo_audit** — Local business signals
8. **competitor_analysis** — Entity gap analysis
9. **seo_chat** — Expert AI consultation
10. **solve_site** — Site-wide SEO solutions
11. **verify_content** — Hallucination detection & fact-checking
12. **entity_gap** — Information gap analysis
13. **risk_audit** — LLM failure pattern detection

## Data Sources

All verification tools use free, public APIs:
- Wikipedia (fact-checking)
- Wikidata (entity grounding)
- OpenAlex (scholarly evidence)
- Crossref (citation verification)
- NewsAPI (recency checks)
- Google News RSS (news verification)

## Privacy Policy

### Data Collection

We collect and process:
- **Page content**: URLs and text for analysis (stored temporarily during request, not persisted)
- **Verification data**: Claims extracted for fact-checking (used only for that request)
- **Audit results**: Cached for 24 hours for performance (deleted after TTL)

### Usage & Storage

- All processing happens in-request on our servers
- Cache keys are hostname-based (no PII)
- Results are NOT used for training or analysis beyond the individual request
- No third-party data collection or sharing

### Data Retention

- Request data: Deleted immediately after response
- Cache data: 24-hour TTL, then auto-deleted
- No long-term user profiles or history

### Third-Party Access

We call these public APIs (read-only):
- Wikipedia REST API
- Wikidata search API
- OpenAlex academic papers
- Crossref DOI registry
- NewsAPI headlines
- Google News RSS
- Google CSE (if configured)
- Google PageSpeed (if configured)
- DataForSEO (if configured)

None of these integrations involve authentication with your data.

### Contact

For privacy questions: privacy@naraseoai.com

## Authentication

No authentication required. Tools are available to any Claude Desktop or connected MCP client.

## Limits

- Content max: 10,000 characters per verification
- Site crawl max: 500 pages per request
- Tool result max: ~150KB for Claude.ai, 25K tokens for Claude Code
- Timeout: 300 seconds (5 minutes)

## Support

- Docs: https://naraseo.onrender.com/docs.html
- Issues: https://github.com/NarawayOffical44/naraseo/issues
- Status: https://naraseoai.onrender.com/api/v1/health

## License

Proprietary - Naraseo AI
