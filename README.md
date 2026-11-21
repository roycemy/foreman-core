# Alter

**The control layer for your AI bots.** Your bots keep working. Connected bots act inside your rules, and anything you mark Ask waits for your tap.

Website and waitlist: https://www.alterhq.app (waitlist at https://www.alterhq.app/waitlist)

## What it is

Alter sits between you and the bots you already use (Instinct, Grok Bot, Muse and others). You connect each bot once by pasting a setup message into its chat. After that you decide what each bot can do:

- **Auto, Ask or Never** for each bot and each action, with per-action and daily limits.
- **Approvals on your phone.** Actions set to Ask pause on the server until you approve them.
- **Receipts.** Every job and decision is written to a hash-chained receipt log you can read back.
- **One kill switch** that blocks every action through Alter at once.
- **Bots keep their own logins.** Each connection is scoped to one bot and the actions you allow, and lasts until you revoke it.

## Status (be honest about what is real)

- Real today: connecting bots, rules, the approval flow, receipts, kill switch, and the waitlist.
- Sandbox only: the card flow. There is no live card issuing yet, and native provider bills stay outside Alter.
- Scope: Alter controls what bots do through Alter. It does not intercept bots that are not connected, or actions they take outside Alter.
- Early stage: this is an early build. Some hardening work is still in review (see open pull requests), so treat the hosted app as a preview, not a production service.

## How it works (technical)

Agents never hold credentials. They call `POST /api/gateway/act` with an Alter key. The gateway checks status (revoked or killed), Auto/Ask/Never, per-action and daily limits, runs the action itself, and writes a hash-chained receipt. Ask actions pause server-side until the owner approves (`POST /api/requests/:id/approve`).

`node e2e.js <base-url>` runs the full proof against a deployment.

Other docs: `INTERCEPTION.md`, `ISSUING-TEST.md`, `docs/`.

## Join the waitlist

https://www.alterhq.app/waitlist
