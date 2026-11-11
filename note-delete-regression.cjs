// Item F: the owner can delete a saved note. POST /api/notes/:id/delete with {confirmed:true}: owner session, same origin, own workspace.
// Under the same lock as writes, the record becomes a content-free tombstone ({id, deleted, deletedAt}) and its recent-list entry is
// removed (LREM, so a concurrent write of another note is not lost). The tombstone stays so nothing recreates the note: not recovery of
// the same approved request, not a retry, not the bot's delete-all. Receipts that link to it say the note was deleted. Offline.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={r,setJ,getJ,als,createAgent,newTask,sha,bust,noteIdFor,jobDetail};';
const ctx={require,module:{exports:{}},process:{env:{}},global:{},console,fetch:async u=>{throw Error('NO NETWORK '+u)},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const handler=ctx.module.exports,f=handler.t;const sleep=ms=>new Promise(x=>setTimeout(x,ms));
const origR=ctx.r;let hook=null,gate=null,spy=null;ctx.r=function(cmd){if(spy)spy.push(cmd.slice(0,3).map(String)); if(gate&&!gate.reached&&gate.match(cmd)){gate.reached=true;return new Promise(res=>{gate.release=()=>res(origR(cmd));});} /* a gate holds one command until released */ if(hook&&hook.match(cmd)){const h=hook;hook=null;h.hit=true;return new Promise(()=>{});}return origR(cmd);};
async function crashDuring(match,fn){const h={match,hit:false};hook=h;fn().catch(()=>{});for(let i=0;i<600&&!h.hit;i++)await sleep(5);hook=null;assert.ok(h.hit,'the fault was injected');}
async function http(method,url,{key,cookie,body,origin}={}){let out;const headers={host:'localhost',origin:origin||'http://localhost'};if(key)headers.authorization='Bearer '+key;if(cookie)headers.cookie='fm_sess='+cookie;
 const res={setHeader(){},status(c){this.code=c;return this},json(j){out={code:this.code||200,j};return out},send(b){out={code:this.code||200,j:b};return out},end(){out={code:this.code||204};return out}};await handler({method,url,headers,body:body||{}},res);return out||{code:0};}
async function owner(tag){const email=tag+'@owner.example',ws='ws_'+tag,u={id:'user_'+tag,email,ws};await f.setJ('gl:user:'+f.sha(email),u);await f.setJ('gl:sess:'+f.sha('cookie_'+tag),{uid:u.id,email,ws});return {ws,cookie:'cookie_'+tag};}
(async()=>{
 const A=await owner('a'),B=await owner('b');const inA=fn=>f.als.run({ws:A.ws},fn);let n=0;
 async function scenario(){const bot=await inA(()=>f.createAgent('Bot '+(++n),'Ops','custom',false,{preset:'balanced'}));const t=await inA(()=>f.newTask({title:'Job '+n,assignee:bot.agent.id}));
  await http('GET','/api/gateway/tasks/next',{key:bot.key});const pr=await http('POST','/api/gateway/act',{key:bot.key,body:{action:'notes.write',task_id:t.id,params:{title:'Secret plan '+n,text:'Confidential body '+n}}});
  const q=await inA(()=>f.getJ('fm:req:'+pr.j.request_id));return {bot,t,rid:q.id,hash:q.detailsHash};}
 const approve=s=>http('POST','/api/requests/'+s.rid+'/approve',{cookie:A.cookie,body:{detailsHash:s.hash}});
 const del=(id,o={})=>http('POST','/api/notes/'+id+'/delete',{cookie:A.cookie,body:{confirmed:true},...o});
 const list=async()=>(await inA(()=>f.r(['LRANGE','fm:notes',0,99]))).map(x=>JSON.parse(x).id);
 const rec=id=>inA(()=>f.getJ('fm:note:'+id));
 async function age(s){await inA(async()=>{await f.r(['DEL','fm:joblock:'+s.t.id]);await f.r(['DEL','fm:notelock:'+f.noteIdFor(s.rid)]);const q=await f.getJ('fm:req:'+s.rid);q.decidedAt=new Date(Date.now()-5*60000).toISOString();await f.setJ('fm:req:'+s.rid,q);f.bust();});}
 // ===== 1. delete an approved, job-linked note
 const s=await scenario();const nid=(await approve(s)).j.request.result.note_id;assert.ok((await list()).includes(nid));
 assert.equal((await http('POST','/api/notes/'+nid+'/delete',{cookie:A.cookie,body:{}})).code,400,'a delete without the confirm step is refused');assert.ok((await rec(nid)).text,'nothing changed');
 const d1=await del(nid);assert.deepEqual([d1.code,d1.j.deleted],[200,true]);
 const tomb=await rec(nid);assert.ok(tomb.deleted&&tomb.deletedAt,'a tombstone remains');assert.ok(!('title' in tomb)&&!('text' in tomb)&&!('by' in tomb),'it holds no content');
 assert.ok(!(await list()).includes(nid),'the recent-list entry is gone');
 const g=await http('GET','/api/notes/'+nid,{cookie:A.cookie});assert.deepEqual([g.code,g.j.deleted],[410,true],'opening it says it was deleted');assert.ok(!JSON.stringify(g.j).includes('Confidential'),'with no content');
 assert.ok(!(await http('GET','/api/state',{cookie:A.cookie})).j.notes.some(x=>x.id===nid),'not in the state view');
 const jd=await http('GET','/api/jobs/'+s.t.id,{cookie:A.cookie});const jr=jd.j.requests.find(x=>x.id===s.rid);assert.equal(jr.noteDeleted,true,'the job receipt knows the note was deleted');
 const d2=await del(nid);assert.deepEqual([d2.code,d2.j.alreadyDeleted],[200,true],'a second delete is harmless');
 // ===== 2. denial
 {const s2=await scenario();const id2=(await approve(s2)).j.request.result.note_id;
  assert.equal((await http('POST','/api/notes/'+id2+'/delete',{cookie:B.cookie,body:{confirmed:true}})).code,404,'another workspace cannot delete it');
  assert.equal((await http('POST','/api/notes/'+id2+'/delete',{body:{confirmed:true}})).code,401,'no session');
  const bk=await http('POST','/api/notes/'+id2+'/delete',{key:s2.bot.key,body:{confirmed:true}});assert.ok([401,404].includes(bk.code),'a bot key is not an owner (got '+bk.code+')');
  const xo=await del(id2,{origin:'https://evil.example'});assert.deepEqual([xo.code,xo.j.error],[403,'origin'],'cross-origin refused');
  assert.equal((await del('not-a-note')).code,404);assert.ok((await rec(id2)).text,'still intact');}
 // ===== 3. no resurrection: a save interrupted after the note was written, then deleted, then recovered
 {const s3=await scenario();const before=(await inA(()=>f.r(['SMEMBERS','fm:noteids']))).length;
  await crashDuring(c=>c[0]==='EVAL'&&/^fm:charged:/.test(String(c[3])),()=>approve(s3));const id3=f.noteIdFor(s3.rid);assert.ok((await rec(id3)).text,'the note was written before the crash');
  await inA(()=>f.r(['DEL','fm:notelock:'+id3]));assert.equal((await del(id3)).code,200);await age(s3);
  const rc=await http('POST','/api/requests/'+s3.rid+'/recover',{cookie:A.cookie});assert.equal(rc.code,200,JSON.stringify(rc.j));assert.equal(rc.j.request.status,'executed','the request is finished');
  assert.ok((await rec(id3)).deleted&&!(await rec(id3)).text,'recovery did not bring the note back');assert.ok(!(await list()).includes(id3));assert.equal((await inA(()=>f.r(['SMEMBERS','fm:noteids']))).length,before+1,'no second note');}
 // ===== 4. delete racing a recovery: one outcome, nothing resurrected, nothing doubled
 {const s4=await scenario();await crashDuring(c=>c[0]==='EVAL'&&/^fm:charged:/.test(String(c[3])),()=>approve(s4));const id4=f.noteIdFor(s4.rid);await age(s4);
  const [rc,dl]=await Promise.all([http('POST','/api/requests/'+s4.rid+'/recover',{cookie:A.cookie}),del(id4)]);
  assert.equal(rc.code,200,JSON.stringify(rc.j));assert.equal(dl.code,200);assert.ok((await rec(id4)).deleted,'the delete holds');assert.ok(!(await list()).includes(id4));}
 // ===== 5. the bot's delete-all leaves tombstones too, so a later recovery cannot recreate a note
 {const s5=await scenario();await crashDuring(c=>c[0]==='EVAL'&&/^fm:charged:/.test(String(c[3])),()=>approve(s5));const id5=f.noteIdFor(s5.rid);await inA(()=>f.r(['DEL','fm:notelock:'+id5]));
  await inA(async()=>{const a=await f.getJ('fm:agent:'+s5.bot.agent.id);a.permissions={'notes.delete':'AUTO'};await f.setJ('fm:agent:'+a.id,a);});
  assert.equal((await http('POST','/api/gateway/act',{key:s5.bot.key,body:{action:'notes.delete',params:{}}})).code,200);assert.ok((await rec(id5)).deleted&&!(await rec(id5)).text,'delete-all leaves a content-free tombstone');
  await age(s5);assert.equal((await http('POST','/api/requests/'+s5.rid+'/recover',{cookie:A.cookie})).code,200);assert.ok(!(await rec(id5)).text,'not recreated');}
 // ===== 5b. the bot's delete-all takes the note lock: a recovery caught mid-write cannot bring the note back afterwards
 {const s8=await scenario();await crashDuring(c=>c[0]==='SET'&&/^fm:note:/.test(String(c[1])),()=>approve(s8));const id8=f.noteIdFor(s8.rid);await age(s8);
  await inA(async()=>{const a=await f.getJ('fm:agent:'+s8.bot.agent.id);a.permissions={'notes.delete':'AUTO'};await f.setJ('fm:agent:'+a.id,a);});
  gate={match:c=>c[0]==='LPUSH'&&c[1]==='fm:notes'};const rc=http('POST','/api/requests/'+s8.rid+'/recover',{cookie:A.cookie});for(let i=0;i<400&&!gate.reached;i++)await sleep(5);assert.ok(gate.reached,'recovery is held at the moment it lists the note');
  const dl=http('POST','/api/gateway/act',{key:s8.bot.key,body:{action:'notes.delete',params:{}}});await sleep(300);gate.release();gate=null;const [rr,dd]=await Promise.all([rc,dl]);
  assert.equal(rr.code,200,JSON.stringify(rr.j));assert.equal(dd.code,200,JSON.stringify(dd.j));
  assert.ok((await rec(id8)).deleted&&!(await rec(id8)).text,'delete-all won: the note stays deleted, not rewritten by the overlapping recovery');assert.ok(!(await list()).includes(id8),'and is not back in the recent list');
  assert.equal((await http('GET','/api/notes/'+id8,{cookie:A.cookie})).code,410,'it reads as deleted');}
 // ===== 5c. delete-all skips notes that are already deleted (its cost must not grow with every note ever written, and deletedAt must
 //        not be rewritten), and when one note is busy it still deletes the others, then reports the rest as not deleted
 {const old='2026-01-01T00:00:00.000Z';await inA(async()=>{for(let i=0;i<40;i++){const id='note_tomb'+String(i).padStart(4,'0');await f.setJ('fm:note:'+id,{id,deleted:true,deletedAt:old});await f.r(['SADD','fm:noteids',id]);}});
  const sa=await scenario(),sb=await scenario(),sc=await scenario();const [na,nb,nc]=[(await approve(sa)).j.request.result.note_id,(await approve(sb)).j.request.result.note_id,(await approve(sc)).j.request.result.note_id];
  await inA(async()=>{const a=await f.getJ('fm:agent:'+sa.bot.agent.id);a.permissions={'notes.delete':'AUTO'};await f.setJ('fm:agent:'+a.id,a);await f.r(['SET','fm:notelock:'+nb,'held-by-a-live-writer','NX','PX',600000]);});
  spy=[];const d1=await http('POST','/api/gateway/act',{key:sa.bot.key,body:{action:'notes.delete',params:{}}});const cmds=spy;spy=null;
  assert.notEqual(d1.j.status,'completed','a busy note means the delete-all is not reported as complete ('+JSON.stringify(d1.j).slice(0,160)+')');
  assert.ok((await rec(na)).deleted&&(await rec(nc)).deleted,'the notes that were free are deleted');assert.ok((await rec(nb)).text,'the busy note is untouched');
  assert.equal((await rec('note_tomb0000')).deletedAt,old,'an already-deleted note keeps its original deletedAt');
  assert.equal(cmds.filter(c=>c[0]==='SET'&&/^fm:note:note_tomb/.test(c[1])).length,0,'already-deleted notes are not written again');
  const reads=cmds.filter(c=>c[0]==='LRANGE'&&c[1]==='fm:notes').length;assert.ok(reads<=10,'the recent list is read a handful of times, not once per note ever written ('+reads+')');
  await inA(()=>f.r(['DEL','fm:notelock:'+nb]));const d2=await http('POST','/api/gateway/act',{key:sa.bot.key,body:{action:'notes.delete',params:{}}});assert.equal(d2.code,200,JSON.stringify(d2.j));assert.ok((await rec(nb)).deleted,'a second delete-all finishes the rest');}
 // ===== 6. an older list-only note can be deleted too
 {const legacy={id:'note_oldlist01',by:'agent_x',title:'Old',text:'Old body',at:new Date().toISOString()};await inA(()=>f.r(['LPUSH','fm:notes',JSON.stringify(legacy)]));
  assert.equal((await del(legacy.id)).code,200);assert.ok(!(await list()).includes(legacy.id));assert.equal((await http('GET','/api/notes/'+legacy.id,{cookie:A.cookie})).code,410);}
 // ===== 7. a write of another note during a delete keeps its list entry
 {const s6=await scenario();const id6=(await approve(s6)).j.request.result.note_id;const s7=await scenario();
  const [, ap7]=await Promise.all([del(id6),approve(s7)]);const id7=ap7.j.request.result.note_id;const l=await list();assert.ok(!l.includes(id6)&&l.filter(x=>x===id7).length===1,'the other note is listed exactly once');}
 // ===== 8. shared receipts never carry note content, before or after a delete
 {assert.equal((await http('POST','/api/gateway/tasks/'+s.t.id+'/complete',{key:s.bot.key,body:{result:'done'}})).code,200,'the job finishes');const rv=await http('POST','/api/public-receipts/review',{cookie:A.cookie,body:{taskId:s.t.id,title:'Weekly',summary:'A short weekly note.',template:'Weekly',budgetCents:0}});
  assert.equal(rv.code,200,JSON.stringify(rv.j));assert.ok(!/Secret plan|Confidential|note_/.test(JSON.stringify(rv.j.snapshot)));}
 // ===== 9. owner screens: the receipt shows "Note deleted"; the note view offers Delete with a confirm step and handles a deleted note
 {const rj=fs.readFileSync(path.join(__dirname,'public/js/receipts.js'),'utf8');
  assert.ok(/q\.noteDeleted/.test(rj)&&/Note deleted/.test(rj),'the receipt renders a deleted note as "Note deleted", not a link');
  assert.ok(/x\.deleted/.test(rj)&&/This note was deleted/.test(rj),'opening a deleted note says so');
  assert.ok(!/no longer stored/.test(rj),'no claim that the content is gone everywhere: approval and receipt records keep what was approved');
  assert.ok(/approval and receipt records/i.test(rj),'the confirm step and the deleted view say that approval and receipt records may still hold the text');
  assert.ok(/data-note-delete/.test(rj)&&/Delete this note\?/.test(rj)&&/confirmed: true/.test(rj),'Delete asks to confirm and sends confirmed: true');}
 console.log('PASS note delete: owner-only, same-origin, own workspace, confirm required; the note becomes a content-free tombstone and leaves the recent list; a second delete is harmless; recovery, a racing recovery and the bot\'s delete-all cannot bring it back; older list-only notes delete too; a concurrent write is not lost; receipts say the note was deleted; nothing reaches shared receipts');
})().catch(e=>{console.error(e);process.exit(1)});
