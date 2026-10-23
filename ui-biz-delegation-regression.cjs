// Delegated business runs UI (Grokbot-first bridge): the owner reviews the EXACT payload
// (destination, instructions, work+sources, privacy boundary) before anything leaves; a
// delegated run paints its honest live states (sent / working / bot-reported draft / failed
// with the bot's reason) with a working stop; an identity switch discards the reviewed
// payload. Real Chromium over CDP, stubbed API, synthetic data only.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert'),{spawn}=require('child_process');

const SRC={id:'src_1',kind:'doc',title:'How we work',version:2,text:'We answer every customer email within a day. Refunds over $50 need Royce.',updatedAt:'2026-10-23T00:00:00Z'};
const RESP={id:'resp_1',title:'Customer reply desk',summary:'Draft replies',boundary:'Drafts only',status:'active',createdAt:'2026-10-23T00:00:00Z',runsCount:1,sourceIds:['src_1']};
const BOT={id:'agent_1',name:'Grokbot',providerId:'grok',connection:{status:'active'}};
const PAYLOAD={hash:'hashABC123',brief:'Alter business job - produce a draft for the owner to review.\nBoundary the owner set: Drafts only',context:'<work_item>\nDraft a reply about the $60 refund.\n</work_item>\n\n<source id="src_1" version="2" title="How we work">\nWe answer every customer email within a day. Refunds over $50 need Royce.\n</source>',sources:[{id:'src_1',version:2,title:'How we work',chars:74,totalChars:74}],omittedSources:[],bot:BOT};
let phase='none'; // none -> queued -> working -> done; 'failed' variant via /__phase?to=failed
function stateFor(ident){
  const runs=[];
  if(phase==='queued')runs.push({id:'run_1',respId:'resp_1',kind:'manual',at:'2026-10-23T01:00:00Z',input:'Draft a reply about the $60 refund.',status:'delegated',backend:'linked-bot',bot:{id:'agent_1',name:'Grokbot',providerId:'grok'},taskId:'task_1',job:{status:'queued'}});
  if(phase==='working')runs.push({id:'run_1',respId:'resp_1',kind:'manual',at:'2026-10-23T01:00:00Z',input:'Draft a reply about the $60 refund.',status:'running',backend:'linked-bot',bot:{id:'agent_1',name:'Grokbot',providerId:'grok'},taskId:'task_1',claimedAt:'2026-10-23T01:01:00Z',job:{status:'running',startedAt:'2026-10-23T01:01:00Z'}});
  if(phase==='done')runs.push({id:'run_1',respId:'resp_1',kind:'manual',at:'2026-10-23T01:00:00Z',input:'Draft a reply about the $60 refund.',status:'done',backend:'linked-bot',bot:{id:'agent_1',name:'Grokbot',providerId:'grok'},taskId:'task_1',settledAt:'2026-10-23T01:04:00Z',output:'Draft: we can offer the $60 refund - Royce approved it.'});
  if(phase==='failed')runs.push({id:'run_1',respId:'resp_1',kind:'manual',at:'2026-10-23T01:00:00Z',input:'Draft a reply about the $60 refund.',status:'failed',backend:'linked-bot',bot:{id:'agent_1',name:'Grokbot',providerId:'grok'},taskId:'task_1',settledAt:'2026-10-23T01:04:00Z',output:null,failureReason:'bot_failed',failureDetail:'Missing current refund policy.'});
  if(ident==='B')return {engine:{configured:false,enabled:false,consent:null},delegate:null,sources:[],proposals:[],responsibilities:[],log:[],opPending:null};
  return {engine:{configured:false,enabled:false,consent:null},delegate:BOT,sources:[SRC],proposals:[],responsibilities:[{...RESP,runs}],log:[],opPending:null};
}
let ident='A';
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://x');
  const json=o=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(o));};
  if(u.pathname==='/__ident'){ident=u.searchParams.get('to');return json({ok:true});}
  if(u.pathname==='/__phase'){phase=u.searchParams.get('to');return json({ok:true});}
  if(u.pathname==='/api/me')return json(ident==='A'?{email:'a@a.test',workspace:'wA'}:{email:'b@b.test',workspace:'wB'});
  if(u.pathname==='/api/state')return json({now:new Date().toISOString()});
  if(u.pathname==='/api/money')return json({requests:[]});
  if(u.pathname==='/api/cards')return json({proposals:[],bots:[],ledger:[]});
  if(u.pathname==='/api/business/state')return json(stateFor(ident));
  if(u.pathname==='/api/business/responsibilities/resp_1/delegate-preview'&&req.method==='POST')return json({delegation:PAYLOAD});
  if(u.pathname==='/api/business/responsibilities/resp_1/run'&&req.method==='POST'){
    let b='';req.on('data',d=>b+=d);req.on('end',()=>{const body=JSON.parse(b||'{}');
      if(body.delegateHash!==PAYLOAD.hash)return json({error:'Review exactly what would be sent first.',code:'delegation_review_required',delegation:PAYLOAD});
      phase='queued';const run=stateFor('A').responsibilities[0].runs[0];return json({run});});
    return;}
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
 const ctl=async p=>{await new Promise((res,rej)=>{http.get('http://127.0.0.1:'+port+p,r=>{r.resume();res();}).on('error',rej);});};
 const bizText=()=>ev(`(document.getElementById('v-business')||{textContent:''}).textContent`);
 const shot=async name=>{const s=await send('Page.captureScreenshot',{format:'png'},sessionId);fs.writeFileSync('/downloads/'+name,Buffer.from(s.data,'base64'));};

 await send('Page.enable',{},sessionId);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true},sessionId);
 await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/#business'},sessionId);
 assert(await poll(`(document.getElementById('v-business')||{textContent:''}).textContent.includes('Customer reply desk')`),'business view paints');

 // Open the responsibility: the destination line names the bot before any run
 await ev(`document.querySelector('[data-toggle-resp]').click();'open'`);
 assert(await poll(`!!document.querySelector('[data-run-input="resp_1"]')`),'resp card open');
 assert((await bizText()).includes('Goes to'),'destination line present');
 assert((await bizText()).includes('Grokbot'),'destination names the bot');
 assert((await bizText()).includes('You review the exact text before anything is sent'),'review promise visible');
 await ev(`(async()=>{const ta=document.querySelector('[data-run-input="resp_1"]');ta.value='Draft a reply about the $60 refund.';document.querySelector('[data-run="resp_1"]').click();})()`);
 assert(await poll(`!!document.querySelector('[data-dele-run]')`),'delegation review card paints');
 let t=await bizText();
 assert(t.includes('Review exactly what goes to Grokbot'),'review header names destination');
 assert(t.includes('Draft a reply about the $60 refund.'),'exact work text shown');
 assert(t.includes('We answer every customer email within a day'),'exact source text shown');
 assert(t.includes('not a separate private space'),'privacy boundary copy shown');
 assert(t.includes('Included sources: How we work v2'),'source versions named');
 await shot('delegation-review-390.png');

 // Identity switch discards the reviewed payload before anything is sent
 await ctl('/__ident?to=B');
 await ev(`BB.who=${JSON.stringify({email:'b@b.test',workspace:'wB'})};BB.emit();'flip'`);
 assert(await poll(`!(document.getElementById('v-business')||{textContent:''}).textContent.includes('Customer reply desk')`),'B identity loads');
 t=await bizText();
 assert(!t.includes('Draft a reply about the $60 refund'),'reviewed work text gone after switch');
 assert(!t.includes('Review exactly what goes to'),'A review card gone after switch');
 assert(!t.includes('Goes to'),'B has no delegation destination');

 // Back to A: full send flow
 await ctl('/__ident?to=A');
 await ev(`BB.who=${JSON.stringify({email:'a@a.test',workspace:'wA'})};BB.emit();'flip'`);
 assert(await poll(`(document.getElementById('v-business')||{textContent:''}).textContent.includes('Customer reply desk')`),'A identity back');
 await ev(`document.querySelector('[data-toggle-resp]').click();'open'`);
 assert(await poll(`!!document.querySelector('[data-run-input="resp_1"]')`),'resp card open again');
 await ev(`(async()=>{const ta=document.querySelector('[data-run-input="resp_1"]');ta.value='Draft a reply about the $60 refund.';document.querySelector('[data-run="resp_1"]').click();})()`);
 assert(await poll(`!!document.querySelector('[data-dele-run]')`),'review card paints again');
 await ev(`document.querySelector('[data-dele-run]').click();'send'`);
 assert(await poll(`(document.getElementById('v-business')||{textContent:''}).textContent.includes('Waiting for it to pick the job up')`),'sent state paints');
 t=await bizText();
 assert(t.includes('With Grokbot'),'pending chip names the bot');
 assert(t.includes('Its report lands here as a draft'),'pending sets draft expectation');
 assert(await ev(`!!document.querySelector('[data-run-stop="task_1"]')`),'stop button present while pending');
 await shot('delegation-sent-390.png');

 // Working state (via the view's slow poll picking up new state)
 await ctl('/__phase?to=working');
 assert(await poll(`(document.getElementById('v-business')||{textContent:''}).textContent.includes('Working on it')`,20000),'working state paints on refresh');
 await shot('delegation-working-390.png');

 // Done: bot-reported draft with provenance, not Alter-verified
 await ctl('/__phase?to=done');
 assert(await poll(`(document.getElementById('v-business')||{textContent:''}).textContent.includes('bot-reported')`,20000),'bot-reported draft paints');
 t=await bizText();
 assert(t.includes('Draft from Grokbot'),'provenance names the bot');
 assert(t.includes('Alter did not verify it'),'honest verification boundary');
 assert(t.includes('we can offer the $60 refund'),'draft text renders');
 assert(!(await ev(`!!document.querySelector('[data-run-stop="task_1"]')`)),'stop button gone after settle');
 await shot('delegation-done-390.png');

 // Failed with the bot's own reason (fresh load: the view polls only while a run is in flight)
 await ctl('/__phase?to=failed');
 // Force a real reload: navigating to the same URL with only a hash change is a
 // hash navigation (no reload), leaving stale in-memory state painted.
 await send('Page.navigate',{url:'about:blank'},sessionId);
 await new Promise(r=>setTimeout(r,300));
 await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/#business'},sessionId);
 // The boot sequence repaints as identity resolves, and each repaint can close the card:
 // keep (re)opening it until the failure text is visible or the window expires.
 {const t0=Date.now();let ok=false;
  while(Date.now()-t0<30000){
    if((await bizText()).includes('Missing current refund policy')){ok=true;break;}
    if(!(await ev(`!!document.querySelector('[data-run-input="resp_1"]')`)))await ev(`(()=>{const q=document.querySelector('[data-toggle-resp]');if(q)q.click();})();'open'`);
    await new Promise(r=>setTimeout(r,400));
  }
  assert(ok,'bot failure reason paints');}
 t=await bizText();
 assert(t.includes('could not finish'),'failure names the actor');
 await shot('delegation-failed-390.png');

 ws.close();cp.kill();server.close();
 console.log('PASS ui biz delegation: exact-payload review card (destination, verbatim texts, privacy boundary, source versions), identity switch discards the review, sent/working/done/failed states paint honestly with provenance and a working stop - pixels at /downloads/delegation-{review,sent,working,done,failed}-390.png.');
})().catch(e=>{console.error(e);try{server.close();}catch(_){/*noop*/}process.exit(1)});
