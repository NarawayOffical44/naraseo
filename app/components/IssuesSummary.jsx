'use client';

export default function IssuesSummary({ issues }) {
  const critical = issues.filter(i => i.type === 'critical').length;
  const warning = issues.filter(i => i.type === 'warning').length;
  const info = issues.filter(i => i.type === 'info').length;

  return (
    <div className="issues-summary">
      <div className="summary-card critical">
        <div className="summary-number">{critical}</div>
        <div className="summary-label">Critical Issues</div>
      </div>
      <div className="summary-card warning">
        <div className="summary-number">{warning}</div>
        <div className="summary-label">Warnings</div>
      </div>
      <div className="summary-card info">
        <div className="summary-number">{info}</div>
        <div className="summary-label">Info</div>
      </div>

      <style jsx>{`
        .issues-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 16px;
          margin-bottom: 32px;
        }

        .summary-card {
          background: white;
          border-radius: 12px;
          padding: 20px;
          text-align: center;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          border-top: 4px solid;
        }

        .summary-card.critical {
          border-top-color: #ef4444;
        }

        .summary-card.warning {
          border-top-color: #f97316;
        }

        .summary-card.info {
          border-top-color: #3b82f6;
        }

        .summary-number {
          font-size: 36px;
          font-weight: 700;
          line-height: 1;
          margin-bottom: 8px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .summary-label {
          font-size: 12px;
          font-weight: 600;
          color: #999;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        @media (max-width: 768px) {
          .issues-summary {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        @media (max-width: 480px) {
          .summary-card {
            padding: 16px;
          }

          .summary-number {
            font-size: 28px;
          }
        }
      `}</style>
    </div>
  );
}
