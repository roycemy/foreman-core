// Lead routing (owner, Oct 22): one submit -> one job for the most recently active awake bot (the lead), which
// hands parts to the owner's other connected bots through Alter's queue. Implicit team = connected external bots,
// never hosted/paid. Covers team enforcement (handoff, assign, descendants, claim, complete, owner assign, asleep
// fallback), pause, crash-safe idempotent submit (crash injected at every step), and that no network/AI is used.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={leadTask,execute,assignTask,completeTask,claimTask,jobDetail,setJ,getJ,listTasks};';
let fetches=0;const c={require,module:{exports:{}},process:{env:{}},global:{},console,fetch:async()=>{fetches++;throw Error('NO NETWORK')},setTimeout,clearTimeout,URL,AbortSignal};
vm.runInNewContext(src,c);const f=c.module.exports.t,realR=c.r;
const ok=m=>console.log('PASS',m),rq=()=>'req_'+Math.random().toString(36).slice(2,14),iso=ms=>new Date(Date.now()-ms).toISOString(),A=id=>({id,name:id,status:'active',permissions:{},limits:{}});
const bot=async(id,name,seenAgo,extra)=>{await f.setJ('fm:agent:'+id,{id,name,status:'active',providerId:id,lastSeen:iso(seenAgo),pollSec:300,permissions:{'work.handoff':'AUTO','work.assign':'AUTO'},limits:{},createdAt:iso(1e7),...extra});await realR(['SADD','fm:agents',id]);};
(async()=>{
 await bot('i','Instinct',60e3);await bot('g','Grok Bot',5e3);await bot('m','Muse',3600e3);await bot('h','Hosted',1e3,{hosted:true});
 // lead = most recently active awake bot; hosted never; brief explains handoff + honesty
 let x=await f.leadTask({requestId:rq(),title:'Research rivals then write a memo'});assert.equal(x.status,200);const t=x.body.task;
 assert.equal(t.assignee,'g','most recent awake bot leads (hosted excluded even though newer)');assert.deepEqual([...t.team].sort(),['g','i','m']);assert.equal(x.body.waiting,false);
 assert(/Instinct \(id i\)/.test(t.brief)&&/Muse \(id m\)/.test(t.brief)&&!/Hosted/.test(t.brief),'brief lists the other connected bots only');assert(/work\.handoff/.test(t.brief)&&/no direct bot-to-bot messaging/.test(t.brief)&&/Report only real results/.test(t.brief));
 assert.equal((await f.listTasks()).filter(z=>z.title==='Research rivals then write a memo').length,1,'exactly one job');assert(!t.orchestration);ok('lead = most recent awake bot; brief lists teammates, handoff via queue, real results only');
 // lead hands parts to teammates; children inherit team; outsiders refused at every door
 assert.equal((await f.claimTask(A('i'))),null,'teammate cannot take the lead job');const cl=await f.claimTask(A('g'));assert.equal(cl.id,t.id);
 await assert.rejects(f.execute(A('g'),'work.handoff',{task_id:t.id,to:'h'}),/owner-picked team|not on it/,'handoff to hosted refused');
 await bot('n','Newcomer',1e3);await assert.rejects(f.execute(A('g'),'work.handoff',{task_id:t.id,to:'n'}),/not on it/,'bot outside the team refused');
 await assert.rejects(f.execute(A('g'),'work.assign',{assignee:'n',title:'x',source_id:'s0',parent_id:t.id}),/not on it/);
 const h=await f.execute(A('g'),'work.handoff',{task_id:t.id,to:'i',title:'Write the memo'});const kid=await f.getJ('fm:task:'+h.data.child_task_id);assert.deepEqual([...kid.team].sort(),['g','i','m'],'handoff child inherits team');
 const as=await f.execute(A('g'),'work.assign',{assignee:'m',title:'Fact-check',source_id:'s1',parent_id:t.id});assert.deepEqual([...(await f.getJ('fm:task:'+as.data.task_id)).team].sort(),['g','i','m']);
 const kc=await f.claimTask(A('i'));assert.equal(kc.id,kid.id);await assert.rejects(f.execute(A('i'),'work.handoff',{task_id:kid.id,to:'n'}),/not on it/,'grandchild leak refused');
 const raw=await f.getJ('fm:task:'+kid.id);await f.setJ('fm:task:'+kid.id,{...raw,assignee:'n'});assert.equal((await f.completeTask(A('n'),kid.id,{result:'fake'})).status,403,'outsider cannot complete');await f.setJ('fm:task:'+kid.id,raw);
 const un=await f.getJ('fm:task:'+as.data.task_id);await f.setJ('fm:task:'+un.id,{...un,assignee:null});assert.equal((await f.assignTask(un.id,{assignee:'n'})).status,400,'owner assign stays in team');assert.equal(await f.claimTask(A('n')),null,'outsider cannot claim unassigned team part');await f.setJ('fm:task:'+un.id,un);
 await f.completeTask(A('i'),kid.id,{result:'REAL memo text'});const d=await f.jobDetail(t.id);assert(d.children.some(z=>z.id===kid.id&&z.result==='REAL memo text'),'running view gets real child results');
 ok('handoff/assign/descendants/claim/complete/owner-assign all limited to the team; real child results visible');
 // nobody awake: queue for most recently active, waiting note; PR97 fallback moves only within the team
 await f.setJ('fm:agent:g',{...(await f.getJ('fm:agent:g')),lastSeen:iso(1800e3)});await f.setJ('fm:agent:i',{...(await f.getJ('fm:agent:i')),lastSeen:iso(2400e3)});await f.setJ('fm:agent:n',{...(await f.getJ('fm:agent:n')),lastSeen:iso(4000e3)});
 for(const z of ['g','i','n','m'])await realR(['DEL','fm:seen:'+z]);x=await f.leadTask({requestId:rq(),title:'Draft a post'});assert.equal(x.body.waiting,true);assert.equal(x.body.task.assignee,'g');assert(/Waiting for Grok Bot to wake/.test(x.body.task.waitNote));
 const w=x.body.task;await f.setJ('fm:task:'+w.id,{...w,assignedAt:iso(3600e3)});await f.setJ('fm:agent:o',{id:'o',name:'Outside',status:'active',lastSeen:iso(1e3),pollSec:300,permissions:{},limits:{},createdAt:iso(1)});await realR(['SADD','fm:agents','o']);
 assert.equal(await f.claimTask(A('o')),null);assert.equal((await f.getJ('fm:task:'+w.id)).assignee,'g','asleep fallback never hands to a bot outside the team');ok('nobody awake: waits for the most recent bot; never an outsider');
 // pause
 await realR(['SET','fm:kill','1']);assert.equal((await f.leadTask({requestId:rq(),title:'x'})).status,403);await realR(['DEL','fm:kill']);ok('paused workspace refuses');
 // idempotency: duplicates, concurrency, payload mismatch
 const id=rq();const [a1,a2]=await Promise.all([f.leadTask({requestId:id,title:'Same task'}),f.leadTask({requestId:id,title:'Same task'})]);assert.equal(a1.body.task.id,a2.body.task.id);
 assert.equal((await f.leadTask({requestId:id,title:'Same task'})).body.task.id,a1.body.task.id);assert.equal((await f.leadTask({requestId:id,title:'Other task'})).status,409);
 assert.equal((await realR(['LRANGE','fm:tasklist',0,59])).filter(z=>z===a1.body.task.id).length,1);assert.equal((await f.leadTask({title:'x'})).status,400,'requestId required');ok('duplicate and concurrent submits resolve to one job');
 // crash at every step, then retry
 for(const step of ['SMEMBERS','SET','LRANGE','LPUSH','LTRIM']){
  const id2=rq(),title='Crash at '+step;let armed=true;c.r=async cmd=>{if(armed&&cmd[0]===step&&(step!=='SET'||String(cmd[1]).startsWith('fm:task:'))){armed=false;throw Error('simulated crash at '+step);}return realR(cmd);};
  await assert.rejects(f.leadTask({requestId:id2,title}),/simulated crash/);c.r=realR;
  const again=await f.leadTask({requestId:id2,title});assert.equal(again.status,200);const third=await f.leadTask({requestId:id2,title});assert.equal(third.body.task.id,again.body.task.id);
  const all=(await f.listTasks()).filter(z=>z.title===title);assert.equal(all.length,1,'one job after crash at '+step);assert.equal((await realR(['LRANGE','fm:tasklist',0,59])).filter(z=>z===again.body.task.id).length,1,'listed once after crash at '+step);
 }
 ok('crash at each step (agents read, commit, list read, list push, list trim) then retry -> exactly one job');
 assert.equal(fetches,0,'no network, no AI call');console.log('PASS lead routing: lead pick, team enforcement, waiting, pause, crash-safe idempotent submit; no AI, no network.');
})().catch(e=>{console.error(e);process.exit(1)});
