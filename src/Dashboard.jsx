import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { getWalletBalances, getAllMarketActivity } from "./lib/xrpl-data.js";
import { loadLiens, saveLiens, loadCases, saveCases, createCaseForLien, upsertCase } from "./lib/store.js";
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

// Market filter options (order matters — matches the segmented control rendering)
const MARKETS = ["All", "KC", "STL", "TX", "NV", "IN"];

// Per-state compliance summary shown in the Compliance tab.
// Kept conservative — only claims the project has confirmed (see CLAUDE.md §4).
const MARKET_INFO = {
  KC:  { state: "Missouri", flags: [],                   notes: "Standard PI lien perfection. No special state-level restrictions currently tracked." },
  STL: { state: "Missouri", flags: [],                   notes: "Standard PI lien perfection. No special state-level restrictions currently tracked." },
  TX:  { state: "Texas",    flags: ["tx-72h"],           notes: "72-hour rescission window after assignment. File/record the lien within 72 hours." },
  NV:  { state: "Nevada",   flags: [],                   notes: "No special state-level restrictions currently tracked." },
  IN:  { state: "Indiana",  flags: ["in-nonassignable"], notes: "Indiana applies a 20% clinic floor and limits lien assignability. Confirm assignability before secondary transfer." },
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const usd      = (n) => `$${Number(n).toLocaleString()}`;
const shortH   = (h) => h ? `${h.slice(0, 8)}…${h.slice(-6)}` : "—";
const fmtDate  = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtTime  = (d)   => d instanceof Date && !isNaN(d)
  ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  : "—";
const isSettled = (r) => !r.status || r.status === "Settled";

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
      <td>
        {r.status === "Active"
          ? <span className="db-status-active">🟢 Active</span>
          : r.status === "Draft"
          ? <span className="db-status-draft">📋 Draft</span>
          : <span className="db-status-badge">✅ Settled</span>}
      </td>
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
  if (!rows.length) {
    return <div className="db-feed-empty">{emptyText}</div>;
  }
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

  const handlePreview = (caseId) => {
    setPreviewCaseId(caseId);
    setActiveTab("attorney");
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
          <AttorneyPreview liens={liens} initialCaseId={previewCaseId} />
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

          {/* STATS */}
          <div className="db-stats">
            {[
              { label: "Total Volume",     value: usd(totalVolume) },
              { label: "Liens Settled",    value: settledLiens.length },
              { label: "Markets Active",   value: new Set(filteredLiens.map(r => r.market)).size },
              { label: "Avg LienCo Split", value: `${avgSplit}%` },
            ].map(({ label, value }) => (
              <div className="db-stat-card" key={label}>
                <span className="db-stat-val">{value}</span>
                <span className="db-stat-label">{label}</span>
              </div>
            ))}
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
            <LienTable
              rows={filteredLiens}
              emptyText={market === "All" ? "No liens yet." : `No liens in ${market}.`}
              onPreview={handlePreview}
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
          onClose={() => setShowIntake(false)}
          onComplete={(lien) => {
            // lien already has caseId = lien.id (set in IntakeWizard.buildLienRecord)
            const updatedLiens = [lien, ...liens];
            setLiens(updatedLiens);
            saveLiens(updatedLiens, SEED_IDS);

            // Create (or update) the single-clinic Case wrapper for this lien
            const newCase = createCaseForLien(lien);
            const updatedCases = upsertCase(cases, newCase);
            setCases(updatedCases);
            saveCases(updatedCases);

            setShowIntake(false);
          }}
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
