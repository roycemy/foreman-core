// Per-business HQ on the Floor (custom HQ): once the Business view has loaded the workspace's
// REAL saved state, the Floor projects it read-only - an HQ banner (profile name, honest
// active/paused counts, engine status) and rooms named after the responsibility whose mapped
// bot sits there (generic room names otherwise), with a click-through that opens that
// responsibility's card. The projection dies the moment the live identity no longer matches
// the identity that loaded it, even when the Business view was never open. Real Chromium over
// CDP, stubbed API, synthetic data only.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert'),{spawn}=require('child_process');

const AGT={id:'agent_1',name:'Grokbot',providerId:'grok',status:'active',lastSeen:'2026-10-24T08:00:00Z',connection:{status:'active'},room:'ops'};
const RESP1={id:'resp_1',title:'Estimate follow-up desk',summary:'Draft estimate follow-ups',boundary:'Drafts only',status:'active',createdAt:'2026-10-23T00:00:00Z',runsCount:3,sourceIds:[],bot:{id:'agent_1',name:'Grokbot',providerId:'grok'},fp:'fp1',runs:[],assignment:{botId:'agent_1',botName:'Grokbot',assignedAt:'2026-10-23T02:00:00Z'}};
const RESP2={id:'resp_2',title:'Invoice chase desk',summary:'Draft invoice chases',boundary:'Drafts only',status:'active',createdAt:'2026-10-23T00:00:00Z',runsCount:0,sourceIds:[],bot:{id:'agent_1',name:'Grokbot',providerId:'grok'},fp:'fp2',runs:[]}; // automatic pick: SAME bot, SAME room
const RESP3={id:'resp_3',title:'Weekly summary',summary:'Engine summary',boundary:'Drafts only',status:'paused',createdAt:'2026-10-23T00:00:00Z',runsCount:0,sourceIds:[],fp:'fp3',runs:[]}; // no bot: maps no room
function bizState(ident){
  if(ident==='B')return {engine:{configured:false,enabled:false,consent:null},delegate:null,team:[],sources:[],proposals:[],responsibilities:[],log:[],opPending:null};
  return {engine:{configured:false,enabled:false,consent:null},profile:{name:'North Bend Contracting',blurb:'Demo',updatedAt:'2026-10-23T00:00:00Z'},delegate:{id:'agent_1',name:'Grokbot',providerId:'grok',connection:{status:'active'}},team:[{id:'agent_1',name:'Grokbot',providerId:'grok',connection:{status:'active'}}],sources:[],proposals:[],responsibilities:[RESP1,RESP2,RESP3],log:[],opPending:null};
}
let ident='A';
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://x');
  const json=o=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(o));};
  if(u.pathname==='/__ident'){ident=u.searchParams.get('to');return json({ok:true});}
  if(u.pathname==='/api/me')return json(ident==='A'?{email:'a@a.test',workspace:'wA'}:{email:'b@b.test',workspace:'wB'});
  if(u.pathname==='/api/state')return json({now:new Date().toISOString(),agents:[AGT]});
  if(u.pathname==='/api/money')return json({requests:[]});
  if(u.pathname==='/api/cards')return json({proposals:[],bots:[],ledger:[]});
  if(u.pathname==='/api/business/state')return json(bizState(ident));
  if(u.pathname.startsWith('/api/'))return json({});
  if(u.pathname==='/'||u.pathname==='/app.html'||u.pathname==='/index.html'){res.setHeader('content-type','text/html');return res.end(fs.readFileSync('public/app.html'));}
  const fp=path.join('public',u.pathname);
  if(fs.existsSync(fp)&&fs.statSync(fp).isFile()){
    const ext=path.extname(fp);
    res.setHeader('content-type',ext==='.css'?'text/css':ext==='.js'?'text/javascript':ext==='.svg'?'image/svg+xml':ext==='.png'?'image/png':ext==='.webmanifest'?'application/manifest+json':'application/octet-stream');
    return res.end(fs.readFileSync(fp));
  }
  res.statusCode=404;res.end('nf');
});
function chrome(){for(const b of['google-chrome','google-chrome-stable','chromium','chromium-browser']){try{return fs.realpathSync(require('child_process').execSync('command -v '+b).toString().trim())}catch(e){}}return null;}

(async()=>{
 const bin=chrome();assert(bin,'a Chromium/Chrome binary is required for this browser regression');
 await new Promise(r=>server.listen(0,r));const port=server.address().port;
 const cp=spawn(bin,['--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port=0','about:blank'],{stdio:['ignore','ignore','pipe']});
 const wsUrl=await new Promise((res,rej)=>{let buf='';cp.stderr.on('data',d=>{buf+=d;const m=buf.match(/DevTools listening on (ws:\/\/\S+)/);if(m)res(m[1]);});cp.on('exit',()=>rej(new Error('chrome exited')));setTimeout(()=>rej(new Error('no DevTools endpoint')),15000);});
 const ws=new WebSocket(wsUrl);await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
 let idc=0;const pend={};
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend[m.id]){m.error?pend[m.id].rej(new Error(JSON.stringify(m.error))):pend[m.id].res(m.result);delete pend[m.id];}};
 const send=(method,params,sessionId)=>new Promise((res,rej)=>{const id=++idc;pend[id]={res,rej};ws.send(JSON.stringify({id,method,params:params||{},sessionId}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'});
 const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const ev=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw new Error('page eval: '+JSON.stringify((r.exceptionDetails.exception&&r.exceptionDetails.exception.description)||r.exceptionDetails.text));return r.result.value;};
 const poll=async(expr,timeout=16000)=>{const t0=Date.now();while(Date.now()-t0<timeout){if(await ev(expr))return true;await new Promise(r=>setTimeout(r,120));}return false;};
 const shot=async name=>{const s=await send('Page.captureScreenshot',{format:'png'},sessionId);fs.writeFileSync('/downloads/'+name,Buffer.from(s.data,'base64'));};

 await send('Page.enable',{},sessionId);
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false},sessionId);
 // Business first: the projection exists only after THIS identity's state actually loaded
 await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/#business'},sessionId);
 assert(await poll(`(document.getElementById('v-business')||{textContent:''}).textContent.includes('Estimate follow-up desk')`),'business view paints the responsibility');
 // Now the Floor: the custom HQ projects the workspace's own state
 await ev(`location.hash='#floor';'go'`);
 assert(await poll(`(()=>{const b=document.getElementById('hqbanner');return b&&!b.hidden&&b.textContent.includes('North Bend Contracting HQ');})()`),'HQ banner names the business');
 let t=await ev(`(document.getElementById('hqbanner')||{textContent:''}).textContent`);
 assert(t.includes('2 active'),'banner counts active responsibilities');
 assert(t.includes('1 paused'),'banner counts paused responsibilities');
 assert(t.includes('reasoning engine not connected yet'),'banner is honest about the engine');
 assert(await poll(`(()=>{const p=document.querySelector('#rooms polygon[data-room="ops"] title');return p&&p.textContent==='Estimate follow-up desk';})()`),'room takes the responsibility name');
 assert(await ev(`(()=>{const p=document.querySelector('#rooms polygon[data-room="finance"] title');return p&&p.textContent==='Library';})()`),'unmapped rooms keep their generic names');
 // Tooltip: first responsibility + real run history + the second responsibility sharing the room
 await ev(`document.querySelector('#rooms polygon[data-room="ops"]').dispatchEvent(new Event('mouseenter'));'hover'`);
 t=await ev(`(document.getElementById('tip')||{textContent:''}).textContent`);
 assert(t.includes('Estimate follow-up desk'),'tooltip names the responsibility');
 assert(t.includes('3 runs on record'),'tooltip shows the real run history count');
 assert(t.includes('+1 more responsibility here'),'tooltip is honest about the shared room');
 // Click-through: the room opens its responsibility card for the owner
 await ev(`document.querySelector('#rooms polygon[data-room="ops"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));'click'`);
 assert(await poll(`location.hash==='#business'&&!!document.querySelector('[data-run-input="resp_1"]')`),'room click opens the responsibility card');
 // Identity flip with the Business view CLOSED AND a mapped room's tooltip SHOWING: the
 // projection must die at read time - banner, room titles, the painted tooltip AND the
 // polygon's aria-label all lose A's responsibility data immediately, not on the next hover.
 await ev(`location.hash='#floor';'back'`);
 await poll(`(()=>{const b=document.getElementById('hqbanner');return b&&!b.hidden;})()`,8000);
 await ev(`document.querySelector('#rooms polygon[data-room="ops"]').dispatchEvent(new Event('mouseenter'));'hover'`);
 assert((await ev(`(document.getElementById('tip')||{textContent:''}).textContent`)).includes('Estimate follow-up desk'),'pre-flip tooltip shows the responsibility');
 await ev(`BB.who=${JSON.stringify({email:'b@b.test',workspace:'wB'})};BB.emit();'flip'`);
 assert(await poll(`(()=>{const tip=document.getElementById('tip');const shown=tip&&tip.classList.contains('on');return !shown||(!tip.textContent.includes('Estimate follow-up')&&!tip.textContent.includes('runs on record')&&!tip.textContent.includes('more responsibilit'));})()`),'hovering during the flip: the painted tooltip loses A responsibility data immediately');
 assert(await ev(`(()=>{const p=document.querySelector('#rooms polygon[data-room="ops"]');const a=p&&p.getAttribute('aria-label')||'';return !a.includes('Estimate follow-up')&&!a.includes('runs on record');})()`),'aria-label loses A responsibility data immediately');
 assert(await poll(`(()=>{const b=document.getElementById('hqbanner');return !b||b.hidden;})()`),'stale identity: banner gone without the Business view running');
 assert(await poll(`(()=>{const p=document.querySelector('#rooms polygon[data-room="ops"] title');return p&&p.textContent==='Workshop';})()`),'stale identity: rooms revert to generic names');
 await shot('floor-hq-stale-cleared.png');
 console.log('ui-floor-hq-regression: ALL PASS');
 process.exit(0);
})().catch(e=>{console.error('FAIL:',e.message);process.exit(1);});
