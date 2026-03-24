import { NextResponse } from 'next/server';
import SEOAnalyzer from '@/lib/seoAnalyzer';
import { connectDB } from '@/lib/mongodb';
import AuditResult from '@/models/AuditResult';

/**
 * POST /api/audit
 * Run SEO audit on a website
 *
 * Body:
 * {
 *   url: string,           // URL to audit
 *   maxPages: number,      // Max pages to crawl (10, 50, 500) - optional
 *   source: 'webapp' | 'extension'  // Where request came from
 * }
 *
 * Response:
 * {
 *   id: string,           // Audit result ID (for retrieval)
 *   url: string,
 *   score: number,
 *   grade: string,
 *   issues: Array,
 *   pageResults?: Array,  // If multi-page
 *   screenshotBase64?: string
 * }
 */
export async function POST(request) {
  try {
    const { url, maxPages = 10, source = 'webapp' } = await request.json();

    // Validate URL
    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    let urlObj;
    try {
      urlObj = new URL(url);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format. Must start with http:// or https://' },
        { status: 400 }
      );
    }

    // Validate maxPages
    const validMaxPages = [10, 50, 500];
    const parsedMaxPages = Number(maxPages);
    if (!validMaxPages.includes(parsedMaxPages)) {
      return NextResponse.json(
        { error: 'Invalid maxPages. Must be 10, 50, or 500' },
        { status: 400 }
      );
    }

    // Run audit
    console.log(`🔍 Starting audit: ${url} (max ${parsedMaxPages} pages)`);

    const analyzer = new SEOAnalyzer();
    let auditResult;

    if (parsedMaxPages === 10) {
      // Single page audit (extension use case)
      auditResult = await analyzer.analyze(url);
    } else {
      // Multi-page crawl (web app use case)
      auditResult = await analyzer.crawlSite(url, parsedMaxPages);
    }

    // Save to database
    let savedResult;
    try {
      await connectDB();

      const auditDoc = new AuditResult({
        url,
        source,
        pagesCrawled: auditResult.pagesCrawled || 1,
        score: auditResult.score,
        grade: auditResult.grade,
        categories: auditResult.categories,
        issues: auditResult.issues,
        pageData: auditResult.pageData,
        performance: auditResult.performance,
        screenshotBase64: auditResult.screenshotBase64,
        pageResults: auditResult.pageResults,
      });

      savedResult = await auditDoc.save();
      console.log(`✓ Audit saved: ${savedResult._id}`);
    } catch (dbError) {
      // Database optional for MVP
      console.warn('⚠️  Database save failed (using mock):', dbError.message);
      savedResult = { _id: 'mock-' + Date.now(), ...auditResult };
    }

    // Return result
    return NextResponse.json({
      id: savedResult._id,
      url: auditResult.url,
      score: auditResult.score,
      grade: auditResult.grade,
      pagesCrawled: auditResult.pagesCrawled || 1,
      issuesSummary: auditResult.issuesSummary || {
        critical: auditResult.issues.filter(i => i.type === 'critical').length,
        warning: auditResult.issues.filter(i => i.type === 'warning').length,
        info: auditResult.issues.filter(i => i.type === 'info').length,
      },
      issues: auditResult.issues,
      pageResults: auditResult.pageResults,
      screenshotBase64: auditResult.screenshotBase64?.substring(0, 50) + '...', // Don't send full screenshot in response
      performedAt: auditResult.performedAt,
    });

  } catch (error) {
    console.error('❌ Audit error:', error.message);

    return NextResponse.json(
      {
        error: 'Audit failed',
        message: error.message,
        // In development, show full error; in production, hide details
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/audit - Not implemented
 * Use GET /api/audit/[id] to fetch saved results
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Use GET /api/audit/[id] to fetch saved audit results' },
    { status: 400 }
  );
}
