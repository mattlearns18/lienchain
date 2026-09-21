# Go-Live Readiness — taking real business

Companion to `MAINNET-READINESS.md`. That document covers flipping the network
flag. **This one covers accepting a real lien from a real clinic with real money.**
They are different bars, and this is the higher one.

Run `npm run check` at any time for the automated portion of this list.

**Status as of 2026-09-21:** DEMO ONLY — 7 blockers open.

---

## Tier 0 — blocks the first real lien

| # | Item | Owner | Status |
|---|------|-------|--------|
| 0.1 | **Backend + database.** Replace localStorage with real persistence. | Eng | ☐ Not started |
| 0.2 | **Real authentication.** Accounts for operator, clinics, attorneys. | Eng | ☐ Not started |
| 0.3 | **Mainnet currency (RLUSD).** Replace the 1000:1 testnet scaling. | Eng | ☐ Not started |
| 0.4 | **Phase 13 — `tfTransferable` per-state.** Immutable at mint. | Eng | ☐ Scoped (`phase13-plan.md`) |
| 0.5 | **Attorney revocation fix.** Session check ignores token rotation. | Eng | ☐ Not started |
| 0.6 | **Per-clinic wallet addresses.** Several clinics currently share one. | Eng + Ops | ☐ Not started |
| 0.7 | **E&O insurance.** | Matt | ☐ Open |
| 0.8 | **Healthcare-lien opinion letter.** | Matt | ◐ In progress |

### 0.1 — Backend + database *(the long pole)*

Every lien, case, attorney assignment, fiat receipt, and patient disbursement
record currently lives in **one browser's localStorage**. There is no database
and no server.

What that means the day a real lien exists:

- Clearing the browser cache erases the entire book of business.
- A second computer shows an empty dashboard — the data isn't "in LienChain," it's in one browser profile.
- An attorney who accepts an invite on their laptop sees nothing on their phone.
- Two people can never see the same data. There is no single source of truth.
- The XRPL transactions survive permanently. Every piece of business context around them does not.

**Recommended approach:** managed Postgres with row-level security (Supabase or
similar) rather than building auth + DB + API from scratch. The existing
`store.js` shapes map cleanly onto tables — `liens`, `cases`,
`reduction_requests`, `attorneys`, `attorney_sessions` — so this is a migration,
not a redesign. Budget 4–8 weeks including auth.

**This gates Tier 1.** Legal documents describe a system; the system should be
the real one before counsel reviews the Terms of Service and BAA.

### 0.3 — Mainnet currency

`money.js` divides every amount by 1,000 so payments fit inside faucet-funded
testnet wallets, and says in its own comment *"Do NOT use this scaling on
mainnet."* Nothing in the code enforces that. With `VITE_NETWORK=mainnet`, a
$5,000 clinic payout would send 5 XRP of real money. XRPL settlement is final —
there is no reversal.

Two things required:
1. A hard guard: `executeSettlementPayment()` throws if the network is mainnet and the stablecoin path is not implemented. *(Do this immediately — it costs ten minutes and removes a catastrophic-loss path.)*
2. The real implementation: RLUSD issued-currency `Amount` object. RLUSD is NYDFS-regulated, native to XRPL, and per `CLAUDE.md` §7 is the recommended settlement asset.

### 0.6 — Per-clinic wallets

`IntakeWizard.jsx` maps ten clinic names to testnet addresses, and several
share one address:

- `rMsuF1w…` → KC Pain & Recovery, Plaza Rehab Group
- `r3CuAh6…` → STL Ortho, Midwest Spine Center, Gateway Injury Clinic
- `rJZjjSD…` → Houston Spine & Joint, DFW Injury Center
- `rKvS6Pa…` → LV Recovery Center, Henderson Pain Mgmt

Harmless on testnet (they were reused as stand-ins). On mainnet it means a
settlement meant for one clinic lands in another's account. Every clinic needs
its own verified address, confirmed by a $1 test payment before first real use.

---

## Tier 1 — legal paper before money moves

None of these exist yet. `attorney-opinion-packet.md` is the packet to *obtain*
the opinion letter — not a substitute for operating documents.

| # | Document | Why it's required |
|---|----------|-------------------|
| 1.1 | **Clinic Lien Purchase Agreement** | The core legal instrument. This is the contract that actually assigns the lien. No lien should be purchased without one signed. |
| 1.2 | **Terms of Service** | Governs operator and clinic use of the platform. |
| 1.3 | **Privacy Policy** | Legally required before collecting data from anyone. |
| 1.4 | **HIPAA Business Associate Agreement** | LienChain touches lien records tied to treatment. Even with PHI off-chain, clinic counsel will require a BAA before signing. |
| 1.5 | **Attorney Portal Terms of Use** | What an attorney agrees to when clicking Execute Settlement. |
| 1.6 | **Notice of Assignment / filing templates** | Per state. Texas's 72-hour filing window needs an actual instrument. |

These should be drafted by the same counsel engaged for the opinion letter —
they will already have the structure in context, which is cheaper than briefing
a second firm.

---

## Tier 2 — operational

| # | Item | Notes |
|---|------|-------|
| 2.1 | **Clinic onboarding flow** | Replaces the hardcoded ten-clinic list. Needs address capture + verification. |
| 2.2 | **Error monitoring** | Nothing reports failures today. A settlement failing at 11pm surfaces only as a customer complaint. Sentry's free tier is sufficient at this volume. |
| 2.3 | **Backup + disaster recovery** | Currently N/A (nothing to back up). Becomes critical the moment 0.1 lands. |
| 2.4 | **Support + dispute process** | What happens when a clinic says "that payout was wrong"? |
| 2.5 | **Published pricing** | `PLATFORM_FEE_PCT = 1.5` is internal bookkeeping only. Nothing customer-facing states a rate. |

---

## Tier 3 — code hygiene before volume

| # | Item |
|---|------|
| 3.1 | Rename `issueLienMPT()` → `issueLienNFT()`. The misnomer caused months of documentation describing the wrong token standard. |
| 3.2 | Delete or clearly label `issue-lien.js` — a third, inconsistent lien-creation path (TrustSet + Payment IOU) that is neither NFToken nor the production flow. |
| 3.3 | Reconcile `CLAUDE.md` §6: the Phase 10 paragraph says both Phase 9 cosmetic deferrals were closed, but the §6 tail still lists them as open. |

---

## Recommended sequence

1. **Immediately:** the mainnet guard in `settle-onchain.js` (0.3, part 1) and the revocation fix (0.5). Hours of work, each removes a real hazard.
2. **Then:** backend + auth (0.1, 0.2). Everything downstream waits on this.
3. **Then in parallel:** mainnet currency (0.3) and Phase 13 (0.4) — both irreversible-at-mint decisions that must be right before volume, and legal drafting (Tier 1) once counsel can review the real system.
4. **Then:** onboarding + monitoring (2.1, 2.2).
5. **Go live** with one clinic and one attorney you personally know, one small lien, full manual reconciliation.

---

## Automated verification

```bash
npm run check      # full quality gate — build, tests, backtest, safety audit
npm test           # settlement math only (27 assertions)
npm run backtest   # money path across 1,200+ synthetic liens
```

`npm run check` exits non-zero while any blocker remains, so it can be wired
into CI or a pre-push hook without modification.
