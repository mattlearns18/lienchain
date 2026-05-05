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

// ── Multi-clinic pro-rata waterfall calculator ────────────────────────────────
// Phase 5: pro-rata only. Per-state lien priority (TX hospital lien priority,
// IN 20% floor cascading, etc.) is a Phase 6+ refinement.
//
// @param {number} grossNum
// @param {number} attyFeePct
// @param {number} costsNum
// @param {Array<{id,clinic,bill,split}>} clinics
function calcMultiClinicWaterfall(grossNum, attyFeePct, costsNum, clinics) {
  const attyFeeAmt   = Math.round(grossNum * attyFeePct / 100);
  const netAvailable = grossNum - attyFeeAmt - costsNum;
  const totalBills   = clinics.reduce((s, c) => s + c.bill, 0);

  let clinicRows, patientNet;

  if (netAvailable <= 0) {
    clinicRows = clinics.map(c => ({ ...c, recovery: 0, lienCoAmt: 0, clinicAmt: 0 }));
    patientNet = netAvailable;
  } else if (netAvailable >= totalBills) {
    // Full recovery; residual goes to patient
    clinicRows = clinics.map(c => {
      const recovery  = c.bill;
      const lienCoAmt = recovery * c.split / 100;
      const clinicAmt = recovery - lienCoAmt;
      return { ...c, recovery, lienCoAmt, clinicAmt };
    });
    patientNet = netAvailable - totalBills;
  } else {
    // Pro-rata shortfall distribution
    clinicRows = clinics.map(c => {
      const recovery  = totalBills > 0 ? (c.bill / totalBills) * netAvailable : 0;
      const lienCoAmt = recovery * c.split / 100;
      const clinicAmt = recovery - lienCoAmt;
      return { ...c, recovery, lienCoAmt, clinicAmt };
    });
    patientNet = 0; // pool fully consumed by liens
  }

  const onChainTotal = clinicRows.reduce((s, r) => s + r.recovery, 0);
  const totalLienCo  = clinicRows.reduce((s, r) => s + r.lienCoAmt, 0);
  const totalClinic  = clinicRows.reduce((s, r) => s + r.clinicAmt, 0);

  return {
    grossNum, attyFeePct, attyFeeAmt, costsNum, netAvailable,
    totalBills, onChainTotal, totalLienCo, totalClinic, patientNet,
    clinicRows,
    // Backward-compat aliases for SettleModal / SplitVisual
    onChainAmount: onChainTotal,
    lienCoAmt:     totalLienCo,
    clinicAmt:     totalClinic,
  };
}

// ── WaterfallCard ─────────────────────────────────────────────────────────────
// clinics: Array<{id, clinic, bill, split}> — all clinics on the selected case
function WaterfallCard({ clinics, onWaterfallChange }) {
  const totalBills = clinics.reduce((s, c) => s + c.bill, 0);
  const [gross,      setGross]      = useState(String(totalBills));
  const [attyFeePct, setAttyFeePct] = useState(33);
  const [costs,      setCosts]      = useState("");

  const grossNum = parseFloat(gross) || 0;
  const costsNum = parseFloat(costs) || 0;
  const wf = calcMultiClinicWaterfall(grossNum, attyFeePct, costsNum, clinics);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onWaterfallChange(wf); }, [grossNum, attyFeePct, costsNum]);

  const isNetNeg     = wf.netAvailable < 0;
  const isPatientNeg = wf.patientNet < 0 && !isNetNeg;
  const isProRata    = wf.netAvailable > 0 && wf.netAvailable < wf.totalBills;
  const isMulti      = clinics.length > 1;

  return (
    <div className="ap-waterfall-card">
      <div className="ap-waterfall-title">Settlement Waterfall{isMulti ? ` — ${clinics.length} Clinics` : ""}</div>

      {/* Inputs */}
      <div className="ap-wf-inputs">
        <div className="ap-wf-field">
          <label className="ap-wf-label">Gross Settlement Amount ($)</label>
          <input className="ap-wf-input" type="number" min="0"
            value={gross} onChange={e => setGross(e.target.value)} />
        </div>
        <div className="ap-wf-field">
          <label className="ap-wf-label">
            Attorney Fee — <strong style={{ color: "var(--text)" }}>{attyFeePct}%</strong>
          </label>
          <input type="range" min={10} max={50} value={attyFeePct}
            onChange={e => setAttyFeePct(Number(e.target.value))} className="ap-wf-slider" />
          <div className="ap-wf-slider-labels"><span>10%</span><span>50%</span></div>
        </div>
        <div className="ap-wf-field">
          <label className="ap-wf-label">Case Costs ($)</label>
          <input className="ap-wf-input" type="number" min="0"
            value={costs} onChange={e => setCosts(e.target.value)} placeholder="0" />
          <span className="ap-wf-help">Filing fees, depositions, expert witnesses, medical records, etc.</span>
        </div>
      </div>

      {/* Top-level breakdown */}
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

        {/* Per-clinic table */}
        <div className="ap-wf-clinic-table">
          <div className="ap-wf-clinic-grid">
            <div className="ap-wf-clinic-hdr">
              <span>Clinic</span>
              <span>Bill</span>
              <span>Recovery</span>
              <span>LC%</span>
              <span>LienCo $</span>
              <span>Clinic $</span>
            </div>
            {wf.clinicRows.map(r => (
              <div key={r.id} className="ap-wf-clinic-row">
                <span className="ap-wf-clinic-name">{r.clinic}</span>
                <span className="ap-wf-clinic-val">{usd(r.bill)}</span>
                <span className="ap-wf-clinic-val">{usd(r.recovery)}</span>
                <span className="ap-wf-clinic-val">{r.split}%</span>
                <span className="ap-wf-clinic-lco">{usd(r.lienCoAmt)}</span>
                <span className="ap-wf-clinic-cli">{usd(r.clinicAmt)}</span>
              </div>
            ))}
            {isMulti && (
              <div className="ap-wf-clinic-totals">
                <span>Total</span>
                <span>{usd(wf.totalBills)}</span>
                <span>{usd(wf.onChainTotal)}</span>
                <span></span>
                <span className="ap-wf-clinic-lco">{usd(wf.totalLienCo)}</span>
                <span className="ap-wf-clinic-cli">{usd(wf.totalClinic)}</span>
              </div>
            )}
          </div>
          {isProRata && (
            <div className="ap-wf-prorata-note">
              Pro-rata distribution applied — net pool insufficient to cover all bills in full.
            </div>
          )}
        </div>

        <div className="ap-wf-divider" />
        <div className="ap-wf-row ap-wf-total">
          <span className="ap-wf-row-label">Patient Net Recovery</span>
          <span className={`ap-wf-row-val ${isPatientNeg ? "ap-wf-amber" : ""}`}>
            {usd(wf.patientNet)}
          </span>
        </div>
      </div>

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
function SettleModal({ onClose, lien, caseClinics, waterfall }) {
  const [phase, setPhase] = useState("confirm");
  const [step,  setStep]  = useState(0);

  const settleAmt = waterfall?.onChainAmount ?? caseClinics.reduce((s, c) => s + c.bill, 0);
  const lienCoAmt = waterfall?.lienCoAmt     ?? 0;
  const clinicAmt = waterfall?.clinicAmt     ?? 0;

  // Effective split % derived from aggregate amounts (for display + compliance checks)
  const effectiveLienCoPct = (lienCoAmt + clinicAmt) > 0
    ? Math.round(lienCoAmt / (lienCoAmt + clinicAmt) * 100)
    : (caseClinics[0]?.split ?? 70);

  // Indiana compliance: flag if any IN-market clinic has lienCo split > 80%
  const hasInViolation = lien.market === "IN" && effectiveLienCoPct > 80;
  const hasUnusualSplit = effectiveLienCoPct < 30 || effectiveLienCoPct > 85;

  const steps = [
    { label: "Verifying attorney credentials",  detail: "Bar # on file" },
    { label: "Confirming lien details",          detail: lien.market + " market" },
    { label: "Executing settlement on XRPL",     detail: "Hook auto-splitting funds" },
    { label: "Settlement complete",              detail: "3.2 seconds" },
  ];

  async function run() {
    const memoData = {
      caseId:             lien.caseId ?? lien.id,
      grossSettlement:    waterfall?.grossNum,
      attorneyFeePercent: waterfall?.attyFeePct,
      attorneyFeeAmount:  waterfall?.attyFeeAmt,
      caseCosts:          waterfall?.costsNum,
      netAvailable:       waterfall?.netAvailable,
      lienCoAmount:       lienCoAmt,
      clinicAmount:       clinicAmt,
      patientNetRecovery: waterfall?.patientNet,
      clinicRows:         waterfall?.clinicRows?.map(r => ({ id: r.id, clinic: r.clinic, recovery: r.recovery, lienCoAmt: r.lienCoAmt, clinicAmt: r.clinicAmt })),
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
            <p className="ap-modal-sub">Settling <strong>{lien.caseId ?? lien.id}</strong></p>

            {/* Read-only split summary */}
            <div className="ap-wf-breakdown">
              <div className="ap-wf-row">
                <span className="ap-wf-row-label">Amount settling on-chain</span>
                <span className="ap-wf-row-val">{usd(settleAmt)}</span>
              </div>
              <div className="ap-wf-row" style={{ fontSize: "0.74rem", color: "var(--muted)" }}>
                <span>Net of attorney fee &amp; case costs</span>
              </div>
              <div className="ap-wf-divider" />
              <div className="ap-wf-row">
                <span className="ap-wf-row-label ap-wf-indent ap-wf-teal">To LienCo</span>
                <span className="ap-wf-row-val ap-wf-teal">{usd(lienCoAmt)}</span>
              </div>
              <div className="ap-wf-row">
                <span className="ap-wf-row-label ap-wf-indent ap-wf-green">To Clinic(s)</span>
                <span className="ap-wf-row-val ap-wf-green">{usd(clinicAmt)}</span>
              </div>
            </div>

            {hasInViolation && (
              <div className="ap-flag-banner ap-flag-red">
                ⛔ Indiana 20% floor applies — clinic must receive at least 20%.
              </div>
            )}
            {hasUnusualSplit && (
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
// Accepts aggregate dollar amounts from the waterfall (works for single or multi-clinic)
function SplitVisual({ lienCoAmt, clinicAmt }) {
  const total      = lienCoAmt + clinicAmt;
  const lienCoPct  = total > 0 ? Math.round(lienCoAmt / total * 100) : 70;
  const clinicPct  = 100 - lienCoPct;
  return (
    <div className="ap-split-card">
      <div className="ap-split-label">On-Chain Split (net settlement amount)</div>
      <div className="ap-split-bar">
        <div className="ap-seg ap-seg-lienco" style={{ width: `${lienCoPct}%` }}>{lienCoPct}%</div>
        <div className="ap-seg ap-seg-clinic"  style={{ width: `${clinicPct}%` }}>{clinicPct}%</div>
      </div>
      <div className="ap-split-amounts">
        <div className="ap-amount-box ap-amount-lienco">
          <div className="ap-amount-tag">To LienCo</div>
          <div className="ap-amount-val">{usd(lienCoAmt)}</div>
        </div>
        <div className="ap-amount-box ap-amount-clinic">
          <div className="ap-amount-tag">To Clinic(s)</div>
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
  // Group liens by caseId so multi-clinic cases show as one entry
  const caseMap = {};
  for (const l of liens) {
    const key = l.caseId ?? l.id;
    if (!caseMap[key]) caseMap[key] = [];
    caseMap[key].push(l);
  }
  const caseIds = Object.keys(caseMap);

  // Resolve initialCaseId (may be a lienId or a caseId) to a caseId key
  const resolveInitial = () => {
    if (!initialCaseId) return caseIds[0] ?? "";
    const hit = liens.find(l => l.id === initialCaseId || l.caseId === initialCaseId);
    return hit?.caseId ?? hit?.id ?? caseIds[0] ?? "";
  };

  const [selectedCaseId, setSelectedCaseId] = useState(resolveInitial);
  const [showSettle,    setShowSettle]    = useState(false);
  const [showReduction, setShowReduction] = useState(false);
  const [toast,         setToast]         = useState("");
  const [waterfall,     setWaterfall]     = useState(null);

  // Sync when the parent changes which lien to preview
  const resolvedInitial = initialCaseId
    ? (liens.find(l => l.id === initialCaseId || l.caseId === initialCaseId)?.caseId ?? initialCaseId)
    : null;
  if (resolvedInitial && resolvedInitial !== selectedCaseId) {
    setSelectedCaseId(resolvedInitial);
    setWaterfall(null);
  }

  // All clinics in the selected case, shaped for WaterfallCard
  const caseClinics = (caseMap[selectedCaseId] ?? []).map(l => ({
    id: l.id, clinic: l.clinic, bill: l.bill, split: l.split ?? 70,
  }));
  const lien = caseMap[selectedCaseId]?.[0] ?? liens[0];
  if (!lien) return <div className="ap-empty">No liens available. Create one first.</div>;

  const info      = MARKET_INFO[lien.market] ?? { state: "Unknown", statute: "N/A" };
  const totalBill = caseClinics.reduce((s, c) => s + c.bill, 0);
  const isMulti   = caseClinics.length > 1;

  // Aggregate amounts for SplitVisual and action button label
  const splitLienCoAmt = waterfall?.lienCoAmt     ?? 0;
  const splitClinicAmt = waterfall?.clinicAmt      ?? 0;
  const splitAmount    = waterfall?.onChainAmount   ?? totalBill;

  return (
    <div className="ap-root">
      {toast && <div className="rm-toast">{toast}</div>}
      {showSettle && (
        <SettleModal
          lien={lien}
          caseClinics={caseClinics}
          waterfall={waterfall}
          onClose={() => setShowSettle(false)}
        />
      )}
      {showReduction && (
        <ReductionModal
          caseId={lien.caseId ?? lien.id}
          bill={totalBill}
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

      {/* Case selector — one entry per caseId */}
      <div className="ap-selector-row">
        <label className="ap-selector-label">Select a case to preview:</label>
        <select
          className="ap-selector"
          value={selectedCaseId}
          onChange={e => { setSelectedCaseId(e.target.value); setWaterfall(null); }}
        >
          {caseIds.map(cid => {
            const clinics  = caseMap[cid];
            const first    = clinics[0];
            const total    = clinics.reduce((s, c) => s + c.bill, 0);
            const lbl      = clinics.length > 1
              ? `${cid} — ${clinics.length} clinics (${first.market}) — $${Number(total).toLocaleString()}`
              : `${cid} — ${first.clinic} (${first.market}) — $${Number(first.bill).toLocaleString()}`;
            return <option key={cid} value={cid}>{lbl}</option>;
          })}
        </select>
      </div>

      {/* Case card */}
      <div className="ap-case-card">
        <div className="ap-case-eyebrow">Case Ready for Settlement</div>
        <h2 className="ap-case-id">{selectedCaseId}</h2>
        <p className="ap-case-meta">
          {isMulti ? `${caseClinics.length} clinics` : `Clinic: ${lien.clinic}`}
          {" · Market: "}<strong>{lien.market}</strong>{" · "}{info.state}
        </p>
        <div className="ap-info-grid">
          {[
            ["Clinic(s)",          isMulti ? `${caseClinics.length} clinics` : lien.clinic],
            ["Market",             lien.market],
            ["State / Statute",    `${info.state} · ${info.statute}`],
            ["Total Medical Bill", usd(totalBill)],
            ["Status",             lien.status ?? "Active"],
          ].map(([label, value]) => (
            <div key={label} className="ap-info-row">
              <span className="ap-info-label">{label}</span>
              <span className="ap-info-value">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Waterfall — multi-clinic aware */}
      <WaterfallCard
        key={selectedCaseId}
        clinics={caseClinics}
        onWaterfallChange={setWaterfall}
      />

      {/* Split visual — driven by aggregate waterfall amounts */}
      <SplitVisual lienCoAmt={splitLienCoAmt} clinicAmt={splitClinicAmt} />

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
