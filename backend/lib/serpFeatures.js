/**
 * SERP Feature Detection — DataForSEO Live API
 * Detects: AI Overview, featured snippet, PAA, knowledge panel, local pack
 * Cost: ~$0.0006 per call (live mode). Only called when keyword is provided.
 *
 * Returns: { keyword, features: [], target_position, people_also_ask: [], source }
 */

const BASE_URL = 'https://api.dataforseo.com/v3/serp/google/organic/live/advanced';

function getAuth() {
  const login = process.env.DATAFORSEO_LOGIN;
  const pass  = process.env.DATAFORSEO_PASSWORD;
  if (!login || !pass) return null;
  return 'Basic ' + Buffer.from(`${login}:${pass}`).toString('base64');
}

// Map DataForSEO item_types to human-readable feature names
const FEATURE_MAP = {
  ai_overview:         'AI Overview',
  featured_snippet:    'Featured Snippet',
  people_also_ask:     'People Also Ask',
  knowledge_graph:     'Knowledge Panel',
  local_pack:          'Local Pack',
  shopping:            'Shopping Results',
  video:               'Video Carousel',
  image_pack:          'Image Pack',
  top_stories:         'Top Stories',
  answer_box:          'Answer Box',
};

export async function getSerpFeatures(keyword, targetDomain = null) {
  const auth = getAuth();
  if (!auth) return null;

  try {
    const resp = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{
        keyword,
        location_code: 2840,   // United States — change per user locale later
        language_code: 'en',
        device: 'desktop',
        depth: 10,             // top 10 results only — minimal cost
      }]),
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) return null;
    const json = await resp.json();
    const task = json?.tasks?.[0];
    if (task?.status_code !== 20000) return null;

    const result = task?.result?.[0];
    if (!result) return null;

    // Extract SERP feature types present on the page
    const itemTypes = new Set(result.item_types || []);
    const features = [...itemTypes]
      .filter(t => FEATURE_MAP[t])
      .map(t => ({ type: t, label: FEATURE_MAP[t] }));

    // Extract PAA questions
    const paaItems = (result.items || []).filter(i => i.type === 'people_also_ask');
    const peopleAlsoAsk = paaItems.flatMap(i => (i.items || []).map(q => q.title)).slice(0, 8);

    // Find target domain position if provided
    let targetPosition = null;
    if (targetDomain) {
      const organic = (result.items || []).filter(i => i.type === 'organic');
      const match = organic.find(i => (i.domain || '').includes(targetDomain));
      if (match) targetPosition = match.rank_absolute;
    }

    return {
      keyword,
      features,                 // e.g. [{ type: 'ai_overview', label: 'AI Overview' }]
      target_position: targetPosition,
      people_also_ask: peopleAlsoAsk,
      total_results: result.se_results_count ?? null,
      source: 'DataForSEO',
    };
  } catch {
    return null;
  }
}
