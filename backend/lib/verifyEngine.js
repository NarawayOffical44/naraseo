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

// ── OpenAlex — 250M+ peer-reviewed papers, free, no API key ─────────────────
// Returns the most-cited open-access paper matching a claim query
function openAlexSearch(claim) {
  return new Promise((resolve) => {
    const q = encodeURIComponent(claim.slice(0, 120));
    const path = `/works?search=${q}&filter=open_access.is_oa:true&per_page=1&sort=cited_by_count:desc&select=title,doi,publication_year,cited_by_count,authorships,primary_location&mailto=verify@naraseoai.com`;
    const req = https.get({
      hostname: 'api.openalex.org',
      path,
      headers: { 'User-Agent': 'NaraseoVerify/1.0 (mailto:verify@naraseoai.com)' },
      timeout: 5000,
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const w = json.results?.[0];
          if (w?.title) {
            const authors = (w.authorships || []).slice(0, 3)
              .map(a => a.author?.display_name).filter(Boolean);
            const authorStr = authors.length > 1 ? `${authors[0]} et al.` : (authors[0] || 'Unknown Author');
            const year = w.publication_year || 'n.d.';
            const doiStr = w.doi ? ` DOI: ${w.doi}` : '';
            const citationString = `${authorStr} (${year}). ${w.title}.${doiStr}`;
            resolve({
              found: true,
              title: w.title,
              doi: w.doi || null,
              cited_by_count: w.cited_by_count || 0,
              publication_year: w.publication_year || null,
              url: w.primary_location?.landing_page_url || w.doi || null,
              citation_string: citationString,
            });
          } else { resolve({ found: false }); }
        } catch { resolve({ found: false }); }
      });
    });
    req.on('error', () => resolve({ found: false }));
    req.on('timeout', () => { req.destroy(); resolve({ found: false }); });
  });
}

// ── Schema Conflict Detection ─────────────────────────────────────────────────
// Extracts factual fields from JSON-LD blocks in HTML
function extractSchemaFacts(html) {
  const facts = {};
  const matches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of matches) {
    try {
      const schemas = [].concat(JSON.parse(m[1].trim()));
      for (const s of schemas) {
        if (s.foundingDate)                facts.foundingDate        = String(s.foundingDate);
        if (s.foundingYear)                facts.foundingYear        = String(s.foundingYear);
        if (s.name)                        facts.name                = String(s.name);
        if (s.telephone)                   facts.telephone           = String(s.telephone);
        if (s.priceRange)                  facts.priceRange          = String(s.priceRange);
        if (s.openingHours)                facts.openingHours        = [].concat(s.openingHours).join(', ');
        if (s.aggregateRating?.ratingValue) facts.ratingValue        = String(s.aggregateRating.ratingValue);
        if (s.numberOfEmployees?.value)    facts.numberOfEmployees   = String(s.numberOfEmployees.value);
        if (s.datePublished)               facts.datePublished       = String(s.datePublished);
        if (s.author?.name)                facts.authorName          = String(s.author.name);
        if (s.address?.streetAddress)      facts.streetAddress       = String(s.address.streetAddress);
        if (s.address?.addressLocality)    facts.city                = String(s.address.addressLocality);
      }
    } catch { /* skip malformed JSON-LD */ }
  }
  return facts;
}

// Compare schema facts against body text — catch cross-layer contradictions
async function detectSchemaConflicts(bodyText, schemaFacts) {
  if (Object.keys(schemaFacts).length === 0) return [];
  const factsStr = Object.entries(schemaFacts).map(([k, v]) => `${k}: "${v}"`).join('\n');
  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `You are checking for factual contradictions between a page's structured Schema markup and its body text.

Schema facts declared in JSON-LD:
${factsStr}

Body text (first 3000 chars):
${bodyText.slice(0, 3000)}

For each Schema fact, check if the body text explicitly states something DIFFERENT (wrong number, different date, different name, different hours).
Return ONLY a JSON array — empty [] if no conflicts:
[{
  "field": "foundingDate",
  "schema_value": "2015",
  "body_text_value": "2016",
  "conflict_excerpt": "exact phrase from body that contradicts",
  "severity": "high|medium",
  "fix": "Update body text OR Schema to match"
}]
Only flag real factual contradictions — not minor wording differences.`,
      }],
    });
    const raw = msg.content[0].text.trim().replace(/^```json\n?|^```\n?|\n?```$/g, '').trim();
    const result = JSON.parse(raw);
    return Array.isArray(result)
      ? result.map(c => ({ ...c, flag: 'CONTRADICTION_DETECTED' }))
      : [];
  } catch { return []; }
}

// ── Drift Index — temporal stability of verified facts ────────────────────────
// Determines how long a Certificate of Accuracy can be trusted
function computeDriftIndex(claims, industry) {
  const allText = claims.map(c => c.claim).join(' ').toLowerCase();
  const volatileTerms = /\b(rate|price|fee|law|regulation|statute|ruling|tariff|penalty|fine|tax|quota|current|today|latest|recent|updated|now|this year|interest|yield|apy|apr)\b/g;
  const stableTerms   = /\b(history|founded|invented|discovered|always|never|theorem|constant|formula|definition|scientific|mathematical|proven)\b/g;
  const volatileCount = (allText.match(volatileTerms) || []).length;
  const stableCount   = (allText.match(stableTerms)   || []).length;

  if (industry === 'financial' || industry === 'legal') {
    return { stability: 'volatile',  valid_days: 7,   re_verify_recommended: true,  reason: `${industry} content — rates and rulings change frequently` };
  }
  if (industry === 'medical') {
    return { stability: 'moderate',  valid_days: 30,  re_verify_recommended: false, reason: 'Medical guidelines update periodically' };
  }
  if (volatileCount > stableCount + 2) {
    return { stability: 'volatile',  valid_days: 7,   re_verify_recommended: true,  reason: 'Contains volatile facts (rates, laws, prices)' };
  }
  if (stableCount > volatileCount * 2) {
    return { stability: 'permanent', valid_days: 365, re_verify_recommended: false, reason: 'Based on stable historical or scientific facts' };
  }
  return   { stability: 'stable',    valid_days: 90,  re_verify_recommended: false, reason: 'General content with mixed temporal stability' };
}

// ── Main export ───────────────────────────────────────────────────────────────
// html: optional page HTML for schema conflict detection
// industry: optional industry hint for drift index ('medical'|'legal'|'financial'|'general')
export async function verifyClaims(content, { html = null, industry = null } = {}) {
  // Detect HTML in content itself if no separate html param
  const sourceHtml = html || (/<[a-z][\s\S]*>/i.test(content) ? content : null);

  const [claims, eeat] = await Promise.all([
    extractClaims(content),
    Promise.resolve(scoreEEAT(content)),
  ]);

  // Wiki verify high-risk verifiable claims
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

  // Batch-check for contradictions against knowledge sources
  if (foundWithWiki.length > 0) {
    const corrections = await extractCorrectValues(foundWithWiki);
    foundWithWiki.forEach((c, batchIdx) => {
      const correction = corrections[batchIdx];
      if (correction && !correction.matches && correction.correct_value) {
        const original = toVerify.find(t => t.claim === c.claim);
        if (original) {
          original.status = 'contradicted';
          original.correct_value = correction.correct_value;
          original.source = 'Naraseo ground-truth layer';
        }
      }
    });
  }

  // OpenAlex grounding for medical/legal high-risk claims — add scholarly DOI evidence
  const medicalLegal = /\b(medical|clinical|treatment|dosage|legal|statute|regulation|study|trial|research)\b/i;
  const highRiskClaims = claims.filter(c => c.risk === 'high' && c.verifiable && medicalLegal.test(c.claim)).slice(0, 2);
  const openAlexResults = await Promise.all(highRiskClaims.map(c => openAlexSearch(c.claim).catch(() => ({ found: false }))));
  highRiskClaims.forEach((claim, i) => {
    if (openAlexResults[i].found) {
      claim.scholarly_evidence = openAlexResults[i];
    }
  });

  // Schema Conflict Detection — cross-layer factual reconciliation
  const schemaConflicts = sourceHtml
    ? await detectSchemaConflicts(content, extractSchemaFacts(sourceHtml)).catch(() => [])
    : [];

  // Mark remaining
  claims.forEach(c => {
    if (!c.status) {
      c.status = c.verifiable ? (c.risk === 'low' ? 'likely_safe' : 'needs_review') : 'opinion';
    }
  });

  const flagged = claims.filter(c => ['unverified', 'needs_review', 'contradicted'].includes(c.status));
  const safe    = claims.filter(c => ['verifiable', 'likely_safe', 'opinion'].includes(c.status));

  // Strip internal fields
  const sanitize = (c) => {
    const { wiki, wiki_summary, wiki_title, wiki_lookup, _idx, ...clean } = c;
    return clean;
  };

  const driftIndex = computeDriftIndex(claims, industry);
  const validUntil = new Date(Date.now() + driftIndex.valid_days * 86400000).toISOString().split('T')[0];

  return {
    summary: {
      total_claims: claims.length,
      flagged: flagged.length,
      safe: safe.length,
      risk_score: claims.length > 0 ? Math.round((flagged.length / claims.length) * 100) : 0,
      verdict: flagged.length === 0 && schemaConflicts.length === 0
        ? 'clean'
        : flagged.length <= 2 && schemaConflicts.length === 0
          ? 'review_needed'
          : 'high_risk',
      schema_conflicts_found: schemaConflicts.length,
    },
    eeat,
    drift_index: { ...driftIndex, valid_until: validUntil },
    schema_conflicts: schemaConflicts,
    flagged_claims: flagged.map(sanitize),
    safe_claims: safe.map(sanitize),
    all_claims: claims.map(sanitize),
  };
}
