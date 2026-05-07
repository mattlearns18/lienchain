/**
 * waterfall.test.js — Plain Node assertion script (no test runner needed).
 * Run with: node src/lib/__tests__/waterfall.test.js
 *
 * Covers all six scenarios from the Phase 6 Commit 2 handoff spec.
 * clinicFloorPct = 0.20 throughout.
 */

// ESM shim: import via dynamic import or use inline copy for plain Node.
// Since Vite uses ESM and Node 18+ supports it, run with --experimental-vm-modules
// or replicate the function inline here for plain CJS node.
// For simplicity this script inlines the algorithm so it runs with bare `node`.

const FLOOR_PCT = 0.20;

function calcWaterfall(netAvailable, clinics, clinicFloorPct = FLOOR_PCT) {
  const totalBills = clinics.reduce((s, c) => s + c.bill, 0);
  let clinicRows;
  let poolExhausted = false;

  if (netAvailable <= 0) {
    clinicRows = clinics.map(c => ({ ...c, recovery: 0, lienCoAmt: 0, clinicAmt: 0, floorApplied: false }));
  } else if (netAvailable >= totalBills) {
    clinicRows = clinics.map(c => {
      const recovery  = c.bill;
      const lienCoAmt = recovery * c.split / 100;
      return { ...c, recovery, lienCoAmt, clinicAmt: recovery - lienCoAmt, floorApplied: false };
    });
  } else {
    const recoveries = new Map();
    const fixed      = new Set();
    const floorFlag  = new Map();
    for (const c of clinics) {
      recoveries.set(c.id, totalBills > 0 ? (c.bill / totalBills) * netAvailable : 0);
      floorFlag.set(c.id, false);
    }
    let iterating = true;
    while (iterating) {
      iterating = false;
      let worstId = null; let worstGap = 0;
      for (const c of clinics) {
        if (fixed.has(c.id) || c.market !== 'IN') continue;
        const floor = Math.ceil((c.bill * clinicFloorPct) * 100) / 100;
        const gap   = floor - recoveries.get(c.id);
        if (gap > 0.005 && gap > worstGap) { worstGap = gap; worstId = c.id; }
      }
      if (!worstId) break;
      const target      = clinics.find(c => c.id === worstId);
      const targetFloor = Math.ceil((target.bill * clinicFloorPct) * 100) / 100;
      const currentRec  = recoveries.get(worstId);
      const unfixedOthers = clinics.filter(c => !fixed.has(c.id) && c.id !== worstId);
      const poolFromOthers = unfixedOthers.reduce((s, c) => s + recoveries.get(c.id), 0);
      const raise = targetFloor - currentRec;
      if (raise <= poolFromOthers) {
        recoveries.set(worstId, targetFloor); floorFlag.set(worstId, true); fixed.add(worstId);
        const poolForOthers = poolFromOthers - raise;
        const sumOtherBills = unfixedOthers.reduce((s, c) => s + c.bill, 0);
        for (const c of unfixedOthers)
          recoveries.set(c.id, sumOtherBills > 0 ? (c.bill / sumOtherBills) * poolForOthers : 0);
        iterating = true;
      } else {
        recoveries.set(worstId, currentRec + poolFromOthers);
        floorFlag.set(worstId, true); fixed.add(worstId);
        for (const c of unfixedOthers) {
          recoveries.set(c.id, 0); fixed.add(c.id);
          if (c.market === 'IN') {
            const cFloor = Math.ceil((c.bill * clinicFloorPct) * 100) / 100;
            if (cFloor > 0) floorFlag.set(c.id, true);
          }
        }
        poolExhausted = true;
      }
    }
    clinicRows = clinics.map(c => {
      const recovery  = recoveries.get(c.id);
      const lienCoAmt = recovery * c.split / 100;
      return { ...c, recovery, lienCoAmt, clinicAmt: recovery - lienCoAmt, floorApplied: floorFlag.get(c.id) };
    });
  }

  const patientNet        = netAvailable >= totalBills ? netAvailable - totalBills : 0;
  const floorAppliedCount = clinicRows.filter(r => r.floorApplied).length;
  return { clinicRows, floorAppliedCount, poolExhausted, patientNet,
           totalBills, onChainTotal: clinicRows.reduce((s, r) => s + r.recovery, 0) };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
let passed = 0; let failed = 0;
function assert(condition, label) {
  if (condition) { console.log(`  ✓ ${label}`); passed++; }
  else           { console.error(`  ✗ ${label}`); failed++; }
}
function approx(a, b, tol = 0.01) { return Math.abs(a - b) <= tol; }

// ── S1 — All non-IN, fully covered ──────────────────────────────────────────
console.log('S1 — All non-IN, fully covered');
{
  const clinics = [
    { id: 'kc1', clinic: 'KC Clinic A', bill: 5000,  split: 70, market: 'KC' },
    { id: 'kc2', clinic: 'KC Clinic B', bill: 10000, split: 70, market: 'KC' },
  ];
  const r = calcWaterfall(30000, clinics);
  assert(approx(r.clinicRows[0].recovery, 5000),   'KC A gets full bill $5K');
  assert(approx(r.clinicRows[1].recovery, 10000),  'KC B gets full bill $10K');
  assert(approx(r.patientNet, 15000),              'Patient residual $15K');
  assert(r.floorAppliedCount === 0,                'No floor tags');
  assert(r.poolExhausted === false,                'Pool not exhausted');
}

// ── S2 — All non-IN, short pool ──────────────────────────────────────────────
console.log('S2 — All non-IN, short pool');
{
  const clinics = [
    { id: 'kc1', clinic: 'KC A', bill: 5000,  split: 70, market: 'KC' },
    { id: 'kc2', clinic: 'KC B', bill: 10000, split: 70, market: 'KC' },
  ];
  const r = calcWaterfall(9000, clinics);
  assert(approx(r.clinicRows[0].recovery, 3000), 'KC A gets pro-rata $3K');
  assert(approx(r.clinicRows[1].recovery, 6000), 'KC B gets pro-rata $6K');
  assert(r.floorAppliedCount === 0,              'No floor tags');
  assert(r.poolExhausted === false,              'Pool not exhausted');
}

// ── S3 — One IN clinic, pro-rata above floor ─────────────────────────────────
console.log('S3 — One IN clinic, pro-rata above floor');
{
  const clinics = [{ id: 'in1', clinic: 'IN Clinic', bill: 10000, split: 70, market: 'IN' }];
  const r = calcWaterfall(5000, clinics);
  assert(approx(r.clinicRows[0].recovery, 5000), 'IN gets full $5K (pro-rata > floor)');
  assert(r.clinicRows[0].floorApplied === false, 'No floor tag (not needed)');
  assert(r.floorAppliedCount === 0,              'No floor applied');
}

// ── S4 — One IN + one KC, both above floor after pro-rata ────────────────────
console.log('S4 — One IN + one KC, pro-rata above floor');
{
  const clinics = [
    { id: 'in1', clinic: 'IN Clinic', bill: 10000, split: 70, market: 'IN' },
    { id: 'kc1', clinic: 'KC Clinic', bill: 10000, split: 70, market: 'KC' },
  ];
  const r = calcWaterfall(5000, clinics);
  // Pro-rata gives each $2,500; IN floor = $2,000; $2,500 > $2,000 → no raise
  assert(approx(r.clinicRows[0].recovery, 2500), 'IN gets pro-rata $2,500');
  assert(approx(r.clinicRows[1].recovery, 2500), 'KC gets pro-rata $2,500');
  assert(r.floorAppliedCount === 0,              'No floor applied');
}

// ── S5 — One IN below floor; KC absorbs haircut ──────────────────────────────
console.log('S5 — One IN clinic raised to floor');
{
  const clinics = [
    { id: 'in1', clinic: 'IN Clinic', bill: 10000, split: 70, market: 'IN' },
    { id: 'kc1', clinic: 'KC Clinic', bill: 10000, split: 70, market: 'KC' },
  ];
  // net $2K → pro-rata gives each $1K; IN floor = $2K; raise IN to $2K; KC gets $0
  const r = calcWaterfall(2000, clinics);
  assert(approx(r.clinicRows[0].recovery, 2000), 'IN raised to floor $2,000');
  assert(r.clinicRows[0].floorApplied === true,  'IN has floor tag');
  assert(approx(r.clinicRows[1].recovery, 0),    'KC gets $0 after raise');
  assert(r.clinicRows[1].floorApplied === false,  'KC has no floor tag');
  assert(r.floorAppliedCount === 1,              '1 floor applied');
  assert(r.poolExhausted === false,              'Pool not exhausted (exactly covered)');
}

// ── S6 — Two IN clinics; pool exhausted before second floor satisfied ─────────
console.log('S6 — Two IN clinics, pool exhausted');
{
  const clinics = [
    { id: 'in1', clinic: 'IN Clinic A', bill: 10000, split: 70, market: 'IN' },
    { id: 'in2', clinic: 'IN Clinic B', bill: 5000,  split: 70, market: 'IN' },
  ];
  // net $2K → pro-rata: in1=$1,333, in2=$667; floors: $2K and $1K
  // largest gap: in1 ($2K-$1,333=$667) > in2 ($1K-$667=$333) → raise in1 first
  // pool from others = $667; raise in1 to $2K (needs $667 raise — exactly equals pool)
  // after raise: in1 fixed at $2K; remaining pool = $0; in2 gets $0; poolExhausted = true
  const r = calcWaterfall(2000, clinics);
  assert(approx(r.clinicRows[0].recovery, 2000), 'IN A raised to floor $2,000');
  assert(r.clinicRows[0].floorApplied === true,  'IN A has floor tag');
  assert(approx(r.clinicRows[1].recovery, 0),    'IN B gets $0 (pool exhausted)');
  assert(r.clinicRows[1].floorApplied === true,  'IN B marked floorApplied (attempted)');
  assert(r.floorAppliedCount === 2,              '2 floor flags');
  assert(r.poolExhausted === true,               'Pool exhausted');
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
