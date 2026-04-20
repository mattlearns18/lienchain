import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { getWalletBalances, getAllMarketActivity } from "./lib/xrpl-data.js";
import IntakeWizard from "./components/IntakeWizard.jsx";
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

// ── Helpers ─────────────────────────────────────────────────────────────────
const usd      = (n) => `$${Number(n).toLocaleString()}`;
const shortH   = (h) => h ? `${h.slice(0, 8)}…${h.slice(-6)}` : "—";
const fmtDate  = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtTime  = (d)   => d instanceof Date && !isNaN(d)
  ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  : "—";

// ── Sub-components ───────────────────────────────────────────────────────────
function Spinner() {
  return <span className="spinner" aria-label="Loading" />;
}

function FlagBadge({ flag }) {
  const [tip, setTip] = useState(false);
  const info = FLAG_INFO[flag];
  return (
    <span className={`flag-badge ${info.color}`} onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)}>
      {info.label}
      {tip && <span className="flag-tip">{info.tip}</span>}
    </span>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [wallets,     setWallets]    = useState(WALLETS.map(w => ({ ...w, balance: null })));
  const [activity,    setActivity]   = useState([]);
  const [loading,     setLoading]    = useState(true);
  const [error,       setError]      = useState(null);
  const [lastFetch,   setLastFetch]  = useState(null);
  const [liens,       setLiens]      = useState(SETTLEMENTS);
  const [showIntake,  setShowIntake] = useState(false);

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

  const totalVolume  = liens.reduce((s, r) => s + r.bill, 0);
  const avgSplit     = liens.length ? Math.round(liens.reduce((s, r) => s + r.split, 0) / liens.length) : 0;

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
            <button className="db-create-btn" onClick={() => setShowIntake(true)}>+ Create Lien</button>
            <Link to="/" className="db-nav-link">← Back to site</Link>
          </div>
        </div>
      </nav>

      <div className="db-container db-body">

        {/* HEADER */}
        <div className="db-header">
          <div>
            <h1 className="db-title">Multi-Market Dashboard</h1>
            <p className="db-sub">Live XRPL Testnet · All transactions verifiable on-chain</p>
          </div>
          <span className="db-badge db-badge-blue">v3</span>
        </div>

        {/* ERROR BANNER */}
        {error && (
          <div className="db-error-banner">
            ⚠ {error}
            <button className="db-retry-btn" onClick={fetchData}>Retry</button>
          </div>
        )}

        {/* FLAG BANNERS */}
        <div className="db-flags-row">
          <div className="db-flag-alert flag-alert-orange">
            <strong>⚠ TX 72-Hour Flag</strong>
            <span>Texas lien PI-LIEN-2026-04-TX001 is within the 72-hour rescission window. Monitor for reversal requests before secondary transfer.</span>
          </div>
          <div className="db-flag-alert flag-alert-red">
            <strong>⛔ IN Non-Assignable Warning</strong>
            <span>Indiana statute limits lien assignability in PI cases. Confirm assignment validity for PI-LIEN-2026-04-IN001 before secondary transfer.</span>
          </div>
        </div>

        {/* STATS */}
        <div className="db-stats">
          {[
            { label: "Total Volume",     value: usd(totalVolume) },
            { label: "Liens Settled",    value: liens.length },
            { label: "Markets Active",   value: new Set(liens.map(r => r.market)).size },
            { label: "Avg LienCo Split", value: `${avgSplit}%` },
          ].map(({ label, value }) => (
            <div className="db-stat-card" key={label}>
              <span className="db-stat-val">{value}</span>
              <span className="db-stat-label">{label}</span>
            </div>
          ))}
        </div>

        {/* WALLET PANEL */}
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

        {/* SETTLEMENT LEDGER */}
        <section className="db-section">
          <h2 className="db-section-title">Settlement Ledger</h2>
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
                </tr>
              </thead>
              <tbody>
                {liens.map((r) => (
                  <tr key={r.id}>
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
                        : <span className="db-status-badge">✅ Settled</span>}
                    </td>
                    <td><a href={EXPLORER + r.tx1} target="_blank" rel="noreferrer" className="db-tx-link">{shortH(r.tx1)}</a></td>
                    <td>{r.tx2 ? <a href={EXPLORER + r.tx2} target="_blank" rel="noreferrer" className="db-tx-link">{shortH(r.tx2)}</a> : <span className="db-muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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

        {/* MARKET BREAKDOWN */}
        <section className="db-section">
          <h2 className="db-section-title">Market Breakdown</h2>
          <div className="db-market-grid">
            {liens.map((r) => {
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
        </section>

      </div>

      {showIntake && (
        <IntakeWizard
          onClose={() => setShowIntake(false)}
          onComplete={(lien) => {
            setLiens(prev => [lien, ...prev]);
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
