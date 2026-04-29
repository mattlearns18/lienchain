import { useState } from "react";
import "./IntakeWizard.css";
import { issueLienMPT } from "../lib/xrpl-tokenize.js";

const DEMO_MODE = !import.meta.env.VITE_LIENCO_TESTNET_SEED;

// ── Static data ──────────────────────────────────────────────────────────────
const CLINICS = [
  "KC Pain & Recovery",
  "STL Ortho Clinic",
  "Houston Spine & Joint",
  "DFW Injury Center",
  "LV Recovery Center",
  "Henderson Pain Mgmt",
  "Indy Rehab Partners",
  "Plaza Rehab Group",
  "Midwest Spine Center",
  "Gateway Injury Clinic",
  "Other",
];

const MARKETS = [
  { value: "KC",  label: "KC — Kansas City"  },
  { value: "STL", label: "STL — St. Louis"   },
  { value: "TX",  label: "TX — Texas"        },
  { value: "NV",  label: "NV — Nevada"       },
  { value: "IN",  label: "IN — Indiana"      },
];

const MARKET_INFO = {
  KC:  { state: "Missouri", statute: "RSMo §484.130",                     warnings: [] },
  STL: { state: "Missouri", statute: "RSMo §484.130",                     warnings: [] },
  TX:  { state: "Texas",    statute: "Tex. Health & Safety Code §55.005", warnings: ["⚠ 72-hour rescission window: Texas law allows lien rescission within 72 hours of assignment. Flag all TX liens."] },
  NV:  { state: "Nevada",   statute: "NRS Chapter 108.4939",              warnings: [] },
  IN:  { state: "Indiana",  statute: "Ind. Code §34-51-1",                warnings: ["⛔ Non-assignability risk: Indiana PI liens may be non-assignable. Confirm assignment validity before issuing."] },
};

const MONTHS   = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const YEARS    = [2024, 2025, 2026];
const STEPS    = ["Clinic & Market", "Case Details", "Split Config", "Review & Tokenize"];
const SUB_STEPS = ["Preparing transaction", "Connecting to XRPL testnet", "Issuing MPT token", "Confirming on ledger"];

// ── Helpers ──────────────────────────────────────────────────────────────────
function genCaseId() {
  const h = () => Math.floor(Math.random() * 16).toString(16);
  return `0x${Array.from({ length: 6 }, h).join("")}...${Array.from({ length: 3 }, h).join("")}`;
}

function mockTxHash() {
  return Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16).toUpperCase()
  ).join("");
}

// ── Main component ────────────────────────────────────────────────────────────
/**
 * @param {object}   props
 * @param {Function} props.onClose
 * @param {Function} props.onComplete  Called with the finished ClinicLien object
 * @param {object[]} props.cases       Open cases from the store (for "add clinic" dropdown)
 */
export default function IntakeWizard({ onClose, onComplete, cases = [] }) {
  // "new" = create new case; "add" = add clinic to existing case
  const [mode,            setMode]           = useState("new");
  const [selectedCaseId,  setSelectedCaseId] = useState("");

  const [step, setStep] = useState(0);

  // Step 1
  const [clinic,      setClinic]      = useState("");
  const [clinicOther, setClinicOther] = useState("");
  const [market,      setMarket]      = useState("");

  // Step 2 — lienId is always a unique ID for this specific clinic lien.
  // In "new" mode it also serves as the caseId.
  // In "add" mode the parent case's caseId is used instead.
  const [lienId,       setLienId]       = useState("");
  const [billAmount,   setBillAmount]   = useState("");
  const [treatMonth,   setTreatMonth]   = useState("");
  const [treatYear,    setTreatYear]    = useState("2025");
  const [attorneyFirm, setAttorneyFirm] = useState("");
  const [attorneyBar,  setAttorneyBar]  = useState("");

  // Step 3
  const [lienCoShare,   setLienCoShare]   = useState(70);
  const [reductionNote, setReductionNote] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");

  // Submission
  const [submitting,  setSubmitting]  = useState(false);
  const [submitStep,  setSubmitStep]  = useState(-1);
  const [txHash,      setTxHash]      = useState("");
  const [explorerUrl, setExplorerUrl] = useState("");
  const [done,        setDone]        = useState(false);
  const [submitError, setSubmitError] = useState("");

  // ── Derived ──
  const openCases   = cases.filter(c => c.status !== "Settled");
  const parentCase  = openCases.find(c => c.caseId === selectedCaseId) ?? null;

  const clinicName  = clinic === "Other" ? clinicOther : clinic;
  const clinicShare = 100 - lienCoShare;
  const billNum     = parseFloat(billAmount) || 0;
  const defaultPrice= Math.round(billNum * 0.78);
  const purchaseNum = parseFloat(purchasePrice) || defaultPrice;
  const lienCoAmt   = Math.floor(billNum * lienCoShare / 100);
  const clinicAmt   = billNum - lienCoAmt;
  const marketInfo  = market ? MARKET_INFO[market] : null;

  // Effective case-level values (inherited from parent in "add" mode)
  const effectiveAttorney   = mode === "add" ? (parentCase?.attorney ?? "")         : attorneyFirm;
  const effectiveTreatMonth = mode === "add" ? (parentCase?.treatmentMonth ?? "")   : treatMonth;
  const effectiveTreatYear  = mode === "add" ? (parentCase?.treatmentYear  ?? "")   : treatYear;
  const effectiveCaseId     = mode === "add" ? selectedCaseId                       : lienId;

  // ── Validation ──
  const step1Valid = mode === "new"
    ? (clinic && (clinic !== "Other" || clinicOther.trim()) && market)
    : (selectedCaseId && clinic && (clinic !== "Other" || clinicOther.trim()) && market);

  const step2Valid = mode === "add"
    ? (lienId.trim() && billNum > 0)   // treatMonth + attorney inherited from case
    : (lienId.trim() && billNum > 0 && treatMonth && attorneyFirm.trim());

  // ── Build record ──
  function buildLienRecord(hash, status) {
    const flags = [];
    if (market === "TX") flags.push("tx-72h");
    if (market === "IN") flags.push("in-nonassignable");
    return {
      id:             lienId,
      // Phase 5: caseId links to parent Case.
      // "new" mode → caseId = lienId (single-clinic case, they match).
      // "add" mode → caseId = selectedCaseId (the pre-existing case).
      caseId:         effectiveCaseId,
      market,
      clinic:         clinicName,
      bill:           billNum,
      split:          lienCoShare,
      ts:             new Date().toISOString(),
      attorney:       effectiveAttorney,
      treatmentMonth: effectiveTreatMonth,
      treatmentYear:  effectiveTreatYear,
      tx1:            hash,
      tx2:            null,
      flags,
      status,
    };
  }

  // ── Reset to "add another clinic" state ──
  function handleAddAnother() {
    // Keep mode=add and selectedCaseId — go back to step 1 so the user picks
    // a different clinic + market for the same case, then mints another lien.
    setMode("add");
    // selectedCaseId stays as-is (the case we just added to)
    setStep(0);
    setClinic("");
    setClinicOther("");
    setMarket("");
    setLienId("");
    setBillAmount("");
    setTreatMonth("");
    setTreatYear("2025");
    setAttorneyFirm("");
    setAttorneyBar("");
    setLienCoShare(70);
    setReductionNote("");
    setPurchasePrice("");
    setSubmitting(false);
    setSubmitStep(-1);
    setTxHash("");
    setExplorerUrl("");
    setDone(false);
    setSubmitError("");
  }

  // ── Submit ──
  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError("");

    if (DEMO_MODE) {
      const delays = [900, 1000, 1200, 900];
      for (let i = 0; i < SUB_STEPS.length; i++) {
        setSubmitStep(i);
        await new Promise(r => setTimeout(r, delays[i]));
      }
      const hash = mockTxHash();
      const url  = `https://testnet.xrpl.org/transactions/${hash}`;
      setTxHash(hash);
      setExplorerUrl(url);
      setDone(true);
      onComplete(buildLienRecord(hash, "Active"));
      return;
    }

    setSubmitStep(0);
    await new Promise(r => setTimeout(r, 500));
    setSubmitStep(1);

    const payload = {
      id:           lienId,
      caseId:       effectiveCaseId,
      bill:         billNum,
      split:        lienCoShare,
      clinic:       clinicName,
      market,
      attorney:     effectiveAttorney,
      purchasePrice: purchaseNum,
      reductionNote,
    };

    const [result] = await Promise.all([
      issueLienMPT(payload),
      new Promise(r => setTimeout(r, 3000)).then(() => setSubmitStep(2)),
    ]);

    if (result.success) {
      setSubmitStep(3);
      await new Promise(r => setTimeout(r, 500));
      setTxHash(result.txHash);
      setExplorerUrl(result.explorerUrl);
      setDone(true);
      onComplete(buildLienRecord(result.txHash, "Active"));
    } else {
      setSubmitError(result.error);
      setSubmitting(false);
    }
  }

  function handleSaveDraft() {
    onComplete(buildLienRecord(null, "Draft"));
    onClose();
  }

  // ── Mode option card (for Step 1 toggle) ──
  function ModeCard({ id, title, sub, icon }) {
    return (
      <label
        className={`wiz-mode-card ${mode === id ? "wiz-mode-card-active" : ""}`}
        onClick={() => { setMode(id); setSelectedCaseId(""); }}
      >
        <div className="wiz-mode-icon">{icon}</div>
        <div>
          <div className="wiz-mode-title">{title}</div>
          <div className="wiz-mode-sub">{sub}</div>
        </div>
      </label>
    );
  }

  return (
    <div className="wiz-overlay" onClick={onClose}>
      <div className="wiz-modal" onClick={e => e.stopPropagation()}>

        {/* Sticky top */}
        <div className="wiz-sticky-top">
          <div className="wiz-header">
            <div>
              <h2 className="wiz-title">
                {mode === "add" ? "Add Clinic to Case" : "Create New Lien"}
              </h2>
              <p className="wiz-sub">
                {done
                  ? DEMO_MODE ? "Lien tokenized (simulated)" : "Lien tokenized on XRPL Testnet"
                  : submitting
                  ? "Tokenizing…"
                  : `Step ${step + 1} of 4 — ${STEPS[step]}`}
              </p>
            </div>
            <button className="wiz-close" onClick={onClose}>×</button>
          </div>

          {!submitting && !done && (
            <div className="wiz-steps">
              {STEPS.map((s, i) => (
                <div key={s} className="wiz-step-item">
                  <div className={`wiz-step-dot ${i < step ? "dot-done" : i === step ? "dot-active" : "dot-idle"}`}>
                    {i < step ? "✓" : i + 1}
                  </div>
                  <span className="wiz-step-label">{s}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── STEP 1 — Clinic & Market ── */}
        {step === 0 && !submitting && (
          <div className="wiz-body">

            {/* Mode toggle — new case vs add to existing */}
            <div className="wiz-field">
              <label className="wiz-label">Case Type</label>
              <div className="wiz-mode-cards">
                <ModeCard
                  id="new"
                  icon="＋"
                  title="New case"
                  sub="Create a case with this as the first clinic lien"
                />
                <ModeCard
                  id="add"
                  icon="⊕"
                  title="Add clinic to existing case"
                  sub={openCases.length ? `${openCases.length} open case${openCases.length === 1 ? "" : "s"} available` : "No open cases yet"}
                />
              </div>
            </div>

            {/* Existing case selector */}
            {mode === "add" && (
              <div className="wiz-field">
                <label className="wiz-label">Existing Case</label>
                {openCases.length === 0 ? (
                  <div className="wiz-market-warn warn-orange">
                    No open cases yet — mint a first lien to create a case, then come back to add a second clinic.
                  </div>
                ) : (
                  <select
                    className="wiz-select"
                    value={selectedCaseId}
                    onChange={e => setSelectedCaseId(e.target.value)}
                  >
                    <option value="">Select a case…</option>
                    {openCases.map(c => (
                      <option key={c.caseId} value={c.caseId}>
                        {c.caseId}
                        {c.attorney ? ` — ${c.attorney}` : ""}
                        {` — ${c.clinicLienIds.length} clinic${c.clinicLienIds.length === 1 ? "" : "s"}`}
                        {c.treatmentMonth ? ` — ${c.treatmentMonth} ${c.treatmentYear}` : ""}
                      </option>
                    ))}
                  </select>
                )}
                {parentCase && (
                  <div className="wiz-market-banner" style={{ marginTop: 4 }}>
                    <span className="wiz-statute">
                      Attorney: {parentCase.attorney || "—"} · Treatment: {parentCase.treatmentMonth} {parentCase.treatmentYear}
                    </span>
                    <span className="wiz-statute" style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
                      These fields are inherited from the case and will not be re-entered.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Clinic */}
            <div className="wiz-field">
              <label className="wiz-label">Clinic</label>
              <select className="wiz-select" value={clinic} onChange={e => setClinic(e.target.value)}>
                <option value="">Select clinic…</option>
                {CLINICS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {clinic === "Other" && (
              <div className="wiz-field">
                <label className="wiz-label">Clinic Name</label>
                <input className="wiz-input" value={clinicOther} onChange={e => setClinicOther(e.target.value)} placeholder="Enter clinic name" />
              </div>
            )}

            {/* Market */}
            <div className="wiz-field">
              <label className="wiz-label">Market</label>
              <select className="wiz-select" value={market} onChange={e => setMarket(e.target.value)}>
                <option value="">Select market…</option>
                {MARKETS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            {marketInfo && (
              <div className="wiz-market-banner">
                <span className="wiz-statute">{marketInfo.state} · {marketInfo.statute}</span>
                {marketInfo.warnings.map(w => (
                  <div key={w} className={`wiz-market-warn ${market === "TX" ? "warn-orange" : "warn-red"}`}>{w}</div>
                ))}
              </div>
            )}

          </div>
        )}

        {/* ── STEP 2 — Case Details ── */}
        {step === 1 && !submitting && (
          <div className="wiz-body">

            {/* In "add" mode show inherited case context as read-only */}
            {mode === "add" && parentCase && (
              <div className="wiz-preview-card">
                <div className="wiz-preview-title">Inherited from case {parentCase.caseId}</div>
                <div className="wiz-preview-row">
                  <span>Attorney</span>
                  <strong>{parentCase.attorney || "—"}</strong>
                </div>
                <div className="wiz-preview-row">
                  <span>Treatment</span>
                  <strong>{parentCase.treatmentMonth} {parentCase.treatmentYear}</strong>
                </div>
                <div className="wiz-preview-row">
                  <span>Existing clinics</span>
                  <strong>{parentCase.clinicLienIds.length}</strong>
                </div>
              </div>
            )}

            {/* Unique lien ID — always needed */}
            <div className="wiz-field">
              <label className="wiz-label">
                {mode === "add" ? "Clinic Lien ID" : "Case ID"}
              </label>
              <div className="wiz-row-inline">
                <input
                  className="wiz-input"
                  value={lienId}
                  onChange={e => setLienId(e.target.value)}
                  placeholder={mode === "add" ? "e.g. PI-LIEN-STL-002" : "e.g. PI-LIEN-KC-001"}
                />
                <button className="wiz-gen-btn" onClick={() => setLienId(genCaseId())}>Generate ID</button>
              </div>
              {mode === "add" && (
                <span style={{ fontSize: "0.74rem", color: "var(--muted)", marginTop: 2, display: "block" }}>
                  Unique ID for this clinic's lien — separate from the case ID above.
                </span>
              )}
            </div>

            <div className="wiz-field">
              <label className="wiz-label">Bill Amount ($)</label>
              <input className="wiz-input" type="number" min="0" value={billAmount} onChange={e => setBillAmount(e.target.value)} placeholder="e.g. 12500" />
            </div>

            {/* Case-level fields — only shown for new cases */}
            {mode === "new" && (<>
              <div className="wiz-field">
                <label className="wiz-label">Treatment Month</label>
                <div className="wiz-row-inline">
                  <select className="wiz-select" value={treatMonth} onChange={e => setTreatMonth(e.target.value)}>
                    <option value="">Month…</option>
                    {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select className="wiz-select" style={{ maxWidth: 100 }} value={treatYear} onChange={e => setTreatYear(e.target.value)}>
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              <div className="wiz-field">
                <label className="wiz-label">Attorney Firm</label>
                <input className="wiz-input" value={attorneyFirm} onChange={e => setAttorneyFirm(e.target.value)} placeholder="e.g. Smith & Associates" />
              </div>

              <div className="wiz-field">
                <label className="wiz-label">Attorney Bar Number <span className="wiz-optional">(optional)</span></label>
                <input className="wiz-input" value={attorneyBar} onChange={e => setAttorneyBar(e.target.value)} placeholder="e.g. MO Bar #54321" />
              </div>
            </>)}

          </div>
        )}

        {/* ── STEP 3 — Split Config ── */}
        {step === 2 && !submitting && (
          <div className="wiz-body">
            <div className="wiz-field">
              <label className="wiz-label">LienCo Share — <strong>{lienCoShare}%</strong> &nbsp;·&nbsp; Clinic Share — <strong>{clinicShare}%</strong></label>
              <input type="range" min={0} max={100} value={lienCoShare} onChange={e => setLienCoShare(Number(e.target.value))} className="wiz-slider" />
              <div className="wiz-slider-labels"><span>0%</span><span>100%</span></div>
            </div>

            {market === "IN" && lienCoShare > 80 && (
              <div className="wiz-market-warn warn-red">⛔ Indiana 20% floor applies — clinic must receive at least 20%.</div>
            )}
            {(lienCoShare < 30 || lienCoShare > 85) && (
              <div className="wiz-market-warn warn-orange">⚠ Unusual split ratio — please confirm reduction note fully documents the negotiation.</div>
            )}

            <div className="wiz-split-preview">
              <div className="wiz-split-bar-row">
                <div className="wiz-split-seg wiz-seg-lienco" style={{ width: `${lienCoShare}%` }}>{lienCoShare}%</div>
                <div className="wiz-split-seg wiz-seg-clinic"  style={{ width: `${clinicShare}%` }}>{clinicShare}%</div>
              </div>
              <div className="wiz-split-labels">
                <span>LienCo: <strong>${lienCoAmt.toLocaleString()}</strong></span>
                <span>{clinicName || "Clinic"}: <strong>${clinicAmt.toLocaleString()}</strong></span>
              </div>
            </div>

            <div className="wiz-field">
              <label className="wiz-label">Purchase Price ($) <span className="wiz-optional">default: bill × 0.78</span></label>
              <input className="wiz-input" type="number" min="0" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} placeholder={String(defaultPrice)} />
            </div>

            <div className="wiz-field">
              <label className="wiz-label">Reduction Note <span className="wiz-optional">(optional)</span></label>
              <input className="wiz-input" value={reductionNote} onChange={e => setReductionNote(e.target.value)} placeholder="e.g. Negotiated 22% reduction" />
            </div>

            <div className="wiz-preview-card">
              <div className="wiz-preview-title">Live Preview</div>
              <div className="wiz-preview-row"><span>Bill Amount</span><strong>${billNum.toLocaleString()}</strong></div>
              <div className="wiz-preview-row"><span>Purchase Price</span><strong>${purchaseNum.toLocaleString()}</strong></div>
              <div className="wiz-preview-row"><span>LienCo Share ({lienCoShare}%)</span><strong>${lienCoAmt.toLocaleString()}</strong></div>
              <div className="wiz-preview-row"><span>Clinic Share ({clinicShare}%)</span><strong>${clinicAmt.toLocaleString()}</strong></div>
            </div>

          </div>
        )}

        {/* ── STEP 4 — Review & Tokenize ── */}
        {step === 3 && !submitting && !done && !submitError && (
          <div className="wiz-body">
            {DEMO_MODE && (
              <div className="wiz-demo-banner">
                Demo mode — tokenization will be simulated. Configure{" "}
                <code>VITE_LIENCO_TESTNET_SEED</code> to enable real on-chain issuance.
              </div>
            )}
            <div className="wiz-review-grid">
              <div className="wiz-review-group">
                <div className="wiz-review-heading">Clinic &amp; Market</div>
                <div className="wiz-review-row"><span>Clinic</span><strong>{clinicName}</strong></div>
                <div className="wiz-review-row"><span>Market</span><strong>{market}</strong></div>
                <div className="wiz-review-row"><span>State</span><strong>{marketInfo?.state}</strong></div>
                <div className="wiz-review-row"><span>Statute</span><strong>{marketInfo?.statute}</strong></div>
              </div>
              <div className="wiz-review-group">
                <div className="wiz-review-heading">Case Details</div>
                <div className="wiz-review-row">
                  <span>Case ID</span><strong>{effectiveCaseId}</strong>
                </div>
                <div className="wiz-review-row">
                  <span>Clinic Lien ID</span><strong>{lienId}</strong>
                </div>
                <div className="wiz-review-row"><span>Bill Amount</span><strong>${billNum.toLocaleString()}</strong></div>
                <div className="wiz-review-row">
                  <span>Treatment</span>
                  <strong>{effectiveTreatMonth} {effectiveTreatYear}</strong>
                </div>
                <div className="wiz-review-row">
                  <span>Attorney</span><strong>{effectiveAttorney}</strong>
                </div>
                {attorneyBar && mode === "new" && (
                  <div className="wiz-review-row"><span>Bar #</span><strong>{attorneyBar}</strong></div>
                )}
              </div>
              <div className="wiz-review-group">
                <div className="wiz-review-heading">Split Configuration</div>
                <div className="wiz-review-row"><span>LienCo Share</span><strong>{lienCoShare}% (${lienCoAmt.toLocaleString()})</strong></div>
                <div className="wiz-review-row"><span>Clinic Share</span><strong>{clinicShare}% (${clinicAmt.toLocaleString()})</strong></div>
                <div className="wiz-review-row"><span>Purchase Price</span><strong>${purchaseNum.toLocaleString()}</strong></div>
                {reductionNote && <div className="wiz-review-row"><span>Reduction Note</span><strong>{reductionNote}</strong></div>}
              </div>
            </div>

            <div className="wiz-explainer">
              <div className="wiz-explainer-title">What happens when you submit</div>
              {[
                mode === "add"
                  ? `An MPT will be issued on XRPL testnet, linked to case ${effectiveCaseId}`
                  : "An MPT will be issued on XRPL testnet",
                "The lien will appear in your portfolio",
                "An attorney portal link will be generated",
                "You'll get a transaction hash",
              ].map((s, i) => (
                <div key={i} className="wiz-explainer-row">
                  <span className="wiz-explainer-num">{i + 1}</span>
                  {s}
                </div>
              ))}
            </div>

          </div>
        )}

        {/* ── ERROR ── */}
        {step === 3 && !submitting && !done && submitError && (
          <div className="wiz-body wiz-error-body">
            <div className="wiz-error-card">
              <div className="wiz-error-icon">⚠</div>
              <h4 className="wiz-error-title">Tokenization Failed</h4>
              <p className="wiz-error-msg">{submitError}</p>
            </div>
            <div className="wiz-error-actions">
              <button className="wiz-btn-secondary" onClick={() => setSubmitError("")}>← Try Again</button>
              <button className="wiz-btn-primary" onClick={handleSaveDraft}>Save as Draft (skip tokenization)</button>
            </div>
          </div>
        )}

        {/* ── SUBMITTING ── */}
        {submitting && !done && (
          <div className="wiz-body wiz-progress-body">
            <p className="wiz-progress-title">Tokenizing on XRPL Testnet…</p>
            <div className="wiz-sub-steps">
              {SUB_STEPS.map((s, i) => (
                <div key={s} className={`wiz-sub-step ${i <= submitStep ? "sub-active" : "sub-idle"}`}>
                  <div className={`wiz-sub-dot ${i < submitStep ? "sub-done" : i === submitStep ? "sub-current" : ""}`}>
                    {i < submitStep ? "✓" : i + 1}
                  </div>
                  <div>
                    <div className="wiz-sub-label">{s}</div>
                    <div className="wiz-sub-detail">
                      {i < submitStep ? "Done" : i === submitStep ? "In progress…" : "Waiting"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {done && (
          <div className="wiz-body wiz-success-body">
            <div className="wiz-success-icon">✓</div>
            <h3 className="wiz-success-title">
              {DEMO_MODE ? "Lien Tokenized (Simulated)" : "Lien Tokenized on XRPL Testnet"}
            </h3>
            <p className="wiz-success-sub">
              {lienId} has been issued{DEMO_MODE ? " (simulated)" : " as an NFT record"} on XRPL testnet
              {mode === "add" ? ` and added to case ${effectiveCaseId}` : ""}.
            </p>
            <div className="wiz-tx-box">
              <div className="wiz-tx-label">Transaction Hash{DEMO_MODE ? " (simulated)" : ""}</div>
              <code className="wiz-tx-hash">{txHash}</code>
            </div>
            <div className="wiz-attorney-link">
              <div className="wiz-tx-label">Attorney Portal Link</div>
              <code className="wiz-tx-hash">/attorney/{encodeURIComponent(effectiveCaseId)}</code>
            </div>
            <div className="wiz-success-btns">
              <a
                href={explorerUrl}
                target="_blank" rel="noreferrer"
                className="wiz-btn-secondary"
                style={{ textDecoration: "none", textAlign: "center" }}
              >
                View on XRPL Explorer →
              </a>
              <button className="wiz-btn-primary" onClick={onClose}>Done</button>
            </div>
            {/* "Add another clinic" CTA — always shown so user can stack clinics */}
            <button
              className="wiz-btn-secondary"
              style={{ width: "100%", marginTop: 2 }}
              onClick={handleAddAnother}
            >
              + Add another clinic to this case
            </button>
          </div>
        )}

        {/* ── FIXED FOOTER — step nav buttons ── */}
        {!submitting && !done && (
          <div className="wiz-footer">
            <div className="wiz-footer-btns">
              {step === 0 && <>
                <button className="wiz-btn-secondary" onClick={onClose}>Cancel</button>
                <button className="wiz-btn-primary" disabled={!step1Valid} onClick={() => setStep(1)}>Next →</button>
              </>}
              {step === 1 && <>
                <button className="wiz-btn-secondary" onClick={() => setStep(0)}>← Back</button>
                <button className="wiz-btn-primary" disabled={!step2Valid} onClick={() => {
                  if (!purchasePrice) setPurchasePrice(String(defaultPrice));
                  setStep(2);
                }}>Next →</button>
              </>}
              {step === 2 && <>
                <button className="wiz-btn-secondary" onClick={() => setStep(1)}>← Back</button>
                <button className="wiz-btn-primary" onClick={() => setStep(3)}>Next →</button>
              </>}
              {step === 3 && <>
                <button className="wiz-btn-secondary" onClick={() => setStep(2)}>← Back</button>
                <button className="wiz-btn-primary wiz-btn-submit" onClick={handleSubmit}>Submit &amp; Tokenize →</button>
              </>}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
