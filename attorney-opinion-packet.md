# LienChain — Attorney Opinion Letter Engagement Packet

**Prepared:** July 30, 2026
**Purpose:** Everything needed to engage a healthcare-lien / litigation-finance attorney and come away with a usable opinion letter before LienChain accepts real money (mainnet).

> This packet was prepared with AI assistance and is not legal advice. It's structured so an attorney can quickly understand the business and answer precisely the questions that gate mainnet launch.

---

## 1. Who to hire

You want an attorney (or small firm) with **healthcare receivables / medical lien finance** experience — ideally one who has papered lien purchase deals for funders like the ones in your market (Gain, Golden Pear, Key Health-style operations). Litigation-finance specialty groups at regional firms do this routinely. A generalist business attorney will spend your money learning the asset class.

Ask directly in the first call: *"Have you issued enforceability opinions on medical lien purchases or letter-of-protection receivables? In which states?"* If the answer is no, keep looking.

Prioritize **Missouri and Texas** opinions first (your home market + your deepest growth market). Nevada can follow. Indiana is retired as a go-forward market — no opinion needed unless you re-activate it.

## 2. One-page business description (give this verbatim)

LienChain is a software platform operated by [LLC name — in formation] ("LienCo"). LienCo purchases medical lien receivables from personal-injury clinics at a discount to face value. The clinic treats a PI patient under a lien or letter of protection; LienCo pays the clinic cash now and takes assignment of the clinic's right to payment from the eventual settlement. When the case settles, the plaintiff's attorney remits settlement funds to LienCo by wire or check; LienCo then disburses the clinic's agreed share.

The platform records each purchased lien as a token on the XRP Ledger, a public blockchain. **The token is a record-keeping and settlement-automation layer, not the legal instrument itself** — the underlying assignment is documented in a conventional written purchase agreement between LienCo and the clinic. Actual money moves by ordinary banking (wire/check); the platform additionally executes on-chain transactions that create a permanent public audit trail of each settlement and split.

Key operating parameters: LienCo's share of the settlement recovery is contractually agreed per lien (typically 70%, range-checked in software); multi-provider cases distribute a short settlement pool pro-rata across providers; the platform enforces state-specific rules in code (e.g., a Texas 72-hour filing-window advisory). Current markets: Missouri (Kansas City, St. Louis), Texas, Nevada. All activity to date is on the XRPL testnet with no real funds; mainnet (real-money) launch is gated on this opinion letter, entity formation, banking, and E&O coverage.

## 3. The questions to put to the attorney

These are the questions the engagement should answer, in priority order. Ask for the opinion letter to cover A–C formally; D–G can be a guidance memo.

**A. Enforceability & assignability (the core opinion).** Is LienCo's purchase-and-assignment of a clinic's PI medical lien / LOP receivable valid and enforceable against the settlement proceeds in Missouri, Texas, and Nevada? What must the purchase agreement contain for the assignment to hold up? Are there anti-assignment doctrines, and do they apply to provider-side receivables (as opposed to a plaintiff's claim)?

**B. Perfection & priority.** What perfects LienCo's interest in each state — UCC Article 9 financing statement, statutory lien filing, attorney/patient notice, or some combination? Where does LienCo's interest rank against hospital liens (Texas Health & Safety Code §55.005 specifically), health-insurer subrogation, Medicare/Medicaid liens, and the attorney's fee lien? *(The platform currently shows a Texas hospital-lien priority warning but distributes pro-rata — we need to know if the waterfall must enforce true priority tiers in TX.)*

**C. Characterization risk.** Will the purchase be respected as a **true sale** of a receivable, or could it be recharacterized as a loan to the clinic (triggering usury/lending-license issues) — and what deal terms (recourse, repurchase obligations, discount size) push it either way? Any champerty/maintenance/barratry exposure in these states for provider-side funding?

**D. The securities question (gates the secondary-market roadmap).** If LienChain later sells or resells tokenized lien interests — whole or fractional — to third-party investors, is that an offer of securities under Howey/Reves? Assume yes and advise on structure: is a Reg D 506(c) accredited-investor offering (the structure used by existing PI-receivable marketplace listings, e.g. Percent/Vrde) the right wrapper? Does the pending CLARITY Act change the analysis if enacted?

**E. The token wrapper.** Does recording the lien on a public blockchain, with transaction memos, affect validity or enforceability of the underlying assignment? Any issues under UETA/ESIGN with maintaining the authoritative record this way? (Our position: the written agreement is authoritative; the token is a derivative record. Confirm this is the right structure.)

**F. Privacy / HIPAA.** On-chain memos currently contain: case ID, clinic name, dollar amounts, timestamps — **no patient name or medical information**. Confirm this is outside PHI, and advise what fields must never appear on-chain. Also: does LienCo's role make it a HIPAA business associate of the clinics, requiring BAAs?

**G. Patient/consumer touchpoints.** Any required patient notice or consent when a clinic assigns its lien? Any consumer-protection or disclosure regimes (state litigation-funding statutes have been spreading — several states now regulate *plaintiff-side* funding; confirm provider-side purchases are outside them or comply).

## 4. What to hand the attorney with this packet

1. **This packet** (sections 2–3 are the brief).
2. **A sample/draft lien purchase agreement.** ⚠️ *Gap: this doesn't exist yet.* Ask the attorney to draft or template it as part of the engagement — the opinion will be "assuming an agreement containing X, Y, Z," so having them draft X, Y, Z is the efficient path.
3. **A sample letter of protection** from one of your clinic relationships (redact patient info).
4. **The intake data-field list** — what the platform captures per lien: clinic, market/state, bill amount, purchase price, split %, attorney firm + bar number, treatment period, case ID.
5. **Settlement mechanics description** — from the README and `backtest-report.md` §1: attorney wires settlement → operator records fiat receipt → platform executes split payouts; multi-clinic pro-rata; the dormant Indiana 20% floor engine as an example of statute-encoded rules.
6. **`phase1-proof.md` / the live `/proof` page** — so they see exactly what an on-chain settlement record contains (this is what the HIPAA/memo question is about).
7. **`MAINNET-READINESS.md`** — shows them mainnet is gated on their work product, plus entity/bank/E&O.

## 5. What to ask for as deliverables

- A **written enforceability + perfection opinion** for Missouri and Texas (Nevada optional now or later), addressed to [LLC], covering §3 A–C.
- A **guidance memo** on §3 D–G (securities structure, token wrapper, HIPAA, consumer touchpoints).
- A **form lien purchase agreement** (with per-state riders if needed) that the opinion assumes.
- A short list of **operational requirements** the platform must implement (filings, notices, record retention) — these become engineering tickets.

## 6. Practical notes

- Scope MO + TX first; add NV as a cheaper follow-on once the framework exists. Per-state formal opinions are the expensive part — the guidance memo amortizes across all states.
- Ask for the securities analysis (D) even though the secondary market is future roadmap — it's dramatically cheaper to structure the data model and contracts for it now than to re-paper later, and investors will ask whether you've had the analysis done.
- When the engagement letter comes back, confirm the opinion can be **relied upon by investors and lenders** (a "reliance" provision) — an opinion only you can rely on is worth much less in a fundraise.
- Budget expectation: formal opinions are billed as fixed-fee or capped engagements at reputable firms — get two quotes. The draft purchase agreement + memo + two-state opinion is a well-defined, quotable package.

## 7. Open items on your side before the engagement

- **Form the LLC** (the opinion is addressed to an entity; "in formation" weakens it).
- Pick the **stablecoin/mainnet money format** question timing — not needed for the opinion, but if the attorney is crypto-literate, D and E can cover it in the same memo.
- Decide whether **Indiana re-activation** is realistic enough to pay for an IN opinion now (the platform kept the IN compliance engine dormant; the legal side can stay dormant too).
