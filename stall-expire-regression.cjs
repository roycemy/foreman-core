// Stall expiry + owner stop: one hung job must never block a bot.
// - A running job with no real task event for 30 minutes auto-fails ("Auto-stopped"), its job grant
//   closes, the bot is told, and its next claim moves to the next queued job.
// - Real task events refresh the job's progress; heartbeats/presence pings do not.
// - The owner state read (/api/state via fullState) runs the same sweep, so a hung job dies even
//   if the bot never polls.
// - The inspector surfaces the existing owner stop on every unfinished assigned job.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(require('path').join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={chatTask,claimTask,event,listTasks,expireStalledTasks,setJ,getJ,r,fullState,STALL_MS};';
const ctx={require,module:{exports:{}},process:{env:{}},global:{},console,fetch:()=>{throw Error('NO NETWORK')},setTimeout,clearTimeout,URL,AbortSignal};vm.runInNewContext(src,ctx);const f=ctx.module.exports.t;
const ago=h=>new Date(Date.now()-h*3600*1000).toISOString();
(async()=>{
 assert.equal(f.STALL_MS,30*60*1000,'stall limit is 30 minutes');
 const a={id:'a',name:'Worker',status:'active',permissions:{},limits:{}};
 await f.setJ('fm:agent:a',a);await f.r(['SADD','fm:agents','a']);

 // 1. A fresh running job is not stalled and stays claimed.
 let j=await f.chatTask(a,{source_id:'s1',title:'Hung job'});const id1=j.body.task.id;
 assert(j.body.task.progressAt,'progressAt stamped at start');
 assert.equal((await f.claimTask(a)).id,id1,'active running job keeps its bot');
 assert.equal((await f.getJ('fm:task:'+id1)).status,'running','fresh job untouched');

 // 2. Aged past 30 min with no progress: the next claim auto-stops it and moves on.
 let t=await f.getJ('fm:task:'+id1);t.startedAt=ago(2);t.progressAt=ago(2);t.jobGrant={id:'g1',agentId:'a',actions:{'notes.write':'AUTO'},budgetCents:100,spentCents:0,status:'active',issuedAt:ago(2),by:'owner'};await f.setJ('fm:task:'+id1,t);
 const qid='task_q1';await f.setJ('fm:task:'+qid,{id:qid,title:'Next up',status:'queued',assignee:'a',createdBy:'owner',createdAt:ago(1)});await f.r(['LPUSH','fm:tasklist',qid]);
 const claimed=await f.claimTask(a);
 t=await f.getJ('fm:task:'+id1);
 assert.equal(t.status,'failed','stalled job auto-fails');
 assert.equal(t.result,'Auto-stopped: no progress for 30 minutes','honest auto-stop reason');
 assert(t.autoStopped&&t.finishedAt,'marked and finished');
 assert.equal(t.jobGrant.status,'closed','job grant closed on auto-stop');
 assert(claimed&&claimed.id===qid&&claimed.status==='running','bot claims the next queued job');
 assert(claimed.progressAt,'progressAt stamped on claim');
 const ev=(await f.r(['LRANGE','fm:events',0,99])).map(x=>JSON.parse(x));
 assert(ev.some(e=>e.taskId===id1&&/auto-stopped/.test(e.text)),'bot is told why its job died');

 // 3. Real task events refresh progress; presence pings do not.
 const id2=claimed.id;await f.event('a','tool_used','did work',{kind:'TOOL_USED',taskId:id2});
 let t2=await f.getJ('fm:task:'+id2);const p1=Date.parse(t2.progressAt);assert(Date.now()-p1<5000,'task event bumps progress');
 t2.progressAt=ago(2);await f.setJ('fm:task:'+id2,t2);
 await f.event('a','interaction','HTTP gateway connected',{kind:'INTERACTION',source:'gateway',presenceOnly:true,taskId:id2});
 t2=await f.getJ('fm:task:'+id2);assert(Date.parse(t2.progressAt)<Date.now()-3600*1000,'presence/heartbeat does not count as progress');
 await f.event('a','tool_used','more work',{kind:'TOOL_USED',taskId:id2});
 t2=await f.getJ('fm:task:'+id2);assert(Date.now()-Date.parse(t2.progressAt)<5000,'real work rescues the job');
 assert.equal((await f.claimTask(a)).id,id2,'rescued job keeps its bot');

 // 4. The owner state read runs the same sweep.
 let t3=await f.getJ('fm:task:'+id2);t3.startedAt=ago(3);t3.progressAt=ago(3);await f.setJ('fm:task:'+id2,t3);
 await f.fullState();
 assert.equal((await f.getJ('fm:task:'+id2)).status,'failed','fullState auto-stops stalled jobs');

 // 5. UI: the inspector offers the owner stop on unfinished assigned jobs, armed two-tap.
 const insp=fs.readFileSync(require('path').join(__dirname,'public/js/inspector.js'),'utf8');
 assert(insp.includes('data-stop=')&&insp.includes('Stop job'),'inspector shows Stop job');
 assert(insp.includes('Click again to stop this job'),'stop is a two-tap confirm');
 assert(insp.includes('BB.stop(b.dataset.stop)'),'stop calls the existing /api/tasks/:id/stop');
 const core=fs.readFileSync(require('path').join(__dirname,'public/js/core.js'),'utf8');
 assert(core.includes("'/api/tasks/' + taskId + '/stop'"),'core stop client intact');

 console.log('PASS stall expiry: auto-stop at 30 min, grant closes, bot told, next job claimed, presence is not progress, fullState sweeps, UI stop wired');
})().catch(e=>{console.error('FAIL',e);process.exit(1)});
