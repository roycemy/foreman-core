// Item G: an AUTO notes.write retried by the bot made a second note every time. A caller opts in with a stable source_id (the gateway's
// existing retry key; now also on the MCP tool). The note's identity is bot + job + source_id: the same identity and the same note returns
// the original note and receipt; the same identity with a different note is rejected; no source_id keeps today's behavior. Content alone
// never dedupes: two calls with identical text and no (or different) source_ids are two notes. Fault injection freezes a store call the way
// a killed function stops. Real handler, HTTP gateway and MCP; offline.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={r,setJ,getJ,als,createAgent,newTask,sha,bust};';
const ctx={require,module:{exports:{}},process:{env:{}},global:{},console,fetch:async u=>{throw Error('NO NETWORK '+u)},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const handler=ctx.module.exports,f=handler.t;const sleep=ms=>new Promise(x=>setTimeout(x,ms));
const origR=ctx.r;let hook=null;ctx.r=function(cmd){if(hook&&hook.match(cmd)){const h=hook;hook=null;h.hit=true;return h.after?origR(cmd).then(()=>new Promise(()=>{})):new Promise(()=>{});}return origR(cmd);}; // after: the command executes, its reply never arrives
async function crashDuring(match,fn){const h={match,hit:false};hook=h;fn().catch(()=>{});for(let i=0;i<600&&!h.hit;i++)await sleep(5);hook=null;assert.ok(h.hit,'the fault was injected');}
async function http(method,url,{key,cookie,body}={}){let out;const headers={host:'localhost',origin:'http://localhost'};if(key)headers.authorization='Bearer '+key;if(cookie)headers.cookie='fm_sess='+cookie;
 const res={setHeader(){},status(c){this.code=c;return this},json(j){out={code:this.code||200,j};return out},send(b){out={code:this.code||200,j:b};return out},end(){out={code:this.code||204};return out}};await handler({method,url,headers,body:body||{}},res);return out||{code:0};}
async function owner(tag){const email=tag+'@owner.example',ws='ws_'+tag,u={id:'user_'+tag,email,ws};await f.setJ('gl:user:'+f.sha(email),u);await f.setJ('gl:sess:'+f.sha('cookie_'+tag),{uid:u.id,email,ws});return {ws,cookie:'cookie_'+tag};}
(async()=>{
 const A=await owner('a'),B=await owner('b');const day=new Date().toISOString().slice(0,10);
 async function autoBot(o,name){const b=await f.als.run({ws:o.ws},()=>f.createAgent(name,'Ops','custom',false,{preset:'balanced'}));await f.als.run({ws:o.ws},async()=>{const a=await f.getJ('fm:agent:'+b.agent.id);a.permissions={'notes.write':'AUTO','notes.delete':'AUTO'};a.limits={...(a.limits||{}),dailyCents:100000};await f.setJ('fm:agent:'+a.id,a);});
  const t=await f.als.run({ws:o.ws},()=>f.newTask({title:'Job for '+name,assignee:b.agent.id}));await http('GET','/api/gateway/tasks/next',{key:b.key});return {...b,o,t};}
 const write=(b,body)=>http('POST','/api/gateway/act',{key:b.key,body:{action:'notes.write',task_id:b.t.id,...body}});
 const inO=(o,fn)=>f.als.run({ws:o.ws},fn);
 const notesOf=async(o,by)=>(await inO(o,()=>f.r(['LRANGE','fm:notes',0,99]))).map(x=>JSON.parse(x)).filter(x=>x.by===by);
 const recordsOf=async o=>(await inO(o,()=>f.r(['SMEMBERS','fm:noteids']))).length;
 const receiptsOf=async(o,by)=>(await inO(o,()=>f.r(['LRANGE','fm:receipts',0,299]))).map(x=>JSON.parse(x)).filter(x=>x.agentId===by&&x.action==='notes.write'&&x.outcome==='completed').length;
 const spend=async b=>Number(await inO(b.o,()=>f.r(['GET','fm:spend:'+b.agent.id+':'+day]))||0);
 const P={title:'Daily digest',text:'Same body'};
 // ===== 1. a retried call with the same source_id and the same note: one note, one receipt, one charge
 {const b=await autoBot(A,'Retry bot');const r1=await write(b,{params:P,source_id:'run-42'});assert.equal(r1.code,200,JSON.stringify(r1.j));
  const r2=await write(b,{params:P,source_id:'run-42'}),r3=await write(b,{params:P,source_id:'run-42'});
  assert.ok(r2.j.duplicate&&r3.j.duplicate,'retries are reported as duplicates');assert.equal(r2.j.result.note_id,r1.j.result.note_id);assert.equal(r3.j.receipt_id,r1.j.receipt_id,'the original receipt is returned');
  assert.deepEqual([(await notesOf(A,b.agent.id)).length,await receiptsOf(A,b.agent.id),await spend(b)],[1,1,2],'one note, one receipt, 2c once');}
 // ===== 2. content alone never dedupes: no source_id, or different source_ids, give separate notes (today's behavior)
 {const b=await autoBot(A,'Plain bot');await write(b,{params:P});await write(b,{params:P});assert.equal((await notesOf(A,b.agent.id)).length,2,'no source_id: two identical calls are two notes, as before');
  await write(b,{params:P,source_id:'a'});await write(b,{params:P,source_id:'b'});assert.equal((await notesOf(A,b.agent.id)).length,4,'different source_ids: two notes even with identical text');}
 // ===== 3. the same source_id with a different note is rejected; the original stays
 {const b=await autoBot(A,'Conflict bot');const r1=await write(b,{params:P,source_id:'s1'});const r2=await write(b,{params:{title:'Other',text:'Different'},source_id:'s1'});
  assert.deepEqual([r2.code,r2.j.code],[409,'idempotency_conflict'],'a different payload under the same identity is refused');assert.ok(/source_id/.test(r2.j.reason),'with a clear reason');
  const ns=await notesOf(A,b.agent.id);assert.deepEqual(ns.map(x=>x.text),['Same body'],'the original note is unchanged and no second note exists');
  const g=await http('GET','/api/notes/'+r1.j.result.note_id,{cookie:A.cookie});assert.equal(g.j.note.text,'Same body');}
 // ===== 4. concurrent retries: exactly one note, one list entry, one receipt, one charge. Inside a job the job lock answers overlapping
 //        calls with the existing 409 "Job is busy, retry"; without a job the note lock serializes them and all answer with the same note.
 {const b=await autoBot(A,'Burst bot');const all=await Promise.all(Array.from({length:8},()=>write(b,{params:P,source_id:'burst'})));
  assert.ok(all.every(x=>x.code===200||(x.code===409&&/busy/i.test(x.j.error))),'each overlapping call either completes or is told the job is busy ('+all.map(x=>x.code)+')');
  const again=await write(b,{params:P,source_id:'burst'});assert.ok(again.j.duplicate,'a retry after the burst is the same note');
  assert.equal(new Set([...all.filter(x=>x.code===200),again].map(x=>x.j.result.note_id)).size,1,'all completions name the same note');
  assert.deepEqual([(await notesOf(A,b.agent.id)).length,await receiptsOf(A,b.agent.id),await spend(b)],[1,1,2],'one note, one list entry, one receipt, one charge');
  const nj=await autoBot(A,'Jobless burst bot');const all2=await Promise.all(Array.from({length:8},()=>http('POST','/api/gateway/act',{key:nj.key,body:{action:'notes.write',params:P,source_id:'burst2'}})));
  assert.ok(all2.every(x=>x.code===200),'without a job every overlapping call completes ('+all2.map(x=>x.code+JSON.stringify(x.j))+')');assert.equal(new Set(all2.map(x=>x.j.result.note_id)).size,1);
  assert.equal(all2.filter(x=>!x.j.duplicate).length,1,'exactly one is the original');assert.equal(new Set(all2.map(x=>x.j.receipt_id)).size,1,'one receipt for all');
  assert.deepEqual([(await notesOf(A,nj.agent.id)).length,await receiptsOf(A,nj.agent.id),await spend(nj)],[1,1,2],'one note, one receipt, one charge without a job too');}
 // ===== 5. the identity includes the job: the same source_id in another job is another note
 {const b=await autoBot(A,'Two jobs bot');await write(b,{params:P,source_id:'same'});await http('POST','/api/gateway/tasks/'+b.t.id+'/complete',{key:b.key,body:{result:'done'}});
  const t2=await inO(A,()=>f.newTask({title:'Second job',assignee:b.agent.id}));await http('GET','/api/gateway/tasks/next',{key:b.key});
  await http('POST','/api/gateway/act',{key:b.key,body:{action:'notes.write',task_id:t2.id,params:P,source_id:'same'}});assert.equal((await notesOf(A,b.agent.id)).length,2,'a new job is a new invocation');}
 // ===== 6. a call that died after the note was written but before its receipt: the retry finishes it, once
 {const b=await autoBot(A,'Crash bot');await crashDuring(c=>c[0]==='GET'&&c[1]==='fm:lasthash',()=>write(b,{params:P,source_id:'crashy'}));
  assert.equal((await notesOf(A,b.agent.id)).length,1,'the note was written');assert.equal(await receiptsOf(A,b.agent.id),0,'no receipt yet');
  await inO(A,async()=>{await f.r(['DEL','fm:joblock:'+b.t.id]);for(const id of await f.r(['SMEMBERS','fm:noteids']))await f.r(['DEL','fm:notelock:'+id]);}); // the killed call's locks expire
  const r=await write(b,{params:P,source_id:'crashy'});assert.equal(r.code,200,JSON.stringify(r.j));assert.deepEqual([(await notesOf(A,b.agent.id)).length,await receiptsOf(A,b.agent.id),await spend(b)],[1,1,2],'the retry completes it: one note, one receipt, one charge');}
 // ===== 6b. a crash at ANY store command after the charge, before or after it executes, then a retry: one receipt (never a second row), one note, one charge,
 //         and the retry answers with the receipt that exists
 for(const when of ['before','after'])for(let k=0;k<14;k++){const b=await autoBot(A,'Rcpt '+when+k);let armed=false,seen=0;
  const h={match:c=>{if(!armed){if(c[0]==='EVAL'&&/^fm:charged:/.test(String(c[3])))armed=true;else return false;}return seen++===k;},hit:false,after:when==='after'};
  hook=h;write(b,{params:P,source_id:'rx'}).catch(()=>{});for(let i=0;i<300&&!h.hit;i++)await sleep(5);hook=null;if(!h.hit){await sleep(30);continue;} // fewer commands than k
  await inO(A,async()=>{await f.r(['DEL','fm:joblock:'+b.t.id]);for(const id of await f.r(['SMEMBERS','fm:noteids']))await f.r(['DEL','fm:notelock:'+id]);}); // the killed call's locks expire
  const r1=await write(b,{params:P,source_id:'rx'});assert.equal(r1.code,200,when+' #'+k+': '+JSON.stringify(r1.j));
  const rows=(await inO(A,()=>f.r(['LRANGE','fm:receipts',0,299]))).map(x=>JSON.parse(x)).filter(x=>x.agentId===b.agent.id&&x.action==='notes.write'&&x.outcome==='completed');
  assert.deepEqual([(await notesOf(A,b.agent.id)).length,rows.length,await spend(b)],[1,1,2],'crash '+when+' command #'+k+' after the charge, then a retry: one note, one receipt row, 2c once');
  assert.equal(r1.j.receipt_id,rows[0].id,'crash '+when+' #'+k+': the retry answers with the receipt that exists');const r2=await write(b,{params:P,source_id:'rx'});assert.equal(r2.j.receipt_id,rows[0].id);assert.equal(await receiptsOf(A,b.agent.id),1);}
 // ===== 7. a note the owner deleted is not recreated by a retry
 {const b=await autoBot(A,'Deleted bot');const r1=await write(b,{params:P,source_id:'gone'});await http('POST','/api/notes/'+r1.j.result.note_id+'/delete',{cookie:A.cookie,body:{confirmed:true}});
  const r2=await write(b,{params:P,source_id:'gone'});assert.equal(r2.j.result.deleted,true,'the retry reports the note as deleted');assert.equal((await notesOf(A,b.agent.id)).length,0,'not recreated');}
 // ===== 8. workspaces are separate: the same source_id in another workspace is that workspace's own note; A's is untouched and unreadable from B
 {const a=await autoBot(A,'Iso A'),bb=await autoBot(B,'Iso B');const ra=await write(a,{params:P,source_id:'shared'}),rb=await write(bb,{params:{title:'B',text:'B body'},source_id:'shared'});
  assert.equal(rb.code,200,'no conflict across workspaces');assert.equal((await http('GET','/api/notes/'+ra.j.result.note_id,{cookie:B.cookie})).code,404,'B cannot read A\'s note');
  assert.equal((await http('GET','/api/notes/'+ra.j.result.note_id,{cookie:A.cookie})).j.note.text,'Same body');}
 // ===== 9. MCP: the tool takes source_id and gets the same guarantee
 {const b=await autoBot(A,'MCP bot');const mcp=args=>http('POST','/api/mcp',{key:b.key,body:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'foreman_notes_write',arguments:{...P,task_id:b.t.id,...args}}}});
  const list=await http('POST','/api/mcp',{key:b.key,body:{jsonrpc:'2.0',id:1,method:'tools/list'}});const tool=(list.j.result.tools||[]).find(x=>x.name==='foreman_notes_write');assert.ok(tool.inputSchema.properties.source_id,'the MCP tool declares source_id');
  await mcp({source_id:'m1'});await mcp({source_id:'m1'});assert.equal((await notesOf(A,b.agent.id)).length,1,'an MCP retry with the same source_id is one note');}
 // ===== 10. bot-facing instructions tell the caller how to opt in
 {const cj=fs.readFileSync(path.join(__dirname,'public/js/connect.js'),'utf8');assert.ok(/notes\.write[^']*source_id/.test(cj),'the gateway setup message explains source_id for notes.write');}
 console.log('PASS AUTO note retries: with a source_id, a retry returns the original note and receipt (one note, one list entry, one receipt, one charge, also under concurrency and after a crash before the receipt); a different note under the same identity is rejected; no source_id and different source_ids keep separate notes; the identity includes the job and the workspace; a deleted note is not recreated; MCP and the setup message carry source_id');
})().catch(e=>{console.error(e);process.exit(1)});
