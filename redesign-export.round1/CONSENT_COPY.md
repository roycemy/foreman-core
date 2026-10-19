# OAuth consent page: shipped copy, verbatim

Source: live `https://foreman-core.vercel.app/oauth/authorize`, fetched 2026-10-08 (3,203 bytes). `public/oauth.html` keeps every string below unchanged. The only edit is that the product name is read from `BRAND.name` (in `/brand.js`).
Proof: after replacing `'+BRAND.name+'` with `Black Box` and removing the three added `class="oa-*"` attributes, the export's `<script>` is byte-identical to the live one (checked by script).

`{brand}` = `BRAND.name` (today: `Black Box`). `{…}` = runtime values.

| # | Where | String |
|---|---|---|
| 1 | `<title>` | `Connect to {brand}` |
| 2 | `h1` | `Connect to {brand}` |
| 3 | initial `#content` | `Checking sign-in...` |
| 4 | sign-in state, intro `<p>` | `Sign into your {brand} workspace. Your bot stays signed into its own provider.` |
| 5 | sign-in label | `Email` |
| 6 | sign-in label | `Password` |
| 7 | sign-in button | `Sign in` |
| 8 | error state | `{context.error}` (server text, shown as-is) |
| 9 | consent `<p>` 1 | `{client} wants to connect one bot to your workspace.` (client in `<b>`) |
| 10 | consent `<p>` 2 (scope) | `This connection can report activity and call {brand} tools under this bot's permissions. It cannot import your provider account, read other bots, or move money. This authorization can renew automatically in clients that support OAuth refresh. It stays available until you revoke this bot in {brand}.` |
| 11 | select label | `Existing bot` |
| 12 | option | `{name} ({provider})` |
| 13 | `<p>` | `Return address: {redirectOrigin}` |
| 14 | button | `Authorize connection` (disabled when there are no bots) |
| 15 | `<p>` | `If your bot is missing, open HQ and start Connect AI Employee first.` |
| 16 | load failure (`#error`) | `Could not load sign-in. Reconnect from your bot.` |
| 17 | consent API error | `{j.error}` (server text; e.g. PR #4: `Choose the existing bot being reconnected`) |

Behavior is unchanged: `GET /api/oauth/context{search}`, `POST /api/auth/login {email,password}`, `POST /api/oauth/consent {csrf, agentId}`, then `location.assign(j.redirect)`. On error the button is re-enabled.

What changed visually: tokens.css typography and colors, a wordmark above the card (it comes from the brand token and has no new words), the scope paragraph shown as a bordered block, the return address in mono with hairlines, a full-width vermilion button, and a mobile layout.
