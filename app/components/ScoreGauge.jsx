'use client';

import { useEffect, useState } from 'react';

export default function ScoreGauge({ score, grade, animated = true }) {
  const [displayScore, setDisplayScore] = useState(animated ? 0 : score);

  useEffect(() => {
    if (!animated) {
      setDisplayScore(score);
      return;
    }

    let animationFrame;
    let current = 0;
    const target = score || 0;
    const duration = 1500; // 1.5 seconds
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      current = Math.round(progress * target);
      setDisplayScore(current);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [score, animated]);

  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (displayScore / 100) * circumference;

  const getColor = (score) => {
    if (score >= 90) return '#10b981'; // green
    if (score >= 75) return '#f59e0b'; // amber
    if (score >= 60) return '#f97316'; // orange
    if (score >= 45) return '#ef4444'; // red
    return '#dc2626'; // dark red
  };

  const getGradeColor = (grade) => {
    const colors = {
      'A': '#10b981',
      'B': '#f59e0b',
      'C': '#f97316',
      'D': '#ef4444',
      'F': '#dc2626',
    };
    return colors[grade] || '#667eea';
  };

  return (
    <div className="score-gauge">
      <svg viewBox="0 0 120 120" className="gauge-svg">
        {/* Background circle */}
        <circle cx="60" cy="60" r="45" fill="none" stroke="#e5e7eb" strokeWidth="8" />

        {/* Progress circle */}
        <circle
          cx="60"
          cy="60"
          r="45"
          fill="none"
          stroke={getColor(displayScore)}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.1s linear' }}
        />
      </svg>

      <div className="gauge-content">
        <div className="gauge-score">{displayScore}</div>
        <div className="gauge-label">Score</div>
        <div className="gauge-grade" style={{ color: getGradeColor(grade) }}>
          {grade}
        </div>
      </div>

      <style jsx>{`
        .score-gauge {
          position: relative;
          width: 160px;
          height: 160px;
          margin: 0 auto;
        }

        .gauge-svg {
          width: 100%;
          height: 100%;
          transform: rotate(-90deg);
        }

        .gauge-content {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
          z-index: 10;
        }

        .gauge-score {
          font-size: 48px;
          font-weight: 700;
          line-height: 1;
          color: #1a1a1a;
        }

        .gauge-label {
          font-size: 12px;
          color: #999;
          margin-top: 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .gauge-grade {
          font-size: 32px;
          font-weight: 700;
          margin-top: 4px;
          line-height: 1;
        }
      `}</style>
    </div>
  );
}
