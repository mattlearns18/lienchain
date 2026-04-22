import { useState, useEffect } from "react";
import "./AttorneyPreview.css";
import ReductionModal from "./ReductionModal.jsx";

// Market compliance info
const MARKET_INFO = {
  KC:  { state: "Missouri", statute: "RSMo §484.130",                     flags: [] },
  STL: { state: "Missouri", statute: "RSMo §484.130",                     flags: [] },
  TX:  { state: "Texas",    statute: "Tex. Health & Safety Code §55.005", flags: ["tx-72h"] },
  NV:  { state: "Nevada",   statute: "NRS Chapter 108.4939",              flags: [] },
  IN:  { state: "Indiana",  statute: "Ind. Code §34-51-1",               flags: ["in-nonassignable"] },
};

const usd = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Waterfall calculator ──────────────────────────────────────────────────────
function calcWaterfall(grossNum, attyFeePct, costsNum, bill, lienCoShare) {
  const attyFeeAmt    = Math.round(grossNum * attyFeePct / 100);
  const netAvailable  = grossNum - attyFeeAmt - costsNum;
  // Lien is paid its face value (bill) from net; patient keeps the rest.
  // If net < bill the lien is partially paid; if net < 0 nothing is paid.
  const onChainAmount = Math.min(bill, Math.max(0, netAvailable));
  const lienCoAmt     = onChainAmount * lienCoShare / 100;
  const clinicAmt     = onChainAmount * (100 - lienCoShare) / 100;
  const patientNet    = netAvailable - onChainAmount;
  return { grossNum, attyFeePct, attyFeeAmt, costsNum, netAvailable, onChainAmount, lienCoAmt, clinicAmt, patientNet };
}

// ── WaterfallCard ─────────────────────────────────────────────────────────────
function WaterfallCard({ bill, lienCoShare, onWaterfallChange }) {
  const clinicShare    = 100 - lienCoShare;
  const [gross,        setGross]       = useState(String(bill));
  const [attyFeePct,   setAttyFeePct]  = useState(33);
  const [costs,        setCosts]       = useState("");

  const grossNum = parseFloat(gross)  || 0;
  const costsNum = parseFloat(costs)  || 0;
  const wf = calcWaterfall(grossNum, attyFeePct, costsNum, bill, lienCoShare);

  useEffect(() => { onWaterfallChange(wf); }, [grossNum, attyFeePct, costsNum]);

  const isNetNeg     = wf.netAvailable < 0;
  const isPatientNeg = wf.patientNet < 0 && !isNetNeg;

  return (
    <div className="ap-waterfall-card">
      <div className="ap-waterfall-title">Settlement Waterfall</div>

      {/* Inputs */}
      <div className="ap-wf-inputs">
        <div className="ap-wf-field">
          <label className="ap-wf-label">Gross Settlement Amount ($)</label>
          <input
            className="ap-wf-input" type="number" min="0"
            value={gross} onChange={e => setGross(e.target.value)}
          />
        </div>

        <div className="ap-wf-field">
          <label className="ap-wf-label">
            Attorney Fee — <strong style={{ color: "var(--text)" }}>{attyFeePct}%</strong>
          </label>
          <input
            type="range" min={10} max={50} value={attyFeePct}
            onChange={e => setAttyFeePct(Number(e.target.value))}
            className="ap-wf-slider"
          />
          <div className="ap-wf-slider-labels"><span>10%</span><span>50%</span></div>
        </div>

        <div className="ap-wf-field">
          <label className="ap-wf-label">Case Costs ($)</label>
          <input
            className="ap-wf-input" type="number" min="0"
            value={costs} onChange={e => setCosts(e.target.value)} placeholder="0"
          />
          <span className="ap-wf-help">Filing fees, depositions, expert witnesses, medical records, etc.</span>
        </div>
      </div>

      {/* Breakdown table */}
      <div className="ap-wf-breakdown">
        <div className="ap-wf-row">
          <span className="ap-wf-row-label">Gross Settlement</span>
          <span className="ap-wf-row-val">{usd(grossNum)}</span>
        </div>
        <div className="ap-wf-row">
          <span className="ap-wf-row-label ap-wf-indent">− Attorney Fee ({attyFeePct}%)</span>
          <span className="ap-wf-row-val ap-wf-neg">−{usd(wf.attyFeeAmt)}</span>
        </div>
        <div className="ap-wf-row">
          <span className="ap-wf-row-label ap-wf-indent">− Case Costs</span>
          <span className="ap-wf-row-val ap-wf-neg">−{usd(costsNum)}</span>
        </div>
        <div className="ap-wf-divider" />
        <div className="ap-wf-row ap-wf-total">
          <span className="ap-wf-row-label">Net Available for Liens</span>
          <span className={`ap-wf-row-val ${isNetNeg ? "ap-wf-red" : "ap-wf-accent"}`}>
            {usd(Math.max(0, wf.netAvailable))}
          </span>
        </div>
        <div className="ap-wf-divider" />
        <div className="ap-wf-row">
          <span className="ap-wf-row-label ap-wf-indent ap-wf-teal">LienCo ({lienCoShare}%)</span>
          <span className="ap-wf-row-val ap-wf-teal">{usd(wf.lienCoAmt)}</span>
        </div>
        <div className="ap-wf-row">
          <span className="ap-wf-row-label ap-wf-indent ap-wf-green">Clinic ({clinicShare}%)</span>
          <span className="ap-wf-row-val ap-wf-green">{usd(wf.clinicAmt)}</span>
        </div>
        <div className="ap-wf-divider" />
        <div className="ap-wf-row ap-wf-total">
          <span className="ap-wf-row-label">Patient Net Recovery</span>
          <span className={`ap-wf-row-val ${isPatientNeg ? "ap-wf-amber" : ""}`}>
            {usd(wf.patientNet)}
          </span>
        </div>
      </div>

      {/* Warnings */}
      {isNetNeg && (
        <div className="ap-flag-banner ap-flag-red">
          Settlement does not cover attorney fees and costs. Consider requesting lien reduction.
        </div>
      )}
      {isPatientNeg && (
        <div className="ap-flag-banner ap-flag-orange">
          ⚠ Settlement does not leave a net recovery for the patient. Lien reduction may be necessary.
        </div>
      )}
    </div>
  );
}

// ── SettleModal ───────────────────────────────────────────────────────────────
function SettleModal({ onClose, lien, waterfall }) {
  const [phase, setPhase] = useState("confirm");
  const [step,  setStep]  = useState(0);

  const lienCoShare = lien.split ?? 70;
  const clinicShare = 100 - lienCoShare;

  // On-chain: the lien face value (or whatever net can cover) gets split
  const settleAmt = waterfall?.onChainAmount ?? lien.bill;
  const lienCoAmt = waterfall?.lienCoAmt     ?? Math.floor(lien.bill * lienCoShare / 100);
  const clinicAmt = waterfall?.clinicAmt     ?? (lien.bill - lienCoAmt);

  const steps = [
    { label: "Verifying attorney credentials",  detail: "Bar # on file" },
    { label: "Confirming lien details",          detail: lien.market + " market" },
    { label: "Executing settlement on XRPL",     detail: "Hook auto-splitting funds" },
    { label: "Settlement complete",              detail: "3.2 seconds" },
  ];

  async function run() {
    // Memo data that will be embedded in the on-chain settlement tx
    const memoData = {
      case:               lien.id,
      grossSettlement:    waterfall?.grossNum,
      attorneyFeePercent: waterfall?.attyFeePct,
      attorneyFeeAmount:  waterfall?.attyFeeAmt,
      caseCosts:          waterfall?.costsNum,
      netAvailable:       waterfall?.netAvailable,
      lienCoShare,
      clinicShare,
      lienCoAmount:       lienCoAmt,
      clinicAmount:       clinicAmt,
      patientNetRecovery: waterfall?.patientNet,
    };
    console.log("[LienChain] Settlement memo (on-chain data):", memoData);

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
            <p className="ap-modal-sub">Settling <strong>{lien.id}</strong></p>

            {/* Read-only split summary — split is fixed from the wizard */}
            <div className="ap-wf-breakdown">
              <div className="ap-wf-row">
                <span className="ap-wf-row-label">Amount settling on-chain</span>
                <span className="ap-wf-row-val">{usd(settleAmt)}</span>
              </div>
              <div className="ap-wf-row" style={{ fontSize: "0.74rem", color: "var(--muted)" }}>
                <span style={{ paddingLeft: 0 }}>Net of attorney fee &amp; case costs</span>
              </div>
              <div className="ap-wf-divider" />
              <div className="ap-wf-row">
                <span className="ap-wf-row-label ap-wf-indent ap-wf-teal">LienCo ({lienCoShare}%)</span>
                <span className="ap-wf-row-val ap-wf-teal">{usd(lienCoAmt)}</span>
              </div>
              <div className="ap-wf-row">
                <span className="ap-wf-row-label ap-wf-indent ap-wf-green">Clinic ({clinicShare}%)</span>
                <span className="ap-wf-row-val ap-wf-green">{usd(clinicAmt)}</span>
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
              By clicking Execute, you authorize settlement under{" "}
              {MARKET_INFO[lien.market]?.statute ?? "applicable statute"}.
              Transaction will be recorded on the XRPL public ledger.
            </div>
            <button className="ap-execute-btn" onClick={run}>
              Execute Settlement — {usd(settleAmt)}
            </button>
          </>
        )}

        {(phase === "running" || phase === "done") && (
          <>
            <h3 className="ap-modal-title">
              {phase === "done" ? "Settlement Complete" : "Processing…"}
            </h3>
            <p className="ap-modal-sub">{lien.id} — {usd(settleAmt)}</p>
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

// ── SplitVisual ───────────────────────────────────────────────────────────────
function SplitVisual({ lienCoShare, amount }) {
  const clinicShare = 100 - lienCoShare;
  const lienCoAmt   = Math.floor(amount * lienCoShare / 100);
  const clinicAmt   = amount - lienCoAmt;
  return (
    <div className="ap-split-card">
      <div className="ap-split-label">On-Chain Split (net settlement amount)</div>
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

// ── ComplianceBadges ──────────────────────────────────────────────────────────
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

// ── Main exported component ───────────────────────────────────────────────────
export default function AttorneyPreview({ liens, initialCaseId }) {
  const [selectedId,    setSelectedId]    = useState(initialCaseId ?? liens[0]?.id ?? "");
  const [showSettle,    setShowSettle]    = useState(false);
  const [showReduction, setShowReduction] = useState(false);
  const [toast,         setToast]         = useState("");
  const [waterfall,     setWaterfall]     = useState(null);

  // Keep in sync if initialCaseId changes (from "Preview" button in lien table)
  if (initialCaseId && initialCaseId !== selectedId) {
    setSelectedId(initialCaseId);
    setWaterfall(null);
  }

  const lien = liens.find(l => l.id === selectedId) ?? liens[0];
  if (!lien) return <div className="ap-empty">No liens available. Create one first.</div>;

  const info = MARKET_INFO[lien.market] ?? { state: "Unknown", statute: "N/A" };

  // Use waterfall-computed amount for split visual; fall back to bill if waterfall not set yet
  const splitAmount = waterfall?.onChainAmount ?? lien.bill;

  return (
    <div className="ap-root">
      {toast && <div className="rm-toast">{toast}</div>}
      {showSettle && (
        <SettleModal
          lien={lien}
          waterfall={waterfall}
          onClose={() => setShowSettle(false)}
        />
      )}
      {showReduction && (
        <ReductionModal
          caseId={lien.id}
          bill={lien.bill}
          split={lien.split}
          onClose={() => setShowReduction(false)}
          onSubmitted={(id) => {
            setToast(`Reduction request submitted for case ${id}`);
            setTimeout(() => setToast(""), 3500);
          }}
        />
      )}

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
          onChange={e => { setSelectedId(e.target.value); setWaterfall(null); }}
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

      {/* Waterfall — above the split visual */}
      <WaterfallCard
        key={lien.id}
        bill={lien.bill}
        lienCoShare={lien.split ?? 70}
        onWaterfallChange={setWaterfall}
      />

      {/* Split visual — driven by waterfall's on-chain amount */}
      <SplitVisual lienCoShare={lien.split ?? 70} amount={splitAmount} />

      <ComplianceBadges market={lien.market} />

      {/* Action buttons */}
      <div className="ap-actions">
        <button className="ap-settle-btn" onClick={() => setShowSettle(true)}>
          Settle Now — {usd(splitAmount)}
        </button>
        <button className="ap-secondary-btn" onClick={() => setShowReduction(true)}>Request Reduction</button>
      </div>

      <p className="ap-disclaimer">
        <strong>No blockchain knowledge required.</strong> Attorneys enter their payment method
        and we handle the rest. Settlement completes in 3 seconds with a full audit trail on the XRPL public ledger.
      </p>
    </div>
  );
}
