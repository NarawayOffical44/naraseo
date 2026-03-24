/**
 * Scoring logic — shared by server and client analyzers
 */

export const SCORE_WEIGHTS = {
  'missing-title': 15,
  'title-too-short': 8,
  'title-too-long': 5,
  'missing-meta-description': 15,
  'meta-too-short': 5,
  'meta-too-long': 3,
  'missing-h1': 15,
  'multiple-h1': 8,
  'img-no-alt': 5,
  'img-no-dimensions': 2,
  'missing-viewport': 15,
  'missing-canonical': 5,
  'missing-og-tags': 3,
  'missing-twitter-card': 2,
  'missing-charset': 1,
  'no-h2-tags': 5,
  'external-links-no-noopener': 2,
};

/**
 * Calculate SEO score from issues
 * @param {Array} issues - Array of issue objects
 * @returns {number} Score 0-100
 */
export function calculateScore(issues) {
  let score = 100;
  issues.forEach(issue => {
    score += issue.affectsScore; // affectsScore is negative for deductions
  });
  return Math.max(0, Math.min(100, score));
}

/**
 * Get letter grade (A-F) based on score
 * @param {number} score - SEO score 0-100
 * @returns {string} Grade A-F
 */
export function getGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}

/**
 * Get score color for UI (for charts/gauges)
 * @param {number} score - SEO score 0-100
 * @returns {string} Color hex code
 */
export function getScoreColor(score) {
  if (score >= 90) return '#22c55e'; // Green
  if (score >= 75) return '#84cc16'; // Lime
  if (score >= 60) return '#facc15'; // Yellow
  if (score >= 45) return '#f97316'; // Orange
  return '#ef4444'; // Red
}

/**
 * Break down score by category
 * @param {Array} issues - Array of issue objects
 * @returns {Object} Score by category
 */
export function getScoreByCategory(issues) {
  const categories = {
    'On-Page': 100,
    'Technical': 100,
    'Accessibility': 100,
    'Mobile': 100,
    'Performance': 100,
    'Social': 100,
  };

  issues.forEach(issue => {
    if (categories.hasOwnProperty(issue.category)) {
      categories[issue.category] += issue.affectsScore;
    }
  });

  // Ensure all scores stay 0-100
  Object.keys(categories).forEach(cat => {
    categories[cat] = Math.max(0, Math.min(100, categories[cat]));
  });

  return categories;
}

/**
 * Prioritize issues: Critical first, then Warning, then Info
 * @param {Array} issues - Array of issue objects
 * @returns {Array} Sorted issues
 */
export function prioritizeIssues(issues) {
  const typeOrder = { critical: 1, warning: 2, info: 3 };
  return [...issues].sort((a, b) => {
    if (typeOrder[a.type] !== typeOrder[b.type]) {
      return typeOrder[a.type] - typeOrder[b.type];
    }
    // Within same type, sort by impact (higher affectsScore = more negative)
    return a.affectsScore - b.affectsScore;
  });
}

/**
 * Get "quick wins" — issues that are easy to fix and have high impact
 * @param {Array} issues - Array of issue objects
 * @returns {Array} Quick win issues (warning/info with high impact)
 */
export function getQuickWins(issues) {
  return issues
    .filter(i => i.type !== 'critical') // Critical issues are big projects
    .filter(i => i.affectsScore > -10) // Quick wins have moderate impact
    .sort((a, b) => a.affectsScore - b.affectsScore)
    .slice(0, 5); // Top 5 quick wins
}

/**
 * Estimate impact — "fixing these issues could improve traffic by X%"
 * @param {Array} issues - Array of issue objects
 * @param {number} currentScore - Current SEO score
 * @returns {Object} Impact estimate
 */
export function estimateImpact(issues, currentScore) {
  const criticalIssues = issues.filter(i => i.type === 'critical');
  const warningIssues = issues.filter(i => i.type === 'warning');

  const potentialScore = Math.min(100, currentScore + criticalIssues.length * 15 + warningIssues.length * 5);
  const scoreImprovement = potentialScore - currentScore;

  // Rough estimate: every 10 points of SEO score improvement = ~5-15% traffic increase
  const estimatedTrafficIncrease = (scoreImprovement / 10) * 10; // Conservative estimate

  return {
    currentScore,
    potentialScore,
    scoreImprovement,
    estimatedTrafficIncrease,
    summary: `Fixing ${criticalIssues.length} critical issues could improve your score by ~${scoreImprovement} points and potentially increase traffic by ~${estimatedTrafficIncrease}%.`,
  };
}
