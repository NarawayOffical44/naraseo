/**
 * Entity Gap Engine - Information Gain analysis
 * Finds what entities/topics competitor pages have that yours doesn't
 */

import Anthropic from '@anthropic-ai/sdk';
import { fetchURL } from './seoEngine.js';
import https from 'https';

const client = new Anthropic();

// Google Custom Search — auto-discover top-ranking competitor URLs for a keyword
// Reuses the same GOOGLE_CSE_API_KEY + GOOGLE_CSE_ID already configured for geo-grid
function googleSearchCompetitors(keyword) {
  return new Promise((resolve) => {
    const key = process.env.GOOGLE_CSE_API_KEY || process.env.GOOGLE_SEARCH_API_KEY;
    const cx = process.env.GOOGLE_CSE_ID;
    if (!key || !cx) return resolve([]);
    const q = encodeURIComponent(keyword);
    const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${q}&num=5&gl=us`;
    https.get(url, { timeout: 6000 }, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          const urls = (data.items || []).map(i => i.link).filter(Boolean).slice(0, 3);
          resolve(urls);
        } catch { resolve([]); }
      });
    }).on('error', () => resolve([]))
      .on('timeout', () => resolve([]));
  });
}

// Google Suggest — free, same as keywordEngine uses
function getGoogleSuggestions(keyword) {
  return new Promise((resolve) => {
    const q = encodeURIComponent(keyword);
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&q=${q}`;
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 4000 }, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try { resolve((JSON.parse(raw)[1] || []).slice(0, 8)); }
        catch { resolve([]); }
      });
    }).on('error', () => resolve([])
    ).on('timeout', () => resolve([]));
  });
}

// Wikidata entity lookup — free, no API key, returns canonical QID + description
// Used to ground extracted entities against the knowledge graph
function wikidataLookup(entity) {
  return new Promise((resolve) => {
    const q = encodeURIComponent(entity);
    const req = https.get({
      hostname: 'www.wikidata.org',
      path: `/w/api.php?action=wbsearchentities&search=${q}&language=en&format=json&limit=1&type=item`,
      headers: { 'User-Agent': 'NaraseoAI/1.0 (https://naraseoai.onrender.com)' },
      timeout: 4000,
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const hit = json.search?.[0];
          resolve(hit ? { id: hit.id, label: hit.label, description: hit.description || null } : null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// Strip HTML to plain text
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

// Extract entities + topics from a page via Claude Haiku
async function extractEntities(text, label) {
  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Extract the key entities and topics from this content. Return ONLY a JSON array of strings — named entities, technical terms, concepts, statistics, key phrases that are specific and meaningful (not generic words).

Max 25 items. No markdown, just the JSON array.

Content (${label}):
${text}`
      }]
    });
    const raw = msg.content[0].text.trim().replace(/^```json\n?|^```\n?|\n?```$/g, '').trim();
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function analyzeEntityGap(clientUrl, keyword, competitorUrls = []) {
  // Auto-discover competitors via Bing if none provided
  let resolvedCompetitors = competitorUrls.slice(0, 3);
  if (resolvedCompetitors.length === 0) {
    resolvedCompetitors = await googleSearchCompetitors(keyword);
    if (resolvedCompetitors.length === 0) {
      throw new Error('Could not auto-discover competitors. Pass competitorUrls manually or configure GOOGLE_CSE_API_KEY + GOOGLE_CSE_ID.');
    }
  }

  // Fetch all pages in parallel
  const allUrls = [clientUrl, ...resolvedCompetitors];
  const fetched = await Promise.allSettled(allUrls.map(u => fetchURL(u).catch(() => null)));

  const pages = fetched.map((r, i) => ({
    url: allUrls[i],
    text: r.status === 'fulfilled' && r.value ? htmlToText(r.value) : null,
    isClient: i === 0,
  })).filter(p => p.text);

  if (!pages[0]?.isClient) {
    throw new Error('Could not fetch client URL');
  }

  // Extract entities from all pages + get Google suggestions in parallel
  const [suggestions, ...entityArrays] = await Promise.all([
    getGoogleSuggestions(keyword),
    ...pages.map(p => extractEntities(p.text, p.isClient ? 'client page' : 'competitor')),
  ]);

  const clientEntities = new Set((entityArrays[0] || []).map(e => e.toLowerCase()));
  const competitorEntities = new Map();

  // Count how many competitors mention each entity
  for (let i = 1; i < entityArrays.length; i++) {
    for (const entity of (entityArrays[i] || [])) {
      const key = entity.toLowerCase();
      competitorEntities.set(key, {
        entity,
        count: (competitorEntities.get(key)?.count || 0) + 1,
        presentInClient: clientEntities.has(key),
      });
    }
  }

  // Entities competitors have but client doesn't — sorted by frequency
  const gaps = [...competitorEntities.values()]
    .filter(e => !e.presentInClient)
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  // Entities client has that competitors don't (unique advantage)
  const advantages = [...clientEntities]
    .filter(e => !competitorEntities.has(e))
    .slice(0, 10)
    .map(e => entityArrays[0].find(x => x.toLowerCase() === e) || e);

  const totalCompetitors = pages.length - 1;
  const criticalGaps = gaps.filter(g => g.count === totalCompetitors);
  const informationGainScore = Math.max(0, 100 - Math.round((gaps.length / Math.max(1, gaps.length + clientEntities.size)) * 100));

  // Wikidata grounding for critical gaps — gives each entity a canonical knowledge-graph ID
  // Only look up critical gaps (present in ALL competitors) to keep latency low
  const criticalToGround = criticalGaps.slice(0, 6);
  const wikidataResults = await Promise.all(
    criticalToGround.map(g => wikidataLookup(g.entity).catch(() => null))
  );
  const wikidataMap = new Map();
  criticalToGround.forEach((g, i) => {
    if (wikidataResults[i]) wikidataMap.set(g.entity.toLowerCase(), wikidataResults[i]);
  });

  // Build Schema.org injection code for Wikidata-grounded entities
  function buildInjection(entity, wikidata) {
    if (!wikidata?.id) return null;
    return {
      schema_markup: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Thing',
        'name': wikidata.label || entity,
        'description': wikidata.description || entity,
        'sameAs': `https://www.wikidata.org/wiki/${wikidata.id}`,
      }, null, 2),
      inline_html: `<span itemscope itemtype="https://schema.org/Thing" itemid="https://www.wikidata.org/wiki/${wikidata.id}">${wikidata.label || entity}</span>`,
      wikidata_url: `https://www.wikidata.org/wiki/${wikidata.id}`,
      instruction: `Add schema_markup to your page JSON-LD OR wrap inline mentions with inline_html. Entity ID: ${wikidata.id}`,
    };
  }

  return {
    keyword,
    client_url: clientUrl,
    competitors_analyzed: totalCompetitors,
    information_gain_score: informationGainScore,
    verdict: criticalGaps.length === 0 ? 'competitive' : criticalGaps.length <= 3 ? 'gaps_found' : 'significant_gaps',
    entity_gaps: gaps.map(g => {
      const wikidata = wikidataMap.get(g.entity.toLowerCase()) || null;
      const isBlocking = g.count === totalCompetitors;
      return {
        entity: g.entity,
        missing_from_client: true,
        competitor_coverage: `${g.count}/${totalCompetitors} competitors`,
        priority: isBlocking ? 'critical' : 'recommended',
        enforcement: isBlocking ? 'BLOCKING' : 'RECOMMENDED',
        verdict: isBlocking
          ? `BLOCKING — "${g.entity}" absent from your content, present in all ${totalCompetitors} ranking pages. Must add before publishing.`
          : `RECOMMENDED — "${g.entity}" found in ${g.count}/${totalCompetitors} competitor pages.`,
        wikidata,
        injection: buildInjection(g.entity, wikidata),
      };
    }),
    client_advantages: advantages,
    related_searches: suggestions,
    client_entities_found: entityArrays[0]?.length || 0,
    blocking_count: criticalGaps.length,
    action: criticalGaps.length > 0
      ? `BLOCKING: ${criticalGaps.length} entity gap(s) prevent competitive ranking. Add: ${criticalGaps.map(g => g.entity).join(', ')}`
      : 'No blocking entity gaps. Content entity coverage is competitive.',
  };
}
