# Phase 8 Plan — Attorney Provisioning + Invite Flow

This is the implementation spec for Phase 8. Hand it to Claude Code as the source of truth. Commit-level handoffs land in `.cowork-handoff.md` one at a time.

## Goal

Today `/attorney/:caseId` works but there's no way to actually provision an attorney to a case or send them a unique portal URL — Matt is the messenger by typing or texting links. Phase 8 closes that gap.

By end of phase, Matt can:

1. Open a case in the operator dashboard
2. Click **Invite Attorney**
3. Pick an attorney from a registry (or add a new one)
4. Get a unique invite URL with token
5. Send it via mailto: prefilled email, or copy-paste it
6. The attorney clicks the link, lands on `/attorney/:caseId?token=X`, sees the case in attorney mode after the token validates

Unblocks the credibility-building moment of Phase 8 in the larger arc: real PI attorneys provisioned to real cases, using the portal in their own browsers, on their own time. Removes Matt-as-messenger.

## Scope (Two Commits)

### Commit 1 — Attorney registry + invite generation (operator side)

**Data model additions** (localStorage, no schema migration):

- New key `lienchain:attorneys` — array of attorney records:
  ```js
  {
    id:        'ATTY-' + nanoid(8),   // stable internal id
    name:      'Jane Smith, Esq.',
    firm:      'Smith & Associates',
    barNumber: 'MO-54321',             // optional, free text
    email:     'jane@smithlaw.com',
    addedAt:   ISO timestamp,
  }
  ```

- New optional field on Case: `attorneyAssignment` (one per case, replaced on reassign):
  ```js
  {
    attorneyId:  'ATTY-...',
    token:       crypto.randomUUID(),
    sentAt:      ISO timestamp,
    acceptedAt:  ISO timestamp | null,  // set on first valid token-bearing visit
  }
  ```

The existing `case.attorney` string field stays as a free-text display name (preserved for backward compat with existing seed cases). Going forward, `attorneyAssignment.attorneyId` is the link to the registry entry; UI prefers the registry attorney's `name` over `case.attorney` when both exist.

**UI — Attorney registry panel.** New section on the operator Dashboard tab below the activity feed (or as a small standalone view). Title: "Attorneys". Shows a list of registered attorneys with name, firm, email. "+ Add Attorney" button opens a modal with name/firm/bar/email fields. Edit and Delete actions per row.

**UI — Invite modal.** On any case (entry point: a new "Invite Attorney" button next to the existing "Attorney View →" in the Liens tab parent row, AND inside the Attorney View tab's case header):

- Modal title: "Invite Attorney to {caseId}"
- Picker: select from registered attorneys, OR "+ Add new attorney"
- On submit: write `case.attorneyAssignment = { attorneyId, token: crypto.randomUUID(), sentAt: now, acceptedAt: null }`
- Show generated invite URL: `https://lienchain.vercel.app/attorney/{caseId}?token={token}`
- Two CTAs:
  - **Copy invite link** — clipboard
  - **Open email** — mailto: with prefilled subject (`"Lien case access — {caseId}"`) and body (introduces LienChain in 2 sentences + the URL)
- If the case already has an `attorneyAssignment`, show "This case was sent to {name} on {date}" with options to resend (regenerates token) or reassign (picks a different attorney, voids previous token).

### Commit 2 — Token validation + attorney session

**`/attorney/:caseId` URL handling.** Parse `?token=X` from the URL on mount. Compare to `case.attorneyAssignment.token`:

- **Valid token:** Render the existing attorney portal (waterfall, reductions, settle action — all unchanged). On first successful render: write `case.attorneyAssignment.acceptedAt = now`. Persist the accepted `{caseId, token}` pair to a new localStorage key `lienchain:attorneySessions` so the attorney doesn't need the URL token on subsequent visits from the same browser.
- **Missing token (no `?token=` at all):** Check `lienchain:attorneySessions` for a previously-accepted session for this caseId. If found, render normally. If not, show the "Access required" page below.
- **Invalid token (doesn't match):** Show "Access required" page.

**"Access required" page.** Replaces the existing case view when token check fails. Copy:

> ### Access required for {caseId}
>
> This case requires an invitation from the case operator. If you've received an email with a link, click the link directly — don't copy just the URL into your browser, the access token is part of the link.
>
> If you haven't received an invite or believe this is an error, contact the operator who shared this case with you.

Below: a "← Back to LienChain" link to `/`.

**Operator-side override.** Inside the operator Dashboard's Attorney View tab (which today previews cases for the operator's own review), continue to render WITHOUT token validation. The token gate only applies to direct `/attorney/:caseId` URL visits. Detection: if the page is rendered from inside the dashboard route, skip the gate; if rendered from `/attorney/:caseId` route directly, apply the gate. (`useLocation` or `useRouteMatch` to distinguish.)

**Operator dashboard updates.** In the Liens tab, show an "Invited" badge on cases with `attorneyAssignment.sentAt && !acceptedAt`. Show an "Accepted" badge once `acceptedAt` is set. Both are small pill-style indicators next to the case ID.

## Out of Scope (Phase 9+)

- Real authentication. Token-in-URL is good enough for testnet/demo with named friendly attorneys. Phase 9 mainnet readiness wraps in real auth (magic link via real email service, or OAuth via attorney email provider).
- Email delivery from the app. mailto: is the entire email mechanism for now. No SendGrid, no backend SMTP.
- Token expiry. Tokens live forever once issued. "Revoke" via reassign-to-different-attorney is the only invalidation path.
- Multiple attorneys per case. One active attorney per case. Reassign replaces.
- Attorney-side dashboard ("see all my cases"). Phase 8 is per-case access only.

## Suggested Commit Slicing

1. **Attorney registry + invite generation (operator side).** Data model, registry panel, invite modal, URL generation. No URL gate yet — `/attorney/:caseId` still openly accessible regardless of token. ~3-4 days.
2. **Token validation + attorney session + badges.** URL gate, session persistence, "Access required" page, operator-side override, invited/accepted badges. ~3-4 days.

## Test Plan

After each commit, verify on the live site:

**Commit 1:**
- Add 2-3 test attorneys to the registry via "+ Add Attorney" modal. Confirm they persist across reloads.
- Open a case → "Invite Attorney" → pick an attorney → confirm URL is generated and contains a UUID-shaped token.
- Confirm `case.attorneyAssignment` is written to localStorage with the four expected fields.
- Click "Open email" — confirm a mailto: opens with prefilled subject/body and the URL.
- Open the case again → confirm the modal shows "This case was sent to {name} on {date}" with resend/reassign options.

**Commit 2:**
- Open `/attorney/:caseId` directly in a fresh browser window with NO `?token=` → confirm "Access required" page renders.
- Open the URL with the correct `?token=` from the invite → confirm the full attorney portal renders. Confirm `acceptedAt` is now written. Re-open without `?token=` → confirm the session-persisted access still works.
- Open with an invalid token (`?token=garbage`) → confirm "Access required" page.
- In the operator dashboard, click Attorney View tab and select the case → confirm it still renders without needing a token (operator-side override).
- After invite-and-accept, confirm the Liens tab parent row shows the "Accepted" badge.

## Open Implementation Questions for Claude Code

Suggested defaults:

1. **Attorney registry persistence and seed.** Start with an empty registry (no seed attorneys). Matt adds his real KC/STL attorney contacts as the registry's first entries. Don't backfill the existing seed cases' free-text `attorney` strings into registry entries — they're mock data, not real people.
2. **Token format.** `crypto.randomUUID()` — 36 chars, hyphenated, browser-native. No JWT signing for Phase 8 (Phase 9 may upgrade).
3. **Token URL placement.** Query string (`?token=X`) not path segment, so the case URL stays clean if shared without the token.
4. **Existing free-text `case.attorney`.** Preserved. Display priority: if `attorneyAssignment.attorneyId` exists and resolves to a registry entry, show that attorney's name/firm; otherwise fall back to the free-text `case.attorney` string. Same for the email field on the invite-resend flow (use registry email, fall back to nothing).

## Handoff Pattern (unchanged)

Each commit gets its own `.cowork-handoff.md`. Standard prompt:

```
Read /Users/matthewsabine/lienchain/.cowork-handoff.md from this repo.
Execute the plan exactly as written — commit with the message in the file,
push to main, and append a brief status report to
/Users/matthewsabine/lienchain/.cowork-handoff-result.md when done.
Flag any deviation in the result file.
```
