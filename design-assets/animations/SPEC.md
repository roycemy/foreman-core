# Alter animated floor: spec

Uses the v3 tokens (`/workspace/alter-pack-v3/tokens.css`): Geist, ink `#121212`, floor `#F4F4F1`, vermilion `#E2452B` **only** for needs-you (reconnect flag and the bed re-paste card, approval, budget limit, the failed mark, the Inbox dot).

## Layout on the real floor (floor.js world units)
- **Sleep nook**: the dashed arrivals pad (x 44–61, y 104–114). Three beds, long axis along y, head toward the back wall. New bots walk out of here (22), and offline bots sleep here (2, P1). The nook is dimmed 8% when anyone is asleep there.
- **Lounge** (x 88–116, y 48–78): the existing beanbag (93,75) is the idle seat, the mugs counter (107,61) is the coffee. Muse's armchair is at (108,70).
- **Desks**: the existing `SEATW` seats. Typing happens only here.
- **Meeting room**: the old sales/mail room (x 4–40, y 50–116) with the map table (24,86). The board card sits above the table.

## Motion (all start on a signal; nothing loops)
| Motion | Duration | Easing |
|---|---|---|
| Walk | `--a-walk-ms-per-unit` 42 ms/unit, legs clamp 320–1900 ms | `--a-ease-in-out` |
| Stand / sit | 200 ms (`--a-d-sit`) | `--a-ease-out` |
| Stretch (P2, once) | 600 ms up, 200 ms hold, 300 ms down | `--a-ease-out` |
| Wake up from bed | 400 ms sit-up, then stretch or walk | `--a-ease-out` |
| Head turn (1) | 300 ms there, holds | `--a-ease-out` |
| Typing burst (4) | 2 s per real step event, 140 ms per hand stroke | linear |
| Paper drop (5) | 360 ms, 6 px drop + settle | `--a-ease-out` |
| Gather bob (8) | 3 × 400 ms (`--a-d-bob`) | `--a-ease-in-out` |
| Receipt print + carry (10) | 500 ms print, then walk | `--a-ease-out` |
| Receipt flight to tab | 800 ms (`--a-d-fly`) | `--a-ease-fly` |
| Table glow (P5) | 600 ms once (`--a-d-glow`) | `--a-ease-out` |
| Inbox pulse (15) | one 600 ms pulse on arrival, then steady | `--a-ease-out` |
| Budget tick (18) | 400 ms per spend | `--a-ease-out` |
| Lock / stamp swap (16, 17) | 180 ms (`--a-d-pop`) | `--a-ease-out` |
| Zs (asleep) | static gray glyphs, no float loop | – |
| Spinner (9) | 1.2 s rotation while the job is running. This is the only loop: it's tied to a live `running` state and ends with it | linear |

Queueing: if a new signal arrives mid-animation, finish the current step (≤ 600 ms) and then play the new one. Never queue more than one per bot. Skip straight to the latest state.

## Labels
- Desktop: hover or keyboard focus shows a white pill: `Name · status`, 12/16 Geist 500, ink-2 text.
- Phone: tap replaces hover. Tapping a bot shows the same pill. Tapping the bed shows the red re-paste card in the bottom sheet. The floor sits above a readable status list (one row per bot) because the whole floor is only 390 px wide.
- Always-on labels: only Muse's "Wakes when you message it" tag and the meeting card.

## Characters
Floor figures from `floor.js figureSVG` (the same CAST): Grok Bot = headset/blazer ink, Muse = beanie/hoodie blue, Instinct = glasses/coat teal, Manus = scarf/sweater plum, Poke = cap/tee ochre, ChatGPT = bun/dress slate, Devin = new `visor` cast (blazer `#7A5C46`). None use vermilion.
