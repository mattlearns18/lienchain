# LienChain — What It Is, and What It Is Not

*Settlement infrastructure for personal-injury medical lien financing.*
**Verify independently:** [lienchain.vercel.app/proof](https://lienchain.vercel.app/proof) — live settlement records, each linked to the public XRP Ledger explorer.

---

## What it is

**A settlement and record-keeping system for PI medical lien purchases.** Clinics treat patients on a lien and wait 12–24 months to be paid out of the eventual settlement. A funder buys that receivable at a discount. LienChain is the software that runs the back half of that transaction: computing the settlement waterfall, enforcing state-specific lien rules, executing and recording the payouts.

**Statute-aware by design.** Per-state lien rules are enforced in the settlement math itself, not surfaced as a warning to be clicked past. Indiana's 20% clinic floor raises an underpaid clinic and re-distributes the remainder before anyone is paid. Texas's hospital-lien priority surfaces as a hard advisory on every Texas case.

**An evidentiary layer.** Each lien assignment and each settlement payment is written to a public ledger, producing a timestamped record that no party — including LienChain — can alter after the fact.

---

## What it is not

**Not a cryptocurrency, coin, or token offering.** Nothing is sold to the public. No fundraising instrument is issued. The tokens are non-fungible records; they are not traded and have no market.

**Not a replacement for the lien assignment.** The lien is created by statute and assigned by written agreement, exactly as it is today. The on-ledger record corroborates that transaction; it does not constitute it. In a dispute, the signed assignment governs.

**Not pre-settlement funding to plaintiffs.** LienChain does not lend to patients. It handles the purchase of *clinic receivables* — a B2B transaction between a medical provider and a funder — which is a materially different activity from consumer lawsuit lending.

**Not a custodian of protected health information.** No PHI is written to the ledger. On-chain metadata is limited to bill amount, split percentage, clinic, market, and attorney. Patient identifiers remain off-ledger.

**Not yet operating with real money.** See *Current state*, below.

---

## How a case flows

1. **Lien recorded.** Clinic's lien is minted as a record on the XRP Ledger with the commercial terms in its metadata.
2. **Case settles.** Attorney enters the gross settlement. The waterfall computes attorney fee, case costs, net available, and the pro-rata distribution across every clinic on the case, applying state rules.
3. **Funds received.** Attorney remits the net pool to the funder by wire or check from the trust account — conventional banking, off-ledger.
4. **Clinics paid.** One ledger payment per clinic for its share, each independently verifiable. Any failed payment is isolated and retried; the others are unaffected.
5. **Patient share recorded.** Disbursed by the attorney from trust, recorded in the platform for the audit trail.

---

## Technical specifics

| | |
|---|---|
| **Ledger** | XRP Ledger |
| **Token standard** | XLS-20 non-fungible token (`NFTokenMint`), taxon 1337. Amendment live on mainnet since October 2022. |
| **Why non-fungible** | Every lien is unique — different clinic, bill, split, case, attorney. Nothing is interchangeable, so nothing is fungible. |
| **Settlement** | Separate `Payment` transactions per clinic. Success is verified against `tesSUCCESS` before a payout is recorded as complete. |
| **Assignability** | Mint flags are immutable and are set from the market's statutory assignability policy. A lien in a non-assignable jurisdiction is minted so it cannot be transferred to a third party. |

---

## Current state (as of September 2026)

**Testnet only.** No real funds have moved. Mainnet is gated behind a feature flag and a written pre-flight checklist.

**Verified:** settlement math covered by 27 unit assertions and a backtest across 1,200+ synthetic liens spanning 100 attorneys and 50 funders. Real on-ledger mints and payments execute end-to-end today.

**Active markets:** Missouri (Kansas City, St. Louis), Texas, Nevada. Indiana was deliberately retired as a go-forward market pending resolution of its lien assignability question.

---

## Open items — disclosed deliberately

- **No production database.** Records are currently browser-local. A server-side data layer is the first item of go-live work.
- **Legal opinion pending.** Enforceability across Missouri, Texas, and Nevada; securities analysis; HIPAA posture. Engagement packet prepared.
- **Operating agreements not drafted.** Clinic purchase agreement, terms of service, privacy policy, BAA.
- **E&O coverage** not yet bound.
- **Mainnet settlement currency** not yet implemented; native-stablecoin path identified.

Entity formation and banking are complete.

---

*Matt Sabine · Founder · matthewsabine18@gmail.com · [lienchain.vercel.app](https://lienchain.vercel.app)*
*Four-plus years operating personal-injury clinics in Kansas City and St. Louis.*
