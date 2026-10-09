/* Black Box vNext · shell: sign-in, routing, top bar, account menu, emergency stop, composer, crew pill.
   Panels (inbox, inspector), receipts, card, connect and the command palette register themselves on BB. */
(function () {
  'use strict';
  const BB = window.BB, $ = BB.$, $$ = BB.$$, esc = BB.esc;
  /* icon slots in the static markup */
  const ICONS = { plus: BB.ICON.plus, grid: BB.ICON.grid, stop: BB.ICON.stop, out: BB.ICON.out, up: BB.ICON.up, inbox: BB.ICON.inbox, receipt: BB.ICON.receipt, card: BB.ICON.card };
  ['#acctmenu', '#ask', '#tabs'].forEach(s => { const e = $(s); if (e) e.innerHTML = e.innerHTML.replace(/\$\{(\w+)\}/g, (m, k) => ICONS[k] || ''); });
  $$('.menu button svg,.menu a svg').forEach(s => { s.setAttribute('width', 15); s.setAttribute('height', 15); });

  /* ---------- routing ---------- */
  const VIEWS = ['floor', 'inbox', 'receipts', 'card'];
  BB.route = () => { const h = location.hash.replace(/^#/, ''); const [v, ...rest] = h.split('/'); return { v: VIEWS.includes(v) ? v : (BB.phone() ? 'inbox' : 'floor'), arg: rest.join('/') || null }; };
  BB.go = h => { if (location.hash !== h) location.hash = h; else applyRoute(); };
  const routeHooks = BB._routeHooks;
  function applyRoute() {
    let r = BB.route();
    /* desktop has no Inbox page: the Inbox is a rail on the floor */
    if (r.v === 'inbox' && !BB.phone()) { history.replaceState(null, '', '#floor'); r = { v: 'floor' }; setTimeout(() => BB.openRail && BB.openRail(), 0); }
    VIEWS.forEach(v => { const e = $('#v-' + v); if (e) e.classList.toggle('on', v === r.v); });
    $$('#nav a,#tabs a').forEach(a => { if (a.dataset.v === r.v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (r.v !== 'floor') { BB.closePanels && BB.closePanels(); }
    routeHooks.forEach(fn => fn(r));
    if (r.v === 'floor') requestAnimationFrame(() => BB.floorFit && BB.floorFit());
    document.title = BB.t ? BB.t('{brand}') : document.title;
  }
  addEventListener('hashchange', applyRoute);
  let wasPhone = BB.phone();
  addEventListener('resize', () => { const p = BB.phone(); if (p !== wasPhone) { wasPhone = p; applyRoute(); } });
  $$('[data-go]').forEach(b => b.onclick = () => BB.go(b.dataset.go));

  /* ---------- sign-in ---------- */
  let mode = 'in';
  const au = $('#auth');
  function needAuth() { au.classList.add('on'); setTimeout(() => { const f = $('#aue'); if (f && !f.value) f.focus(); }, 30); }
  BB.onAuth = needAuth;
  function setMode(m) {
    mode = m; $('#aug').textContent = m === 'in' ? 'Sign in' : 'Create account'; $('#auth-h').textContent = m === 'in' ? 'Sign in' : 'Create your account';
    $('#aum').textContent = m === 'in' ? 'Create an account' : 'I already have an account'; $('#aup').autocomplete = m === 'in' ? 'current-password' : 'new-password';
    if (m === 'in') $('#auc-l').hidden = true;
  }
  $('#aum').onclick = () => setMode(mode === 'in' ? 'up' : 'in');
  $('#aucl').onclick = () => { setMode('up'); $('#auc-l').hidden = false; $('#auc').focus(); };
  $('#authf').onsubmit = async e => {
    e.preventDefault(); $('#aur').textContent = ''; $('#aug').disabled = true;
    const b = { email: $('#aue').value.trim(), password: $('#aup').value }; if (mode === 'up' && $('#auc').value.trim()) b.claim = $('#auc').value.trim();
    try {
      const j = await BB.api('/api/auth/' + (mode === 'in' ? 'login' : 'signup'), 'POST', b);
      if (j.error) { $('#aur').textContent = j.error; return; }
      $('#aup').value = ''; au.classList.remove('on'); await boot();
    } finally { $('#aug').disabled = false; }
  };

  /* ---------- account menu ---------- */
  const acct = $('#acctbtn'), menu = $('#acctmenu');
  const setMenu = on => { menu.classList.toggle('on', on); acct.setAttribute('aria-expanded', on); if (on) { const f = menu.querySelector('button'); f && f.focus(); } };
  acct.onclick = e => { e.stopPropagation(); setMenu(!menu.classList.contains('on')); };
  document.addEventListener('click', e => { if (!e.target.closest('.acct')) setMenu(false); });
  menu.addEventListener('keydown', e => { if (e.key === 'Escape') { setMenu(false); acct.focus(); } });
  document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b) return; setMenu(false); BB.act(b.dataset.act); });
  BB.act = function (k) {
    if (k === 'connect') return BB.openConnect ? BB.openConnect() : null;
    if (k === 'perms') return BB.openPermsOverview ? BB.openPermsOverview() : null;
    if (k === 'emergency') return openEmergency();
    if (k === 'signout') return signOut();
  };
  async function signOut() { await fetch('/api/auth/logout', { method: 'POST' }); location.reload(); }

  /* ---------- modal helper (focus trap, Escape, restore focus) ---------- */
  let lastFocus = null, modalClose = null;
  BB.modal = function (html, opts) {
    opts = opts || {}; const m = $('#modal'), box = m.querySelector('.box');
    lastFocus = document.activeElement; box.className = 'box' + (opts.wide ? ' wide' : '');
    box.innerHTML = `<button class="x" type="button" aria-label="Close" data-close>${BB.ICON.x}</button>` + html;
    m.setAttribute('aria-label', opts.label || 'Dialog'); m.classList.add('on'); modalClose = opts.onClose || null;
    box.querySelectorAll('[data-close]').forEach(b => b.onclick = BB.closeModal);
    requestAnimationFrame(() => { const f = box.querySelector(opts.focus || 'input,select,textarea,button:not([data-close])'); (f || box).focus && (f || box).focus(); });
    return box;
  };
  BB.closeModal = function () { const m = $('#modal'); if (!m.classList.contains('on')) return; m.classList.remove('on'); if (modalClose) { const f = modalClose; modalClose = null; f(); } if (lastFocus && lastFocus.focus) lastFocus.focus(); };
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') BB.closeModal(); });
  $('#modal').addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); BB.closeModal(); return; }
    if (e.key !== 'Tab') return; const f = $$('#modal .box button:not([disabled]),#modal .box input,#modal .box select,#modal .box textarea,#modal .box a[href]').filter(x => x.offsetParent); if (!f.length) return;
    const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  });

  /* ---------- emergency stop: moved out of the bar into the account menu and the command palette ---------- */
  function openEmergency() {
    const S = BB.S || {}, as = BB.agents().filter(a => a.status === 'active'), allRevoked = BB.agents().length > 0 && !as.length;
    const box = BB.modal(`<h3>Emergency stop</h3><p>Stops every bot at once. Nothing is deleted.</p>
      <div class="stackf"><button class="b ${S.killed ? 'ink' : 'pri'} lg block" id="em-kill">${S.killed ? 'Resume all bots' : 'Pause all bots now'}</button>
      <button class="b out lg block" id="em-rev">${allRevoked ? 'Restore every bot\'s access' : 'Revoke every bot\'s access'}</button>
      <p class="meta">Pause blocks every action until you resume. Revoke also signs bots out; they need to reconnect after you restore access.</p></div>`, { label: 'Emergency stop', focus: '#em-kill' });
    box.querySelector('#em-kill').onclick = async () => { await BB.api('/api/kill', 'POST', { on: !S.killed }); BB.closeModal(); BB.toast(S.killed ? 'Resumed. Bots can act again.' : 'Paused. No bot can act until you resume.'); BB.sync(true); };
    const rev = box.querySelector('#em-rev');
    rev.onclick = async () => {
      if (!rev.dataset.arm) { rev.dataset.arm = 1; rev.textContent = 'Click again to confirm'; return; }
      rev.disabled = true; for (const a of BB.agents()) await BB.api('/api/agents/' + a.id + '/' + (allRevoked ? 'restore' : 'revoke'), 'POST');
      BB.closeModal(); BB.toast(allRevoked ? 'Access restored.' : 'Access revoked for every bot.'); BB.sync(true);
    };
  }
  BB.openEmergency = openEmergency;
  $('#resume').onclick = async () => { await BB.api('/api/kill', 'POST', { on: false }); BB.toast('Resumed. Bots can act again.'); BB.sync(true); };

  /* ---------- composer: "Ask the team for something…" creates a real job ---------- */
  const ask = $('#ask'), askin = $('#askin');
  askin.addEventListener('input', () => ask.querySelector('button').disabled = !askin.value.trim());
  ask.onsubmit = async e => {
    e.preventDefault(); const raw = askin.value.trim(); if (!raw) return;
    /* "@Name do this" assigns it straight to that bot */
    let title = raw, assignee = null; const m = raw.match(/^@(\S+)\s+(.+)$/);
    if (m) { const bot = BB.assignable().find(a => a.name.toLowerCase().replace(/\s+/g, '') === m[1].toLowerCase()); if (bot) { assignee = bot.id; title = m[2]; } }
    ask.querySelector('button').disabled = true;
    const j = await BB.api('/api/tasks', 'POST', { title, assignee });
    if (j.error) { BB.toast(j.error); ask.querySelector('button').disabled = false; return; }
    askin.value = ''; BB.toast(assignee ? 'Sent to ' + BB.agent(assignee).name + '.' : 'Added to your inbox. Pick a bot for it.'); BB.sync(true);
  };
  BB.newJob = function () {
    const box = BB.modal(`<h3>New job</h3><p>Describe what you want done. Pick a bot now, or leave it in your inbox.</p>
      <form class="stackf" id="nj"><label class="fld">What should happen?<input class="in" id="nj-t" maxlength="120" required placeholder="Summarize this week's support tickets"></label>
      <label class="fld">Details <small>optional</small><textarea class="in" id="nj-b" maxlength="1500" style="min-height:90px"></textarea></label>
      <label class="fld">Who takes it<select class="in" id="nj-a"><option value="">Leave unassigned</option>${BB.assignable().map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label>
      <div class="acts"><button class="b ghost" type="button" data-close>Cancel</button><button class="b ink" type="submit">Add job</button></div></form>`, { label: 'New job' });
    box.querySelector('#nj').onsubmit = async e => {
      e.preventDefault(); const j = await BB.api('/api/tasks', 'POST', { title: $('#nj-t').value.trim(), brief: $('#nj-b').value.trim(), assignee: $('#nj-a').value || null });
      if (j.error) return BB.toast(j.error); BB.closeModal(); BB.toast('Job added.'); BB.sync(true);
    };
  };

  /* ---------- crew pill + compact roster ---------- */
  const crew = $('#crew'), roster = $('#roster');
  function paintCrew() {
    const as = BB.agents().filter(a => a.status !== 'revoked'); if (!as.length) { crew.hidden = true; roster.classList.remove('on'); return; } crew.hidden = false;
    const needs = BB.onYou().length, busy = as.filter(a => BB.signal(a) === 'working').length;
    crew.innerHTML = `<span class="stack">${as.slice(0, 5).map((a, i) => BB.av(a, '', BB.glyph(a, -(i * .37)))).join('')}</span><p><b>${as.length} on the floor</b> · ${needs ? needs + ' need' + (needs === 1 ? 's' : '') + ' you' : busy ? busy + ' busy' : 'all on track'}</p>`;
    crew.setAttribute('aria-label', as.length + ' bots on the floor. Open crew');
    if (roster.classList.contains('on')) paintRoster();
  }
  function paintRoster() {
    const as = BB.agents();
    roster.innerHTML = `<h3>Crew <span>${as.length}</span></h3>` + as.map(a => `<button class="r" type="button" data-bot="${a.id}">${BB.av(a)}<span class="t"><b>${esc(a.name)}</b><small>${esc(BB.statusLine(a))}</small></span>${BB.presence(a) === 'reconnect' ? '<span class="st need"><i></i></span>' : BB.wentDark(a) ? '<span class="badge-dark" title="Last accepted activity: ' + esc(new Date(a.lastSeen).toLocaleString()) + '">Went dark</span>' : BB.isGhost(a) ? '' : `<span class="st sig-${BB.signal(a)}" data-signal="${BB.signal(a)}" title="${BB.SIGNAL_COPY[BB.signal(a)]}"><i></i></span>`}</button>`).join('') + `<button class="add" type="button" data-act="connect">${BB.ICON.plus} Connect a bot</button>`;
    roster.querySelectorAll('[data-bot]').forEach(b => b.onclick = () => { setRoster(false); BB.openInspector && BB.openInspector(b.dataset.bot); });
  }
  function setRoster(on) { roster.classList.toggle('on', on); crew.setAttribute('aria-expanded', on); if (on) paintRoster(); }
  crew.onclick = e => { e.stopPropagation(); setRoster(!roster.classList.contains('on')); };
  document.addEventListener('click', e => { if (!e.target.closest('#roster,#crew')) setRoster(false); });
  $('#zin').onclick = () => BB.floorZoom(.15); $('#zout').onclick = () => BB.floorZoom(-.15);

  /* ---------- top bar state ---------- */
  function paintTop() {
    const n = BB.onYou().length;
    [['#icount', n], ['#tcount', n]].forEach(([s, v]) => { const e = $(s); if (!e) return; e.hidden = !v; e.textContent = v; });
    $('#ibtn').setAttribute('aria-label', 'Inbox' + (n ? ', ' + n + ' on you' : ''));
    $('#pausedbar').hidden = !(BB.S && BB.S.killed);
    /* round 3 liveness, kept: a connected bot with no accepted activity for 60s "went dark" */
    const dark = BB.agents().filter(a => BB.wentDark(a)), bar = $('#darkbar');
    bar.hidden = !dark.length || !!(BB.S && BB.S.killed);
    if (dark.length) bar.querySelector('span').textContent = dark.map(a => a.name).join(', ') + ' went dark: no accepted activity for 60s. Authorization may still be saved.';
  }
  BB.on(() => { paintTop(); paintCrew(); });

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown', e => {
    if (e.target.closest('input,textarea,select,[contenteditable]') || $('#modal').classList.contains('on') || $('#auth').classList.contains('on')) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); BB.openCmdk && BB.openCmdk(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') { setRoster(false); BB.closeTop && BB.closeTop(); }
    BB.keys && BB.keys(e);
  });

  /* ---------- phone account button: the top bar is hidden on phones ---------- */
  BB.acctAv = () => `<button class="av" type="button" data-acct aria-label="Account">${esc(acct.textContent)}</button>`;
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-acct]')) return;
    const box = BB.modal(`<h3>${esc((BB.who && BB.who.email) || 'Account')}</h3><div class="stackf">
      <button class="b out lg block" type="button" data-a="connect">Connect a bot</button><button class="b out lg block" type="button" data-a="newjob">New job</button>
      <button class="b out lg block" type="button" data-a="perms">All permissions</button><button class="b out lg block" type="button" data-a="floor">View floor</button>
      <button class="b out lg block" type="button" data-a="emergency" style="color:var(--vermilion-press)">Emergency stop</button><button class="b ghost lg block" type="button" data-a="signout">Sign out</button></div>`, { label: 'Account' });
    box.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { const k = b.dataset.a; BB.closeModal(); if (k === 'newjob') BB.newJob(); else if (k === 'floor') BB.go('#floor'); else BB.act(k); });
  });

  /* ---------- boot ---------- */
  let who = null;
  async function boot() {
    try { who = await BB.api('/api/me'); } catch (e) { return; }
    if (who.error) return needAuth();
    au.classList.remove('on');
    $('#acctmail').textContent = who.email; acct.textContent = BB.initials(who.email.split('@')[0].replace(/[._-]+/g, ' ')); acct.setAttribute('aria-label', 'Account (' + who.email + ')');
    BB.who = who; applyRoute(); await BB.sync(true); BB.startPolling(); BB.booted && BB.booted();
  }
  BB.boot = boot;
  if (window.BRAND) BB.t = BRAND.t;
  applyRoute(); boot();
})();
