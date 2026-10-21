# Implement Alter design pack v2 in foreman-core
Read SPEC.md and CONFLICTS.md first. Keep all behavior; change look only. Don't touch api/, auth, payments, card adapter.

1. **Tokens**: merge `tokens.css` into `public/styles/tokens.css` (new: room tints, `--dock`, `--dock-phone`, motion durations, `--sh-float`, `--v-glow`).
2. **Brand**: replace mark in `public/brand/` + `public/brand.js` with `brand/alter-mark-lit.svg` / `-idle.svg` (L2). Show the lit variant only when Inbox count > 0 (same source as the tray dot). Favicon from `brand/favicon.svg` (L1), icons in `public/manifest.webmanifest`.
3. **Dock fix (A)**: in `public/app.html` wrap floor in `.stage`; move hero heading, chips, type box, crew pill, zoom into `.dock` (components/dock.html/css). In `public/js/floor.js`, replace the `hh = … 120` hero offset with stage sizing, run pan through `AlterDock.clamp`, dispatch `alter:pan` on pointer pan/wheel (components/dock.js).
4. **Rooms (C)**: in `public/js/floor.js` replace `ROOM_TYPES`/`ROOM_MAP` with the 7 rooms in IDEAS.md (backend keys stay; mailroom → meeting; add review, outbox, spend presentation rooms). Room tooltip: name + one line + who's here. Props/geometry reference: `screens/iso.js`.
5. **Reconnect flag (1)**: replace current red slab in `public/js/connect.js`/`app.js` with components/reconnect-flag.*; reasons from `BB.presence`, `W.reason` (`refresh_replay`, `persistent_grant_missing`), `BB.wentDark`. Copy uses the existing setup message from connect.js unchanged.
6. **Receipts (2)**: on job done in `public/js/core.js` feed, call `ReceiptShip`; badge + `ReceiptSeen.mark` in `public/js/receipts.js`. Use "Model costs" wording.
7. **Working + meeting (3,4)**: walk/carry only when `BB.status(a).kind==='run'`; on `handoff` events with `toAgentId` call `MeetingRoom.run`. Honor `prefers-reduced-motion`.
8. **Status + estimates (5,6)**: `public/js/inspector.js` uses `BotStatus` and `JobEstimate` (components/*.js).
9. **Engagement**: recap card + week dots + night light in `public/js/app.js`/`app.css` (sounds stay off).
10. Run all `*-regression.cjs` (`npm test`), screenshot at 390/1024/1440 against `shots/`, open a PR. Don't merge.
