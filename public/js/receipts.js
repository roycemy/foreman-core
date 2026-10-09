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
      bot: { name: bot.name, initials: BB.initials(bot.name), color: BB.avColor(bot) },
      at: t.finishedAt || t.createdAt,
      headline: t.status === 'failed' ? bot.name + ' stopped after ' + BB.durWords(ms) : bot.name + ' finished this in ' + BB.durWords(ms),
      lede: t.brief ? t.title + '. ' + t.brief : t.title,
      artifact: lines.length ? { title: lines[0].replace(/^\d+[.)]\s*/, '').slice(0, 90), text: lines.slice(1).join(' · ').slice(0, 220), words, name: t.title, full: t.result } : null,
      costUsd: t.modelCostUsd == null ? null : t.modelCostUsd, showCost: true,
      approvals: j.timeline.filter(s => /^Owner approved/.test(s.text)).length, durationMs: ms,
      timeline: j.timeline
    };
  };
  function list() {
    const fs = finished(), phone = BB.phone();
    const row = t => {
      const who = BB.jobWho(t), a = who[0], cost = t.status === 'failed' ? 'Didn\'t finish' : t.modelCostUsd != null ? BB.modelCost(t.modelCostUsd) : '–';
      const meta = (who.length ? who.map(x => x.name).join(' + ') : 'Unassigned') + ' · ' + BB.when(t.finishedAt);
      if (phone) return `<a class="kr" href="#receipts/${t.id}">${a ? `<span class="kav" style="--av:${BB.avColor(a)}">${esc(BB.initials(a.name))}</span>` : '<span class="kav merch">?</span>'}<div class="t"><b>${esc(t.title)}</b><small>${esc(meta)}</small></div><span class="r">${esc(cost)}</span></a>`;
      return `<a class="row" href="#receipts/${t.id}" style="text-decoration:none">${BB.jobAv(t)}<span class="t"><b>${esc(t.title)}</b><small>${esc(meta)}</small></span><span class="r" title="${t.modelCostUsd != null ? 'Model costs' : ''}">${esc(cost)}</span><span class="chev">${BB.ICON.chev}</span></a>`;
    };
    const foot = fs.some(t => t.modelCostUsd != null) ? '<p class="meta" style="margin-top:14px;padding:0 4px">Amounts are model costs each bot reported. They exclude subscriptions and any tools you pay for. – means not reported.</p>' : '';
    if (phone) V.innerHTML = `<div class="kh"><h1>Receipts</h1><div class="end">${BB.acctAv ? BB.acctAv() : ''}</div></div><div class="ks">What your team finished.</div>${fs.length ? fs.map(row).join('') : '<div class="ks">Nothing finished yet. Finished jobs show up here with proof of how they got done.</div>'}${foot ? `<div style="padding:8px 20px">${foot}</div>` : ''}`;
    else V.innerHTML = `<div class="page-in narrow"><div class="page-h"><div><h1>Receipts</h1><p class="sub">What your team finished.</p></div></div>
      ${fs.length ? `<div class="list">${fs.map(row).join('')}</div>${foot}` : `<div class="list"><div class="list-empty"><b>Nothing finished yet</b>Finished jobs show up here with how they got done and what they cost.</div></div>`}</div>`;
  }
  async function detail(id) {
    openId = id;
    if (!cache[id]) { V.innerHTML = `<div class="rc"><a class="back" href="#receipts">‹ Receipts</a><p class="meta" style="margin-top:24px">Loading…</p></div>`; }
    const j = await BB.api('/api/jobs/' + id); if (openId !== id) return;
    if (j.error) { V.innerHTML = `<div class="rc"><a class="back" href="#receipts">‹ Receipts</a><div class="list-empty" style="margin-top:24px"><b>Receipt not found</b>It may be older than the retained history.</div></div>`; return; }
    cache[id] = j; painted = id + ':' + BB.agents().length; paintDetail(j);
  }
  function paintDetail(j) {
    const t = j.task, d = BB.receiptData(j), done = ['done', 'failed'].includes(t.status);
    V.innerHTML = `<div class="rc wide"><a class="back" href="#receipts">‹ Receipts</a><div style="height:28px"></div>${receiptDoc(d, { fullResult: true })}
      ${done ? `<div class="share-box" id="share-box"><h3>Share a public receipt</h3><p>You write a public title, description and reusable template, review the exact page, then publish. Nothing from the private job is copied in. Links expire in 30 days.</p><div class="acts" style="justify-content:flex-start;margin-top:14px"><button class="b ink" type="button" data-share>Share…</button></div></div>` : `<p class="meta" style="margin-top:24px">This job is ${esc(BB.jobStatus(t).word.toLowerCase())}. Its receipt is final once it finishes.</p>`}
      <div class="foot"><span class="mark"><i aria-hidden="true"></i>${esc(BRAND.name)}</span>· Receipt</div></div>`;
    receiptBind(V);
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
    if (id) { const t = BB.task(id), c = cache[id]; if (t && c && c.task.status !== t.status) return detail(id); if (c && painted !== id + ':' + BB.agents().length) { painted = id + ':' + BB.agents().length; paintDetail(c); } return; }
    list();
  });
})();
