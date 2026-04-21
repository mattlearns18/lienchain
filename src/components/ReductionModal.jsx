import { useState } from "react";
import "./ReductionModal.css";

const REASONS = [
  "Settlement smaller than expected",
  "Attorney fees exceeded estimate",
  "Medical costs exceeded estimate",
  "Patient hardship",
  "Co-defendant settlement",
  "Policy limits reached",
  "Other (specify below)",
];

const SUB_STEPS = [
  { label: "Preparing request",    detail: "Compiling lien details" },
  { label: "Sending to LienChain", detail: "Secure transmission" },
  { label: "Request submitted",    detail: "Confirmation generated" },
];

const DELAYS = [1000, 2000, 500];

function genRequestId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return "RED-" + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

const usd = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReductionModal({ caseId, bill, split, attorneyName = "", onClose, onSubmitted }) {
  const [proposed,    setProposed]    = useState("");
  const [reason,      setReason]      = useState("");
  const [context,     setContext]     = useState("");
  const [name,        setName]        = useState(attorneyName);
  const [email,       setEmail]       = useState("");
  const [phone,       setPhone]       = useState("");
  const [amtError,    setAmtError]    = useState("");
  const [emailError,  setEmailError]  = useState("");
  const [phase,       setPhase]       = useState("form"); // form | submitting | success
  const [subStep,     setSubStep]     = useState(-1);
  const [requestId,   setRequestId]   = useState("");

  const proposedNum  = parseFloat(proposed) || 0;
  const clinicShare  = 100 - split;
  const lienCoAmt    = Math.floor(bill * split / 100);
  const clinicAmt    = bill - lienCoAmt;

  const newLienCoAmt = proposedNum > 0 ? Math.floor(proposedNum * split / 100) : 0;
  const newClinicAmt = proposedNum > 0 ? proposedNum - newLienCoAmt : 0;
  const reduction    = proposedNum > 0 ? bill - proposedNum : 0;
  const reductionPct = proposedNum > 0 ? ((reduction / bill) * 100).toFixed(1) : "0";

  function validateAmt() {
    if (!proposed) { setAmtError("Required"); return false; }
    if (proposedNum >= bill) { setAmtError("Must be less than current bill amount"); return false; }
    if (proposedNum <= 0)    { setAmtError("Must be greater than $0"); return false; }
    setAmtError(""); return true;
  }

  function validateEmail() {
    if (!email.trim()) { setEmailError("Required"); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setEmailError("Invalid email format"); return false; }
    setEmailError(""); return true;
  }

  async function handleSubmit() {
    const amtOk   = validateAmt();
    const emailOk = validateEmail();
    if (!amtOk || !emailOk) return;

    setPhase("submitting");
    for (let i = 0; i < SUB_STEPS.length; i++) {
      setSubStep(i);
      await new Promise(r => setTimeout(r, DELAYS[i]));
    }
    setRequestId(genRequestId());
    setPhase("success");
  }

  function handleClose() {
    if (phase === "success") onSubmitted(caseId);
    onClose();
  }

  return (
    <div className="rm-overlay" onClick={handleClose}>
      <div className="rm-modal" onClick={e => e.stopPropagation()}>
        <button className="rm-close" onClick={handleClose}>×</button>

        {/* ── FORM ── */}
        {phase === "form" && (
          <>
            <div className="rm-header">
              <h3 className="rm-title">Request Lien Reduction</h3>
              <p className="rm-sub">{caseId}</p>
            </div>

            <div className="rm-info-banner">
              Use this form to propose a reduced settlement amount to LienChain. Our team will review and respond within 1 business day.
            </div>

            {/* Current amounts (read-only) */}
            <div className="rm-current-card">
              <div className="rm-card-label">Current Lien Info</div>
              <div className="rm-current-row"><span>Bill Amount</span><strong>{usd(bill)}</strong></div>
              <div className="rm-current-row"><span>LienCo Share ({split}%)</span><strong>{usd(lienCoAmt)}</strong></div>
              <div className="rm-current-row last"><span>Clinic Share ({clinicShare}%)</span><strong>{usd(clinicAmt)}</strong></div>
            </div>

            {/* Proposed amount */}
            <div className="rm-field">
              <label className="rm-label">Proposed Reduced Amount ($)</label>
              <input
                className={`rm-input ${amtError ? "rm-input-err" : ""}`}
                type="number" min="0"
                value={proposed}
                onChange={e => { setProposed(e.target.value); setAmtError(""); }}
                onBlur={validateAmt}
                placeholder={`Less than ${usd(bill)}`}
              />
              {amtError && <span className="rm-err-msg">{amtError}</span>}
            </div>

            {/* Auto-calculated preview */}
            {proposedNum > 0 && proposedNum < bill && (
              <div className="rm-preview-card">
                <div className="rm-card-label">Reduction Preview</div>
                <div className="rm-current-row"><span>New LienCo Share ({split}%)</span><strong className="rm-green">{usd(newLienCoAmt)}</strong></div>
                <div className="rm-current-row"><span>New Clinic Share ({clinicShare}%)</span><strong className="rm-green">{usd(newClinicAmt)}</strong></div>
                <div className="rm-current-row last"><span>Total Reduction</span><strong className="rm-amber">{usd(reduction)} ({reductionPct}% reduction)</strong></div>
              </div>
            )}

            {/* Reason */}
            <div className="rm-field">
              <label className="rm-label">Reason for Reduction Request</label>
              <select className="rm-select" value={reason} onChange={e => setReason(e.target.value)}>
                <option value="">Select reason…</option>
                {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {/* Context */}
            <div className="rm-field">
              <label className="rm-label">Additional Context <span className="rm-optional">(optional)</span></label>
              <textarea
                className="rm-textarea"
                maxLength={500}
                rows={3}
                value={context}
                onChange={e => setContext(e.target.value)}
                placeholder="Any additional details that support the reduction request…"
              />
              <span className="rm-char-count">{context.length}/500</span>
            </div>

            {/* Contact info */}
            <div className="rm-contact-section">
              <div className="rm-card-label">Contact Information</div>
              <div className="rm-field">
                <label className="rm-label">Attorney Name <span className="rm-optional">(optional)</span></label>
                <input className="rm-input" value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />
              </div>
              <div className="rm-field">
                <label className="rm-label">Attorney Email</label>
                <input
                  className={`rm-input ${emailError ? "rm-input-err" : ""}`}
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setEmailError(""); }}
                  onBlur={validateEmail}
                  placeholder="you@lawfirm.com"
                />
                {emailError && <span className="rm-err-msg">{emailError}</span>}
              </div>
              <div className="rm-field">
                <label className="rm-label">Attorney Phone <span className="rm-optional">(optional)</span></label>
                <input className="rm-input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 000-0000" />
              </div>
            </div>

            <div className="rm-footer">
              <button className="rm-btn-secondary" onClick={handleClose}>Cancel</button>
              <button className="rm-btn-primary" onClick={handleSubmit}>Submit Reduction Request</button>
            </div>
          </>
        )}

        {/* ── SUBMITTING ── */}
        {phase === "submitting" && (
          <div className="rm-progress-body">
            <p className="rm-progress-title">Submitting Request…</p>
            <div className="rm-sub-steps">
              {SUB_STEPS.map((s, i) => (
                <div key={i} className={`rm-sub-step ${i <= subStep ? "rm-sub-active" : "rm-sub-idle"}`}>
                  <div className={`rm-sub-dot ${i < subStep ? "rm-dot-done" : i === subStep ? "rm-dot-current" : ""}`}>
                    {i < subStep ? "✓" : i + 1}
                  </div>
                  <div>
                    <div className="rm-sub-label">{s.label}</div>
                    <div className="rm-sub-detail">
                      {i < subStep ? "Done" : i === subStep ? "In progress…" : "Waiting"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {phase === "success" && (
          <div className="rm-success-body">
            <div className="rm-success-icon">✓</div>
            <h3 className="rm-success-title">Reduction Request Submitted</h3>
            <div className="rm-request-id-box">
              <div className="rm-request-id-label">Request ID</div>
              <code className="rm-request-id">{requestId}</code>
            </div>
            <p className="rm-success-sub">You'll hear back within 1 business day via email.</p>
            <button className="rm-btn-primary rm-btn-full" onClick={handleClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
