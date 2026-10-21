/* Receipts that ship. Call BB.shipReceipt(task) when a task flips to done/failed (diff in BB.on).
   Flight: from the bot's figure on the floor to the Receipts link (desktop nav) or Receipts tab (phone). 800ms ease-out. */
(function(){const BB=window.BB=window.BB||{};const KEY='alter.receipts.seen';
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
BB.receiptCard=(t,bot)=>`<div class="rship-who"><span class="av" style="--av:${bot.color}">${esc(bot.ini)}</span>${esc(bot.name)}</div><b>${esc(t.title)}</b><p>${esc(t.status==='failed'?"Didn't finish":(String(t.result||'Done').split('\n')[0]))}</p><div class="rship-foot"><span>Receipt</span><span>${t.modelCostUsd!=null?'$'+Number(t.modelCostUsd).toFixed(2):'–'}</span></div>`;
function target(){const ph=innerWidth<=760;return document.querySelector(ph?'#tabs a[data-v=receipts]':'#nav a[data-v=receipts]')}
function newIds(){try{return JSON.parse(sessionStorage.getItem('alter.receipts.new')||'[]')}catch(e){return []}}
function setBadge(){const n=newIds().length;document.querySelectorAll('#nav a[data-v=receipts],#tabs a[data-v=receipts]').forEach(a=>{let b=a.querySelector('.nnew');if(!n){b&&b.remove();return}if(!b){b=document.createElement('span');b.className='nnew';a.appendChild(b)}b.textContent=n+' new';a.setAttribute('aria-label','Receipts, '+n+' new')})}
BB.receiptsBadge=setBadge;
BB.shipReceipt=function(t){const ids=newIds();if(!ids.includes(t.id)){ids.push(t.id);sessionStorage.setItem('alter.receipts.new',JSON.stringify(ids))}
 const a=BB.agent&&BB.agent(t.assignee)||{name:'A bot'},bot={name:a.name,ini:BB.initials?BB.initials(a.name):'?',color:BB.avColor?BB.avColor(a):'#121212'};
 const from=document.querySelector('.ch[data-id="'+t.assignee+'"]'),to=target();
 if(!from||!to||matchMedia('(prefers-reduced-motion: reduce)').matches||document.hidden){setBadge();return}
 const c=document.createElement('div');c.className='rship';c.setAttribute('aria-hidden','true');c.innerHTML=BB.receiptCard(t,bot);document.body.appendChild(c);
 const ph=innerWidth<=760,f=from.getBoundingClientRect(),g=to.getBoundingClientRect(),w=232,h=c.offsetHeight;
 const x0=f.left+f.width/2-w/2,y0=f.top-h-60,x1=g.left+g.width/2-w/2,y1=g.top+g.height/2-h/2;
 // arc: rise 0-25% while full size, then curve to the tab and shrink to a 12% chip
 const k=[{transform:`translate(${x0}px,${y0+10}px) scale(.96)`,opacity:0},{transform:`translate(${x0}px,${y0}px) scale(1)`,opacity:1,offset:.18},
  {transform:`translate(${(x0+x1)/2}px,${ph?(y0+y1)/2:y0-10}px) scale(.62)`,opacity:1,offset:.6},{transform:`translate(${x1}px,${y1}px) scale(.12)`,opacity:.2}];
 c.style.left='0';c.style.top='0';c.animate(k,{duration:800,easing:'cubic-bezier(.22,.9,.32,1)',fill:'forwards'}).onfinish=()=>{c.remove();setBadge();to.classList.add('catch');setTimeout(()=>to.classList.remove('catch'),260)};};
/* opening Receipts: clear the badge, mark rows new for this visit, settle the wash after 2.4s */
BB.markNewRows=function(root){const ids=newIds();sessionStorage.removeItem('alter.receipts.new');setBadge();
 (root||document).querySelectorAll('a[href^="#receipts/"]').forEach(r=>{if(ids.includes(r.getAttribute('href').split('/')[1])){r.classList.add('is-new');setTimeout(()=>r.classList.add('settled'),2400)}});};
})();
