# Naraseo AI Trust Layer - Plugin Installation

Verify LLM output across Claude Code, Chrome, and any Node.js app with instant hallucination detection.

---

## 🔧 Installation Methods

### Option 1: Claude Code Skill (`/naraseo` command)
Verify Claude responses directly in Claude Code editor.

```bash
# Install the skill
npx skills add naraseo-trust

# OR install from GitHub
npx skills add github:NarawayOffical44/naraseo --path backend/plugins

# Test it
/naraseo inline
```

**Usage in Claude Code:**
```
Claude: "Here's some analysis of AI risks..."
You: /naraseo inline

Result: ✅ Verified | ⚠️ Needs Review | 🔴 Hallucination
↓ Shows text with sources embedded
```

**Available formats:**
- `/naraseo inline` — badges + sources in original text
- `/naraseo markdown` — formatted report with tables
- `/naraseo json` — structured JSON for programmatic use

---

### Option 2: npm Package (Developers)
Use Naraseo in your own Node.js applications.

```bash
npm install naraseo-trust
```

**Basic usage:**
```javascript
import { verify } from 'naraseo-trust';

const result = await verify('Your LLM output here', {
  format: 'json', // or 'markdown', 'inline'
  apiKey: process.env.NARASEO_API_KEY,
});

console.log(result.verified_content);
// → { text, verified, verdict, claims[], suggestions[] }
```

**With authentication:**
```javascript
import { createClient } from 'naraseo-trust';

const naraseo = createClient({
  apiKey: process.env.NARASEO_API_KEY,
  baseUrl: 'https://naraseoai.onrender.com/api/v1',
});

// Verify text
const audit = await naraseo.verify(text, { format: 'inline' });

// Get shareable certificate
const cert = await naraseo.getCertificate(audit.certificate_id);
console.log(cert.url); // https://naraseoai.onrender.com/api/v1/proof/cert_xxx
```

---

## 🔑 API Key Setup

### Get your API key:
1. Go to https://naraseo.onrender.com (coming soon)
2. Sign up or log in
3. Dashboard → API Keys → Generate New Key
4. Copy key

### Add to environment:
```bash
# .env file
NARASEO_API_KEY=sk_test_abc123xyz
```

### Check remaining credits:
```bash
curl -X GET https://naraseoai.onrender.com/api/v1/account \
  -H "Authorization: Bearer $NARASEO_API_KEY"
```

---

## 📊 API Tiers

| Feature | Free | Pro | Agency |
|---------|------|-----|--------|
| **Requests/Min** | 10 | 60 | 200 |
| **Requests/Day** | 100 | 1000 | Unlimited |
| **Requests/Month** | Auto-reset | Auto-reset | Auto-reset |
| **Cost** | Free | $49/mo | $199/mo |
| **Response Formats** | json, markdown, inline | ✅ All | ✅ All |
| **Claim Verification** | Up to 20 | Up to 20 | Up to 20 |
| **Risk Patterns** | 6 universal | 6 universal | 6 universal |
| **Certificate Sharing** | ✅ | ✅ | ✅ |

---

## ✅ Quick Start Examples

### Example 1: Verify Text in Claude Code
```
Ask Claude: "What's the latest in AI safety research?"
Highlight response
Type: /naraseo inline
Result: See response with verification badges + Wikipedia sources
```

### Example 2: In Your App
```javascript
import { verify } from 'naraseo-trust';

// After ChatGPT, Claude, Gemini generates content
const llmOutput = "Python was created by Guido van Rossum in 1989...";

const { verified_content } = await verify(llmOutput, {
  format: 'inline',
  apiKey: process.env.NARASEO_API_KEY,
});

// verified_content = "Python ✅ [Wikipedia: Python programming language]
//                     was created by Guido van Rossum in 1989..."
```

---

## 🛠️ Uninstall

### Claude Code Skill:
```bash
npx skills remove naraseo-trust
```

### npm Package:
```bash
npm uninstall naraseo-trust
```

**Note:** Chrome extension is SEO-only (unaffected by trust layer)

---

## 🐛 Troubleshooting

### "API Key Invalid"
- Check that NARASEO_API_KEY environment variable is set
- Verify key format: `sk_test_...` or `sk_live_...`
- Regenerate key at dashboard

### "Rate limit exceeded"
- Wait for your plan's minute/day limit to reset
- Upgrade to Pro/Agency tier
- Check usage at dashboard

### "Network error connecting to API"
- Verify internet connection
- Check firewall/proxy settings
- API status: https://status.naraseoai.com

### "No claims detected"
- Text too short (minimum 50 characters)
- No factual claims found (too opinion-based)
- Try `/naraseo json` to see detailed analysis

---

## 📚 Additional Resources

- **Docs**: https://naraseoai.onrender.com/docs
- **API Reference**: https://naraseoai.onrender.com/docs/api
- **GitHub**: https://github.com/NarawayOffical44/naraseo
- **Feedback/Issues**: https://github.com/NarawayOffical44/naraseo/issues
- **Support**: support@naraway.com

---

## 📝 Plugin Manifest

For plugin marketplaces, Naraseo registers at `plugins-registry.json`:
```json
{
  "name": "Naraseo AI Trust Layer",
  "id": "naraseo-trust-layer",
  "version": "1.0.0",
  "registries": [
    "claude-plugins-official",
    "cursor-marketplace",
    "npm"
  ]
}
```

When you publish to GitHub, plugins automatically sync to registries.
