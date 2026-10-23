// Cross-identity review-state leak (combined branch review round): the Business view's
// in-memory page-approval state (reviewed URLs + immutable work text) belongs to the identity
// that produced it. On an account/workspace change it must be cleared SYNCHRONOUSLY, and no
// late candidates/run response from the old identity may restore it. Real Chromium over CDP,
// real core.js + business.js, stubbed same-origin API. Synthetic data only.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert'),{spawn}=require('child_process');

const eng={configured:true,enabled:true,host:'api.groq.com',model:'m1',consent:{current:true,host:'api.groq.com',model:'m1',at:'2026-10-23T00:00:00Z'}};
const mkResp=(title)=>({id:'resp_shared',title,summary:'s',boundary:'Drafts only',status:'active',research:true,createdAt:'2026-10-23T00:00:00Z',runsCount:0,runs:[]});
const stateA={engine:eng,sources:[{id:'src_a',kind:'note',title:'A notes',version:1,text:'A private notes mentioning https://a-private.example/secret?token=aaa',updatedAt:'2026-10-23T00:00:00Z'}],proposals:[],responsibilities:[mkResp('A desk')],log:[],opPending:null};
const stateB={engine:eng,sources:[{id:'src_b',kind:'note',title:'B-MARKER notes',version:1,text:'B notes, nothing private',updatedAt:'2026-10-23T00:00:00Z'}],proposals:[],responsibilities:[mkResp('B desk')],log:[],opPending:null};

let ident='A', parkKind=null, parkRelease=null, runMode='ok';
const PAGE='<!doctype html><html><body><div id="v-business" class="on"></div><div id="toast"></div><script src="/js/core.js"></scr'+'ipt><script src="/js/business.js"></scr'+'ipt></body></html>';
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://x');
  const json=o=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(o));};
  if(u.pathname==='/__ident'){ident=u.searchParams.get('to');return json({ok:true});}
  if(u.pathname==='/__mode'){runMode=u.searchParams.get('m')||'ok';return json({ok:true,runMode});}
  if(u.pathname==='/__release'){const r=parkRelease;parkRelease=null;parkKind=null;if(r)r();return json({ok:true,released:!!r});}
  if(u.pathname==='/api/business/state')return json(ident==='A'?stateA:stateB);
  if(u.pathname==='/api/business/responsibilities/resp_shared/candidates'){
    const respond=()=>json({urls:['https://a-private.example/secret?token=aaa'],flagged:['https://a-private.example/secret?token=aaa'],sourceVersions:{src_a:1}});
    if(parkKind==='candidates'){parkRelease=respond;return;} // response held until /__release
    return respond();
  }
  if(u.pathname==='/api/business/responsibilities/resp_shared/run'){
    let body='';req.on('data',d=>body+=d);req.on('end',()=>{
      const respond=()=>runMode==='error'?json({error:'The run used its whole time budget. Try a narrower request.'}):json({run:{id:'run_a',respId:'resp_shared',kind:'manual',at:'2026-10-23T00:00:00Z',input:'A work',status:'done',output:'A-DRAFT-SECRET output text',sourcesUsed:[],sourceVersions:{}}});
      if(parkKind==='run'){parkRelease=respond;return;} // response held until /__release
      respond();
    });return;
  }
  if(u.pathname==='/'){res.setHeader('content-type','text/html');return res.end(PAGE);}
  const fp=path.join('public',u.pathname);
  if(/^\/(js|styles)\//.test(u.pathname)&&fs.existsSync(fp)&&fs.statSync(fp).isFile()){
    res.setHeader('content-type',u.pathname.endsWith('.css')?'text/css':'text/javascript');return res.end(fs.readFileSync(fp));
  }
  if(u.pathname.startsWith('/api/'))return json({});
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
 const ev=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw new Error('page eval: '+JSON.stringify(r.exceptionDetails.exception&&r.exceptionDetails.exception.description||r.exceptionDetails.text));return r.result.value;};
 const poll=async(expr,timeout=8000)=>{const t0=Date.now();while(Date.now()-t0<timeout){if(await ev(expr))return true;await new Promise(r=>setTimeout(r,60));}return false;};
 const ctl=async(p)=>{await new Promise((res,rej)=>{http.get('http://127.0.0.1:'+port+p,r=>{r.resume();res();}).on('error',rej);});};

 await send('Page.enable',{},sessionId);
 await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/'},sessionId);
 assert(await poll('!!(window.BB&&BB._routeHooks&&document.querySelector("#v-business"))'),'page + scripts boot');
 const enter=async(email,ws)=>{
   await ctl('/__ident?to='+(email.startsWith('a')?'A':'B'));
   await ev(`BB.who=${JSON.stringify({email,workspace:ws})};BB._routeHooks.forEach(f=>f({v:'business'}));'ok'`);
   assert(await poll(`!!document.querySelector('[data-toggle-resp]')`),'state loads for '+email);
   await ev(`document.querySelector('[data-toggle-resp]').click();'open'`); // open the resp card
   assert(await poll(`!!document.querySelector('[data-run-input="resp_shared"]')`),'resp card open for '+email);
 };
 const body=()=>ev('document.getElementById("v-business").textContent');

 // 1) Synchronous clear: A's painted approval card (private URL + work text) dies on the flip
 await enter('a@a.test','wA');
 await ev(`(async()=>{const ta=document.querySelector('[data-run-input="resp_shared"]');ta.value='Check https://a-private.example/secret?token=aaa please';document.querySelector('[data-run="resp_shared"]').click();})()`);
 assert(await poll(`!!document.querySelector('.bz-approve')`),'approval card paints for A');
 assert((await body()).includes('a-private.example/secret?token=aaa'),'A private URL visible under A (precondition)');
 await ctl('/__ident?to=B');
 await ev(`BB.who=${JSON.stringify({email:'b@b.test',workspace:'wB'})};BB.emit();'flip'`);
 assert(await poll(`(document.getElementById('v-business').textContent||'').includes('B-MARKER')`),'B state loads after flip');
 let t=await body();
 assert(!t.includes('a-private.example'),'A private URL gone after identity flip');
 assert(!t.includes('Check https://'),'A work text gone after identity flip');
 assert(!(await ev(`!!document.querySelector('.bz-approve')`)),'approval card gone after identity flip');

 // 2) Delayed candidates: parked A candidates response must not restore the review under B
 await enter('a@a.test','wA');
 parkKind='candidates';
 await ev(`(async()=>{const ta=document.querySelector('[data-run-input="resp_shared"]');ta.value='Check https://a-private.example/secret?token=aaa please';document.querySelector('[data-run="resp_shared"]').click();})()`);
 await new Promise(r=>setTimeout(r,120)); // request parked server-side
 await ctl('/__ident?to=B');
 await ev(`BB.who=${JSON.stringify({email:'b@b.test',workspace:'wB'})};BB.emit();'flip'`);
 assert(await poll(`(document.getElementById('v-business').textContent||'').includes('B-MARKER')`),'B state loads while A candidates parked');
 await ctl('/__release'); // A's late candidates response lands under B
 await new Promise(r=>setTimeout(r,200));
 t=await body();
 assert(!t.includes('a-private.example'),'late A candidates cannot paint A URLs under B');
 assert(!(await ev(`!!document.querySelector('.bz-approve')`)),'late A candidates cannot reopen the approval card under B');

 // 3) Delayed run ERROR: the recoverable-error path must not restore the review under B
 await enter('a@a.test','wA');
 await ev(`(async()=>{const ta=document.querySelector('[data-run-input="resp_shared"]');ta.value='Check https://a-private.example/secret?token=aaa please';document.querySelector('[data-run="resp_shared"]').click();})()`);
 assert(await poll(`!!document.querySelector('[data-appr-run]')`),'approval card paints for A (run scenario)');
 await ctl('/__mode?m=error');
 parkKind='run';
 await ev(`document.querySelector('[data-appr-run]').click();'run'`);
 await new Promise(r=>setTimeout(r,120));
 await ctl('/__ident?to=B');
 await ev(`BB.who=${JSON.stringify({email:'b@b.test',workspace:'wB'})};BB.emit();'flip'`);
 assert(await poll(`(document.getElementById('v-business').textContent||'').includes('B-MARKER')`),'B state loads while A run parked');
 await ctl('/__release');
 await new Promise(r=>setTimeout(r,200));
 t=await body();
 assert(!t.includes('a-private.example'),'late A run error cannot restore A review under B');
 assert(!(await ev(`!!document.querySelector('.bz-approve')`)),'no approval card under B after late error');

 // 4) Delayed run SUCCESS: a late draft from A is discarded, B's view untouched
 await enter('a@a.test','wA');
 await ev(`(async()=>{const ta=document.querySelector('[data-run-input="resp_shared"]');ta.value='Check https://a-private.example/secret?token=aaa please';document.querySelector('[data-run="resp_shared"]').click();})()`);
 assert(await poll(`!!document.querySelector('[data-appr-run]')`),'approval card paints for A (success scenario)');
 await ctl('/__mode?m=ok');
 parkKind='run';
 await ev(`document.querySelector('[data-appr-run]').click();'run'`);
 await new Promise(r=>setTimeout(r,120));
 await ctl('/__ident?to=B');
 await ev(`BB.who=${JSON.stringify({email:'b@b.test',workspace:'wB'})};BB.emit();'flip'`);
 assert(await poll(`(document.getElementById('v-business').textContent||'').includes('B-MARKER')`),'B state loads while A run parked (success)');
 await ctl('/__release');
 await new Promise(r=>setTimeout(r,200));
 t=await body();
 assert(!t.includes('A-DRAFT-SECRET'),'late A run result cannot paint A draft under B');
 assert(t.includes('B-MARKER'),'B view intact after late A responses');

 ws.close();cp.kill();server.close();
 console.log('PASS ui cross-identity: approval state dies synchronously on identity change (same responsibility id across identities); delayed candidates, delayed run error and delayed run success from the old identity are all discarded - no old-identity URLs, work text or drafts paint under the new identity.');
})().catch(e=>{console.error(e);try{server.close();}catch(_){/*noop*/}process.exit(1)});
