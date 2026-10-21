# Alter hero v3: shot list (42.5s = 40s VO + clean end hold; loops through flat #F4F4F1)
Zoom levels: WIDE (z1.0 d / 0.86 m) and MEDIUM (z1.304 d / 1.3 m, 1:1 px), both anchored on the floor center (0.5, 0.435).
Detail "strip" windows (connect button, ask input): 3.2:1 browser window. All cuts are hard; no dissolves. One 250ms ease-out punch at 31.4.
| # | Time | Shot | Source | Caption |
|---|---|---|---|---|
| 1 | 0.0–4.6 | Floor, WIDE, static (0.3s fade from the stage colour = loop seam) | hook-d | Your bots can spend your money. Who’s in control? |
| 2 | 4.6–7.6 | Connect strip: title + "Copy setup message"; fine print hidden; click at 7.15 | connect-d (4K re-record) | One paste. Your bot walks in. |
| 3 | 7.6–11.0 | Floor, MEDIUM: Instinct walks into HQ | connect1-d (v2) | (same) |
| 4 | 11.0–15.0 | Floor, WIDE: every bot working | team-d | Every bot you run. One HQ. |
| 5 | 15.0–18.6 | Ask strip: full ask "Research rivals, write the launch post, set an ad budget", no cutoff | task-d (4K re-record, 1.8×) | One ask. They split it, hand it off, finish it. |
| 6 | 18.6–21.0 | Floor, WIDE: routed handoffs (2.4×) | task1-d (v2) | (same) |
| 7 | 21.0–28.6 | Desktop (inbox popover) + phone inbox, synced state. Tap Approve Figma $49 (22.55), tap Deny AdNetwork Pro $1,200 (27.1) → real "Card charge denied." toast; desktop popover goes to "Nothing on you." 9:16: phone only | mirror-d + approve-m (new) | Nothing spends without your tap. |
| 8 | 28.6–31.4 | Card page, WIDE (9:16: phone) | card-d / card-m | Per-bot budgets. One card. Your rules. |
| 9 | 31.4–34.6 | Daily-limit modal, MEDIUM with 250ms punch (9:16: phone continues) | card-d / card-m | (same) |
| 10 | 34.6–42.5 | End card: logo reveal, "Let your bots work. / You stay in control." + alterhq.app; fades to the stage colour for the loop | endcard.cjs | (on card) |
QA: qa/strip-{d,m}-c.png (frames either side of every cut), qa/check.png, loop seam mean abs diff 0.0002/255.
