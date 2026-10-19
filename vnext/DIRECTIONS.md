# Black Box vNext: visual directions (static mockups, not production code)

All data in these mockups is example data. The source is `src/vnext.html` (render with `node src/render.js`), the floor art and figures are grabbed from the export (`src/grab.js`), and the shots are in `shots/`.

## System
- **Color:** porcelain `#F4F4F1` page; white surfaces; ink `#121212` text and primary-neutral actions; stone `#5C5C57` secondary text; mute `#8C8C86` meta. Vermilion `#E2452B` (hover/pressed `#C8361D`) is the one accent, used only for "needs you": the Inbox count, Approve, the dot over a waiting bot, and approvals in timelines. Green is not used; status is ink-only: a filled dot means running, a ring means done, a dashed ring means queued.
- **Type:** Geist only. Display 30–34/600 at -0.035em (mobile titles, receipt headline; OG 76). Panel title 22/600 at -0.025em. Section title 15–17/600. Body 14/400 at 1.45. Meta 12.5/400 in mute. Numbers use tabular figures at -0.03em (big money 40/600). No uppercase, no mono. Geist Mono appears only for real code: connector address, ids.
- **Spacing:** 4-based scale (4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 56). Panels have 20–24px insets, list rows are 12–14px tall in padding, and there is 32–56px between page sections.
- **Radius:** 9–10 for controls, 14 for inner cards, 18–20 for panels, sheets, the card and the artifact.
- **Shadows:** `sh1` hairline (1px, 4%) for resting controls; `sh2` (12/32, 12%) for floating pills and tooltips; `sh3` (24/64, 22%) only for the panel or sheet that is on top. Borders are 1px at 8% ink. Never a border and a heavy shadow together.
- **Motion:**
  - Panels slide in 280ms with `cubic-bezier(.2,.8,.2,1)` and fade the floor 4%.
  - Tooltips fade and rise 120ms.
  - Approve collapses its row 200ms, then the list reflows 240ms.
  - Bots get idle breathing (1px rise, 3.2s ease-in-out, staggered), the walk from 3.2, and a typing bubble (three dots pulsing 900ms) only while the bot is talking to the owner.
  - What never moves: the nav, the counts (they change without animating), money, and the floor camera unless the user pans.
  - Reduced motion removes breathing, the walk, the bubble pulse and slides; changes become instant fades.

## A. Floor, desktop (A-floor-1440, A-floor-hover-1440)
- **Top bar (60px, translucent porcelain):** the mark, then Floor / Receipts / Card, then ⌘K search ("Search or jump to a bot"), Inbox with its count, and the avatar. No spend, chips or emergency button in the bar; Emergency moves to the account menu and ⌘K.
- **Floor:** full bleed with no signs or labels. Bots are just figures. The one exception is a small vermilion dot over a bot that needs you.
- **Hover on a room:** a 6% vermilion tint plus a 1.5px edge on the room floor, and one ink tooltip ("Library", with "Muse is reading · 1 here" under it).
- **Bottom-left:** a crew pill (avatar stack, "5 on the floor · 1 needs you") that opens the roster. Bottom-centre: the composer ("Ask the team for something…"). Bottom-right: zoom.

## B. Jobs and approvals: the Inbox (B-inbox-1440, B-inbox-390)
- There is no Work tab. The Inbox is a 420px right rail on the floor, opened from the Inbox button or with `I`.
- "Needs you" is pinned on top: one card per request with a one-line title, the cost, and full-width Approve (vermilion) and Deny (outline). Reconnect requests appear here too.
- Below that, "Latest" is one flat newest-first list: avatar, title, bot · age, and an ink status word. Clicking a row opens that bot's inspector on the job.
- On mobile the Inbox is the home screen. Swiping left reveals Approve (vermilion, with an 8px haptic threshold), and the buttons are always present for anyone who doesn't swipe. "+" in the header starts a new job.

## C. Bot inspector (C-inspector-1440, C-inspector-permissions-1440)
- 460px floating panel. The header has a 72px figure tile, the name at 22/600, and one plain status line.
- A segmented control switches Activity / Permissions / Profile.
- **Activity:** the job log. A row expands in place to its receipt (a timeline with an approval dot in vermilion, Open receipt, Share…, and cost · duration). The log is one tap from the bot.
- **Permissions:** plain-language rows, each a verb, one line on what it means, and a choice of Allowed / Ask first / Never. Spending is its own row with the daily cap. "Pause" is the only toggle.
- **Profile:** role, provider, home room (this replaces the floating room names), connection and Remove at the bottom.

## D. Public receipt (D-receipt-390, D-receipt-1440, D-og-1200x630)
- A single 600px column. The page has:
  - an eyebrow: bot avatar · "Receipt · date";
  - a 34/600 balanced headline ("Grok built this in 4 hours");
  - a one-line lede;
  - the artifact preview card (dark, 20 radius);
  - a three-cell fact strip: $ model costs · approvals · duration;
  - the honesty line "Model costs only. Excludes…";
  - the proof timeline;
  - one ink "Run this job" button with a line explaining what it does;
  - the brand footer "Black Box · Verified receipt".
- No login and no nav.
- OG image: the headline at 76/600 on porcelain, the artifact card tilted -3°, the two facts and the mark.

## E. Card (E-card-1440, E-card-390)
- One screen: the ink card (with a vermilion glow, the last 4 digits and "Virtual"), "Spent today $74.20 of $150.00" with a 8px ink bar, then Recent charges (merchant, bot · purpose · time, amount).
- One quiet line with a vermilion dot: "Example card. No real money moves yet." Keep it until real payments exist.
- Actions: Daily limit, Freeze card.

## F. Mobile nav (F-nav-390)
- Three tabs: Inbox / Receipts / Card. 84px translucent bar with line icons (1.7 stroke), 11.5/500 labels, and the active tab in ink.
- The floor isn't a phone tab. It can be a "View floor" link in Inbox later, if wanted.

## Pushback
- **Hover-only room names** can't be found on touch or by keyboard users. Add focus-visible rooms (Tab moves through rooms; the same tint and tooltip), put the room in the inspector's Profile, and have ⌘K list the rooms.
- **No Team tab** loses the scannable roster. Keep the crew pill (bottom-left), which opens a compact roster, and have ⌘K jump to any bot.
- **No Permissions tab** makes "what can my bots do?" across all bots unanswerable. Add a cross-bot permissions summary under account settings (read-only grid, edit in each inspector).
- **No Work tab** hides queued and unassigned jobs. The Inbox must show "Unassigned" as a status and allow assigning, not only approving.
- **Public receipts** risk leaking private prompts, spend details, internal tool names and file paths. Redact by default: the owner picks what's shown (artifact, headline, cost on/off, timeline steps), and the link can be revoked.
- **"Run this job" for a stranger** implies onboarding. Define it: it clones the job template into a new workspace after sign-up, and nothing runs until they connect a bot. Say this under the button, as the mockup does.
- **Cost honesty:** "$0.84" is model cost, not total cost. Always label it "model costs". Don't add up subscriptions you can't see, and never call it "cost to build".
- **Card:** while it's synthetic, the quiet line must stay; dropping it would misrepresent the product.
- **Ink-only status** needs shape differences (filled / ring / dashed), not colour alone, for colour-blind users. The mockups do this.

## vNext.2 additions

### G. "Anything on me?" (G-anything-on-me-1440, G-anything-on-me-empty-1440, K-phone-anything-on-me)
- **Decision:** the Inbox button opens this pop-down first. It's a quick view, not a second inbox. "Open inbox →" at the bottom opens the full rail. The count on the button = items on you (approvals + reconnects + unassigned jobs).
- **Layout:** a 392px card hanging 8px under the button, 16 radius, `sh3`, with a small caret. Title 15/600, plus "3 things" in mute. Each row is an avatar, a 14/500 title, a 12.5 mute line, and one or two 32px actions: Approve/Deny, Reconnect, or Assign ▾. Footer: the shortcut hint and the link.
- **Empty state:** a tick in a porcelain circle, "Nothing on you." in 15/600, "Your team's handling it." in stone, and the footer "4 jobs running".
- **Phone:** the same content as a bottom sheet (28 radius, 8px inset, grab handle, 28% scrim). It opens from the Inbox tab badge on any tab.
- **Motion:** opens 180ms (opacity, plus 4px drop on `cubic-bezier(.2,.8,.2,1)`). An approved row collapses in 200ms; the last one turns into the empty state with a crossfade.

### H. Bots working together (H-collab-floor-1440)
- A shared job draws one dotted ink line (2/6 dash, 45% opacity) on a gentle curve between the figures, a faint ring at each bot's feet, and one floating card at the midpoint: overlapped avatars, "Muse + Instinct · Launch plan", then ›. Clicking it opens the job.
- **Rules:**
  - One card per shared job, never per pair of bots.
  - Three or more bots means a stack of three avatars plus "+N".
  - The dash drifts slowly (8s linear), and is static with reduced motion.
  - It disappears when the job finishes.
- **Inbox row:** overlapped avatars replace the single avatar, with the meta line "Muse + Instinct · 12 min".

### I. Activity glyph (I-activity-glyphs-1440, K-phone-inbox)
- A 20–22px white badge (7 radius, soft shadow) above a crew avatar, a floor figure or a phone list avatar, with a 13px custom stroke glyph: message (speech bubble), research (magnifier), write (pencil). Ink only.
- **Rules:**
  - Shown only while the activity is happening, and at most one per bot.
  - Message wins over research, which wins over write.
  - Never on idle or offline bots.
  - Gentle 1.5px bob on a 2s ease-in-out loop, staggered; none with reduced motion.
- **Recommendation:** use the custom glyphs. System emoji (column B) render differently on every OS and break the ink-only palette.

### J. Island (J-island-a-*, J-island-b-*)
- **(a) Desk:** a raised off-white slab, 2.4 units tall, with one 2px vermilion line along its two front top edges and a single paper tray. The waiting request appears as an app-style white card (12 radius, `sh2`) beside it. The red dot over the bot remains.
- **(b) Doorway tray:** a flat porcelain plinth, 0.9 units tall, with a 1px ink outline and an inset glass tray holding a paper. A vermilion dot on the tray shows when something waits. The same white card appears.
- **FINAL: (b) Doorway tray** (owner's pick). It's now the island in every floor mockup (A, B, C, G, H). The vermilion dot on the tray shows only while a request waits; the empty state (G-empty) has no dot and no bot at the tray. The old "needs you" dot above the bot's head is dropped, because the tray dot replaces it. Option (a) is kept in J-island-a-* for the record only. Reasons for (b):
  - It's flatter, so it doesn't compete with the rooms.
  - The ink outline matches the app's hairline language.
  - It needs vermilion only when something actually waits; (a) is always red.
  - It reads as "inbox", not as a stage.
- **Motion:**
  - Bots walk to the tray's front edge (the existing walk).
  - The paper slides into the tray (240ms).
  - The dot fades in (160ms).
  - After a decision the dot and paper fade out and the bot walks back.

### K. Phone cleanup (K-phone-inbox, K-phone-anything-on-me, K-phone-receipts, K-phone-card, K-phone-receipt-public)
- Background `#FBFBF9`, 24px side margins, and full-bleed rows with 16px vertical padding and hairline dividers starting under the text, not the avatar. No card-in-card and no grey fills.
- Header: title 28/600 left, avatar right, and one stone subline at most.
- Approval rows: a 15.5/500 title, one mute line, then two equal 42px buttons (Approve vermilion, Deny outline). Swipe left to approve as a shortcut.
- Tab bar: 82px, translucent, three 24px line icons with 11/500 labels, ink when active and grey otherwise, no pill. Only the vermilion count badge on Inbox.
- One idea per screen: Inbox (decisions, then today's jobs), Receipts (finished work + cost), Card (card, today's spend, recent charges, plus the one quiet "example card" line).

## Final pass
- **Island B is final.** The real build must remove the old red island from `floor.svg` and the island layer. The mockups cover it with a floor-coloured patch drawn over `floor-noisl.png`.
- **Inspected bot:** a soft ink ring at the bot's feet (24×9.5, 55% ink stroke, 6% fill) while its inspector is open. It fades in 160ms and goes when the panel closes.
- **Overview:** `shots/00-overview.png`.
