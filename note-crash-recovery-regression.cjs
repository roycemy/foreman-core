// A crash during notes.write approval must not strand the request. approveReq claims 'approved' before it writes the note; if the function
// dies afterwards (before the note is written, or after it is written but before the outcome is recorded) the request used to stay
// 'approved' forever: no way to finish it, and the job could not complete. Now the owner sees "Note not saved yet" once the save is
// stale (>2 min, past the 120 s job lock) and can Finish saving; recovery is one note per request, whatever the crash point and however
// often or concurrently it runs. Fault injection: the store function r is wrapped so one chosen command never returns, which freezes
// that invocation exactly as a killed function would (its job lock stays held, nothing after the frozen command runs). A thrown error
// would not do: runAndReceipt records it as a failed request. Real handler, offline, no network.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={r,setJ,getJ,als,createAgent,newTask,sha,jobDetail,bust,noteIdFor:typeof noteIdFor===\'function\'?noteIdFor:null};';
const calls=[];const ctx={require,module:{exports:{}},process:{env:{}},global:{},console,fetch:async u=>{calls.push(String(u));throw Error('NO NETWORK '+u)},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const handler=ctx.module.exports,f=handler.t;
const sleep=ms=>new Promise(x=>setTimeout(x,ms));
// ---- fault injection
assert.equal(typeof ctx.r,'function','the store function is reachable for fault injection');
const origR=ctx.r;let hook=null;
ctx.r=function(cmd){if(hook&&hook.match(cmd)){const h=hook;hook=null;h.hit=true;return new Promise(()=>{});}return origR(cmd);};
const isSet=re=>c=>c[0]==='SET'&&re.test(String(c[1])),isCmd=(n,re)=>c=>c[0]===n&&re.test(String(c[1]));
async function crashDuring(match,fn){const h={match,hit:false};hook=h;const p=fn();p.catch(()=>{});for(let i=0;i<600&&!h.hit;i++)await sleep(5);hook=null;assert.ok(h.hit,'the fault was injected');/* never hand back p: the frozen call must not be awaited */}
async function http(method,url,{key,cookie,body,origin}={}){let out;const headers={host:'localhost',origin:origin||'http://localhost'};if(key)headers.authorization='Bearer '+key;if(cookie)headers.cookie='fm_sess='+cookie;
 const res={setHeader(){},status(c){this.code=c;return this},json(j){out={code:this.code||200,j};return out},send(b){out={code:this.code||200,j:b};return out},end(){out={code:this.code||204};return out}};
 await handler({method,url,headers,body:body||{}},res);return out||{code:0};}
async function owner(tag){const email=tag+'@owner.example',ws='ws_'+tag,u={id:'user_'+tag,email,ws};await f.setJ('gl:user:'+f.sha(email),u);await f.setJ('gl:sess:'+f.sha('cookie_'+tag),{uid:u.id,email,ws});return {ws,cookie:'cookie_'+tag};}
(async()=>{
 const A=await owner('a'),B=await owner('b');const inA=fn=>f.als.run({ws:A.ws},fn);
 const BODY='Monday plan\n1. Clear the inbox & <triage>\n2. Review receipts\n'+'z'.repeat(900);
 let n=0;
 // a fresh bot and job per scenario (a bot works one job at a time), a proposal awaiting the owner
 async function scenario(){const bot=await inA(()=>f.createAgent('Note Bot '+(++n),'Ops','custom',false,{preset:'balanced'}));
  const job=await inA(()=>f.newTask({title:'Write the Monday plan note '+n,assignee:bot.agent.id}));await http('GET','/api/gateway/tasks/next',{key:bot.key});
  const pr=await http('POST','/api/gateway/act',{key:bot.key,body:{action:'notes.write',task_id:job.id,params:{title:'Monday plan',text:BODY}}});assert.equal(pr.code,202,JSON.stringify(pr.j));
  const q=await inA(()=>f.getJ('fm:req:'+pr.j.request_id));return {bot,job,rid:q.id,hash:q.detailsHash,q};}
 const approve=s=>http('POST','/api/requests/'+s.rid+'/approve',{cookie:A.cookie,body:{detailsHash:s.hash}});
 const req=s=>inA(()=>f.getJ('fm:req:'+s.rid));
 const complete=s=>http('POST','/api/gateway/tasks/'+s.job.id+'/complete',{key:s.bot.key,body:{result:'Bot says: done. (must never stand in for the note)'}});
 // the frozen invocation's locks expire; the request ages past the stale window
 async function age(s,{noteLock=true}={}){await inA(async()=>{await f.r(['DEL','fm:joblock:'+s.job.id]);const q=await f.getJ('fm:req:'+s.rid);if(q.status==='approved')q.decidedAt=new Date(Date.now()-5*60000).toISOString();if(q.status==='recovering')q.recoverStartedAt=new Date(Date.now()-5*60000).toISOString();await f.setJ('fm:req:'+s.rid,q);
   if(noteLock)if(f.noteIdFor)await f.r(['DEL','fm:notelock:'+f.noteIdFor(s.rid)]);f.bust();});} // the state view is cached 30 s; the test ages the store behind it
 const recover=(s,o)=>http('POST','/api/requests/'+s.rid+'/recover',{cookie:A.cookie,...(o||{})});
 const noteIds=()=>inA(()=>f.r(['SMEMBERS','fm:noteids']));
 const listEntries=async id=>(await inA(()=>f.r(['LRANGE','fm:notes',0,999]))).map(x=>JSON.parse(x)).filter(x=>x.id===id);
 const receiptsFor=async rid=>(await inA(()=>f.r(['LRANGE','fm:receipts',0,299]))).map(x=>JSON.parse(x)).filter(x=>x.requestId===rid&&x.outcome==='completed');
 const spent=async s=>Number(await inA(()=>f.r(['GET','fm:spend:'+s.bot.agent.id+':'+new Date().toISOString().slice(0,10)]))||0);
 const stateReq=async s=>(await http('GET','/api/state',{cookie:A.cookie})).j.requests.find(x=>x.id===s.rid);
 // the whole outcome the owner relies on, checked after any recovery
 async function assertRecovered(s,label,{spend=2}={}){
  const q=await req(s);assert.equal(q.status,'executed',label+': request executed ('+JSON.stringify(q.result)+' '+(q.reason||'')+')');assert.ok(q.result&&q.result.note_id,label+': result carries the note id');
  const ids=await noteIds();assert.equal(ids.length,(s.before||0)+1,label+': exactly one new note record');
  assert.equal((await listEntries(q.result.note_id)).length,1,label+': exactly one entry in the recent list');
  const g=await http('GET','/api/notes/'+q.result.note_id,{cookie:A.cookie});assert.equal(g.code,200,label+': the saved note opens');
  assert.deepEqual([g.j.note.title,g.j.note.text],['Monday plan',BODY],label+': the full approved body, exactly');assert.equal(g.j.note.botName,s.bot.agent.name);
  assert.deepEqual([g.j.link.requestId,g.j.link.taskId,g.j.link.matchesApproval],[s.rid,s.job.id,true],label+': linked to its request and job, matching the approval fingerprint');
  assert.ok(!/Bot says/.test(JSON.stringify(g.j)),label+': not the bot\'s completion text');
  assert.equal((await receiptsFor(s.rid)).length,1,label+': one completed receipt');assert.equal(await spent(s),spend,label+': the 2c cost counted once');
  const jd=await http('GET','/api/jobs/'+s.job.id,{cookie:A.cookie});assert.equal(jd.j.requests.find(x=>x.id===s.rid).result.note_id,q.result.note_id,label+': the job receipt carries the note to open');
  const c=await complete(s);assert.equal(c.code,200,label+': the job completes ('+JSON.stringify(c.j)+')');assert.equal((await inA(()=>f.getJ('fm:task:'+s.job.id))).status,'done');return q;}

 // ===== 1. crash BEFORE the note is written
 {const s=await scenario();s.before=(await noteIds()).length;await crashDuring(isSet(/^fm:note:/),()=>approve(s));
  assert.equal((await req(s)).status,'approved','the bug: the request is stranded as approved');assert.equal((await noteIds()).length,s.before,'no note was written');
  assert.match((await complete(s)).j.error,/busy/,'right after the crash the dead invocation still holds the job lock');await inA(()=>f.r(['DEL','fm:joblock:'+s.job.id]));
  assert.equal((await complete(s)).j.error,'proposal_unresolved','once the lock lapses the job still cannot complete: the request is stranded');
  assert.ok(!(await stateReq(s)).stalled,'a fresh in-flight approval is not offered for recovery');assert.equal((await recover(s)).code,409,'a possibly live save cannot be recovered');
  await age(s);assert.equal((await stateReq(s)).stalled,true,'once stale, the owner sees it');
  const rc=await recover(s);assert.equal(rc.code,200,'recovery: '+JSON.stringify(rc.j));assert.equal(rc.j.request.status,'executed','recovery outcome: '+JSON.stringify({status:rc.j.request.status,reason:rc.j.request.reason,result:rc.j.request.result}));
  await assertRecovered(s,'crash before the write');}
 // ===== 2. crash after the note record, before it reached the recent list
 {const s=await scenario();s.before=(await noteIds()).length;await crashDuring(isCmd('LPUSH',/^fm:notes$/),()=>approve(s));
  const id=(await noteIds())[(await noteIds()).length-1];const rec0=await inA(()=>f.getJ('fm:note:'+id));assert.ok(rec0,'the note record exists');assert.equal((await listEntries(id)).length,0,'but it is not in the recent list');assert.equal((await req(s)).status,'approved');
  await age(s);const rc=await recover(s);assert.equal(rc.code,200,JSON.stringify(rc.j));
  const q=await assertRecovered(s,'crash before the list entry');assert.equal(q.result.note_id,id,'the same note, not a second one');assert.equal((await inA(()=>f.getJ('fm:note:'+id))).at,rec0.at,'its saved time is the original');}
 // ===== 3. crash after the note is fully written, before the cost and receipt
 {const s=await scenario();s.before=(await noteIds()).length;await crashDuring(isCmd('INCRBY',/^fm:spend:/),()=>approve(s));
  const id=(await noteIds())[(await noteIds()).length-1];assert.equal((await listEntries(id)).length,1,'the note is fully written');assert.equal((await receiptsFor(s.rid)).length,0,'no receipt yet');assert.equal(await spent(s),0);
  await age(s);assert.equal((await recover(s)).code,200);const q=await assertRecovered(s,'crash before the receipt');assert.equal(q.result.note_id,id);}
 // ===== 4. crash after the receipt, before the request is finalized: no second receipt, no second charge
 {const s=await scenario();s.before=(await noteIds()).length;await crashDuring(c=>c[0]==='SET'&&c[1]==='fm:req:'+s.rid&&String(c[2]).includes('"status":"executed"'),()=>approve(s));
  assert.equal((await req(s)).status,'approved');const first=(await receiptsFor(s.rid));assert.equal(first.length,1,'the receipt was written');assert.equal(await spent(s),2,'and the cost counted');
  await age(s);assert.equal((await recover(s)).code,200);const q=await assertRecovered(s,'crash before finalizing');assert.equal(q.receiptId,first[0].id,'the request points at the original receipt');}
 // ===== 5. repeated and concurrent recovery: exactly one note
 {const s=await scenario();s.before=(await noteIds()).length;await crashDuring(isSet(/^fm:note:/),()=>approve(s));await age(s);
  const all=await Promise.all([1,2,3,4,5].map(()=>recover(s)));
  const won=all.filter(x=>x.code===200);assert.equal(won.length,1,'exactly one recovery wins ('+all.map(x=>x.code)+')');assert.ok(all.filter(x=>x!==won[0]).every(x=>x.code===409),'the others are refused');
  await assertRecovered(s,'concurrent recovery');const again=await recover(s);assert.equal(again.code,409,'a repeat after recovery is refused');assert.equal((await noteIds()).length,s.before+1);}
 // ===== 6. a live write lock is respected: recovery waits then refuses, writes nothing; after it expires, recovery completes once
 {const s=await scenario();s.before=(await noteIds()).length;await crashDuring(isCmd('LPUSH',/^fm:notes$/),()=>approve(s));await age(s,{noteLock:false});
  const busy=await recover(s);assert.equal(busy.code,409,'the note is still being written: '+JSON.stringify(busy.j));assert.equal((await req(s)).status,'approved','nothing changed');
  await inA(()=>f.r(['DEL','fm:notelock:'+(f.noteIdFor?f.noteIdFor(s.rid):'none')]));assert.equal((await recover(s)).code,200);await assertRecovered(s,'after the lock expired');}
 // ===== 7. a recovery that itself crashed is recoverable once it is stale: still one note
 {const s=await scenario();s.before=(await noteIds()).length;await crashDuring(isSet(/^fm:note:/),()=>approve(s));await age(s);
  await crashDuring(isSet(/^fm:note:/),()=>recover(s));assert.equal((await req(s)).status,'recovering','the recovery was interrupted');assert.equal((await recover(s)).code,409,'a recovery that may still be running is not repeated');
  await inA(()=>f.r(['DEL','fm:joblock:'+s.job.id]));assert.equal((await complete(s)).j.error,'proposal_unresolved','a recovering request still blocks completion');
  await age(s);assert.equal((await stateReq(s)).stalled,true);assert.equal((await recover(s)).code,200);await assertRecovered(s,'second recovery');}
 // ===== 8. policy: not written yet -> checked now; written already -> finalized, nothing new written
 {const s=await scenario();s.before=(await noteIds()).length;await crashDuring(isSet(/^fm:note:/),()=>approve(s));await age(s);
  await inA(async()=>{const a=await f.getJ('fm:agent:'+s.bot.agent.id);a.status='revoked';await f.setJ('fm:agent:'+s.bot.agent.id,a);});
  const rc=await recover(s);assert.equal(rc.code,200);assert.equal(rc.j.request.status,'blocked','a revoked bot: not written');assert.equal((await noteIds()).length,s.before,'no note was written');assert.equal((await receiptsFor(s.rid)).length,0);}
 {const s=await scenario();await crashDuring(isSet(/^fm:note:/),()=>approve(s));await age(s);await inA(()=>f.r(['SET','fm:kill','1']));
  const rc=await recover(s);assert.equal(rc.j.request.status,'blocked','kill switch on: not written');await inA(()=>f.r(['DEL','fm:kill']));}
 {const s=await scenario();s.before=(await noteIds()).length;await crashDuring(isCmd('INCRBY',/^fm:spend:/),()=>approve(s));await age(s);
  await inA(async()=>{const a=await f.getJ('fm:agent:'+s.bot.agent.id);a.status='revoked';await f.setJ('fm:agent:'+s.bot.agent.id,a);});
  const rc=await recover(s);assert.equal(rc.code,200);assert.equal(rc.j.request.status,'executed','the note was already written under the owner\'s approval: finalized, nothing new written');
  assert.equal((await noteIds()).length,s.before+1);}
 {const s=await scenario();s.before=(await noteIds()).length;await crashDuring(isCmd('INCRBY',/^fm:spend:/),()=>approve(s));await age(s);
  await inA(()=>f.r(['DEL','fm:agent:'+s.bot.agent.id]));const rc=await recover(s);assert.equal(rc.code,200,JSON.stringify(rc.j));assert.equal(rc.j.request.status,'executed','a removed bot: the already written note is still finalized');assert.equal((await noteIds()).length,s.before+1);
}
 {const s=await scenario();s.before=(await noteIds()).length;await crashDuring(isSet(/^fm:note:/),()=>approve(s));await age(s);await inA(()=>f.r(['DEL','fm:agent:'+s.bot.agent.id]));
  const rc=await recover(s);assert.equal(rc.j.request.status,'blocked','a removed bot with nothing written: blocked');assert.equal((await noteIds()).length,s.before);}
 // ===== 9. the fingerprint still binds: a stored request that no longer matches what was approved is blocked, nothing written
 {const s=await scenario();s.before=(await noteIds()).length;await crashDuring(isSet(/^fm:note:/),()=>approve(s));await age(s);
  await inA(async()=>{const q=await f.getJ('fm:req:'+s.rid);q.rawParams={...q.rawParams,text:'A different body'};await f.setJ('fm:req:'+s.rid,q);});
  const rc=await recover(s);assert.equal(rc.j.request.status,'blocked','a tampered request is blocked');assert.equal((await noteIds()).length,s.before,'nothing written');}
 // ===== 10. isolation and auth
 {const s=await scenario();await crashDuring(isSet(/^fm:note:/),()=>approve(s));await age(s);
  assert.equal((await http('POST','/api/requests/'+s.rid+'/recover',{cookie:B.cookie})).code,404,'another workspace cannot recover it');
  assert.equal((await http('POST','/api/requests/'+s.rid+'/recover')).code,401,'no session');
  const bk=await http('POST','/api/requests/'+s.rid+'/recover',{key:s.bot.key});assert.ok([401,404].includes(bk.code),'a bot key cannot recover it (got '+bk.code+')');
  const xo=await http('POST','/api/requests/'+s.rid+'/recover',{cookie:A.cookie,origin:'https://evil.example'});assert.deepEqual([xo.code,xo.j.error],[403,'origin'],'cross-origin refused');
  assert.equal((await req(s)).status,'approved','still untouched');assert.equal((await http('GET','/api/state',{cookie:B.cookie})).j.requests.some(x=>x.id===s.rid),false,'B never sees it');
  assert.equal((await recover(s)).code,200,'the owning workspace can');}
 // ===== 11. email recovery is unchanged: only notes.write is recoverable here
 {const bot=await inA(()=>f.createAgent('Mail Bot','Ops','custom',false,{preset:'balanced'}));const q={id:'req_email_x',agentId:bot.agent.id,action:'email.send',status:'approved',decidedAt:new Date(Date.now()-5*60000).toISOString(),params:{},rawParams:{},createdAt:new Date().toISOString()};
  await inA(async()=>{await f.setJ('fm:req:'+q.id,q);await f.r(['SADD','fm:reqs',q.id]);});assert.equal((await http('POST','/api/requests/'+q.id+'/recover',{cookie:A.cookie})).code,409,'an email is not recovered here');
  const st=(await http('GET','/api/state',{cookie:A.cookie})).j.requests.find(x=>x.id===q.id);assert.equal(st.status,'outcome_unknown','email keeps its own handling');assert.ok(!st.stalled);}
 // ===== 12. the owner's screen: real core.js
 {const win={BB:undefined,matchMedia:()=>({matches:false}),innerWidth:390,localStorage:{getItem:()=>null,setItem(){}}},apiCalls=[];
  const cctx={window:win,document:{addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],hidden:false},matchMedia:win.matchMedia,innerWidth:390,localStorage:win.localStorage,fetch:()=>{throw Error('NO NETWORK')},setInterval:()=>0,clearInterval(){},setTimeout:()=>0,clearTimeout(){},console,Date};
  vm.createContext(cctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'public/js/core.js'),'utf8'),cctx);const BB=win.BB;
  BB.api=async(p,m,b)=>{apiCalls.push([p,m,b]);return {request:{action:'notes.write',status:'executed',result:{note_id:'note_1'}},receipt:{outcome:'completed'}}};BB.toast=()=>{};BB.sync=async()=>{};
  const stuck={id:'req_n',action:'notes.write',status:'approved',stalled:true,agentId:'agent_t',decidedAt:new Date(Date.now()-5*60000).toISOString(),params:{title:'Plan',text:'Body'},detailsHash:'a'.repeat(64)};
  const fresh={...stuck,id:'req_f',stalled:false,decidedAt:new Date().toISOString()},email={...stuck,id:'req_e',action:'email.send',stalled:true};
  BB.S={killed:false,agents:[{id:'agent_t',name:'Bot',status:'active',connection:{status:'active',transport:'gateway',lastCallAt:new Date().toISOString()}}],tasks:[],requests:[stuck,fresh,email],events:[],receipts:[]};BB.money={requests:[]};BB.cards={proposals:[]};
  const on=BB.onYou();assert.deepEqual(on.filter(i=>i.type==='notesave').map(i=>i.q.id),['req_n'],'only a stalled note save is offered; a fresh one and an email are not');
  assert(fs.readFileSync(path.join(__dirname,'public/js/floor.js'),'utf8').includes("i.type === 'notesave' ? 'Note not saved yet'"),'the item is titled Note not saved yet');assert.equal(BB.teamSummary().needs,on.filter(i=>i.type!=='dark').length,'counts agree with the list');
  const j=await BB.decide(on.find(i=>i.type==='notesave'),'recover');assert.deepEqual(apiCalls[0].slice(0,2),['/api/requests/req_n/recover','POST'],'Finish saving posts to the recovery route');
  assert.match(BB.outcome({type:'notesave',q:stuck},j,'recover'),/Saved/);assert.match(BB.outcome({type:'notesave',q:stuck},{request:{status:'blocked',reason:'Access revoked by owner'}},'recover'),/Not saved: Access revoked by owner/);
  const ib=fs.readFileSync(path.join(__dirname,'public/js/inbox.js'),'utf8');assert(/i\.type === 'notesave'/.test(ib)&&/data-d="recover"/.test(ib)&&/Finish saving/.test(ib),'both the card and the phone row offer Finish saving');
  assert(/BB\.noteReview\(\{ \.\.\.i\.q, expiresAt: null \}\)/.test(ib),'an approved request shows no expiry countdown');{const h=BB.noteReview({...stuck,expiresAt:null});assert(!/expires in/.test(h)&&h.includes('Fingerprint aaaaaaaaaaaa'),'the card keeps the fingerprint, drops the expiry');}
  const pp=fs.readFileSync(path.join(__dirname,'public/js/pop.js'),'utf8');assert(/i\.type === 'notesave'\) return big/.test(pp)&&/i\.type === 'notesave'\) return \(i\.a/.test(pp),'the desktop pop-down and the phone sheet give a note save its own line and Finish saving action (their fallback would read i.t.id)');}
 assert.equal(calls.length,0,'no network');
 console.log('PASS note crash recovery: a note save interrupted before the write, before the list entry, before the receipt or before finalizing is shown as "Note not saved yet" once stale and recovers to exactly one note (one list entry, one receipt, one charge); concurrent, repeated and interrupted recoveries stay at one; the approved body, fingerprint, policy and workspace checks hold; the job completes and the note opens from its receipt');
})().catch(e=>{console.error(e);process.exit(1)});
