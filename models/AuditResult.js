import mongoose from 'mongoose';

const auditResultSchema = new mongoose.Schema({
  // Page URL audited
  url: { type: String, required: true, index: true },

  // User info
  userId: { type: String, index: true }, // null for anonymous
  sessionId: { type: String, index: true }, // for tracking anonymous users
  ipAddress: String,

  // Audit metadata
  source: { type: String, enum: ['webapp', 'extension'], default: 'webapp' },
  pagesCrawled: { type: Number, default: 1 },

  // Audit results
  score: { type: Number, min: 0, max: 100 },
  grade: { type: String, enum: ['A', 'B', 'C', 'D', 'F'] },

  // Category scores
  categories: {
    'On-Page': { type: Number, default: 100 },
    'Technical': { type: Number, default: 100 },
    'Accessibility': { type: Number, default: 100 },
    'Mobile': { type: Number, default: 100 },
    'Performance': { type: Number, default: 100 },
    'Social': { type: Number, default: 100 },
  },

  // Issues found
  issues: [{
    id: String,
    type: String,
    category: String,
    issue: String,
    detail: String,
    suggestion: String,
    fixExample: String,
    selector: String,
    elementInfo: mongoose.Schema.Types.Mixed,
    affectsScore: Number,
  }],

  // Page data from analysis
  pageData: mongoose.Schema.Types.Mixed,

  // Performance metrics
  performance: mongoose.Schema.Types.Mixed,

  // Screenshot (base64 or URL)
  screenshotBase64: String,

  // For shareable reports
  isPublic: { type: Boolean, default: false },
  shareToken: { type: String, unique: true, sparse: true },
  sharePassword: String, // optional password for reports

  // Per-page results (if crawled multiple pages)
  pageResults: [
    {
      url: String,
      score: Number,
      grade: String,
      issues: mongoose.Schema.Types.Mixed,
    }
  ],

  // Auto-delete old reports after 90 days
  createdAt: { type: Date, default: Date.now, expires: 7776000 }, // 90 days
});

// Index for faster queries
auditResultSchema.index({ userId: 1, createdAt: -1 });
auditResultSchema.index({ url: 1, createdAt: -1 });

const AuditResult = mongoose.models.AuditResult || mongoose.model('AuditResult', auditResultSchema);

export default AuditResult;
