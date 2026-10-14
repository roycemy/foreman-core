/* Black Box vNext · Card (E). One screen: the ink card, today's spend against the daily limit, recent charges.
   It is the sandbox card: the quiet "Example card. No real money moves yet." line stays until real payments exist. */
(function () {
  'use strict';
  const BB = window.BB, $ = BB.$, esc = BB.esc;
  const V = $('#v-card');
  const note = '<div class="note" role="note"><i aria-hidden="true"></i>Example card. No real money moves yet.</div>';
  function totals(D) {
    const live = (D.bots || []).filter(b => b.status === 'active');
    const spent = (D.bots || []).reduce((s, b) => s + (b.simulatedTodayCents || 0), 0), limit = live.reduce((s, b) => s + (b.dailyLimitCents || 0), 0);
    return { spent, limit, left: Math.max(0, limit - spent), pct: limit ? Math.min(100, spent / limit * 100) : 0 };
  }
  const charges = D => (D.ledger || []).filter(l => l.outcome === 'simulated').sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const cardFace = (D, phone) => `<div class="cc${D.killed ? ' frozen' : ''}" role="img" aria-label="${esc((D.card && D.card.label) || 'Team card')}, virtual, ending ${esc((D.card && D.card.last4) || '')}${D.killed ? ', frozen' : ''}"><div class="mark"><i aria-hidden="true"></i><span data-brand>${esc(BRAND.name)}</span></div><div class="num">•••• ${esc((D.card && D.card.last4) || '····')}</div><div class="nm">${esc((D.card && D.card.label) || 'Team card')}</div><div class="vv">Virtual</div></div>`;
  function paint() {
    if (!V.classList.contains('on')) return;
    const D = BB.cards || {}, t = totals(D), cs = charges(D), phone = BB.phone();
    const who = id => (BB.agent(id) || {}).name || 'A bot';
    if (phone) {
      V.innerHTML = `<div class="kh"><h1>Card</h1><div class="end">${BB.acctAv ? BB.acctAv() : ''}</div></div><div style="padding:4px 24px 24px">${note}</div>
        <div class="card-phone">${cardFace(D, true)}</div>
        <div style="padding:32px 24px 8px"><div class="stone" style="font-size:14px">Spent today</div><div style="display:flex;align-items:baseline;gap:8px;margin-top:6px"><span class="big num">${BB.usd(t.spent)}</span><span class="meta" style="font-size:14px">of ${BB.usdShort(t.limit)}</span></div><div class="bar" style="height:6px" role="progressbar" aria-valuemin="0" aria-valuemax="${t.limit}" aria-valuenow="${t.spent}" aria-label="Spent today"><i style="width:${t.pct}%"></i></div></div>
        <div class="kl" style="padding-top:20px">Recent</div>${cs.length ? cs.slice(0, 20).map(c => `<div class="kr"><span class="kav merch">${esc(c.merchant[0] || '?')}</span><div class="t"><b>${esc(c.merchant)}</b><small>${esc(who(c.botId))} · ${esc(BB.when(c.at).replace(/^Today /, ''))}</small></div><span class="r ink">${BB.usd(c.amountCents)}</span></div>`).join('') : `<div class="ks">No charges yet. When a bot asks to spend, it lands in your inbox first.</div>`}
        <div style="padding:20px 24px;display:flex;gap:8px"><button class="b out" type="button" data-limit>Daily limit</button><button class="b ghost" type="button" data-freeze>${D.killed ? 'Unfreeze card' : 'Freeze card'}</button></div>`;
    } else {
      V.innerHTML = `<div class="page-in"><div class="page-h"><div><h1>Card</h1><div style="margin-top:6px">${note}</div></div></div>
        <div class="card-grid"><div>${cardFace(D)}<div class="btns" style="margin-top:20px"><button class="b out" type="button" data-limit>Daily limit</button><button class="b ghost" type="button" data-freeze>${D.killed ? 'Unfreeze card' : 'Freeze card'}</button></div></div>
        <div class="spend"><div class="lbl">Spent today</div><div style="display:flex;align-items:baseline;gap:8px;margin-top:6px"><span class="big num">${BB.usd(t.spent)}</span><span class="meta" style="font-size:14px">of ${BB.usd(t.limit)}</span></div><div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${t.limit}" aria-valuenow="${t.spent}" aria-label="Spent today"><i style="width:${t.pct}%"></i></div><div class="row2"><span>${BB.usd(t.left)} left today</span><span>Resets at midnight UTC</span></div>${D.killed ? '<p class="meta" style="margin-top:12px">Frozen. Every card request is blocked until you unfreeze it.</p>' : ''}</div></div>
        <h3 class="h">Recent charges</h3><div class="charges">${cs.length ? cs.slice(0, 30).map(c => `<div class="row"><span class="merch" aria-hidden="true">${esc(c.merchant[0] || '?')}</span><span class="t"><b>${esc(c.merchant)}</b><small>${esc(who(c.botId))} · ${esc(c.purpose)} · ${esc(BB.when(c.at).replace(/^Today (\d)/, 'Today, $1'))}</small></span><span class="amt">${BB.usd(c.amountCents)}</span></div>`).join('') : `<div class="list-empty"><b>No charges yet</b>When a bot asks to spend, it lands in your inbox first. Nothing is charged until you approve.</div>`}</div></div>`;
    }
    V.insertAdjacentHTML('beforeend', `<section style="padding:24px;max-width:900px"><h3>Authorization engine</h3><p class="meta">Sandbox only. Every request needs owner review; rules are checked again before simulated spend. Categories are bot-reported, not issuer-verified.</p><p><a href="/authorization.html">Open authorization demo</a> · <button class="b out sm" data-rules>Set sandbox rules</button></p><h3>Bot trust evidence</h3>${(D.bots || []).map(b => { const x=b.trust||{};return `<div class="perm" style="padding:12px 0"><div class="t"><b>${esc(b.name)}</b><small>${x.sampleCount||0} sandbox decisions · ${x.policyBlockedCount||0} policy blocks</small></div><span>${x.score==null?'Not enough data':esc(String(x.score))+'/100'}</span></div>`; }).join('')}<p class="meta">Minimum 5 decisions. Descriptive compliance signal, not fraud prediction. A score never changes permission.</p></section>`);
    V.querySelector('[data-rules]').onclick = rules;
    V.querySelector('[data-limit]').onclick = limits;
    V.querySelector('[data-freeze]').onclick = async () => { const j = await BB.api('/api/cards/control', 'POST', { killed: !D.killed }); if (j.error) return BB.toast(j.error); BB.cards = j; BB.toast(j.killed ? 'Card frozen. Card requests are blocked.' : 'Card unfrozen.'); paint(); BB.emit(); };
  }
  function rules() {
    const bots=(BB.cards?.bots||[]).filter(b=>b.status==='active');
    if(!bots.length)return BB.toast('Connect a bot first.');
    const box=BB.modal(`<h3>Sandbox rules</h3><p>No live money. These rules can only restrict requests; every spend still needs owner review.</p><div class="stackf"><label>Bot<select id="rule-bot">${bots.map(b=>`<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select></label><label>Per-request cap (exact cents)<input id="rule-cap" type="number" min="0" step="1"></label><label>Admitted requests per hour<input id="rule-rate" type="number" min="1" max="1000" step="1"></label><label>Allowed categories, comma-separated<input id="rule-cats" placeholder="software,advertising"></label><label>Running job<select id="rule-job"></select></label><label>Job sandbox budget (exact cents)<input id="rule-budget" type="number" min="0" step="1"></label></div><p class="meta">Categories: software, advertising, travel, supplies, uncategorized. Blank limits/categories mean no extra restriction. Job budget is separate from the gateway ledger. A job-scoped bot needs a running job and sandbox budget.</p><p id="rule-error" class="err"></p><div class="acts"><button class="b ghost" data-close>Cancel</button><button class="b ink" id="rule-save">Save sandbox rules</button></div>`,{label:'Sandbox rules'});
    const select=box.querySelector('#rule-bot'),jobSelect=box.querySelector('#rule-job');
    function load(){const bot=bots.find(b=>b.id===select.value),p=bot.policy||{};box.querySelector('#rule-cap').value=p.perActionCents??'';box.querySelector('#rule-rate').value=p.maxPerHour??'';box.querySelector('#rule-cats').value=(p.allowedCategories||[]).join(',');const jobs=BB.tasks().filter(t=>t.assignee===bot.id&&t.status==='running');jobSelect.innerHTML='<option value="">No job budget change</option>'+jobs.map(t=>`<option value="${esc(t.id)}">${esc(t.title)}</option>`).join('');box.querySelector('#rule-budget').value='';}
    select.onchange=load;jobSelect.onchange=()=>{box.querySelector('#rule-budget').value=BB.task(jobSelect.value)?.sandboxGrant?.budgetCents??''};load();
    box.querySelector('#rule-save').onclick=async()=>{const policy={},cap=box.querySelector('#rule-cap').value,rate=box.querySelector('#rule-rate').value,cats=box.querySelector('#rule-cats').value.trim();if(cap!=='')policy.perActionCents=Number(cap);if(rate!=='')policy.maxPerHour=Number(rate);if(cats)policy.allowedCategories=cats.split(',').map(c=>c.trim());const body={botId:select.value,policy};if(jobSelect.value){body.taskId=jobSelect.value;body.budgetCents=Number(box.querySelector('#rule-budget').value);body.confirmed=true;}const j=await BB.api('/api/cards/control','POST',body);if(j.error){box.querySelector('#rule-error').textContent=j.error;return;}BB.cards=j;BB.closeModal();await BB.sync(true);BB.emit();BB.toast('Sandbox rules saved. No live money.');};
  }
  /* daily limit: one cap per bot (UTC day); the card's limit is their sum */
  function limits() {
    const D = BB.cards || {}, bots = (D.bots || []).filter(b => b.status === 'active');
    const box = BB.modal(`<h3>Daily limit</h3><p>How much each bot may put on the card per day. The card's limit is the total.</p>
      <div class="stackf">${bots.length ? bots.map(b => `<div class="perm" style="padding:10px 0"><div class="t"><b>${esc(b.name)}</b><small>${BB.usd(b.simulatedTodayCents)} used today</small></div><span class="inline-input">$<input type="number" min="0" step="1" data-cap="${b.id}" value="${(b.dailyLimitCents / 100).toFixed(0)}" aria-label="Daily limit for ${esc(b.name)} in dollars"></span></div>`).join('') : '<p class="meta">Connect a bot first.</p>'}</div>
      <p class="err" id="lim-e" style="color:var(--vermilion-press);font-size:13px;margin-top:8px"></p>
      <div class="acts"><button class="b ghost" type="button" data-close>Cancel</button><button class="b ink" type="button" id="lim-ok">Save</button></div>`, { label: 'Daily limit' });
    box.querySelector('#lim-ok').onclick = async () => {
      for (const i of box.querySelectorAll('[data-cap]')) {
        const v = Math.round(Number(i.value) * 100), b = bots.find(x => x.id === i.dataset.cap); if (!(v >= 0)) { box.querySelector('#lim-e').textContent = 'Use a dollar amount.'; return; }
        if (b && v !== b.dailyLimitCents) { const j = await BB.api('/api/cards/control', 'POST', { botId: b.id, dailyLimitCents: v }); if (j.error) { box.querySelector('#lim-e').textContent = j.error; return; } BB.cards = j; }
      }
      BB.closeModal(); BB.toast('Daily limits saved.'); BB.emit();
    };
  }
  BB.on(paint); BB.onRoute(r => { if (r.v === 'card') { paint(); BB.sync(true); } });
})();
