// A saved note can be opened afterwards: GET /api/notes/:id returns the server-stored note (its full approved body, the bot, the time)
// and a link to the job and request that wrote it, which the server validates (the request is the notes.write that wrote this note id,
// by this bot, and its approval fingerprint matches the stored note). Older notes stay readable past the 10 in /api/state and past the
// 100-entry list; a note written before this change is still readable. Another workspace, no session and a bot key are refused, and
// notes.delete removes the durable records too. The shared receipt carries nothing of the note. Real handler; offline.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path'),crypto=require('crypto');
const src=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={r,setJ,getJ,als,createAgent,newTask,sha,jobDetail};';
const calls=[];const ctx={require,module:{exports:{}},process:{env:{}},global:{},console,fetch:async u=>{calls.push(String(u));throw Error('NO NETWORK '+u)},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const handler=ctx.module.exports,f=handler.t;
async function http(method,url,{key,cookie,body}={}){let out;const headers={host:'localhost',origin:'http://localhost'};if(key)headers.authorization='Bearer '+key;if(cookie)headers.cookie='fm_sess='+cookie;
 const res={setHeader(){},status(c){this.code=c;return this},json(j){out={code:this.code||200,j};return out},send(b){out={code:this.code||200,j:b};return out},end(){out={code:this.code||204};return out}};
 await handler({method,url,headers,body:body||{}},res);return out||{code:0};}
async function owner(tag){const email=tag+'@owner.example',ws='ws_'+tag,u={id:'user_'+tag,email,ws};await f.setJ('gl:user:'+f.sha(email),u);await f.setJ('gl:sess:'+f.sha('cookie_'+tag),{uid:u.id,email,ws});return {ws,cookie:'cookie_'+tag};}
(async()=>{
 const A=await owner('a'),B=await owner('b');
 const bot=await f.als.run({ws:A.ws},()=>f.createAgent('Note Bot','Ops','custom',false,{preset:'balanced'}));
 const botB=await f.als.run({ws:B.ws},()=>f.createAgent('Other Bot','Ops','custom',false,{preset:'balanced'}));
 const BODY='Monday plan\n1. Clear the inbox & <triage>\n2. Review receipts\n'+'z'.repeat(1200);
 // one approved note on a job, through the real routes
 const job=await f.als.run({ws:A.ws},()=>f.newTask({title:'Write the Monday plan note',assignee:bot.agent.id}));
 await http('GET','/api/gateway/tasks/next',{key:bot.key});
 const pr=await http('POST','/api/gateway/act',{key:bot.key,body:{action:'notes.write',task_id:job.id,params:{title:'Monday plan',text:BODY}}});assert.equal(pr.code,202);
 const q=await f.als.run({ws:A.ws},()=>f.getJ('fm:req:'+pr.j.request_id));
 const ap=await http('POST','/api/requests/'+q.id+'/approve',{cookie:A.cookie,body:{detailsHash:q.detailsHash}});assert.equal(ap.j.request.status,'executed');
 const noteId=ap.j.request.result.note_id;
 await http('POST','/api/gateway/tasks/'+job.id+'/complete',{key:bot.key,body:{result:'Bot says: done (this text must not stand in for the note).'}});
 // 1. approved-body readback: the stored note, in full, with bot and time
 const g=await http('GET','/api/notes/'+noteId,{cookie:A.cookie});assert.equal(g.code,200,JSON.stringify(g.j));
 assert.deepEqual([g.j.note.title,g.j.note.text],[q.params.title,q.params.text],'the full approved body, exactly');assert.equal(g.j.note.text.length,BODY.length);
 assert.equal(g.j.note.botName,'Note Bot');assert.ok(Date.parse(g.j.note.at)>0,'saved time');assert.ok(!/Bot says/.test(JSON.stringify(g.j)),'not the bot\'s completion text');
 // 2. job linkage, validated by the server
 assert.deepEqual([g.j.link.requestId,g.j.link.taskId,g.j.link.taskTitle,g.j.link.matchesApproval],[q.id,job.id,'Write the Monday plan note',true],'linked to its job and request; matches the approval');
 const jd=await http('GET','/api/jobs/'+job.id,{cookie:A.cookie});const jr=jd.j.requests.find(x=>x.id===q.id);assert.equal(jr.result.note_id,noteId,'the job receipt carries the note id to open');
 // a misleading hint does not create a link: another request's id
 const other=await f.als.run({ws:A.ws},()=>f.newTask({title:'Other job',assignee:bot.agent.id}));
 // 3. older notes: write 105 more (AUTO for this test agent), then the first note is past the 10 in state and past the 100-entry list
 await f.als.run({ws:A.ws},async()=>{const a=await f.getJ('fm:agent:'+bot.agent.id);a.permissions={...(a.permissions||{}),'notes.write':'AUTO','notes.delete':'AUTO'};a.limits={...(a.limits||{}),dailyCents:100000};await f.setJ('fm:agent:'+bot.agent.id,a);});
 for(let i=0;i<105;i++){const x=await http('POST','/api/gateway/act',{key:bot.key,body:{action:'notes.write',params:{title:'Filler '+i,text:'filler'}}});assert.equal(x.code,200,JSON.stringify(x.j));}
 const st=await http('GET','/api/state',{cookie:A.cookie});assert.ok(!st.j.notes.some(n=>n.id===noteId),'not among the notes in /api/state');
 const listLen=(await f.als.run({ws:A.ws},()=>f.r(['LRANGE','fm:notes',0,999]))).length;assert.equal(listLen,100,'the list is still capped at 100');
 const old=await http('GET','/api/notes/'+noteId,{cookie:A.cookie});assert.equal(old.code,200,'an older note is still readable');assert.equal(old.j.note.text,BODY);assert.equal(old.j.link.taskId,job.id);
 const hinted=await http('GET','/api/notes/'+noteId+'?request='+encodeURIComponent('req_'+'0'.repeat(20)),{cookie:A.cookie});assert.equal(hinted.j.link.requestId,q.id,'a stored link is not replaced by a hint');
 // 4. a note written before this change (only in the list, no durable record) is still readable; a hint links it only if the server validates it
 const legacy={id:'note_legacy0001',by:bot.agent.id,title:'Old note',text:'Written before durable notes',at:'2026-11-01T10:00:00.000Z'};
 await f.als.run({ws:A.ws},()=>f.r(['LPUSH','fm:notes',JSON.stringify(legacy)]));await f.als.run({ws:A.ws},()=>f.r(['LTRIM','fm:notes',0,99]));
 const lg=await http('GET','/api/notes/'+legacy.id+'?request='+q.id,{cookie:A.cookie});assert.equal(lg.code,200);assert.equal(lg.j.note.text,legacy.text);assert.equal(lg.j.link,null,'a request that did not write this note does not link it');
 // 5. cross-workspace and role denial
 assert.equal((await http('GET','/api/notes/'+noteId,{cookie:B.cookie})).code,404,'another workspace cannot read it');
 assert.equal((await http('GET','/api/notes/'+noteId)).code,401,'no session cannot read it');
 const bk=await http('GET','/api/notes/'+noteId,{key:bot.key});assert.ok([401,404].includes(bk.code),'a bot key cannot read it through the owner route (got '+bk.code+')');
 assert.equal((await http('GET','/api/notes/'+noteId,{key:botB.key})).code===200,false);
 assert.equal((await http('GET','/api/notes/not-a-note',{cookie:A.cookie})).code,404,'malformed id');
 // 6. the shared receipt carries nothing of the note
 const rv=await http('POST','/api/public-receipts/review',{cookie:A.cookie,body:{taskId:job.id,title:'Weekly planning',summary:'A short planning note for the week.',template:'Weekly planning',budgetCents:0}});
 assert.equal(rv.code,200,JSON.stringify(rv.j));const sj=JSON.stringify(rv.j.snapshot);for(const leak of ['Monday plan','Clear the inbox',noteId,'note_'])assert.ok(!sj.includes(leak),'shared receipt leaks '+leak);
 // 7. notes.delete still deletes everything, durable records included
 const del=await http('POST','/api/gateway/act',{key:bot.key,body:{action:'notes.delete',params:{}}});assert.equal(del.code,200,JSON.stringify(del.j));
 {const gone=await http('GET','/api/notes/'+noteId,{cookie:A.cookie});assert.equal(gone.code,410,'a deleted note reads as deleted');assert.ok(!JSON.stringify(gone.j).includes('Clear the inbox'),'with no content');
  const tomb=await f.als.run({ws:A.ws},()=>f.getJ('fm:note:'+noteId));assert.ok(tomb.deleted&&!('text' in tomb)&&!('title' in tomb),'only a content-free tombstone remains');}
 assert.equal(calls.length,0,'no network');
 console.log('PASS note readback: full approved body, bot and time from the stored note; server-validated job and request link; older notes past the 10 in state and the 100-entry list; pre-change notes readable; other workspace, no session and bot keys refused; nothing in the shared receipt; notes.delete removes durable notes');
})().catch(e=>{console.error(e);process.exit(1)});
