/* P&V layer: presentation + accessibility only. No API calls are added or changed here. */
(function(){
const q=s=>document.querySelector(s),qa=s=>Array.from(document.querySelectorAll(s));
const raw=id=>(LS&&LS.agents||[]).find(x=>x.id===id);
const pres=id=>presenceOf(raw(id));
/* avatars: initials on identity color everywhere the old SVG doll was used */
function swapAv(root,sel,idOf,size){root.querySelectorAll(sel).forEach((el,i)=>{const a=byId[idOf(el,i)];if(a)el.innerHTML=avatarHTML(a,size)})}
/* ---- Team: presence chip + Reconnect per row ---- */
const _vs=vStubs;vStubs=function(){_vs();const rows=qa('#v-stubs .team-row');rows.forEach((row,i)=>{const a=agents[i];if(!a)return;const p=pres(a.id);row.dataset.presence=p;row.classList.toggle('reauth',p==='reconnect');row.classList.toggle('prepared',p==='prepared'||p==='waiting');
 const m=row.querySelector('.mini');if(m)m.innerHTML=avatarHTML(a,36);const name=row.querySelector('.team-worker b');if(name&&!row.querySelector('.pres'))name.insertAdjacentHTML('afterend',presenceChip(p));
 const now=row.querySelector('.team-worker .sum');if(now&&p!=='connected'&&p!=='revoked')now.textContent=a.now;
 const act=row.querySelector('.team-actions');if(act&&p==='reconnect'&&!act.querySelector('.reconnect'))act.insertAdjacentHTML('afterbegin','<button class="btn reconnect" data-reconnect="'+a.id+'" aria-label="Reconnect '+esc(a.name)+'">'+presenceIcon('reconnect')+'Reconnect</button>')});
 const v=q('#v-stubs h3');if(v&&!q('#v-stubs .eyebrow'))v.insertAdjacentHTML('beforebegin','<span class="eyebrow">Your team</span>')};
/* ---- Drawer: presence section + Reconnect ---- */
const _rd=renderDr;renderDr=function(){_rd();const a=byId[DR];if(!a)return;const p=pres(a.id),d=raw(a.id)||{},dr=q('#dr');const big=dr.querySelector('.big');if(big)big.innerHTML=figureSVG(a,{ghost:p==='prepared'||p==='waiting'});
 const x=dr.querySelector('.x');if(x){x.setAttribute('aria-label','Close details');x.textContent='×'}
 const stp=dr.querySelector('.stp');if(stp){stp.removeAttribute('style');stp.dataset.st=a.st}
 const h=dr.querySelector('h4');if(h&&!dr.querySelector('#dr-presence')){const c=d.connection||{};const when=c.failedAt||c.lastRenewedAt||c.authorizedAt||d.lastSeen;
  h.insertAdjacentHTML('beforebegin','<section id="dr-presence" class="dr-pres" data-presence="'+p+'" aria-label="Connection"><h4>Connection</h4>'+presenceChip(p)+'<p class="rl">'+({prepared:'Prepared in HQ. The bot has not connected yet.',waiting:'Waiting for this bot to authorize and report.',connected:'Authorized'+(c.status==='active'&&c.lastRenewedAt?' · renewed '+esc(new Date(c.lastRenewedAt).toLocaleString()):d.lastSeen?' · last report '+esc(new Date(d.lastSeen).toLocaleString()):''),reconnect:'Authorization dropped'+(when?' · '+esc(new Date(when).toLocaleString()):'')+'. Its work is paused until you reconnect.',revoked:'Access revoked by you.'}[p]||'')+'</p>'+(p==='reconnect'?'<button class="btn reconnect" data-reconnect="'+a.id+'">'+presenceIcon('reconnect')+'Reconnect '+esc(a.name)+'</button>':p==='prepared'||p==='waiting'?'<button class="btn" data-reconnect="'+a.id+'">Open connect steps</button>':'')+'</section>')}
 dr.querySelectorAll('.seg button').forEach(b=>b.setAttribute('aria-pressed',b.classList.contains('on')?'true':'false'))};
document.addEventListener('click',e=>{const b=e.target.closest('[data-reconnect]');if(b){e.preventDefault();reconnectBot(b.dataset.reconnect)}});
/* ---- approvals strip: identity avatars ---- */
const _rt=renderTray;renderTray=function(){_rt();qa('#strip .req').forEach((r,i)=>{const ap=G.approvals[i],av=r.querySelector('.rav');if(ap&&av)av.innerHTML=avatarHTML(ap.a,32)})};
const _vp=vPolicies;vPolicies=function(){_vp();qa('#v-policies .seg button').forEach(b=>b.setAttribute('aria-pressed',b.classList.contains('on')?'true':'false'))};
/* ---- dialogs: focus in, Tab trap, Escape closes, focus restored ---- */
let lastFocus=null;const FOC='a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])';
function openLayer(){const m=['#fmauth.on','#emodal.on','#modal.on','#dr.on'].map(s=>q(s)).find(Boolean);return m}
const mo=new MutationObserver(()=>{const l=openLayer();if(l&&!l.dataset.pvOpen){l.dataset.pvOpen='1';lastFocus=document.activeElement;if(l.id==='emodal'){const f=q('#epause');f&&f.focus()}else if(l.id==='dr'){const x=q('#dr .x');x&&setTimeout(()=>x.focus(),40)}}
 ['fmauth','emodal','modal','dr'].forEach(id=>{const e=document.getElementById(id);if(e&&!e.classList.contains('on')&&e.dataset.pvOpen){delete e.dataset.pvOpen;if(!openLayer()&&lastFocus&&document.contains(lastFocus))lastFocus.focus()}})});
['emodal','modal','dr'].forEach(id=>{const e=document.getElementById(id);if(e)mo.observe(e,{attributes:true,attributeFilter:['class']})});
setTimeout(()=>{const f=q('#fmauth');if(f)mo.observe(f,{attributes:true,attributeFilter:['class']})},0);
document.addEventListener('keydown',e=>{const l=openLayer();
 if(e.key==='Escape'){const ac=q('#acct[open]');if(ac){ac.open=false;q('#acctbtn').focus();return}if(!l||l.id==='fmauth')return;e.preventDefault();if(l.id==='modal'){const c=q('#linkclose')||q('#mc')||q('#mc2');c?c.click():l.classList.remove('on')}else if(l.id==='emodal'){q('#eclose').click()}else if(l.id==='dr'){closeDr()}return}
 if(e.key==='Tab'&&l&&l.id!=='dr'){const f=Array.from(l.querySelectorAll(FOC)).filter(x=>x.offsetParent!==null);if(!f.length)return;const first=f[0],last=f[f.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}else if(!l.contains(document.activeElement)){e.preventDefault();first.focus()}}
 /* A / D at the approval island (only when nothing is focused that takes text) */
 const t=e.target;if(!l&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&!(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable))){const card=q('#floor-approval');if(card&&card.style.display!=='none'&&q('#v-office.on')){const k=e.key.toLowerCase();const b=card.querySelector(k==='a'?'[data-d="approve"]':k==='d'?'[data-d="deny"]':null);if(b){e.preventDefault();b.click()}}}});
/* account menu: close on outside click */
document.addEventListener('click',e=>{const ac=q('#acct');if(ac&&ac.open&&!ac.contains(e.target))ac.open=false});
/* emergency icon opens the same dialog as before (existing #emer handler); mirror label for #emer2 */
q('#recap')&&q('#recap').setAttribute('hidden','');
/* short Connect label on phones; accessible name stays complete */
const ab=q('#addb');if(ab){const lbl=(ab.textContent||'').replace(/^\+\s*/,'').trim()||'Connect AI Employee';ab.setAttribute('aria-label',lbl);ab.innerHTML='<span aria-hidden="true">+</span> '+lbl.replace(/^(Connect)(.*)$/,'$1<span class="addb-long">$2</span>')}
/* repaint once with the new layer */
try{BRAND.fill(document);render();renderTray();}catch(e){}
})();
