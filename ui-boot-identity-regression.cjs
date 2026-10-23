// Full-shell boot identity regression (combined branch review round): the REAL app.html +
// core.js + app.js boot routes BEFORE /api/me resolves (applyRoute(); boot()), so the Business
// view's first load can run under an UNKNOWN identity. State with no verified owner must be
// invalidated when the identity arrives, and a later account/workspace switch must clear it -
// including any painted page-approval card. Real Chromium over CDP, delayed /api/me, synthetic
// data only.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert'),{spawn}=require('child_process');

const eng={configured:true,enabled:true,host:'api.groq.com',model:'m1',consent:{current:true,host:'api.groq.com',model:'m1',at:'2026-10-23T00:00:00Z'}};
const mkResp=t=>({id:'resp_shared',title:t,summary:'s',boundary:'Drafts only',status:'active',research:true,createdAt:'2026-10-23T00:00:00Z',runsCount:0,runs:[]});
const stateA={engine:eng,sources:[{id:'src_a',kind:'note',title:'A notes',version:1,text:'A private notes mentioning https://a-private.example/secret?token=aaa',updatedAt:'2026-10-23T00:00:00Z'}],proposals:[],responsibilities:[mkResp('A desk')],log:[],opPending:null};
const stateB={engine:eng,sources:[{id:'src_b',kind:'note',title:'B-MARKER notes',version:1,text:'B notes, nothing private',updatedAt:'2026-10-23T00:00:00Z'}],proposals:[],responsibilities:[mkResp('B desk')],log:[],opPending:null};

let ident='A', meHeld=true, meRelease=null; // /api/me is held until /__me: the app boots with identity unknown
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://x');
  const json=o=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(o));};
  if(u.pathname==='/__ident'){ident=u.searchParams.get('to');return json({ok:true});}
  if(u.pathname==='/__me'){meHeld=false;const r=meRelease;meRelease=null;if(r)r();return json({ok:true,released:!!r});}
  if(u.pathname==='/api/me'){const respond=()=>json(ident==='A'?{email:'a@a.test',workspace:'wA'}:{email:'b@b.test',workspace:'wB'});if(meHeld){meRelease=respond;return;}return respond();}
  if(u.pathname==='/api/state')return json({now:new Date().toISOString()});
  if(u.pathname==='/api/money')return json({requests:[]});
  if(u.pathname==='/api/cards')return json({proposals:[],bots:[],ledger:[]});
  if(u.pathname==='/api/business/state')return json(ident==='A'?stateA:stateB);
  if(u.pathname==='/api/business/responsibilities/resp_shared/candidates')return json({urls:['https://a-private.example/secret?token=aaa'],flagged:[],sourceVersions:{src_a:1}});
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
 const poll=async(expr,timeout=10000)=>{const t0=Date.now();while(Date.now()-t0<timeout){if(await ev(expr))return true;await new Promise(r=>setTimeout(r,80));}return false;};
 const ctl=async p=>{await new Promise((res,rej)=>{http.get('http://127.0.0.1:'+port+p,r=>{r.resume();res();}).on('error',rej);});};
 const bizText=()=>ev(`(document.getElementById('v-business')||{textContent:''}).textContent`);

 await send('Page.enable',{},sessionId);
 await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/#'+'business'},sessionId);
 // The app boots: applyRoute runs before boot()'s /api/me resolves (real ordering). Wait for the
 // business view to paint A's content under the unknown identity.
 assert(await poll(`(document.getElementById('v-business')||{textContent:''}).textContent.includes('A notes')`),'business state loads before /api/me (real boot ordering)');
 assert(await ev(`!window.BB||!BB.who`),'identity still unknown at first paint (precondition)');
 // Identity A arrives: release the held /api/me so boot() completes
 await ctl('/__me');
 assert(await poll(`!!(window.BB&&BB.who&&BB.who.email)`),'/api/me landed');
 // Owner reviews pages: approval card paints with A's private URL under A
 assert(await poll(`!!document.querySelector('[data-toggle-resp]')`),'A state re-painted under the known identity');
 await ev(`document.querySelector('[data-toggle-resp]').click();'open'`);
 assert(await poll(`!!document.querySelector('[data-run-input="resp_shared"]')`),'resp card open under A');
 await ev(`(async()=>{const ta=document.querySelector('[data-run-input="resp_shared"]');ta.value='Check https://a-private.example/secret?token=aaa please';document.querySelector('[data-run="resp_shared"]').click();})()`);
 assert(await poll(`!!document.querySelector('.bz-approve')`),'approval card paints under A');
 assert((await bizText()).includes('a-private.example/secret?token=aaa'),'A private URL visible under A (precondition)');
 // Switch identity: B's session observed through the sync path
 await ctl('/__ident?to=B');
 await ev(`BB.who=${JSON.stringify({email:'b@b.test',workspace:'wB'})};BB.emit();'flip'`);
 assert(await poll(`(document.getElementById('v-business')||{textContent:''}).textContent.includes('B-MARKER')`),'B state loads after the switch');
 const t=await bizText();
 assert(!t.includes('a-private.example'),'A private URL gone after the switch');
 assert(!t.includes('A private notes'),'A source text gone after the switch');
 assert(!t.includes('Check https://'),'A reviewed work text gone after the switch');
 assert(!(await ev(`!!document.querySelector('.bz-approve')`)),'A approval card gone after the switch');
 // Pixel evidence at 390px: only B content on screen
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:800,deviceScaleFactor:2,mobile:true},sessionId);
 await new Promise(r=>setTimeout(r,250));
 const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);
 fs.writeFileSync('/downloads/boot-identity-B-390.png',Buffer.from(shot.data,'base64'));

 ws.close();cp.kill();server.close();
 console.log('PASS ui boot identity: real app.html boot loads Business before /api/me (unknown identity), unknown-owned state is invalidated when identity arrives, and the account/workspace switch clears the painted approval card, private URLs and work text - B-only DOM verified at 390px (screenshot /downloads/boot-identity-B-390.png).');
})().catch(e=>{console.error(e);try{server.close();}catch(_){/*noop*/}process.exit(1)});
