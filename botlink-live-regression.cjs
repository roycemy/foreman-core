// job-002 discriminator: a real job runs end to end through the bot-link run op against a localhost stub downstream,
// with a per-job cap enforced before spend. Synthetic costs only; loopback only; no paid service. ONLY=D3 runs one case.
const assert=require('assert'),{BotLink,memoryStore,httpRunTarget}=require('./api/bot-link.js'),{makeBudget}=require('./api/budget.js'),{makeReceipts}=require('./api/receipt.js'),{connect,startStubDownstream}=require('./botlink-helpers.cjs');
const SECRET='scope_fixture_secret_not_real',WS='ws_test',ONLY=process.env.ONLY||null;
// memoryStore's cas carries no TTL; production refreshes it with EXPIRE after BOTLINK_CAS (which keeps the TTL).
const kvOf=(store,clock,ws)=>({get:k=>store.get('w:'+ws+':'+k),add:(k,v,ms)=>store.add('w:'+ws+':'+k,v,ms),
 cas:async(k,e,n,ms)=>{const r=await store.cas('w:'+ws+':'+k,e,n);if(r===1&&ms)store.ttl.set('w:'+ws+':'+k,clock.t+ms);return r;}});
const rawRun=(R,jobId)=>R.store.get('w:'+WS+':fm:jobrun:'+jobId).then(x=>x&&JSON.parse(x));
const total=stub=>stub.ledger().reduce((n,x)=>n+x.cents,0);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OPEN=new Set(); // every stub, so a failing case still closes its sockets before exit
async function rig({budgetCents=1000,spentCents=0,target=null,opts={}}={}){
 const clock={t:Date.UTC(2026,9,14,12)},store=memoryStore(()=>clock.t),tasks={},recorded=[];
 const stub=await startStubDownstream({secret:SECRET,now:()=>clock.t});OPEN.add(stub);
 const budget=makeBudget({task:async(ws,id)=>tasks[ws+':'+id]||null,kv:ws=>kvOf(store,clock,ws),now:()=>clock.t});
 const receipts=makeReceipts({record:async(ws,r,mapped)=>{recorded.push({ws,mapped,...r});},kv:ws=>kvOf(store,clock,ws),now:()=>clock.t});
 const sent=[],base=target||httpRunTarget(stub.url),runTarget=(req,o)=>{sent.push(req.scope);return base(req,o);};
 const bl=new BotLink({store,now:()=>clock.t,onBotCreated:async()=>'ag_live',runTarget,scopeSecret:SECRET,budget,receipt:(ws,r,ctx)=>receipts.write(ws,r,ctx),opts:{runTimeoutMs:1500,runMarginMs:1000,...opts}});
 const c=await connect(bl,'instinct');
 const job=(id,extra={})=>{tasks[WS+':'+id]={id,assignee:'ag_live',status:'running',sandboxGrant:{botId:'ag_live',status:'active',budgetCents,spentCents,...extra}};return id;};
 let key=c.key;const run=async(body)=>{const r=await bl.call(key,{op:'run',...body});if(r.body&&r.body.nextKey)key=r.body.nextKey;return r;};
 const liveBot=()=>bl.getJ('bl:bot:'+c.botId);
 return {stub,clock,store,bl,budget,receipts,recorded,tasks,job,run,c,sent,liveBot,lease:1500+1000};
}
const cases={
 // D1 cap enforced before spend. Then a run that fits, to prove the reserve is real and not a no-op that let calls through.
 async D1(){const R=await rig({budgetCents:1000});const jobId=R.job('job_d1');R.stub.control({mode:'ok',costCents:600});
  const r=await R.run({jobId,maxCents:1500,input:'d1'});
  assert.equal(R.stub.ledger().length,0,'no charge reached the downstream');
  assert.equal(r.status,200);assert.equal(r.body.result.httpStatus,409);assert.equal(r.body.result.error,'budget_exceeded');assert.equal(R.sent.length,0,'no scope minted');
  assert.equal(await rawRun(R,jobId),null,'refused before any reservation was written');
  const ok=await R.run({jobId,maxCents:1000,input:'d1b'});assert.equal(ok.body.result.outcome,'done');
  const v=await rawRun(R,jobId);assert(v,'fm:jobrun written');assert.equal(v.reservations.length,1);
  assert.deepEqual([v.reservations[0].status,v.reservations[0].cents,v.reservations[0].chargedCents,v.settledCents],['settled',1000,600,600],'one settled reservation, charged what the downstream charged');
  assert.equal(total(R.stub),600);await R.stub.close();},
 // D2 boundary: spend == cap passes; cap + 1 is refused.
 async D2(){const R=await rig({budgetCents:1000});R.stub.control({mode:'ok',costCents:1000});
  const a=await R.run({jobId:R.job('job_d2a'),maxCents:1000,input:'eq'});assert.equal(a.body.result.outcome,'done','spend == cap passes');assert.equal(await R.budget.remaining(WS,'job_d2a'),0);
  const b=await R.run({jobId:R.job('job_d2b'),maxCents:1001,input:'over'});assert.equal(b.body.result.error,'budget_exceeded','cap + 1 is refused');
  assert.equal(total(R.stub),1000);await R.stub.close();},
 // D3 concurrent reserve: the remainder fits one run; two concurrent runs -> exactly one reaches the downstream.
 // A first run makes fm:jobrun exist, so the pair contends on the CAS path (the realistic case) rather than the first-write NX add.
 async D3(){const R=await rig({budgetCents:1000});const jobId=R.job('job_d3');R.stub.control({mode:'ok',costCents:100});
  assert.equal((await R.run({jobId,maxCents:100,input:'first'})).body.result.outcome,'done');R.stub.control({costCents:600});
  const bot=await R.liveBot();const out=await Promise.all([R.bl.runJob(bot,{jobId,maxCents:600,input:'a'}),R.bl.runJob(bot,{jobId,maxCents:600,input:'b'})]);
  assert.deepEqual(out.map(x=>x.outcome).sort(),['done','rejected'],'remainder 900 fits one 600 run; got '+JSON.stringify(out.map(x=>x.outcome+(x.error?':'+x.error:''))));assert.equal(out.find(x=>x.outcome==='rejected').error,'budget_exceeded');
  assert.equal(R.stub.ledger().length,2,'exactly one concurrent charge (plus the first run)');assert.equal((await R.budget.view(WS,jobId)).settledCents,700);await R.stub.close();},
 // D4 bypass pair: a permissive downstream accepts the alk_ key directly (the bypass is real); strict refuses it. Both halves.
 async D4(){const R=await rig();const post=hdr=>new Promise((ok,no)=>{const b=JSON.stringify({jobId:'job_d4',input:'bypass'});const q=require('http').request(R.stub.url+'/v1/run',{method:'POST',agent:false,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(b),...hdr}},res=>{let d='';res.on('data',x=>d+=x);res.on('end',()=>ok({status:res.statusCode,json:async()=>JSON.parse(d||'{}')}));});q.on('error',no);q.end(b);});
  R.stub.control({mode:'ok',costCents:250,strict:false});
  const p=await post({'X-Alter-Scope':R.c.key});assert.equal(p.status,200,'permissive downstream accepts the link key');assert.equal(total(R.stub),250);
  R.stub.control({strict:true});
  for(const hdr of [{'X-Alter-Scope':R.c.key},{Authorization:'Bearer '+R.c.key}]){const s=await post(hdr);assert.equal(s.status,401);assert.equal((await s.json()).error,'alter_link_key_not_accepted');}
  assert.equal((await post({})).status,401);assert.equal(total(R.stub),250,'strict refusals charge nothing');
  const ok=await R.run({jobId:R.job('job_d4'),maxCents:300,input:'via alter'});assert.equal(ok.body.result.outcome,'done','the Alter-scoped run passes strict');
  assert(R.sent.length===1&&!JSON.stringify(ok).includes(R.sent[0]),'the scope never reaches the bot');await R.stub.close();},
 // D5 hang: the run never settles (crashed). Past the lease the FULL reservation is charged, not released.
 async D5(){const R=await rig({budgetCents:1000,target:()=>new Promise(()=>{})});const jobId=R.job('job_d5');
  R.run({jobId,maxCents:700,input:'hang'});await sleep(30);
  const v0=await rawRun(R,jobId);assert.equal(v0.reservations[0].expiresAt-v0.reservations[0].at,R.lease,'lease is runTimeout + margin, not the 30-day key TTL');
  assert.equal(await R.budget.remaining(WS,jobId),300,'live reservation counted');
  R.clock.t+=R.lease;assert.equal(await R.budget.remaining(WS,jobId),300,'expired lease charged in full, remaining stays down');
  const v=await R.budget.view(WS,jobId);assert.deepEqual([v.reservations[0].status,v.settledCents],['expired_charged',700]);
  const live=await rig({budgetCents:1000,opts:{runTimeoutMs:150,runMarginMs:100}});live.stub.control({mode:'hang'});
  const h=await live.run({jobId:live.job('job_d5b'),maxCents:400,input:'hang'});assert.deepEqual([h.body.result.outcome,h.body.result.costCents],['failed',400],'a live timeout fails closed at the full reservation');
  await R.stub.close();await live.stub.close();},
 // D6 overrun: Alter aborts the stream past maxCents; a strict scope keeps the ledger <= maxCents; post-hoc overrun is charged and blocks the job.
 async D6(){const R=await rig({budgetCents:5000});R.stub.control({mode:'slow',costCents:100,chunks:5,delayMs:5,strict:true});
  const a=await R.run({jobId:R.job('job_d6a'),maxCents:250,input:'strict'});assert.deepEqual([a.body.result.outcome,a.body.result.output.error],['failed','aborted_at_ceiling']);
  assert(total(R.stub)<=250,'ledger <= maxCents under a strict scope');assert.equal(a.body.result.costCents,total(R.stub));
  R.stub.control({strict:false});const before=total(R.stub);
  const b=await R.run({jobId:R.job('job_d6b'),maxCents:250,input:'permissive'});assert.equal(b.body.result.output.error,'aborted_at_ceiling','Alter aborted the stream');
  assert.equal(total(R.stub)-before,300,'stopped one chunk past maxCents, not five');assert.deepEqual([b.body.result.costCents,b.body.result.overrun],[300,true],'charged actual, flagged');
  assert.equal((await R.run({jobId:'job_d6b',maxCents:10,input:'again'})).body.result.error,'job_blocked_overrun');
  R.stub.control({mode:'overrun',overBy:75,strict:true});
  const c=await R.run({jobId:R.job('job_d6c'),maxCents:200,input:'posthoc'});assert.deepEqual([c.body.result.outcome,c.body.result.costCents,c.body.result.overrun],['done',275,true]);
  assert.equal((await R.run({jobId:'job_d6c',maxCents:10,input:'again'})).body.result.error,'job_blocked_overrun','loud terminal: further runs blocked');
  await R.stub.close();},
 // D7 kill mid-job: the job-level kill flag is re-checked between chunks; the run aborts and is settled at cost so far.
 async D7(){const R=await rig({budgetCents:5000});const jobId=R.job('job_d7');R.stub.control({mode:'slow',costCents:100,chunks:6,delayMs:40});
  const p=R.run({jobId,maxCents:600,input:'kill me'});while(R.stub.ledger().length<1)await sleep(5);await R.budget.kill(WS,jobId);
  const r=(await p).body.result;assert.equal(r.outcome,'killed');assert(r.output.chunksCompleted<6,'aborted before the end');
  assert.equal(r.costCents,total(R.stub),'cost so far = what the downstream charged');
  const v=await rawRun(R,jobId);assert.deepEqual([v.reservations[0].status,v.reservations[0].chargedCents],['settled',r.costCents]);
  const rc=(await R.receipts.forJob(WS,jobId));assert.deepEqual(rc.map(x=>[x.outcome,x.costCents]),[['killed',r.costCents]]);
  await sleep(300);assert.equal(total(R.stub),r.costCents,'nothing charged after the abort');
  assert.equal((await R.run({jobId,maxCents:10,input:'after kill'})).body.result.error,'job_killed');await R.stub.close();},
 // D8 receipt completeness: done, failed, killed, rejected -> exactly one receipt each, every field non-null.
 async D8(){const R=await rig({budgetCents:5000});
  R.stub.control({mode:'ok',costCents:120});await R.run({jobId:R.job('job_r1'),maxCents:500,input:'ok'});
  R.stub.control({mode:'fail',failStatus:503,partialCents:40});await R.run({jobId:R.job('job_r2'),maxCents:500,input:'fail'});
  R.stub.control({mode:'slow',costCents:100,chunks:6,delayMs:40});const kp=R.run({jobId:R.job('job_r3'),maxCents:600,input:'kill'});while(R.stub.ledger().filter(x=>x.jobId==='job_r3').length<1)await sleep(5);await R.budget.kill(WS,'job_r3');await kp;
  R.stub.control({mode:'ok'});const j4=R.job('job_r4');await R.run({jobId:j4,maxCents:9000,input:'too big'});await R.run({jobId:j4,maxCents:9000,input:'too big again'});
  const want={job_r1:['done','completed',120,'stub:ok'],job_r2:['failed','failed',40,{error:'downstream_failed',status:503}],job_r3:['killed','blocked',null,null],job_r4:['rejected','blocked',0,{error:'budget_exceeded'}]};
  assert.equal(R.recorded.length,4,'exactly one receipt per terminal (the repeated rejection is deduped)');
  for(const [jobId,[outcome,mapped,cost,output]] of Object.entries(want)){
   const rs=R.recorded.filter(x=>x.jobId===jobId);assert.equal(rs.length,1,jobId);const x=rs[0];
   for(const f of ['jobId','botId','costCents','outcome','ts','overrun','output'])assert(x[f]!==null&&x[f]!==undefined,jobId+'.'+f+' is null');
   assert.deepEqual([x.outcome,x.mapped],[outcome,mapped],jobId);if(cost!==null)assert.equal(x.costCents,cost,jobId);if(output!==null)assert.deepEqual(x.output,output,jobId);
   assert.equal((await R.receipts.forJob(WS,jobId)).length,1,jobId+' per-job copy');}
  assert.deepEqual(R.recorded.find(x=>x.jobId==='job_r3').output.error,'killed');await R.stub.close();},
 // D9 double-settle: a slow-but-alive run outlives its lease (charged its full reservation R), then settles with actual A.
 // Settle reconciles: A <= R stays at R; A > R adds A - R and flags overrun. Never R + A.
 async D9(){for(const [A,expect] of [[300,{settled:500,cost:500,overrun:false}],[700,{settled:700,cost:700,overrun:true}]]){
  let release,started=false;const gate=new Promise(r=>release=r);
  const R=await rig({budgetCents:2000,target:async()=>{started=true;await gate;return {status:200,body:{ok:true,output:'late',costCents:A}};}});const jobId=R.job('job_d9');
  const p=R.run({jobId,maxCents:500,input:'slow'});while(!started)await sleep(2);
  R.clock.t+=R.lease;assert.equal(await R.budget.remaining(WS,jobId),1500,'outlived its lease: charged R in full');
  release();const r=(await p).body.result;const v=await rawRun(R,jobId);
  const got=[v.settledCents,r.costCents,r.overrun,r.settle];assert.deepEqual(got,[expect.settled,expect.cost,expect.overrun,'reconciled'],'A='+A+', R=500: want settled/cost/overrun/settle '+JSON.stringify([expect.settled,expect.cost,expect.overrun,'reconciled'])+', got '+JSON.stringify(got)+' (never R + A)');
  await R.stub.close();}},
};
(async()=>{const names=ONLY?[ONLY]:Object.keys(cases);for(const n of names)await cases[n]();
 console.log('PASS job-002 live run: '+names.join(' ')+(ONLY?'':' (cap before spend with a real reservation, boundary, concurrent reserve, bypass pair, lease expiry charged in full, ceiling abort and overrun block, kill mid-job, receipts on every terminal, double-settle reconciled).'));
})().catch(async e=>{console.error(e);await Promise.all([...OPEN].map(s=>s.close().catch(()=>{})));process.exit(1)});
