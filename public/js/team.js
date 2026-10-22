/* Team picker + auto plan router (client). Mode switcher: Solo = exactly one bot does the whole task (no
   planner, no spend); Team = several bots, Alter plans and starts right away. In Team mode each picked bot
   can get an optional role that binds the planner. Picks, roles and mode stay on this device only
   (localStorage); nothing is preselected and nothing is written before submit. Presence here is the honest
   client reading (went dark = asleep); the server re-checks every pick and owns the final answer. */
(function () {
  'use strict';
  const BB = window.BB, $ = BB.$, esc = BB.esc;
  const ls = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let team = new Set(ls('alter.team', [])), roles = ls('alter.roles', {}) || {}, mode = ls('alter.mode', 'solo') === 'team' ? 'team' : 'solo';
  const save = () => { put('alter.team', [...team]); put('alter.roles', roles); put('alter.mode', mode); };
  BB.teamBots = () => BB.assignable().filter(a => !a.hosted && !a.harness && a.status === 'active' && !a.paused);
  BB.teamAsleep = a => !!((BB.wentDark && BB.wentDark(a)) || (BB.goneDark && BB.goneDark(a)));
  /* picked order = tap order (Set insertion order); Solo never yields more than one */
  BB.teamPicked = () => { const ok = new Set(BB.teamBots().map(a => a.id)), ids = [...team].filter(id => ok.has(id)); return mode === 'solo' ? ids.slice(0, 1) : ids; };
  BB.teamMode = () => mode;
  BB.teamRoles = () => { const o = {}; if (mode !== 'team') return o; BB.teamPicked().forEach(id => { const v = String(roles[id] || '').trim(); if (v) o[id] = v.slice(0, 60); }); return o; };
  BB.setTeamMode = m => {
    if (m === mode) return; mode = m === 'team' ? 'team' : 'solo';
    if (mode === 'solo') { const ids = [...team].filter(id => BB.teamBots().some(a => a.id === id)); if (ids.length > 1) { team = new Set([ids[0]]); const a = BB.agent(ids[0]); BB.toast('Solo keeps ' + (a ? a.name : 'one bot') + '. Switch back to Team to add more.'); } }
    save(); BB.teamRepaint();
  };
  const listeners = new Set();
  function chipsHTML() {
    const bots = BB.teamBots();
    const sw = `<div class="modesw" role="radiogroup" aria-label="Mode"><button type="button" role="radio" data-mode="solo" aria-checked="${mode === 'solo'}">Solo</button><button type="button" role="radio" data-mode="team" aria-checked="${mode === 'team'}">Team</button></div>`;
    if (!bots.length) return sw + '<p class="team-empty">Connect a bot to start.</p>';
    return sw + bots.map(a => { const on = team.has(a.id), zz = BB.teamAsleep(a);
      const chip = `<button type="button" class="tchip${zz ? ' zz' : ''}" data-team="${esc(a.id)}" ${mode === 'solo' ? `role="radio" aria-checked="${on}"` : ''} aria-pressed="${on}">${BB.av(a, 'sm')}<span>${esc(a.name)}</span>${zz ? '<em class="tz">asleep</em>' : ''}</button>`;
      return mode === 'team' && on ? `<span class="tgrp">${chip}<input class="trole" data-role="${esc(a.id)}" maxlength="60" placeholder="role (optional)" aria-label="What ${esc(a.name)} does (optional)" value="${esc(roles[a.id] || '')}"></span>` : chip; }).join('');
  }
  /* one tap = one synchronous state change, then repaint every picker from the same state: racing taps cannot desync */
  function paint(el) { if (!el) return; const k = mode + ':' + [...team].join(',') + ':' + BB.teamBots().map(a => a.id + (BB.teamAsleep(a) ? 'z' : '')).join('|'); if (el.dataset.k === k) return; el.dataset.k = k; el.innerHTML = chipsHTML(); el.setAttribute('aria-label', mode === 'solo' ? 'Pick one bot for this task' : 'Bots on the team for this task'); }
  function bind(el) {
    if (!el || el.dataset.bound) return; el.dataset.bound = 1; el.setAttribute('role', 'group');
    el.addEventListener('click', e => {
      const mb = e.target.closest('[data-mode]'); if (mb) return BB.setTeamMode(mb.dataset.mode);
      const b = e.target.closest('[data-team]'); if (!b) return; const id = b.dataset.team;
      if (mode === 'solo') team = team.has(id) && team.size === 1 ? new Set() : new Set([id]); else team.has(id) ? team.delete(id) : team.add(id);
      save(); BB.teamRepaint();
      if (mode === 'team' && team.has(id)) { const r = el.querySelector('[data-role="' + CSS.escape(id) + '"]'); r && r.focus({ preventScroll: true }); }
    });
    el.addEventListener('input', e => { const r = e.target.closest('[data-role]'); if (!r) return; roles[r.dataset.role] = r.value; save(); });
  }
  function fitFloor() { const tp = $('#teampick'), fl = $('#v-floor'); if (tp && fl) fl.style.setProperty('--tp-h', (tp.offsetHeight || 44) + 'px'); }
  BB.teamRepaint = () => { document.querySelectorAll('[data-teampick]').forEach(el => { bind(el); paint(el); }); fitFloor(); listeners.forEach(fn => fn()); };
  BB.teamPicker = () => '<div class="teampick in-modal" data-teampick></div>';
  addEventListener('resize', fitFloor);

  /* ---------- desktop type box ---------- */
  const ask = $('#ask'), askin = $('#askin'), go = ask && ask.querySelector('button');
  const gate = () => { if (go) go.disabled = !askin.value.trim() || (!/^@\S+\s/.test(askin.value.trim()) && !BB.teamPicked().length); };
  if (askin) { askin.addEventListener('input', gate); listeners.add(gate); }
  BB.on(() => { BB.teamRepaint(); gate(); });

  /* ---------- auto plan router: submit = plan + start in one request (owner, Oct 22) ---------- */
  let busy = false, pendingReq = null;
  BB.startTeamTask = async function (title, brief, done) {
    const ids = BB.teamPicked(); if (!ids.length) { BB.toast('Pick at least one bot for this task.'); return false; }
    if (busy) return false; busy = true;
    /* one stable requestId per submit; a retry of the same submit (same text + team) reuses it, so the server never starts it twice */
    const md = mode, rl = BB.teamRoles(), sig = JSON.stringify([md, title, brief || '', ids, rl]); /* roles are part of the request payload */
    if (!pendingReq || pendingReq.sig !== sig) pendingReq = { sig, id: (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9_-]/g, '') };
    try {
      const j = await BB.api('/api/tasks', 'POST', { title, brief, orchestrate: true, auto: true, mode: md, team: ids, ...(md === 'team' ? { roles: rl } : {}), requestId: pendingReq.id });
      if (j.error) { BB.toast(j.error); return false; }
      pendingReq = null;
      done && done(); const pl = j.plan || {};
      BB.toast(pl.allTeamAsleep ? 'Queued. Everyone on this team is asleep; part 1 waits for a check-in.' : (pl.summary ? pl.summary.replace(/^./, c => c.toUpperCase()) + '.' : 'Started.') + (pl.method === 'basic' ? ' (basic split)' : ''));
      await BB.sync(true); BB.go('#receipts/' + j.task.id); return true;
    } finally { busy = false; }
  };
  /* Cancel on the running parent: stops parts that have not started; a running part is left to finish */
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-cancel-pending]'); if (!b) return; b.disabled = true;
    const j = await BB.api('/api/tasks/' + b.dataset.cancelPending + '/cancel-pending', 'POST', {});
    if (j.error) { b.disabled = false; return BB.toast(j.error); }
    BB.toast(j.cancelled ? 'Cancelled ' + j.cancelled + (j.cancelled === 1 ? ' part' : ' parts') + ' that had not started.' : 'Nothing left to cancel.'); await BB.sync(true);
    BB.go(location.hash);
  });

  /* ---------- wire the type box and the phone New job sheet to the team flow ---------- */
  if (ask) {
    const legacy = ask.onsubmit;
    ask.onsubmit = async e => {
      e.preventDefault(); const raw = askin.value.trim(); if (!raw) return;
      if (/^@\S+\s+/.test(raw)) return legacy.call(ask, e); /* "@Name do this" keeps its direct assignment */
      go.disabled = true; try { await BB.startTeamTask(raw, '', () => { askin.value = ''; }); } finally { gate(); }
    };
  }
  BB.newJob = function () {
    const box = BB.modal(`<h3>New job</h3><p>Describe what you want done. Solo: one bot does all of it. Team: Alter plans the parts and starts right away.</p>
      <form class="stackf" id="nj"><label class="fld">What should happen?<input class="in" id="nj-t" maxlength="120" required placeholder="Summarize this week's support tickets"></label>
      <label class="fld">Details <small>optional</small><textarea class="in" id="nj-b" maxlength="1500" style="min-height:90px"></textarea></label>
      <div class="fld"><span>Who does it</span>${BB.teamPicker()}</div>
      <div class="acts"><button class="b ghost" type="button" data-close>Cancel</button><button class="b ink" type="submit" id="nj-go" disabled>Start</button></div></form>`, { label: 'New job' });
    const t = box.querySelector('#nj-t'), b = box.querySelector('#nj-go'), g2 = () => { b.disabled = !t.value.trim() || !BB.teamPicked().length; };
    t.addEventListener('input', g2); listeners.add(g2); BB.teamRepaint(); g2();
    box.querySelector('#nj').onsubmit = async e => { e.preventDefault(); if (b.disabled) return; b.disabled = true; const ok = await BB.startTeamTask(t.value.trim(), box.querySelector('#nj-b').value.trim(), () => { listeners.delete(g2); BB.closeModal(); }); if (!ok) g2(); };
  };
  BB.teamRepaint(); gate();
})();
