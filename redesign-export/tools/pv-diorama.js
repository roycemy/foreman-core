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
 ROOMS={};['sales','support','marketing','ops','finance','lounge'].forEach(k=>{ROOMS[k]={n:typeOf(k).name.toUpperCase(),type:ROOM_MAP[k],...rect(BOXW[k])}});
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
const hash=s=>{let h=0;for(const ch of String(s))h=(h*31+ch.charCodeAt(0))>>>0;return h};
/* ===== Round 2: quiet floor. Figures, room types, props, one-label-at-a-time, human copy. (spliced into pv-diorama.js) ===== */
/* ---- room types: data-driven. Backend keys stay ops/sales/marketing/finance/support/lounge; only presentation maps. ---- */
const ICONS={
 studio:'<path d="M3 13l2.5-7 4 4L13 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12.5" cy="12" r="1.6" fill="currentColor"/>',
 library:'<path d="M3 3h2.6v10H3zM7 3h2.6v10H7zM11 4l2.4-.7 2 9.6-2.4.6z" fill="currentColor"/>',
 workshop:'<path d="M10.5 2.5a3 3 0 0 0-3.4 4L2.5 11l2.5 2.5 4.5-4.6a3 3 0 0 0 4-3.4l-2 2-2-.5-.5-2z" fill="currentColor"/>',
 mailroom:'<rect x="2" y="4" width="12" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2.5 4.8 8 9l5.5-4.2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
 warroom:'<circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="2" fill="currentColor"/>',
 lab:'<path d="M6 2.5h4M7 2.5v4L3.5 13h9L9 6.5v-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
 lounge:'<path d="M3 7h8v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM11 8h1.5a1.5 1.5 0 0 1 0 3H11M5.5 2.5c-.6.8.6 1.4 0 2.4M8.5 2.5c-.6.8.6 1.4 0 2.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
 frontdesk:'<path d="M3 11a5 5 0 0 1 10 0zM2 12.5h12M8 5V3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
 garden:'<path d="M8 14V7M8 9C8 5 5 4 3 4c0 3 2 5 5 5zM8 8c0-3 2.5-4.5 5-4.5 0 3-2 4.5-5 4.5z" fill="currentColor"/>',
 vault:'<rect x="2.5" y="3" width="11" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="2.4" fill="none" stroke="currentColor" stroke-width="1.5"/>'};
const ROOM_TYPES={studio:{name:'Studio',good:'Design, writing, content',props:['easel','canvases','tripod']},library:{name:'Library',good:'Research and reading',props:['bookcase','bookcase','armchair']},
 workshop:{name:'Workshop',good:'Building and operations',props:['bench','toolbox','crates']},mailroom:{name:'Mailroom',good:'Email and outreach',props:['pigeonholes','parcels','cart']},
 warroom:{name:'War Room',good:'Planning and strategy',props:['maptable','board','flags']},lab:{name:'Lab',good:'Data, code, experiments',props:['servers','flasks','servers']},
 lounge:{name:'Lounge',good:'Breaks and idle time',props:['records','mugs','beanbag']},frontdesk:{name:'Front Desk',good:'Support and inbox',props:['counter','beanbag','parcels']},
 garden:{name:'Garden',good:'Long-running projects',props:['planter','tree','planter']},vault:{name:'Vault',good:'Money and sensitive work',props:['safe','crates','safe']}};
/* default mapping of existing backend room keys -> room type. Override per workspace: window.HQ_ROOMS={ops:'lab'} before this script. */
const ROOM_MAP=Object.assign({finance:'library',marketing:'studio',sales:'mailroom',support:'mailroom',ops:'workshop',lounge:'lounge'},window.HQ_ROOMS||{});
const typeOf=k=>ROOM_TYPES[ROOM_MAP[k]]||ROOM_TYPES.workshop;
window.roomName=k=>typeOf(k).name;window.ROOM_TYPES=ROOM_TYPES;window.roomTypeIcon=t=>ICONS[t]||'';window.ROOM_MAP=ROOM_MAP;window.roomIcon=k=>'<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">'+(ICONS[ROOM_MAP[k]]||ICONS.workshop)+'</svg>';
/* free floor slots per backend room (world coords), filled by the room type's props */
const SLOTS={finance:[[37,10],[37,19],[33,31]],marketing:[[104,12],[112,19],[103,33]],sales:[[24,86],[31,93],[15,85]],ops:[[56,76],[67,76],[77,59]],lounge:[[101,65],[107,61],[93,75]]};
/* ---- props: tiny isometric drawings (same projection as the floor art) ---- */
const PP=(x,y,z)=>[PJ.OX+(x-y)*PJ.K,PJ.OY+(x+y)*PJ.K*.5-(z||0)*PJ.K];
const poly=(pts,fill,extra)=>'<polygon points="'+pts.map(p=>PP(...p).map(n=>n.toFixed(1)).join(',')).join(' ')+'" fill="'+fill+'"'+(extra||'')+'/>';
function box(x,y,z,w,d,h,c){return poly([[x,y+d,z],[x+w,y+d,z],[x+w,y+d,z+h],[x,y+d,z+h]],c[1])+poly([[x+w,y,z],[x+w,y+d,z],[x+w,y+d,z+h],[x+w,y,z+h]],c[2])+poly([[x,y,z+h],[x+w,y,z+h],[x+w,y+d,z+h],[x,y+d,z+h]],c[0])}
const shadow=(x,y,w,d)=>{const c=PP(x+w/2,y+d/2,0);return '<ellipse cx="'+c[0].toFixed(1)+'" cy="'+c[1].toFixed(1)+'" rx="'+((w+d)*PJ.K*.62).toFixed(1)+'" ry="'+((w+d)*PJ.K*.26).toFixed(1)+'" fill="#1A1A18" opacity=".12"/>'};
const C={wood:['#D9B98F','#B98F63','#A27B52'],dark:['#4A4845','#33322F','#2A2927'],porc:['#F7F5F0','#E1DCD1','#D2CCBF'],kraft:['#DDBE8E','#C49C66','#B08856'],steel:['#B7BDC2','#959CA3','#838A91'],teal:['#2E8580','#1F6F6B','#185B57'],cobalt:['#4673BC','#2F5DA8','#284F8F'],ochre:['#E2B457','#C99634','#B3842B'],plum:['#8A6A9A','#6B4C7A','#5C4069'],sage:['#8FAE86','#6F9166','#5E7F57'],soil:['#8A6A4E','#6E533C','#5E4733']};
const PROPS={
 bookcase:(x,y)=>{let s=box(x,y,0,2.2,6,9,C.wood);const cols=['#2F5DA8','#C99634','#1F6F6B','#6B4C7A','#F7F5F0','#4A4845'];for(let r=0;r<3;r++)for(let i=0;i<6;i++){const yy=y+.4+i*.92,zz=1+r*2.7,h=1.5+((i*7+r)%3)*.35;s+=poly([[x+2.21,yy,zz],[x+2.21,yy+.7,zz],[x+2.21,yy+.7,zz+h],[x+2.21,yy,zz+h]],cols[(i+r*2)%6])}return shadow(x,y,2.2,6)+s},
 armchair:(x,y)=>shadow(x,y,4.5,4.5)+box(x,y,0,4.5,4.5,1.8,C.teal)+box(x,y,1.8,1.2,4.5,2.8,C.teal)+box(x,y+3.6,1.8,4.5,.9,1.2,C.teal)+box(x+3.6,y-1.5,0,.4,.4,6.5,C.dark)+box(x+2.9,y-2.2,6.2,1.8,1.8,1.3,C.ochre)+'<circle class="pv-glow" cx="'+PP(x+3.8,y-1.3,6)[0].toFixed(1)+'" cy="'+PP(x+3.8,y-1.3,6)[1].toFixed(1)+'" r="16" fill="url(#pvLamp)"/>',
 easel:(x,y)=>{const a=PP(x,y+1,0),b=PP(x+1.6,y+1,0),t=PP(x+.8,y+1,8.5);return '<path d="M'+a+' L'+t+' L'+b+'" stroke="#A27B52" stroke-width="2" fill="none"/>'+poly([[x+.9,y-1.2,3],[x+.9,y+3.4,3],[x+.9,y+3.4,7.6],[x+.9,y-1.2,7.6]],'#FBFAF7',' stroke="#B98F63" stroke-width="1"')+poly([[x+.92,y-.2,4],[x+.92,y+1.4,4],[x+.92,y+1.8,6],[x+.92,y,6.4]],'#2F5DA8')+poly([[x+.92,y+1.6,4.4],[x+.92,y+2.9,4],[x+.92,y+2.6,5.6]],'#C99634')},
 canvases:(x,y)=>shadow(x,y,1,4)+box(x,y,0,.5,4,4.5,C.porc)+box(x+.7,y+.4,0,.5,3.5,3.8,['#F7F5F0','#6B4C7A','#5C4069'])+box(x+1.4,y+.8,0,.5,3,3.2,['#F7F5F0','#1F6F6B','#185B57']),
 tripod:(x,y)=>{const f=[PP(x-1,y,0),PP(x+1.2,y-.6,0),PP(x+.4,y+1.4,0)],t=PP(x,y,6);return f.map(p=>'<path d="M'+p+' L'+t+'" stroke="#33322F" stroke-width="1.6"/>').join('')+box(x-.8,y-.8,6,1.6,2.2,1.4,C.dark)+'<circle cx="'+PP(x+.82,y+.3,6.7)[0].toFixed(1)+'" cy="'+PP(x+.82,y+.3,6.7)[1].toFixed(1)+'" r="2.4" fill="#2F5DA8"/>'},
 bench:(x,y)=>shadow(x,y,9,3)+box(x,y,0,.5,.5,3.2,C.dark)+box(x+8.5,y+2.5,0,.5,.5,3.2,C.dark)+box(x,y,3.2,9,3,.7,C.wood)+box(x+1,y+.6,3.9,2,1.5,.8,C.ochre)+box(x+5,y+.8,3.9,1,1.2,1.6,C.steel)+box(x+6.6,y+.4,3.9,1.6,.9,.5,C.cobalt),
 toolbox:(x,y)=>shadow(x,y,4,2.4)+box(x,y,0,4,2.4,2,C.ochre)+box(x+1.4,y+.9,2,1.2,.6,.8,C.dark),
 crates:(x,y)=>shadow(x,y,5,5)+box(x,y,0,3,3,2.6,C.kraft)+box(x+2.6,y+1.6,0,2.4,2.4,2.2,C.kraft)+box(x+.4,y+.4,2.6,2.2,2.2,2,C.kraft),
 pigeonholes:(x,y)=>{let s=shadow(x,y,2,7)+box(x,y,0,2,7,7,C.wood);for(let r=0;r<3;r++)for(let i=0;i<4;i++){const yy=y+.4+i*1.65,zz=.8+r*2.1;s+=poly([[x+2.01,yy,zz],[x+2.01,yy+1.3,zz],[x+2.01,yy+1.3,zz+1.6],[x+2.01,yy,zz+1.6]],(i+r)%3===0?'#F7F5F0':'#7A5C3E')}return s},
 parcels:(x,y)=>shadow(x,y,5,4)+box(x,y,0,3,2.6,2,C.kraft)+box(x+.3,y+.3,2,2.2,2,1.6,C.kraft)+box(x+3.2,y+.6,0,1.8,2.8,1.4,['#F7F5F0','#E1DCD1','#D2CCBF'])+poly([[x+1.3,y,2],[x+1.7,y,2],[x+1.7,y+2.6,2],[x+1.3,y+2.6,2]],'#C99634'),
 cart:(x,y)=>shadow(x,y,4,3)+box(x,y,1,4,3,2,C.steel)+box(x+.5,y+.4,3,3,2.2,1.5,C.kraft)+['0,3','4,3','4,0'].map(v=>{const [a,b]=v.split(',').map(Number);const p=PP(x+a,y+b,.6);return '<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="2.4" fill="#2A2927"/>'}).join(''),
 maptable:(x,y)=>shadow(x,y,7,5)+box(x+.4,y+.4,0,6.2,4.2,3,C.dark)+box(x,y,3,7,5,.5,['#E8E2D2','#C9BFA8','#B9AF98'])+poly([[x+1,y+1,3.52],[x+4,y+.8,3.52],[x+5.6,y+3.5,3.52],[x+2,y+4,3.52]],'#8FAE86')+'<circle cx="'+PP(x+4,y+2.4,3.6)[0].toFixed(1)+'" cy="'+PP(x+4,y+2.4,3.6)[1].toFixed(1)+'" r="2" fill="#C99634"/>',
 board:(x,y)=>box(x,y,0,.3,.3,6,C.dark)+box(x,y+5,0,.3,.3,6,C.dark)+poly([[x+.32,y-.4,2.6],[x+.32,y+5.7,2.6],[x+.32,y+5.7,7.2],[x+.32,y-.4,7.2]],'#FBFAF7',' stroke="#B9AF98"')+poly([[x+.34,y+.6,4.5],[x+.34,y+2.6,5.6],[x+.34,y+4.4,4.2]],'none',' stroke="#2F5DA8" stroke-width="1.4"'),
 flags:(x,y)=>[0,1.6,3.2].map((o,i)=>{const b=PP(x+o,y,0),t=PP(x+o,y,7);const col=['#2F5DA8','#C99634','#1F6F6B'][i];return '<path d="M'+b+' L'+t+'" stroke="#4A4845" stroke-width="1.3"/>'+poly([[x+o,y,7],[x+o,y-2.4,6.4],[x+o,y,5.6]],col)}).join(''),
 servers:(x,y)=>{let s=shadow(x,y,2.5,4)+box(x,y,0,2.5,4,8,C.dark);for(let r=0;r<5;r++){const p=PP(x+2.51,y+1+((r*3)%3)*.6,1.2+r*1.4);s+='<circle class="pv-led" style="animation-delay:'+(r*0.7)+'s" cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="1.3" fill="'+(r%2?'#7FD3A3':'#E2B457')+'"/>'}return s},
 flasks:(x,y)=>shadow(x,y,5,3)+box(x,y,2.8,5,3,.5,C.porc)+box(x+.3,y+.3,0,.4,.4,2.8,C.steel)+box(x+4.3,y+2.3,0,.4,.4,2.8,C.steel)+[[1,1,'#2F5DA8'],[2.6,1.4,'#1F6F6B'],[3.8,.8,'#C99634']].map(([a,b,c])=>{const p=PP(x+a,y+b,3.9);return '<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="3" fill="'+c+'" opacity=".85"/><rect x="'+(p[0]-1).toFixed(1)+'" y="'+(p[1]-7).toFixed(1)+'" width="2" height="5" fill="#E1DCD1"/>'}).join(''),
 records:(x,y)=>shadow(x,y,4,3)+box(x,y,0,4,3,2.4,C.wood)+box(x+.4,y+.3,2.4,3.2,2.4,.4,C.dark)+(()=>{const p=PP(x+2,y+1.5,2.85);return '<ellipse class="pv-spin" cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" rx="7" ry="3.5" fill="#121212"/><ellipse cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" rx="2" ry="1" fill="#C99634"/>'})(),
 mugs:(x,y)=>shadow(x-1,y-1,3.6,3)+box(x-1,y-1,0,3.6,3,1.6,C.wood)+[[0,0],[1.6,.8]].map(([a,b])=>{const p=PP(x+a,y+b,1.6);return '<rect x="'+(p[0]-2.4).toFixed(1)+'" y="'+(p[1]-4).toFixed(1)+'" width="4.8" height="4.6" rx="1" fill="#F7F5F0" stroke="#D2CCBF" stroke-width=".6"/><path class="pv-steam" d="M'+p[0].toFixed(1)+' '+(p[1]-6).toFixed(1)+' q-2 -4 0 -7 q2 -3 0 -6" fill="none" stroke="#B9B9B2" stroke-width="1.1" stroke-linecap="round"/>'}).join(''),
 beanbag:(x,y)=>{const p=PP(x+1.8,y+1.8,0);return shadow(x,y,3.6,3.6)+'<ellipse cx="'+p[0].toFixed(1)+'" cy="'+(p[1]-5).toFixed(1)+'" rx="12" ry="8" fill="#C99634"/><ellipse cx="'+(p[0]-2).toFixed(1)+'" cy="'+(p[1]-8).toFixed(1)+'" rx="7" ry="3.5" fill="#E2B457"/>'},
 counter:(x,y)=>shadow(x,y,3,8)+box(x,y,0,3,8,4,C.wood)+box(x-.2,y-.2,4,3.4,8.4,.5,C.porc)+PROPS.bell(x+1.6,y+5.4),
 bell:(x,y)=>{const p=PP(x,y,4.6);return '<path d="M'+(p[0]-3.5).toFixed(1)+' '+p[1].toFixed(1)+' a3.5 3.5 0 0 1 7 0z" fill="#C99634"/><rect x="'+(p[0]-4.5).toFixed(1)+'" y="'+p[1].toFixed(1)+'" width="9" height="1.4" fill="#4A4845"/>'},
 planter:(x,y)=>{let s=shadow(x,y,6,3)+box(x,y,0,6,3,1.6,C.wood)+poly([[x,y,1.62],[x+6,y,1.62],[x+6,y+3,1.62],[x,y+3,1.62]],'#6E533C');for(let i=0;i<5;i++){const p=PP(x+.8+i*1.1,y+1.5,1.7);s+='<circle class="pv-sway" style="animation-delay:'+i*.6+'s" cx="'+p[0].toFixed(1)+'" cy="'+(p[1]-3).toFixed(1)+'" r="'+(2.6+(i%2))+'" fill="'+(i%2?'#6F9166':'#8FAE86')+'"/>'}return s},
 tree:(x,y)=>{const p=PP(x+1,y+1,0);return shadow(x,y,2,2)+box(x+.6,y+.6,0,.8,.8,4,C.wood)+'<circle class="pv-sway" cx="'+p[0].toFixed(1)+'" cy="'+(p[1]-30).toFixed(1)+'" r="11" fill="#6F9166"/><circle cx="'+(p[0]+5).toFixed(1)+'" cy="'+(p[1]-36).toFixed(1)+'" r="7" fill="#8FAE86"/>'},
 safe:(x,y)=>shadow(x,y,3.4,3.4)+box(x,y,0,3.4,3.4,4,C.steel)+(()=>{const p=PP(x+3.42,y+1.7,2);return '<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="3.4" fill="#5E656B"/><circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="1.2" fill="#E2B457"/>'})()};
/* island: layered plinth, warm under-glow, tray with request papers (focal point) */
function islandSVG(n){const c=PP(98,98,0);let s='<ellipse class="pv-isl-glow'+(n?' on':'')+'" cx="'+c[0].toFixed(1)+'" cy="'+(c[1]+4).toFixed(1)+'" rx="120" ry="52" fill="url(#pvIsl)"/>';
 s+=box(91.5,91.5,0,13,13,1.2,['#FFFFFF','#E7E2D7','#D9D3C6'])+box(93,93,1.2,10,10,2.6,['#FBFAF7','#C8361D','#A62D17'])+poly([[93,93,3.82],[103,93,3.82],[103,103,3.82],[93,103,3.82]],'#FFFFFF');
 s+=box(95.4,95.6,3.8,5.6,4.4,.5,['#2A2927','#1A1A18','#121212'])+box(95.9,96.1,4.3,4.6,3.4,.15,['#F7F5F0','#E1DCD1','#D2CCBF']);
 for(let i=0;i<Math.min(n,3);i++)s+=poly([[96.2+i*.2,96.4-i*.15,4.5+i*.25],[100+i*.2,96.4-i*.15,4.5+i*.25],[100+i*.2,99-i*.15,4.5+i*.25],[96.2+i*.2,99-i*.15,4.5+i*.25]],i===Math.min(n,3)-1?'#FFFFFF':'#F2EEE6',' stroke="'+(i===Math.min(n,3)-1?'#E2452B':'#D2CCBF')+'" stroke-width=".8"');
 const lp=PP(101.8,95.2,3.82);s+='<rect x="'+(lp[0]-.8).toFixed(1)+'" y="'+(lp[1]-26).toFixed(1)+'" width="1.6" height="26" fill="#2A2927"/><path d="M'+(lp[0]-7).toFixed(1)+' '+(lp[1]-24).toFixed(1)+'h14l-3 -6h-8z" fill="#2A2927"/><ellipse class="pv-glow" cx="'+lp[0].toFixed(1)+'" cy="'+(lp[1]-14).toFixed(1)+'" rx="22" ry="16" fill="url(#pvLamp)"/>';return s}
window.roomVignette=function(t){const T=ROOM_TYPES[t];if(!T)return '';const sl=[[2,1.5],[11,1.2],[7,8]];const it=T.props.map((k,i)=>[sl[i][0]+sl[i][1],PROPS[k]?PROPS[k](...sl[i]):'']).sort((a,b)=>a[0]-b[0]).map(x=>x[1]).join('');
 const L=PP(0,14,0),Rr=PP(18,0,0),T0=PP(0,0,13),B=PP(18,14,-1);return '<svg viewBox="'+(L[0]-8).toFixed(0)+' '+(T0[1]-6).toFixed(0)+' '+(Rr[0]-L[0]+16).toFixed(0)+' '+(B[1]-T0[1]+12).toFixed(0)+'" aria-hidden="true"><defs><radialGradient id="pvLamp"><stop offset="0" stop-color="#FFE7B0" stop-opacity=".55"/><stop offset="1" stop-color="#FFE7B0" stop-opacity="0"/></radialGradient></defs>'+box(0,0,-1,18,14,1,['#F4F2EC','#E1DCD1','#D2CCBF'])+it+'</svg>'};
const FOOT={bookcase:[2.2,6],armchair:[4.5,4.5],easel:[1.6,4.6],canvases:[1.9,4],tripod:[2,2],bench:[9,3],toolbox:[4,2.4],crates:[5,5],pigeonholes:[2,7],parcels:[5,3.4],cart:[4,3],maptable:[7,5],board:[.4,6],flags:[3.2,1],servers:[2.5,4],flasks:[5,3],records:[4,3],mugs:[3.6,3],beanbag:[3.6,3.6],counter:[3,8],bell:[.5,.5],planter:[6,3],tree:[2,2],safe:[3.4,3.4]};
/* depth of a prop = depth of its footprint centre, on the same scale figures use (z = round(y% * 10)) */
const propZ=(kind,x,y)=>{const f=FOOT[kind]||[3,3];return Math.round(W2P(x+f[0]/2,y+f[1]/2)[1]*10)};
function propsSVG(){let items=[];for(const k in SLOTS){const t=typeOf(k);SLOTS[k].forEach((sl,i)=>{const kind=t.props[i%t.props.length];if(PROPS[kind])items.push([sl[0]+sl[1],PROPS[kind](sl[0],sl[1]),propZ(kind,sl[0],sl[1]),kind,sl[0],sl[1]])})}
 items.sort((a,b)=>a[0]-b[0]);return items}
function renderProps(){const f=$('#floor');if(!f)return;let l=$('#pv-props');if(!l){l=document.createElementNS('http://www.w3.org/2000/svg','svg');l.id='pv-props';l.setAttribute('aria-hidden','true');l.setAttribute('focusable','false');l.setAttribute('viewBox',PJ.X0+' '+PJ.Y0+' '+PJ.W+' '+PJ.H);f.insertBefore(l,$('#deskl'))}
 const chl=$('#chl');if(chl){chl.querySelectorAll('.pv-prop').forEach(e=>e.remove());propsSVG().forEach(([d,svg,z,kind,wx,wy])=>{const e=document.createElementNS('http://www.w3.org/2000/svg','svg');e.setAttribute('class','pv-prop');e.setAttribute('aria-hidden','true');e.setAttribute('focusable','false');e.dataset.kind=kind;e.dataset.wx=wx;e.dataset.wy=wy;e.setAttribute('viewBox',PJ.X0+' '+PJ.Y0+' '+PJ.W+' '+PJ.H);e.style.zIndex=z;e.innerHTML=svg;chl.appendChild(e)})}
 l.innerHTML='<defs><radialGradient id="pvLamp"><stop offset="0" stop-color="#FFE7B0" stop-opacity=".55"/><stop offset="1" stop-color="#FFE7B0" stop-opacity="0"/></radialGradient><radialGradient id="pvIsl"><stop offset="0" stop-color="#E2452B" stop-opacity=".16"/><stop offset=".6" stop-color="#E2452B" stop-opacity=".05"/><stop offset="1" stop-color="#E2452B" stop-opacity="0"/></radialGradient></defs>'+'<g id="pv-island">'+islandSVG(G.approvals.length)+'</g>'}
/* ---- identity: 6 characters, distinct silhouettes; per-agent colour from a curated palette (no vermilion) ---- */
const CAST=[{k:'headset',c:'#2B2D31',body:'blazer',acc:'#9AA3AC'},{k:'beanie',c:'#2F5DA8',body:'hoodie',acc:'#D9A441'},{k:'glasses',c:'#1F6F6B',body:'coat',acc:'#2B2D31'},
 {k:'scarf',c:'#6B4C7A',body:'sweater',acc:'#D9A441'},{k:'cap',c:'#B9862E',body:'tee',acc:'#2B2D31'},{k:'bun',c:'#4C6A7F',body:'dress',acc:'#E9C46A'}];
const PREF={grok:0,muse:1,instinct:2};let castMap={};
function assignCast(){castMap={};const used=new Set();(agents||[]).forEach(a=>{const d=rawOf(a)||{};let i=PREF[(d.providerId||'').toLowerCase()];if(i==null)i=hash(a.id)%CAST.length;let n=0;while(used.has(i)&&n<CAST.length){i=(i+1)%CAST.length;n++}used.add(i);castMap[a.id]=i})}
window.identityOf=function(a){if(castMap[a.id]==null)assignCast();const e=CAST[castMap[a.id]!=null?castMap[a.id]:hash(a.id||a.name)%CAST.length];return {c:e.c,ink:'#FFFFFF',k:e.k,body:e.body,acc:e.acc}};
window.initialsOf=n=>String(n||'?').split(/\s+/).filter(Boolean).map(w=>w[0]).join('').slice(0,2).toUpperCase()||'?';
const SKIN='#EBDDCB',PANTS='#34322F',SHOE='#1E1D1B';
window.HQ_CAST=CAST;window.figureSVG=function(a,opts){opts=opts||{};const e=opts.cast!=null?CAST[opts.cast]:identityOf(a),ghost=!!opts.ghost,pose=opts.pose||'stand',ini=initialsOf(a.name);
 const G=ghost?' fill="none" stroke="#6E6E68" stroke-width="1.4" stroke-dasharray="3 2.4"':'';const F=c=>ghost?G:' fill="'+c+'"';
 const dk=c=>{const n=parseInt(c.slice(1),16);const r=Math.round(((n>>16)&255)*.8),g=Math.round(((n>>8)&255)*.8),b=Math.round((n&255)*.8);return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1)};
 const sit=pose==='sit',dy=sit?10:0,fr=opts.frame,rot=(d,x,y)=>fr==null?'':' transform="rotate('+(x<0?(fr?12:-4):(fr?4:-12))+' '+x+' '+y+')"',lift=on=>fr==null?'':(on?' transform="translate(0 -3.5)"':'');let s='<ellipse cx="0" cy="0" rx="'+(sit?16:13)+'" ry="4.6" fill="#1A1A18" opacity="'+(ghost?.1:.2)+'"/>';
 if(sit){s+='<rect x="-1.6" y="-12" width="3.2" height="11"'+F('#4A4845')+'/><path d="M-9 -1 L9 -1" stroke="#4A4845" stroke-width="2.4" stroke-linecap="round"/><rect x="-14" y="-47" width="28" height="30" rx="7"'+F('#4A4845')+'/><rect x="-13" y="-17" width="26" height="5" rx="2.5"'+F('#33322F')+'/>'}
 else if(pose==='walk'){s+='<g class="leg l"'+lift(fr===0)+'><rect x="-6" y="-22" width="5" height="21" rx="2.5"'+F(PANTS)+'/><ellipse cx="-3.6" cy="-1.4" rx="3.6" ry="2"'+F(SHOE)+'/></g><g class="leg r"'+lift(fr===1)+'><rect x="1" y="-22" width="5" height="21" rx="2.5"'+F(PANTS)+'/><ellipse cx="3.6" cy="-1.4" rx="3.6" ry="2"'+F(SHOE)+'/></g>'}
 else s+='<rect x="-6" y="-22" width="5" height="21" rx="2.5"'+F(PANTS)+'/><rect x="1" y="-22" width="5" height="21" rx="2.5"'+F(PANTS)+'/><ellipse cx="-3.6" cy="-1.4" rx="3.6" ry="2"'+F(SHOE)+'/><ellipse cx="3.6" cy="-1.4" rx="3.6" ry="2"'+F(SHOE)+'/>';
 s+='<g transform="translate(0 '+dy+')">';const c=e.c,dc=dk(c);
 const arms=pose==='walk'?'<g class="arm l"'+rot(-14,-12.5,-46)+'><rect x="-15" y="-47" width="5" height="21" rx="2.5"'+F(dc)+'/></g><g class="arm r"'+rot(14,12.5,-46)+'><rect x="10" y="-47" width="5" height="21" rx="2.5"'+F(dc)+'/></g>':sit?'<rect x="-15" y="-47" width="5" height="16" rx="2.5"'+F(dc)+'/><rect x="10" y="-47" width="5" height="16" rx="2.5"'+F(dc)+'/>':'<rect x="-15" y="-47" width="5" height="21" rx="2.5"'+F(dc)+'/><rect x="10" y="-47" width="5" height="21" rx="2.5"'+F(dc)+'/>';
 if(e.k==='beanie'&&!ghost)s+='<path d="M-11 -58 a11 11 0 0 1 22 0 v6 h-22z" fill="'+dc+'"/>';
 s+=arms;
 const torso={blazer:'<rect x="-11" y="-50" width="22" height="30" rx="6"'+F(c)+'/>'+(ghost?'':'<path d="M-4 -50 L0 -40 L4 -50" fill="none" stroke="#FFFFFF" stroke-opacity=".5" stroke-width="1.6"/>'),
  hoodie:'<rect x="-12" y="-49" width="24" height="29" rx="9"'+F(c)+'/>'+(ghost?'':'<path d="M-6 -30 h12" stroke="#000" stroke-opacity=".18" stroke-width="1.6"/><path d="M-2.5 -48 v7 M2.5 -48 v7" stroke="#FFFFFF" stroke-opacity=".7" stroke-width="1.2"/>'),
  coat:'<path d="M-9 -50 L9 -50 L13 -19 L-13 -19 Z" stroke-linejoin="round"'+(ghost?G:' fill="'+c+'" stroke="'+c+'" stroke-width="4"')+'/>'+(ghost?'':'<path d="M0 -48 V-20" stroke="#000" stroke-opacity=".18" stroke-width="1.4"/><circle cx="2.6" cy="-38" r="1" fill="#FFFFFF" opacity=".7"/><circle cx="2.6" cy="-30" r="1" fill="#FFFFFF" opacity=".7"/>'),
  sweater:'<rect x="-10.5" y="-50" width="21" height="30" rx="10"'+F(c)+'/>'+(ghost?'':'<path d="M-7 -23 h1.4 M-4 -23 h1.4 M-1 -23 h1.4 M2 -23 h1.4 M5 -23 h1.4" stroke="#FFFFFF" stroke-opacity=".35" stroke-width="2"/>'),
  tee:'<rect x="-10" y="-49" width="20" height="28" rx="5"'+F(c)+'/>'+(ghost?'':'<path d="M-4 -49 a4 3 0 0 0 8 0" fill="'+SKIN+'"/>'),
  dress:'<path d="M-8 -50 Q-9 -40 -14 -19 L14 -19 Q9 -40 8 -50 Z"'+F(c)+'/>'}[e.body];
 s+=torso;if(!ghost)s+='<text x="0" y="-27" text-anchor="middle" font-family="Geist, ui-sans-serif, sans-serif" font-weight="600" font-size="6.2" fill="#FFFFFF" fill-opacity=".85">'+esc(ini)+'</text>';
 
 s+='<rect x="-3" y="-54" width="6" height="5"'+F(SKIN)+'/><circle cx="0" cy="-61" r="9.5"'+F(SKIN)+'/>';
 if(!ghost)s+='<ellipse cx="-3.3" cy="-60.5" rx="1.15" ry="1.4" fill="#2B2D31"/><ellipse cx="3.3" cy="-60.5" rx="1.15" ry="1.4" fill="#2B2D31"/>';
 const A=e.acc,H='#2B2D31';
 if(e.k==='headset')s+='<path d="M-9.6 -63 a9.6 9.6 0 0 1 19.2 0 c-3 -3 -8 -4.6 -12 -3.6 c-3 .8 -5 2 -7.2 3.6z"'+F(H)+'/><path d="M-10.6 -60 a10.6 11 0 0 1 21.2 0" fill="none" stroke="'+(ghost?'#6E6E68':A)+'" stroke-width="2"/><rect x="-12.6" y="-63" width="3.6" height="6.4" rx="1.6"'+F(A)+'/><rect x="9" y="-63" width="3.6" height="6.4" rx="1.6"'+F(A)+'/><path d="M-10.6 -58 q1 6 7 6.6" fill="none" stroke="'+(ghost?'#6E6E68':A)+'" stroke-width="1.4"/>';
 if(e.k==='beanie')s+='<path d="M-10 -63 a10 10.5 0 0 1 20 0z"'+F(A)+'/><rect x="-10.6" y="-65" width="21.2" height="4.4" rx="2.2"'+F(dk(A))+'/><circle cx="0" cy="-74" r="2.8"'+F(A)+'/>';
 if(e.k==='glasses')s+='<path d="M-10 -60 a10 10.5 0 0 1 20 0 v6 c0 1 -1.6 1 -1.6 0 v-6 c-2 -3.6 -12 -4 -16.8 0 v6 c0 1 -1.6 1 -1.6 0z"'+F(H)+'/>'+(ghost?'':'<circle cx="-3.6" cy="-60.5" r="2.9" fill="none" stroke="#2B2D31" stroke-width="1.2"/><circle cx="3.6" cy="-60.5" r="2.9" fill="none" stroke="#2B2D31" stroke-width="1.2"/><path d="M-.7 -60.8 h1.4" stroke="#2B2D31" stroke-width="1.2"/>');
 if(e.k==='scarf')s+='<path d="M-9.6 -62 a9.8 10 0 0 1 19.4 -1 c-4 -1 -9 -2.6 -11 -5.6 c-2 3 -5 5.6 -8.4 6.6z"'+F(H)+'/><rect x="-8" y="-52" width="16" height="5" rx="2.5"'+F(A)+'/><rect x="3" y="-49" width="4.6" height="13" rx="2"'+F(A)+'/>';
 if(e.k==='cap')s+='<path d="M-9.8 -62 a9.8 9.8 0 0 1 19.6 0z"'+F(A)+'/><path d="M6 -63.4 h9.4 a1.4 1.4 0 0 1 0 2.8 h-9.4z"'+F(A)+'/><circle cx="0" cy="-71" r="1.2"'+F(dk(c))+'/>';
 if(e.k==='bun')s+='<path d="M-9.8 -61 a9.8 10 0 0 1 19.6 0 c-4 -3 -12 -4 -19.6 0z"'+F(H)+'/><circle cx="0" cy="-73" r="4.6"'+F(H)+'/>'+(ghost?'':'<circle cx="-9.4" cy="-56.5" r="1.3" fill="'+A+'"/><circle cx="9.4" cy="-56.5" r="1.3" fill="'+A+'"/>');
 s+='</g>';
 if(sit)s+='<rect x="-11" y="-17" width="22" height="7" rx="3.5"'+F(PANTS)+'/><rect x="-9.5" y="-12" width="5" height="11" rx="2.5"'+F(PANTS)+'/><rect x="4.5" y="-12" width="5" height="11" rx="2.5"'+F(PANTS)+'/><ellipse cx="-7" cy="-1.4" rx="3.6" ry="2"'+F(SHOE)+'/><ellipse cx="7" cy="-1.4" rx="3.6" ry="2"'+F(SHOE)+'/>'+(ghost?'':'<path d="M-12 -31 L12 -31 L10 -17 L-10 -17 Z" fill="#B7BDC2"/><path d="M-12 -31 L12 -31 L11.6 -29.4 L-11.6 -29.4 Z" fill="#D7DBDF"/><circle cx="0" cy="-24" r="1.6" fill="#F4F4F1"/><circle class="arm-t l" cx="-12" cy="-18.5" r="2.6" fill="'+SKIN+'"/><circle class="arm-t r" cx="12" cy="-18.5" r="2.6" fill="'+SKIN+'"/>');
 return '<svg class="figure pose-'+pose+'" viewBox="-30 -96 60 104" aria-hidden="true" focusable="false">'+s+'</svg>'};
window.avatarHTML=function(a,size){const e=identityOf(a);return `<span class="av" style="--av:${e.c};--av-ink:#fff${size?';width:'+size+'px;height:'+size+'px':''}" aria-hidden="true">${esc(initialsOf(a.name))}</span>`};
/* ---- human copy: raw status -> <= 4 plain words. Full detail stays in the drawer. ---- */
const ACT={'web.fetch':'Reading the web','notes.write':'Writing a note','notes.delete':'Tidying notes','work.handoff':'Handing off work'};
const STOP=/^(the|a|an)$/i,CUT=/^(for|to|on|with|about|from|of|in|at|into|via|using|by)$/i;
function shortTitle(t){let w=String(t||'').replace(/[“”"']/g,'').replace(/\s+/g,' ').trim().split(' ').filter(x=>!STOP.test(x));const out=[];let more=false;for(let i=0;i<w.length;i++){const x=w[i];if(out.length>=2&&CUT.test(x))break;if(out.length===4){more=true;break}out.push(x)}
 let s=out.join(' ').replace(/[.,:;·…-]+$/,'');if(s.length>32){s=s.slice(0,32).replace(/\s+\S*$/,'');more=true}if(!s)return '';return s.charAt(0).toUpperCase()+s.slice(1)+(more?'…':'')}
window.humanStatus=function(a){if(!a)return '';const p=presence(a);if(p==='reconnect')return 'Reconnect needed';if(p==='prepared')return 'Not connected yet';if(p==='waiting')return 'Waiting to connect';if(p==='revoked'||a.revoked)return 'Access revoked';
 if(a.st==='needs')return 'Needs you';if(a.st==='blocked')return 'Blocked';if(a.st==='paused')return 'Paused';if(a._ambient)return 'On a break';
 const n=String(a.now||'').trim();let m;
 if(/^Kill switch/i.test(n))return 'Paused';if(/^Waiting for approval/i.test(n))return 'Needs you';if(/^Ambient/i.test(n))return 'On a break';
 if((m=n.match(/^Working(?: on)?:\s*(.*)$/i))){const x=m[1].trim();return ACT[x]||shortTitle(x)||'Working'}
 if(/^Handing /i.test(n))return 'Handing off work';if(/^Received:/i.test(n))return 'Got new work';
 if(/^Task still open/i.test(n))return 'No recent update';if(/^(Available|Standing by|Connected, waiting|Idle)/i.test(n)||!n)return a.st==='done'?'Just finished':'Available';
 if(a.st==='done')return 'Just finished';
 return shortTitle(n.replace(/^[A-Z][\w ]{0,18}:\s*/,''))||'Working'};
window.statusKind=function(a){const p=presence(a);if(p==='reconnect')return 'reconnect';if(p==='prepared'||p==='waiting')return p;if(p==='revoked'||a.revoked||a.st==='paused')return 'paused';if(a.st==='needs')return 'needs';if(a.st==='blocked')return 'blocked';if(['working','handoff','meeting'].includes(a.st))return 'working';return 'idle'};
/* ---- one label at a time, collision-avoided ---- */
let LBL=null;
function showLabel(a,sticky){const layer=$('#worker-labels');if(!layer||!a||!a.el)return;let l=$('#floor-label');if(!l){l=document.createElement('div');l.id='floor-label';l.className='floor-label';l.setAttribute('aria-hidden','true');layer.appendChild(l)}
 LBL=a.id;const k=statusKind(a);l.dataset.kind=k;l.innerHTML='<b>'+esc(a.name)+'</b><span><i class="d" aria-hidden="true"></i>'+esc(humanStatus(a))+'</span>';l.style.display='block';l.style.visibility='hidden';
 const fr=$('#floor').getBoundingClientRect(),fig=a.el.querySelector('.avs').getBoundingClientRect(),w=l.offsetWidth,h=l.offsetHeight;
 const R=r=>({left:r.left-fr.left,top:r.top-fr.top,right:r.right-fr.left,bottom:r.bottom-fr.top});const me=R(fig);
 const obst=[...document.querySelectorAll('#floor .zone-sign')].map(e=>R(e.getBoundingClientRect())).concat(agents.filter(b=>b!==a&&b.el).map(b=>R(b.el.querySelector('.avs').getBoundingClientRect())));
 ['#floor-approval','#diorama-tools'].forEach(s=>{const e=$(s);if(e&&e.offsetParent){obst.push(R(e.getBoundingClientRect()))}});
 const cx=(me.left+me.right)/2,cands=[[cx-w/2,me.top-h-6],[me.right+6,me.top+(me.bottom-me.top)*.25],[me.left-w-6,me.top+(me.bottom-me.top)*.25],[cx-w/2,me.bottom+4],[me.right+6,me.top-h*.6],[me.left-w-6,me.top-h*.6]];
 const fw=fr.width,fh=fr.height;let best=null;
 for(const [x0,y0] of cands){const x=Math.max(2,Math.min(fw-w-2,x0)),y=Math.max(2,Math.min(fh-h-2,y0));const r={left:x,top:y,right:x+w,bottom:y+h};const hits=obst.filter(o=>o.left<r.right&&r.left<o.right&&o.top<r.bottom&&r.top<o.bottom).length+((r.left<me.right&&me.left<r.right&&r.top<me.bottom&&me.top<r.bottom)?2:0);if(!best||hits<best.h){best={x,y,h:hits};if(!hits)break}}
 l.style.left=best.x+'px';l.style.top=best.y+'px';l.style.visibility='visible';l.dataset.sticky=sticky?'1':''}
function hideLabel(a){const l=$('#floor-label');if(!l)return;if(DR&&byId[DR]&&byId[DR].el){showLabel(byId[DR],true);return}l.style.display='none';LBL=null}
window.HQ_LABEL={show:showLabel,hide:hideLabel};
/* ---------- placement ---------- */
homeOf=function(a){const p=presence(a);if(p==='prepared'||p==='waiting'){const list=agents.filter(b=>{const q=presence(b);return q==='prepared'||q==='waiting'});const i=Math.max(0,list.findIndex(b=>b.id===a.id));return ARRIVALS[i%ARRIVALS.length]}
 const pts=POINTS[a.room]||POINTS.ops;const slot=(a.room==='sales'||a.room==='support')?agents.filter(b=>b.room==='sales'||b.room==='support').findIndex(b=>b.id===a.id):a.slot;const v=pts[slot%4];return [v[0]+Math.floor(slot/4)*1.1,v[1]+Math.floor(slot/4)*.8]};
const oldMk=mkEl;mkEl=function(a){oldMk(a);a._fig='';const b=a.el.querySelector('.body');['.bub','.tok','.tag2','.bdg','.gnd'].forEach(s=>{const x=a.el.querySelector(s);if(x){x.hidden=true;x.setAttribute('aria-hidden','true')}});const d=document.createElement('i');d.className='sdot';d.setAttribute('aria-hidden','true');b.appendChild(d);drawFig(a);a.el.setAttribute('aria-label','Open '+a.name+' details');a.el.addEventListener('mouseenter',()=>showLabel(a));a.el.addEventListener('mouseleave',()=>hideLabel(a));a.el.addEventListener('focus',()=>showLabel(a));a.el.addEventListener('blur',()=>hideLabel(a));};
const poseOf=a=>a.el&&a.el.classList.contains('walk')&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'walk':(['working','handoff','meeting'].includes(a.st)&&!a._motion&&!a._approvalWalking&&!a._approvalArrival&&presence(a)==='connected'?'sit':'stand');
function drawFig(a){if(!a.el)return;const p=presence(a),pose=poseOf(a),key=p+'|'+a.name+'|'+pose+'|'+(castMap[a.id]);if(a._fig===key)return;a._fig=key;const av=a.el.querySelector('.avs');if(av)av.innerHTML=figureSVG(a,{ghost:p==='prepared'||p==='waiting',pose})}
updAv=function(a){if(a.el){a._fig='';drawFig(a)}};
let zoom=1;
function compact(){const v=$('#v-office');return !v||v.clientWidth<1100}
function fit(){const v=$('#v-office'),f=$('#floor'),wrap=f&&f.parentElement;if(!v||!f||!wrap)return;const c=compact();v.classList.toggle('compact',c);
 const w=wrap.clientWidth-(c?(innerWidth<760?20:32):24),h=c?1e9:Math.max(260,wrap.clientHeight-24),base=Math.max(280,Math.min(w,h*ASPECT));
 const pz=(c&&innerWidth<760)?(window.HQ_PHONE_ZOOM||Math.max(1.3,Math.min(1.45,innerHeight*.4*ASPECT/Math.max(1,w)))):1;f.style.setProperty('--floor-width',base*zoom*pz+'px');f.style.setProperty('--floor-height',base*zoom*pz/ASPECT+'px');if(pz>1){const fwid=String(Math.round(base*zoom*pz));if(wrap.dataset.fw!==fwid&&!wrap.dataset.panned){wrap.dataset.fw=fwid;requestAnimationFrame(()=>{wrap.scrollLeft=(wrap.scrollWidth-wrap.clientWidth)/2})}}placeCard()}
function placeCard(){const card=$('#floor-approval'),f=$('#floor'),v=$('#v-office');if(!card||!f||!v)return;if(compact()){card.style.left='';card.style.top='';return}
 const fr=f.getBoundingClientRect(),vr=v.getBoundingClientRect(),isl=W2P(106,96);let x=fr.left-vr.left+fr.width*isl[0]/100+28,y=fr.top-vr.top+fr.height*isl[1]/100-card.offsetHeight*.72;
 const sg=document.querySelector('.zone-sign.appr');if(sg){const sr=sg.getBoundingClientRect();x=Math.max(x,sr.right-vr.left+12)}x=Math.min(x,vr.width-card.offsetWidth-16);y=Math.max(12,Math.min(y,vr.height-card.offsetHeight-12));if(sg){const sr=sg.getBoundingClientRect(),L=sr.left-vr.left,R=sr.right-vr.left,T=sr.top-vr.top,B=sr.bottom-vr.top,h=card.offsetHeight;if(x<R&&x+card.offsetWidth>L&&y<B&&y+h>T){y=(T-h-10>=12)?T-h-10:Math.min(B+10,vr.height-h-12)}}{const lg=document.querySelector('.zone-sign[data-room=lounge]');if(lg){const r=lg.getBoundingClientRect(),L=r.left-vr.left,R=r.right-vr.left,T=r.top-vr.top,B=r.bottom-vr.top,h=card.offsetHeight;if(x<R&&x+card.offsetWidth>L&&y<B&&y+h>T){y=(B+10+h<=vr.height-12)?B+10:Math.max(12,T-h-10)}}}card.style.left=x+'px';card.style.top=y+'px';
 const lead=$('#fa-lead');if(lead){const ip=W2P(104,100);lead.setAttribute('x1',ip[0]+'%');lead.setAttribute('y1',ip[1]+'%');lead.setAttribute('x2',((x-(fr.left-vr.left))/fr.width*100)+'%');lead.setAttribute('y2',((y+card.offsetHeight*.5-(fr.top-vr.top))/fr.height*100)+'%')}}
function list(){const el=$('#floor-workers');if(!el)return;const head='<div class="fw-h"><span class="eyebrow">On the floor</span><span class="fw-n">'+agents.length+'</span></div>';
  el.innerHTML=head+agents.map(a=>{const p=presence(a);return '<button data-worker="'+a.id+'" class="fw p-'+p+'" data-kind="'+statusKind(a)+'">'+avatarHTML(a,26)+'<span class="fw-t"><b>'+esc(a.name)+'</b><small><i class="d" aria-hidden="true"></i>'+esc(humanStatus(a))+'</small></span></button>'}).join('');
 el.querySelectorAll('button[data-worker]').forEach(b=>b.onclick=()=>{const a=byId[b.dataset.worker];if(!a)return;openDr(a.id);});}
buildFloor=function(){const f=$('#floor');
 const signs=Object.entries(SIGNS).map(([k,v])=>{const p=signPct(...v);return '<div class="zone-sign" data-room="'+k+'" data-type="'+ROOM_MAP[k]+'" style="left:'+p[0]+'%;top:'+p[1]+'%">'+roomIcon(k)+'<span class="zs-name">'+esc(typeOf(k).name)+'</span><span id="ct-'+k+'"></span></div>'}).join('');
 const ap=signPct(108,92,2),ar=signPct(60,110,0);
 f.innerHTML='<img class="environment" src="'+ASSET+'/floor.svg" alt="'+esc(BRAND.name)+' HQ floor: '+['finance','marketing','sales','ops'].map(k=>typeOf(k).name).join(', ')+', '+typeOf('lounge').name+', an arrivals pad and the approval island in the middle" draggable="false"><svg class="fa-lead-layer" aria-hidden="true" focusable="false"><line id="fa-lead" x1="0" y1="0" x2="0" y2="0"/></svg><div id="deskl"></div><div id="chl"></div><div id="worker-labels" style="position:absolute;inset:0;z-index:1400;pointer-events:none"></div>'+signs+'<div class="zone-sign appr" style="left:'+ap[0]+'%;top:'+ap[1]+'%"><span class="zs-name">Needs you</span><span id="ct-approval"></span></div><div class="zone-sign arrivals" style="left:'+ar[0]+'%;top:'+ar[1]+'%"><span class="zs-name">Arrivals</span></div>';renderProps();
 agents.forEach(a=>{mkEl(a);a._nextAmbient=Date.now()+20000;a._approvalWalking=false;a._approvalArrival=false;a._approvalLoop=(a._approvalLoop||0)+1;const p=homeOf(a);setPos(a,...p,0);paint(a)});
 let tools=$('#diorama-tools');if(!tools){tools=document.createElement('div');tools.id='diorama-tools';tools.className='floor-tools';tools.setAttribute('role','group');tools.setAttribute('aria-label','Zoom');tools.innerHTML='<button id="zoom-out" aria-label="Zoom out office">−</button><button id="zoom-in" aria-label="Zoom in office">+</button>';$('#v-office').appendChild(tools);$('#zoom-in').onclick=()=>{zoom=Math.min(1.6,zoom+.15);fit()};$('#zoom-out').onclick=()=>{zoom=Math.max(.8,zoom-.15);fit()};const l=document.createElement('div');l.id='floor-workers';l.className='floor-worker-list';l.setAttribute('aria-label','Employees');$('#v-office').appendChild(l);const wrap=$('#floor').parentElement;if(wrap)wrap.addEventListener('scroll',placeCard,{passive:true});}fit();list();};drawDesks=function(){};
const oldPaint=paint;paint=function(a){oldPaint(a);const e=a.el;if(e){const p=presence(a);a.presence=p;e.style.setProperty('--col',identityOf(a).c);
  if(p==='prepared')a.now='Prepared · not connected yet';else if(p==='waiting')a.now='Waiting for bot · no report yet';else if(p==='reconnect')a.now='Reconnect needed · authorization dropped';
  e.classList.toggle('p-prepared',p==='prepared');e.classList.toggle('p-waiting',p==='waiting');e.classList.toggle('p-reconnect',p==='reconnect');e.dataset.presence=p;
   const k=statusKind(a);e.dataset.kind=k;const sd=e.querySelector('.sdot');if(sd&&sd.dataset.k!==k){sd.dataset.k=k;sd.innerHTML=k==='reconnect'?presenceIcon('reconnect'):''}e.classList.toggle('at-island',!!a._approvalArrival);e.setAttribute('aria-label',a.name+': '+humanStatus(a)+'. Open details');drawFig(a)}
  if(LBL===a.id&&a.el&&$('#floor-label'))showLabel(a,$('#floor-label').dataset.sticky==='1');list();const isl=$('#pv-island');if(isl&&isl.dataset.n!==String(G.approvals.length)){isl.dataset.n=G.approvals.length;isl.innerHTML=islandSVG(G.approvals.length)}
 const cnt=k=>agents.filter(b=>(k==='sales'?(b.room==='sales'||b.room==='support'):b.room===k)&&['connected','reconnect'].includes(presence(b))).length;
 ['finance','marketing','sales','ops','lounge'].forEach(k=>{const c=$('#ct-'+k);if(c)c.textContent=cnt(k)});const ca=$('#ct-approval');if(ca)ca.textContent=G.approvals.length||'';};
workDestination=function(kind,a){const lane=(a.slot%3-1)*3;return kind==='research'?{point:W2P(18+lane,22),place:typeOf('finance').name,bubble:'Research stop',carry:'Research brief'}:kind==='notes'?{point:W2P(64+lane,66),place:typeOf('ops').name,bubble:'Working on notes',carry:'Document'}:{point:W2P(97+lane,63),place:typeOf('lounge').name,bubble:'Coffee break',carry:'Coffee'};};
const RECON='<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6.6 9.4 9.4 6.6M4.9 8.2 3.6 9.5a2.3 2.3 0 0 0 3.2 3.2l1.3-1.3M11.1 7.8l1.3-1.3a2.3 2.3 0 0 0-3.2-3.2L7.9 4.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
/* old always-on name cards are gone: the single #floor-label (showLabel) replaces them */
function workerLabel(a){const o=document.querySelector('#worker-labels [data-label="'+a.id+'"]');if(o)o.remove()}
// Movement is presentation only: approve/deny still uses the existing owner route.
const pendingFor=a=>G.approvals.filter(r=>r.a.id===a.id);
const oldSetPos=setPos;setPos=function(a,x,y,ms){oldSetPos(a,x,y,ms);const z=Math.round(y*10);a.el.style.zIndex=z;a.el.style.setProperty('--worker-x',x+'%');a.el.style.setProperty('--worker-y',y+'%');a.el.style.setProperty('--worker-z',z);workerLabel(a);};
walk=async function(a,x,y){const token=a._walkEpoch=(a._walkEpoch||0)+1,el=a.el;const check=()=>a._walkEpoch===token&&a.el===el;
 if(matchMedia('(prefers-reduced-motion: reduce)').matches||document.hidden){setPos(a,x,y,0);return}if(Math.abs(a.x-x)+Math.abs(a.y-y)<.6)return;a.el.classList.add('walk');drawFig(a);if(LBL===a.id)hideLabel(a);
 const pts=route(P2W(a.x,a.y),P2W(x,y)).map(p=>W2P(...p));pts[pts.length-1]=[x,y];
 for(let k=0;k<pts.length;k++){if(!check())return;const n=pts.length;a.el.style.transitionTimingFunction=n===1?'cubic-bezier(.45,.05,.3,1)':k===0?'cubic-bezier(.42,0,1,1)':k===n-1?'cubic-bezier(0,0,.3,1)':'linear';await walkStep(a,...pts[k])}if(check()){a.el.style.transitionTimingFunction='';a.el.classList.remove('walk');drawFig(a)}};
function floorCard(){let card=$('#floor-approval');if(!card){card=document.createElement('div');card.id='floor-approval';card.setAttribute('role','region');card.setAttribute('aria-live','polite');card.setAttribute('aria-label','Approval island');$('#v-office').appendChild(card)}
 const ready=G.approvals.filter(r=>r.a._approvalArrival);card.style.display=ready.length?'block':'none';$('#v-office').classList.toggle('has-card',!!ready.length);if(!ready.length)return;const r=ready[0],a=r.a,rawq=(LS.requests||[]).find(q=>q.id===r.reqId)||{};
 const key=r.id+'|'+ready.length;if(card.dataset.key!==key){card.dataset.key=key;
 card.innerHTML='<div class="fa-top"><span><i aria-hidden="true"></i>Needs you</span><span>'+(ready.length>1?'1 of '+ready.length:'')+'</span></div><div class="fa-body"><div class="fa-who">'+avatarHTML(a,36)+'<div><b>'+esc(a.name)+'</b><small>'+esc((ROOMS[a.room]||ROOMS.ops).n.toLowerCase().replace(/\b\w/g,m=>m.toUpperCase()))+(ACT[rawq.action]?' · '+ACT[rawq.action]:'')+'</small></div></div><p class="fa-text">'+r.text+'</p><div class="fa-act"><button class="btn grn lg" data-r="'+r.id+'" data-d="approve" aria-keyshortcuts="A">Approve once <kbd aria-hidden="true">A</kbd></button><button class="btn red lg" data-r="'+r.id+'" data-d="deny" aria-keyshortcuts="D">Deny <kbd aria-hidden="true">D</kbd></button></div></div>';}
 requestAnimationFrame(placeCard)}
function approvalMove(a){const qs=pendingFor(a);if(qs.length){if(a._approvalWalking||a._approvalArrival)return;const token=a._approvalLoop=(a._approvalLoop||0)+1;a._approvalWalking=true;renderTray();a._pos='appr';a.bub='Walking to Needs Approval';a.carry='Request';paint(a);const i=Math.max(0,G.approvals.findIndex(r=>r.a.id===a.id)),p=ASLOT[i%ASLOT.length];walk(a,...p).then(()=>{if(a._approvalLoop!==token||!pendingFor(a).length)return;a._approvalWalking=false;a._approvalArrival=true;a.carry=null;renderTray();a.bub='Waiting for your decision';paint(a);floorCard()});}
 else if(a._approvalWalking||a._approvalArrival){a._approvalLoop=(a._approvalLoop||0)+1;a._approvalWalking=false;a._approvalArrival=false;a._pos='home';a.bub='Returning to my workstation';a.carry=null;paint(a);floorCard();goHome(a).then(()=>{a.bub=null;paint(a)})}}
const oldApply=applyState;applyState=function(s){const before={};agents.forEach(a=>before[a.id]=a.presence);oldApply(s);
 agents.forEach(a=>{const p=presence(a);if(before[a.id]&&before[a.id]!==p){a.presence=p;a._fig='';paint(a);const h=homeOf(a);walk(a,...h)}});agents.forEach(approvalMove);floorCard()};
const oldRenderTray=renderTray;renderTray=function(){oldRenderTray();const waiting=G.approvals.some(r=>r.a._approvalWalking&&!r.a._approvalArrival);if(waiting&&$('#v-office').classList.contains('on')&&location.hash!=='#approvals'){const strip=$('#strip');strip.className='walking';const w=G.approvals.find(r=>r.a._approvalWalking&&!r.a._approvalArrival);strip.innerHTML=esc(w?w.a.name:'Someone')+' is bringing you a request. <a href="#approvals">Review</a>';}floorCard();fit();};
ambientTrip=async function(a){if(presence(a)!=='connected'){a._nextAmbient=Date.now()+22000;return}const token=a._motionToken=(a._motionToken||0)+1,el=a.el;a._motion=true;a._ambient=true;const valid=()=>a._motionToken===token&&a.el===el&&a.st==='idle'&&!a.revoked&&!G.paused&&!document.hidden&&presence(a)==='connected';try{a._motionPlace='Ambient: lounge break';a.bub='Ambient: lounge break';paint(a);await walk(a,...POINTS.lounge[a.slot%4]);if(!valid())return;await sleep(3500);if(!valid())return;await goHome(a)}finally{if(a._motionToken===token){a._motion=false;a._ambient=false;a._motionPlace=null;a.bub=null;paint(a);a._nextAmbient=Date.now()+22000}}};
const _oDr=openDr;openDr=function(id){_oDr(id);const a=byId[id];if(a&&a.el&&$('#v-office').classList.contains('on'))showLabel(a,true)};const _cDr=closeDr;closeDr=function(){_cDr.apply(this,arguments);const l=$('#floor-label');if(l){l.style.display='none';LBL=null}};
window.HQ_FLOOR={W2P,P2W,route,fit,ROOM_TYPES,ROOM_MAP};
setLayout();buildFloor();agents.forEach(a=>a._pos='home');window.addEventListener('resize',()=>{fit();agents.forEach(approvalMove)});window.addEventListener('hashchange',()=>{fit();renderTray()});
})();
