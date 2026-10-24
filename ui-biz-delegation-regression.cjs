// Delegated business runs UI (Grokbot-first bridge): the owner reviews the EXACT payload
// (destination, instructions, work+sources, privacy boundary) before anything leaves; a
// delegated run paints its honest live states (sent / working / bot-reported draft / failed
// with the bot's reason) with a working stop; an identity switch discards the reviewed
// payload. Real Chromium over CDP, stubbed API, synthetic data only.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert'),{spawn}=require('child_process');

const SRC={id:'src_1',kind:'doc',title:'How we work',version:2,text:'We answer every customer email within a day. Refunds over $50 need Royce.',updatedAt:'2026-10-23T00:00:00Z'};
const RESP={id:'resp_1',title:'Customer reply desk',summary:'Draft replies',boundary:'Drafts only',status:'active',createdAt:'2026-10-23T00:00:00Z',runsCount:1,sourceIds:['src_1']};
const BOT={id:'agent_1',name:'Grokbot',providerId:'grok',connection:{status:'active'}};
const BOT2={id:'agent_2',name:'Scout',providerId:'custom',connection:{status:'awaiting_bot'}};
let assigned=null, assignMode='ok', respFp='fp-v1', roster='full', assignParked=false, assignParkHold=null, previewParked=false, previewParkRes=null, assignPosts=0;
const PAYLOAD={hash:'hashABC123',brief:'Alter business job - produce a draft for the owner to review.\nBoundary the owner set: Drafts only',context:'<work_item>\nDraft a reply about the $60 refund.\n</work_item>\n\n<source id="src_1" version="2" title="How we work">\nWe answer every customer email within a day. Refunds over $50 need Royce.\n</source>',sources:[{id:'src_1',version:2,title:'How we work',chars:74,totalChars:74}],omittedSources:[],bot:BOT};
let phase='none'; // none -> queued -> working -> done; 'failed' variant via /__phase?to=failed
function stateFor(ident){
  const runs=[];
  if(phase==='queued')runs.push({id:'run_1',respId:'resp_1',kind:'manual',at:'2026-10-23T01:00:00Z',input:'Draft a reply about the $60 refund.',status:'delegated',backend:'linked-bot',bot:{id:'agent_1',name:'Grokbot',providerId:'grok'},taskId:'task_1',job:{status:'queued'}});
  if(phase==='working')runs.push({id:'run_1',respId:'resp_1',kind:'manual',at:'2026-10-23T01:00:00Z',input:'Draft a reply about the $60 refund.',status:'running',backend:'linked-bot',bot:{id:'agent_1',name:'Grokbot',providerId:'grok'},taskId:'task_1',claimedAt:'2026-10-23T01:01:00Z',job:{status:'running',startedAt:'2026-10-23T01:01:00Z'}});
  if(phase==='done')runs.push({id:'run_1',respId:'resp_1',kind:'manual',at:'2026-10-23T01:00:00Z',input:'Draft a reply about the $60 refund.',status:'done',backend:'linked-bot',bot:{id:'agent_1',name:'Grokbot',providerId:'grok'},taskId:'task_1',settledAt:'2026-10-23T01:04:00Z',output:'Draft: we can offer the $60 refund - Royce approved it.'});
  if(phase==='failed')runs.push({id:'run_1',respId:'resp_1',kind:'manual',at:'2026-10-23T01:00:00Z',input:'Draft a reply about the $60 refund.',status:'failed',backend:'linked-bot',bot:{id:'agent_1',name:'Grokbot',providerId:'grok'},taskId:'task_1',settledAt:'2026-10-23T01:04:00Z',output:null,failureReason:'bot_failed',failureDetail:'Missing current refund policy.'});
  if(ident==='B')return {engine:{configured:false,enabled:false,consent:null},delegate:null,sources:[],proposals:[],responsibilities:[],log:[],opPending:null};
  const asg=roster==='empty'?{botId:'agent_9',botName:'Ghost',assignedAt:'2026-10-23T02:00:00Z'}:assigned;
  return {engine:{configured:false,enabled:false,consent:null},delegate:BOT,team:roster==='full'?[BOT,BOT2]:[],sources:[SRC],proposals:[],responsibilities:[{...RESP,bot:{id:'agent_1',name:'Grokbot',providerId:'grok'},fp:respFp,runs,...(asg?{assignment:asg}:{})}],log:[],opPending:null};
}
let ident='A';
function assignRespond(res,body){
  assignPosts++;
  const json=o=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(o));};
  if(body.reviewedFp!==respFp)return json({error:'This responsibility changed since you reviewed it - reload and review the current state before assigning. Nothing was overwritten.',code:'resp_changed'});
  if(assignMode==='changed')return json({error:'This responsibility changed while you were assigning - reload and review it before assigning. Nothing was overwritten.',code:'resp_changed'});
  if(body.botId==='agent_2')return json({error:'That bot is not connected right now. Pair or reconnect it first - Alter does not create bot accounts.',code:'assign_bot_unavailable'});
  assigned=body.botId?{botId:body.botId,botName:body.botId==='agent_1'?'Grokbot':'Scout',assignedAt:new Date().toISOString()}:null;
  return json({responsibility:{...RESP,bot:{id:'agent_1',name:'Grokbot',providerId:'grok'},...(assigned?{assignment:assigned}:{})}});
}
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://x');
  const json=o=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(o));};
  if(u.pathname==='/__ident'){ident=u.searchParams.get('to');return json({ok:true});}
  if(u.pathname==='/__phase'){phase=u.searchParams.get('to');return json({ok:true});}
  if(u.pathname==='/__assign-mode'){assignMode=u.searchParams.get('to');return json({ok:true});}
  if(u.pathname==='/__resp-fp'){respFp=u.searchParams.get('to');return json({ok:true});}
  if(u.pathname==='/__roster'){roster=u.searchParams.get('to');return json({ok:true});}
  if(u.pathname==='/__assign-park'){assignParked=true;return json({ok:true});}
  if(u.pathname==='/__assign-count')return json({n:assignPosts});
  if(u.pathname==='/__assign-release'){assignParked=false;const h=assignParkHold;assignParkHold=null;if(h)assignRespond(h.res,h.body);return json({ok:true});}
  if(u.pathname==='/__preview-park'){previewParked=true;return json({ok:true});}
  if(u.pathname==='/__preview-release'){previewParked=false;const r0=previewParkRes;previewParkRes=null;if(r0){r0.setHeader('content-type','application/json');r0.end(JSON.stringify({delegation:PAYLOAD}));}return json({ok:true});}
  if(u.pathname==='/api/me')return json(ident==='A'?{email:'a@a.test',workspace:'wA'}:{email:'b@b.test',workspace:'wB'});
  if(u.pathname==='/api/state')return json({now:new Date().toISOString()});
  if(u.pathname==='/api/money')return json({requests:[]});
  if(u.pathname==='/api/cards')return json({proposals:[],bots:[],ledger:[]});
  if(u.pathname==='/api/business/state')return json(stateFor(ident));
  if(u.pathname==='/api/business/responsibilities/resp_1/delegate-preview'&&req.method==='POST'){
    if(previewParked){previewParkRes=res;return;} // held in flight until /__preview-release
    return json({delegation:PAYLOAD});}
  if(u.pathname==='/api/business/responsibilities/resp_1/run'&&req.method==='POST'){
    let b='';req.on('data',d=>b+=d);req.on('end',()=>{const body=JSON.parse(b||'{}');
      if(body.delegateHash!==PAYLOAD.hash)return json({error:'Review exactly what would be sent first.',code:'delegation_review_required',delegation:PAYLOAD});
      phase='queued';const run=stateFor('A').responsibilities[0].runs[0];return json({run});});
    return;}
  if(u.pathname==='/api/business/responsibilities/resp_1/assign'&&req.method==='POST'){
    let b='';req.on('data',d=>b+=d);req.on('end',()=>{const body=JSON.parse(b||'{}');
      if(assignParked){assignParkHold={res,body};return;} // held in flight until /__assign-release
      assignRespond(res,body);});
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
 // Decisive-state evidence: scroll the element under test into view and capture BOTH
 // the 390px mobile viewport and a 1280px desktop viewport.
 const M390={width:390,height:844,deviceScaleFactor:2,mobile:true};
 const M1280={width:1280,height:800,deviceScaleFactor:1,mobile:false};
 const shot2=async(base,elExpr)=>{
   for(const [m,tag] of [[M390,'390'],[M1280,'desktop']]){
     await send('Emulation.setDeviceMetricsOverride',m,sessionId);
     await new Promise(r=>setTimeout(r,200));
     const found=await ev(`(()=>{const q=${elExpr};if(!q)return false;q.scrollIntoView({block:'center'});return true;})()`);
     assert(found,'evidence target visible for '+base+'-'+tag);
     await new Promise(r=>setTimeout(r,300));
     await shot(base+'-'+tag+'.png');
   }
   await send('Emulation.setDeviceMetricsOverride',M390,sessionId);
   await new Promise(r=>setTimeout(r,150));
 };

 await send('Page.enable',{},sessionId);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true},sessionId);
 await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/#business'},sessionId);
 assert(await poll(`(document.getElementById('v-business')||{textContent:''}).textContent.includes('Customer reply desk')`),'business view paints');

 // Open the responsibility: the destination line names the bot before any run
 await ev(`document.querySelector('[data-toggle-resp]').click();'open'`);
 assert(await poll(`!!document.querySelector('[data-run-input="resp_1"]')`),'resp card open');
 assert((await bizText()).includes('Goes to'),'destination line present');
 assert((await bizText()).includes('Grokbot'),'destination names the bot');
 assert((await bizText()).includes('You review the exact text before it goes to the bot'),'review promise visible');
 await ev(`(async()=>{const ta=document.querySelector('[data-run-input="resp_1"]');ta.value='Draft a reply about the $60 refund.';document.querySelector('[data-run="resp_1"]').click();})()`);
 assert(await poll(`!!document.querySelector('[data-dele-run]')`),'delegation review card paints');
 let t=await bizText();
 assert(t.includes('Review exactly what goes to Grokbot'),'review header names destination');
 assert(t.includes('Draft a reply about the $60 refund.'),'exact work text shown');
 assert(t.includes('We answer every customer email within a day'),'exact source text shown');
 assert(t.includes('not a separate private space'),'privacy boundary copy shown');
 assert(t.includes('Included sources: How we work v2'),'source versions named');
 await shot2('delegation-review',`document.querySelector('[data-dele-run]')`);

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
 await shot2('delegation-sent',`document.querySelector('[data-run-stop="task_1"]')`);

 // Working state (via the view's slow poll picking up new state)
 await ctl('/__phase?to=working');
 assert(await poll(`(document.getElementById('v-business')||{textContent:''}).textContent.includes('Working on it')`,20000),'working state paints on refresh');
 await shot2('delegation-working',`document.querySelector('[data-run-stop="task_1"]')`);

 // Done: bot-reported draft with provenance, not Alter-verified
 await ctl('/__phase?to=done');
 assert(await poll(`(document.getElementById('v-business')||{textContent:''}).textContent.includes('bot-reported')`,20000),'bot-reported draft paints');
 t=await bizText();
 assert(t.includes('Draft from Grokbot'),'provenance names the bot');
 assert(t.includes('Alter did not verify it'),'honest verification boundary');
 assert(t.includes('Alter sent nothing onward'),'effects claim scoped to what Alter itself did');
 assert(t.includes('we can offer the $60 refund'),'draft text renders');
 assert(!(await ev(`!!document.querySelector('[data-run-stop="task_1"]')`)),'stop button gone after settle');
 await shot2('delegation-done',`[...document.querySelectorAll('.bz-run')].pop()`);

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
 await shot2('delegation-failed',`[...document.querySelectorAll('.bz-run')].pop()`);

 // --- team assignment: roster honesty, truthful link labels, connected-only picking,
 // reviewed-snapshot binding, identity/generation guards, mapping-change invalidation,
 // refusal reloads truth, empty roster keeps a saved assignment visible
 if(!(await ev(`!!document.querySelector('[data-run-input="resp_1"]')`)))await ev(`(()=>{const q=document.querySelector('[data-toggle-resp]');if(q)q.click();})();'open'`);
 assert(await poll(`!!document.querySelector('[data-resp-assign="resp_1"]')`),'assign button present on a bot-mapped responsibility');
 t=await bizText();
 assert(t.includes('Runs on'),'assignment line present');
 assert(t.includes('automatic pick'),'the automatic pick is named by default');
 await ev(`document.querySelector('[data-resp-assign="resp_1"]').click();'assign'`);
 assert(await poll(`!!document.querySelector('[data-assign-save="resp_1"]')`),'assign chooser paints');
 t=await bizText();
 assert(t.includes('Alter never creates bot accounts'),'the honest no-provisioning copy is shown');
 assert(t.includes('Scout'),'the paired-but-unconnected roster bot is listed, not hidden');
 assert(await ev(`document.querySelector('[data-assign-bot][value="agent_2"]').disabled`),'a disconnected bot is never pickable');
 assert(t.includes('Paired - not heard from yet'),'the disconnected state is named honestly');
 assert(t.includes('Linked'),'a pickable bot is labeled as a saved link, not a live proof');
 assert(t.includes('not a live check'),'the label admits it is not online proof');
 assert(t.includes('named for your review before every run'),'the automatic pick promises a fresh named review, not a fixed bot');
 await shot2('assign-chooser',`document.querySelector('[data-assign-save="resp_1"]')`);

 // a server refusal (record drift) closes the chooser and never claims
 await ctl('/__assign-mode?to=changed');
 await ev(`document.querySelector('[data-assign-bot][value="agent_1"]').click();document.querySelector('[data-assign-save="resp_1"]').click();'save-refused'`);
 assert(await poll(`document.body.textContent.includes('changed while you were assigning')`),'the drift refusal reason is shown');
 assert(await poll(`!document.querySelector('[data-assign-save="resp_1"]')`),'a refused save closes the chooser');
 t=await bizText();
 assert(!t.includes('you assigned it'),'a refused save never claims the assignment landed');
 await ctl('/__assign-mode?to=ok');

 // reviewed-snapshot binding: the record changed since the chooser's review -> refused, truth reloads
 await ctl('/__resp-fp?to=fp-v2'); // the stub's record now differs from the fingerprint the next chooser captured
 await ev(`document.querySelector('[data-resp-assign="resp_1"]').click();'assign-stale'`);
 assert(await poll(`!!document.querySelector('[data-assign-save="resp_1"]')`),'chooser reopens for the stale-fingerprint save');
 // the UI's own copy is stale too: the last load carried fp-v1 while the stub now serves fp-v2
 await ev(`document.querySelector('[data-assign-bot][value="agent_1"]').click();document.querySelector('[data-assign-save="resp_1"]').click();'save-stale'`);
 assert(await poll(`document.body.textContent.includes('changed since you reviewed')`),'a stale reviewed snapshot refuses with its reason');
 assert(await poll(`!document.querySelector('[data-assign-save="resp_1"]')`),'the stale save closes the chooser');
 t=await bizText();
 assert(!t.includes('you assigned it'),'the stale save never claims the assignment landed');
 // the refusal reloaded the truth: the UI fingerprint now matches the stub again

 // a successful assignment retires the painted old-mapping delegation review
 await ev(`(async()=>{const ta=document.querySelector('[data-run-input="resp_1"]');ta.value='Draft a reply about the $60 refund.';document.querySelector('[data-run="resp_1"]').click();})()`);
 assert(await poll(`!!document.querySelector('[data-dele-run]')`),'old-mapping delegation review paints');
 await ev(`document.querySelector('[data-resp-assign="resp_1"]').click();'assign-before-ok'`);
 assert(await poll(`!!document.querySelector('[data-assign-save="resp_1"]')`),'chooser reopens beside the review');
 await ev(`document.querySelector('[data-assign-bot][value="agent_1"]').click();document.querySelector('[data-assign-save="resp_1"]').click();'save-ok'`);
 assert(await poll(`(document.getElementById('v-business')||{textContent:''}).textContent.includes('you assigned it')`),'the saved assignment paints');
 assert(!(await ev(`!!document.querySelector('[data-dele-run]')`)),'the old-mapping delegation review is discarded on the mapping change');
 t=await bizText();
 assert(t.includes('Grokbot (you assigned it)'),'the assigned bot is named');
 await shot2('assign-saved',`document.querySelector('[data-resp-assign="resp_1"]')`);

 // an identity flip mid-save: the stale continuation never toasts or claims under the new identity
 await ctl('/__assign-park');
 await ev(`document.querySelector('[data-resp-assign="resp_1"]').click();'assign-parked'`);
 assert(await poll(`!!document.querySelector('[data-assign-save="resp_1"]')`),'chooser reopens for the parked save');
 await ev(`document.querySelector('[data-assign-bot][value="agent_1"]').click();document.querySelector('[data-assign-save="resp_1"]').click();'save-parked'`);
 await new Promise(r=>setTimeout(r,400)); // the save request is in flight, parked server-side
 await ctl('/__ident?to=B');
 await ev(`BB.who=${JSON.stringify({email:'b@b.test',workspace:'wB'})};BB.emit();'flip'`);
 assert(await poll(`!(document.getElementById('v-business')||{textContent:''}).textContent.includes('Customer reply desk')`),'B identity loads during the parked save');
 await new Promise(r=>setTimeout(r,4000)); // let any earlier toast expire: a toast after this point belongs to the stale continuation
 await ctl('/__assign-release');
 await new Promise(r=>setTimeout(r,600));
 assert(!(await ev(`(()=>{const el=document.getElementById('toast');return el&&el.classList.contains('on')&&el.textContent.includes('Assignment saved');})()`)),'the stale save continuation never toasts under B');
 t=await bizText();
 assert(!t.includes('you assigned it'),'no assignment claim paints under B');
 await ctl('/__ident?to=A');
 await ev(`BB.who=${JSON.stringify({email:'a@a.test',workspace:'wA'})};BB.emit();'flip'`);
 assert(await poll(`(document.getElementById('v-business')||{textContent:''}).textContent.includes('Customer reply desk')`),'A identity back');
 await ev(`(()=>{const q=document.querySelector('[data-toggle-resp]');if(q)q.click();})();'open-truth'`);
 assert(await poll(`!!document.querySelector('[data-resp-assign="resp_1"]')`),'resp card open again under A');
 t=await bizText();
 assert(t.includes('Grokbot (you assigned it)'),'the assignment that did land server-side shows from the reloaded truth, not the stale continuation');

 // an in-flight delegation preview from the old mapping never paints after a mapping change
 await ctl('/__preview-park');
 if(!(await ev(`!!document.querySelector('[data-run-input="resp_1"]')`)))await ev(`(()=>{const q=document.querySelector('[data-toggle-resp]');if(q)q.click();})();'open3'`);
 assert(await poll(`!!document.querySelector('[data-run-input="resp_1"]')`),'resp card open for the parked preview');
 await ev(`(async()=>{const ta=document.querySelector('[data-run-input="resp_1"]');ta.value='Draft a reply about the $60 refund.';document.querySelector('[data-run="resp_1"]').click();})()`);
 await new Promise(r=>setTimeout(r,400)); // the delegate-preview request is in flight, parked
 await ev(`document.querySelector('[data-resp-assign="resp_1"]').click();'assign-during-preview'`);
 assert(await poll(`!!document.querySelector('[data-assign-save="resp_1"]')`),'chooser opens while the preview is parked');
 await ev(`document.querySelector('[data-assign-bot][value=""]').click();document.querySelector('[data-assign-save="resp_1"]').click();'save-auto'`);
 assert(await poll(`document.body.textContent.includes('Assignment cleared')`),'the mapping changed back to the automatic pick');
 await ctl('/__preview-release');
 await new Promise(r=>setTimeout(r,600));
 assert(!(await ev(`!!document.querySelector('[data-dele-run]')`)),'the old-mapping in-flight preview never paints after the mapping change');

 // a detached save/cancel node from an older chooser never acts on the current chooser
 await ev(`document.querySelector('[data-resp-assign="resp_1"]').click();'assign-detach'`);
 assert(await poll(`!!document.querySelector('[data-assign-save="resp_1"]')`),'chooser opens for the detached-node case');
 await ev(`window.__oldAssignSave=document.querySelector('[data-assign-save="resp_1"]');window.__oldAssignCancel=document.querySelector('[data-assign-cancel]');'retain'`);
 const n0=await ev(`fetch('/__assign-count').then(r=>r.json()).then(j=>j.n)`);
 await ev(`document.querySelector('[data-assign-cancel]').click();'cancel-legit'`);
 await ev(`document.querySelector('[data-resp-assign="resp_1"]').click();'assign-reopen'`);
 assert(await poll(`!!document.querySelector('[data-assign-save="resp_1"]')`),'a fresh chooser reopens');
 await ev(`window.__oldAssignSave.onclick();'old-save'`);
 await new Promise(r=>setTimeout(r,400));
 const n1=await ev(`fetch('/__assign-count').then(r=>r.json()).then(j=>j.n)`);
 assert(n1===n0,'a detached save node from the older chooser never posts');
 assert(await ev(`!!document.querySelector('[data-assign-save="resp_1"]')`),'the current chooser survives the old save node');
 await ev(`window.__oldAssignCancel.onclick();'old-cancel'`);
 await new Promise(r=>setTimeout(r,300));
 assert(await ev(`!!document.querySelector('[data-assign-save="resp_1"]')`),'the current chooser survives the old cancel node');
 await ev(`document.querySelector('[data-assign-cancel]').click();'cancel-current'`);

 // a successful assignment with a NEWER chooser open still retires the old-mapping review,
 // refreshes the truth, but never toasts from the stale continuation
 await ev(`(async()=>{const ta=document.querySelector('[data-run-input="resp_1"]');ta.value='Draft a reply about the $60 refund.';document.querySelector('[data-run="resp_1"]').click();})()`);
 assert(await poll(`!!document.querySelector('[data-dele-run]')`),'old-mapping delegation review paints for the newer-chooser case');
 await ctl('/__assign-park');
 await ev(`document.querySelector('[data-resp-assign="resp_1"]').click();'assign-nc'`);
 assert(await poll(`!!document.querySelector('[data-assign-save="resp_1"]')`),'chooser one opens');
 await ev(`document.querySelector('[data-assign-bot][value="agent_1"]').click();document.querySelector('[data-assign-save="resp_1"]').click();'save-nc'`);
 await new Promise(r=>setTimeout(r,400)); // parked in flight; the save closed chooser one
 await ev(`document.querySelector('[data-resp-assign="resp_1"]').click();'assign-newer'`);
 assert(await poll(`!!document.querySelector('[data-assign-save="resp_1"]')`),'a newer chooser opens while the save is parked');
 await new Promise(r=>setTimeout(r,4000)); // let any earlier toast expire
 await ctl('/__assign-release');
 await new Promise(r=>setTimeout(r,700));
 assert(!(await ev(`(()=>{const el=document.getElementById('toast');return el&&el.classList.contains('on')&&el.textContent.includes('Assignment saved');})()`)),'the stale continuation never toasts over the newer chooser');
 assert(!(await ev(`!!document.querySelector('[data-dele-run]')`)),'the old-mapping delegation review still dies on the confirmed mapping change');
 assert(await ev(`!!document.querySelector('[data-assign-save="resp_1"]')`),'the newer chooser stays open');
 t=await bizText();
 assert(t.includes('Grokbot (you assigned it)'),'the truth refreshed under the newer chooser');
 await ev(`document.querySelector('[data-assign-cancel]').click();'cancel-newer'`);

 // an empty roster never hides a saved assignment or its unavailable explanation
 await ctl('/__roster?to=empty');
 await send('Page.navigate',{url:'about:blank'},sessionId);
 await new Promise(r=>setTimeout(r,300));
 await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/#business'},sessionId);
 assert(await poll(`(document.getElementById('v-business')||{textContent:''}).textContent.includes('Customer reply desk')`),'business view paints with an empty roster');
 await ev(`document.querySelector('[data-toggle-resp]').click();'open4'`);
 assert(await poll(`!!document.querySelector('[data-resp-assign="resp_1"]')`),'the assignment control stays visible with an empty roster');
 t=await bizText();
 assert(t.includes('Ghost (you assigned it)'),'the saved assignment still shows with an empty roster');
 assert(t.includes('no longer on your team'),'the unavailable explanation stays visible with an empty roster');
 await ev(`document.querySelector('[data-resp-assign="resp_1"]').click();'assign-empty'`);
 assert(await poll(`!!document.querySelector('[data-assign-save="resp_1"]')`),'chooser opens with an empty roster');
 t=await bizText();
 assert(t.includes('No bots are linked right now'),'the empty roster is named honestly');
 await shot2('assign-empty-roster',`document.querySelector('[data-assign-save="resp_1"]')`);
 await ctl('/__roster?to=full');

 ws.close();cp.kill();server.close();
 console.log('PASS ui biz delegation: exact-payload review card (destination, verbatim texts, privacy boundary, source versions, scoped effects claims), identity switch discards the review, sent/working/done/failed states paint honestly with provenance and a working stop + team assignment (roster honesty with truthful link labels, connected-only pick, reviewed-snapshot binding, refusals reload truth, identity-flip mid-save and in-flight-preview discards on mapping change, detached chooser nodes never act, a newer chooser keeps review-invalidation without stale toasts, empty roster keeps a saved assignment visible) - pixels at /downloads/delegation-{review,sent,working,done,failed}- and /downloads/assign-{chooser,saved,empty-roster}-{390,desktop}.png.');
})().catch(e=>{console.error(e);try{server.close();}catch(_){/*noop*/}process.exit(1)});
