import { useState } from "react";
import { Link } from "react-router-dom";
import "./App.css";
import { getNetworkConfig } from "./lib/network.js";

const DEMO_EMAIL = "matthewsabine18@gmail.com";

function Badge({ children, color = "blue" }) {
  return <span className={`badge badge-${color}`}>{children}</span>;
}

function Card({ children, className = "" }) {
  return <div className={`card ${className}`}>{children}</div>;
}

function Section({ id, children, className = "" }) {
  return (
    <section id={id} className={`section ${className}`}>
      <div className="container">{children}</div>
    </section>
  );
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [demoEmail, setDemoEmail] = useState("");
  const [demoError, setDemoError] = useState("");
  const [demoSent, setDemoSent] = useState(false);

  function handleDemoSubmit(e) {
    e.preventDefault();
    if (!demoEmail.includes("@")) {
      setDemoError("Please enter a valid email address.");
      return;
    }
    setDemoError("");
    window.location.href = `mailto:${DEMO_EMAIL}?subject=LienChain%20Demo%20Request&body=Hi%2C%20I%27d%20like%20to%20request%20a%20demo%20of%20LienChain.%0A%0AEmail%3A%20${encodeURIComponent(demoEmail)}`;
    setDemoSent(true);
  }

  const navLinks = (
    <>
      <a href="#problem" onClick={() => setMenuOpen(false)}>Problem</a>
      <a href="#solution" onClick={() => setMenuOpen(false)}>Solution</a>
      <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
      <a
        href="https://github.com/mattlearns18/lienchain"
        target="_blank"
        rel="noreferrer"
        className="btn btn-outline"
        onClick={() => setMenuOpen(false)}
      >
        GitHub
      </a>
      <Link to="/dashboard" className="btn btn-outline" onClick={() => setMenuOpen(false)}>
        Live Dashboard
      </Link>
      <a href="#contact" className="btn btn-primary" onClick={() => setMenuOpen(false)}>
        Request Demo
      </a>
    </>
  );

  return (
    <>
      {/* NAV */}
      <nav className="nav">
        <div className="container nav-inner">
          <span className="nav-logo">⛓️ LienChain</span>
          <div className="nav-links desktop-nav">{navLinks}</div>
          <button
            className="hamburger"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            <span className={`ham-bar ${menuOpen ? "open" : ""}`} />
            <span className={`ham-bar ${menuOpen ? "open" : ""}`} />
            <span className={`ham-bar ${menuOpen ? "open" : ""}`} />
          </button>
        </div>
        {menuOpen && (
          <div className="mobile-menu">
            <div className="container mobile-links">{navLinks}</div>
          </div>
        )}
      </nav>

      {/* HERO */}
      <Section className="hero">
        <div className="hero-badges">
          <Badge color="green">Mainnet-Ready Platform</Badge>
        </div>
        <h1 className="hero-title">
          Tokenized PI Medical Lien{" "}
          <span className="gradient-text">Settlement on XRPL</span>
        </h1>
        <p className="hero-sub">
          Replacing 120-day paper cycles with on-chain settlement on the XRP Ledger.
          Per-state compliance · Multi-clinic case support · Real-time portfolio analytics · Permanent on-chain audit trail.
        </p>
        <div className="hero-actions">
          <Link to="/dashboard" className="btn btn-primary">View Live Dashboard →</Link>
          <Link to="/attorney/demo" className="btn btn-outline">Attorney Portal Demo →</Link>
          <a href="#features" className="btn btn-outline">See What's Built</a>
        </div>
        <div className="hero-stat-row">
          <div className="hero-stat">
            <span className="stat-num">5</span>
            <span className="stat-label">States supported</span>
          </div>
          <div className="hero-stat">
            <span className="stat-num">3s</span>
            <span className="stat-label">Settlement finality</span>
          </div>
          <div className="hero-stat">
            <span className="stat-num">$2B</span>
            <span className="stat-label">Market opportunity</span>
          </div>
          <div className="hero-stat">
            <span className="stat-num">120→0</span>
            <span className="stat-label">Days reduced</span>
          </div>
        </div>
      </Section>

      {/* PROBLEM */}
      <Section id="problem">
        <h2 className="section-title">The Problem</h2>
        <p className="section-sub">
          The U.S. PI medical receivables market holds an estimated <strong>$2 billion</strong> in
          outstanding liens — all settled on paper, wires, and 90–120 day cycles.
        </p>
        <div className="grid grid-2">
          {[
            { icon: "📄", title: "Paper-based tracking", body: "Liens live in PDFs and spreadsheets. Documents get lost, versions conflict, disputes drag on." },
            { icon: "⏳", title: "90–120 day cycles", body: "Attorneys, clinics, and lien buyers wait months for funds that should move in seconds." },
            { icon: "🔢", title: "Opaque split math", body: "Manual split calculations lead to billing disputes between clinics and lien holders." },
            { icon: "🔍", title: "No audit trail", body: "No immutable record of lien assignment, settlement, or split — creating compliance and fraud risk." },
          ].map(({ icon, title, body }) => (
            <Card key={title}>
              <span className="card-icon">{icon}</span>
              <h3>{title}</h3>
              <p className="muted">{body}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* SOLUTION */}
      <Section id="solution" className="section-alt">
        <h2 className="section-title">The Solution</h2>
        <p className="section-sub">
          LienChain replaces the paper stack with a composable on-chain settlement layer.
        </p>
        <div className="flow">
          {[
            {
              step: "01",
              label: "Lien Tokenized",
              detail: "PI medical lien minted as an NFToken on XRPL with hex-encoded metadata (bill, split, clinic, market, attorney). Multi-clinic cases supported.",
            },
            {
              step: "02",
              label: "Waterfall Computed",
              detail: "When the case settles, the attorney portal walks gross → fee → costs → net available → per-clinic pro-rata, with state-specific rules automatically applied.",
            },
            {
              step: "03",
              label: "Fiat Confirmed",
              detail: "Operator records the attorney's wire or check arrival in LienCo's bank account. The on-chain payouts are gated on this confirmation.",
            },
            {
              step: "04",
              label: "On-Chain Payouts",
              detail: "One verifiable Payment transaction per clinic. Partial-failure recovery: any failed clinic flagged with a Retry button, idempotent re-runs only re-attempt failures.",
            },
          ].map(({ step, label, detail }) => (
            <div className="flow-step" key={step}>
              <span className="flow-num">{step}</span>
              <div>
                <h3>{label}</h3>
                <p className="muted">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* FEATURES */}
      <Section id="features">
        <h2 className="section-title">Features Built</h2>
        <p className="section-sub">A full-stack receivables settlement platform — not a mockup.</p>
        <div className="grid grid-3">
          {[
            { icon: "🪙", title: "Lien Tokenization", body: "NFTokenMint on XRPL with full metadata — bill, split, clinic, market, attorney. Every lien has a permanent on-chain record.", done: true },
            { icon: "🏥", title: "Multi-Clinic Case Support", body: "A single PI case can have N clinic liens under one case ID. Waterfall distributes the net pool across all clinics in a single settlement run.", done: true },
            { icon: "⚖️", title: "Per-State Compliance", body: "Texas hospital lien priority advisory. Configurable per-state policy layer enforced in the settlement waterfall.", done: true },
            { icon: "📊", title: "Portfolio Analytics", body: "6-tile KPI dashboard: deployed capital, at-risk exposure, recovery rate, avg days to settle, active/settled case counts. Exposure-by-market chart and aging buckets.", done: true },
            { icon: "👤", title: "Attorney Provisioning", body: "Add attorneys to a registry, generate tokenized invite URLs per case, track Invited → Accepted status. Token-gated attorney portal with full waterfall access.", done: true },
            { icon: "⛓️", title: "On-Chain Settlement", body: "Real XRPL Payment transactions per clinic. tesSUCCESS enforcement. Partial-failure recovery with per-clinic Retry. Fiat receipt gate before payouts fire.", done: true },
            { icon: "🚀", title: "Mainnet-Ready Feature Flag", body: "VITE_NETWORK=testnet|mainnet switch with separate seeds, explorer URLs, and a pre-flight checklist covering LLC, bank, E&O, and opinion-letter requirements.", done: true },
          ].map(({ icon, title, body, done }) => (
            <Card key={title} className={done ? "" : "card-dim"}>
              <div className="card-header">
                <span className="card-icon">{icon}</span>
                <Badge color={done ? "green" : "yellow"}>{done ? "Built" : "Planned"}</Badge>
              </div>
              <h3>{title}</h3>
              <p className="muted">{body}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* TECH STACK */}
      <Section className="section-alt">
        <h2 className="section-title">Tech Stack</h2>
        <div className="tech-grid">
          {[
            { label: "XRP Ledger", sub: "L1 settlement layer" },
            { label: "NFTokenMint", sub: "Lien tokenization" },
            { label: "xrpl.js", sub: "WebSocket SDK" },
            { label: "React + Vite", sub: "Frontend" },
            { label: "Vercel", sub: "Hosting + CI/CD" },
            { label: "Recharts", sub: "Analytics charts" },
          ].map(({ label, sub }) => (
            <div className="tech-chip" key={label}>
              <span className="tech-label">{label}</span>
              <span className="tech-sub">{sub}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* COMPLIANCE */}
      <Section id="compliance">
        <h2 className="section-title">Compliance</h2>
        <div className="grid grid-2">
          {[
            { label: "HIPAA", detail: "Patient data stays off-chain. Only anonymized lien metadata is anchored on-chain; no PHI in transaction memos." },
            { label: "UCC Article 9", detail: "Lien metadata and perfection records structured for UCC-9 assignment compliance." },
            { label: "MO · TX · NV Statutory Compliance", detail: "Texas 72-hour filing window advisory. Multi-state policy layer configurable per market." },
            { label: "KYC / AML", detail: "Wallet onboarding designed to integrate identity verification prior to mainnet deployment." },
          ].map(({ label, detail }) => (
            <Card key={label}>
              <h3 className="compliance-label">{label}</h3>
              <p className="muted">{detail}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* CONTACT */}
      <Section id="contact">
        <h2 className="section-title">📬 Request a Demo</h2>
        <p className="section-sub">
          Interested in tokenizing your PI medical receivables on XRPL? Drop your email and we'll be in touch.
        </p>
        <form className="demo-form" onSubmit={handleDemoSubmit}>
          {demoSent ? (
            <div className="demo-confirm">
              ✅ Your email client should have opened — we'll be in touch at <strong>{demoEmail}</strong>.
            </div>
          ) : (
            <>
              <div className="demo-row">
                <input
                  type="text"
                  className={`demo-input ${demoError ? "demo-input-error" : ""}`}
                  placeholder="you@example.com"
                  value={demoEmail}
                  onChange={(e) => { setDemoEmail(e.target.value); setDemoError(""); }}
                />
                <button type="submit" className="btn btn-primary">Request Demo</button>
              </div>
              {demoError && <p className="demo-error">{demoError}</p>}
            </>
          )}
        </form>
      </Section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="container footer-inner">
          <span className="nav-logo">⛓️ LienChain</span>
          <span className="muted">MIT License · Built on XRPL</span>
          <div className="footer-links">
            <a href="https://github.com/mattlearns18/lienchain" target="_blank" rel="noreferrer">GitHub →</a>
            <a href={getNetworkConfig().explorer} target="_blank" rel="noreferrer">XRPL Explorer →</a>
            <a href="#contact">Contact →</a>
            <Link to="/attorney/demo">Attorney Demo →</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
