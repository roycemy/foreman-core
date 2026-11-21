// email.send: Alter sends one owner-approved email itself, through the server-side Resend credential. The bot never holds it.
// Proves the gate with a fake Resend (no network): no approval means no send; the approval binds to the exact sender, recipient,
// subject and body the owner saw; changed content, expiry, revoke, pause and kill block it; concurrent approvals send once;
// a timeout or 5xx is recorded as an unknown outcome (never "sent", never retried blindly) and is reconciled with the same
// idempotency key; provider acceptance is not reported as delivery; stop after a send does not pretend to undo it.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(require('path').join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={routes,r,setJ,getJ,als,createAgent,fullState,ACTIONS,DEFAULT_PERMS};';
// ---- fake Resend: honors Idempotency-Key the way its docs describe (24h; same key+body -> same response, no second send;
// same key + different body -> 409 invalid_idempotent_request). mode: ok | timeout_before | timeout_after | 500 | 422
const R={mode:'ok',posts:[],sends:[],keys:new Map(),gets:[],lastEvent:'delivered'};
async function fakeFetch(url,o={}){
 const u=new URL(url);if(u.hostname!=='api.resend.com')throw Error('NO NETWORK: '+url);
 if((o.headers||{}).authorization!=='Bearer re_test_fixture')return res(401,{message:'bad key'});
 if((o.method||'GET')==='GET'){const id=u.pathname.split('/').pop();R.gets.push(id);const s=R.sends.find(x=>x.id===id);return s?res(200,{id,last_event:R.lastEvent}):res(404,{message:'not found'});}
 const key=o.headers['idempotency-key'],body=o.body;R.posts.push({key,body:JSON.parse(body)});
 if(R.mode==='timeout_before')throw Object.assign(Error('The operation was aborted due to timeout'),{name:'TimeoutError'});
 if(R.mode==='500')return res(500,{message:'internal'});
 if(R.mode==='422')return res(422,{name:'validation_error',message:'Invalid `to` field'});
 let out;const prior=key&&R.keys.get(key);
 if(prior){if(prior.body!==body)return res(409,{name:'invalid_idempotent_request'});out=prior.out;}
 else{const id='em_'+(R.sends.length+1);R.sends.push({id,body:JSON.parse(body)});out={id};if(key)R.keys.set(key,{body,out});}
 if(R.mode==='timeout_after')throw Object.assign(Error('The operation was aborted due to timeout'),{name:'TimeoutError'});
 return res(200,out);
}
const res=(status,j)=>({ok:status>=200&&status<300,status,json:async()=>j,text:async()=>JSON.stringify(j)});
const env={RESEND_API_KEY:'re_test_fixture',WAKE_EMAIL_FROM:'Alter <alerts@alter.example>',ALTER_EMAIL_ALLOWED_TO:'owner@example.com, Second@Example.com'};
const ctx={require,module:{exports:{}},process:{env},global:{},console,fetch:fakeFetch,setTimeout,clearTimeout,URL,AbortSignal};vm.runInNewContext(src,ctx);const f=ctx.module.exports.t;
const H={host:'localhost',origin:'http://localhost'};
async function call(method,path,body,agent){let out;const r={status(n){this.code=n;return this},json(j){out={code:this.code||200,j};return out},setHeader(){},end(){out={code:this.code||204};return out}};await f.routes({method,headers:H,url:'/api'+path},r,path.split('?')[0],body||{},agent||null);return out;}
const act=(agent,params,extra={})=>call('POST','/gateway/act',{action:'email.send',params,...extra},agent);
const approve=(id,body)=>call('POST','/requests/'+id+'/approve',body);
const receipts=async()=>(await f.r(['LRANGE','fm:receipts',0,299])).map(x=>JSON.parse(x));
const BODY='Hi,\n\nThis is the exact body.\n'+'x'.repeat(2900)+'\nEnd of body.';
const mail={to:'owner@example.com',subject:'Proof: Alter sent this after your approval',text:BODY};
(async()=>{await f.als.run({ws:'emailtest'},async()=>{
 const {agent:made}=await f.createAgent('Writer','Ops','custom',false,{preset:'balanced'});
 const bot=()=>f.getJ('fm:agent:'+made.id);
 // ---- catalog: email.send exists and is ASK by default; a standing AUTO grant is never honored for it
 assert(f.ACTIONS['email.send'],'email.send is in the catalog');assert.equal(f.DEFAULT_PERMS['email.send'],'ASK');
 {const b=await bot();await f.setJ('fm:agent:'+b.id,{...b,permissions:{...b.permissions,'email.send':'AUTO'}});
  const p=await act(await bot(),mail);assert.equal(p.code,202,'AUTO is downgraded to ASK for email.send');assert.equal(p.j.status,'pending');assert.equal(R.posts.length,0);
  await call('POST','/requests/'+p.j.request_id+'/deny');const b2=await bot();await f.setJ('fm:agent:'+b2.id,{...b2,permissions:{...b2.permissions,'email.send':'ASK'}});}
 {const mcp=await call('POST','/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'foreman_email_send',arguments:{...mail}}},await bot());const txt=JSON.stringify(mcp&&mcp.j);assert(/pending/.test(txt),'MCP bots propose through the same gate: '+txt.slice(0,160));assert.equal(R.posts.length,0);
  const pid=/req_[a-f0-9]+/.exec(txt)[0];await call('POST','/requests/'+pid+'/deny');}
 console.log('PASS email.send is in the catalog (HTTP and MCP), ASK by default, and an AUTO grant still asks');
 // ---- denied before any approval round-trip: not allowlisted, malformed, a bot-chosen sender, sender not configured
 for(const [p,code] of [[{...mail,to:'stranger@example.com'},'recipient_not_allowed'],[{...mail,to:'owner@example.com,second@example.com'},'recipient_not_allowed'],[{...mail,subject:''},'email_invalid'],[{...mail,text:''},'email_invalid'],[{...mail,from:'ceo@bank.example'},'sender_not_allowed'],[{...mail,subject:'a\r\nBcc: x@y.z'},'email_invalid']]){
  const d=await act(await bot(),p);assert.equal(d.code,400,JSON.stringify(p).slice(0,80));assert.equal(d.j.code,code);}
 {const k=env.RESEND_API_KEY;delete env.RESEND_API_KEY;const d=await act(await bot(),mail);assert.deepEqual([d.code,d.j.code],[400,'email_not_configured']);env.RESEND_API_KEY=k;}
 assert.equal(R.posts.length,0,'nothing reached the provider');
 console.log('PASS outside the owner allowlist, malformed, header-injected, bot-chosen sender or unconfigured: denied with a receipt, nothing sent');
 // ---- pending: the owner sees the full content and a fingerprint; nothing is sent without approval
 const p1=await act(await bot(),{...mail,to:'Second@Example.com'});assert.equal(p1.code,202);
 const q1=await f.getJ('fm:req:'+p1.j.request_id);
 assert.equal(q1.params.text,BODY,'the full body is stored for review, not a 200-character cut');assert.equal(q1.params.from,env.WAKE_EMAIL_FROM,'the exact sender Alter will use');
 assert.equal(q1.params.to,'second@example.com');assert.match(q1.detailsHash,/^[a-f0-9]{64}$/);
 const ttl=Date.parse(q1.expiresAt)-Date.parse(q1.createdAt);assert(ttl>0&&ttl<=15*60000,'expires within 15 minutes');
 {const st=await f.fullState();const shown=st.requests.find(x=>x.id===q1.id);assert.equal(shown.params.text,BODY);assert.equal(shown.detailsHash,q1.detailsHash);assert.equal(shown.rawParams,undefined);}
 assert.equal(R.posts.length,0,'no approval, no execution');
 console.log('PASS pending: full sender/recipient/subject/body and fingerprint shown to the owner; nothing sent before approval');
 // ---- the approval binds to what the owner saw
 {const a=await approve(q1.id,{});assert.deepEqual([a.code,a.j.error],[409,'details_required']);
  const b=await approve(q1.id,{detailsHash:'0'.repeat(64)});assert.deepEqual([b.code,b.j.error],[409,'details_changed']);
  assert.equal((await f.getJ('fm:req:'+q1.id)).status,'pending','a stale screen does not consume the request');assert.equal(R.posts.length,0);}
 // content Alter would send changed after the owner looked (the configured sender moved): the old approval is void
 {const from=env.WAKE_EMAIL_FROM;env.WAKE_EMAIL_FROM='Other <other@alter.example>';const a=await approve(q1.id,{detailsHash:q1.detailsHash});
  assert.equal(a.code,200);assert.equal(a.j.request.status,'blocked');assert.match(a.j.request.reason,/changed/);env.WAKE_EMAIL_FROM=from;assert.equal(R.posts.length,0);
  assert.equal((await approve(q1.id,{detailsHash:q1.detailsHash})).code,409,'a blocked request cannot be approved later');}
 // the recipient was removed from the allowlist while pending: blocked at approval
 {const p=await act(await bot(),mail);const q=await f.getJ('fm:req:'+p.j.request_id);const al=env.ALTER_EMAIL_ALLOWED_TO;env.ALTER_EMAIL_ALLOWED_TO='second@example.com';
  const a=await approve(q.id,{detailsHash:q.detailsHash});assert.equal(a.j.request.status,'blocked');env.ALTER_EMAIL_ALLOWED_TO=al;assert.equal(R.posts.length,0);}
 console.log('PASS approval binds to the exact content: missing or stale fingerprint refused (request stays pending); changed sender or recipient allowlist voids it; nothing sent');
 // ---- expiry, revoke, pause and kill block execution
 {const p=await act(await bot(),mail);const q=await f.getJ('fm:req:'+p.j.request_id);await f.setJ('fm:req:'+q.id,{...q,expiresAt:new Date(Date.now()-1).toISOString()});
  const a=await approve(q.id,{detailsHash:q.detailsHash});assert.deepEqual([a.code,a.j.request.status],[200,'expired']);
  assert.equal((await receipts()).find(x=>x.requestId===q.id).outcome,'expired');}
 for(const stop of ['revoked','paused','killed']){
  const p=await act(await bot(),mail);const q=await f.getJ('fm:req:'+p.j.request_id),b=await bot();
  if(stop==='revoked')await f.setJ('fm:agent:'+b.id,{...b,status:'revoked'});if(stop==='paused')await f.setJ('fm:agent:'+b.id,{...b,paused:true});if(stop==='killed')await f.r(['SET','fm:kill','1']);
  const a=await approve(q.id,{detailsHash:q.detailsHash});assert.equal(a.j.request.status,'blocked',stop);
  await f.setJ('fm:agent:'+b.id,{...b,status:'active',paused:undefined});await f.r(['DEL','fm:kill']);}
 assert.equal(R.posts.length,0);
 console.log('PASS expired, revoked, paused and kill-switched requests are blocked at approval with a receipt; nothing sent');
 // ---- concurrent approvals send exactly once; the receipt links request, fingerprint and provider id
 const p2=await act(await bot(),mail),q2=await f.getJ('fm:req:'+p2.j.request_id);
 {const both=await Promise.all([approve(q2.id,{detailsHash:q2.detailsHash}),approve(q2.id,{detailsHash:q2.detailsHash}),approve(q2.id,{detailsHash:q2.detailsHash})]);
  assert.equal(R.posts.length,1,'one provider call');assert.equal(R.sends.length,1,'one email');
  const won=both.filter(x=>x.code===200&&x.j.request.status==='executed');assert.equal(won.length,1);assert(both.filter(x=>x!==won[0]).every(x=>x.code===409));
  const post=R.posts[0];assert.equal(post.key,q2.id,'Idempotency-Key is the request id');assert.deepEqual(post.body,{from:env.WAKE_EMAIL_FROM,to:['owner@example.com'],subject:mail.subject,text:BODY});
  const q=await f.getJ('fm:req:'+q2.id);assert.deepEqual([q.status,q.delivery.state,q.delivery.providerMessageId],['executed','accepted','em_1']);
  const rc=(await receipts()).find(x=>x.requestId===q2.id&&x.outcome==='completed');assert(rc,'one completed receipt');
  assert.deepEqual([rc.detailsHash,rc.providerMessageId,rc.approvedBy],[q2.detailsHash,'em_1','owner:approve']);assert.match(rc.summary,/accepted/i);assert.doesNotMatch(rc.summary,/delivered/i,'acceptance is not delivery');
  assert.equal((await approve(q2.id,{detailsHash:q2.detailsHash})).code,409,'approving again later does not resend');assert.equal(R.posts.length,1);}
 console.log('PASS three concurrent approvals: one provider call, one email, Idempotency-Key = request id, exact body; receipt links request, fingerprint and provider id; says accepted, not delivered');
 // ---- delivery is confirmed only by the provider
 {const d=await call('POST','/requests/'+q2.id+'/delivery');assert.equal(d.code,200);assert.deepEqual([d.j.request.delivery.state,d.j.request.delivery.lastEvent],['delivered','delivered']);
  assert.deepEqual(R.gets,['em_1']);assert.equal(R.posts.length,1,'checking delivery never sends');
  const st=await f.fullState();assert.equal(st.requests.find(x=>x.id===q2.id).delivery.state,'delivered','the inbox sees the provider status');}
 // ---- stop after a send: nothing is undone and nothing claims to be
 {await f.r(['SET','fm:kill','1']);const q=await f.getJ('fm:req:'+q2.id);assert.equal(q.status,'executed');assert.equal((await call('POST','/requests/'+q2.id+'/deny')).code,409);
  assert(!(await receipts()).some(x=>x.requestId===q2.id&&/undo|recall|unsent/i.test(x.summary)));await f.r(['DEL','fm:kill']);}
 console.log('PASS delivery comes only from the provider (GET, never a resend); stop after a send leaves it sent and claims no undo');
 // ---- unknown outcomes: timeout and 5xx are never "sent" and never retried blindly
 for(const mode of ['timeout_after','timeout_before','500']){
  R.mode=mode;const before=R.posts.length,sendsBefore=R.sends.length;
  const p=await act(await bot(),mail),q=await f.getJ('fm:req:'+p.j.request_id);const a=await approve(q.id,{detailsHash:q.detailsHash});
  assert.equal(a.j.request.status,'outcome_unknown',mode);assert.equal(R.posts.length,before+1,'exactly one attempt, no automatic retry');
  const rc=(await receipts()).find(x=>x.requestId===q.id);assert.equal(rc.outcome,'unknown');assert.match(rc.summary,/unknown/i);assert.doesNotMatch(rc.summary,/accepted|sent\b|delivered/i);
  assert.equal((await approve(q.id,{detailsHash:q.detailsHash})).code,409,'an unknown outcome cannot be re-approved into a second send');
  // reconcile: the same idempotency key and body. If the first call reached Resend, the same email id comes back and nothing is re-sent.
  R.mode='ok';const rr=await call('POST','/requests/'+q.id+'/reconcile');assert.equal(rr.code,200);assert.equal(rr.j.request.status,'executed');
  assert.equal(R.posts[R.posts.length-1].key,q.id);assert.equal(R.sends.length,sendsBefore+1,mode+': exactly one email in total');
  const fin=(await receipts()).filter(x=>x.requestId===q.id);assert(fin.some(x=>x.outcome==='completed'&&/reconcil/i.test(x.summary)&&x.providerMessageId===rr.j.request.delivery.providerMessageId));
  assert.equal((await call('POST','/requests/'+q.id+'/reconcile')).code,409,'reconcile only resolves unknown outcomes');}
 console.log('PASS timeout (before or after the provider accepted) and 5xx: outcome_unknown receipt, one attempt, no re-approval; reconcile with the same key yields exactly one email in total');
 // ---- past the 24h idempotency window, reconcile refuses instead of risking a duplicate
 {R.mode='timeout_after';const p=await act(await bot(),mail),q=await f.getJ('fm:req:'+p.j.request_id);await approve(q.id,{detailsHash:q.detailsHash});R.mode='ok';
  const cur=await f.getJ('fm:req:'+q.id);await f.setJ('fm:req:'+q.id,{...cur,executedAt:new Date(Date.now()-23*3600000-1).toISOString()});const n=R.posts.length;
  const rr=await call('POST','/requests/'+q.id+'/reconcile');assert.deepEqual([rr.code,rr.j.error],[409,'reconcile_window_passed']);assert.equal(R.posts.length,n);assert.equal((await f.getJ('fm:req:'+q.id)).status,'outcome_unknown');}
 // ---- a definite provider rejection is a failure, not an unknown, and says nothing was sent
 {R.mode='422';const p=await act(await bot(),mail),q=await f.getJ('fm:req:'+p.j.request_id);const a=await approve(q.id,{detailsHash:q.detailsHash});
  assert.equal(a.j.request.status,'failed');const rc=(await receipts()).find(x=>x.requestId===q.id);assert.equal(rc.outcome,'failed');assert.match(rc.summary,/not sent/i);R.mode='ok';}
 console.log('PASS past the 23h reconcile window: refused, still unknown, no call; a 4xx rejection is a failure that says nothing was sent');
 // ---- other ASK actions: a supplied fingerprint must match; requests now expire
 {const p=await call('POST','/gateway/act',{action:'notes.write',params:{title:'t',text:'x'}},await bot());const q=await f.getJ('fm:req:'+p.j.request_id);
  assert.match(q.detailsHash,/^[a-f0-9]{64}$/);assert(Date.parse(q.expiresAt)>Date.now());assert.equal((await approve(q.id,{detailsHash:'f'.repeat(64)})).j.error,'details_changed');
  assert.equal((await approve(q.id,{detailsHash:q.detailsHash})).j.request.status,'executed');}
 console.log('PASS other ASK actions get a fingerprint and an expiry; a wrong fingerprint is refused');
 // ---- the owner's screen: real core.js in a sandbox. The review shows every field in full and escaped; a compact Approve
 // (floor tray, list, pop-down) opens the full review instead of sending; the real approve call carries the fingerprint.
 {const win={BB:undefined,matchMedia:()=>({matches:false}),innerWidth:390,localStorage:{getItem:()=>null,setItem(){}}},apiCalls=[];let modalHtml=null;
  const cctx={window:win,document:{addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],hidden:false},matchMedia:win.matchMedia,innerWidth:390,localStorage:win.localStorage,fetch:()=>{throw Error('NO NETWORK')},setInterval:()=>0,clearInterval(){},setTimeout:()=>0,clearTimeout(){},console,Date};
  vm.createContext(cctx);vm.runInContext(fs.readFileSync(require('path').join(__dirname,'public/js/core.js'),'utf8'),cctx);const BB=win.BB;
  BB.api=async(path,method,body)=>{apiCalls.push([path,method,body]);return {request:{action:'email.send',status:'executed',delivery:{state:'accepted',providerMessageId:'em_9'}}}};BB.toast=()=>{};BB.sync=async()=>{};
  BB.modal=html=>{modalHtml=html;return {querySelector:()=>({})}};BB.closeModal=()=>{};
  const q={id:'req_abc',action:'email.send',status:'pending',params:{from:'Alter <alerts@alter.example>',to:'owner@example.com',subject:'Hi <b>there</b>',text:'Line one\nLine two & <script>x</script>'},detailsHash:'a'.repeat(64),expiresAt:new Date(Date.now()+10*60000).toISOString()};
  const html=BB.emailReview(q);
  for(const s of ['Alter &lt;alerts@alter.example&gt;','owner@example.com','Hi &lt;b&gt;there&lt;/b&gt;','Line one\nLine two &amp; &lt;script&gt;x&lt;/script&gt;','Fingerprint aaaaaaaaaaaa','Alter sends it, not the bot'])assert(html.includes(s),'review shows: '+s);
  assert(!/<script>/.test(html),'escaped');
  await BB.decide({type:'approval',q},'approve');assert.equal(apiCalls.length,0,'a compact Approve does not send');assert(modalHtml&&modalHtml.includes('Line two &amp;'),'it opens the full review');
  const j=await BB.decide({type:'approval',q},'approve',{reviewed:true});assert.deepEqual(apiCalls[0],['/api/requests/req_abc/approve','POST',{detailsHash:q.detailsHash}]);
  assert.equal(BB.outcome({type:'approval',q},j,'approve'),'Accepted by Resend. Delivery not confirmed yet.');
  BB.S={requests:[{...q,status:'outcome_unknown',executedAt:new Date().toISOString()},{...q,id:'req_d',status:'executed',executedAt:new Date().toISOString(),delivery:{state:'delivered'}}],agents:[],tasks:[],events:[]};BB.money={requests:[]};BB.cards={proposals:[]};
  const f2=BB.emailFollowups();assert.deepEqual(f2.map(x=>x.id),['req_abc'],'an unknown outcome needs the owner; a delivered one does not');
  assert.equal(BB.emailOutcome(f2[0]),'Approved, but the result is unknown. Nothing was retried. Reconcile to find out.');
  await BB.decide({type:'email',q:f2[0]},'reconcile');assert.deepEqual(apiCalls[1].slice(0,2),['/api/requests/req_abc/reconcile','POST']);
  const ib=fs.readFileSync(require('path').join(__dirname,'public/js/inbox.js'),'utf8');assert(/BB\.emailReview\(i\.q\)/.test(ib)&&/reviewed: !!card\.querySelector\('\.email-review'\)/.test(ib),'the inbox card shows the full review and only it counts as reviewed');}
 console.log('PASS owner screen (real core.js, phone width): full escaped review with fingerprint; compact Approve opens the review instead of sending; approve sends the fingerprint; unknown outcomes ask for Reconcile; words say accepted, not delivered');
 // receipts stay hash-chained
 {const all=(await receipts()).reverse();for(let i=1;i<all.length;i++)assert.equal(all[i].prevHash,all[i-1].hash,'chain');}
 console.log('PASS receipts remain hash-chained. No network: every provider call went to the fake ('+R.posts.length+' POSTs, '+R.gets.length+' GET).');
});})().catch(e=>{console.error(e);process.exit(1)});
