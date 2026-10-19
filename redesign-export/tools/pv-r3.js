/* Round 3: calm top bar, one request surface per screen, mobile bottom sheet + collapsible roster. Presentation only: no API calls, ids and handlers unchanged. */
(function(){
const q=s=>document.querySelector(s);
/* ---- 1. #sum becomes one quiet chip; the full summary stays for screen readers and as a tooltip; spend moves to the account menu ---- */
function compactSum(){const s=q('#sum');if(!s||s.dataset.r3===s.innerHTML)return;const full=s.textContent.replace(/\s+/g,' ').trim();if(!full||/unreachable/i.test(full))return;
 const c=counts(),n=G.approvals.length||c.needs;let chip;
 if(n)chip='<a href="#approvals" class="needs-chip" aria-label="'+n+' request'+(n>1?'s':'')+' need you"><i aria-hidden="true"></i>Needs you <b>'+n+'</b></a>';
 else if(c.blocked)chip='<span class="calm-chip blocked"><i aria-hidden="true"></i>'+c.blocked+' blocked</span>';
 else chip='<span class="calm-chip"><i aria-hidden="true"></i>'+(c.working?c.working+' working':'All clear')+'</span>';
 s.innerHTML=chip+'<span class="sr-only">'+esc(full)+'</span>';s.title=full;s.dataset.r3=s.innerHTML;
 const m=q('#acctmenu');if(m){let t=q('#acct-today');if(!t){t=document.createElement('p');t.id='acct-today';t.className='acct-today';m.insertBefore(t,m.firstChild)}
  const sp=agents.reduce((a,b)=>a+(b.spent||0),0),dl=agents.reduce((a,b)=>a+((b.limits&&b.limits.dailyCents!=null)?b.limits.dailyCents:0),0);t.innerHTML='<span>Today</span>'+money(sp)+(dl?' of '+money(dl/100):'')+' spent · '+(G.completedToday||0)+' done'}}
const _rf=refresh;refresh=function(){_rf.apply(this,arguments);compactSum()};compactSum();
const ab=q('#addb');if(ab&&!ab.querySelector('.addb-txt')){const l=ab.getAttribute('aria-label')||'Connect AI Employee';ab.setAttribute('aria-label',l);ab.innerHTML='<span aria-hidden="true">+</span><span class="addb-txt">Connect</span>'}
/* ---- 2. island card = bottom sheet on phones: one-line peek that expands to Approve once / Deny ---- */
const mob=()=>matchMedia('(max-width:759px)').matches;
function sheet(card){if(!card||card.querySelector('.fa-peek'))return;const body=card.querySelector('.fa-body'),txt=card.querySelector('.fa-text'),av=card.querySelector('.fa-who .av');if(!body||!txt)return;
 body.id='fa-body';const line=txt.textContent.split(' · ')[0].trim();
 const b=document.createElement('button');b.type='button';b.className='fa-peek';b.setAttribute('aria-controls','fa-body');b.setAttribute('aria-expanded',card.classList.contains('open')?'true':'false');
 const who=card.querySelector('.fa-who b');b.dataset.line=line;b.dataset.who=who?who.textContent:line;const open=card.classList.contains('open');b.innerHTML=(av?av.outerHTML:'')+'<span class="fa-pk-t">'+esc(open?b.dataset.who:line)+'</span><span class="fa-pk-go">'+(card.classList.contains('open')?'Close':'Review')+'</span>';
 b.onclick=()=>setOpen(card,!card.classList.contains('open'));card.insertBefore(b,card.firstChild)}
function setOpen(card,on){card.classList.toggle('open',on);const b=card.querySelector('.fa-peek');if(b){b.setAttribute('aria-expanded',on?'true':'false');const g=b.querySelector('.fa-pk-go');if(g)g.textContent=on?'Close':'Review';const tt=b.querySelector('.fa-pk-t');if(tt)tt.textContent=on?b.dataset.who:b.dataset.line}
 if(on&&mob()){const a=card.querySelector('[data-d="approve"]');a&&setTimeout(()=>a.focus({preventScroll:true}),60)}}
window.HQ_SHEET={open:()=>{const c=q('#floor-approval');if(c)setOpen(c,true)},close:()=>{const c=q('#floor-approval');if(c)setOpen(c,false)}};
const vo=q('#v-office');let cardObs=null;
function watchCard(){const c=q('#floor-approval');if(!c||c.dataset.r3)return;c.dataset.r3='1';sheet(c);cardObs=new MutationObserver(()=>sheet(c));cardObs.observe(c,{childList:true})}
if(vo){new MutationObserver(watchCard).observe(vo,{childList:true});watchCard()}
/* Needs-you chip: on HQ it opens the island card instead of leaving the floor */
document.addEventListener('click',e=>{const a=e.target.closest('#sum .needs-chip');if(!a)return;const c=q('#floor-approval');
 if(q('#v-office.on')&&c&&c.style.display!=='none'){e.preventDefault();setOpen(c,true);if(!mob()){const b=c.querySelector('[data-d="approve"]');b&&b.focus()}}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const c=q('#floor-approval.open');if(c&&mob()&&!q('#dr.on,#modal.on,#emodal.on')){setOpen(c,false);const b=c.querySelector('.fa-peek');b&&b.focus()}}});
/* ---- 3. roster collapses on phones (header toggles) ---- */
const fw=()=>q('#floor-workers');
function rosterHead(){const r=fw();if(!r)return;const compact=!!q('#v-office.compact');const h0=r.querySelector('.fw-h');if(!compact){if(h0){h0.removeAttribute('role');h0.removeAttribute('tabindex');h0.removeAttribute('aria-expanded')}return}if(!r.dataset.r3){r.dataset.r3='1'}/* 3.2: roster starts open on phones and fills the space under the floor */const h=r.querySelector('.fw-h');if(h&&!h.hasAttribute('role')){h.setAttribute('role','button');h.tabIndex=0;h.setAttribute('aria-controls','floor-workers')}
 if(h)h.setAttribute('aria-expanded',r.classList.contains('r3-collapsed')?'false':'true')}
function toggleRoster(){const r=fw();if(!r)return;r.classList.toggle('r3-collapsed');rosterHead()}
document.addEventListener('click',e=>{if(e.target.closest('#floor-workers .fw-h'))toggleRoster()});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.closest&&e.target.closest('#floor-workers .fw-h')){e.preventDefault();toggleRoster()}});
const startRoster=()=>{const r=fw();if(!r)return setTimeout(startRoster,200);rosterHead();new MutationObserver(rosterHead).observe(r,{childList:true})};startRoster();
/* sheet sits above the queue bar */
const gb=q('#goalbar');const setGH=()=>{const r=document.documentElement.style;r.setProperty('--goal-h',(gb&&gb.offsetParent?gb.offsetHeight:0)+'px');const pk=q('#floor-approval .fa-peek');if(pk&&pk.offsetHeight)r.setProperty('--sheet-h',(pk.offsetHeight+2)+'px')};addEventListener('resize',()=>{setGH();rosterHead()});setGH();setTimeout(setGH,500);
/* phone: pull the outermost room signs inside the zoomed, centred stage (desktop anchors unchanged) */
const PHONE_SIGNS={sales:[38,70,8],marketing:[70,4,8]};
function phoneSigns(){const F=window.HQ_FLOOR;if(!F)return;const on=mob();Object.entries(PHONE_SIGNS).forEach(([k,v])=>{const e=q('#floor .zone-sign[data-room="'+k+'"]');if(!e)return;
 if(!e.dataset.origLeft){e.dataset.origLeft=e.style.left;e.dataset.origTop=e.style.top}
 if(on){const p=F.W2P(v[0],v[1]);e.style.left=p[0]+'%';e.style.top=(p[1]-v[2]*5.2/750*100).toFixed(2)+'%';e.dataset.phone='1'}else{e.style.left=e.dataset.origLeft;e.style.top=e.dataset.origTop;delete e.dataset.phone}})}
const fl=q('#floor');if(fl&&fl.parentElement){const w=fl.parentElement;['pointerdown','touchstart','wheel'].forEach(ev=>w.addEventListener(ev,()=>{w.dataset.panned='1'},{passive:true}))}
if(fl){phoneSigns();new MutationObserver(phoneSigns).observe(fl,{childList:true});addEventListener('resize',phoneSigns)}
/* ---- 4. nav: short labels on phones so nothing is cut off ---- */
const SHORT={cards:'Cards',policies:'Rules'};
function shortNav(){document.querySelectorAll('#nav a[data-v]').forEach(a=>{const s=SHORT[a.dataset.v];if(s&&!a.querySelector('.nl-long')){const t=a.textContent.trim();a.innerHTML='<span class="nl-long">'+esc(t)+'</span><span class="nl-short" aria-hidden="true">'+s+'</span>';a.setAttribute('aria-label',t)}})}
const nav=q('#nav');if(nav){shortNav();new MutationObserver(shortNav).observe(nav,{childList:true});
 const keepOn=()=>{const a=nav.querySelector('a.on');if(a&&nav.scrollWidth>nav.clientWidth)a.scrollIntoView({block:'nearest',inline:'nearest'})};addEventListener('hashchange',()=>setTimeout(keepOn,60))}

/* ---- 3.2: short plain copy. Presentation only; same facts. Never touches #v-cards (SYNTHETIC ONLY) or OAuth pages. ---- */
const TRIM=[
 ['Give your AI employees work here. Each task shows who did it and what came back. Employees can also pass work to each other.','Give work to your team. See who did it and what came back.'],
 ['These are enforced by the gateway on every call. AUTO runs, ASK pauses until you approve, NEVER is refused.','Checked on every call. Auto runs · Ask waits for you · Never is blocked.'],
 ['Money: review spend proposals in Money. Payments are not connected.','Money: proposals wait in Money. No payments connected.'],
 ['Messages: recipient approvals are not connected yet. Existing permissions below cover workspace actions, not email sending.','Messages: not connected yet. Rules below cover workspace actions only.'],
 ['Off switch: pause the workspace or revoke a worker in HQ. This blocks gateway actions, not activity outside ','Off switch: pause or revoke in HQ. Stops gateway actions, not activity outside '],
 ['Review spend proposals here. Approve records your decision only. It cannot charge a card, launch ads or pay a vendor yet.','Approving records your decision. Nothing is charged yet.'],
 ['Notifications: in-app only. Phone push is not connected.','In-app notifications only.'],
 ['Gateway cents, per action and per day. These do not cap xAI/Meta or other provider billing. Empty means no gateway limit.','Cents per action and per day. Blank means no limit. Provider billing is not capped.'],
 ['Owner-created test proposal. No bot activity is implied.','A test proposal you create. No bot did this.']];
function trimText(root){const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){let t=n.nodeValue;if(t.length<30)continue;let o=t;for(const [a,b] of TRIM)if(t.includes(a))t=t.split(a).join(b);if(t!==o)n.nodeValue=t}
 root.querySelectorAll('.team-metrics:not([data-r32])').forEach(m=>{const t=m.innerText,num=re=>{const x=t.match(re);return x?x[1]:null};const done=+num(/(\d+) completed/)||0,bl=+num(/(\d+) blocked/)||0,sp=num(/today:\s*([^·\n]+?)\s*(?:·|$)/m),lim=num(/Daily limit:\s*([^\n]+)/);if(sp==null)return;
  const parts=[sp.trim()+' today',lim&&!/none/i.test(lim)?'limit '+lim.trim():'no daily limit'];if(done)parts.push(done+' done');if(bl)parts.push(bl+' blocked');m.dataset.r32='1';m.title=t.replace(/\n/g,' · ');m.textContent=parts.join(' · ')})}
const vroot=(q('#v-office')||{}).parentElement;
if(vroot){let raf=0;const run=()=>{raf=0;vroot.querySelectorAll('.view:not(#v-office)').forEach(v=>{if(v.offsetParent!==null&&!v.querySelector('.synth'))trimText(v)})};run();
 new MutationObserver(ms=>{if(!raf&&ms.some(m=>!(m.target.closest&&m.target.closest('#v-office'))))raf=requestAnimationFrame(run)}).observe(vroot,{childList:true,subtree:true});addEventListener('hashchange',()=>setTimeout(run,50))}

/* 3.3: no shouted labels. Sentence-case the legacy all-caps status labels (strip, island badge). SYNTHETIC ONLY is left as is. */
const CAPS=/^(NEEDS YOU|NEEDS APPROVAL|WAITING|ARRIVALS|APPROVALS?)\b/;
function capsFix(root){if(!root)return;const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){const t=n.nodeValue;if(!/[A-Z]{4}/.test(t)||n.parentElement.closest('.synth'))continue;if(CAPS.test(t.trim())){const v=t.toLowerCase().replace(/^(\s*)(\w)/,(m,a,b)=>a+b.toUpperCase());if(v!==t)n.nodeValue=v}}}
{let raf=0;const run=()=>{raf=0;['#strip','#floor','.fa-top'].forEach(s=>document.querySelectorAll(s).forEach(capsFix))};run();new MutationObserver(()=>{if(!raf)raf=requestAnimationFrame(run)}).observe(document.body,{childList:true,subtree:true})}
})();
