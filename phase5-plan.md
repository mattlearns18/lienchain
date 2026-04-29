# Phase 5 Plan — Multi-Clinic Cases with Shared Reductions

This is the implementation spec for Phase 5. Hand it to Claude Code as the source of truth.

## Goal

A single PI case can have multiple clinic liens. When the case settles, the net-available pool distributes **pro-rata** across all clinic liens, with each clinic's own LienCo/clinic split applied. Reduction requests are stored at the case level and visible to every clinic on the case for transparency. Each clinic decides its own reduction; no consent from other clinics is required.

## Data Model

Introduce a `Case` concept that groups N clinic liens. Existing single-clinic liens stay backward compatible via a default `caseId = lien.id`.

### Case

- `caseId` — string, e.g. `PI-CASE-2026-04-001`
- `attorney` — firm name + bar number (one active attorney per case; switching overwrites the field)
- `treatmentMonth`, `treatmentYear`
- `clinicLienIds` — array of lien IDs belonging to this case
- `markets` — derived; a case appears under any market filter where ≥1 of its clinics belongs
- `status` — `Active` | `Settled` (rolled up from clinic liens)

### ClinicLien (existing `lien` object + one new field)

- All existing fields preserved: `id`, `bill`, `split`, `clinic`, `market`, `purchasePrice`, `reductionNote`, MPT tx hash, etc.
- **New:** `caseId` — links to parent case. For legacy single-clinic liens, set `caseId = lien.id` on read so the new code paths work transparently.

### ReductionRequest

- `id`
- `caseId`, `clinicLienId`, `clinicName`
- `originalAmount`, `proposedAmount`
- `reason` (existing dropdown values)
- `context` (free text, optional)
- `submittedBy` (clinic / attorney name)
- `submittedAt` (ISO timestamp)
- `status` — `open` | `accepted` | `declined` (set when case settles or clinic withdraws)

### Storage

React state + `localStorage` persistence for `cases` and `reductionRequests`. Per-clinic MPTs continue minting on XRPL exactly as today — the case wrapper and reduction requests are off-chain UI workflow state. (Phase 6+ candidate: stamp case-level events on-chain via memo.)

## Intake Wizard Changes

Step 1 (Clinic & Market) gets a new top-of-form choice:

- **New case** — unchanged 4-step flow. Generates a new `caseId` and mints the first clinic lien on XRPL with the `caseId` embedded in the MPT memo.
- **Add clinic to existing case** — dropdown of open cases. When selected, Step 2 (Case Details) hides case-level fields (attorney, treatment month — already known from the case). Wizard only collects the new clinic's bill and split. Submission mints another MPT with the same `caseId` in the memo.

Success screen adds a button: **"+ Add another clinic to this case"** alongside Done. Clicking it relaunches the wizard prefilled with the case context.

## Settlement Waterfall (AttorneyPortal)

Inputs (attorney enters): gross settlement, attorney fee %, case costs. Same as today.

Computation, generalized for N clinics:

- `netAvailable = gross − fee − costs` (unchanged)
- `totalBills = sum of clinic.bill across all clinics on case`
- **If `netAvailable >= totalBills`:** each clinic recovers full bill amount; residual `netAvailable − totalBills` goes to patient.
- **If `netAvailable < totalBills`:** pro-rata distribution. Each clinic's recovery = `(clinic.bill / totalBills) × netAvailable`. No patient residual — bills consume the pool.
- For each clinic: apply that clinic's LienCo/clinic split to its recovery to produce `lienCoShare` and `clinicShare`.

Display: a per-clinic table with columns — `Clinic | Bill | Recovery | LienCo % | LienCo $ | Clinic $` — plus a totals row. The existing top-level breakdown (gross, fee, costs, net available, patient net) stays.

Note in code where the pro-rata branch lives: `// Phase 5: pro-rata only. Per-state lien priority (TX hospital lien priority, IN 20% floor cascading, etc.) is a Phase 6+ refinement.`

## Reduction Visibility — Case-Wide Sharing

ReductionModal stays per-clinic at submission (a clinic only sees its own submit form). On submit, the request is appended to `case.reductionRequests`.

New **Case Reductions** panel renders on:

- `AttorneyPortal` (`/attorney/:caseId`) — at the bottom of the case view
- New **Case View** route accessible from the Liens tab → expand a case row → **Open Case →**

Each row: `Clinic Name — proposed $X (was $Y) — reason — Apr 23 — open`. View-only in Phase 5 (clinics decide alone, others see for awareness). Status flips to `accepted` automatically when the case settles, or to `declined` if the clinic withdraws via a "Withdraw request" link visible only to the submitting clinic.

## Liens Tab Grouping

Group rows by `caseId`. Display rules:

- **Single-clinic case** (legacy): renders as today — one row, no expand control.
- **Multi-clinic case** (N≥2): one parent row showing `caseId`, summed bills, markets present (e.g. `KC, STL`), aggregate split summary, rolled-up status. A chevron expands to show each clinic lien as a child row with its own TX hash and "Attorney View →" link.

Stats at the top of the Liens tab continue to roll up at the case level (one case counts once).

Market filter: a case appears under any market chip where ≥1 of its clinic liens matches.

## Settlement Execution (Multi-Clinic)

When the attorney clicks **Execute Settlement** on a multi-clinic case, `AttorneyPreview` animates one settlement TX *per clinic* with that clinic's per-split breakdown. Sequential, with a progress indicator showing `Settling clinic 2 of 3…`.

Success screen lists all N transaction hashes (each 64 chars, each explorer-linkable). Case is marked `Settled` only when every clinic TX has validated. Any failed clinic TX leaves the case in `Partial Settlement` state with a retry button on the failed clinic only.

## Out of Scope (Deferred to Phase 6+)

- Authentication / login. Demo mode continues; all clinic owners share the operator dashboard view.
- Email or SMS notifications on reductions.
- Attorney provisioning / invite flow.
- Per-state lien priority rules in shortfall scenarios (TX hospital lien priority, IN 20% floor cascading, etc.). Pro-rata is the only Phase 5 rule.
- Full attorney succession history on a case. Phase 5 just lets the field be overwritten.
- On-chain stamping of case-level events (case open / settled, reductions accepted).

## Suggested Commit Slicing

Five independently shippable commits. Each leaves the live site in a working state:

1. **`feat(phase5): introduce Case data model with backward compat`** — Add `caseId` to lien, scaffold `Case` and `ReductionRequest` types, localStorage persistence, back-compat shim (`caseId = lien.id` for legacy liens). No UI changes.
2. **`feat(phase5): intake wizard supports adding clinic to existing case`** — Step 1 toggle, dropdown of open cases, success-screen "Add another clinic" CTA.
3. **`feat(phase5): multi-clinic waterfall with pro-rata distribution`** — AttorneyPortal computation + display table.
4. **`feat(phase5): liens tab groups by case with expand/collapse`** — Parent/child rows, rollup stats, market filter behavior.
5. **`feat(phase5): case-wide reduction visibility`** — Case Reductions panel on AttorneyPortal and new Case View route. Multi-clinic settlement execution (sequential per-clinic TXs) ships in this commit too since both touch AttorneyPreview.

## Test Plan

After each commit, verify:

- **Commit 1:** Existing single-clinic liens still mint and display unchanged. New liens carry `caseId` in storage. localStorage survives page refresh.
- **Commit 2:** Create new case → standalone row. Create new case → "Add clinic to existing case" → both mint with shared `caseId`; both visible in Liens tab.
- **Commit 3:** Open multi-clinic case in `AttorneyPortal`. Enter $50K gross, 33% fee, $1K costs with three clinics ($8K / $12K / $5K bills, all 70/30 split). Verify $32.5K net distributes pro-rata; per-clinic table totals tie back to the breakdown. Repeat with $20K gross (short pool) — pro-rata haircut applies, no patient residual.
- **Commit 4:** Liens tab groups multi-clinic cases under one expandable row; single-clinic legacy liens display unchanged. Market chip filter behaves correctly when a case spans markets.
- **Commit 5:** Submit a reduction from clinic A's modal → request appears in Case Reductions panel visible from clinic B's view of the same case. Settle multi-clinic case → see N TX hashes on the success screen, each 64 hex chars, each opening a real testnet transaction in XRPL Explorer.

## Open Implementation Questions for Claude Code

1. **Case ID format.** Suggested: `PI-CASE-{YYYY}-{MM}-{NNN}` where NNN is a per-month sequence. Confirm or override at start.
2. **Cross-market case display.** When a case spans markets (e.g. KC clinic + STL clinic), what market label shows on the parent row? Suggested: comma-separated (`KC, STL`). Alternative: market of the first clinic added.
3. **Migration of legacy demo data.** The four seed liens in current testnet state (KC, TX, NV, IN) — leave as single-clinic legacy (no migration needed, back-compat shim handles them) vs. retroactively wrap each in a synthetic single-clinic Case. Suggested: leave as-is; back-compat shim is enough.

These three are reasonable defaults. Claude Code can proceed with the suggested answers unless Matt overrides.
