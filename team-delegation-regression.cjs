// Team picker + smart delegation (owner ask, Oct 21). Mocked LLM only: the context's fetch is a fixture,
// any other network call throws. Covers the planner, every fallback, server-side team enforcement,
// the all-asleep wait, the spend cap and "no task writes before Start".
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={planTeamTask,autoTeamTask,cancelPendingParts,createTaskParts,refreshTaskParent,claimTask,completeTask,reassignTask,listTasks,setJ,getJ,r,plannerSpendKey,plannerCapMicro};';
let llm=null,calls=0,lastReq=null;const env={};
const fetchMock=async(url,opts)=>{if(!String(url).startsWith('https://api.x.ai/'))throw Error('NO NETWORK: '+url);calls++;lastReq=JSON.parse(opts.body);assert(!opts.body.includes('fixture-not-a-real-key'),'key never sent in body');return llm(lastReq,opts);};
const reply=(obj,usage)=>({ok:true,status:200,json:async()=>({choices:[{message:{content:typeof obj==='string'?obj:JSON.stringify(obj)}}],usage:usage||{prompt_tokens:300,completion_tokens:120}})});
const logs=[];const con={log:(...a)=>logs.push(a.join(' ')),error:(...a)=>logs.push(a.join(' ')),warn:(...a)=>logs.push(a.join(' '))};
const c={require,module:{exports:{}},process:{env},global:{},console:con,fetch:fetchMock,setTimeout,clearTimeout,URL,AbortSignal};vm.runInNewContext(src,c);const f=c.module.exports.t;
const ok=(m,...a)=>{console.log('PASS',m)};
(async()=>{
 const iso=ms=>new Date(Date.now()-ms).toISOString();
 const bots={i:{id:'i',name:'Instinct',providerId:'instinct',lastSeen:iso(1000),pollSec:300},g:{id:'g',name:'Grok Bot',providerId:'grok',lastSeen:iso(1000),pollSec:300},m:{id:'m',name:'Muse',providerId:'muse',lastSeen:iso(3600e3),pollSec:300},o:{id:'o',name:'Outsider',providerId:'other',lastSeen:iso(1000),pollSec:300},h:{id:'h',name:'Hosted',providerId:'grok',hosted:true,lastSeen:iso(1000)}};
 for(const [k,a] of Object.entries(bots)){await f.setJ('fm:agent:'+k,{status:'active',permissions:{},limits:{},createdAt:iso(1e6-k.charCodeAt(0)),...a});await f.r(['SADD','fm:agents',k]);}
 const taskKeys=async()=>(await f.listTasks()).length;
 // 1. no key -> basic split, visible, no network, no writes
 let p=await f.planTeamTask({title:'Research three competitors then write a memo',team:['i','g']});
 assert.equal(p.status,200);assert.equal(p.body.method,'basic');assert(/Basic split: No planner key/.test(p.body.note));assert.equal(p.body.parts.length,2);assert.equal(calls,0);assert.equal(await taskKeys(),0,'no writes before Start');ok('no key -> basic split note, no network');
 env.ALTER_PLANNER_XAI_KEY='fixture-not-a-real-key';
 // 2. single part
 llm=()=>reply({parts:[{title:'Write the launch email',instruction:'Write a 120-word launch email',needs:'Nothing',bot:'g',reason:'Awake, no load'}]});
 p=await f.planTeamTask({title:'Write the launch email',team:['i','g']});
 assert.equal(p.body.method,'ai');assert.equal(p.body.parts.length,1);assert.equal(p.body.parts[0].assignee,'g');assert.equal(p.body.summary,'Grok Bot writes');assert.equal(calls,1,'one call per task');
 assert(lastReq.max_tokens<=450&&lastReq.model&&!JSON.stringify(lastReq).includes('Outsider'),'capped output, team-only roster');assert.equal(await taskKeys(),0);ok('single part, one call, capped, roster = picked team only');
 // 3. multi-part + same bot twice -> Start -> sequential, real prior output
 llm=()=>reply({parts:[{title:'Research three competitors',instruction:'Find 3 competitors with pricing',needs:'Nothing',bot:'i',reason:'Least load'},{title:'Write a memo',instruction:'Write a one-page memo',needs:'The competitor list',bot:'i',reason:'Same context'}]});
 p=await f.planTeamTask({title:'Research three competitors then write a memo',team:['i','g']});
 assert.equal(p.body.parts.length,2);assert(p.body.parts.every(x=>x.assignee==='i'));assert.equal(p.body.summary,'Instinct researches, then Instinct writes');assert.equal(await taskKeys(),0,'still nothing written');
 let out=await f.createTaskParts({title:'Research three competitors then write a memo',team:['i','g'],planMethod:'ai',parts:p.body.parts});assert.equal(out.status,200,JSON.stringify(out.body));
 const [c1,c2]=out.body.parts;assert.deepEqual(out.body.task.team,['i','g']);assert.equal(c1.status,'queued');assert.equal(c2.status,'waiting');assert(c1.brief.includes('Find 3 competitors'));
 // 4. outsider cannot claim a team part, even unassigned-looking ones
 assert.equal(await f.claimTask({...bots.o,status:'active'}),null,'outsider gets nothing');
 const raw=await f.getJ('fm:task:'+c1.id);await f.setJ('fm:task:'+c1.id,{...raw,assignee:null});assert.equal(await f.claimTask({...bots.o,status:'active'}),null,'outsider cannot take an unassigned team part');await f.setJ('fm:task:'+c1.id,raw);
 let cl=await f.claimTask({...bots.i,status:'active'});assert.equal(cl.id,c1.id);await f.completeTask({...bots.i,status:'active'},c1.id,{result:'REAL: Acme, Beta, Gamma'});
 const n2=await f.getJ('fm:task:'+c2.id);assert.equal(n2.status,'queued');assert(n2.context.includes('REAL: Acme, Beta, Gamma'));cl=await f.claimTask({...bots.i,status:'active'});assert.equal(cl.id,c2.id,'same bot does part 2');await f.completeTask({...bots.i,status:'active'},c2.id,{result:'REAL memo'});
 const par=await f.getJ('fm:task:'+out.body.task.id);assert.equal(par.status,'done');assert(par.result.includes('REAL: Acme')&&par.result.includes('REAL memo'));ok('multi-part, same bot twice, sequential with real prior output, outsider cannot claim');
 // 5. only picked bots: AI picks outsider -> fallback; server rejects outsider at Start; owner reassign blocked
 llm=()=>reply({parts:[{title:'Do it',instruction:'Do it',needs:'Nothing',bot:'o',reason:'x'}]});
 p=await f.planTeamTask({title:'Summarize the notes',team:['i']});assert.equal(p.body.method,'basic');assert(/outside your team/.test(p.body.note));assert(p.body.parts.every(x=>x.assignee==='i'));
 out=await f.createTaskParts({title:'x',team:['i'],parts:[{title:'x',assignee:'o'}]});assert.equal(out.status,400);
 out=await f.createTaskParts({title:'x',team:['i','h'],parts:[{title:'x',assignee:'h'}]});assert.equal(out.status,400,'hosted/paid bot is never a team member');
 out=await f.createTaskParts({title:'Solo',team:['g'],parts:[{title:'Solo part',assignee:'g'}]});assert.equal(out.status,200);
 const rq=await f.reassignTask(out.body.parts[0].id,{confirmed:true,expectedAssignee:'g',expectedStatus:'queued',assignee:'o'});assert.equal(rq.status,400,'owner reassign stays inside the team');ok('only picked bots enforced: planner, Start, reassign');
 // 6. asleep teammate: AI picks Muse (asleep) while Grok awake -> moved; asleep fallback never leaves team
 llm=()=>reply({parts:[{title:'Draft a post',instruction:'Draft it',needs:'Nothing',bot:'m',reason:'creative'}]});
 p=await f.planTeamTask({title:'Draft a post',team:['m','g']});assert.equal(p.body.parts[0].assignee,'g');assert(/Muse is asleep/.test(p.body.parts[0].reason));
 out=await f.createTaskParts({title:'Asleep fb',team:['m'],parts:[{title:'Draft',assignee:'m'}]});const ap=out.body.parts[0];
 const old=await f.getJ('fm:task:'+ap.id);await f.setJ('fm:task:'+ap.id,{...old,assignedAt:iso(3600e3)});
 assert.equal(await f.claimTask({...bots.o,status:'active'}),null);assert.equal((await f.getJ('fm:task:'+ap.id)).assignee,'m','PR97 fallback never moves a team part to an outsider');out=await f.createTaskParts({title:'Asleep fb2',team:['m','g'],parts:[{title:'Draft2',assignee:'m'}]});const ap2=out.body.parts[0];const o2=await f.getJ('fm:task:'+ap2.id);await f.setJ('fm:task:'+ap2.id,{...o2,assignedAt:iso(3600e3)});
 assert.equal(await f.claimTask({...bots.o,status:'active'}),null);assert.equal((await f.getJ('fm:task:'+ap2.id)).assignee,'g','asleep teammate -> awake teammate, never the outsider');
 ok('asleep bot excluded from picks; asleep fallback stays in team');
 // 7. whole team asleep -> waits, flagged, assigned inside team
 p=await f.planTeamTask({title:'Draft a post',team:['m']});assert.equal(p.body.allTeamAsleep,true);assert(/wait until a teammate/.test(p.body.waitNote));assert.equal(p.body.parts[0].assignee,'m');ok('all-team-asleep waits, no outsider');
 // 8. AI failure / timeout / malformed / >4 parts
 llm=()=>({ok:false,status:500,json:async()=>({})});p=await f.planTeamTask({title:'Write a memo',team:['i']});assert.equal(p.body.method,'basic');assert(/HTTP 500/.test(p.body.note));
 llm=()=>{const e=new Error('t');e.name='TimeoutError';throw e;};p=await f.planTeamTask({title:'Write a memo',team:['i']});assert(/timed out/.test(p.body.note));
 llm=()=>reply('not json {');p=await f.planTeamTask({title:'Write a memo',team:['i']});assert(/unreadable/.test(p.body.note));
 llm=()=>reply({parts:[{title:'',instruction:'x',bot:'i'}]});p=await f.planTeamTask({title:'Write a memo',team:['i']});assert.equal(p.body.method,'basic');
 llm=()=>reply({parts:[1,2,3,4,5].map(n=>({title:'P'+n,instruction:'x',bot:'i',reason:'r'}))});p=await f.planTeamTask({title:'a; b; c; d; e',team:['i']});assert.equal(p.body.method,'basic');assert(/returned 5 parts/.test(p.body.note));assert.equal(p.body.parts.length,1);assert(/Found 5 steps/.test(p.body.note),'no silent truncation');ok('AI failure, timeout, malformed, >4 parts -> visible basic split');
 // 9. spend cap reached -> fallback, no call
 await f.r(['SET',f.plannerSpendKey(),String(f.plannerCapMicro())]);const before=calls;p=await f.planTeamTask({title:'Write a memo',team:['i']});assert.equal(calls,before,'no call over the cap');assert(/spend cap/.test(p.body.note));ok('spend cap -> fallback, no call');
 // 10. racing chip taps: concurrent plans with different teams never write tasks and each respects its own team
 await f.r(['SET',f.plannerSpendKey(),'0']);llm=(req)=>{const ids=JSON.parse(req.messages[1].content).roster.map(x=>x.id);return reply({parts:[{title:'Write',instruction:'Write',bot:ids[ids.length-1],reason:'r'}]});};
 const n0=await taskKeys();const rs=await Promise.all([['i'],['i','g'],['g'],['g','o'].slice(0,1)].map(team=>f.planTeamTask({title:'Write a memo',team})));
 rs.forEach((x,k)=>assert(x.body.parts.every(p=>[['i'],['i','g'],['g'],['g']][k].includes(p.assignee))));assert.equal(await taskKeys(),n0,'racing plans write nothing');
 assert.equal((await f.planTeamTask({title:'x',team:[]})).status,400,'empty team cannot plan');ok('racing plans isolated, no writes; empty team refused');
// 11. auto plan router: submit = plan + start in one request
 llm=()=>reply({parts:[{title:'Research rivals',instruction:'List 3 rivals',needs:'Nothing',bot:'i',reason:'Awake, least load'},{title:'Write memo',instruction:'Write it',needs:'Rival list',bot:'g',reason:'Writer'}]});
 let n1=await taskKeys();let au=await f.autoTeamTask({requestId:'req_'+Math.random().toString(36).slice(2,12),title:'Research rivals then write memo',team:['i','g']});assert.equal(au.status,200);assert.equal(au.body.plan.method,'ai');assert.equal(au.body.parts.length,2);assert.equal(au.body.parts[0].status,'queued');assert.equal(au.body.parts[0].routingReason,'Awake, least load');assert.equal(await taskKeys(),n1+3,'one submit = one plan write (parent + parts), started');
 // cancel not-yet-started parts while part 1 runs: running part untouched, waiting part cancelled
 cl=await f.claimTask({...bots.i,status:'active'});assert.equal(cl.id,au.body.parts[0].id);let cx=await f.cancelPendingParts(au.body.task.id);assert.equal(cx.status,200);assert.equal(cx.body.cancelled,1);
 assert.equal((await f.getJ('fm:task:'+au.body.parts[0].id)).status,'running');assert.equal((await f.getJ('fm:task:'+au.body.parts[1].id)).result,'Cancelled by owner before it started.');
 await f.completeTask({...bots.i,status:'active'},cl.id,{result:'REAL rivals'});assert.equal((await f.getJ('fm:task:'+au.body.task.id)).status,'failed','plan ends honestly as not fully done');
 // cancel with nothing running: queued part 1 cancelled, plan ends, nobody can claim it
 au=await f.autoTeamTask({requestId:'req_'+Math.random().toString(36).slice(2,12),title:'Write a memo',team:['i']});cx=await f.cancelPendingParts(au.body.task.id);assert.equal(cx.body.cancelled,1);assert.equal(cx.body.task.status,'failed');assert.equal(await f.claimTask({...bots.i,status:'active'}),null);
 // basic split + all asleep through the auto router: queued on the team, waiting, visible notes
 delete env.ALTER_PLANNER_XAI_KEY;au=await f.autoTeamTask({requestId:'req_'+Math.random().toString(36).slice(2,12),title:'Draft a post then review it',team:['m']});assert.equal(au.status,200);assert.equal(au.body.plan.method,'basic');assert(/Basic split/.test(au.body.task.planNote));assert(/wait until a teammate/.test(au.body.task.waitNote));assert(au.body.parts.every(x=>x.assignee==='m'));assert.equal(au.body.parts[0].status,'queued');
 assert.equal(await f.claimTask({...bots.o,status:'active'}),null,'outsider never takes the waiting team part');
 assert.equal((await f.autoTeamTask({requestId:'req_'+Math.random().toString(36).slice(2,12),title:'x',team:[]})).status,400,'no team, no task');assert.equal((await f.autoTeamTask({requestId:'req_'+Math.random().toString(36).slice(2,12),title:'x',team:['o2']})).status,400);
 ok('auto router: one-request start, reasons stored, cancel not-started parts, basic split + all-asleep waiting');
 assert(!logs.join('\n').includes('fixture-not-a-real-key'),'key never logged');
 console.log('PASS team delegation: planner, fallbacks, team enforcement, asleep wait, spend cap, no writes from planning, auto router; mocked LLM, no network.');
})().catch(e=>{console.error(e);process.exit(1)});
