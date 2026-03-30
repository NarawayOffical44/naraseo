/**
 * Naraseo SDK
 * npm install naraseo
 *
 * Usage:
 *   import { naraseo } from 'naraseo';
 *   const client = naraseo({ apiKey: 'nrs_...' });
 *
 *   // Verify AI content before publishing
 *   const result = await client.verify('Your AI-generated content here...');
 *   if (!result.publishable) console.log(result.fix_before_publishing);
 *
 *   // Full SEO audit
 *   const audit = await client.audit('https://yoursite.com');
 *   console.log(audit.score, audit.fixes);
 *
 *   // Find what topics competitors cover that you don't
 *   const gaps = await client.entityGap({
 *     url: 'https://yoursite.com/page',
 *     keyword: 'best seo tools',
 *     competitorUrls: ['https://competitor.com']
 *   });
 */

const BASE_URL = 'https://naraseoai.onrender.com/api/v1';

class NaraseoClient {
  #apiKey;
  #baseUrl;

  constructor({ apiKey, baseUrl } = {}) {
    this.#apiKey = apiKey || null;
    this.#baseUrl = baseUrl || BASE_URL;
  }

  async #post(path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.#apiKey) headers['Authorization'] = `Bearer ${this.#apiKey}`;

    const res = await fetch(`${this.#baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (!json.success) {
      const err = new Error(json.error?.message || `Naraseo API error: ${res.status}`);
      err.code = json.error?.code;
      err.status = res.status;
      throw err;
    }
    return json.data;
  }

  async #get(path) {
    const headers = {};
    if (this.#apiKey) headers['Authorization'] = `Bearer ${this.#apiKey}`;
    const res = await fetch(`${this.#baseUrl}${path}`, { headers });
    const json = await res.json();
    if (!json.success) {
      const err = new Error(json.error?.message || `Naraseo API error: ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return json.data;
  }

  /**
   * Verify AI-generated content for hallucinations and E-E-A-T signals.
   * Returns publishable verdict + certificate_id as proof of verification.
   * @param {string} content - Text to verify (50–10,000 chars)
   * @param {string} [url] - Optional source URL
   * @returns {{ certificate_id, publishable, summary, flagged_claims, eeat, fix_before_publishing }}
   */
  async verify(content, url) {
    return this.#post('/verify', { content, ...(url && { url }) });
  }

  /**
   * Retrieve a Certificate of Accuracy by ID.
   * @param {string} certificateId - cert_xxxx returned by verify()
   */
  async getCertificate(certificateId) {
    return this.#get(`/verify/${certificateId}`);
  }

  /**
   * Full SEO audit of a URL.
   * Returns score, grade, issues, actionable fixes[], and GEO readiness.
   * @param {string} url
   * @returns {{ score, grade, fixes, geo, issues, pageData, coreWebVitals }}
   */
  async audit(url) {
    return this.#post('/audit', { url });
  }

  /**
   * Find what topics/entities competitors cover that your page is missing.
   * @param {{ url, keyword, competitorUrls? }} options
   * @returns {{ information_gain_score, entity_gaps, client_advantages, action }}
   */
  async entityGap({ url, keyword, competitorUrls = [] }) {
    return this.#post('/entity-gap', { url, keyword, competitorUrls });
  }

  /**
   * Industry-aware hallucination risk audit.
   * Detects medical dosages, financial guarantees, legal claims.
   * @param {string} content
   * @param {'medical'|'legal'|'financial'|'general'} [industry]
   * @returns {{ publishable, risk_level, risk_score, legal_risk_signals, fix_before_publishing }}
   */
  async riskAudit(content, industry) {
    return this.#post('/audit/risk', { content, ...(industry && { industry }) });
  }

  /**
   * Keyword research from page content.
   * @param {string} url
   */
  async keywords(url) {
    return this.#post('/keywords', { url });
  }

  /**
   * Validate all JSON-LD structured data on a page.
   * @param {string} url
   */
  async validateSchema(url) {
    return this.#post('/schema/validate', { url });
  }

  /**
   * Crawl an entire website. Pro/Agency tier required.
   * @param {string} url
   * @param {{ maxPages?, maxDepth? }} [options]
   */
  async crawl(url, { maxPages = 50, maxDepth = 2 } = {}) {
    return this.#post('/crawl', { url, maxPages, maxDepth });
  }

  /**
   * Competitor analysis vs 1–5 competitor URLs.
   * @param {string} url
   * @param {string[]} competitorUrls
   */
  async competitors(url, competitorUrls) {
    return this.#post('/competitors', { url, competitorUrls });
  }
}

/**
 * Create a Naraseo client.
 * @param {{ apiKey?: string, baseUrl?: string }} options
 */
export function naraseo(options = {}) {
  return new NaraseoClient(options);
}

// Default export for CommonJS-style usage
export default naraseo;
