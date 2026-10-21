# Alter hero video: shot list

The cut is 45.0s at 30fps and 120bpm, so one bar lasts 2s. Every shot is the real Alter app, from branch `design/mobile-landing` (PR #77), served locally. The data is mocked, and nothing touched prod.

Files:
- 16:9 is `out/alter-hero-16x9.mp4`.
- 9:16 is `out/alter-hero-9x16.mp4`.

| # | Time | Shot (16:9) | Shot (9:16) | Caption (exact) | Real UI source | Cut |
|---|---|---|---|---|---|---|
| 1 | 0:00–0:04 | HQ floor, push-in 1.00→1.14 toward the tray. At about 0:03 Scout walks to the tray, the vermilion dot lights, and the tray card reads "Charge $1200.00 at AdNetwork Pro" with Approve/Deny. | The same shot as a 1080² square reframe under the caption. | Your AI bots can spend money. / Who's in control? | `floor.js` tray (waitingItems, islcard). A card proposal in `/api/cards`. | Fade up from off-white #F4F4F1 (0.35s). This is the loop seam. |
| 2 | 0:04–0:11 | The connect wizard: "One paste connects Instinct." Tap **Copy setup message**, and the toast reads "Setup copied. The link inside holds a one-time code." The wizard confirms the connection and closes. Instinct leaves the arrivals spot and walks to its desk. | The same flow on the real phone layout (432pt), inside an ink-bezel phone frame. | One paste. / Your bot is connected. | `connect.js` drawPairing and `BB.setupMessage`. The ghost bot comes from `floor.js` ARRIVALS. | Hard cut on the bar (0:04). |
| 3 | 0:11–0:20 | Push-in 1.35→1.50 on the left office and meeting table. Grok Bot and Instinct walk to the map table, the table glows, and the bubble reads "Handing you the research". The meeting ends when the child job really starts running, then both bots walk home. | A square reframe of the same shot, centred on the table. | Your whole AI team, / in one place. | `components/meeting.js` BB.handoff, triggered by a task with parentId and createdBy (`floor.js` handoffs). | Hard cut on the bar (0:12 in the music; the picture cuts at 0:11, a 1-beat early cut). |
| 4a | 0:20–0:23 | Tight crop (1.7×) on the ask box. The owner types "Research rivals, write the launch post, set an ad budget". | Square crop on the ask box. | Ask once. / They split up the work. | `#ask` form in `app.html` and `app.js`. | Hard cut on the bar. |
| 4b | 0:23–0:28 | Wide floor at 2× speed. The routing toast reads "Sent to Grok Bot (research). Then Muse (marketing), then Instinct (finance) – planned, each hop fires on a real handoff." The lead's job finishes (Done chip, "Receipts 1 new", "finished 3 jobs today"). Then come two real handoff walks: Grok→Muse, then Muse→Instinct. | A square reframe of the same shot. | (same caption) | `app.js` ask.onsubmit, which renders `routed.chain` from `/api/tasks` (server: api/index.js categorizeAll and handoffPlan). The Done chip is from `floor.js`. | Hard cut, speed ramp. |
| 5a | 0:28–0:35 | The desktop floor with two bots waiting at the tray. A phone on the right shows the real phone-layout **Inbox** with two spend asks. At about 0:29.5 the owner taps **Approve** on Figma $49, and the toast reads "Approved on the example card. No real money moved." At about 0:32 the owner taps **Deny** on AdNetwork Pro $1,200, and the toast reads "Card charge denied." | The phone Inbox, full height, in the phone frame. | Nothing spends without you. / Per-bot budgets, one card. | `inbox.js` (card items, Approve/Deny) and `core.js` decide → `/api/cards/:id/approve` and `/deny`. | Hard cut on the bar. |
| 5b | 0:35–0:38 | The Card page: Team card ••4821, then the **Daily limit** modal with one cap per bot (Grok Bot $50, Instinct $200, Muse $30, Scout $25). In 16:9 the caption moves to the bottom-left so it doesn't cover the modal. | The phone Card page with the Daily limit sheet. | (same caption) | `card.js` limits(). | Hard cut. |
| 6 | 0:38–0:45 | End card: the H1 island-tray mark lights its vermilion dot at 0:38.7, with the alter wordmark, the caption and alterhq.app. It fades to off-white over the last 1.0s. | The same layout, scaled for portrait. | Let your bots work. / You stay in control. | H1 mark (`/workspace/blackbox/logos/svg/H1-mark.svg`, same geometry as `public/brand/alter-mark.svg`). | Hard cut, then fade to #F4F4F1 into the loop. |

Captions are set in Geist 600, in near-black #111 with a #6B6B66 second line:
- 16:9: 68px on a 92% off-white rounded plate, top-left.
- 9:16: 84px, top, no plate.

Vermilion appears only where the app itself uses it for "needs you": the tray dot, the Approve buttons, the Inbox badge and the logo dot.
