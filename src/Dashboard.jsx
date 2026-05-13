import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Link } from "react-router-dom";
import { getWalletBalances, getAllMarketActivity } from "./lib/xrpl-data.js";
import { loadLiens, saveLiens, loadCases, saveCases, createCaseForLien, upsertCase, loadReductionRequests, saveReductionRequests, loadAttorneys, saveAttorneys, genAttorneyId } from "./lib/store.js";
import IntakeWizard from "./components/IntakeWizard.jsx";
import AttorneyPreview from "./components/AttorneyPreview.jsx";
import "./Dashboard.css";

// Wallet addresses (seeds never leave the server-side scripts)
const WALLETS = [
  { key: "lienCo",    label: "LienCo",     address: "rMQ8RJNz2qt7haf8UFXoFAZej6ERoAa62S", role: "issuer"  },
  { key: "kcClinic",  label: "KC Clinic",  address: "rMsuF1wrwMNcFntEet39yUGcTUpyAhWiMA", role: "clinic"  },
  { key: "stlClinic", label: "STL Clinic", address: "r3CuAh6S7JnjcsN5z8LyoUDZiBvT8aVBBP", role: "clinic"  },
  { key: "txClinic",  label: "TX Clinic",  address: "rJZjjSDgfPkKhCKnLrmGuKn8Npb54eBU6D", role: "clinic"  },
  { key: "nvClinic",  label: "NV Clinic",  address: "rKvS6Pa5GXiCxB8cQXJy1oBKbE2gYGFoWu", role: "clinic"  },
  { key: "inClinic",  label: "IN Clinic",  address: "rnanVCk3APmjh1dtzS9pESNRm42VsSLvXt", role: "clinic"  },
];

// Historical settlement records (on-chain, always shown)
const SETTLEMENTS = [
  { id: "PI-LIEN-2025-11-001",   market: "KC", clinic: "KC Clinic",  bill: 8500,  split: 70, ts: "2026-03-28T17:20:26Z", tx1: "90BDE0592A181242807FC7FBF0828D0F375A047D25633DB1ACE7251A5592BFDC", tx2: "7D80F757585499BF2322CD587AB05B41B21050DA453BF61239A9BAF563B9D480", flags: [] },
  { id: "PI-LIEN-2026-04-TX001", market: "TX", clinic: "TX Clinic",  bill: 18400, split: 72, ts: "2026-04-20T02:48:33Z", tx1: "623549C92642B8A351A071408DF8FB56FE87818EBD2132F1D21E9F9647D8064C", tx2: "5ADFB159756E183E96AFD2F5073EC240A330173B3594CCD3A201D46FF8C97E42", flags: ["tx-72h"] },
  { id: "PI-LIEN-2026-04-NV001", market: "NV", clinic: "NV Clinic",  bill: 12400, split: 65, ts: "2026-04-20T02:48:50Z", tx1: "8E492D22B44F1BB755BBB59B1DD8B86727E65C637C671B604EB8B1808F8209E9", tx2: "5CA13EDB51A94485081718B4FAA08DD47A5F3FBD2145F59B5AB176DC381C0FEC", flags: [] },
  { id: "PI-LIEN-2026-04-IN001", market: "IN", clinic: "IN Clinic",  bill: 9800,  split: 70, ts: "2026-04-20T02:49:07Z", tx1: "521F59DE3D867D701866C98F57CE2507D55F87CAA50AE6BAF8C0D03A0C3E2526", tx2: "573115D5AAEAD7C8847B7D2D0402E5ADF42B3A4CB0542BC944DF095AEE819CD0", flags: ["in-nonassignable"] },
];

const EXPLORER  = "https://testnet.xrpl.org/transactions/";
const ACCT_URL  = "https://testnet.xrpl.org/accounts/";
const FLAG_INFO = {
  "tx-72h":           { label: "TX 72h Flag",      color: "flag-orange", tip: "Texas law provides a 72-hour rescission window after lien assignment. Monitor for reversal requests." },
  "in-nonassignable": { label: "IN Non-Assignable", color: "flag-red",   tip: "Indiana statute limits lien assignability in PI cases. Confirm assignment validity before secondary transfer." },
};

import { MARKETS, MARKET_INFO } from "./lib/markets.js";

// ── Helpers ─────────────────────────────────────────────────────────────────
const usd      = (n) => `$${Number(n).toLocaleString()}`;
const shortH   = (h) => h ? `${h.slice(0, 8)}…${h.slice(-6)}` : "—";
const fmtDate  = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtTime  = (d)   => d instanceof Date && !isNaN(d)
  ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  : "—";
const isSettled = (r) => !r.status || r.status === "Settled";

// Chart color constants — pull from the same palette as the rest of the dashboard
const CHART_ACTIVE_COLOR  = "#3b82f6"; // --accent blue
const CHART_SETTLED_COLOR = "#10b981"; // --green
const CHART_LINE_COLOR    = "#06b6d4"; // --accent2 cyan

// ── Sub-components ───────────────────────────────────────────────────────────
function Spinner() {
  return <span className="spinner" aria-label="Loading" />;
}

function FlagBadge({ flag }) {
  const [tip, setTip] = useState(false);
  const info = FLAG_INFO[flag];
  if (!info) return null;
  return (
    <span className={`flag-badge ${info.color}`} onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)}>
      {info.label}
      {tip && <span className="flag-tip">{info.tip}</span>}
    </span>
  );
}

function MultiChip({ markets }) {
  const [tip, setTip] = useState(false);
  return (
    <span
      className="db-market-chip db-multi-chip"
      onMouseEnter={() => setTip(true)}
      onMouseLeave={() => setTip(false)}
      style={{ position: "relative" }}
    >
      Multi
      {tip && <span className="flag-tip">{markets.join(", ")}</span>}
    </span>
  );
}

function MarketFilter({ value, onChange }) {
  return (
    <div className="db-mkt-filter" role="tablist" aria-label="Market filter">
      {MARKETS.map((m) => (
        <button
          key={m}
          type="button"
          className={`db-mkt-chip ${value === m ? "db-mkt-chip-active" : ""}`}
          onClick={() => onChange(m)}
          aria-pressed={value === m}
        >
          {m === "All" ? "All Markets" : m}
        </button>
      ))}
    </div>
  );
}

function StatusCell({ status }) {
  if (status === "Active")  return <span className="db-status-active">🟢 Active</span>;
  if (status === "Draft")   return <span className="db-status-draft">📋 Draft</span>;
  return <span className="db-status-badge">✅ Settled</span>;
}

// ── CaseGroupRow — one parent row per case, optional child rows per clinic ───
function CaseGroupRow({ caseId, clinics, onPreview, caseObj, onInvite }) {
  const [open, setOpen] = useState(false);
  const isMulti = clinics.length > 1;

  // Aggregate stats for the parent row
  const totalBill     = clinics.reduce((s, c) => s + c.bill, 0);
  const wtdLienCoAmt  = clinics.reduce((s, c) => s + c.bill * (c.split ?? 70) / 100, 0);
  const wtdLienCoPct  = totalBill > 0 ? Math.round(wtdLienCoAmt / totalBill * 100) : 70;
  const wtdClinicPct  = 100 - wtdLienCoPct;

  // Case status: undefined status → "Settled" (matches original LienRow fallthrough logic;
  // seed liens have no status field and should display as Settled)
  const statuses = new Set(clinics.map(c => c.status ?? "Settled"));
  const caseStatus = statuses.size === 1 ? [...statuses][0]
    : statuses.has("Active") ? "Active" : statuses.has("Draft") ? "Draft" : "Settled";

  // Flags: union across all clinics
  const allFlags = [...new Set(clinics.flatMap(c => c.flags ?? []))];

  // Markets: show single chip or a hoverable "Multi" if clinics span different markets
  const markets = [...new Set(clinics.map(c => c.market))];

  // Earliest date
  const date = clinics.reduce((min, c) => (!min || c.ts < min ? c.ts : min), null);

  // TX links only for single-clinic cases
  const single = !isMulti ? clinics[0] : null;

  return (
    <>
      {/* Parent / case row */}
      <tr className="db-case-row">
        <td className="db-lien-id">
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {isMulti && (
              <button
                className="db-expand-toggle"
                onClick={() => setOpen(o => !o)}
                aria-label={open ? "Collapse" : "Expand"}
              >
                {open ? "▾" : "▸"}
              </button>
            )}
            <span>{caseId}</span>
            {caseObj?.attorneyAssignment?.acceptedAt
              ? <span className="db-invite-badge db-invite-accepted">Accepted</span>
              : caseObj?.attorneyAssignment?.sentAt
              ? <span className="db-invite-badge db-invite-invited">Invited</span>
              : null}
            {isMulti && (
              <span className="db-clinics-badge">{clinics.length} clinics</span>
            )}
          </span>
        </td>
        <td>
          {markets.length === 1
            ? <span className="db-market-chip">{markets[0]}</span>
            : <MultiChip markets={markets} />}
        </td>
        <td style={{ fontWeight: 700 }}>{usd(totalBill)}</td>
        <td>
          <div className="db-split-bar" style={{ width: 80 }}>
            <div className="db-split-lienco" style={{ width: `${wtdLienCoPct}%` }}>{wtdLienCoPct}%</div>
            <div className="db-split-clinic"  style={{ width: `${wtdClinicPct}%` }}>{wtdClinicPct}%</div>
          </div>
        </td>
        <td className="db-muted">{date ? fmtDate(date) : "—"}</td>
        <td className="db-flags-cell">
          {allFlags.length ? allFlags.map(f => <FlagBadge key={f} flag={f} />) : <span className="db-muted">—</span>}
        </td>
        <td><StatusCell status={caseStatus} /></td>
        <td>
          {single?.tx1
            ? <a href={EXPLORER + single.tx1} target="_blank" rel="noreferrer" className="db-tx-link">{shortH(single.tx1)}</a>
            : <span className="db-muted">{isMulti ? "—" : "—"}</span>}
        </td>
        <td>
          {single?.tx2
            ? <a href={EXPLORER + single.tx2} target="_blank" rel="noreferrer" className="db-tx-link">{shortH(single.tx2)}</a>
            : <span className="db-muted">—</span>}
        </td>
        <td style={{ whiteSpace: "nowrap" }}>
          <button className="db-preview-btn" onClick={() => onPreview(caseId)}>Attorney View →</button>
          {onInvite && (
            <button className="db-btn-secondary db-invite-btn" onClick={() => onInvite(caseId)}>
              {caseObj?.attorneyAssignment ? "Manage Invite" : "Invite Attorney"}
            </button>
          )}
        </td>
      </tr>

      {/* Child rows — one per clinic, shown when expanded */}
      {isMulti && open && clinics.map(c => (
        <tr key={c.id} className="db-child-row">
          <td className="db-lien-id">
            <span className="db-child-indent">↳ {c.id}</span>
          </td>
          <td><span className="db-market-chip">{c.market}</span></td>
          <td>{usd(c.bill)}</td>
          <td>{c.split ?? 70}% / {100 - (c.split ?? 70)}%</td>
          <td className="db-muted">{fmtDate(c.ts)}</td>
          <td className="db-flags-cell">
            {(c.flags ?? []).length
              ? (c.flags ?? []).map(f => <FlagBadge key={f} flag={f} />)
              : <span className="db-muted">—</span>}
          </td>
          <td><StatusCell status={c.status ?? "Settled"} /></td>
          <td>
            {c.tx1
              ? <a href={EXPLORER + c.tx1} target="_blank" rel="noreferrer" className="db-tx-link">{shortH(c.tx1)}</a>
              : <span className="db-muted">—</span>}
          </td>
          <td>
            {c.tx2
              ? <a href={EXPLORER + c.tx2} target="_blank" rel="noreferrer" className="db-tx-link">{shortH(c.tx2)}</a>
              : <span className="db-muted">—</span>}
          </td>
          <td><span className="db-muted">—</span></td>
        </tr>
      ))}
    </>
  );
}

// ── CaseLienTable — groups liens by caseId, renders CaseGroupRow per case ────
function CaseLienTable({ rows, emptyText, onPreview, cases, onInvite }) {
  if (!rows.length) return <div className="db-feed-empty">{emptyText}</div>;

  // Group by caseId, preserving insertion order
  const caseMap = {};
  const caseOrder = [];
  for (const r of rows) {
    const key = r.caseId ?? r.id;
    if (!caseMap[key]) { caseMap[key] = []; caseOrder.push(key); }
    caseMap[key].push(r);
  }

  return (
    <div className="db-table-wrap">
      <table className="db-table">
        <thead>
          <tr>
            <th>Case / Lien ID</th>
            <th>Market</th>
            <th>Bill</th>
            <th>Split</th>
            <th>Date</th>
            <th>Flags</th>
            <th>Status</th>
            <th>TX 1</th>
            <th>TX 2</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {caseOrder.map(cid => (
            <CaseGroupRow
              key={cid}
              caseId={cid}
              clinics={caseMap[cid]}
              onPreview={onPreview}
              caseObj={cases?.find(c => c.caseId === cid)}
              onInvite={onInvite}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Flat LienTable kept for the Settlements tab (settled-only, no grouping needed)
function LienRow({ r, onPreview }) {
  return (
    <tr>
      <td className="db-lien-id">{r.id}</td>
      <td><span className="db-market-chip">{r.market}</span></td>
      <td>{usd(r.bill)}</td>
      <td>{r.split}% / {100 - r.split}%</td>
      <td className="db-muted">{fmtDate(r.ts)}</td>
      <td className="db-flags-cell">
        {r.flags.length ? r.flags.map(f => <FlagBadge key={f} flag={f} />) : <span className="db-muted">—</span>}
      </td>
      <td><StatusCell status={r.status ?? "Settled"} /></td>
      <td>
        {r.tx1
          ? <a href={EXPLORER + r.tx1} target="_blank" rel="noreferrer" className="db-tx-link">{shortH(r.tx1)}</a>
          : <span className="db-muted">—</span>}
      </td>
      <td>
        {r.tx2
          ? <a href={EXPLORER + r.tx2} target="_blank" rel="noreferrer" className="db-tx-link">{shortH(r.tx2)}</a>
          : <span className="db-muted">—</span>}
      </td>
      <td>
        <button className="db-preview-btn" onClick={() => onPreview(r.id)}>Attorney View →</button>
      </td>
    </tr>
  );
}

function LienTable({ rows, emptyText, onPreview }) {
  if (!rows.length) return <div className="db-feed-empty">{emptyText}</div>;
  return (
    <div className="db-table-wrap">
      <table className="db-table">
        <thead>
          <tr>
            <th>Lien ID</th>
            <th>Market</th>
            <th>Bill</th>
            <th>Split</th>
            <th>Date</th>
            <th>Flags</th>
            <th>Status</th>
            <th>TX 1</th>
            <th>TX 2</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => <LienRow key={r.id} r={r} onPreview={onPreview} />)}
        </tbody>
      </table>
    </div>
  );
}

function ComplianceStateCard({ code, info, liens }) {
  const marketLiens = liens.filter(r => r.market === code);
  const flaggedLiens = marketLiens.filter(r => r.flags.length);
  return (
    <div className="db-market-card">
      <div className="db-market-header">
        <span className="db-market-chip">{code}</span>
        <span className="db-muted">{info.state}</span>
        {info.flags.map(f => <FlagBadge key={f} flag={f} />)}
      </div>
      <div className="db-compliance-notes">{info.notes}</div>
      <div className="db-muted db-compliance-count">
        {marketLiens.length
          ? `${marketLiens.length} lien${marketLiens.length === 1 ? "" : "s"} in this market` +
            (flaggedLiens.length ? ` · ${flaggedLiens.length} flagged` : "")
          : "No liens in this market yet"}
      </div>
    </div>
  );
}

// Seed IDs — used by the store to distinguish historical liens from user-created ones
const SEED_IDS = new Set(SETTLEMENTS.map(l => l.id));

// ── AttorneyFormModal — Add / Edit attorney ───────────────────────────────────
function AttorneyFormModal({ initial, onSave, onClose }) {
  const isEdit = !!initial?.id;
  const [name,      setName]      = useState(initial?.name      ?? "");
  const [firm,      setFirm]      = useState(initial?.firm      ?? "");
  const [barNumber, setBarNumber] = useState(initial?.barNumber ?? "");
  const [email,     setEmail]     = useState(initial?.email     ?? "");
  const [err,       setErr]       = useState("");

  function submit(e) {
    e.preventDefault();
    if (!name.trim())  return setErr("Name is required.");
    if (!firm.trim())  return setErr("Firm is required.");
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setErr("Valid email required.");
    onSave({
      id:        initial?.id ?? genAttorneyId(),
      name:      name.trim(),
      firm:      firm.trim(),
      barNumber: barNumber.trim(),
      email:     email.trim(),
      addedAt:   initial?.addedAt ?? new Date().toISOString(),
    });
    onClose();
  }

  return (
    <div className="db-modal-overlay" onClick={onClose}>
      <div className="db-modal" onClick={e => e.stopPropagation()}>
        <button className="db-modal-close" onClick={onClose}>×</button>
        <h3 className="db-modal-title">{isEdit ? "Edit Attorney" : "Add Attorney"}</h3>
        <form onSubmit={submit} className="db-modal-form">
          <label className="db-form-label">Name *
            <input className="db-form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith, Esq." />
          </label>
          <label className="db-form-label">Firm *
            <input className="db-form-input" value={firm} onChange={e => setFirm(e.target.value)} placeholder="Smith & Associates" />
          </label>
          <label className="db-form-label">Bar Number
            <input className="db-form-input" value={barNumber} onChange={e => setBarNumber(e.target.value)} placeholder="MO-54321 (optional)" />
          </label>
          <label className="db-form-label">Email *
            <input className="db-form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@smithlaw.com" />
          </label>
          {err && <div className="db-form-err">{err}</div>}
          <div className="db-modal-actions">
            <button type="button" className="db-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="db-btn-primary">{isEdit ? "Save" : "Add Attorney"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── InviteModal — generate / view / manage attorney invite for a case ─────────
function InviteModal({ caseId, cases, attorneys, onWriteAssignment, onAddAttorney, onClose }) {
  const caseObj     = cases.find(c => c.caseId === caseId);
  const assignment  = caseObj?.attorneyAssignment ?? null;
  const assignedAtty = assignment ? attorneys.find(a => a.id === assignment.attorneyId) : null;

  // "pick" view = choose attorney; "sent" view = show generated link
  const [view,        setView]        = useState(assignment ? "sent" : "pick");
  const [pickedId,    setPickedId]    = useState(assignment?.attorneyId ?? (attorneys[0]?.id ?? ""));
  const [copied,      setCopied]      = useState(false);
  const [showAddAtty, setShowAddAtty] = useState(false);

  const currentAssignment = caseObj?.attorneyAssignment ?? null;
  const currentAtty       = currentAssignment ? attorneys.find(a => a.id === currentAssignment.attorneyId) : null;

  function generate(attorneyId) {
    const newAssignment = {
      attorneyId,
      token:      crypto.randomUUID(),
      sentAt:     new Date().toISOString(),
      acceptedAt: null,
    };
    onWriteAssignment(caseId, newAssignment);
    setView("sent");
  }

  function resend() {
    generate(currentAssignment.attorneyId);
  }

  function reassign() {
    setPickedId(attorneys[0]?.id ?? "");
    setView("pick");
  }

  const inviteUrl = currentAssignment
    ? `https://lienchain.vercel.app/attorney/${caseId}?token=${currentAssignment.token}`
    : null;

  function copyLink() {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function openEmail() {
    if (!currentAtty || !inviteUrl) return;
    const firstName = currentAtty.name.split(" ")[0];
    const subject = encodeURIComponent(`Lien case access — ${caseId}`);
    const body = encodeURIComponent(
      `Hi ${firstName},\r\n\r\n` +
      `I'm sharing access to a personal-injury lien case in LienChain so you can review the settlement waterfall and submit reduction requests if needed.\r\n\r\n` +
      `Case: ${caseId}\r\n` +
      `Open: ${inviteUrl}\r\n\r\n` +
      `This link is unique to you — please don't share it. If you have questions or need a different attorney provisioned, let me know.\r\n\r\n` +
      `— Sent via LienChain`
    );
    window.open(`mailto:${currentAtty.email}?subject=${subject}&body=${body}`, "_self");
  }

  const fmtDt = iso => iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

  return (
    <div className="db-modal-overlay" onClick={onClose}>
      <div className="db-modal" onClick={e => e.stopPropagation()}>
        <button className="db-modal-close" onClick={onClose}>×</button>
        <h3 className="db-modal-title">Invite Attorney — <span style={{ fontWeight: 400, fontSize: "0.9rem" }}>{caseId}</span></h3>

        {view === "pick" && (
          <>
            <p className="db-modal-sub">Select an attorney from your registry, or add a new one.</p>
            {attorneys.length === 0 ? (
              <div className="db-form-err" style={{ marginBottom: 12 }}>No attorneys in registry. Add one below.</div>
            ) : (
              <label className="db-form-label">Attorney
                <select className="db-form-input" value={pickedId} onChange={e => setPickedId(e.target.value)}>
                  {attorneys.map(a => (
                    <option key={a.id} value={a.id}>{a.name} — {a.firm}</option>
                  ))}
                </select>
              </label>
            )}
            <button className="db-btn-ghost" style={{ marginBottom: 16 }} onClick={() => setShowAddAtty(true)}>
              + Add new attorney
            </button>
            <div className="db-modal-actions">
              <button className="db-btn-secondary" onClick={onClose}>Cancel</button>
              <button className="db-btn-primary" disabled={!pickedId} onClick={() => generate(pickedId)}>
                Generate Invite
              </button>
            </div>
          </>
        )}

        {view === "sent" && currentAssignment && (
          <>
            <div className="db-invite-info">
              <div><strong>Invited:</strong> {currentAtty ? `${currentAtty.name} (${currentAtty.firm})` : "Attorney removed from registry"}</div>
              <div><strong>Sent:</strong> {fmtDt(currentAssignment.sentAt)}</div>
              <div><strong>Status:</strong> {currentAssignment.acceptedAt ? `Accepted on ${fmtDt(currentAssignment.acceptedAt)}` : "Awaiting acceptance"}</div>
            </div>
            <label className="db-form-label" style={{ marginTop: 12 }}>Invite Link
              <div className="db-invite-url-row">
                <input className="db-form-input db-invite-url" readOnly value={inviteUrl} />
                <button className="db-btn-primary" onClick={copyLink} style={{ flexShrink: 0 }}>
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </label>
            <button className="db-btn-ghost" style={{ marginTop: 8 }} onClick={openEmail}>
              ✉ Open Email (mailto:)
            </button>
            <div className="db-modal-actions" style={{ marginTop: 20 }}>
              <button className="db-btn-secondary" onClick={reassign}>Reassign</button>
              <button className="db-btn-secondary" onClick={resend}>Resend (new token)</button>
              <button className="db-btn-primary" onClick={onClose}>Close</button>
            </div>
          </>
        )}

        {showAddAtty && (
          <AttorneyFormModal
            initial={null}
            onSave={(atty) => { onAddAttorney(atty); setPickedId(atty.id); setShowAddAtty(false); }}
            onClose={() => setShowAddAtty(false)}
          />
        )}
      </div>
    </div>
  );
}

// ── Analytics helpers ────────────────────────────────────────────────────────
// approxSettledAt: legacy liens have no settledAt; use ts + 6 months as a
// rough placeholder for a typical PI timeline. This is an estimate only —
// do not use for legal or financial reporting.
function approxSettledAt(lien) {
  const d = new Date(lien.ts);
  d.setMonth(d.getMonth() + 6);
  return d.toISOString();
}

// Enriches a lien with derived analytics fields.
// recovery and settledAt are written on fresh settlements (handleSettled).
// For legacy/mock liens that predate these fields, fall back to estimates:
//   recovery  → bill × split/100  (LienCo nominal share at face value)
//   settledAt → ts + 6 months     (rough midpoint for a typical PI timeline)
// purchasePrice → bill × 0.78 if not recorded (typical discount estimate)
// These defaults are clearly estimates — tag any real reporting accordingly.
//
// Seed-mock heuristic: the 4 hardcoded seed liens (PI-LIEN-YYYY-MM-NNN) were
// visually settled in Phase 1-3 with two TX hashes each and appear in the
// Settlement Ledger. Their raw status field may say 'Active' (a Phase 4
// regression). For analytics purposes, treat them as Settled so they
// contribute to recovery rate and avg days to settle rather than at-risk exposure.
function deriveLienAnalytics(lien) {
  const isSeedMock    = /^PI-LIEN-\d{4}-\d{2}-/.test(lien.id);
  const isSettled     = lien.status === "Settled" || isSeedMock;
  const derivedStatus = isSettled ? "Settled" : lien.status;
  const purchasePrice = lien.purchasePrice ?? Math.round(lien.bill * 0.78);
  const recovery      = lien.recovery ?? (isSettled ? Math.round(lien.bill * (lien.split ?? 70) / 100) : null);
  const settledAt     = lien.settledAt ?? (isSettled ? approxSettledAt(lien) : null);
  return { ...lien, purchasePrice, recovery, settledAt, derivedStatus };
}

// ── Main component ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [wallets,       setWallets]       = useState(WALLETS.map(w => ({ ...w, balance: null })));
  const [activity,      setActivity]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [lastFetch,     setLastFetch]     = useState(null);
  // Load liens from localStorage, merging with the hardcoded seed settlements.
  // normalizeLien() is applied inside loadLiens() so all liens have caseId.
  const [liens,         setLiens]         = useState(() => loadLiens(SETTLEMENTS));
  const [cases,         setCases]         = useState(() => loadCases());
  const [showIntake,    setShowIntake]    = useState(false);
  const [activeTab,     setActiveTab]     = useState("dashboard");
  const [previewCaseId, setPreviewCaseId] = useState(null);
  const [market,        setMarket]        = useState("All");
  const [attorneys,     setAttorneys]     = useState(() => loadAttorneys());
  const [showAttyModal, setShowAttyModal] = useState(false);   // "add" | "edit" | false
  const [editingAtty,   setEditingAtty]   = useState(null);    // Attorney being edited
  const [inviteCaseId,  setInviteCaseId]  = useState(null);    // caseId for invite modal
  const [showInvite,    setShowInvite]    = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [balances, txs] = await Promise.all([
        getWalletBalances(WALLETS),
        getAllMarketActivity(WALLETS, 20),
      ]);
      setWallets(balances);
      setActivity(txs);
      setLastFetch(new Date());
    } catch (err) {
      setError("Unable to connect to XRPL testnet. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filter liens by selected market (All = no filter)
  const filteredLiens = market === "All" ? liens : liens.filter(r => r.market === market);
  const settledLiens  = filteredLiens.filter(isSettled);

  // Stats reflect the active market filter
  const totalVolume = filteredLiens.reduce((s, r) => s + r.bill, 0);
  const avgSplit    = filteredLiens.length
    ? Math.round(filteredLiens.reduce((s, r) => s + r.split, 0) / filteredLiens.length)
    : 0;

  // Single-pass analytics derivation for KPI tiles + charts + aging table.
  // Recomputed whenever liens or cases change.
  const analytics = useMemo(() => {
    const enriched     = liens.map(deriveLienAnalytics);
    // Use derivedStatus (seed-mock-aware) for settled/active classification
    const activeLiens  = enriched.filter(l => l.derivedStatus === "Active");
    const settledLiens = enriched.filter(l => l.derivedStatus === "Settled");

    const totalDeployed = enriched.reduce((s, l) => s + (l.purchasePrice ?? 0), 0);
    const totalAtRisk   = activeLiens.reduce((s, l) => s + l.bill, 0);

    const recoverySum  = settledLiens.reduce((s, l) => s + (l.recovery ?? 0), 0);
    const purchaseSum  = settledLiens.reduce((s, l) => s + (l.purchasePrice ?? 0), 0);
    const recoveryRate = purchaseSum > 0 ? (recoverySum / purchaseSum) * 100 : null;

    const avgDaysToSettle = settledLiens.length === 0 ? null :
      settledLiens.reduce((s, l) => {
        const days = (new Date(l.settledAt) - new Date(l.ts)) / 86400000;
        return s + Math.max(0, days);
      }, 0) / settledLiens.length;

    const activeCases  = cases.filter(c => c.status === "Active");
    const settledCases = cases.filter(c => c.status === "Settled");

    // ── Chart 1: Exposure by Market ──────────────────────────────────────────
    const CHART_MARKETS = ["KC", "STL", "TX", "NV", "IN"];
    const exposureData = CHART_MARKETS.map(mkt => {
      const inMarket = enriched.filter(l => l.market === mkt);
      return {
        market:  mkt,
        active:  inMarket.filter(l => l.derivedStatus === "Active").reduce((s, l) => s + l.bill, 0),
        settled: inMarket.filter(l => l.derivedStatus === "Settled").reduce((s, l) => s + l.bill, 0),
      };
    });

    // ── Chart 2: Recovery Rate Over Time ─────────────────────────────────────
    const buckets = new Map();
    for (const l of settledLiens) {
      if (!l.settledAt) continue;
      const key = l.settledAt.slice(0, 7); // 'YYYY-MM'
      if (!buckets.has(key)) buckets.set(key, { recovery: 0, purchase: 0 });
      const b = buckets.get(key);
      b.recovery += l.recovery ?? 0;
      b.purchase += l.purchasePrice ?? 0;
    }
    const recoveryData = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, { recovery, purchase }]) => {
        const [yr, mo] = key.split("-");
        const monthLabel = new Date(Number(yr), Number(mo) - 1, 1)
          .toLocaleDateString("en-US", { month: "short", year: "2-digit" });
        return { monthLabel, rate: purchase > 0 ? (recovery / purchase) * 100 : 0 };
      });

    // ── Aging Buckets (Active liens only) ─────────────────────────────────────
    const ranges = [
      { label: "0–90 days",    min: 0,   max: 90   },
      { label: "91–180 days",  min: 91,  max: 180  },
      { label: "181–365 days", min: 181, max: 365  },
      { label: "365+ days",    min: 366, max: Infinity },
    ];
    const today = Date.now();
    const agingBuckets = ranges.map(r => {
      const inBucket = activeLiens.filter(l => {
        const ageDays = Math.floor((today - new Date(l.ts).getTime()) / 86400000);
        return ageDays >= r.min && ageDays <= r.max;
      });
      const bills = inBucket.reduce((s, l) => s + l.bill, 0);
      return {
        label: r.label,
        count: inBucket.length,
        totalBills: bills,
        percentOfAtRisk: totalAtRisk > 0 ? (bills / totalAtRisk) * 100 : 0,
      };
    });

    return {
      enriched,
      totalDeployed,
      totalAtRisk,
      recoveryRate,
      avgDaysToSettle,
      activeCases:  { count: activeCases.length,  lienCount: activeLiens.length },
      settledCases: { count: settledCases.length, recoverySum },
      counts: { all: enriched.length, active: activeLiens.length, settled: settledLiens.length },
      exposureData,
      recoveryData,
      agingBuckets,
    };
  }, [liens, cases]);

  const handlePreview = (caseId) => {
    setPreviewCaseId(caseId);
    setActiveTab("attorney");
  };

  // ── Attorney registry handlers ───────────────────────────────────────────────
  const saveAtty = (data) => {
    setAttorneys(prev => {
      const exists = prev.find(a => a.id === data.id);
      const updated = exists
        ? prev.map(a => a.id === data.id ? data : a)
        : [...prev, data];
      saveAttorneys(updated);
      return updated;
    });
  };

  const deleteAtty = (id) => {
    setAttorneys(prev => {
      const updated = prev.filter(a => a.id !== id);
      saveAttorneys(updated);
      return updated;
    });
  };

  // ── Invite handlers ──────────────────────────────────────────────────────────
  const writeAssignment = (caseId, assignment) => {
    setCases(prev => {
      // For legacy single-clinic liens (seed or wizard-created where lien.id === caseId),
      // there may be no matching Case record in state. Synthesize one so the assignment
      // persists and the token gate can find it. (Part D bug fix — Phase 8 Commit 2)
      let base = prev;
      if (!prev.some(c => c.caseId === caseId)) {
        const lien = liens.find(l => l.id === caseId) || SETTLEMENTS.find(l => l.id === caseId);
        if (lien) {
          base = [...prev, {
            caseId,
            attorney:       lien.attorney       || "",
            treatmentMonth: lien.treatmentMonth  || "",
            treatmentYear:  lien.treatmentYear   || "",
            clinicLienIds:  [lien.id],
            status:         lien.status === "Settled" ? "Settled" : "Active",
            createdAt:      lien.ts || new Date().toISOString(),
          }];
        }
      }
      const updated = base.map(c => c.caseId !== caseId ? c : { ...c, attorneyAssignment: assignment });
      saveCases(updated);
      return updated;
    });
  };

  const openInvite = (caseId) => { setInviteCaseId(caseId); setShowInvite(true); };
  const closeInvite = () => { setShowInvite(false); setInviteCaseId(null); };

  // Called by AttorneyPreview when a settlement completes.
  // lienIds:    string[]  — all clinic lien IDs on the case
  // hashes:     string[]  — one TX hash per clinic, parallel-indexed with lienIds
  // recoveries: number[]  — per-clinic LienCo recovery amount from calcWaterfall
  const handleSettled = (caseId, lienIds, hashes = [], recoveries = []) => {
    const settledAt = new Date().toISOString();
    // 1 + 2 — flip lien statuses to Settled; write tx2, recovery, and settledAt
    setLiens(prev => {
      const updated = prev.map(l => {
        const idx = lienIds.indexOf(l.id);
        if (idx === -1) return l;
        return {
          ...l,
          status:    "Settled",
          tx2:       hashes[idx] ?? l.tx2 ?? null,
          recovery:  recoveries[idx] ?? null,       // LienCo dollar share from waterfall
          settledAt: l.settledAt ?? settledAt,       // don't overwrite if already set
        };
      });
      saveLiens(updated, SEED_IDS);
      return updated;
    });

    // 3 — flip any open reduction requests on this case to "accepted"
    const allRequests = loadReductionRequests();
    const anyOpen = allRequests.some(r => r.caseId === caseId && r.status === "open");
    if (anyOpen) {
      const updated = allRequests.map(r =>
        r.caseId === caseId && r.status === "open" ? { ...r, status: "accepted" } : r
      );
      saveReductionRequests(updated);
    }

    // 1 — roll case status up to Settled when all its clinic liens are now settled
    setCases(prev => {
      const updated = prev.map(c => {
        if (c.caseId !== caseId) return c;
        return { ...c, status: "Settled" };
      });
      saveCases(updated);
      return updated;
    });
  };

  const marketLabel = market === "All" ? "" : ` · ${market}`;
  const showMarketFilter = activeTab !== "attorney";

  const TABS = [
    { id: "dashboard",   label: "Dashboard"   },
    { id: "liens",       label: "Liens"       },
    { id: "settlements", label: "Settlements" },
    { id: "compliance",  label: "Compliance"  },
    { id: "attorney",    label: "Attorney View" },
  ];

  return (
    <div className="db-root">

      {/* NAV */}
      <nav className="db-nav">
        <div className="db-container db-nav-inner">
          <Link to="/" className="db-logo">⛓️ LienChain</Link>
          <div className="db-nav-right">
            <span className="db-badge db-badge-green">Testnet MVP</span>
            {lastFetch && <span className="db-last-fetch">Updated {fmtTime(lastFetch)}</span>}
            <button className="db-refresh-btn" onClick={fetchData} disabled={loading}>
              {loading ? <Spinner /> : "↻ Refresh"}
            </button>
            <div className="db-create-group">
              <button className="db-create-btn" onClick={() => setShowIntake(true)}>+ Create Lien</button>
              <span className="db-testnet-pill" title="Tokenization runs on XRPL Testnet. Production-ready architecture, zero real-money risk during pilot.">
                XRPL TESTNET
              </span>
            </div>
            <Link to="/" className="db-nav-link">← Back to site</Link>
          </div>
        </div>
      </nav>

      {/* TAB BAR */}
      <div className="db-tab-bar">
        <div className="db-container db-tab-inner">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`db-tab ${activeTab === t.id ? "db-tab-active" : ""}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* MARKET FILTER — hidden on Attorney View */}
      {showMarketFilter && (
        <div className="db-container db-mkt-row">
          <MarketFilter value={market} onChange={setMarket} />
        </div>
      )}

      <div className="db-container db-body">

        {/* ATTORNEY VIEW TAB */}
        {activeTab === "attorney" && (
          <AttorneyPreview liens={liens} initialCaseId={previewCaseId} onSettled={handleSettled} cases={cases} onInvite={openInvite} />
        )}

        {/* DASHBOARD TAB — overview stats + wallet panel + live activity */}
        {activeTab === "dashboard" && <>
          <div className="db-header">
            <div>
              <h1 className="db-title">Multi-Market Dashboard{marketLabel}</h1>
              <p className="db-sub">Live XRPL Testnet · All transactions verifiable on-chain</p>
            </div>
            <span className="db-badge db-badge-blue">v3</span>
          </div>

          {error && (
            <div className="db-error-banner">
              ⚠ {error}
              <button className="db-retry-btn" onClick={fetchData}>Retry</button>
            </div>
          )}

          {/* KPI TILES */}
          <div className="db-kpi-row">
            <div className="db-kpi-tile">
              <div className="db-kpi-title">Total Deployed Capital</div>
              <div className="db-kpi-value">{usd(analytics.totalDeployed)}</div>
              <div className="db-kpi-sub">across {analytics.counts.all} liens</div>
            </div>
            <div className="db-kpi-tile">
              <div className="db-kpi-title">Total At-Risk Exposure</div>
              <div className="db-kpi-value">{usd(analytics.totalAtRisk)}</div>
              <div className="db-kpi-sub">{analytics.counts.active} active liens</div>
            </div>
            <div className="db-kpi-tile">
              <div className="db-kpi-title">Recovery Rate</div>
              <div className="db-kpi-value">
                {analytics.recoveryRate === null ? "—" : (
                  <>
                    <span className={analytics.recoveryRate >= 100 ? "db-kpi-delta-up" : "db-kpi-delta-down"}>
                      {analytics.recoveryRate >= 100 ? "↑" : "↓"}
                    </span>
                    {" "}{analytics.recoveryRate.toFixed(1)}%
                  </>
                )}
              </div>
              <div className="db-kpi-sub">lifetime · {analytics.counts.settled} settled</div>
            </div>
            <div className="db-kpi-tile">
              <div className="db-kpi-title">Avg Days to Settle</div>
              <div className="db-kpi-value">
                {analytics.avgDaysToSettle === null ? "—" : `${Math.round(analytics.avgDaysToSettle)} days`}
              </div>
              <div className="db-kpi-sub">{analytics.counts.settled} settled liens</div>
            </div>
            <div className="db-kpi-tile">
              <div className="db-kpi-title">Active Cases</div>
              <div className="db-kpi-value">{analytics.activeCases.count}</div>
              <div className="db-kpi-sub">· {analytics.activeCases.lienCount} clinic liens</div>
            </div>
            <div className="db-kpi-tile">
              <div className="db-kpi-title">Settled Cases</div>
              <div className="db-kpi-value">{analytics.settledCases.count}</div>
              <div className="db-kpi-sub">{usd(analytics.settledCases.recoverySum)} recovered</div>
            </div>
          </div>

          {/* ANALYTICS CHARTS ROW */}
          <div className="db-analytics-row">
            {/* Chart 1 — Exposure by Market */}
            <div className="db-analytics-card">
              <h3 className="db-card-title">Exposure by Market</h3>
              <p className="db-card-sub">Active vs. settled bill amounts across each state.</p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.exposureData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="market" tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
                  <Tooltip
                    formatter={v => [`$${Number(v).toLocaleString()}`, undefined]}
                    contentStyle={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }}
                    labelStyle={{ color: "var(--text)" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />
                  <Bar dataKey="active"  stackId="a" fill={CHART_ACTIVE_COLOR}  name="Active"  radius={[0, 0, 0, 0]} />
                  <Bar dataKey="settled" stackId="a" fill={CHART_SETTLED_COLOR} name="Settled" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 2 — Recovery Rate Over Time */}
            <div className="db-analytics-card">
              <h3 className="db-card-title">Recovery Rate Over Time</h3>
              <p className="db-card-sub">Monthly weighted average for settled liens.</p>
              {analytics.recoveryData.length < 2 ? (
                <div className="db-chart-empty">
                  Not enough data yet — chart will populate as more cases settle.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={analytics.recoveryData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="monthLabel" tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, "dataMax + 10"]} tickFormatter={v => `${v}%`} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={46} />
                    <Tooltip
                      formatter={v => [`${Number(v).toFixed(1)}%`, "Recovery Rate"]}
                      contentStyle={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }}
                      labelStyle={{ color: "var(--text)" }}
                    />
                    <Line type="monotone" dataKey="rate" stroke={CHART_LINE_COLOR} strokeWidth={2} dot={{ r: 4, fill: CHART_LINE_COLOR }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* AGING BUCKETS TABLE */}
          <div className="db-analytics-card db-aging-card">
            <h3 className="db-card-title">Aging Buckets — Active Liens</h3>
            <p className="db-card-sub">Distribution of unsettled lien exposure by age.</p>
            <table className="db-aging-table">
              <thead>
                <tr>
                  <th>Bucket</th>
                  <th>Active Liens</th>
                  <th>Total Bills</th>
                  <th>% of At-Risk</th>
                </tr>
              </thead>
              <tbody>
                {analytics.agingBuckets.map(b => (
                  <tr key={b.label} className={b.count > 0 && b.label === "365+ days" ? "db-aging-danger" : ""}>
                    <td>{b.label}</td>
                    <td>{b.count}</td>
                    <td>{usd(b.totalBills)}</td>
                    <td>{b.percentOfAtRisk.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* WALLET PANEL — always full 6-wallet panel regardless of market filter */}
          <section className="db-section">
            <div className="db-section-header">
              <h2 className="db-section-title">6-Wallet Panel</h2>
              {loading && <Spinner />}
            </div>
            <div className="db-wallets">
              {wallets.map((w) => (
                <div className="db-wallet-card" key={w.address}>
                  <div className="db-wallet-top">
                    <span className="db-wallet-label">{w.label}</span>
                    <span className={`db-role-badge ${w.role === "issuer" ? "role-issuer" : "role-clinic"}`}>
                      {w.role === "issuer" ? "Issuer" : "Clinic"}
                    </span>
                  </div>
                  <a href={`${ACCT_URL}${w.address}`} target="_blank" rel="noreferrer" className="db-address">
                    {w.address.slice(0, 12)}…{w.address.slice(-6)}
                  </a>
                  <span className="db-balance">
                    {w.balance === null
                      ? <Spinner />
                      : w.balance === "—"
                      ? <span className="db-balance-err">—</span>
                      : `${w.balance} XRP`}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* LIVE ACTIVITY FEED */}
          <section className="db-section">
            <div className="db-section-header">
              <h2 className="db-section-title">Live On-Chain Activity</h2>
              {loading && <Spinner />}
            </div>

            {error ? (
              <div className="db-feed-empty">Unable to load live transactions — {error}</div>
            ) : loading && activity.length === 0 ? (
              <div className="db-feed-empty"><Spinner /> Fetching transactions from XRPL testnet…</div>
            ) : activity.length === 0 ? (
              <div className="db-feed-empty">No recent transactions found.</div>
            ) : (
              <div className="db-table-wrap">
                <table className="db-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Wallet</th>
                      <th>Result</th>
                      <th>TX Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map((tx) => {
                      const walletLabel = WALLETS.find(w => w.address === tx.account || w.address === tx.destination)?.label ?? tx.sourceWallet ?? "—";
                      const fromLabel   = WALLETS.find(w => w.address === tx.account)?.label ?? shortH(tx.account);
                      const toLabel     = tx.destination ? (WALLETS.find(w => w.address === tx.destination)?.label ?? shortH(tx.destination)) : "—";
                      const amtStr      = tx.amountXrp ? `${tx.amountXrp} XRP` : tx.currency ?? "—";
                      return (
                        <tr key={tx.hash}>
                          <td className="db-muted" style={{ whiteSpace: "nowrap" }}>{fmtTime(tx.date)}</td>
                          <td><span className="db-type-chip">{tx.type}</span></td>
                          <td className="db-amount">{amtStr}</td>
                          <td className="db-muted">{fromLabel}</td>
                          <td className="db-muted">{toLabel}</td>
                          <td><span className="db-market-chip" style={{ fontSize: "0.7rem" }}>{walletLabel}</span></td>
                          <td>
                            <span className={tx.result === "tesSUCCESS" ? "db-status-badge" : "db-status-fail"}>
                              {tx.result === "tesSUCCESS" ? "✅" : "❌"} {tx.result === "tesSUCCESS" ? "Success" : tx.result}
                            </span>
                          </td>
                          <td>
                            <a href={EXPLORER + tx.hash} target="_blank" rel="noreferrer" className="db-tx-link">
                              {shortH(tx.hash)}
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ATTORNEYS PANEL */}
          <div className="db-analytics-card" style={{ marginTop: 8 }}>
            <div className="db-card-header-row">
              <h3 className="db-card-title">Attorneys</h3>
              <button className="db-btn-primary" onClick={() => { setEditingAtty(null); setShowAttyModal(true); }}>+ Add Attorney</button>
            </div>
            <p className="db-card-sub">PI attorneys provisioned to access case portals.</p>
            {attorneys.length === 0 ? (
              <div className="db-empty-state">No attorneys yet — add one to invite them to a case.</div>
            ) : (
              <div className="db-table-wrap">
                <table className="db-table db-attorneys-table">
                  <thead>
                    <tr>
                      <th>Name</th><th>Firm</th><th>Bar #</th><th>Email</th><th>Added</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {attorneys.map(a => (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 600 }}>{a.name}</td>
                        <td>{a.firm}</td>
                        <td className="db-muted">{a.barNumber || "—"}</td>
                        <td className="db-muted">{a.email}</td>
                        <td className="db-muted">{fmtDate(a.addedAt)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button className="db-btn-ghost" onClick={() => { setEditingAtty(a); setShowAttyModal(true); }}>Edit</button>
                          <button className="db-btn-danger" style={{ marginLeft: 6 }} onClick={() => {
                            if (window.confirm(`Delete attorney ${a.name}? This won't void invites already sent for cases.`)) deleteAtty(a.id);
                          }}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>}

        {/* LIENS TAB — full ledger + market breakdown */}
        {activeTab === "liens" && <>
          <div className="db-header">
            <div>
              <h1 className="db-title">Liens{marketLabel}</h1>
              <p className="db-sub">All liens issued on XRPL testnet — operator view</p>
            </div>
          </div>

          <section className="db-section">
            <h2 className="db-section-title">Settlement Ledger</h2>
            <CaseLienTable
              rows={filteredLiens}
              emptyText={market === "All" ? "No liens yet." : `No liens in ${market}.`}
              onPreview={handlePreview}
              cases={cases}
              onInvite={openInvite}
            />
          </section>

          <section className="db-section">
            <h2 className="db-section-title">Market Breakdown</h2>
            {filteredLiens.length === 0 ? (
              <div className="db-feed-empty">
                {market === "All" ? "No market data yet." : `No liens in ${market}.`}
              </div>
            ) : (
              <div className="db-market-grid">
                {filteredLiens.map((r) => {
                  const lienCoAmt = Math.floor(r.bill * r.split / 100);
                  const clinicAmt = r.bill - lienCoAmt;
                  return (
                    <div className="db-market-card" key={r.id}>
                      <div className="db-market-header">
                        <span className="db-market-chip">{r.market}</span>
                        <span className="db-muted">{r.clinic}</span>
                        {r.flags.map(f => <FlagBadge key={f} flag={f} />)}
                      </div>
                      <div className="db-market-bill">{usd(r.bill)}</div>
                      <div className="db-split-bar">
                        <div className="db-split-lienco" style={{ width: `${r.split}%` }}>{r.split}%</div>
                        <div className="db-split-clinic"  style={{ width: `${100 - r.split}%` }}>{100 - r.split}%</div>
                      </div>
                      <div className="db-market-splits">
                        <span>LienCo: <strong>{usd(lienCoAmt)}</strong></span>
                        <span>{r.clinic}: <strong>{usd(clinicAmt)}</strong></span>
                      </div>
                      <div className="db-market-date db-muted">{fmtDate(r.ts)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>}

        {/* SETTLEMENTS TAB — settled-only subset */}
        {activeTab === "settlements" && <>
          <div className="db-header">
            <div>
              <h1 className="db-title">Settlements{marketLabel}</h1>
              <p className="db-sub">Completed on-chain settlements · {settledLiens.length} record{settledLiens.length === 1 ? "" : "s"}</p>
            </div>
          </div>

          <section className="db-section">
            <LienTable
              rows={settledLiens}
              emptyText={market === "All" ? "No settled liens yet." : `No settled liens in ${market}.`}
              onPreview={handlePreview}
            />
          </section>
        </>}

        {/* COMPLIANCE TAB — state-level rules + flagged liens */}
        {activeTab === "compliance" && <>
          <div className="db-header">
            <div>
              <h1 className="db-title">Compliance{marketLabel}</h1>
              <p className="db-sub">State-level rules and flagged liens</p>
            </div>
          </div>

          {/* Active flag alerts — surfaced here, not on Dashboard */}
          <div className="db-flags-row">
            {filteredLiens.some(r => r.flags.includes("tx-72h")) && (
              <div className="db-flag-alert flag-alert-orange">
                <strong>⚠ TX 72-Hour Flag</strong>
                <span>
                  {filteredLiens.filter(r => r.flags.includes("tx-72h")).map(r => r.id).join(", ")}
                  {" "}within the 72-hour rescission window. Monitor for reversal requests before secondary transfer.
                </span>
              </div>
            )}
            {filteredLiens.some(r => r.flags.includes("in-nonassignable")) && (
              <div className="db-flag-alert flag-alert-red">
                <strong>⛔ IN Non-Assignable Warning</strong>
                <span>
                  Indiana statute limits lien assignability in PI cases. Confirm assignment validity for
                  {" "}{filteredLiens.filter(r => r.flags.includes("in-nonassignable")).map(r => r.id).join(", ")}
                  {" "}before secondary transfer.
                </span>
              </div>
            )}
          </div>

          <section className="db-section">
            <h2 className="db-section-title">State Rules</h2>
            <div className="db-market-grid">
              {(market === "All" ? Object.keys(MARKET_INFO) : [market])
                .filter(code => MARKET_INFO[code])
                .map(code => (
                  <ComplianceStateCard
                    key={code}
                    code={code}
                    info={MARKET_INFO[code]}
                    liens={liens}
                  />
                ))}
            </div>
          </section>
        </>}

        {/* end tabs */}
      </div>

      {showIntake && (
        <IntakeWizard
          cases={cases}
          onClose={() => setShowIntake(false)}
          onComplete={(lien) => {
            const updatedLiens = [lien, ...liens];
            setLiens(updatedLiens);
            saveLiens(updatedLiens, SEED_IDS);

            let updatedCases;
            if (lien.caseId === lien.id) {
              // New single-clinic case — create a fresh Case wrapper
              updatedCases = upsertCase(cases, createCaseForLien(lien));
            } else {
              // Adding a clinic to an existing case — append lien.id to clinicLienIds
              const existing = cases.find(c => c.caseId === lien.caseId);
              if (existing) {
                const updated = {
                  ...existing,
                  clinicLienIds: [...existing.clinicLienIds, lien.id],
                };
                updatedCases = upsertCase(cases, updated);
              } else {
                // Shouldn't happen, but fall back to creating a new case
                updatedCases = upsertCase(cases, createCaseForLien(lien));
              }
            }
            setCases(updatedCases);
            saveCases(updatedCases);
            // Note: wizard stays open (user may click "Add another clinic" or "Done")
          }}
        />
      )}

      {showAttyModal && (
        <AttorneyFormModal
          initial={editingAtty}
          onSave={saveAtty}
          onClose={() => setShowAttyModal(false)}
        />
      )}

      {showInvite && inviteCaseId && (
        <InviteModal
          caseId={inviteCaseId}
          cases={cases}
          attorneys={attorneys}
          onWriteAssignment={writeAssignment}
          onAddAttorney={(atty) => { saveAtty(atty); }}
          onClose={closeInvite}
        />
      )}

      <footer className="db-footer">
        <div className="db-container db-footer-inner">
          <span className="db-muted">⛓️ LienChain · XRPL Testnet · MIT License</span>
          <a href="https://github.com/mattlearns18/lienchain" target="_blank" rel="noreferrer" className="db-nav-link">GitHub →</a>
        </div>
      </footer>
    </div>
  );
}
