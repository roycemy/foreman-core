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

  /* ---------- plan, summary, adjust, start ---------- */
  let seq = 0;
  BB.planTeamTask = async function (title, brief, done) {
    const ids = BB.teamPicked(); if (!ids.length) { BB.toast('Pick at least one bot for this task.'); return; }
    const my = ++seq, plan = await BB.api('/api/tasks/plan', 'POST', { title, brief, team: ids });
    if (my !== seq) return; /* a newer plan request superseded this one */
    if (plan.error) { BB.toast(plan.error); return; }
    const draft = { title, brief, team: plan.team.map(m => m.id), members: plan.team, method: plan.method, note: plan.note, waitNote: plan.waitNote || '', allTeamAsleep: !!plan.allTeamAsleep, edited: false,
      parts: plan.parts.map(p => ({ title: p.title, instruction: p.instruction || p.title, needs: p.needs || '', assignee: p.assignee, reason: p.reason || '', category: p.category || null })) };
    showSummary(draft, done);
  };
  const nameOf = (d, id) => (d.members.find(m => m.id === id) || {}).name || 'A team bot';
  const VERB = /^(research|write|draft|review|check|compare|summarize|summarise|design|build|make|find|edit|plan|test|fix|send|analyze|analyse|read|collect|list|outline|translate|proofread|create|update|prepare|search)$/i;
  const verb = t => { const w = String(t || '').trim().split(/\s+/)[0] || '', l = w.toLowerCase(); if (!VERB.test(l)) return null; return /(s|sh|ch|x|z)$/.test(l) ? l + 'es' : /[^aeiou]y$/.test(l) ? l.slice(0, -1) + 'ies' : l + 's'; };
  BB.planSummaryText = d => d.parts.map((p, i) => (i ? 'then ' : '') + nameOf(d, p.assignee) + ' ' + (verb(p.title) || (d.parts.length > 1 ? 'does part ' + (i + 1) : 'does it'))).join(', ').replace(/^./, c => c.toUpperCase());
  function showSummary(d, done) {
    const asleep = id => (d.members.find(m => m.id === id) || {}).awake === false;
    const box = BB.modal(`<h3>Plan</h3><p class="plan-sum" id="plan-sum">${esc(BB.planSummaryText(d))}</p>
      ${d.method === 'basic' ? `<p class="plan-basic" id="plan-basic"><b>Basic split</b> ${esc(d.note.replace(/^Basic split:\s*/, ''))}</p>` : `<p class="meta">${esc(d.note)}</p>`}
      ${d.allTeamAsleep ? `<p class="plan-wait" id="plan-wait">${esc(d.waitNote)}</p>` : ''}
      <ol class="plan-parts">${d.parts.map(p => `<li><b>${esc(p.title)}</b><span>${esc(nameOf(d, p.assignee))}${asleep(p.assignee) ? ' <em class="tz">asleep</em>' : ''}</span></li>`).join('')}</ol>
      ${d.edited ? '<p class="meta">Includes your edits.</p>' : ''}
      <p class="meta">Parts run one after another; each gets the real result of the one before. Bots do not message each other. Nothing has started yet.</p>
      <div class="acts plan-acts"><button class="b link" type="button" id="plan-adjust">Adjust</button><span></span><button class="b ghost" type="button" data-close>Cancel</button><button class="b ink" type="button" id="plan-start">Start</button></div>`, { label: 'Plan for this task', focus: '#plan-start' });
    box.querySelector('#plan-adjust').onclick = () => showAdjust(d, done);
    const st = box.querySelector('#plan-start'); st.disabled = !d.team.length || d.parts.some(p => !p.assignee);
    st.onclick = async () => {
      if (st.disabled) return; st.disabled = true; st.textContent = 'Starting…';
      const j = await BB.api('/api/tasks', 'POST', { title: d.title, brief: d.brief, orchestrate: true, team: d.team, planMethod: d.method, planNote: d.note, parts: d.parts });
      if (j.error) { st.disabled = false; st.textContent = 'Start'; return BB.toast(j.error); }
      BB.closeModal(); done && done(); BB.toast(d.allTeamAsleep ? 'Started. Your team is asleep, so part 1 waits for a check-in.' : 'Started. Each part begins after the previous real result.');
      await BB.sync(true); BB.go('#receipts/' + j.task.id);
    };
  }
  /* edits are written into the draft on every keystroke, so closing Adjust any way (Done, X, Escape, backdrop) keeps them */
  function showAdjust(d, done) {
    let back = true;
    const box = BB.modal(`<h3>Adjust the parts</h3><p>Edit any part or who does it. Only bots on this task's team are listed.</p><div class="parts-plan">${d.parts.map((p, i) => `<fieldset class="fld adj" data-i="${i}"><legend>Part ${i + 1}</legend>
      <input class="in" data-k="title" value="${esc(p.title)}" maxlength="120" aria-label="Part ${i + 1} title">
      <textarea class="in" data-k="instruction" maxlength="1000" aria-label="Part ${i + 1} instruction">${esc(p.instruction)}</textarea>
      ${i ? `<small>Needs: ${esc(p.needs || 'the result of part ' + i)}</small>` : ''}
      <select class="in" data-k="assignee" aria-label="Part ${i + 1} bot">${d.members.map(m => `<option value="${esc(m.id)}" ${m.id === p.assignee ? 'selected' : ''}>${esc(m.name)}${m.awake ? '' : ' (asleep)'}</option>`).join('')}</select>
      <small>${esc(p.reason)}</small></fieldset>`).join('')}</div>
      <div class="acts"><button class="b ink" type="button" id="adj-done">Done</button></div>`, { label: 'Adjust task parts', wide: true, onClose: () => { if (back) setTimeout(() => showSummary(d, done), 0); } });
    box.addEventListener('input', e => { const f = e.target.closest('[data-k]'), fs = e.target.closest('[data-i]'); if (!f || !fs) return; const p = d.parts[+fs.dataset.i], k = f.dataset.k, v = k === 'title' ? f.value.slice(0, 120) : f.value; if (k === 'title' && !v.trim()) return; p[k] = v; d.edited = true; });
    box.querySelectorAll('select[data-k]').forEach(s => s.onchange = () => { d.parts[+s.closest('[data-i]').dataset.i].assignee = s.value; d.edited = true; });
    box.querySelector('#adj-done').onclick = () => BB.closeModal();
  }

  /* ---------- wire the type box and the phone New job sheet to the team flow ---------- */
  if (ask) {
    const legacy = ask.onsubmit;
    ask.onsubmit = async e => {
      e.preventDefault(); const raw = askin.value.trim(); if (!raw) return;
      if (/^@\S+\s+/.test(raw)) return legacy.call(ask, e); /* "@Name do this" keeps its direct assignment */
      go.disabled = true; try { await BB.planTeamTask(raw, '', () => { askin.value = ''; }); } finally { gate(); }
    };
  }
  BB.newJob = function () {
    const box = BB.modal(`<h3>New job</h3><p>Describe what you want done and tap who is on the team. Alter plans the parts; nothing starts until you tap Start.</p>
      <form class="stackf" id="nj"><label class="fld">What should happen?<input class="in" id="nj-t" maxlength="120" required placeholder="Summarize this week's support tickets"></label>
      <label class="fld">Details <small>optional</small><textarea class="in" id="nj-b" maxlength="1500" style="min-height:90px"></textarea></label>
      <div class="fld"><span>Team for this task</span>${BB.teamPicker()}</div>
      <div class="acts"><button class="b ghost" type="button" data-close>Cancel</button><button class="b ink" type="submit" id="nj-go" disabled>Plan it</button></div></form>`, { label: 'New job' });
    const t = box.querySelector('#nj-t'), b = box.querySelector('#nj-go'), g2 = () => { b.disabled = !t.value.trim() || !BB.teamPicked().length; };
    t.addEventListener('input', g2); listeners.add(g2); BB.teamRepaint(); g2();
    box.querySelector('#nj').onsubmit = async e => { e.preventDefault(); if (b.disabled) return; listeners.delete(g2); b.disabled = true; await BB.planTeamTask(t.value.trim(), box.querySelector('#nj-b').value.trim()); };
  };
  BB.teamRepaint(); gate();
})();
