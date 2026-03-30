/**
 * Verify Engine - Hallucination detection + claim verification
 * Uses: Claude Haiku (extract + assess claims) + Wikipedia REST API (free, no key)
 */

import Anthropic from '@anthropic-ai/sdk';
import https from 'https';

const client = new Anthropic();

// Wikipedia summary lookup — free, no auth
function wikiLookup(term) {
  return new Promise((resolve) => {
    const encoded = encodeURIComponent(term.replace(/\s+/g, '_'));
    const options = {
      hostname: 'en.wikipedia.org',
      path: `/api/rest_v1/page/summary/${encoded}`,
      headers: { 'User-Agent': 'NaraseoVerify/1.0 (https://naraseoai.onrender.com)' },
      timeout: 5000,
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.type === 'standard' && json.extract) {
            resolve({ found: true, summary: json.extract.slice(0, 300), title: json.title });
          } else {
            resolve({ found: false });
          }
        } catch { resolve({ found: false }); }
      });
    }).on('error', () => resolve({ found: false }))
      .on('timeout', () => resolve({ found: false }));
  });
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

// Score E-E-A-T signals from content
function scoreEEAT(content) {
  const signals = {
    hasAuthorMention: /\b(written by|author|by [A-Z][a-z]+ [A-Z][a-z]+)\b/i.test(content),
    hasDateMention: /\b(20\d\d|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(content),
    hasCitations: /\b(according to|source:|cited|study|research|published)\b/i.test(content),
    hasOriginalData: /\b(\d+%|\d+ percent|survey|we found|our data|our study)\b/i.test(content),
    hasExpertVoice: /\b(expert|professional|certified|licensed|specialist|Dr\.|PhD|MD)\b/i.test(content),
  };
  const score = Object.values(signals).filter(Boolean).length;
  return {
    score: Math.round((score / 5) * 100),
    signals,
    grade: score >= 4 ? 'strong' : score >= 2 ? 'moderate' : 'weak',
    missing: Object.entries(signals).filter(([, v]) => !v).map(([k]) => k),
  };
}

export async function verifyClaims(content) {
  const [claims, eeat] = await Promise.all([
    extractClaims(content),
    Promise.resolve(scoreEEAT(content)),
  ]);

  // Wiki verify high-risk verifiable claims (max 3 to keep fast)
  const toVerify = claims.filter(c => c.verifiable && c.wiki_lookup && c.risk !== 'low').slice(0, 3);
  const wikiResults = await Promise.all(toVerify.map(c => wikiLookup(c.wiki_lookup)));

  // Merge wiki results
  toVerify.forEach((claim, i) => {
    claim.wiki = wikiResults[i];
    if (wikiResults[i].found) {
      claim.status = 'verifiable';
      claim.wiki_summary = wikiResults[i].summary;
    } else {
      claim.status = 'unverified';
    }
  });

  // Mark remaining
  claims.forEach(c => {
    if (!c.status) {
      c.status = c.verifiable ? (c.risk === 'low' ? 'likely_safe' : 'needs_review') : 'opinion';
    }
  });

  const flagged = claims.filter(c => ['unverified', 'needs_review'].includes(c.status));
  const safe = claims.filter(c => ['verifiable', 'likely_safe', 'opinion'].includes(c.status));

  return {
    summary: {
      total_claims: claims.length,
      flagged: flagged.length,
      safe: safe.length,
      risk_score: claims.length > 0 ? Math.round((flagged.length / claims.length) * 100) : 0,
      verdict: flagged.length === 0 ? 'clean' : flagged.length <= 2 ? 'review_needed' : 'high_risk',
    },
    eeat,
    flagged_claims: flagged,
    safe_claims: safe,
    all_claims: claims,
  };
}
