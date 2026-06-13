# LienChain Settlement-Engine Backtest — Report

**Date:** 2026-06-13
**Scope:** Stress-test the settlement waterfall + per-state compliance engine at scale, fix anything broken, and flag decisions that need your sign-off.
**Result:** ✅ **PASS** — core settlement math is sound. Two real defects were found and fixed. Six business/policy decisions are surfaced for you below.

---

## 1. What "backtest" means here

I built a simulated portfolio and ran every case through the **actual shipped settlement code** (`src/lib/waterfall.js`), not a re-creation of it. The harness copies the live file at runtime and imports it, so the numbers below describe the real engine that runs on the site.

**Synthetic portfolio:**

- **100 attorneys**, each running 4–8 cases (602 cases total)
- **50 lien companies (LienCos)** with deliberately varied split policies — conservative (55–65%), standard (70%), aggressive (78–85%), and a few intentionally out-of-bounds (28%, 88%, 90%) to test the guardrails
- **1,242 clinic-liens** spread across all five live markets (KC, STL, TX, NV, IN)
- Every settlement scenario forced into the mix: full recovery, partial shortfall, severe shortfall, break-even, and net-negative (settlement doesn't even cover the attorney's fee)

This is a **test of the logic, not a financial forecast.** The dollar figures are randomized to exercise the code, so the recovery percentages below are about code coverage, not real-world expected returns.

## 2. Headline results

| Check | Result |
|---|---|
| Cases run | 602 (1,242 clinic-liens) |
| **Financial invariant failures** | **0** |
| Money divergence between the two settlement engines | **0** |
| Edge-case battery (13 hand-built tricky cases) | **13 / 13 pass** |
| Indiana floor raised | 27 cases |
| Pool exhausted (floor couldn't be fully met) | 13 cases |
| Net-zero / net-negative settlements | 7 cases (handled cleanly) |

Across all 1,242 liens the engine never once: created or destroyed money, paid a clinic more than its bill, produced a negative payout, broke the LienCo/clinic split, or handed the patient a residual before all bills were covered. The Indiana 20% floor held in every case where the settlement pool was large enough to satisfy it.

**Per-market coverage**

| Market | Clinic-liens | Floor raises |
|---|---|---|
| KC | 382 | 0 (no floor rule) |
| STL | 356 | 0 (no floor rule) |
| TX | 245 | 0 (warning-only) |
| NV | 140 | 0 (no floor rule) |
| IN | 119 | 38 |

## 3. Defects found and fixed

### Fix A — Two different settlement engines that could disagree (now unified)

**What was wrong:** The settlement math existed in **two separate copies**. The real attorney portal (`/attorney/:caseId`) used the official engine in `src/lib/waterfall.js`. But the operator-side **"Attorney View" preview** had its own private copy of the same algorithm pasted inside `AttorneyPreview.jsx`. The two had drifted apart: in cases with **two or more Indiana clinics where the settlement pool runs out**, they tagged a *different number of clinics* with the "FLOOR" compliance marker. Same money, but the operator's preview and the attorney's real page would show a different compliance picture for the same case. The backtest caught this in **5 of the 602 cases**.

**Why it matters:** Phase 6 made `waterfall.js` the "single source of truth" on purpose. A second hidden copy is exactly the kind of thing that silently rots — the next time someone fixes a rule in one place, the other keeps the old behavior, and the operator and attorney views quietly disagree on a compliance flag.

**The fix:** `AttorneyPreview.jsx` no longer carries its own engine. It now calls the canonical `calcWaterfall`, with a thin wrapper that just adds the attorney-fee math and the field names its sub-components expect. ~110 lines of duplicated logic deleted. After the fix, the divergence is **0 of 602** — and structurally it can never come back, because there's only one engine now.

### Fix B — A $0 clinic payout would fail and falsely mark a case "Partially Settled"

**What was wrong:** When a clinic's share legitimately comes out to **$0** — which happens when an Indiana floor raise drains the pool and zeroes out another clinic, or when a LienCo's split is 100% — the settlement code still tried to send that clinic a real on-chain payment. A zero-value payment is rejected by the XRP Ledger, the "failure" was recorded, and the **whole case got flagged "Partial Settlement"** even though there was genuinely nothing to pay. The backtest found **19 clinic-liens** in this state.

**The fix:** `settle-onchain.js` now recognizes a $0 (or economically-zero) share and treats it as a **successful no-op** — the clinic that's owed nothing is correctly counted as settled, and the case completes normally instead of being dragged into "Partial." I verified this against the real XRP-Ledger amount conversion: $0, negative, and sub-penny amounts all skip cleanly, while every real cent-level amount still converts and sends correctly.

## 4. Verification done

- ✅ Existing unit test (`waterfall.test.js`, the 6 Phase-6 scenarios) — **27 assertions, all pass** (the canonical engine was not modified)
- ✅ Both edited files compile cleanly (validated with esbuild — zero syntax errors)
- ✅ Full backtest re-run after the fixes — **0 invariant failures, 0 engine divergence, 13/13 edge cases**
- ✅ The $0-payout guard verified directly against XRPL's real amount conversion

> Note: a full `vite build` could not run **in this sandbox** because the Linux box is missing a native build binary that only exists on your Mac / Vercel (`@rolldown/binding-linux-arm64-gnu`). This is an environment quirk, not a code problem — the files compile fine, and Vercel will build them on push. **Confirm the live Vercel deploy renders before calling this done**, per the project's own rule.

## 5. Decisions that need your approval

These are **not bugs** — they're business/policy gaps the backtest exposed. The code handles each gracefully today, but the *rule* for what should happen is yours to set.

1. **Indiana floor that can't be met (13 of 602 cases).** When a settlement is so small the pool can't give every Indiana clinic its 20% statutory minimum, the engine correctly flags "pool exhausted" — but there's no defined business action. Options: block the settlement, require explicit attorney sign-off, or have LienCo absorb the gap to fund the floor. **What should happen here?**

2. **Cross-clinic haircut fairness.** On a mixed case (e.g. one Indiana clinic + one Kansas City clinic) with a short pool, the KC clinic can be **zeroed out entirely** to fund the Indiana clinic's floor. That's faithful to the spec, but it's a real relationship question with your clinics. **Is "non-IN clinics absorb the whole haircut" the intended rule?**

3. **Texas hospital-lien priority.** Still warning-only — the math is pure pro-rata. If a hospital lien exists on a Texas case, true priority is *not* enforced. This is already gated on your healthcare-lien attorney opinion letter (CLAUDE.md §7). Flagging that the backtest confirms TX currently gets pro-rata, no priority.

4. **Split guardrail — warn vs. block.** The 30–85% band (and the Indiana ">80% violates the floor" rule) currently only shows a **warning**; nothing stops an out-of-bounds split from being saved. With aggressive LienCo policies in the mix, ~20% of test liens tripped the warning. **Should any split be hard-blocked or require a second approval, rather than just warned?** (This % is inflated by the intentionally-extreme test LienCos, but the question stands.)

5. **Net-zero / net-negative settlements (7 cases).** When the settlement doesn't cover the attorney's fee + costs, every clinic correctly gets $0. The code is fine; the **business process** (write the case off? renegotiate the lien? something else?) is undefined.

6. **Mainnet money format.** Today's on-chain payments use a testnet 1000:1 XRP scaling. Mainnet must switch to a real stablecoin amount (per the existing `TODO(phase10)` and `MAINNET-READINESS.md`). Already on your radar — re-flagging because it's the one money-handling item the backtest can't validate on testnet.

## 6. How to re-run this anytime

The harness is committed at the repo root:

```bash
node backtest.mjs
```

It regenerates the same portfolio (fixed random seed = reproducible), runs every invariant, and writes full results to `backtest-results.json`. Re-run it after any future change to the waterfall, the floor rules, or the settlement path — if the bottom line says anything other than `OVERALL: ✓ PASS`, something regressed.

---

*Files changed in this pass: `src/components/AttorneyPreview.jsx` (engine unified), `src/lib/settle-onchain.js` ($0-payout guard). Added: `backtest.mjs`, `backtest-report.md`. No change to `waterfall.js`, the dashboards, or any working Phase 3–12 behavior.*
