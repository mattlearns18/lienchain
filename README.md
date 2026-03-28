# ⛓️ LienChain — Tokenized PI Medical Lien Settlement on XRPL

> Bringing 120-day paper settlement cycles into real-time on the XRP Ledger.

---

## 📋 Overview

LienChain tokenizes personal-injury (PI) medical receivables as **Multi-Purpose Tokens (MPT)** on the XRP Ledger. Each lien is represented as an on-chain token carrying structured metadata — clinic ID, bill amount, purchase price, discount rate, and maturity — enabling near-instant settlement via **RLUSD** with fully configurable payment splits between lien holders and clinics.

- **3-second finality** via XRPL consensus
- **Configurable splits** — no hardcoded percentages
- **Immutable audit trail** — every transaction hash is publicly verifiable
- **Programmable settlement** via XRPL Hooks (WebAssembly)

---

## 🚧 Problem

The U.S. PI medical receivables market represents an estimated **$2 billion** in outstanding liens — yet settlement still runs on paper, wire transfers, and 90–120 day cycles. Key pain points:

| Pain Point | Impact |
|---|---|
| Manual lien tracking | Lost documents, disputes, delays |
| Paper-based settlement | 90–120 day payment cycles |
| Opaque split calculations | Clinic/attorney disputes |
| No real-time audit trail | Compliance and fraud risk |
| High transaction costs | Wire fees, escrow overhead |

---

## 💡 Solution

LienChain replaces the paper stack with a composable on-chain settlement layer:

```
PI Case Settled
     │
     ▼
Attorney wallet sends RLUSD → LienCo (full settlement amount)
     │
     ▼
XRPL Hook triggers automatic split
     ├─► LienCo receives configured % (lien purchase price + yield)
     └─► Clinic receives remainder (bill reduction realized)
```

- **MPT liens** carry structured metadata on-chain (tokenName, billAmount, purchasePrice, discountRate, clinicID, maturityDays, status)
- **RLUSD** (Ripple's USD stablecoin) eliminates FX and volatility risk
- **XRPL Hooks** automate split disbursement — no manual calculation
- **IPFS** anchors HIPAA-compliant documents off-chain with on-chain hash references

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Ledger | [XRP Ledger](https://xrpl.org) (Testnet + Mainnet) |
| Token Standard | Multi-Purpose Tokens (MPT) |
| Settlement Currency | RLUSD (Ripple USD stablecoin) |
| Smart Logic | XRPL Hooks (WebAssembly) |
| Frontend | React + XRPL.js |
| Document Storage | IPFS |
| Node SDK | [xrpl.js](https://github.com/XRPLF/xrpl.js) |

---

## ✅ Features Built

### Testnet MVP
- **`setup-wallets.js`** — Generates and funds LienCo and Clinic wallets from the testnet faucet; persists credentials to `wallets.json`
- **`issue-lien.js`** — Creates a PILIEN trust line from Clinic, then issues 1 PILIEN token from LienCo with full lien metadata in a hex-encoded JSON memo
- **`settle-lien.js`** — Accepts settlement amount and LienCo split % as CLI args; funds a simulated attorney wallet, sends full settlement to LienCo, then disburses the clinic's share — both transactions carry split-ratio and reduction-note memos

### Configurable Splits
Splits are passed at runtime — not hardcoded. Example:
```bash
node settle-lien.js 8500 68   # LienCo 68%, Clinic 32%
node settle-lien.js 12000 75  # LienCo 75%, Clinic 25%
```

### Planned
- Clawback mechanism for case loss / lien reversal
- XRPL Hook for automated on-chain split enforcement
- React dashboard with live transaction feed
- IPFS document anchoring with on-chain hash
- Multi-lien batch issuance

---

## 🚀 Status

**Testnet MVP — Live**

| Milestone | Status |
|---|---|
| Wallet generation + funding | ✅ Complete |
| Trust line creation | ✅ Complete |
| PILIEN lien issuance with metadata | ✅ Complete |
| Configurable settlement split | ✅ Complete |
| First lien tokenized (`PI-LIEN-2025-11-001`, $8,500) | ✅ Live on Testnet |
| RLUSD integration | 🔜 In progress |
| XRPL Hooks automation | 🔜 Planned |
| React dashboard | 🔜 Planned |

---

## 🔒 Compliance

LienChain is designed with the following regulatory frameworks in mind:

| Framework | Relevance |
|---|---|
| **HIPAA** | Patient data stays off-chain; IPFS stores encrypted documents with on-chain hash anchors only |
| **UCC Article 9** | Lien metadata and perfection records structured for UCC-9 assignment compliance |
| **MO / KS Lien Laws** | Maturity dates and reduction rights reflected in token metadata |
| **NYDFS (RLUSD)** | RLUSD is a NYDFS-regulated stablecoin; settlement currency selection is compliance-aware |
| **KYC / AML** | Wallet onboarding designed to integrate identity verification prior to mainnet deployment |

---

## ⚡ Quick Start

```bash
# Install dependencies
npm install

# Generate and fund wallets (saves to wallets.json)
node setup-wallets.js

# Issue a PILIEN lien token with metadata
node issue-lien.js

# Settle a lien: <amount> <lienco%>
node settle-lien.js 8500 68
```

---

## 📄 License

MIT © LienChain
