import { useState } from "react";
import "./AttorneyPreview.css";

// Market compliance info
const MARKET_INFO = {
  KC:  { state: "Missouri", statute: "RSMo §484.130",                     flags: [] },
  STL: { state: "Missouri", statute: "RSMo §484.130",                     flags: [] },
  TX:  { state: "Texas",    statute: "Tex. Health & Safety Code §55.005", flags: ["tx-72h"] },
  NV:  { state: "Nevada",   statute: "NRS Chapter 108.4939",              flags: [] },
  IN:  { state: "Indiana",  statute: "Ind. Code §34-51-1",               flags: ["in-nonassignable"] },
};

const usd = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Settlement animation modal (same logic as AttorneyPortal) ────────────────
function SettleModal({ onClose, lien }) {
  const [phase,       setPhase]      = useState("confirm");
  const [step,        setStep]       = useState(0);
  const [lienCoShare, setLienCoShare] = useState(lien.split ?? 70);

  const steps = [
    { label: "Verifying attorney credentials",  detail: "Bar # on file" },
    { label: "Confirming lien details",          detail: lien.market + " market" },
    { label: "Executing settlement on XRPL",     detail: "Hook auto-splitting funds" },
    { label: "Settlement complete",              detail: "3.2 seconds" },
  ];

  async function run() {
    setPhase("running");
    for (let i = 0; i < 4; i++) {
      setStep(i);
      await new Promise(r => setTimeout(r, 1100 + i * 100));
    }
    setPhase("done");
  }

  return (
    <div className="ap-overlay" onClick={onClose}>
      <div className="ap-modal" onClick={e => e.stopPropagation()}>
        <button className="ap-close" onClick={onClose}>×</button>

        {phase === "confirm" && (
          <>
            <h3 className="ap-modal-title">Confirm Settlement</h3>
            <p className="ap-modal-sub">Settling <strong>{lien.id}</strong> for {usd(lien.bill)}</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--muted)" }}>
                LienCo Share — <strong style={{ color: "var(--text)" }}>{lienCoShare}%</strong>
                &nbsp;·&nbsp; Clinic Share — <strong style={{ color: "var(--text)" }}>{100 - lienCoShare}%</strong>
              </label>
              <input
                type="range" min={0} max={100}
                value={lienCoShare}
                onChange={e => setLienCoShare(Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--accent)", cursor: "pointer" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--muted)" }}>
                <span>0%</span><span>100%</span>
              </div>
            </div>

            {lien.market === "IN" && lienCoShare > 80 && (
              <div className="ap-flag-banner ap-flag-red">
                ⛔ Indiana 20% floor applies — clinic must receive at least 20%.
              </div>
            )}

            {(lienCoShare < 30 || lienCoShare > 85) && (
              <div className="ap-flag-banner ap-flag-orange">
                ⚠ Unusual split ratio — please confirm reduction note fully documents the negotiation.
              </div>
            )}

            <div className="ap-legal-note">
              By clicking Execute, you authorize settlement under {MARKET_INFO[lien.market]?.statute ?? "applicable statute"}.
              Transaction will be recorded on the XRPL public ledger.
            </div>
            <button className="ap-execute-btn" onClick={run}>
              Execute Settlement — {usd(lien.bill)}
            </button>
          </>
        )}

        {(phase === "running" || phase === "done") && (
          <>
            <h3 className="ap-modal-title">
              {phase === "done" ? "Settlement Complete" : "Processing…"}
            </h3>
            <p className="ap-modal-sub">{lien.id} — {usd(lien.bill)}</p>
            <div className="ap-steps">
              {steps.map((s, i) => (
                <div key={i} className={`ap-step ${(step >= i || phase === "done") ? "ap-step-active" : ""}`}>
                  <div className={`ap-step-dot ${phase === "done" || step > i ? "dot-green" : step === i ? "dot-teal" : ""}`}>
                    {(phase === "done" || step > i) ? "✓" : i + 1}
                  </div>
                  <div>
                    <div className="ap-step-label">{s.label}</div>
                    <div className="ap-step-detail">{s.detail}</div>
                  </div>
                </div>
              ))}
            </div>
            {phase === "done" && (
              <>
                <div className="ap-hash-box">
                  <div className="ap-hash-label">Transaction Hash</div>
                  <code className="ap-hash">A8F2D1C9B3E7…9B3E (simulated)</code>
                </div>
                <button className="ap-execute-btn" onClick={onClose}>Done</button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── SplitVisual ──────────────────────────────────────────────────────────────
function SplitVisual({ lienCoShare, bill }) {
  const clinicShare = 100 - lienCoShare;
  const lienCoAmt   = Math.floor(bill * lienCoShare / 100);
  const clinicAmt   = bill - lienCoAmt;
  return (
    <div className="ap-split-card">
      <div className="ap-split-label">Settlement Breakdown</div>
      <div className="ap-split-bar">
        <div className="ap-seg ap-seg-lienco" style={{ width: `${lienCoShare}%` }}>{lienCoShare}%</div>
        <div className="ap-seg ap-seg-clinic"  style={{ width: `${clinicShare}%` }}>{clinicShare}%</div>
      </div>
      <div className="ap-split-amounts">
        <div className="ap-amount-box ap-amount-lienco">
          <div className="ap-amount-tag">To LienCo ({lienCoShare}%)</div>
          <div className="ap-amount-val">{usd(lienCoAmt)}</div>
        </div>
        <div className="ap-amount-box ap-amount-clinic">
          <div className="ap-amount-tag">To Clinic ({clinicShare}%)</div>
          <div className="ap-amount-val ap-clinic-val">{usd(clinicAmt)}</div>
        </div>
      </div>
    </div>
  );
}

// ── ComplianceBadges ─────────────────────────────────────────────────────────
function ComplianceBadges({ market }) {
  const info = MARKET_INFO[market] ?? { state: "Unknown", statute: "N/A", flags: [] };
  return (
    <div className="ap-compliance-card">
      <div className="ap-compliance-label">Compliance</div>
      <p className="ap-compliance-text">
        This settlement complies with {info.state} lien law under {info.statute}.
        All patient health information is encrypted and stored off-chain per HIPAA requirements.
      </p>
      {info.flags.includes("tx-72h") && (
        <div className="ap-flag-banner ap-flag-orange">
          ⚠ Texas 72-Hour Filing Alert — lien is subject to a 72-hour rescission window under Texas law.
        </div>
      )}
      {info.flags.includes("in-nonassignable") && (
        <div className="ap-flag-banner ap-flag-red">
          ⛔ Indiana Non-Assignability Warning — confirm assignment validity before secondary transfer.
        </div>
      )}
      <div className="ap-badges">
        <span className="ap-badge">✓ {info.state} compliant</span>
        <span className="ap-badge">✓ {info.statute}</span>
        <span className="ap-badge">✓ HIPAA compliant</span>
        <span className="ap-badge">✓ Court admissible</span>
      </div>
    </div>
  );
}

// ── Main exported component ──────────────────────────────────────────────────
export default function AttorneyPreview({ liens, initialCaseId }) {
  const [selectedId, setSelectedId] = useState(initialCaseId ?? liens[0]?.id ?? "");
  const [showSettle, setShowSettle]  = useState(false);

  // Keep in sync if initialCaseId changes (from "Preview" button in lien table)
  if (initialCaseId && initialCaseId !== selectedId) {
    setSelectedId(initialCaseId);
  }

  const lien = liens.find(l => l.id === selectedId) ?? liens[0];
  if (!lien) return <div className="ap-empty">No liens available. Create one first.</div>;

  const info = MARKET_INFO[lien.market] ?? { state: "Unknown", statute: "N/A" };

  return (
    <div className="ap-root">
      {showSettle && <SettleModal lien={lien} onClose={() => setShowSettle(false)} />}

      {/* Info banner */}
      <div className="ap-info-banner">
        ℹ This is a read-only preview of the attorney portal experience.
        The full portal is available at <code>/attorney/:caseId</code> for real attorney access.
      </div>

      {/* Case selector */}
      <div className="ap-selector-row">
        <label className="ap-selector-label">Select a case to preview:</label>
        <select
          className="ap-selector"
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
        >
          {liens.map(l => (
            <option key={l.id} value={l.id}>
              {l.id} — {l.clinic} ({l.market}) — ${Number(l.bill).toLocaleString()}
            </option>
          ))}
        </select>
      </div>

      {/* Case card */}
      <div className="ap-case-card">
        <div className="ap-case-eyebrow">Case Ready for Settlement</div>
        <h2 className="ap-case-id">{lien.id}</h2>
        <p className="ap-case-meta">Clinic: <strong>{lien.clinic}</strong> · Market: <strong>{lien.market}</strong> · {info.state}</p>

        <div className="ap-info-grid">
          {[
            ["Clinic",          lien.clinic],
            ["Market",          lien.market],
            ["State / Statute", `${info.state} · ${info.statute}`],
            ["Medical Bill",    usd(lien.bill)],
            ["Status",          lien.status ?? "Active"],
          ].map(([label, value]) => (
            <div key={label} className="ap-info-row">
              <span className="ap-info-label">{label}</span>
              <span className="ap-info-value">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <SplitVisual lienCoShare={lien.split} bill={lien.bill} />
      <ComplianceBadges market={lien.market} />

      {/* Action buttons */}
      <div className="ap-actions">
        <button className="ap-settle-btn" onClick={() => setShowSettle(true)}>
          Settle Now — {usd(lien.bill)}
        </button>
        <button className="ap-secondary-btn">Request Reduction</button>
      </div>

      <p className="ap-disclaimer">
        <strong>No blockchain knowledge required.</strong> Attorneys enter their payment method
        and we handle the rest. Settlement completes in 3 seconds with a full audit trail on the XRPL public ledger.
      </p>
    </div>
  );
}
