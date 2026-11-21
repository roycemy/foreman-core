// Fix 1: a plain AUTO notes.write (no source_id, no job) wrote the record, added the id to fm:noteids, then pushed the full text to the
// recent list, without the note lock. A writer paused between the id-set add and the list push, a bot delete-all run meanwhile, then the
// late push put the deleted text back in the recent list; a second delete-all kept it, because the tombstone counted as a live record.
// After a delete-all the deleted text must not be readable through the note record, the recent-notes list, /api/state or GET /api/notes/:id,
// including after a second delete-all. A gate holds the writer's list push until released. Real handler, offline.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={r,setJ,getJ,als,createAgent,sha};';
const ctx={require,module:{exports:{}},process:{env:{}},global:{},console:{...console,log(){},warn(){},error(){}},fetch:async u=>{throw Error('NO NETWORK '+u)},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const h=ctx.module.exports,f=h.t;const sleep=ms=>new Promise(x=>setTimeout(x,ms));
const origR=ctx.r;let gate=null;ctx.r=function(cmd){if(gate&&!gate.reached&&gate.match(cmd)){gate.reached=true;const store=f.als.getStore();return new Promise(res=>{gate.release=()=>res(f.als.run(store,()=>origR(cmd)));}); /* replay in the caller's workspace */}return origR(cmd);};
async function http(method,url,{key,cookie,body}={}){let out;const headers={host:'localhost',origin:'http://localhost'};if(key)headers.authorization='Bearer '+key;if(cookie)headers.cookie='fm_sess='+cookie;
 const res={setHeader(){},status(c){this.code=c;return this},json(j){out={code:this.code||200,j}},send(b){out={code:this.code||200,j:b}},end(){out={code:this.code||204}}};await handler(method,url,headers,body,res);return out||{code:0};}
async function handler(method,url,headers,body,res){await h({method,url,headers,body:body||{}},res);}
(async()=>{
 const email='d@o.example',ws='ws_race';await f.setJ('gl:user:'+f.sha(email),{id:'u',email,ws});await f.setJ('gl:sess:'+f.sha('ck'),{uid:'u',email,ws});const inW=fn=>f.als.run({ws},fn);
 const bot=await inW(()=>f.createAgent('Race bot','Ops','custom',false,{preset:'balanced'}));
 await inW(async()=>{const a=await f.getJ('fm:agent:'+bot.agent.id);a.permissions={'notes.write':'AUTO','notes.delete':'AUTO'};a.limits={...(a.limits||{}),dailyCents:100000};await f.setJ('fm:agent:'+a.id,a);});
 const SECRET='DELETED-TEXT-7f3a';
 const leaks=async label=>{
  const list=await inW(()=>f.r(['LRANGE','fm:notes',0,99]));assert.ok(!list.some(x=>x.includes(SECRET)),label+': the recent-notes list holds no deleted text');
  const st=await http('GET','/api/state',{cookie:'ck'});assert.ok(!JSON.stringify(st.j.notes||[]).includes(SECRET),label+': /api/state shows no deleted text');
  for(const id of await inW(()=>f.r(['SMEMBERS','fm:noteids']))){const rec=await inW(()=>f.getJ('fm:note:'+id));assert.ok(!rec||!JSON.stringify(rec).includes(SECRET),label+': no note record holds the deleted text ('+id+')');
   const g=await http('GET','/api/notes/'+id,{cookie:'ck'});assert.ok(!JSON.stringify(g.j||{}).includes(SECRET),label+': GET /api/notes/'+id+' returns no deleted text');}};
 // a plain AUTO write pauses right before its list push (after the record and the id-set add)
 gate={match:c=>c[0]==='LPUSH'&&c[1]==='fm:notes'&&String(c[2]).includes(SECRET)};
 const w=http('POST','/api/gateway/act',{key:bot.key,body:{action:'notes.write',params:{title:'Race note',text:SECRET}}});
 for(let i=0;i<400&&!gate.reached;i++)await sleep(5);assert.ok(gate.reached,'the writer is paused before its list push');
 // the bot's delete-all runs while the writer is paused; the writer is released shortly after
 const d=http('POST','/api/gateway/act',{key:bot.key,body:{action:'notes.delete',params:{}}});
 await sleep(300);gate.release();gate=null;
 const [wr,dr]=await Promise.all([w,d]);assert.equal(wr.code,200,JSON.stringify(wr.j));assert.equal(dr.code,200,JSON.stringify(dr.j));
 assert.equal(dr.j.status,'completed','the delete-all completes (it waits for the in-flight write instead of racing it)');
 const nid=wr.j.result&&wr.j.result.note_id;assert.ok(nid,'the write returned its note id');
 const rec=await inW(()=>f.getJ('fm:note:'+nid));assert.ok(rec&&rec.deleted,'the written note ends deleted');
 await leaks('after the racing delete-all');
 // a second delete-all must not resurrect or keep anything
 const d2=await http('POST','/api/gateway/act',{key:bot.key,body:{action:'notes.delete',params:{}}});assert.equal(d2.code,200);
 await leaks('after a second delete-all');
 // a stale list copy of an already-deleted note (as an older build could leave) is removed by delete-all; the tombstone is not a live record
 await inW(async()=>{await f.setJ('fm:note:note_stale0001',{id:'note_stale0001',deleted:true,deletedAt:new Date().toISOString()});await f.r(['SADD','fm:noteids','note_stale0001']);
  await f.r(['LPUSH','fm:notes',JSON.stringify({id:'note_stale0001',by:bot.agent.id,title:'Stale',text:SECRET,at:new Date().toISOString()})]);});
 await http('POST','/api/gateway/act',{key:bot.key,body:{action:'notes.delete',params:{}}});
 await leaks('after a delete-all with a stale copy of a deleted note in the list');
 // a plain AUTO write with no delete still works and is listed once
 const ok=await http('POST','/api/gateway/act',{key:bot.key,body:{action:'notes.write',params:{title:'Kept',text:'kept body'}}});assert.equal(ok.code,200);
 const list=(await inW(()=>f.r(['LRANGE','fm:notes',0,99]))).map(x=>JSON.parse(x));assert.equal(list.filter(x=>x.id===ok.j.result.note_id).length,1,'a normal plain write is listed exactly once');
 console.log('PASS plain AUTO note vs delete-all: a delete-all that overlaps a plain AUTO write waits for it and then deletes it; no deleted text survives in the note record, the recent list, /api/state or GET /api/notes/:id, also after a second delete-all; a stale list copy of a deleted note is removed; a normal plain write is listed once');
})().catch(e=>{console.error(e);process.exit(1)});
