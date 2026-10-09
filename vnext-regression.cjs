// vNext owner endpoints: assign an unassigned job, pause a bot, job detail timeline, reported model costs.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(require('path').join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={routes,r,setJ,getJ,als,sha,createAgent,newTask};';
const ctx={require,module:{exports:{}},process:{env:{}},global:{},console,fetch:()=>{throw Error('NO NETWORK')},setTimeout,clearTimeout,URL,AbortSignal};vm.runInNewContext(src,ctx);const f=ctx.module.exports.t;
const H={host:'localhost',origin:'http://localhost'};
async function call(method,path,body,agent){let out;const res={status(n){this.code=n;return this},json(j){out={code:this.code||200,j};return out},setHeader(){},end(){out={code:this.code||204};return out}};await f.routes({method,headers:H,url:'/api'+path},res,path,body||{},agent||null);return out;}
const gw=(agent,method,path,body)=>call(method,'/gateway'+path,body,agent);
(async()=>{await f.als.run({ws:'vnexttest'},async()=>{
 const {agent:bot}=await f.createAgent('Bot','Ops','custom',false,{preset:'balanced'});
 const {agent:other}=await f.createAgent('Other','Ops','custom',false,{preset:'balanced'});
 // assign: only unassigned queued jobs, only active unpaused bots, origin-checked
 const t=await f.newTask({title:'Draft launch email'});
 assert.equal((await call('POST','/tasks/'+t.id+'/assign',{assignee:'nope'})).code,400);
 const a1=await call('POST','/tasks/'+t.id+'/assign',{assignee:bot.id});assert.equal(a1.code,200);assert.equal(a1.j.task.assignee,bot.id);assert.equal(a1.j.task.status,'queued');
 assert.equal((await call('POST','/tasks/'+t.id+'/assign',{assignee:other.id})).code,409);
 {let out;const res={status(n){this.code=n;return this},json(j){out={code:this.code};return out}};await f.routes({method:'POST',headers:{host:'localhost',origin:'https://evil.example'}},res,'/tasks/'+t.id+'/assign',{assignee:bot.id},null);assert.equal(out.code,403);}
 console.log('PASS assign: unassigned only, active bot only, no double assign, origin checked');
 // pause: blocks claims and actions, keeps everything, resume restores; revoke-free (no epoch change)
 const epoch=(await f.getJ('fm:agent:'+bot.id)).oauthEpoch||0;
 assert.equal((await call('POST','/agents/'+bot.id+'/pause',{on:true})).code,200);
 let live=await f.getJ('fm:agent:'+bot.id);assert.equal(live.paused,true);assert.equal(live.status,'active');assert.equal(live.oauthEpoch||0,epoch);
 assert.equal((await gw(live,'GET','/tasks/next')).j.task,null);
 const blocked=await gw(live,'POST','/act',{action:'web.fetch',params:{url:'https://example.com'}});assert.equal(blocked.code,403);assert.equal(blocked.j.code,'paused');
 const t2=await f.newTask({title:'Other job'});assert.equal((await call('POST','/tasks/'+t2.id+'/assign',{assignee:bot.id})).code,409);
 assert.equal((await call('POST','/agents/'+bot.id+'/pause',{on:false})).code,200);live=await f.getJ('fm:agent:'+bot.id);assert.equal(live.paused,undefined);
 const claimed=await gw(live,'GET','/tasks/next');assert.equal(claimed.j.task.id,t.id);assert.equal(claimed.j.task.status,'running');
 console.log('PASS pause: blocks claims and actions, no reconnect needed, resume restores');
 // model costs: bot-reported only, validated, accumulated; never invented
 assert.equal((await gw(live,'POST','/events',{kind:'TOOL_USED',text:'Drafted',task_id:t.id,model_cost_usd:0.12})).code,200);
 assert.equal((await gw(live,'POST','/events',{kind:'TOOL_USED',text:'Bad',task_id:t.id,model_cost_usd:-5})).code,200);
 assert.equal((await gw(live,'POST','/events',{kind:'TOOL_USED',text:'Bad',task_id:t.id,model_cost_usd:'abc'})).code,200);
 const ask=await gw(live,'POST','/act',{action:'notes.write',params:{title:'Draft'},task_id:t.id});assert.equal(ask.j.status,'pending');
 assert.equal((await call('POST','/requests/'+ask.j.request_id+'/approve')).code,200);
 assert.equal((await gw(live,'POST','/tasks/'+t.id+'/complete',{result:'Done',model_cost_usd:0.3})).code,200);
 let done=await f.getJ('fm:task:'+t.id);assert.equal(done.modelCostUsd,0.42);assert.equal(done.modelCostSource,'bot');
 const u=await f.newTask({title:'No cost',assignee:other.id});const lo=await f.getJ('fm:agent:'+other.id);await gw(lo,'GET','/tasks/next');await gw(lo,'POST','/tasks/'+u.id+'/complete',{result:'ok'});assert.equal((await f.getJ('fm:task:'+u.id)).modelCostUsd,undefined);
 console.log('PASS model costs: reported only, validated, summed; absent when not reported');
 // job detail: timeline in plain language with the owner approval
 const d=await call('GET','/jobs/'+t.id);assert.equal(d.code,200);const texts=d.j.timeline.map(x=>x.text);
 assert.equal(texts[0],'Owner assigned the job');assert.ok(texts.includes('Bot took the job'));assert.ok(d.j.timeline.some(x=>x.kind==='approval'&&/^Owner approved: save a note/.test(x.text)));assert.equal(texts[texts.length-1],'Delivered');
 assert.equal(d.j.requests.length,1);assert.equal((await call('GET','/jobs/task_missing')).code,404);
 console.log('PASS job detail: timeline, linked approvals, 404 for unknown');
});
await f.als.run({ws:'elsewhere'},async()=>{assert.equal((await call('GET','/jobs/x')).code,404);});
console.log('PASS workspace isolation. ZERO network calls.');
})().catch(e=>{console.error(e);process.exit(1)});
