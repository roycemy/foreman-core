/* Reconnect flag (design pack v3). One tap copies the exact setup message (BB.setupMessage from connect.js, unchanged text),
   then shows the just-paste card. Console bots show the one-time pairing code instead.
   Mount: BB.reconnectFlag.mount() once; it re-renders on BB.on(state). Uses BB.presence(a)==='reconnect'. */
(function(){const BB=window.BB=window.BB||{},esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const WHY={session_expired:'Its session expired.',token_reused:'Its renewal token was used twice.',login_missing:'Its saved login is missing.',revoked:'Its access was revoked.',quiet:'No check-in for over 30 min.'};
const TICK='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 8.5l3 3 7-7"/></svg>';
const CHAT={grok:'https://grok.com'}; // only providers whose chat address is known; others get no button
const st={},extra={}; // per bot: 'idle' | 'busy' | 'copied' | 'paste'; extra: code, expiresAt
function why(a){return WHY[BB.reconnectReason?BB.reconnectReason(a):'session_expired']}
const pid=a=>(a.providerId||'').toLowerCase();
function isConsole(a){const c=a.connection||{};return a.harness==='console'||c.transport==='botlink'||c.transport==='runner'||/console/i.test(a.providerId||'')}
function provider(a){return pid(a)==='grok'?"Grok's":a.name+"'s"}
function card(list){
 if(!list.length)return '';
 if(list.length>1)return `<div class="rcf many" role="status"><div class="rcf-h">${list.length} bots need reconnecting</div><ul class="rcf-list">${list.map(a=>`<li><div><b>${esc(a.name)}</b><small>${esc(why(a))}</small></div>${st[a.id]==='copied'||st[a.id]==='paste'?`<span class="rcf-ok">${TICK}Copied</span>`:`<button class="rcf-act" type="button" data-copy="${esc(a.id)}"${st[a.id]==='busy'?' disabled':''}>Copy setup</button>`}</li>`).join('')}</ul></div>`;
 const a=list[0],s=st[a.id]||'idle',x=extra[a.id]||{};
 if(s==='paste'&&isConsole(a)&&x.code)return `<div class="rcf paste" role="status"><div class="rcf-h">Enter this code in the console</div><p class="rcf-why">It works once${x.expiresAt?', until '+esc(new Date(x.expiresAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})):''}.</p><div class="rcf-row"><span class="rcf-code">${esc(x.code)}</span></div></div>`;
 if(s==='paste')return `<div class="rcf paste" role="status"><div class="rcf-h">Paste it in ${esc(provider(a))} chat</div><p class="rcf-why">The setup message is copied. ${esc(a.name.split(' ')[0])} does the rest.</p>${CHAT[pid(a)]?`<div class="rcf-row"><a class="rcf-act" href="${CHAT[pid(a)]}" target="_blank" rel="noopener">Open ${esc(provider(a))} chat</a></div>`:''}</div>`;
 return `<div class="rcf" role="status"><div class="rcf-h">${esc(a.name)} needs reconnecting</div><p class="rcf-why">${esc(why(a))}</p>${s==='copied'?`<div class="rcf-ok">${TICK}Copied</div>`:`<button class="rcf-act" type="button" data-copy="${esc(a.id)}"${s==='busy'?' disabled':''}>${isConsole(a)?'Get pairing code':'Copy setup message'}</button>`}</div>`;}
const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
async function copy(id){const a=BB.agent&&BB.agent(id);if(!a||st[id]==='busy')return;st[id]='busy';paint();
 /* the wizard's reconnect path always mints a fresh one-time pairing code; the message carries it */
 let j=null;try{j=await BB.api('/api/agents/'+id+'/pairing','POST',{});if(!j||j.error||!j.code)throw Error(j&&j.error||'no code')}catch(e){st[id]='idle';paint();BB.toast&&BB.toast("Couldn't get a fresh code. Opening reconnect.");return BB.reconnect&&BB.reconnect(id)}
 extra[id]={code:j.code,expiresAt:j.expiresAt};
 if(isConsole(a)){st[id]='paste';return paint()}
 const msg=BB.setupMessage?BB.setupMessage(a,j.code):'';
 try{await navigator.clipboard.writeText(msg)}catch(e){st[id]='idle';paint();return BB.reconnect&&BB.reconnect(id)} // wizard has the select-and-copy fallback
 st[id]='copied';paint();setTimeout(()=>{st[id]='paste';paint()},reduce()?600:1600);}
let host=null;
function paint(list){if(!host)return;list=list||(BB.agents?BB.agents().filter(a=>BB.presence(a)==='reconnect'):[]);
 const ids=new Set(list.map(a=>a.id));Object.keys(st).forEach(k=>{if(!ids.has(k)){delete st[k];delete extra[k]}});
 const f=host.querySelector('.rcf-slot'),h=card(list);if(f._h===h)return;f._h=h;f.innerHTML=h;f.querySelectorAll('[data-copy]').forEach(b=>b.onclick=e=>{e.stopPropagation();copy(b.dataset.copy)});}
BB.reconnectFlag={card,paint,state:st,
 mount(){const stage=document.getElementById('stage'),crew=document.getElementById('crew');if(!stage||!crew||host)return;
  host=document.createElement('div');host.className='a-corner';host.innerHTML='<div class="rcf-slot" style="width:100%"></div>';stage.appendChild(host);host.appendChild(crew);
  const roster=document.getElementById('roster');if(roster)host.insertBefore(roster,crew);
  paint();BB.on&&BB.on(()=>paint());}};
})();
