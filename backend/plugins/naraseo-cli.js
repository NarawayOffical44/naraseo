/**
 * Naraseo Trust Skill - CLI Handler
 * Integrates with Claude Code /naraseo command
 * Usage: /naraseo [verify|inline|markdown|json] [options]
 */

export const naraseoSkill = {
  name: 'naraseo',

  /**
   * Parse user command: /naraseo inline/markdown/json
   */
  async execute(args, context) {
    const parts = (args || '').trim().split(' ').filter(Boolean);
    const format = parts[0] || 'inline';

    // Get the last LLM response from context
    const lastResponse = context.lastMessage?.content || context.selectedText;

    if (!lastResponse) {
      return {
        error: 'No text to verify. Select text or use /naraseo after Claude generates response.',
        suggestion: 'Highlight text in editor or ask Claude something first',
      };
    }

    if (!['json', 'markdown', 'inline'].includes(format)) {
      return {
        error: `Unknown format: ${format}`,
        help: 'Use: /naraseo [json|markdown|inline]',
      };
    }

    try {
      // Call naraseo API
      const result = await verifyText(lastResponse, {
        format,
        apiKey: process.env.NARASEO_API_KEY,
      });

      return formatOutput(result, format);
    } catch (error) {
      return {
        error: `Verification failed: ${error.message}`,
        fallback: 'Could not connect to verification service',
      };
    }
  },

  /**
   * Show verification result in Claude Code
   */
  onSuccess(result, format) {
    if (format === 'inline') {
      // Show inline verification with badges
      return {
        type: 'inline',
        display: result.verified_content,
        badge: result.verified ? '✅ VERIFIED' : '⚠️ NEEDS REVIEW',
        tooltip: `Risk score: ${result.risk_score}%`,
      };
    }

    if (format === 'markdown') {
      // Show formatted markdown report
      return {
        type: 'markdown',
        display: result.verified_content,
        sidebar: true,
        title: `Verification Report - ${result.verdict}`,
      };
    }

    if (format === 'json') {
      // Show JSON in editor or sidebar
      return {
        type: 'json',
        display: JSON.stringify(result.verified_content, null, 2),
        editable: true,
        copyable: true,
      };
    }
  },

  /**
   * Auto-suggest verification when risky patterns detected
   */
  onResponseGenerated(response) {
    // Check if response contains risky patterns
    const patterns = [
      /studies? show/i,
      /\d+% (of|users?)/i,
      /currently|as of (today|now)/i,
      /guaranteed|100% effective/i,
    ];

    const hasRisk = patterns.some(p => p.test(response));

    if (hasRisk) {
      return {
        suggestion: '⚠️ This response has patterns that might need verification. Try `/naraseo inline`',
        severity: 'medium',
        auto_verify: false, // Don't auto-verify, ask user first
      };
    }
  },
};

/**
 * Call naraseo verification API
 */
async function verifyText(text, options) {
  const { format, apiKey } = options;

  const response = await fetch('https://naraseoai.onrender.com/api/v1/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'User-Agent': 'naraseo-skill/1.0',
    },
    body: JSON.stringify({
      content: text,
      format,
      industry: 'general',
    }),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error?.message || 'Verification failed');
  }

  return data.data;
}

/**
 * Format output for display
 */
function formatOutput(result, format) {
  const header = `
📋 Naraseo Verification Results
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${result.verdict === 'clean' ? '✅' : result.verdict === 'review_needed' ? '⚠️' : '🔴'} Verdict: ${result.verdict.toUpperCase()}
📊 Risk Score: ${result.risk_score}%
📌 Claims: ${result.claims?.total || 0} total
  • Safe: ${result.claims?.safe || 0}
  • Flagged: ${result.claims?.flagged || 0}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

  if (format === 'inline') {
    return header + '\n' + result.verified_content;
  }

  if (format === 'markdown') {
    return header + '\n\n' + result.verified_content;
  }

  return header + '\n\n```json\n' + JSON.stringify(result, null, 2) + '\n```';
}

/**
 * Aliases: /verify, /trust, /check
 */
export const aliases = {
  '/verify': 'naraseo inline',
  '/trust': 'naraseo inline',
  '/check': 'naraseo json',
};
