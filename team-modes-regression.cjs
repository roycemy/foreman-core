// Solo/Team modes and owner roles (owner ask, Oct 22). Mocked LLM only.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={autoTeamTask,planTeamTask,claimTask,setJ,getJ,r,plannerSpendKey,listTasks};';
let llm=null,calls=0,last=null;const env={ALTER_PLANNER_XAI_KEY:'fixture-not-a-real-key'};
const c={require,module:{exports:{}},process:{env},global:{},console,fetch:async(u,o)=>{if(!String(u).startsWith('https://api.x.ai/'))throw Error('NO NETWORK');calls++;last=JSON.parse(o.body);return llm(last);},setTimeout,clearTimeout,URL,AbortSignal};vm.runInNewContext(src,c);const f=c.module.exports.t;
const reply=o=>({ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify(o)}}],usage:{prompt_tokens:100,completion_tokens:50}})});
const rq=()=>'req_'+Math.random().toString(36).slice(2,14),iso=ms=>new Date(Date.now()-ms).toISOString(),A=id=>({id,name:id,status:'active'});const ok=m=>console.log('PASS',m);
(async()=>{
 for(const [id,name] of [['i','Instinct'],['g','Grok Bot'],['m','Muse'],['o','Outsider']]){await f.setJ('fm:agent:'+id,{id,name,status:'active',providerId:id,lastSeen:iso(1000),pollSec:300,permissions:{},limits:{},createdAt:iso(1e6)});await f.r(['SADD','fm:agents',id]);}
 // Solo: no planner call, no spend, one part to the one bot
 const sp0=await f.r(['GET',f.plannerSpendKey()]);let x=await f.autoTeamTask({requestId:rq(),mode:'solo',title:'Research rivals then write a memo',team:['g']});
 assert.equal(x.status,200);assert.equal(calls,0,'Solo never calls the planner');assert.equal(await f.r(['GET',f.plannerSpendKey()]),sp0,'Solo spends nothing');
 assert.equal(x.body.parts.length,1);assert.equal(x.body.parts[0].assignee,'g');assert.equal(x.body.task.planMethod,'solo');assert(/The owner's task: Research rivals then write a memo/.test(x.body.parts[0].brief));
 assert.equal(await f.claimTask(A('o')),null);assert.equal(await f.claimTask(A('i')),null,'other team-able bots cannot take a Solo task');assert.equal((await f.claimTask(A('g'))).id,x.body.parts[0].id);
 assert.equal((await f.autoTeamTask({requestId:rq(),mode:'solo',title:'x',team:['g','i']})).status,400,'Solo with two bots refused server-side');
 assert.equal((await f.autoTeamTask({requestId:rq(),mode:'solo',title:'x',team:[]})).status,400);ok('Solo: one bot, one part, no planner call or spend, enforced server-side');
 // roles reach the planner prompt and are binding
 llm=()=>reply({parts:[{title:'Research rivals',instruction:'List rivals',bot:'g',role:'research',reason:'r'},{title:'Write the draft',instruction:'Write it',needs:'list',bot:'i',role:'write the draft',reason:'r'}]});
 x=await f.autoTeamTask({requestId:rq(),title:'Competitor memo',team:['g','i'],roles:{g:'research',i:'write the draft'}});
 const roster=JSON.parse(last.messages[1].content).roster;assert.equal(roster.find(b=>b.id==='g').role,'research');assert.equal(roster.find(b=>b.id==='i').role,'write the draft');assert(/binding/.test(last.messages[0].content));
 assert.equal(x.body.plan.method,'ai');assert.deepEqual(x.body.parts.map(p=>p.role),['research','write the draft']);assert(/Your role \(set by the owner\): research/.test(x.body.parts[0].brief));ok('roles reach the planner prompt; parts carry roles');
 // planner violates a role -> role-based split, picked order (i first, then g)
 llm=()=>reply({parts:[{title:'Write',instruction:'Write',bot:'g',role:'write',reason:'r'}]});
 x=await f.planTeamTask({title:'Competitor memo',team:['i','g'],roles:{i:'research',g:'write the draft'}});assert.equal(x.body.method,'basic');assert(/did not follow the role/.test(x.body.note));
 assert.deepEqual(x.body.parts.map(p=>[p.assignee,p.role]),[['i','research'],['g','write the draft']],'one part per bot in picked order');assert(/Task: Competitor memo/.test(x.body.parts[1].instruction));
 llm=()=>reply({parts:[{title:'Research',instruction:'R',bot:'i',role:'research',reason:'r'}]});x=await f.planTeamTask({title:'Competitor memo',team:['i','g'],roles:{i:'research',g:'write the draft'}});assert.equal(x.body.method,'basic');assert(/left out Grok Bot/.test(x.body.note));ok('role violation or omission -> role-based split');
 // all-roles basic split without a key: picked order
 delete env.ALTER_PLANNER_XAI_KEY;x=await f.planTeamTask({title:'Launch post',team:['m','g','i'],roles:{m:'draft the post',g:'fact-check',i:'schedule it'}});
 assert.deepEqual(x.body.parts.map(p=>p.assignee),['m','g','i']);assert.equal(x.body.parts[1].needs,'The result of part 1');ok('all-roles basic split: one part per bot, picked order, prior output');
 // partial roles: unroled bots take the steps; roled bot kept to role (no reassignment)
 x=await f.planTeamTask({title:'Draft a post then review it',team:['g','i'],roles:{g:'research'}});assert.equal(x.body.method,'basic');
 // roles are part of the request payload: same ID + different roles -> refused, no duplicate
 const id=rq();x=await f.autoTeamTask({requestId:id,title:'Launch post',team:['m','g'],roles:{m:'draft',g:'review'}});assert.equal(x.status,200);
 assert.equal((await f.autoTeamTask({requestId:id,title:'Launch post',team:['m','g'],roles:{m:'draft',g:'publish'}})).status,409);
 assert.equal((await f.autoTeamTask({requestId:id,title:'Launch post',team:['m','g'],roles:{m:'draft',g:'review'}})).body.duplicate,true);ok('roles are part of the request ID payload');
 console.log('PASS team modes: Solo enforced with no planner, roles binding, role-based fallback; mocked LLM.');
})().catch(e=>{console.error(e);process.exit(1)});
