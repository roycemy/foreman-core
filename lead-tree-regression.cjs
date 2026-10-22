// Owner re-review (Oct 21): owner limits reach every depth and are enforced on the server; capability-based lead
// selection; idempotent crash-safe handoff; parent can't finish with open parts; Stop cascades and beats a racing
// claim; children load from the parent index (not the recent-30 list). No network.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={leadTask,execute,gatewayAct,completeTask,claimTask,stopTask,jobDetail,newSpendRequest,reviewSpend,setJ,getJ,listTasks,newTask,ACTIONS,parseLimits};';
let fetches=0;const c={require,module:{exports:{}},process:{env:{}},global:{},console,fetch:async()=>{fetches++;throw Error('NO NETWORK')},setTimeout,clearTimeout,URL,AbortSignal};
vm.runInNewContext(src,c);const f=c.module.exports.t,realR=c.r;
const ok=m=>console.log('PASS',m),rq=()=>'req_'+Math.random().toString(36).slice(2,14),iso=ms=>new Date(Date.now()-ms).toISOString();
const perms={'work.handoff':'AUTO','work.assign':'AUTO','web.fetch':'AUTO','notes.write':'AUTO','email.send':'AUTO'};
const bot=async(id,providerId,seenAgo,extra)=>{await f.setJ('fm:agent:'+id,{id,name:id.toUpperCase(),status:'active',providerId,lastSeen:iso(seenAgo),pollSec:300,permissions:perms,limits:{},createdAt:iso(1e7),...extra});await realR(['SADD','fm:agents',id]);};
const A=async id=>await f.getJ('fm:agent:'+id);
const clear=async()=>{for(const id of await realR(['SMEMBERS','fm:agents']))await realR(['SREM','fm:agents',id]);};
(async()=>{
 // ---- 2. lead selection by adapter capability ----
 await bot('mu','muse',1e3);await bot('gx','grok',30e3);await bot('ix','instinct',60e3);
 let x=await f.leadTask({requestId:rq(),title:'Plan the launch'});assert.equal(x.body.task.assignee,'gx','Muse (no tool connector) skipped though most recent');assert(!x.body.lead.alone);
 await f.stopTask(x.body.task.id);ok('Muse skipped as lead when a handoff-capable bot is awake');
 await clear();await bot('mu2','muse',1e3);await bot('gs','grok',3600e3);for(const z of ['gs','mu2'])await realR(['DEL','fm:seen:'+z]);
 x=await f.leadTask({requestId:rq(),title:'Solo task'});assert.equal(x.body.task.assignee,'mu2');assert.equal(x.body.lead.alone,true);assert(/will do this alone: it can't hand off/.test(x.body.task.routingReason));assert(/doing this task alone/.test(x.body.task.brief)&&!/work\.handoff/.test(x.body.task.brief));
 await f.stopTask(x.body.task.id);ok('Muse as the only awake bot leads, labeled "alone, can\'t hand off"');

 // ---- 1. owner limits propagate + server enforcement ----
 await clear();await bot('L','grok',2e3);await bot('B','instinct',5e3);await bot('C','grok',9e3);
 const req='Draft only: write the investor update. Don\'t send it and don\'t buy anything.';
 x=await f.leadTask({requestId:rq(),title:'Investor update',brief:req});const root=x.body.task;
 assert.deepEqual({d:root.owner.limits.draftOnly,s:root.owner.limits.noSend,p:root.owner.limits.noPurchase},{d:true,s:true,p:true});
 assert.equal(await (await f.claimTask(await A('L'))).id,root.id);
 const h1=await f.execute(await A('L'),'work.handoff',{task_id:root.id,to:'B',title:'Write section 1',brief:'Also email it to the investors when done.'});
 const k1=await f.getJ('fm:task:'+h1.data.child_task_id);assert.equal((await f.claimTask(await A('B'))).id,k1.id);
 const h2=await f.execute(await A('B'),'work.handoff',{task_id:k1.id,to:'C',title:'Find figures'});const k2=await f.getJ('fm:task:'+h2.data.child_task_id);
 assert.equal(k2.depth,2);assert.equal(k2.rootId,root.id);assert.deepEqual(k2.owner,root.owner,'depth-2 child carries owner request + limits');
 assert(k2.brief.includes(root.owner.request)&&/OWNER LIMITS: draft only; do not send; do not buy/.test(k2.brief)&&/INSTRUCTION FROM B \(bot-written/.test(k2.brief),'brief shows the owner request verbatim, separate from bot text');
 assert(k1.brief.indexOf('OWNER\'S ORIGINAL REQUEST')<k1.brief.indexOf('Also email it'),'bot instruction is labeled and kept after the owner block');
 assert.deepEqual(k2.allowedActions,root.allowedActions,'ceiling inherited, never widened');
 ok('owner request + parsed limits reach a depth-2 child; brief separates owner words from bot words');
 // server gates: a send-capable action (fixture), an action outside the ceiling, spend requests, and their approval path
 f.ACTIONS['email.send']={cap:'send',risk:'high',run:async()=>{throw Error('must never run')}};
 assert.equal((await f.claimTask(await A('C'))).id,k2.id);
 let g=await f.gatewayAct(await A('C'),{action:'email.send',params:{},task_id:k2.id});console.log('  send gate ->',JSON.stringify(g.body||g).slice(0,200));assert.equal((g.body||g).code,'owner_limit','outside the inherited ceiling');
 {const kr=await f.getJ('fm:task:'+k2.id);await f.setJ('fm:task:'+k2.id,{...kr,allowedActions:[...kr.allowedActions,'email.send']});const g2=await f.gatewayAct(await A('C'),{action:'email.send',params:{},task_id:k2.id});assert(/does not allow send/.test(JSON.stringify(g2.body||g2)),'send cap refused even if the ceiling were widened');await f.setJ('fm:task:'+k2.id,kr);}assert(/owner/i.test(JSON.stringify(g.body||g)),'send refused in child: '+JSON.stringify(g));
 g=await f.gatewayAct(await A('C'),{action:'email.send',params:{},task_id:root.id});assert(/owner|not found|not yours|assign/i.test(JSON.stringify(g.body||g)));
 const sp={merchant:'Acme',amountCents:500,currency:'USD',accountLabel:'test',purpose:'figures',undoTerms:'refund',sourceId:'s'+Math.random()};
 let s1=await f.newSpendRequest(await A('C'),{...sp,taskId:k2.id});assert.equal(s1.status,403);assert.equal(s1.body.code,'owner_limit');
 // a child of a root that never mentioned money also may not spend (children can't add capabilities)
 x=await f.leadTask({requestId:rq(),title:'Summarize the market'});const r2=x.body.task;assert(!r2.owner.limits.noSpend);

 const l2=r2.assignee,o2=['L','B','C'].find(z=>z!==l2);const h3=await f.execute(await A(l2),'work.handoff',{task_id:r2.id,to:o2,title:'Get prices'});const k3=await f.getJ('fm:task:'+h3.data.child_task_id);
 assert.equal((await f.newSpendRequest(await A(o2),{...sp,taskId:k3.id})).status,403,'child spend refused unless root allowed it');
 // approval path re-checks: a request filed before the limit applied is not approved
 await f.setJ('fm:spendRequest:sx',{id:'sx',status:'pending_review',detailsHash:'h',agentId:o2,taskId:k3.id,expiresAt:new Date(Date.now()+6e5).toISOString(),merchant:'Acme',amountCents:500,currency:'usd'});
 const rv=await f.reviewSpend('sx','approve','h');assert.equal(rv.body.request.status,'blocked','approval path refuses');
 // a root that explicitly allowed purchases lets its child file the (still owner-reviewed) request
 x=await f.leadTask({requestId:rq(),title:'Order paper',brief:'You can buy a ream of paper.'});const r3=x.body.task;assert(r3.owner.limits.allowPurchase);
 const l3=r3.assignee,o3=['L','B','C'].find(z=>z!==l3);const h4=await f.execute(await A(l3),'work.handoff',{task_id:r3.id,to:o3,title:'Buy it'});
 const sAllowed=await f.newSpendRequest(await A(o3),{...sp,taskId:h4.data.child_task_id});assert.notEqual(sAllowed.status,403,JSON.stringify(sAllowed.body));
 ok('server refuses send/spend/purchase in a child where forbidden, incl. the approval path; explicit owner permission flows down');

 // ---- 3. handoff idempotency + crash safety ----
 await clear();await bot('P','grok',2e3);await bot('Q','instinct',4e3);
 x=await f.leadTask({requestId:rq(),title:'Idem parent'});const ip=x.body.task;await f.claimTask(await A('P'));
 const a1=await f.execute(await A('P'),'work.handoff',{task_id:ip.id,to:'Q',title:'Part A',brief:'Do  A'});
 const a2=await f.execute(await A('P'),'work.handoff',{task_id:ip.id,to:'q',title:'part a',brief:'do a'});assert.equal(a2.data.child_task_id,a1.data.child_task_id);assert.equal(a2.data.duplicate,true);
 const kk1=await f.execute(await A('P'),'work.handoff',{task_id:ip.id,to:'Q',title:'Part B',handoff_key:'k-b1'});
 assert.equal((await f.execute(await A('P'),'work.handoff',{task_id:ip.id,to:'Q',title:'Part B',handoff_key:'k-b1'})).data.child_task_id,kk1.data.child_task_id);
 await assert.rejects(f.execute(await A('P'),'work.handoff',{task_id:ip.id,to:'Q',title:'Different',handoff_key:'k-b1'}),/409/);
 const [c1,c2]=await Promise.all([f.execute(await A('P'),'work.handoff',{task_id:ip.id,to:'Q',title:'Part C'}),f.execute(await A('P'),'work.handoff',{task_id:ip.id,to:'Q',title:'Part C'})]);assert.equal(c1.data.child_task_id,c2.data.child_task_id);
 // crash after the commit point at each follow-up step, then retry: one child, indexed and listed once
 for(const step of ['SADD','LRANGE','LPUSH','EVAL']){let armed=true;c.r=async(cmd)=>{if(armed&&cmd[0]===step){armed=false;throw Error('CRASH '+step);}return realR(cmd);};
  const args={task_id:ip.id,to:'Q',title:'Crash '+step,handoff_key:'crash-'+step.toLowerCase()};await assert.rejects(f.execute(await A('P'),'work.handoff',args),/CRASH/);c.r=realR;
  const rr=await f.execute(await A('P'),'work.handoff',args);assert(await f.getJ('fm:task:'+rr.data.child_task_id));
  assert((await realR(['SMEMBERS','fm:children:'+ip.id])).includes(rr.data.child_task_id));assert.equal((await realR(['LRANGE','fm:tasklist',0,59])).filter(z=>z===rr.data.child_task_id).length,1);}
 assert.equal((await f.jobDetail(ip.id)).children.length,7,'3 parts + 4 crash retries, no duplicates');
 ok('handoff retries dedupe (normalized or keyed), conflicting key -> 409, concurrent -> one child, crash mid-handoff then retry is clean');

 // ---- 4. parent completion + Stop cascade ----
 const done=await f.completeTask(await A('P'),ip.id,{result:'all done'});assert.equal(done.status,409);assert(/Waiting on parts: 7/.test(done.body.error));
 assert.equal((await f.getJ('fm:task:'+ip.id)).status,'running','parent stays open');
 ok('parent "done" blocked while children are queued');
 const qc=await f.claimTask(await A('Q'));assert(qc,'Q has a part running');
 const gk=await f.execute(await A('Q'),'work.handoff',{task_id:qc.id,to:'P',title:'Grandchild'});
 // race: stop the parent while Q tries to claim the next queued part
 const [st,claimed]=await Promise.all([f.stopTask(ip.id),f.claimTask(await A('Q'))]);assert.equal(st.status,200);
 const tree=(await f.jobDetail(ip.id)).children;assert.equal(tree.length,8);assert(tree.every(k=>k.status==='failed'),'every descendant stopped: '+tree.map(k=>k.status));
 assert(claimed==null||claimed.id===qc.id||(await f.getJ('fm:task:'+claimed.id)).status==='failed','racing claim cannot keep a stopped part');
 assert.equal(await f.claimTask(await A('Q')),null);assert.equal(await f.claimTask(await A('P')),null,'nothing in the stopped subtree is claimable');
 assert.equal((await f.completeTask(await A('Q'),qc.id,{result:'late'})).status,409);await assert.rejects(f.execute(await A('Q'),'work.handoff',{task_id:qc.id,to:'P',title:'more'}),/stopped|not yours/);
 const halts=(await realR(['LRANGE','fm:events',0,299])).map(JSON.parse).filter(e=>e.type==='blocked'&&e.taskId===qc.id);assert.equal(halts.length,1,'running part got the per-bot halt signal');
 // claim committed between flag and cascade: CAS cascade still fails it; reverse race 50x
 for(let i=0;i<25;i++){x=await f.leadTask({requestId:rq(),title:'Race '+i});const rp=x.body.task;await f.claimTask(await A('P'));await f.execute(await A('P'),'work.handoff',{task_id:rp.id,to:'Q',title:'R'+i});
  const [,cl]=await Promise.all([f.stopTask(rp.id),f.claimTask(await A('Q'))]);const kids=(await f.jobDetail(rp.id)).children;assert(kids.every(k=>k.status==='failed'),'race '+i);}
 ok('Stop cascades to all descendants (running ones halted); racing claims lose (25 races)');

 // ---- 5. more than 30 jobs: children come from the parent index ----
 x=await f.leadTask({requestId:rq(),title:'Big parent'});const bp=x.body.task;await f.claimTask(await A('P'));
 for(let i=0;i<6;i++)await f.execute(await A('P'),'work.handoff',{task_id:bp.id,to:'Q',title:'Big part '+i});
 for(let i=0;i<70;i++)await f.newTask({title:'noise '+i,assignee:'Q'});
 assert.equal((await f.listTasks()).filter(t=>t.parentId===bp.id).length,0,'children fell out of the recent list');
 assert.equal((await f.jobDetail(bp.id)).children.length,6,'all children still shown');
 ok('>30 jobs: all children still load from the parent index');
 assert.equal(fetches,0);ok('no network');
})().catch(e=>{console.error(e);process.exit(1)});
