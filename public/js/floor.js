/* Black Box vNext · floor (A, H, I, J). Full bleed, no signs or labels: bots are just figures.
   Art: /hq/floor.svg environment + isometric props + per-bot figures, all in the floor's projection
   (viewBox 60 40 1320 750, iso K=5.2, origin 720,96). Placement is presentation only: every state comes from BB.S. */
(function () {
  'use strict';
  const BB = window.BB, $ = BB.$, esc = BB.esc;
  /* ---------- projection ---------- */
  const PJ = { K: 5.2, OX: 720, OY: 96, X0: 60, Y0: 40, W: 1320, H: 750 }, ASPECT = PJ.W / PJ.H;
  const W2P = (x, y) => [+(((PJ.OX + (x - y) * PJ.K) - PJ.X0) / PJ.W * 100).toFixed(2), +(((PJ.OY + (x + y) * PJ.K * .5) - PJ.Y0) / PJ.H * 100).toFixed(2)];
  const P2W = (px, py) => { const sx = px / 100 * PJ.W + PJ.X0, sy = py / 100 * PJ.H + PJ.Y0, d = (sx - PJ.OX) / PJ.K, s = 2 * (sy - PJ.OY) / PJ.K; return [(s + d) / 2, (s - d) / 2]; };
  /* ---------- rooms: backend keys stay ops/sales/marketing/finance/support/lounge; presentation maps to room types ---------- */
  const ROOMK = ['ops', 'sales', 'marketing', 'finance', 'support', 'lounge'];
  const BOXW = { finance: [4, 4, 42, 42], marketing: [50, 4, 116, 40], sales: [4, 50, 40, 116], ops: [50, 48, 82, 82], lounge: [88, 48, 116, 78] };
  BOXW.support = BOXW.sales; BOXW.call = [60, 85, 80, 102];
  const SEATW = { finance: [[12, 18.6], [26, 18.6], [12, 32.6], [26, 32.6]], marketing: [[60, 16.6], [74, 16.6], [88, 16.6], [60, 31.6]], sales: [[12, 64.6], [26, 64.6], [12, 80.6], [26, 80.6]], ops: [[58, 59.6], [72, 59.6], [58, 73.6], [72, 73.6]], lounge: [[95, 57.5], [100, 57.5], [95, 68], [100, 68]] };
  SEATW.support = SEATW.sales;
  const ROOM_TYPES = { studio: { name: 'Studio', props: ['easel', 'canvases', 'tripod'], verb: 'designing' }, library: { name: 'Library', props: ['bookcase', 'bookcase', 'armchair'], verb: 'reading' },
    workshop: { name: 'Workshop', props: ['bench', 'toolbox', 'crates'], verb: 'building' }, mailroom: { name: 'Mailroom', props: ['pigeonholes', 'parcels', 'cart'], verb: 'writing' },
    lounge: { name: 'Lounge', props: ['records', 'mugs', 'beanbag'], verb: 'taking a break' },
    callcenter: { name: 'Call center', props: [], verb: 'with you' } };
  const ROOM_MAP = Object.assign({ finance: 'library', marketing: 'studio', sales: 'mailroom', support: 'mailroom', ops: 'workshop', lounge: 'lounge', call: 'callcenter' }, window.HQ_ROOMS || {});
  const typeOf = k => ROOM_TYPES[ROOM_MAP[k]] || ROOM_TYPES.workshop;
  BB.roomName = k => typeOf(k).name;
  BB.ROOMS = ['finance', 'marketing', 'sales', 'ops', 'lounge'];
  BB.roomOf = a => { const as = BB.agents(), i = Math.max(0, as.findIndex(x => x.id === a.id)); const r = a.visibleRoom || a.room; return ROOMK.includes(r) ? r : ROOMK[i % ROOMK.length]; };
  BB.homeRoomOf = a => { const as = BB.agents(), i = Math.max(0, as.findIndex(x => x.id === a.id)); return ROOMK.includes(a.room) ? a.room : ROOMK[i % ROOMK.length]; };
  const ARRIVALS = [[47, 104], [53, 108], [47, 112], [55, 114], [51, 100], [57, 110]].map(p => W2P(...p));
  /* island (b): doorway tray. Bots wait at its front edge. */
  const TRAY_SLOTS = [[94, 109.5], [102, 109.5], [111.5, 104]].map(p => W2P(...p));
  /* walk graph: rooms connect through their doors to corridor hubs */
  const NODES = { fin_in: [22, 36], fin_door: [22, 45], fin_in2: [36, 26], fin_door2: [46, 26], mkt_in: [80, 34], mkt_door: [80, 45], sal_in: [34, 62], sal_door: [46, 62], ops_in: [66, 77], ops_door: [66, 86], ops_in2: [77, 64], ops_door2: [86, 64], hub_w: [46, 45], hub_e: [86, 45], hub_s: [46, 86], hub_se: [86, 86], lng: [90, 62], isl: [88, 109], arr: [50, 96] };
  const EDGES = [['fin_in', 'fin_door'], ['fin_door', 'hub_w'], ['fin_in2', 'fin_door2'], ['fin_door2', 'hub_w'], ['mkt_in', 'mkt_door'], ['mkt_door', 'hub_w'], ['mkt_door', 'hub_e'], ['sal_in', 'sal_door'], ['sal_door', 'hub_w'], ['sal_door', 'hub_s'], ['ops_in', 'ops_door'], ['ops_door', 'hub_s'], ['ops_door', 'hub_se'], ['ops_in2', 'ops_door2'], ['ops_door2', 'hub_e'], ['ops_door2', 'hub_se'], ['hub_e', 'lng'], ['hub_se', 'lng'], ['hub_se', 'isl'], ['hub_s', 'isl'], ['hub_s', 'arr'], ['arr', 'isl']];
  const ENTRY = { finance: ['fin_in', 'fin_in2'], marketing: ['mkt_in'], sales: ['sal_in'], support: ['sal_in'], ops: ['ops_in', 'ops_in2'], lounge: ['lng'], island: ['isl'], arrivals: ['arr'] };
  const zoneOf = ([x, y]) => { for (const k of ['finance', 'marketing', 'sales', 'ops', 'lounge']) { const b = BOXW[k]; if (x >= b[0] - .5 && x <= b[2] + .5 && y >= b[1] - .5 && y <= b[3] + .5) return k; } if (x > 86 && y > 86) return 'island'; if (y > 92 && x < 64) return 'arrivals'; return null; };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const ADJ = {}; EDGES.forEach(([a, b]) => { (ADJ[a] = ADJ[a] || []).push(b); (ADJ[b] = ADJ[b] || []).push(a); });
  function route(from, to) {
    const zf = zoneOf(from), zt = zoneOf(to); if (zf && zf === zt) return [to];
    const near = p => Object.keys(NODES).filter(k => /hub|door|lng|isl|arr/.test(k)).sort((a, b) => dist(NODES[a], p) - dist(NODES[b], p))[0];
    const starts = zf ? ENTRY[zf] : [near(from)], ends = zt ? ENTRY[zt] : [near(to)];
    let best = null;
    for (const s of starts) for (const e of ends) {
      const D = {}, Pv = {}, Q = new Set(Object.keys(NODES)); Object.keys(NODES).forEach(k => D[k] = 1e9); D[s] = dist(from, NODES[s]);
      while (Q.size) { let u = null; Q.forEach(k => { if (u === null || D[k] < D[u]) u = k; }); Q.delete(u); if (u === e) break; (ADJ[u] || []).forEach(v => { const d = D[u] + dist(NODES[u], NODES[v]); if (d < D[v]) { D[v] = d; Pv[v] = u; } }); }
      const tot = D[e] + dist(NODES[e], to); if (!best || tot < best.t) { const path = []; let k = e; while (k) { path.unshift(NODES[k]); k = Pv[k]; } best = { t: tot, path }; }
    }
    return best ? [...best.path, to] : [to];
  }

  /* ---------- props: tiny isometric drawings in the floor projection (ported from round 2) ---------- */
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
const FOOT={bookcase:[2.2,6],armchair:[4.5,4.5],easel:[1.6,4.6],canvases:[1.9,4],tripod:[2,2],bench:[9,3],toolbox:[4,2.4],crates:[5,5],pigeonholes:[2,7],parcels:[5,3.4],cart:[4,3],maptable:[7,5],board:[.4,6],flags:[3.2,1],servers:[2.5,4],flasks:[5,3],records:[4,3],mugs:[3.6,3],beanbag:[3.6,3.6],counter:[3,8],bell:[.5,.5],planter:[6,3],tree:[2,2],safe:[3.4,3.4]};
/* depth of a prop = depth of its footprint centre, on the same scale figures use (z = round(y% * 10)) */
const propZ=(kind,x,y)=>{const f=FOOT[kind]||[3,3];return Math.round(W2P(x+f[0]/2,y+f[1]/2)[1]*10)};
function propsSVG(){let items=[];for(const k in SLOTS){const t=typeOf(k);SLOTS[k].forEach((sl,i)=>{const kind=t.props[i%t.props.length];if(PROPS[kind])items.push([sl[0]+sl[1],PROPS[kind](sl[0],sl[1]),propZ(kind,sl[0],sl[1]),kind,sl[0],sl[1]])})}
 items.sort((a,b)=>a[0]-b[0]);return items}
  /* ---------- figures: six characters, distinct silhouettes (ported from round 2) ---------- */
const SKIN='#EBDDCB',PANTS='#34322F',SHOE='#1E1D1B';
function figureSVG(a,opts){opts=opts||{};const e=opts.cast!=null?BB.CAST[opts.cast]:BB.cast(a),ghost=!!opts.ghost,pose=opts.pose||'stand',ini=BB.initials(a.name);
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
 return '<svg class="figure pose-'+pose+'" viewBox="-30 -96 60 104" aria-hidden="true" focusable="false">'+s+'</svg>'}

  /* ---------- island (b): flat porcelain plinth, 1px ink outline, inset glass tray, paper, vermilion dot only while something waits ---------- */
  const IP = (x, y, z) => [PJ.OX + (x - y) * PJ.K, PJ.OY + (x + y) * PJ.K * .5 - (z || 0) * PJ.K];
  const IPS = a => a.map(q => q.map(v => v.toFixed(1)).join(',')).join(' ');
  function islandB() {
    const x = 87, y = 93, w = 22, d = 13, h = .9, st = ' stroke="#121212" stroke-width="1.1" stroke-linejoin="round"';
    const T = [IP(x, y, h), IP(x + w, y, h), IP(x + w, y + d, h), IP(x, y + d, h)], L = [IP(x, y + d, 0), IP(x + w, y + d, 0), IP(x + w, y + d, h), IP(x, y + d, h)], R = [IP(x + w, y, 0), IP(x + w, y + d, 0), IP(x + w, y + d, h), IP(x + w, y, h)];
    const sc = IP(98, 100, 0);
    let s = `<ellipse cx="${sc[0].toFixed(1)}" cy="${(sc[1] + 6).toFixed(1)}" rx="110" ry="30" fill="#121212" opacity=".05"/>`;
    s += `<polygon points="${IPS(L)}" fill="#E6E6E1"${st}/><polygon points="${IPS(R)}" fill="#DADAD4"${st}/><polygon points="${IPS(T)}" fill="#F4F4F1"${st}/>`;
    s += `<polygon points="${IPS([IP(90, 95.5, h), IP(106, 95.5, h), IP(106, 103.5, h), IP(90, 103.5, h)])}" fill="rgba(255,255,255,.75)" stroke="#121212" stroke-opacity=".55" stroke-width=".8"/>`;
    s += `<polygon points="${IPS([IP(90.8, 96.2, h), IP(105.2, 96.2, h), IP(105.2, 97.4, h), IP(90.8, 97.4, h)])}" fill="rgba(18,18,18,.05)"/>`;
    s += `<polygon class="paper" points="${IPS([IP(93, 98, h + .2), IP(99, 98, h + .2), IP(99, 101.5, h + .2), IP(93, 101.5, h + .2)])}" fill="#fff" stroke="rgba(18,18,18,.25)" stroke-width=".5"/>`;
    const dt = IP(104, 101.5, h);
    s += `<circle class="dot-halo" cx="${dt[0].toFixed(1)}" cy="${dt[1].toFixed(1)}" r="10" fill="#E2452B" opacity=".14"/><circle class="dot" cx="${dt[0].toFixed(1)}" cy="${dt[1].toFixed(1)}" r="5" fill="#E2452B"/>`;
    return s;
  }

  /* ---------- floor controller ---------- */
  const F = {};             // figure records by bot id
  let built = false, zoom = 1, pan = [0, 0], fw = 1260, hoverRoom = null;
  const floorEl = () => $('#floor'), stageEl = () => $('#stage');
  const sx = p => p[0] / 100 * PJ.W + PJ.X0, sy = p => p[1] / 100 * PJ.H + PJ.Y0;   // % -> floor svg units

  function build() {
    const f = floorEl(); if (!f || built) return; built = true;
    const roomPolys = BB.ROOMS.concat('call').map(k => { const b = BOXW[k], pts = [W2P(b[0], b[1]), W2P(b[2], b[1]), W2P(b[2], b[3]), W2P(b[0], b[3])]; return `<polygon data-room="${k}" tabindex="0" role="img" points="${pts.map(p => p.join(',')).join(' ')}"><title>${esc(typeOf(k).name)}</title></polygon>`; }).join('');
    f.innerHTML = `<img class="environment" src="/hq/floor.svg" alt="" draggable="false">`
      + `<svg class="layer" id="rooms" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Rooms">${roomPolys}</svg>`
      + `<svg class="layer" id="fx" viewBox="${PJ.X0} ${PJ.Y0} ${PJ.W} ${PJ.H}" aria-hidden="true"><defs><radialGradient id="pvLamp"><stop offset="0" stop-color="#FFE7B0" stop-opacity=".55"/><stop offset="1" stop-color="#FFE7B0" stop-opacity="0"/></radialGradient></defs><g id="tray">${islandB()}</g><g id="ring"><ellipse cx="0" cy="0" rx="24" ry="9.5" fill="rgba(18,18,18,.06)" stroke="#121212" stroke-opacity=".55" stroke-width="1.3"/></g><g id="collab"></g></svg>`
      + `<div id="chl"></div><div id="ov"><div class="tip" id="tip" role="tooltip"></div><div class="isl-card" id="islcard" role="region" aria-label="Request at the tray"></div></div>`;
    const chl = $('#chl');
    propsSVG().forEach(([d, svg, z]) => { const e = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); e.setAttribute('class', 'pv-prop'); e.setAttribute('aria-hidden', 'true'); e.setAttribute('viewBox', PJ.X0 + ' ' + PJ.Y0 + ' ' + PJ.W + ' ' + PJ.H); e.style.zIndex = z; e.innerHTML = svg; chl.appendChild(e); });
    /* rooms: hover or keyboard focus -> 6% vermilion tint, 1.5px edge, one ink tooltip */
    BB.$$('#rooms polygon').forEach(p => {
      const on = () => showRoom(p.dataset.room), off = () => hideRoom(p.dataset.room);
      p.addEventListener('mouseenter', on); p.addEventListener('mouseleave', off); p.addEventListener('focus', on); p.addEventListener('blur', off);
    });
    /* pan by dragging the floor, zoom with the buttons */
    const st = stageEl(); let drag = null;
    st.addEventListener('pointerdown', e => { if (e.button !== 0 || e.target.closest('.ch,.collab,.isl-card,.crew,.ask,.zoom,.roster,.floor-empty,button,input')) return; drag = { x: e.clientX, y: e.clientY, p: pan.slice(), moved: false }; });
    addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!drag.moved && Math.hypot(dx, dy) < 4) return; drag.moved = true; st.classList.add('panning'); pan = [drag.p[0] + dx, drag.p[1] + dy]; fit(); });
    addEventListener('pointerup', () => { if (drag) { drag = null; st.classList.remove('panning'); } });
    addEventListener('resize', () => { fit(); place(); });
  }
  function fit() {
    const st = stageEl(), f = floorEl(); if (!st || !f) return;
    const W = st.clientWidth, H = st.clientHeight; if (!W) return;
    const phone = BB.phone();
    const base = phone ? W - 16 : Math.min(W * .875, (H - 40) * .9 * ASPECT);
    fw = Math.max(320, base * zoom);
    const shift = !phone && BB.panelOpen && BB.panelOpen() && W > 1100 ? -200 : 0;
    f.style.setProperty('--fw', fw + 'px'); f.style.setProperty('--figw', (fw * .0475) + 'px');
    f.style.setProperty('--px', (pan[0] + shift) + 'px'); f.style.setProperty('--py', pan[1] + 'px');
    BB.$$('.ch', f).forEach(e => e.style.setProperty('--fig', (fw * .0475) + 'px'));
  }
  BB.floorZoom = d => { zoom = Math.max(.8, Math.min(1.8, zoom + d)); fit(); };
  BB.floorFit = fit;
  BB.floorReset = () => { zoom = 1; pan = [0, 0]; fit(); };

  function roomInfo(k) {
    if (k === 'call') { const w = BB.agents().filter(a => BB.withOwner(a)); return { line: w.length ? (w.length === 1 ? w[0].name + ' is with you' : w.length + ' bots are with you') + ' · ' + w.length + ' here' : 'Nobody is with you right now', n: w.length }; }
    const here = BB.agents().filter(a => !BB.isGhost(a) && BB.presence(a) !== 'revoked' && !(F[a.id] && F[a.id].tk === 'tray') && (k === 'sales' ? ['sales', 'support'].includes(BB.roomOf(a)) : BB.roomOf(a) === k));
    if (!here.length) return { line: 'Nobody here right now', n: 0 };
    const a = here[0], s = BB.botState(a);
    const doing = s.kind === 'run' ? 'is ' + typeOf(k).verb : s.kind === 'needs' ? 'is waiting for you' : s.kind === 'talk' ? 'is talking with you' : s.kind === 'off' ? 'is paused' : 'is here';
    return { line: (here.length === 1 ? a.name + ' ' + doing : a.name + ' and ' + (here.length - 1) + ' more') + ' · ' + here.length + ' here', n: here.length };
  }
  function showRoom(k) {
    hoverRoom = k; const p = $('#rooms polygon[data-room="' + k + '"]'); if (!p) return;
    BB.$$('#rooms polygon').forEach(x => x.classList.toggle('hot', x === p));
    const b = BOXW[k], pts = [W2P(b[0], b[1]), W2P(b[2], b[1]), W2P(b[2], b[3]), W2P(b[0], b[3])];
    const cx = pts.reduce((s, q) => s + q[0], 0) / 4, top = Math.min(...pts.map(q => q[1]));
    const tip = $('#tip'), info = roomInfo(k);
    tip.innerHTML = esc(typeOf(k).name) + '<small>' + esc(info.line) + '</small>';
    tip.style.left = cx + '%'; tip.style.top = (top - 1) + '%'; tip.classList.add('on');
    p.setAttribute('aria-label', typeOf(k).name + ': ' + info.line);
  }
  function hideRoom(k) { if (hoverRoom !== k) return; hoverRoom = null; BB.$$('#rooms polygon').forEach(x => x.classList.remove('hot')); $('#tip').classList.remove('on'); }
  BB.focusRoom = k => { const p = $('#rooms polygon[data-room="' + k + '"]'); if (p) { BB.floorReset(); p.focus(); } };

  /* ---------- placement ---------- */
  function waitingItems() {
    /* everything a bot is bringing to the owner: gateway approvals, spend requests, card requests */
    return BB.onYou().filter(i => ['approval', 'spend', 'card'].includes(i.type) && i.a && !BB.isGhost(i.a)).sort((x, y) => String(x.at).localeCompare(String(y.at)));
  }
  function targetOf(a, waitList) {
    if (BB.isGhost(a)) { const g = BB.agents().filter(BB.isGhost); return { k: 'arr', p: ARRIVALS[Math.max(0, g.findIndex(b => b.id === a.id)) % ARRIVALS.length] }; }
    const wi = waitList.indexOf(a.id);
    if (wi >= 0 && wi < TRAY_SLOTS.length) return { k: 'tray', p: TRAY_SLOTS[wi] };
    if (BB.withOwner(a)) { const seated = BB.agents().filter(b => BB.withOwner(b)), i = Math.max(0, seated.findIndex(b => b.id === a.id)); return { k: 'call:' + i, p: W2P(65 + (i % 2) * 5, 91 + Math.floor(i / 2) * 5) }; }
    const room = BB.roomOf(a), same = BB.agents().filter(b => !BB.isGhost(b) && (['sales', 'support'].includes(room) ? ['sales', 'support'].includes(BB.roomOf(b)) : BB.roomOf(b) === room));
    const slot = Math.max(0, same.findIndex(b => b.id === a.id)), seats = SEATW[room] || SEATW.ops, v = seats[slot % 4];
    const pt = W2P(v[0] + Math.floor(slot / 4) * 2.2, v[1] + Math.floor(slot / 4) * 1.6);
    return { k: 'home:' + room + ':' + slot, p: pt };
  }
  function setPos(r, x, y, ms) { r.x = x; r.y = y; const e = r.el; e.style.transitionDuration = ms + 'ms'; e.style.left = x + '%'; e.style.top = y + '%'; e.style.zIndex = Math.round(y * 10); }
  async function walkTo(r, x, y) {
    const token = r.walk = (r.walk || 0) + 1;
    if (BB.reduced() || document.hidden || r.x == null) { setPos(r, x, y, 0); return; }
    if (Math.abs(r.x - x) + Math.abs(r.y - y) < .6) { setPos(r, x, y, 0); return; }
    r.el.classList.add('walk'); draw(r);
    const pts = route(P2W(r.x, r.y), P2W(x, y)).map(p => W2P(...p)); pts[pts.length - 1] = [x, y];
    for (let k = 0; k < pts.length; k++) {
      if (r.walk !== token) return;
      const n = pts.length, [px, py] = pts[k], d = Math.hypot((r.x - px) * 1.6, r.y - py), ms = Math.max(320, Math.min(1900, d * 42));
      r.el.style.transitionTimingFunction = n === 1 ? 'cubic-bezier(.45,.05,.3,1)' : k === 0 ? 'cubic-bezier(.42,0,1,1)' : k === n - 1 ? 'cubic-bezier(0,0,.3,1)' : 'linear';
      setPos(r, px, py, ms); await BB.sleep(ms + 40);
    }
    if (r.walk === token) { r.el.style.transitionTimingFunction = ''; r.el.classList.remove('walk'); draw(r); place(); }
  }
  function draw(r) {
    const a = BB.agent(r.id); if (!a) return;
    const ghost = BB.isGhost(a), s = BB.botState(a), walking = r.el.classList.contains('walk') && !BB.reduced();
    const pose = BB.withOwner(a) && !walking && r.tk && r.tk.startsWith('call') ? 'sit' : walking ? 'walk' : (s.kind === 'run' && BB.signal(a) === 'working' && r.tk && r.tk.startsWith('home') ? 'sit' : 'stand');
    const key = [ghost, pose, a.name, BB.cast(a).k].join('|'); if (r.key === key) return; r.key = key;
    r.el.querySelector('.avs').innerHTML = figureSVG(a, { ghost, pose });
  }
  function ensure(a, i) {
    let r = F[a.id]; if (r) return r;
    const el = document.createElement('div'); el.className = 'ch'; el.tabIndex = 0; el.setAttribute('role', 'button'); el.dataset.id = a.id;
    el.innerHTML = '<div class="body"><div class="avs"></div></div>'; el.style.setProperty('--bd', (-(BB.hash(a.id) % 32) / 10) + 's'); el.style.setProperty('--fig', (fw * .0475) + 'px');
    el.addEventListener('click', () => BB.openInspector && BB.openInspector(a.id));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
    $('#chl').appendChild(el); r = F[a.id] = { id: a.id, el, x: null, y: null }; return r;
  }
  function render() {
    if (!BB.S) return; build(); fit();
    const as = BB.agents(), ids = new Set(as.map(a => a.id));
    Object.keys(F).forEach(id => { if (!ids.has(id)) { F[id].el.remove(); delete F[id]; } });
    const waitList = []; waitingItems().forEach(i => { if (!waitList.includes(i.a.id)) waitList.push(i.a.id); });
    as.forEach((a, i) => {
      const r = ensure(a, i), t = targetOf(a, waitList), s = BB.botState(a);
      r.el.classList.toggle('ghost', BB.isGhost(a)); r.el.classList.toggle('paused', s.kind === 'off'); r.el.dataset.signal = BB.signal(a); r.el.classList.toggle('dark', s.kind === 'dark');
      r.el.setAttribute('aria-label', a.name + ': ' + BB.statusLine(a) + '. Open details');
      const moved = r.tk !== t.k || !r.tp || Math.abs(r.tp[0] - t.p[0]) + Math.abs(r.tp[1] - t.p[1]) > .3;
      r.tk = t.k; r.tp = t.p;
      if (r.x == null) setPos(r, t.p[0], t.p[1], 0); else if (moved) walkTo(r, t.p[0], t.p[1]);
      draw(r);
    });
    place();
    /* tray: vermilion dot and paper only while a request waits */
    const tray = $('#tray'), waiting = waitList.length > 0;
    if (tray) tray.classList.toggle('waiting', waiting);
    const empty = $('#floor-empty'); if (empty) empty.hidden = as.length > 0;
  }
  /* overlays that follow figures: typing bubble, activity glyph, inspected ring, collab line + card, the tray card */
  function place() {
    if (!built || !BB.S) return;
    const ov = $('#ov'); BB.$$('.fx,.collab', ov).forEach(e => e.remove());
    const pos = id => { const r = F[id]; return r && r.x != null ? [r.x, r.y] : null; };
    BB.agents().forEach((a, i) => {
      const r = F[a.id], p = pos(a.id); if (!r || !p || r.el.classList.contains('walk')) return;
      const k = BB.activity(a), sit = r.key && r.key.includes('|sit|');
      if (k === 'message') { const b = document.createElement('div'); b.className = 'fx bubble'; b.style.left = (p[0] + 1.2) + '%'; b.style.top = (p[1] - (sit ? 9.6 : 12.4)) + '%'; b.innerHTML = '<i></i><i></i><i></i>'; b.setAttribute('aria-hidden', 'true'); ov.appendChild(b); }
      else if (k) { const g = document.createElement('div'); g.className = 'fx'; g.style.left = p[0] + '%'; g.style.top = (p[1] - (sit ? 10.4 : 13.2)) + '%'; g.innerHTML = BB.glyph(a, -(i * .37)); ov.appendChild(g); }
    });
    /* inspected bot: soft ink ring at its feet */
    const ring = $('#ring'), ins = BB.inspected && pos(BB.inspected);
    if (ring) { ring.classList.toggle('on', !!ins); if (ins) ring.firstChild.setAttribute('transform', `translate(${sx(ins).toFixed(1)} ${(sy(ins) - 2).toFixed(1)})`); }
    /* bots working together: one card per shared job */
    const cg = $('#collab'); let svg = '';
    BB.sharedJobs().forEach(job => {
      const pts = job.bots.map(b => pos(b.id)).filter(Boolean).sort((p, q) => p[0] - q[0]); if (pts.length < 2) return;
      const S = pts.map(p => [sx(p), sy(p)]);
      let d = 'M' + S[0][0].toFixed(1) + ',' + (S[0][1] - 34).toFixed(1);
      let mid = null;
      for (let j = 1; j < S.length; j++) { const a = S[j - 1], b = S[j], mx = (a[0] + b[0]) / 2 + 70, my = (a[1] + b[1]) / 2 - 34; d += ` Q${mx.toFixed(1)},${my.toFixed(1)} ${b[0].toFixed(1)},${(b[1] - 34).toFixed(1)}`; if (j === Math.ceil((S.length - 1) / 2)) mid = [(a[0] + 2 * mx + b[0]) / 4, (a[1] - 34 + 2 * my + b[1] - 34) / 4]; }
      svg += `<path d="${d}"/>` + S.map(p => `<ellipse cx="${p[0].toFixed(1)}" cy="${(p[1] - 1).toFixed(1)}" rx="22" ry="9"/>`).join('');
      const c = document.createElement('button'); c.className = 'collab'; c.type = 'button';
      c.style.left = ((mid[0] - PJ.X0) / PJ.W * 100 + 6) + '%'; c.style.top = ((mid[1] - PJ.Y0) / PJ.H * 100) + '%';
      const names = job.bots.length > 2 ? job.bots[0].name + ' + ' + (job.bots.length - 1) + ' more' : job.bots.map(b => b.name).join(' + ');
      c.innerHTML = BB.duo(job.bots) + `<span><b>${esc(names)}</b> <small>· ${esc(BB.shortTitle(job.title))}</small></span><span class="chev">›</span>`;
      c.setAttribute('aria-label', 'Shared job ' + job.title + ' by ' + names + '. Open job');
      c.onclick = () => BB.openInspector && BB.openInspector(job.tasks[0].assignee, { job: job.tasks[0].id });
      ov.appendChild(c);
    });
    if (cg) cg.innerHTML = svg;
    placeTrayCard();
  }
  function placeTrayCard() {
    const card = $('#islcard'); if (!card) return;
    const items = waitingItems(), first = items.find(i => { const r = F[i.a.id]; return r && r.tk === 'tray' && !r.el.classList.contains('walk'); });
    if (!first || BB.phone() || (BB.panelOpen && BB.panelOpen())) { card.classList.remove('on'); card.dataset.id = ''; return; }
    if (card.dataset.id !== first.id || card.dataset.n !== String(items.length)) {
      card.dataset.id = first.id; card.dataset.n = items.length;
      card.innerHTML = `<div class="who">${BB.av(first.a, 's22')}${esc(first.a.name)} · ${esc(BB.ago(first.at))}</div><b>${esc(BB.itemTitle(first))}</b><div class="btns"><button class="b pri" data-d="approve">Approve</button><button class="b out" data-d="deny">Deny</button></div>${items.length > 1 ? `<div class="more">${items.length - 1} more waiting · <button class="link" data-open>Open inbox</button></div>` : ''}`;
      card.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { card.querySelectorAll('button').forEach(x => x.disabled = true); await BB.decide(first, b.dataset.d); });
      const o = card.querySelector('[data-open]'); if (o) o.onclick = () => BB.openRail && BB.openRail();
    }
    const tr = W2P(109, 93), tt = W2P(87, 93);
    card.style.left = (tr[0] + .7) + '%'; card.style.top = (tt[1] - 7.9) + '%'; card.classList.add('on');
  }
  BB.floorPlace = place;
  BB.itemTitle = i => i.type === 'approval' ? BB.reqTitle(i.q) : i.type === 'spend' ? 'Spend ' + BB.usd(i.q.amountCents) + ' on ' + i.q.merchant : i.type === 'card' ? 'Charge ' + BB.usd(i.q.amountCents) + ' at ' + i.q.merchant : i.type === 'reconnect' ? 'Reconnect ' + i.a.name : i.type === 'dark' ? i.a.name + ' went dark' : i.t ? i.t.title : '';
  BB.figureSVG = figureSVG;
  BB.on(render);
  setInterval(() => { if (BB.S && !document.hidden) place(); }, 15000);
  window.HQ_FLOOR = { W2P, P2W, route, fit, PJ };
})();
