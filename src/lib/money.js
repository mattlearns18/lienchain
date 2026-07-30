// money.js — Pure dollar→on-chain amount conversion (single source of truth).
//
// Extracted from settle-onchain.js so the one money-handling step can be
// unit-tested and backtested in isolation, with no xrpl / WebSocket import.
// settle-onchain.js imports dollarsToTestnetDrops from here; the backtest
// harness imports the same function, so the tested bytes are the shipped bytes.
//
// Verified byte-identical to the previous inline `xrpToDrops((usd/1000).toFixed(6))`
// path across a 20k-value sweep (zeros, sub-penny, cents, up to $45k) — 0 mismatches.

/**
 * Convert a dollar amount to testnet XRP drops using the 1000:1 scaling.
 *
 * Testnet: $1 = 0.001 XRP = 1,000 drops, keeping per-clinic payments within
 * faucet-funded wallet balances (~100 XRP each). The on-chain amounts prove
 * fund movement; exact dollar denomination is a mainnet concern.
 *
 * A share that scales below one drop (sub-tenth-of-a-cent) returns "0"; callers
 * MUST treat a "0" / non-positive result as an economically-zero no-op skip
 * rather than submitting it (XRPL rejects a 0-value Payment with temBAD_AMOUNT).
 *
 * TODO(phase10): mainnet currency = issued stablecoin Amount object
 * (e.g. RLUSD/USDC per MAINNET-READINESS.md). Do NOT use this scaling on mainnet.
 *
 * @param {number} usd  Dollar amount (clinic's share of the settled pool).
 * @returns {string}    Drops as an integer string (xrpl Amount format).
 */
export function dollarsToTestnetDrops(usd) {
  const xrp = (Math.max(0.000001, usd) / 1000).toFixed(6); // ≤6 decimals → integer drops
  return String(Math.round(Number(xrp) * 1e6));
}

// ── Platform servicing fee (record-keeping only) ─────────────────────────────
//
// Establishes the platform's unit economics from day one: every settled lien
// books an internal servicing/platform fee, charged notionally to the funder
// (LienCo today) on its recovery. This is BOOKKEEPING ONLY — it does not move
// money, does not change any on-chain Payment amount, and does not alter the
// clinic/LienCo waterfall split. It exists so the "platform take rate" story
// has real per-lien records behind it when third-party funders join.
//
// 1.5% sits mid-band of the 1–2% servicing range recommended in
// market-analysis-2026.md §5.2. Change here → applies to all new settlements.
export const PLATFORM_FEE_PCT = 1.5;

/**
 * Compute the platform servicing fee on a funder's recovery amount.
 * Pure; rounds to the cent. Non-positive / missing recovery → 0.
 *
 * @param {number} recovery  Funder's (LienCo's) dollar recovery on the lien.
 * @returns {number}         Fee in dollars, rounded to the cent.
 */
export function platformFee(recovery) {
  if (!(recovery > 0)) return 0;
  return Math.round(recovery * PLATFORM_FEE_PCT) / 100;
}
