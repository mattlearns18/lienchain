# Phase 13 Plan — Per-State Assignability Enforcement (On-Ledger)

This is the implementation spec for Phase 13. Hand it to Claude Code as the source of truth. Commit-level handoffs land in `.cowork-handoff.md` one at a time.

## Goal

Make a lien's **legal assignability** an enforced property of the token itself, not just a warning banner. Today every lien is minted freely transferable regardless of what the state's lien statute allows. This phase makes the mint flags follow the market's assignability policy, surfaces that decision to the operator before it becomes permanent, and records it on the lien for audit.

---

## ⚠️ Design correction — read this first

Phase 13 was originally scoped as *"use Permissioned Domains (XLS-80) to gate who can hold a lien."* **That premise was checked against the protocol docs and is wrong.** Do not build it that way.

**What the research actually established (2026-09-08):**

1. **Permissioned Domains (XLS-80) do not gate `NFToken` transfers.** They are a decentralized-exchange / lending-and-vaults construct — xrpl.org files them under `concepts/tokens/decentralized-exchange/permissioned-domains`. There is **no `DomainID` field on any NFToken transaction**. Permissioned Domains are the right tool for a *fungible-token* venue, not for controlling who may hold an NFT.

2. **Credentials (XLS-70) gate *payments*, not NFT transfers.** XLS-70 adds a `CredentialIDs` field to `Payment`, `EscrowFinish`, `PaymentChannelClaim`, and `AccountDelete`, working together with `DepositAuth`. That makes it the correct tool for **settlement payout gating** (Commit 3), not for lien assignability.

3. **The correct primitive for assignability is the `tfTransferable` mint flag** — which LienChain already sets, just unconditionally. Per the `NFTokenMint` reference:

   > `tfTransferable` (`0x00000008`, decimal `8`) — The minted `NFToken` can be transferred to others. **If this flag is not enabled, the token can still be transferred from or to the issuer, but a transfer to the issuer must be made based on a buy offer from the issuer and not a sell offer from the NFT holder.**

   That is a precise on-ledger encoding of "non-assignable": the lien can move between LienCo (the issuer) and the clinic, but **cannot be assigned onward to a third party**. Exactly the legal posture a non-assignability statute describes.

### 🚨 The constraint that shapes this entire phase

`NFTokenMint` is documented as *"the only opportunity the minter has to specify any token fields and flags that are **immutable**."*

**Mint flags can never be changed after minting.** Consequences:

- Every lien minted to date carries `Flags: 8` (transferable) **permanently**. This cannot be retrofitted, migrated, or corrected. If a lien in a non-assignable market was already minted, it stays transferable forever; the only remedies are off-ledger (contractual) or burning and re-minting (`tfBurnable` is **not** currently set either, so the issuer cannot even burn them — only the owner can).
- Therefore the assignability decision must be **correct at intake**, and the operator must see it **before** confirming the mint.
- Getting this in before mainnet volume matters much more than it did on testnet.

---

## Safety property

**For today's active markets (KC, STL, TX, NV) this phase is a functional no-op.** All four are treated as assignable, so they keep minting `Flags: 8` exactly as they do now. The new behavior only activates if a market is marked non-assignable — i.e. Indiana, if it is ever re-activated. That keeps Phase 13 low-risk against the "never break working things" rule while putting the enforcement in place ahead of need.

---

## Scope (Three Commits)

### Commit 1 — Market assignability policy drives mint flags

**`src/lib/markets.js`**

Normalize assignability into one explicit field per market. `MARKET_INFO.IN.policy` already carries `nonAssignable: true`; promote that to a first-class, positively-named policy field so every market states it:

```js
policy: { assignable: true }    // KC, STL, TX, NV
policy: { assignable: false, clinicFloorPct: 0.20, nonAssignable: true }  // IN (retired)
```

Keep the existing `nonAssignable` key as-is for back-compat with any current reader; `assignable` is the new source of truth. Export a helper:

```js
export function isMarketAssignable(market) {
  return MARKET_INFO[market]?.policy?.assignable !== false;
}
```

**`src/lib/xrpl-tokenize.js`**

- Add a pure, exported, unit-testable helper (no XRPL import needed to test it):

  ```js
  export const NFT_FLAG_TRANSFERABLE = 8;
  export function mintFlagsForMarket(market) {
    return isMarketAssignable(market) ? NFT_FLAG_TRANSFERABLE : 0;
  }
  ```

- Replace the hardcoded `Flags: 8` in the `NFTokenMint` transaction with `mintFlagsForMarket(lienData.market)`.
- **Rename `issueLienMPT` → `issueLienNFT`** (it mints an NFToken, never an MPT — this misnomer is what caused the documentation drift found on 2026-09-08). Update the caller in `IntakeWizard.jsx`. Keep a thin deprecated alias export `issueLienMPT = issueLienNFT` for one release if anything else references it.
- Update the file header comment, which still says "MPT issuance."

**Return + persist the decision.** `issueLienNFT` should return the `flags` actually used, and the lien record must persist:

```js
{ assignable: true|false, mintFlags: 8|0 }
```

Never re-derive assignability from the market at read time — the market's policy could change later, but the minted token cannot. The recorded value is the truth.

**Do not touch** `settle-onchain.js`, `waterfall.js`, or any settlement math. This commit only changes what gets minted and what gets recorded.

---

### Commit 2 — Surface it before it's permanent, and in the audit trail

**`IntakeWizard.jsx` — review/tokenize step (the important one).** Because the flag is immutable, the operator must see the consequence before confirming:

- Assignable market → a neutral line: *"This lien will be minted **transferable** — it can be assigned to another funder on the secondary market."*
- Non-assignable market → a hard, visually distinct warning, matching the existing red compliance-warning pattern (`wiz-market-warn warn-red`):
  *"⛔ This lien will be minted **NON-TRANSFERABLE** under {statute}. It can only move between LienCo and the clinic — it can never be assigned to a third-party funder. **This is permanent and cannot be changed after minting.**"*

**`Dashboard.jsx` — Liens tab + Compliance tab.** Add a `NON-ASSIGNABLE` badge on liens where `assignable === false`, alongside the existing market/status chips. Follow the `FLOOR` tag pattern from Phase 6.

**Legacy display.** Liens minted before this phase have no `mintFlags` recorded. Render those as *"transferable (legacy mint)"* rather than guessing — do **not** infer from current market policy, per the rule above.

**Secondary-transfer UI.** There is no transfer UI today. When one is built, it must hard-block on `assignable === false`. Add a `TODO(phase14)` marker at the natural place so this isn't lost.

---

### Commit 3 — Settlement destination gating via Credentials (XLS-70) *(optional — evaluate before building)*

This is where XLS-70 legitimately applies: gating **who may receive settlement money**, not who may hold a lien.

**Design constraint to resolve first:** credential-gated deposits work through `DepositAuth`, which is a setting on the **recipient's** account. LienChain cannot unilaterally impose it on a clinic's wallet — the clinic must opt in. So this cannot be a hard requirement without clinic onboarding cooperation.

**Recommended first step (low-risk, non-breaking):** implement it as a **pre-flight check**, not a change to the `Payment` shape. Before `executeSettlementPayment` fires, call the `deposit_authorized` API method for the destination. If the destination requires authorization and the sender is not authorized, fail *before* submitting rather than burning a fee on a `tec` failure. This is a strict reliability improvement even with zero credentials in play.

Only after clinic wallet onboarding exists should `CredentialIDs` be attached to the settlement `Payment`. Do not build that in Phase 13.

---

## Testing

- **Unit:** `mintFlagsForMarket()` — assignable markets → `8`; non-assignable → `0`; unknown/missing market → `8` (fail open to current behavior, and log). Follow the plain-Node pattern in `src/lib/__tests__/waterfall.test.js`, importing the **real** module (do not inline a copy — that exact mistake was fixed on 2026-06-17).
- **Backtest:** extend `backtest.mjs` with an assignability invariant — every generated lien's recorded `mintFlags` must match its market's policy, and no non-assignable lien may ever be marked transferable. Keep the existing `OVERALL: ✓ PASS` gate green.
- **Manual:** mint one lien in an active market on testnet, confirm `Flags: 8` on the explorer and that behavior is unchanged. Then temporarily set `MARKET_INFO.IN.policy.assignable = false` **and** `active = true`, mint, and confirm `Flags: 0` on-ledger and that the offer/transfer restriction actually holds. Revert both flags afterward.

## Out of scope

- **Permissioned Domains / Permissioned DEX** — do not apply to NFTokens (see Design Correction). Revisit only if a fungible-token secondary venue is built.
- **RLUSD migration** — separate mainnet-currency workstream.
- **Building the secondary market itself.**
- **Retrofitting existing liens** — impossible; flags are immutable.

## Forward note (not this phase)

`NFTokenMint` supports a `TransferFee` field (0–50.00%, in increments of 0.001) that pays **the issuer** on secondary sales, and it requires `tfTransferable`. That is a plausible future path to enforcing the 1.5% `PLATFORM_FEE_PCT` servicing fee on-chain rather than as the bookkeeping-only record it is today in `money.js`. Like `Flags`, `TransferFee` is **immutable at mint** — so if on-chain fee capture is ever wanted, it must be decided before minting at volume. Worth a decision *before* mainnet, even though implementation is later.

---

*Verified against xrpl.org protocol docs on 2026-09-08: `NFTokenMint` reference (flags table, immutability, `TransferFee`), `NonFungibleTokensV1_1` amendment enabled 2022-10-31, XLS-70 Credentials enabled 2025-09-04, XLS-80 Permissioned Domains enabled 2026-02-04.*
