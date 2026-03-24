'use client';

import { useState } from 'react';

export default function IssueCard({ issue }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const getTypeIcon = (type) => {
    const icons = {
      critical: '🔴',
      warning: '🟠',
      info: '🔵',
    };
    return icons[type] || '●';
  };

  const getTypeColor = (type) => {
    const colors = {
      critical: '#ef4444',
      warning: '#f97316',
      info: '#3b82f6',
    };
    return colors[type] || '#667eea';
  };

  const handleCopyCode = () => {
    if (issue.fixExample) {
      navigator.clipboard.writeText(issue.fixExample);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="issue-card" style={{ borderLeftColor: getTypeColor(issue.type) }}>
      <button
        className="issue-header"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="issue-left">
          <span className="issue-icon">{getTypeIcon(issue.type)}</span>
          <div className="issue-title-section">
            <div className="issue-title">{issue.issue}</div>
            <div className="issue-category">{issue.category}</div>
          </div>
        </div>
        <div className="issue-toggle">
          {expanded ? '▼' : '▶'}
        </div>
      </button>

      {expanded && (
        <div className="issue-details fade-in">
          <div className="detail-section">
            <div className="detail-label">Why it matters:</div>
            <div className="detail-text">{issue.detail}</div>
          </div>

          <div className="detail-section">
            <div className="detail-label">What to do:</div>
            <div className="detail-text">{issue.suggestion}</div>
          </div>

          {issue.fixExample && (
            <div className="detail-section">
              <div className="detail-label">Code example:</div>
              <div className="code-block">
                <code>{issue.fixExample}</code>
                <button
                  className="copy-btn"
                  onClick={handleCopyCode}
                  title="Copy to clipboard"
                >
                  {copied ? '✓ Copied' : '📋 Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .issue-card {
          background: white;
          border-radius: 8px;
          border-left: 4px solid;
          margin-bottom: 12px;
          overflow: hidden;
          transition: all 0.2s ease;
        }

        .issue-card:hover {
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .issue-header {
          width: 100%;
          padding: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: none;
          cursor: pointer;
          border: none;
          text-align: left;
          transition: background 0.2s ease;
        }

        .issue-header:hover {
          background: #f9fafb;
        }

        .issue-left {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          flex: 1;
        }

        .issue-icon {
          font-size: 18px;
          margin-top: 2px;
          flex-shrink: 0;
        }

        .issue-title-section {
          flex: 1;
        }

        .issue-title {
          font-weight: 600;
          color: #1a1a1a;
          font-size: 14px;
          margin-bottom: 4px;
        }

        .issue-category {
          font-size: 12px;
          color: #999;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .issue-toggle {
          font-size: 12px;
          color: #999;
          flex-shrink: 0;
          margin-left: 12px;
        }

        .issue-details {
          border-top: 1px solid #e5e7eb;
          padding: 16px;
          background: #fafbfc;
        }

        .detail-section {
          margin-bottom: 16px;
        }

        .detail-section:last-child {
          margin-bottom: 0;
        }

        .detail-label {
          font-weight: 600;
          font-size: 12px;
          color: #667eea;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          margin-bottom: 8px;
        }

        .detail-text {
          font-size: 13px;
          color: #666;
          line-height: 1.6;
        }

        .code-block {
          position: relative;
          background: #1a1a1a;
          border-radius: 6px;
          padding: 12px;
          overflow-x: auto;
          margin-top: 8px;
        }

        .code-block code {
          font-family: 'Monaco', 'Courier New', monospace;
          font-size: 12px;
          color: #667eea;
          line-height: 1.5;
          word-break: break-word;
          display: block;
          white-space: pre-wrap;
        }

        .copy-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 6px 12px;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .copy-btn:hover {
          background: #764ba2;
        }
      `}</style>
    </div>
  );
}
