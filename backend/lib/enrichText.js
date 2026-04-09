/**
 * Enrich Text - Transform raw content into verified, sourced content
 * Takes original text + verification results → returns text with inline sources + badges
 * Makes naraseo seamless: user sees one output, not separate report
 */

export function enrichText(originalText, verifyResult) {
  if (!verifyResult) return originalText;

  let enriched = originalText;
  const { flagged_claims = [], safe_claims = [], suggestions = {} } = verifyResult;
  const corrections = suggestions.corrections || [];

  // Sort by claim length (longest first) to avoid partial replacements
  const allClaims = [...flagged_claims, ...safe_claims].sort((a, b) =>
    (b.claim?.length || 0) - (a.claim?.length || 0)
  );

  // Step 1: Suggestions first (before badge embedding to avoid regex conflicts)
  corrections.forEach(correction => {
    if (!correction.original) return;
    const regex = new RegExp(`\\b${escapeRegex(correction.original)}\\b`, 'gi');
    enriched = enriched.replace(regex, `${correction.original} [SUGGESTION: change to "${correction.suggestion}"]`);
  });

  // Step 2: Embed sources + badges for each claim
  allClaims.forEach(claim => {
    if (!claim.claim) return;

    const badge = getBadge(claim);
    const sources = buildSourceString(claim);
    const replacement = sources
      ? `${claim.claim} ${badge} [${sources}]`
      : `${claim.claim} ${badge}`;

    // Case-insensitive replacement (preserve original casing in text)
    const regex = new RegExp(`\\b${escapeRegex(claim.claim)}\\b`, 'gi');
    enriched = enriched.replace(regex, replacement);
  });

  return enriched;
}

/**
 * Get badge emoji/label based on claim status
 */
function getBadge(claim) {
  switch (claim.status) {
    case 'verifiable':
    case 'likely_safe':
      return '✅';
    case 'needs_review':
      return '⚠️';
    case 'unverified':
      return '❓';
    case 'contradicted':
      return '🔴';
    case 'opinion':
      return '💭';
    default:
      return '';
  }
}

/**
 * Build inline source string from claim's verification data
 */
function buildSourceString(claim) {
  const sources = [];

  if (claim.wiki_title) {
    sources.push(`Wikipedia: ${claim.wiki_title}`);
  }
  if (claim.wikidata?.label) {
    sources.push(`Wikidata: ${claim.wikidata.label}`);
  }
  if (claim.scholarly_evidence?.url) {
    sources.push(`OpenAlex: ${claim.scholarly_evidence.title || 'Academic Paper'}`);
  }
  if (claim.crossref?.doi) {
    sources.push(`Crossref: ${claim.crossref.title || 'Citation'}`);
  }
  if (claim.news_source) {
    sources.push(`News: ${claim.news_source}`);
  }

  return sources.slice(0, 3).join(' | '); // Max 3 sources per claim
}

/**
 * Escape string for use in RegExp
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generate markdown-formatted enriched content
 * For APIs returning structured markdown instead of inline text
 */
export function enrichTextMarkdown(originalText, verifyResult) {
  if (!verifyResult) return originalText;

  const { flagged_claims = [], safe_claims = [], suggestions = {}, summary = {} } = verifyResult;
  const corrections = suggestions.corrections || [];

  let markdown = `# Content Verification Report\n\n`;

  // Header with verdict
  const verdict = summary.verdict || 'unknown';
  const verdictEmoji = verdict === 'clean' ? '✅' : verdict === 'review_needed' ? '⚠️' : '🔴';
  markdown += `${verdictEmoji} **Verdict**: ${verdict.toUpperCase()}\n`;
  markdown += `- Safe claims: ${safe_claims.length}\n`;
  markdown += `- Flagged claims: ${flagged_claims.length}\n`;
  markdown += `- Suggestions: ${corrections.length}\n\n`;

  // Original content
  markdown += `## Original Content\n\n${originalText}\n\n`;

  // Flagged claims with sources
  if (flagged_claims.length > 0) {
    markdown += `## ⚠️ Flagged Claims\n\n`;
    flagged_claims.forEach(claim => {
      const sources = buildSourceString(claim);
      markdown += `- **"${claim.claim}"**\n`;
      markdown += `  - Status: ${claim.status}\n`;
      if (sources) markdown += `  - Sources: ${sources}\n`;
      if (claim.correct_value) markdown += `  - Correction: "${claim.correct_value}"\n`;
      markdown += '\n';
    });
  }

  // Safe claims (optional)
  if (safe_claims.length > 0 && safe_claims.length < 10) {
    markdown += `## ✅ Verified Claims\n\n`;
    safe_claims.forEach(claim => {
      const sources = buildSourceString(claim);
      markdown += `- "${claim.claim}"`;
      if (sources) markdown += ` (${sources})`;
      markdown += '\n';
    });
    markdown += '\n';
  }

  // Suggestions
  if (corrections.length > 0) {
    markdown += `## 💡 Suggested Corrections\n\n`;
    markdown += `| Original | Suggestion | Confidence | Reason |\n`;
    markdown += `|----------|------------|------------|--------|\n`;
    corrections.forEach(correction => {
      markdown += `| ${correction.original} | ${correction.suggestion} | ${correction.confidence}% | ${correction.reason} |\n`;
    });
  }

  return markdown;
}

/**
 * Generate JSON format for API responses
 * Preserves original text + adds metadata layer
 */
export function enrichTextJSON(originalText, verifyResult) {
  if (!verifyResult) {
    return {
      text: originalText,
      verified: false,
      reason: 'No verification data',
    };
  }

  const { flagged_claims = [], safe_claims = [], suggestions = {}, summary = {}, drift_index = {} } = verifyResult;
  const corrections = suggestions.corrections || [];

  return {
    text: originalText,
    verified: summary.verdict === 'clean',
    verdict: {
      status: summary.verdict,
      risk_score: summary.risk_score,
      confidence: 100 - summary.risk_score,
    },
    claims: {
      total: summary.total_claims,
      safe: safe_claims.length,
      flagged: flagged_claims.length,
      details: {
        safe: safe_claims.map(c => ({
          text: c.claim,
          status: c.status,
          sources: buildSourceList(c),
        })),
        flagged: flagged_claims.map(c => ({
          text: c.claim,
          status: c.status,
          sources: buildSourceList(c),
          correction: c.correct_value || null,
        })),
      },
    },
    suggestions: corrections.map(c => ({
      original: c.original,
      suggestion: c.suggestion,
      confidence: c.confidence,
      reason: c.reason,
    })),
    validity: {
      valid_until: drift_index.valid_until || null,
      days_valid: drift_index.valid_days || null,
      stability: drift_index.stability || 'unknown',
    },
  };
}

/**
 * Helper: build source array from claim
 */
function buildSourceList(claim) {
  const sources = [];

  if (claim.wiki_title) {
    sources.push({
      type: 'wikipedia',
      title: claim.wiki_title,
      url: `https://en.wikipedia.org/wiki/${claim.wiki_title.replace(/\s+/g, '_')}`,
    });
  }
  if (claim.wikidata?.url) {
    sources.push({
      type: 'wikidata',
      label: claim.wikidata.label,
      url: claim.wikidata.url,
    });
  }
  if (claim.scholarly_evidence?.url) {
    sources.push({
      type: 'scholarly',
      title: claim.scholarly_evidence.title,
      url: claim.scholarly_evidence.url,
    });
  }
  if (claim.crossref?.doi) {
    sources.push({
      type: 'crossref',
      doi: claim.crossref.doi,
      title: claim.crossref.title,
    });
  }
  if (claim.news_headline) {
    sources.push({
      type: 'news',
      headline: claim.news_headline,
      date: claim.news_date,
    });
  }

  return sources;
}
