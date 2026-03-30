/**
 * Fixes Route - POST /api/v1/fixes
 * Generate code fixes for SEO issues
 */

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { featureAccess, sendApiError } from '../../middleware/apiKey.js';
import crypto from 'crypto';

const router = express.Router();
const client = new Anthropic();

router.post('/', featureAccess('fixes'), async (req, res) => {
  const { issue, html = '', context = '' } = req.body;
  const requestId = `req_${crypto.randomBytes(6).toString('hex')}`;

  if (!issue) {
    return sendApiError(res, 'MISSING_ISSUE', 'issue description required', 400);
  }

  try {
    const startTime = Date.now();

    const prompt = `You are an expert HTML/SEO code fixer. Generate a complete code fix for this SEO issue:

Issue: ${issue}
${html ? `Current HTML snippet: ${html.substring(0, 500)}` : ''}
${context ? `Context: ${context}` : ''}

Provide:
1. The exact code to add/modify (wrapped in \`\`\`html\`\`\`)
2. Brief explanation of why this fixes the issue
3. Impact on SEO (e.g., "Improves title clickthrough by ~5%")

Format as JSON only: { "code": "...", "explanation": "...", "impact": "..." }`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    let fixData;
    try {
      const responseText = response.content[0]?.text || '{}';
      fixData = JSON.parse(responseText);
    } catch (e) {
      fixData = {
        code: response.content[0]?.text || '',
        explanation: 'See code above',
        impact: 'SEO improvement',
      };
    }

    const processingMs = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      data: {
        issue,
        fix: fixData,
        difficulty: 'easy',
        timeEstimate: '5 minutes',
      },
      meta: {
        requestId,
        version: '1.0',
        processingMs,
        creditsUsed: 1,
      },
    });
  } catch (error) {
    console.error('Fixes error:', error);
    return sendApiError(res, 'INTERNAL_ERROR', error.message, 500);
  }
});

router.post('/suggestions', featureAccess('fixes'), async (req, res) => {
  const { content, title, metaDescription } = req.body;
  const requestId = `req_${crypto.randomBytes(6).toString('hex')}`;

  if (!content) {
    return sendApiError(res, 'MISSING_CONTENT', 'content parameter required', 400);
  }

  try {
    const startTime = Date.now();

    const prompt = `You are an expert content writer for SEO. Rewrite this content to be more SEO-friendly:

Title: ${title || 'Not provided'}
Meta Description: ${metaDescription || 'Not provided'}
Content: ${content.substring(0, 1000)}

Provide:
1. An improved title (50-60 chars)
2. An improved meta description (120-160 chars)
3. Rewritten content opening (first 2-3 sentences)
4. Key improvements made

Format as JSON: { "title": "...", "metaDescription": "...", "contentOpening": "...", "improvements": [...] }`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    let suggestions;
    try {
      const responseText = response.content[0]?.text || '{}';
      suggestions = JSON.parse(responseText);
    } catch (e) {
      suggestions = {
        title: title || 'Improved Title',
        metaDescription: metaDescription || 'Improved description',
        contentOpening: content.substring(0, 200),
        improvements: ['See above for suggestions'],
      };
    }

    const processingMs = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      data: suggestions,
      meta: {
        requestId,
        version: '1.0',
        processingMs,
        creditsUsed: 1,
      },
    });
  } catch (error) {
    console.error('Suggestions error:', error);
    return sendApiError(res, 'INTERNAL_ERROR', error.message, 500);
  }
});

export default router;
