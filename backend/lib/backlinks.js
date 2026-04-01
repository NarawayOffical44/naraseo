/**
 * Backlinks lib — OpenPageRank API + RDAP domain age.
 * OpenPageRank free tier: 100 requests/day. API key in OPENPR_API_KEY env var.
 * RDAP: no key required (IANA standard, public JSON API).
 *
 * Returns: { domain, pageRank, domainRank, domain_age, registration_date, status, source }
 * Caches per domain for 24 hours (scores change slowly).
 */

const cache = new Map(); // domain → { data, expiresAt }
const TTL   = 86_400_000; // 24 hours

// RDAP — no API key, returns domain registration date as ISO string or null
async function getDomainAge(domain) {
  try {
    const resp = await fetch(`https://rdap.org/domain/${domain}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    // events array contains 'registration', 'expiration', 'last changed'
    const regEvent = json?.events?.find(e => e.eventAction === 'registration');
    if (!regEvent?.eventDate) return null;
    const regDate = new Date(regEvent.eventDate);
    const ageYears = ((Date.now() - regDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1);
    return { registration_date: regDate.toISOString().split('T')[0], age_years: parseFloat(ageYears) };
  } catch {
    return null;
  }
}

export async function getBacklinkData(url) {
  let domain;
  try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }

  const cached = cache.get(domain);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  const apiKey = process.env.OPENPR_API_KEY;

  // Run OpenPageRank + RDAP in parallel — both optional, either can fail gracefully
  const [opr, rdap] = await Promise.allSettled([
    apiKey
      ? fetch(`https://openpagerank.com/api/v1.0/getPageRank?domains%5B0%5D=${encodeURIComponent(domain)}`, {
          headers: { 'API-OPR': apiKey, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(8000),
        }).then(r => r.ok ? r.json() : null).catch(() => null)
      : Promise.resolve(null),
    getDomainAge(domain),
  ]);

  const oprJson = opr.status === 'fulfilled' ? opr.value : null;
  const rdapData = rdap.status === 'fulfilled' ? rdap.value : null;

  const d = oprJson?.response?.[0];
  const isFound = d?.status_code === 200;

  const data = {
    domain,
    pageRank: (d && isFound) ? (d.page_rank_integer ?? null) : null,
    pageRankDecimal: (d && isFound) ? (d.page_rank_decimal ?? null) : null,
    domainRank: d?.rank ?? null,
    domain_age: rdapData ?? null,   // { registration_date, age_years } or null
    status: d ? (isFound ? 'ok' : 'not_found') : 'no_key',
    source: 'OpenPageRank + RDAP',
  };

  cache.set(domain, { data, expiresAt: Date.now() + TTL });
  return data;
}
