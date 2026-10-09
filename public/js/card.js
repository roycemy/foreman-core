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
    V.querySelector('[data-limit]').onclick = limits;
    V.querySelector('[data-freeze]').onclick = async () => { const j = await BB.api('/api/cards/control', 'POST', { killed: !D.killed }); if (j.error) return BB.toast(j.error); BB.cards = j; BB.toast(j.killed ? 'Card frozen. Card requests are blocked.' : 'Card unfrozen.'); paint(); BB.emit(); };
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
