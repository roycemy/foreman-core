/* Honest status. 'Working' ONLY when BB.runningTask(a) exists AND BB.signal(a)==='working'. Never inferred from presence. */
(function(){const BB=window.BB=window.BB||{};
const CADENCE={grok:'Grok checks in about every 5 min',muse:'Muse checks in about every 5 min',instinct:'Instinct checks in about every 10 min'};
const ago=iso=>{const m=Math.round((Date.now()-Date.parse(iso))/60000);return !Number.isFinite(m)?'':m<1?'just now':m+' min ago'};
BB.honestStatus=function(a){const p=BB.presence?BB.presence(a):'connected';
 if(p==='reconnect')return{s:'reconnect',line:'Needs reconnect',why:({session_expired:'Its session expired',token_reused:'Renewal token was reused',login_missing:'Saved login is missing',revoked:'Access was revoked',quiet:'Quiet for 30+ min'})[(a.connection||{}).reason]||'Its session expired'};
 if(a.paused||(BB.S&&BB.S.killed))return{s:'paused',line:'Paused',why:BB.S&&BB.S.killed?'Everything is paused':'You paused this bot'};
 const t=BB.runningTask&&BB.runningTask(a);
 if(t&&BB.signal&&BB.signal(a)==='working')return{s:'working',line:'Working · '+t.title,why:''};
 return{s:'queued',line:'Queued · last check-in '+ago(a.lastSeen),why:CADENCE[(a.providerId||'').toLowerCase()]||(a.name+' checks in on its own schedule')};};
BB.statusHTML=(a,st)=>{st=st||BB.honestStatus(a);const e=BB.esc||(x=>x);return `<div class="bst" data-s="${st.s}"><i class="bst-dot" aria-hidden="true"></i><div class="bst-t"><b>${e(a.name)}</b><span class="bst-line">${e(st.line)}</span>${st.why?`<span class="bst-why">${e(st.why)}</span>`:''}</div></div>`};})();
