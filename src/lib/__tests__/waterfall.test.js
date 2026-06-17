/**
 * waterfall.test.js — Plain Node assertion script (no test runner needed).
 * Run with: node src/lib/__tests__/waterfall.test.js
 *
 * Covers all six scenarios from the Phase 6 Commit 2 handoff spec.
 * clinicFloorPct = 0.20 throughout.
 *
 * IMPORTANT: this test imports the ACTUAL shipped engine from src/lib/waterfall.js
 * (it no longer inlines a private copy). waterfall.js is pure ESM with no internal
 * imports, so — exactly like backtest.mjs — we copy it to a temp .mjs and dynamic-
 * import it, which works from this CommonJS file (package.json is type:commonjs).
 * Testing a re-pasted copy gives false confidence; this tests the real bytes.
 */

const { writeFileSync, copyFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const FLOOR_PCT = 0.20;

// ── Helpers ──────────────────────────────────────────────────────────────────
let passed = 0; let failed = 0;
function assert(condition, label) {
  if (condition) { console.log(`  ✓ ${label}`); passed++; }
  else           { console.error(`  ✗ ${label}`); failed++; }
}
function approx(a, b, tol = 0.01) { return Math.abs(a - b) <= tol; }

(async () => {
  // Load the SHIPPED calcWaterfall (copy → import keeps it faithful to live bytes).
  const tmpWf = join(tmpdir(), `waterfall.test.${Date.now()}.mjs`);
  copyFileSync(join(__dirname, "..", "waterfall.js"), tmpWf);
  const { calcWaterfall } = await import("file://" + tmpWf);

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

  // Clean up temp file (best-effort).
  try { writeFileSync(tmpWf, ""); } catch (_) {}

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
