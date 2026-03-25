/**
 * API Key Middleware - Authentication and rate limiting
 * Supports JWT (existing users) and API key auth (public API)
 */

import crypto from 'crypto';

// In-memory rate limiter (stores requests per key)
const rateLimiter = new Map(); // apiKey -> { requests: [], daily: { requests: [], date } }

// Tier configurations
const TIERS = {
  free: {
    name: 'Free',
    rateLimit: { perMinute: 10, perDay: 100 },
    features: {
      audit: true,
      crawl: false,
      geoGrid: false,
      keywords: true,
      localSeo: true,
      schema: true,
      competitors: true,
      chat: true,
      fixes: true,
    },
  },
  pro: {
    name: 'Pro',
    rateLimit: { perMinute: 60, perDay: 1000 },
    features: {
      audit: true,
      crawl: true,
      geoGrid: true,
      keywords: true,
      localSeo: true,
      schema: true,
      competitors: true,
      chat: true,
      fixes: true,
    },
  },
  agency: {
    name: 'Agency',
    rateLimit: { perMinute: 200, perDay: 999999 },
    features: {
      audit: true,
      crawl: true,
      geoGrid: true,
      keywords: true,
      localSeo: true,
      schema: true,
      competitors: true,
      chat: true,
      fixes: true,
      whiteLabel: true,
    },
  },
};

// Hash API key for storage
export function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

// Generate new API key (32-char hex)
export function generateApiKey() {
  return crypto.randomBytes(16).toString('hex');
}

// Check rate limits
function checkRateLimit(apiKey, tier, now = Date.now()) {
  const limits = TIERS[tier || 'free'].rateLimit;
  const record = rateLimiter.get(apiKey) || { requests: [], daily: { requests: [], date: new Date().toDateString() } };

  // Clean old requests (older than 1 minute)
  record.requests = record.requests.filter(ts => now - ts < 60000);

  // Check per-minute limit
  if (record.requests.length >= limits.perMinute) {
    return {
      allowed: false,
      reason: `Rate limit exceeded: ${limits.perMinute} requests per minute`,
    };
  }

  // Check daily limit
  const today = new Date().toDateString();
  if (record.daily.date !== today) {
    record.daily = { requests: [], date: today };
  }

  if (record.daily.requests.length >= limits.perDay) {
    return {
      allowed: false,
      reason: `Daily limit exceeded: ${limits.perDay} requests per day`,
    };
  }

  // Record this request
  record.requests.push(now);
  record.daily.requests.push(now);
  rateLimiter.set(apiKey, record);

  return {
    allowed: true,
    remaining: {
      perMinute: limits.perMinute - record.requests.length,
      perDay: limits.perDay - record.daily.requests.length,
    },
  };
}

// Middleware: authenticate and set rate limits
export function apiKeyAuth(supabase) {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_API_KEY',
          message: 'API key required. Get yours at https://naraseo.ai/dashboard',
          docs: 'https://naraseo.ai/docs.html#auth',
        },
      });
    }

    const token = authHeader.slice(7);

    // No Supabase — treat all tokens as free tier
    if (!supabase) {
      req.apiKey = token;
      req.tier = 'free';
      req.user = null;
      return next();
    }

    // Try JWT first (existing users)
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data.user) {
        req.user = data.user;
        req.apiKey = null; // JWT auth, not API key
        req.tier = data.user.user_metadata?.tier || 'free';
        return next();
      }
    } catch (e) {
      // Not a JWT, try API key
    }

    // Try API key lookup
    try {
      const hashedKey = hashApiKey(token);
      const { data: keyRecord, error } = await supabase
        .from('api_keys')
        .select('user_id, tier, active')
        .eq('key_hash', hashedKey)
        .single();

      if (error || !keyRecord || !keyRecord.active) {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_API_KEY', message: 'Invalid or inactive API key' },
        });
      }

      req.apiKey = token;
      req.tier = keyRecord.tier || 'free';

      // Get user info
      const { data: userData } = await supabase
        .from('users')
        .select('id, email')
        .eq('id', keyRecord.user_id)
        .single();

      req.user = userData;
      return next();
    } catch (e) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_ERROR', message: 'Authentication failed' },
      });
    }
  };
}

// Middleware: check rate limits
export function rateLimitMiddleware(req, res, next) {
  const apiKeyOrId = req.apiKey || req.user?.id || req.ip;
  const rateCheck = checkRateLimit(apiKeyOrId, req.tier);

  res.set('X-RateLimit-Limit', TIERS[req.tier].rateLimit.perMinute.toString());
  res.set('X-RateLimit-Remaining', (rateCheck.remaining?.perMinute || 0).toString());

  if (!rateCheck.allowed) {
    return res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMITED', message: rateCheck.reason },
    });
  }

  next();
}

// Middleware: check feature access
export function featureAccess(feature) {
  return (req, res, next) => {
    const tier = req.tier || 'free';
    const allowed = TIERS[tier].features[feature];

    if (!allowed) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FEATURE_UNAVAILABLE',
          message: `Feature '${feature}' not available on ${TIERS[tier].name} tier`,
          requiredTier: tier === 'free' ? 'Pro' : 'Agency',
        },
      });
    }

    next();
  };
}

// Middleware: apply white-label headers for Agency tier
export function whiteLabelHeaders(req, res, next) {
  if (req.tier === 'agency') {
    const brand = req.headers['x-brand'];
    if (brand) {
      res.setHeader('X-Powered-By', brand);
      res.setHeader('X-Brand', brand);
    }
  }
  next();
}

// Helper: format standard API response
export function sendApiResponse(res, data, statusCode = 200, requestId = null) {
  return res.status(statusCode).json({
    success: statusCode < 400,
    data,
    meta: {
      requestId: requestId || `req_${crypto.randomBytes(6).toString('hex')}`,
      version: '1.0',
      timestamp: new Date().toISOString(),
    },
  });
}

// Helper: format error response
export function sendApiError(res, code, message, statusCode = 400, details = {}) {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...details,
    },
  });
}

export default {
  apiKeyAuth,
  rateLimitMiddleware,
  featureAccess,
  whiteLabelHeaders,
  generateApiKey,
  hashApiKey,
  sendApiResponse,
  sendApiError,
  TIERS,
};
