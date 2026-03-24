/**
 * Chat Route - POST /api/v1/chat
 * AI SEO consultant via Claude
 */

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { featureAccess, sendApiError } from '../../middleware/apiKey.js';
import crypto from 'crypto';

const router = express.Router();
const client = new Anthropic();

router.post('/', featureAccess('chat'), async (req, res) => {
  const { messages, auditData = null } = req.body;
  const requestId = `req_${crypto.randomBytes(6).toString('hex')}`;

  if (!messages || !Array.isArray(messages)) {
    return sendApiError(res, 'INVALID_MESSAGES', 'messages array required', 400);
  }

  try {
    const startTime = Date.now();

    // Build context if audit data provided
    let context = '';
    if (auditData) {
      context = `\n\nContext from page audit:
- URL: ${auditData.url}
- Score: ${auditData.score}/100
- Title: ${auditData.pageData?.title}
- Word Count: ${auditData.pageData?.wordCount}
- H1: ${auditData.pageData?.h1?.join(', ')}`;
    }

    // Prepare messages for Claude
    const systemPrompt = `You are an expert SEO consultant for the Naraseo AI platform.
    Provide actionable, practical SEO advice based on the user's questions.
    Always explain the "why" behind recommendations.
    Focus on real, implementable improvements.${context}`;

    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map(msg => ({
        role: msg.role || 'user',
        content: msg.content,
      })),
    });

    const assistantMessage = response.content[0]?.text || '';

    const processingMs = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      data: {
        messages: [
          ...messages,
          {
            role: 'assistant',
            content: assistantMessage,
          },
        ],
        usage: {
          inputTokens: response.usage?.input_tokens || 0,
          outputTokens: response.usage?.output_tokens || 0,
        },
      },
      meta: {
        requestId,
        version: '1.0',
        processingMs,
        creditsUsed: 2,
      },
    });
  } catch (error) {
    console.error('Chat error:', error);
    return sendApiError(res, 'INTERNAL_ERROR', error.message, 500);
  }
});

export default router;
