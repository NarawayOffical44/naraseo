/**
 * Risk Engine - Agency-facing Hallucination Risk Audit
 * Wraps verifyEngine + adds industry-aware high-stakes signal detection.
 *
 * Returns a publishable verdict agencies can act on immediately:
 *   publishable: false, risk_level: "do_not_publish", legal_risk_signals: [...]
 */

import { verifyClaims } from './verifyEngine.js';

// High-stakes patterns per industry — deterministic, no AI needed
const RISK_PATTERNS = {
  medical: [
    { pattern: /\b\d+\s*(mg|ml|mcg|g|IU|units?)\b/gi, label: 'Numeric dosage/measurement', severity: 'critical' },
    { pattern: /\b(treat|cure|prevent|diagnose|heals?)\s+\w+/gi, label: 'Treatment or cure claim', severity: 'critical' },
    { pattern: /\b(safe|effective|clinically proven|FDA.approved)\b/gi, label: 'Safety or approval claim', severity: 'high' },
    { pattern: /\b(take \d+|dosage|dose of)\b/gi, label: 'Dosage instruction', severity: 'critical' },
    { pattern: /\b(no side effects?|risk.free|harmless)\b/gi, label: 'Safety guarantee', severity: 'critical' },
  ],
  legal: [
    { pattern: /\b(guaranteed|certain(ly)?|will win|100% success)\b/gi, label: 'Guaranteed legal outcome', severity: 'critical' },
    { pattern: /\$\d[\d,]*\s*(per hour|\/hr|flat fee|retainer)/gi, label: 'Specific fee quote', severity: 'high' },
    { pattern: /\bin [A-Z][a-z]+ (you can|it is legal|it is illegal)\b/gi, label: 'Jurisdiction-specific legal claim', severity: 'high' },
    { pattern: /\b(not liable|no liability|waive[sd]? your rights?)\b/gi, label: 'Liability waiver claim', severity: 'critical' },
    { pattern: /\b(file a lawsuit|sue|take to court) (immediately|now|today)\b/gi, label: 'Legal action instruction', severity: 'high' },
  ],
  financial: [
    { pattern: /\b(guaranteed|promise[sd]?|certain)\s+\d+%/gi, label: 'Guaranteed return percentage', severity: 'critical' },
    { pattern: /\b\d+%\s*(return|profit|gain|yield|APR|APY)\b/gi, label: 'Specific return claim', severity: 'high' },
    { pattern: /\b(invest now|buy now|don.t miss|limited time)\b/gi, label: 'Urgency investment call', severity: 'high' },
    { pattern: /\b(avoid tax|eliminate tax|tax.free income)\b/gi, label: 'Tax avoidance claim', severity: 'critical' },
    { pattern: /\b(double your money|10x|risk.free investment)\b/gi, label: 'Unrealistic return claim', severity: 'critical' },
  ],
  general: [
    { pattern: /\b(proven|scientifically proven|studies show)\b/gi, label: 'Unlinked study claim', severity: 'medium' },
    { pattern: /\b\d{4}\s*(study|research|survey|report)\b/gi, label: 'Unlinked dated study', severity: 'low' },
  ],
};

// Auto-detect industry from content if not specified
function detectIndustry(content) {
  const lower = content.toLowerCase();
  const medicalWords = ['patient', 'symptom', 'treatment', 'medication', 'doctor', 'diagnosis', 'dosage', 'clinical'];
  const legalWords = ['attorney', 'lawyer', 'lawsuit', 'legal', 'court', 'jurisdiction', 'statute', 'liable'];
  const financialWords = ['investment', 'portfolio', 'return', 'profit', 'revenue', 'financial', 'stock', 'crypto'];

  const scores = {
    medical: medicalWords.filter(w => lower.includes(w)).length,
    legal: legalWords.filter(w => lower.includes(w)).length,
    financial: financialWords.filter(w => lower.includes(w)).length,
  };

  const max = Math.max(...Object.values(scores));
  if (max === 0) return 'general';
  return Object.keys(scores).find(k => scores[k] === max);
}

// Scan content for high-stakes patterns
function scanHighRiskSignals(content, industry) {
  const patterns = [...(RISK_PATTERNS[industry] || []), ...RISK_PATTERNS.general];
  const signals = [];

  for (const { pattern, label, severity } of patterns) {
    const matches = [...content.matchAll(pattern)];
    for (const match of matches.slice(0, 2)) { // cap at 2 matches per pattern
      signals.push({
        type: label,
        text: match[0],
        severity,
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

  // Run claim verification and high-risk pattern scan in parallel
  const [verifyResult, legalSignals] = await Promise.all([
    verifyClaims(content),
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
    legal_risk_signals: legalSignals,
    flagged_claims: verifyResult.flagged_claims,
    eeat: verifyResult.eeat,
    fix_before_publishing: generateFixes(legalSignals, verifyResult.flagged_claims, detectedIndustry),
    summary: {
      total_claims: verifyResult.summary.total_claims,
      flagged_claims: verifyResult.summary.flagged,
      legal_signals_found: legalSignals.length,
      critical_signals: legalSignals.filter(s => s.severity === 'critical').length,
      eeat_score: verifyResult.eeat.score,
      eeat_grade: verifyResult.eeat.grade,
    },
  };
}
