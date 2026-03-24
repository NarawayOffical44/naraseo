---
description: Keyword placement — finds exactly where to insert keywords into existing page content without rewriting anything. Changes are minimal and invisible.
---

Identify where to place keywords in existing page content without changing the content structure or tone.

Ask the user for:
- URL of the page
- Target keywords (optional — will be derived automatically if not provided)

Use the `seo_chat` MCP tool with a content optimization prompt, or call:
```
POST NARASEO_API_URL/api/v1/content
Authorization: Bearer NARASEO_API_KEY
{ "url": "<URL>", "targetKeywords": ["<keyword1>", "<keyword2>"] }
```

For each suggested placement:
- **Element**: which HTML element (title, H1, meta description, etc.)
- **Current text**: exact text right now
- **Suggested text**: minimal change — only the keyword insertion, nothing else changed
- **Why**: one sentence SEO reason

Rules to follow:
- Never rewrite or restructure content
- Only add 1-4 words at a natural point
- If a keyword doesn't fit naturally, skip it

If the user is working in a codebase, offer to apply the changes directly to the HTML/template files.
