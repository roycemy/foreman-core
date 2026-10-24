// App-connections card UI (Business tab): the stored connection renders with its exact
// account + removal path EVEN WHEN connecting is unavailable (config/storage problems never
// mask it); an unloaded status is unknown, never an absence claim; connect/disconnect are
// guarded by identity + generation + exact-connection snapshot across every await (an
// identity switch mid-confirm or mid-connect discards the action); removal echoes the
// reviewed connection version and the server refuses stale/unbound removals; the toast
// never claims all-removed while a prior grant is unconfirmed.
// Real Chromium over CDP, stubbed API, synthetic data only - no Google surface anywhere.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert'),{spawn}=require('child_process');

const SCOPES=['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.compose'];
const DISC='Sync reads sender, subject, date and a short excerpt (the Gmail snippet) of recent inbox messages. The stored snapshot is encrypted at rest, kept for the owner only, and never forwarded to any bot or AI automatically.';
function appFor(mode){
  const base={provider:'gmail',label:'Gmail',configured:true,credentialStorage:'ready',scopes:SCOPES,syncDisclosure:DISC};
  if(mode==='connected-unconfigured')return {...base,configured:false,connected:true,status:'connected',email:'royce@northbend.example',connectedAt:'2026-10-23T00:00:00Z',lastSyncAt:null,lastError:null,mailCount:0,connectionVersion:'gen-AAA'};
  if(mode==='needs-reconnect')return {...base,connected:false,status:'needs_reconnect',email:'royce@northbend.example',connectedAt:'2026-10-20T00:00:00Z',lastSyncAt:'2026-10-22T00:00:00Z',lastError:'The stored credential no longer works.',mailCount:2,connectionVersion:'gen-AAA'};
  if(mode==='connected'||mode==='mismatch')return {...base,connected:true,status:'connected',email:'royce@northbend.example',connectedAt:'2026-10-23T00:00:00Z',lastSyncAt:null,lastError:null,mailCount:0,connectionVersion:'gen-AAA'};
  if(mode==='unconfirmed')return {...base,connected:true,status:'connected',email:'royce@northbend.example',connectedAt:'2026-10-23T00:00:00Z',lastSyncAt:null,lastError:null,mailCount:0,connectionVersion:'gen-AAA',grantStatus:'revoke_unconfirmed',grantNote:'Check third-party access in the Google account.'};
  if(mode==='connected2')return {...base,connected:true,status:'connected',email:'replacement@example.test',connectedAt:'2026-10-23T01:00:00Z',lastSyncAt:null,lastError:null,mailCount:0,connectionVersion:'gen-BBB'};
  if(mode==='connectable'||mode==='gone')return {...base,connected:false,status:'not_connected'};
  return null; // omit: status unavailable
}
let mode='connected-unconfigured',ident='A',disconnCalls=[],draftCalls=[],oauthHits=0,connectGo=null,disconnGo=null,draftGo=null,draftParked=[],draftOutcome='ok',withSystems=false;
function stateFor(){
  if(ident==='B'){const sb={engine:{configured:false,enabled:false,consent:null},delegate:null,sources:[],proposals:[],responsibilities:[],log:[],opPending:null};const gb=appFor(mode);if(gb)sb.apps={gmail:gb};return sb;}
  const s={engine:{configured:false,enabled:false,consent:null},delegate:null,sources:[{id:'src_1',kind:'doc',title:'How we work',version:2,text:'Refunds over $50 need Royce.',updatedAt:'2026-10-23T00:00:00Z'}],proposals:[{id:'prop_act1',title:'Estimate follow-up desk',summary:'Track sent estimates and draft reminders.',boundary:'Draft reminders only.',status:'active',createdAt:'2026-10-23T00:00:00Z',evidence:[],unknowns:[],systems:[]}],responsibilities:withSystems?[{id:'resp_1',title:'Customer reply desk',summary:'Draft replies',boundary:'Drafts only',status:'active',createdAt:'2026-10-23T00:00:00Z',runsCount:0,sourceIds:['src_1'],systems:['Email inbox','QuickBooks'],runs:[]}]:[],log:[],opPending:null};
  const g=appFor(mode);if(g)s.apps={gmail:g};
  return s;
}
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://x');
  const json=(o,st)=>{res.statusCode=st||200;res.setHeader('content-type','application/json');res.end(JSON.stringify(o));};
  if(u.pathname==='/__ident'){ident=u.searchParams.get('to');return json({ok:true});}
  if(u.pathname==='/__mode'){mode=u.searchParams.get('to');return json({ok:true});}
  if(u.pathname==='/__systems'){withSystems=u.searchParams.get('on')==='1';return json({ok:true});}
  if(u.pathname==='/__park-connect'){connectGo='park';return json({ok:true});}
  if(u.pathname==='/__park-disconnect'){disconnGo='park';return json({ok:true});}
  if(u.pathname==='/__disconnect-parked'){return json({parked:typeof disconnGo==='function'});}
  if(u.pathname==='/__disconnect-release'){const g=disconnGo;disconnGo=null;if(typeof g==='function')g();return json({ok:true});}
  if(u.pathname==='/__park-draft'){draftGo='park';return json({ok:true});}
  if(u.pathname==='/__draft-parked'){return json({parked:draftParked.length>0,count:draftParked.length});}
  if(u.pathname==='/__draft-release'){const g=draftParked.shift();if(!draftParked.length)draftGo=null;if(g)g();return json({ok:true});}
  if(u.pathname==='/__draft-mode'){draftOutcome=u.searchParams.get('to');return json({ok:true});}
  if(u.pathname==='/__parked'){return json({parked:typeof connectGo==='function'});}
  if(u.pathname==='/__connect-release'){const g=connectGo;connectGo=null;if(typeof g==='function')g();return json({ok:true});}
  if(u.pathname==='/__oauth-fake'){oauthHits++;res.setHeader('content-type','text/html');return res.end('<title>fake oauth</title>should never load');}
  if(u.pathname==='/api/me')return json(ident==='A'?{email:'a@a.test',workspace:'wA'}:{email:'b@b.test',workspace:'wB'});
  if(u.pathname==='/api/state')return json({now:new Date().toISOString()});
  if(u.pathname==='/api/money')return json({requests:[]});
  if(u.pathname==='/api/cards')return json({proposals:[],bots:[],ledger:[]});
  if(u.pathname==='/api/business/state')return json(stateFor());
  if(u.pathname==='/api/business/apps/gmail/connect'&&req.method==='POST'){
    let b='';req.on('data',d=>b+=d);req.on('end',async()=>{
      if(connectGo==='park'){await new Promise(r=>{connectGo=r;});}
      return json({authorizationUrl:'http://127.0.0.1:'+PORT+'/__oauth-fake?state=synthetic'});});
    return;}
  if(u.pathname==='/api/business/apps/gmail/drafts'&&req.method==='POST'){
    let b='';req.on('data',d=>b+=d);req.on('end',async()=>{
      const reqIdent=ident; // the caller's identity, captured before any park
      if(draftGo==='park'){await new Promise(r=>{draftParked.push(r);});}
      let body={};try{body=JSON.parse(b||'{}')}catch(e){}
      draftCalls.push({body,ident:reqIdent});
      if(draftOutcome==='unconfirmed')return json({error:'Google could not confirm the draft (HTTP 503). It may exist in Gmail - check the drafts folder before trying again, so it is not duplicated.',code:'app_draft_unconfirmed'},502);
      return json({provider:'gmail',draftId:'draft_9',account:'royce@northbend.example',to:[body.to],subject:body.subject||'',note:'Draft created in Gmail with exactly these words. Nothing was sent - review and send it there.'});});
    return;}
  if(u.pathname==='/api/business/apps/gmail/disconnect'&&req.method==='POST'){
    let b='';req.on('data',d=>b+=d);req.on('end',async()=>{
      if(disconnGo==='park'){await new Promise(r=>{disconnGo=r;});}
      let body={};try{body=JSON.parse(b||'{}')}catch(e){}
      disconnCalls.push({body,ident});
      if(mode==='mismatch')return json({error:'The connection changed since this page was loaded - reload and review it before disconnecting. Nothing was removed.',code:'app_version_mismatch'},409);
      if(mode==='connected')mode='gone'; // a mode changed while the response was parked (a replacement) stays
      return json({disconnected:true,provider:'gmail',grantStatus:'revoked',priorGrant:'revoke_unconfirmed',pendingCancelled:true,note:'Local data is removed. Google did not confirm revoking every grant - the connection may still show under third-party access in the Google account; remove it there to be sure.'});});
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
let PORT=0;

(async()=>{
 const bin=chrome();assert(bin,'a Chromium/Chrome binary is required for this browser regression');
 await new Promise(r=>server.listen(0,r));PORT=server.address().port;
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
 const ctl=async p=>{await new Promise((res,rej)=>{http.get('http://127.0.0.1:'+PORT+p,r=>{r.resume();res();}).on('error',rej);});};
 const bizText=()=>ev(`(document.getElementById('v-business')||{textContent:''}).textContent`);
 const toastText=()=>ev(`(()=>{const t=document.getElementById('toast');return t&&t.classList.contains('on')?t.textContent:'';})()`);
 const shot=async name=>{const s=await send('Page.captureScreenshot',{format:'png'},sessionId);fs.writeFileSync('/downloads/'+name,Buffer.from(s.data,'base64'));};
 const M390={width:390,height:844,deviceScaleFactor:2,mobile:true},M1280={width:1280,height:800,deviceScaleFactor:1,mobile:false};
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
 // A bare 'App connections' text poll races the boot's first paint pass; wait for the exact
  // marker the next step needs so handlers are bound before any click.
  // The boot paints once under an UNKNOWN identity, then /api/me lands, the tenant guard wipes
  // and reloads - a marker seen in between disappears again. Wait for the identity to be known
  // AND the marker present, then confirm the marker survives a settle window.
  const reload=async(marker)=>{const m=marker||`(document.getElementById('v-business')||{textContent:''}).textContent.includes('App connections')`;
    await send('Page.navigate',{url:'about:blank'},sessionId);await new Promise(r=>setTimeout(r,300));
    await send('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/#business'},sessionId);
    assert(await poll(`(window.BB&&BB.who&&BB.who.email)&&(${m})`),'business view paints: '+m);
    await new Promise(r=>setTimeout(r,300));
    assert(await ev(`!!(window.BB&&BB.who&&BB.who.email)&&(${m})`),'marker survives the identity-known repaint: '+m);};
 const flip=async to=>{await ctl('/__ident?to='+to);await ev(`BB.who=${JSON.stringify(to==='A'?{email:'a@a.test',workspace:'wA'}:{email:'b@b.test',workspace:'wB'})};BB.emit();'flip'`);};

 await send('Page.enable',{},sessionId);
 await send('Emulation.setDeviceMetricsOverride',M390,sessionId);
 await send('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/#business'},sessionId);
 assert(await poll(`(document.getElementById('v-business')||{textContent:''}).textContent.includes('App connections')`),'business view paints');

 // 1. connected while UNCONFIGURED: the stored connection is never masked - exact account,
 //    removal reachable, and the copy says reconnecting is unavailable rather than "not set up"
 let t=await bizText();
 assert(t.includes('Connected as royce@northbend.example'),'the exact connected account renders despite missing config');
 assert(t.includes('Reconnecting is unavailable'),'the config problem is named without masking the connection');
 assert(!t.includes('not set up on this deployment yet'),'config-missing copy never claims there is nothing to remove');
 assert(await ev(`!!document.querySelector('#bz-app-disconnect')`),'removal stays reachable');
 assert(t.includes('The compose scope technically allows sending; this app has no send endpoint and never sends'),'scope copy bounds the send claim honestly');
 assert(!t.includes('only you send'),'no promise that only the owner can ever send via the granted scope');
 assert(!t.includes('Nothing is ever sent'),'no categorical no-send claim');
 assert(t.includes(DISC.slice(0,40)),'the sync disclosure shows on the connected card');
 await shot2('apps-connected-unconfigured',`document.querySelector('#bz-app-disconnect')`);

 // 2. needs_reconnect: account + recovery + removal all visible
 await ctl('/__mode?to=needs-reconnect');await reload(`!!document.querySelector('#bz-app-disconnect')`);
 t=await bizText();
 assert(t.includes('Gmail - royce@northbend.example'),'needs_reconnect still names the exact account');
 assert(t.includes('The stored credential no longer works.'),'the reconnect reason shows');
 assert(t.includes('Reconnect needed'),'the warning chip shows');
 assert(await ev(`!!document.querySelector('#bz-app-disconnect')`),'removal stays reachable in needs_reconnect');
 assert(await ev(`!!document.querySelector('#bz-app-connect')`),'reconnect is offered when connecting is available');
 await shot2('apps-needs-reconnect',`document.querySelector('#bz-app-disconnect')`);

 // 3. status unavailable: UNKNOWN, never an absence claim
 await ctl('/__mode?to=omit');await reload(`(document.getElementById('v-business')||{textContent:''}).textContent.includes('whether an account is connected is unknown')`);
 t=await bizText();
 assert(t.includes('whether an account is connected is unknown'),'unloaded status is honestly unknown');
 assert(!/nothing is connected/i.test(t),'no absence claim without evidence');

 // 4. removal echoes the reviewed version; the toast never claims all-removed while a prior
 //    grant is unconfirmed
 await ctl('/__mode?to=connected');await reload(`!!document.querySelector('#bz-app-disconnect')`);
 await ev(`document.querySelector('#bz-app-disconnect').click();'click'`);
 assert(await poll(`!!document.querySelector('#modal.on [data-yes]')`),'the confirm dialog opens');
 await ev(`document.querySelector('#modal.on [data-yes]').click();'yes'`);
 assert(await poll(`document.getElementById('toast')&&document.getElementById('toast').classList.contains('on')`),'a result toast shows');
 t=await toastText();
 assert.equal(disconnCalls.length,1,'exactly one removal call');
 assert.equal(disconnCalls[0].body.expectedVersion,'gen-AAA','the removal echoes the exact reviewed connection version');
 assert(t.includes('royce@northbend.example'),'the confirmation names the reviewed account');
 assert(t.includes('Google did not confirm revoking every grant'),'the unconfirmed PRIOR grant is surfaced');
 assert(t.includes('remove it there to be sure'),'the manual recovery path is named');
 assert(!t.includes('Google confirmed the access removal'),'a confirmed current grant never implies older grants are gone');
 await shot2('apps-disconnect-prior-unconfirmed',`document.getElementById('toast')`);
 assert(await poll(`(document.getElementById('v-business')||{textContent:''}).textContent.includes('Connect Gmail')`),'the card settles to not-connected after removal');

 // 5. identity switch while the confirm dialog is open: confirming sends NOTHING as B
 await ctl('/__mode?to=connected');await reload(`!!document.querySelector('#bz-app-disconnect')`);
 disconnCalls.length=0;
 await ev(`document.querySelector('#bz-app-disconnect').click();'click'`);
 assert(await poll(`!!document.querySelector('#modal.on [data-yes]')`),'the confirm dialog opens');
 await flip('B');
 assert(await poll(`!(document.getElementById('v-business')||{textContent:''}).textContent.includes('royce@northbend.example')`),'B identity loads, A connection gone from view');
 await ev(`(()=>{const y=document.querySelector('#modal [data-yes]');if(y)y.click();return 'yes'})()`);
 await new Promise(r=>setTimeout(r,700));
 assert.equal(disconnCalls.length,0,'a confirm from the OLD identity never sends under the new one');
 await ev(`(()=>{const m=document.getElementById('modal');if(m&&m.classList.contains('on'))m.classList.remove('on');return 1})()`);

 // 6. parked connect: an identity switch before the consent URL arrives discards the redirect
 await flip('A');
 await ctl('/__mode?to=connectable');await reload(`!!document.querySelector('#bz-app-connect')`);
 await ctl('/__park-connect'); // arm: the next connect response is held server-side
 await ev(`document.querySelector('#bz-app-connect').click();'clicked'`);
 {const t0=Date.now();let ok=false;while(Date.now()-t0<5000){const p=await new Promise((res,rej)=>{http.get('http://127.0.0.1:'+PORT+'/__parked',r=>{let d='';r.on('data',ch=>d+=ch);r.on('end',()=>res(JSON.parse(d).parked));}).on('error',rej);});if(p){ok=true;break;}await new Promise(r=>setTimeout(r,100));}assert(ok,'the connect request parked server-side');}
 await flip('B');
 assert(await poll(`(document.getElementById('v-business')||{textContent:''}).textContent.includes('Business')`),'B paints');
 await ctl('/__connect-release');
 await new Promise(r=>setTimeout(r,800));
 assert.equal(oauthHits,0,"the old identity consent URL is never navigated under B");
 assert(await ev(`location.hash==='#business'`),'the page never left the app');
 await flip('A');

 // 7. stale version: the server refuses and the page surfaces it
 await ctl('/__mode?to=mismatch');await reload(`!!document.querySelector('#bz-app-disconnect')`);
 disconnCalls.length=0;
 await ev(`document.querySelector('#bz-app-disconnect').click();'click'`);
 assert(await poll(`!!document.querySelector('#modal.on [data-yes]')`),'the confirm dialog opens');
 await ev(`document.querySelector('#modal.on [data-yes]').click();'yes'`);
 assert(await poll(`(document.getElementById('toast')||{textContent:''}).textContent.includes('The connection changed')`),'the server refusal is surfaced');
 assert.equal(disconnCalls.length,1,'the refusal came from the server, not a client skip');

 // 8. OAuth landing: the callback redirect marker announces once, from the live state, then cleans itself
 await ctl('/__mode?to=connected');
 await send('Page.navigate',{url:'about:blank'},sessionId);await new Promise(r=>setTimeout(r,300));
 await send('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/#business/app-connected'},sessionId);
 assert(await poll(`(document.getElementById('toast')||{textContent:''}).textContent.includes('Gmail connected as royce@northbend.example')`),'the landing names the connected account from live state');
 assert(await ev(`location.hash==='#business'`),'the marker is cleared so a refresh never re-announces');
 await send('Page.navigate',{url:'about:blank'},sessionId);await new Promise(r=>setTimeout(r,300));
 await send('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/#business/app-declined'},sessionId);
 assert(await poll(`(document.getElementById('toast')||{textContent:''}).textContent.includes('the existing connection is unchanged')`),'a declined NEW consent over a live connection never claims nothing was connected');
 t=await toastText();
 assert(!t.includes('nothing was connected'),'the live connection is never denied by a declined new sign-in');
 await send('Page.navigate',{url:'about:blank'},sessionId);await new Promise(r=>setTimeout(r,300));
 await ctl('/__mode?to=connectable');
 await send('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/#business/app-declined'},sessionId);
 assert(await poll(`(document.getElementById('toast')||{textContent:''}).textContent.includes('Google declined the new sign-in - nothing was connected')`),'with no connection, a declined consent says so honestly');
 await send('Page.navigate',{url:'about:blank'},sessionId);await new Promise(r=>setTimeout(r,300));
 await send('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/#business/app-failed'},sessionId);
 assert(await poll(`(document.getElementById('toast')||{textContent:''}).textContent.includes('could not be finished - nothing was connected')`),'a failed sign-in with no connection says so honestly');
 await ctl('/__mode?to=connected');

 // 9. parked success over a replacement: the old grant's fate is never announced over the new card
 await ctl('/__mode?to=connected');await reload(`!!document.querySelector('#bz-app-disconnect')`);
 await ctl('/__park-disconnect');
 await ev(`document.querySelector('#bz-app-disconnect').click();'click'`);
 assert(await poll(`!!document.querySelector('#modal.on [data-yes]')`),'the confirm dialog opens');
 await ev(`document.querySelector('#modal.on [data-yes]').click();'yes'`);
 {const t0=Date.now();let ok=false;while(Date.now()-t0<5000){const p=await new Promise((res,rej)=>{http.get('http://127.0.0.1:'+PORT+'/__disconnect-parked',r=>{let d='';r.on('data',ch=>d+=ch);r.on('end',()=>res(JSON.parse(d).parked));}).on('error',rej);});if(p){ok=true;break;}await new Promise(r=>setTimeout(r,100));}assert(ok,'the removal parked server-side');}
 await ctl('/__mode?to=connected2'); // another tab connected the replacement meanwhile
 await ctl('/__disconnect-release');
 assert(await poll(`(document.getElementById('toast')||{textContent:''}).textContent.includes('A different connection is active now')`),'a replacement landed mid-removal gets a neutral announcement');
 t=await toastText();
 assert(!t.includes('Google confirmed the access removal'),'the old grant\'s confirmation is never announced over the replacement');
 assert(await poll(`(document.getElementById('v-business')||{textContent:''}).textContent.includes('Connected as replacement@example.test')`),'the card shows the current connection');

 // 10. draft review: the exact account + recipients + subject + words are reviewed before create
 await ctl('/__mode?to=connected');await reload(`!!document.querySelector('#bz-app-draft')`);
 await ev(`document.querySelector('#bz-app-draft').click();'open'`);
 assert(await poll(`!!document.querySelector('#modal.on #bz-draft-to')`),'the composer opens');
 await ev(`(()=>{document.querySelector('#bz-draft-to').value='dana@example.com';document.querySelector('#bz-draft-subject').value='Re: Estimate for the fence repair';document.querySelector('#bz-draft-text').value='Hi Dana - attached is the estimate.';return 1})()`);
 await ev(`document.querySelector('#modal.on [data-draft-review]').click();'review'`);
 assert(await poll(`!!document.querySelector('#modal.on [data-draft-create]')`),'the review step opens');
 t=await ev(`(document.getElementById('modal')||{textContent:''}).textContent`);
 assert(t.includes('royce@northbend.example'),'the review names the exact linked account');
 assert(t.includes('dana@example.com'),'the review names the exact recipients');
 assert(t.includes('Re: Estimate for the fence repair'),'the review names the exact subject');
 assert(t.includes('Hi Dana - attached is the estimate.'),'the review shows the exact words');
 assert(t.includes('nothing is sent')||t.includes('Nothing is sent'),'the review states nothing is sent');
 await shot2('apps-draft-review',`document.querySelector('#modal.on [data-draft-create]')`);
 await ev(`document.querySelector('#modal.on [data-draft-create]').click();'create'`);
 assert(await poll(`(document.getElementById('toast')||{textContent:''}).textContent.includes('Draft created in Gmail with exactly these words')`),'the result echoes the draft, never a send');
 assert.equal(draftCalls.length,1,'exactly one draft call');
 assert.equal(draftCalls[0].body.expectedVersion,'gen-AAA','the draft echoes the reviewed connection version');
 assert.equal(draftCalls[0].body.to,'dana@example.com','the exact recipients go through');
 assert.equal(draftCalls[0].body.subject,'Re: Estimate for the fence repair','the exact subject goes through');
 assert.equal(draftCalls[0].body.text,'Hi Dana - attached is the estimate.','the exact words go through');

 // 13. Back from the review keeps every typed word
 await ev(`document.querySelector('#bz-app-draft').click();'open'`);
 assert(await poll(`!!document.querySelector('#modal.on #bz-draft-to')`),'the composer opens');
 await ev(`(()=>{document.querySelector('#bz-draft-to').value='dana@example.com';document.querySelector('#bz-draft-subject').value='Re: Estimate for the fence repair';document.querySelector('#bz-draft-text').value='Hi Dana - the gate brace is 180.';return 1})()`);
 await ev(`document.querySelector('#modal.on [data-draft-review]').click();'review'`);
 assert(await poll(`!!document.querySelector('#modal.on [data-draft-back]')`),'the review step opens');
 await ev(`document.querySelector('#modal.on [data-draft-back]').click();'back'`);
 assert(await poll(`(document.querySelector('#modal.on #bz-draft-text')||{value:''}).value==='Hi Dana - the gate brace is 180.'`),'Back restores the exact words');
 assert(await poll(`(document.querySelector('#modal.on #bz-draft-to')||{value:''}).value==='dana@example.com'`),'Back restores the recipient');
 assert(await poll(`(document.querySelector('#modal.on #bz-draft-subject')||{value:''}).value==='Re: Estimate for the fence repair'`),'Back restores the subject');

 // 14. a stale draft success never closes a newer composer nor claims over a replacement
 await ctl('/__park-draft');
 await ev(`document.querySelector('#modal.on [data-draft-review]').click();'review again'`);
 assert(await poll(`!!document.querySelector('#modal.on [data-draft-create]')`),'the review reopens');
 await ev(`document.querySelector('#modal.on [data-draft-create]').click();'create'`);
 {const t0=Date.now();let ok=false;while(Date.now()-t0<5000){const p=await new Promise((res,rej)=>{http.get('http://127.0.0.1:'+PORT+'/__draft-parked',r=>{let d='';r.on('data',ch=>d+=ch);r.on('end',()=>res(JSON.parse(d).parked));}).on('error',rej);});if(p){ok=true;break;}await new Promise(r=>setTimeout(r,100));}assert(ok,'the draft create parked server-side');}
 await ev(`(()=>{const m=document.getElementById('modal');if(m)m.classList.remove('on');return 1})()`); // the owner closes the review mid-request
 await ev(`document.querySelector('#bz-app-draft').click();'new composer'`);
 assert(await poll(`!!document.querySelector('#modal.on #bz-draft-to')`),'a new composer opens');
 await ev(`(()=>{document.querySelector('#bz-draft-to').value='sam@example.com';document.querySelector('#bz-draft-text').value='NEWWORDS';return 1})()`);
 await ctl('/__mode?to=connected2'); // a replacement connection lands meanwhile (same owner)
 await ctl('/__draft-release');
 assert(await poll(`(document.getElementById('toast')||{textContent:''}).textContent.includes('connection changed meanwhile')`),'the late success says where the draft went, not over the replacement');
 t=await toastText();
 assert(t.includes('royce@northbend.example'),'the late success names the reviewed account');
 assert(!t.includes('exactly these words'),'the stale success copy never lands over a replacement');
 assert(await poll(`(document.querySelector('#modal.on #bz-draft-text')||{value:''}).value==='NEWWORDS'`),'the newer composer is untouched');
 assert(await poll(`(document.querySelector('#modal.on #bz-draft-to')||{value:''}).value==='sam@example.com'`),'the newer composer keeps its recipient');
 assert.equal(draftCalls.length,2,'exactly one new draft call');
 assert.equal(draftCalls[1].body.expectedVersion,'gen-AAA','the parked create stayed bound to the reviewed version');
 await ev(`(()=>{const m=document.getElementById('modal');if(m)m.classList.remove('on');return 1})()`);

 // 11. identity switch before create: the draft is never posted as the new identity
 await reload(`!!document.querySelector('#bz-app-draft')`);
 await ev(`document.querySelector('#bz-app-draft').click();'open'`);
 assert(await poll(`!!document.querySelector('#modal.on #bz-draft-to')`),'the composer opens');
 await ev(`(()=>{document.querySelector('#bz-draft-to').value='dana@example.com';document.querySelector('#bz-draft-text').value='Hi again';return 1})()`);
 await ev(`document.querySelector('#modal.on [data-draft-review]').click();'review'`);
 assert(await poll(`!!document.querySelector('#modal.on [data-draft-create]')`),'the review step opens');
 await flip('B');
 await ev(`(()=>{const b=document.querySelector('#modal [data-draft-create]');if(b)b.click();return 1})()`);
 await new Promise(r=>setTimeout(r,700));
 assert.equal(draftCalls.length,2,'the old identity\'s review never creates a draft under the new one');
 await ev(`(()=>{const m=document.getElementById('modal');if(m&&m.classList.contains('on'))m.classList.remove('on');return 1})()`);
 await flip('A');

 // 16. a pending draft create cannot be duplicated via Back/close/reopen - Close is not cancel
 await ctl('/__mode?to=connected');await reload(`!!document.querySelector('#bz-app-draft')`);
 await ctl('/__park-draft');
 await ev(`document.querySelector('#bz-app-draft').click();'open'`);
 assert(await poll(`!!document.querySelector('#modal.on #bz-draft-to')`),'the composer opens');
 await ev(`(()=>{document.querySelector('#bz-draft-to').value='dana@example.com';document.querySelector('#bz-draft-text').value='same words';return 1})()`);
 await ev(`document.querySelector('#modal.on [data-draft-review]').click();'review'`);
 assert(await poll(`!!document.querySelector('#modal.on [data-draft-create]')`),'the review opens');
 await ev(`document.querySelector('#modal.on [data-draft-create]').click();'create'`);
 {const t0=Date.now();let ok=false;while(Date.now()-t0<5000){const p=await new Promise((res,rej)=>{http.get('http://127.0.0.1:'+PORT+'/__draft-parked',r=>{let d='';r.on('data',ch=>d+=ch);r.on('end',()=>res(JSON.parse(d).parked));}).on('error',rej);});if(p){ok=true;break;}await new Promise(r=>setTimeout(r,100));}assert(ok,'the create parked server-side');}
 assert(await ev(`(document.querySelector('#modal [data-draft-back]')||{disabled:false}).disabled`),'Back is disabled while the create is in flight');
 assert(await ev(`(document.querySelector('#modal.on')||{textContent:''}).textContent.includes('does not cancel')`),'the pending state says closing is not cancellation');
 await ev(`(()=>{const b=document.querySelector('#modal [data-draft-back]');if(b)b.click();return 1})()`);
 assert(!(await poll(`!!document.querySelector('#modal.on #bz-draft-to')`,1500)),'Back cannot reopen the composer mid-request');
 await ev(`(()=>{const m=document.getElementById('modal');if(m)m.classList.remove('on');return 1})()`); // close mid-flight
 await ev(`document.querySelector('#bz-app-draft').click();'reopen'`);
 assert(await poll(`(document.querySelector('#modal.on')||{textContent:''}).textContent.includes('already being created')`),'a reopened composer owns the pending operation');
 assert(await ev(`(document.querySelector('#modal [data-draft-review]')||{disabled:false}).disabled`),'no second submit while the first is unresolved');
 await ev(`(()=>{document.querySelector('#bz-draft-to').value='sam@example.com';document.querySelector('#bz-draft-text').value='KEPTWORDS';return 1})()`);
 const draftsBefore=draftCalls.length;
 await ctl('/__draft-release');
 assert(await poll(`(document.getElementById('toast')||{textContent:''}).textContent.includes('Draft created in Gmail')`),'the single create resolves honestly');
 assert.equal(draftCalls.length,draftsBefore+1,'exactly one POST - no duplicate from Back or reopen');
 assert(await poll(`!!document.querySelector('#modal.on [data-draft-review]:not([disabled])')`),'the open composer re-arms in place on the known outcome');
 assert(!(await ev(`!!document.querySelector('#modal [data-draft-pending]')`)),'the pending presentation is removed, not left stale');
 assert(await ev(`(document.querySelector('#modal.on #bz-draft-text')||{value:''}).value==='KEPTWORDS'`),'the newer words survive the settlement');
 await ev(`(()=>{const m=document.getElementById('modal');if(m)m.classList.remove('on');return 1})()`);

 // 19. unconfirmed creates become durable receipts: explicit checked-Gmail decision, never success-cleared
 await ctl('/__draft-mode?to=unconfirmed');
 assert(await poll(`!!document.querySelector('#bz-app-draft')`),'the apps card paints for test 19');
 await ev(`document.querySelector('#bz-app-draft').click();'open'`);
 await ev(`(()=>{document.querySelector('#bz-draft-to').value='dana@example.com';document.querySelector('#bz-draft-subject').value='Estimate';document.querySelector('#bz-draft-text').value='the gate brace quote';return 1})()`);
 await ev(`document.querySelector('#modal.on [data-draft-review]').click();'review'`);
 assert(await poll(`!!document.querySelector('#modal.on [data-draft-create]')`),'the review opens');
 await ev(`document.querySelector('#modal.on [data-draft-create]').click();'create'`);
 assert(await poll(`(document.getElementById('toast')||{textContent:''}).textContent.includes('check the drafts folder')`),'the unconfirmed outcome tells the owner to check Gmail');
 await ev(`document.querySelector('#bz-app-draft').click();'reopen'`);
 assert(await poll(`(document.querySelector('#modal.on')||{textContent:''}).textContent.includes('may exist in Gmail')`),'the unresolved op is never forgotten across close/reopen');
 await ev(`(()=>{document.querySelector('#bz-draft-to').value='dana@example.com';document.querySelector('#bz-draft-subject').value='Estimate';document.querySelector('#bz-draft-text').value='the gate brace quote';return 1})()`);
 await ev(`document.querySelector('#modal.on [data-draft-review]').click();'review same'`);
 assert(await poll(`!!document.querySelector('#modal.on [data-draft-checked]')`),'a same-op retry requires the checked-Gmail decision');
 assert(await ev(`(document.querySelector('#modal.on [data-draft-create]')||{disabled:false}).disabled`),'Create stays disabled until the decision');
 await ev(`(()=>{const c=document.querySelector('#modal.on [data-draft-checked]');c.checked=true;c.onchange();return 1})()`);
 assert(!(await ev(`(document.querySelector('#modal.on [data-draft-create]')||{disabled:false}).disabled`)),'the explicit decision re-arms Create');
 await ev(`document.querySelector('#modal.on [data-draft-back]').click();'back'`);
 await ev(`(()=>{document.querySelector('#bz-draft-subject').value='Different subject';return 1})()`);
 await ev(`document.querySelector('#modal.on [data-draft-review]').click();'review other'`);
 assert(!(await ev(`!!document.querySelector('#modal.on [data-draft-checked]')`)),'an unrelated new draft needs no decision');
 await ev(`(()=>{const m=document.getElementById('modal');if(m)m.classList.remove('on');return 1})()`);
 await reload(`!!document.querySelector('#bz-app-draft')`);
 await ev(`document.querySelector('#bz-app-draft').click();'after reload'`);
 assert(await poll(`(document.querySelector('#modal.on')||{textContent:''}).textContent.includes('may exist in Gmail')`),'the receipt survives a full reload');
 await ev(`(()=>{const m=document.getElementById('modal');if(m)m.classList.remove('on');return 1})()`);
 await ctl('/__draft-mode?to=ok');
 await ev(`document.querySelector('#bz-app-draft').click();'resolve'`);
 await ev(`(()=>{document.querySelector('#bz-draft-to').value='dana@example.com';document.querySelector('#bz-draft-subject').value='Estimate';document.querySelector('#bz-draft-text').value='the gate brace quote';return 1})()`);
 await ev(`document.querySelector('#modal.on [data-draft-review]').click();'review final'`);
 await ev(`(()=>{const c=document.querySelector('#modal.on [data-draft-checked]');if(c){c.checked=true;c.onchange();}return 1})()`);
 await ev(`document.querySelector('#modal.on [data-draft-create]').click();'create final'`);
 assert(await poll(`(document.getElementById('toast')||{textContent:''}).textContent.includes('An earlier attempt may also have created a draft')`),'a successful retry still names the possible earlier draft');
 await ev(`document.querySelector('#bz-app-draft').click();'after success'`);
 assert(await poll(`(document.querySelector('#modal.on')||{textContent:''}).textContent.includes('may exist in Gmail')`),'a success never clears the earlier unknown');
 await ev(`(()=>{document.querySelector('#modal.on [data-draft-reconciled]').click();return 1})()`);
 assert(!(await ev(`!!document.querySelector('#modal [data-draft-unconf]')`)),'the owner decision clears the receipt');
 await ev(`(()=>{const m=document.getElementById('modal');if(m)m.classList.remove('on');return 1})()`);
 await reload(`!!document.querySelector('#bz-app-draft')`);
 await ev(`document.querySelector('#bz-app-draft').click();'after clear'`);
 assert(!(await ev(`(document.querySelector('#modal.on')||{textContent:''}).textContent.includes('may exist in Gmail')`)),'the cleared receipt stays cleared across reloads');
 await ev(`(()=>{const m=document.getElementById('modal');if(m)m.classList.remove('on');return 1})()`);

 // 20. A->B->A: operation records are scoped and stable - no singleton overwrite, no cross-identity clear
 await ctl('/__park-draft');
 assert(await poll(`!!document.querySelector('#bz-app-draft')`),'the apps card paints for test 20');
 await ev(`document.querySelector('#bz-app-draft').click();'A open'`);
 await ev(`(()=>{document.querySelector('#bz-draft-to').value='dana@example.com';document.querySelector('#bz-draft-text').value='A words';return 1})()`);
 await ev(`document.querySelector('#modal.on [data-draft-review]').click();'A review'`);
 await ev(`document.querySelector('#modal.on [data-draft-create]').click();'A create'`);
 {const t0=Date.now();let ok=false;while(Date.now()-t0<5000){const p=await new Promise((res,rej)=>{http.get('http://127.0.0.1:'+PORT+'/__draft-parked',r=>{let d='';r.on('data',ch=>d+=ch);r.on('end',()=>res(JSON.parse(d).count>=1));}).on('error',rej);});if(p){ok=true;break;}await new Promise(r=>setTimeout(r,100));}assert(ok,'A parked');}
 await flip('B');
 assert(await poll(`!!document.querySelector('#bz-app-draft')`),'B apps card paints after the flip');
 await ev(`document.querySelector('#bz-app-draft').click();'B open'`);
 assert(await poll(`!!document.querySelector('#modal.on #bz-draft-to')`),'B composer opens without the A pending gate');
 assert(!(await ev(`!!document.querySelector('#modal [data-draft-pending]')`)),'B is never gated by A operation');
 await ev(`(()=>{document.querySelector('#bz-draft-to').value='sam@example.com';document.querySelector('#bz-draft-text').value='B words';return 1})()`);
 await ev(`document.querySelector('#modal.on [data-draft-review]').click();'B review'`);
 await ev(`document.querySelector('#modal.on [data-draft-create]').click();'B create'`);
 {const t0=Date.now();let ok=false;while(Date.now()-t0<5000){const p=await new Promise((res,rej)=>{http.get('http://127.0.0.1:'+PORT+'/__draft-parked',r=>{let d='';r.on('data',ch=>d+=ch);r.on('end',()=>res(JSON.parse(d).count>=2));}).on('error',rej);});if(p){ok=true;break;}await new Promise(r=>setTimeout(r,100));}assert(ok,'B parked behind A');}
 await flip('A');
 assert(await poll(`!!document.querySelector('#bz-app-draft')`),'A card repaints');
 await ev(`document.querySelector('#bz-app-draft').click();'A reopen'`);
 assert(await poll(`!!document.querySelector('#modal [data-draft-pending]')`),'A own gate survives B occupancy - no singleton overwrite');
 await flip('B');
 assert(await poll(`!!document.querySelector('#bz-app-draft')`),'B card repaints again');
 await ev(`document.querySelector('#bz-app-draft').click();'B reopen'`);
 assert(await poll(`!!document.querySelector('#modal [data-draft-pending]')`),'B own gate survives the round trip');
 await ctl('/__draft-release'); // A completes first (FIFO) - its reply lands under B
 await new Promise(r=>setTimeout(r,600));
 assert(await ev(`!!document.querySelector('#modal [data-draft-pending]')`),'B gate survives A completion - the older reply never clears it');
 assert(await ev(`(document.querySelector('#modal [data-draft-review]')||{disabled:false}).disabled`),'B cannot duplicate-submit while its own op is unresolved');
 await ctl('/__draft-release'); // B completes
 assert(await poll(`(document.getElementById('toast')||{textContent:''}).textContent.includes('Draft created in Gmail')`),'B create resolves honestly');
 assert(await poll(`!!document.querySelector('#modal.on [data-draft-review]:not([disabled])')`),'B composer re-arms in place on its own outcome');
 assert(!(await ev(`!!document.querySelector('#modal [data-draft-pending]')`)),'B pending note clears on B outcome');
 assert.equal(draftCalls[draftCalls.length-1].ident,'B','the last draft ran under B');
 assert.equal(draftCalls[draftCalls.length-2].ident,'A','the earlier parked draft ran under A');
 await flip('A');
 await ev(`(()=>{const m=document.getElementById('modal');if(m)m.classList.remove('on');return 1})()`);

 // 17. landing copy separates a known record from unknown/absent; recovery is unconditional
 await ctl('/__mode?to=needs-reconnect');
 await send('Page.navigate',{url:'about:blank'},sessionId);await new Promise(r=>setTimeout(r,300));
 await send('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/#business/app-declined'},sessionId);
 assert(await poll(`(document.getElementById('toast')||{textContent:''}).textContent.includes('the stored connection is unchanged')`),'a needs-reconnect record is never claimed absent');
 await ctl('/__mode?to=omit');
 await send('Page.navigate',{url:'about:blank'},sessionId);await new Promise(r=>setTimeout(r,300));
 await send('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/#business/app-failed'},sessionId);
 assert(await poll(`(document.getElementById('toast')||{textContent:''}).textContent.includes('the card shows the current state')`),'an unknown status makes no absence claim');
 t=await toastText();
 assert(!t.includes('nothing was connected'),'unknown is never reported as absent');
 await ctl('/__mode?to=connected');
 await send('Page.navigate',{url:'about:blank'},sessionId);await new Promise(r=>setTimeout(r,300));
 await send('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/#business/app-uncertain'},sessionId);
 assert(await poll(`(document.getElementById('toast')||{textContent:''}).textContent.includes('third-party access')`),'an uncertain landing always carries the recovery path');
 t=await toastText();
 assert(t.includes('the existing connection is unchanged'),'the live connection is named unchanged');
 assert(!t.includes('if nothing is connected'),'recovery is never gated on absence');
 await ctl('/__mode?to=connected');

 // 21. an activated proposal never renders as a pending decision again
 await ctl('/__mode?to=connected');await reload(`!!document.querySelector('#bz-apps-card')`);
 t=await bizText();
 assert(t.includes('Estimate follow-up desk'),'the activated proposal still shows as a record');
 const propCardTxt=await ev(`(()=>{const c=document.querySelector('[data-prop="prop_act1"]');return c?c.textContent:''})()`);
 assert(propCardTxt.length>0,'the activated proposal card exists');
 assert(!propCardTxt.includes('Approve and start')&&!propCardTxt.includes('Reject'),'a decided proposal has no decision buttons');
 assert(propCardTxt.includes('Started'),'the card says it started');
 assert(!t.match(/proposals are waiting/),'decided proposals never inflate the waiting count');

 // 12. integration honesty: a live connection's systems leave the "until those connect" line
 await ctl('/__systems?on=1');
 await ctl('/__mode?to=connected');await reload(`!!document.querySelector('#bz-app-disconnect')`);
 t=await bizText();
 const mention=t.split('Your proposals mention:')[1]||'';
 assert(mention.includes('QuickBooks'),'uncovered systems are still named');
 assert(!mention.includes('Email inbox'),'a connected system is never asked for as an import');
 await ctl('/__mode?to=connectable');await reload(`!!document.querySelector('#bz-app-connect')`);
 t=await bizText();
 assert((t.split('Your proposals mention:')[1]||'').includes('Email inbox'),'the same system IS named while unconnected');
 await ctl('/__systems?on=0');

 // 15. HQ "At a glance" surfaces app states: needs-reconnect and unconfirmed removal are needs, never silent card-only states
 await ctl('/__mode?to=needs-reconnect');await reload(`!!document.querySelector('#bz-app-connect')`);
 t=await bizText();
 assert(t.includes('needs reconnecting'),'a stored connection that needs reconnecting is an HQ need');
 assert(t.includes('royce@northbend.example'),'the need names the exact account');
 assert(!t.includes('Nothing needs you right now'),'a real need is never hidden behind an empty glance');
 await ctl('/__mode?to=unconfirmed');await reload(`!!document.querySelector('#bz-app-disconnect')`);
 t=await bizText();
 assert(t.includes('removal was not confirmed'),'an unconfirmed removal is an HQ need');
 await shot2('apps-hq-needs',`document.querySelector('.bz-hq-needs')`);
 await ctl('/__mode?to=connected');await reload(`!!document.querySelector('#bz-app-disconnect')`);
 t=await bizText();
 assert(!t.includes('needs reconnecting')&&!t.includes('removal was not confirmed'),'a healthy connection adds no app needs');
 assert(t.includes('Nothing needs you right now'),'an empty glance is honest when nothing needs the owner');

 ws.close();cp.kill();server.close();
 console.log('PASS ui biz apps: stored connection renders unmasked with exact account + removal (unconfigured + needs_reconnect), unknown status makes no absence claims, removal echoes the reviewed connection version, identity switch mid-confirm/mid-connect/mid-draft discards the action (no POST, no redirect, no draft), stale-version refusal surfaces, prior-grant-unconfirmed toast never claims all-removed, OAuth landing markers announce once from live state, a replacement mid-removal gets a neutral line, the draft review names the exact account+recipients+subject+words, Back keeps every typed word, a stale draft success never closes a newer composer nor claims over a replacement, declined/failed landings never deny a live connection, HQ surfaces needs-reconnect/unconfirmed-removal as needs, a pending draft cannot be duplicated via Back/close/reopen, landing copy separates known record from unknown, pending ops are token-owned per identity+connection, unconfirmed creates are retained for reconciliation, activated proposals render as started records - pixels at /downloads/apps-*-{390,desktop}.png.');
})().catch(e=>{console.error(e);try{cp.kill();}catch(_){/*noop*/}try{server.close();}catch(_){/*noop*/}process.exit(1)});
