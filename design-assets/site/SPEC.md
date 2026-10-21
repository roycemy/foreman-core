# Alter marketing site, redesign spec (mockups, not shipped)

**Revision 2: light site.** The whole site is warm off-white `#F4F4F1` with ink `#121212`. There are no dark sections. The HQ section is the only tinted band, `#ECECE7`. The hero floor is the invite pack's warm-lit light floor (`floor-light-web.jpg`). The hero video has no frame or shadow. Its edge color `#F1F2EE` matches the page, and a soft radial edge mask blends it into the page. Nav, footer and the sign-in logo use the ink mark (`H1-mark.svg`). The sign-in logo sits on a white pill over the floor art. The Daily limit capture is re-cut from the real sheet with the dark strip cropped off. Wherever the sections below say "night", read paper.


Applies to `public/index.html` and new static `security.html`, `pricing.html`, plus restyling the existing sign-in (served by `/hq`). The HQ app is not touched.
Tokens: `tokens.css` (same values as `public/styles/tokens.css`, adds the night surface). Layout: `site.css`. Geist only; Geist Mono only for the connector address.
Rhythm: sections alternate night `#0C0C0D` / paper `#F4F4F1`. Section padding `clamp(96px,12vw,168px)`, max width 1200, gutter `clamp(20px,5vw,64px)`. One idea per section: small label, one H2, one lead line (≤36ch), one real capture.
Vermilion `#E2452B` appears only as the "Needs you" dot (and inside real app captures, where it means the same thing).
Motion: each section's copy fades up 16px over 520ms `cubic-bezier(.2,.7,.2,1)` once on first view (IntersectionObserver, threshold .2). `prefers-reduced-motion: reduce` turns it off. No parallax, no counters, no looping decoration.
Tap targets ≥44px everywhere (checked by `render.cjs`). Nav and footer pad `env(safe-area-inset-*)`.

## Nav (on night, absolute over hero)
H1 mark (`H1-mark-dark.svg`) + "Alter" · Product · Security · Pricing · spacer · Sign in · [Get started] → `#join`. Under 820px: links hidden, keep mark, Sign in, Get started. Light variant on the pricing page.

## 1. Hero (night) `#top`
H1 "Let your bots work. / You stay in control." Lead "Alter is the permission layer for your AI agents. Connect them with one paste. Nothing spends without your tap."
CTAs: [Claim your founding spot] (off-white pill) · "Watch the film" text link → `#film`.
Under the copy: `floor-dark-web.jpg` (the invite pack's 4x lit-on-dark floor), 128vw wide on desktop and 190vw on mobile, centered, top and bottom fade to night.
Film slot `#film`, overlapping the floor's lower edge by 14vw (28vw on mobile): rounded 28px frame, `<video autoplay muted loop playsinline preload="metadata" poster>` with `hero-16x9.mp4` (v3.1 silent). Caption "Recorded in the real app with sample data." Swap in the v4 export when it's final. States: poster until `canplay`; reduced motion: no autoplay, show poster with a play button.

## 2. Connect (paper) `#connect`
Label "Connect". H2 "One paste. Your bot walks in." Lead "Copy one setup message into the bot you already use. It pairs itself. Nothing shows as connected until the bot reports back."
Address row: `foreman-core.vercel.app/api/mcp` (mono) + "Connector address". Keep this URL until the server's connector address moves to alterhq.app.
Bots row: Instinct · Grok Bot · Muse avatars. Right: real capture of the "One paste connects Instinct" step (`connect-modal.jpg`).

## 3. HQ (night) `#hq`
H2 "Every bot you run. One HQ." Lead "Each bot gets a desk, a color and a room. Give the team one ask and watch it split up the work." Wide capture `hq-desktop.jpg` (cropped 4:3 on mobile). Three facts: Real presence ("A bot that has never reported is a ghost, not a worker."), One ask, Calm by default (reduced motion).

## 4. Approve / deny (paper) `#approve`
Label "● Needs you" (the vermilion dot). H2 "Nothing spends without your tap." Lead "When a bot wants to spend, the request waits in your Inbox. Open it on your phone. Approve or deny in one tap."
Note "Requests show in the Inbox. Alter doesn't send push notifications yet."
Two real phone captures in device frames, the second offset 72px down: Inbox "2 need you" ($1,200 AdNetwork Pro, $49 Figma), then after the deny, with the "Card charge denied" toast.

## 5. Card (night) `#card`
H2 "Per-bot budgets. One card." Lead "Give each bot its own daily limit on one shared card. Change it any time." Outlined note "Sandbox. No real money moves." Phones: Card screen ($69.00 spent today) and Daily limit sheet.

## 6. Receipts (paper) `#receipts`
H2 "Every decision has a reason." Lead about budget, merchant category and frequency checks (from authorization.html). Facts: Receipts · Bot trust ("A signal, never a score…") · Model costs ("Model costs stay with the providers you already pay.").

## 7. Security (night) `#security`
H2 "A narrow door, not a key to the building." Lead: OAuth 2.1 + PKCE, Auto/Ask/Never, kill switch. Three "never" rows: takes your login / reads your other bots / moves money. Link to `security.html`.

## 8. Pricing (paper) `#pricing`
H2 "You already pay your bots." Lead "Alter doesn't issue cards or sit in the payment path. Limits here are permissions, not charges." Link to `pricing.html`. No price is shown because none is published.

## 9. Founding CTA (night) `#join`
H2 "Claim your founding spot." Lead "The first 1,000 members get in first. Your number is assigned when you join." [Claim your founding spot] → sign-up. Soft warm radial glow, the only decoration. A live counter ("214 of 1,000") appears only once the invite backend from the invite spec exists. Until then, no number.

## Footer (night)
Mark · "The permission layer for AI agents." · Security · Pricing · Sign in · Founding members.

## security.html
Hero: same H2 as section 7, lead "Each connection is scoped to one bot and the actions you allow. You can stop all of them at once." Facts: OAuth 2.1 + PKCE · Auto, Ask or Never · Kill switch. Never rows. Paper section "Honest limits": native billing, card issuing (the webhook is test-only), merchant data (reported by bots). All of it comes from interception.html and authorization.html. Then the CTA and footer.

## pricing.html (light nav)
H1 "You already pay your bots. Watching them is the job." Two cards: Founding member (what's included today, no price) · What you keep paying (bot subscriptions and model costs stay with your provider, real card charges $0 in the sandbox). Then the CTA and footer.

## Sign-in (restyle of the existing `/hq` auth screen; same fields and links)
Split layout: the left 1.15fr is the lit floor on night with the mark top-left, and the right pane holds "Sign in", "Your bots, their jobs and anything waiting on you.", Email, Password, [Sign in], "Create an account" · "Have a claim code?". On mobile the floor is a 300px banner on top. Inputs are 52px, 16px text (no iOS zoom). States: error text under the field in ink with a vermilion-free 1px ink outline. Vermilion is reserved for "needs you", so errors use ink, not red.

## Assets
`assets/`: floor-dark-web.jpg, connect-modal.jpg, hq-desktop.jpg, phone-inbox.jpg, phone-denied.jpg, phone-card.jpg, phone-limit.jpg, hero-16x9.mp4, hero-9x16.mp4, poster-16x9.jpg, H1 marks, Geist TTFs. Every capture is from the real app with sample data (frames from the v3 recordings and the invite pack's floor).
