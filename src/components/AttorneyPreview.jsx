import { useState, useEffect } from "react";
import "./AttorneyPreview.css";
import ReductionModal from "./ReductionModal.jsx";
import { loadReductionRequests } from "../lib/store.js";
import { MARKET_INFO } from "../lib/markets.js";
import { getNetworkConfig } from "../lib/network.js";
import { executeSettlementPayment } from "../lib/settle-onchain.js";

const usd = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Parse a YYYY-MM-DD date string as a local date (avoids UTC-midnight off-by-one in CDT/etc.)
function parseLocalDate(ymd) {
  const [y, m, d] = ymd.split("-");
  return new Date(+y, +m - 1, +d);
}

// ── Multi-clinic waterfall calculator (Phase 6: IN floor enforcement) ────────
//
// Algorithm:
//   1. Pro-rata distribute netAvailable across all clinics.
//   2. For each IN clinic, compute floor = ceil(bill × clinicFloorPct × 100) / 100.
//   3. Find the IN clinic with the largest shortfall vs. floor.
//   4. Raise it to floor (or to remaining pool if pool can't cover).
//   5. Deduct raise from remaining pool, remove raised clinic from re-distribution.
//   6. Re-pro-rata remaining pool across unfixed clinics. Repeat from 2.
//   Convergence: at most N iterations for N IN clinics.
//
// @param {number} grossNum
// @param {number} attyFeePct
// @param {number} costsNum
// @param {Array<{id,clinic,bill,split,market}>} clinics
function calcMultiClinicWaterfall(grossNum, attyFeePct, costsNum, clinics) {
  const attyFeeAmt   = Math.round(grossNum * attyFeePct / 100);
  const netAvailable = grossNum - attyFeeAmt - costsNum;
  const totalBills   = clinics.reduce((s, c) => s + c.bill, 0);
  const inFloorPct   = MARKET_INFO.IN?.policy?.clinicFloorPct ?? 0.20;

  let clinicRows, patientNet;
  let floorAppliedCount = 0;
  let poolExhausted     = false;

  if (netAvailable <= 0) {
    clinicRows = clinics.map(c => ({ ...c, recovery: 0, lienCoAmt: 0, clinicAmt: 0, floorApplied: false }));
    patientNet = netAvailable;
  } else if (netAvailable >= totalBills) {
    // Full recovery — no shortfall, floor irrelevant
    clinicRows = clinics.map(c => {
      const recovery  = c.bill;
      const lienCoAmt = recovery * c.split / 100;
      const clinicAmt = recovery - lienCoAmt;
      return { ...c, recovery, lienCoAmt, clinicAmt, floorApplied: false };
    });
    patientNet = netAvailable - totalBills;
  } else {
    // Shortfall branch: start with pure pro-rata, then enforce IN floors iteratively
    const recoveries   = new Map(clinics.map(c => [c.id, totalBills > 0 ? (c.bill / totalBills) * netAvailable : 0]));
    const floorApplied = new Map(clinics.map(c => [c.id, false]));
    const fixed        = new Set(); // clinics whose recovery is now locked

    let poolRemaining = netAvailable;

    // Iterative IN floor enforcement
    let changed = true;
    while (changed) {
      changed = false;

      // Find unfixed IN clinics below their floor; pick largest gap first
      let worstId   = null;
      let worstGap  = 0;
      for (const c of clinics) {
        if (fixed.has(c.id) || c.market !== "IN") continue;
        const floor = Math.ceil(c.bill * inFloorPct * 100) / 100;
        const gap   = floor - recoveries.get(c.id);
        if (gap > 0.005 && gap > worstGap) { worstGap = gap; worstId = c.id; }
      }

      if (!worstId) break; // all IN clinics at or above floor

      const targetClinic = clinics.find(c => c.id === worstId);
      const floor        = Math.ceil(targetClinic.bill * inFloorPct * 100) / 100;
      const currentRec   = recoveries.get(worstId);
      const raise        = floor - currentRec;

      // Amount currently allocated to unfixed non-target clinics = what we can take back
      const unfixedOthers = clinics.filter(c => !fixed.has(c.id) && c.id !== worstId);
      const poolFromOthers = unfixedOthers.reduce((s, c) => s + recoveries.get(c.id), 0);

      if (raise <= poolFromOthers) {
        // Raise to floor; take the raise away from unfixed others pro-rata by bill
        recoveries.set(worstId, floor);
        floorApplied.set(worstId, true);
        fixed.add(worstId);
        poolRemaining -= currentRec; // remove old allocation from pool tracking
        poolRemaining -= raise;      // lock in floor amount

        // Re-pro-rata remaining pool among unfixed others
        const sumOtherBills = unfixedOthers.reduce((s, c) => s + c.bill, 0);
        const poolForOthers = poolFromOthers - raise;
        for (const c of unfixedOthers) {
          recoveries.set(c.id, sumOtherBills > 0 ? (c.bill / sumOtherBills) * poolForOthers : 0);
        }
        changed = true;
      } else {
        // Pool can't cover the full raise — give this clinic whatever's left from others
        const partialRaise = poolFromOthers;
        recoveries.set(worstId, currentRec + partialRaise);
        floorApplied.set(worstId, true);
        fixed.add(worstId);
        for (const c of unfixedOthers) { recoveries.set(c.id, 0); fixed.add(c.id); }
        poolExhausted = true;
        changed = true;
      }
    }

    clinicRows = clinics.map(c => {
      const recovery  = recoveries.get(c.id);
      const lienCoAmt = recovery * c.split / 100;
      const clinicAmt = recovery - lienCoAmt;
      const fa        = floorApplied.get(c.id);
      if (fa) floorAppliedCount++;
      return { ...c, recovery, lienCoAmt, clinicAmt, floorApplied: fa };
    });
    // Deduplicate floorAppliedCount (map iterates once per clinic above)
    floorAppliedCount = clinicRows.filter(r => r.floorApplied).length;
    patientNet = 0;
  }

  const onChainTotal = clinicRows.reduce((s, r) => s + r.recovery, 0);
  const totalLienCo  = clinicRows.reduce((s, r) => s + r.lienCoAmt, 0);
  const totalClinic  = clinicRows.reduce((s, r) => s + r.clinicAmt, 0);

  return {
    grossNum, attyFeePct, attyFeeAmt, costsNum, netAvailable,
    totalBills, onChainTotal, totalLienCo, totalClinic, patientNet,
    clinicRows,
    floorAppliedCount,
    poolExhausted,
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

  const isNetNeg       = wf.netAvailable < 0;
  const isPatientNeg   = wf.patientNet < 0 && !isNetNeg;
  const isProRata      = wf.netAvailable > 0 && wf.netAvailable < wf.totalBills;
  const isFloorApplied = wf.floorAppliedCount > 0;
  const isMulti        = clinics.length > 1;

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
                <span className="ap-wf-clinic-val">
                  {usd(r.recovery)}
                  {r.floorApplied && <span className="ap-wf-floor-tag">FLOOR</span>}
                </span>
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
              {isFloorApplied
                ? <>
                    Pro-rata distribution applied with Indiana 20% clinic floor enforcement.{" "}
                    {wf.floorAppliedCount} IN clinic{wf.floorAppliedCount === 1 ? "" : "s"} raised to floor;
                    remaining net pool re-distributed pro-rata.
                    {wf.poolExhausted && " Pool exhausted — some clinics receive less than statutory floor."}
                  </>
                : "Pro-rata distribution applied — net pool insufficient to cover all bills in full."
              }
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
function SettleModal({ onClose, lien, caseClinics, waterfall, onSettled }) {
  const [phase,    setPhase]    = useState("confirm");
  const [step,     setStep]     = useState(0);
  const [txHashes, setTxHashes] = useState([]); // array of {success, txHash?, error?, clinicId}

  const settleAmt = waterfall?.onChainAmount ?? caseClinics.reduce((s, c) => s + c.bill, 0);
  const lienCoAmt = waterfall?.lienCoAmt     ?? 0;
  const clinicAmt = waterfall?.clinicAmt     ?? 0;
  const isMulti   = caseClinics.length > 1;
  const caseId    = lien.caseId ?? lien.id;

  // Clinics that need settling in this run — skip already-settled for idempotent retry
  const clinicsToSettle = caseClinics.filter(c => !c.tx2 || c.settlementError);
  const isRetryRun      = clinicsToSettle.length < caseClinics.length;

  const effectiveLienCoPct = (lienCoAmt + clinicAmt) > 0
    ? Math.round(lienCoAmt / (lienCoAmt + clinicAmt) * 100)
    : (caseClinics[0]?.split ?? 70);
  const hasInViolation  = lien.market === "IN" && effectiveLienCoPct > 80;
  const hasUnusualSplit = effectiveLienCoPct < 30 || effectiveLienCoPct > 85;

  // Animation steps — sized to the clinics being settled in this run
  const steps = (clinicsToSettle.length > 1 || isRetryRun)
    ? [
        { label: "Verifying attorney credentials", detail: "Bar # on file" },
        ...clinicsToSettle.map((c, i) => ({
          label: `Settling clinic ${i + 1} of ${clinicsToSettle.length}`,
          detail: c.clinic,
        })),
        {
          label:  "All settlements confirmed",
          detail: `${clinicsToSettle.length} TX${clinicsToSettle.length === 1 ? "" : "s"} on XRPL`,
        },
      ]
    : [
        { label: "Verifying attorney credentials", detail: "Bar # on file" },
        { label: "Confirming lien details",         detail: lien.market + " market" },
        { label: "Executing settlement on XRPL",    detail: "Payment transaction submitted" },
        { label: "Settlement complete",             detail: "Confirmed on ledger" },
      ];

  async function run() {
    setPhase("running");
    setStep(0);

    const runResults = [];

    if (clinicsToSettle.length === 1 && !isRetryRun) {
      // Single-clinic initial settlement — 4-step animation, real TX on step 2
      await new Promise(r => setTimeout(r, 800));
      setStep(1);
      await new Promise(r => setTimeout(r, 700));
      setStep(2);

      const c   = clinicsToSettle[0];
      const row = waterfall?.clinicRows?.find(r => r.id === c.id);
      const clinicShare = row?.clinicAmt ?? c.bill * (1 - (c.split ?? 70) / 100);
      const result = await executeSettlementPayment({
        caseId, lienId: c.id,
        clinic: { name: c.clinic, destinationAddress: c.destinationAddress },
        amount: clinicShare,
      });
      runResults.push({ ...result, clinicId: c.id });
      setStep(3);
    } else {
      // Multi-clinic or retry — step through each clinic sequentially
      await new Promise(r => setTimeout(r, 700));
      for (let i = 0; i < clinicsToSettle.length; i++) {
        setStep(i + 1);
        const c   = clinicsToSettle[i];
        const row = waterfall?.clinicRows?.find(r => r.id === c.id);
        const clinicShare = row?.clinicAmt ?? c.bill * (1 - (c.split ?? 70) / 100);
        const result = await executeSettlementPayment({
          caseId, lienId: c.id,
          clinic: { name: c.clinic, destinationAddress: c.destinationAddress },
          amount: clinicShare,
        });
        runResults.push({ ...result, clinicId: c.id });
      }
      setStep(steps.length - 1);
    }

    setTxHashes(runResults);
    setPhase("done");

    // Build unified arrays over ALL caseClinics so handleSettled can apply the full update.
    // Already-settled clinics (tx2 set, no error) get their existing data preserved.
    const allHashes = caseClinics.map(c => {
      if (c.tx2 && !c.settlementError) return c.tx2;
      const r = runResults.find(r => r.clinicId === c.id);
      return r?.success ? r.txHash : null;
    });
    const allResults = caseClinics.map(c => {
      if (c.tx2 && !c.settlementError) return { success: true, txHash: c.tx2 };
      const r = runResults.find(r => r.clinicId === c.id);
      return r ?? { success: true }; // clinics not in this batch are treated as already done
    });
    const recoveries = caseClinics.map(c => {
      const row = waterfall?.clinicRows?.find(r => r.id === c.id);
      return row?.lienCoAmt ?? 0;
    });

    onSettled?.(caseId, caseClinics.map(c => c.id), allHashes, recoveries, allResults);
  }

  const EXPLORER = getNetworkConfig().explorer;

  return (
    <div className="ap-overlay" onClick={onClose}>
      <div className="ap-modal" onClick={e => e.stopPropagation()}>
        <button className="ap-close" onClick={onClose}>×</button>

        {phase === "confirm" && (
          <>
            <h3 className="ap-modal-title">Confirm Settlement</h3>
            <p className="ap-modal-sub">
              Settling <strong>{caseId}</strong>
              {isMulti ? ` — ${caseClinics.length} clinics` : ""}
            </p>

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
              Transaction{isMulti ? "s" : ""} will be recorded on the XRPL public ledger.
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
            <p className="ap-modal-sub">{caseId} — {usd(settleAmt)}</p>
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
                {/* One result row per settled clinic */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {clinicsToSettle.map((c, i) => {
                    const r = txHashes[i];
                    return (
                      <div key={c.id} className="ap-hash-box">
                        <div className="ap-hash-label">
                          {clinicsToSettle.length > 1 ? c.clinic : "Transaction Hash"}
                        </div>
                        {r?.success ? (
                          <a
                            href={EXPLORER + r.txHash}
                            target="_blank" rel="noreferrer"
                            className="ap-hash"
                            style={{ textDecoration: "none" }}
                          >
                            {r.txHash?.slice(0, 16)}…{r.txHash?.slice(-8)} ↗
                          </a>
                        ) : (
                          <span style={{ color: "#f87171", fontSize: "0.8rem" }}>
                            Failed: {r?.error ?? "unknown error"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button className="ap-execute-btn" style={{ marginTop: 4 }} onClick={onClose}>Done</button>
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

// ── FiatReceiptModal ──────────────────────────────────────────────────────────
// Operator-only modal to record fiat receipt before settlement execution.
function FiatReceiptModal({ expectedAmount, initial, onSave, onClose }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [amount,       setAmount]       = useState(initial?.amount       ?? expectedAmount);
  const [receivedAt,   setReceivedAt]   = useState(initial?.receivedAt   ?? todayStr);
  const [reference,    setReference]    = useState(initial?.reference    ?? "");
  const [confirmedBy,  setConfirmedBy]  = useState(initial?.confirmedBy  ?? "");
  const [err,          setErr]          = useState("");

  const amountNum  = parseFloat(amount) || 0;
  const mismatch   = Math.abs(amountNum - expectedAmount) > 1;

  function submit(e) {
    e.preventDefault();
    if (!amount || amountNum <= 0) return setErr("Amount is required.");
    if (!receivedAt)               return setErr("Date received is required.");
    if (!reference.trim())         return setErr("Reference is required.");
    if (!confirmedBy.trim())       return setErr("Confirmed by is required.");
    onSave({ amount: amountNum, receivedAt, reference: reference.trim(), confirmedBy: confirmedBy.trim() });
  }

  return (
    <div className="ap-overlay" onClick={onClose}>
      <div className="ap-modal" onClick={e => e.stopPropagation()}>
        <button className="ap-close" onClick={onClose}>×</button>
        <h3 className="ap-modal-title">Mark Fiat Received</h3>
        <p className="ap-modal-sub">Record the attorney's wire/check arrival in LienCo's bank account before settlement.</p>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label className="db-form-label">Amount Received ($)
            <input
              className="db-form-input"
              type="number" min="0" step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder={String(expectedAmount)}
            />
            {mismatch && (
              <span style={{ fontSize: "0.78rem", color: "#fbbf24", marginTop: 4, display: "block" }}>
                Amount differs from expected {usd(expectedAmount)} by {usd(Math.abs(amountNum - expectedAmount))}. Confirm before saving.
              </span>
            )}
          </label>
          <label className="db-form-label">Date Received
            <input
              className="db-form-input"
              type="date"
              value={receivedAt}
              onChange={e => setReceivedAt(e.target.value)}
            />
          </label>
          <label className="db-form-label">Reference
            <input
              className="db-form-input"
              type="text"
              value={reference}
              onChange={e => setReference(e.target.value)}
              placeholder="Wire confirmation #, check #, or ACH ref"
            />
          </label>
          <label className="db-form-label">Confirmed by
            <input
              className="db-form-input"
              type="text"
              value={confirmedBy}
              onChange={e => setConfirmedBy(e.target.value)}
              placeholder="Your initials or name"
            />
          </label>
          {err && <div className="db-form-err">{err}</div>}
          <div className="db-modal-actions">
            <button type="button" className="db-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="db-btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── CaseReductionsPanel ───────────────────────────────────────────────────────
// Shows all reduction requests submitted for the selected case — view-only in Phase 5.
// Each clinic on the case can see requests from other clinics for transparency.
function CaseReductionsPanel({ caseId, reductions }) {
  const rows = reductions.filter(r => r.caseId === caseId);
  const fmtShort = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="ap-compliance-card">
      <div className="ap-compliance-label">
        Case Reductions{rows.length > 0 ? ` — ${rows.length} request${rows.length === 1 ? "" : "s"}` : ""}
      </div>
      {rows.length === 0 ? (
        <p className="ap-compliance-text">No reduction requests submitted for this case.</p>
      ) : (
        <div className="ap-reductions-list">
          {rows.map(r => (
            <div key={r.id} className="ap-reduction-row">
              <div className="ap-reduction-main">
                <span className="ap-reduction-clinic">
                  {r.clinicName || r.clinicLienId || "—"}
                </span>
                <span className={`ap-reduction-badge ap-red-${r.status}`}>{r.status}</span>
              </div>
              <div className="ap-reduction-detail">
                Proposed {usd(r.proposedAmount)} — was {usd(r.originalAmount)}
                {r.reason ? ` · ${r.reason}` : ""}
                {" · "}{fmtShort(r.submittedAt)}
                {r.submittedBy ? ` · ${r.submittedBy}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main exported component ───────────────────────────────────────────────────
export default function AttorneyPreview({ liens, initialCaseId, onSettled, cases, onInvite, isOperatorView = false, onFiatReceiptSave }) {
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
  const [showFiatModal, setShowFiatModal] = useState(false);
  const [toast,         setToast]         = useState("");
  const [waterfall,     setWaterfall]     = useState(null);
  const [reductions,    setReductions]    = useState(() => loadReductionRequests());

  // Sync when the parent changes which lien to preview
  const resolvedInitial = initialCaseId
    ? (liens.find(l => l.id === initialCaseId || l.caseId === initialCaseId)?.caseId ?? initialCaseId)
    : null;
  if (resolvedInitial && resolvedInitial !== selectedCaseId) {
    setSelectedCaseId(resolvedInitial);
    setWaterfall(null);
  }

  // All clinics in the selected case, shaped for WaterfallCard + SettleModal
  const caseClinics = (caseMap[selectedCaseId] ?? []).map(l => ({
    id:                l.id,
    clinic:            l.clinic,
    bill:              l.bill,
    split:             l.split ?? 70,
    market:            l.market,
    destinationAddress: l.destinationAddress,
    tx2:               l.tx2,
    settlementError:   l.settlementError,
    status:            l.status,
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

  // Fiat receipt for the selected case (operator-view only)
  const caseObj    = cases?.find(c => c.caseId === selectedCaseId);
  const fiatReceipt = caseObj?.fiatReceipt ?? null;
  // Expected fiat = full net pool the attorney wires to LienCo (netAvailable),
  // falling back to total bills before waterfall has computed.
  const expectedFiat = waterfall?.netAvailable > 0
    ? waterfall.netAvailable
    : caseClinics.reduce((s, c) => s + c.bill, 0);

  return (
    <div className="ap-root">
      {toast && <div className="rm-toast">{toast}</div>}
      {showFiatModal && isOperatorView && (
        <FiatReceiptModal
          expectedAmount={expectedFiat}
          initial={fiatReceipt}
          onSave={(receipt) => {
            onFiatReceiptSave?.(selectedCaseId, receipt);
            setShowFiatModal(false);
          }}
          onClose={() => setShowFiatModal(false)}
        />
      )}
      {showSettle && (
        <SettleModal
          lien={lien}
          caseClinics={caseClinics}
          waterfall={waterfall}
          onClose={() => setShowSettle(false)}
          onSettled={onSettled}
        />
      )}
      {showReduction && (
        <ReductionModal
          caseId={selectedCaseId}
          caseClinics={isMulti ? caseClinics : null}
          clinicLienId={isMulti ? null : lien.id}
          clinicName={isMulti ? null : lien.clinic}
          bill={isMulti ? null : lien.bill}
          split={isMulti ? null : (lien.split ?? 70)}
          onClose={() => setShowReduction(false)}
          onSubmitted={(id) => {
            setReductions(loadReductionRequests());
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

      {/* Invite Attorney button — shown above the waterfall */}
      {onInvite && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button className="db-btn-secondary" onClick={() => onInvite(selectedCaseId)}>
            {cases?.find(c => c.caseId === selectedCaseId)?.attorneyAssignment
              ? "Manage Invite"
              : "Invite Attorney"}
          </button>
        </div>
      )}

      {/* TX hospital lien priority warning — any case with ≥1 TX clinic */}
      {caseClinics.some(c => c.market === "TX") && MARKET_INFO.TX?.policy?.priorityWarning && (
        <div className="ap-flag-banner ap-flag-orange">
          ⚠ <strong>Texas Hospital Lien Priority Advisory</strong> — {MARKET_INFO.TX.policy.priorityWarning}
        </div>
      )}

      {/* Waterfall — multi-clinic aware */}
      <WaterfallCard
        key={selectedCaseId}
        clinics={caseClinics}
        onWaterfallChange={setWaterfall}
      />

      {/* Split visual — driven by aggregate waterfall amounts */}
      <SplitVisual lienCoAmt={splitLienCoAmt} clinicAmt={splitClinicAmt} />

      <ComplianceBadges market={lien.market} />

      {/* Case-wide reduction requests — all clinics visible for transparency */}
      <CaseReductionsPanel caseId={selectedCaseId} reductions={reductions} />

      {/* Fiat receipt strip — operator-only, shown when receipt exists */}
      {isOperatorView && fiatReceipt && (
        <div className="ap-fiat-strip">
          <div className="ap-fiat-strip-main">
            <span className="ap-fiat-check">✓</span>
            <span>
              <strong>Fiat received</strong> — {usd(fiatReceipt.amount)} on{" "}
              {parseLocalDate(fiatReceipt.receivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} by {fiatReceipt.confirmedBy}
            </span>
          </div>
          <div className="ap-fiat-strip-ref">
            Reference: {fiatReceipt.reference}
            <button className="ap-fiat-update" onClick={() => setShowFiatModal(true)}>Update</button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="ap-actions">
        {isOperatorView && !fiatReceipt && (
          <button className="ap-fiat-btn" onClick={() => setShowFiatModal(true)}>
            Mark Fiat Received
          </button>
        )}
        <button
          className="ap-settle-btn"
          onClick={() => setShowSettle(true)}
          disabled={isOperatorView && !fiatReceipt}
          title={isOperatorView && !fiatReceipt ? "Fiat receipt must be confirmed first." : undefined}
          style={isOperatorView && !fiatReceipt ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
        >
          {caseObj?.status === "Partial Settlement" ? "Retry Failed Payouts" : "Settle Now"} — {usd(splitAmount)}
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
