/* Black Box vNext · Receipts: what the team finished, with model costs; each opens its receipt (D). */
(function () {
  'use strict';
  const BB = window.BB, $ = BB.$, esc = BB.esc;
  const V = $('#v-receipts');
  let cache = {}, openId = null, lastList = '', lastDetail = '';
  /* Expansion belongs to one receipt and lives here, not on a DOM node: a repaint draws it again. It is reset only when the owner opens a
     different receipt or leaves Receipts (intentional navigation), never by a background refresh. */
  const exp = { id: null, keys: new Set() };
  const expFor = id => { if (exp.id !== id) { exp.id = id; exp.keys = new Set(); } return exp; };
  const expOpts = id => ({ isOpen: k => exp.id === id && exp.keys.has(k), onToggle: (k, open) => { expFor(id); open ? exp.keys.add(k) : exp.keys.delete(k); } });
  const finished = () => BB.tasks().filter(t => ['done', 'failed'].includes(t.status) && t.finishedAt).sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)));

  /* data for the shared receipt document, from /api/jobs/:id */
  BB.receiptData = function (j) {
    const t = j.task, bot = BB.agent(t.assignee) || { name: 'A bot', id: t.assignee };
    const lines = String(t.result || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    const words = String(t.result || '').trim() ? String(t.result).trim().split(/\s+/).length : 0;
    const ms = t.finishedAt ? Date.parse(t.finishedAt) - Date.parse(t.createdAt) : null;
    return {
      bot: { name: t.orchestration?'Your team':bot.name, initials: t.orchestration?'T':BB.initials(bot.name), color: BB.avColor(bot) },
      at: t.finishedAt || t.createdAt,
      headline: t.orchestration ? (t.status==='done'?'Your team finished all parts':t.status==='failed'?'This plan stopped':'Your team is working through the parts') : t.status === 'failed' ? bot.name + ' stopped after ' + BB.durWords(ms) : bot.name + ' finished this in ' + BB.durWords(ms),
      lede: t.brief ? t.title + '. ' + t.brief : t.title,
      artifact: lines.length ? { title: lines[0].replace(/^\d+[.)]\s*/, '').slice(0, 90), text: lines.slice(1).join(' · ').slice(0, 220), words, name: t.title, full: t.result } : null,
      costUsd: (() => { const all = [t, ...(j.children || [])].map(x => x.modelCostUsd).filter(x => x != null); return all.length ? all.reduce((x, y) => x + y, 0) : null; })(), showCost: true,
      approvals: j.timeline.filter(s => /^Owner approved/.test(s.text)).length, durationMs: ms,
      timeline: j.timeline
    };
  };
  function list() {
    const feed = BB.receiptFeed(), fs = feed.filter(x => x.kind === 'job').map(x => x.t), phone = BB.phone();
    /* a standalone action receipt: no job, so no link; the line says what happened and, for an email, the provider id */
    const act = x => { const a = BB.agent(x.r.agentId), meta = BB.receiptLine(x) + ' · ' + BB.when(x.r.at), title = (BB.ACTION_COPY[x.r.action] || {}).ask || x.r.action;
      return phone ? `<div class="kr">${a ? `<span class="kav" style="--av:${BB.avColor(a)}">${esc(BB.initials(a.name))}</span>` : '<span class="kav merch">?</span>'}<div class="t"><b>${esc(title)}</b><small>${esc(meta)}</small></div></div>` : `<div class="row"><span class="t"><b>${esc(title)}</b><small>${esc((a ? a.name + ' · ' : '') + meta)}</small></span></div>`; };
    const rows = () => feed.map(x => x.kind === 'job' ? row(x.t, x.run) : act(x)).join('');
    const row = (t, run) => {
      const who = BB.jobWho(t), a = who[0], st = run ? run.status : (t.status === 'failed' ? 'failed' : 'done'), cost = t.status === 'failed' ? 'Didn\'t finish' : t.modelCostUsd != null ? BB.modelCost(t.modelCostUsd) : '–';
      const tag = st === 'partial' ? '<span class="rtag bad">Partly finished</span>' : st === 'failed' ? '<span class="rtag bad">Didn\'t finish</span>' : st === 'stopped' ? '<span class="rtag bad">Stopped</span>' : '';
      const nParts = t.orchestration && run ? ' · ' + run.parts.filter(p => p.status === 'done').length + ' of ' + (t.partIds || []).length + ' parts' : run && run.parts.length ? ' · ' + (run.parts.filter(p => p.status === 'done').length + (t.status === 'done' ? 1 : 0)) + ' of ' + (run.parts.length + 1) + ' steps' : '';
      const meta = (who.length ? (t.runByAlter ? 'by Alter for ' : 'by ') + who.map(x => x.name).join(' + ') : 'Unassigned') + nParts + ' · ' + BB.when(t.finishedAt);
      if (phone) return `<a class="kr" href="#receipts/${t.id}">${a ? `<span class="kav" style="--av:${BB.avColor(a)}">${esc(BB.initials(a.name))}</span>` : '<span class="kav merch">?</span>'}<div class="t"><b class="wrap" title="${esc(t.title)}">${esc(t.title)}${tag}</b><small class="wrapm">${esc(meta)}</small></div><span class="r">${esc(cost)}</span></a>`;
      return `<a class="row" href="#receipts/${t.id}" style="text-decoration:none">${BB.jobAv(t)}<span class="t"><b class="wrap" title="${esc(t.title)}">${esc(t.title)}${tag}</b><small class="wrapm">${esc(meta)}</small></span><span class="r" title="${t.modelCostUsd != null ? 'Model costs' : ''}">${esc(cost)}</span><span class="chev">${BB.ICON.chev}</span></a>`;
    };
    const foot = fs.some(t => t.modelCostUsd != null) ? '<p class="meta" style="margin-top:14px;padding:0 4px">Amounts are model costs each bot reported. They exclude subscriptions and any tools you pay for. – means not reported.</p>' : '';
    let html;
    if (phone) html = `<div class="kh"><h1>Receipts</h1><div class="end">${BB.work ? BB.work.btnHTML('wphone') : ''}${BB.acctAv ? BB.acctAv() : ''}</div></div><div class="ks">What your team finished.</div>${feed.length ? rows() : '<div class="ks">Nothing finished yet. Finished jobs show up here with proof of how they got done.</div>'}${foot ? `<div style="padding:8px 20px">${foot}</div>` : ''}`;
    else html = `<div class="page-in narrow"><div class="page-h"><div><h1>Receipts</h1><p class="sub">What your team finished.</p></div></div>
      ${feed.length ? `<div class="list">${rows()}</div>${foot}` : `<div class="list"><div class="list-empty"><b>Nothing finished yet</b>Finished jobs show up here with how they got done and what they cost.</div></div>`}</div>`;
    if (html !== lastList) { lastList = html; V.innerHTML = html; }
    BB.markNewRows && BB.markNewRows(V);
  }
  /* Saved notes (private receipt only): one entry per note an approved request on this job saved. Opening it reads the note Alter
     stored, not the bot's completion text; the job and request link shown inside is the one the server validated. */
  function savedNotes(j) {
    const qs = (j.requests || []).filter(q => q.action === 'notes.write' && q.status === 'executed' && q.result && q.result.note_id);
    if (!qs.length) return '';
    return `<div class="tl saved-notes"><h5>Saved notes</h5><ol class="steps">${qs.map(q => q.noteDeleted ? `<li class="note-gone"><span class="meta">Note deleted</span></li>` : `<li><button class="b out" type="button" data-note="${esc(q.result.note_id)}" data-req="${esc(q.id)}">Open note: ${esc((q.params && q.params.title) || 'untitled')}</button></li>`).join('')}</ol></div>`;
  }
  BB.openNote = async function (id, reqId) {
    const x = await BB.api('/api/notes/' + encodeURIComponent(id) + (reqId ? '?request=' + encodeURIComponent(reqId) : ''));
    if (x && x.deleted) return BB.modal(`<h3>Note deleted</h3><p class="meta">This note was deleted${x.note && x.note.deletedAt ? ' on ' + esc(new Date(x.note.deletedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })) : ''}. The note itself is removed. The approval and receipt records for its job may still contain the text you approved.</p>`, { label: 'Note deleted' });
    if (!x || x.error || !x.note) return BB.toast('That note is not available.');
    const n = x.note, l = x.link, at = n.at ? new Date(n.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const from = l ? `From job ${l.taskId ? `<a href="#receipts/${esc(l.taskId)}" data-close>${esc(l.taskTitle || 'this job')}</a>` : '(no job)'} · request ${esc(l.requestId)}${l.approvedAt ? ' · you approved it ' + esc(new Date(l.approvedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })) : ''} · ${l.matchesApproval ? 'matches what you approved' : 'does not match the approved fingerprint'}` : 'Not linked to an approved request';
    const box = BB.modal(`<h3 class="note-title">${esc(n.title)}</h3><p class="meta">Saved by ${esc(n.botName || 'a bot')}${at ? ' · ' + esc(at) : ''}</p><div class="note-text" style="white-space:pre-wrap;max-height:55vh;overflow:auto;margin:.75em 0;padding:.75em;border:1px solid currentColor;border-radius:8px">${esc(n.text)}</div><p class="meta note-link">${from}</p><div class="btns"><button class="b out" type="button" data-note-delete>Delete note</button></div>`, { label: 'Saved note', wide: true });
    box.querySelector('[data-note-delete]').onclick = () => {
      const c = BB.modal('<h3>Delete this note?</h3><p>The note is removed from your workspace and cannot be restored. Receipts will show it as deleted, but the approval and receipt records for its job may still contain the text you approved.</p><div class="btns"><button class="b pri grow" type="button" data-ok>Delete</button><button class="b out grow" type="button" data-no>Keep it</button></div>', { label: 'Delete note' });
      c.querySelector('[data-no]').onclick = () => BB.closeModal();
      c.querySelector('[data-ok]').onclick = async () => { const d = await BB.api('/api/notes/' + encodeURIComponent(id) + '/delete', 'POST', { confirmed: true }); BB.closeModal(); BB.toast(d && d.deleted ? 'Note deleted.' : 'Not deleted: ' + ((d && d.error) || 'try again')); if (openId) { delete cache[openId]; detail(openId); } };
    };
  };
  async function detail(id) {
    openId = id; expFor(id);
    if (!cache[id]) { lastDetail = ''; V.innerHTML = `<div class="rc"><a class="back" href="#receipts">‹ Receipts</a><p class="meta" style="margin-top:24px">Loading…</p></div>`; }
    const j = await BB.api('/api/jobs/' + id); if (openId !== id) return;
    if (j.error) { lastDetail = ''; V.innerHTML = `<div class="rc"><a class="back" href="#receipts">‹ Receipts</a><div class="list-empty" style="margin-top:24px"><b>Receipt not found</b>It may be older than the retained history.</div></div>`; return; }
    cache[id] = j; painted = id + ':' + BB.agents().length; paintDetail(j);
  }
  const PHASE_WORD = { done: 'Finished', failed: "Didn't finish", stopped: 'Stopped', notrun: 'Not run' }, RUN_WORD = { done: 'Finished', partial: 'Partly finished', failed: "Didn't finish", stopped: 'Stopped' };
  const clockOf = iso => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  const stepsHTML = tl => (tl || []).map(x => `<li>${esc(x.text)}<small>${esc(new Date(x.at).toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + clockOf(x.at) + (x.meta ? ' · ' + x.meta : ''))}</small></li>`).join('');
  const LONG = r => String(r).length > 600 || String(r).split('\n').length > 12;
  function outBlock(id, key, text) {
    const open = exp.id === id && exp.keys.has(key), t = String(text == null ? '' : text);
    if (!t.trim()) return '<p class="rnote">No result was saved.</p>';
    return `<pre class="rout${open || !LONG(t) ? ' open' : ''}" data-rout="${esc(key)}">${esc(t)}</pre>${LONG(t) ? `<button class="wlink" type="button" data-rexp="${esc(key)}" data-fk="rexp-${esc(key)}" aria-expanded="${open}">${open ? 'Show less ↑' : 'Show all ↓'}</button>` : ''}`;
  }
  const sourcesHTML = f => f.sources && f.sources.length ? `<section class="rres"><h2>Sources</h2><ul class="rsrc">${f.sources.map(u => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer nofollow">${esc(u)}</a></li>`).join('')}</ul><p class="rnote">Links the bots included in their own results. Alter has not checked them.</p></section>` : '';
  /* A finished run leads with its result: each part's own saved result, in order, labelled by part. The server also saves a stitched summary on
     the plan; it is not presented as a conclusion. Process (parts, bot-by-bot steps, costs) sits underneath, expandable. */
  function runLayout(j, d) {
    const M = window.BBWork; if (!M) return null; const t = j.task, kids = j.children || [];
    const run = M.buildRuns([t, ...kids]).find(r => r.id === t.id); if (!run || run.active) return null;
    const f = M.finishedItem(run, M.makeCtx({ tasks: [t, ...kids], agents: BB.agents() }, BB.now())), n = f.partsTotal;
    const lede = f.status === 'done' ? 'Your team finished all ' + n + ' parts.' : f.status === 'partial' ? f.partsDone + ' of ' + n + ' parts finished. ' + (f.parts.some(p => p.phase === 'notrun') ? 'The rest did not run.' : 'The others did not finish.') : f.status === 'stopped' ? 'This run was stopped before it finished.' : "This run didn't finish.";
    const body = f.kind === 'parts' ? f.parts.map(p => `<div class="rpart"><h3>${f.chain ? 'Step' : 'Part'} ${p.n}: ${esc(p.title)} <span class="wchip st-${p.phase === 'done' ? 'done' : p.phase === 'notrun' ? 'queued' : 'failed'}">${esc(PHASE_WORD[p.phase] || p.phase)}</span>${p.bot ? `<small class="meta">${esc(p.bot)}</small>` : ''}</h3>${outBlock(t.id, 'part:' + p.id, p.result)}<a class="wlink" href="#receipts/${esc(p.id)}">Open this part's receipt</a></div>`).join('')
      : outBlock(t.id, 'summary', f.text);
    const open = exp.id === t.id && exp.keys.has('process');
    return `<div class="rhead"><div class="eyb">Receipt · ${esc(new Date(d.at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }))}</div><span><span class="wchip st-${esc(f.status)}">${esc(RUN_WORD[f.status] || f.status)}</span></span><h1>${esc(t.title)}</h1><p class="lede">${esc(lede)}</p></div>
      <section class="rres"><h2>Result</h2>${f.note ? `<p class="rnote">${esc(f.note)}</p>` : ''}${body}</section>${sourcesHTML(f)}
      <details class="rproc" data-rproc${open ? ' open' : ''}><summary data-fk="proc">How it got done</summary><div>${BB.partsHTML ? BB.partsHTML(t, kids) : ''}<div class="tl"><ol class="steps">${stepsHTML(j.timeline)}</ol></div>${d.costUsd == null ? '<p class="honest">Model costs were not reported for this run, so none are shown. This never includes subscriptions or tools.</p>' : `<p class="honest">Model costs reported by the bots: ${esc(BB.modelCost(d.costUsd))}. Excludes subscriptions and tools.</p>`}</div></details>`;
  }
  function liveJob(j) { const t = BB.task(j.task.id) || j.task; const kids = t.orchestration ? (t.partIds || []).map(id => BB.task(id) || (j.children || []).find(x => x.id === id)).filter(Boolean) : []; return { ...j, task: t, children: kids.length ? kids : j.children }; }
  function renderDetail(j) {
    const t = j.task, d = BB.receiptData(j), done = ['done', 'failed'].includes(t.status), o = expOpts(t.id);
    let lead = (t.orchestration || (j.children || []).length) && done ? runLayout(j, d) : null;
    if (!lead) { const f = window.BBWork && done ? window.BBWork.finishedItem({ task: t, parts: [], status: t.status === 'failed' ? 'failed' : 'done', finishedAtMs: Date.parse(t.finishedAt) }, window.BBWork.makeCtx({ tasks: [t], agents: BB.agents() }, BB.now())) : null; o.afterArt = f ? sourcesHTML(f) : ''; lead = `${BB.partsHTML ? BB.partsHTML(t, j.children) : ''}${receiptDoc(d, { fullResult: true, ...o })}`; }
    return `<div class="rc wide"><a class="back" href="#receipts">‹ Receipts</a><div style="height:28px"></div>${lead}${savedNotes(j)}${t.orchestration && !done ? '<div class="acts" style="margin-top:20px"><button class="b out" data-stop-plan>Stop remaining parts</button></div>' : ''}
      ${done ? `<div class="share-box" id="share-box"><h3>Share a public receipt</h3><p>You write a public title, description and reusable template, review the exact page, then publish. Nothing from the private job is copied in. Links expire in 30 days.</p><div class="acts" style="justify-content:flex-start;margin-top:14px"><button class="b ink" type="button" data-share>Share…</button></div></div>` : `<p class="meta" style="margin-top:24px">This job is ${esc(BB.jobStatus(t).word.toLowerCase())}. Its receipt is final once it finishes.</p>`}
      <div class="foot"><span class="mark"><i aria-hidden="true"></i>${esc(BRAND.upper)}</span>· Receipt</div></div>`;
  }
  function bindDetail(j) {
    const t = j.task, o = expOpts(t.id);
    V.querySelectorAll('[data-note]').forEach(b => b.onclick = () => BB.openNote(b.dataset.note, b.dataset.req));
    receiptBind(V, o);
    V.querySelectorAll('[data-rexp]').forEach(b => b.onclick = () => { const k = b.dataset.rexp, pre = V.querySelector('[data-rout="' + k.replace(/["\\]/g, '') + '"]'), open = !(pre && pre.classList.contains('open')); if (pre) pre.classList.toggle('open', open); b.setAttribute('aria-expanded', open); b.textContent = open ? 'Show less ↑' : 'Show all ↓'; o.onToggle(k, open); });
    const pr = V.querySelector('[data-rproc]'); if (pr) pr.addEventListener('toggle', () => o.onToggle('process', pr.open));
    const stop = V.querySelector('[data-stop-plan]'); if (stop) stop.onclick = async () => { stop.disabled = true; const out = await BB.api('/api/tasks/' + t.id + '/stop', 'POST', {}); if (out.error) { stop.disabled = false; return BB.toast(out.error); } await BB.sync(true); detail(t.id); };
    const sb = V.querySelector('[data-share]'); if (sb) sb.onclick = () => BB.openShare ? BB.openShare(t.id) : null;
    BB.paintShareBox && BB.paintShareBox(t.id);
  }
  /* Paint only when what the owner can see has changed, and keep scroll position and focus when it does. */
  function paintDetail(j0) {
    const j = liveJob(j0), html = renderDetail(j); if (html === lastDetail) return;
    const y = window.scrollY, fk = document.activeElement && V.contains(document.activeElement) ? document.activeElement.dataset.fk : null;
    lastDetail = html; V.innerHTML = html; bindDetail(j); window.scrollTo(0, y);
    if (fk) { const el = [...V.querySelectorAll('[data-fk]')].find(x => x.dataset.fk === fk); if (el) el.focus({ preventScroll: true }); }
  }
  function paint() {
    if (!V.classList.contains('on')) return;
    const r = BB.route(); if (r.arg) { if (openId !== r.arg) detail(r.arg); return; } openId = null; list();
  }
  BB.onRoute(r => { if (r.v === 'receipts') { openId = null; lastList = ''; lastDetail = ''; if (!r.arg) { exp.id = null; exp.keys = new Set(); } paint(); } });
  let painted = '';
  BB.on(() => {
    if (!V.classList.contains('on')) return; const id = BB.route().arg;
    if (id) { const t = BB.task(id), c = cache[id]; if (t && c && c.task.status !== t.status) return detail(id); if (c) { painted = id + ':' + BB.agents().length; paintDetail(c); } return; }
    list();
  });
})();
