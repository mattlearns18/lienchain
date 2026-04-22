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

**Multi-market support with per-state compliance.** Five markets are live: **KC** (Missouri), **STL** (Missouri), **TX** (Texas), **NV** (Nevada), **IN** (Indiana). Market metadata is currently hardcoded in `Dashboard.jsx` and `IntakeWizard.jsx` (a `MARKETS` array + `MARKET_INFO` map). There is no centralized config file yet — that's a known refactor target.

**Split range is 0–100% with guardrails.** The split is LienCo's share vs. clinic's share of the settlement. The intake wizard defaults to 70/30. `AttorneyPreview.jsx` flags any split where the LienCo share is **below 30%** or **above 85%** as unusual. State-specific rules layered on top:

- **Indiana — 20% clinic floor.** Clinic must receive at least 20%, so LienCo share above 80% triggers a hard compliance warning. Indiana liens are also flagged **non-assignable**, which restricts secondary-market behavior.
- **Texas — 72-hour filing window.** A warning surfaces reminding the user that Texas requires the lien to be filed/recorded within 72 hours of assignment.
- **Missouri (KC/STL), Nevada — no special flags currently.** Add them as statutes are confirmed.

## 5. Working Conventions

Matt is non-technical. When explaining a change, walk through what it does and why before showing code. Avoid unexplained jargon — if "MPT" or "trust line" or "WebSocket" comes up, define it the first time in that session.

**Never break working things.** Phase 3 (real XRPL tokenization on the live site) is shipped and working. When adding features, preserve existing functionality. If a refactor is needed, call it out explicitly and confirm before doing it.

**Match existing patterns.** New modals should follow the structure of `ReductionModal.jsx` / `AttorneyPreview.jsx`. New compliance warnings should sit alongside the existing TX/IN flags. New routes follow the pattern in `main.jsx`. Tailwind class conventions follow what's already in `App.jsx` and `Dashboard.jsx`.

**The collaboration loop:** Matt + Claude (this chat) plan the feature → Claude Code executes the plan → Cowork handles infrastructure, file ops, and anything that touches the local machine outside the repo. Don't blur the lines — if a task is "write the code," that's a Claude Code job; if it's "set up the env var on Vercel" or "open this file," that's Cowork.

**Test locally, then push, then verify the deployment URL.** Vercel auto-deploys on push to `main`. After every push, confirm the live URL renders the expected change before declaring the task done.

## 6. Current State

**Phase 3 is complete.** Real XRPL tokenization is working on the live site — intake wizard mints a real testnet MPT, the dashboard reads it back, the attorney preview animates the settlement and flags compliance issues correctly across all five markets. `phase1-proof.md` documents the testnet settlement proofs (TX 72%, NV 65%, IN 70% LienCo splits) with verifiable XRPL Explorer links.

**Next queued build: Settlement Waterfall for the attorney portal.** The attorney needs a view that takes a gross settlement number and walks down through liens (medical, subrogation, attorney fees, client net) in the right priority order, applying the agreed splits and any reductions, and produces a clear breakdown of who gets paid what. This builds on `AttorneyPortal.jsx` and the existing `AttorneyPreview` modal.

## 7. Business Gaps Still Open

These are non-code blockers Matt is working through in parallel — they don't affect the build directly but they gate going to mainnet and accepting real money:

- **LLC formation** — entity not yet stood up.
- **Business bank account** — pending LLC.
- **E&O insurance** — errors & omissions coverage for the platform.
- **Healthcare lien attorney opinion letter** — formal legal opinion that the LienChain assignment structure is enforceable in each target state, especially Indiana given the non-assignability concern.

When any of these close, update this section.
