/**
 * Keyword Engine - Real keyword research
 *
 * Data sources (all free, no API keys):
 *   1. Google Suggest API  — real autocomplete = actual searches people do
 *   2. Word frequency extraction from page content
 *   3. Claude AI synthesis — intent, gaps, prioritised quick wins
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

// ─── Helpers ───────────────────────────────────────────────────────────────

function extractKeywords(text, minLength = 2) {
  const cleaned = text
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= minLength && !STOP_WORDS.has(w));

  const freq = {};
  cleaned.forEach(w => { freq[w] = (freq[w] || 0) + 1; });

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([keyword, count]) => ({
      keyword,
      count,
      density: (count / cleaned.length * 100).toFixed(2) + '%',
    }));
}

function extractPhrases(text) {
  const words = text
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  const phrases = {};
  for (let i = 0; i < words.length - 1; i++) {
    const p2 = `${words[i]} ${words[i+1]}`;
    phrases[p2] = (phrases[p2] || 0) + 1;
  }
  for (let i = 0; i < words.length - 2; i++) {
    const p3 = `${words[i]} ${words[i+1]} ${words[i+2]}`;
    phrases[p3] = (phrases[p3] || 0) + 1;
  }

  return Object.entries(phrases)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([phrase, count]) => ({ phrase, count }));
}

/**
 * Google Suggest API — completely free, no auth, no API key.
 * Returns the same autocomplete suggestions Google shows users.
 * Position in the list = rough popularity signal (first = most searched).
 */
function getGoogleSuggestions(keyword) {
  return new Promise((resolve) => {
    const q = encodeURIComponent(keyword);
    // gl=us forces US results, hl=en forces English — avoids locale-skewed suggestions
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&q=${q}`;

    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          // Format: ["query", ["suggestion1", "suggestion2", ...], ...]
          const suggestions = (parsed[1] || []).slice(0, 8);
          resolve({ keyword, suggestions });
        } catch {
          resolve({ keyword, suggestions: [] });
        }
      });
    }).on('error', () => resolve({ keyword, suggestions: [] }));

    // Timeout safety
    setTimeout(() => resolve({ keyword, suggestions: [] }), 3000);
  });
}

// ─── Main export ────────────────────────────────────────────────────────────

export async function analyzeKeywords(pageTitle, metaDescription, pageContent) {
  try {
    const keywords  = extractKeywords(pageContent);
    const phrases   = extractPhrases(pageContent);
    const topKws    = keywords.slice(0, 8).map(k => k.keyword);

    // ── Real data: Google Suggest ─────────────────────────────────────────
    // Use 2-word phrases for relevance — single words get generic suggestions.
    // Build query seeds: top phrases from page + title-derived phrases.
    const phraseSeeds = phrases.slice(0, 3).map(p => p.phrase);

    const titleClean = (pageTitle || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim();

    // Also query: "TITLE + " to get what people search after the main topic
    const titleSeeds = titleClean.length > 3
      ? [titleClean.split(' ').slice(0, 3).join(' ')]
      : [];

    // Fallback: top single keywords if no phrases found
    const fallbackSeeds = topKws.slice(0, 2);

    const allSeeds = [...new Set([...phraseSeeds, ...titleSeeds, ...fallbackSeeds])].slice(0, 5);

    const suggestResults = await Promise.all(
      allSeeds.map(kw => getGoogleSuggestions(kw))
    );

    const titleSuggestResults = []; // merged into suggestResults above

    // Build real suggestions map: keyword → suggestions[]
    const realSuggestions = {};
    [...suggestResults, ...titleSuggestResults].forEach(({ keyword, suggestions }) => {
      if (suggestions.length > 0) realSuggestions[keyword] = suggestions;
    });

    // Flat list of all real suggestions (de-duped) for Claude context
    const allRealSuggestions = [...new Set(
      Object.values(realSuggestions).flat()
    )].slice(0, 40);

    // ── Claude synthesis ──────────────────────────────────────────────────
    const prompt = `You are an expert SEO keyword researcher. Analyze this page using real Google search data.

Page Title: ${pageTitle || 'MISSING'}
Meta Description: ${metaDescription || 'MISSING'}
Top Page Keywords: ${topKws.join(', ')}
Top Page Phrases: ${phrases.slice(0,8).map(p=>p.phrase).join(', ')}

REAL GOOGLE SUGGESTIONS (actual searches people do — this is ground truth):
${JSON.stringify(realSuggestions, null, 2)}

All real suggestion terms: ${allRealSuggestions.join(', ')}

Page Content (first 1500 chars): ${(pageContent || '').substring(0, 1500)}

Based on the REAL Google suggestions (not guesses — these are actual searches), provide a JSON response ONLY (no markdown):
{
  "primaryKeyword": "the main keyword this page targets",
  "primaryKeywordConfidence": 0.95,
  "searchIntent": "informational|navigational|transactional|commercial",
  "semanticCluster": ["related keyword variations from the real suggestions above"],
  "contentGaps": ["topics in the real suggestions that this page does NOT cover"],
  "quickWins": [
    {
      "keyword": "exact term from real Google suggestions",
      "source": "google_suggest",
      "reason": "why this is a quick win",
      "difficulty": "low|medium|high",
      "action": "exact change to make: e.g. add to H2, add to meta description"
    }
  ],
  "missingKeywords": ["real suggestion terms not present anywhere on the page"],
  "contentRecommendations": [
    "Specific recommendation backed by real search data"
  ],
  "titleSuggestion": "improved title tag using real high-demand terms",
  "metaSuggestion": "improved meta description using real search terms"
}`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    let aiAnalysis;
    try {
      const text = response.content[0]?.text || '{}';
      // Strip markdown code fences if present
      const clean = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      aiAnalysis = JSON.parse(clean);
    } catch {
      aiAnalysis = {
        primaryKeyword: topKws[0] || 'unknown',
        primaryKeywordConfidence: 0.7,
        searchIntent: 'informational',
        semanticCluster: topKws.slice(1, 6),
        contentGaps: [],
        quickWins: allRealSuggestions.slice(0, 5).map(kw => ({
          keyword: kw, source: 'google_suggest', difficulty: 'medium', action: 'Add to page content',
        })),
        missingKeywords: allRealSuggestions.filter(s => !pageContent.toLowerCase().includes(s)),
        contentRecommendations: [],
        titleSuggestion: pageTitle,
        metaSuggestion: metaDescription,
      };
    }

    return {
      success: true,
      data: {
        extractedKeywords: keywords,
        extractedPhrases: phrases,
        suggestions: realSuggestions,
        allSuggestions: allRealSuggestions,
        analysis: aiAnalysis,
        wordCount: pageContent.split(/\s+/).length,
        analysisTime: new Date().toISOString(),
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default { analyzeKeywords, extractKeywords, extractPhrases };
