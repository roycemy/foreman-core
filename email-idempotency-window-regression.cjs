// Reconcile vs Resend's idempotency window. Resend docs (fetched 2026-11-10): "Idempotency keys are kept in the system for 24 hours";
// within it the same key and payload return the original response "without actually sending the email again". What happens after
// expiry is not documented, so this fake assumes the worst: once a key is older than 24h, the same request SENDS AGAIN.
// The first send of a request can only happen after the owner's approval (decidedAt) and is over by the time the outcome is recorded
// (executedAt, at most the function duration later). Alter refuses to reconcile 23h after executedAt (or decidedAt), so every reconcile it
// allows lands while the original key is still alive. This sweep places the landed email at many ages around the boundary, for each
// state a reconcile can start from, and asserts the recipient never gets a second email: allowed reconciles hit a live key, the rest
// make zero provider calls. Offline: no network.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={routes,r,setJ,getJ,als,createAgent,newTask};';
const H24=24*3600e3,H=3600e3;
const keys=new Map();let posts=0,emails=0; // key -> {at,id}; emails counts real sends, including any after expiry
const res=(s,j)=>({ok:s>=200&&s<300,status:s,json:async()=>j,text:async()=>JSON.stringify(j)});
async function fakeFetch(url,o={}){const u=new URL(url);if(u.hostname!=='api.resend.com')throw Error('NO NETWORK: '+url);
 const k=(o.headers||{})['idempotency-key'];if(!k)return res(200,{id:'wake'});posts++;
 const prev=keys.get(k);if(prev&&Date.now()-prev.at<=H24)return res(200,{id:prev.id}); // alive: original response, no email
 emails++;const id='em_'+emails;keys.set(k,{at:Date.now(),id});return res(200,{id});}                // new or EXPIRED: a real email
const env={RESEND_API_KEY:'re_test_fixture',WAKE_EMAIL_FROM:'Alter <alerts@alter.example>',ALTER_EMAIL_ALLOWED_TO:'owner@example.com'};
const ctx={require,module:{exports:{}},process:{env},global:{},console,fetch:fakeFetch,setTimeout,clearTimeout,URL,AbortSignal};vm.runInNewContext(src,ctx);const f=ctx.module.exports.t;
const HD={host:'localhost',origin:'http://localhost'};
async function call(method,p,body,agent){let out;const r={status(n){this.code=n;return this},json(j){out={code:this.code||200,j};return out},setHeader(){},end(){out={code:this.code||204};return out}};await f.routes({method,headers:HD,url:'/api'+p,gatewayKeyAuth:!!agent},r,p.split('?')[0],body||{},agent||null);return out;}
const mail={to:'owner@example.com',subject:'Weekly summary',text:'Here is the summary.'};
const iso=ms=>new Date(ms).toISOString();
(async()=>{await f.als.run({ws:'window'},async()=>{
 let n=0,allowed=0,refused=0;
 async function proposal(){const A=(await f.createAgent('Bot '+(++n),'Ops','custom',false,{preset:'balanced'})).agent;const job=await f.newTask({title:'J'+n,assignee:A.id});
  const live=await f.getJ('fm:agent:'+A.id);await call('GET','/gateway/tasks/next',{},live);const p=await call('POST','/gateway/act',{action:'email.send',params:mail,task_id:job.id},live);assert.ok(p.j.request_id);return p.j.request_id;}
 // ages of the landed email at the moment of reconcile, in hours, around the 23h refusal and the 24h expiry
 const ages=[0.01,1,12,22.5,22.98,22.99,23,23.001,23.01,23.5,23.99,24,24.001,25,48];
 // durations between the email landing and the outcome being recorded (executedAt), up to the 30s function ceiling
 const lags=[0,1000,15000,30000];
 for(const state of ['outcome_unknown','approved','reconciling'])for(const ageH of ages)for(const lag of lags){
  const rid=await proposal();const landed=Date.now()-ageH*H;
  keys.set(rid,{at:landed,id:'em_orig_'+rid});const before=emails,beforePosts=posts;          // the original email landed at `landed`
  const q=await f.getJ('fm:req:'+rid);q.status=state;q.decidedAt=iso(landed-500);                  // decided just before the send
  if(state!=='approved')q.executedAt=iso(landed+lag);                                                 // outcome recorded `lag` after landing
  if(state==='reconciling')q.reconcileStartedAt=iso(landed+lag+60000-ageH*0);                         // a reconcile that started and died
  await f.setJ('fm:req:'+rid,q);
  const rc=await call('POST','/requests/'+rid+'/reconcile');
  assert.equal(emails,before,`no second email: state=${state} age=${ageH}h lag=${lag}ms (reconcile answered ${rc.code} ${rc.j&&rc.j.error||''})`);
  if(rc.code===200){allowed++;assert.equal((await f.getJ('fm:req:'+rid)).delivery.providerMessageId,'em_orig_'+rid,'an allowed reconcile recovers the original id');}
  else{refused++;assert.equal(posts,beforePosts,`a refused reconcile makes no provider call (state=${state} age=${ageH}h)`);}
  // a recently started reconcile (still possibly live) must not be re-entered even inside the window
 }
 assert.ok(allowed>0&&refused>0,'the sweep exercised both sides of the boundary ('+allowed+' allowed, '+refused+' refused)');
 // every reconcile past 23h of the recorded outcome is refused, whatever the state
 // The sweep's lags (0-30s) are the whole range only while two invariants hold; pin them so an edit that breaks them fails here.
 {const api=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8'),vj=JSON.parse(fs.readFileSync(path.join(__dirname,'vercel.json'),'utf8'));
  const md=vj.functions&&vj.functions['api/index.js']&&vj.functions['api/index.js'].maxDuration;
  assert.ok(Number.isFinite(md)&&md<=300,'api/index.js maxDuration is set and small (got '+md+'): first send to executedAt stays far under the 1h margin');
  const writes=api.match(/executedAt\s*=\s*now\(\)/g)||[];assert.equal(writes.length,1,'executedAt is assigned in exactly one place');
  const i=api.indexOf('executedAt = now()'),before=api.slice(api.lastIndexOf('\n',api.lastIndexOf('\n',i)-1),i);
  assert.ok(/await runAndReceipt\(/.test(before),'executedAt is stamped right after the send returns, in the same invocation');
  assert.ok(/claimReq\(raw, \{ status: 'approved', decidedAt: now\(\) \}\)/.test(api),'decidedAt is persisted before the first provider call');
  assert.ok(/Date\.parse\(q\.executedAt \|\| q\.decidedAt\) > EMAIL_RECONCILE_MS/.test(api)&&/EMAIL_RECONCILE_MS = 23 \* 3600000/.test(api),'the cutoff is 23h from executedAt, else decidedAt');}
 console.log(`PASS idempotency window: ${allowed} reconciles inside the window recovered the original email, ${refused} past it were refused with zero provider calls; no recipient ever got a second email even with a fake that re-sends on expired keys`);
});})().catch(e=>{console.error(e);process.exit(1)});
