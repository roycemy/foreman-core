// Item D: notes written by older builds. Two shapes exist: list-only notes (production main: random id, no record, no requestId) and
// records written by 831b3fe..f8ea5e8 (random id, requestId, no listed flag). Recovery and new writes must never touch, rewrite or
// duplicate them, and they must still open, list and render. One real duplication path is covered: a request stranded as approved by an
// older build whose note WAS written under a random id; recovery must find that note instead of writing a second one. Offline.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={r,setJ,getJ,als,createAgent,newTask,sha,bust,noteIdFor,jobDetail};';
const ctx={require,module:{exports:{}},process:{env:{}},global:{},console,fetch:async u=>{throw Error('NO NETWORK '+u)},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const handler=ctx.module.exports,f=handler.t;
async function http(method,url,{key,cookie,body}={}){let out;const headers={host:'localhost',origin:'http://localhost'};if(key)headers.authorization='Bearer '+key;if(cookie)headers.cookie='fm_sess='+cookie;
 const res={setHeader(){},status(c){this.code=c;return this},json(j){out={code:this.code||200,j};return out},send(b){out={code:this.code||200,j:b};return out},end(){out={code:this.code||204};return out}};await handler({method,url,headers,body:body||{}},res);return out||{code:0};}
(async()=>{
 const email='a@owner.example',ws='ws_legacy',u={id:'user_a',email,ws};await f.setJ('gl:user:'+f.sha(email),u);await f.setJ('gl:sess:'+f.sha('cookie_a'),{uid:u.id,email,ws});const inA=fn=>f.als.run({ws},fn);
 const bot=await inA(()=>f.createAgent('Old bot','Ops','custom',false,{preset:'balanced'}));const now=Date.now(),iso=ms=>new Date(now-ms).toISOString();
 // ---- seed what older builds left behind
 const listOnly={id:'note_main00001',by:bot.agent.id,title:'From main',text:'List-only note <b>&</b>',at:iso(9e6)};                       // production main
 const recOld={id:'note_rec000001',by:bot.agent.id,title:'From 831b3fe',text:'Record without a flag',at:iso(8e6),requestId:'req_oldexec01',taskId:null}; // 831b3fe..f8ea5e8
 await inA(async()=>{await f.r(['LPUSH','fm:notes',JSON.stringify(listOnly)]);await f.setJ('fm:note:'+recOld.id,recOld);await f.r(['SADD','fm:noteids',recOld.id]);await f.r(['LPUSH','fm:notes',JSON.stringify(recOld)]);
  await f.setJ('fm:req:req_oldexec01',{id:'req_oldexec01',agentId:bot.agent.id,action:'notes.write',status:'executed',params:{title:recOld.title,text:recOld.text},rawParams:{title:recOld.title,text:recOld.text},detailsHash:'x',result:{note_id:recOld.id},decidedAt:iso(8e6)});});
 const snap=async()=>JSON.stringify([await inA(()=>f.r(['GET','fm:note:'+recOld.id])),await inA(()=>f.r(['GET','fm:note:'+listOnly.id]))]);const before=await snap();
 const listIds=async()=>(await inA(()=>f.r(['LRANGE','fm:notes',0,99]))).map(x=>JSON.parse(x).id);
 // ---- new approvals and a crash recovery run alongside them
 const t=await inA(()=>f.newTask({title:'New job',assignee:bot.agent.id}));await http('GET','/api/gateway/tasks/next',{key:bot.key});
 const pr=await http('POST','/api/gateway/act',{key:bot.key,body:{action:'notes.write',task_id:t.id,params:{title:'New',text:'New note'}}});const q=await inA(()=>f.getJ('fm:req:'+pr.j.request_id));
 assert.equal((await http('POST','/api/requests/'+q.id+'/approve',{cookie:'cookie_a',body:{detailsHash:q.detailsHash}})).j.request.status,'executed');
 assert.equal(await snap(),before,'older notes are byte-identical after new writes');
 const ids=await listIds();assert.equal(ids.filter(x=>x===listOnly.id).length,1);assert.equal(ids.filter(x=>x===recOld.id).length,1,'each older note is in the recent list exactly once');
 // ---- they still open and render
 const g1=await http('GET','/api/notes/'+listOnly.id,{cookie:'cookie_a'});assert.equal(g1.code,200);assert.deepEqual([g1.j.note.title,g1.j.note.text,g1.j.legacy],[listOnly.title,listOnly.text,true],'a list-only note opens');
 const g2=await http('GET','/api/notes/'+recOld.id,{cookie:'cookie_a'});assert.equal(g2.code,200);assert.equal(g2.j.note.text,recOld.text);assert.equal(g2.j.link.requestId,'req_oldexec01','an 831b3fe record opens with its link');
 const st=(await http('GET','/api/state',{cookie:'cookie_a'})).j.notes.map(n=>n.id);assert.ok(st.includes(listOnly.id)&&st.includes(recOld.id),'they are listed');
 // ---- a request stranded by an older build whose note WAS written (random id): recovery must not write a second one
 for(const [label,shape] of [['831b3fe record with requestId','record'],['main list-only note','list']]){
  const t2=await inA(()=>f.newTask({title:'Stranded '+label,assignee:bot.agent.id}));await http('POST','/api/gateway/tasks/'+t.id+'/complete',{key:bot.key,body:{result:'done'}}).catch(()=>{});
  const rid='req_strand_'+shape,params={title:'Stranded '+shape,text:'Written before the upgrade'},decided=iso(10*60000);
  const hash=f.sha(JSON.stringify(['notes.write',params]));
  const old={id:'note_strand'+(shape==='record'?'r':'l')+'01',by:bot.agent.id,...params,at:iso(9*60000),...(shape==='record'?{requestId:rid,taskId:t2.id}:{})};
  await inA(async()=>{await f.setJ('fm:req:'+rid,{id:rid,agentId:bot.agent.id,agentName:'Old bot',action:'notes.write',status:'approved',params,rawParams:params,detailsHash:hash,decidedAt:decided,createdAt:decided,taskId:t2.id});await f.r(['SADD','fm:reqs',rid]);await f.r(['SADD','fm:taskreqs:'+t2.id,rid]);
   if(shape==='record'){await f.setJ('fm:note:'+old.id,old);await f.r(['SADD','fm:noteids',old.id]);}await f.r(['LPUSH','fm:notes',JSON.stringify(old)]);f.bust();});
  const nBefore=(await listIds()).length,recBefore=(await inA(()=>f.r(['SMEMBERS','fm:noteids']))).length;
  const rc=await http('POST','/api/requests/'+rid+'/recover',{cookie:'cookie_a'});assert.equal(rc.code,200,label+': '+JSON.stringify(rc.j));
  const after=await inA(()=>f.getJ('fm:req:'+rid));assert.equal(after.status,'executed');assert.equal(after.result.note_id,old.id,label+': recovery points at the note the older build wrote');
  assert.equal((await listIds()).length,nBefore,label+': no second note in the list');assert.equal((await inA(()=>f.r(['SMEMBERS','fm:noteids']))).length,recBefore,label+': no new note record');
  assert.equal(await inA(()=>f.getJ('fm:note:'+f.noteIdFor(rid))),null,label+': nothing written under the new id');
  const g=await http('GET','/api/notes/'+old.id+'?request='+rid,{cookie:'cookie_a'});assert.equal(g.code,200);assert.equal(g.j.note.text,params.text,label+': it opens');}
 // ---- an older list-only note that is NOT this request's (other text, or written before the approval) is never adopted
 {const rid='req_strand_other',params={title:'Fresh',text:'Never written'},decided=iso(10*60000),hash=f.sha(JSON.stringify(['notes.write',params]));
  const t3=await inA(()=>f.newTask({title:'Other',assignee:bot.agent.id}));
  await inA(async()=>{await f.r(['LPUSH','fm:notes',JSON.stringify({id:'note_before001',by:bot.agent.id,...params,at:iso(20*60000)})]);await f.setJ('fm:req:'+rid,{id:rid,agentId:bot.agent.id,agentName:'Old bot',action:'notes.write',status:'approved',params,rawParams:params,detailsHash:hash,decidedAt:decided,createdAt:decided,taskId:t3.id});await f.r(['SADD','fm:reqs',rid]);f.bust();});
  assert.equal((await http('POST','/api/requests/'+rid+'/recover',{cookie:'cookie_a'})).code,200);const q3=await inA(()=>f.getJ('fm:req:'+rid));
  assert.equal(q3.result.note_id,f.noteIdFor(rid),'a same-text note written BEFORE the approval is not this request\'s: a new note is written');}
 // ---- two separate requests with identical text must not both adopt the same older note: one adopts it, the other writes its own, and
 //      deleting the adopted note touches only the request that adopted it
 {const params={title:'Daily digest',text:'Same words twice'},decided=iso(10*60000),hash=f.sha(JSON.stringify(['notes.write',params]));
  const t4=await inA(()=>f.newTask({title:'Twins',assignee:bot.agent.id}));const only={id:'note_twin000001',by:bot.agent.id,...params,at:iso(9*60000)};
  await inA(async()=>{await f.r(['LPUSH','fm:notes',JSON.stringify(only)]);
   for(const rid of ['req_twin_a','req_twin_b']){await f.setJ('fm:req:'+rid,{id:rid,agentId:bot.agent.id,agentName:'Old bot',action:'notes.write',status:'approved',params,rawParams:params,detailsHash:hash,decidedAt:decided,createdAt:decided,taskId:t4.id});await f.r(['SADD','fm:reqs',rid]);await f.r(['SADD','fm:taskreqs:'+t4.id,rid]);}f.bust();});
  const ra=await http('POST','/api/requests/req_twin_a/recover',{cookie:'cookie_a'}),rb=await http('POST','/api/requests/req_twin_b/recover',{cookie:'cookie_a'});assert.equal(ra.code,200,JSON.stringify(ra.j));assert.equal(rb.code,200,JSON.stringify(rb.j));
  const qa=await inA(()=>f.getJ('fm:req:req_twin_a')),qb=await inA(()=>f.getJ('fm:req:req_twin_b'));
  assert.notEqual(qa.result.note_id,qb.result.note_id,'two requests never share one note');assert.equal(qa.result.note_id,only.id,'the first adopts the older note');assert.equal(qb.result.note_id,f.noteIdFor('req_twin_b'),'the second writes its own');
  assert.equal((await http('POST','/api/requests/req_twin_a/recover',{cookie:'cookie_a'})).code,409,'a repeat of the first is refused, not re-linked');
  const del=await http('POST','/api/notes/'+only.id+'/delete',{cookie:'cookie_a',body:{confirmed:true}});assert.equal(del.code,200);
  assert.equal((await http('GET','/api/notes/'+qb.result.note_id,{cookie:'cookie_a'})).code,200,'deleting the first request\'s note leaves the second request\'s note readable');
  const jd=await http('GET','/api/jobs/'+t4.id,{cookie:'cookie_a'});const ja=jd.j.requests.find(x=>x.id==='req_twin_a'),jb=jd.j.requests.find(x=>x.id==='req_twin_b');assert.deepEqual([ja.noteDeleted===true,jb.noteDeleted===true],[true,false],'only the adopting request shows "Note deleted"');}
 console.log('PASS older notes: list-only and pre-flag records stay byte-identical, listed once, open and render; a request stranded by an older build reuses the note it already wrote instead of writing a second one, and an unrelated earlier note is never adopted');
})().catch(e=>{console.error(e);process.exit(1)});
