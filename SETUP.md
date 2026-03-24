# 🚀 SEO AI Complete Setup Guide

## System Architecture

```
Chrome Extension (sidebar)
    ↓
Collects page data (title, meta, H1, images, speed, etc)
    ↓
Backend API (http://localhost:3000)
    ↓
Professional SEO Scoring Engine + Claude AI
    ↓
Returns audit result with AI suggestions
    ↓
Display in sidebar (score, issues, recommendations)
```

---

## Part 1: Get Claude API Key (Required)

The backend uses Claude API for AI-powered suggestions. Here's how:

1. Go to: https://console.anthropic.com/
2. Sign up or log in
3. Go to **API Keys** section
4. Click **Create Key**
5. Copy the key (starts with `sk-ant-`)

**Cost**: Claude is pay-as-you-go. A typical SEO audit costs ~$0.001 (less than 1 cent)

---

## Part 2: Install Backend Dependencies

### On Windows (Command Prompt or PowerShell):

```bash
# Navigate to backend folder
cd "D:\Apps\SEO ai\backend"

# Install dependencies
npm install
```

Dependencies installed:
- **express** - Web server
- **cors** - Allow requests from extension
- **@anthropic-ai/sdk** - Claude API client
- **dotenv** - Environment variables

---

## Part 3: Configure Backend

1. Go to `D:\Apps\SEO ai\backend\`
2. Create a file named `.env`
3. Copy this and paste your Claude API key:

```
ANTHROPIC_API_KEY=sk-ant-YOUR-KEY-HERE
PORT=3000
```

**Example** (with fake key):
```
ANTHROPIC_API_KEY=sk-ant-abc123def456ghi789jkl
PORT=3000
```

---

## Part 4: Start Backend Server

### In Command Prompt (stays running):

```bash
cd "D:\Apps\SEO ai\backend"
npm start
```

You should see:
```
✓ SEO AI Backend running on http://localhost:3000
✓ Claude API integrated
✓ Ready to receive audits from extension
```

**Keep this window open!** The backend must be running for the extension to work.

---

## Part 5: Load Extension in Chrome

1. Go to **chrome://extensions/**
2. Enable **Developer Mode** (top right toggle)
3. Click **Load unpacked**
4. Select: `D:\Apps\SEO ai\extension`
5. Extension appears in your toolbar

---

## Part 6: Test End-to-End

1. **Backend is running** (see Part 4)
2. **Go to any website** (YouTube, Wikipedia, your site, etc)
3. **Click SEO AI extension icon**
4. Sidebar opens on the right
5. Watch it analyze (loading spinner shows)
6. Results appear in <5 seconds with:
   - Score (0-100)
   - Grade (A-F)
   - Professional SEO issues with priorities
   - AI-powered recommendations

---

## What Gets Checked (Industry Standards)

### On-Page SEO (35 points)
- ✅ Title tag (length, keywords, presence)
- ✅ Meta description (length, CTR optimization)
- ✅ H1 tag (one per page, keyword relevance)
- ✅ H2-H3 structure (content organization)
- ✅ Content length (minimum 300 words)
- ✅ Image alt text (accessibility & SEO)

### Technical SEO (35 points)
- ✅ Viewport meta tag (mobile responsiveness)
- ✅ Character encoding (UTF-8)
- ✅ Canonical tags (duplicate prevention)
- ✅ Internal link structure
- ✅ Page speed (FCP, load time)

### Mobile SEO (10 points)
- ✅ Mobile-friendly viewport
- ✅ Touch-friendly design detection

### Social/Sharing (5 points)
- ✅ Open Graph tags (FB, LinkedIn, Twitter)

### Accessibility & Security (5 points)
- ✅ Image alt text
- ✅ External link security (noopener)

### AI Suggestions (Claude)
- ✅ Top 3 recommendations for improvement
- ✅ Why each issue matters
- ✅ Exact fix code/approach

---

## Scoring Logic (Professional Industry Standards)

**Score Calculation:**
- Start at 100 points
- Deduct points for issues based on impact (critical = -10 to -20, warning = -3 to -8, info = -1 to -2)
- Final score: 0-100 → Grade: A (90+), B (80-89), C (70-79), D (60-69), F (<60)

**Grade Meaning:**
- **A (90-100)**: Excellent. Ready to rank competitively.
- **B (80-89)**: Good. Minor improvements needed.
- **C (70-79)**: Average. Significant SEO gaps.
- **D (60-69)**: Poor. Major SEO issues affecting rankings.
- **F (<60)**: Critical. Page unlikely to rank well.

---

## Page Speed Analysis

The extension automatically checks:
- **First Contentful Paint (FCP)** - How fast content appears
- **Page Load Time** - Total time to load completely
- **Speed Grade** - FAST (<2s), MODERATE (2-4s), or SLOW (>4s)

This is critical because Google ranks faster pages higher.

---

## Using the API vs Direct Analysis

### Option 1: **With Backend API** (Recommended) ✅
```
Extension → Backend → Claude AI → Professional Results
```
**Pros:**
- Professional scoring algorithm
- AI-powered suggestions
- Can scale to production
- Better accuracy
- Real-time Claude integration

**Cons:**
- Need to run backend server
- Need Claude API key

### Option 2: **Without Backend** (Fallback)
```
Extension → Local Analysis → Basic Results
```
**Pros:**
- Works offline
- No setup needed

**Cons:**
- Basic checks only
- No AI suggestions
- Less accurate scoring
- Can't scale

**Current Setup**: Using Option 1 (recommended) with automatic fallback to Option 2 if backend fails.

---

## Troubleshooting

### Problem: "Connection error" in sidebar

**Solution 1**: Backend not running
- Open new Command Prompt
- Run: `cd "D:\Apps\SEO ai\backend" && npm start`
- Refresh extension

**Solution 2**: API key invalid
- Check `.env` file has `ANTHROPIC_API_KEY=sk-ant-...`
- Get new key from https://console.anthropic.com/api-keys
- Restart backend

### Problem: Extension shows always "Analyzing..."

**Check backend logs** for errors:
```bash
# In backend Command Prompt, look for red error messages
```

If Backend fails, extension automatically falls back to local analysis (no AI suggestions but still works).

### Problem: No issues found / Score always 100

**Check:**
- Is backend running? (`npm start` in command prompt)
- Is Claude API key correct?
- Try reload extension (chrome://extensions → reload)

---

## What's Next (Future Features)

Once this is working:
- Competitor analysis
- Keyword ranking tracking
- Local SEO (Google Business Profile)
- Content suggestions
- Report generation & export
- Monthly tracking dashboard

---

## Quick Command Reference

```bash
# Start backend
cd "D:\Apps\SEO ai\backend" && npm start

# Install dependencies
cd "D:\Apps\SEO ai\backend" && npm install

# Check backend health
curl http://localhost:3000/health

# View Claude API usage
https://console.anthropic.com/account/usage
```

---

## Support

- **Backend logs**: Look in the Command Prompt window where you ran `npm start`
- **Chrome errors**: Right-click extension → Inspect → Console tab
- **Claude API issues**: https://console.anthropic.com/

---

**You're ready!** Extension should now give professional, industry-grade SEO audits with AI suggestions. 🚀
