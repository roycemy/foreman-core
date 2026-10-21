# Alter hero video v2: shot list

The v1 docs are kept as `v1-*.md`, and the v1 files are unchanged in `out/`.

Outputs are in `v2/out/`: `alter-hero-v2-{16x9,9x16}-{silent,vo}.mp4`.

Every shot is the real app (branch `design/mobile-landing`), recorded locally with mocked `/api`. It's shown in a browser window (16:9) or a phone (9:16) on an off-white stage with a soft shadow.
- **Camera:** eased cubic moves on a sub-pixel affine crop.
- **Transitions:** 0.3s eased dissolves, so the camera keeps moving through each cut.
- **Captions:** they sit in their own band (16:9 below the window, 9:16 above it), never over the UI, and fade in and out over 0.35s.

| # | Time | 16:9 | 9:16 | Caption (mirrors the VO) | Real UI | Move |
|---|---|---|---|---|---|---|
| 1 | 0:00–0:04.5 | HQ floor: Scout at the tray, vermilion dot lit | Same, in a tall window | Your AI bots can spend money. Who's in control? | floor.js tray | Fade up from #F4F4F1, push 1.0→1.32 to the tray |
| 2a | 0:04.5–0:08 | Connect wizard "One paste connects Instinct." The cursor glides to Copy setup message, toast "Setup copied…" | Same flow on the phone layout | One paste connects the bot you already use. | connect.js drawPairing | Push 1.0→1.36 into the wizard |
| 2b | 0:08–0:11 | Instinct walks from arrivals to its desk | Square reframe of the walk | (same) | floor.js ARRIVALS→desk | Ease out 1.32→1.16 |
| 3 | 0:11–0:18 | Grok Bot and Instinct walk to the meeting table and hand off ("Handing you the research"), then return | Tall reframe | Your whole AI team, in one place. | components/meeting.js | Slow push 1.3→1.55 |
| 4a | 0:18–0:21.6 | Ask box. The cursor clicks and natural typing (randomised 55–110ms per key, pauses at spaces and commas) enters "Research rivals, write the launch post, set an ad budget" (played at 1.8×). Then send. | Same | One big ask. They split it up and get to work. | app.js #ask | Tight 1.75→1.9 |
| 4b | 0:21.6–0:25.5 | Routing toast with the planned chain (Grok Bot→Muse→Instinct), Done chip, two real handoff walks (2.2×) | Wider reframe, header removed | (same) | app.js routed.chain, meeting.js | Pull 1.14→1.04 |
| 5 | 0:25.5–0:31 | Browser (floor with bots waiting at the tray) beside a phone (real phone Inbox): Approve Figma $49, Deny AdNetwork Pro $1,200. Side by side, no overlap. | The phone alone | Nothing spends without you. Approve or deny in one tap. | inbox.js, core.js decide | Gentle push on the floor |
| 6 | 0:31–0:37.6 | Card page, then cursor → Daily limit, modal with per-bot caps | The phone Card page scrolls, then the Daily limit sheet | Every bot gets its own budget, on one card. Sandbox for now. | card.js limits() | Hold, then focus zoom 1.0→1.36 on the modal |
| 7 | 0:37.6–0:45 | Logo reveal: the tray top drops in and the band rises, the vermilion dot pops with a soft glow, then "alter", the tagline and an alterhq.app pill stagger up with a blur-in. Fade to #F4F4F1. | Same, scaled | (on the card) Let your bots work. You stay in control. | H1 mark | 0.5s dissolve in, 0.95s fade out = loop seam |
