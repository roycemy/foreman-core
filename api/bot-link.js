'use strict';
// Alter bot link: one onboarding + stay-connected core for every bot type.
//
// Atomicity: every state change is ONE compare-and-set on ONE record (the pairing record or the
// bot record), guarded in production by the existing AGENT_CAS Lua script. Revoke bumps the bot's
// epoch; issuance, renewal and pickup only commit against the epoch they read, so nothing that
// started before a revoke can commit after it. Every marker/index key carries a TTL.
//
// Honest transport claim: a link key is accepted ONLY on POST /api/link/call (echo, and policy-routed
// act through the existing gateway pipeline). It is NOT accepted on /api/mcp or by the paired runner.
//
// Secrets: keys and caller secrets are stored only as SHA-256 hashes. Nothing here logs.
const crypto = require('crypto');
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const rand = (n, p = '') => p + crypto.randomBytes(n).toString('base64url');
const eqHash = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const DEFAULTS = {
  pairingTtlMs: 10 * MIN,         // pairing ID lives 10 minutes, single use, enforced at hello, approve AND pickup
  idleMs: 30 * DAY,               // key dies after 30 idle days
  capMs: 90 * DAY,                // absolute cap: renewal can never pass this
  connectedWindowMs: 6 * HOUR,    // Connected = real call within 6h; after that Quiet
  capWarnMs: 7 * DAY,
  retryGraceMs: 2 * MIN,          // a lost response may be retried with the previous key + same requestId
};
const LINK_ENDPOINT = '/api/link/call';
const OPS = ['echo', 'act'];      // anything else is rejected before the key is touched

// Native transports. acceptsLinkKey says which of them really accept a link key today.
const TRANSPORTS = {
  mcp: { id: 'mcp', label: 'MCP', acceptsLinkKey: false, note: 'Link keys are not accepted on /api/mcp. Grok uses the link key over HTTP only.' },
  http_key: { id: 'http_key', label: 'HTTP link key', acceptsLinkKey: true, note: 'Link key accepted on POST ' + LINK_ENDPOINT + '.' },
  runner: { id: 'runner', label: 'Paired runner', acceptsLinkKey: false, note: 'Link keys are not bridged to the runner session. Instinct uses the link key over HTTP from its pairing page.' },
};
// Adding a bot type = one entry here. The onboarding UI renders from this list only.
const BOT_TYPES = {
  instinct: { id: 'instinct', name: 'Instinct', transport: 'runner', live: { possible: false, why: 'Instinct does not send real typing or presence events today, so Alter shows no Live tier.' },
    message: (page, steps) => `Connect to Alter. Open ${page} in your browser worker and keep that tab open until it says Connected. This link contains no secret.` },
  grok: { id: 'grok', name: 'Grok', transport: 'mcp', live: { possible: false, why: 'Live needs real foreman_owner_conversation events. A link key cannot send them yet, so bot link never shows Live.' },
    message: (page, steps) => `Connect to Alter. GET ${steps} and follow the JSON steps it returns (hello, wait for owner approval, collect your key once, run the echo). This link contains no secret.` },
  muse: { id: 'muse', name: 'Muse', transport: 'http_key', live: { possible: false, why: 'Meta does not give Alter real typing or presence events for Muse, so there is no Live tier. Alter will not fake one.' },
    message: (page, steps) => `Connect to Alter over plain HTTP. GET ${steps} for the exact steps: POST a fresh nonce and a secret you keep, poll until the owner approves, collect your key once, then POST {"op":"echo"} to ${LINK_ENDPOINT}. This link contains no secret.` },
};
const REVOKE_COPY = 'Alter blocks new requests from this bot that go through Alter. It cannot stop calls the bot makes outside Alter.';
const TERMINAL = ['killed', 'cancelled', 'collected', 'invalidated', 'expired'];
const err = (status, error, extra) => ({ status, body: { error, ...extra } });

class BotLink {
  constructor({ store, now = Date.now, opts = {}, onRevoke = async () => {}, onAlert = async () => {}, onBotCreated = async () => null,
    authorize = async () => true, executeAct = null, actions = () => [], onRealCall = async () => {} }) {
    this.s = store; this.now = now; this.o = { ...DEFAULTS, ...opts };
    this.onRevoke = onRevoke; this.onAlert = onAlert; this.onBotCreated = onBotCreated; this.onRealCall = onRealCall;
    this.authorize = authorize;   // (bot) -> false if the linked Alter agent is no longer active
    this.executeAct = executeAct; // (bot, {action, params}) -> {status, body, governed}; null = no policy transport
    this.actions = actions;       // () -> list of action names the policy transport supports
    this.events = []; this.listeners = new Set();
  }
  // Events fire only from real inbound calls or owner actions. Nothing is timer-driven.
  emit(type, botId, extra = {}) { const e = { type, botId, at: this.now(), ...extra }; this.events.push(e); if (this.events.length > 500) this.events.shift(); for (const l of this.listeners) l(e); }
  async read(k) { const raw = await this.s.get(k); return raw ? { raw, v: JSON.parse(raw) } : null; }
  async getJ(k) { const x = await this.read(k); return x && x.v; }
  // Read-modify-CAS loop. fn returns {next, out} to commit, or {out} to stop without writing.
  async mutate(k, fn) {
    for (let i = 0; i < 8; i++) {
      const cur = await this.read(k); const step = await fn(cur && cur.v);
      if (!step.next) return step.out;
      if (!cur) { if (await this.s.add(k, JSON.stringify(step.next))) return step.out; continue; }
      const won = await this.s.cas(k, cur.raw, JSON.stringify(step.next));
      if (won === 1) return step.out;
    }
    return err(409, 'concurrent_change_retry');
  }
  pairTtl() { return this.o.pairingTtlMs + DAY; }
  keyTtl() { return this.o.capMs + DAY; }
  putPair(p) { return this.s.put('bl:pair:' + p.pid, JSON.stringify(p), this.pairTtl()); }

  types() { return Object.values(BOT_TYPES).map(t => ({ id: t.id, name: t.name, transport: 'HTTP link key', nativeTransport: TRANSPORTS[t.transport].label, acceptsLinkKeyNatively: TRANSPORTS[t.transport].acceptsLinkKey })); }

  // 1. Owner: pick bot -> one copy-ready message with a non-secret link.
  async createPairing({ ws, account, type, reattachBotId = null, agentId = null, origin = 'https://alter.invalid' }) {
    const t = BOT_TYPES[type]; if (!t) return err(400, 'unknown_bot_type');
    let botEpoch = null;
    if (reattachBotId) {
      const b = await this.getJ('bl:bot:' + reattachBotId); if (!b || b.ws !== ws || b.type !== type) return err(404, 'bot_not_found');
      if (b.revoked) return err(409, 'bot_revoked', { note: 'A revoked bot stays revoked. Add it again as a new bot.' });
      botEpoch = b.epoch || 0;
    }
    const pid = rand(18, 'pr_'), at = this.now();
    const p = { pid, ws, account: String(account || '').slice(0, 80), type, reattachBotId, botEpoch, agentId: reattachBotId ? null : agentId, status: 'waiting', createdAt: at, expires: at + this.o.pairingTtlMs };
    await this.putPair(p);
    const page = origin + '/pair/' + pid, steps = origin + '/api/pair/' + pid;
    return { status: 200, body: { pairingId: pid, link: t.transport === 'runner' ? page : steps, message: t.message(page, steps), expiresAt: p.expires, reattach: !!reattachBotId } };
  }
  // Expired pairings are a terminal state, computed on read so every entry point enforces it.
  live(p) { return p && !TERMINAL.includes(p.status) && this.now() > p.expires ? { ...p, status: 'expired' } : p; }

  // JSON steps for bots that can follow them (GET /api/pair/:id without credentials). Holds no secret.
  async steps(pid, origin) {
    const p = this.live(await this.getJ('bl:pair:' + pid)); if (!p) return err(404, 'pairing_unavailable');
    if (TERMINAL.includes(p.status)) return err(410, 'pairing_' + p.status);
    const url = origin + '/api/pair/' + pid;
    return { status: 200, body: { expiresAt: p.expires, steps: [
      { step: 'hello', method: 'POST', url, body: { nonce: '<16+ random characters, new each time>', callerSecret: '<24+ random characters you generate and keep; send it only to this URL>' }, expect: 202 },
      { step: 'wait_for_owner', method: 'GET', url, headers: { Authorization: 'Pairing <callerSecret>' }, expect: '202 while waiting, then 200 with {key, botId} exactly once' },
      { step: 'echo', method: 'POST', url: origin + LINK_ENDPOINT, headers: { Authorization: 'Bearer <key>' }, body: { op: 'echo', text: 'hi', requestId: '<16+ random characters, new per call>' }, expect: 200 },
      { step: 'keep_going', note: 'Every successful call returns nextKey; use it for the next call and forget the old one. If a response is lost, retry once with the SAME key and SAME requestId within 2 minutes.' },
    ] } };
  }

  // 2. Bot: hello with pairing ID + nonce + hash of a secret it keeps. A second distinct caller kills the pairing.
  async hello(pid, { nonce, callerSecret, fingerprint = {}, oldKey = null } = {}) {
    if (typeof nonce !== 'string' || nonce.length < 16 || typeof callerSecret !== 'string' || callerSecret.length < 24) return err(400, 'nonce (16+) and callerSecret (24+) required');
    const first = this.live(await this.getJ('bl:pair:' + pid)); if (!first) return err(404, 'pairing_unavailable');
    if (TERMINAL.includes(first.status)) return err(410, 'pairing_' + first.status);
    if (!await this.s.add('bl:nonce:' + sha(nonce), '1', this.pairTtl())) return err(409, 'nonce_replayed');
    const ch = sha(callerSecret);
    let oldKeyProven = false;
    if (oldKey && first.reattachBotId) { const k = await this.getJ('bl:key:' + sha(oldKey)), b = await this.getJ('bl:bot:' + first.reattachBotId); oldKeyProven = !!(k && b && k.botId === b.id && b.keyHash === sha(oldKey)); }
    let killed = false;
    const out = await this.mutate('bl:pair:' + pid, p => {
      p = this.live(p); if (!p) return { out: err(404, 'pairing_unavailable') };
      if (TERMINAL.includes(p.status)) return { out: err(410, 'pairing_' + p.status) };
      if (p.callerHash && !eqHash(p.callerHash, ch)) { // not first-wins: any second caller burns the pairing for everyone
        killed = true; return { next: { ...p, status: 'killed', killedReason: 'second_caller' }, out: err(410, 'pairing_killed') };
      }
      if (p.status !== 'waiting' && p.status !== 'claimed') return { out: err(409, 'pairing_' + p.status) };
      const fp = { transport: 'HTTP link key', userAgent: String(fingerprint.userAgent || '').slice(0, 120), ipRegion: String(fingerprint.ipRegion || 'unknown').slice(0, 40), appId: String(fingerprint.appId || '').slice(0, 60) };
      return { next: { ...p, status: 'claimed', callerHash: ch, fingerprint: p.fingerprint || fp, oldKeyProven: p.oldKeyProven || oldKeyProven }, out: { status: 202, body: { status: 'awaiting_owner_approval' } } };
    });
    if (killed) { this.emit('pairing_killed', first.reattachBotId, { pid, reason: 'second_caller' }); await this.onAlert({ ws: first.ws, kind: 'pairing_second_caller', pid, type: first.type }); }
    else if (out.status === 202) this.emit('pairing_hello', first.reattachBotId, { pid });
    return out;
  }

  // 3. Owner approval screen: bot type, account, caller fingerprint, and the existing bot it would re-attach to.
  async approvalView(ws, pid) {
    const p = this.live(await this.getJ('bl:pair:' + pid)); if (!p || p.ws !== ws) return err(404, 'not_found');
    const target = p.reattachBotId ? await this.getJ('bl:bot:' + p.reattachBotId) : null;
    const status = target && (target.revoked || (target.epoch || 0) !== p.botEpoch) && !TERMINAL.includes(p.status) ? 'invalidated' : p.status;
    return { status: 200, body: { pairingId: pid, botType: BOT_TYPES[p.type].name, account: p.account, fingerprint: p.fingerprint || null, status, expiresAt: p.expires, botId: p.botId || null,
      reattach: target ? { botId: target.id, name: target.name, lastRealCallAt: target.lastRealCallAt || null, oldKeyProven: !!p.oldKeyProven } : null,
      title: target ? `Reconnect ${target.name}?` : `Approve ${BOT_TYPES[p.type].name} on ${p.account || 'this account'}?` } };
  }
  async approve(ws, pid, { confirmBotId = null } = {}) {
    const p0 = await this.getJ('bl:pair:' + pid); if (!p0 || p0.ws !== ws) return err(404, 'not_found');
    const target = p0.reattachBotId ? await this.getJ('bl:bot:' + p0.reattachBotId) : null;
    if (p0.reattachBotId && (!target || target.revoked || (target.epoch || 0) !== p0.botEpoch)) return err(409, 'bot_revoked');
    const out = await this.mutate('bl:pair:' + pid, p => {
      p = this.live(p); if (!p) return { out: err(404, 'not_found') };
      if (p.status === 'expired') return { out: err(410, 'pairing_expired') };
      if (p.status !== 'claimed') return { out: err(409, p.status === 'waiting' ? 'bot_has_not_called_yet' : p.status === 'approved' ? 'already_approved' : 'pairing_' + p.status) };
      if (p.reattachBotId && !p.oldKeyProven && confirmBotId !== p.reattachBotId) return { out: err(409, 'reattach_requires_old_key_or_owner_naming_existing_bot') };
      return { next: { ...p, status: 'approved', approvedAt: this.now() }, out: { status: 200, body: { status: 'approved' } } };
    });
    if (out.status === 200) this.emit('pairing_approved', p0.reattachBotId, { pid });
    return out;
  }
  // Owner "Not me, cancel": server-side, so the link is dead for everyone.
  async cancel(ws, pid) {
    const p0 = await this.getJ('bl:pair:' + pid); if (!p0 || p0.ws !== ws) return err(404, 'not_found');
    return this.mutate('bl:pair:' + pid, p => {
      p = this.live(p); if (!p) return { out: err(404, 'not_found') };
      if (TERMINAL.includes(p.status)) return { out: err(409, 'pairing_' + p.status) };
      return { next: { ...p, status: 'cancelled', cancelledAt: this.now() }, out: { status: 200, body: { status: 'cancelled' } } };
    });
  }

  // 4. Bot polls the pairing ID and collects its key exactly once.
  async pickup(pid, { callerSecret } = {}) {
    const ch = sha(callerSecret || ''); let p0;
    // Step A: burn the pairing (approved -> collected) in one CAS. Expiry is enforced here too.
    const claim = await this.mutate('bl:pair:' + pid, p => {
      p = this.live(p); if (!p) return { out: err(404, 'pairing_unavailable') };
      if (p.status === 'killed') return { out: err(410, 'pairing_killed') };
      if (!p.callerHash || !eqHash(p.callerHash, ch)) return { out: err(403, 'caller_mismatch') };
      if (p.status === 'expired') return { out: err(410, 'pairing_expired') };
      if (p.status === 'claimed' || p.status === 'waiting') return { out: { status: 202, body: { status: 'awaiting_owner_approval', retryAfterSeconds: 3 } } };
      if (p.status !== 'approved') return { out: err(410, p.status === 'collected' ? 'key_already_collected' : 'pairing_' + p.status) };
      p0 = { ...p, status: 'collected', collectedAt: this.now(), botId: p.reattachBotId || rand(8, 'bot_') };
      return { next: p0, out: null };
    });
    if (claim) return claim;
    const key = rand(32, 'alk_'), kh = sha(key), t = this.now(), series = rand(6, 'ks_');
    const fresh = { keyHash: kh, keyGen: 1, series, workerId: rand(6, 'wk_'), capAt: t + this.o.capMs, idleExpiresAt: t + this.o.idleMs,
      verifiedAt: null, governedAt: null, lastRealCallAt: null, prev: null, needsRepaste: null, pairedVia: pid };
    let bot;
    if (p0.reattachBotId) {
      // Step B (re-attach): one CAS on the bot, only against the epoch the pairing was created for.
      const r = await this.mutate('bl:bot:' + p0.botId, b => {
        if (!b || b.revoked || (b.epoch || 0) !== p0.botEpoch) return { out: err(410, 'bot_revoked') };
        bot = { ...b, ...fresh }; return { next: bot, out: null };
      });
      if (r) { await this.putPair({ ...p0, status: 'invalidated' }); return r; }
    } else {
      const n = await this.s.incr('bl:count:' + p0.ws + ':' + p0.type);
      bot = { id: p0.botId, ws: p0.ws, type: p0.type, account: p0.account, name: BOT_TYPES[p0.type].name + (n > 1 ? ' #' + n : ''), createdAt: t, epoch: 0, revoked: false, ...fresh };
      bot.agentId = p0.agentId || await this.onBotCreated(bot);
      if (bot.agentId && !await this.s.add('bl:agentBot:' + p0.ws + ':' + bot.agentId, bot.id)) return err(409, 'agent_already_linked');
      if (!await this.s.add('bl:bot:' + bot.id, JSON.stringify(bot))) return err(409, 'bot_exists');
      await this.s.sadd('bl:bots:' + p0.ws, bot.id);
    }
    await this.s.put('bl:key:' + kh, JSON.stringify({ botId: bot.id, series }), this.keyTtl());
    this.emit('key_issued', bot.id, { reattached: !!p0.reattachBotId });
    return { status: 200, body: { key, botId: bot.id, next: { op: 'echo', endpoint: LINK_ENDPOINT }, note: 'Shown once. Every real call returns your next key.' } };
  }

  // 5. Every real call: validate first, then renew (bounded by cap) + rotate in one CAS on the bot record.
  async call(key, req = {}) {
    const op = req.op, requestId = req.requestId == null ? null : req.requestId;
    if (!OPS.includes(op)) return err(400, 'unsupported_operation', { supported: OPS });
    if (requestId !== null && (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(requestId))) return err(400, 'requestId must be 16-64 characters [A-Za-z0-9_-]');
    if (op === 'act') {
      if (!this.executeAct) return err(501, 'no_policy_transport', { note: 'This deployment cannot route actions through policy for link keys.' });
      if (typeof req.action !== 'string' || !this.actions().includes(req.action)) return err(400, 'unsupported_action', { supported: this.actions() });
    }
    const kh = sha(key || ''), idx = await this.getJ('bl:key:' + kh);
    if (!idx) return err(401, 'needs_repaste');
    const b0 = await this.getJ('bl:bot:' + idx.botId);
    if (!b0 || b0.revoked) return err(401, 'revoked');
    if (b0.agentId && !await this.authorize(b0)) return err(401, 'revoked', { reason: 'agent_not_active' });
    let reuse = false, retried = null, next = null;
    const out = await this.mutate('bl:bot:' + idx.botId, b => {
      reuse = false; retried = null;
      const t = this.now();
      if (!b || b.revoked) return { out: err(401, 'revoked') };
      if (idx.series !== b.series) return { out: err(401, 'needs_repaste', { reason: 'key_replaced' }) }; // retired by a re-paste, not a collision
      if (b.needsRepaste) return { out: err(401, 'needs_repaste', { reason: b.needsRepaste }) };
      const dead = t >= b.capAt ? 'absolute_cap_reached' : t >= b.idleExpiresAt ? 'idle_expired' : null;
      if (dead) return { next: { ...b, keyHash: null, needsRepaste: dead }, out: err(401, 'needs_repaste', { reason: dead }) };
      const sameRequest = b.keyHash !== kh && b.prev && b.prev.hash === kh && requestId && b.prev.requestId === requestId && b.prev.op === op
        && b.prev.issuedGen === b.keyGen && t - b.prev.at <= this.o.retryGraceMs;
      if (sameRequest && !b.prev.done) return { out: err(409, 'request_in_progress', { retryAfterSeconds: 2 }) };
      const isRetry = sameRequest && b.prev.done;
      if (b.keyHash !== kh && !isRetry) { // someone still holds an old key: both drop.
        reuse = true; return { next: { ...b, keyHash: null, needsRepaste: 'key_reuse_detected' }, out: err(401, 'needs_repaste', { reason: 'key_reuse_detected' }) };
      }
      const nk = rand(32, 'alk_'), nh = sha(nk); next = nk;
      const gen = b.keyGen + 1;
      if (isRetry) { // lost response: hand out a fresh successor, never re-run the action. The lost successor dies.
        retried = b.prev.result;
        return { next: { ...b, keyHash: nh, keyGen: gen, prev: { ...b.prev, issuedGen: gen } }, out: null };
      }
      return { next: { ...b, keyHash: nh, keyGen: gen, lastRealCallAt: t, idleExpiresAt: Math.min(t + this.o.idleMs, b.capAt),
        prev: { hash: kh, requestId, op, at: t, issuedGen: gen, done: false, result: null } }, out: null };
    });
    if (reuse) { this.emit('needs_repaste', idx.botId, { reason: 'key_reuse_detected' }); await this.onAlert({ ws: b0.ws, kind: 'key_reuse_detected', botId: idx.botId }); }
    if (out) { if (out.body.reason === 'idle_expired' || out.body.reason === 'absolute_cap_reached') this.emit('needs_repaste', idx.botId, { reason: out.body.reason }); return out; }
    const nh = sha(next);
    await this.s.put('bl:key:' + nh, JSON.stringify({ botId: idx.botId, series: idx.series }), this.keyTtl());
    if (retried) return this.reply(idx.botId, next, retried, true);
    // Run the operation. Revoke may have landed since the rotation committed: re-check before acting.
    let result, governed = false;
    const live = await this.getJ('bl:bot:' + idx.botId);
    if (!live || live.revoked || live.keyHash !== nh) return err(401, 'revoked');
    if (op === 'echo') result = { echo: String(req.text || 'ok').slice(0, 200) };
    else { const o = await this.executeAct(live, { action: req.action, params: req.params && typeof req.params === 'object' ? req.params : {} }); result = { httpStatus: o.status, ...o.body }; governed = !!o.governed; }
    const t = this.now();
    await this.mutate('bl:bot:' + idx.botId, b => {
      if (!b || b.revoked || b.series !== idx.series || !b.prev || b.prev.issuedGen !== b.keyGen || b.keyHash !== nh) return { out: null }; // revoked or moved on: record nothing
      return { next: { ...b, prev: { ...b.prev, done: true, result }, verifiedAt: b.verifiedAt || (op === 'echo' ? t : null), governedAt: governed ? t : b.governedAt }, out: null };
    });
    this.emit('real_call', idx.botId, { op, governed });
    await this.onRealCall(live, { op, governed }); // the echo/act IS real accepted activity: HQ presence may use it
    return this.reply(idx.botId, next, result, false);
  }
  async reply(botId, nextKey, result, retried) {
    const b = await this.getJ('bl:bot:' + botId);
    if (!b || b.revoked) return err(401, 'revoked');
    return { status: 200, body: { result, nextKey, retried, idleExpiresAt: b.idleExpiresAt, capAt: b.capAt } };
  }

  // Revoke wins every race: the linked agent is blocked first (so in-flight acts fail policy), then one CAS
  // on the bot clears the key and bumps the epoch (so no rotation, pickup or pre-approved pairing can commit).
  async revoke(ws, botId) {
    const b0 = await this.getJ('bl:bot:' + botId); if (!b0 || b0.ws !== ws) return err(404, 'not_found');
    if (b0.revoked) return { status: 200, body: { status: 'revoked', copy: REVOKE_COPY } };
    await this.onRevoke(b0);
    const out = await this.mutate('bl:bot:' + botId, b => !b ? { out: err(404, 'not_found') } : ({ next: { ...b, keyHash: null, revoked: true, needsRepaste: 'revoked', revokedAt: this.now(), epoch: (b.epoch || 0) + 1 }, out: { status: 200, body: { status: 'revoked', copy: REVOKE_COPY } } }));
    if (out.status === 200) this.emit('revoked', botId);
    return out;
  }

  // Pure read. Never emits, never writes. Time passing alone changes only the label.
  statusOf(b, t = this.now()) {
    const type = BOT_TYPES[b.type];
    let state, reason = null;
    if (b.revoked) { state = 'needs_repaste'; reason = 'revoked'; }
    else if (b.needsRepaste || !b.keyHash) { state = 'needs_repaste'; reason = b.needsRepaste || 'no_key'; }
    else if (t >= b.capAt) { state = 'needs_repaste'; reason = 'absolute_cap_reached'; }
    else if (t >= b.idleExpiresAt) { state = 'needs_repaste'; reason = 'idle_expired'; }
    else if (!b.verifiedAt) state = 'pending_echo';
    else if (t - b.lastRealCallAt <= this.o.connectedWindowMs) state = 'connected';
    else state = 'quiet';
    const label = { connected: 'Connected', quiet: 'Quiet', needs_repaste: b.revoked ? 'Revoked' : 'Needs re-paste', pending_echo: 'Waiting for first echo' }[state];
    const usable = state !== 'needs_repaste';
    return { botId: b.id, name: b.name, type: type.name, transport: 'HTTP link key (' + LINK_ENDPOINT + ')', state, label, reason, agentId: b.agentId || null,
      lastSpokeAt: b.lastRealCallAt || null, lastSpoke: b.lastRealCallAt ? ago(t - b.lastRealCallAt) : 'never',
      note: state === 'quiet' ? 'Key is valid. No real calls recently. This does not mean the bot is offline; Alter cannot see that.' : null,
      capAt: b.capAt || null, capWarning: b.capAt && b.capAt - t <= this.o.capWarnMs && usable ? 'Re-paste needed by ' + new Date(b.capAt).toISOString().slice(0, 10) : null,
      idleExpiresAt: b.idleExpiresAt || null,
      tiers: [
        { tier: 'Connected', state: b.verifiedAt && usable ? 'earned' : 'not_yet', earnedAt: b.verifiedAt || null, why: 'A real echo through Alter succeeded with this key.' },
        { tier: 'Governed', state: b.governedAt && usable ? 'earned' : 'not_yet', earnedAt: b.governedAt || null, why: 'Earned only after this key sends a real action that Alter policy evaluates. ' + REVOKE_COPY },
        { tier: 'Live', state: 'unavailable', why: type.live.why }],
      presence: null, typing: null, // never synthesized
      revokeCopy: REVOKE_COPY };
  }
  async list(ws) { const ids = await this.s.smembers('bl:bots:' + ws); const out = []; for (const id of ids) { const b = await this.getJ('bl:bot:' + id); if (b) out.push(this.statusOf(b)); } return out; }
  async repasteMessage(ws, botId, origin) { const b = await this.getJ('bl:bot:' + botId); if (!b || b.ws !== ws) return err(404, 'not_found'); return this.createPairing({ ws, account: b.account, type: b.type, reattachBotId: b.id, origin }); }

  // Uniform adapter surface per bot. Every type uses the same HTTP link-key path today.
  adapter(type) {
    const t = BOT_TYPES[type]; if (!t) throw Error('unknown bot type');
    return { type, transport: TRANSPORTS[t.transport], keyEndpoint: LINK_ENDPOINT,
      connect: a => this.createPairing({ ...a, type }), verify: key => this.call(key, { op: 'echo', text: 'verify' }),
      call: (key, req) => this.call(key, req), reconnect: (ws, botId, origin) => this.repasteMessage(ws, botId, origin),
      revoke: (ws, botId) => this.revoke(ws, botId), status: b => this.statusOf(b) };
  }
}
function ago(ms) { const m = Math.floor(ms / 60e3); if (m < 1) return 'just now'; if (m < 60) return m + 'm ago'; const h = Math.floor(m / 60); if (h < 48) return h + 'h ago'; return Math.floor(h / 24) + 'd ago'; }
// Test store with the same contract as the Redis adapter in api/index.js: cas() mirrors BOTLINK_CAS
// (-1 missing, 0 changed, 1 written; keeps the key's TTL), add() is SET NX PX, put() is SET PX. TTLs expire on the given clock.
function memoryStore(now = Date.now) {
  const kv = new Map(), ttl = new Map();
  const alive = k => { if (ttl.has(k) && now() >= ttl.get(k)) { kv.delete(k); ttl.delete(k); } return kv.has(k); };
  const setT = (k, ms) => { if (ms) ttl.set(k, now() + ms); else ttl.delete(k); };
  return { kv, ttl,
    get: async k => alive(k) ? kv.get(k) : null,
    cas: async (k, expected, next) => { if (!alive(k)) return -1; if (kv.get(k) !== expected) return 0; kv.set(k, next); return 1; },
    add: async (k, v, ms) => { if (alive(k)) return false; kv.set(k, v); setT(k, ms); return true; },
    put: async (k, v, ms) => { kv.set(k, v); setT(k, ms); return 'OK'; },
    incr: async k => { const n = Number(alive(k) ? kv.get(k) : 0) + 1; kv.set(k, String(n)); return n; },
    sadd: async (k, v) => { const s = new Set(kv.get(k) || []); s.add(v); kv.set(k, [...s]); },
    smembers: async k => kv.get(k) || [] };
}
module.exports = { BotLink, BOT_TYPES, TRANSPORTS, REVOKE_COPY, DEFAULTS, LINK_ENDPOINT, OPS, memoryStore, sha };
