/**
 * Risk Engine - Agency-facing Hallucination Risk Audit
 * Wraps verifyEngine + adds industry-aware high-stakes signal detection.
 *
 * Returns a publishable verdict agencies can act on immediately:
 *   publishable: false, risk_level: "do_not_publish", legal_risk_signals: [...]
 */

import { verifyClaims } from './verifyEngine.js';

// Six universal LLM failure patterns — run on ALL content regardless of industry.
// Industry context is a severity multiplier applied after detection, not a feature switch.
const RISK_PATTERNS = {
  // 1. Fabricated Specificity — precise numbers/stats with no attributed source
  fabricated_specificity: [
    { pattern: /\b\d+(\.\d+)?%\s*(of\s+\w+|users?|people|patients?|cases?|respondents?)/gi, label: 'Unattributed percentage claim', severity: 'high' },
    { pattern: /\b(studies show|research shows?|data shows?|surveys? (show|found|indicate))\b/gi, label: 'Phantom attribution', severity: 'high' },
    { pattern: /\b\d[\d,]+\s*(people|users?|customers?|patients?|cases?|companies)\b/gi, label: 'Unattributed population stat', severity: 'medium' },
  ],
  // 2. Stale Recency — LLM training cutoff presented as current fact
  stale_recency: [
    { pattern: /\b(currently|as of (today|now|\d{4})|at (present|this time)|the latest|right now|today's)\b/gi, label: 'Stale recency claim', severity: 'high' },
    { pattern: /\b(this year|in \d{4}|last (year|month|quarter))\b/gi, label: 'Time-anchored claim without source', severity: 'medium' },
  ],
  // 3. Confidence Overreach — absolute certainty for uncertain outcomes
  confidence_overreach: [
    { pattern: /\b(guaranteed|100%\s*(effective|safe|accurate|success)|will always|will never|proven to (cure|prevent|fix|eliminate))\b/gi, label: 'Absolute guarantee', severity: 'critical' },
    { pattern: /\b(no side effects?|risk.free|completely safe|zero risk|harmless)\b/gi, label: 'Risk elimination claim', severity: 'critical' },
    { pattern: /\b(double your|10x your)\b/gi, label: 'Outcome guarantee', severity: 'critical' },
  ],
  // 4. Authority Fabrication — cites non-existent or unverifiable institutions
  authority_fabrication: [
    { pattern: /\baccording to\s+(the\s+)?(latest|recent|new|a \d{4})?\s*(study|research|report|survey)\b/gi, label: 'Uncited authority reference', severity: 'high' },
    { pattern: /\b(experts (say|agree|recommend|warn)|scientists (say|found|discovered)|doctors (say|recommend))\b/gi, label: 'Vague expert attribution', severity: 'medium' },
    { pattern: /\b(FDA.approved|clinically proven|scientifically validated|peer.reviewed)\b/gi, label: 'Unverified approval claim', severity: 'critical' },
  ],
  // 5. High-Stakes Specificity — numeric precision that could cause direct harm
  high_stakes_specificity: [
    { pattern: /\b\d+\s*(mg|ml|mcg|g|IU|units?)\b/gi, label: 'Numeric dosage/measurement', severity: 'critical' },
    { pattern: /\b(take \d+|dosage of|dose:|administer)\b/gi, label: 'Dosage instruction', severity: 'critical' },
    { pattern: /\b(not liable|no liability|waive[sd]? your rights?)\b/gi, label: 'Liability waiver claim', severity: 'critical' },
    { pattern: /\b(avoid tax|eliminate tax|tax.free income)\b/gi, label: 'Tax avoidance claim', severity: 'critical' },
  ],
  // 6. Urgency Manipulation — pressure tactics that override rational decision-making
  urgency_manipulation: [
    { pattern: /\b(act now|limited time|don.t miss|last chance|only \d+ left)\b/gi, label: 'Artificial urgency', severity: 'medium' },
    { pattern: /\b(invest (now|today|immediately)|buy (now|today))\b/gi, label: 'High-pressure CTA', severity: 'high' },
  ],
};

// Detect high-stakes domain context — used as severity multiplier, not feature switch
// Any content still gets all 6 pattern checks; this only upgrades severity for known high-risk domains
const HIGH_STAKES_DOMAINS = {
  medical:   ['patient', 'symptom', 'treatment', 'medication', 'doctor', 'diagnosis', 'dosage', 'clinical', 'prescription', 'therapy'],
  legal:     ['attorney', 'lawyer', 'lawsuit', 'legal', 'court', 'jurisdiction', 'statute', 'liable', 'contract', 'regulation'],
  financial: ['investment', 'portfolio', 'return', 'profit', 'revenue', 'financial', 'stock', 'crypto', 'interest rate', 'yield'],
};

function detectIndustry(content) {
  const lower = content.toLowerCase();
  const scores = Object.fromEntries(
    Object.entries(HIGH_STAKES_DOMAINS).map(([domain, words]) => [
      domain, words.filter(w => lower.includes(w)).length,
    ])
  );
  const max = Math.max(...Object.values(scores));
  return max === 0 ? 'general' : Object.keys(scores).find(k => scores[k] === max);
}

// Severity upgrade table: in high-stakes domains, medium → high, high → critical
const SEVERITY_UPGRADE = {
  medical:   { medium: 'high', high: 'critical' },
  legal:     { medium: 'high', high: 'critical' },
  financial: { medium: 'high', high: 'critical' },
};

// Scan ALL content against all 6 universal patterns.
// Industry context upgrades severity — it does not gate which patterns run.
function scanHighRiskSignals(content, industry) {
  const upgrade = SEVERITY_UPGRADE[industry] || {};
  const allPatterns = Object.values(RISK_PATTERNS).flat();
  const signals = [];

  for (const { pattern, label, severity } of allPatterns) {
    const matches = [...content.matchAll(pattern)];
    for (const match of matches.slice(0, 2)) { // cap at 2 matches per pattern
      signals.push({
        type: label,
        text: match[0],
        severity: upgrade[severity] || severity,
        context: content.slice(Math.max(0, match.index - 40), match.index + match[0].length + 40).trim(),
      });
    }
    pattern.lastIndex = 0; // reset stateful regex
  }

  return signals;
}

// Compute overall risk level from signals + verify results
function computeRiskLevel(legalSignals, verifyResult) {
  const criticalCount = legalSignals.filter(s => s.severity === 'critical').length;
  const highCount = legalSignals.filter(s => s.severity === 'high').length;
  const flaggedClaims = verifyResult.summary.flagged;
  const verifyVerdict = verifyResult.summary.verdict;

  if (criticalCount >= 1 || verifyVerdict === 'high_risk') return 'do_not_publish';
  if (highCount >= 2 || flaggedClaims >= 3 || verifyVerdict === 'review_needed') return 'review_required';
  return 'safe';
}

// Generate concrete fix instructions
function generateFixes(legalSignals, flaggedClaims, industry) {
  const fixes = [];

  for (const signal of legalSignals.slice(0, 5)) {
    fixes.push(
      signal.severity === 'critical'
        ? `REMOVE or get legal sign-off: "${signal.text}" — ${signal.type}`
        : `QUALIFY: "${signal.text}" — add source or disclaimer for ${signal.type}`
    );
  }

  for (const claim of flaggedClaims.slice(0, 3)) {
    if (claim.status === 'unverified') {
      fixes.push(`VERIFY or REMOVE: "${claim.claim}" — could not confirm against any source`);
    } else if (claim.status === 'needs_review') {
      fixes.push(`REVIEW: "${claim.claim}" — ${claim.reason}`);
    }
  }

  if (fixes.length === 0) fixes.push('No critical fixes required. Content passed risk screening.');
  return fixes;
}

export async function analyzeRisk(content, industry = null) {
  const detectedIndustry = industry || detectIndustry(content);

  // Run claim verification (with industry for drift index) and pattern scan in parallel
  const [verifyResult, legalSignals] = await Promise.all([
    verifyClaims(content, { industry: detectedIndustry }),
    Promise.resolve(scanHighRiskSignals(content, detectedIndustry)),
  ]);

  const riskLevel = computeRiskLevel(legalSignals, verifyResult);
  const riskScore = Math.min(100,
    (legalSignals.filter(s => s.severity === 'critical').length * 35) +
    (legalSignals.filter(s => s.severity === 'high').length * 20) +
    (legalSignals.filter(s => s.severity === 'medium').length * 10) +
    (verifyResult.summary.flagged * 8)
  );

  const publishable = riskLevel === 'safe';

  const verdictText = {
    safe: `Content passed risk screening. ${verifyResult.summary.total_claims} claims analysed, ${verifyResult.summary.flagged} flagged. Safe to publish.`,
    review_required: `${legalSignals.filter(s => ['critical', 'high'].includes(s.severity)).length + verifyResult.summary.flagged} issues require human review before publishing.`,
    do_not_publish: `${legalSignals.filter(s => s.severity === 'critical').length} critical risk signal(s) detected (${detectedIndustry} domain). Do not publish without legal/compliance review.`,
  }[riskLevel];

  return {
    publishable,
    risk_level: riskLevel,
    risk_score: riskScore,
    industry_detected: detectedIndustry,
    verdict_text: verdictText,
    drift_index: verifyResult.drift_index,
    legal_risk_signals: legalSignals,
    schema_conflicts: verifyResult.schema_conflicts,
    flagged_claims: verifyResult.flagged_claims,
    eeat: verifyResult.eeat,
    fix_before_publishing: generateFixes(legalSignals, verifyResult.flagged_claims, detectedIndustry),
    summary: {
      total_claims: verifyResult.summary.total_claims,
      flagged_claims: verifyResult.summary.flagged,
      legal_signals_found: legalSignals.length,
      critical_signals: legalSignals.filter(s => s.severity === 'critical').length,
      schema_conflicts: verifyResult.schema_conflicts.length,
      eeat_score: verifyResult.eeat.score,
      eeat_grade: verifyResult.eeat.grade,
    },
  };
}
