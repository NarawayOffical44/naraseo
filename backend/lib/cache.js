/**
 * Simple in-memory cache with TTL
 * Used for Google Suggest, SERP features, PageSpeed insights
 */

class TTLCache {
  constructor(ttlMs = 3600000) { // 1 hour default
    this.cache = new Map();
    this.ttl = ttlMs;
  }

  set(key, value, ttlMs = this.ttl) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  has(key) {
    return this.get(key) !== null;
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }

  // Clean expired entries (run periodically)
  prune() {
    const now = Date.now();
    let prunedCount = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        prunedCount++;
      }
    }
    return prunedCount;
  }
}

// Global cache instances
export const googleSuggestCache = new TTLCache(1800000); // 30 minutes
export const pageSpeedCache = new TTLCache(3600000); // 1 hour
export const serpFeaturesCache = new TTLCache(86400000); // 24 hours
export const backlinksCache = new TTLCache(86400000); // 24 hours

// Prune caches every 10 minutes (garbage collection)
setInterval(() => {
  const pruned = {
    googleSuggest: googleSuggestCache.prune(),
    pageSpeed: pageSpeedCache.prune(),
    serpFeatures: serpFeaturesCache.prune(),
    backlinks: backlinksCache.prune(),
  };

  if (Object.values(pruned).some(count => count > 0)) {
    console.log('[Cache] Pruned expired entries:', pruned);
  }
}, 600000); // Every 10 minutes

export default { googleSuggestCache, pageSpeedCache, serpFeaturesCache, backlinksCache };
