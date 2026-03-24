'use client';

import { useState } from 'react';
import Navbar from '../components/Navbar';
import AuditForm from '../components/AuditForm';
import ScoreGauge from '../components/ScoreGauge';
import IssuesSummary from '../components/IssuesSummary';
import CategoryBreakdown from '../components/CategoryBreakdown';
import IssueList from '../components/IssueList';

export default function AuditPage() {
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAudit = async ({ url, maxPages }) => {
    setLoading(true);
    setError('');
    setAudit(null);

    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, maxPages }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Audit failed. Please try again.');
        return;
      }

      setAudit(data);
    } catch (err) {
      setError('Network error. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="audit-page">
      <Navbar />

      <div className="audit-container">
        <div className="container">
          <AuditForm onSubmit={handleAudit} loading={loading} />

          {error && (
            <div className="error-message">
              <strong>Error:</strong> {error}
              <button onClick={() => setError('')} className="close-btn">✕</button>
            </div>
          )}

          {audit && (
            <div className="audit-results fade-in">
              <div className="results-header">
                <div className="results-left">
                  <ScoreGauge
                    score={audit.score}
                    grade={audit.grade}
                    animated={true}
                  />
                </div>
                <div className="results-right">
                  <div className="site-info">
                    <h2>Audit Results</h2>
                    <p className="url-audited">{audit.url}</p>
                    <p className="audit-time">
                      {new Date(audit.performedAt).toLocaleString()}
                    </p>

                    <div className="actions">
                      <button
                        className="btn btn-primary"
                        onClick={() => window.location.href = `/report/${audit.id || 'new'}`}
                      >
                        📄 View Full Report
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => window.print()}
                      >
                        🖨️ Print
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {audit.issues && audit.issues.length > 0 && (
                <>
                  <IssuesSummary issues={audit.issues} />
                  <CategoryBreakdown categories={audit.categories} />
                  <IssueList issues={audit.issues} />
                </>
              )}

              {(!audit.issues || audit.issues.length === 0) && (
                <div className="no-issues">
                  <div className="checkmark">✓</div>
                  <h3>Perfect!</h3>
                  <p>No SEO issues found on this site. Keep up the good work!</p>
                </div>
              )}
            </div>
          )}

          {!audit && !loading && (
            <div className="empty-state">
              <div className="empty-icon">🔍</div>
              <h3>Enter a website URL to get started</h3>
              <p>Get a professional SEO audit in 2 minutes</p>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .audit-page {
          min-height: 100vh;
          background: #f5f5f5;
        }

        .audit-container {
          padding: 40px 20px;
        }

        .error-message {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 24px;
          color: #991b1b;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .error-message strong {
          font-weight: 600;
        }

        .close-btn {
          background: none;
          border: none;
          color: inherit;
          cursor: pointer;
          font-size: 16px;
          padding: 0;
        }

        .audit-results {
          animation: fadeIn 0.3s ease;
        }

        .results-header {
          background: white;
          border-radius: 12px;
          padding: 40px;
          margin-bottom: 32px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          display: grid;
          grid-template-columns: 200px 1fr;
          gap: 40px;
          align-items: center;
        }

        .results-left {
          text-align: center;
        }

        .results-right {
          flex: 1;
        }

        .site-info h2 {
          font-size: 24px;
          font-weight: 700;
          color: #1a1a1a;
          margin-bottom: 12px;
        }

        .url-audited {
          font-size: 14px;
          color: #667eea;
          font-weight: 500;
          word-break: break-all;
          margin-bottom: 4px;
        }

        .audit-time {
          font-size: 12px;
          color: #999;
          margin-bottom: 24px;
        }

        .actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .actions .btn {
          font-size: 14px;
          padding: 10px 20px;
        }

        .no-issues {
          background: white;
          border-radius: 12px;
          padding: 60px 40px;
          text-align: center;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .checkmark {
          font-size: 64px;
          margin-bottom: 16px;
          display: block;
        }

        .no-issues h3 {
          font-size: 24px;
          font-weight: 600;
          color: #10b981;
          margin-bottom: 8px;
        }

        .no-issues p {
          color: #666;
          font-size: 16px;
        }

        .empty-state {
          text-align: center;
          padding: 80px 40px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        .empty-icon {
          font-size: 64px;
          margin-bottom: 16px;
        }

        .empty-state h3 {
          font-size: 24px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 8px;
        }

        .empty-state p {
          color: #666;
          font-size: 16px;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 768px) {
          .audit-container {
            padding: 20px;
          }

          .results-header {
            grid-template-columns: 1fr;
            gap: 24px;
            padding: 24px;
          }

          .site-info h2 {
            font-size: 20px;
          }

          .actions {
            flex-direction: column;
          }

          .actions .btn {
            width: 100%;
          }

          .empty-state {
            padding: 40px 20px;
          }
        }
      `}</style>
    </main>
  );
}
