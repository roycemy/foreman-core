# Hooks checklist (export `public/index.html`)

All existing ids, classes, data attributes, globals and route keys from AUDIT.md §2.6 are kept. The build script (`tools/build_index.py`) uses exact-match edits that fail loudly if upstream changes.

## Existing hooks: preserved
- [x] Shell: `#nav`, `nav a[data-v]`, `.view`, `#v-office #v-approvals #v-receipts #v-stubs #v-policies #v-work #v-money #v-cards`, `#sum` (`a.nlink[href="#approvals"] .n`), `#strip`, `#toast`, `#modal`, `#modal .box`
- [x] Floor: `#floor`, `#chl`, `#deskl`, `#worker-labels`, `#ct-{lounge,marketing,sales,finance,ops}` (plus new `#ct-approval`), `#diorama-tools #zoom-in #zoom-out`, `#floor-workers [data-worker]`, `#floor-approval`
- [x] Drawer: `#dr`, `.x`, `#worker-room` (`onchange=moveRoom`), `.stp`, `.seg`
- [x] Emergency: `#emer` (now an icon button, still `#emer`), `#emer2` (kept in the DOM and hidden; `#emer` is visible at every width), `#emodal #epause #erevoke #eclose`
- [x] Goal bar: `#goalbar #gf #gi #goalst`; `#addb`; `#recap` (kept, hidden as before)
- [x] Auth: `#fmauth #aue #aup #auc #aur #aug #aum #aucl #aus #fmso`, `#fmempty #fmempty1`
- [x] Work: `#tf #tt #ta #tl`, `.task-story`, `.unlinked-story`
- [x] Permissions: `#v-policies` input focus guard, `[data-pillars]`, `#lim-p #lim-d`
- [x] Team: `.team-row .team-worker .team-metrics .team-actions`; Money: `.money-totals`, `[data-money-id][data-decision]`
- [x] Approvals: the delegated `[data-r]`/`[data-d]` click handler (strip, Needs You, island card)
- [x] Card sandbox: `#cardkill #cardbot #cardmerchant #cardamount #cardpurpose #cardpropose #cap-{id} [data-cap] [data-card][data-decision] #carderror`
- [x] Connect: `[data-link] #linkname #linkrole #linkpreset #linkcreate #linkerr #copysetup #copylink #setupfallback #linkstatus #linkclose`
- [x] Globals: `openDr closeDr pickBot setPerm setPol revokeBot rmAgent moveRoom saveLimits openAdd`
- [x] Route keys: office, work, approvals, stubs, policies, receipts→work, money, cards
- [x] API calls: unchanged (no endpoint, method or body was edited)

## New hooks
| Hook | Purpose |
|---|---|
| `/brand.js` → `window.BRAND {name, upper, short, wordmarkHTML, appUrl, siteUrl, t(), fill()}` | the one source of truth for the product name |
| `[data-brand]`, `[data-brand="upper"]`, `[data-brand-wordmark]`, `[data-brand-attr="attr:{brand} …"]`, `[data-brand-href="appUrl"]`, `title[data-brand-title]` | static slots; each keeps neutral no-JS text |
| `--brand-name`, `--brand-upper`, `--brand-short` | CSS custom properties set by brand.js |
| `window.presenceOf(rawAgent)` → `prepared \| waiting \| connected \| reconnect \| revoked` | reads `agent.connection.status` (PR #4); a stale heartbeat never counts as connected |
| `data-presence` on `.ch`, `.worker-label`, `.team-row`, `#dr-presence`, `#linkstatus`; `.pres[data-presence]` chips | the four presence states |
| `window.reconnectBot(agentId)`, `[data-reconnect="<id>"]` (Team row, drawer) | reopens connect step 2 for the EXISTING bot (`#reconnectnote`, `.cw[data-mode=reconnect]`) |
| `window.__linkWaiting` | id of the bot whose connect step 2 is open (Prepared vs Waiting for `awaiting_bot`) |
| `#cursorinstall` | PR #3 deeplink, kept as-is (same `href` builder; name now `BRAND.name`) |
| `.cw-actions` (holds `#copysetup` and `#cursorinstall`), `#cwx`, `#cw-title`, `.cw-steps` | step 2 action pair; dialog chrome |
| `#acct`, `#acctbtn`, `#acctmenu`, `#acctmail`, `#acctini` | account menu; `#fmso` is now created inside `#acctmenu` |
| `#floorwrap`, `#fa-lead`, `.fa-*` | floor scroller, island leader line, approval card parts |
| `window.HQ_FLOOR {W2P, P2W, route, fit}`, `window.figureSVG`, `window.avatarHTML`, `window.identityOf` | floor geometry and identity helpers |
| `aria-keyshortcuts="A"/"D"` on the island buttons | A and D keys approve or deny at the island (ignored while typing) |
| `.skip-link`, `main#main` | keyboard skip link |
