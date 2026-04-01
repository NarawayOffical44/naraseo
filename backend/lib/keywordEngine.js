/**
 * Keyword Engine — Trending keyword suggestions grounded in page/content topic.
 *
 * Flow:
 *   1. Extract seed topic from title/H1/content
 *   2. DataForSEO keyword_suggestions → real volume + trend data (primary)
 *   3. Google Suggest → free fallback if DataForSEO unavailable
 *   4. Claude Haiku → synthesise 8-10 ranked suggestions with type + where_to_use
 *
 * Supports: { url } OR { content } — page crawl or raw AI-generated text
 */

import Anthropic from '@anthropic-ai/sdk';
import https from 'https';

const client = new Anthropic();

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
  'is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','should','could','can','may','might',
  'it','its','this','that','these','those','i','you','he','she','we','they',
  'from','as','if','about','which','who','what','when','where','why','how',
  'all','each','every','both','few','more','most','other','some','such',
]);

// ─── Seed extraction ─────────────────────────────────────────────────────────

function extractSeed(title, content) {
  // Prefer title — it's the page's stated topic
  if (title && title.length > 3) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)
      .filter(w => !STOP_WORDS.has(w))
      .slice(0, 4)
      .join(' ');
  }
  // Fall back to top phrase from content
  const words = (content || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));
  const freq = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]).join(' ');
}

// ─── DataForSEO keyword suggestions ──────────────────────────────────────────

function getDfsAuth() {
  const login = process.env.DATAFORSEO_LOGIN;
  const pass  = process.env.DATAFORSEO_PASSWORD;
  if (!login || !pass) return null;
  return 'Basic ' + Buffer.from(`${login}:${pass}`).toString('base64');
}

async function fetchDfsKeywords(seed) {
  const auth = getDfsAuth();
  if (!auth) return null;

  try {
    const resp = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_suggestions/live', {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        keyword: seed,
        location_code: 2840,  // US — most comprehensive volume data
        language_code: 'en',
        limit: 30,
        filters: ['search_volume', '>', 100],  // skip zero-volume keywords
        order_by: ['search_volume,desc'],
      }]),
      signal: AbortSignal.timeout(12000),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const items = json?.tasks?.[0]?.result?.[0]?.items || [];
    return items.map(i => ({
      keyword: i.keyword,
      volume: i.keyword_info?.search_volume ?? 0,
      competition: i.keyword_info?.competition_level ?? 'unknown',  // LOW/MEDIUM/HIGH
      cpc: i.keyword_info?.cpc ?? null,
      trend: detectTrend(i.keyword_info?.monthly_searches),
    }));
  } catch {
    return null;
  }
}

function detectTrend(monthlySearches) {
  if (!monthlySearches || monthlySearches.length < 3) return 'stable';
  const recent = monthlySearches.slice(0, 3).map(m => m.search_volume);
  const older  = monthlySearches.slice(3, 6).map(m => m.search_volume);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg  = older.reduce((a, b) => a + b, 0) / older.length;
  if (olderAvg === 0) return 'stable';
  const change = (recentAvg - olderAvg) / olderAvg;
  if (change > 0.15) return 'rising';
  if (change < -0.15) return 'declining';
  return 'stable';
}

// ─── Google Suggest fallback (free, no key) ───────────────────────────────────

function getGoogleSuggestions(keyword) {
  return new Promise((resolve) => {
    const q = encodeURIComponent(keyword);
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&q=${q}`;
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          resolve((parsed[1] || []).slice(0, 10));
        } catch { resolve([]); }
      });
    }).on('error', () => resolve([]));
    setTimeout(() => resolve([]), 3000);
  });
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function analyzeKeywords(pageTitle, metaDescription, pageContent) {
  const seed = extractSeed(pageTitle, pageContent);

  // Run DataForSEO + Google Suggest in parallel
  const [dfsKeywords, googleSuggestions] = await Promise.all([
    fetchDfsKeywords(seed),
    getGoogleSuggestions(seed),
  ]);

  const hasDfs = dfsKeywords && dfsKeywords.length > 0;

  // Build context for Claude
  const dfsContext = hasDfs
    ? dfsKeywords.slice(0, 20).map(k =>
        `"${k.keyword}" — vol: ${k.volume}, competition: ${k.competition}, trend: ${k.trend}`
      ).join('\n')
    : 'Not available';

  const suggestContext = googleSuggestions.length > 0
    ? googleSuggestions.join(', ')
    : 'Not available';

  const prompt = `You are an expert SEO keyword strategist. Your job is to pick the BEST 8-10 keywords for this content to target RIGHT NOW based on real search data.

Content Topic: ${pageTitle || 'Unknown'}
Meta Description: ${metaDescription || 'None'}
Content Preview: ${(pageContent || '').substring(0, 800)}

REAL SEARCH DATA (DataForSEO — actual search volumes):
${dfsContext}

Google Autocomplete Suggestions (what people type right now):
${suggestContext}

Return ONLY valid JSON — no markdown, no explanation:
{
  "seed_keyword": "the core topic of this content",
  "keyword_suggestions": [
    {
      "keyword": "exact keyword to target",
      "volume": 8100,
      "competition": "low|medium|high",
      "trend": "rising|stable|declining",
      "type": "primary|secondary|question",
      "where_to_use": "title and H1|H2 subheading|body paragraph|FAQ section|meta description",
      "why": "one line reason why this keyword helps rank"
    }
  ],
  "content_gaps": ["topic this content is missing that searchers want"],
  "title_suggestion": "improved title using the top primary keyword",
  "meta_suggestion": "improved meta description under 155 chars"
}

Rules:
- Return exactly 8-10 keyword_suggestions
- 3-4 must be type "primary" (high volume, directly on-topic)
- 3-4 must be type "secondary" (related, medium volume, good for subheadings)
- 2-3 must be type "question" (PAA-style questions, perfect for FAQ)
- Prioritise "rising" trend keywords over "stable" when volume is similar
- Only include keywords from the real data above — no guesses`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.text || '{}';
    const clean = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const aiAnalysis = JSON.parse(clean);

    return {
      success: true,
      data: {
        seed_keyword: aiAnalysis.seed_keyword || seed,
        keyword_suggestions: (aiAnalysis.keyword_suggestions || []).slice(0, 10),
        content_gaps: aiAnalysis.content_gaps || [],
        title_suggestion: aiAnalysis.title_suggestion || pageTitle,
        meta_suggestion: aiAnalysis.meta_suggestion || metaDescription,
        data_source: hasDfs ? 'DataForSEO + Google Suggest' : 'Google Suggest',
        analysisTime: new Date().toISOString(),
      },
    };
  } catch {
    // Graceful fallback if Claude parse fails — return raw DataForSEO data
    return {
      success: true,
      data: {
        seed_keyword: seed,
        keyword_suggestions: (dfsKeywords || []).slice(0, 10).map((k, i) => ({
          keyword: k.keyword,
          volume: k.volume,
          competition: k.competition.toLowerCase(),
          trend: k.trend,
          type: i < 4 ? 'primary' : i < 7 ? 'secondary' : 'question',
          where_to_use: i < 4 ? 'title and H1' : i < 7 ? 'H2 subheading' : 'FAQ section',
          why: `Search volume: ${k.volume}, trend: ${k.trend}`,
        })),
        content_gaps: [],
        title_suggestion: pageTitle,
        meta_suggestion: metaDescription,
        data_source: hasDfs ? 'DataForSEO' : 'Google Suggest',
        analysisTime: new Date().toISOString(),
      },
    };
  }
}

export default { analyzeKeywords };
