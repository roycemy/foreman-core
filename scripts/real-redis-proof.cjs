// Real-Redis proof (local only). Spawns an empty, throwaway redis-server on 127.0.0.1 at an ephemeral port with persistence off, puts a
// tiny local REST shim in front of it that speaks the Upstash REST command protocol (POST a JSON command array, get {result} or {error}),
// and points the UNMODIFIED api/index.js at the shim through KV_REST_API_URL with a dummy, non-secret token. So the app's real store
// adapter r() and the production Lua scripts run on real Redis. This is NOT Upstash: the shim is local code, and Upstash REST behaviour
// end to end is not proven here. No network beyond 127.0.0.1; no cloud resource; nothing persists after exit.
// Usage: node scripts/real-redis-proof.cjs
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path'),net=require('net'),http=require('http'),os=require('os'),{spawn}=require('child_process'),{createRequire}=require('module');
const ROOT=path.join(__dirname,'..'),API=path.join(ROOT,'api/index.js');
const sleep=ms=>new Promise(x=>setTimeout(x,ms));
const freePort=()=>new Promise(ok=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>ok(p));});});
// ---- minimal RESP client (one connection, replies matched in order)
function resp(port){const sock=net.createConnection({host:'127.0.0.1',port});let buf=Buffer.alloc(0);const q=[];
 sock.on('data',d=>{buf=Buffer.concat([buf,d]);for(;;){const r=parse(buf,0);if(!r)break;buf=buf.slice(r.end);const w=q.shift();w&&w(r.v);}});
 function line(b,i){const e=b.indexOf('\r\n',i);return e<0?null:{s:b.slice(i,e).toString(),end:e+2};}
 function parse(b,i){if(i>=b.length)return null;const t=String.fromCharCode(b[i]);const l=line(b,i+1);if(!l)return null;
  if(t==='+')return {v:l.s,end:l.end};if(t==='-')return {v:{__err:l.s},end:l.end};if(t===':')return {v:Number(l.s),end:l.end};
  if(t==='$'){const n=Number(l.s);if(n<0)return {v:null,end:l.end};if(b.length<l.end+n+2)return null;return {v:b.slice(l.end,l.end+n).toString(),end:l.end+n+2};}
  if(t==='*'){const n=Number(l.s);if(n<0)return {v:null,end:l.end};const out=[];let p=l.end;for(let k=0;k<n;k++){const r=parse(b,p);if(!r)return null;out.push(r.v);p=r.end;}return {v:out,end:p};}
  throw Error('bad RESP '+t);}
 return {ready:new Promise((ok,bad)=>{sock.once('connect',ok);sock.once('error',bad);}),
  cmd(args){return new Promise(ok=>{q.push(ok);const parts=args.map(a=>Buffer.from(String(a)));sock.write('*'+parts.length+'\r\n'+parts.map(p=>'$'+p.length+'\r\n').reduce((acc,h,k)=>acc+h+parts[k].toString()+'\r\n',''));});},
  close(){sock.end();}};}
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alter-redis-'));const rport=await freePort();
 const rs=spawn('redis-server',['--bind','127.0.0.1','--port',String(rport),'--save','','--appendonly','no','--protected-mode','yes','--dir',dir,'--daemonize','no','--logfile',''],{stdio:['ignore','pipe','pipe']});
 let rlog='';rs.stdout.on('data',d=>rlog+=d);rs.stderr.on('data',d=>rlog+=d);
 const cleanup=()=>{try{rs.kill('SIGTERM');}catch{}try{fs.rmSync(dir,{recursive:true,force:true});}catch{}};process.on('exit',cleanup);
 let R;for(let i=0;i<50;i++){try{R=resp(rport);await R.ready;break;}catch{await sleep(100);}}
 const info=await R.cmd(['INFO','server']);const ver=(String(info).match(/redis_version:(\S+)/)||[])[1];
 const dbsize0=await R.cmd(['DBSIZE']);const cfg=await R.cmd(['CONFIG','GET','save']),aof=await R.cmd(['CONFIG','GET','appendonly']);
 console.log(`redis-server ${ver} on 127.0.0.1:${rport} (ephemeral port, empty db: DBSIZE=${dbsize0}, save="${cfg[1]}", appendonly=${aof[1]}, dir=${dir})`);
 // ---- local REST shim speaking the Upstash command protocol
 const sport=await freePort();let shimCalls=0;
 const shim=http.createServer((req,res)=>{let body='';req.on('data',d=>body+=d);req.on('end',async()=>{shimCalls++;try{if(req.headers.authorization!=='Bearer local-shim-not-a-secret'){res.writeHead(401);return res.end('{"error":"unauthorized"}');}
   const cmd=JSON.parse(body);const v=await R.cmd(cmd);res.setHeader('content-type','application/json');res.end(JSON.stringify(v&&v.__err?{error:v.__err}:{result:v}));}catch(e){res.writeHead(500);res.end(JSON.stringify({error:String(e.message)}));}});});
 await new Promise(ok=>shim.listen(sport,'127.0.0.1',ok));const SHIM='http://127.0.0.1:'+sport;
 // ---- load the real app against the shim (fetch allowed to the shim only)
 const realFetch=globalThis.fetch,blocked=[];
 function load(){const src=fs.readFileSync(API,'utf8')+'\nmodule.exports.t={r,setJ,getJ,als,createAgent,newTask,sha,bust,noteIdFor,recordCost,jobSpent,CHARGE_ONCE,RECEIPT_ONCE,AGENT_CAS};';
  const ctx={require:createRequire(API),module:{exports:{}},process:{env:{KV_REST_API_URL:SHIM,KV_REST_API_TOKEN:'local-shim-not-a-secret'}},global:{},console:{...console,log(){},warn(){},error(){}},
   fetch:async(u,o)=>{if(String(u).startsWith(SHIM))return realFetch(u,o);blocked.push(String(u));throw Error('NO NETWORK '+u);},setTimeout,clearTimeout,setInterval,clearInterval,URL,URLSearchParams,AbortSignal,Buffer,TextEncoder,TextDecoder};
  vm.runInNewContext(src,ctx);const h=ctx.module.exports;const origR=ctx.r;const st={hook:null,gate:null};
  ctx.r=function(cmd){if(st.gate&&!st.gate.reached&&st.gate.match(cmd)){st.gate.reached=true;const s=h.t.als.getStore();return new Promise(ok=>{st.gate.release=()=>ok(h.t.als.run(s,()=>origR(cmd)));});}
   if(st.hook&&st.hook.match(cmd)){const hh=st.hook;st.hook=null;hh.hit=true;return hh.after?origR(cmd).then(()=>new Promise(()=>{})):new Promise(()=>{});}return origR(cmd);};
  return {h,f:h.t,st};}
 async function call(app,method,url,{key,cookie,body}={}){let out;const headers={host:'localhost',origin:'http://localhost'};if(key)headers.authorization='Bearer '+key;if(cookie)headers.cookie='fm_sess='+cookie;
  const res={setHeader(){},status(c){this.code=c;return this},json(j){out={code:this.code||200,j}},send(b){out={code:this.code||200,j:b}},end(){out={code:this.code||204}}};await app.h({method,url,headers,body:body||{}},res);return out||{code:0};}
 const results=[];const ok=(name,detail)=>{results.push(['PASS',name,detail||'']);console.log('PASS',name,detail?'— '+detail:'');};
 const A=load(),f=A.f;
 // the app really runs on the shim + real Redis (not the in-memory fallback)
 {const hz=await call(A,'GET','/api/health');assert.equal(hz.j.store,'upstash','the app sees a REST store, not memory');await f.r(['SET','fm:probe','x']);assert.equal(await R.cmd(['GET','fm:probe']),'x','a write through the app lands in real Redis');ok('store adapter','app r() → REST shim → redis-server; /api/health store='+hz.j.store);}
 // ---- 1. production Lua on real Redis
 {await f.als.run({ws:'ws_lua'},async()=>{const k=['fm:charged:key1','fm:spend:a:2026-11-11','fm:jobspent:t:g'];
   const a1=await f.r(['EVAL',f.CHARGE_ONCE,3,...k,2,'t1']),a2=await f.r(['EVAL',f.CHARGE_ONCE,3,...k,2,'t2']),b1=await f.r(['EVAL',f.CHARGE_ONCE,2,'fm:charged:key2','fm:spend:a:2026-11-11',2,'t3']);
   assert.deepEqual([a1,a2,b1],[1,0,1],'CHARGE_ONCE returns 1, then 0 for the same key, 1 for a new key');
   assert.deepEqual([await R.cmd(['GET','w:ws_lua:fm:spend:a:2026-11-11']),await R.cmd(['GET','w:ws_lua:fm:jobspent:t:g']),await R.cmd(['GET','w:ws_lua:fm:charged:key1'])],['4','2','t1'],'daily counter 4 (two keys), job counter 2 (once), marker kept');
   const conc=await Promise.all(Array.from({length:20},(_,i)=>f.r(['EVAL',f.CHARGE_ONCE,3,'fm:charged:burst','fm:spend:b:d','fm:jobspent:b:g',2,'c'+i])));
   assert.equal(conc.filter(x=>x===1).length,1,'20 concurrent CHARGE_ONCE with one key: exactly one wins');assert.equal(await R.cmd(['GET','w:ws_lua:fm:spend:b:d']),'2');assert.equal(await R.cmd(['GET','w:ws_lua:fm:jobspent:b:g']),'2');
   const r1=await f.r(['EVAL',f.RECEIPT_ONCE,3,'fm:rcptonce:x','fm:lasthash','fm:receipts','{"id":"rcpt_a"}','h1','v']),r2=await f.r(['EVAL',f.RECEIPT_ONCE,3,'fm:rcptonce:x','fm:lasthash','fm:receipts','{"id":"rcpt_a2"}','h2','v']);
   assert.deepEqual([r1,r2],[1,0],'RECEIPT_ONCE writes once');assert.deepEqual([await R.cmd(['LLEN','w:ws_lua:fm:receipts']),await R.cmd(['GET','w:ws_lua:fm:lasthash'])],[1,'h1'],'one row, head from the first write only');
   await f.r(['SET','fm:cas','old']);assert.deepEqual([await f.r(['EVAL',f.AGENT_CAS,1,'fm:cas','old','new']),await f.r(['EVAL',f.AGENT_CAS,1,'fm:cas','old','x']),await f.r(['EVAL',f.AGENT_CAS,1,'fm:nokey','a','b'])],[1,0,-1],'AGENT_CAS: 1 swap, 0 stale, -1 missing');
   await f.r(['SET','fm:lockx','me','NX','PX',150]);const second=await f.r(['SET','fm:lockx','other','NX','PX',150]);await sleep(250);const third=await f.r(['SET','fm:lockx','other','NX','PX',150]);
   assert.deepEqual([second,third],[null,'OK'],'SET NX PX: held lock refuses, and really expires (the emulator never expires)');
   await f.r(['SET','fm:d1','1']);await f.r(['SET','gl:d2','1']);await f.r(['DEL','fm:d1','gl:d2']);assert.deepEqual([await R.cmd(['EXISTS','w:ws_lua:fm:d1']),await R.cmd(['EXISTS','gl:d2'])],[0,0],'multi-key DEL deletes every key');});
  ok('production Lua + primitives','CHARGE_ONCE (2/3 keys, repeat, 20-way race), RECEIPT_ONCE, AGENT_CAS, SET NX PX real expiry, multi-key DEL; workspace prefix w:<ws>: applied to Lua KEYS');}
 const owner=async(app,tag)=>{const email=tag+'@o.example',ws='ws_'+tag;await app.f.setJ('gl:user:'+app.f.sha(email),{id:'u_'+tag,email,ws});await app.f.setJ('gl:sess:'+app.f.sha('ck_'+tag),{uid:'u_'+tag,email,ws});return {ws,ck:'ck_'+tag,inW:fn=>app.f.als.run({ws},fn)};};
 // ---- 2. Fix 1 interleaving on real Redis
 {const O=await owner(A,'fix1');const bot=await O.inW(()=>f.createAgent('Race bot','Ops','custom',false,{preset:'balanced'}));
  await O.inW(async()=>{const a=await f.getJ('fm:agent:'+bot.agent.id);a.permissions={'notes.write':'AUTO','notes.delete':'AUTO'};a.limits={...(a.limits||{}),dailyCents:100000};await f.setJ('fm:agent:'+a.id,a);});
  const SECRET='DELETED-ON-REAL-REDIS-91';A.st.gate={match:c=>c[0]==='LPUSH'&&c[1]==='fm:notes'&&String(c[2]).includes(SECRET)};
  const w=call(A,'POST','/api/gateway/act',{key:bot.key,body:{action:'notes.write',params:{title:'Race',text:SECRET}}});for(let i=0;i<400&&!A.st.gate.reached;i++)await sleep(5);assert.ok(A.st.gate.reached,'writer paused before its list push');
  const d=call(A,'POST','/api/gateway/act',{key:bot.key,body:{action:'notes.delete',params:{}}});await sleep(300);A.st.gate.release();A.st.gate=null;const [wr,dr]=await Promise.all([w,d]);
  assert.equal(dr.j.status,'completed','delete-all waited and completed');const d2=await call(A,'POST','/api/gateway/act',{key:bot.key,body:{action:'notes.delete',params:{}}});assert.equal(d2.code,200);
  const keys=await R.cmd(['KEYS','w:'+O.ws+':fm:note*']);const vals=[];for(const k of keys){const t=await R.cmd(['TYPE',k]);vals.push(t==='list'?(await R.cmd(['LRANGE',k,0,-1])).join('\n'):t==='string'?await R.cmd(['GET',k]):'');}
  assert.ok(!vals.some(v=>String(v).includes(SECRET)),'no note key in real Redis holds the deleted text (record, list)');
  const st=await call(A,'GET','/api/state',{cookie:O.ck});assert.ok(!JSON.stringify(st.j.notes).includes(SECRET),'/api/state shows no deleted text');
  const g=await call(A,'GET','/api/notes/'+wr.j.result.note_id,{cookie:O.ck});assert.ok(g.code===410&&!JSON.stringify(g.j).includes(SECRET),'GET /api/notes/:id → 410 without content');
  ok('Fix 1 interleaving','writer paused between id-set add and list push; delete-all waits on the real lock; nothing readable after two delete-alls');}
 // ---- 3. Fix 2 crash matrix on real Redis
 {const O=await owner(A,'fix2');const bot=await O.inW(()=>f.createAgent('Old bot','Ops','custom',false,{preset:'balanced'}));const iso=ms=>new Date(Date.now()-ms).toISOString();let n=0,ex=0;
  for(const when of ['before','after'])for(let k=0;k<14;k++){const rid='req_rr_'+(++n),params={title:'Adopted '+n,text:'Older build '+n},hash=f.sha(JSON.stringify(['notes.write',params]));const t=await O.inW(()=>f.newTask({title:'S'+n,assignee:bot.agent.id}));
   await O.inW(async()=>{await f.r(['LPUSH','fm:notes',JSON.stringify({id:'note_rr'+String(n).padStart(4,'0'),by:bot.agent.id,...params,at:iso(9*60000)})]);await f.setJ('fm:req:'+rid,{id:rid,agentId:bot.agent.id,agentName:'Old bot',action:'notes.write',status:'approved',params,rawParams:params,detailsHash:hash,decidedAt:iso(6e5),createdAt:iso(6e5),taskId:t.id});await f.r(['SADD','fm:reqs',rid]);await f.r(['SADD','fm:taskreqs:'+t.id,rid]);f.bust();});
   let armed=false,seen=0;const hh={match:c=>{if(!armed){if(c[0]==='EVAL'&&/^fm:charged:/.test(String(c[3])))armed=true;else return false;}return seen++===k;},hit:false,after:when==='after'};
   A.st.hook=hh;call(A,'POST','/api/requests/'+rid+'/recover',{cookie:O.ck}).catch(()=>{});for(let i=0;i<300&&!hh.hit;i++)await sleep(5);A.st.hook=null;if(!hh.hit){await sleep(30);continue;}ex++;
   await O.inW(async()=>{await f.r(['DEL','fm:joblock:'+t.id]);const x=await f.getJ('fm:req:'+rid);if(x.recoverStartedAt)x.recoverStartedAt=iso(3e5);await f.setJ('fm:req:'+rid,x);f.bust();});
   await call(A,'POST','/api/requests/'+rid+'/recover',{cookie:O.ck});await call(A,'POST','/api/requests/'+rid+'/recover',{cookie:O.ck});
   const rows=(await R.cmd(['LRANGE','w:'+O.ws+':fm:receipts',0,-1])).map(x=>JSON.parse(x));const mine=rows.filter(x=>x.requestId===rid&&x.outcome==='completed');
   assert.equal(mine.length,1,when+' #'+k+': one receipt row');for(let i=0;i<rows.length-1;i++)assert.equal(rows[i].prevHash,rows[i+1].hash,when+' #'+k+': chain link '+i);
   assert.equal((await O.inW(()=>f.getJ('fm:req:'+rid))).status,'executed');}
  ok('Fix 2 crash matrix',ex+' crash points before/after each command after the charge; recovery run twice; one receipt row, unbroken chain, all in real Redis');}
 // ---- 4. budget double-count case on real Redis: crash at the charge boundary, recover, 520 more charges, retry the old request
 {const O=await owner(A,'budget');const day=new Date().toISOString().slice(0,10);let n=0,ex=0;
  for(const [when,k] of [['before',0],['after',0],['before',1],['after',1]]){const bot=await O.inW(()=>f.createAgent('Budget bot '+(++n),'Ops','custom',false,{preset:'balanced'}));const t=await O.inW(()=>f.newTask({title:'Budget job '+n,assignee:bot.agent.id}));
   await O.inW(async()=>{const a=await f.getJ('fm:agent:'+bot.agent.id);a.permissionScope='job';await f.setJ('fm:agent:'+a.id,a);const tk=await f.getJ('fm:task:'+t.id);tk.jobGrant={id:'grant_'+n,agentId:a.id,actions:{'notes.write':'ASK'},budgetCents:100000,spentCents:0,status:'active',createdAt:new Date().toISOString()};await f.setJ('fm:task:'+t.id,tk);});
   await call(A,'GET','/api/gateway/tasks/next',{key:bot.key});const pr=await call(A,'POST','/api/gateway/act',{key:bot.key,body:{action:'notes.write',task_id:t.id,params:{title:'B'+n,text:'b'+n}}});const q=await O.inW(()=>f.getJ('fm:req:'+pr.j.request_id));
   let armed=false,seen=0;const hh={match:c=>{if(!armed){if(c[0]==='EVAL'&&/^fm:charged:/.test(String(c[3])))armed=true;else return false;}return seen++===k;},hit:false,after:when==='after'};
   A.st.hook=hh;call(A,'POST','/api/requests/'+q.id+'/approve',{cookie:O.ck,body:{detailsHash:q.detailsHash}}).catch(()=>{});for(let i=0;i<300&&!hh.hit;i++)await sleep(5);A.st.hook=null;assert.ok(hh.hit);ex++;
   const ledger=async()=>O.inW(async()=>{const tk=await f.getJ('fm:task:'+t.id);return f.jobSpent(t.id,tk.jobGrant);}),daily=async()=>Number(await O.inW(()=>f.r(['GET','fm:spend:'+bot.agent.id+':'+day])))||0;
   const part=[await daily(),await ledger()];assert.ok(part[0]===part[1]&&(part[0]===0||part[0]===2),when+' #'+k+': never partial '+JSON.stringify(part));
   await O.inW(async()=>{await f.r(['DEL','fm:joblock:'+t.id]);await f.r(['DEL','fm:notelock:'+f.noteIdFor(q.id)]);const x=await f.getJ('fm:req:'+q.id);x.decidedAt=new Date(Date.now()-3e5).toISOString();if(x.recoverStartedAt)x.recoverStartedAt=x.decidedAt;await f.setJ('fm:req:'+q.id,x);f.bust();});
   await call(A,'POST','/api/requests/'+q.id+'/recover',{cookie:O.ck});assert.deepEqual([await daily(),await ledger()],[2,2],when+' #'+k+': exactly once after recovery');
   const a=await O.inW(()=>f.getJ('fm:agent:'+bot.agent.id));for(let i=0;i<520;i++)await O.inW(()=>f.recordCost(a,'notes.write',t.id,'pad_'+n+'_'+i));
   const [d0,l0]=[await daily(),await ledger()];await O.inW(()=>f.recordCost(a,'notes.write',t.id,q.id));await O.inW(()=>f.recordCost(a,'notes.write',t.id,q.id));
   assert.deepEqual([await daily(),await ledger()],[d0,l0],when+' #'+k+': retry of the old request after 520 more charges changes nothing');}
  ok('budget double-count case',ex+' crash points at the charge boundary; never partial; once after recovery; old-request retry after 520 more charges is a no-op');}
 // ---- 5. scripted end-to-end job (scripted stand-in bot, not a real bot): pick up, approval, note saved, read back after a reload
 {const O=await owner(A,'e2e');const bot=await O.inW(()=>f.createAgent('Scripted stand-in','Ops','custom',false,{preset:'balanced'}));
  const t=await call(A,'POST','/api/tasks',{cookie:O.ck,body:{title:'Write the Monday plan note',assignee:bot.agent.id}});assert.equal(t.code,200);
  const claim=await call(A,'GET','/api/gateway/tasks/next',{key:bot.key});assert.equal(claim.j.task.title,'Write the Monday plan note','the bot picks up the job');
  const BODY='Monday plan\n1. Clear the inbox & <triage>\n2. Review receipts';
  const pr=await call(A,'POST','/api/gateway/act',{key:bot.key,body:{action:'notes.write',task_id:claim.j.task.id,params:{title:'Monday plan',text:BODY}}});assert.equal(pr.code,202,'the note waits for the owner');
  const q=await O.inW(()=>f.getJ('fm:req:'+pr.j.request_id));const ap=await call(A,'POST','/api/requests/'+q.id+'/approve',{cookie:O.ck,body:{detailsHash:q.detailsHash}});assert.equal(ap.j.request.status,'executed','the owner approves; the note is saved');
  const done=await call(A,'POST','/api/gateway/tasks/'+claim.j.task.id+'/complete',{key:bot.key,body:{result:'Saved the Monday plan note'}});assert.equal(done.code,200,'the job completes');
  const B=load(); // a "reload": a fresh app instance with no in-process state, reading the same real Redis
  const g=await call(B,'GET','/api/notes/'+ap.j.request.result.note_id,{cookie:O.ck});assert.equal(g.code,200);assert.equal(g.j.note.text,BODY,'after reload the stored note reads back exactly');assert.equal(g.j.link.taskId,claim.j.task.id,'linked to its job');
  const jd=await call(B,'GET','/api/jobs/'+claim.j.task.id,{cookie:O.ck});assert.equal(jd.j.task.status,'done');assert.ok(jd.j.receipts.some(x=>x.requestId===q.id&&x.outcome==='completed'),'the job shows the completed receipt');
  ok('scripted end-to-end job','scripted stand-in bot (not a real bot): claim → ASK → owner approve → note saved → job done → read back from real Redis by a fresh app instance');}
 assert.equal(blocked.length,0,'no network beyond the local shim: '+blocked.join(','));
 console.log(`\nreal-redis proof: ${results.length}/${results.length} groups passed; ${shimCalls} REST calls through the local shim; redis ${ver}; no outbound network`);
 shim.close();const gone=new Promise(ok=>rs.once('exit',ok));R.cmd(['SHUTDOWN','NOSAVE']).catch(()=>{});await Promise.race([gone,sleep(3000)]);R.close();cleanup();
 console.log('redis-server stopped; temp dir removed');process.exit(0);
})().catch(e=>{console.error('FAIL',e&&e.stack||e);process.exit(1);});
