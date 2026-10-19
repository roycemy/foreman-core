/* Artwork only. Keep owner records, permissions and worker activity authoritative.
   Porcelain & Vermilion floor: SVG environment (/hq/floor.svg), per-employee figures, presence-aware placement.
   Same globals and hooks as the previous diorama layer: #floor #deskl #chl #worker-labels .zone-sign #ct-{room}
   #diorama-tools #zoom-in #zoom-out #floor-workers [data-worker] #floor-approval [data-r][data-d]. */
(function(){
const ASSET='/hq';
/* world -> % of the floor art (viewBox 60 40 1320 750, iso K=5.2, origin 720,96) */
const PJ={K:5.2,OX:720,OY:96,X0:60,Y0:40,W:1320,H:750},ASPECT=PJ.W/PJ.H;
const W2P=(x,y)=>[+(((PJ.OX+(x-y)*PJ.K)-PJ.X0)/PJ.W*100).toFixed(2),+(((PJ.OY+(x+y)*PJ.K*.5)-PJ.Y0)/PJ.H*100).toFixed(2)];
const P2W=(px,py)=>{const sx=px/100*PJ.W+PJ.X0,sy=py/100*PJ.H+PJ.Y0,d=(sx-PJ.OX)/PJ.K,s=2*(sy-PJ.OY)/PJ.K;return [(s+d)/2,(s-d)/2]};
const SEATW={finance:[[12,18.6],[26,18.6],[12,32.6],[26,32.6]],marketing:[[60,16.6],[74,16.6],[88,16.6],[60,31.6]],sales:[[12,64.6],[26,64.6],[12,80.6],[26,80.6]],ops:[[58,59.6],[72,59.6],[58,73.6],[72,73.6]],lounge:[[95,57.5],[100,57.5],[95,68],[100,68]]};
SEATW.support=SEATW.sales;
const BOXW={finance:[4,4,42,42],marketing:[50,4,116,40],sales:[4,50,40,116],support:[4,50,40,116],ops:[50,48,82,82],lounge:[88,48,116,78]};
const POINTS={};for(const k in SEATW)POINTS[k]=SEATW[k].map(p=>W2P(...p));
const ISLAND_SLOTS=[[95,109],[99.5,109],[104,109]].map(p=>W2P(...p));
const ARRIVALS=[[47,104],[53,108],[47,112],[55,114],[51,100],[57,110]].map(p=>W2P(...p));
const SIGNS={finance:[26,4,8],marketing:[100,4,8],sales:[4,104,8],ops:[76,48,8],lounge:[104,48,3]};
const signPct=(x,y,z)=>{const p=W2P(x,y);return [p[0],+(p[1]-z*PJ.K/PJ.H*100).toFixed(2)]};
/* walk graph in world coordinates: rooms connect through their doors to corridor hubs */
const NODES={fin_in:[22,36],fin_door:[22,45],fin_in2:[36,26],fin_door2:[46,26],mkt_in:[80,34],mkt_door:[80,45],sal_in:[34,62],sal_door:[46,62],ops_in:[66,77],ops_door:[66,86],ops_in2:[77,64],ops_door2:[86,64],hub_w:[46,45],hub_e:[86,45],hub_s:[46,86],hub_se:[86,86],lng:[90,62],isl:[88,109],arr:[50,96]};
const EDGES=[['fin_in','fin_door'],['fin_door','hub_w'],['fin_in2','fin_door2'],['fin_door2','hub_w'],['mkt_in','mkt_door'],['mkt_door','hub_w'],['mkt_door','hub_e'],['sal_in','sal_door'],['sal_door','hub_w'],['sal_door','hub_s'],['ops_in','ops_door'],['ops_door','hub_s'],['ops_door','hub_se'],['ops_in2','ops_door2'],['ops_door2','hub_e'],['ops_door2','hub_se'],['hub_e','lng'],['hub_se','lng'],['hub_se','isl'],['hub_s','isl'],['hub_s','arr'],['arr','isl']];
const ENTRY={finance:['fin_in','fin_in2'],marketing:['mkt_in'],sales:['sal_in'],support:['sal_in'],ops:['ops_in','ops_in2'],lounge:['lng'],island:['isl'],arrivals:['arr']};
const zoneOf=([x,y])=>{for(const k of ['finance','marketing','sales','ops','lounge']){const b=BOXW[k];if(x>=b[0]-.5&&x<=b[2]+.5&&y>=b[1]-.5&&y<=b[3]+.5)return k}if(x>86&&y>86)return 'island';if(y>92&&x<64)return 'arrivals';return null};
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function route(from,to){/* returns world waypoints */const zf=zoneOf(from),zt=zoneOf(to);if(zf&&zf===zt)return [to];
 const near=p=>Object.keys(NODES).filter(k=>/hub|door|lng|isl|arr/.test(k)).sort((a,b)=>dist(NODES[a],p)-dist(NODES[b],p))[0];
 const starts=zf?ENTRY[zf]:[near(from)],ends=zt?ENTRY[zt]:[near(to)];
 const adj={};EDGES.forEach(([a,b])=>{(adj[a]=adj[a]||[]).push(b);(adj[b]=adj[b]||[]).push(a)});
 let best=null;for(const s of starts)for(const e of ends){const D={},Pv={},Q=new Set(Object.keys(NODES));Object.keys(NODES).forEach(k=>D[k]=1e9);D[s]=dist(from,NODES[s]);
  while(Q.size){let u=null;Q.forEach(k=>{if(u===null||D[k]<D[u])u=k});Q.delete(u);if(u===e)break;(adj[u]||[]).forEach(v=>{const d=D[u]+dist(NODES[u],NODES[v]);if(d<D[v]){D[v]=d;Pv[v]=u}})}
  const tot=D[e]+dist(NODES[e],to);if(!best||tot<best.t){const path=[];let k=e;while(k){path.unshift(NODES[k]);k=Pv[k]}best={t:tot,path}}}
 return best?[...best.path,to]:[to]}
const oldLayout=setLayout;setLayout=function(){oldLayout();MOB=innerWidth<760;
 const rect=b=>{const pts=[W2P(b[0],b[1]),W2P(b[2],b[1]),W2P(b[2],b[3]),W2P(b[0],b[3])],xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)}};
 ROOMS={sales:{n:'OUTREACH CENTER',...rect(BOXW.sales)},support:{n:'OUTREACH CENTER',...rect(BOXW.sales)},marketing:{n:'CREATIVE / MARKETING',...rect(BOXW.marketing)},ops:{n:'EXECUTION CENTER',...rect(BOXW.ops)},finance:{n:'RESEARCH CENTER',...rect(BOXW.finance)},lounge:{n:'LOUNGE',...rect(BOXW.lounge)}};
 MEET=rect([60,20,98,37]);LOUNGE=ROOMS.lounge;APPR=rect([90,90,106,106]);SLS=SL;MSLOT=[W2P(64,30),W2P(80,30),W2P(72,24)];ASLOT=ISLAND_SLOTS;DOOR=W2P(50,96);};
/* ---------- presence: derived from the server's grant state (PR #4: agent.connection), never from a stale heartbeat ---------- */
window.presenceOf=function(d){if(!d)return 'prepared';if(d.status==='revoked')return 'revoked';const c=d.connection,seen=!!(d.lastSeen||d.state);
 if(c&&c.status){if(c.status==='needs_reauth')return 'reconnect';if(c.status==='revoked')return 'revoked';if(c.status==='not_applicable')return 'connected';
  if(c.status==='active')return seen?'connected':'waiting';if(c.status==='verification_pending')return 'waiting';
  if(c.status==='awaiting_bot')return window.__linkWaiting===d.id?'waiting':'prepared'}
 return seen?'connected':(window.__linkWaiting===d.id?'waiting':'prepared')};
const rawOf=a=>LS&&LS.agents?LS.agents.find(x=>x.id===a.id):null;
const presence=a=>presenceOf(rawOf(a));
window.PRESENCE_COPY={prepared:'Prepared',waiting:'Waiting for bot',connected:'Connected',reconnect:'Reconnect needed',revoked:'Access revoked'};
window.presenceIcon=function(p){return p==='reconnect'?'<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6.6 9.4 9.4 6.6M4.9 8.2 3.6 9.5a2.3 2.3 0 0 0 3.2 3.2l1.3-1.3M11.1 7.8l1.3-1.3a2.3 2.3 0 0 0-3.2-3.2L7.9 4.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M2.5 2.5l2 2M13.5 13.5l-2-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
 :p==='connected'?'<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="4" fill="currentColor"/></svg>'
 :p==='waiting'?'<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.5 2.5"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/></svg>'
 :'<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 2"/></svg>'};
window.presenceChip=function(p){return '<span class="pres" data-presence="'+p+'">'+presenceIcon(p)+(PRESENCE_COPY[p]||p)+'</span>'};
/* ---------- identity: every employee is visibly distinct (provider silhouette + color + initials) ---------- */
const ID={grok:{c:'#121212',ink:'#FFFFFF',body:'block',head:'square',face:'visor',visor:'#E2452B',acc:'antenna'},
 instinct:{c:'#C8361D',ink:'#FFFFFF',body:'capsule',head:'round',acc:'visorband',visor:'#FFFFFF'},
 muse:{c:'#2F5DA8',ink:'#FFFFFF',body:'bell',head:'round',acc:'halo',visor:'#FFFFFF'}};
const EXTRA=[{c:'#1C7A4A',ink:'#FFFFFF',body:'tri',head:'wide',face:'visor',visor:'#F4F4F1',acc:'ears'},{c:'#7A5A00',ink:'#FFFFFF',body:'block',head:'hex',visor:'#FFFFFF',acc:'cap'},{c:'#5C5C57',ink:'#FFFFFF',body:'capsule',head:'square',face:'visor',visor:'#FFFFFF',acc:'antenna'},{c:'#2F5DA8',ink:'#FFFFFF',body:'tri',head:'round',visor:'#FFFFFF',acc:'visorband'}];
const hash=s=>{let h=0;for(const ch of String(s))h=(h*31+ch.charCodeAt(0))>>>0;return h};
window.identityOf=function(a){const d=rawOf(a)||{};const k=(d.providerId||'').toLowerCase();return ID[k]||EXTRA[hash(a.id||a.name)%EXTRA.length]};
window.initialsOf=n=>String(n||'?').split(/\s+/).filter(Boolean).map(w=>w[0]).join('').slice(0,2).toUpperCase()||'?';
window.figureSVG=function(a,opts){opts=opts||{};const e=identityOf(a),ghost=!!opts.ghost,walking=!!opts.walking,f=1.6,ini=initialsOf(a.name);
 const sx=0,sy=0,bw=17*f,bh=20*f,by=sy-6*f-bh,hy=by-8*f,hr=7.5*f,gs='#5C5C57';
 const fill=ghost?'none':e.c,st=ghost?`stroke="${gs}" stroke-width="${1.6*f}" stroke-dasharray="${3*f} ${2.5*f}"`:'';
 let g=`<ellipse cx="0" cy="0" rx="${10*f}" ry="${4.2*f}" fill="#1A1A18" opacity="${ghost?.18:.4}"/>`;
 const lc=ghost?'none':'#121212';
 g+=walking?`<rect class="leg l" x="${-6*f}" y="${-8*f}" width="${4*f}" height="${8*f}" rx="${2*f}" fill="${lc}"/><rect class="leg r" x="${2*f}" y="${-8*f}" width="${4*f}" height="${8*f}" rx="${2*f}" fill="${lc}"/>`:(ghost?'':`<rect x="${-5.5*f}" y="${-8*f}" width="${4*f}" height="${8*f}" rx="${2*f}" fill="${lc}"/><rect x="${1.5*f}" y="${-8*f}" width="${4*f}" height="${8*f}" rx="${2*f}" fill="${lc}"/>`);
 if(e.body==='capsule')g+=`<rect x="${-bw/2}" y="${by}" width="${bw}" height="${bh}" rx="${bw/2}" fill="${fill}" ${st}/>`;
 else if(e.body==='block')g+=`<rect x="${-bw/2}" y="${by}" width="${bw}" height="${bh}" rx="${4*f}" fill="${fill}" ${st}/>`;
 else if(e.body==='bell')g+=`<path d="M${-bw/2} ${by+bh} Q${-bw/2} ${by} 0 ${by} Q${bw/2} ${by} ${bw/2} ${by+bh} Z" fill="${fill}" ${st}/>`;
 else g+=`<path d="M${-bw/2-f} ${by+bh} L${-bw/4} ${by+2*f} Q0 ${by-f} ${bw/4} ${by+2*f} L${bw/2+f} ${by+bh} Z" fill="${fill}" ${st}/>`;
 if(!ghost)g+=`<rect x="${-bw/2+2.5*f}" y="${by+3*f}" width="${3*f}" height="${bh-8*f}" rx="${1.5*f}" fill="#FFFFFF" opacity=".22"/>`;
 g+=`<text x="0" y="${by+bh*.66}" text-anchor="middle" font-family="Geist Mono, ui-monospace, monospace" font-weight="600" font-size="${8.5*f}" fill="${ghost?gs:e.ink}">${esc(ini)}</text>`;
 const hf=ghost?'none':e.c;
 if(e.head==='round')g+=`<circle cx="0" cy="${hy}" r="${hr}" fill="${hf}" ${st}/>`;
 else if(e.head==='square')g+=`<rect x="${-hr}" y="${hy-hr}" width="${2*hr}" height="${2*hr}" rx="${3*f}" fill="${hf}" ${st}/>`;
 else if(e.head==='wide')g+=`<rect x="${-hr*1.25}" y="${hy-hr*.85}" width="${2.5*hr}" height="${1.7*hr}" rx="${hr*.85}" fill="${hf}" ${st}/>`;
 else g+=`<polygon points="${[0,1,2,3,4,5].map(i=>`${(hr*Math.cos(Math.PI/3*i+Math.PI/6)).toFixed(1)},${(hy+hr*Math.sin(Math.PI/3*i+Math.PI/6)).toFixed(1)}`).join(' ')}" fill="${hf}" ${st}/>`;
 if(!ghost){g+=e.face==='visor'?`<rect x="${-hr*.75}" y="${hy-2*f}" width="${hr*1.5}" height="${4*f}" rx="${2*f}" fill="${e.visor}"/>`:`<circle cx="${-2.6*f}" cy="${hy}" r="${1.5*f}" fill="${e.visor}"/><circle cx="${2.6*f}" cy="${hy}" r="${1.5*f}" fill="${e.visor}"/>`;
  if(e.acc==='antenna')g+=`<line x1="0" y1="${hy-hr}" x2="0" y2="${hy-hr-6*f}" stroke="${e.c}" stroke-width="${1.6*f}"/><circle cx="0" cy="${hy-hr-7*f}" r="${2.3*f}" fill="${e.c}"/>`;
  else if(e.acc==='halo')g+=`<ellipse cx="0" cy="${hy-hr-3*f}" rx="${hr*.9}" ry="${2.4*f}" fill="none" stroke="#121212" stroke-width="${1.8*f}"/>`;
  else if(e.acc==='ears')g+=`<circle cx="${-hr*1.1}" cy="${hy-hr*.6}" r="${2.8*f}" fill="${e.c}"/><circle cx="${hr*1.1}" cy="${hy-hr*.6}" r="${2.8*f}" fill="${e.c}"/>`;
  else if(e.acc==='cap')g+=`<path d="M${-hr} ${hy-hr*.35} Q0 ${hy-hr*1.9} ${hr} ${hy-hr*.35} L${hr+4*f} ${hy-hr*.35} Z" fill="#121212"/>`;
  else if(e.acc==='visorband')g+=`<rect x="${-hr-f}" y="${hy-hr-f}" width="${2*hr+2*f}" height="${3*f}" rx="${1.5*f}" fill="#121212"/>`;}
 if(opts.carry)g+=`<g transform="rotate(-10 ${bw/2+3*f} ${by+8*f})"><rect x="${bw/2-3*f}" y="${by+4*f}" width="${12*f}" height="${9*f}" rx="${1.5*f}" fill="#FFFFFF" stroke="#D4D4CE" stroke-width="${.9*f}"/><line x1="${bw/2-f}" y1="${by+8*f}" x2="${bw/2+6*f}" y2="${by+7*f}" stroke="#E2452B" stroke-width="${1.4*f}"/></g>`;
 return `<svg class="figure" viewBox="-30 -96 60 104" aria-hidden="true" focusable="false">${g}</svg>`};
window.avatarHTML=function(a,size){const e=identityOf(a);return `<span class="av" style="--av:${e.c};--av-ink:${e.ink}${size?';width:'+size+'px;height:'+size+'px':''}" aria-hidden="true">${esc(initialsOf(a.name))}</span>`};
/* ---------- placement ---------- */
homeOf=function(a){const p=presence(a);if(p==='prepared'||p==='waiting'){const list=agents.filter(b=>{const q=presence(b);return q==='prepared'||q==='waiting'});const i=Math.max(0,list.findIndex(b=>b.id===a.id));return ARRIVALS[i%ARRIVALS.length]}
 const pts=POINTS[a.room]||POINTS.ops;const slot=(a.room==='sales'||a.room==='support')?agents.filter(b=>b.room==='sales'||b.room==='support').findIndex(b=>b.id===a.id):a.slot;const v=pts[slot%4];return [v[0]+Math.floor(slot/4)*1.1,v[1]+Math.floor(slot/4)*.8]};
const oldMk=mkEl;mkEl=function(a){oldMk(a);a._fig='';drawFig(a);a.el.setAttribute('aria-label','Open '+a.name+' details');const label=a.el.querySelector('.tag2'),bubble=a.el.querySelector('.bub');if(label)label.style.zIndex=1200;if(bubble)bubble.style.zIndex=1200;};
function drawFig(a){if(!a.el)return;const p=presence(a),walking=a.el.classList.contains('walk'),key=p+'|'+a.name+'|'+(a.carry?1:0);if(a._fig===key)return;a._fig=key;const av=a.el.querySelector('.avs');if(av)av.innerHTML=figureSVG(a,{ghost:p==='prepared'||p==='waiting',carry:!!a.carry})}
updAv=function(a){if(a.el){a._fig='';drawFig(a)}};
let zoom=1;
function compact(){const v=$('#v-office');return !v||v.clientWidth<1100}
function fit(){const v=$('#v-office'),f=$('#floor'),wrap=f&&f.parentElement;if(!v||!f||!wrap)return;const c=compact();v.classList.toggle('compact',c);
 const w=wrap.clientWidth-(c?(innerWidth<760?20:32):24),h=c?1e9:Math.max(260,wrap.clientHeight-24),base=Math.max(280,Math.min(w,h*ASPECT));
 f.style.setProperty('--floor-width',base*zoom+'px');f.style.setProperty('--floor-height',base*zoom/ASPECT+'px');placeCard()}
function placeCard(){const card=$('#floor-approval'),f=$('#floor'),v=$('#v-office');if(!card||!f||!v)return;if(compact()){card.style.left='';card.style.top='';return}
 const fr=f.getBoundingClientRect(),vr=v.getBoundingClientRect(),isl=W2P(106,96);let x=fr.left-vr.left+fr.width*isl[0]/100+28,y=fr.top-vr.top+fr.height*isl[1]/100-card.offsetHeight*.72;
 const sg=document.querySelector('.zone-sign.appr');if(sg){const sr=sg.getBoundingClientRect();x=Math.max(x,sr.right-vr.left+12)}x=Math.min(x,vr.width-card.offsetWidth-16);y=Math.max(12,Math.min(y,vr.height-card.offsetHeight-12));if(sg){const sr=sg.getBoundingClientRect(),L=sr.left-vr.left,R=sr.right-vr.left,T=sr.top-vr.top,B=sr.bottom-vr.top,h=card.offsetHeight;if(x<R&&x+card.offsetWidth>L&&y<B&&y+h>T){y=(T-h-10>=12)?T-h-10:Math.min(B+10,vr.height-h-12)}}card.style.left=x+'px';card.style.top=y+'px';
 const lead=$('#fa-lead');if(lead){const ip=W2P(104,100);lead.setAttribute('x1',ip[0]+'%');lead.setAttribute('y1',ip[1]+'%');lead.setAttribute('x2',((x-(fr.left-vr.left))/fr.width*100)+'%');lead.setAttribute('y2',((y+card.offsetHeight*.5-(fr.top-vr.top))/fr.height*100)+'%')}}
function list(){const el=$('#floor-workers');if(!el)return;const head='<div class="fw-h"><span class="eyebrow">On the floor</span><span class="fw-n">'+agents.length+'</span></div>';
 el.innerHTML=head+agents.map(a=>{const p=presence(a);return '<button data-worker="'+a.id+'" class="fw p-'+p+'">'+avatarHTML(a,26)+'<span class="fw-t"><b>'+esc(a.name)+'</b><small>'+esc(a.now)+' · '+esc((ROOMS[a.room]||ROOMS.ops).n.toLowerCase().replace(/\b\w/g,m=>m.toUpperCase()))+'</small></span>'+(p==='connected'?'':presenceChip(p))+'</button>'}).join('');
 el.querySelectorAll('button[data-worker]').forEach(b=>b.onclick=()=>{const a=byId[b.dataset.worker];if(!a)return;openDr(a.id);});}
buildFloor=function(){const f=$('#floor');
 const signs=Object.entries(SIGNS).map(([k,v])=>{const p=signPct(...v);const SH={finance:'RESEARCH',marketing:'CREATIVE',sales:'OUTREACH',ops:'EXECUTION',lounge:'LOUNGE'};return '<div class="zone-sign" data-room="'+k+'" style="left:'+p[0]+'%;top:'+p[1]+'%"><span class="zs-full">'+ROOMS[k].n+'</span><span class="zs-short" aria-hidden="true">'+SH[k]+'</span><span id="ct-'+k+'"></span></div>'}).join('');
 const ap=signPct(108,92,2),ar=signPct(60,110,0);
 f.innerHTML='<img class="environment" src="'+ASSET+'/floor.svg" alt="'+esc(BRAND.name)+' HQ floor: Research Center, Creative / Marketing, Outreach Center, Execution Center, a lounge, an arrivals pad and the approval island in the middle" draggable="false"><svg class="fa-lead-layer" aria-hidden="true" focusable="false"><line id="fa-lead" x1="0" y1="0" x2="0" y2="0"/></svg><div id="deskl"></div><div id="chl"></div><div id="worker-labels" style="position:absolute;inset:0;z-index:1400;pointer-events:none"></div>'+signs+'<div class="zone-sign appr" style="left:'+ap[0]+'%;top:'+ap[1]+'%">NEEDS APPROVAL<span id="ct-approval"></span></div><div class="zone-sign arrivals" style="left:'+ar[0]+'%;top:'+ar[1]+'%">ARRIVALS</div>';
 agents.forEach(a=>{mkEl(a);a._nextAmbient=Date.now()+20000;a._approvalWalking=false;a._approvalArrival=false;a._approvalLoop=(a._approvalLoop||0)+1;const p=homeOf(a);setPos(a,...p,0);paint(a)});
 let tools=$('#diorama-tools');if(!tools){tools=document.createElement('div');tools.id='diorama-tools';tools.className='floor-tools';tools.setAttribute('role','group');tools.setAttribute('aria-label','Zoom');tools.innerHTML='<button id="zoom-out" aria-label="Zoom out office">−</button><button id="zoom-in" aria-label="Zoom in office">+</button>';$('#v-office').appendChild(tools);$('#zoom-in').onclick=()=>{zoom=Math.min(1.6,zoom+.15);fit()};$('#zoom-out').onclick=()=>{zoom=Math.max(.8,zoom-.15);fit()};const l=document.createElement('div');l.id='floor-workers';l.className='floor-worker-list';l.setAttribute('aria-label','Employees');$('#v-office').appendChild(l);const wrap=$('#floor').parentElement;if(wrap)wrap.addEventListener('scroll',placeCard,{passive:true});}fit();list();};drawDesks=function(){};
const oldPaint=paint;paint=function(a){oldPaint(a);const e=a.el;if(e){const p=presence(a);a.presence=p;e.style.setProperty('--col',identityOf(a).c);
  if(p==='prepared')a.now='Prepared · not connected yet';else if(p==='waiting')a.now='Waiting for bot · no report yet';else if(p==='reconnect')a.now='Reconnect needed · authorization dropped';
  e.classList.toggle('p-prepared',p==='prepared');e.classList.toggle('p-waiting',p==='waiting');e.classList.toggle('p-reconnect',p==='reconnect');e.dataset.presence=p;
  e.setAttribute('aria-label',a.name+': '+a.now);drawFig(a)}
 workerLabel(a);list();
 const cnt=k=>agents.filter(b=>(k==='sales'?(b.room==='sales'||b.room==='support'):b.room===k)&&['connected','reconnect'].includes(presence(b))).length;
 ['finance','marketing','sales','ops','lounge'].forEach(k=>{const c=$('#ct-'+k);if(c)c.textContent=cnt(k)});const ca=$('#ct-approval');if(ca)ca.textContent=G.approvals.length||'';};
workDestination=function(kind,a){const lane=(a.slot%3-1)*3;return kind==='research'?{point:W2P(18+lane,22),place:'Research Center',bubble:'Research stop',carry:'Research brief'}:kind==='notes'?{point:W2P(64+lane,66),place:'Execution Center',bubble:'Working on notes',carry:'Document'}:{point:W2P(97+lane,63),place:'Lounge (animation)',bubble:'Coffee break',carry:'Coffee'};};
const RECON='<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6.6 9.4 9.4 6.6M4.9 8.2 3.6 9.5a2.3 2.3 0 0 0 3.2 3.2l1.3-1.3M11.1 7.8l1.3-1.3a2.3 2.3 0 0 0-3.2-3.2L7.9 4.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
function workerLabel(a){const layer=$('#worker-labels');if(!layer)return;let l=layer.querySelector('[data-label="'+a.id+'"]');if(!l){l=document.createElement('div');l.dataset.label=a.id;l.className='worker-label';layer.appendChild(l)}const p=presence(a);l.style.left=a.x+'%';l.style.top=a.y+'%';l.dataset.presence=p;l.className='worker-label'+(a.st==='needs'?' needs':'')+(p==='reconnect'?' reconnect':'')+(a.el&&a.el.classList.contains('sel')?' is-sel':'');
 l.style.display=(a.st==='needs'||a.st==='blocked'||p==='reconnect'||a.el&&(a.el.classList.contains('sel')||a.el.classList.contains('walk')))?'block':'none';
 l.innerHTML='<b>'+(p==='reconnect'?RECON:'<i class="d d-'+(a.st==='needs'?'need':p)+'" aria-hidden="true"></i>')+esc(a.name)+'</b><small>'+esc(a.now)+'</small>';if(a.el){a.el.onmouseenter=()=>{l.style.display='block'};a.el.onmouseleave=()=>workerLabel(a)}}
// Movement is presentation only: approve/deny still uses the existing owner route.
const pendingFor=a=>G.approvals.filter(r=>r.a.id===a.id);
const oldSetPos=setPos;setPos=function(a,x,y,ms){oldSetPos(a,x,y,ms);const z=Math.round(y*10);a.el.style.zIndex=z;a.el.style.setProperty('--worker-x',x+'%');a.el.style.setProperty('--worker-y',y+'%');a.el.style.setProperty('--worker-z',z);workerLabel(a);};
walk=async function(a,x,y){const token=a._walkEpoch=(a._walkEpoch||0)+1,el=a.el;const check=()=>a._walkEpoch===token&&a.el===el;
 if(matchMedia('(prefers-reduced-motion: reduce)').matches||document.hidden){setPos(a,x,y,0);return}if(Math.abs(a.x-x)+Math.abs(a.y-y)<.6)return;a.el.classList.add('walk');workerLabel(a);
 const pts=route(P2W(a.x,a.y),P2W(x,y)).map(p=>W2P(...p));pts[pts.length-1]=[x,y];
 for(const p of pts){if(!check())return;await walkStep(a,...p)}if(check()){a.el.classList.remove('walk');workerLabel(a)}};
function floorCard(){let card=$('#floor-approval');if(!card){card=document.createElement('div');card.id='floor-approval';card.setAttribute('role','region');card.setAttribute('aria-live','polite');card.setAttribute('aria-label','Approval island');$('#v-office').appendChild(card)}
 const ready=G.approvals.filter(r=>r.a._approvalArrival);card.style.display=ready.length?'block':'none';$('#v-office').classList.toggle('has-card',!!ready.length);if(!ready.length)return;const r=ready[0],a=r.a,rawq=(LS.requests||[]).find(q=>q.id===r.reqId)||{};
 const key=r.id+'|'+ready.length;if(card.dataset.key!==key){card.dataset.key=key;
 card.innerHTML='<div class="fa-top"><span><i aria-hidden="true"></i>At the approval island · '+ready.length+' waiting</span><span>Needs approval</span></div><div class="fa-body"><div class="fa-who">'+avatarHTML(a,36)+'<div><b>'+esc(a.name)+'</b><small>'+esc((ROOMS[a.room]||ROOMS.ops).n.toLowerCase().replace(/\b\w/g,m=>m.toUpperCase()))+' · '+esc(rawq.action||'')+'</small></div></div><p class="fa-text">'+r.text+'</p><div class="fa-act"><button class="btn grn lg" data-r="'+r.id+'" data-d="approve" aria-keyshortcuts="A">Approve once <kbd aria-hidden="true">A</kbd></button><button class="btn red lg" data-r="'+r.id+'" data-d="deny" aria-keyshortcuts="D">Deny <kbd aria-hidden="true">D</kbd></button></div></div>';}
 requestAnimationFrame(placeCard)}
function approvalMove(a){const qs=pendingFor(a);if(qs.length){if(a._approvalWalking||a._approvalArrival)return;const token=a._approvalLoop=(a._approvalLoop||0)+1;a._approvalWalking=true;renderTray();a._pos='appr';a.bub='Walking to Needs Approval';a.carry='Request';paint(a);const i=Math.max(0,G.approvals.findIndex(r=>r.a.id===a.id)),p=ASLOT[i%ASLOT.length];walk(a,...p).then(()=>{if(a._approvalLoop!==token||!pendingFor(a).length)return;a._approvalWalking=false;a._approvalArrival=true;a.carry=null;renderTray();a.bub='Waiting for your decision';paint(a);floorCard()});}
 else if(a._approvalWalking||a._approvalArrival){a._approvalLoop=(a._approvalLoop||0)+1;a._approvalWalking=false;a._approvalArrival=false;a._pos='home';a.bub='Returning to my workstation';a.carry=null;paint(a);floorCard();goHome(a).then(()=>{a.bub=null;paint(a)})}}
const oldApply=applyState;applyState=function(s){const before={};agents.forEach(a=>before[a.id]=a.presence);oldApply(s);
 agents.forEach(a=>{const p=presence(a);if(before[a.id]&&before[a.id]!==p){a.presence=p;a._fig='';paint(a);const h=homeOf(a);walk(a,...h)}});agents.forEach(approvalMove);floorCard()};
const oldRenderTray=renderTray;renderTray=function(){oldRenderTray();const waiting=G.approvals.some(r=>r.a._approvalWalking&&!r.a._approvalArrival);if(waiting&&$('#v-office').classList.contains('on')&&location.hash!=='#approvals'){const strip=$('#strip');strip.className='clear';strip.innerHTML='Needs approval · Worker is walking to the center island. <a href="#approvals">Review queue</a>';}floorCard();fit();};
ambientTrip=async function(a){if(presence(a)!=='connected'){a._nextAmbient=Date.now()+22000;return}const token=a._motionToken=(a._motionToken||0)+1,el=a.el;a._motion=true;a._ambient=true;const valid=()=>a._motionToken===token&&a.el===el&&a.st==='idle'&&!a.revoked&&!G.paused&&!document.hidden&&presence(a)==='connected';try{a._motionPlace='Ambient: lounge break';a.bub='Ambient: lounge break';paint(a);await walk(a,...POINTS.lounge[a.slot%4]);if(!valid())return;await sleep(3500);if(!valid())return;await goHome(a)}finally{if(a._motionToken===token){a._motion=false;a._ambient=false;a._motionPlace=null;a.bub=null;paint(a);a._nextAmbient=Date.now()+22000}}};
window.HQ_FLOOR={W2P,P2W,route,fit};
setLayout();buildFloor();agents.forEach(a=>a._pos='home');window.addEventListener('resize',()=>{fit();agents.forEach(approvalMove)});window.addEventListener('hashchange',()=>{fit();renderTray()});
})();
