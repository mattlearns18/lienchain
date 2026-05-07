# Phase 6 Plan — Per-State Lien Priority Rules

This is the implementation spec for Phase 6. Hand it to Claude Code as the source of truth. Commit-level handoffs land in `.cowork-handoff.md` one at a time.

## Goal

Make the settlement waterfall legally accurate per state instead of pure pro-rata everywhere. Two state rules in scope:

- **Indiana — 20% clinic floor enforced in the waterfall.** Any IN clinic on a case is guaranteed at least 20% of its bill amount. The floor is a hard guarantee, applied after pro-rata, with iterative re-distribution when multiple IN clinics need raising.
- **Texas — hospital lien priority warning.** Pure pro-rata math stays in place for now (priority enforcement deferred), but the UI surfaces a warning banner on any TX-tagged case so attorneys know to consult before settling. This closes the visible compliance gap without a math change.

Missouri (KC/STL) and Nevada keep pro-rata. The waterfall continues to default to pro-rata when no state-specific rule applies.

## Scope (Three Commits)

### Commit 1 — Per-state config refactor

Engineering hygiene that unblocks the math work.

**Why first:** Today `MARKETS` and `MARKET_INFO` are hardcoded inside `Dashboard.jsx` and `IntakeWizard.jsx`. Phase 6's math needs to read per-state policy fields (`clinicFloorPct`, `priorityWarning`). Centralizing the config makes the math implementation a single config lookup instead of a series of `if (clinic.market === 'IN')` branches.

**Create `src/lib/markets.js`:**

```js
// Single source of truth for market metadata + per-state policy.
export const MARKETS = ['All', 'KC', 'STL', 'TX', 'NV', 'IN'];

export const MARKET_INFO = {
  KC:  { state: 'Missouri', statute: 'RSMo §484.130',                policy: {} },
  STL: { state: 'Missouri', statute: 'RSMo §484.130',                policy: {} },
  TX:  { state: 'Texas',    statute: 'Tex. Health & Safety §55.005', policy: { priorityWarning: 'Texas hospital lien priority is not yet enforced in this waterfall. If a hospital lien exists on this case, consult with the attorney before settling. Under Tex. Health & Safety Code §55.005, hospital liens take priority over other medical provider liens.' } },
  NV:  { state: 'Nevada',   statute: 'NRS §108.590',                 policy: {} },
  IN:  { state: 'Indiana',  statute: 'Ind. Code §32-33-4-4',         policy: { clinicFloorPct: 0.20, nonAssignable: true } },
};
```

**Delete the duplicated constants from:**
- `src/Dashboard.jsx` (any `MARKETS` array, any `MARKET_INFO` map)
- `src/components/IntakeWizard.jsx` (same)
- Anywhere else the constants are duplicated

**Replace with imports:** `import { MARKETS, MARKET_INFO } from '../lib/markets'` (path adjusts per file location).

**No behavior change in this commit.** Live site renders identically. Smoke check is "everything still works."

### Commit 2 — IN 20% clinic floor enforced in the waterfall

The substantive math change.

**Where the math lives:** `src/pages/AttorneyPortal.jsx` (the case-level waterfall calculator that produces the per-clinic recovery table). Same function that today does `pro-rata if netAvailable < totalBills`.

**New algorithm — apply per case:**

```
1. Pro-rata distribute netAvailable across all clinics on the case.
   For each clinic: recovery = (clinic.bill / totalBills) × netAvailable

2. For each clinic where market === 'IN':
   floor = clinic.bill × MARKET_INFO.IN.policy.clinicFloorPct  (i.e. 0.20)
   If recovery < floor: gap = floor - recovery (positive)
   Else: gap = 0

3. Find the IN clinic with the largest positive gap. If none, done — current
   recoveries are final.

4. Raise that clinic's recovery to its floor:
   - If pool can cover the raise: raise to floor exactly, subtract (floor - recovery)
     from the pool that's pro-rata'd to the others.
   - If pool can't cover the raise: raise to whatever pool remains, others get $0,
     return.

5. Re-pro-rata the remaining pool across the OTHER clinics
   (the one we just raised is now "fixed" — its recovery doesn't change again).
   For each remaining clinic: recovery = (clinic.bill / sumRemainingBills) × poolRemaining

6. Goto step 2 with the remaining clinics. Iterate until either no IN clinic is
   below floor OR pool is exhausted.
```

**Algorithm notes:**

- Convergence: each iteration either raises one clinic to its floor (one fewer to consider) or exhausts the pool. Bounded by the count of IN clinics on the case. Worst case: N iterations for N IN clinics.
- Mixed cases: if a case has both IN and non-IN clinics, only IN clinics get floor protection. Non-IN clinics absorb the haircut when IN clinics get raised.
- Pure pro-rata still applies when no IN clinic is below floor (most common case in practice).
- Single-clinic IN cases: if one IN clinic alone, and bill > netAvailable, floor still kicks in at 20% × bill (pro-rata gives netAvailable, floor demands ≥20% × bill, so floor wins iff netAvailable < 20% × bill).

**Display changes in the per-clinic waterfall table:**

- Add a `[FLOOR APPLIED]` tag in the Recovery column for any clinic raised to floor.
- Replace the existing pro-rata note with this conditional copy:
  - Pure pro-rata short pool, no floor triggered: existing `Pro-rata distribution applied — net pool insufficient to cover all bills in full.`
  - Floor triggered: `Pro-rata distribution applied with Indiana 20% clinic floor enforcement. {N} IN clinic(s) raised to floor; remaining net pool re-distributed pro-rata.`
  - Pool exhausted before all floors satisfied: append `Pool exhausted — some clinics receive less than statutory floor.`

### Commit 3 — TX hospital lien priority warning banner

**Where:** `src/pages/AttorneyPortal.jsx`, above the SETTLEMENT WATERFALL section.

**When to show:** Any case with ≥1 clinic where `clinic.market === 'TX'`. Read the warning copy from `MARKET_INFO.TX.policy.priorityWarning`.

**Markup:** Match the existing yellow `TX 72h Flag` style — a banner with a warning icon, single paragraph of copy, no dismiss button (it's a permanent advisory for TX cases).

**No math change.** Pro-rata stays the rule for TX. The banner is the entire deliverable.

## Out of Scope (Deferred)

- Real TX hospital priority enforcement (math change). Defer until you have an attorney opinion letter that maps statute → algorithm precisely.
- Hospital flag on clinic data. Not needed for the warning-only approach.
- Other states' priority rules (MO, NV). Add when you confirm any.
- Reduction request impact on floor. If a clinic submits a reduction below 20%, the floor still applies — the clinic can't waive its statutory floor. Phase 6 doesn't surface this in the reduction modal; future cleanup if it becomes a real workflow issue.
- Floor enforcement at intake (the existing intake-step warning when LienCo share > 80% on IN markets stays as-is — that's a different gate).

## Test Plan

After each commit, verify on the live site (https://lienchain.vercel.app):

**Commit 1 (config refactor):** No visible change. All 5 markets still in filter chips, intake wizard market dropdown unchanged, waterfall math unchanged. Console clean. Existing localStorage state still loads.

**Commit 2 (IN floor):**
- **Pure pro-rata case (no IN clinic):** Use the existing `PI-CASE-CLEAN-` case (KC + STL). Set gross low so net < totalBills. Confirm pro-rata applies, no floor tag, existing pro-rata copy.
- **IN clinic where pro-rata exceeds floor:** Add an IN clinic ($10K bill) to a case where net is generous. Pro-rata gives it more than $2K (20%), so no floor needed. No `[FLOOR APPLIED]` tag, no floor copy.
- **IN clinic where pro-rata falls below floor:** Add an IN clinic ($10K bill) to a case where net is short. Pro-rata gives < $2K. Floor raises to $2K exactly. `[FLOOR APPLIED]` tag appears. Floor copy reads `1 IN clinic(s) raised to floor`. Other clinics' recoveries re-distributed pro-rata of remaining pool.
- **Multiple IN clinics, both below floor:** Two IN clinics on a case, net pool short enough that both fall below floor. Both raised. Verify iteration: first the larger-bill IN clinic gets raised, then re-pro-rata, then the second IN clinic gets raised if still below.
- **Pool exhaustion:** Net pool less than total IN floors. Confirm the "pool exhausted" message appears and remaining clinics show $0 recovery.

**Commit 3 (TX warning):**
- Open AttorneyPortal for any case with ≥1 TX clinic. Banner appears above SETTLEMENT WATERFALL with TX hospital priority warning copy.
- Open AttorneyPortal for a case with no TX clinic. No banner.
- Mixed case with TX + non-TX clinics. Banner appears (any TX clinic triggers it).

## Suggested Commit Slicing

Three independently shippable commits, each landed via its own handoff:

1. `refactor(phase6): centralize per-state config in src/lib/markets.js` — Commit 1
2. `feat(phase6): enforce Indiana 20% clinic floor in settlement waterfall` — Commit 2
3. `feat(phase6): add Texas hospital lien priority warning banner` — Commit 3

## Open Implementation Questions for Claude Code

These have suggested defaults; Claude Code can proceed unless Matt overrides.

1. **Floor rounding.** `bill × 0.20` may produce a sub-cent value. Round floor up (`Math.ceil` to cents) so the clinic always gets at least the statutory minimum. Default: round up to nearest cent.
2. **Iteration order.** When multiple IN clinics are below floor, raise the largest-gap one first (most under-served goes first). Alternative: by clinic-add order. Default: largest-gap first.
3. **Mixed case display.** When non-IN clinics absorb the haircut from an IN floor raise, no special tag on them. Their pro-rata recovery just shows whatever the math produced. Default: no extra tag.
4. **Existing localStorage state.** No migration needed. The math runs on read; existing cases just get the new algorithm applied next time the waterfall renders.

## Handoff Pattern (Phase 6 onward)

Each commit gets its own `.cowork-handoff.md`. Cowork writes the handoff. Matt runs Claude Code with this prompt:

```
Read /Users/matthewsabine/lienchain/.cowork-handoff.md from this repo.
Execute the plan exactly as written — commit with the message in the file,
push to main, and append a brief status report to
/Users/matthewsabine/lienchain/.cowork-handoff-result.md when done.
Flag any deviation in the result file.
```

Cowork polls origin/main for the new commit + reads the result file, runs the smoke check on the live site, writes findings, and either ships the next handoff or hands back to Matt for review.
