/**
 * Backlinks lib — OpenPageRank API wrapper.
 * Free tier: 100 requests/day. API key in OPENPR_API_KEY env var.
 *
 * Returns: { domain, pageRank (0-10), domainRank, status, source }
 * Caches per domain for 24 hours (scores change slowly).
 */

const cache = new Map(); // domain → { data, expiresAt }
const TTL   = 86_400_000; // 24 hours

export async function getBacklinkData(url) {
  let domain;
  try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }

  const cached = cache.get(domain);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  const apiKey = process.env.OPENPR_API_KEY;
  if (!apiKey) return null;

  try {
    const endpoint = `https://openpagerank.com/api/v1.0/getPageRank?domains%5B0%5D=${encodeURIComponent(domain)}`;
    const resp = await fetch(endpoint, {
      headers: { 'API-OPR': apiKey, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) return null;
    const json = await resp.json();
    const d = json?.response?.[0];
    if (!d) return null;

    const isFound = d.status_code === 200;
    const data = {
      domain,
      pageRank: isFound ? (d.page_rank_integer ?? null) : null,  // null if domain not in DB
      pageRankDecimal: isFound ? (d.page_rank_decimal ?? null) : null,
      domainRank: d.rank ?? null,
      status: isFound ? 'ok' : 'not_found',
      source: 'OpenPageRank',
    };

    cache.set(domain, { data, expiresAt: Date.now() + TTL });
    return data;
  } catch {
    return null;
  }
}
