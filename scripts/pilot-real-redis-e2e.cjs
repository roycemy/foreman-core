// Two-bot handoff trial, end to end on real Redis (local only). Same harness as scripts/real-redis-proof.cjs: a throwaway redis-server on
// 127.0.0.1 behind a local Upstash-protocol REST shim, the UNMODIFIED api/index.js, scripted stand-in workers. Not Upstash, not a real bot.
// tiny local REST shim in front of it that speaks the Upstash REST command protocol (POST a JSON command array, get {result} or {error}),
// and points the UNMODIFIED api/index.js at the shim through KV_REST_API_URL with a dummy, non-secret token. So the app's real store
// adapter r() and the production Lua scripts run on real Redis. This is NOT Upstash: the shim is local code, and Upstash REST behaviour
// end to end is not proven here. No network beyond 127.0.0.1; no cloud resource; nothing persists after exit.
// Usage: node scripts/pilot-real-redis-e2e.cjs
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
 function load(){const src=fs.readFileSync(API,'utf8')+'\nmodule.exports.t={r,setJ,getJ,als,createAgent,sha};';
  const ctx={require:createRequire(API),module:{exports:{}},process:{env:{KV_REST_API_URL:SHIM,KV_REST_API_TOKEN:'local-shim-not-a-secret'}},global:{},console:{...console,log(){},warn(){},error(){}},
   fetch:async(u,o)=>{if(String(u).startsWith(SHIM))return realFetch(u,o);blocked.push(String(u));throw Error('NO NETWORK '+u);},setTimeout,clearTimeout,setInterval,clearInterval,URL,URLSearchParams,AbortSignal,Buffer,TextEncoder,TextDecoder};
  vm.runInNewContext(src,ctx);const h=ctx.module.exports;const origR=ctx.r;const st={hook:null,gate:null};
  ctx.r=function(cmd){if(st.gate&&!st.gate.reached&&st.gate.match(cmd)){st.gate.reached=true;const s=h.t.als.getStore();return new Promise(ok=>{st.gate.release=()=>ok(h.t.als.run(s,()=>origR(cmd)));});}
   if(st.hook&&st.hook.match(cmd)){const hh=st.hook;st.hook=null;hh.hit=true;return hh.after?origR(cmd).then(()=>new Promise(()=>{})):new Promise(()=>{});}return origR(cmd);};
  return {h,f:h.t,st};}
 async function call(app,method,url,{key,cookie,body}={}){let out;const headers={host:'localhost',origin:'http://localhost'};if(key)headers.authorization='Bearer '+key;if(cookie)headers.cookie='fm_sess='+cookie;
  const res={setHeader(){},status(c){this.code=c;return this},json(j){out={code:this.code||200,j}},send(b){out={code:this.code||200,j:b}},end(){out={code:this.code||204}}};await app.h({method,url,headers,body:body||{}},res);return out||{code:0};}
 const results=[];const ok=(name,detail)=>{results.push(['PASS',name,detail||'']);console.log('PASS',name,detail?'— '+detail:'');};
 const owner=async(app,tag)=>{const email=tag+'@o.example',ws='ws_'+tag;await app.f.setJ('gl:user:'+app.f.sha(email),{id:'u_'+tag,email,ws});await app.f.setJ('gl:sess:'+app.f.sha('ck_'+tag),{uid:'u_'+tag,email,ws});return {ws,ck:'ck_'+tag,inW:fn=>app.f.als.run({ws},fn)};};
 // Two app instances on the same real Redis stand in for two serverless instances; a third, loaded later, is a restart.
 const I1=load(),I2=load(),f=I1.f;
 {const hz=await call(I1,'GET','/api/health');assert.equal(hz.j.store,'upstash');ok('store adapter','both instances use r() → REST shim → redis-server');}
 const O=await owner(I1,'trial'),X=await owner(I1,'other');
 const mk=async(app,label)=>{const b=await app.f.als.run({ws:O.ws},()=>app.f.createAgent(label,'Trial','custom',false,{preset:'balanced'}));return {id:b.agent.id,key:b.key};};
 const as=(app,b)=>({get:u=>call(app,'GET',u,{key:b.key}),post:(u,body)=>call(app,'POST',u,{key:b.key,body}),act:(action,params,task_id)=>call(app,'POST','/api/gateway/act',{key:b.key,body:{action,params,task_id}})});
 const own=(app,m,u,body)=>call(app,m,u,{cookie:O.ck,body});
 const TR='[0:10] Welcome to the garden gate repair.\n[1:20] The hinge sags because the post leans.\n[2:40] Brace the post, then rehang the gate.\n[4:00] Private aside: SYNTHETIC-PRIVATE-LINE never leaves A.';
 const MOM=[{start:'1:20',end:'1:35',reason:'Names the cause',excerpt:'The hinge sags because the post leans.'},{start:'2:40',end:'2:55',reason:'The fix',excerpt:'Brace the post, then rehang the gate.'}];
 const start=async(app,A,B)=>{const c=await own(app,'POST','/api/pilots',{sourceAgentId:A.id,targetAgentId:B.id,transcript:TR,sourceInstructions:'Pick the useful moments.',targetTitle:'Draft captions',targetInstructions:'One caption per moment, under 120 characters. Do not publish.',confirmed:true});assert.equal(c.code,201,JSON.stringify(c.j));return c.j.pilot;};
 const view=async(app,id)=>(await own(app,'GET','/api/pilots/'+id)).j.pilot;
 // ---- 1. approve → exactly one B job → completion → linked result read back by a restarted instance
 {const A=await mk(I1,'Scout'),B=await mk(I1,'Captioner');const p=await start(I1,A,B);
  assert.equal((await as(I2,A).get('/api/gateway/tasks/next')).j.task.id,p.source.taskId);const inp=await as(I2,A).get('/api/gateway/tasks/'+p.source.taskId+'/input');assert.equal(inp.j.transcript,TR);
  const pr=await as(I1,A).act('pilot.handoff',{moments:MOM},p.source.taskId);assert.equal(pr.code,202,JSON.stringify(pr.j));
  const dup=await as(I2,A).act('pilot.handoff',{moments:MOM},p.source.taskId);assert.equal(dup.j.request_id,pr.j.request_id,'replay on another instance: same request');
  let v=await view(I2,p.id);assert.equal(v.status,'waiting_for_approval');const tgt=v.package.targetTaskId;
  assert.equal(await R.cmd(['EXISTS','w:'+O.ws+':fm:task:'+tgt]),0,'nothing exists for B while pending');assert.equal((await as(I1,B).get('/api/gateway/tasks/'+tgt+'/input')).code,404);
  const aps=await Promise.all([I1,I2,I1,I2].map(app=>own(app,'POST','/api/requests/'+pr.j.request_id+'/approve',{detailsHash:v.package.fingerprint})));
  assert.equal(aps.filter(x=>x.code===200&&x.j.request&&x.j.request.status==='executed').length,1,'four concurrent approvals on two instances: exactly one executes');
  const list=await R.cmd(['LRANGE','w:'+O.ws+':fm:tasklist',0,-1]);assert.equal(list.filter(x=>x===tgt).length,1,'exactly one B job in real Redis');
  assert.equal((await as(I2,B).get('/api/gateway/tasks/next')).j.task.id,tgt);const bin=await as(I1,B).get('/api/gateway/tasks/'+tgt+'/input');assert.deepEqual(bin.j.moments,MOM);assert.ok(!JSON.stringify(bin.j).includes('SYNTHETIC-PRIVATE-LINE'),'B never sees the rest of the transcript');
  assert.equal((await as(I1,A).get('/api/gateway/tasks/'+tgt)).code,404,'A cannot read B\'s job');
  assert.equal((await as(I2,B).post('/api/gateway/tasks/'+tgt+'/complete',{result:'1) The post leans, so the hinge sags. 2) Brace it, rehang it.'})).code,200);
  const I3=load();v=await view(I3,p.id);assert.equal(v.status,'finished');assert.ok(v.result.includes('Brace it'),'the result reads back after a restart');
  const outs=v.receipts.map(r=>r.outcome).sort().join(',');assert.equal(outs,'completed,completed,delivered,proposed,read','linked receipts: '+outs);
  ok('approve path','claim → read → propose (replayed) → 4 concurrent approvals on 2 instances → 1 B job → B reads only the package → done → read back by a restarted instance');}
 // ---- 2. deny and cross-workspace
 {const A=await mk(I1,'Scout2'),B=await mk(I1,'Captioner2');const p=await start(I2,A,B);await as(I1,A).get('/api/gateway/tasks/next');
  const pr=await as(I2,A).act('pilot.handoff',{moments:MOM},p.source.taskId);let v=await view(I1,p.id);
  assert.equal((await call(I1,'GET','/api/pilots/'+p.id,{cookie:X.ck})).code,404,'another workspace cannot see the trial');
  assert.equal((await call(I2,'POST','/api/requests/'+pr.j.request_id+'/approve',{cookie:X.ck,body:{detailsHash:v.package.fingerprint}})).code,404,'nor approve it');
  assert.equal((await own(I2,'POST','/api/requests/'+pr.j.request_id+'/deny',{})).j.request.status,'denied');
  assert.equal(await R.cmd(['EXISTS','w:'+O.ws+':fm:task:'+v.package.targetTaskId]),0,'deny: no B job');v=await view(I1,p.id);assert.equal(v.status,'denied');
  ok('deny and cross-workspace','deny creates nothing for B; another workspace gets 404 for the trial and the approval');}
 // ---- 3. crash after the approval claim, before dispatch: a restarted instance recovers once
 {const A=await mk(I1,'Scout3'),B=await mk(I1,'Captioner3');const p=await start(I1,A,B);await as(I1,A).get('/api/gateway/tasks/next');
  const pr=await as(I1,A).act('pilot.handoff',{moments:MOM},p.source.taskId);const v=await view(I1,p.id);
  // instance 1 freezes forever on its first write after claiming the approval (the B job SET NX): a crash mid-decision
  I1.st.hook={match:c=>c[0]==='SET'&&String(c[1]).endsWith('fm:task:'+v.package.targetTaskId)};
  own(I1,'POST','/api/requests/'+pr.j.request_id+'/approve',{detailsHash:v.package.fingerprint});
  for(let i=0;i<200&&!I1.st.hook?.hit&&I1.st.hook;i++)await sleep(10);
  const qk='w:'+O.ws+':fm:req:'+pr.j.request_id;assert.equal(JSON.parse(await R.cmd(['GET',qk])).status,'approved','the decision was recorded before the crash');
  await R.cmd(['DEL','w:'+O.ws+':fm:joblock:'+p.source.taskId]); // the lock's PX would expire in 120 s; released here to keep the run short
  const I4=load();await call(I4,'GET','/api/state',{cookie:O.ck});await call(I4,'GET','/api/state',{cookie:O.ck});
  assert.equal(JSON.parse(await R.cmd(['GET',qk])).status,'executed','a restarted instance finishes the approved handoff');
  const list=await R.cmd(['LRANGE','w:'+O.ws+':fm:tasklist',0,-1]);assert.equal(list.filter(x=>x===v.package.targetTaskId).length,1,'once');
  ok('crash recovery','instance frozen after the approval claim; a restarted instance dispatches exactly one B job');}
 // ---- 4. a refused credential is stored nowhere; every trial key is namespaced to its workspace
 {const A=await mk(I2,'Scout4'),B=await mk(I2,'Captioner4');const FAKE='ghp_'+'Z'.repeat(36);const c=await own(I2,'POST','/api/pilots',{sourceAgentId:A.id,targetAgentId:B.id,transcript:'[0:01] token '+FAKE,sourceInstructions:'x',targetTitle:'y',targetInstructions:'z',confirmed:true});
  assert.equal(c.j.error,'credential_like');const keys=await R.cmd(['KEYS','*']);let hit=0;for(const k of keys){const t=await R.cmd(['TYPE',k]);const val=t==='string'?await R.cmd(['GET',k]):t==='list'?(await R.cmd(['LRANGE',k,0,-1])).join('\n'):t==='set'?(await R.cmd(['SMEMBERS',k])).join('\n'):'';if(String(val).includes(FAKE))hit++;}
  assert.equal(hit,0,'the refused value is not in Redis');
  const pk=keys.filter(k=>/fm:(pilot|handoff|pilotreq|pilotinput|pilottasks|pilotlist)/.test(k));assert.ok(pk.length>0&&pk.every(k=>k.startsWith('w:ws_')),'trial keys are workspace-namespaced: '+pk.length);
  ok('credential screen and namespacing',keys.length+' keys scanned; '+pk.length+' trial keys, all under w:<workspace>:');}
 assert.equal(blocked.length,0,'no network beyond the local shim: '+blocked.join(','));
 console.log(`\npilot real-redis e2e: ${results.length}/${results.length} groups passed; ${shimCalls} REST calls through the local shim; redis ${ver}; no outbound network. Scripted workers only: not the owner's real assistants.`);
 shim.close();const gone=new Promise(ok=>rs.once('exit',ok));R.cmd(['SHUTDOWN','NOSAVE']).catch(()=>{});await Promise.race([gone,sleep(3000)]);R.close();cleanup();
 console.log('redis-server stopped; temp dir removed');process.exit(0);
})().catch(e=>{console.error('FAIL',e&&e.stack||e);process.exit(1);});
