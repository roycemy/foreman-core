/* Reconnect flag. One tap copies the exact setup message (from connect.js, unchanged), then shows the just-paste card.
   Mount: BB.reconnectFlag.mount() once; it re-renders on BB.on(state). Uses BB.presence(a)==='reconnect'. */
(function(){const BB=window.BB=window.BB||{},esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const WHY={session_expired:'Its session expired.',token_reused:'Its renewal token was used twice.',login_missing:'Its saved login is missing.',revoked:'Its access was revoked.',quiet:'No check-in for over 30 min.'};
const TICK='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 8.5l3 3 7-7"/></svg>';
const st={}; // per bot: 'idle' | 'copied' | 'paste'
function why(a){const r=a.connection&&a.connection.reason;return WHY[r]||WHY.session_expired}
function isConsole(a){return a.harness==='console'||a.transport==='botlink'||/console/i.test(a.providerId||'')}
function provider(a){return (a.providerId||'').toLowerCase()==='grok'?"Grok's":a.name+"'s"}
function card(list){
 if(!list.length)return '';
 if(list.length>1)return `<div class="rcf many" role="status"><div class="rcf-h">${list.length} bots need reconnecting</div><ul class="rcf-list">${list.map(a=>`<li><div><b>${esc(a.name)}</b><small>${esc(why(a))}</small></div>${st[a.id]==='copied'||st[a.id]==='paste'?`<span class="rcf-ok">${TICK}Copied</span>`:`<button class="rcf-act" type="button" data-copy="${a.id}">Copy setup</button>`}</li>`).join('')}</ul></div>`;
 const a=list[0],s=st[a.id]||'idle';
 if(s==='paste')return isConsole(a)?`<div class="rcf paste" role="status"><div class="rcf-h">Enter this code in the console</div><p class="rcf-why">It works once, for the next 10 min.</p><div class="rcf-row"><span class="rcf-code">${esc(a._code||'······')}</span></div></div>`
  :`<div class="rcf paste" role="status"><div class="rcf-h">Paste it in ${esc(provider(a))} chat</div><p class="rcf-why">The setup message is copied. ${esc(a.name.split(' ')[0])} does the rest.</p><div class="rcf-row"><a class="rcf-act" href="${esc(a._chatUrl||'https://grok.com')}" target="_blank" rel="noopener">Open ${esc(provider(a))} chat</a></div></div>`;
 return `<div class="rcf" role="status"><div class="rcf-h">${esc(a.name)} needs reconnecting</div><p class="rcf-why">${esc(why(a))}</p>${s==='copied'?`<div class="rcf-ok">${TICK}Copied</div>`:`<button class="rcf-act" type="button" data-copy="${a.id}">${isConsole(a)?'Get pairing code':'Copy setup message'}</button>`}</div>`;}
async function copy(id){const a=BB.agent&&BB.agent(id);if(!a)return;
 if(isConsole(a)){const j=await BB.api('/api/agents/'+id+'/pairing','POST',{});a._code=j.code;st[id]='paste';return paint()}
 const msg=BB.setupMessage?BB.setupMessage(a):'';try{await navigator.clipboard.writeText(msg)}catch(e){}
 st[id]='copied';paint();setTimeout(()=>{st[id]='paste';paint()},matchMedia('(prefers-reduced-motion: reduce)').matches?600:1600);}
let host=null;
function paint(list){if(!host)return;list=list||(BB.agents?BB.agents().filter(a=>BB.presence(a)==='reconnect'):[]);
 const f=host.querySelector('.rcf-slot'),h=card(list);if(f._h===h)return;f._h=h;f.innerHTML=h;f.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>copy(b.dataset.copy));}
BB.reconnectFlag={card,paint,state:st,
 mount(){const stage=document.getElementById('stage'),crew=document.getElementById('crew');if(!stage||!crew||host)return;
  host=document.createElement('div');host.className='a-corner';host.innerHTML='<div class="rcf-slot" style="width:100%"></div>';stage.appendChild(host);host.appendChild(crew);
  const roster=document.getElementById('roster');if(roster)host.insertBefore(roster,crew);
  paint();BB.on&&BB.on(()=>paint());}};
})();
