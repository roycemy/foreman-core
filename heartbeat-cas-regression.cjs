async function suite0(){
const fs=require('fs'),vm=require('vm'),assert=require('assert');
let src=fs.readFileSync(require('path').join(__dirname,'api/index.js'),'utf8');
src=src.replace('async function r(cmd0) {',`let hook=null;async function r(cmd0) {if(hook && cmd0[0]==='SET' && cmd0[1]==='fm:seen:a'){let h=hook;hook=null;await h();}`);
src+='\nmodule.exports.t={touchAgent,reportEvent,gatewayAct,getJ,setJ,r,updateAgent,listAgents,als,mem,AGENT_CAS,setHook:f=>hook=f};';
const ctx={require,module:{exports:{}},process:{env:{}},global:{},console,fetch:()=>{throw Error('NETWORK FORBIDDEN')},setTimeout,clearTimeout,URL,AbortSignal};vm.runInNewContext(src,ctx);const f=ctx.module.exports.t;
const base=()=>({id:'a',name:'test',createdAt:'2026-10-07',status:'active',lastSeen:null,permissions:{'notes.write':'AUTO'},limits:{perActionCents:10,dailyCents:50}});
await (async()=>{
 for(const name of ['touchAgent','reportEvent','gatewayAct']){
  const a=base();await f.setJ('fm:agent:a',a);f.setHook(()=>f.updateAgent('a',x=>{x.status='revoked';x.permissions['notes.write']='NEVER';x.limits.dailyCents=0;}));
  if(name==='touchAgent')await f.touchAgent(a);if(name==='reportEvent')await f.reportEvent(a,{kind:'TOOL_USED'});if(name==='gatewayAct')await f.gatewayAct(a,{action:'notes.write',params:{title:'test'}});
  let b=await f.getJ('fm:agent:a');assert.equal(b.status,'revoked');assert.equal(b.permissions['notes.write'],'NEVER');assert.equal(b.limits.dailyCents,0);console.log('PASS policy preserved:',name);
 }
 await f.setJ('fm:agent:a',base());
 await Promise.all([f.updateAgent('a',x=>{x.permissions['notes.write']='NEVER';}),f.updateAgent('a',x=>{x.limits.dailyCents=0;})]);
 let a=await f.getJ('fm:agent:a');assert.equal(a.permissions['notes.write'],'NEVER');assert.equal(a.limits.dailyCents,0);assert.equal(a.policyRevision,2);console.log('PASS concurrent independent policy edits retry');
 await f.r(['SADD','fm:agents','a']);await f.touchAgent(a);let read=(await f.listAgents())[0];assert(read.lastSeen);assert.equal((await f.getJ('fm:agent:a')).lastSeen,null);console.log('PASS seen merged only in presentation');
 await f.updateAgent('a',x=>{x.status='revoked';});await f.r(['DEL','fm:seen:a']);await f.touchAgent(base());assert.equal(await f.r(['GET','fm:seen:a']),null);console.log('PASS revoked late heartbeat ignored');
 await f.r(['DEL','fm:agent:a']);await f.touchAgent(base());assert.equal(await f.getJ('fm:agent:a'),null);assert.equal(await f.updateAgent('a',x=>{x.status='active';}),null);console.log('PASS missing worker not recreated');
 await f.als.run({ws:'one'},async()=>{await f.setJ('fm:agent:a',base());await f.updateAgent('a',x=>{x.status='revoked';});await f.touchAgent(base());});
 await f.als.run({ws:'two'},async()=>{await f.setJ('fm:agent:a',base());await f.touchAgent(base());assert.equal((await f.getJ('fm:agent:a')).status,'active');assert(await f.r(['GET','fm:seen:a']));});
 assert.equal(JSON.parse(f.mem.kv.get('w:one:fm:agent:a')).status,'revoked');assert.equal(JSON.parse(f.mem.kv.get('w:two:fm:agent:a')).status,'active');console.log('PASS workspace CAS/seen isolation');
 const policy=base();const raw=JSON.stringify(policy);await f.setJ('fm:agent:a',policy);await f.updateAgent('a',x=>{x.status='revoked';});assert.equal(await f.r(['EVAL',f.AGENT_CAS,1,'fm:agent:a',raw,raw]),0);console.log('PASS stale CAS rejected');
 console.log('No external calls. Admission semantics intentionally NOT verified by this patch.');
})();

}
async function suite1(){
const fs=require('fs'),vm=require('vm'),assert=require('assert');let src=fs.readFileSync(require('path').join(__dirname,'api/index.js'),'utf8');
src=src.replace('async function r(cmd0) {',`let onRevokeEvent=null;async function r(cmd0){if(cmd0[0]==='LPUSH'&&cmd0[1]==='fm:events'&&String(cmd0[2]).includes('Owner revoked')&&onRevokeEvent)await onRevokeEvent();`);
src+='\nmodule.exports.t={routes,r,setJ,getJ,fullState,setHook:f=>onRevokeEvent=f};';const ctx={require,module:{exports:{}},process:{env:{}},global:{},console,fetch:()=>{throw Error('NO NETWORK')},setTimeout,clearTimeout,URL,AbortSignal};vm.runInNewContext(src,ctx);let f=ctx.module.exports.t;
async function call(op,body={}){let out;const res={status(n){this.code=n;return this},json(j){out={code:this.code||200,j};return out}};await f.routes({method:'POST',headers:{host:'localhost'}},res,'/agents/a/'+op,body,null);return out;}
await (async()=>{await f.setJ('fm:agent:a',{id:'a',name:'test',status:'active',permissions:{},limits:{},createdAt:'2026-10-07'});await f.r(['SADD','fm:agents','a']);
 f.setHook(async()=>{assert.equal((await f.getJ('fm:agent:a')).status,'revoked');});assert.equal((await call('revoke')).code,200);console.log('PASS revoke persisted before event/cancellation');
 await Promise.all([call('permissions',{action:'notes.write',mode:'NEVER'}),call('limits',{perActionCents:0,dailyCents:0})]);let a=await f.getJ('fm:agent:a');assert.equal(a.status,'revoked');assert.equal(a.permissions['notes.write'],'NEVER');assert.equal(a.limits.dailyCents,0);console.log('PASS owner routes preserve concurrent policy edits');
 assert.equal((await call('permissions',{action:'notes.write',mode:'INVALID'})).code,400);assert.equal((await call('restore')).j.agent.status,'active');assert.equal((await call('remove')).code,200);assert.equal((await f.getJ('fm:agent:a')).status,'revoked');assert(!(await f.r(['SMEMBERS','fm:agents'])).includes('a'));console.log('PASS invalid permission, explicit restore, remove');
 console.log('Local route tests only.');})();

}
async function suite2(){
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(require('path').join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.test={chatTask,taskForAgent,completeTask,reportEvent,setJ,getJ,r,execute,fullState,policy,mem};';
const ctx={require,module:{exports:{}},process:{env:{}},global:{},console,fetch:()=>{throw Error('NO NETWORK')},setTimeout,clearTimeout,URL,AbortSignal};vm.runInNewContext(src,ctx);const f=ctx.module.exports.test;
await (async()=>{const a={id:'a',name:'Instinct',status:'active',permissions:{'work.handoff':'AUTO'},limits:{}},b={id:'b',name:'External worker',status:'active',permissions:{},limits:{}};await f.setJ('fm:agent:a',a);await f.setJ('fm:agent:b',b);await f.r(['SADD','fm:agents','a']);await f.r(['SADD','fm:agents','b']);
let j=await f.chatTask(a,{source_id:'owner-message-1',title:'Real chat task'});assert.equal(j.body.task.status,'running');const id=j.body.task.id;
const doubles=await Promise.all(Array.from({length:8},()=>f.chatTask(a,{source_id:'owner-message-2',title:'Concurrent'})));assert.equal(new Set(doubles.map(x=>x.body.task.id)).size,1);assert.equal((await f.r(['LRANGE','fm:tasklist',0,99])).filter(x=>x===doubles[0].body.task.id).length,1);
assert((await f.chatTask(a,{source_id:'owner-message-1',title:'duplicate'})).body.duplicate);assert.equal((await f.chatTask(a,{title:'missing'})).status,400);
assert.equal((await f.reportEvent(b,{kind:'TOOL_USED',task_id:id,text:'Wrong task'})).status,404);
let ho=await f.execute(a,'work.handoff',{task_id:id,to:'b',brief:'Output-only zero-cost task'});let child=ho.data.child_task_id;assert.equal((await f.taskForAgent(a,child)).assignee,'b');assert.equal(await f.taskForAgent(b,id),null);
let done=await f.completeTask(b,child,{result:'Actual result'});assert.equal(done.body.task.status,'done');assert.equal((await f.taskForAgent(a,child)).result,'Actual result');assert.equal((await f.completeTask(b,child,{result:'overwrite'})).status,409);
assert.equal((await f.chatTask({...a,status:'revoked'},{source_id:'x',title:'blocked'})).status,403);await f.r(['SET','fm:kill','1']);assert.equal((await f.chatTask(a,{source_id:'x',title:'blocked'})).status,403);
console.log('PASS chat ingress, concurrent idempotency, presence, association, handoff/result, terminal protection, revoke/kill. No hosted calls.');
})();

}
async function suite3(){
const fs=require('fs'),vm=require('vm'),assert=require('assert');const src=fs.readFileSync(require('path').join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.f={r,setJ,sha};';const ctx={require,module:{exports:{}},process:{env:{}},global:{},console,fetch:()=>{throw Error('NO NETWORK')},setTimeout,clearTimeout,URL,AbortSignal};vm.runInNewContext(src,ctx);const h=ctx.module.exports,f=h.f;
async function call(path,method,body,key){let out;const res={code:200,setHeader(){return this},status(n){this.code=n;return this},json(v){out={code:this.code,json:v};return out},end(){out={code:this.code};return out}};await h({url:'/api'+path,method,body,headers:{host:'localhost',authorization:'Bearer '+key}},res);return out}
await (async()=>{const key='LOCAL_TEST_KEY',id='local';await f.setJ('fm:agent:'+id,{id,name:'Test',status:'active',permissions:{},limits:{}});await f.r(['SET','fm:key:'+f.sha(key),id]);
// resolveAgent uses its global index; bootstrap through the same mapping.
await f.r(['SET','gl:key:'+f.sha(key),'legacy']);
let p=await call('/gateway/chat-task','POST',{source_id:'message-1',title:'Real task'},key);console.log(p);assert.equal(p.code,200);let task=p.json.task;
assert.equal((await call('/gateway/tasks/'+task.id,'GET',{},key)).code,200);assert.equal((await call('/gateway/presence','POST',{},key)).code,200);assert.equal((await call('/gateway/events','POST',{kind:'TOOL_USED',text:'Drafting',task_id:task.id},key)).code,200);assert.equal((await call('/gateway/tasks/'+task.id+'/complete','POST',{result:'Finished result'},key)).code,200);assert.equal((await call('/gateway/chat-task','POST',{source_id:'x',title:'Unauthorized'},'wrong')).code,401);console.log('PASS authenticated HTTP adapter routes');})();

}
(async()=>{await suite0();await suite1();await suite2();await suite3();})().catch(e=>{console.error(e);process.exit(1)});
