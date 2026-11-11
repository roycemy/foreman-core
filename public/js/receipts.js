/* Black Box vNext · Receipts: what the team finished, with model costs; each opens its receipt (D). */
(function () {
  'use strict';
  const BB = window.BB, $ = BB.$, esc = BB.esc;
  const V = $('#v-receipts');
  let cache = {}, openId = null;
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
      costUsd: t.modelCostUsd == null ? null : t.modelCostUsd, showCost: true,
      approvals: j.timeline.filter(s => /^Owner approved/.test(s.text)).length, durationMs: ms,
      timeline: j.timeline
    };
  };
  function list() {
    const feed = BB.receiptFeed(), fs = feed.filter(x => x.kind === 'job').map(x => x.t), phone = BB.phone();
    /* a standalone action receipt: no job, so no link; the line says what happened and, for an email, the provider id */
    const act = x => { const a = BB.agent(x.r.agentId), meta = BB.receiptLine(x) + ' · ' + BB.when(x.r.at), title = (BB.ACTION_COPY[x.r.action] || {}).ask || x.r.action;
      return phone ? `<div class="kr">${a ? `<span class="kav" style="--av:${BB.avColor(a)}">${esc(BB.initials(a.name))}</span>` : '<span class="kav merch">?</span>'}<div class="t"><b>${esc(title)}</b><small>${esc(meta)}</small></div></div>` : `<div class="row"><span class="t"><b>${esc(title)}</b><small>${esc((a ? a.name + ' · ' : '') + meta)}</small></span></div>`; };
    const rows = () => feed.map(x => x.kind === 'job' ? row(x.t) : act(x)).join('');
    const row = t => {
      const who = BB.jobWho(t), a = who[0], cost = t.status === 'failed' ? 'Didn\'t finish' : t.modelCostUsd != null ? BB.modelCost(t.modelCostUsd) : '–';
      const meta = (who.length ? (t.runByAlter ? 'by Alter for ' : 'by ') + who.map(x => x.name).join(' + ') : 'Unassigned') + ' · ' + BB.when(t.finishedAt);
      if (phone) return `<a class="kr" href="#receipts/${t.id}">${a ? `<span class="kav" style="--av:${BB.avColor(a)}">${esc(BB.initials(a.name))}</span>` : '<span class="kav merch">?</span>'}<div class="t"><b>${esc(t.title)}</b><small>${esc(meta)}</small></div><span class="r">${esc(cost)}</span></a>`;
      return `<a class="row" href="#receipts/${t.id}" style="text-decoration:none">${BB.jobAv(t)}<span class="t"><b>${esc(t.title)}</b><small>${esc(meta)}</small></span><span class="r" title="${t.modelCostUsd != null ? 'Model costs' : ''}">${esc(cost)}</span><span class="chev">${BB.ICON.chev}</span></a>`;
    };
    const foot = fs.some(t => t.modelCostUsd != null) ? '<p class="meta" style="margin-top:14px;padding:0 4px">Amounts are model costs each bot reported. They exclude subscriptions and any tools you pay for. – means not reported.</p>' : '';
    if (phone) V.innerHTML = `<div class="kh"><h1>Receipts</h1><div class="end">${BB.acctAv ? BB.acctAv() : ''}</div></div><div class="ks">What your team finished.</div>${feed.length ? rows() : '<div class="ks">Nothing finished yet. Finished jobs show up here with proof of how they got done.</div>'}${foot ? `<div style="padding:8px 20px">${foot}</div>` : ''}`;
    else V.innerHTML = `<div class="page-in narrow"><div class="page-h"><div><h1>Receipts</h1><p class="sub">What your team finished.</p></div></div>
      ${feed.length ? `<div class="list">${rows()}</div>${foot}` : `<div class="list"><div class="list-empty"><b>Nothing finished yet</b>Finished jobs show up here with how they got done and what they cost.</div></div>`}</div>`;
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
    openId = id;
    if (!cache[id]) { V.innerHTML = `<div class="rc"><a class="back" href="#receipts">‹ Receipts</a><p class="meta" style="margin-top:24px">Loading…</p></div>`; }
    const j = await BB.api('/api/jobs/' + id); if (openId !== id) return;
    if (j.error) { V.innerHTML = `<div class="rc"><a class="back" href="#receipts">‹ Receipts</a><div class="list-empty" style="margin-top:24px"><b>Receipt not found</b>It may be older than the retained history.</div></div>`; return; }
    cache[id] = j; painted = id + ':' + BB.agents().length; paintDetail(j);
  }
  function paintDetail(j) {
    const t = j.task, d = BB.receiptData(j), done = ['done', 'failed'].includes(t.status);
    V.innerHTML = `<div class="rc wide"><a class="back" href="#receipts">‹ Receipts</a><div style="height:28px"></div>${BB.partsHTML?BB.partsHTML(t,j.children):''}${receiptDoc(d, { fullResult: true })}${savedNotes(j)}${t.orchestration&&!done?'<div class="acts" style="margin-top:20px"><button class="b out" data-stop-plan>Stop remaining parts</button></div>':''}
      ${done ? `<div class="share-box" id="share-box"><h3>Share a public receipt</h3><p>You write a public title, description and reusable template, review the exact page, then publish. Nothing from the private job is copied in. Links expire in 30 days.</p><div class="acts" style="justify-content:flex-start;margin-top:14px"><button class="b ink" type="button" data-share>Share…</button></div></div>` : `<p class="meta" style="margin-top:24px">This job is ${esc(BB.jobStatus(t).word.toLowerCase())}. Its receipt is final once it finishes.</p>`}
      <div class="foot"><span class="mark"><i aria-hidden="true"></i>${esc(BRAND.upper)}</span>· Receipt</div></div>`;
    V.querySelectorAll('[data-note]').forEach(b => b.onclick = () => BB.openNote(b.dataset.note, b.dataset.req));
    receiptBind(V);const stop=V.querySelector('[data-stop-plan]');if(stop)stop.onclick=async()=>{stop.disabled=true;const out=await BB.api('/api/tasks/'+t.id+'/stop','POST',{});if(out.error){stop.disabled=false;return BB.toast(out.error);}await BB.sync(true);detail(t.id);};
    const sb = V.querySelector('[data-share]'); if (sb) sb.onclick = () => BB.openShare ? BB.openShare(t.id) : null;
    BB.paintShareBox && BB.paintShareBox(t.id);
  }
  function paint() {
    if (!V.classList.contains('on')) return;
    const r = BB.route(); if (r.arg) { if (openId !== r.arg) detail(r.arg); return; } openId = null; list();
  }
  BB.onRoute(r => { if (r.v === 'receipts') { openId = null; paint(); } });
  let painted = '';
  BB.on(() => {
    if (!V.classList.contains('on')) return; const id = BB.route().arg;
    if (id) { const t = BB.task(id), c = cache[id]; if (t && c && (c.task.status !== t.status || t.orchestration && c.task.progressAt!==t.progressAt)) return detail(id); if (t?.orchestration&&c){c.task=t;paintDetail(c);return;} if (c && painted !== id + ':' + BB.agents().length) { painted = id + ':' + BB.agents().length; paintDetail(c); } return; }
    list();
  });
})();
