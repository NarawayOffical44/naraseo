'use client';

export default function CategoryBreakdown({ categories }) {
  if (!categories || Object.keys(categories).length === 0) {
    return null;
  }

  const getColorForScore = (score) => {
    if (score >= 90) return '#10b981';
    if (score >= 75) return '#f59e0b';
    if (score >= 60) return '#f97316';
    if (score >= 45) return '#ef4444';
    return '#dc2626';
  };

  const getGradeForScore = (score) => {
    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 60) return 'C';
    if (score >= 45) return 'D';
    return 'F';
  };

  const categoryOrder = ['Technical', 'On-Page', 'Accessibility', 'Mobile', 'Performance', 'Social'];
  const sortedCategories = Object.entries(categories)
    .sort(([aKey], [bKey]) => {
      const aIndex = categoryOrder.indexOf(aKey);
      const bIndex = categoryOrder.indexOf(bKey);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

  return (
    <div className="category-breakdown">
      <h3 className="breakdown-title">Score by Category</h3>
      <div className="categories-grid">
        {sortedCategories.map(([category, score]) => (
          <div key={category} className="category-card">
            <div className="category-header">
              <span className="category-name">{category}</span>
              <span className="category-grade" style={{ color: getColorForScore(score) }}>
                {getGradeForScore(score)}
              </span>
            </div>
            <div className="score-bar">
              <div
                className="score-fill"
                style={{
                  width: `${score}%`,
                  backgroundColor: getColorForScore(score),
                }}
              />
            </div>
            <div className="score-number">{score}/100</div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .category-breakdown {
          background: white;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 32px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .breakdown-title {
          font-size: 16px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 20px;
        }

        .categories-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 16px;
        }

        .category-card {
          padding: 16px;
          background: #fafbfc;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
        }

        .category-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .category-name {
          font-size: 12px;
          font-weight: 600;
          color: #667eea;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .category-grade {
          font-size: 20px;
          font-weight: 700;
        }

        .score-bar {
          height: 6px;
          background: #e5e7eb;
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 8px;
        }

        .score-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.3s ease;
        }

        .score-number {
          font-size: 13px;
          font-weight: 600;
          color: #666;
        }

        @media (max-width: 768px) {
          .categories-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 480px) {
          .categories-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
