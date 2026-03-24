'use client';

import { useState } from 'react';

export default function AuditForm({ onSubmit, loading }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [maxPages, setMaxPages] = useState('10');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate URL
    try {
      new URL(url);
    } catch {
      setError('Please enter a valid URL (e.g., https://example.com)');
      return;
    }

    await onSubmit({ url, maxPages: parseInt(maxPages) });
  };

  return (
    <form onSubmit={handleSubmit} className="audit-form">
      <div className="form-group">
        <label htmlFor="url">Website URL</label>
        <div className="input-wrapper">
          <input
            id="url"
            type="url"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError('');
            }}
            disabled={loading}
            required
          />
          {url && !error && <span className="checkmark">✓</span>}
        </div>
        {error && <span className="error-message">{error}</span>}
        <p className="helper-text">
          We'll audit your homepage and crawl up to {maxPages} pages
        </p>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="pages">Pages to crawl</label>
          <select
            id="pages"
            value={maxPages}
            onChange={(e) => setMaxPages(e.target.value)}
            disabled={loading}
          >
            <option value="10">10 pages (Free)</option>
            <option value="50">50 pages (Pro)</option>
            <option value="500">500 pages (Full site)</option>
          </select>
        </div>
      </div>

      <button
        type="submit"
        className="btn btn-primary btn-lg"
        disabled={loading || !url}
      >
        {loading ? (
          <>
            <span className="spinner-small" />
            Analyzing...
          </>
        ) : (
          '🔍 Audit This Site'
        )}
      </button>

      <style jsx>{`
        .audit-form {
          background: white;
          border-radius: 12px;
          padding: 32px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
          margin-bottom: 32px;
        }

        .form-group {
          margin-bottom: 24px;
        }

        .form-group:last-child {
          margin-bottom: 0;
        }

        label {
          display: block;
          font-weight: 600;
          font-size: 14px;
          color: #1a1a1a;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .input-wrapper {
          position: relative;
        }

        input[type="url"],
        select {
          width: 100%;
          padding: 12px 16px;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          font-size: 14px;
          transition: all 0.2s ease;
        }

        input[type="url"]:focus,
        select:focus {
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        input[type="url"]:disabled,
        select:disabled {
          background: #f5f5f5;
          color: #999;
          cursor: not-allowed;
        }

        .checkmark {
          position: absolute;
          right: 12px;
          top: 12px;
          color: #10b981;
          font-size: 18px;
        }

        .helper-text {
          font-size: 12px;
          color: #999;
          margin-top: 8px;
        }

        .error-message {
          display: block;
          color: #ef4444;
          font-size: 12px;
          margin-top: 6px;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
        }

        .btn-lg {
          width: 100%;
          padding: 16px 24px;
          font-size: 16px;
          font-weight: 600;
          margin-top: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .btn-lg:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .spinner-small {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top: 2px solid white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .audit-form {
            padding: 24px 16px;
          }

          .form-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </form>
  );
}
