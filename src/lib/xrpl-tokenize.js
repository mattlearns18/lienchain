/**
 * xrpl-tokenize.js
 *
 * Real XRPL testnet tokenization using the xrpl WebSocket Client.
 * WebSocket bypasses the CORS restriction that blocks HTTP JSON-RPC fetch()
 * calls from the browser.
 *
 * Security: seed is read from import.meta.env.VITE_LIENCO_TESTNET_SEED only.
 * This is testnet — never use a real-funds seed here.
 */

import { Client, Wallet } from "xrpl";

const WSS_ENDPOINT = "wss://s.altnet.rippletest.net:51233";

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Issue a lien as an on-chain NFT record on XRPL testnet.
 *
 * Uses NFTokenMint (single-party, no Destination needed) so the LienCo wallet
 * alone produces a verifiable, immutable on-chain record. A self-payment IOU
 * would be rejected as temREDUNDANT; NFTokenMint has no such restriction.
 *
 * Connects via WebSocket to avoid the CORS restriction on the HTTP RPC endpoint.
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

  console.log("[XRPL] Starting NFTokenMint for lien:", lienData.id);

  let wallet;
  try {
    wallet = Wallet.fromSeed(seed);
    console.log("[XRPL] Wallet address:", wallet.classicAddress);
  } catch (err) {
    console.error("[XRPL] Wallet.fromSeed failed:", err);
    return { success: false, error: `Invalid seed: ${err.message}` };
  }

  const client = new Client(WSS_ENDPOINT);

  try {
    // 1. Connect via WebSocket (no CORS restriction)
    console.log("[XRPL] Connecting to", WSS_ENDPOINT);
    await client.connect();
    console.log("[XRPL] Connected");

    // 2. Build compact metadata memo (keep under 1 KB)
    const memoData = {
      id:   lienData.id,
      bill: lienData.bill,
      pp:   lienData.purchasePrice || Math.round(lienData.bill * 0.78),
      lc:   lienData.split,
      cl:   100 - lienData.split,
      mkt:  lienData.market,
      atty: lienData.attorney  || "",
      note: lienData.reductionNote || "",
      ts:   new Date().toISOString(),
    };
    console.log("[XRPL] Memo data:", JSON.stringify(memoData));

    const memoTypeHex = Buffer.from("LienChain-Metadata").toString("hex").toUpperCase();
    const memoDataHex = Buffer.from(JSON.stringify(memoData)).toString("hex").toUpperCase();
    const uriHex      = Buffer.from(lienData.id).toString("hex").toUpperCase();

    // 3. Build NFTokenMint transaction
    const tx = {
      TransactionType:  "NFTokenMint",
      Account:          wallet.classicAddress,
      NFTokenTaxon:     1337,   // LienChain lien taxon
      Flags:            8,      // tfTransferable
      URI:              uriHex,
      Memos: [{
        Memo: {
          MemoType: memoTypeHex,
          MemoData: memoDataHex,
        },
      }],
    };
    console.log("[XRPL] Raw tx (pre-autofill):", JSON.stringify(tx, null, 2));

    // 4. Autofill (fills Sequence, Fee, LastLedgerSequence)
    const prepared = await client.autofill(tx);
    console.log("[XRPL] Autofilled tx:", JSON.stringify(prepared, null, 2));

    // 5. Sign
    const signed = wallet.sign(prepared);
    console.log("[XRPL] Signed tx_blob length:", signed.tx_blob.length);
    console.log("[XRPL] Locally-computed hash:", signed.hash);

    // 6. Submit and wait for validation (handles polling internally)
    console.log("[XRPL] Submitting via submitAndWait…");
    const result = await client.submitAndWait(signed.tx_blob);
    console.log("[XRPL] submitAndWait result:", JSON.stringify(result, null, 2));

    const txHash     = result.result.hash;
    const ledgerIdx  = result.result.ledger_index;
    const explorerUrl = `https://testnet.xrpl.org/transactions/${txHash}`;

    console.log("[XRPL] TX hash:", txHash, "(length:", txHash?.length, ")");
    console.log("[XRPL] Ledger index:", ledgerIdx);
    console.log("[XRPL] Explorer URL:", explorerUrl);

    if (!txHash || txHash.length !== 64) {
      throw new Error(
        `Unexpected TX hash format (got ${txHash?.length ?? 0} chars, want 64): "${txHash}"`
      );
    }

    return {
      success:    true,
      txHash,
      explorerUrl,
      ledgerIndex: ledgerIdx,
    };

  } catch (err) {
    console.error("[XRPL] issueLienMPT failed:", err);
    return { success: false, error: err.message };
  } finally {
    try {
      await client.disconnect();
      console.log("[XRPL] Disconnected");
    } catch (_) { /* ignore disconnect errors */ }
  }
}
