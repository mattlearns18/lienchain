# LienChain — National Market Analysis, Competitive Landscape & Valuation Frame

**Date:** July 30, 2026
**Prepared for:** Matt (founder)
**Scope:** What is LienChain worth at national scale, who competes with it, what the CLARITY Act means for it, and what business-model updates the research suggests.

> **Honest framing up front:** I'm not a financial advisor, and no one can hand you "the number" for a pre-revenue company. What this document gives you is the market data, the comparable companies, and the standard methodologies investors will actually use on you — so you can defend a range instead of guessing. Every external figure is sourced at the bottom.

---

## 1. Regulatory backdrop — the CLARITY Act

Where it stands as of late July 2026:

- The Senate Banking Committee advanced the Digital Asset Market Clarity Act on **May 14, 2026, in a 15–9 bipartisan vote**. It must still be reconciled with the Senate Agriculture Committee's companion (Digital Commodity Intermediaries Act), pass a 60-vote Senate floor vote, be reconciled with the House-passed version (H.R. 3633), and be signed.
- As of late July there is **no floor vote scheduled**, and the practical window for 2026 passage narrows sharply when the Senate leaves for its state work period around August 10.
- The bill covers exactly the territory LienChain lives in: **tokenization standards, customer-property and bankruptcy protections, and the commodity-vs-security boundary** for digital assets.

**What it means for LienChain specifically.** A tokenized medical lien is a receivable — a real-world asset (RWA) — not a speculative token. Under the frameworks in both chambers' bills, an instrument like PILIEN would most plausibly be treated as a tokenized representation of an underlying financial asset, meaning the *securities/receivables law* treatment of the underlying lien matters more than the token wrapper. Practical implications:

1. **Passage is upside, not a requirement.** LienChain's Phase-1 market (your own LienCo funding liens you originate) doesn't need CLARITY to operate — it needs state lien/assignment law (your opinion-letter work) and ordinary receivables-finance compliance. CLARITY matters most for the **secondary market** vision, where third parties buy and trade tokenized liens: clear rules for custody, transfer, and market intermediaries de-risk that roadmap enormously.
2. **The timing is favorable either way.** Institutional tokenization is proceeding *ahead* of the bill (BlackRock, Franklin Templeton, Apollo all run tokenized funds today). If CLARITY passes late 2026/early 2027, you'd be positioned in front of a wave; if it slips, the status quo still permits what you're building, with securities-law caution on the secondary market.
3. **The one thing to do now:** when the attorney opinion letter is scoped, add a question about whether a *fractionalized or transferable* tokenized lien interest constitutes a security offering under existing law (it very likely does when sold to passive investors) — that's the analysis that decides how the secondary market must be structured (e.g., Reg D 506(c) to accredited investors, like existing litigation-finance marketplaces do).

## 2. Market sizing — the national numbers

The addressable market stacks like this (all figures below are third-party estimates; sources at bottom):

| Layer | Size | What it is |
|---|---|---|
| PI medical treatment & billing | **~$53B/yr** | Total US personal-injury medical treatment industry (~39.5M injury treatments/yr) |
| PI settlements overall | **~$160B+/yr** | Total settlement dollars; roughly ⅓ legal fees, ⅓ medical, ⅓ plaintiff |
| Pre-settlement lawsuit funding | **~$22B (2026)** | The funded-litigation-finance market, growing ~12%/yr → ~$34B by 2030 |
| **Plaintiff medical funding (your niche)** | **~$4.6B+/yr funded, growing ~25%/yr** | Dollars actually deployed annually into lien/LOP medical receivables — this is LienChain's direct TAM |
| Tokenized RWA on-chain | **~$22–31B total; ~$8B private credit** | Where tokenized receivables live today; ~75% YoY growth |

**How to talk about TAM/SAM/SOM with investors:**

- **TAM:** ~$4.6B/yr of plaintiff medical funding deployed nationally, growing ~25%/yr — the fastest-growing corner of litigation finance. (Quote the $53B treatment market as context, not TAM — you don't capture treatment dollars, you capture funding flow and servicing fees on it.)
- **SAM:** funding flow in your operable states. MO + TX + NV today; TX alone is one of the largest LOP markets in the country (Texas LOP volume is a fixture of that market — it's why every national funder operates there). A defensible SAM claim: **$500M–$1B/yr** of fundable lien volume across your four active markets, scaling with each state added.
- **SOM (5-yr):** what you can plausibly originate and/or service. At $25–50M/yr originated volume (a mid-size regional funder's book) you'd be ~1% of TAM — aggressive but not fantasy given your existing clinic relationships.

## 3. Competitive landscape

Two different competitor sets, because LienChain straddles two industries:

### 3a. Traditional medical-lien funders and servicers (the incumbents)

| Company | Scale signals | Model | What they don't have |
|---|---|---|---|
| **Libra Solutions** (Oasis + Key Health + MoveDocs, PE-backed by Parthenon) | 40,000+ attorney and 7,000+ provider relationships; MoveDocs is the largest lien-management platform | Balance-sheet funder + servicing tech | No tokenization, no transparent on-chain settlement, no open secondary market |
| **Gain** (formerly Cherokee Funding) | National medical + plaintiff funding; heavy content/SEO presence | Balance-sheet funder + servicing | Same — closed book, opaque pricing |
| **Golden Pear Funding** | $600M+ funded since 2008; institutional bond issuer (SEC-filed notes) | Balance-sheet funder | Their bond docs prove the asset class securitizes — validation for you |
| **USClaims, LawCash, Peachtree, ML Healthcare, Key Health, PFD family** | Regional-to-national books | Funding and/or collection servicing | Fragmented; mostly manual lien tracking |
| **Percent × Vrde Group** | PI receivables offered on a private-credit marketplace | **Closest structural comp:** PI medical receivables as an investable private-credit product for accredited investors | Not tokenized on-chain; not clinic-facing origination software |

**Read on the field:** nobody in the incumbent set does what LienChain's architecture does — per-lien tokenization, on-chain settlement proof, embedded per-state compliance rules, and a path to a bid/ask secondary market. But the incumbents own the two scarce assets: **origination relationships** (attorneys + clinics) and **capital**. Your KC/STL clinic network is a genuine origination wedge; the Percent/Vrde listing proves investor appetite for exactly this asset class exists *right now*.

### 3b. RWA tokenization platforms (the technology adjacents)

Maple Finance, Centrifuge, Goldfinch, and Apollo's tokenized credit fund concentrate most of the ~$8B tokenized private credit. Centrifuge in particular tokenizes off-chain receivables (invoices, royalties, real estate bridge loans) as collateral. **None of them touch PI medical liens** — the asset requires exactly the domain knowledge (state lien statutes, LOP mechanics, settlement waterfalls, attorney relationships) that generalist DeFi credit platforms lack. That's the moat argument: the hard part of LienChain isn't the token, it's the compliance engine and the origination network. A generalist can't fork state statute handling.

## 4. What LienChain is worth — the valuation frame

Three lenses, honestly applied to where you are (pre-LLC, pre-revenue, testnet-proven product, mainnet-ready code, real clinic relationships):

### Lens 1 — Stage-based (what a seed investor pays today)

Pre-revenue fintech with a working product, regulated-asset domain expertise, and proprietary origination access typically raises seed at **$4M–$12M post-money** in the current market; vertical-fintech founders with deep industry networks (you: 4+ years scaling PI clinics) sit at the upper half of that band. Without revenue, the number is a negotiation anchored on (a) the wedge (clinic network), (b) the working software (nine shipped phases, backtested settlement engine), (c) the market growth rate (~25%/yr for the niche). **Today's defensible range: roughly $5M–$10M** — contingent on standing up the LLC, bank, E&O, and opinion letter, because institutional money can't close into a company that doesn't exist yet.

### Lens 2 — Milestone ladder (what makes the number move)

| Milestone | Valuation signal |
|---|---|
| LLC + bank + E&O + opinion letter | Unlocks any institutional conversation (table stakes, not value-add) |
| First real dollars through mainnet (even $250K–$1M funded) | Proof of end-to-end money movement → **$8M–$15M** conversations |
| $5–10M/yr originated volume at a ~20–30% purchase discount + servicing fee | Real unit economics → revenue-multiple territory |
| Third-party LienCos funding on the platform (marketplace turn) | Re-rate from "specialty funder" to "infrastructure/marketplace" multiples |
| Live secondary market with third-party buyers | The category-creation story — comparable to what made MoveDocs worth acquiring |

### Lens 3 — Scale math (the national-scale answer to your actual question)

At national scale the business is worth what its cash flows imply. Two archetypes:

- **Balance-sheet funder** (you buy liens): specialty-finance books trade at **1–2× book value / 4–8× earnings**. $100M deployed at a 25% gross discount margin and, say, 12% net margin after losses/cost of capital → ~$12M/yr earnings → **~$50M–$100M** enterprise value. This is the Golden Pear / Gain shape.
- **Marketplace/infrastructure** (others fund on your rails, you take origination + servicing + settlement fees): fintech marketplaces/infra trade at **6–12× revenue** (higher-growth, capital-light). If the platform touches $500M/yr of national lien flow at a blended 3–5% take rate → $15–25M revenue → **~$100M–$300M** enterprise value. This is why the model recommendation below matters: *the same volume is worth 2–3× more as a platform than as a book.*

For context on ceiling: Libra Solutions is a PE-scale platform assembled through multiple acquisitions precisely because servicing tech + origination network + capital at national scale commands institutional-buyer prices. That's the long-game comp.

## 5. Recommended model updates

Ranked by leverage, based on everything above:

1. **Run a two-sided model from day one: fund with LienCo, but build every contract and data structure as if third-party funders are coming.** The scale math above shows platform take-rate economics are worth a multiple of balance-sheet economics on identical volume. Practically: keep LienCo's book cleanly separable in the data model (it already is — `lienCoId` exists in the backtest harness; carry that into the app schema), and design the funding flow so "which LienCo funded this lien" is a field, not an assumption.
2. **Add a servicing-fee revenue line now, not later.** Incumbents monetize servicing (MoveDocs is a servicing platform first). Even while LienCo is the only funder, book an explicit 1–2% servicing/platform fee on each lien internally — it establishes the unit economics story investors will price, and forces the fee logic into the settlement waterfall while the code is fresh.
3. **Structure the secondary market as a Reg D private-credit offering to accredited investors, following the Percent/Vrde template** — that's the proven compliant wrapper for PI receivables today, and it works whether or not CLARITY passes. CLARITY passing later would let you widen access; it shouldn't be the dependency.
4. **Lead with the compliance engine in positioning.** Your differentiation vs. Centrifuge/Maple isn't "we tokenize" — it's "we encode state lien statutes into settlement execution" (the TX 72-hour flag, the dormant IN floor engine, per-state assignability). That's the story a generalist can't copy and an incumbent hasn't built. Consider branding it (e.g., "statute-aware settlement") in investor materials.
5. **Sequence states by LOP volume, not proximity.** The research keeps pointing at Texas as the deepest LOP market. TX is already active in the app; make it the growth market in the pitch (with the hospital-lien-priority opinion as the gating item), with FL and GA (both heavy LOP/lien states where Gain and Golden Pear concentrate) as the natural next adds after your current four.
6. **Add a "proof" page to the public site.** You have something no incumbent shows: verifiable on-chain settlement records. A public explorer-linked proof page (testnet now, mainnet later) is cheap marketing that doubles as investor diligence material — `phase1-proof.md` already contains the seed content.

## 6. Bugs found & fixed this pass (2026-07-30)

Full regression re-run first: backtest `OVERALL: ✓ PASS` (602 cases / 1,242 liens, 0 invariant failures), `waterfall.test.js` 27/27 against the real engine. Three UI-layer bugs found in the Phase-9/12 record-keeping modals, all fixed in commit `70c4bd2`:

1. **Fiat-receipt amount could be silently overwritten.** The prefill-sync effect re-ran on any waterfall recompute and replaced whatever the operator had typed in the Amount Received field. Now guarded by a `touched` flag — a hand-entered wire amount is never clobbered.
2. **Patient-disbursal modal prefill was missing entirely.** The Phase-12 modal never received the prefill-sync fix its Phase-9 sibling got — opened before the waterfall computed, its amount stuck at 0. Same guarded sync added.
3. **Evening records were dated tomorrow.** Both modals stamped "today" from the UTC clock, so a receipt recorded after ~6–7pm Central carried the next day's date — a real audit-trail defect for banking records. New `localTodayStr()` helper stamps the local day (mirroring the existing `parseLocalDate` read-side guard).

Verified post-fix: esbuild clean, 27/27 unit tests, backtest PASS. *(Push to GitHub must run from your machine — sandbox has no credentials: `cd ~/lienchain && git push origin main`.)*

---

## Sources

- [Congress.gov — H.R. 3633, Digital Asset Market Clarity Act](https://www.congress.gov/bill/119th-congress/house-bill/3633/text)
- [Davis Wright Tremaine — Senate Banking advances crypto market structure bill (May 2026)](https://www.dwt.com/blogs/financial-services-law-advisor/2026/05/senate-banking-crypto-market-structure-bill)
- [Skadden — CLARITY Act tax implications (June 2026)](https://www.skadden.com/insights/publications/2026/06/insights-june-2026/clarity-act)
- [Cahill — Crypto market structure client alert (May 2026)](https://www.cahill.com/publications/client-alerts/2026-05-15-slowly-then-all-at-once-the-sun-rises-on-crypto-market-structure-in-the-us)
- [Latham & Watkins — US crypto policy tracker](https://www.lw.com/en/us-crypto-policy-tracker/legislative-developments)
- [Research and Markets — Pre-settlement lawsuit funding market report 2026](https://www.researchandmarkets.com/reports/6170585/pre-settlement-lawsuit-funding-market-report)
- [Research Nester — Litigation funding investment market](https://www.researchnester.com/reports/litigation-funding-investment-market/2800)
- [DoctorMgt — PI billing/collections market (~$53B, 39.5M treatments)](https://doctormgt.com/personal-injury-billing-and-pi-lien-collection/)
- [AccidentDoctor — PI receivables market breakdown ($4.6B+ plaintiff medical funding/yr)](https://accidentdoctor.org/purchasing-personal-injury-receivables/)
- [Eco — Tokenized RWA market size 2026 (~$22B AUM)](https://eco.com/support/en/articles/15254020-tokenized-rwa-market-size-2026-20b-aum-growth-trajectory)
- [Finextra — Reading the 2026 RWA numbers (~$31B July 2026)](https://www.finextra.com/blogposting/31625/tokenized-real-world-assets-reading-the-2026-numbers-behind-the-headline-growth)
- [Businesswire — Oasis Financial becomes Libra Solutions (40k attorneys, 7k providers)](https://www.businesswire.com/news/home/20220223005806/en/Oasis-Financial-Becomes-Libra-Solutions-as-Offerings-Grow)
- [Golden Pear Funding — SEC-filed note offering](https://www.sec.gov/Archives/edgar/data/1833973/000110465923077042/tm2320355d1_ex99-1.htm)
- [Percent — Welcoming Vrde Group (PI receivables on a private-credit marketplace)](https://percent.com/blog/welcoming-vrde-group)
- [Gain (formerly Cherokee Funding)](https://gainservicing.com/selling-letter-of-protection-receivables-and-medical-liens/)
