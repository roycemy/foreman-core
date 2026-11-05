// One job through a real agent, end to end, offline: the owner assigns a job; the assigned bot claims it with its own key; it proposes
// an email linked to that job; Alter waits for the owner; executes only after approval; the job shows the outcome and the receipt.
// Covers: assignment and claims persist in the store; only the assignee (or anyone, for an unassigned job) can claim; concurrent claims
// give a job to one worker; a proposal must come from the bot running that job; retries reuse one request; waiting is not completion;
// denial, expiry, revocation, execution failure and unknown outcomes stay distinct; a revoked bot cannot complete. Plus two display fixes.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={routes,r,setJ,getJ,als,createAgent,newTask,jobDetail};';
const R={mode:'ok',posts:0,sends:0,keys:new Map(),wakes:[]};
async function fakeFetch(url,o={}){const u=new URL(url);if(u.hostname!=='api.resend.com')throw Error('NO NETWORK: '+url);
 // the existing wake ladder emails an Instinct bot's inbox on assignment, without an idempotency key: recorded apart from approved sends
 if(!(o.headers||{})['idempotency-key']){R.wakes.push(JSON.parse(o.body));return res(200,{id:'wake_'+R.wakes.length});}
 R.posts++;
 if(R.mode==='timeout')throw Object.assign(Error('timeout'),{name:'TimeoutError'});if(R.mode==='422')return res(422,{message:'Invalid'});
 const k=o.headers['idempotency-key'];if(R.keys.has(k))return res(200,R.keys.get(k));R.sends++;const out={id:'em_'+R.sends};R.keys.set(k,out);return res(200,out);}
const res=(s,j)=>({ok:s>=200&&s<300,status:s,json:async()=>j,text:async()=>JSON.stringify(j)});
const env={RESEND_API_KEY:'re_test_fixture',WAKE_EMAIL_FROM:'Alter <alerts@alter.example>',ALTER_EMAIL_ALLOWED_TO:'owner@example.com'};
const ctx={require,module:{exports:{}},process:{env},global:{},console,fetch:fakeFetch,setTimeout,clearTimeout,URL,AbortSignal};vm.runInNewContext(src,ctx);const f=ctx.module.exports.t;
const H={host:'localhost',origin:'http://localhost'};
async function call(method,p,body,agent){let out;const r={status(n){this.code=n;return this},json(j){out={code:this.code||200,j};return out},setHeader(){},end(){out={code:this.code||204};return out}};await f.routes({method,headers:H,url:'/api'+p,gatewayKeyAuth:!!agent},r,p.split('?')[0],body||{},agent||null);return out;}
const mail={to:'owner@example.com',subject:'Weekly summary',text:'Here is the summary you asked for.'};
(async()=>{await f.als.run({ws:'jobloop'},async()=>{
 const A=(await f.createAgent('Instinct','Ops','instinct',false,{preset:'balanced'})).agent,B=(await f.createAgent('Other','Ops','custom',false,{preset:'balanced'})).agent;
 const live=id=>f.getJ('fm:agent:'+id);
 // ---- assignment persists; only the assignee claims it; a claim is stored, and a retry returns the same job
 const job=await f.newTask({title:'Send me the weekly summary',brief:'Draft it and propose the email',assignee:A.id});
 assert.equal(JSON.parse(await f.r(['GET','fm:task:'+job.id])).assignee,A.id,'assignment is in the store');
 assert.equal((await call('GET','/gateway/tasks/next',{},await live(B.id))).j.task,null,'another bot cannot claim an assigned job');
 const c1=await call('GET','/gateway/tasks/next',{},await live(A.id));assert.equal(c1.j.task.id,job.id);assert.equal(c1.j.task.status,'running');
 assert.equal(JSON.parse(await f.r(['GET','fm:task:'+job.id])).status,'running','the claim is in the store');
 assert.equal((await call('GET','/gateway/tasks/next',{},await live(A.id))).j.task.id,job.id,'a retried claim returns the same running job');
 // concurrent claims on an unassigned job: exactly one worker gets it
 {const open=await f.newTask({title:'Anyone can take this'});const both=await Promise.all([call('GET','/gateway/tasks/next',{},await live(B.id)),call('GET','/gateway/tasks/next',{},await live(B.id)),(async()=>{const C=(await f.createAgent('Third','Ops','custom',false,{preset:'balanced'})).agent;return call('GET','/gateway/tasks/next',{},await live(C.id));})()]);
  const winners=new Set(both.filter(x=>x.j.task&&x.j.task.id===open.id).map(x=>x.j.task.assignee));assert.equal(winners.size,1,'one worker holds the job');
  assert.equal(JSON.parse(await f.r(['GET','fm:task:'+open.id])).assignee,[...winners][0]);}
 assert.equal(R.wakes.length,1,'assigning to an Instinct bot sends one wake ping (existing wake ladder)');assert.deepEqual(R.wakes[0].to,['xt1udv@mail.instinct.com'],'to the hardcoded default when WAKE_INSTINCT_EMAIL is unset');assert.doesNotMatch(R.wakes[0].text+R.wakes[0].subject,/weekly summary/i,'content-free');
 console.log('PASS assignment and claims persist; only the assignee claims an assigned job; a retried claim returns it; concurrent claims on an open job give it to one worker');
 // ---- a proposal must come from the bot running that job
 {const n=(await f.r(['SMEMBERS','fm:reqs'])).length;const x=await call('POST','/gateway/act',{action:'email.send',params:mail,task_id:job.id},await live(B.id));
  assert.equal(x.code,403);assert.equal(x.j.code,'job_not_yours');assert.equal((await f.r(['SMEMBERS','fm:reqs'])).length,n,'no request created');
  const y=await call('POST','/gateway/act',{action:'email.send',params:mail,task_id:'task_doesnotexist'},await live(A.id));assert.equal(y.j.code,'job_not_yours');}
 // ---- the assignee proposes, linked to the job; retries (sequential and concurrent) reuse one request
 const p1=await call('POST','/gateway/act',{action:'email.send',params:mail,task_id:job.id},await live(A.id));assert.equal(p1.code,202);const rid=p1.j.request_id;
 const p2=await call('POST','/gateway/act',{action:'email.send',params:mail,task_id:job.id},await live(A.id));assert.deepEqual([p2.j.request_id,p2.j.duplicate,p2.j.status],[rid,true,'pending']);
 {const many=await Promise.all([1,2,3].map(async()=>call('POST','/gateway/act',{action:'email.send',params:mail,task_id:job.id},await live(A.id))));
  assert(many.every(x=>x.code===409||x.j.request_id===rid),'a concurrent retry is refused or returns the same request');}
 assert.deepEqual(await f.r(['SMEMBERS','fm:taskreqs:'+job.id]),[rid],'one request on the job');assert.equal((await f.r(['SMEMBERS','fm:reqs'])).filter(x=>x===rid).length,1);
 const q=await f.getJ('fm:req:'+rid);assert.equal(q.taskId,job.id);assert.equal(q.agentId,A.id);
 console.log('PASS a proposal must come from the bot running that job (other bots and unknown jobs get job_not_yours, nothing created); sequential and concurrent retries reuse one request');
 // ---- waiting is not completion
 {const d=await call('POST','/gateway/tasks/'+job.id+'/complete',{result:'Sent the summary'},await live(A.id));assert.deepEqual([d.code,d.j.error],[409,'proposal_unresolved']);
  assert.equal((await f.getJ('fm:task:'+job.id)).status,'running');assert.equal(R.posts,0,'nothing sent while waiting');}
 // ---- a bot key cannot decide; the owner decides; Alter executes once; the job shows the outcome and the receipt
 assert.equal((await call('POST','/gateway/requests/'+rid+'/approve',{detailsHash:q.detailsHash},await live(A.id))).code,404,'no decide route on the gateway');
 const ap=await call('POST','/requests/'+rid+'/approve',{detailsHash:q.detailsHash});assert.equal(ap.j.request.status,'executed');assert.equal(R.sends,1);
 assert.equal((await f.getJ('fm:task:'+job.id)).status,'running','approval and execution do not complete the job');
 {const p3=await call('POST','/gateway/act',{action:'email.send',params:mail,task_id:job.id},await live(A.id));assert.deepEqual([p3.j.request_id,p3.j.status],[rid,'executed'],'a retry after execution reports the outcome; it does not send again');assert.equal(R.sends,1);}
 const g=await call('GET','/gateway/requests/'+rid,{},await live(A.id));assert.deepEqual([g.j.status,g.j.delivery.state,g.j.delivery.providerMessageId],['executed','accepted','em_1'],'the bot can read its outcome');
 const done=await call('POST','/gateway/tasks/'+job.id+'/complete',{result:'Proposed the weekly summary; owner approved; Resend accepted it (em_1).'},await live(A.id));assert.equal(done.code,200);
 {const j=await f.jobDetail(job.id);assert.equal(j.task.status,'done');assert.deepEqual(j.requests.map(x=>[x.id,x.status,x.delivery&&x.delivery.providerMessageId]),[[rid,'executed','em_1']]);
  const rc=j.receipts.find(x=>x.requestId===rid&&x.outcome==='completed');assert(rc&&rc.providerMessageId==='em_1'&&rc.taskId===job.id,'the job carries the send receipt');
  const words=j.timeline.map(s=>s.text).join(' | ');assert.match(words,/Owner approved: send an email/);assert.match(words,/Resend accepted it/);}
 console.log('PASS waiting is not completion; bot keys have no decide route; owner approval executes once; a retry reports the outcome; the job shows the request, its provider id and the receipt');
 // ---- every other outcome stays distinct on the job, and none of them is "sent"
 async function round(label,setup,decide){const t=await f.newTask({title:label,assignee:A.id});await call('GET','/gateway/tasks/next',{},await live(A.id));
  const p=await call('POST','/gateway/act',{action:'email.send',params:{...mail,subject:label},task_id:t.id},await live(A.id));const qq=await f.getJ('fm:req:'+p.j.request_id);
  if(setup)await setup(qq);const d=decide?await decide(qq):await call('POST','/requests/'+qq.id+'/approve',{detailsHash:qq.detailsHash});
  const j=await f.jobDetail(t.id);return {t,q:await f.getJ('fm:req:'+qq.id),words:j.timeline.map(s=>s.text).join(' | '),d};}
 // finish the current job first: a bot runs one job at a time
 {const denied=await round('Denied one',null,qq=>call('POST','/requests/'+qq.id+'/deny'));assert.equal(denied.q.status,'denied');assert.match(denied.words,/Owner denied/);assert.doesNotMatch(denied.words,/Resend accepted/);
  assert.equal((await call('POST','/gateway/tasks/'+denied.t.id+'/complete',{status:'failed',result:'Owner denied the email'},await live(A.id))).code,200);}
 {const ex=await round('Expired one',async qq=>f.setJ('fm:req:'+qq.id,{...qq,expiresAt:new Date(Date.now()-1).toISOString()}));assert.equal(ex.q.status,'expired');assert.match(ex.words,/Expired before approval/);
  await call('POST','/gateway/tasks/'+ex.t.id+'/complete',{status:'failed',result:'Expired'},await live(A.id));}
 {R.mode='422';const fl=await round('Failed one');R.mode='ok';assert.equal(fl.q.status,'failed');assert.match(fl.words,/Not sent/);await call('POST','/gateway/tasks/'+fl.t.id+'/complete',{status:'failed',result:'Rejected'},await live(A.id));}
 {R.mode='timeout';const un=await round('Unknown one');R.mode='ok';assert.equal(un.q.status,'outcome_unknown');assert.match(un.words,/Outcome unknown/);
  const c=await call('POST','/gateway/tasks/'+un.t.id+'/complete',{result:'done'},await live(A.id));assert.deepEqual([c.code,c.j.error],[409,'proposal_unresolved'],'an unknown outcome is not success');
  await call('POST','/requests/'+un.q.id+'/reconcile');assert.equal((await f.getJ('fm:req:'+un.q.id)).status,'executed');assert.equal((await call('POST','/gateway/tasks/'+un.t.id+'/complete',{result:'done after reconcile'},await live(A.id))).code,200);}
 {const rv=await round('Revoked one',async()=>{const b=await live(A.id);await f.setJ('fm:agent:'+A.id,{...b,status:'revoked'});});assert.equal(rv.q.status,'blocked');assert.match(rv.words,/Blocked/);
  const c=await call('POST','/gateway/tasks/'+rv.t.id+'/complete',{result:'done anyway'},await live(A.id));assert.equal(c.code,403,'a revoked bot cannot complete');assert.equal((await f.getJ('fm:task:'+rv.t.id)).status,'running');
  await f.setJ('fm:agent:'+A.id,{...(await live(A.id)),status:'active'});}
 console.log('PASS denied, expired, failed (not sent), unknown (cannot complete as done until reconciled) and revoked (blocked; a revoked bot cannot complete) stay distinct on the job');
});
 // ---- display: real core.js. Executed emails are not unresolved work; the Receipts feed shows standalone receipts once, next to jobs
 {const win={BB:undefined,matchMedia:()=>({matches:false}),innerWidth:390,localStorage:{getItem:()=>null,setItem(){}}};
  const cctx={window:win,document:{addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,hidden:false},matchMedia:win.matchMedia,innerWidth:390,localStorage:win.localStorage,fetch:()=>{throw Error('NO NETWORK')},setInterval:()=>0,clearInterval(){},setTimeout:()=>0,clearTimeout(){},console,Date};
  vm.createContext(cctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'public/js/core.js'),'utf8'),cctx);const BB=win.BB;
  const now=Date.now(),iso=ms=>new Date(now-ms).toISOString();
  const sent={id:'req_14db6561e9',action:'email.send',status:'executed',agentId:'agent_t',executedAt:iso(60e3),params:{to:'owner@example.com',subject:'Test'},delivery:{state:'accepted',providerMessageId:'01a1adf4'},receiptId:'rcpt_b622a71233'};
  const unknown={...sent,id:'req_u',status:'outcome_unknown',delivery:{state:'unknown'}};
  const job={id:'task_1',title:'Weekly summary',status:'done',assignee:'agent_t',createdAt:iso(9e5),finishedAt:iso(30e3)};
  BB.S={killed:false,agents:[{id:'agent_t',name:'Test Bot',status:'active',connection:{status:'active',transport:'gateway',lastCallAt:iso(6e4),polledAt:null}}],tasks:[job],requests:[sent,unknown],events:[],
   receipts:[{id:'rcpt_b622a71233',at:iso(60e3),agentId:'agent_t',action:'email.send',outcome:'completed',taskId:null,requestId:'req_14db6561e9',providerMessageId:'01a1adf4',summary:'Accepted by Resend'},{id:'rcpt_job',at:iso(40e3),agentId:'agent_t',action:'email.send',outcome:'completed',taskId:'task_1',requestId:'req_j',summary:'Accepted'},{id:'rcpt_b622a71233',at:iso(60e3),agentId:'agent_t',action:'email.send',outcome:'completed',taskId:null,requestId:'req_14db6561e9',summary:'dup'}]};
  BB.money={requests:[]};BB.cards={proposals:[]};
  const on=BB.onYou();assert.deepEqual(on.filter(i=>i.type==='email').map(i=>i.q.id),['req_u'],'only the unknown outcome needs the owner');
  assert(!on.some(i=>i.q&&i.q.id==='req_14db6561e9'),'an executed email is not unresolved work');assert.equal(BB.teamSummary().needs,on.filter(i=>i.type!=='dark').length,'counts agree with the list');
  const feed=BB.receiptFeed();assert.deepEqual(feed.map(x=>x.kind+':'+(x.t?x.t.id:x.r.id)),['job:task_1','action:rcpt_b622a71233'],'jobs and standalone receipts, newest first, each once; a job-linked receipt stays with its job');
  const row=feed.find(x=>x.kind==='action');assert.equal(row.q.id,'req_14db6561e9','the standalone receipt is linked to its request');assert.equal(BB.receiptLine(row),'Sent an email to owner@example.com · Accepted by Resend. Delivery not confirmed yet. · Resend id 01a1adf4');
  const ib=fs.readFileSync(path.join(__dirname,'public/js/inbox.js'),'utf8');assert(/BB\.needsYou = \(\) => BB\.onYou\(\)/.test(ib),'Needs you is the same list');
  const rc=fs.readFileSync(path.join(__dirname,'public/js/receipts.js'),'utf8');assert(/BB\.receiptFeed\(\)/.test(rc),'the Receipts tab renders the feed');}
 console.log('PASS display: executed emails leave Needs you (only unknown outcomes stay) and counts agree; Receipts shows finished jobs and standalone action receipts once each, linked to their request and provider id');
})().catch(e=>{console.error(e);process.exit(1)});
