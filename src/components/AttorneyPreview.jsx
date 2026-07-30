import { useState, useEffect } from "react";
import "./AttorneyPreview.css";
import ReductionModal from "./ReductionModal.jsx";
import { loadReductionRequests } from "../lib/store.js";
import { MARKET_INFO } from "../lib/markets.js";
import { getNetworkConfig } from "../lib/network.js";
import { executeSettlementPayment } from "../lib/settle-onchain.js";
import { calcWaterfall } from "../lib/waterfall.js";

const usd = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Parse a YYYY-MM-DD date string as a local date (avoids UTC-midnight off-by-one in CDT/etc.)
function parseLocalDate(ymd) {
  const [y, m, d] = ymd.split("-");
  return new Date(+y, +m - 1, +d);
}

// Today's date as YYYY-MM-DD in LOCAL time. `toISOString().slice(0,10)` is the UTC
// day — after ~6-7pm Central it returns tomorrow's date, mis-stamping fiat receipts
// and patient disbursements recorded in the evening. Same off-by-one parseLocalDate
// guards against on the read side.
function localTodayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

// ── Multi-clinic waterfall calculator ────────────────────────────────────────
//
// Backtest hardening (2026-06): this used to carry its own copy of the IN-floor
// waterfall algorithm. That duplicate drifted from src/lib/waterfall.js — in
// pool-exhausted multi-IN cases it tagged a different set of clinics with FLOOR,
// so the operator's "Attorney View" preview and the real /attorney/:caseId portal
// (which already uses calcWaterfall) disagreed on the compliance display.
//
// It is now a thin wrapper over the single source of truth, calcWaterfall. The
// wrapper only adds the attorney-fee math + the legacy return-shape aliases this
// component's children (SettleModal / SplitVisual / WaterfallCard) consume.
//
// @param {number} grossNum
// @param {number} attyFeePct
// @param {number} costsNum
// @param {Array<{id,clinic,bill,split,market}>} clinics
function calcMultiClinicWaterfall(grossNum, attyFeePct, costsNum, clinics) {
  const attyFeeAmt   = Math.round(grossNum * attyFeePct / 100);
  const netAvailable = grossNum - attyFeeAmt - costsNum;
  const inFloorPct   = MARKET_INFO.IN?.policy?.clinicFloorPct ?? 0.20;

  const r = calcWaterfall(Math.max(0, netAvailable), clinics, inFloorPct);

  // Preserve legacy patientNet semantics: when fees+costs exceed the gross the
  // old inline version surfaced the signed (negative) residual so the existing
  // isPatientNeg / isNetNeg banner logic keeps working. calcWaterfall floors
  // patientNet at 0, so restore the signed value in that one branch.
  const patientNet = netAvailable <= 0 ? netAvailable : r.patientNet;

  return {
    grossNum, attyFeePct, attyFeeAmt, costsNum, netAvailable,
    totalBills:        r.totalBills,
    onChainTotal:      r.onChainTotal,
    totalLienCo:       r.totalLienCo,
    totalClinic:       r.totalClinic,
    patientNet,
    clinicRows:        r.clinicRows,
    floorAppliedCount: r.floorAppliedCount,
    poolExhausted:     r.poolExhausted,
    // Backward-compat aliases for SettleModal / SplitVisual
    onChainAmount: r.onChainTotal,
    lienCoAmt:     r.totalLienCo,
    clinicAmt:     r.totalClinic,
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
function SettleModal({ onClose, lien, caseClinics, waterfall, onSettled, patientNet = 0, patientDisbursement = null, isOperatorView = false, onOpenPatientModal }) {
  const [phase,         setPhase]         = useState("confirm");
  const [step,          setStep]          = useState(0);
  const [txHashes,      setTxHashes]      = useState([]); // array of {success, txHash?, error?, clinicId}
  const [confirmedCount, setConfirmedCount] = useState(0); // successful TX count, stored in state for final-screen render
  const [runSnapshot,   setRunSnapshot]   = useState(null); // clinicsToSettle frozen at run() call — prevents 0-count after onSettled fires

  const settleAmt = waterfall?.onChainAmount ?? caseClinics.reduce((s, c) => s + c.bill, 0);
  const lienCoAmt = waterfall?.lienCoAmt     ?? 0;
  const clinicAmt = waterfall?.clinicAmt     ?? 0;
  const isMulti   = caseClinics.length > 1;
  const caseId    = lien.caseId ?? lien.id;

  // Clinics that need settling in this run — skip already-settled for idempotent retry
  const clinicsToSettle = caseClinics.filter(c => !c.tx2 || c.settlementError);
  const isRetryRun      = clinicsToSettle.length < caseClinics.length;
  // Use the snapshot once the run has started — prevents parent re-render (after onSettled writes tx2)
  // from zeroing out the clinic list before the done-screen finishes displaying.
  const effectiveClinics = runSnapshot ?? clinicsToSettle;

  const effectiveLienCoPct = (lienCoAmt + clinicAmt) > 0
    ? Math.round(lienCoAmt / (lienCoAmt + clinicAmt) * 100)
    : (caseClinics[0]?.split ?? 70);
  const hasInViolation  = lien.market === "IN" && effectiveLienCoPct > 80;
  const hasUnusualSplit = effectiveLienCoPct < 30 || effectiveLienCoPct > 85;

  // Animation steps — sized to the clinics being settled in this run.
  // Use effectiveClinics (frozen snapshot post-run) so the step list doesn't collapse to
  // zero entries when the parent re-renders after onSettled writes tx2 to localStorage.
  const steps = (effectiveClinics.length > 1 || isRetryRun)
    ? [
        { label: "Verifying attorney credentials", detail: "Bar # on file" },
        ...effectiveClinics.map((c, i) => ({
          label: `Settling clinic ${i + 1} of ${effectiveClinics.length}`,
          detail: c.clinic,
        })),
        {
          label:  "All settlements confirmed",
          detail: `${effectiveClinics.length} TX${effectiveClinics.length === 1 ? "" : "s"} on XRPL`,
        },
      ]
    : [
        { label: "Verifying attorney credentials", detail: "Bar # on file" },
        { label: "Confirming lien details",         detail: lien.market + " market" },
        { label: "Executing settlement on XRPL",    detail: "Payment transaction submitted" },
        { label: "Settlement complete",             detail: "Confirmed on ledger" },
      ];

  async function run() {
    // Freeze the clinic list before any awaits — the parent will re-render after onSettled
    // writes tx2 to localStorage, which would cause clinicsToSettle to compute as [] and
    // collapse the step list and TX count to 0.
    setRunSnapshot([...clinicsToSettle]);
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

    const successCount = runResults.filter(r => r.success).length;
    setTxHashes(runResults);
    setConfirmedCount(successCount);
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
      // Use waterfall lienCoAmt (LienCo dollar share after pro-rata) if available;
      // fall back to bill × split% as a reasonable approximation when waterfall is null.
      return row?.lienCoAmt ?? Math.round(c.bill * (c.split ?? 70) / 100);
    });
    // Per-clinic dollar payout actually sent on-chain (pro-rata / IN-floor adjusted),
    // parallel to recoveries. Persisted on any failed clinic so a Retry re-sends this
    // exact amount instead of re-approximating bill × (1 − split%), which overpays on
    // a shortfall settlement.
    const payouts = caseClinics.map(c => {
      const row = waterfall?.clinicRows?.find(r => r.id === c.id);
      return row?.clinicAmt ?? c.bill * (1 - (c.split ?? 70) / 100);
    });

    onSettled?.(caseId, caseClinics.map(c => c.id), allHashes, recoveries, allResults, waterfall?.patientNet ?? 0, payouts);
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
              {patientNet > 0 && (
                <div className="ap-wf-row">
                  <span className="ap-wf-row-label ap-wf-indent" style={{ color: "var(--muted)" }}>Patient Net Recovery</span>
                  <span className="ap-wf-row-val" style={{ color: "var(--muted)" }}>{usd(patientNet)}</span>
                </div>
              )}
            </div>

            {/* Patient disbursement status strip — operator-only, when patient net > 0 */}
            {isOperatorView && patientNet > 0 && (
              patientDisbursement ? (
                <div className="ap-fiat-strip" style={{ marginTop: 8 }}>
                  <div className="ap-fiat-strip-main">
                    <span className="ap-fiat-check">✓</span>
                    <span>
                      <strong>Patient disbursed</strong> — {usd(patientDisbursement.amount)} on{" "}
                      {parseLocalDate(patientDisbursement.disbursedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} by {patientDisbursement.confirmedBy}
                    </span>
                  </div>
                  <div className="ap-fiat-strip-ref">
                    Reference: {patientDisbursement.reference}
                    <button className="ap-fiat-update" onClick={onOpenPatientModal}>Update</button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 8, padding: "10px 12px", background: "rgba(251,191,36,0.08)", borderRadius: 6, border: "1px solid rgba(251,191,36,0.25)" }}>
                  <div style={{ color: "#fbbf24", fontSize: "0.85rem", marginBottom: 6 }}>
                    ⚠ Patient disbursement not yet recorded — {usd(patientNet)} owed to patient
                  </div>
                  <button className="ap-fiat-btn" onClick={onOpenPatientModal}>
                    Mark Patient Disbursed
                  </button>
                </div>
              )
            )}

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
              {steps.map((s, i) => {
                const isLastStep     = i === steps.length - 1;
                const totalAttempted = effectiveClinics.length; // use frozen snapshot, not live filter
                // Override the final step's detail once results are in (confirmedCount from state).
                // Applies to both single- and multi-clinic so the done screen always reads "N TX confirmed on XRPL".
                const detail = phase === "done" && isLastStep
                  ? confirmedCount === totalAttempted
                    ? `${confirmedCount} TX${confirmedCount === 1 ? "" : "s"} confirmed on XRPL`
                    : `${confirmedCount} of ${totalAttempted} TXs confirmed on XRPL`
                  : s.detail;
                return (
                  <div key={i} className={`ap-step ${(step >= i || phase === "done") ? "ap-step-active" : ""}`}>
                    <div className={`ap-step-dot ${phase === "done" || step > i ? "dot-green" : step === i ? "dot-teal" : ""}`}>
                      {(phase === "done" || step > i) ? "✓" : i + 1}
                    </div>
                    <div>
                      <div className="ap-step-label">{s.label}</div>
                      <div className="ap-step-detail">{detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {phase === "done" && (
              <>
                {/* One result row per settled clinic — use effectiveClinics (frozen snapshot) */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {effectiveClinics.map((c, i) => {
                    const r = txHashes[i];
                    return (
                      <div key={c.id} className="ap-hash-box">
                        <div className="ap-hash-label">
                          {c.clinic}
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
  const todayStr = localTodayStr();
  const [amount,       setAmount]       = useState(initial?.amount       ?? expectedAmount);
  const [touched,      setTouched]      = useState(false);
  const [receivedAt,   setReceivedAt]   = useState(initial?.receivedAt   ?? todayStr);
  const [reference,    setReference]    = useState(initial?.reference    ?? "");
  const [confirmedBy,  setConfirmedBy]  = useState(initial?.confirmedBy  ?? "");
  const [err,          setErr]          = useState("");

  // Sync prefill if the waterfall finishes computing after this modal mounted.
  // Guarded by `touched`: once the operator types anything in the amount field,
  // their entry is never overwritten by a later waterfall recompute. Without the
  // guard, any parent re-render that shifted expectedAmount silently clobbered
  // a hand-entered wire amount.
  useEffect(() => {
    if (!touched && !initial?.amount && expectedAmount > 0) {
      setAmount(expectedAmount);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expectedAmount]);

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
              onChange={e => { setTouched(true); setAmount(e.target.value); }}
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

// ── PatientDisbursalModal ─────────────────────────────────────────────────────
// Operator-only modal to record the attorney's patient disbursement from trust account.
// Mirrors FiatReceiptModal — same form structure, separate audit record.
function PatientDisbursalModal({ expectedAmount, initial, onSave, onClose }) {
  const todayStr = localTodayStr();
  const [amount,      setAmount]      = useState(initial?.amount      ?? expectedAmount);
  const [touched,     setTouched]     = useState(false);
  const [disbursedAt, setDisbursedAt] = useState(initial?.disbursedAt ?? todayStr);
  const [reference,   setReference]   = useState(initial?.reference   ?? "");
  const [confirmedBy, setConfirmedBy] = useState(initial?.confirmedBy ?? "");
  const [err,         setErr]         = useState("");

  // Same prefill-sync as FiatReceiptModal (this modal was added in Phase 12
  // without it, so mounting before the waterfall computed left the amount at 0).
  // `touched` guard: never overwrite a hand-entered amount.
  useEffect(() => {
    if (!touched && !initial?.amount && expectedAmount > 0) {
      setAmount(expectedAmount);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expectedAmount]);

  const amountNum = parseFloat(amount) || 0;
  const mismatch  = Math.abs(amountNum - expectedAmount) > 1;

  function submit(e) {
    e.preventDefault();
    if (!amount || amountNum <= 0) return setErr("Amount is required.");
    if (!disbursedAt)              return setErr("Date disbursed is required.");
    if (!reference.trim())         return setErr("Reference is required.");
    if (!confirmedBy.trim())       return setErr("Confirmed by is required.");
    onSave({ amount: amountNum, disbursedAt, reference: reference.trim(), confirmedBy: confirmedBy.trim() });
  }

  return (
    <div className="ap-overlay" onClick={onClose}>
      <div className="ap-modal" onClick={e => e.stopPropagation()}>
        <button className="ap-close" onClick={onClose}>×</button>
        <h3 className="ap-modal-title">Mark Patient Disbursed</h3>
        <p className="ap-modal-sub">Record the attorney's disbursement to the patient from their trust account.</p>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label className="db-form-label">Amount Disbursed ($)
            <input
              className="db-form-input"
              type="number" min="0" step="0.01"
              value={amount}
              onChange={e => { setTouched(true); setAmount(e.target.value); }}
              placeholder={String(expectedAmount)}
            />
            {mismatch && (
              <span style={{ fontSize: "0.78rem", color: "#fbbf24", marginTop: 4, display: "block" }}>
                Amount differs from expected {usd(expectedAmount)} by {usd(Math.abs(amountNum - expectedAmount))}. Confirm before saving.
              </span>
            )}
          </label>
          <label className="db-form-label">Date Disbursed
            <input
              className="db-form-input"
              type="date"
              value={disbursedAt}
              onChange={e => setDisbursedAt(e.target.value)}
            />
          </label>
          <label className="db-form-label">Reference
            <input
              className="db-form-input"
              type="text"
              value={reference}
              onChange={e => setReference(e.target.value)}
              placeholder="Trust account check #, wire ref, or ACH ref"
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
export default function AttorneyPreview({ liens, initialCaseId, onSettled, cases, onInvite, isOperatorView = false, onFiatReceiptSave, onPatientDisbursementSave }) {
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
  const [showSettle,        setShowSettle]        = useState(false);
  const [showReduction,     setShowReduction]     = useState(false);
  const [showFiatModal,     setShowFiatModal]     = useState(false);
  const [showPatientModal,  setShowPatientModal]  = useState(false);
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
  const fiatReceipt          = caseObj?.fiatReceipt          ?? null;
  const patientDisbursement  = caseObj?.patientDisbursement  ?? null;
  const patientNet           = waterfall?.patientNet          ?? 0;
  // Expected fiat = full net pool the attorney wires to LienCo (netAvailable).
  // Use waterfall result when available; otherwise compute from default inputs
  // (gross = totalBills, attyFee = 33%, costs = $0 — same defaults as WaterfallCard)
  // so the prefill is always netAvailable, not the gross amount.
  const totalBillsForFiat = caseClinics.reduce((s, c) => s + c.bill, 0);
  const expectedFiat = waterfall?.netAvailable > 0
    ? waterfall.netAvailable
    : Math.round(totalBillsForFiat * (1 - 33 / 100));

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
      {showPatientModal && isOperatorView && (
        <PatientDisbursalModal
          expectedAmount={patientNet}
          initial={patientDisbursement}
          onSave={(disbursement) => {
            onPatientDisbursementSave?.(selectedCaseId, disbursement);
            setShowPatientModal(false);
          }}
          onClose={() => setShowPatientModal(false)}
        />
      )}
      {showSettle && (
        <SettleModal
          lien={lien}
          caseClinics={caseClinics}
          waterfall={waterfall}
          onClose={() => setShowSettle(false)}
          onSettled={onSettled}
          patientNet={patientNet}
          patientDisbursement={patientDisbursement}
          isOperatorView={isOperatorView}
          onOpenPatientModal={() => setShowPatientModal(true)}
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
