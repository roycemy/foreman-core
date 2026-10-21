# Alter invite: founding members — spec

Concept A, "A seat is saved for you" (the pick). Built on `foreman-core@design/mobile-landing` (5431242): Geist (Google Fonts on the site, bundled TTFs in `api/fonts` for OG), `public/styles/tokens.css`, `public/brand/hero-floor.png`, H1 island-tray mark. Mockups use sample data (Royce, Maya, #215, "214 of 1,000"). Nothing ships with those values.

Rule carried through: vermilion appears only when something is waiting for you. On the invite it marks your empty seat (it's waiting). After you join, the dot goes out: the mark in the header, the share card and the "someone joined" toast use ink only.

## What exists in the repo today
- **No invite, referral or founding-number code.** `rg invite|referral` finds nothing relevant.
- **Waitlist exists:** `POST /waitlist` (`joinWaitlist`, api/index.js:1210) stores `gl:waitlist:<sha(email)>` and has origin checks, a honeypot and rate limits. Reuse that limiter pattern.
- **Sign-in is email + password** (scrypt, 30-day session cookie, one workspace per account, api/index.js:702). There's no OAuth, magic link or passkey for owners. Signup is open ("Open your HQ" → Create account).
- **OG:** `api/og.js` already renders receipt OG images as SVG→PNG with `@resvg/resvg-js` and the bundled Geist fonts. Clone that for invites; no `@vercel/og` needed.

So "one tap" is honest only for a signed-in visitor. A signed-out visitor sees the existing create-account form (email, password) on the invite page itself, with one button. That adds no step: the invite *is* the signup screen. True one-tap for new users needs a passkey or magic link, which is a separate decision.

Open product decision: signup is open, so the invite can't gate access. What it grants is a **founding number** (first 1,000 accounts that join through any invite, or all accounts; pick one) and a reserved seat in your HQ. Copy below assumes "first 1,000 accounts to join through an invite".

## Floor visual v2 (the hero)
- Source: the real app floor (`app.html#floor`, sample state, 5 bots at their desks in calm laptop poses, one dozing), captured at 4x DPR with UI chrome hidden: `assets/floor-hd.png` (5600×3184, alpha). `cap.cjs` rebuilds it. No upscaling anywhere.
- `compose.py` bakes the two treatments: `assets/floor-dark.jpg` (B, pick) and `assets/floor-light.jpg` (A), both 6440×4024. Each gets a soft cast shadow plus a contact shadow under the island, a contrast lift, an ambient-occlusion darkening at object bases, monitor screens lit (only the flat screen colour, so nothing new is drawn), a warm glow on the real floor lamp, a warm light pool on the open seat, and a canvas vignette. B also dims the room away from the seat and adds a thin lit rim so the island reads on black.
- Seat anchor in the composites: x 30.30% of width, y 37.27% of width (59.64% of height). The seat is the app's real dashed "open seat" slot; there's no extra desk drawn there.
- Usage: B everywhere (OG, reveal, invite hero, share card, inviter background). Text never sits on the floor: it's on porcelain sheets or on solid near-black (#F4F4F1 on #0E0E0F is 17:1; #B8B8B1 on #0E0E0F is 10:1).
- For production OG and share card: pre-crop `floor-dark.jpg` to the two fixed framings at 1x/2x (≈150–300 KB) and composite only the text in resvg.

## 1. Link preview (OG)
- Route: `GET /i/:code` serves HTML with tags; `GET /api/og-invite?code=` renders PNG 1200×630, `Cache-Control: public, max-age=3600, s-maxage=86400`. Must stay under 600 KB for WhatsApp (current mock is 229 KB).
- `og:title` = `{Inviter first name} saved you a place`
- `og:description` = `A founding seat in Alter, the control layer for your AI bots.`
- `og:site_name` = `Alter`; `twitter:card` = `summary_large_image`; `og:image:alt` = `{Name} saved you a place in Alter`.
- Image layout (v2): near-black #0E0E0F, the lit floor bleeding off the right and top edges, seat at (690,420). Left column, text #F4F4F1 / #B8B8B1. Left column x72, 500 wide: headline 64/600 −0.04em "{Name} saved you a place." then 26/400 stone "Founding seats for the first 1,000 people running AI teams on Alter." Footer at bottom 64: H1 mark 40 + "Alter" 24/500 + "alterhq.app" mute. Right 780 wide: the real floor crop around the empty desk, faded in from the left, with a vermilion ring on the seat and an ink pin "Your seat".
- Name: first name only, sanitized, max 24 chars; at more than 14 chars, drop to 56px. With no name (invalid code) → generic "A founding seat in Alter." and the image without a pin.
- How it renders: iMessage shows image + title + domain (no description). WhatsApp shows image + title + description + domain. X shows image with the title overlaid and "From alterhq.app" below. See `shots/01-previews.png`.

## 2. Reveal (first 3 s), `screens/reveal.html`
It plays once per invite code per device (localStorage). Tap anywhere skips to the end state. Times are ms from first paint.

| t | what | easing |
|---|---|---|
| 0–250 | night #0E0E0F, nothing | — |
| 250–750 | H1 mark (dark variant, 96px) fades in, scale .92→1 | easeOutCubic `cubic-bezier(.33,1,.68,1)` |
| 750–950 | the tray's dot lights: something is waiting for you | easeOutCubic |
| 1050–1450 | mark scales 1→1.6 and fades (the "key" opens the door) | easeInOutCubic `cubic-bezier(.65,0,.35,1)` |
| 1050–1650 | page goes night→porcelain; floor fades in and brightness .15→1 ("lights come on") | easeInOutCubic |
| 1050–2000 | floor settles, scale 1.12→1, anchored on the seat | easeOutCubic |
| 1350–1800 | porcelain sheet rises behind the copy | easeOutCubic |
| 1650–2050 | vermilion halo on the empty desk, scale .6→1 | easeOutCubic |
| 1850–2200 | pin "Your seat" drops in 6px | easeOutCubic |
| 2100–2550 | "{Name} saved you a place." + "Founding seat, reserved for you." rises 12px | easeOutCubic |
| 2450–2900 | "Take your seat" button rises 8px; focus lands on it | easeOutCubic |

Renders: `shots/02-reveal-strip-390.png`, `02-reveal-strip-1440.png`, `02-reveal-390.mp4`, `02-reveal-1440.mp4`, `02-reveal-390.gif`.
- **Sound:** none by default (browsers block autoplay audio, and it's a link someone opened in public). An optional 120 ms soft "tock" could play when the dot lights, but only after a user gesture, so in practice never on first open. Skip it.
- **Haptics:** `navigator.vibrate(8)` when the halo lands on Android Chrome only. iOS Safari has no Web Vibration API, so there's no haptic on iPhone. Don't fake it.
- **Reduced motion:** no scale, no mark. Fade straight to the end state over 200 ms.

## 3. Invite page, `screens/invite.html` (end state of the reveal)
- 390: top bar (mark + Alter, "Sign in" right) · floor crop 330 high, centered on the seat · H1 34/600 "{Name} saved you a place." · value 17 stone "Connect the AI bots you already use. Watch them work. Nothing spends without your tap." · founding row: "Founding member" / "The first 1,000 people in." right "{taken} of 1,000" · fields Email, Password · ink button "Take your seat" · "Already have an account? **Sign in to join**" · fine print "Your number is assigned when you join."
- 1440: floor fills the left; 520 column on the right, H1 44.
- Signed in already → the fields hide and the button alone joins (true one tap).
- Counter = `count of founding members` read live from the server (cached 30 s). No bar, no "only N left", no countdown.
- Celebration: none here. It belongs after join.

## 4. Post-join, `screens/joined.html`
- Sequence: button shows a spinner → page crossfades (180 ms) → "You're in. Founding member" → the real number appears at once: scale .96→1, 320 ms easeOutCubic. No count-up or slot-machine roll, so nothing looks fake.
- Copy: "#{n}" (120/600 −0.06em, # in mute) · "Your seat in HQ is ready. Connect your first bot and it walks in." · "Your invite link" field `alterhq.app/i/{code}` + Copy (→ "Copied", 1.2 s) · "Share card" (Web Share API with the PNG file; falls back to a download) · "Save image" · ink "Open your HQ".
- Share card `GET /api/card?member={n}` 1080×1350 (`shots/04-share-card-1080x1350.png`): mark (dot off) + Alter · floor crop with an ink ring on the seat · "I'm founding member" · "#{n}" 200px · alterhq.app. No name on it, so it's safe to post.
- Restraint: no confetti. The one moment is the number landing. Android gets `vibrate([10,40,10])`; iOS gets nothing.

## 5. Inviter panel, `screens/inviter.html`
- Entry: an "Invite" item in the avatar menu (keeps every existing control). Bottom sheet at 390, right panel 420 on desktop over the dimmed floor.
- Copy: "Invite" · "Save a founding seat for someone you trust." · link + Copy · stats: "{x} joined with your link" / "{taken} of 1,000 founding seats taken" · list "Joined" with first name, #n and date. The "live" label is shown only while the SSE/poll is connected.
- Milestone (real signal only: the `invite.redeemed` event for a code you own): an ink toast with a hollow ring, never vermilion, since nothing needs you. "Maya took her seat." / "Founding member #215 · joined with your link". It stays 5 s and is announced via `aria-live=polite`. On the floor, the dashed empty-desk placeholder fills in once. That needs a human desk sprite (backend/art gap) — until then, toast only.
- Per-link seat count shown only if you cap links (e.g. 3 seats): "2 of 3 seats left on your link".

## States (`shots/06-state-*.png`)
- loading: skeleton lines, no spinner flash under 300 ms.
- invalid / expired: "This invite link doesn't work." / "It may be mistyped or turned off by the person who sent it. Ask them for a new one." → "Go to alterhq.app".
- already a member: "You're already in." / "You're founding member #88. Your HQ is waiting." → "Open your HQ" (no founding number if they have none: "Your HQ is waiting.").
- cap reached: "All 1,000 founding seats are taken." / "{Name}'s invite still gets you in. You just won't have a founding number." → "Join Alter".
- link used up: "{Name}'s seats are all taken." / "This link has been used up. Ask {Name} for a new one, or join Alter on your own." → "Join Alter".
- The race at seat 1,000: number assignment is atomic (below). A loser of the race gets the cap state after signup, with the account still created.

## Components
`InviteOgImage` (server), `RevealStage` (night bg, mark, floor, seat halo, pin), `SeatPin`, `FoundingRow`, `JoinForm` (reuses app.js auth create mode), `FoundingNumber`, `InviteLinkField`, `ShareCardImage` (server), `InvitePanel`, `JoinToast`, `InviteState`.
Assets: `hero-floor.png` (real), H1 mark light/dark (in `assets/`), Geist TTFs (SIL OFL). Seat anchor in hero-floor.png: x 26.6%, y 53.9% (the dashed empty desk). All assets are free or owned.

## API + minimal data model (Upstash Redis, same `gl:` style)
- `gl:invite:{code}` → `{code, ownerUid, firstName, seats (default 3), used, createdAt, disabled}`; `gl:invites:byOwner:{uid}` set.
- `gl:founding:counter` (INCR); `gl:founding:{uid}` → `{n, joinedAt, viaCode}`; `gl:invite:{code}:joins` list of `{uid, firstName, n, at}`.
- Redeem = one Lua EVAL (same pattern as `AGENT_CAS`): check code valid + `used<seats` + uid not founding + counter<1000 → INCR counter, `used++`, write records. Returns `{n}` or `{state}`.
- Endpoints: `GET /api/invite/:code` (public: firstName, state, taken) · `POST /api/invite/:code/redeem` (session required; called right after signup in the same request chain) · `GET /api/invites/mine` · `POST /api/invites` (create or rotate code) · `GET /api/og-invite` · `GET /api/card` · join events through the existing feed/SSE.
- Rate-limit public reads per IP (waitlist limiter). Code = 6–8 chars, unguessable; vanity `/i/royce` is optional.

## Accessibility
- The reveal is decorative: `aria-hidden`. The H1 headline is the first focusable heading, and focus lands on the button at 2.9 s or immediately when skipped.
- Contrast: ink on porcelain is 17:1; stone #5C5C57 on porcelain is 6.4:1; mute is used only for non-essential meta (≥ 13px).
- Targets ≥ 44px (the buttons are 52). The founding number is read as "Founding member number 215".
- Respect `prefers-reduced-motion` everywhere (reveal → fade; toast → no slide).

## Alternative concepts (ranked)
1. **A. A seat is saved for you (pick).** The invite is a reserved desk on the real floor. It uses Alter's own metaphor and the H1 dot rule, and it needs nothing fake: the seat exists because the inviter made a link.
2. **B. The key card.** A dark, card-shaped invite (like the one Alter card) with the inviter's name embossed and the H1 tray as the chip. On join it flips to show #N. Premium and very shareable, but it leans on the card, which is still a sandbox, so it risks implying real payments.
3. **C. The guest list.** A typographic list page: "Royce · Maya · you". Your name slides into the next line, and the number appears beside it. The calmest and the cheapest to build, but it loses the floor, which is the thing people remember.
