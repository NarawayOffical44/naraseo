/**
 * Supabase Models for SEO AI
 * Stores long-term context: conversations and reports
 * PostgreSQL database with real-time capabilities
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️  SUPABASE_URL or SUPABASE_KEY not set in .env');
}

const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

/**
 * Initialize Supabase and create tables if needed
 */
export async function initializeSupabase() {
  if (!supabase) {
    console.warn('⚠️  Supabase not configured — running without persistence');
    return null;
  }
  try {
    // Check connection
    const { data, error } = await supabase.from('chat_conversations').select('count');

    if (error && error.code === 'PGRST116') {
      // Table doesn't exist, create it
      console.log('📝 Creating chat_conversations table...');
      // Tables must be created via Supabase dashboard or migrations
      console.warn('⚠️  Please create tables in Supabase dashboard:');
      console.warn('   1. chat_conversations (id, url, messages, context, created_at)');
      console.warn('   2. audit_reports (id, url, score, grade, issues, created_at)');
    } else if (!error) {
      console.log('✅ Supabase connected');
    }

    return supabase;
  } catch (error) {
    console.error('❌ Supabase error:', error.message);
  }
}

/**
 * CHAT CONVERSATIONS
 * Save and retrieve chat history with full context
 */

export async function saveChatConversation(url, messages, context, userId) {
  if (!userId) {
    console.error('❌ Cannot save conversation without userId');
    return null;
  }

  const { data, error } = await supabase
    .from('chat_conversations')
    .insert([
      {
        url,
        user_id: userId,
        messages, // Array of { role, content, timestamp }
        context: {
          score: context?.score || 0,
          grade: context?.grade || 'N/A',
          issues: context?.issues || [],
          categories: context?.categories || {},
          pageSpeedInsights: context?.pageSpeedInsights || null,
        },
        created_at: new Date().toISOString(),
      }
    ])
    .select();

  if (error) {
    console.error('❌ Error saving conversation:', error);
    return null;
  }

  return data?.[0]?.id;
}

export async function addMessageToConversation(conversationId, message, role) {
  const { data: conversation, error: fetchError } = await supabase
    .from('chat_conversations')
    .select('messages')
    .eq('id', conversationId)
    .single();

  if (fetchError) {
    console.error('Error fetching conversation:', fetchError);
    return null;
  }

  const updatedMessages = [
    ...conversation.messages,
    {
      role,
      content: message,
      timestamp: new Date().toISOString(),
    }
  ];

  const { error: updateError } = await supabase
    .from('chat_conversations')
    .update({ messages: updatedMessages })
    .eq('id', conversationId);

  if (updateError) {
    console.error('Error updating conversation:', updateError);
    return null;
  }

  return true;
}

/**
 * Get recent conversations for a URL and user (last 100)
 * Used to build long-term context for Claude
 */
export async function getRecentConversations(url, userId, limit = 100) {
  const { data, error } = await supabase
    .from('chat_conversations')
    .select('*')
    .eq('url', url)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching conversations:', error);
    return [];
  }

  return data || [];
}

/**
 * Get conversation context summary
 * Compress all conversations into a summary for Claude
 */
export async function getConversationContextSummary(url, userId) {
  const conversations = await getRecentConversations(url, userId, 100);

  if (conversations.length === 0) {
    return null;
  }

  const summary = {
    totalConversations: conversations.length,
    lastConversationDate: conversations[0]?.created_at,
    previousIssuesFound: [],
    commonQuestions: [],
    improvementTrends: [],
  };

  // Extract patterns from conversations
  conversations.forEach((conv) => {
    if (conv.context?.issues) {
      summary.previousIssuesFound.push(
        ...conv.context.issues.map(i => i.issue)
      );
    }

    // Extract questions user asked
    if (conv.messages) {
      conv.messages.forEach((msg) => {
        if (msg.role === 'user') {
          summary.commonQuestions.push(msg.content.substring(0, 100));
        }
      });
    }
  });

  // Deduplicate and limit
  summary.previousIssuesFound = [...new Set(summary.previousIssuesFound)].slice(0, 10);
  summary.commonQuestions = [...new Set(summary.commonQuestions)].slice(0, 15);

  return summary;
}

/**
 * AUDIT REPORTS
 * Save and retrieve generated reports
 */

export async function saveAuditReport(url, auditData, userId) {
  if (!userId) {
    console.error('❌ Cannot save report without userId');
    return null;
  }

  const { data, error } = await supabase
    .from('audit_reports')
    .insert([
      {
        url,
        user_id: userId,
        score: auditData.score,
        grade: auditData.grade,
        issues: auditData.issues,
        categories: auditData.categories,
        page_speed_insights: auditData.pageSpeedInsights,
        performance: auditData.performance,
        is_public: false,
        created_at: new Date().toISOString(),
      }
    ])
    .select();

  if (error) {
    console.error('Error saving report:', error);
    return null;
  }

  console.log(`📊 Report saved with ID: ${data?.[0]?.id}`);
  return data?.[0]?.id;
}

/**
 * Get audit reports for a URL and user (last 50)
 */
export async function getAuditReports(url, userId, limit = 50) {
  const { data, error } = await supabase
    .from('audit_reports')
    .select('*')
    .eq('url', url)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching reports:', error);
    return [];
  }

  return data || [];
}

/**
 * Get latest report for a URL and user
 */
export async function getLatestReport(url, userId) {
  const { data, error } = await supabase
    .from('audit_reports')
    .select('*')
    .eq('url', url)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching latest report:', error);
    return null;
  }

  return data;
}

/**
 * Build full context from database
 * Combines current audit with historical data for Claude
 */
export async function buildFullContext(url, currentAudit, userId) {
  const conversations = await getConversationContextSummary(url, userId);
  const reports = await getAuditReports(url, userId, 5);

  return {
    current: {
      score: currentAudit.score,
      grade: currentAudit.grade,
      issues: currentAudit.issues,
      categories: currentAudit.categories,
      pageSpeedInsights: currentAudit.pageSpeedInsights,
    },
    history: {
      totalPastConversations: conversations?.totalConversations || 0,
      previousIssuesFound: conversations?.previousIssuesFound || [],
      commonUserQuestions: conversations?.commonQuestions || [],
      previousScores: reports.map(r => ({
        score: r.score,
        grade: r.grade,
        date: r.created_at,
        topIssues: r.issues?.slice(0, 3) || [],
      })),
    },
  };
}

/**
 * Get conversation context for Claude
 * Formats past conversations as context for AI
 */
export async function getConversationContextForAI(url, userId) {
  const conversations = await getRecentConversations(url, userId, 50);

  if (conversations.length === 0) {
    return 'No previous conversations found for this URL.';
  }

  let contextText = `\n## Previous Conversation History for ${url}\n\n`;
  contextText += `Total conversations: ${conversations.length}\n\n`;

  // Add last 5 conversations as examples
  conversations.slice(0, 5).forEach((conv, idx) => {
    contextText += `### Conversation ${idx + 1} (${new Date(conv.created_at).toLocaleDateString()})\n`;
    if (conv.messages && Array.isArray(conv.messages)) {
      conv.messages.forEach((msg) => {
        contextText += `**${msg.role === 'user' ? 'User' : 'Assistant'}**: ${msg.content.substring(0, 150)}...\n`;
      });
    }
    contextText += '\n';
  });

  return contextText;
}

export default supabase;
