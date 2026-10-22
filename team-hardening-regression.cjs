// PR #99 reviewer blockers: team leak (handoff/assign/descendants/complete), account-wide atomic planner cap,
// model allowlist, reconciliation, pause-before-planner, idempotent requestId, cancel-vs-claim interleavings,
// planner-written instruction labels. Mocked LLM only; any other network call throws.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={execute,assignTask,completeTask,claimTask,cancelPendingParts,autoTeamTask,planTeamTask,createTaskParts,als,r,setJ,getJ,AGENT_CAS,plannerSpendKey,plannerCapMicro,listTasks};';
let llm=null,calls=0;const env={ALTER_PLANNER_XAI_KEY:'fixture-not-a-real-key'};
const fetchMock=async(url,opts)=>{if(!String(url).startsWith('https://api.x.ai/'))throw Error('NO NETWORK: '+url);calls++;return llm(JSON.parse(opts.body));};
const reply=(obj,usage)=>({ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify(obj)}}],...(usage===null?{}:{usage:usage||{prompt_tokens:200,completion_tokens:100}})})});
const c={require,module:{exports:{}},process:{env},global:{},console,fetch:fetchMock,setTimeout,clearTimeout,URL,AbortSignal};vm.runInNewContext(src,c);const f=c.module.exports.t;
const ok=m=>console.log('PASS',m);const rq=()=>'req_'+Math.random().toString(36).slice(2,14);const iso=ms=>new Date(Date.now()-ms).toISOString();
const inWs=(ws,fn)=>f.als.run({ws},fn);
async function seed(){for(const [id,name] of [['i','Instinct'],['g','Grok Bot'],['o','Outsider'],['c','Clerk']]){await f.setJ('fm:agent:'+id,{id,name,status:'active',providerId:id,lastSeen:iso(1000),pollSec:300,permissions:{'work.handoff':'AUTO','work.assign':'AUTO'},limits:{},createdAt:iso(1e6)});await f.r(['SADD','fm:agents',id]);}}
const A=id=>({id,name:id,status:'active',permissions:{},limits:{}});
const part1=bot=>({parts:[{title:'Write the memo',instruction:'Write a one-page memo',needs:'Nothing',bot,reason:'awake'}]});
(async()=>{
 await inWs('wsA',seed);await inWs('wsB',seed);
 await inWs('wsA',async()=>{
  // ---- 1. team leak ----
  llm=()=>reply(part1('i'));let au=await f.autoTeamTask({requestId:rq(),title:'Write the memo',team:['i','g']});assert.equal(au.status,200);const p1=au.body.parts[0];
  assert(/written by the AI planner \(not the owner's words\)/.test(p1.brief)&&p1.instructionSource==='ai-planner','planner-written instruction labeled');
  let cl=await f.claimTask(A('i'));assert.equal(cl.id,p1.id);
  await assert.rejects(f.execute(A('i'),'work.handoff',{task_id:p1.id,to:'o'}),/owner-picked team/,'handoff to outsider refused');
  await assert.rejects(f.execute(A('i'),'work.assign',{assignee:'o',title:'sub',source_id:'s1',parent_id:p1.id}),/owner-picked team/,'assign under team parent to outsider refused');
  const h=await f.execute(A('i'),'work.handoff',{task_id:p1.id,to:'g'});const child=await f.getJ('fm:task:'+h.data.child_task_id);assert.deepEqual([...child.team],['i','g'],'handoff child inherits team');
  const as=await f.execute(A('i'),'work.assign',{assignee:'g',title:'sub',source_id:'s2',parent_id:p1.id});assert.deepEqual([...(await f.getJ('fm:task:'+as.data.task_id)).team],['i','g'],'assigned child inherits team');
  // descendant (grandchild) leak
  const gc=await f.getJ('fm:task:'+child.id);await f.setJ('fm:task:'+child.id,{...gc,status:'running'});await assert.rejects(f.execute(A('g'),'work.handoff',{task_id:child.id,to:'o'}),/owner-picked team/,'grandchild handoff to outsider refused');
  // owner assign of an unassigned team part to an outsider
  const un=await f.getJ('fm:task:'+as.data.task_id);await f.setJ('fm:task:'+un.id,{...un,assignee:null});let x=await f.assignTask(un.id,{assignee:'o'});assert.equal(x.status,400);
  // outsider complete, even if the record were tampered to name it
  const raw=await f.getJ('fm:task:'+p1.id);await f.setJ('fm:task:'+p1.id,{...raw,assignee:'o'});x=await f.completeTask(A('o'),p1.id,{result:'fake'});assert.equal(x.status,403,'outsider cannot complete');await f.setJ('fm:task:'+p1.id,raw);
  ok('team leak closed: handoff, assign, descendants, owner assign, complete');
  // ---- 3. idempotent requestId ----
  const id=rq(),c0=calls;const [d1,d2]=await Promise.all([f.autoTeamTask({requestId:id,title:'Write the memo',team:['i']}),f.autoTeamTask({requestId:id,title:'Write the memo',team:['i']})]);
  const okOne=[d1,d2].filter(z=>z.status===200);assert(okOne.length>=1&&[d1,d2].every(z=>z.status===200||z.status===409));
  const d3=await f.autoTeamTask({requestId:id,title:'Write the memo',team:['i']});assert.equal(d3.status,200);assert.equal(d3.body.duplicate,true);assert.equal(d3.body.task.id,okOne[0].body.task.id,'retry returns the same task');
  assert.equal((await f.listTasks()).filter(t=>t.orchestration&&t.title==='Write the memo').length,2,'only one new plan for the repeated ID');assert.equal(calls-c0,1,'one planner call for the repeated ID');
  assert.equal((await f.autoTeamTask({title:'x',team:['i']})).status,400,'requestId required');ok('duplicate requestId returns the same task; no duplicate plan or planner call');
  // ---- 4. cancel vs claim interleavings ----
  const mk=async()=>{llm=()=>reply(part1('c'));return (await f.autoTeamTask({requestId:rq(),title:'Write the memo',team:['c']})).body;};
  let pl=await mk();assert.equal((await f.cancelPendingParts(pl.task.id)).body.cancelled,1);assert.equal(await f.claimTask(A('c')),null,'cancel then claim: nothing claimed');
  pl=await mk();cl=await f.claimTask(A('c'));assert.equal(cl.id,pl.parts[0].id);assert.equal((await f.cancelPendingParts(pl.task.id)).body.cancelled,0,'claim then cancel: running part untouched');assert.equal((await f.getJ('fm:task:'+cl.id)).status,'running');await f.completeTask(A('c'),cl.id,{result:'done'});
  for(let k=0;k<8;k++){pl=await mk();const [cc,cx]=await Promise.all([f.claimTask(A('c')),f.cancelPendingParts(pl.task.id)]);const fin=await f.getJ('fm:task:'+pl.parts[0].id);
   if(fin.status==='running'){assert(cc&&cc.id===fin.id);assert.equal(cx.body?cx.body.cancelled:0,0);await f.completeTask(A('c'),fin.id,{result:'r'});}else{assert.equal(fin.status,'failed');assert(!cc||cc.id!==fin.id,'never both cancelled and claimed');}}
  // stale compare-and-set: a claim that read before the cancel wrote must lose
  pl=await mk();const key='fm:task:'+pl.parts[0].id,stale=await f.r(['GET',key]);await f.cancelPendingParts(pl.task.id);assert.equal(await f.r(['EVAL',f.AGENT_CAS,1,key,stale,JSON.stringify({...JSON.parse(stale),status:'running',assignee:'c'})]),0,'stale claim CAS rejected');assert.equal((await f.getJ(key)).status,'failed');
  pl=await mk();const stale2=await f.r(['GET','fm:task:'+pl.parts[0].id]);await f.claimTask(A('c'));assert.equal((await f.cancelPendingParts(pl.task.id)).body.cancelled,0);assert.equal(await f.r(['EVAL',f.AGENT_CAS,1,'fm:task:'+pl.parts[0].id,stale2,JSON.stringify({...JSON.parse(stale2),status:'failed'})]),0,'stale cancel CAS rejected');
  ok('cancel vs claim: both orderings, concurrent, stale CAS both ways');
  // ---- 2. pause before planner ----
  await f.r(['SET','fm:kill','1']);let c1=calls;x=await f.autoTeamTask({requestId:rq(),title:'Write',team:['i']});assert.equal(x.status,403);assert.equal(calls,c1,'paused: no planner call');await f.r(['DEL','fm:kill']);ok('paused workspace never calls the planner');
  // allowlist
  env.ALTER_PLANNER_MODEL='grok-4.7';c1=calls;x=await f.planTeamTask({title:'Write the memo',team:['i']});assert.equal(x.body.method,'basic');assert(/allowlist/.test(x.body.note));assert.equal(calls,c1);delete env.ALTER_PLANNER_MODEL;ok('non-allowlisted model -> basic split, no call');
  // reconciliation
  await f.r(['SET',f.plannerSpendKey(),'0']);llm=()=>reply(part1('i'),{prompt_tokens:400,completion_tokens:100});await f.planTeamTask({title:'Write the memo',team:['i']});assert.equal(Number(await f.r(['GET',f.plannerSpendKey()])),Math.ceil(400*1.25+100*2.5),'reconciled to reported usage');
  await f.r(['SET',f.plannerSpendKey(),'0']);llm=()=>reply(part1('i'),null);await f.planTeamTask({title:'Write the memo',team:['i']});assert(Number(await f.r(['GET',f.plannerSpendKey()]))>1000,'no usage reported: full reservation kept');ok('reconciliation releases unused reservation; missing usage keeps it');
 });
 // cross-workspace shared cap
 await f.r(['SET','gl:planner:spendMicro:'+new Date().toISOString().slice(0,7),'0']);
 llm=()=>reply(part1('i'),{prompt_tokens:400,completion_tokens:100});await inWs('wsA',()=>f.planTeamTask({title:'Write the memo',team:['i']}));const afterA=Number(await f.r(['GET',f.plannerSpendKey()]));
 await inWs('wsB',()=>f.planTeamTask({title:'Write the memo',team:['i']}));assert.equal(Number(await f.r(['GET',f.plannerSpendKey()])),afterA*2,'workspace B adds to the same account-wide counter');
 await f.r(['SET',f.plannerSpendKey(),String(f.plannerCapMicro())]);let c2=calls;const xb=await inWs('wsB',()=>f.planTeamTask({title:'Write the memo',team:['i']}));assert(/spend cap/.test(xb.body.note));assert.equal(calls,c2,'cap hit in A blocks B');ok('cap is account-wide across workspaces');
 // concurrent reservations never exceed the cap
 const cap=f.plannerCapMicro();await f.r(['SET',f.plannerSpendKey(),String(cap-12000)]);let inflight=0,peak=0;llm=async()=>{inflight++;peak=Math.max(peak,Number(await f.r(['GET',f.plannerSpendKey()])));await new Promise(r=>setTimeout(r,5));inflight--;return reply(part1('i'),null);};
 c2=calls;await inWs('wsA',()=>Promise.all(Array.from({length:12},()=>f.planTeamTask({title:'Write the memo',team:['i']}))));assert(Number(await f.r(['GET',f.plannerSpendKey()]))<=cap&&peak<=cap,'never above cap');assert(calls-c2<12&&calls-c2>=1,'only the reservations that fit were called');ok('concurrent reservations stay under the cap ('+(calls-c2)+' of 12 called)');
 console.log('PASS team hardening: leak, cap, allowlist, reconcile, pause, idempotency, cancel/claim interleavings; mocked LLM, no network.');
})().catch(e=>{console.error(e);process.exit(1)});
