# Phase 9 Plan — Mainnet Readiness

This is the implementation spec for Phase 9. Hand it to Claude Code as the source of truth. Commit-level handoffs land in `.cowork-handoff.md` one at a time.

## Goal

Get LienChain to the point where Matt can flip a feature flag and execute a real on-chain settlement on XRPL mainnet for the first lien, with confidence the math and money movement are correct, the audit trail is permanent, and any partial failure can be recovered from. This is the largest of the four phases — the engineering work is the gating item before LienChain can accept real money. The §7 business gaps (LLC, bank, E&O, opinion letter) gate the actual mainnet *flip*; this phase is what makes the flip possible.

## Settlement payment model (architectural decision, locked)

**Fiat off-chain attorney leg + on-chain LienCo→clinic-destination payout.** This is how PI cases actually settle in 2026, and it's what Matt picked at Phase 9 planning kickoff. Detail:

1. Defense carrier wires gross settlement to attorney's trust account (entirely off-chain, attorney handles per their state's rules).
2. Attorney disburses per the waterfall: attorney fee + case costs to themselves, net available to LienCo (off-chain wire/ACH to LienCo's business bank account).
3. LienCo's operator logs into the LienChain dashboard, marks the case's fiat receipt (amount + date + reference like wire confirmation or check number).
4. Once fiat receipt is confirmed, LienCo executes the on-chain clinic payouts: one `Payment` transaction per clinic for `clinic.clinicShare` (the clinic's split of their recovery).
5. Each on-chain payout is the permanent audit trail for that clinic's settlement.

LienCo's share stays in LienCo's bank account (it's the funder's recoupment of purchase price + return). The clinic share is the on-chain movement.

## Clinic wallet handling (Phase 9 scope)

Each clinic gets a `destinationAddress` field — the XRPL address where their on-chain payout goes. Operators populate this manually when onboarding a clinic. For mainnet, the destination might be a clinic-controlled wallet OR a LienCo-custodied clinic-escrow wallet that fronts off-chain bank disbursement to the clinic. Phase 9 doesn't constrain that choice — it just persists a destination address per clinic and ensures the on-chain Payment goes there.

The wider question of "does the clinic actually hold the wallet, or does LienCo custody?" is a Q3 product decision out of scope here. Phase 9 makes the engineering work either way.

## Currency

Testnet: native XRP (existing pattern). Mainnet: TBD per the IOU/stablecoin question. The transaction shape supports either via the `Payment.Amount` field — string for native XRP drops, object `{currency, issuer, value}` for issued currencies. Phase 9 makes both code paths work; the actual currency choice for the first mainnet lien is a Matt decision when flipping the flag.

## Scope (Three Commits)

### Commit 1 — Network feature flag + endpoint abstraction

**Why first:** Everything downstream needs a clean way to read the active network's seed and endpoint. Centralize that.

**New env vars in `.env.local` / `.env.example`:**

```
VITE_NETWORK=testnet                          # 'testnet' | 'mainnet', defaults testnet
VITE_LIENCO_TESTNET_SEED=sEd...               # existing, unchanged
VITE_LIENCO_MAINNET_SEED=                     # NEW, blank until mainnet flip
VITE_XRPL_TESTNET_WSS=wss://s.altnet.rippletest.net:51233   # NEW, allows override
VITE_XRPL_MAINNET_WSS=wss://xrplcluster.com                  # NEW, allows override
```

**New module `src/lib/network.js`:**

```js
// Single source of truth for active network configuration. Read once at
// module load; everything downstream calls getNetworkConfig().

const NETWORK = import.meta.env.VITE_NETWORK || 'testnet';

const CONFIGS = {
  testnet: {
    name:      'testnet',
    seed:      import.meta.env.VITE_LIENCO_TESTNET_SEED,
    wssUrl:    import.meta.env.VITE_XRPL_TESTNET_WSS || 'wss://s.altnet.rippletest.net:51233',
    explorer:  'https://testnet.xrpl.org/transactions/',
    isMainnet: false,
  },
  mainnet: {
    name:      'mainnet',
    seed:      import.meta.env.VITE_LIENCO_MAINNET_SEED,
    wssUrl:    import.meta.env.VITE_XRPL_MAINNET_WSS || 'wss://xrplcluster.com',
    explorer:  'https://livenet.xrpl.org/transactions/',
    isMainnet: true,
  },
};

if (!CONFIGS[NETWORK]) {
  throw new Error(`Invalid VITE_NETWORK: "${NETWORK}". Must be 'testnet' or 'mainnet'.`);
}

export function getNetworkConfig() {
  const cfg = CONFIGS[NETWORK];
  if (cfg.isMainnet && !cfg.seed) {
    // Loud failure when mainnet flag is set but seed is missing — prevents
    // silent fallback to testnet behavior.
    throw new Error('VITE_NETWORK=mainnet but VITE_LIENCO_MAINNET_SEED is empty. Mainnet seed not configured.');
  }
  return cfg;
}

export const IS_MAINNET = CONFIGS[NETWORK].isMainnet;
```

**Refactor `src/lib/xrpl-tokenize.js` and `src/lib/xrpl-data.js`** to read endpoint + seed via `getNetworkConfig()`. No behavior change for testnet (current default).

**Refactor all explorer URL construction** (in AttorneyPortal, AttorneyPreview, Liens tab, Settlements tab) to use `getNetworkConfig().explorer + txHash` instead of hardcoded `https://testnet.xrpl.org/transactions/...`.

**UI: network badge.** In the dashboard header (next to "Testnet MVP" / "XRPL TESTNET" indicators), surface a prominent network badge: green "TESTNET" on testnet, red-bordered "MAINNET" on mainnet. The mainnet style should be visually loud — an operator should never accidentally execute a mainnet payment thinking they're on testnet. Same badge on `/attorney/:caseId` so attorneys also know.

### Commit 2 — Fiat receipt confirmation gate

**New `case.fiatReceipt` field (optional):**

```js
{
  amount:      number,                  // dollars received from attorney
  receivedAt:  ISO timestamp,
  reference:   string,                  // wire confirmation, check number, ACH reference
  confirmedBy: string,                  // operator name or initials
}
```

**Settle Now flow gating.** Today the Settle Now button on AttorneyPreview executes settlement immediately. Phase 9 Commit 2 changes this:

- If `case.fiatReceipt == null`: Settle Now button is disabled. Above it, a "Mark Fiat Received" button that opens a small modal:
  - Amount received (number input, prefilled with computed sum of LienCo shares across clinics on the case)
  - Date received (date picker, defaults today)
  - Reference (text, required, placeholder "Wire confirmation #, check #, ACH ref")
  - Confirmed by (text, required, placeholder "Your initials or name")
  - Submit writes `case.fiatReceipt` to localStorage. Re-renders the case view, now with Settle Now enabled.
- If `case.fiatReceipt != null`: Settle Now is enabled. Above it, a small green confirmation strip showing "Fiat received $X on Y by Z" with an "Update" link to re-open the receipt modal.

**Important display rule:** the fiat receipt amount is operator-only — must NOT appear in the attorney view of the case (the existing operator-vs-attorney separation rule in §4 of CLAUDE.md still applies). The fiat receipt strip is hidden when the same case view is rendered for attorney access (via the token gate from Phase 8).

### Commit 3 — Real on-chain clinic payouts + partial-failure recovery + readiness doc

The substantive commit. Three pieces in one because they're tightly coupled.

**New `clinic.destinationAddress` field** in the clinic registry (the hardcoded clinic list in `IntakeWizard.jsx`, eventually moved to localStorage with Matt's real clinics). Each clinic entry now has `{name, market, destinationAddress}` where the address is the XRPL r-address that on-chain payouts route to. For seed/test clinics, populate with the existing testnet wallet addresses from `wallets.json`.

**Replace mock settlement hashes with real Payment transactions.** In the multi-clinic sequential settlement flow (the `onSettled` callback that fires per clinic and writes `lien.tx2`):

```js
// inside handleSettled, per clinic:
const client = new Client(getNetworkConfig().wssUrl);
await client.connect();
const wallet = Wallet.fromSeed(getNetworkConfig().seed);

const tx = {
  TransactionType: 'Payment',
  Account:         wallet.classicAddress,
  Destination:     clinic.destinationAddress,
  Amount:          xrpToDrops(clinic.clinicShare),  // For testnet XRP; mainnet may use issued currency
  Memos: [{
    Memo: {
      MemoType: stringToHex('LienChain-ClinicPayout'),
      MemoData: stringToHex(JSON.stringify({ caseId, lienId, clinicName, share: clinic.clinicShare })),
    },
  }],
};

const result = await client.submitAndWait(tx);
await client.disconnect();

// Persist to lien.tx2 + recovery + settledAt (Phase 7 fields)
// status flips to Settled (Phase 5 rollup logic kicks in)
```

**Partial-failure recovery.** If clinic 2 of 3 fails (network error, insufficient funding, malformed destination, etc.):

- Wrap each clinic payout in try/catch. On failure, do NOT abort the loop — continue to the next clinic.
- Store the error message on the failed lien: `lien.settlementError = { message, attemptedAt }`. Status stays `Active`. `tx2` stays null.
- Case status rollup: if any clinic on the case has `settlementError` set OR is still Active after a settlement attempt, case status is `'Partial Settlement'` (new status value alongside `Active` and `Settled`).
- UI: "Partial Settlement" badge on the Liens tab parent row. Expand to see which clinics succeeded (have `tx2`) vs. failed (have `settlementError`). Each failed clinic row gets a "Retry Payout" button that re-runs just that clinic's Payment transaction.
- Settle Now button on a Partial Settlement case re-enables for retries; succeeded clinics are skipped (idempotent — don't double-pay).

**Mainnet readiness checklist doc `MAINNET-READINESS.md`** at the repo root. Pre-flight checklist Matt walks through before flipping `VITE_NETWORK=mainnet`:

- LLC formed and active
- Business bank account opened, can receive wires
- E&O insurance policy active
- Healthcare-lien attorney opinion letter in hand (covers each target state)
- Mainnet seed generated, stored in `VITE_LIENCO_MAINNET_SEED` on Vercel env (NOT in `.env.local` committed to repo), wallet funded with XRP for transaction fees
- Each clinic on the platform has a `destinationAddress` that's been verified by sending a $1 test payment on testnet first
- First mainnet lien identified: smallest dollar amount, one clinic, one attorney, full audit trail captured
- Rollback plan documented (what to do if a mainnet payment fails or routes incorrectly)

Each item gets a checkbox in the doc. Matt fills them out in his own copy as they close.

## Out of Scope (Phase 10+)

- KMS / hardware seed storage. `VITE_LIENCO_MAINNET_SEED` in Vercel env var is acceptable for first mainnet lien. Production hardening (HSM, multi-sig, etc.) is post-launch.
- Real email service for attorney invites (still mailto:).
- Real attorney authentication beyond Phase 8 token-in-URL.
- Backend service for orchestration — Phase 9 still runs entirely browser-side.
- Multi-region wallet redundancy.
- Automated reconciliation between fiat receipt and on-chain payout.
- Mainnet currency decision (XRP vs. RLUSD vs. issued USDC) — left as a Matt-decides flip at first-lien time.

## Test Plan

**Commit 1 (network flag):** Set `VITE_NETWORK=testnet` (default), reload. Site behaves exactly as today, TESTNET badge visible. Set `VITE_NETWORK=mainnet` with `VITE_LIENCO_MAINNET_SEED=` (empty) — app throws a clear error at load. Set `VITE_NETWORK=mainnet` with a junk seed — app loads but explorer URLs now point to `livenet.xrpl.org`. (Don't actually run any transactions in mainnet test mode unless the seed is funded.)

**Commit 2 (fiat receipt):** Open a case. Settle Now is disabled. Click Mark Fiat Received → modal opens with prefilled amount. Submit. Settle Now is enabled. Strip shows the receipt detail. Open the same case via the attorney token URL — receipt strip is hidden (operator-only). Update the receipt → modal pre-populates with existing values, save updates.

**Commit 3 (real payouts):** Set up a fresh testnet multi-clinic case. Mark fiat received. Click Settle Now → Execute. Confirm real testnet Payment transactions land at XRPL Explorer (verifiable via the existing WebSocket `tx` command). Each `lien.tx2` is a 64-char hash that resolves. `lien.recovery` and `lien.settledAt` from Phase 7 are correctly written. Case status flips to Settled when all succeed. For partial-failure test: temporarily set one clinic's `destinationAddress` to an invalid r-address; settle the case; confirm that clinic shows error + Retry button, other clinics succeeded, case is `Partial Settlement`. Restore the destination, click Retry — payment succeeds, case flips to Settled.

## Suggested Commit Slicing

1. `feat(phase9): network feature flag + endpoint abstraction (no behavior change)` — Commit 1 (~3-4 days)
2. `feat(phase9): fiat receipt confirmation gates settlement execution` — Commit 2 (~3-4 days)
3. `feat(phase9): real on-chain clinic payouts + partial-failure recovery + MAINNET-READINESS doc` — Commit 3 (~2 weeks)

Total ~3-3.5 weeks of engineering. Leaves ~2-2.5 weeks of buffer for: testnet end-to-end validation, mainnet first-lien dry run on testnet, polish, and any unforeseen scope. Tight but workable for the July 1 deadline.

## Open Implementation Questions for Claude Code

Suggested defaults; Claude Code can proceed unless Matt overrides:

1. **`Partial Settlement` rollup vs. `Active` rollup.** When a case has any clinic still unsettled (whether never-attempted or failed), the case is `Partial Settlement` not `Active`. Distinguishes "we tried and some failed" from "we haven't started yet." Default: yes, three-status model.
2. **Idempotent retry.** Settle Now on a Partial Settlement case only re-runs the failed clinics (those without `tx2`), not the succeeded ones. Default: yes.
3. **Mainnet currency.** Default: native XRP for first-lien testing; stablecoin path (issued currency `Amount` object) is in the code but inactive until Matt picks. Add a `TODO(phase10)` comment where the currency is constructed.
4. **Fiat receipt amount validation.** When the operator enters a fiat receipt amount that doesn't match the computed sum of LienCo shares across clinics, warn (don't block) — let the operator proceed since real-world banking deltas (wire fees, ACH timing) can cause minor mismatches.
5. **Existing seed wallets.** For testnet development, reuse the wallets in `wallets.json` from the `setup-wallets.js` CLI script. Map clinic name → wallet address in the registry. Don't generate new wallets in this phase.

## Handoff Pattern (unchanged)

Standard prompt for each commit handoff:

```
Read /Users/matthewsabine/lienchain/.cowork-handoff.md from this repo.
Execute the plan exactly as written — commit with the message in the file,
push to main, and append a brief status report to
/Users/matthewsabine/lienchain/.cowork-handoff-result.md when done.
Flag any deviation in the result file.
```
