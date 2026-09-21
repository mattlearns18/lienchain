/**
 * markets.test.js — Phase 13 assignability / mint-flag tests.
 * Run with: node src/lib/__tests__/markets.test.js
 *
 * WHY THIS MATTERS: XRPL NFToken mint flags are IMMUTABLE. mintFlagsForMarket()
 * decides, once and permanently, whether a lien can ever be assigned to a third
 * party. tfBurnable is not set, so a wrong flag cannot be corrected by burning
 * and re-minting. A bug here is uncorrectable on every token it touches.
 *
 * IMPORTANT: imports the ACTUAL shipped src/lib/markets.js — it does not inline
 * a copy. Testing a re-pasted copy gives false confidence; that exact mistake
 * was found and fixed in waterfall.test.js on 2026-06-17. markets.js is pure
 * ESM with no internal imports, so we copy it to a temp .mjs and dynamic-import
 * it, which works from this CommonJS file (package.json is type:commonjs).
 */

const { copyFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

// ── Helpers ──────────────────────────────────────────────────────────────────
let passed = 0; let failed = 0;
function assert(condition, label) {
  if (condition) { console.log(`  ✓ ${label}`); passed++; }
  else           { console.error(`  ✗ ${label}`); failed++; }
}

(async () => {
  const tmp = join(tmpdir(), `lienchain-markets-${Date.now()}.mjs`);
  copyFileSync(join(__dirname, "..", "markets.js"), tmp);
  const {
    MARKET_INFO, SELECTABLE_MARKETS,
    isAssignableMarket, mintFlagsForMarket,
    TF_TRANSFERABLE, TF_NONE,
  } = await import(`file://${tmp}`);

  console.log("\nPhase 13 — assignability policy → immutable mint flags\n");

  // ── A. Flag constants match the XRPL spec ──────────────────────────────────
  console.log("A. XRPL flag constants");
  assert(TF_TRANSFERABLE === 8, "TF_TRANSFERABLE is 8 (tfTransferable per XLS-20)");
  assert(TF_NONE === 0,         "TF_NONE is 0 (issuer↔holder only, no third-party assignment)");

  // ── B. Every market declares assignability explicitly ──────────────────────
  // A market with no explicit policy would silently fail open to transferable —
  // an uncorrectable default. Every market must state its posture.
  console.log("\nB. Every market states its assignability explicitly");
  for (const market of Object.keys(MARKET_INFO)) {
    assert(
      typeof MARKET_INFO[market].policy?.assignable === "boolean",
      `${market} declares policy.assignable explicitly`
    );
  }

  // ── C. Active markets are assignable and mint transferable ─────────────────
  // This is the "functional no-op" guarantee: Phase 13 must not change the
  // behaviour of any market currently open for new liens.
  console.log("\nC. Active markets (KC/STL/TX/NV) — unchanged behaviour");
  for (const market of SELECTABLE_MARKETS) {
    assert(isAssignableMarket(market) === true,              `${market} is assignable`);
    assert(mintFlagsForMarket(market) === TF_TRANSFERABLE,   `${market} mints Flags: 8 (as before Phase 13)`);
  }

  // ── D. Indiana — the non-assignable case the phase exists for ──────────────
  console.log("\nD. Indiana (retired, non-assignable)");
  assert(isAssignableMarket("IN") === false,        "IN is NOT assignable");
  assert(mintFlagsForMarket("IN") === TF_NONE,      "IN mints Flags: 0 — cannot be assigned to a third party");
  assert(MARKET_INFO.IN.policy.nonAssignable === true, "IN keeps legacy nonAssignable key for back-compat");
  assert(!SELECTABLE_MARKETS.includes("IN"),        "IN is not selectable for new liens");

  // ── E. Unknown markets fail open, loudly ───────────────────────────────────
  // Fail-open preserves pre-Phase-13 behaviour rather than silently changing a
  // permanent legal posture, but it must warn — the decision is uncorrectable.
  console.log("\nE. Unknown market — fails open to transferable, with a warning");
  const warnings = [];
  const realWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  const unknownFlags = mintFlagsForMarket("ZZ");
  const undefinedFlags = mintFlagsForMarket(undefined);
  console.warn = realWarn;

  assert(unknownFlags === TF_TRANSFERABLE,   'unknown market "ZZ" defaults to Flags: 8');
  assert(undefinedFlags === TF_TRANSFERABLE, "undefined market defaults to Flags: 8");
  assert(warnings.length === 2,              "both unknown-market calls emitted a warning");
  assert(warnings.every(w => /IMMUTABLE/i.test(w)), "warning states that mint flags are immutable");

  // ── F. No active market can ever be silently non-assignable ────────────────
  // Guards the inverse mistake: marking a live market non-assignable without
  // also retiring it would permanently brick every new lien in that state.
  console.log("\nF. Cross-check — no active market is non-assignable");
  for (const market of SELECTABLE_MARKETS) {
    assert(
      MARKET_INFO[market].policy.assignable !== false,
      `${market} is not both active and non-assignable`
    );
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n${failed === 0 ? "✓" : "✗"} ${passed}/${total} assertions passed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
