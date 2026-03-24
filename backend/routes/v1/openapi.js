/**
 * OpenAPI 3.1 spec for Naraseo AI REST API.
 * Consumed by ChatGPT Custom GPT Actions, Perplexity, and any OpenAPI-compatible tool.
 * Served at GET /api/v1/openapi.json with Access-Control-Allow-Origin: *
 */

export const openapiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Naraseo AI — SEO & Geo API',
    version: '1.0.0',
    description: `Professional SEO and local geo-rank API. No external SEO tools — all analysis is built in-house.

Capabilities:
- Full page SEO audit (score, grade, issues, page data)
- AI keyword research and semantic cluster analysis
- Local geo-grid rank tracking across geographic grids
- Schema.org structured data validation
- Site-wide crawl and audit
- Competitor gap analysis
- AI SEO consultant (Claude-powered)
- Autonomous solve: full analysis + executable fixes in one call`,
    contact: { name: 'Naraseo AI', url: 'https://naraseo-ai.com' },
    license: { name: 'Commercial', url: 'https://naraseo-ai.com/terms' },
  },
  servers: [
    { url: 'https://naraseo-ai.up.railway.app', description: 'Production (Railway)' },
    { url: 'http://localhost:3001', description: 'Local development' },
  ],
  security: [{ BearerAuth: [] }],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API Key',
        description: 'Your Naraseo AI API key. Unauthenticated requests are allowed on Free tier with IP-based rate limiting.',
      },
    },
    schemas: {
      Meta: {
        type: 'object',
        properties: {
          requestId: { type: 'string', example: 'req_abc123' },
          version: { type: 'string', example: '1.0' },
          processingMs: { type: 'number', example: 1240 },
          creditsUsed: { type: 'number', example: 1 },
        },
      },
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'MISSING_URL' },
              message: { type: 'string', example: 'url parameter required' },
            },
          },
        },
      },
      UrlBody: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', format: 'uri', example: 'https://example.com', description: 'The page URL to analyse' },
        },
      },
    },
  },
  paths: {
    '/api/v1/solve': {
      post: {
        operationId: 'solve',
        summary: 'Autonomous SEO solve — full analysis + executable fixes',
        description: 'One call does everything: audits the page, researches keywords, validates schema, then uses AI to generate a prioritised action plan with copy-paste HTML fixes, exact placement instructions, and how to apply via direct edit, WordPress, or CMS API.',
        tags: ['Autonomous'],
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['url'],
                properties: {
                  url: { type: 'string', format: 'uri', description: 'Page URL to analyse and solve' },
                  businessName: { type: 'string', description: 'Optional business name for local SEO context' },
                  phone: { type: 'string', description: 'Optional business phone for NAP check' },
                  address: { type: 'string', description: 'Optional business address for NAP check' },
                },
              },
              example: { url: 'https://example.com', businessName: 'Example Business' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Complete SEO action plan with precise fixes',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        url: { type: 'string' },
                        score: { type: 'number', minimum: 0, maximum: 100 },
                        grade: { type: 'string', enum: ['A', 'B', 'C', 'D', 'F'] },
                        summary: { type: 'string', description: 'Plain-English assessment' },
                        fixes: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              priority: { type: 'number' },
                              issue: { type: 'string' },
                              impact: { type: 'string', enum: ['high', 'medium', 'low'] },
                              where: { type: 'string', description: 'Exact HTML location' },
                              code: { type: 'string', description: 'Copy-paste HTML snippet' },
                              explanation: { type: 'string' },
                              applyVia: { type: 'object', properties: { directEdit: { type: 'string' }, wordpress: { type: 'string' }, api: { type: 'string' } } },
                            },
                          },
                        },
                        keywordOpportunities: { type: 'array', items: { type: 'object' } },
                        quickWins: { type: 'array', items: { type: 'string' } },
                        estimatedScoreAfterFixes: { type: 'number' },
                      },
                    },
                    meta: { '$ref': '#/components/schemas/Meta' },
                  },
                },
              },
            },
          },
          '400': { description: 'Bad request', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } } },
          '502': { description: 'Could not fetch the target URL' },
        },
      },
    },
    '/api/v1/solve-site': {
      post: {
        operationId: 'solveSite',
        summary: 'Site-wide autonomous SEO analysis',
        description: 'Discovers all pages via sitemap.xml (with robots.txt hint and sitemap index support), audits every page in parallel, then generates a single prioritised site-wide action plan. Template-level global fixes + page-specific fixes. One Claude call regardless of page count.',
        tags: ['Autonomous'],
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['url'],
                properties: {
                  url: { type: 'string', format: 'uri', description: 'Root URL of the site' },
                  maxPages: { type: 'integer', minimum: 1, maximum: 100, default: 50, description: 'Max pages to audit' },
                },
              },
              example: { url: 'https://example.com', maxPages: 50 },
            },
          },
        },
        responses: {
          '200': {
            description: 'Site-wide SEO action plan',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        url: { type: 'string' },
                        discoveryMethod: { type: 'string', enum: ['sitemap', 'root-only'] },
                        pagesDiscovered: { type: 'number' },
                        pagesAudited: { type: 'number' },
                        siteScore: { type: 'number' },
                        summary: { type: 'string' },
                        criticalSiteIssues: { type: 'array', items: { type: 'object' } },
                        pageSpecificFixes: { type: 'array', items: { type: 'object' } },
                        quickWins: { type: 'array', items: { type: 'string' } },
                        topIssues: { type: 'array', items: { type: 'object' } },
                        worstPages: { type: 'array', items: { type: 'object' } },
                        siteWideGaps: { type: 'object' },
                        estimatedScoreAfterFixes: { type: 'number' },
                      },
                    },
                    meta: { '$ref': '#/components/schemas/Meta' },
                  },
                },
              },
            },
          },
          '400': { description: 'Bad request' },
          '502': { description: 'Could not audit any pages' },
        },
      },
    },
    '/api/v1/audit': {
      post: {
        operationId: 'audit',
        summary: 'Full page SEO audit',
        description: 'Audits a URL and returns score (0-100), grade (A-F), category scores, all issues, and complete page data.',
        tags: ['Core SEO'],
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { '$ref': '#/components/schemas/UrlBody' } } } },
        responses: {
          '200': { description: 'SEO audit result with score, grade, issues, and page data' },
          '400': { description: 'Bad request', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/v1/keywords': {
      post: {
        operationId: 'keywordResearch',
        summary: 'AI keyword research from page content',
        description: 'Extracts keywords from page content and uses Claude to identify primary keyword, semantic cluster (10 related keywords), search intent, content gaps, and quick wins.',
        tags: ['Core SEO'],
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { '$ref': '#/components/schemas/UrlBody' } } } },
        responses: { '200': { description: 'Keyword analysis with AI insights' } },
      },
    },
    '/api/v1/schema/validate': {
      post: {
        operationId: 'schemaValidate',
        summary: 'Validate structured data (JSON-LD)',
        description: 'Extracts and validates all JSON-LD blocks against schema.org rules. Checks required/recommended properties, determines Google Rich Results eligibility.',
        tags: ['Technical SEO'],
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { '$ref': '#/components/schemas/UrlBody' } } } },
        responses: { '200': { description: 'Schema validation results with errors, warnings, and rich result eligibility' } },
      },
    },
    '/api/v1/local-seo': {
      post: {
        operationId: 'localSeoAudit',
        summary: 'Local SEO signals audit',
        description: 'Audits local SEO: LocalBusiness schema, NAP consistency, opening hours, geo coordinates, citations.',
        tags: ['Local SEO'],
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['url'],
                properties: {
                  url: { type: 'string', format: 'uri' },
                  businessName: { type: 'string' },
                  phone: { type: 'string' },
                  address: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Local SEO audit result' } },
      },
    },
    '/api/v1/geo-grid': {
      post: {
        operationId: 'geoGrid',
        summary: 'Geographic rank tracking grid',
        description: 'Tracks local search ranking across a 3x3, 5x5, or 7x7 geographic grid using Google Custom Search API. Returns rank at each point, average rank, and coverage.',
        tags: ['Local SEO'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['url', 'keyword', 'centerLat', 'centerLng'],
                properties: {
                  url: { type: 'string', format: 'uri' },
                  keyword: { type: 'string', description: 'Search keyword to track' },
                  centerLat: { type: 'number', minimum: -90, maximum: 90 },
                  centerLng: { type: 'number', minimum: -180, maximum: 180 },
                  gridSize: { type: 'integer', enum: [3, 5, 7], default: 3, description: '3=9 points, 5=25 points, 7=49 points' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Geo-grid rank heatmap data' }, '403': { description: 'Requires Pro tier' } },
      },
    },
    '/api/v1/crawl': {
      post: {
        operationId: 'siteCrawl',
        summary: 'Multi-page site crawl and audit',
        description: 'Crawls up to 500 pages from a start URL, audits each page, and returns a summary with per-page scores, top issues across the site, and critical page count.',
        tags: ['Site Analysis'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['url'],
                properties: {
                  url: { type: 'string', format: 'uri' },
                  maxPages: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
                  maxDepth: { type: 'integer', minimum: 1, maximum: 5, default: 2 },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Site crawl results' }, '403': { description: 'Requires Pro tier' } },
      },
    },
    '/api/v1/competitors': {
      post: {
        operationId: 'competitorAnalysis',
        summary: 'Competitor gap analysis',
        description: 'Audits your page vs 1-5 competitor URLs. Returns score gap, word count gap, schema comparison, and specific opportunities where competitors outperform you.',
        tags: ['Competitive Intelligence'],
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['url', 'competitorUrls'],
                properties: {
                  url: { type: 'string', format: 'uri', description: 'Your page URL' },
                  competitorUrls: { type: 'array', items: { type: 'string', format: 'uri' }, minItems: 1, maxItems: 5 },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Competitor analysis with gap report and opportunities' } },
      },
    },
    '/api/v1/chat': {
      post: {
        operationId: 'seoChat',
        summary: 'AI SEO consultant (Claude-powered)',
        description: 'Chat with an expert SEO consultant. Optionally pass audit data as context for grounded advice.',
        tags: ['AI Assistant'],
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['messages'],
                properties: {
                  messages: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['role', 'content'],
                      properties: {
                        role: { type: 'string', enum: ['user', 'assistant'] },
                        content: { type: 'string' },
                      },
                    },
                  },
                  auditData: { type: 'object', description: 'Optional audit result for context' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'AI response with updated message history' } },
      },
    },
    '/api/v1/fixes': {
      post: {
        operationId: 'generateFix',
        summary: 'Generate HTML code fix for an SEO issue',
        description: 'Given an SEO issue description, returns a ready-to-implement HTML code fix with explanation and impact estimate.',
        tags: ['AI Assistant'],
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['issue'],
                properties: {
                  issue: { type: 'string', description: 'SEO issue description or issue ID' },
                  html: { type: 'string', description: 'Relevant current HTML snippet (optional)' },
                  context: { type: 'string', description: 'Additional context (optional)' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'HTML fix with explanation and impact' } },
      },
    },
    '/api/v1/health': {
      get: {
        operationId: 'healthCheck',
        summary: 'API health check',
        description: 'Returns server status. No authentication required.',
        tags: ['System'],
        security: [],
        responses: {
          '200': {
            description: 'Server healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { type: 'object', properties: { status: { type: 'string' }, version: { type: 'string' }, timestamp: { type: 'string' } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};
