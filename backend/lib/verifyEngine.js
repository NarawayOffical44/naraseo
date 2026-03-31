/**
 * Verify Engine - Hallucination detection + claim verification
 * Uses: Claude Haiku (extract + assess claims) + Wikipedia REST API (free, no key)
 */

import Anthropic from '@anthropic-ai/sdk';
import https from 'https';

const client = new Anthropic();

// Step 1: Find best-matching Wikipedia article title via search API
function wikiSearch(term) {
  return new Promise((resolve) => {
    const q = encodeURIComponent(term);
    const req = https.get({
      hostname: 'en.wikipedia.org',
      path: `/w/api.php?action=query&list=search&srsearch=${q}&srnamespace=0&srlimit=1&format=json`,
      headers: { 'User-Agent': 'NaraseoVerify/1.0 (https://naraseoai.onrender.com)' },
      timeout: 5000,
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const hits = json.query?.search || [];
          resolve(hits.length > 0 ? hits[0].title : null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// Step 2: Get article summary by exact title
function wikiSummary(title) {
  return new Promise((resolve) => {
    const encoded = encodeURIComponent(title.replace(/\s+/g, '_'));
    const req = https.get({
      hostname: 'en.wikipedia.org',
      path: `/api/rest_v1/page/summary/${encoded}`,
      headers: { 'User-Agent': 'NaraseoVerify/1.0 (https://naraseoai.onrender.com)' },
      timeout: 5000,
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.type === 'standard' && json.extract) {
            resolve({ found: true, summary: json.extract.slice(0, 400), title: json.title });
          } else {
            resolve({ found: false });
          }
        } catch { resolve({ found: false }); }
      });
    });
    req.on('error', () => resolve({ found: false }));
    req.on('timeout', () => { req.destroy(); resolve({ found: false }); });
  });
}

// 2-step Wikipedia lookup: search for best title → get summary
// ~3x higher hit rate than direct title lookup
async function wikiLookup(term) {
  const title = await wikiSearch(term);
  if (!title) return { found: false };
  return wikiSummary(title);
}

// After getting wiki extracts, do ONE batch call to extract correct values
// Returns map of { index → { matches, correct_value, source } }
async function extractCorrectValues(claimsWithWiki) {
  if (claimsWithWiki.length === 0) return {};
  const items = claimsWithWiki
    .map((c, i) => `${i}. CLAIM: "${c.claim}" | WIKIPEDIA: "${c.wiki_summary}"`)
    .join('\n');
  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `For each CLAIM below, check if the Wikipedia extract CONTRADICTS it (wrong number, wrong date, wrong person, etc.).
Return ONLY a JSON array — no markdown:
[{"index":0,"matches":true,"correct_value":null},{"index":1,"matches":false,"correct_value":"the correct fact from Wikipedia"}]

${items}`,
      }],
    });
    const raw = msg.content[0].text.trim().replace(/^```json\n?|^```\n?|\n?```$/g, '').trim();
    const results = JSON.parse(raw);
    const map = {};
    for (const r of results) map[r.index] = r;
    return map;
  } catch { return {}; }
}

// Extract + assess claims via Claude Haiku
async function extractClaims(content) {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Analyze this content and extract all factual claims that could be verified or disputed.

For each claim return a JSON array. Each item:
{
  "claim": "the exact claim text",
  "type": "statistic|date|definition|named_entity|process|opinion",
  "verifiable": true/false,
  "risk": "low|medium|high",
  "reason": "why this is risky or safe",
  "wiki_lookup": "short search term for Wikipedia if verifiable, else null"
}

Focus on: statistics, dates, named entities, definitions, factual statements.
Skip: opinions, vague statements, well-known facts.
Return ONLY valid JSON array, no markdown.

Content:
${content.slice(0, 3000)}`
    }]
  });

  try {
    const text = msg.content[0].text.trim();
    const clean = text.replace(/^```json\n?|^```\n?|\n?```$/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return [];
  }
}

// Score E-E-A-T signals — HTML-aware: detects Schema markup, meta author, time tags, cite elements
function scoreEEAT(content) {
  const hasHtml = /<[a-z][\s\S]*>/i.test(content);
  const signals = {
    // Experience — author attribution (text + HTML meta/schema)
    hasAuthorMention:
      /\b(written by|author|byline)\b/i.test(content) ||
      /\bby [A-Z][a-z]+ [A-Z][a-z]+\b/.test(content) ||
      (hasHtml && (
        /<meta[^>]+name=["']author["'][^>]*/i.test(content) ||
        /"author"\s*:\s*[{"[]/i.test(content) ||
        /itemprop=["']author["']/i.test(content) ||
        /class=["'][^"']*\b(author|byline)\b[^"']*["']/i.test(content)
      )),
    // Expertise — professional credentials
    hasExpertVoice:
      /\b(expert|professional|certified|licensed|specialist|Dr\.|PhD|MD)\b/i.test(content) ||
      /\b(years? of experience|industry leader|award.winning)\b/i.test(content) ||
      (hasHtml && (
        /"jobTitle"/i.test(content) ||
        /itemprop=["'](jobTitle|honorificPrefix)["']/i.test(content)
      )),
    // Authoritativeness — citations and sources
    hasCitations:
      /\b(according to|source:|cited|study|research|published|references?)\b/i.test(content) ||
      (hasHtml && (/<cite\b/i.test(content) || /<blockquote\b/i.test(content))),
    // Trustworthiness — dates (text + HTML time/schema)
    hasDateMention:
      /\b20\d\d\b/.test(content) ||
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(content) ||
      (hasHtml && (
        /<time\b/i.test(content) ||
        /"datePublished"/i.test(content) ||
        /itemprop=["']datePublished["']/i.test(content)
      )),
    // Experience — original research / first-party data
    hasOriginalData:
      /\b(\d+%|\d+ percent|survey|we found|our data|our study|our research|our analysis)\b/i.test(content),
    // Authoritativeness — Article/BlogPosting schema markup
    hasSchemaMarkup:
      hasHtml &&
      /<script[^>]+type=["']application\/ld\+json["']/i.test(content) &&
      /"@type"\s*:\s*"(Article|BlogPosting|NewsArticle|MedicalWebPage|FAQPage|HowTo)"/i.test(content),
    // Trustworthiness — external links as cited sources
    hasExternalLinks:
      hasHtml && /<a\s[^>]*href=["']https?:\/\//i.test(content),
  };
  const score = Object.values(signals).filter(Boolean).length;
  const maxScore = Object.keys(signals).length;
  return {
    score: Math.round((score / maxScore) * 100),
    signals,
    grade: score >= 5 ? 'strong' : score >= 3 ? 'moderate' : 'weak',
    missing: Object.entries(signals).filter(([, v]) => !v).map(([k]) => k),
  };
}

export async function verifyClaims(content) {
  const [claims, eeat] = await Promise.all([
    extractClaims(content),
    Promise.resolve(scoreEEAT(content)),
  ]);

  // Wiki verify high-risk verifiable claims (max 4 to keep fast)
  const toVerify = claims.filter(c => c.verifiable && c.wiki_lookup && c.risk !== 'low').slice(0, 8);
  const wikiResults = await Promise.all(toVerify.map(c => wikiLookup(c.wiki_lookup)));

  // Merge wiki results
  const foundWithWiki = [];
  toVerify.forEach((claim, i) => {
    claim.wiki = wikiResults[i];
    if (wikiResults[i].found) {
      claim.status = 'verifiable';
      claim.wiki_summary = wikiResults[i].summary;
      claim.wiki_title = wikiResults[i].title;
      foundWithWiki.push({ ...claim, _idx: i });
    } else {
      claim.status = 'unverified';
    }
  });

  // Batch-check if claims contradict their wiki source → return correct_value
  if (foundWithWiki.length > 0) {
    const corrections = await extractCorrectValues(foundWithWiki);
    foundWithWiki.forEach((c, batchIdx) => {
      const correction = corrections[batchIdx];
      if (correction && !correction.matches && correction.correct_value) {
        // Find the original claim and attach the correction
        const original = toVerify.find(t => t.claim === c.claim);
        if (original) {
          original.status = 'contradicted';
          original.correct_value = correction.correct_value;
          original.source = 'Naraseo verification database';
        }
      }
    });
  }

  // Mark remaining
  claims.forEach(c => {
    if (!c.status) {
      c.status = c.verifiable ? (c.risk === 'low' ? 'likely_safe' : 'needs_review') : 'opinion';
    }
  });

  const flagged = claims.filter(c => ['unverified', 'needs_review', 'contradicted'].includes(c.status));
  const safe = claims.filter(c => ['verifiable', 'likely_safe', 'opinion'].includes(c.status));

  // Strip internal/implementation fields before returning
  const sanitize = (c) => {
    const { wiki, wiki_summary, wiki_title, wiki_lookup, _idx, ...clean } = c;
    return clean;
  };

  return {
    summary: {
      total_claims: claims.length,
      flagged: flagged.length,
      safe: safe.length,
      risk_score: claims.length > 0 ? Math.round((flagged.length / claims.length) * 100) : 0,
      verdict: flagged.length === 0 ? 'clean' : flagged.length <= 2 ? 'review_needed' : 'high_risk',
    },
    eeat,
    flagged_claims: flagged.map(sanitize),
    safe_claims: safe.map(sanitize),
    all_claims: claims.map(sanitize),
  };
}
