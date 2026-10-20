/* Alter · owner flags: (1) the red reconnect flag under the crew pill (what is wrong, one tap copies the exact setup message,
   then a short "just paste" card with the provider link) and (2) receipts that ship: a receipt card flies into the Receipts tab
   and the tab says "N new" until it is opened. Reads state only; nothing here approves, spends or sends. */
(function () {
  'use strict';
  const BB = window.BB, $ = BB.$, $$ = BB.$$, esc = BB.esc;
  if (!BB) return;
  const STALE_MIN = 30;
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. reconnect flag ---------- */
  function flagged() {
    const out = [], now = BB.now();
    if (!BB.S) return out;
    BB.agents().forEach(a => {
      if (!a || BB.isGhost(a)) return;
      const pr = BB.presence(a);
      if (pr === 'reconnect') {
        const why = a.connection && a.connection.reason;
        out.push({ a, kind: 'reconnect', why: why === 'refresh_replay' ? 'its renewal token was reused' : why === 'persistent_grant_missing' ? 'its saved login is missing' : 'its session expired' });
      } else if (pr === 'revoked') out.push({ a, kind: 'revoked', why: 'its access was revoked' });
      else if (pr === 'connected' && a.status === 'active' && !a.paused && !BB.S.killed && a.providerId !== 'muse' && BB.wentDark(a) && a.lastSeen && now - Date.parse(a.lastSeen) >= STALE_MIN * 60000) out.push({ a, kind: 'dark', why: "it hasn't checked in for " + BB.dur(now - Date.parse(a.lastSeen)) });
    });
    return out;
  }
  const stage = $('#stage'), roster = $('#roster');
  const box = document.createElement('div'); box.className = 'recflags'; box.id = 'recflags'; box.setAttribute('aria-live', 'polite');
  if (stage) (roster && roster.parentNode === stage ? roster.after(box) : stage.appendChild(box));
  let flagSig = '', busy = {};
  const FLAG_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M3.5 1.5v13h1.4V9.6h6.9c.6 0 .9-.6.6-1.1L10.9 6l1.5-2.5c.3-.5 0-1.1-.6-1.1H4.9V1.5z"/></svg>';
  function paintFlags() {
    const fl = flagged(), sig = fl.map(f => f.a.id + f.kind + f.why).join('|') + '|' + Object.keys(busy).join(',');
    if (sig === flagSig) return; flagSig = sig;
    box.innerHTML = fl.map(f => `<button class="recflag${busy[f.a.id] ? ' busy' : ''}" type="button" data-fid="${esc(f.a.id)}" data-k="${f.kind}"><span class="fi">${FLAG_SVG}</span><span class="ft"><b>${esc(f.a.name)} ${f.kind === 'revoked' ? 'is switched off' : 'needs reconnecting'}</b><small>Because ${esc(f.why)}. ${f.kind === 'revoked' ? 'Tap to restore it.' : 'Tap to copy the setup message.'}</small></span></button>`).join('');
    $$('.recflag', box).forEach(b => b.onclick = () => fix(b.dataset.fid, b.dataset.k));
  }
  function guide(html) {
    let g = $('#recguide'); if (!g) { g = document.createElement('div'); g.id = 'recguide'; g.className = 'recguide'; g.setAttribute('role', 'status'); document.body.appendChild(g); }
    g.innerHTML = html; g.classList.add('on'); return g;
  }
  async function fix(id, kind) {
    const a = BB.agent(id); if (!a || busy[id]) return;
    if (kind === 'revoked') { BB.toast('Open the bot and tap Restore access.'); BB.openInspector && BB.openInspector(id); return; }
    busy[id] = 1; paintFlags();
    let r; try { r = await BB.reconnectCopy(id); } finally { delete busy[id]; flagSig = ''; paintFlags(); }
    const label = a.name;
    if (r && r.ok) {
      const g = guide(`<b>Copied.</b><p>${r.url ? 'Open ' + esc(label) + ' and just paste it into the chat, then send.' : 'Go to ' + esc(label) + ' and just paste it into its chat, then send.'}</p><div class="acts">${r.url ? `<a class="b ink sm" href="${esc(r.url)}" target="_blank" rel="noopener" id="recopen">Open ${esc(a.name)}'s chat</a>` : ''}<button class="b ghost sm" type="button" id="recdone">Done</button></div>`);
      const done = () => g.classList.remove('on'); $('#recdone', g).onclick = done; setTimeout(done, 45000);
      if (r.url) { try { window.open(r.url, '_blank', 'noopener'); } catch (e) {} }
    } else if (r && r.text) {
      const m = BB.modal(`<h3>Copy this, then paste it into ${esc(label)}</h3><p>Your browser blocked the automatic copy. Select all and copy.</p><textarea class="in" readonly style="min-height:200px">${esc(r.text)}</textarea>${r.url ? `<div class="acts"><a class="b ink" href="${esc(r.url)}" target="_blank" rel="noopener">Open ${esc(label)}'s chat</a></div>` : ''}`, { label: 'Setup message', focus: 'textarea' });
      const t = m.querySelector('textarea'); if (t) { t.focus(); t.select(); }
    } else BB.toast("Couldn't prepare the setup message" + (r && r.error ? ': ' + r.error : '') + '. Open the bot and use Reconnect.');
  }

  /* ---------- 2. receipts that ship ---------- */
  const KEY = 'alter.receipts.seen.v1';
  let seen = null, known = null, queue = [], playing = false; BB._rcptNew = new Set();
  const load = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY) || 'null') || []); } catch (e) { return null; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...seen].slice(-400))); } catch (e) {} };
  const fin = () => BB.tasks().filter(t => ['done', 'failed'].includes(t.status) && t.finishedAt);
  BB.isNewReceipt = id => BB._rcptNew.has(id);
  const targets = () => $$('#nav a[data-v=receipts],#tabs a[data-v=receipts]').filter(e => e.offsetParent);
  function badges() {
    const n = fin().filter(t => !seen.has(t.id)).length;
    $$('#nav a[data-v=receipts],#tabs a[data-v=receipts]').forEach(a => {
      let b = a.querySelector('.rbadge'); if (!b) { b = document.createElement('i'); b.className = 'rbadge'; a.appendChild(b); }
      const txt = n + ' new'; if (b.textContent !== txt) b.textContent = txt; b.hidden = !n;
      a.setAttribute('aria-label', 'Receipts' + (n ? ', ' + n + ' new' : ''));
    });
  }
  function ship(t) {
    const bot = BB.agent(t.assignee), ms = Date.parse(t.finishedAt) - Date.parse(t.createdAt), cost = t.modelCostUsd != null && t.status !== 'failed' ? BB.modelCost(t.modelCostUsd) : null;
    const c = document.createElement('a'); c.className = 'rcard'; c.href = '#receipts/' + t.id;
    c.innerHTML = `<span class="rc-top"><span class="rc-av" style="--av:${bot ? BB.avColor(bot) : '#121212'}">${esc(bot ? BB.initials(bot.name) : '?')}</span><span class="rc-k">${t.status === 'failed' ? 'Stopped' : 'Receipt'}</span><span class="rc-t">${esc(BB.when ? BB.when(t.finishedAt) : '')}</span></span><b class="rc-h">${esc(t.title)}</b><span class="rc-m">${esc((bot ? bot.name : 'A bot') + (t.status === 'failed' ? ' stopped after ' : ' finished in ') + BB.durWords(ms) + (cost ? ' · ' + cost : ''))}</span><span class="rc-edge" aria-hidden="true"></span>`;
    document.body.appendChild(c);
    const go = () => c.remove(); c.addEventListener('click', go);
    const enter = c.animate([{ transform: 'translate(-50%,24px) scale(.96)', opacity: 0 }, { transform: 'translate(-50%,0) scale(1)', opacity: 1 }], { duration: reduced() ? 1 : 320, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    return new Promise(res => setTimeout(() => {
      if (!c.isConnected) return res();
      const tg = targets()[0], r = c.getBoundingClientRect();
      let fly;
      if (tg && !reduced()) {
        const q = tg.getBoundingClientRect(), dx = q.left + q.width / 2 - (r.left + r.width / 2), dy = q.top + q.height / 2 - (r.top + r.height / 2);
        fly = c.animate([{ transform: 'translate(-50%,0) scale(1) rotate(0)', opacity: 1, offset: 0 }, { transform: 'translate(calc(-50% + ' + dx * .6 + 'px),' + (dy * .6 - 40) + 'px) scale(.55) rotate(-5deg)', opacity: 1, offset: .55 }, { transform: 'translate(calc(-50% + ' + dx + 'px),' + dy + 'px) scale(.1) rotate(-8deg)', opacity: 0, offset: 1 }], { duration: 850, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' });
      } else fly = c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
      fly.onfinish = () => { c.remove(); $$('.rbadge').forEach(b => { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }); res(); };
    }, reduced() ? 3500 : 3200));
  }
  async function play() { if (playing) return; playing = true; while (queue.length) { const t = queue.shift(); if (!BB.route || BB.route().v !== 'receipts') await ship(t); } playing = false; }
  function receipts() {
    if (!BB.S) return;
    if (!seen) { seen = load(); if (!seen) { seen = new Set(fin().map(t => t.id)); save(); } }
    if (!known) { known = new Set(fin().map(t => t.id)); }
    const here = BB.route().v === 'receipts';
    const fresh = fin().filter(t => !known.has(t.id)).sort((a, b) => String(a.finishedAt).localeCompare(String(b.finishedAt)));
    fresh.forEach(t => known.add(t.id));
    if (fresh.length && !here) { queue.push(...fresh.slice(-3)); play(); }
    if (here) { fin().forEach(t => { if (!seen.has(t.id)) { BB._rcptNew.add(t.id); seen.add(t.id); } }); save(); }
    else if (BB._rcptNew.size) BB._rcptNew = new Set();
    badges();
  }
  BB.onRoute && BB.onRoute(() => { try { receipts(); } catch (e) {} });
  BB.on(() => { try { paintFlags(); receipts(); } catch (e) { console.error(e); } });
})();
