import { useState } from "react";
import "./AttorneyPreview.css";
import "./IntakeWizard.css";
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

const STEPS = [
  { label: "Preparing request",    detail: "Compiling lien details" },
  { label: "Sending to LienChain", detail: "Secure transmission"    },
  { label: "Request submitted",    detail: "Confirmation generated"  },
];

const DELAYS = [1000, 2000, 500];

function genRequestId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return "RED-" + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

const usd = (n) =>
  "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReductionModal({
  caseId,
  bill,
  split,
  attorneyName = "",
  onClose,
  onSubmitted,
}) {
  const [phase,      setPhase]     = useState("confirm"); // confirm | running | done
  const [step,       setStep]      = useState(0);
  const [requestId,  setRequestId] = useState("");

  // Form
  const [proposed,   setProposed]   = useState("");
  const [reason,     setReason]     = useState("");
  const [context,    setContext]    = useState("");
  const [name,       setName]       = useState(attorneyName);
  const [email,      setEmail]      = useState("");
  const [phone,      setPhone]      = useState("");

  // Validation
  const [amtError,   setAmtError]   = useState("");
  const [emailError, setEmailError] = useState("");

  // Derived
  const clinicShare  = 100 - split;
  const lienCoAmt    = Math.floor(bill * split / 100);
  const clinicAmt    = bill - lienCoAmt;
  const proposedNum  = parseFloat(proposed) || 0;
  const newLienCoAmt = proposedNum > 0 ? Math.floor(proposedNum * split / 100) : 0;
  const newClinicAmt = proposedNum > 0 ? proposedNum - newLienCoAmt : 0;
  const reduction    = proposedNum > 0 ? bill - proposedNum : 0;
  const reductionPct = proposedNum > 0 ? ((reduction / bill) * 100).toFixed(1) : "0";
  const showPreview  = proposedNum > 0 && proposedNum < bill;

  function validateAmt() {
    if (!proposed)           { setAmtError("Required"); return false; }
    if (proposedNum >= bill) { setAmtError("Must be less than current bill amount"); return false; }
    if (proposedNum <= 0)    { setAmtError("Must be greater than $0"); return false; }
    setAmtError(""); return true;
  }

  function validateEmail() {
    if (!email.trim())                              { setEmailError("Required"); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setEmailError("Invalid email format"); return false; }
    setEmailError(""); return true;
  }

  async function run() {
    const amtOk   = validateAmt();
    const emailOk = validateEmail();
    if (!amtOk || !emailOk) return;

    setPhase("running");
    for (let i = 0; i < STEPS.length; i++) {
      setStep(i);
      await new Promise(r => setTimeout(r, DELAYS[i]));
    }
    setRequestId(genRequestId());
    setPhase("done");
  }

  function handleClose() {
    if (phase === "done") onSubmitted(caseId);
    onClose();
  }

  const title = phase === "running" ? "Submitting…"
              : phase === "done"    ? "Request Submitted"
              :                       "Request Lien Reduction";

  return (
    <div className="ap-overlay" onClick={handleClose}>
      <div className="ap-modal rm-modal-wide" onClick={e => e.stopPropagation()}>

        {/* ── FIXED HEADER ── */}
        <div className="rm-hd">
          <div>
            <h3 className="ap-modal-title">{title}</h3>
            <p className="ap-modal-sub">{caseId}</p>
          </div>
          <button className="ap-close" onClick={handleClose}>×</button>
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div className="rm-body">

          {phase === "confirm" && (
            <>
              <div className="ap-info-banner">
                Use this form to propose a reduced settlement amount to LienChain.
                Our team will review and respond within 1 business day.
              </div>

              {/* Current lien info (read-only) */}
              <div>
                <div className="ap-split-label">Current Lien Info</div>
                <div className="ap-info-grid">
                  {[
                    ["Bill Amount",              usd(bill)],
                    [`LienCo Share (${split}%)`,    usd(lienCoAmt)],
                    [`Clinic Share (${clinicShare}%)`, usd(clinicAmt)],
                  ].map(([label, value]) => (
                    <div key={label} className="ap-info-row">
                      <span className="ap-info-label">{label}</span>
                      <span className="ap-info-value">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Proposed amount */}
              <div className="wiz-field">
                <label className="wiz-label">Proposed Reduced Amount ($)</label>
                <input
                  className={`wiz-input${amtError ? " rm-input-err" : ""}`}
                  type="number" min="0"
                  value={proposed}
                  onChange={e => { setProposed(e.target.value); setAmtError(""); }}
                  onBlur={validateAmt}
                  placeholder={`Less than ${usd(bill)}`}
                />
                {amtError && <span className="rm-err-msg">{amtError}</span>}
              </div>

              {/* Live reduction preview */}
              {showPreview && (
                <div className="rm-preview-card">
                  <div className="ap-split-label">Reduction Preview</div>
                  {[
                    [`New LienCo Share (${split}%)`,    usd(newLienCoAmt), false],
                    [`New Clinic Share (${clinicShare}%)`, usd(newClinicAmt), false],
                    ["Total Reduction", `${usd(reduction)} (${reductionPct}% reduction)`, true],
                  ].map(([label, value, amber]) => (
                    <div key={label} className="ap-info-row">
                      <span className="ap-info-label">{label}</span>
                      <span className={`ap-info-value${amber ? " rm-amber" : ""}`}>{value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Reason */}
              <div className="wiz-field">
                <label className="wiz-label">Reason for Reduction Request</label>
                <select className="wiz-select" value={reason} onChange={e => setReason(e.target.value)}>
                  <option value="">Select reason…</option>
                  {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* Context */}
              <div className="wiz-field">
                <label className="wiz-label">
                  Additional Context <span className="wiz-optional">(optional)</span>
                </label>
                <textarea
                  className="wiz-input rm-textarea"
                  maxLength={500} rows={3}
                  value={context}
                  onChange={e => setContext(e.target.value)}
                  placeholder="Any additional details that support the reduction request…"
                />
                <span className="rm-char-count">{context.length}/500</span>
              </div>

              {/* Contact info */}
              <div className="rm-contact-section">
                <div className="ap-split-label">Contact Information</div>
                <div className="wiz-field">
                  <label className="wiz-label">
                    Attorney Name <span className="wiz-optional">(optional)</span>
                  </label>
                  <input className="wiz-input" value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />
                </div>
                <div className="wiz-field">
                  <label className="wiz-label">Attorney Email</label>
                  <input
                    className={`wiz-input${emailError ? " rm-input-err" : ""}`}
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setEmailError(""); }}
                    onBlur={validateEmail}
                    placeholder="you@lawfirm.com"
                  />
                  {emailError && <span className="rm-err-msg">{emailError}</span>}
                </div>
                <div className="wiz-field">
                  <label className="wiz-label">
                    Attorney Phone <span className="wiz-optional">(optional)</span>
                  </label>
                  <input className="wiz-input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 000-0000" />
                </div>
              </div>
            </>
          )}

          {(phase === "running" || phase === "done") && (
            <>
              <div className="ap-steps">
                {STEPS.map((s, i) => (
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
                <div className="ap-hash-box">
                  <div className="ap-hash-label">Request ID</div>
                  <code className="ap-hash">{requestId}</code>
                </div>
              )}
            </>
          )}

        </div>{/* end rm-body */}

        {/* ── FIXED FOOTER ── */}
        {phase === "confirm" && (
          <div className="rm-ft">
            <div className="ap-actions">
              <button className="ap-secondary-btn" onClick={handleClose}>Cancel</button>
              <button className="ap-execute-btn" onClick={run}>Submit Reduction Request</button>
            </div>
          </div>
        )}
        {phase === "done" && (
          <div className="rm-ft">
            <p className="ap-modal-sub" style={{ marginBottom: 10 }}>
              You'll hear back within 1 business day via email.
            </p>
            <button className="ap-execute-btn" onClick={handleClose}>Close</button>
          </div>
        )}

      </div>
    </div>
  );
}
