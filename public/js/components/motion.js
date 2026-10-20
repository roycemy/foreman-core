/* Observed transitions only. First snapshot is a baseline; one pending action per bot. */
(function(){'use strict';const B=window.BB,esc=B.esc;
B.sleeping=a=>!!a&&a.revokedBy!=='owner'&&(!['connected'].includes(B.presence(a))||(a.providerId!=='muse'&&B.wentDark(a))||(B.isOffline&&B.isOffline(a)));
const arms=/<rect x="(-15|10)" y="-47" width="5" height="(21|16)" rx="2.5"( fill="[^"]+")\/>/g;
B.poseSVG=function(a,o){let svg=B.figureSVG(a,o);const m=o.motion||(B.pendingReqs().some(q=>q.agentId===a.id)?'approval':B.presence(a)==='reconnect'?'wave':B.tasks().some(t=>t.assignee===a.id&&t.status==='queued')?'paper':B.tasks().some(t=>t.assignee===a.id&&t.status==='running'&&B.tasks().some(c=>c.parentId===t.id&&['queued','running'].includes(c.status)))?'wait':''),angles={stretch:[160,-160],wave:[0,-150],approval:[0,-172],failed:[48,-48],blocked:[35,-35],collect:[0,-95],claim:[-35,35],paper:[-35,35]};
 if(angles[m])svg=svg.replace(arms,(v,x)=>'<g class="gesture-arm" transform="rotate('+angles[m][x==='-15'?0:1]+' '+(+x+2.5)+' -45)">'+v+'</g>');
 if(m==='look'||m==='wake')svg=svg.replace(/cy="-60.5"/g,'cy="-62.3"');
 if(o.lounge){svg=svg.replace('<rect x="-14" y="-47" width="28" height="30" rx="7" fill="#4A4845"/>','<path d="M-23 -3 Q-30 -24 -13 -39 Q0 -49 16 -36 Q31 -21 23 -3Z" fill="#C9BBA6"/>');svg=svg.replace(/<path d="M-12 -31 L12 -31 L10 -17 L-10 -17 Z"[^>]+\/><path d="M-12 -31 L12 -31 L11.6 -29.4 L-11.6 -29.4 Z"[^>]+\/><circle cx="0" cy="-24"[^>]+\/>/,'');}
 const icons={approval:'<rect x="17" y="-41" width="13" height="13" rx="2" fill="#E2452B"/><path d="M20 -41v-4a3.5 3.5 0 0 1 7 0v4" fill="none" stroke="#E2452B" stroke-width="2"/>',unlock:'<rect x="17" y="-41" width="13" height="13" rx="2" fill="#DAD8D1"/><path d="M20 -41v-4a3.5 3.5 0 0 1 7 0" fill="none" stroke="#5C5C57" stroke-width="2"/>',blocked:'<text x="15" y="-35" font-size="9" fill="#B53523">×</text>',limit:'<path d="M-17 -85h34" stroke="#E2452B" stroke-width="4"/>',spend:'<rect x="17" y="-42" width="16" height="11" rx="2" fill="#121212"/><path d="M18 -39h14" stroke="#fff"/>',wait:'<circle cx="23" cy="-44" r="7" fill="#fff" stroke="#5C5C57"/><path d="M23 -49v5l4 2" fill="none" stroke="#5C5C57"/>',paper:'<path d="M16 -49h15v20H16Z" fill="#fff" stroke="#b5b5ae"/><path d="M19 -44h8m-8 4h6" stroke="#b5b5ae"/>',route:'<path d="M16 -49h15v20H16Z" fill="#fff" stroke="#b5b5ae"/>',claim:'<path d="M-9 -34h18v15H-9Z" fill="#E6DCCB" stroke="#CDBFA8"/>',receipt:'<path d="M17 -50h14v23l-3 -2 -3 2 -3 -2 -5 2Z" fill="#fff" stroke="#B5B5AE"/><path d="M20 -45h8m-8 4h8" stroke="#B5B5AE"/>',wave:'<path d="M21 -58v28" stroke="#121212"/><path d="M21 -58h14v10H21Z" fill="#E2452B"/>'};
 const task=B.runningTask(a),grant=task&&task.sandboxGrant;if(grant&&Number.isFinite(grant.budgetCents)&&grant.budgetCents>0){const left=Math.max(0,Math.min(1,(grant.budgetCents-grant.spentCents)/grant.budgetCents));svg=svg.replace('</svg>','<path d="M-18 -87h36" stroke="#DAD8D1" stroke-width="3"/><path d="M-18 -87h'+(36*left)+'" stroke="'+(left?'#121212':'#E2452B')+'" stroke-width="3"/></svg>')}
 if(o.lounge&&a.providerId==='muse')svg=svg.replace('</svg>','<text x="0" y="15" text-anchor="middle" font-size="6" fill="#5C5C57" font-family="sans-serif">Wakes when you message it</text></svg>');
 if(icons[m])svg=svg.replace('</svg>',icons[m]+'</svg>');
 return svg;};
/* Isometric bed frame, pillow, blanket and this bot's own closed-eye face. */
B.bedSVG=function(a){const flag=B.presence(a)==='reconnect'?'<path d="M-36 -62v35" stroke="#121212"/><path d="M-36 -62h18v12h-18Z" fill="#E2452B"/>':'',c=B.cast(a).c,face=B.figureSVG(a,{asleep:true}).replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'');
 return '<svg class="figure sleep-bed" viewBox="-50 -86 100 100" aria-hidden="true"><defs><clipPath id="bedhead-'+esc(a.id)+'"><rect x="-15" y="-78" width="30" height="29"/></clipPath></defs><ellipse cx="1" cy="2" rx="40" ry="10" fill="#121212" opacity=".1"/><path d="M-36 -25L-4 -43L39 -18L7 0Z" fill="#E6DCCB"/><path d="M-36 -25L7 0V10L-36 -15Z" fill="#CDBFA8"/><path d="M7 0L39 -18V-8L7 10Z" fill="#B9AB93"/><path d="M-31 -28L-5 -43L31 -22L5 -7Z" fill="#F7F6F2"/><path d="M-28 -29L-9 -40L3 -33L-16 -22Z" fill="#fff" stroke="#DAD8D1"/><g transform="translate(-12 -28) rotate(-60) translate(0 58)" clip-path="url(#bedhead-'+esc(a.id)+')">'+face+'</g><path d="M-12 -22L12 -36L33 -23L9 -9Z" fill="'+c+'"/><path d="M-12 -22L9 -9V-3L-12 -16Z" fill="'+c+'" opacity=".8"/><path d="M9 -9L33 -23V-17L9 -3Z" fill="'+c+'" opacity=".65"/><text x="20" y="-49" fill="#8C8C86" font-size="12" font-family="sans-serif">z</text><text x="31" y="-59" fill="#8C8C86" font-size="9" font-family="sans-serif">z</text>'+flag+'</svg>';};
let prev=null;const seenEvents=new Set(),stretched=new Set();
function stamp(r,label,kind){let el=r.el.querySelector('.motion-mark');if(!el){el=document.createElement('span');el.className='motion-mark';r.el.appendChild(el)}el.textContent=label;el.dataset.kind=kind||'';el.setAttribute('aria-hidden','true');clearTimeout(r.markTimer);r.markTimer=setTimeout(()=>el.remove(),2600)}
function motion(id,kind,label){const r=B.F&&B.F[id];if(!r||document.hidden||B.offline)return;if(label)stamp(r,label,kind);if(B.reduced())return;if(kind==='typing'){r.el.classList.add('typing-burst');clearTimeout(r.typingTimer);r.typingTimer=setTimeout(()=>r.el.classList.remove('typing-burst'),2000);}r.pending=kind;if(r.motionTimer)return;
 const play=()=>{r.motion=r.pending;r.pending=null;B.floorDraw(r);r.el.classList.remove('motion-on');void r.el.offsetWidth;r.el.classList.add('motion-on');r.motionTimer=setTimeout(()=>{r.motion='';r.motionTimer=null;r.el.classList.remove('motion-on');B.floorDraw(r);if(r.pending)play()},600)};play();}
function pulseInbox(){if(B.reduced())return;document.querySelectorAll('[data-v=inbox],#inboxbtn').forEach(e=>{e.classList.remove('inbox-arrival');void e.offsetWidth;e.classList.add('inbox-arrival')})}
async function deliver(t){const r=B.F[t.assignee];if(!r||B.reduced()||document.hidden)return;if(r.away){r.receiptPending=t;return;}r.away=true;const home=(r.tp||[r.x,r.y]).slice();r.el.classList.add('carry-receipt');try{await B.sleep(500);await B.walkTo(r,B.TRAY_AT[0],B.TRAY_AT[1]);r.el.classList.remove('carry-receipt');const target=r.tp||home;await B.walkTo(r,target[0],target[1]);}finally{r.away=false;r.el.classList.remove('carry-receipt');B.floorDraw(r)}}
B.deliverReceipt=deliver;
function station(e){const x=String(e.action||(e.details&&e.details.action)||e.text||'').toLowerCase();return /mail|email/.test(x)?'sales':/card|spend|payment/.test(x)?'finance':/web|research|fetch/.test(x)?'ops':null}
const map=xs=>Object.fromEntries(xs.map(x=>[x.id,JSON.parse(JSON.stringify(x))]));
B.on(function(s){if(!s)return;const next={agents:map(s.agents||[]),tasks:map(s.tasks||[]),requests:map([...(s.requests||[]),...((B.cards&&B.cards.proposals)||[])])},events=s.events||[];
 if(!prev||B.offline){prev=next;events.forEach(e=>seenEvents.add(e.id));Object.values(next.agents).filter(a=>a.lastSeen).forEach(a=>stretched.add(a.id));return;}
 
 for(const a of Object.values(next.agents)){const old=prev.agents[a.id];
  if(a.lastSeen&&(!old||!old.lastSeen)&&(!a.firstSeenAt||Date.now()-Date.parse(a.firstSeenAt)<120000)&&!stretched.has(a.id)&&B.presence(a)==='connected'){stretched.add(a.id);motion(a.id,'stretch','Connected');}
  if(old&&B.sleeping(old)&&!B.sleeping(a))motion(a.id,'wake','Connected');
  if(old&&B.presence(old)!=='reconnect'&&B.presence(a)==='reconnect')motion(a.id,'wave','Reconnect');
  if(old&&old.status!=='revoked'&&a.status==='revoked'&&a.revokedBy==='owner')motion(a.id,'leave','Disconnected');
  const before=old&&old.sandboxGrant&&old.sandboxGrant.spentCents,after=a.sandboxGrant&&a.sandboxGrant.spentCents;if(before!=null&&after>before)motion(a.id,'spend','Budget updated');
 }
 for(const t of Object.values(next.tasks)){const old=prev.tasks[t.id];
  if(!old&&t.status==='queued')motion(t.assignee,t.routingReason?'route':'paper',t.routingReason?'Routed':'Queued');
  if(old&&old.status==='queued'&&t.status==='running')motion(t.assignee,'claim','Claimed');
  if(old&&old.status!==t.status&&t.status==='done'){motion(t.assignee,'receipt','Done');deliver(t);}
  if(old&&old.status!==t.status&&t.status==='failed')motion(t.assignee,'failed','Stopped');
  if(old&&t.sandboxGrant&&old.sandboxGrant&&t.sandboxGrant.spentCents>old.sandboxGrant.spentCents)motion(t.assignee,'spend','Sandbox budget updated');
  if(old&&old.progressAt!==t.progressAt&&t.status==='running'&&t.progressAt)motion(t.assignee,'typing');
 }
 for(const q of Object.values(next.requests)){const old=prev.requests[q.id];if(!old&&q.status==='pending'){motion(q.agentId||q.botId,'approval','Needs approval');pulseInbox()}
  if(old&&old.status!==q.status){if(q.status==='simulated')motion(q.agentId||q.botId,'spend','Sandbox card used');if(['approved','executed','simulated'].includes(q.status))motion(q.agentId||q.botId,'unlock','Approved');if(['denied','blocked'].includes(q.status))motion(q.agentId||q.botId,'blocked','Blocked');if(q.status==='limit_blocked')motion(q.agentId||q.botId,'limit','Budget limit');}
 }
 for(const e of events){if(!e.id||seenEvents.has(e.id))continue;seenEvents.add(e.id);const a=B.agent(e.agentId);if(!a)continue;
  if(!e.presenceOnly)for(const b of B.agents())if(b.id!==a.id&&!B.runningTask(b)&&!B.sleeping(b))motion(b.id,'look');
  if(e.kind==='TOOL_USED'||e.type==='step'){motion(a.id,'typing');const r=B.F[a.id];if(r&&r.tp&&B.workCycle)B.workCycle(r,a,r.tp,e.id,station(e));}
  if((e.type==='wake_sent'&&e.taskId)||e.kind==='INTERACTION'&&!e.presenceOnly)motion(a.id,'wake',e.type==='wake_sent'?'Wake sent':null);
  if(e.kind==='WAITING')motion(a.id,'wait','Waiting');
  if(e.kind==='BLOCKED'&&/limit_(job|daily)/.test(String(e.code||e.reason||e.text)))motion(a.id,'limit','Budget limit');
 }
 for(const t of Object.values(next.tasks))if(t.status==='running'&&Object.values(next.tasks).some(c=>c.parentId===t.id&&['queued','running'].includes(c.status))){const r=B.F[t.assignee];if(r&&!r.el.querySelector('.motion-mark'))stamp(r,'Waiting on teammate','wait')}
 for(const r of Object.values(B.F||{})){if(r.receiptPending&&!r.away){const t=r.receiptPending;r.receiptPending=null;deliver(t);}else if(r.toolPending&&!r.away){const x=r.toolPending;r.toolPending=null;const a=B.agent(r.id);if(a&&B.workCycle)B.workCycle(r,a,r.tp,x.eventId,x.station);}}
 prev=next;
});B.motion=motion;
})();
