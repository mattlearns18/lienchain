# LienChain Settlement-Engine Backtest — Report

**Date:** 2026-06-17
**Scope:** Re-run the 100-attorney / 50-LienCo backtest, extend it beyond the waterfall math to the real money path, fix anything broken, and flag decisions that need your sign-off.
**Result:** ✅ **PASS** — every financial, retry, scaling, and guardrail invariant held across all 602 cases / 1,242 clinic-liens. One real money bug was found and fixed (settlement retries). Two maintainability defects were fixed. Operational items for your decision are listed at the end.

> **Update (2026-06-17, later same day):** Indiana was subsequently **retired as a go-forward market** — no new Indiana liens can be created (it's removed from the intake wizard and landing-page copy), though historical Indiana settlements remain viewable in the dashboard. The synthetic backtest **portfolio** now generates only KC/STL/TX/NV (so the per-market table below showing Indiana liens reflects the *earlier* run). The Indiana 20% clinic-floor engine is **retained but dormant** in `waterfall.js`, and its dedicated edge cases (E3–E6, E12) and unit tests (S3–S6) are **kept**, so that engine stays fully tested for an easy future re-add. The backtest still reports `OVERALL: ✓ PASS`, and the retry-bug findings below are unchanged ($4.71M would-be overpayment, 406 partial cases). The decision in §5.1 about an unmet Indiana floor is therefore **moot for now** — re-opens only if Indiana is re-activated.

---

## 1. What "backtest" means here

I built a simulated portfolio and ran every case through the **actual shipped code** — not a re-creation of it. The harness copies the live files at runtime and imports them, so the numbers describe the real engine that runs on the site:

- `src/lib/waterfall.js` — the settlement distribution math
- `src/lib/money.js` — the on-chain dollar→XRP amount conversion (new this pass, see §3)

**Synthetic portfolio (fixed seed, reproducible):**

- **100 attorneys**, each running 4–8 cases — **602 cases total**
- **50 lien companies** with deliberately varied split policies: conservative (55–65%), standard (70%), aggressive (78–85%), and a few intentionally out-of-bounds (28%, 88%, 90%) to stress the guardrails
- **1,242 clinic-liens** across all five live markets (KC, STL, TX, NV, IN)
- Every settlement regime forced into the mix: full recovery, partial shortfall, severe shortfall, break-even, and net-negative (settlement doesn't even cover the attorney fee)

This is a **test of the logic, not a financial forecast.** Dollar figures are randomized to exercise the code, so the recovery percentages are about code coverage, not real-world expected returns.

## 2. Headline results

| Check | Result |
|---|---|
| Cases run | 602 (1,242 clinic-liens) |
| **Financial invariant failures** | **0** |
| **Retry-amount invariants** | **0 failures** |
| **On-chain scaling invariants** | **0 failures** |
| **Split-guardrail invariants** | **0 failures** |
| Money divergence between the two settlement engines | **0** |
| Waterfall edge-case battery | **13 / 13 pass** |
| On-chain scaling edge-case battery | **8 / 8 pass** |
| Unit test (`waterfall.test.js`) against the real engine | **27 / 27 pass** |

Across all 1,242 liens the engine never once created or destroyed money, paid a clinic more than its bill, produced a negative payout, broke the LienCo/clinic split, or handed the patient a residual before all bills were covered.

## 3. Defects found and fixed this pass

### Fix A — Settlement **retry** was sending the wrong dollar amount (real money bug)

**What was wrong:** When a clinic's on-chain payout fails (network blip, wallet funding, etc.), the case is marked "Partial Settlement" and you get a **Retry Payout** button. The retry computed the amount as `bill × (1 − split%)` — the clinic's share of its **full face-value bill**. But on a *shortfall* settlement (the common case — **406 of 602** here), the clinic was only ever owed its **pro-rata** share, which is smaller. So a retry would **pay the clinic more than the settlement actually allocated**.

The *initial* settlement run was always correct — it reads the pro-rata `clinicAmt` straight from the waterfall. Only the retry path re-approximated. (This was the `TODO(phase10)` noted in `CLAUDE.md`; the backtest confirmed it's a live money-correctness issue, not just cosmetic.)

**How big:** Across the portfolio, **860 of 1,242 clinic-liens** would have been retried at the wrong amount, for **~$4.7M in total overpayment** (largest single overpayment **$31,783**). The retry never *underpays* — it only ever overpays, because pro-rata is always ≤ face value.

**The fix:** At settlement time, each clinic's exact computed payout and recovery are now **persisted on the lien** (`pendingPayout` / `pendingRecovery`). The Retry button re-sends **that stored amount**, so a retry is now identical to what the original settlement intended. Legacy data with no stored amount falls back to the old approximation, so nothing breaks for pre-existing records. The backtest now proves that re-sending every clinic's stored payout **reconstructs the settled distribution exactly** (invariants R1/R2).

*Files: `src/components/AttorneyPreview.jsx` (passes payouts through), `src/Dashboard.jsx` (stores them, retry reads them).*

### Fix B — The on-chain money conversion now has one tested copy

**What was wrong:** The dollar→drops scaling lived **inline inside `settle-onchain.js`** and couldn't be tested in isolation (importing it drags in the whole XRPL WebSocket client). Untestable money math is exactly what a backtest should be able to check.

**The fix:** Extracted it to `src/lib/money.js` as a pure function (`dollarsToTestnetDrops`). `settle-onchain.js` now imports it, and the backtest imports the **same** function — so the tested bytes are the shipped bytes. Before switching, I verified the new function is **byte-identical** to the old `xrpToDrops` path across a 20,000-value sweep (zeros, sub-penny, cents, up to $45k) — **0 mismatches**. On-chain behavior is unchanged.

### Fix C — The unit test was testing a *copy*, not the real engine

**What was wrong:** `waterfall.test.js` had its own **pasted copy** of the waterfall algorithm inlined. A passing test proved the *copy* was correct, not the shipped `waterfall.js` — the same "two copies drift apart" trap the last pass fixed in AttorneyPreview.

**The fix:** The test now imports the real `src/lib/waterfall.js` (via the same copy-to-temp-module trick the backtest uses). All 27 assertions still pass — but now against the actual shipped code.

## 4. Verification done

- ✅ Full backtest re-run after the fixes — **0 invariant failures** across financial, retry, scaling, and guardrail checks; **13/13** waterfall edges; **8/8** scaling edges
- ✅ `waterfall.test.js` (now importing the real engine) — **27 assertions, all pass**
- ✅ All four edited source files parse cleanly (validated with esbuild — zero syntax errors)
- ✅ `money.js` verified byte-identical to the previous on-chain conversion (20k-value sweep, 0 mismatches)

> Note: a full `vite build` still can't run **in this sandbox** (the Linux box lacks a native build binary that exists on your Mac / Vercel). This is an environment quirk, not a code problem. **Confirm the live Vercel deploy renders before calling this done**, per the project's own rule.

## 5. Decisions / improvements for your sign-off

These are **not bugs** — the code handles each gracefully today — but the *business rule* is yours to set. (Indiana entity/assignability is intentionally **out of scope** here per your note — it's a later business decision.)

1. **Split guardrail — warn vs. block.** The 30–85% band is still **warning-only**; nothing stops an out-of-bounds split from being saved. With the aggressive test LienCos in the mix, ~20% of liens tripped the warning and **26 Indiana liens exceeded the 80% line**. Should any split be **hard-blocked** or require a second approval, rather than just warned? (The % is inflated by the deliberately-extreme test LienCos, but the question stands.)

2. **Testnet wallet funding for big multi-clinic cases.** Each LienCo wallet is funded with ~100 XRP on testnet, and the whole case pays out from that one wallet in sequence. The worst case in this run drew **88 XRP in a single settlement** — under the cap, but close. A 4-clinic high-dollar case **would** exceed it and throw a real "Partial Settlement" for a funding reason, not a logic one. Options: top up the testnet wallets, or batch/space the payouts. (Goes away on mainnet with a real funded account — re-flagging as a testnet ops item.)

3. **Texas hospital-lien priority.** Still warning-only; the math is pure pro-rata. If a hospital lien exists on a Texas case, true priority is *not* enforced. Gated on your healthcare-lien attorney opinion letter (`CLAUDE.md` §7). Flagging that the backtest confirms TX currently gets pro-rata, no priority.

4. **Net-zero / net-negative settlements (7 cases).** When the settlement doesn't cover the attorney fee + costs, every clinic correctly gets $0. The code is fine; the **business process** (write the case off? renegotiate the lien?) is undefined.

5. **Mainnet money format.** On-chain payments use a testnet 1000:1 XRP scaling (now isolated in `money.js` with a loud "do not use on mainnet" note). Mainnet must switch to a real stablecoin amount per `MAINNET-READINESS.md`. Already on your radar — re-flagging because it's the one money-handling item the backtest can't validate on testnet.

## 6. How to re-run this anytime

```bash
node backtest.mjs                       # full portfolio + all invariant batteries
node src/lib/__tests__/waterfall.test.js  # the 6 Phase-6 scenarios, real engine
```

Both regenerate deterministically (fixed seed). Re-run after any change to the waterfall, the floor rules, the retry path, or the on-chain money conversion. If the bottom line says anything other than `OVERALL: ✓ PASS`, something regressed.

---

*Files changed this pass: `src/components/AttorneyPreview.jsx`, `src/Dashboard.jsx`, `src/lib/settle-onchain.js`, `src/lib/__tests__/waterfall.test.js`, `backtest.mjs`. Added: `src/lib/money.js`. No change to `waterfall.js`, the dashboards' UI, or any working Phase 3–9 behavior.*
