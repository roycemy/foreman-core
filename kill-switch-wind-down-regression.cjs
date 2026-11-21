// Owner decision (Q10): the kill switch blocks NEW work and actions, but lets running jobs wind down honestly: completion, failure and
// event reports still go through. Blocked while the switch is on: claiming, acting, chat tasks, presence, advancing a plan to its next
// part, and waking a bot about any job. After the switch is turned off the plan resumes. Real handler, offline; wake pings are observed
// through a fetch spy (a Slack webhook configured for Grok bots).
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={r,setJ,getJ,als,createAgent,newTask,sha};';
const pings=[];const ctx={require,module:{exports:{}},process:{env:{WAKE_GROK_SLACK_WEBHOOK:'https://hooks.slack.test/services/T/B/x'}},global:{},console:{...console,log(){},warn(){},error(){}},
 fetch:async u=>{pings.push(String(u));return {ok:true,status:200,json:async()=>({})};},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const h=ctx.module.exports,f=h.t;
async function http(method,url,{key,cookie,body}={}){let out;const headers={host:'localhost',origin:'http://localhost'};if(key)headers.authorization='Bearer '+key;if(cookie)headers.cookie='fm_sess='+cookie;
 const res={setHeader(){},status(c){this.code=c;return this},json(j){out={code:this.code||200,j}},send(b){out={code:this.code||200,j:b}},end(){out={code:this.code||204}}};await h({method,url,headers,body:body||{}},res);return out||{code:0};}
(async()=>{
 const email='k@o.example',ws='ws_kill';await f.setJ('gl:user:'+f.sha(email),{id:'u',email,ws});await f.setJ('gl:sess:'+f.sha('ck'),{uid:'u',email,ws});const inW=fn=>f.als.run({ws},fn);
 const bot=await inW(()=>f.createAgent('Wind-down bot','Ops','grok',false,{preset:'trusted'}));const K={key:bot.key};
 const kill=on=>http('POST','/api/kill',{cookie:'ck',body:{on}});
 // ---- a plan of two parts; part 1 is running when the owner pulls the switch
 const plan=await http('POST','/api/tasks',{cookie:'ck',body:{title:'Two-part plan',orchestrate:true,parts:[{title:'Part one',assignee:bot.agent.id},{title:'Part two',assignee:bot.agent.id}]}});assert.equal(plan.code,200,JSON.stringify(plan.j).slice(0,160));
 const claim1=await http('GET','/api/gateway/tasks/next',K);assert.equal(claim1.j.task&&claim1.j.task.title,'Part one','part one is claimed and running');const p1=claim1.j.task.id;
 const loose=await inW(()=>f.newTask({title:'Loose running job',assignee:bot.agent.id}));
 assert.equal((await kill(true)).code,200);const base=pings.length;
 // blocked while the switch is on
 assert.equal((await http('GET','/api/gateway/tasks/next',K)).j.task,null,'no new job is claimed');
 {const a=await http('POST','/api/gateway/act',{...K,body:{action:'web.fetch',params:{url:'https://example.com'},task_id:p1}});assert.deepEqual([a.code,a.j.code],[403,'killed'],'no action runs');}
 assert.equal((await http('POST','/api/gateway/chat-task',{...K,body:{title:'New',brief:'x',source_id:'s1'}})).code,403,'no new chat job');
 assert.equal((await http('POST','/api/gateway/presence',{...K,body:{}})).code,403,'no presence');
 // wind-down is allowed: reports and completion, failure included
 assert.equal((await http('POST','/api/gateway/events',{...K,body:{kind:'TASK_STARTED',text:'still working',task_id:p1}})).code,200,'an event report still goes through');
 assert.equal((await http('POST','/api/gateway/tasks/'+p1+'/complete',{...K,body:{result:'Part one finished while the switch was on'}})).code,200,'completion still goes through');
 assert.equal((await inW(()=>f.getJ('fm:task:'+p1))).status,'done');
 // ...but finishing part one does NOT start part two or wake anyone
 const parts=await inW(async()=>{const p=await f.getJ('fm:task:'+plan.j.task.id);return Promise.all(p.partIds.map(id=>f.getJ('fm:task:'+id)));});
 assert.equal(parts[1].status,'waiting','part two is not queued while the switch is on');assert.equal(pings.length,base,'no wake ping went out while the switch was on');
 // an owner-created job during the switch does not wake the bot either
 assert.equal((await http('POST','/api/tasks',{cookie:'ck',body:{title:'Owner job during kill',assignee:bot.agent.id}})).code,200);assert.equal(pings.length,base,'no wake ping for a job created during the switch');
 // failure report for the loose job
 assert.equal((await http('POST','/api/gateway/tasks/'+loose.id+'/complete',{...K,body:{status:'failed',result:'Stopped by the owner kill switch'}})).code,200,'a failure report still goes through');
 assert.equal((await inW(()=>f.getJ('fm:task:'+loose.id))).status,'failed');
 // ---- switched off: the plan resumes
 assert.equal((await kill(false)).code,200);
 const next=await http('GET','/api/gateway/tasks/next',K);assert.ok(next.j.task,'after the switch is off the bot can claim again');
 const titles=[next.j.task.title];assert.ok(titles.includes('Part two')||titles.includes('Owner job during kill'),'queued work resumes ('+titles+')');
 const after=await inW(async()=>{const p=await f.getJ('fm:task:'+plan.j.task.id);return Promise.all(p.partIds.map(id=>f.getJ('fm:task:'+id)));});
 assert.notEqual(after[1].status,'waiting','part two is queued once the switch is off');
 console.log('PASS kill switch wind-down: with the switch on, claiming, acting, chat tasks and presence are blocked and a finished part does not queue the next part or wake a bot; event reports, completion and failure still go through; switching off resumes the plan');
})().catch(e=>{console.error(e);process.exit(1)});
