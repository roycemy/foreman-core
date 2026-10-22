/* Team picker + smart delegation (client). The owner taps which bots are on the team for this task;
   Alter asks the server for a plan (AI when configured, otherwise a visible "basic split"), shows a
   one-line summary with Start and a small Adjust link. Nothing is written until Start. Picks are kept
   on this device only (localStorage), never default-all. Presence shown here is the honest client
   reading (went dark = asleep); the server re-checks every pick and owns the final answer. */
(function () {
  'use strict';
  const BB = window.BB, $ = BB.$, esc = BB.esc;
  const KEY = 'alter.team';
  let team = new Set(); try { team = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...team])); } catch (e) {} };
  BB.teamBots = () => BB.assignable().filter(a => !a.hosted && !a.harness && a.status === 'active' && !a.paused);
  BB.teamAsleep = a => !!((BB.wentDark && BB.wentDark(a)) || (BB.goneDark && BB.goneDark(a)));
  BB.teamPicked = () => BB.teamBots().filter(a => team.has(a.id)).map(a => a.id);
  const listeners = new Set();
  function chipsHTML() {
    const bots = BB.teamBots();
    if (!bots.length) return '<p class="team-empty">Connect a bot to build a team.</p>';
    return '<span class="team-l" id="team-l">Team</span>' + bots.map(a => { const on = team.has(a.id), zz = BB.teamAsleep(a);
      return `<button type="button" class="tchip${zz ? ' zz' : ''}" data-team="${esc(a.id)}" aria-pressed="${on}">${BB.av(a, 'sm')}<span>${esc(a.name)}</span>${zz ? '<em class="tz">asleep</em>' : ''}</button>`; }).join('');
  }
  /* one tap = one synchronous Set change, then repaint every picker from the same Set: racing taps cannot desync */
  function paint(el) { if (!el) return; const k = BB.teamBots().map(a => a.id + (team.has(a.id) ? 1 : 0) + (BB.teamAsleep(a) ? 'z' : '')).join('|'); if (el.dataset.k === k) return; el.dataset.k = k; el.innerHTML = chipsHTML(); }
  function bind(el) {
    if (!el || el.dataset.bound) return; el.dataset.bound = 1; el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Bots on the team for this task');
    el.addEventListener('click', e => { const b = e.target.closest('[data-team]'); if (!b) return; const id = b.dataset.team; team.has(id) ? team.delete(id) : team.add(id); save(); BB.teamRepaint(); });
  }
  BB.teamRepaint = () => { document.querySelectorAll('[data-teampick]').forEach(el => { bind(el); paint(el); }); listeners.forEach(fn => fn()); };
  BB.teamPicker = () => '<div class="teampick in-modal" data-teampick></div>';

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
    const sig = JSON.stringify([title, brief || '', ids.slice().sort()]);
    if (!pendingReq || pendingReq.sig !== sig) pendingReq = { sig, id: (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9_-]/g, '') };
    try {
      const j = await BB.api('/api/tasks', 'POST', { title, brief, orchestrate: true, auto: true, team: ids, requestId: pendingReq.id });
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
    const box = BB.modal(`<h3>New job</h3><p>Describe what you want done and tap who is on the team. Alter plans the parts and starts right away.</p>
      <form class="stackf" id="nj"><label class="fld">What should happen?<input class="in" id="nj-t" maxlength="120" required placeholder="Summarize this week's support tickets"></label>
      <label class="fld">Details <small>optional</small><textarea class="in" id="nj-b" maxlength="1500" style="min-height:90px"></textarea></label>
      <div class="fld"><span>Team for this task</span>${BB.teamPicker()}</div>
      <div class="acts"><button class="b ghost" type="button" data-close>Cancel</button><button class="b ink" type="submit" id="nj-go" disabled>Start</button></div></form>`, { label: 'New job' });
    const t = box.querySelector('#nj-t'), b = box.querySelector('#nj-go'), g2 = () => { b.disabled = !t.value.trim() || !BB.teamPicked().length; };
    t.addEventListener('input', g2); listeners.add(g2); BB.teamRepaint(); g2();
    box.querySelector('#nj').onsubmit = async e => { e.preventDefault(); if (b.disabled) return; b.disabled = true; const ok = await BB.startTeamTask(t.value.trim(), box.querySelector('#nj-b').value.trim(), () => { listeners.delete(g2); BB.closeModal(); }); if (!ok) g2(); };
  };
  BB.teamRepaint(); gate();
})();
