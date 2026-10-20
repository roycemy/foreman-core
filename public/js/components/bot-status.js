/* Honest status (design pack v3). 'Working' ONLY when BB.runningTask(a) exists AND BB.signal(a)==='working'. Never inferred from presence.
   Check-in copy comes from the bot's real self-declared cadence (BB.pollSec, e.g. Grok's 5-min routine, Instinct's &poll=300).
   Muse is message-mode in core.js, so it says so. Anything without a declared cadence gets no promise at all. */
(function(){const BB=window.BB=window.BB||{};
/* the API sends connection.reason as raw codes; map them to the five plain reasons. Unknown -> session_expired (pack fallback). */
const RAW={session_expired:'session_expired',token_reused:'token_reused',refresh_replay:'token_reused',key_reuse_detected:'token_reused',second_caller:'token_reused',
 login_missing:'login_missing',persistent_grant_missing:'login_missing',grant_index_not_verified:'login_missing',
 revoked:'revoked',bot_revoked:'revoked',owner_workspace_reset:'revoked',agent_not_active:'revoked',key_replaced:'revoked',quiet:'quiet'};
BB.reconnectReason=a=>RAW[String((a&&a.connection&&a.connection.reason)||'')]||'session_expired';
const WHY={session_expired:'Its session expired',token_reused:'Its renewal token was used twice',login_missing:'Its saved login is missing',revoked:'Its access was revoked',quiet:'No check-in for over 30 min'};
const ago=iso=>{const m=Math.round((Date.now()-Date.parse(iso))/60000);return !Number.isFinite(m)?'never':m<1?'just now':m+' min ago'};
const first=n=>String(n||'It').split(/\s+/)[0];
BB.checkInWhy=function(a){const ps=BB.pollSec?BB.pollSec(a):0;
 if(ps)return first(a.name)+' checks in about every '+Math.round(ps/60)+' min';
 if((a.providerId||'').toLowerCase()==='muse')return first(a.name)+' checks in when you message it';
 return '';};
/* Offline = connected on paper but silent 30+ min (Muse, hosted, revoked and not-yet-connected bots never count). */
BB.isOffline=a=>{if(!a||a.status!=='active'||a.hosted||!a.lastSeen||(a.providerId||'')==='muse'||(BB.isGhost&&BB.isGhost(a))||(BB.presence&&BB.presence(a)==='reconnect'))return false;return Date.now()-Date.parse(a.lastSeen)>=1800000;};
BB.honestStatus=function(a){const p=BB.presence?BB.presence(a):'connected';
 if(BB.isOffline(a))return{s:'reconnect',line:'Offline',why:'No check-in for '+ago(a.lastSeen).replace(' ago','')+'. One tap copies a fresh setup message.'};
 if(p==='reconnect')return{s:'reconnect',line:'Needs reconnect',why:WHY[BB.reconnectReason(a)]};
 if(a.paused||(BB.S&&BB.S.killed))return{s:'paused',line:'Paused',why:BB.S&&BB.S.killed?'Everything is paused':'You paused this bot'};
 const t=BB.runningTask&&BB.runningTask(a);
 if(t&&BB.signal&&BB.signal(a)==='working')return{s:'working',line:'Working · '+t.title,why:''};
 return{s:'queued',line:'Queued · last check-in '+(a.lastSeen?ago(a.lastSeen):'never'),why:BB.checkInWhy(a)};};
BB.statusHTML=(a,st)=>{st=st||BB.honestStatus(a);const e=BB.esc||(x=>x);return `<div class="bst" data-s="${st.s}"><i class="bst-dot" aria-hidden="true"></i><div class="bst-t"><b>${e(a.name)}</b><span class="bst-line">${e(st.line)}</span>${st.why?`<span class="bst-why">${e(st.why)}</span>`:''}</div></div>`};})();
