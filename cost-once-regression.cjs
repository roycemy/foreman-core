// Item B: the 2c cost of an approved note is recorded once per request, even when the function dies between recording the cost and
// writing the receipt and the save is then recovered (once, repeatedly or concurrently). The counters are an internal ledger, not money,
// but they gate: policy() blocks at limits.dailyCents and jobPolicy blocks at the job grant's budgetCents. Existing callers keep their
// behavior: approval charges once, the AUTO path (no request id) charges every call as before. Fault injection freezes one store call
// the way a killed function stops. Real handler, offline.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={r,setJ,getJ,als,createAgent,newTask,sha,bust,noteIdFor:typeof noteIdFor===\'function\'?noteIdFor:null,recordCost:typeof recordCost===\'function\'?recordCost:null};';
const calls=[];const ctx={require,module:{exports:{}},process:{env:{}},global:{},console,fetch:async u=>{calls.push(String(u));throw Error('NO NETWORK '+u)},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const handler=ctx.module.exports,f=handler.t;const sleep=ms=>new Promise(x=>setTimeout(x,ms));
const origR=ctx.r;let hook=null;ctx.r=function(cmd){if(hook&&hook.match(cmd)){const h=hook;hook=null;h.hit=true;return new Promise(()=>{});}return origR(cmd);};
async function crashDuring(match,fn){const h={match,hit:false};hook=h;fn().catch(()=>{});for(let i=0;i<600&&!h.hit;i++)await sleep(5);hook=null;assert.ok(h.hit,'the fault was injected');}
async function http(method,url,{key,cookie,body}={}){let out;const headers={host:'localhost',origin:'http://localhost'};if(key)headers.authorization='Bearer '+key;if(cookie)headers.cookie='fm_sess='+cookie;
 const res={setHeader(){},status(c){this.code=c;return this},json(j){out={code:this.code||200,j};return out},send(b){out={code:this.code||200,j:b};return out},end(){out={code:this.code||204};return out}};await handler({method,url,headers,body:body||{}},res);return out||{code:0};}
(async()=>{
 const email='a@owner.example',ws='ws_cost',u={id:'user_a',email,ws};await f.setJ('gl:user:'+f.sha(email),u);await f.setJ('gl:sess:'+f.sha('cookie_a'),{uid:u.id,email,ws});const inA=fn=>f.als.run({ws},fn);
 const day=new Date().toISOString().slice(0,10);let n=0;
 // a bot with a job and a note proposal; job:true makes it a job-scoped bot with an owner grant (its own ledger)
 async function scenario({job=false}={}){const bot=await inA(()=>f.createAgent('Bot '+(++n),'Ops','custom',false,{preset:'balanced'}));
  const t=await inA(()=>f.newTask({title:'Job '+n,assignee:bot.agent.id}));await http('GET','/api/gateway/tasks/next',{key:bot.key});
  if(job)await inA(async()=>{const a=await f.getJ('fm:agent:'+bot.agent.id);a.permissionScope='job';await f.setJ('fm:agent:'+a.id,a);const tk=await f.getJ('fm:task:'+t.id);tk.jobGrant={id:'grant_'+n,agentId:a.id,actions:{'notes.write':'ASK'},budgetCents:100,spentCents:0,status:'active',createdAt:new Date().toISOString()};await f.setJ('fm:task:'+t.id,tk);});
  const pr=await http('POST','/api/gateway/act',{key:bot.key,body:{action:'notes.write',task_id:t.id,params:{title:'Plan '+n,text:'Body '+n}}});assert.equal(pr.code,202,JSON.stringify(pr.j));
  const q=await inA(()=>f.getJ('fm:req:'+pr.j.request_id));return {bot,t,rid:q.id,hash:q.detailsHash};}
 const approve=s=>http('POST','/api/requests/'+s.rid+'/approve',{cookie:'cookie_a',body:{detailsHash:s.hash}});
 const recover=s=>http('POST','/api/requests/'+s.rid+'/recover',{cookie:'cookie_a'});
 const daily=async s=>Number(await inA(()=>f.r(['GET','fm:spend:'+s.bot.agent.id+':'+day]))||0);
 const ledger=async s=>Number(((await inA(()=>f.getJ('fm:task:'+s.t.id))).jobGrant||{}).spentCents||0);
 const receipts=async s=>(await inA(()=>f.r(['LRANGE','fm:receipts',0,299]))).map(x=>JSON.parse(x)).filter(x=>x.requestId===s.rid&&x.outcome==='completed').length;
 async function age(s){await inA(async()=>{await f.r(['DEL','fm:joblock:'+s.t.id]);if(f.noteIdFor)await f.r(['DEL','fm:notelock:'+f.noteIdFor(s.rid)]);const q=await f.getJ('fm:req:'+s.rid);q.decidedAt=new Date(Date.now()-5*60000).toISOString();if(q.recoverStartedAt)q.recoverStartedAt=q.decidedAt;await f.setJ('fm:req:'+s.rid,q);f.bust();});}
 const atReceipt=c=>c[0]==='GET'&&c[1]==='fm:lasthash'; // receipt() starts here, after the cost is recorded
 // ---- existing callers keep their behavior
 {const s=await scenario();assert.equal((await approve(s)).j.request.status,'executed');assert.deepEqual([await daily(s),await receipts(s)],[2,1],'approval charges once');}
 {const s=await scenario({job:true});assert.equal((await approve(s)).j.request.status,'executed');assert.deepEqual([await daily(s),await ledger(s)],[2,2],'a job-scoped bot: the daily counter and the job ledger each once');}
 {const bot=await inA(()=>f.createAgent('Auto bot','Ops','custom',false,{preset:'balanced'}));await inA(async()=>{const a=await f.getJ('fm:agent:'+bot.agent.id);a.permissions={'notes.write':'AUTO'};await f.setJ('fm:agent:'+a.id,a);});
  for(let i=0;i<2;i++)assert.equal((await http('POST','/api/gateway/act',{key:bot.key,body:{action:'notes.write',params:{title:'Same',text:'Same'}}})).code,200);
  assert.equal(Number(await inA(()=>f.r(['GET','fm:spend:'+bot.agent.id+':'+day]))),4,'the AUTO path without an identity charges every call, as before');}
 // ---- crash after the cost, before the receipt; then recovery: once, repeatedly, concurrently
 {const s=await scenario();await crashDuring(atReceipt,()=>approve(s));assert.equal(await daily(s),2,'the cost was recorded before the crash');assert.equal(await receipts(s),0);
  await age(s);assert.equal((await recover(s)).code,200);{const got=[await daily(s),await receipts(s)];assert.deepEqual(got,[2,1],'recovery does not charge again (daily cents, receipts) = '+JSON.stringify(got));}
  assert.equal((await recover(s)).code,409,'a repeat is refused');assert.equal(await daily(s),2);}
 {const s=await scenario();await crashDuring(atReceipt,()=>approve(s));await age(s);
  const all=await Promise.all([1,2,3,4,5].map(()=>recover(s)));assert.equal(all.filter(x=>x.code===200).length,1,'one recovery wins');assert.deepEqual([await daily(s),await receipts(s)],[2,1],'concurrent recovery: one charge, one receipt');}
 {const s=await scenario({job:true});await crashDuring(atReceipt,()=>approve(s));assert.deepEqual([await daily(s),await ledger(s)],[2,2]);
  await age(s);assert.equal((await recover(s)).code,200);assert.deepEqual([await daily(s),await ledger(s),await receipts(s)],[2,2,1],'job-scoped: neither the daily counter nor the job ledger is charged twice');}
 // ---- crash between the daily charge and the job-ledger charge: each converges to exactly one
 {const s=await scenario({job:true});let armed=false;
  await crashDuring(c=>{if(armed&&c[0]==='GET'&&c[1]==='fm:task:'+s.t.id)return true;if(c[0]==='EVAL'&&/^fm:charged:/.test(String(c[3])))armed=true;return false;},()=>approve(s));
  assert.deepEqual([await daily(s),await ledger(s)],[2,0],'daily charged, job ledger not yet');await age(s);assert.equal((await recover(s)).code,200);
  assert.deepEqual([await daily(s),await ledger(s),await receipts(s)],[2,2,1],'after recovery: each exactly once');}
 // ---- the primitive itself: concurrent and repeated calls with one key charge once; different keys each charge
 {assert.equal(typeof f.recordCost,'function','recordCost exists');const bot=await inA(()=>f.createAgent('Prim','Ops','custom',false,{preset:'balanced'}));const a=await inA(()=>f.getJ('fm:agent:'+bot.agent.id));
  await inA(()=>Promise.all(Array.from({length:10},()=>f.recordCost(a,'notes.write',null,'req_same'))));await inA(()=>f.recordCost(a,'notes.write',null,'req_same'));
  assert.equal(Number(await inA(()=>f.r(['GET','fm:spend:'+a.id+':'+day]))),2,'ten concurrent and one repeat with the same key: charged once');
  await inA(()=>f.recordCost(a,'notes.write',null,'req_other'));await inA(()=>f.recordCost(a,'notes.write',null,null));await inA(()=>f.recordCost(a,'notes.write',null,null));
  assert.equal(Number(await inA(()=>f.r(['GET','fm:spend:'+a.id+':'+day]))),8,'a different key charges; no key charges every time');}
 // ---- an old retry must not count against the job budget again, however many charges came after it (the ledger once kept only the last 500)
 {const s=await scenario({job:true});const a=await inA(()=>f.getJ('fm:agent:'+s.bot.agent.id));
  await inA(async()=>{const tk=await f.getJ('fm:task:'+s.t.id);tk.jobGrant.budgetCents=100000;await f.setJ('fm:task:'+s.t.id,tk);});
  const keys=Array.from({length:620},(_,i)=>'req_many_'+i);for(const k of keys)await inA(()=>f.recordCost(a,'notes.write',s.t.id,k));
  const before=await ledger(s);assert.equal(before,620*2,'620 distinct charges, 2c each');
  for(const k of [keys[0],keys[1],keys[100],keys[119],keys[500]])await inA(()=>f.recordCost(a,'notes.write',s.t.id,k));
  assert.equal(await ledger(s),before,'retrying old keys (including ones past the last 500) does not charge the job again');
  assert.equal(Number(await inA(()=>f.r(['GET','fm:spend:'+a.id+':'+day]))),620*2,'nor the daily counter');
  // a crash between the ledger write and its marker is still safe while the key is recent
  await inA(()=>f.recordCost(a,'notes.write',s.t.id,'req_recent'));await inA(()=>f.recordCost(a,'notes.write',s.t.id,'req_recent'));assert.equal(await ledger(s),before+2,'a recent key charges once');}
 // ---- the gate still reads the counter: a 3c daily limit allows one 2c note and blocks the second
 {const s1=await scenario();await inA(async()=>{const a=await f.getJ('fm:agent:'+s1.bot.agent.id);a.limits={...(a.limits||{}),dailyCents:3};await f.setJ('fm:agent:'+a.id,a);});
  assert.equal((await approve(s1)).j.request.status,'executed');
  const t2=await inA(()=>f.newTask({title:'Second',assignee:s1.bot.agent.id}));await http('POST','/api/gateway/tasks/'+s1.t.id+'/complete',{key:s1.bot.key,body:{result:'done'}});await http('GET','/api/gateway/tasks/next',{key:s1.bot.key});
  const p2=await http('POST','/api/gateway/act',{key:s1.bot.key,body:{action:'notes.write',task_id:t2.id,params:{title:'Two',text:'Two'}}});
  assert.deepEqual([p2.code,p2.j.code],[403,'limit_daily'],'the daily cap reads the counter: 2c spent + 2c > 3c is refused at proposal ('+JSON.stringify(p2.j).slice(0,120)+')');}
 assert.equal(calls.length,0,'no network');
 console.log('PASS cost once: an approved note is charged once per request through crashes between cost and receipt, between the daily and job-ledger charges, and repeated or concurrent recovery; the primitive charges once per key under concurrency; approval and the AUTO path keep their behavior; the daily cap still gates');
})().catch(e=>{console.error(e);process.exit(1)});
