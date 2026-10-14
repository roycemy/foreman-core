'use strict';
// Alter bot link: one onboarding + stay-connected core for every bot type.
// Transport adapters (MCP / HTTP gateway key / paired runner) share this core, so the
// onboarding screens never change per bot. Only the copy-ready message text differs.
//
// Storage is a tiny async KV interface ({get,set,setNX,del}) so it runs on the existing
// Upstash/Vercel KV client in production and an in-memory map in tests.
// Secrets: keys and caller secrets are only ever stored as SHA-256 hashes. Nothing here logs.
const crypto = require('crypto');
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const rand = (n, p = '') => p + crypto.randomBytes(n).toString('base64url');
const eqHash = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

const HOUR = 3600e3, DAY = 24 * HOUR;
const DEFAULTS = {
  pairingTtlMs: 10 * 60e3,        // pairing ID lives 10 minutes, single use
  idleMs: 30 * DAY,               // key dies after 30 idle days
  capMs: 90 * DAY,                // absolute cap: renewal can never pass this
  connectedWindowMs: 6 * HOUR,    // Connected = real call within 6h; after that Quiet
  capWarnMs: 7 * DAY,
};

// ---------- adapters: same interface, three transports ----------
// connect/verify/call/reconnect/revoke/status are implemented once in BotLink and
// exposed per bot through adapter(); the transport only describes how the bot talks.
const TRANSPORTS = {
  mcp: { id: 'mcp', label: 'MCP', endpoint: '/api/mcp', liveSignals: 'foreman_owner_conversation (real start/update/end only)' },
  http_key: { id: 'http_key', label: 'HTTP gateway key', endpoint: '/api/link/call', liveSignals: null },
  runner: { id: 'runner', label: 'Paired runner', endpoint: '/api/link/call', liveSignals: null },
};
// Adding a bot type = one entry here. The onboarding UI renders from this list only.
const BOT_TYPES = {
  instinct: { id: 'instinct', name: 'Instinct', transport: 'runner', maxPerRecord: 1, live: { possible: false, why: 'Instinct does not send real typing or presence events today, so Alter shows no Live tier.' },
    message: link => `Connect to Alter. Open ${link} in your browser worker, keep that tab open until Alter says Connected, then call the echo it gives you. This link contains no secret.` },
  grok: { id: 'grok', name: 'Grok', transport: 'mcp', maxPerRecord: 1, live: { possible: true, why: 'Live appears only while Grok reports a real conversation through foreman_owner_conversation.' },
    message: link => `Connect to Alter. Fetch ${link}, follow its JSON steps (hello, wait for owner approval, collect your key once, run the echo). This link contains no secret.` },
  muse: { id: 'muse', name: 'Muse', transport: 'http_key', maxPerRecord: 1, live: { possible: false, why: 'Meta does not give Alter real typing or presence events for Muse, so there is no Live tier. Alter will not fake one.' },
    message: link => `Connect to Alter over plain HTTP. POST to ${link} with a fresh nonce and a secret you keep, poll the same URL until approved to collect your key once, then POST {"op":"echo"} to /api/link/call. This link contains no secret.` },
};
const REVOKE_COPY = 'Alter blocks new requests from this bot that go through Alter. It cannot stop calls the bot makes outside Alter.';

class BotLink {
  constructor({ store, now = Date.now, opts = {}, onRevoke = async () => {}, onAlert = async () => {}, onBotCreated = async () => null }) {
    this.s = store; this.now = now; this.o = { ...DEFAULTS, ...opts }; this.onRevoke = onRevoke; this.onAlert = onAlert; this.onBotCreated = onBotCreated;
    this.events = []; this.listeners = new Set();
  }
  // Events fire only from real inbound calls or owner actions. Nothing is timer-driven.
  emit(type, botId, extra = {}) { const e = { type, botId, at: this.now(), ...extra }; this.events.push(e); if (this.events.length > 500) this.events.shift(); for (const l of this.listeners) l(e); }
  async getJ(k) { const v = await this.s.get(k); return v ? JSON.parse(v) : null; }
  setJ(k, o) { return this.s.set(k, JSON.stringify(o)); }

  types() { return Object.values(BOT_TYPES).map(t => ({ id: t.id, name: t.name, transport: TRANSPORTS[t.transport].label })); }

  // 1. Owner: pick bot -> one copy-ready message with a non-secret link.
  async createPairing({ ws, account, type, reattachBotId = null, origin = 'https://alter.invalid' }) {
    const t = BOT_TYPES[type]; if (!t) return { status: 400, body: { error: 'unknown_bot_type' } };
    if (reattachBotId) { const b = await this.getJ('bl:bot:' + reattachBotId); if (!b || b.ws !== ws || b.type !== type) return { status: 404, body: { error: 'bot_not_found' } }; }
    const pid = rand(18, 'pr_'), p = { pid, ws, account: String(account || '').slice(0, 80), type, reattachBotId, status: 'waiting', createdAt: this.now(), expires: this.now() + this.o.pairingTtlMs };
    await this.setJ('bl:pair:' + pid, p);
    const link = origin + '/api/pair/' + pid;
    return { status: 200, body: { pairingId: pid, link, message: t.message(link), expiresAt: p.expires, reattach: !!reattachBotId } };
  }

  // 2. Bot: hello with pairing ID + nonce + hash of a secret it keeps. Second distinct caller kills the pairing.
  async hello(pid, { nonce, callerSecret, fingerprint = {}, oldKey = null }) {
    if (typeof nonce !== 'string' || nonce.length < 16 || typeof callerSecret !== 'string' || callerSecret.length < 24) return { status: 400, body: { error: 'nonce (16+) and callerSecret (24+) required' } };
    const p = await this.getJ('bl:pair:' + pid); if (!p) return { status: 404, body: { error: 'pairing_unavailable' } };
    if (p.status === 'killed') return { status: 410, body: { error: 'pairing_killed' } };
    if (this.now() > p.expires) return { status: 410, body: { error: 'pairing_expired' } };
    if (!await this.s.setNX('bl:nonce:' + sha(nonce), '1')) return { status: 409, body: { error: 'nonce_replayed' } };
    const ch = sha(callerSecret);
    const claimed = await this.s.setNX('bl:pairClaim:' + pid, ch);
    const owner = claimed ? ch : await this.s.get('bl:pairClaim:' + pid);
    if (!eqHash(owner, ch)) { // not first-wins: any second caller burns the pairing for everyone
      p.status = 'killed'; p.killedReason = 'second_caller'; await this.setJ('bl:pair:' + pid, p);
      this.emit('pairing_killed', p.reattachBotId, { pid, reason: 'second_caller' });
      await this.onAlert({ ws: p.ws, kind: 'pairing_second_caller', pid, type: p.type });
      return { status: 410, body: { error: 'pairing_killed' } };
    }
    if (p.status !== 'waiting' && p.status !== 'claimed') return { status: 409, body: { error: 'pairing_' + p.status } };
    p.status = 'claimed'; p.callerHash = ch;
    p.fingerprint = { transport: TRANSPORTS[BOT_TYPES[p.type].transport].label, userAgent: String(fingerprint.userAgent || '').slice(0, 120), ipRegion: String(fingerprint.ipRegion || 'unknown').slice(0, 40), appId: String(fingerprint.appId || '').slice(0, 60) };
    if (oldKey && p.reattachBotId) { const k = await this.getJ('bl:key:' + sha(oldKey)); p.oldKeyProven = !!(k && k.botId === p.reattachBotId); }
    await this.setJ('bl:pair:' + pid, p);
    this.emit('pairing_hello', p.reattachBotId, { pid });
    return { status: 202, body: { status: 'awaiting_owner_approval' } };
  }

  // 3. Owner approval screen: bot type, account, caller fingerprint, and the existing bot it would re-attach to.
  async approvalView(ws, pid) {
    const p = await this.getJ('bl:pair:' + pid); if (!p || p.ws !== ws) return { status: 404, body: { error: 'not_found' } };
    const target = p.reattachBotId ? await this.getJ('bl:bot:' + p.reattachBotId) : null;
    return { status: 200, body: { pairingId: pid, botType: BOT_TYPES[p.type].name, account: p.account, fingerprint: p.fingerprint || null, status: p.status, expiresAt: p.expires, botId: p.botId || null,
      reattach: target ? { botId: target.id, name: target.name, lastRealCallAt: target.lastRealCallAt || null, oldKeyProven: !!p.oldKeyProven } : null,
      title: target ? `Reconnect ${target.name}?` : `Approve ${BOT_TYPES[p.type].name} on ${p.account || 'this account'}?` } };
  }
  async approve(ws, pid, { confirmBotId = null } = {}) {
    const p = await this.getJ('bl:pair:' + pid); if (!p || p.ws !== ws) return { status: 404, body: { error: 'not_found' } };
    if (p.status !== 'claimed') return { status: 409, body: { error: p.status === 'waiting' ? 'bot_has_not_called_yet' : 'pairing_' + p.status } };
    if (this.now() > p.expires) return { status: 410, body: { error: 'pairing_expired' } };
    if (p.reattachBotId && !p.oldKeyProven && confirmBotId !== p.reattachBotId) return { status: 409, body: { error: 'reattach_requires_old_key_or_owner_naming_existing_bot' } };
    if (!await this.s.setNX('bl:pairApproved:' + pid, '1')) return { status: 409, body: { error: 'already_approved' } };
    p.status = 'approved'; p.approvedAt = this.now(); await this.setJ('bl:pair:' + pid, p);
    this.emit('pairing_approved', p.reattachBotId, { pid });
    return { status: 200, body: { status: 'approved' } };
  }

  // 4. Bot polls the pairing ID (plain HTTP works) and collects its key exactly once.
  async pickup(pid, { callerSecret }) {
    const p = await this.getJ('bl:pair:' + pid); if (!p) return { status: 404, body: { error: 'pairing_unavailable' } };
    if (p.status === 'killed') return { status: 410, body: { error: 'pairing_killed' } };
    if (!p.callerHash || !eqHash(p.callerHash, sha(callerSecret || ''))) return { status: 403, body: { error: 'caller_mismatch' } };
    if (p.status === 'claimed' || p.status === 'waiting') return { status: 202, body: { status: 'awaiting_owner_approval', retryAfterSeconds: 3 } };
    if (p.status !== 'approved' || !await this.s.setNX('bl:pairPicked:' + pid, '1')) return { status: 410, body: { error: 'key_already_collected' } };
    let bot = p.reattachBotId ? await this.getJ('bl:bot:' + p.reattachBotId) : null;
    if (!bot) { // new record. A Grok account may bring several; each pairing without reattach is a new bot.
      const n = Number(await this.s.get('bl:count:' + p.ws + ':' + p.type) || 0) + 1; await this.s.set('bl:count:' + p.ws + ':' + p.type, String(n));
      bot = { id: rand(8, 'bot_'), ws: p.ws, type: p.type, account: p.account, name: BOT_TYPES[p.type].name + (n > 1 ? ' #' + n : ''), createdAt: this.now() };
      bot.agentId = await this.onBotCreated(bot); // optional link to an Alter agent record (broker/governance)
      await this.s.sadd('bl:bots:' + p.ws, bot.id);
    }
    // Old key dies the moment the new one is issued: one live worker per record.
    if (bot.keyHash) { await this.s.del('bl:key:' + bot.keyHash); await this.s.set('bl:retired:' + bot.keyHash, JSON.stringify({ botId: bot.id, why: 'reissued' })); }
    const key = rand(32, 'alk_'), kh = sha(key);
    Object.assign(bot, { keyHash: kh, keyGen: (bot.keyGen || 0) + 1, workerId: rand(6, 'wk_'), capAt: this.now() + this.o.capMs, idleExpiresAt: this.now() + this.o.idleMs,
      verifiedAt: null, revoked: false, needsRepaste: null, pairedVia: pid });
    await this.setJ('bl:bot:' + bot.id, bot); await this.setJ('bl:key:' + kh, { botId: bot.id });
    p.status = 'collected'; p.botId = bot.id; await this.setJ('bl:pair:' + pid, p);
    this.emit('key_issued', bot.id, { reattached: !!p.reattachBotId });
    return { status: 200, body: { key, botId: bot.id, next: { op: 'echo', endpoint: TRANSPORTS[BOT_TYPES[bot.type].transport].endpoint }, note: 'Shown once. Every real call returns your next key.' } };
  }

  // 5. Every real call: renew (bounded by cap) + rotate. Presenting a retired key = collision -> Needs re-paste.
  async call(key, req = {}) {
    const kh = sha(key || ''), k = await this.getJ('bl:key:' + kh);
    if (!k) {
      const ret = await this.getJ('bl:retired:' + kh);
      if (ret && ret.why === 'rotated') { // someone still holds an old key: both drop.
        const b = await this.getJ('bl:bot:' + ret.botId);
        if (b && !b.needsRepaste && !b.revoked) { if (b.keyHash) await this.s.del('bl:key:' + b.keyHash); b.keyHash = null; b.needsRepaste = 'key_reuse_detected'; await this.setJ('bl:bot:' + b.id, b); this.emit('needs_repaste', b.id, { reason: 'key_reuse_detected' }); await this.onAlert({ ws: b.ws, kind: 'key_reuse_detected', botId: b.id }); }
      }
      return { status: 401, body: { error: 'needs_repaste' } };
    }
    const b = await this.getJ('bl:bot:' + k.botId); const t = this.now();
    if (!b || b.revoked) return { status: 401, body: { error: 'revoked' } };
    const dead = t >= b.capAt ? 'absolute_cap_reached' : t >= b.idleExpiresAt ? 'idle_expired' : null;
    if (dead) { await this.s.del('bl:key:' + kh); b.keyHash = null; b.needsRepaste = dead; await this.setJ('bl:bot:' + b.id, b); this.emit('needs_repaste', b.id, { reason: dead }); return { status: 401, body: { error: 'needs_repaste', reason: dead } }; }
    if (!await this.s.setNX('bl:rotating:' + kh, '1')) return { status: 409, body: { error: 'concurrent_use_of_same_key' } };
    const next = rand(32, 'alk_'), nh = sha(next);
    await this.s.del('bl:key:' + kh); await this.s.set('bl:retired:' + kh, JSON.stringify({ botId: b.id, why: 'rotated' }));
    await this.setJ('bl:key:' + nh, { botId: b.id });
    b.keyHash = nh; b.keyGen += 1; b.lastRealCallAt = t; b.idleExpiresAt = Math.min(t + this.o.idleMs, b.capAt);
    let result;
    if (req.op === 'echo') { result = { echo: String(req.text || 'ok').slice(0, 200) }; if (!b.verifiedAt) b.verifiedAt = t; }
    else result = { accepted: true, op: String(req.op || '').slice(0, 40) };
    await this.setJ('bl:bot:' + b.id, b);
    this.emit('real_call', b.id, { op: req.op === 'echo' ? 'echo' : 'call' });
    return { status: 200, body: { result, nextKey: next, idleExpiresAt: b.idleExpiresAt, capAt: b.capAt } };
  }

  async revoke(ws, botId) {
    const b = await this.getJ('bl:bot:' + botId); if (!b || b.ws !== ws) return { status: 404, body: { error: 'not_found' } };
    if (b.keyHash) await this.s.del('bl:key:' + b.keyHash);
    b.keyHash = null; b.revoked = true; b.needsRepaste = 'revoked'; b.revokedAt = this.now(); await this.setJ('bl:bot:' + b.id, b);
    await this.onRevoke(b);
    this.emit('revoked', b.id);
    return { status: 200, body: { status: 'revoked', copy: REVOKE_COPY } };
  }

  // Pure read. Never emits, never writes. Time passing alone changes only the label.
  statusOf(b, t = this.now()) {
    const type = BOT_TYPES[b.type];
    let state, reason = null;
    if (b.needsRepaste || !b.keyHash) { state = 'needs_repaste'; reason = b.needsRepaste || 'no_key'; }
    else if (t >= b.capAt) { state = 'needs_repaste'; reason = 'absolute_cap_reached'; }
    else if (t >= b.idleExpiresAt) { state = 'needs_repaste'; reason = 'idle_expired'; }
    else if (!b.verifiedAt) { state = 'pending_echo'; }
    else if (t - b.lastRealCallAt <= this.o.connectedWindowMs) state = 'connected';
    else state = 'quiet';
    const label = { connected: 'Connected', quiet: 'Quiet', needs_repaste: 'Needs re-paste', pending_echo: 'Waiting for first echo' }[state];
    const live = !type.live.possible ? { tier: 'Live', state: 'unavailable', why: type.live.why } : { tier: 'Live', state: 'only_with_real_events', why: type.live.why };
    return { botId: b.id, name: b.name, type: type.name, transport: TRANSPORTS[type.transport].label, state, label, reason,
      lastSpokeAt: b.lastRealCallAt || null, lastSpoke: b.lastRealCallAt ? ago(t - b.lastRealCallAt) : 'never',
      note: state === 'quiet' ? 'Key is valid. No real calls recently. This does not mean the bot is offline; Alter cannot see that.' : null,
      capAt: b.capAt || null, capWarning: b.capAt && b.capAt - t <= this.o.capWarnMs && state !== 'needs_repaste' ? 'Re-paste needed by ' + new Date(b.capAt).toISOString().slice(0, 10) : null,
      idleExpiresAt: b.idleExpiresAt || null,
      tiers: [
        { tier: 'Connected', state: b.verifiedAt ? 'earned' : 'not_yet', earnedAt: b.verifiedAt || null, why: 'A real echo through Alter succeeded.' },
        { tier: 'Governed', state: b.verifiedAt && state !== 'needs_repaste' ? 'earned' : 'not_yet', why: 'Only requests this bot routes through Alter are governed. ' + REVOKE_COPY },
        live],
      presence: null, typing: null, // never synthesized
      revokeCopy: REVOKE_COPY };
  }
  async list(ws) { const ids = await this.s.smembers('bl:bots:' + ws); const out = []; for (const id of ids) { const b = await this.getJ('bl:bot:' + id); if (b) out.push(this.statusOf(b)); } return out; }
  async repasteMessage(ws, botId, origin) { const b = await this.getJ('bl:bot:' + botId); if (!b || b.ws !== ws) return { status: 404, body: { error: 'not_found' } }; return this.createPairing({ ws, account: b.account, type: b.type, reattachBotId: b.id, origin }); }

  // Uniform adapter surface per bot.
  adapter(type) {
    const t = BOT_TYPES[type]; if (!t) throw Error('unknown bot type');
    return { type, transport: TRANSPORTS[t.transport],
      connect: a => this.createPairing({ ...a, type }), verify: key => this.call(key, { op: 'echo', text: 'verify' }),
      call: (key, req) => this.call(key, req), reconnect: (ws, botId, origin) => this.repasteMessage(ws, botId, origin),
      revoke: (ws, botId) => this.revoke(ws, botId), status: b => this.statusOf(b) };
  }
}
function ago(ms) { const m = Math.floor(ms / 60e3); if (m < 1) return 'just now'; if (m < 60) return m + 'm ago'; const h = Math.floor(m / 60); if (h < 48) return h + 'h ago'; return Math.floor(h / 24) + 'd ago'; }
function memoryStore() {
  const kv = new Map();
  return { kv, get: async k => kv.has(k) ? kv.get(k) : null, set: async (k, v) => { kv.set(k, v); return 'OK'; }, setNX: async (k, v) => { if (kv.has(k)) return false; kv.set(k, v); return true; },
    del: async k => { kv.delete(k); return 1; }, sadd: async (k, v) => { const s = new Set(kv.get(k) || []); s.add(v); kv.set(k, [...s]); }, smembers: async k => kv.get(k) || [] };
}
module.exports = { BotLink, BOT_TYPES, TRANSPORTS, REVOKE_COPY, DEFAULTS, memoryStore, sha };
