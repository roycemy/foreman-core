# Paste into Claude Code (run at the foreman-core repo root)

You are applying an owner-approved rebrand (Black Box → **Alter**, logo "H1 island tray") and the vNext + round L screen designs. These are visual and copy changes. **Do not change any API contract, route, endpoint, request body or server behavior.** The mockups in `screens/` are static references, not drop-in code: port their look into the real components.

## Inputs
Unzip `alter-design-pack.zip` into `./alter-pack/`. Read `CHANGES.md`, then look at `shots/00-overview.png`.

## 1. Brand (do first)
1. In `public/brand.js` set `name: 'Alter'` and `upper: 'alter'` (the wordmark is lowercase bold Geist, not caps). Rebuild anything derived from it (titles, aria-labels, OAuth consent `{brand}` slots, Cursor deeplink server name).
2. Copy `alter-pack/brand/*` to `public/brand/`. Favicon: `<link rel="icon" href="/brand/favicon.svg">` plus `favicon-32.png` / `favicon-16.png` fallbacks; `apple-touch-icon` = `alter-icon-light-180.png`.
3. Replace every old mark (bordered square with red bar, in CSS `.mark`/`.wm .mark` and the inline favicon) with `alter-mark.svg` (idle: `alter-mark-idle.svg` when nothing waits). On the dark card use `alter-mark-card.svg` (#ECE9E2).
4. Lockup text "alter" must be live text in Geist 700, letter-spacing −0.045em (the SVG lockups need Geist loaded; outline them if used as images).

## 2. Tokens
Merge `alter-pack/tokens.css` into `public/styles/tokens.css`. Keep existing variable names; map them to the new values. Geist only; Geist Mono only for real code. No uppercase labels.

## 3. Screens (port in this order; match shots at 1440 and 390)
1. Top bar: Floor / Receipts / Card + Inbox button with count. Remove Work, Team, Permissions and Card sandbox tabs (routes stay; just unlinked). Phone nav: Inbox / Receipts / Card. (`05`, `11`)
2. "Anything on me?" pop-down from Inbox, incl. empty state. (`06`)
3. Floor: island B (flat porcelain tray; vermilion dot only while a request waits). **Remove the old red island baked into the floor art** (use the no-island floor asset; draw island B as its own layer). Collab dotted line + small card, activity glyph badges. (`01–04`)
4. Bot panel + permissions. (`07`)
5. Receipts list and public receipt + OG image; Alter mark in the receipt footer. Wording "model costs". (`08`, `09`)
6. Card page with bot trust rows ("N decisions · M blocked", "Not enough data yet" under 5) and footnote. Never show a score. (`10`, `14`)
7. Sandbox rules: 520px dialog on desktop, full page on phone. Label is **"Max per purchase"**. Blank field = no extra limit. (`13`)
8. Authorization demo page: six scenarios, sentence-case Allow / Deny / Ask, plain reasons, grey rule names, "Real charge: $0.00 on every scenario." (`12`)
9. Landing: H1 mark, rounded ink primary buttons, hero art = the vNext floor, "Sandbox. No real money moves." (`15`)

Keep the line **"Sandbox. No real money moves."** wherever money appears in test mode. Do not change the meaning of any rule or the owner-approval requirement.

## 4. Verify
- `rg -i "black ?box" public/` returns nothing user-facing.
- Favicon dot visible at 16px; mark visible on the dark card.
- Re-run the existing `verify.js` suite; all hooks in `HOOKS.md` still exist.
- Screenshot each screen at 1440 and 390 and compare with `alter-pack/shots/`.
