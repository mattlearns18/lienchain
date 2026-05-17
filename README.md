# LienChain — Tokenized PI Medical Lien Settlement on XRPL

[![Live Site](https://img.shields.io/badge/Live%20Site-lienchain.vercel.app-blue?style=flat-square&logo=vercel)](https://lienchain.vercel.app)
[![Network](https://img.shields.io/badge/Network-XRPL%20Testnet-success?style=flat-square)](https://testnet.xrpl.org)

> Personal-injury medical lien financing on the XRP Ledger. Mainnet-ready behind a feature flag.

---

## Overview

LienChain is an operations and settlement platform for personal-injury (PI) medical lien financing. PI clinics treat patients on a lien — they're paid out of the eventual settlement, often 12-24 months later. That receivable is illiquid, hard to value, and impossible to trade. LienChain mints each lien as an NFToken on XRPL with structured metadata in the transaction memo (bill, split, clinic, market, attorney), enforces per-state compliance rules in the settlement waterfall, and executes real on-chain `Payment` transactions when the case settles.

- **Five US markets supported** — KC, STL, TX, NV, IN — each with state-specific compliance rules.
- **Multi-clinic case support** — a single PI case can group N clinics' liens, with shared reduction visibility.
- **Per-state lien priority** — Indiana 20% clinic floor enforced iteratively in the waterfall; Texas hospital lien priority surfaced as an attorney advisory.
- **Attorney provisioning** — operators send tokenized invite URLs to PI attorneys for case-specific portal access.
- **Real on-chain settlement** — each clinic payout is a verifiable XRPL `Payment` transaction with `tesSUCCESS` confirmation.
- **Mainnet-ready** — `VITE_NETWORK=testnet|mainnet` feature flag with separate seeds, loud network badge, and a pre-flight checklist (`MAINNET-READINESS.md`).

---

## How It Works

1. **Lien tokenized.** Operator uses the intake wizard to mint a PI medical lien as an NFToken on XRPL. Multi-clinic cases supported — add additional clinics to an existing case, all sharing one attorney and one settlement waterfall.

2. **Case settles.** Attorney enters the gross settlement amount in the portal. The waterfall computes attorney fee, case costs, net available, and per-clinic pro-rata distribution with state-specific rules applied (Indiana floor, Texas advisory).

3. **Fiat receipt confirmed.** Operator records the attorney's wire or check arrival in LienCo's business bank account.

4. **On-chain clinic payouts.** Once fiat is confirmed, the platform issues one verifiable `Payment` transaction per clinic from LienCo's wallet to the clinic's destination address. Partial-failure recovery: any failed clinic is flagged for retry; idempotent re-runs only re-attempt failures.

5. **Audit trail.** Every transaction (mint and settlement) is permanently recorded on XRPL. Recovery rate, days-to-settle, exposure-by-market, and aging buckets surface in the operator dashboard.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Ledger | [XRP Ledger](https://xrpl.org) (Testnet, Mainnet-ready) |
| Token Standard | NFToken (NFTokenMint) |
| Settlement Currency | Native XRP on testnet; mainnet currency TBD (stablecoin path per `MAINNET-READINESS.md`) |
| Frontend | React 19 + Vite + Tailwind + react-router-dom v7 |
| Charts | Recharts |
| Node SDK | [xrpl.js 4.6](https://github.com/XRPLF/xrpl.js) |
| Hosting | Vercel (auto-deploy on push to `main`) |

---

## Features Shipped

- **Lien Tokenization** — NFTokenMint with hex-encoded metadata, real testnet TXs
- **Multi-Clinic Cases with Shared Reductions** — N clinics per case, pro-rata distribution, case-level reduction request visibility
- **Per-State Compliance** — Indiana 20% clinic floor enforced in the waterfall, Texas hospital lien priority advisory banner, centralized `src/lib/markets.js` config
- **Portfolio Analytics Dashboard** — 6 KPI tiles (Total Deployed Capital, At-Risk Exposure, Recovery Rate, Avg Days to Settle, Active Cases, Settled Cases), Exposure-by-Market stacked bar chart, Recovery Rate Over Time line chart, Aging Buckets table
- **Attorney Provisioning** — operator-side registry, tokenized invite URLs, `/attorney/:caseId?token=…` validation gate, persistent attorney sessions
- **On-Chain Settlement** — real XRPL `Payment` transactions per clinic with `tesSUCCESS` enforcement, partial-failure recovery with per-clinic Retry, idempotent re-runs
- **Mainnet Readiness** — `VITE_NETWORK` feature flag, separate seeds per network, loud TESTNET/MAINNET badge, fiat receipt confirmation gate before settlement, `MAINNET-READINESS.md` pre-flight checklist

---

## Project Structure

```
lienchain/
├── README.md                  This file
├── CLAUDE.md                  Project brief for AI collaboration sessions
├── MAINNET-READINESS.md       Pre-flight checklist before mainnet flip
├── phase[3-10]-plan.md        Phase specifications
├── index.html                 Vite entry
├── vite.config.mjs
├── .env.example               VITE_NETWORK, seeds, WSS endpoints
│
├── setup-wallets.js           CLI: generates + funds testnet wallets
├── setup-markets.js           CLI: funds the 6-wallet panel
│
└── src/
    ├── main.jsx               Router: /, /dashboard, /attorney/:caseId, /attorney/demo
    ├── App.jsx                Landing page
    ├── Dashboard.jsx          Operator dashboard (5 tabs)
    ├── lib/
    │   ├── network.js         VITE_NETWORK config; seed + endpoint + explorer
    │   ├── markets.js         MARKETS / MARKET_INFO with per-state policy
    │   ├── waterfall.js       calcWaterfall — pro-rata + IN 20% floor enforcement
    │   ├── settle-onchain.js  executeSettlementPayment — real XRPL Payments
    │   ├── xrpl-tokenize.js   NFTokenMint via WebSocket
    │   └── xrpl-data.js       account_info, account_tx queries
    ├── components/
    │   ├── IntakeWizard.jsx
    │   ├── ReductionModal.jsx
    │   └── AttorneyPreview.jsx
    └── pages/
        └── AttorneyPortal.jsx
```

---

## Quick Start

```bash
git clone https://github.com/mattlearns18/lienchain.git
cd lienchain
npm install

# Configure environment
cp .env.example .env.local
# Set VITE_LIENCO_TESTNET_SEED (generate via setup-wallets.js or XRPL Testnet Faucet)

# (Optional) Generate testnet wallets for the 6-wallet panel
node setup-wallets.js

# Run locally
npm run dev          # http://localhost:5173
```

---

## Compliance

| Framework | Implementation |
|---|---|
| **HIPAA** | Patient data stays off-chain. Only structured lien metadata (bill, split, clinic, market) is hex-encoded into the NFTokenMint memo. |
| **State Lien Laws** | Per-state compliance rules in `src/lib/markets.js`. Indiana 20% clinic floor enforced in waterfall. Texas 72-hour filing window and hospital lien priority surfaced as advisory flags. MO, NV rules configurable. |
| **UCC Article 9** | Lien metadata structured for UCC-9 assignment compliance. |
| **KYC / AML** | Wallet onboarding designed to integrate identity verification prior to mainnet deployment. |
| **Mainnet Readiness** | See `MAINNET-READINESS.md` for the pre-flight checklist (LLC formation, business bank account, E&O insurance, healthcare-lien attorney opinion letter). |

---

## License

MIT © LienChain
