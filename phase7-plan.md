# Phase 7 Plan — Portfolio Analytics Dashboard

This is the implementation spec for Phase 7. Hand it to Claude Code as the source of truth. Commit-level handoffs land in `.cowork-handoff.md` one at a time.

## Goal

Turn the **Dashboard** tab on the operator dashboard into a real analytics surface. KPI tiles + two charts + an aging-buckets table, sitting above the existing wallet panel and activity feed. Pitch-deck ready for board updates and investor conversations. Read-only over existing data — no new minting flows, no new write paths beyond the small data model additions in §Data Model Additions below.

Target audience: clinic owners who are also LienCo investors (per CLAUDE.md §1 — same audience). Numbers they care about: how much capital is deployed, what's coming back, where the exposure sits, how aged the book is.

## Location

Enhance the existing **Dashboard** tab. Don't add a 6th tab. The current Dashboard content (slim stats summary + wallet panel + activity feed) becomes:

```
[ KPI tile row — 6 tiles ]
[ Chart row — Exposure by market | Recovery rate over time ]
[ Aging buckets table ]
─── existing content below ───
[ Wallet panel (6 wallets, XRP balances) ]
[ Live activity feed (recent XRPL TXs) ]
```

The existing slim stats summary on Dashboard (count + total bill + avg split) gets replaced by the new tile row.

## Data Model Additions

Two new fields on the `lien` object. Both are written by existing code paths — small additions, no schema migration needed for legacy data (handle missing values gracefully).

### `lien.recovery` (number)

The LienCo recovery dollar amount for this clinic lien after settlement. Computed from the waterfall output (`calcWaterfall` result's per-clinic `lienCoShare`). Written when the multi-clinic sequential settlement flow fires `onSettled` for each clinic (the same callback that now writes `tx2`). Stays `null` while `status === 'Active'`.

### `lien.settledAt` (ISO timestamp)

The moment the lien flipped from `Active` to `Settled`. Written in the same `onSettled` callback. Stays `null` while Active.

### Legacy / mock data handling

- Seed liens already at `status: 'Settled'` (the 4 hardcoded mocks): give them sensible defaults at the data-source layer. `recovery = bill × split / 100` (the LienCo share, as if the case fully covered the bill). `settledAt = ts + 6 months` (rough placeholder so days-to-settle has a value). Mark these as derived values in the source so future cleanup can replace them.
- Wizard-minted liens settled before this commit: same treatment. They have a `tx2` populated but no `recovery` / `settledAt` — backfill with derived values on read.
- Active liens: `recovery` and `settledAt` stay `null`. Analytics that depend on these fields ignore Active liens.

## KPI Tiles (6)

Row of 6 tiles across the top of the Dashboard tab. Each tile: title (small caps), value (large), optional sub-text (delta or qualifier).

| # | Title | Value | Sub-text | Computation |
|---|---|---|---|---|
| 1 | TOTAL DEPLOYED CAPITAL | $X | across N liens | sum(`lien.purchasePrice ?? lien.bill × 0.78`) over all liens |
| 2 | TOTAL AT-RISK EXPOSURE | $X | N active liens | sum(`lien.bill`) where `status === 'Active'` |
| 3 | RECOVERY RATE | X% | lifetime, settled liens | sum(`lien.recovery`) / sum(`lien.purchasePrice`) over settled liens, × 100 |
| 4 | AVG DAYS TO SETTLE | X days | N settled liens | avg(days between `lien.ts` and `lien.settledAt`) over settled liens |
| 5 | ACTIVE CASES | N | N clinic liens | distinct case count + clinic lien count, both shown |
| 6 | SETTLED CASES | N | $X recovered | distinct settled case count + sum recovery |

Sub-text for tile 3 (Recovery Rate): if `recovery > purchasePrice` (profitable), show a small green up-arrow. If `recovery < purchasePrice` (loss), red down-arrow. Both rendered next to the percentage.

Tile 6's "case-level settled" rolls up to a case being Settled only when every clinic lien on it is. (Phase 5 cleanup already wired this — `case.status === 'Settled'` is reliable.)

## Charts

Use `recharts` — already a project dependency per CLAUDE.md §2. Inline import: `import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, LineChart, Line, CartesianGrid, ResponsiveContainer } from 'recharts'`.

### Chart 1 — Exposure by Market (Stacked Bar)

For each market (KC, STL, TX, NV, IN — exclude "All"), show two stacked segments: Active bills + Settled bills. X axis = market code. Y axis = dollars. Legend shows Active (one color) and Settled (another).

Data shape:
```js
[
  { market: 'KC',  active: 8500,  settled: 0 },
  { market: 'STL', active: 7000,  settled: 0 },
  { market: 'TX',  active: 18400, settled: 0 },
  { market: 'NV',  active: 12400, settled: 0 },
  { market: 'IN',  active: 19800, settled: 0 },
]
```

(Numbers above are illustrative — derive from the actual lien list at render time.)

Card title above the chart: "Exposure by Market". Sub-text: "Active vs. settled bill amounts across each state."

### Chart 2 — Recovery Rate Over Time (Line)

Monthly buckets along the X axis (last 12 months or all time since the first settled lien, whichever is shorter). Y axis = recovery rate % for that month's settled liens. Single line.

Bucket math: group settled liens by `monthOf(settledAt)`. For each month: `sum(recovery) / sum(purchasePrice) × 100`. If a month has no settled liens, omit it from the chart (don't draw 0).

Card title: "Recovery Rate Over Time". Sub-text: "Monthly weighted average for settled liens."

With only 4-5 settled liens in the seed data, the chart will be sparse. That's expected — it fills in as cases settle. Show a "Not enough data yet" placeholder if fewer than 2 distinct months have data.

## Aging Buckets Table

Below the charts. For Active liens only, group by age = `today - lien.ts`:

| Bucket | Active Liens | Total Bills | % of At-Risk |
|---|---|---|---|
| 0–90 days | N | $X | Y% |
| 91–180 days | N | $X | Y% |
| 181–365 days | N | $X | Y% |
| 365+ days | N | $X | Y% |

"% of At-Risk" = bucket's total bills / total at-risk exposure (KPI tile 2). The 365+ bucket is the danger zone — old unsettled liens. Worth a red-tinted row when count > 0.

## Out of Scope (Phase 7)

- Clickable drill-downs (tile click → filtered Liens tab). Defer to a polish commit if time allows.
- Time-range filter (last 30/90/365 days). Phase 7 is lifetime metrics only.
- Per-attorney or per-clinic performance breakdowns. Future phase.
- Real-time updates / auto-refresh. Numbers update on existing refresh button click + tab switch.
- Export to CSV. Future phase.

## Suggested Commit Slicing

Two commits, each independently shippable:

1. **Data model additions + KPI tile row.** Adds `recovery` and `settledAt` to lien on settlement, derives defaults for legacy/mock liens, replaces existing Dashboard stats summary with the 6-tile row. Most of the value, fastest visible progress. ~3 days.
2. **Charts + aging table.** Adds the two recharts components and the aging-buckets table below the tiles. ~3 days.

## Test Plan

After each commit, verify on the live site:

**Commit 1 (data model + tiles):**
- Dashboard tab loads with 6 KPI tiles at top.
- Numbers tie out to the localStorage state — manually compute "total deployed capital" from `lien.purchasePrice` sum and compare to tile value.
- Settle a fresh test case via Attorney View → confirm `lien.recovery` and `lien.settledAt` are written to localStorage afterwards.
- Existing Dashboard content (wallet panel + activity feed) still renders below the new tiles, unchanged.

**Commit 2 (charts + aging):**
- Exposure-by-Market bar chart shows the 5 markets with active/settled stacks.
- Recovery-rate line chart renders (or shows placeholder if fewer than 2 months of data).
- Aging buckets table shows correct counts per bucket. Manually pick one Active lien, compute its age from `lien.ts`, confirm it lands in the right bucket.
- 365+ bucket row is red-tinted when count > 0.

## Open Implementation Questions for Claude Code

Suggested defaults; Claude Code can proceed unless Matt overrides:

1. **Tile layout responsive behavior.** 6 tiles in a single row on desktop, 3+3 stacked on tablet, 2+2+2 on mobile. Default: CSS grid with `grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))` so it flows naturally.
2. **Recovery rate display when no settled liens.** Show `—` not `0%` or `NaN`.
3. **Chart colors.** Active = the existing TX hash blue (`#0066cc` or similar from the project palette); Settled = the existing success green. Reuse what's in `Dashboard.css`.
4. **Days-to-settle rounding.** Round to whole days for display. Computation in ms internally.

## Handoff Pattern (unchanged from Phase 6)

Each commit gets its own `.cowork-handoff.md`. Cowork writes the handoff. Matt runs Claude Code with the standard prompt:

```
Read /Users/matthewsabine/lienchain/.cowork-handoff.md from this repo.
Execute the plan exactly as written — commit with the message in the file,
push to main, and append a brief status report to
/Users/matthewsabine/lienchain/.cowork-handoff-result.md when done.
Flag any deviation in the result file.
```
