import { useState, useEffect } from "react";
import ReductionModal from "../components/ReductionModal.jsx";

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
  redDim: "rgba(239,68,68,0.1)",
  redBorder: "rgba(239,68,68,0.3)",
  amber: "#fbbf24",
  amberDim: "rgba(245,158,11,0.1)",
  amberBorder: "rgba(245,158,11,0.3)",
  green: "#22c55e",
  greenDim: "rgba(34,197,94,0.08)",
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
  expectedSettlement: 25000,
  xrplAddress: "rLienCo...Main",
  caseStatus: "Active",
  daysOpen: 142,
  memo: "Medical lien for auto accident — MVA 11/05/2025",
};

const fmt = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

// ── WaterfallSection (inline-styled, matches AttorneyPortal's design palette) ─
function WaterfallSection({ bill, lienCoShare, clinicShare, onWaterfallChange }) {
  const [gross,      setGross]      = useState(String(MOCK_CASE.expectedSettlement));
  const [attyFeePct, setAttyFeePct] = useState(33);
  const [costs,      setCosts]      = useState("");

  const grossNum    = parseFloat(gross)  || 0;
  const costsNum    = parseFloat(costs)  || 0;
  const attyFeeAmt  = Math.round(grossNum * attyFeePct / 100);
  const netAvailable  = grossNum - attyFeeAmt - costsNum;
  const onChainAmount = Math.min(bill, Math.max(0, netAvailable));
  const lienCoAmt     = onChainAmount * lienCoShare / 100;
  const clinicAmt     = onChainAmount * clinicShare / 100;
  const patientNet    = netAvailable - onChainAmount;

  const isNetNeg     = netAvailable < 0;
  const isPatientNeg = patientNet < 0 && !isNetNeg;

  useEffect(() => {
    onWaterfallChange({ grossNum, attyFeePct, attyFeeAmt, costsNum, netAvailable, onChainAmount, lienCoAmt, clinicAmt, patientNet });
  }, [grossNum, attyFeePct, costsNum]);

  const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "28px 32px", marginBottom: 24 };
  const eyebrow = { fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 16, fontFamily: "'IBM Plex Mono', monospace" };
  const label = { fontSize: 12, color: C.dim, fontFamily: "'IBM Plex Mono', monospace", display: "block", marginBottom: 6 };
  const inputStyle = { width: "100%", background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", color: C.white, fontSize: 14, outline: "none", boxSizing: "border-box" };
  const helpText = { fontSize: 11, color: C.dim, marginTop: 4 };
  const divider = { height: 1, background: C.border, margin: "8px 0" };
  const row = { display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 0", fontSize: 14 };
  const indented = { paddingLeft: 18, fontSize: 13 };

  return (
    <div style={card}>
      <div style={eyebrow}>Settlement Waterfall</div>

      {/* Inputs */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
        <div>
          <span style={label}>Gross Settlement Amount ($)</span>
          <input
            type="number" min="0" value={gross}
            onChange={e => setGross(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div>
          <span style={label}>Attorney Fee — <strong style={{ color: C.white }}>{attyFeePct}%</strong></span>
          <input
            type="range" min={10} max={50} value={attyFeePct}
            onChange={e => setAttyFeePct(Number(e.target.value))}
            style={{ width: "100%", accentColor: C.teal, cursor: "pointer" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.dim, marginTop: 2 }}>
            <span>10%</span><span>50%</span>
          </div>
        </div>

        <div>
          <span style={label}>Case Costs ($)</span>
          <input
            type="number" min="0" value={costs}
            onChange={e => setCosts(e.target.value)} placeholder="0"
            style={inputStyle}
          />
          <div style={helpText}>Filing fees, depositions, expert witnesses, medical records, etc.</div>
        </div>
      </div>

      {/* Breakdown table */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 20px" }}>
        <div style={row}>
          <span style={{ color: C.dim }}>Gross Settlement</span>
          <span style={{ color: C.white, fontWeight: 600 }}>{fmt(grossNum)}</span>
        </div>
        <div style={row}>
          <span style={{ ...indented, color: C.dim }}>− Attorney Fee ({attyFeePct}%)</span>
          <span style={{ color: C.muted, fontWeight: 400 }}>−{fmt(attyFeeAmt)}</span>
        </div>
        <div style={row}>
          <span style={{ ...indented, color: C.dim }}>− Case Costs</span>
          <span style={{ color: C.muted, fontWeight: 400 }}>−{fmt(costsNum)}</span>
        </div>
        <div style={divider} />
        <div style={row}>
          <span style={{ color: C.white, fontWeight: 600 }}>Net Available for Liens</span>
          <span style={{ color: isNetNeg ? C.red : C.teal, fontWeight: 700, fontSize: 16 }}>
            {fmt(Math.max(0, netAvailable))}
          </span>
        </div>
        <div style={divider} />
        <div style={row}>
          <span style={{ ...indented, color: C.teal }}>LienCo ({lienCoShare}%)</span>
          <span style={{ color: C.teal, fontWeight: 600 }}>{fmt(lienCoAmt)}</span>
        </div>
        <div style={row}>
          <span style={{ ...indented, color: C.green }}>Clinic ({clinicShare}%)</span>
          <span style={{ color: C.green, fontWeight: 600 }}>{fmt(clinicAmt)}</span>
        </div>
        <div style={divider} />
        <div style={row}>
          <span style={{ color: C.white, fontWeight: 600 }}>Patient Net Recovery</span>
          <span style={{ color: isPatientNeg ? C.amber : C.white, fontWeight: 700, fontSize: 16 }}>
            {fmt(patientNet)}
          </span>
        </div>
      </div>

      {/* Warnings */}
      {isNetNeg && (
        <div style={{ marginTop: 14, background: C.redDim, border: `1px solid ${C.redBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.red, lineHeight: 1.5 }}>
          Settlement does not cover attorney fees and costs. Consider requesting lien reduction.
        </div>
      )}
      {isPatientNeg && (
        <div style={{ marginTop: 14, background: C.amberDim, border: `1px solid ${C.amberBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.amber, lineHeight: 1.5 }}>
          ⚠ Settlement does not leave a net recovery for the patient. Lien reduction may be necessary.
        </div>
      )}
    </div>
  );
}

// ── SplitVisual ───────────────────────────────────────────────────────────────
function SplitVisual({ lienCo, clinic, amount }) {
  const lienCoAmt = amount * lienCo / 100;
  const clinicAmt = amount * clinic / 100;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginTop: 20 }}>
      <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14, fontFamily: "'IBM Plex Mono', monospace" }}>
        On-Chain Split (net settlement amount)
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
        <div style={{ flex: 1, background: C.greenDim, borderRadius: 10, padding: "14px 16px" }}>
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
      {[`✓ ${state} compliant`, `✓ ${statute}`, "✓ HIPAA compliant", "✓ Court admissible"].map(b => (
        <div key={b} style={{ background: C.tealDim, border: `1px solid ${C.teal}40`, borderRadius: 8, padding: "8px 14px", fontSize: 12, color: C.teal, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
          {b}
        </div>
      ))}
    </div>
  );
}

// ── PaymentModal ──────────────────────────────────────────────────────────────
function PaymentModal({ onClose, onComplete, caseData, waterfall }) {
  const [phase, setPhase]         = useState("confirm");
  const [step, setStep]           = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("wire");

  const settleAmt = waterfall?.onChainAmount ?? caseData.billAmount;
  const lienCoAmt = waterfall?.lienCoAmt     ?? caseData.billAmount * caseData.lienCoShare / 100;
  const clinicAmt = waterfall?.clinicAmt     ?? caseData.billAmount * caseData.clinicShare / 100;

  const steps = [
    { label: "Verifying attorney credentials", detail: caseData.attorneyBarNum },
    { label: "Confirming lien details",         detail: caseData.statute },
    { label: "Executing settlement on XRPL",    detail: "Hook auto-splitting funds" },
    { label: "Settlement complete",             detail: "3.2 seconds" },
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

  function handleExecute() {
    const memoData = {
      case:               caseData.caseId,
      grossSettlement:    waterfall?.grossNum,
      attorneyFeePercent: waterfall?.attyFeePct,
      attorneyFeeAmount:  waterfall?.attyFeeAmt,
      caseCosts:          waterfall?.costsNum,
      netAvailable:       waterfall?.netAvailable,
      lienCoShare:        caseData.lienCoShare,
      clinicShare:        caseData.clinicShare,
      lienCoAmount:       lienCoAmt,
      clinicAmount:       clinicAmt,
      patientNetRecovery: waterfall?.patientNet,
    };
    console.log("[LienChain] Settlement memo (on-chain data):", memoData);
    setPhase("running");
    setStep(0);
  }

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: "36px 40px", width: "100%", maxWidth: 520, position: "relative", maxHeight: "90vh", overflowY: "auto" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 14, right: 18, background: "none", border: "none", color: C.dim, fontSize: 24, cursor: "pointer", padding: 4, lineHeight: 1 }}>×</button>

        {phase === "confirm" && (
          <>
            <h2 style={{ margin: "0 0 4px", fontSize: 22, color: C.white, fontFamily: "'Outfit', sans-serif", fontWeight: 700 }}>Confirm Settlement</h2>
            <p style={{ color: C.dim, fontSize: 14, margin: "0 0 20px" }}>Settling {caseData.caseId}</p>

            {/* Waterfall summary — read-only */}
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 20px", marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10, fontFamily: "'IBM Plex Mono', monospace" }}>Amount Settling On-Chain</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", fontSize: 14 }}>
                <span style={{ color: C.dim }}>Net of attorney fee &amp; case costs</span>
                <span style={{ color: C.white, fontWeight: 700, fontSize: 18 }}>{fmt(settleAmt)}</span>
              </div>
              <div style={{ height: 1, background: C.border, margin: "8px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}>
                <span style={{ color: C.teal, paddingLeft: 14 }}>LienCo ({caseData.lienCoShare}%)</span>
                <span style={{ color: C.teal, fontWeight: 600 }}>{fmt(lienCoAmt)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}>
                <span style={{ color: C.green, paddingLeft: 14 }}>Clinic ({caseData.clinicShare}%)</span>
                <span style={{ color: C.green, fontWeight: 600 }}>{fmt(clinicAmt)}</span>
              </div>
            </div>

            {/* Payment method */}
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10, fontFamily: "'IBM Plex Mono', monospace" }}>Payment Method</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { id: "wire",  title: "Wire transfer → auto-convert to RLUSD", sub: "Standard bank wire. We handle the conversion." },
                  { id: "rlusd", title: "Direct RLUSD transfer",                  sub: "If you already hold RLUSD. Fastest option." },
                ].map(m => (
                  <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, border: `1px solid ${paymentMethod === m.id ? C.teal : C.border}`, cursor: "pointer", background: paymentMethod === m.id ? C.tealDim : "transparent" }}>
                    <input type="radio" checked={paymentMethod === m.id} onChange={() => setPaymentMethod(m.id)} style={{ accentColor: C.teal }} />
                    <div>
                      <div style={{ fontSize: 14, color: C.white, fontWeight: 500 }}>{m.title}</div>
                      <div style={{ fontSize: 12, color: C.dim }}>{m.sub}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ background: C.tealDim, border: `1px solid ${C.teal}40`, borderRadius: 10, padding: 14, marginBottom: 20, fontSize: 12, color: C.teal, fontFamily: "'IBM Plex Mono', monospace" }}>
              By clicking Execute, you authorize settlement under {caseData.statute}. Transaction will be recorded on XRPL and signed with your Bar #{caseData.attorneyBarNum.replace("MO Bar #", "")} credentials.
            </div>
            <button onClick={handleExecute} style={{ width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${C.teal}, ${C.cyan})`, color: C.bg, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "'Outfit', sans-serif", boxShadow: `0 8px 30px ${C.tealGlow}` }}>
              Execute Settlement — {fmt(settleAmt)}
            </button>
          </>
        )}

        {(phase === "running" || phase === "done") && (
          <>
            <h2 style={{ margin: "0 0 8px", fontSize: 22, color: C.white, fontFamily: "'Outfit', sans-serif", fontWeight: 700 }}>
              {phase === "done" ? "Settlement Complete" : "Processing Settlement..."}
            </h2>
            <p style={{ color: C.dim, fontSize: 14, margin: "0 0 28px" }}>{caseData.caseId} — {fmt(settleAmt)}</p>
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

// ── AttorneyPortal ────────────────────────────────────────────────────────────
export default function AttorneyPortal() {
  const [showPayment,   setShowPayment]   = useState(false);
  const [showReduction, setShowReduction] = useState(false);
  const [toast,         setToast]         = useState("");
  const [completed,     setCompleted]     = useState(false);
  const [waterfall,     setWaterfall]     = useState(null);
  const caseData = MOCK_CASE;

  // Default on-chain amount for the button label before user interacts with waterfall
  const settleAmt = waterfall?.onChainAmount ?? caseData.billAmount;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.5; }
      `}</style>
      {toast && <div className="rm-toast">{toast}</div>}
      {showPayment && !completed && (
        <PaymentModal
          onClose={() => setShowPayment(false)}
          onComplete={() => { setCompleted(true); setShowPayment(false); }}
          caseData={caseData}
          waterfall={waterfall}
        />
      )}
      {showReduction && (
        <ReductionModal
          caseId={caseData.caseId}
          bill={caseData.billAmount}
          split={caseData.lienCoShare}
          attorneyName={caseData.attorney}
          onClose={() => setShowReduction(false)}
          onSubmitted={(id) => {
            setToast(`Reduction request submitted for case ${id}`);
            setTimeout(() => setToast(""), 3500);
          }}
        />
      )}

      {/* Nav */}
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
              {caseData.caseId} has been settled. {fmt(settleAmt)} was distributed between LienCo and the clinic in 3.2 seconds. A full audit trail is available on the XRPL public ledger.
            </p>
            <a href="https://testnet.xrpl.org" target="_blank" rel="noopener" style={{ display: "inline-block", padding: "14px 32px", borderRadius: 12, background: `linear-gradient(135deg, ${C.teal}, ${C.cyan})`, color: C.bg, fontWeight: 700, fontSize: 14, textDecoration: "none", fontFamily: "'Outfit', sans-serif" }}>
              View on XRPL Explorer
            </a>
          </div>
        ) : (
          <>
            {/* Header */}
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

            {/* Case details */}
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

            {/* Settlement Waterfall — above the split visual */}
            <WaterfallSection
              bill={caseData.billAmount}
              lienCoShare={caseData.lienCoShare}
              clinicShare={caseData.clinicShare}
              onWaterfallChange={setWaterfall}
            />

            {/* Split visual — uses waterfall on-chain amount */}
            <SplitVisual
              lienCo={caseData.lienCoShare}
              clinic={caseData.clinicShare}
              amount={settleAmt}
            />

            {/* Compliance */}
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: "24px 28px", marginTop: 20 }}>
              <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4, fontFamily: "'IBM Plex Mono', monospace" }}>
                Compliance
              </div>
              <p style={{ fontSize: 13, color: C.text, margin: "8px 0 4px", lineHeight: 1.6 }}>
                This settlement complies with {caseData.state} lien law under {caseData.statute}. All patient health information is encrypted and stored off-chain per HIPAA requirements.
              </p>
              <ComplianceBadges state={caseData.state} statute={caseData.statute} />
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
              <button onClick={() => setShowPayment(true)} style={{
                flex: "1 1 280px",
                padding: "18px 32px", borderRadius: 12, border: "none", cursor: "pointer",
                background: `linear-gradient(135deg, ${C.teal}, ${C.cyan})`, color: C.bg,
                fontSize: 15, fontWeight: 700, fontFamily: "'Outfit', sans-serif",
                boxShadow: `0 8px 30px ${C.tealGlow}`, transition: "transform 0.2s",
              }}
                onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
                onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
              >
                Settle Now — {fmt(settleAmt)}
              </button>
              <button onClick={() => setShowReduction(true)} style={{
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
