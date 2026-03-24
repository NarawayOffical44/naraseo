---
description: Local rank tracking — shows where a business ranks for a keyword across a geographic grid. Use for local SEO clients.
---

Run a geo-grid rank tracking scan. Ask the user for:
- URL of the business
- Target keyword (e.g. "plumber london")
- City center or coordinates (latitude, longitude)
- Grid size (3, 5, or 7 — default 5)

Use the `geo_grid` MCP tool if available. If not, call:
```
POST NARASEO_API_URL/api/v1/geo-grid
Authorization: Bearer NARASEO_API_KEY
{
  "url": "<URL>",
  "keyword": "<keyword>",
  "centerLat": <lat>,
  "centerLng": <lng>,
  "gridSize": 5
}
```

Present results as:
1. **Average rank**: X across the grid
2. **Coverage**: what % of grid points the business appears in top 10
3. **Grid map**: show the rank at each point (use a text grid or table)
4. **Weakest areas**: grid corners or edges with poor rank — what to fix

If historical data is available, show the rank trend.
