'use client';

import Link from 'next/link';

export default function Navbar() {
  return (
    <nav className="navbar">
      <div className="container">
        <Link href="/" className="logo">
          🤖 SEO AI
        </Link>
        <div className="nav-links">
          <a href="#features" className="nav-link">Features</a>
          <a href="#pricing" className="nav-link">Pricing</a>
          <Link href="/audit" className="btn btn-primary">
            Get Audit
          </Link>
        </div>
      </div>

      <style jsx>{`
        .navbar {
          background: rgba(255, 255, 255, 0.95);
          border-bottom: 1px solid #e0e0e0;
          padding: 16px 0;
          position: sticky;
          top: 0;
          z-index: 100;
          backdrop-filter: blur(10px);
        }

        .navbar .container {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .logo {
          font-weight: 700;
          font-size: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          transition: opacity 0.2s ease;
        }

        .logo:hover {
          opacity: 0.7;
        }

        .nav-links {
          display: flex;
          gap: 24px;
          align-items: center;
        }

        .nav-link {
          color: #666;
          font-weight: 500;
          transition: color 0.2s ease;
          cursor: pointer;
        }

        .nav-link:hover {
          color: #667eea;
        }

        @media (max-width: 768px) {
          .nav-links {
            gap: 12px;
          }

          .nav-link {
            font-size: 14px;
          }

          .logo {
            font-size: 18px;
          }
        }
      `}</style>
    </nav>
  );
}
