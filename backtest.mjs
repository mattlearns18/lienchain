/**
 * backtest.mjs — LienChain settlement-engine backtest harness
 *
 * Stress-tests the SHIPPED waterfall against a large synthetic portfolio:
 *   100 attorneys, 50 lien companies (LienCos), hundreds of cases / clinic-liens
 *   spread across the 5 live markets (KC, STL, TX, NV, IN), plus a deterministic
 *   edge-case battery.
 *
 * It imports the REAL calcWaterfall (the harness copies src/lib/waterfall.js to a
 * temp .mjs at runtime, so we always test the current shipped bytes), and it also
 * ports the inline calcMultiClinicWaterfall from AttorneyPreview.jsx so the two
 * engines can be diffed numerically.
 *
 * Run: node backtest.mjs   (writes backtest-results.json, prints a summary)
 */

import { writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Defaults to the directory this script lives in (repo root when committed there).
// Override with: node backtest.mjs /path/to/repo
const REPO = process.argv[2] || fileURLToPath(new URL(".", import.meta.url));

// ── Import the SHIPPED canonical engine ────────────────────────────────────────
// waterfall.js is pure ESM with no internal imports, so copy → import is faithful.
const tmpWf = join(tmpdir(), `waterfall.${Date.now()}.mjs`);
copyFileSync(join(REPO, "src/lib/waterfall.js"), tmpWf);
const { calcWaterfall } = await import("file://" + tmpWf);

// ── PRE-FIX port of AttorneyPreview.jsx::calcMultiClinicWaterfall ───────────────
// (operator-side "Attorney View" preview engine, as it shipped BEFORE this pass).
// Kept byte-faithful to the old JSX so the harness can quantify the divergence
// that existed. Post-fix, AttorneyPreview delegates to calcWaterfall (see
// previewWaterfallNEW), so this is retained only to document the pre-fix gap.
function previewWaterfallOLD(netAvailable, clinics, inFloorPct = 0.20) {
  const totalBills = clinics.reduce((s, c) => s + c.bill, 0);
  let clinicRows, patientNet;
  let floorAppliedCount = 0;
  let poolExhausted = false;

  if (netAvailable <= 0) {
    clinicRows = clinics.map(c => ({ ...c, recovery: 0, lienCoAmt: 0, clinicAmt: 0, floorApplied: false }));
    patientNet = netAvailable;
  } else if (netAvailable >= totalBills) {
    clinicRows = clinics.map(c => {
      const recovery = c.bill;
      const lienCoAmt = recovery * c.split / 100;
      return { ...c, recovery, lienCoAmt, clinicAmt: recovery - lienCoAmt, floorApplied: false };
    });
    patientNet = netAvailable - totalBills;
  } else {
    const recoveries = new Map(clinics.map(c => [c.id, totalBills > 0 ? (c.bill / totalBills) * netAvailable : 0]));
    const floorApplied = new Map(clinics.map(c => [c.id, false]));
    const fixed = new Set();
    let changed = true;
    while (changed) {
      changed = false;
      let worstId = null, worstGap = 0;
      for (const c of clinics) {
        if (fixed.has(c.id) || c.market !== "IN") continue;
        const floor = Math.ceil(c.bill * inFloorPct * 100) / 100;
        const gap = floor - recoveries.get(c.id);
        if (gap > 0.005 && gap > worstGap) { worstGap = gap; worstId = c.id; }
      }
      if (!worstId) break;
      const targetClinic = clinics.find(c => c.id === worstId);
      const floor = Math.ceil(targetClinic.bill * inFloorPct * 100) / 100;
      const currentRec = recoveries.get(worstId);
      const raise = floor - currentRec;
      const unfixedOthers = clinics.filter(c => !fixed.has(c.id) && c.id !== worstId);
      const poolFromOthers = unfixedOthers.reduce((s, c) => s + recoveries.get(c.id), 0);
      if (raise <= poolFromOthers) {
        recoveries.set(worstId, floor);
        floorApplied.set(worstId, true);
        fixed.add(worstId);
        const sumOtherBills = unfixedOthers.reduce((s, c) => s + c.bill, 0);
        const poolForOthers = poolFromOthers - raise;
        for (const c of unfixedOthers) {
          recoveries.set(c.id, sumOtherBills > 0 ? (c.bill / sumOtherBills) * poolForOthers : 0);
        }
        changed = true;
      } else {
        const partialRaise = poolFromOthers;
        recoveries.set(worstId, currentRec + partialRaise);
        floorApplied.set(worstId, true);
        fixed.add(worstId);
        for (const c of unfixedOthers) { recoveries.set(c.id, 0); fixed.add(c.id); }
        poolExhausted = true;
        changed = true;
      }
    }
    clinicRows = clinics.map(c => {
      const recovery = recoveries.get(c.id);
      const lienCoAmt = recovery * c.split / 100;
      return { ...c, recovery, lienCoAmt, clinicAmt: recovery - lienCoAmt, floorApplied: floorApplied.get(c.id) };
    });
    floorAppliedCount = clinicRows.filter(r => r.floorApplied).length;
    patientNet = 0;
  }
  const onChainTotal = clinicRows.reduce((s, r) => s + r.recovery, 0);
  const totalLienCo = clinicRows.reduce((s, r) => s + r.lienCoAmt, 0);
  const totalClinic = clinicRows.reduce((s, r) => s + r.clinicAmt, 0);
  return { clinicRows, floorAppliedCount, poolExhausted, patientNet, onChainTotal, totalLienCo, totalClinic, totalBills };
}

// ── POST-FIX preview engine — mirrors the shipped wrapper now in AttorneyPreview.jsx,
// which delegates to the canonical calcWaterfall (single source of truth).
function previewWaterfallNEW(netAvailable, clinics, inFloorPct = 0.20) {
  return calcWaterfall(Math.max(0, netAvailable), clinics, inFloorPct);
}

// ── Seeded PRNG (mulberry32) for reproducible runs ─────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260613);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const randInt = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const round2 = (x) => Math.round(x * 100) / 100;

const MARKETS = ["KC", "STL", "TX", "NV", "IN"];
const MARKET_WEIGHTS = ["KC", "KC", "KC", "STL", "STL", "STL", "TX", "TX", "NV", "IN"]; // KC/STL home-base heavy
const IN_FLOOR_PCT = 0.20;

// ── Build 50 LienCos with differing split policies ─────────────────────────────
const lienCos = Array.from({ length: 50 }, (_, i) => {
  const styles = [
    { name: "conservative", base: randInt(55, 65) },
    { name: "standard", base: 70 },
    { name: "standard", base: 70 },
    { name: "aggressive", base: randInt(78, 85) },
    { name: "edge", base: pick([28, 88, 90]) }, // deliberately near/over guardrails
  ];
  const s = pick(styles);
  return { id: `LC-${String(i + 1).padStart(3, "0")}`, name: `LienCo ${i + 1}`, style: s.name, baseSplit: s.base };
});

// ── Build 100 attorneys ────────────────────────────────────────────────────────
const attorneys = Array.from({ length: 100 }, (_, i) => ({
  id: `ATTY-${String(i + 1).padStart(3, "0")}`,
  firm: `Firm ${i + 1}, LLP`,
  feePct: pick([33, 33, 33, 33.33, 40, 30, 38, 35, 25, 45]), // contingency fee
}));

// ── Generate cases ─────────────────────────────────────────────────────────────
// Each attorney runs several cases; each case is assigned a LienCo. ~6 cases/attorney.
const SCENARIOS = ["full", "full", "partial", "partial", "severe", "zero", "negative"];

function makeClinic(idx, market, lienCo, forceSplit = null) {
  let split = forceSplit != null ? forceSplit : lienCo.baseSplit + randInt(-5, 5);
  split = Math.max(0, Math.min(100, split));
  // bill: occasional zero-bill to test divide-by-zero guards
  const bill = rnd() < 0.01 ? 0 : randInt(1500, 45000);
  return { id: `cl-${idx}-${Math.floor(rnd() * 1e6)}`, clinic: `${market} Clinic ${idx}`, bill, split, market };
}

const cases = [];
let caseSeq = 0;
for (const atty of attorneys) {
  const nCases = randInt(4, 8);
  for (let k = 0; k < nCases; k++) {
    caseSeq++;
    const lienCo = pick(lienCos);
    const nClinics = pick([1, 1, 1, 2, 2, 3, 4]); // mostly single, some multi-clinic
    // Case market: pick a primary, but multi-clinic cases sometimes mix in IN
    const primary = pick(MARKET_WEIGHTS);
    const clinics = [];
    for (let c = 0; c < nClinics; c++) {
      let market = primary;
      if (nClinics > 1 && c > 0 && rnd() < 0.4) market = pick(MARKET_WEIGHTS); // mix markets
      clinics.push(makeClinic(`${caseSeq}.${c}`, market, lienCo));
    }
    const totalBills = clinics.reduce((s, c) => s + c.bill, 0);
    const scenario = pick(SCENARIOS);
    const feePct = atty.feePct;
    // Choose gross to land net in the target regime
    let gross;
    if (scenario === "full") gross = round2(totalBills / (1 - feePct / 100) * (1 + rnd() * 0.6 + 0.1)); // net >> bills
    else if (scenario === "partial") gross = round2(totalBills / (1 - feePct / 100) * (0.45 + rnd() * 0.4)); // net 45-85% bills
    else if (scenario === "severe") gross = round2(totalBills / (1 - feePct / 100) * (0.05 + rnd() * 0.25)); // net 5-30% bills
    else if (scenario === "zero") gross = round2(totalBills * (feePct / 100) + randInt(0, 500)); // net ~ 0
    else gross = round2(totalBills * (feePct / 100) * (0.3 + rnd() * 0.5)); // net negative
    const costs = round2(randInt(0, Math.max(1, Math.floor(totalBills * 0.08))));
    cases.push({
      caseId: `PI-${String(caseSeq).padStart(5, "0")}`,
      attorneyId: atty.id, feePct, lienCoId: lienCo.id,
      gross, costs, clinics, totalBills, scenario,
    });
  }
}

// ── Invariant checker ──────────────────────────────────────────────────────────
const TOL = 0.05; // 5 cents absolute tolerance for float noise
function near(a, b, tol = TOL) { return Math.abs(a - b) <= tol; }

const failures = [];
function check(cond, code, ctx) {
  if (!cond) failures.push({ code, ...ctx });
  return cond;
}

// ── Run the backtest ───────────────────────────────────────────────────────────
const stats = {
  totalCases: cases.length, totalClinicLiens: 0, totalAttorneys: attorneys.length, totalLienCos: lienCos.length,
  branch: { full: 0, partial: 0, zero: 0, negative: 0 },
  floorRaiseCases: 0, poolExhaustedCases: 0, unusualSplitLiens: 0, inLiens: 0, zeroBillLiens: 0,
  deployedCapitalProxy: 0, totalBillsAll: 0, totalLienCoRecovery: 0, totalClinicRecovery: 0,
  engineMoneyDivergenceCases: 0, floorTagDivergencePreFix: 0, floorTagDivergencePostFix: 0,
  perMarket: Object.fromEntries(MARKETS.map(m => [m, { liens: 0, bills: 0, recovery: 0, floorRaises: 0 }])),
  zeroPayoutLiens: 0, // pool-exhausted/zeroed clinics that would attempt $0 on-chain payment
};

for (const cs of cases) {
  const { clinics, gross, feePct, costs, totalBills } = cs;
  stats.totalClinicLiens += clinics.length;
  stats.totalBillsAll += totalBills;

  const attyFeeAmt = Math.round(gross * feePct / 100);   // matches AttorneyPortal + AttorneyPreview
  const netAvailable = gross - attyFeeAmt - costs;

  const r = calcWaterfall(Math.max(0, netAvailable), clinics, IN_FLOOR_PCT);
  const pOld = previewWaterfallOLD(Math.max(0, netAvailable), clinics, IN_FLOOR_PCT);
  const pNew = previewWaterfallNEW(Math.max(0, netAvailable), clinics, IN_FLOOR_PCT);

  // Branch accounting
  if (netAvailable <= 0) stats.branch[netAvailable < 0 ? "negative" : "zero"]++;
  else if (netAvailable >= totalBills) stats.branch.full++;
  else stats.branch.partial++;
  if (r.floorAppliedCount > 0) stats.floorRaiseCases++;
  if (r.poolExhausted) stats.poolExhaustedCases++;

  const expectedDistributed = netAvailable <= 0 ? 0 : Math.min(netAvailable, totalBills);

  // ── INVARIANTS on canonical engine ──
  check(near(r.onChainTotal, expectedDistributed, Math.max(TOL, expectedDistributed * 1e-6)),
    "I1_CONSERVATION", { caseId: cs.caseId, onChainTotal: r.onChainTotal, expectedDistributed, netAvailable, totalBills });
  check(near(r.totalLienCo + r.totalClinic, r.onChainTotal),
    "I7_TOTALS", { caseId: cs.caseId, totalLienCo: r.totalLienCo, totalClinic: r.totalClinic, onChainTotal: r.onChainTotal });
  check(r.floorAppliedCount === r.clinicRows.filter(x => x.floorApplied).length,
    "I8_FLOORCOUNT", { caseId: cs.caseId });
  check(r.patientNet >= -TOL, "I6a_PATIENT_NONNEG", { caseId: cs.caseId, patientNet: r.patientNet });
  if (r.patientNet > TOL) check(netAvailable >= totalBills - TOL, "I6b_PATIENT_ONLY_WHEN_FULL",
    { caseId: cs.caseId, patientNet: r.patientNet, netAvailable, totalBills });

  for (const row of r.clinicRows) {
    check(near(row.lienCoAmt + row.clinicAmt, row.recovery), "I2_ROW_IDENTITY", { caseId: cs.caseId, row: row.id });
    check(row.recovery >= -TOL && row.lienCoAmt >= -TOL && row.clinicAmt >= -TOL, "I3_NONNEG", { caseId: cs.caseId, row: row.id, recovery: row.recovery });
    check(row.recovery <= row.bill + TOL, "I4_RECOVERY_LE_BILL", { caseId: cs.caseId, row: row.id, recovery: row.recovery, bill: row.bill });
    check(near(row.lienCoAmt, row.recovery * row.split / 100), "I9_SPLIT_SHARE", { caseId: cs.caseId, row: row.id });

    // I5 — Indiana floor: must hold whenever pool was NOT exhausted and we're in shortfall regime
    if (row.market === "IN" && netAvailable > 0 && netAvailable < totalBills && !r.poolExhausted) {
      const floor = Math.ceil(row.bill * IN_FLOOR_PCT * 100) / 100;
      check(row.recovery >= floor - TOL, "I5_IN_FLOOR", { caseId: cs.caseId, row: row.id, recovery: row.recovery, floor });
    }
    // Count zero-payout clinic shares (would hit settle-onchain $0 payment edge)
    if (netAvailable > 0 && row.clinicAmt <= 0.000001) stats.zeroPayoutLiens++;

    // Per-market + global aggregation
    const m = stats.perMarket[row.market];
    m.liens++; m.bills += row.bill; m.recovery += row.recovery;
    if (row.floorApplied) m.floorRaises++;
    if (row.market === "IN") stats.inLiens++;
    if (row.bill === 0) stats.zeroBillLiens++;
    // Unusual split guardrail (mirrors AttorneyPreview hasUnusualSplit + IntakeWizard)
    if (row.split < 30 || row.split > 85) stats.unusualSplitLiens++;
    stats.totalLienCoRecovery += row.lienCoAmt;
    stats.totalClinicRecovery += row.clinicAmt;
  }

  // ── ENGINE DIVERGENCE: canonical vs preview (pre-fix inline) and (post-fix wrapper) ──
  let moneyDiverged = false;
  for (const row of r.clinicRows) {
    const prow = pOld.clinicRows.find(x => x.id === row.id);
    if (!near(row.recovery, prow.recovery, 0.02) || !near(row.lienCoAmt, prow.lienCoAmt, 0.02)) moneyDiverged = true;
  }
  if (moneyDiverged) stats.engineMoneyDivergenceCases++;
  if (r.floorAppliedCount !== pOld.floorAppliedCount) stats.floorTagDivergencePreFix++;
  if (r.floorAppliedCount !== pNew.floorAppliedCount) stats.floorTagDivergencePostFix++;
}

// proxy "deployed capital" ≈ 78% of bills purchased (per CLAUDE.md analytics default)
stats.deployedCapitalProxy = round2(stats.totalBillsAll * 0.78);
const recoveryRate = stats.totalBillsAll > 0 ? stats.totalLienCoRecovery / (stats.totalBillsAll * 0.70) : 0;

// ── Edge-case battery (deterministic) ──────────────────────────────────────────
const edge = [];
function edgeCase(label, net, clinics) {
  const r = calcWaterfall(Math.max(0, net), clinics, IN_FLOOR_PCT);
  const dist = net <= 0 ? 0 : Math.min(net, clinics.reduce((s, c) => s + c.bill, 0));
  const ok = near(r.onChainTotal, dist, Math.max(TOL, dist * 1e-6))
    && r.clinicRows.every(x => near(x.lienCoAmt + x.clinicAmt, x.recovery) && x.recovery >= -TOL && x.recovery <= x.bill + TOL);
  edge.push({ label, ok, onChainTotal: round2(r.onChainTotal), expected: round2(dist), floorApplied: r.floorAppliedCount, poolExhausted: r.poolExhausted,
    recoveries: r.clinicRows.map(x => round2(x.recovery)) });
}
edgeCase("E1 single KC full", 30000, [{ id: "a", clinic: "KC", bill: 10000, split: 70, market: "KC" }]);
edgeCase("E2 single KC shortfall", 6000, [{ id: "a", clinic: "KC", bill: 10000, split: 70, market: "KC" }]);
edgeCase("E3 single IN above floor", 5000, [{ id: "a", clinic: "IN", bill: 10000, split: 70, market: "IN" }]);
edgeCase("E4 single IN below floor (no others)", 1000, [{ id: "a", clinic: "IN", bill: 10000, split: 70, market: "IN" }]);
edgeCase("E5 IN+KC IN raised KC haircut", 2000, [{ id: "a", clinic: "IN", bill: 10000, split: 70, market: "IN" }, { id: "b", clinic: "KC", bill: 10000, split: 70, market: "KC" }]);
edgeCase("E6 two IN pool exhausted", 2000, [{ id: "a", clinic: "INA", bill: 10000, split: 70, market: "IN" }, { id: "b", clinic: "INB", bill: 5000, split: 70, market: "IN" }]);
edgeCase("E7 net exactly = bills", 15000, [{ id: "a", clinic: "KC", bill: 5000, split: 70, market: "KC" }, { id: "b", clinic: "KC", bill: 10000, split: 70, market: "KC" }]);
edgeCase("E8 negative net", -500, [{ id: "a", clinic: "KC", bill: 10000, split: 70, market: "KC" }]);
edgeCase("E9 zero-bill clinic", 5000, [{ id: "a", clinic: "Z", bill: 0, split: 70, market: "KC" }, { id: "b", clinic: "KC", bill: 10000, split: 70, market: "KC" }]);
edgeCase("E10 split 0%", 6000, [{ id: "a", clinic: "KC", bill: 10000, split: 0, market: "KC" }]);
edgeCase("E11 split 100%", 6000, [{ id: "a", clinic: "KC", bill: 10000, split: 100, market: "KC" }]);
edgeCase("E12 four IN cascade", 4000, [
  { id: "a", clinic: "IN1", bill: 10000, split: 70, market: "IN" }, { id: "b", clinic: "IN2", bill: 8000, split: 70, market: "IN" },
  { id: "c", clinic: "IN3", bill: 6000, split: 70, market: "IN" }, { id: "d", clinic: "IN4", bill: 4000, split: 70, market: "IN" }]);
edgeCase("E13 ten-clinic mixed large", 120000, Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, clinic: `C${i}`, bill: (i + 1) * 3000, split: 65 + i, market: MARKETS[i % 5] })));

// ── Output ─────────────────────────────────────────────────────────────────────
for (const m of MARKETS) {
  const x = stats.perMarket[m];
  x.bills = round2(x.bills); x.recovery = round2(x.recovery);
  x.recoveryRate = x.bills > 0 ? round2(x.recovery / x.bills) : 0;
}
const out = {
  meta: { seed: 20260613, repo: REPO, generatedAt: new Date().toISOString() },
  stats: {
    ...stats,
    totalBillsAll: round2(stats.totalBillsAll),
    totalLienCoRecovery: round2(stats.totalLienCoRecovery),
    totalClinicRecovery: round2(stats.totalClinicRecovery),
    blendedRecoveryRateVsExpected: round2(recoveryRate),
  },
  invariantFailures: failures,
  edgeCases: edge,
  pass: failures.length === 0 && edge.every(e => e.ok),
};
// drop results alongside this script (outputs dir)
writeFileSync(new URL("./backtest-results.json", import.meta.url), JSON.stringify(out, null, 2));

const E = (s) => s;
console.log(E("══════════════════════════════════════════════════════════════════"));
console.log(E("  LIENCHAIN SETTLEMENT-ENGINE BACKTEST"));
console.log(E("══════════════════════════════════════════════════════════════════"));
console.log(`Attorneys: ${stats.totalAttorneys}   LienCos: ${stats.totalLienCos}   Cases: ${stats.totalCases}   Clinic-liens: ${stats.totalClinicLiens}`);
console.log(`Synthetic bills purchased: $${stats.totalBillsAll.toLocaleString()}   (~$${stats.deployedCapitalProxy.toLocaleString()} deployed @78%)`);
console.log("");
console.log("Settlement-branch coverage:");
console.log(`  full recovery : ${stats.branch.full}`);
console.log(`  partial/short : ${stats.branch.partial}`);
console.log(`  zero net      : ${stats.branch.zero}`);
console.log(`  negative net  : ${stats.branch.negative}`);
console.log(`  IN floor raised in ${stats.floorRaiseCases} cases   |   pool exhausted in ${stats.poolExhaustedCases} cases`);
console.log(`  IN clinic-liens: ${stats.inLiens}   unusual-split liens: ${stats.unusualSplitLiens}   zero-bill liens: ${stats.zeroBillLiens}`);
console.log("");
console.log("Per-market (bills → recovery → rate):");
for (const m of MARKETS) {
  const x = stats.perMarket[m];
  console.log(`  ${m.padEnd(4)} liens=${String(x.liens).padStart(4)}  bills=$${String(Math.round(x.bills)).padStart(9)}  recovery=$${String(Math.round(x.recovery)).padStart(9)}  rate=${(x.recoveryRate * 100).toFixed(1)}%  floorRaises=${x.floorRaises}`);
}
console.log("");
console.log("──────────────────────────────────────────────────────────────────");
console.log(`INVARIANT FAILURES : ${failures.length}`);
if (failures.length) {
  const byCode = {};
  for (const f of failures) byCode[f.code] = (byCode[f.code] || 0) + 1;
  for (const [code, n] of Object.entries(byCode)) console.log(`   ✗ ${code}: ${n}`);
  console.log("   first 5:", JSON.stringify(failures.slice(0, 5), null, 1));
} else {
  console.log("   ✓ all financial invariants held across every case");
}
console.log("");
console.log("ENGINE CROSS-CHECK (canonical waterfall.js vs AttorneyPreview preview engine):");
console.log(`   money divergence (recovery/lienCo)        : ${stats.engineMoneyDivergenceCases} cases`);
console.log(`   FLOOR-tag divergence  PRE-FIX (old inline): ${stats.floorTagDivergencePreFix} cases  ← the bug`);
console.log(`   FLOOR-tag divergence POST-FIX (wrapper)   : ${stats.floorTagDivergencePostFix} cases  ← after unifying engines`);
console.log("");
console.log("Settle-onchain $0-payout edge (clinics that would attempt a 0-amount XRPL Payment):");
console.log(`   ${stats.zeroPayoutLiens} clinic-liens`);
console.log("");
console.log("EDGE-CASE BATTERY:");
for (const e of edge) console.log(`   ${e.ok ? "✓" : "✗"} ${e.label.padEnd(34)} dist=$${e.expected} floor=${e.floorApplied} exh=${e.poolExhausted} rec=[${e.recoveries.join(",")}]`);
console.log("");
console.log(`OVERALL: ${out.pass ? "✓ PASS" : "✗ FAIL"}  (results → backtest-results.json)`);
console.log("══════════════════════════════════════════════════════════════════");
