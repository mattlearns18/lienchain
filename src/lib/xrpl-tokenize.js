/**
 * xrpl-tokenize.js
 *
 * Real XRPL testnet tokenization using HTTP JSON-RPC + xrpl Wallet signing.
 * Uses fetch() (same pattern as xrpl-data.js) to avoid WebSocket/polyfill
 * issues in the Vite browser build. Only imports Wallet from xrpl — pure
 * crypto, no Node.js-specific deps.
 *
 * Security: seed is read from import.meta.env.VITE_LIENCO_TESTNET_SEED only.
 * This is testnet — never use a real-funds seed here.
 */

import { Wallet } from "xrpl";

const RPC   = "https://s.altnet.rippletest.net:51234/";
const TIMEOUT = 15_000; // ms per RPC call

// ── Helpers ──────────────────────────────────────────────────────────────────

function hexEncode(str) {
  return Array.from(new TextEncoder().encode(str))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export async function generateCurrencyCode(tokenId) {
  const data = new TextEncoder().encode(tokenId);
  const buf  = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()
    .slice(0, 40)
    .padEnd(40, "0");
}

async function rpc(method, params = {}) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(RPC, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ method, params: [params] }),
      signal:  ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.result?.error) throw new Error(json.result.error_message ?? json.result.error);
    return json.result;
  } finally {
    clearTimeout(tid);
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Issue a lien as an on-chain NFT record on XRPL testnet.
 *
 * Uses NFTokenMint (single-party, no trust lines needed) so the LienCo wallet
 * alone can produce a verifiable, immutable on-chain record. The case ID is
 * stored in the NFT URI and the full metadata in a Memo.
 *
 * @param {object} lienData  – { id, bill, split, clinic, market, attorney,
 *                               purchasePrice, reductionNote }
 * @returns {{ success, txHash, explorerUrl, ledgerIndex?, error? }}
 */
export async function issueLienMPT(lienData) {
  const seed = import.meta.env.VITE_LIENCO_TESTNET_SEED;
  if (!seed) {
    throw new Error("XRPL seed not configured - tokenization disabled");
  }

  const wallet = Wallet.fromSeed(seed);

  try {
    // 1. Get account sequence + fee
    const acctInfo = await rpc("account_info", {
      account:      wallet.classicAddress,
      ledger_index: "current",
    });
    const sequence = acctInfo.account_data.Sequence;

    // 2. Get last validated ledger for LastLedgerSequence
    const ledgerResp = await rpc("ledger", { ledger_index: "validated" });
    const lastLedger = ledgerResp.ledger.ledger_index + 20; // ~60 s window

    // 3. Get current fee
    const feeResp = await rpc("fee");
    const fee     = feeResp.drops?.open_ledger_fee ?? "12";

    // 4. Build metadata memo (compact JSON to stay under 1 KB memo limit)
    const metadata = {
      id:    lienData.id,
      bill:  lienData.bill,
      pp:    lienData.purchasePrice || Math.round(lienData.bill * 0.78),
      lc:    lienData.split,
      cl:    100 - lienData.split,
      mkt:   lienData.market,
      atty:  lienData.attorney || "",
      note:  lienData.reductionNote || "",
      ts:    new Date().toISOString(),
    };
    const memoDataHex = hexEncode(JSON.stringify(metadata));
    const uriHex      = hexEncode(lienData.id); // case ID as NFT URI

    // 5. Construct NFTokenMint transaction
    const tx = {
      TransactionType:   "NFTokenMint",
      Account:           wallet.classicAddress,
      NFTokenTaxon:      1337,          // LienChain lien taxon
      Flags:             8,             // tfTransferable
      URI:               uriHex,
      Fee:               String(fee),
      Sequence:          sequence,
      LastLedgerSequence: lastLedger,
      Memos: [{
        Memo: {
          MemoType: hexEncode("LienChain-Metadata"),
          MemoData: memoDataHex,
        },
      }],
    };

    // 6. Sign
    const signed = wallet.sign(tx);

    // 7. Submit
    const submitResult = await rpc("submit", { tx_blob: signed.tx_blob });
    if (submitResult.engine_result !== "tesSUCCESS" &&
        !submitResult.engine_result?.startsWith("ter")) {
      throw new Error(`Submit failed: ${submitResult.engine_result} — ${submitResult.engine_result_message ?? ""}`);
    }

    const txHash = signed.hash;

    // 8. Poll for validation (up to ~30 s / 10 attempts × 3 s)
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const txResult = await rpc("tx", { transaction: txHash, binary: false });
        if (txResult.validated) {
          return {
            success:     true,
            txHash,
            explorerUrl: `https://testnet.xrpl.org/transactions/${txHash}`,
            ledgerIndex: txResult.ledger_index,
          };
        }
      } catch (_) { /* not validated yet */ }
    }

    // Timed out but tx was submitted — return hash anyway
    return {
      success:     true,
      txHash,
      explorerUrl: `https://testnet.xrpl.org/transactions/${txHash}`,
    };

  } catch (err) {
    return { success: false, error: err.message };
  }
}
