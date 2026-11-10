// Crash mid-send: approval claims the request as 'approved' before calling Resend. If the function dies before it records the
// outcome (timeout, cold-start kill), the request must not stay 'approved' forever: once it is older than any live execution
// could be, the owner sees it as an unknown outcome and can reconcile it. Reconcile repeats the same Idempotency-Key, so an
// email that already landed is never sent twice, and one that never left is sent once. A fresh in-flight request is not touched.
// Offline: Resend is a fake keyed on Idempotency-Key; no network.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={routes,r,setJ,getJ,als,createAgent,newTask};';
const R={sends:0,keys:new Map()};
const res=(s,j)=>({ok:s>=200&&s<300,status:s,json:async()=>j,text:async()=>JSON.stringify(j)});
async function fakeFetch(url,o={}){const u=new URL(url);if(u.hostname!=='api.resend.com')throw Error('NO NETWORK: '+url);
 const k=(o.headers||{})['idempotency-key'];if(!k)return res(200,{id:'wake'});if(R.keys.has(k))return res(200,R.keys.get(k));R.sends++;const out={id:'em_'+R.sends};R.keys.set(k,out);return res(200,out);}
const env={RESEND_API_KEY:'re_test_fixture',WAKE_EMAIL_FROM:'Alter <alerts@alter.example>',ALTER_EMAIL_ALLOWED_TO:'owner@example.com'};
const ctx={require,module:{exports:{}},process:{env},global:{},console,fetch:fakeFetch,setTimeout,clearTimeout,URL,AbortSignal};vm.runInNewContext(src,ctx);const f=ctx.module.exports.t;
const H={host:'localhost',origin:'http://localhost'};
async function call(method,p,body,agent){let out;const r={status(n){this.code=n;return this},json(j){out={code:this.code||200,j};return out},setHeader(){},end(){out={code:this.code||204};return out}};await f.routes({method,headers:H,url:'/api'+p,gatewayKeyAuth:!!agent},r,p.split('?')[0],body||{},agent||null);return out;}
const mail={to:'owner@example.com',subject:'Weekly summary',text:'Here is the summary.'};
(async()=>{await f.als.run({ws:'crash'},async()=>{
 let A,n=0;const live=()=>f.getJ('fm:agent:'+A.id); // one bot per scenario: a bot works one job at a time
 async function proposal(title){A=(await f.createAgent('Bot '+(++n),'Ops','custom',false,{preset:'balanced'})).agent;const job=await f.newTask({title,assignee:A.id});await call('GET','/gateway/tasks/next',{},await live());
  const p=await call('POST','/gateway/act',{action:'email.send',params:mail,task_id:job.id},await live());assert.ok(p.j.request_id,'proposal created: '+JSON.stringify(p));return {job,rid:p.j.request_id};}
 // the exact state approveReq leaves when it dies after claimReq(status:'approved') and before finishReq
 async function crashAfterClaim(rid,agoMs){const q=await f.getJ('fm:req:'+rid);q.status='approved';q.decidedAt=new Date(Date.now()-agoMs).toISOString();await f.setJ('fm:req:'+rid,q);}
 const reqInState=async rid=>(await call('GET','/state')).j.requests.find(x=>x.id===rid);

 // 1. the send landed at Resend, then the function died: shown as unknown; reconcile finds the original email, sends nothing new
 {const {job,rid}=await proposal('Landed then crashed');await crashAfterClaim(rid,5*60000);R.keys.set(rid,{id:'em_landed'});const before=R.sends;
  assert.equal((await reqInState(rid)).status,'outcome_unknown','a stale in-flight approval is shown to the owner as an unknown outcome');
  const rc=await call('POST','/requests/'+rid+'/reconcile');assert.equal(rc.code,200,'the owner can reconcile it');
  const q=await f.getJ('fm:req:'+rid);assert.equal(q.status,'executed');assert.equal(q.delivery.providerMessageId,'em_landed','the original email id is recovered');
  assert.equal(R.sends,before,'no second email');
  assert.equal((await call('POST','/gateway/tasks/'+job.id+'/complete',{result:'done'},await live())).code,200,'the job can finish once resolved');}
 // 2. the function died before the send left: reconcile sends exactly once; a second reconcile is refused
 {const {rid}=await proposal('Crashed before send');await crashAfterClaim(rid,5*60000);const before=R.sends;
  await call('POST','/requests/'+rid+'/reconcile');assert.equal(R.sends,before+1,'sent exactly once');assert.equal((await f.getJ('fm:req:'+rid)).status,'executed');
  assert.equal((await call('POST','/requests/'+rid+'/reconcile')).code,409,'an executed email cannot be reconciled again');assert.equal(R.sends,before+1);}
 // 3. an approval that may still be executing is left alone: not shown as unknown, not reconcilable
 {const {rid}=await proposal('Still in flight');await crashAfterClaim(rid,5000);const before=R.sends;
  assert.equal((await reqInState(rid)).status,'approved','a fresh approval is not relabelled');
  assert.equal((await call('POST','/requests/'+rid+'/reconcile')).code,409,'a possibly live execution cannot be reconciled');assert.equal(R.sends,before);}
 // 4. a reconcile that itself died ('reconciling' left behind) is recoverable the same way, still at most one email
 {const {rid}=await proposal('Reconcile crashed');await crashAfterClaim(rid,5*60000);const q=await f.getJ('fm:req:'+rid);q.status='reconciling';q.executedAt=q.decidedAt;await f.setJ('fm:req:'+rid,q);
  R.keys.set(rid,{id:'em_rc'});const before=R.sends;
  assert.equal((await reqInState(rid)).status,'outcome_unknown');await call('POST','/requests/'+rid+'/reconcile');
  assert.equal((await f.getJ('fm:req:'+rid)).delivery.providerMessageId,'em_rc');assert.equal(R.sends,before,'no second email');}
});console.log('PASS crash recovery: a stale approved/reconciling email shows as unknown and reconciles with the same key (landed: no resend; not landed: one send); fresh in-flight requests are untouched');})().catch(e=>{console.error(e);process.exit(1)});
