import { useState } from "react";
import { Link } from "react-router-dom";
import "./App.css";

const TX_HASH = "F9C2658D82838EE7BB3ECA12C8958211BC56D0362B31F192FBB6E21FAEF4116D";
const EXPLORER = `https://testnet.xrpl.org/transactions/${TX_HASH}`;
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
      <a href="#status" onClick={() => setMenuOpen(false)}>Status</a>
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
          <Badge color="green">Testnet MVP Live</Badge>
          <Badge color="blue">XRPL Hackathon 2025</Badge>
        </div>
        <h1 className="hero-title">
          Tokenized PI Medical Lien<br />
          <span className="gradient-text">Settlement on XRPL</span>
        </h1>
        <p className="hero-sub">
          Replacing 120-day paper cycles with 3-second on-chain settlement.
          MPT liens · RLUSD payments · Configurable splits · Immutable audit trail.
        </p>
        <div className="hero-actions">
          <a href={EXPLORER} target="_blank" rel="noreferrer" className="btn btn-primary">
            View First Lien on Testnet →
          </a>
          <Link to="/dashboard" className="btn btn-outline">View Live Dashboard →</Link>
          <a href="#features" className="btn btn-outline">See What's Built</a>
        </div>
        <div className="hero-stat-row">
          <div className="hero-stat">
            <span className="stat-num">$8,500</span>
            <span className="stat-label">First lien tokenized</span>
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
        <h2 className="section-title">🚧 The Problem</h2>
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
        <h2 className="section-title">💡 The Solution</h2>
        <p className="section-sub">
          LienChain replaces the paper stack with a composable on-chain settlement layer.
        </p>
        <div className="flow">
          {[
            { step: "01", label: "Lien Tokenized", detail: "PI medical lien issued as MPT on XRPL with full metadata — bill amount, discount rate, clinic ID, maturity." },
            { step: "02", label: "Case Settles", detail: "Attorney wallet sends RLUSD to LienCo for the full settlement amount. Transaction confirmed in 3 seconds." },
            { step: "03", label: "Splits Automatically", detail: "XRPL Hook triggers disbursement — LienCo retains its configured % and remits the clinic's share instantly." },
            { step: "04", label: "Audit Trail On-Chain", detail: "Every transaction — issuance, settlement, split — is permanently recorded with JSON memo metadata." },
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
        <h2 className="section-title">✅ Features Built</h2>
        <p className="section-sub">Working testnet scripts — not mockups.</p>
        <div className="grid grid-3">
          {[
            { icon: "👛", title: "Wallet Generation", body: "Generates and funds LienCo + Clinic wallets from testnet faucet. Credentials persisted to wallets.json.", done: true },
            { icon: "🪙", title: "MPT Lien Issuance", body: "Trust line creation + PILIEN token issuance with full lien metadata in hex-encoded JSON memo.", done: true },
            { icon: "⚖️", title: "Configurable Splits", body: "Runtime split %: node settle-lien.js 8500 68. No hardcoded 70/30 — any ratio works.", done: true },
            { icon: "📨", title: "Settlement Flow", body: "Attorney → LienCo (full amount) then LienCo → Clinic (remainder). Both TXs carry structured memos.", done: true },
            { icon: "↩️", title: "Clawback (Planned)", body: "Lien reversal for case loss. MPT clawback flag set on issuance to support dispute resolution.", done: false },
            { icon: "📊", title: "Dashboard (Planned)", body: "React UI with live XRPL transaction feed, lien status tracker, and one-click settlement.", done: false },
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
        <h2 className="section-title">🛠️ Tech Stack</h2>
        <div className="tech-grid">
          {[
            { label: "XRP Ledger", sub: "L1 settlement layer" },
            { label: "MPT", sub: "Multi-Purpose Tokens" },
            { label: "RLUSD", sub: "USD stablecoin" },
            { label: "XRPL Hooks", sub: "WebAssembly logic" },
            { label: "xrpl.js", sub: "Node SDK" },
            { label: "React + Vite", sub: "Frontend" },
            { label: "IPFS", sub: "Document storage" },
          ].map(({ label, sub }) => (
            <div className="tech-chip" key={label}>
              <span className="tech-label">{label}</span>
              <span className="tech-sub">{sub}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* STATUS */}
      <Section id="status">
        <h2 className="section-title">🚀 Status</h2>
        <div className="status-grid">
          {[
            { label: "Wallet generation + funding", done: true },
            { label: "Trust line creation", done: true },
            { label: "PILIEN lien issuance with metadata", done: true },
            { label: "Configurable settlement split", done: true },
            { label: "First lien tokenized — PI-LIEN-2025-11-001 ($8,500)", done: true },
            { label: "RLUSD integration", done: false },
            { label: "XRPL Hooks automation", done: false },
            { label: "React dashboard", done: false },
          ].map(({ label, done }) => (
            <div className="status-row" key={label}>
              <span className={`status-dot ${done ? "dot-green" : "dot-yellow"}`} />
              <span className={done ? "" : "muted"}>{label}</span>
              <Badge color={done ? "green" : "yellow"}>{done ? "Complete" : "Planned"}</Badge>
            </div>
          ))}
        </div>
        <Card className="tx-card">
          <p className="tx-label">First lien TX on testnet</p>
          <code className="tx-hash">{TX_HASH}</code>
          <a href={EXPLORER} target="_blank" rel="noreferrer" className="btn btn-primary tx-btn">
            View on XRPL Explorer →
          </a>
        </Card>
      </Section>

      {/* COMPLIANCE */}
      <Section className="section-alt">
        <h2 className="section-title">🔒 Compliance</h2>
        <div className="grid grid-2">
          {[
            { label: "HIPAA", detail: "Patient data stays off-chain. IPFS stores encrypted documents; only the hash is anchored on-chain." },
            { label: "UCC Article 9", detail: "Lien metadata and perfection records structured for UCC-9 assignment compliance." },
            { label: "MO / KS Lien Laws", detail: "Maturity dates and reduction rights reflected in token metadata fields." },
            { label: "NYDFS (RLUSD)", detail: "RLUSD is a NYDFS-regulated stablecoin — settlement currency selection is compliance-aware." },
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
            <a href="https://testnet.xrpl.org" target="_blank" rel="noreferrer">XRPL Explorer →</a>
            <a href="#contact">Contact →</a>
          </div>
        </div>
      </footer>
    </>
  );
}
