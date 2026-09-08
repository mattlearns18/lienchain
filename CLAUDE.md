# LienChain — Project Brief

This file is the orientation doc for any future Cowork or Claude Code session working on LienChain. Read it before touching code or planning new work.

## 1. Project Overview

**LienChain** is a platform that tokenizes personal-injury (PI) medical liens on the XRP Ledger (XRPL). PI clinics treat patients on a lien — they're paid out of the eventual settlement, sometimes 12–24 months later. That receivable is illiquid, hard to value, and impossible to trade. LienChain mints each lien as an MPT (Multi-Purpose Token) on XRPL with metadata embedded in the transaction memo (bill amount, purchase price, discount rate, clinic ID, maturity), then automates settlement waterfalls so the clinic and the funder/buyer (LienCo) get paid in the agreed split when the case settles.

**The user is Matt** — non-technical founder, 4+ years scaling PI clinics in Kansas City and St. Louis. He understands the receivables side of the business cold (clinics, attorneys, statutes, settlement mechanics). He does **not** write code. He works with Claude (the chat) to plan, hands the plan to Claude Code to execute, and leans on Cowork for infrastructure, files, and ops tasks. Explanations should be plain-language; jargon should be defined the first time it appears.

**Business vision:** become the standard-setting infrastructure layer for PI lien financing — start in KC/STL where Matt has clinic relationships, expand to TX/NV/IN where the lien-finance market is already active, and eventually open a secondary market where buyers bid on tokenized liens. Compliance and per-state statute handling are first-class concerns, not afterthoughts.

## 2. Tech Stack

- **Frontend:** React 19 + Vite, Tailwind CSS, react-router-dom v7
- **Blockchain:** xrpl.js 4.6 against XRPL **testnet** (mainnet not enabled yet)
- **Hosting:** Vercel (auto-deploy on push to `main`)
- **Repo:** [github.com/mattlearns18/lienchain](https://github.com/mattlearns18/lienchain)
- **Node CLI scripts** (CommonJS) live at the repo root for wallet setup, market funding, lien issuance, and settlement — these run locally against testnet and are separate from the deployed React app.

## 3. Project Structure

```
lienchain/
├── index.html                  Vite entry
├── vite.config.mjs             React + node polyfills (Buffer/global/process)
├── package.json
├── .env.example / .env.local   VITE_LIENCO_TESTNET_SEED — never commit
├── README.md                   Public-facing project doc
├── phase1-proof.md             Live testnet settlement proofs (TX/NV/IN)
├── wallets.json                Generated testnet wallets (gitignored in practice)
│
├── setup-wallets.js            Generates + funds LienCo and Clinic wallets
├── setup-markets.js            Funds the 6-wallet panel (LienCo + KC/STL/TX/NV/IN)
├── issue-lien.js               Mints a PILIEN MPT with hex-encoded JSON memo
├── settle-lien.js              Two-tx settlement: Attorney → LienCo → Clinic
├── settle-real.js              Multi-market settlement variant (takes market code arg)
│
└── src/
    ├── main.jsx                Router: /, /dashboard, /attorney/:caseId
    ├── App.jsx                 Landing page (hero, problem/solution, features)
    ├── Dashboard.jsx           Multi-market dashboard, 6-wallet panel, ledger
    ├── lib/
    │   ├── xrpl-tokenize.js    Client-side MPT issuance via WebSocket
    │   └── xrpl-data.js        Account/tx queries, memo decode, balance fetch
    ├── components/
    │   ├── IntakeWizard.jsx    4-step lien intake (Clinic → Case → Split → Tokenize)
    │   ├── ReductionModal.jsx  Reduction request modal (reason, context, attorney)
    │   └── AttorneyPreview.jsx Settlement modal w/ XRPL anim + split slider + flags
    └── pages/
        └── AttorneyPortal.jsx  Per-case attorney view with reduction handler
```

## 4. Key Architectural Decisions

**XRPL via client-side WebSocket, not HTTP.** Tokenization happens in the browser using `xrpl.js Client` over WebSocket. This was a deliberate choice to dodge CORS issues that block browser-side HTTP RPC calls to XRPL. The CLI scripts at the root use HTTP RPC because they run in Node.

**Signing seed lives in `VITE_LIENCO_TESTNET_SEED`.** This env var is loaded via `import.meta.env` in `src/lib/xrpl-tokenize.js`. If the var is absent the app falls back to a `DEMO_MODE` (no real txs). The seed is **testnet only** — do not paste a mainnet seed here, do not commit `.env.local`.

**Multi-market support with per-state compliance.** Four markets are open for new liens: **KC** (Missouri), **STL** (Missouri), **TX** (Texas), **NV** (Nevada). **IN** (Indiana) is **retired** (see §4 Indiana note) — it remains in `MARKET_INFO`/`MARKETS` for historical rendering but is excluded from `SELECTABLE_MARKETS`. Market metadata is centralized in `src/lib/markets.js` (`MARKETS` filter list + `MARKET_INFO` map + `SELECTABLE_MARKETS` = the active subset the intake wizard reads, derived from each market's `active` flag).

**Split range is 0–100% with guardrails.** The split is LienCo's share vs. clinic's share of the settlement. The intake wizard defaults to 70/30. `AttorneyPreview.jsx` flags any split where the LienCo share is **below 30%** or **above 85%** as unusual. State-specific rules layered on top:

- **Indiana — RETIRED as a go-forward market (2026-06-17).** Indiana is no longer selectable in the intake wizard — no new Indiana liens can be created. Existing/historical Indiana settlements stay viewable in the dashboard, and the 20% clinic-floor engine in `waterfall.js` is **retained but dormant** (no active market uses it) for easy re-add later. Re-activating Indiana is a one-field change: set `active: true` on `MARKET_INFO.IN` in `src/lib/markets.js`. The original rule, for reference: clinic must receive at least 20%, so LienCo share above 80% triggers a hard compliance warning; Indiana liens are also flagged **non-assignable**, which restricts secondary-market behavior.
- **Texas — 72-hour filing window.** A warning surfaces reminding the user that Texas requires the lien to be filed/recorded within 72 hours of assignment.
- **Missouri (KC/STL), Nevada — no special flags currently.** Add them as statutes are confirmed.

**Operator vs. attorney view separation.** Settlement math — gross settlement, attorney fee %, case costs, net available for liens, patient net recovery — belongs to the attorney. It must never surface in the operator-side tabs (Dashboard, Liens, Settlements, Compliance). The only place these figures appear in the operator app is the read-only "Attorney View" preview tab, which is explicitly framed as a preview of `/attorney/:caseId`. Keep this boundary tight; it's a compliance concern and a UX contract with clinics who shouldn't see client-side fee splits.

## 5. Working Conventions

Matt is non-technical. When explaining a change, walk through what it does and why before showing code. Avoid unexplained jargon — if "MPT" or "trust line" or "WebSocket" comes up, define it the first time in that session.

**Never break working things.** Phase 3 (real XRPL tokenization on the live site) is shipped and working. When adding features, preserve existing functionality. If a refactor is needed, call it out explicitly and confirm before doing it.

**Match existing patterns.** New modals should follow the structure of `ReductionModal.jsx` / `AttorneyPreview.jsx`. New compliance warnings should sit alongside the existing TX/IN flags. New routes follow the pattern in `main.jsx`. Tailwind class conventions follow what's already in `App.jsx` and `Dashboard.jsx`.

**The collaboration loop:** Matt + Claude (this chat) plan the feature → Claude Code executes the plan → Cowork handles infrastructure, file ops, and anything that touches the local machine outside the repo. Don't blur the lines — if a task is "write the code," that's a Claude Code job; if it's "set up the env var on Vercel" or "open this file," that's Cowork.

**Test locally, then push, then verify the deployment URL.** Vercel auto-deploys on push to `main`. After every push, confirm the live URL renders the expected change before declaring the task done.

## 6. Current State

**Phase 3, Phase 4, Phase 5, Phase 6, Phase 7, Phase 8, and Phase 9 are complete.** LienChain engineering is mainnet-ready behind the `VITE_NETWORK` feature flag.

*Phase 3* — real XRPL tokenization on the live site. Intake wizard mints a real testnet MPT, the dashboard reads it back, the attorney preview animates the 4-step settlement and flags compliance issues correctly across all five markets. `phase1-proof.md` documents the testnet settlement proofs (TX 72%, NV 65%, IN 70% LienCo splits) with verifiable XRPL Explorer links.

*Phase 4* — Settlement Waterfall in the attorney portal (`/attorney/:caseId`). Operator Dashboard restructured to 5 tabs — Dashboard, Liens, Settlements, Compliance, Attorney View — with a shared market filter chip row (All / KC / STL / TX / NV / IN). Wallet balance fetches migrated from HTTP JSON-RPC to WebSocket to fix a CORS-induced em-dash bug. Explorer URL fixed on the `/attorney/demo` success screen.

*Phase 5* — Multi-clinic cases with shared reductions. A single PI case now groups N clinic liens under a parent `Case` record. The intake wizard supports "Add clinic to existing case" with attorney + treatment fields inherited as read-only. The waterfall distributes net-available **pro-rata** across all clinics on a case (with a totals row + pro-rata note when net pool falls short of total bills). The Liens tab groups multi-clinic cases under expandable parent rows with weighted-avg split bars; market filters ungroup cases to show only the matching clinic when filtered to a single state. Reduction requests are stored at the case level and visible to every clinic on the case. Settlement execution runs one TX per clinic in sequence. State persists across reloads via localStorage; legacy single-clinic liens carried forward via a `caseId = lien.id` back-compat shim. Spec at `phase5-plan.md`.

*Phase 6* — Per-state lien priority rules. Three commits. (1) `MARKETS` / `MARKET_INFO` centralized into `src/lib/markets.js` as a single source of truth, with policy fields per state. (2) Indiana 20% clinic floor enforced in the settlement waterfall via `src/lib/waterfall.js` (`calcWaterfall`): pro-rata first, then any IN clinic where pro-rata fell below `bill × 0.20` is raised to floor, with the remaining pool re-distributed pro-rata across non-fixed clinics. Iterative — multiple IN clinics resolved largest-gap-first until convergence or pool exhaustion. Mixed cases protect only the IN clinics; non-IN absorb the haircut. Display: `FLOOR` tag on raised rows, conditional note below the table covering pure-pro-rata, floor-applied, and pool-exhausted cases. (3) Texas hospital lien priority warning banner on any case with ≥1 TX clinic — banner-only, math stays pro-rata for TX (real priority enforcement deferred pending attorney opinion letter). Spec at `phase6-plan.md`. Switch to handoff-file pattern (`.cowork-handoff.md` per commit) started this phase.

*Phase 7* — Portfolio analytics dashboard. Two commits. (1) Adds `lien.recovery` (LienCo dollar share, sourced from `calcWaterfall` output) and `lien.settledAt` (ISO timestamp) fields written at settlement; legacy/mock liens get derived defaults (`recovery = bill × split/100`, `settledAt = ts + 6mo`, `purchasePrice = bill × 0.78`) at the analytics read layer. Replaces the slim stats summary at the top of the Dashboard tab with a 6-tile KPI row: Total Deployed Capital, Total At-Risk Exposure, Recovery Rate (with ↑/↓ arrow), Avg Days to Settle, Active Cases, Settled Cases. (2) Adds the visual layer below the tiles: Exposure by Market (recharts stacked bar, Active+Settled per state), Recovery Rate Over Time (recharts line, monthly weighted average with "not enough data yet" empty-state), and Aging Buckets table (0–90, 91–180, 181–365, 365+ days for Active liens, with red-tint on 365+ when populated). Seed-mock bucketing fix landed in this commit so seeds correctly appear in Settled counts and chart segments. Spec at `phase7-plan.md`.

*Phase 8* — Attorney provisioning + invite flow. Two commits. (1) New `lienchain:attorneys` localStorage registry with Add/Edit/Delete on the Dashboard tab. New `case.attorneyAssignment` field (`{attorneyId, token, sentAt, acceptedAt}`). "Invite Attorney" button on Liens tab rows and Attorney View tab → modal with attorney picker, generates unique `crypto.randomUUID()` token, shows the URL (`https://lienchain.vercel.app/attorney/{caseId}?token={token}`), with Copy + Open Email (mailto: prefilled subject/body) + Resend + Reassign actions. (2) Token validation gate on direct `/attorney/:caseId` route visits — valid token writes `acceptedAt` and persists a session record to `lienchain:attorneySessions` so subsequent visits skip the URL token. Operator-side override: rendering inside the dashboard Attorney View tab skips the gate. Access Required page shown when token missing/invalid. Invited→Accepted badge flip on Liens rows. Bug fix: invite generation on legacy single-clinic cases (seed liens where `lien.id === caseId` but no record in `lienchain:cases`) now synthesizes a Case record via `ensureCaseRecord()` before writing the assignment. Spec at `phase8-plan.md`.

*Phase 9* — Mainnet readiness. Three commits plus a fix-up. (1) `src/lib/network.js` centralizes network config; `VITE_NETWORK=testnet|mainnet` flag with separate seeds (`VITE_LIENCO_TESTNET_SEED`, `VITE_LIENCO_MAINNET_SEED`), overridable WSS endpoints, per-network explorer URLs, loud TESTNET/MAINNET badge in dashboard + attorney portal headers (mainnet styled with red glow). (2) Fiat receipt confirmation gate — operator records attorney's wire/check arrival in LienCo's bank account (amount + date + reference + initials) via Mark Fiat Received modal; Settle Now disabled until receipt confirmed; `case.fiatReceipt` field; operator-only (hidden in attorney views per §4 separation rule). (3) Real on-chain `Payment` transactions per clinic via `src/lib/settle-onchain.js` (`executeSettlementPayment`) — replaces the mock hashes that Phase 5 produced; clinic `destinationAddress` field seeded from `wallets.json`; partial-failure recovery with new `Partial Settlement` case status (amber badge); per-clinic Retry Payout button. Plus `MAINNET-READINESS.md` pre-flight checklist at repo root covering the §7 business gaps + technical readiness items. Fix-up commit `12340fd` added the missing `meta.TransactionResult === 'tesSUCCESS'` enforcement (critical — earlier any `tec*` failure was silently treated as success) and the dollars→XRP unit scaling (1000:1 so testnet payments fit in 100-XRP faucet wallets); also wired `lien.recovery` to the LienCo share and fixed the success-modal counter regression. Final QA verified two real testnet Payment transactions with `tesSUCCESS` and confirmed actual wallet balance movement (LienCo dropped 3.6 XRP, STL +2.1 XRP, KC +1.5 XRP). Spec at `phase9-plan.md`.

*Backtest hardening (2026-06-17)* — Extended the 100-attorney / 50-LienCo backtest (`backtest.mjs`) beyond the waterfall math to the real money path, and fixed three issues. (1) **Retry money bug (fixed):** `handleRetryClinic` re-sent `bill × (1 − split/100)` (face value), overpaying the clinic on any shortfall settlement — the backtest measured 860/1,242 liens affected, ~$4.7M total overpayment in the synthetic portfolio. Fix persists the waterfall's per-clinic `clinicAmt`/`lienCoAmt` on a failed clinic as `pendingPayout`/`pendingRecovery`; the retry re-sends the stored amount (legacy fallback preserved). This resolves the Phase-9 `TODO(phase10)` retry gap. (2) **Money conversion extracted** to `src/lib/money.js` (`dollarsToTestnetDrops`, pure, verified byte-identical to the old inline `xrpToDrops` path across 20k values); `settle-onchain.js` and the backtest both import it. (3) **`waterfall.test.js` now imports the real `waterfall.js`** instead of an inlined copy (27/27 pass). New backtest invariants: retry conservation (R1/R2), on-chain scaling (D1/D2), split-guardrail (effective LienCo % == split, E1), plus an operational testnet-wallet-drain flag. `OVERALL: ✓ PASS`. Report at `backtest-report.md`.

*Indiana retired as a go-forward market (2026-06-17)* — Per Matt's decision, Indiana is removed as an active market: not selectable in the intake wizard (`SELECTABLE_MARKETS` in `src/lib/markets.js` excludes it via `active:false`), and dropped from the landing-page marketing copy (`App.jsx`). Existing/historical Indiana settlements remain viewable and filterable in the dashboard (`MARKET_INFO.IN` / `MARKETS` keep IN), and the 20% clinic-floor engine in `waterfall.js` is retained but dormant. The backtest portfolio now generates only KC/STL/TX/NV (`MARKET_WEIGHTS`), while the IN floor edge battery (E3–E6, E12) and unit tests (S3–S6) are kept so the dormant engine stays covered. Re-activating Indiana = set `active:true` on `MARKET_INFO.IN`. Backtest still `OVERALL: ✓ PASS` (0 IN liens generated, all IN edge/engine tests green).

**Build engineering complete.** No queued next phase. Mainnet flip itself (`VITE_NETWORK=mainnet` in Vercel env) is gated by §7 business gaps (LLC, bank, E&O, opinion letter) and Matt's go-decision per the `MAINNET-READINESS.md` checklist. Two known cosmetic items deferred to a Phase 10 polish pass: (a) success-modal final state reads "0 TXs on XRPL" instead of the actual successful count even though the in-flight animation displays it correctly; (b) fiat receipt modal prefill shows gross instead of `netAvailable` on initial load before any gross-input interaction (works correctly once gross is touched).

## 7. Business Gaps Still Open

These are non-code blockers Matt is working through in parallel — they don't affect the build directly but they gate going to mainnet and accepting real money:

- ✅ **LLC formation — CLOSED (2026-09-08).** Entity is stood up.
- ✅ **Business bank account — CLOSED (2026-09-08).** Open and operating.
- **E&O insurance** — errors & omissions coverage for the platform. Still open.
- **Healthcare lien attorney opinion letter** — in progress; Matt is driving. Formal legal opinion that the LienChain assignment structure is enforceable in each target state. Engagement packet drafted at `attorney-opinion-packet.md` (MO/TX/NV enforceability, securities memo, HIPAA). Indiana's non-assignability question is no longer urgent now that IN is retired as a go-forward market, but it returns if IN is ever re-activated.

When any of these close, update this section.

**Vendor diligence — Crossmint: REJECTED (2026-09-08).** Evaluated for attorney KYC, clinic wallet provisioning, and stablecoin on/offramp. **Crossmint does not support XRPL** — its published supported-chains table (40+ chains: EVM, Solana, Stellar, Aptos, Sui, Flow, Hedera) has no XRP Ledger entry, not even a "contact sales" option. Adopting it would mean leaving XRPL mainnet or bridging. Replaced by an XRPL-native path — see below.

**Recommended path for the same three gaps (XRPL-native):**
- **Stablecoin →** RLUSD, Ripple's NYDFS-regulated USD stablecoin, issued **natively on XRPL** (not wrapped). ~$2.40B circulating (Sept 2026); XRPL holds ~46% of supply and passed Ethereum in June 2026; RLUSD is >90% of all XRPL stablecoin supply. This is the concrete answer to the `TODO(phase10)` mainnet currency item in `settle-onchain.js` / `money.js` — replaces the 1000:1 scaled testnet XRP with a real stablecoin Amount object.
- **Identity/KYC →** off-chain verification vendor (Persona / Sumsub / Veriff / Alloy class) to actually verify documents and run AML/sanctions, then attest the result on-ledger via **XRPL Credentials (XLS-70)** — identity documents stay off-ledger. Upgrades attorney provisioning from the Phase-8 email + `randomUUID()` access token to real identity verification.
- **Access gating →** **Permissioned Domains (XLS-80)** to define which credentials are required to hold or receive a lien. Directly supports the secondary-market vision and assignability restrictions.
- ✅ **Amendment status VERIFIED LIVE on XRPL mainnet (checked 2026-09-08):**
  - **Credentials (XLS-70)** — activated **2025-09-04, 03:51:21 UTC** via `EnableAmendment`, after the standard 80%+ validator supermajority held for two weeks.
  - **Permissioned Domains (XLS-80)** — activated **2026-02-04** (confirmed by RippleX directly).
  - **Permissioned DEX** — activated **2026-02-18**.
  - Both primitives this plan depends on are live today, so the identity/KYC and access-gating work is **buildable now** — not blocked on protocol changes.
  - *Verification caveat:* confirmed via multiple independent sources including RippleX's own announcements; ledger-level confirmation was not possible from the Cowork sandbox (XRPL endpoints are outside its network allowlist). To re-confirm firsthand, check `livenet.xrpl.org/network/amendments` or run the `feature` command against a mainnet node.
- ⚠️ **Still to verify before the mainnet flip: `MPTokensV1` amendment status.** §1 describes liens as MPTs (Multi-Purpose Tokens) while `App.jsx` marketing copy says `NFTokenMint` — reconcile which primitive is actually minted, then confirm that amendment is enabled on mainnet. This is on the critical path to `VITE_NETWORK=mainnet` and is currently unverified.
