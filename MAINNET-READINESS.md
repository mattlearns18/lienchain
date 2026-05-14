# Mainnet Readiness — Pre-Flight Checklist

This is the punch list to walk through before flipping `VITE_NETWORK=mainnet`
in Vercel env and executing the first real-money lien settlement. The
engineering work is shipped in Phase 9 Commits 1-3. Flipping the flag is a
Matt decision when all of the following are true.

## Business gaps (CLAUDE.md §7)

- [ ] LLC formed and active. State of formation: ______. EIN obtained: ______.
- [ ] Business bank account opened, capable of receiving wire transfers and
      ACH from attorney trust accounts. Bank: ______. Account ref: ______.
- [ ] E&O (errors & omissions) insurance policy active. Carrier: ______.
      Policy #: ______. Coverage limits: ______. Renewal: ______.
- [ ] Healthcare-lien attorney opinion letter in hand. Firm: ______.
      Date issued: ______. States covered: ______ (must include each state
      LienChain operates in — KC/STL Missouri, TX, NV, IN).

## Technical readiness

- [ ] Mainnet seed generated. Stored in `VITE_LIENCO_MAINNET_SEED` on Vercel
      project env vars (Production scope only, not Preview). NOT committed
      to `.env.local` in the repo.
- [ ] Mainnet LienCo wallet funded with sufficient XRP to cover transaction
      fees for projected first 90 days of settlements. Minimum: 50 XRP.
      Funding address: ______. Current balance: ______.
- [ ] Each clinic onboarded to mainnet has a verified `destinationAddress`.
      For each, a successful $1 test payment was sent on testnet first to
      the same address pattern, confirming the wallet receives correctly.
- [ ] Mainnet currency decision made (native XRP vs. issued stablecoin).
      Documented choice: ______. If issued currency, the trust line on each
      clinic destination wallet has been verified.
- [ ] First mainnet lien identified: smallest dollar amount possible,
      one clinic, one attorney, full audit trail captured manually.
      Case ID: ______. Bill: ______. Clinic: ______. Attorney: ______.

## Go-live procedure

When all items above are checked:

1. Stop accepting new testnet liens for the chosen first-lien clinic
   (avoid mixed testnet/mainnet state on a single clinic).
2. In Vercel project env: set `VITE_NETWORK=mainnet`, save, redeploy.
3. Reload `https://lienchain.vercel.app` and confirm the **MAINNET** badge
   shows in red across the header and attorney portal.
4. Execute the first-lien settlement end-to-end. Capture every transaction
   hash. Verify on `https://livenet.xrpl.org/transactions/{hash}` for each.
5. Reconcile: fiat received in LienCo bank, clinic paid on-chain, attorney's
   trust account zeroed. Document the audit trail.

## Rollback

If anything goes wrong during or immediately after the first mainnet
settlement:

- Set `VITE_NETWORK=testnet` in Vercel env, save, redeploy. Site reverts to
  testnet-only operation for new settlements (existing mainnet TXs stay
  on-chain — they can't be undone).
- For any clinic that received an incorrect mainnet payment, contact the
  clinic directly and arrange off-chain reconciliation. Document the
  resolution.
- Open a post-mortem before re-attempting mainnet.

## Sign-offs

- [ ] LLC owner / Matt: ______ Date: ______
- [ ] Counsel (opinion letter author): ______ Date: ______
- [ ] E&O underwriter notified: ______ Date: ______
