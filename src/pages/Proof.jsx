/**
 * Proof.jsx — public on-chain settlement proof page (route: /proof)
 *
 * Renders LienChain's verifiable testnet settlement records with direct XRPL
 * Explorer links. Content sourced from phase1-proof.md. This page is public
 * marketing + investor-diligence material: no operator data, no settlement
 * math, no attorney-side figures — just the on-chain transaction evidence
 * (per the §4 operator/attorney separation rule, nothing here is sensitive).
 *
 * On mainnet, add mainnet settlement records to PROOFS with explorer:
 * "livenet" — the per-record explorerBase keeps testnet history verifiable
 * after the flip.
 */
import { Link } from "react-router-dom";
import { NETWORK_NAME } from "../lib/network.js";

const C = {
  bg: "#06090f",
  bgCard: "#0c1017",
  surface: "#141c28",
  border: "#1a2636",
  teal: "#00d4aa",
  tealDim: "rgba(0,212,170,0.08)",
  gold: "#f0b850",
  white: "#f1f5f9",
  text: "#c8d6e5",
  dim: "#6b7f96",
};

const TESTNET_EXPLORER = "https://testnet.xrpl.org/transactions/";

// Verified settlement records from phase1-proof.md (Phase 1, 2026-04-20).
// Each tx hash is independently verifiable on the public XRPL Testnet Explorer.
const PROOFS = [
  {
    market: "TX", state: "Texas", clinic: "TX Clinic",
    bill: 18400, lienCoPct: 72,
    ts: "2026-04-20",
    tx1: "623549C92642B8A351A071408DF8FB56FE87818EBD2132F1D21E9F9647D8064C",
    tx2: "5ADFB159756E183E96AFD2F5073EC240A330173B3594CCD3A201D46FF8C97E42",
    explorerBase: TESTNET_EXPLORER,
  },
  {
    market: "NV", state: "Nevada", clinic: "NV Clinic",
    bill: 12400, lienCoPct: 65,
    ts: "2026-04-20",
    tx1: "8E492D22B44F1BB755BBB59B1DD8B86727E65C637C671B604EB8B1808F8209E9",
    tx2: "5CA13EDB51A94485081718B4FAA08DD47A5F3FBD2145F59B5AB176DC381C0FEC",
    explorerBase: TESTNET_EXPLORER,
  },
];

const usd = (n) => "$" + Number(n).toLocaleString("en-US");
const shortHash = (h) => `${h.slice(0, 10)}…${h.slice(-6)}`;

function TxRow({ label, hash, explorerBase }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 0", borderTop: `1px solid ${C.border}`, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, color: C.dim, fontFamily: "'IBM Plex Mono', monospace" }}>{label}</span>
      <a
        href={explorerBase + hash}
        target="_blank" rel="noreferrer"
        style={{ fontSize: 12, color: C.teal, fontFamily: "'IBM Plex Mono', monospace", textDecoration: "none" }}
        title={hash}
      >
        {shortHash(hash)} ↗
      </a>
    </div>
  );
}

export default function Proof() {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif", padding: "0 20px 80px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", paddingTop: 48 }}>

        <Link to="/" style={{ fontSize: 13, color: C.dim, textDecoration: "none" }}>← LienChain</Link>

        <h1 style={{ color: C.white, fontSize: 30, margin: "24px 0 8px", fontWeight: 700 }}>
          On-chain settlement proof
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.7, color: C.text, margin: "0 0 8px" }}>
          Every LienChain settlement produces permanent, publicly verifiable transactions on the
          XRP Ledger. The records below are real settlements executed on the XRPL{" "}
          {NETWORK_NAME === "mainnet" ? "network" : "testnet"} — click any transaction hash to
          inspect it yourself on the public XRPL Explorer. No incumbent lien funder offers this.
        </p>
        <p style={{ fontSize: 13, color: C.dim, margin: "0 0 32px" }}>
          Each settlement is two transactions: the attorney's settlement payment into LienCo (TX 1),
          then LienCo's split payout to the treating clinic (TX 2).
        </p>

        {PROOFS.map(p => (
          <div key={p.tx1} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 24px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
              <span style={{ color: C.white, fontSize: 16, fontWeight: 600 }}>
                {p.clinic} <span style={{ color: C.dim, fontWeight: 400 }}>({p.state})</span>
              </span>
              <span style={{ fontSize: 12, color: C.dim, fontFamily: "'IBM Plex Mono', monospace" }}>{p.ts}</span>
            </div>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 12 }}>
              Bill {usd(p.bill)} · Split: LienCo {p.lienCoPct}% / Clinic {100 - p.lienCoPct}%
            </div>
            <TxRow label="TX 1 · Attorney → LienCo" hash={p.tx1} explorerBase={p.explorerBase} />
            <TxRow label="TX 2 · LienCo → Clinic"   hash={p.tx2} explorerBase={p.explorerBase} />
          </div>
        ))}

        <div style={{ background: C.tealDim, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 24px", fontSize: 13, lineHeight: 1.7, color: C.text }}>
          These records were produced on the XRPL testnet during platform validation. Amounts on
          testnet use a fixed 1000:1 dollar scaling. Mainnet settlement records will appear here
          with livenet explorer links once real-money operations begin.
        </div>

      </div>
    </div>
  );
}
