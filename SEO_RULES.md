# 📋 Professional SEO Rules & Industry Standards

This document explains the exact SEO rules used by our audit engine. These are based on Google's ranking factors, industry best practices, and proven strategies used by top SEO agencies.

---

## 1. ON-PAGE SEO (Critical for Rankings)

### Title Tag (10 points maximum)
**Why it matters**: Title tags are one of the top 3 ranking factors. Google heavily weights them.

| Issue | Standard | Impact | Fix |
|-------|----------|--------|-----|
| **Missing** | Must exist | Critical -10pts | Add: `<title>Main Keyword - Brand Name</title>` |
| **Too short** | <30 chars | Critical -8pts | Expand to 50-60 chars with keyword |
| **Too long** | >60 chars | Warning -4pts | Trim to 50-60 chars |
| **Generic** | Has modifiers | Medium -3pts | Add location/benefit (Austin, Pro, Best) |

**Best Practice**: `<title>Service + Location + Benefit | Brand Name</title>`
- ✅ "Professional SEO Services Austin - 30% More Traffic"
- ❌ "Home"
- ❌ "Welcome to our website"

---

### Meta Description (8 points maximum)
**Why it matters**: Controls CTR from search results. Good descriptions can increase clicks by 20-30%.

| Issue | Standard | Impact | Fix |
|-------|----------|--------|-----|
| **Missing** | Must exist | Critical -8pts | Add description 150-160 chars |
| **Too short** | <120 chars | Warning -4pts | Expand to 150-160 chars |
| **Too long** | >160 chars | Info -2pts | Trim to 160 chars max |

**Best Practice**: Compelling 150-160 character description with:
- Problem → Solution → CTA
- ✅ "Get professional SEO audit in 2 minutes. See exactly what's hurting your rankings. Free report included."
- ❌ "This is our services page"

---

### H1 Tag (8 points maximum)
**Why it matters**: Every page MUST have ONE H1. It's a core SEO requirement and Google ranking factor.

| Issue | Standard | Impact | Fix |
|-------|----------|--------|-----|
| **Missing** | Exactly 1 per page | Critical -8pts | Add: `<h1>Page Main Topic</h1>` |
| **Multiple** | Only 1 allowed | Warning -8pts | Change extras to H2/H3 |
| **Too short** | 20+ chars | Warning -4pts | Expand H1 with context |

**Best Practice**:
- ✅ One H1 per page with target keyword
- ✅ Matches page topic exactly
- ❌ Multiple H1s on same page
- ❌ H1 keyword stuffed ("SEO SEO SEO services SEO")

---

### H2-H3 Structure (3-5 points)
**Why it matters**: Helps Google understand content hierarchy. Good structure = better rankings.

| Issue | Standard | Impact | Fix |
|-------|----------|--------|-----|
| **No H2s** | 3-5 H2 minimum | Info -3pts | Add H2 subheadings |
| **Missing H3s** | Under H2s | Info -1pt | Add H3 for deep topics |

**Best Practice**:
```html
<h1>Main Topic</h1>
  <h2>Section 1</h2>
    <h3>Subtopic 1.1</h3>
    <h3>Subtopic 1.2</h3>
  <h2>Section 2</h2>
    <h3>Subtopic 2.1</h3>
```

---

### Content Quality (5-7 points)
**Why it matters**: Google prefers in-depth, comprehensive content. Thin content won't rank.

| Word Count | Ranking Potential | Issue | Fix |
|-----------|-------------------|-------|-----|
| **<300** | Very Low | Warning -7pts | Expand content significantly |
| **300-500** | Low | Warning -4pts | Add examples, explanations |
| **500-1500** | Good | OK | Meets minimum standard |
| **1500+** | Excellent | ✅ Competitive | Best for ranking |

**Google Ranking Data**:
- Top 10 results average 1,890 words
- Competitive keywords need 1,000+ words
- Informational content benefits from 2,000+ words

---

### Images & Visual Content (5 points)
**Why it matters**: Images improve UX and help Google understand content. Alt text = SEO + accessibility.

| Issue | Standard | Impact | Fix |
|-------|----------|--------|-----|
| **No alt text** | All images must have | Warning -5pts | Add: `<img alt="description" src="">` |
| **Poor alt text** | Descriptive (50-125 chars) | Warning -3pts | Write descriptive alt text |
| **Missing dimensions** | Width/height specified | Info -1pt | Add width/height to images |

**Alt Text Best Practice**:
- ✅ `alt="Team of SEO professionals reviewing analytics"` (descriptive)
- ❌ `alt="image"` (too generic)
- ❌ `alt="team"` (too vague)
- ❌ Missing alt (accessibility fail)

---

## 2. TECHNICAL SEO (Critical for Crawlability)

### Mobile Optimization (10 points) ⚠️ CRITICAL 2024+
**Why it matters**: Google Mobile-First Index = mobile version is primary version for rankings.

| Issue | Standard | Impact | Fix |
|-------|----------|--------|-----|
| **No viewport** | Must exist | Critical -10pts | Add: `<meta name="viewport" content="width=device-width, initial-scale=1">` |
| **Not mobile-friendly** | Responsive design | Critical -10pts | Use responsive CSS, test on mobile |

**Viewport Tag Checklist**:
```html
<!-- ✅ Correct -->
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<!-- ❌ Wrong - doesn't work -->
<meta name="viewport" content="width=device-width">
```

---

### Character Encoding (5 points)
**Why it matters**: Ensures text displays correctly in all browsers, especially international characters.

| Issue | Standard | Impact | Fix |
|-------|----------|--------|-----|
| **Missing** | Must declare | Critical -5pts | Add: `<meta charset="UTF-8">` |
| **Wrong encoding** | UTF-8 preferred | Warning -3pts | Change to UTF-8 |

---

### Canonical Tag (4 points)
**Why it matters**: Tells Google which version is primary. Prevents duplicate content penalties.

| Issue | Standard | Impact | Fix |
|-------|----------|--------|-----|
| **Missing** | Should exist | Warning -4pts | Add: `<link rel="canonical" href="YOUR-URL">` |
| **Wrong URL** | Must be page's own URL | Warning -4pts | Fix canonical to actual page URL |

**When needed**:
- ✅ Multiple versions of same page (www/non-www, http/https, trailing slash)
- ❌ Not needed if page is completely unique

---

### Page Speed (8 points) 🚀 Major Ranking Factor
**Why it matters**: Google explicitly uses speed as ranking factor. 1 second delay = 7% lower conversions.

| Metric | Fast | Moderate | Slow | Impact |
|--------|------|----------|------|--------|
| **Load time** | <2s | 2-4s | >4s | -8pts if slow |
| **First Contentful Paint** | <1.5s | 1.5-3s | >3s | -5pts if slow |
| **Time to Interactive** | <3s | 3-5s | >5s | -3pts if slow |

**Optimization Tips**:
- Compress images (ShortPixel, TinyPNG)
- Enable GZIP compression
- Minimize CSS/JS
- Use CDN for assets
- Lazy load images

---

### Link Structure (2 points)
**Why it matters**: Internal links distribute page authority and help crawlability.

| Issue | Standard | Impact | Fix |
|-------|----------|--------|-----|
| **Few links** | 3+ internal links | Info -2pts | Link to 3-5 related pages |
| **Broken links** | No 404s | Warning -3pts | Fix or remove broken links |
| **No anchor text** | Descriptive text | Info -1pt | Use keyword-rich anchor text |

---

## 3. MOBILE SEO (Critical in 2024+)

### Mobile-First Indexing
**Rule**: Google now indexes the MOBILE version first (was desktop in 2015).

**Checklist**:
- ✅ Responsive design (works on all screen sizes)
- ✅ Touch-friendly buttons (min 44x44px)
- ✅ Readable text (min 16px font)
- ✅ No interstitials blocking content
- ✅ No unplayable content (Flash)

---

## 4. SOCIAL & SHARING (Open Graph)

### Open Graph Tags (2 points each)
**Why it matters**: Controls how page looks when shared on Facebook, LinkedIn, Twitter.

| Tag | Standard | Impact | Example |
|-----|----------|--------|---------|
| **og:title** | Page title (no duplication) | Info -1pt | `<meta property="og:title" content="Your Title">` |
| **og:description** | 155 chars describing page | Info -1pt | `<meta property="og:description" content="...">` |
| **og:image** | 1200x630px image | Info -1pt | `<meta property="og:image" content="URL">` |
| **og:url** | Canonical URL | Info -1pt | `<meta property="og:url" content="URL">` |

---

## 5. ACCESSIBILITY & SECURITY

### Image Alt Text (Accessibility)
**Standard**: All images must have descriptive alt text.
**Impact**: Warning -5pts if missing
**Why**: Screen readers, SEO, broken image fallback

### External Links Security (0 points but important)
**Standard**: Links opening in new tab should have `rel="noopener noreferrer"`
**Impact**: Info level (no points deducted)
**Why**: Security vulnerability prevention

---

## Scoring Summary

```
Total Points Available: 100

On-Page SEO:        35 points
├─ Title           10 pts
├─ Meta Desc        8 pts
├─ H1              8 pts
├─ H2-H3           3 pts
├─ Content         5 pts
└─ Images          5 pts

Technical SEO:      35 points
├─ Mobile         10 pts
├─ Charset         5 pts
├─ Canonical       4 pts
├─ Page Speed      8 pts
└─ Links           2 pts

Mobile SEO:         10 points
└─ Responsive      10 pts

Social/Sharing:      5 points
├─ OG Title        1 pt
├─ OG Desc         1 pt
├─ OG Image        1 pt
└─ OG URL          1 pt

Accessibility:       5 points
└─ Alt Text        5 pts

Security:           0 points (info only)
└─ External Links  0 pts

TOTAL:            100 points
```

---

## Grade Interpretation

| Grade | Score | Meaning | Action |
|-------|-------|---------|--------|
| **A** | 90-100 | Excellent SEO foundation | Maintain + optimize for rankings |
| **B** | 80-89 | Good SEO | Fix warnings for better rankings |
| **C** | 70-79 | Average SEO | Fix critical issues immediately |
| **D** | 60-69 | Poor SEO | Major gaps affecting rankings |
| **F** | <60 | Critical issues | Unlikely to rank without fixes |

---

## Industry Benchmarks

### Average SEO Scores by Industry

```
E-commerce:       72/100 (B)
SaaS:            75/100 (C)
Local Business:  68/100 (D)
Blogs:           71/100 (B)
News:            78/100 (C)
Corporate:       74/100 (C)
```

### Our Goal: Get your score to B (80+)
- Fixes critical issues (get out of F/D)
- Implement best practices (reach B/A)
- Maintain ongoing SEO health

---

## Sources & References

- [Google Ranking Factors Study](https://www.searchmetrics.com/research/)
- [Core Web Vitals](https://web.dev/vitals/)
- [Google Mobile-First Index](https://developers.google.com/search/mobile-sites/mobile-first-indexing)
- [Schema.org Markup](https://schema.org/)

---

**Note**: These rules are updated quarterly as Google updates its algorithms. Latest update: March 2026.
