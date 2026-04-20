import { useState, useEffect } from "react";

const C = {
  bg: "#06090f",
  bgCard: "#0c1017",
  surface: "#141c28",
  border: "#1a2636",
  teal: "#00d4aa",
  tealDim: "rgba(0,212,170,0.08)",
  tealGlow: "rgba(0,212,170,0.25)",
  cyan: "#06b6d4",
  gold: "#f0b850",
  red: "#ef4444",
  green: "#22c55e",
  white: "#f1f5f9",
  text: "#c8d6e5",
  dim: "#6b7f96",
  muted: "#3d5068",
};

const MOCK_CASE = {
  caseId: "PI-LIEN-KC-001",
  market: "KC",
  state: "Missouri",
  statute: "RSMo 484.130",
  clinic: "KC Pain & Recovery",
  clinicAddress: "1234 Main St, Kansas City, MO 64106",
  patient: "Patient ID: 0xaf3...c91 (encrypted)",
  attorney: "Smith & Assoc.",
  attorneyBarNum: "MO Bar #54321",
  incidentDate: "November 5, 2025",
  treatmentDate: "November 6, 2025",
  billAmount: 8500,
  lienCoShare: 70,
  clinicShare: 30,
  settlementAmount: 8500,
  xrplAddress: "rLienCo...Main",
  caseStatus: "Active",
  daysOpen: 142,
  memo: "Medical lien for auto accident — MVA 11/05/2025",
};

const fmt = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Section({ children, style = {} }) {
  return (
    <section style={{ padding: "40px 24px", maxWidth: 720, margin: "0 auto", ...style }}>
      {children}
    </section>
  );
}

function InfoRow({ label, value, valueColor }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 13, color: C.dim, fontFamily: "'IBM Plex Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 14, color: valueColor || C.white, fontWeight: 500, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function SplitVisual({ lienCo, clinic, total }) {
  const lienCoAmt = total * lienCo / 100;
  const clinicAmt = total * clinic / 100;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginTop: 20 }}>
      <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14, fontFamily: "'IBM Plex Mono', monospace" }}>
        Settlement Breakdown
      </div>
      <div style={{ display: "flex", height: 44, borderRadius: 10, overflow: "hidden", marginBottom: 16, border: `1px solid ${C.border}` }}>
        <div style={{ width: `${lienCo}%`, background: `linear-gradient(135deg, ${C.teal}, ${C.cyan})`, display: "flex", alignItems: "center", justifyContent: "center", color: C.bg, fontWeight: 700, fontSize: 13 }}>
          {lienCo}%
        </div>
        <div style={{ width: `${clinic}%`, background: C.green, display: "flex", alignItems: "center", justifyContent: "center", color: C.bg, fontWeight: 700, fontSize: 13 }}>
          {clinic}%
        </div>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1, background: C.tealDim, borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, color: C.teal, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, fontFamily: "'IBM Plex Mono', monospace" }}>
            To LienCo ({lienCo}%)
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.teal, marginTop: 4 }}>{fmt(lienCoAmt)}</div>
        </div>
        <div style={{ flex: 1, background: "rgba(34,197,94,0.08)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, color: C.green, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, fontFamily: "'IBM Plex Mono', monospace" }}>
            To Clinic ({clinic}%)
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.green, marginTop: 4 }}>{fmt(clinicAmt)}</div>
        </div>
      </div>
    </div>
  );
}

function ComplianceBadges({ state, statute }) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
      <div style={{ background: C.tealDim, border: `1px solid ${C.teal}40`, borderRadius: 8, padding: "8px 14px", fontSize: 12, color: C.teal, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
        ✓ {state} compliant
      </div>
      <div style={{ background: C.tealDim, border: `1px solid ${C.teal}40`, borderRadius: 8, padding: "8px 14px", fontSize: 12, color: C.teal, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
        ✓ {statute}
      </div>
      <div style={{ background: C.tealDim, border: `1px solid ${C.teal}40`, borderRadius: 8, padding: "8px 14px", fontSize: 12, color: C.teal, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
        ✓ HIPAA compliant
      </div>
      <div style={{ background: C.tealDim, border: `1px solid ${C.teal}40`, borderRadius: 8, padding: "8px 14px", fontSize: 12, color: C.teal, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
        ✓ Court admissible
      </div>
    </div>
  );
}

function PaymentModal({ onClose, onComplete, caseData }) {
  const [phase, setPhase] = useState("confirm");
  const [step, setStep] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("wire");

  const steps = [
    { label: "Verifying attorney credentials", detail: caseData.attorneyBarNum },
    { label: "Confirming lien details", detail: caseData.statute },
    { label: "Executing settlement on XRPL", detail: "Hook auto-splitting funds" },
    { label: "Settlement complete", detail: "3.2 seconds" },
  ];

  useEffect(() => {
    if (phase === "running") {
      if (step < 3) {
        const t = setTimeout(() => setStep(s => s + 1), 1200);
        return () => clearTimeout(t);
      } else {
        const t = setTimeout(() => setPhase("done"), 800);
        return () => clearTimeout(t);
      }
    }
  }, [phase, step]);

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: "36px 40px", width: "100%", maxWidth: 520, position: "relative", maxHeight: "90vh", overflowY: "auto" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 14, right: 18, background: "none", border: "none", color: C.dim, fontSize: 24, cursor: "pointer", padding: 4, lineHeight: 1 }}>×</button>
        {phase === "confirm" && (
          <>
            <h2 style={{ margin: "0 0 8px", fontSize: 22, color: C.white, fontFamily: "'Outfit', sans-serif", fontWeight: 700 }}>Confirm Settlement</h2>
            <p style={{ color: C.dim, fontSize: 14, margin: "0 0 24px" }}>You're about to settle {caseData.caseId} for {fmt(caseData.settlementAmount)}</p>
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10, fontFamily: "'IBM Plex Mono', monospace" }}>Payment Method</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, border: `1px solid ${paymentMethod === "wire" ? C.teal : C.border}`, cursor: "pointer", background: paymentMethod === "wire" ? C.tealDim : "transparent" }}>
                  <input type="radio" checked={paymentMethod === "wire"} onChange={() => setPaymentMethod("wire")} style={{ accentColor: C.teal }} />
                  <div>
                    <div style={{ fontSize: 14, color: C.white, fontWeight: 500 }}>Wire transfer → auto-convert to RLUSD</div>
                    <div style={{ fontSize: 12, color: C.dim }}>Standard bank wire. We handle the conversion.</div>
                  </div>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, border: `1px solid ${paymentMethod === "rlusd" ? C.teal : C.border}`, cursor: "pointer", background: paymentMethod === "rlusd" ? C.tealDim : "transparent" }}>
                  <input type="radio" checked={paymentMethod === "rlusd"} onChange={() => setPaymentMethod("rlusd")} style={{ accentColor: C.teal }} />
                  <div>
                    <div style={{ fontSize: 14, color: C.white, fontWeight: 500 }}>Direct RLUSD transfer</div>
                    <div style={{ fontSize: 12, color: C.dim }}>If you already hold RLUSD. Fastest option.</div>
                  </div>
                </label>
              </div>
            </div>
            <div style={{ background: C.tealDim, border: `1px solid ${C.teal}40`, borderRadius: 10, padding: 14, marginBottom: 20, fontSize: 12, color: C.teal, fontFamily: "'IBM Plex Mono', monospace" }}>
              By clicking Execute, you authorize settlement under {caseData.statute}. Transaction will be recorded on XRPL and signed with your Bar #{caseData.attorneyBarNum.replace('MO Bar #', '')} credentials.
            </div>
            <button onClick={() => { setPhase("running"); setStep(0); }} style={{ width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${C.teal}, ${C.cyan})`, color: C.bg, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "'Outfit', sans-serif", boxShadow: `0 8px 30px ${C.tealGlow}` }}>
              Execute Settlement — {fmt(caseData.settlementAmount)}
            </button>
          </>
        )}
        {(phase === "running" || phase === "done") && (
          <>
            <h2 style={{ margin: "0 0 8px", fontSize: 22, color: C.white, fontFamily: "'Outfit', sans-serif", fontWeight: 700 }}>
              {phase === "done" ? "Settlement Complete" : "Processing Settlement..."}
            </h2>
            <p style={{ color: C.dim, fontSize: 14, margin: "0 0 28px" }}>{caseData.caseId} — {fmt(caseData.settlementAmount)}</p>
            <div style={{ display: "flex", flexDirection: "column", marginBottom: 24 }}>
              {steps.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 14, opacity: (step >= i || phase === "done") ? 1 : 0.25, transition: "opacity 0.4s" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 28 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, background: (step > i || phase === "done") ? C.green : step === i ? C.teal : C.surface, color: (step >= i || phase === "done") ? C.bg : C.muted, transition: "all 0.3s" }}>
                      {(step > i || phase === "done") ? "✓" : i + 1}
                    </div>
                    {i < 3 && <div style={{ width: 2, height: 28, background: (step > i || phase === "done") ? C.teal : C.border }} />}
                  </div>
                  <div style={{ paddingTop: 4, paddingBottom: i < 3 ? 14 : 0 }}>
                    <div style={{ color: (step >= i || phase === "done") ? C.white : C.muted, fontSize: 14, fontWeight: 500 }}>{s.label}</div>
                    <div style={{ color: C.dim, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>{s.detail}</div>
                  </div>
                </div>
              ))}
            </div>
            {phase === "done" && (
              <>
                <div style={{ background: C.tealDim, border: `1px solid ${C.teal}40`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>Transaction Hash</div>
                  <div style={{ fontSize: 12, color: C.teal, fontFamily: "'IBM Plex Mono', monospace", wordBreak: "break-all" }}>A8F2D1C9B3E7...9B3E</div>
                </div>
                <a href="https://testnet.xrpl.org" target="_blank" rel="noopener" style={{ display: "block", textAlign: "center", padding: "12px 0", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`, color: C.teal, fontWeight: 600, fontSize: 13, textDecoration: "none", marginBottom: 10 }}>
                  View on XRPL Explorer →
                </a>
                <button onClick={onComplete} style={{ width: "100%", padding: "12px 0", borderRadius: 10, background: `linear-gradient(135deg, ${C.teal}, ${C.cyan})`, color: C.bg, border: "none", fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: "'Outfit', sans-serif" }}>
                  Done
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function AttorneyPortal() {
  const [showPayment, setShowPayment] = useState(false);
  const [completed, setCompleted] = useState(false);
  const caseData = MOCK_CASE;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>
      {showPayment && !completed && (
        <PaymentModal
          onClose={() => setShowPayment(false)}
          onComplete={() => { setCompleted(true); setShowPayment(false); }}
          caseData={caseData}
        />
      )}
      <nav style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: `linear-gradient(135deg, ${C.teal}, ${C.cyan})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900, color: C.bg, fontFamily: "'Outfit', sans-serif" }}>L</div>
          <span style={{ fontSize: 17, fontWeight: 800, color: C.white, fontFamily: "'Outfit', sans-serif", letterSpacing: -0.5 }}>LienChain</span>
          <span style={{ fontSize: 10, color: C.dim, background: C.surface, padding: "3px 8px", borderRadius: 5, fontFamily: "'IBM Plex Mono', monospace", textTransform: "uppercase", letterSpacing: 1.2 }}>Attorney Portal</span>
        </div>
        <a href="/" style={{ fontSize: 13, color: C.dim, textDecoration: "none" }}>← Back to LienChain</a>
      </nav>
      <Section>
        {completed ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: C.tealDim, border: `2px solid ${C.teal}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 36, color: C.teal }}>✓</div>
            <h1 style={{ fontSize: 32, color: C.white, fontFamily: "'Outfit', sans-serif", fontWeight: 800, margin: "0 0 12px" }}>Settlement Complete</h1>
            <p style={{ fontSize: 16, color: C.text, maxWidth: 480, margin: "0 auto 28px", lineHeight: 1.6 }}>
              {caseData.caseId} has been settled. {fmt(caseData.settlementAmount)} was distributed between LienCo and the clinic in 3.2 seconds. A full audit trail is available on the XRPL public ledger.
            </p>
            <a href="https://testnet.xrpl.org" target="_blank" rel="noopener" style={{ display: "inline-block", padding: "14px 32px", borderRadius: 12, background: `linear-gradient(135deg, ${C.teal}, ${C.cyan})`, color: C.bg, fontWeight: 700, fontSize: 14, textDecoration: "none", fontFamily: "'Outfit', sans-serif" }}>
              View on XRPL Explorer
            </a>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 11, color: C.teal, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
                Case Ready for Settlement
              </div>
              <h1 style={{ fontSize: "clamp(28px, 4vw, 42px)", color: C.white, fontFamily: "'Outfit', sans-serif", fontWeight: 800, margin: "0 0 8px", lineHeight: 1.2 }}>
                {caseData.caseId}
              </h1>
              <p style={{ fontSize: 15, color: C.dim }}>
                Attorney: <span style={{ color: C.text }}>{caseData.attorney}</span> · <span style={{ color: C.dim }}>{caseData.attorneyBarNum}</span>
              </p>
            </div>
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: "28px 32px", marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>
                Case Details
              </div>
              <InfoRow label="Clinic" value={caseData.clinic} />
              <InfoRow label="Clinic Address" value={caseData.clinicAddress} />
              <InfoRow label="Patient" value={caseData.patient} />
              <InfoRow label="Incident Date" value={caseData.incidentDate} />
              <InfoRow label="Treatment Date" value={caseData.treatmentDate} />
              <InfoRow label="Days Open" value={caseData.daysOpen + " days"} />
              <InfoRow label="Medical Bill Total" value={fmt(caseData.billAmount)} valueColor={C.white} />
            </div>
            <SplitVisual
              lienCo={caseData.lienCoShare}
              clinic={caseData.clinicShare}
              total={caseData.settlementAmount}
            />
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: "24px 28px", marginTop: 20 }}>
              <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4, fontFamily: "'IBM Plex Mono', monospace" }}>
                Compliance
              </div>
              <p style={{ fontSize: 13, color: C.text, margin: "8px 0 4px", lineHeight: 1.6 }}>
                This settlement complies with {caseData.state} lien law under {caseData.statute}. All patient health information is encrypted and stored off-chain per HIPAA requirements.
              </p>
              <ComplianceBadges state={caseData.state} statute={caseData.statute} />
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
              <button onClick={() => setShowPayment(true)} style={{
                flex: "1 1 280px",
                padding: "18px 32px", borderRadius: 12, border: "none", cursor: "pointer",
                background: `linear-gradient(135deg, ${C.teal}, ${C.cyan})`, color: C.bg,
                fontSize: 15, fontWeight: 700, fontFamily: "'Outfit', sans-serif",
                boxShadow: `0 8px 30px ${C.tealGlow}`, transition: "transform 0.2s",
              }}
                onMouseEnter={e => e.target.style.transform = "translateY(-2px)"}
                onMouseLeave={e => e.target.style.transform = "translateY(0)"}
              >
                Settle Now — {fmt(caseData.settlementAmount)}
              </button>
              <button style={{
                flex: "1 1 180px",
                padding: "18px 28px", borderRadius: 12, cursor: "pointer",
                background: "transparent", color: C.text, border: `1px solid ${C.border}`,
                fontSize: 14, fontWeight: 600, fontFamily: "'Outfit', sans-serif",
              }}>
                Request Reduction
              </button>
            </div>
            <div style={{ marginTop: 32, padding: "20px 24px", background: C.surface, borderRadius: 12, fontSize: 13, color: C.dim, lineHeight: 1.7 }}>
              <strong style={{ color: C.text }}>No blockchain knowledge required.</strong> You enter your payment method — we handle the rest. Settlement completes in 3 seconds. Full audit trail on the XRPL public ledger. Questions? Contact <a href="mailto:support@lienchain.com" style={{ color: C.teal }}>support@lienchain.com</a>
            </div>
          </>
        )}
      </Section>
    </div>
  );
}
