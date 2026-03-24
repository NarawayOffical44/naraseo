'use client';

import IssueCard from './IssueCard';

export default function IssueList({ issues }) {
  // Group issues by category
  const groupedByCategory = issues.reduce((acc, issue) => {
    if (!acc[issue.category]) {
      acc[issue.category] = [];
    }
    acc[issue.category].push(issue);
    return acc;
  }, {});

  // Sort categories by severity (Critical issues first)
  const categoryOrder = ['Technical', 'On-Page', 'Accessibility', 'Mobile', 'Performance', 'Social'];
  const sortedCategories = Object.keys(groupedByCategory).sort((a, b) => {
    const aIndex = categoryOrder.indexOf(a);
    const bIndex = categoryOrder.indexOf(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return (
    <div className="issue-list">
      {sortedCategories.map((category) => (
        <div key={category} className="category-section">
          <h3 className="category-title">{category}</h3>
          <div className="issues-in-category">
            {groupedByCategory[category]
              .sort((a, b) => {
                // Sort by type: critical → warning → info
                const typeOrder = { critical: 0, warning: 1, info: 2 };
                return typeOrder[a.type] - typeOrder[b.type];
              })
              .map((issue) => (
                <IssueCard key={issue.id} issue={issue} />
              ))}
          </div>
        </div>
      ))}

      {issues.length === 0 && (
        <div className="no-issues">
          <div className="checkmark">✓</div>
          <h4>All Good!</h4>
          <p>No SEO issues found. Your page is in great shape!</p>
        </div>
      )}

      <style jsx>{`
        .issue-list {
          margin-top: 32px;
        }

        .category-section {
          margin-bottom: 32px;
        }

        .category-section:last-child {
          margin-bottom: 0;
        }

        .category-title {
          font-size: 16px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 16px;
          padding-bottom: 8px;
          border-bottom: 2px solid #e5e7eb;
        }

        .issues-in-category {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .no-issues {
          text-align: center;
          padding: 48px 24px;
          background: #f0fdf4;
          border: 2px dashed #10b981;
          border-radius: 12px;
        }

        .checkmark {
          font-size: 48px;
          margin-bottom: 12px;
        }

        .no-issues h4 {
          font-size: 18px;
          font-weight: 600;
          color: #10b981;
          margin-bottom: 8px;
        }

        .no-issues p {
          font-size: 14px;
          color: #666;
        }
      `}</style>
    </div>
  );
}
