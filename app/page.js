import Navbar from './components/Navbar';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="home">
      <Navbar />

      {/* Hero Section */}
      <section className="hero">
        <div className="container">
          <div className="hero-content fade-in">
            <h1 className="hero-title">
              Your AI SEO Agency<br />
              <span className="gradient">Costs Less Than Coffee</span>
            </h1>
            <p className="hero-subtitle">
              One-click SEO audits. Professional reports. AI suggestions. Replace your $3,000/month agency.
            </p>
            <div className="hero-buttons">
              <Link href="/audit" className="btn btn-primary btn-lg">
                🔍 Start Free Audit
              </Link>
              <a href="#how-it-works" className="btn btn-secondary btn-lg">
                See How It Works
              </a>
            </div>

            <div className="hero-stats">
              <div className="stat">
                <div className="stat-number">10,000+</div>
                <div className="stat-label">Sites Audited</div>
              </div>
              <div className="stat">
                <div className="stat-number">99%</div>
                <div className="stat-label">Accuracy</div>
              </div>
              <div className="stat">
                <div className="stat-number">2 min</div>
                <div className="stat-label">Full Audit</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features">
        <div className="container">
          <h2 className="section-title">What You Get</h2>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🔍</div>
              <h3>One-Click Audits</h3>
              <p>Click the extension icon. Get results instantly. No setup, no complexity.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">📊</div>
              <h3>Professional Reports</h3>
              <p>Industry-grade reports that look like they came from a $5K/month agency.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">🤖</div>
              <h3>AI Chat Assistant</h3>
              <p>Ask anything about SEO. Get specific, actionable suggestions from Claude AI.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">🎯</div>
              <h3>Issue Highlights</h3>
              <p>See problems directly on your website with colored boxes and fix suggestions.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">📈</div>
              <h3>Ranking Tracker</h3>
              <p>Track keyword positions. Monitor your competition. See what's working.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">💰</div>
              <h3>Agency Comparison</h3>
              <p>See exactly how much an agency would charge for the same work.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="how-it-works">
        <div className="container">
          <h2 className="section-title">How It Works</h2>

          <div className="steps">
            <div className="step">
              <div className="step-number">1</div>
              <h3>Install Extension</h3>
              <p>Add to Chrome in 30 seconds. No credit card needed.</p>
            </div>

            <div className="step">
              <div className="step-number">2</div>
              <h3>Click & Audit</h3>
              <p>Go to any website. Click the SEO AI icon. Get results in 2 minutes.</p>
            </div>

            <div className="step">
              <div className="step-number">3</div>
              <h3>See Issues</h3>
              <p>Visual highlights show exactly what's wrong. Code examples show how to fix it.</p>
            </div>

            <div className="step">
              <div className="step-number">4</div>
              <h3>Ask AI</h3>
              <p>"Write me a better title" → Claude responds with exact suggestions.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="pricing">
        <div className="container">
          <h2 className="section-title">Simple Pricing</h2>

          <div className="pricing-grid">
            <div className="pricing-card">
              <h3>Free</h3>
              <div className="price">$0<span>/month</span></div>
              <ul className="features-list">
                <li>✓ 3 audits/month</li>
                <li>✓ Extension</li>
                <li>✓ Issue highlights</li>
                <li>✗ Ranking tracker</li>
                <li>✗ Unlimited audits</li>
              </ul>
              <button className="btn btn-secondary btn-full">Get Started</button>
            </div>

            <div className="pricing-card featured">
              <div className="badge">Popular</div>
              <h3>Pro</h3>
              <div className="price">$29<span>/month</span></div>
              <ul className="features-list">
                <li>✓ 20 audits/month</li>
                <li>✓ Ranking tracker</li>
                <li>✓ AI chat (unlimited)</li>
                <li>✓ PDF reports</li>
                <li>✓ Competitor compare</li>
              </ul>
              <Link href="/audit" className="btn btn-primary btn-full">Start Free Trial</Link>
            </div>

            <div className="pricing-card">
              <h3>Agency</h3>
              <div className="price">$299<span>/month</span></div>
              <ul className="features-list">
                <li>✓ Unlimited audits</li>
                <li>✓ 100 keywords tracked</li>
                <li>✓ 5 competitor analysis</li>
                <li>✓ White-label reports</li>
                <li>✓ Team access</li>
              </ul>
              <button className="btn btn-secondary btn-full">Contact Sales</button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta">
        <div className="container text-center">
          <h2>Stop Paying Agencies. Start Using AI.</h2>
          <p>One-click audits. Professional reports. Instant results.</p>
          <Link href="/audit" className="btn btn-primary btn-lg">
            🚀 Get Your Free Audit
          </Link>
        </div>
      </section>

      <style jsx>{`
        .home {
          min-height: 100vh;
        }

        /* Hero */
        .hero {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 80px 20px;
          text-align: center;
        }

        .hero-content {
          max-width: 800px;
          margin: 0 auto;
        }

        .hero-title {
          font-size: 56px;
          font-weight: 700;
          line-height: 1.2;
          margin-bottom: 24px;
        }

        .gradient {
          background: linear-gradient(135deg, #ffd89b 0%, #19547b 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .hero-subtitle {
          font-size: 20px;
          opacity: 0.9;
          margin-bottom: 32px;
          max-width: 600px;
          margin-left: auto;
          margin-right: auto;
        }

        .hero-buttons {
          display: flex;
          gap: 16px;
          justify-content: center;
          flex-wrap: wrap;
          margin-bottom: 64px;
        }

        .hero-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 32px;
          max-width: 500px;
          margin-left: auto;
          margin-right: auto;
        }

        .stat {
          padding: 20px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          backdrop-filter: blur(10px);
        }

        .stat-number {
          font-size: 32px;
          font-weight: 700;
          line-height: 1;
          margin-bottom: 8px;
        }

        .stat-label {
          font-size: 12px;
          opacity: 0.8;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        /* Sections */
        .features,
        .how-it-works,
        .pricing,
        .cta {
          padding: 80px 20px;
          background: white;
        }

        .pricing {
          background: #f9fafb;
        }

        .section-title {
          font-size: 40px;
          font-weight: 700;
          text-align: center;
          margin-bottom: 60px;
          color: #1a1a1a;
        }

        /* Features Grid */
        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 32px;
        }

        .feature-card {
          background: white;
          border-radius: 12px;
          padding: 32px 24px;
          text-align: center;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
          transition: all 0.3s ease;
        }

        .feature-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 24px rgba(102, 126, 234, 0.15);
        }

        .feature-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .feature-card h3 {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 12px;
          color: #1a1a1a;
        }

        .feature-card p {
          color: #666;
          font-size: 14px;
          line-height: 1.6;
        }

        /* Steps */
        .steps {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 32px;
        }

        .step {
          text-align: center;
        }

        .step-number {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 64px;
          height: 64px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-radius: 50%;
          font-size: 32px;
          font-weight: 700;
          margin-bottom: 16px;
        }

        .step h3 {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 12px;
          color: #1a1a1a;
        }

        .step p {
          color: #666;
          font-size: 14px;
        }

        /* Pricing */
        .pricing-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 24px;
          max-width: 1000px;
          margin-left: auto;
          margin-right: auto;
        }

        .pricing-card {
          background: white;
          border-radius: 12px;
          padding: 32px 24px;
          border: 2px solid transparent;
          transition: all 0.3s ease;
          position: relative;
        }

        .pricing-card.featured {
          border-color: #667eea;
          transform: scale(1.05);
          box-shadow: 0 12px 24px rgba(102, 126, 234, 0.2);
        }

        .pricing-card h3 {
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 16px;
          color: #1a1a1a;
        }

        .price {
          font-size: 48px;
          font-weight: 700;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 8px;
        }

        .price span {
          font-size: 16px;
          font-weight: 500;
        }

        .badge {
          position: absolute;
          top: -12px;
          left: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 6px 16px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .features-list {
          list-style: none;
          padding: 24px 0;
          border-top: 1px solid #e5e7eb;
          border-bottom: 1px solid #e5e7eb;
          margin-bottom: 24px;
        }

        .features-list li {
          padding: 8px 0;
          color: #666;
          font-size: 14px;
        }

        .btn-full {
          width: 100%;
        }

        /* CTA */
        .cta {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          text-align: center;
        }

        .cta h2 {
          font-size: 40px;
          font-weight: 700;
          margin-bottom: 16px;
        }

        .cta p {
          font-size: 18px;
          margin-bottom: 32px;
          opacity: 0.9;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .hero-title {
            font-size: 36px;
          }

          .hero-subtitle {
            font-size: 16px;
          }

          .hero-stats {
            grid-template-columns: 1fr;
            gap: 16px;
          }

          .section-title {
            font-size: 28px;
          }

          .pricing-card.featured {
            transform: scale(1);
          }

          .cta h2 {
            font-size: 28px;
          }
        }
      `}</style>
    </main>
  );
}
