/**
 * History lib — Supabase persistence for audits and rank snapshots.
 * Tables required (create in Supabase dashboard):
 *
 *   audits
 *     id          text primary key
 *     url         text not null
 *     domain      text
 *     user_id     text
 *     score       int
 *     grade       text
 *     data        jsonb
 *     created_at  timestamptz default now()
 *
 *   rank_snapshots
 *     id          uuid default gen_random_uuid() primary key
 *     url         text not null
 *     domain      text
 *     keyword     text not null
 *     user_id     text
 *     avg_rank    numeric
 *     coverage    numeric
 *     grid_size   int
 *     points      jsonb
 *     created_at  timestamptz default now()
 */

/**
 * Save an audit result. Returns the saved record or null on failure.
 * Silently no-ops if Supabase is not configured (DEMO_MODE / missing URL).
 */
export async function saveAudit(supabase, { id, url, score, grade, data, report_json, userId }) {
  if (!supabase) return null;
  try {
    let hostname;
    try { hostname = new URL(url).hostname; } catch { hostname = url; }

    const { data: row, error } = await supabase
      .from('audits')
      .insert({ id, url, hostname, user_id: userId || null, score, grade, report_json: report_json || data })
      .select()
      .single();

    if (error) {
      // Table may not exist yet — log but don't crash
      if (error.code !== 'PGRST116' && error.code !== '42P01') {
        console.error('[history] saveAudit error:', error.message);
      }
      return null;
    }
    return row;
  } catch (e) {
    console.error('[history] saveAudit exception:', e.message);
    return null;
  }
}

/**
 * Retrieve a single audit by id.
 */
export async function getAudit(supabase, id) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('audits')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Get audit history for a URL (most recent first).
 */
export async function getAuditHistory(supabase, url, limit = 20) {
  if (!supabase) return [];
  try {
    let hostname;
    try { hostname = new URL(url).hostname; } catch { hostname = url; }

    const { data, error } = await supabase
      .from('audits')
      .select('id, url, score, grade, created_at')
      .eq('hostname', hostname)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

/**
 * Save a verification result as a Certificate of Accuracy.
 *
 * Table required (create in Supabase SQL editor):
 *   create table if not exists verifications (
 *     id text primary key,
 *     content_hash text not null,
 *     user_id text,
 *     verdict text,
 *     publishable boolean,
 *     risk_level text,
 *     flagged_count int,
 *     eeat_score int,
 *     result_json jsonb,
 *     source_url text,
 *     created_at timestamptz default now()
 *   );
 */
export async function saveVerification(supabase, { id, contentHash, userId, verdict, publishable, riskLevel, flaggedCount, eeatScore, resultJson, sourceUrl }) {
  if (!supabase) return null;
  try {
    const { data: row, error } = await supabase
      .from('verifications')
      .insert({
        id,
        content_hash: contentHash,
        user_id: userId || null,
        verdict,
        publishable: publishable ?? null,
        risk_level: riskLevel || null,
        flagged_count: flaggedCount ?? 0,
        eeat_score: eeatScore ?? null,
        result_json: resultJson,
        source_url: sourceUrl || null,
      })
      .select()
      .single();
    if (error) {
      if (error.code !== 'PGRST116' && error.code !== '42P01') {
        console.error('[history] saveVerification error:', error.message);
      }
      return null;
    }
    return row;
  } catch (e) {
    console.error('[history] saveVerification exception:', e.message);
    return null;
  }
}

/**
 * Retrieve a verification certificate by ID.
 */
export async function getVerification(supabase, id) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('verifications')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Save a geo-grid rank snapshot.
 */
export async function saveRankSnapshot(supabase, { url, keyword, userId, avgRank, coverage, gridSize, points }) {
  if (!supabase) return null;
  try {
    let hostname;
    try { hostname = new URL(url).hostname; } catch { hostname = url; }

    const { data, error } = await supabase
      .from('rank_snapshots')
      .insert({ url, hostname, keyword, user_id: userId || null, avg_rank: avgRank, coverage, grid_size: gridSize, points })
      .select()
      .single();

    if (error) {
      if (error.code !== 'PGRST116' && error.code !== '42P01') {
        console.error('[history] saveRankSnapshot error:', error.message);
      }
      return null;
    }
    return data;
  } catch (e) {
    console.error('[history] saveRankSnapshot exception:', e.message);
    return null;
  }
}

/**
 * Get rank history for a URL + keyword (most recent first).
 */
export async function getRankHistory(supabase, url, keyword, limit = 30) {
  if (!supabase) return [];
  try {
    let hostname;
    try { hostname = new URL(url).hostname; } catch { hostname = url; }

    const { data, error } = await supabase
      .from('rank_snapshots')
      .select('id, url, keyword, avg_rank, coverage, grid_size, created_at')
      .eq('hostname', hostname)
      .eq('keyword', keyword)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}
