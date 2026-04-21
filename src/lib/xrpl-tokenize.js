/**
 * xrpl-tokenize.js
 *
 * Real XRPL testnet tokenization using HTTP JSON-RPC + xrpl Wallet signing.
 * Uses fetch() to avoid WebSocket issues in Vite browser builds.
 * Only imports Wallet from xrpl — pure crypto, no WebSocket deps.
 *
 * Security: seed is read from import.meta.env.VITE_LIENCO_TESTNET_SEED only.
 * This is testnet — never use a real-funds seed here.
 */

import { Wallet } from "xrpl";

const RPC     = "https://s.altnet.rippletest.net:51234/";
const TIMEOUT = 20_000; // ms per RPC call

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
    console.log(`[xrpl] RPC → ${method}`, params);
    const res = await fetch(RPC, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ method, params: [params] }),
      signal:  ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from XRPL RPC`);
    const json = await res.json();
    console.log(`[xrpl] RPC ← ${method}`, json.result);
    if (json.result?.error) {
      throw new Error(
        `XRPL ${method} error: ${json.result.error_message ?? json.result.error}`
      );
    }
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
    throw new Error("XRPL seed not configured — VITE_LIENCO_TESTNET_SEED is not set");
  }

  console.log("[xrpl] Starting NFTokenMint for lien:", lienData.id);
  console.log("[xrpl] Seed present:", seed.length > 0);

  let wallet;
  try {
    wallet = Wallet.fromSeed(seed);
    console.log("[xrpl] Wallet address:", wallet.classicAddress);
  } catch (err) {
    console.error("[xrpl] Wallet.fromSeed failed:", err);
    return { success: false, error: `Invalid seed: ${err.message}` };
  }

  try {
    // 1. Get account sequence
    console.log("[xrpl] Step 1: fetching account_info");
    const acctInfo = await rpc("account_info", {
      account:      wallet.classicAddress,
      ledger_index: "current",
    });
    const sequence = acctInfo.account_data.Sequence;
    console.log("[xrpl] Account sequence:", sequence);

    // 2. Get last validated ledger for LastLedgerSequence
    console.log("[xrpl] Step 2: fetching current ledger");
    const ledgerResp = await rpc("ledger", { ledger_index: "validated" });
    const lastLedger = ledgerResp.ledger.ledger_index + 20; // ~60 s window
    console.log("[xrpl] Last validated ledger:", ledgerResp.ledger.ledger_index, "→ LastLedgerSequence:", lastLedger);

    // 3. Get current fee
    console.log("[xrpl] Step 3: fetching fee");
    const feeResp = await rpc("fee");
    const fee     = feeResp.drops?.open_ledger_fee ?? "12";
    console.log("[xrpl] Fee (drops):", fee);

    // 4. Build metadata memo (compact JSON to stay under 1 KB memo limit)
    const metadata = {
      id:   lienData.id,
      bill: lienData.bill,
      pp:   lienData.purchasePrice || Math.round(lienData.bill * 0.78),
      lc:   lienData.split,
      cl:   100 - lienData.split,
      mkt:  lienData.market,
      atty: lienData.attorney || "",
      note: lienData.reductionNote || "",
      ts:   new Date().toISOString(),
    };
    const memoDataHex = hexEncode(JSON.stringify(metadata));
    const uriHex      = hexEncode(lienData.id);
    console.log("[xrpl] Metadata JSON:", JSON.stringify(metadata));

    // 5. Construct NFTokenMint transaction
    const tx = {
      TransactionType:    "NFTokenMint",
      Account:            wallet.classicAddress,
      NFTokenTaxon:       1337,   // LienChain lien taxon
      Flags:              8,      // tfTransferable
      URI:                uriHex,
      Fee:                String(fee),
      Sequence:           sequence,
      LastLedgerSequence: lastLedger,
      Memos: [{
        Memo: {
          MemoType: hexEncode("LienChain-Metadata"),
          MemoData: memoDataHex,
        },
      }],
    };
    console.log("[xrpl] Step 4: constructed tx:", JSON.stringify(tx, null, 2));

    // 6. Sign
    const signed = wallet.sign(tx);
    console.log("[xrpl] Step 5: signed tx_blob length:", signed.tx_blob.length);
    console.log("[xrpl] Step 5: locally-computed hash:", signed.hash);

    // 7. Submit
    console.log("[xrpl] Step 6: submitting to network");
    const submitResult = await rpc("submit", { tx_blob: signed.tx_blob });
    console.log("[xrpl] Submit engine_result:", submitResult.engine_result);
    console.log("[xrpl] Submit tx_json.hash:", submitResult.tx_json?.hash);

    const engineResult = submitResult.engine_result ?? "";

    // Reject anything that isn't tesSUCCESS or a transient ter* (retry) code.
    // tec* = claimed fee (tx failed on-chain), tem* = malformed, tef* = fatal.
    if (
      engineResult !== "tesSUCCESS" &&
      !engineResult.startsWith("ter")
    ) {
      throw new Error(
        `Submit rejected: ${engineResult} — ${submitResult.engine_result_message ?? "(no message)"}`
      );
    }

    // Use the server-returned hash from tx_json (authoritative 64-char uppercase hex).
    // Fall back to locally computed signed.hash only if the server didn't echo it.
    const txHash = (submitResult.tx_json?.hash ?? signed.hash ?? "").toUpperCase();
    console.log("[xrpl] Using txHash:", txHash, "(length:", txHash.length, ")");

    if (txHash.length !== 64) {
      throw new Error(
        `Unexpected TX hash format (got ${txHash.length} chars, want 64): "${txHash}"`
      );
    }

    const explorerUrl = `https://testnet.xrpl.org/transactions/${txHash}`;

    // 8. Poll for on-ledger validation (up to ~30 s / 10 attempts × 3 s)
    console.log("[xrpl] Step 7: polling for validation…");
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const txResult = await rpc("tx", { transaction: txHash, binary: false });
        console.log(`[xrpl] Poll ${i + 1}/10: validated=${txResult.validated}`);
        if (txResult.validated) {
          console.log("[xrpl] TX validated in ledger:", txResult.ledger_index);
          return {
            success:     true,
            txHash,
            explorerUrl,
            ledgerIndex: txResult.ledger_index,
          };
        }
      } catch (pollErr) {
        console.warn(`[xrpl] Poll ${i + 1}/10 error:`, pollErr.message);
      }
    }

    // After 30 s the tx hasn't appeared yet. Rather than silently marking it
    // as successful, surface this as an error — the user can retry.
    throw new Error(
      `TX submitted (${txHash}) but not validated after 30 s. ` +
      `Check ${explorerUrl} — if it appears there, the lien was minted successfully.`
    );

  } catch (err) {
    console.error("[xrpl] issueLienMPT failed:", err);
    return { success: false, error: err.message };
  }
}
