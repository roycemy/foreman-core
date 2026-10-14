/* Black Box vNext · Card (E). One screen: the ink card, today's spend against the daily limit, recent charges.
   It is the sandbox card: the quiet "Sandbox. No real money moves." line stays until real payments exist. */
(function () {
  'use strict';
  const BB = window.BB, $ = BB.$, esc = BB.esc;
  const V = $('#v-card');
  const note = '<div class="note" role="note"><i aria-hidden="true"></i>Sandbox. No real money moves.</div>';
  function totals(D) {
    const live = (D.bots || []).filter(b => b.status === 'active');
    const spent = (D.bots || []).reduce((s, b) => s + (b.simulatedTodayCents || 0), 0), limit = live.reduce((s, b) => s + (b.dailyLimitCents || 0), 0);
    return { spent, limit, left: Math.max(0, limit - spent), pct: limit ? Math.min(100, spent / limit * 100) : 0 };
  }
  const charges = D => (D.ledger || []).filter(l => l.outcome === 'simulated').sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const cardFace = (D, phone) => `<div class="cc${D.killed ? ' frozen' : ''}" role="img" aria-label="${esc((D.card && D.card.label) || 'Team card')}, virtual, ending ${esc((D.card && D.card.last4) || '')}${D.killed ? ', frozen' : ''}"><div class="mark"><i aria-hidden="true"></i><span data-brand="upper">${esc(BRAND.upper)}</span></div><div class="num">•••• ${esc((D.card && D.card.last4) || '····')}</div><div class="nm">${esc((D.card && D.card.label) || 'Team card')}</div><div class="vv">Virtual</div></div>`;
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
    const trustRow = b => { const x = b.trust || {}, n = x.sampleCount || 0; return `<div class="trow">${BB.av(b, 's30')}<b>${esc(b.name)}</b><span class="num">${n < 5 ? 'Not enough data yet' : n + ' decisions · ' + (x.policyBlockedCount || 0) + ' blocked'}</span></div>`; };
    V.insertAdjacentHTML('beforeend', `<section class="trust"><h3 class="h">Bot trust</h3><p class="meta">Sandbox decisions</p><div class="tlist">${(D.bots || []).map(trustRow).join('')}</div><p class="meta">A signal only, never a score. It never changes what a bot is allowed to do.</p>
      <p class="meta links">Sandbox. No real money moves. <a href="/authorization.html">Open authorization demo</a> · <a href="/interception.html">Interception coverage and review</a> · <button class="b out sm" type="button" data-rules>Sandbox rules</button></p></section>`);
    V.querySelector('[data-rules]').onclick = rules;
    V.querySelector('[data-limit]').onclick = limits;
    V.querySelector('[data-freeze]').onclick = async () => { const j = await BB.api('/api/cards/control', 'POST', { killed: !D.killed }); if (j.error) return BB.toast(j.error); BB.cards = j; BB.toast(j.killed ? 'Card frozen. Card requests are blocked.' : 'Card unfrozen.'); paint(); BB.emit(); };
  }
  function rules() {
    const bots=(BB.cards?.bots||[]).filter(b=>b.status==='active');
    if(!bots.length)return BB.toast('Connect a bot first.');
    const CATS=[['software','Software'],['advertising','Advertising'],['travel','Travel'],['supplies','Supplies'],['uncategorized','Other']];
    const dollars=c=>c==null||c===''?'':(Number(c)/100).toFixed(2);
    const box=BB.modal(`<h3>Sandbox rules</h3><p>These can only tighten limits, never loosen them. Every spend still needs your approval. No real money moves.</p>
      <div class="seg" role="tablist" aria-label="Bot">${bots.map(b=>`<button type="button" role="tab" data-bot="${esc(b.id)}">${esc(b.name)}</button>`).join('')}</div>
      <div class="rrow"><label for="rule-cap">Max per purchase</label><span class="inline-input">$<input id="rule-cap" type="text" inputmode="decimal" placeholder="No limit"></span></div>
      <div class="rrow"><label for="rule-rate">Purchases allowed per hour</label><span class="step"><button type="button" id="rate-dn" aria-label="Fewer per hour">−</button><input id="rule-rate" type="number" min="1" max="1000" step="1" placeholder="Any"><button type="button" id="rate-up" aria-label="More per hour">+</button></span></div>
      <div class="rcats"><b>Allowed categories</b><div class="chips" id="rule-cats" role="group" aria-label="Allowed categories">${CATS.map(([k,l])=>`<button type="button" class="cchip" data-cat="${k}" aria-pressed="false">${l}</button>`).join('')}</div></div>
      <div class="rrow" id="job-row" hidden><div><label for="rule-budget">This job's budget</label><small id="job-name"></small></div><span class="inline-input">$<input id="rule-budget" type="text" inputmode="decimal" placeholder="0.00"></span></div>
      <div class="rrow" id="job-pick" hidden><label for="rule-job">Running job</label><select id="rule-job" class="t"></select></div>
      <div class="rrow" id="job-on" hidden><label for="rule-apply">Apply to the job running now</label><button type="button" class="sw" id="rule-apply" role="switch" aria-checked="false"><i></i></button></div>
      <p class="meta" style="margin-top:12px">Leave a field blank for no extra limit. The job budget is separate from the card's limit.</p><p id="rule-error" class="err"></p>
      <div class="acts"><button class="b ghost" data-close>Cancel</button><button class="b ink" id="rule-save">Save rules</button></div>`,{label:'Sandbox rules'});
    box.classList.add('rules');
    const $=q=>box.querySelector(q),jobSelect=$('#rule-job'),apply=$('#rule-apply');let botId=bots[0].id;
    const cur=()=>bots.find(b=>b.id===botId);
    const cats=()=>[...box.querySelectorAll('.cchip[aria-pressed="true"]')].map(c=>c.dataset.cat);
    const on=v=>{apply.setAttribute('aria-checked',v?'true':'false');if(!v)jobSelect.value='';else if(!jobSelect.value)jobSelect.value=jobSelect.options[1]?.value||'';syncJob();};
    function syncJob(){const t=BB.task(jobSelect.value);$('#job-row').hidden=!jobSelect.value;$('#job-name').textContent=t?t.title:'';if(jobSelect.value)$('#rule-budget').value=dollars(t?.sandboxGrant?.budgetCents);}
    function load(){const bot=cur(),p=bot.policy||{};
      box.querySelectorAll('[data-bot]').forEach(t=>t.setAttribute('aria-selected',t.dataset.bot===botId?'true':'false'));
      $('#rule-cap').value=dollars(p.perActionCents);$('#rule-rate').value=p.maxPerHour??'';
      box.querySelectorAll('.cchip').forEach(c=>{const v=(p.allowedCategories||[]).includes(c.dataset.cat);c.setAttribute('aria-pressed',v);c.textContent=(v?'✓ ':'')+CATS.find(x=>x[0]===c.dataset.cat)[1];});
      const jobs=BB.tasks().filter(t=>t.assignee===bot.id&&t.status==='running');
      jobSelect.innerHTML='<option value="">No job budget change</option>'+jobs.map(t=>`<option value="${esc(t.id)}">${esc(t.title)}</option>`).join('');
      $('#job-on').hidden=!jobs.length;$('#job-pick').hidden=jobs.length<2;apply.setAttribute('aria-checked','false');$('#job-row').hidden=true;$('#rule-budget').value='';}
    box.querySelectorAll('[data-bot]').forEach(t=>t.onclick=()=>{botId=t.dataset.bot;load();});
    box.querySelectorAll('.cchip').forEach(c=>c.onclick=()=>{const v=c.getAttribute('aria-pressed')!=='true';c.setAttribute('aria-pressed',v);c.textContent=(v?'✓ ':'')+CATS.find(x=>x[0]===c.dataset.cat)[1];});
    const rate=$('#rule-rate'),bump=d=>{rate.value=Math.min(1000,Math.max(1,(Number(rate.value)||0)+d));};
    $('#rate-dn').onclick=()=>bump(-1);$('#rate-up').onclick=()=>bump(1);
    apply.onclick=()=>on(apply.getAttribute('aria-checked')!=='true');
    jobSelect.onchange=()=>{apply.setAttribute('aria-checked',jobSelect.value?'true':'false');syncJob();};
    load();
    const toCents=(v,name)=>{v=String(v).trim().replace(/^$/,'');if(v==='')return null;if(!/^d+(.d{1,2})?$/.test(v))throw Error(name+' must be a dollar amount like 25.00.');return Math.round(Number(v)*100);};
    $('#rule-save').onclick=async()=>{const err=$('#rule-error');err.textContent='';try{
      const policy={},cap=toCents($('#rule-cap').value,'Max per purchase'),rt=rate.value,cs=cats();
      if(cap!==null)policy.perActionCents=cap;if(rt!=='')policy.maxPerHour=Number(rt);if(cs.length)policy.allowedCategories=cs;
      const body={botId,policy};
      if(jobSelect.value){const bud=toCents($('#rule-budget').value,"This job's budget");body.taskId=jobSelect.value;body.budgetCents=bud===null?0:bud;body.confirmed=true;}
      const j=await BB.api('/api/cards/control','POST',body);if(j.error){err.textContent=j.error;return;}
      BB.cards=j;BB.closeModal();await BB.sync(true);BB.emit();BB.toast('Sandbox rules saved. No real money moves.');
    }catch(e){err.textContent=e.message;}};
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
