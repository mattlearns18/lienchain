/**
 * settle-onchain.js — Phase 9 real clinic payout helper
 *
 * Executes a single XRPL Payment transaction routing the clinic's share of
 * the settled net pool to the clinic's destination wallet. Uses the same
 * WebSocket + getNetworkConfig() pattern as xrpl-tokenize.js so the
 * network feature flag from Commit 1 applies automatically.
 *
 * Returns { success: true, txHash, ledgerIndex }
 *      or { success: false, error: string }
 */

import { Client, Wallet, xrpToDrops } from "xrpl";
import { getNetworkConfig } from "./network.js";

// Fallback destination addresses for seed/historical clinic names (testnet only).
// These map the short names used in the hardcoded SETTLEMENTS array in Dashboard.jsx.
// TODO(phase10): replace with a proper clinic-registry UI and per-clinic onboarding flow.
const SEED_CLINIC_DESTINATIONS = {
  "KC Clinic":  "rMsuF1wrwMNcFntEet39yUGcTUpyAhWiMA",
  "STL Clinic": "r3CuAh6S7JnjcsN5z8LyoUDZiBvT8aVBBP",
  "TX Clinic":  "rJZjjSDgfPkKhCKnLrmGuKn8Npb54eBU6D",
  "NV Clinic":  "rKvS6Pa5GXiCxB8cQXJy1oBKbE2gYGFoWu",
  "IN Clinic":  "rnanVCk3APmjh1dtzS9pESNRm42VsSLvXt",
};

/**
 * Resolve the XRPL destination address for a clinic.
 * Priority: clinic.destinationAddress → SEED_CLINIC_DESTINATIONS[name] → null
 *
 * @param {{ name: string, destinationAddress?: string }} clinic
 * @returns {string|null}
 */
export function resolveDestination(clinic) {
  return clinic.destinationAddress || SEED_CLINIC_DESTINATIONS[clinic.name] || null;
}

/**
 * Execute a single XRPL Payment transaction for one clinic's share of a
 * settled lien case.
 *
 * @param {{
 *   caseId:  string,
 *   lienId:  string,
 *   clinic:  { name: string, destinationAddress?: string },
 *   amount:  number,   // dollars; paid as native XRP drops on testnet
 * }} params
 * @returns {Promise<{ success: boolean, txHash?: string, ledgerIndex?: number, error?: string }>}
 */
export async function executeSettlementPayment({ caseId, lienId, clinic, amount }) {
  const { wssUrl, seed } = getNetworkConfig();

  const destination = resolveDestination(clinic);
  if (!destination) {
    // Sentinel: destination missing — surface the gap instead of silently succeeding.
    return {
      success: false,
      error:   `no-destination-skipped: no XRPL wallet configured for "${clinic.name}". Add a destinationAddress before settling.`,
    };
  }

  const client = new Client(wssUrl);
  try {
    await client.connect();
    const wallet = Wallet.fromSeed(seed);

    const memoData = {
      caseId,
      lienId,
      clinicName: clinic.name,
      share:      amount,
      ts:         new Date().toISOString(),
    };

    const tx = {
      TransactionType: "Payment",
      Account:         wallet.classicAddress,
      Destination:     destination,
      // TODO(phase10): mainnet currency selection — native XRP here for testnet.
      // For mainnet, Amount may need to be {currency, issuer, value} for RLUSD/USDC.
      Amount:          xrpToDrops(Math.max(0.000001, amount).toFixed(6)),
      Memos: [{
        Memo: {
          MemoType: Buffer.from("LienChain-ClinicPayout").toString("hex").toUpperCase(),
          MemoData: Buffer.from(JSON.stringify(memoData)).toString("hex").toUpperCase(),
        },
      }],
    };

    const prepared = await client.autofill(tx);
    const signed   = wallet.sign(prepared);
    const result   = await client.submitAndWait(signed.tx_blob);

    const txHash = result.result.hash;
    if (!txHash || txHash.length !== 64) {
      throw new Error(`Unexpected TX hash: "${txHash}"`);
    }
    return { success: true, txHash, ledgerIndex: result.result.ledger_index };

  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    try { await client.disconnect(); } catch (_) {}
  }
}
