// Deferred wake flush on REAL Redis in real time (local only). Same harness as scripts/real-redis-proof.cjs: throwaway redis-server behind a
// local REST shim, the UNMODIFIED api/index.js. Shows the in-invocation timer delivering a deferred wake with no further requests, with real TTLs.
// tiny local REST shim in front of it that speaks the Upstash REST command protocol (POST a JSON command array, get {result} or {error}),
// and points the UNMODIFIED api/index.js at the shim through KV_REST_API_URL with a dummy, non-secret token. So the app's real store
// adapter r() and the production Lua scripts run on real Redis. This is NOT Upstash: the shim is local code, and Upstash REST behaviour
// end to end is not proven here. No network beyond 127.0.0.1; no cloud resource; nothing persists after exit.
// Usage: node scripts/wake-flush-real-redis.cjs
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
 const realFetch=globalThis.fetch,blocked=[],mailed=[]; // mailed: the email provider is a local stub, no real email
 function load(){const src=fs.readFileSync(API,'utf8')+'\nmodule.exports.t={r,setJ,getJ,sha,als,createAgent};';
  const ctx={require:createRequire(API),module:{exports:{}},process:{env:{KV_REST_API_URL:SHIM,KV_REST_API_TOKEN:'local-shim-not-a-secret',RESEND_API_KEY:'re_synthetic',WAKE_EMAIL_FROM:'Alter <wake@mail.example>',WAKE_CUSTOM_EMAIL:'bot@example.com'}},global:{},console:{...console,log(){},warn(){},error(){}},
   fetch:async(u,o)=>{if(String(u).startsWith(SHIM))return realFetch(u,o);if(String(u)==='https://api.resend.com/emails'){mailed.push({at:Date.now(),key:(o.headers||{})['idempotency-key']||null});return {ok:true,status:200,json:async()=>({id:'stub'})};}blocked.push(String(u));throw Error('NO NETWORK '+u);},setTimeout,clearTimeout,setInterval,clearInterval,URL,URLSearchParams,AbortSignal,Buffer,TextEncoder,TextDecoder};
  vm.runInNewContext(src,ctx);const h=ctx.module.exports;const origR=ctx.r;const st={hook:null,gate:null};
  ctx.r=function(cmd){if(st.gate&&!st.gate.reached&&st.gate.match(cmd)){st.gate.reached=true;const s=h.t.als.getStore();return new Promise(ok=>{st.gate.release=()=>ok(h.t.als.run(s,()=>origR(cmd)));});}
   if(st.hook&&st.hook.match(cmd)){const hh=st.hook;st.hook=null;hh.hit=true;return hh.after?origR(cmd).then(()=>new Promise(()=>{})):new Promise(()=>{});}return origR(cmd);};
  return {h,f:h.t,st};}
 async function call(app,method,url,{key,cookie,body}={}){let out;const headers={host:'localhost',origin:'http://localhost'};if(key)headers.authorization='Bearer '+key;if(cookie)headers.cookie='fm_sess='+cookie;
  const res={setHeader(){},status(c){this.code=c;return this},json(j){out={code:this.code||200,j}},send(b){out={code:this.code||200,j:b}},end(){out={code:this.code||204}}};await app.h({method,url,headers,body:body||{}},res);return out||{code:0};}
 const results=[];const ok=(name,detail)=>{results.push(['PASS',name,detail||'']);console.log('PASS',name,detail?'— '+detail:'');};
 const I1=load(),I2=load();const sha=s=>require('crypto').createHash('sha256').update(s).digest('hex');
 {const hz=await call(I1,'GET','/api/health');assert.equal(hz.j.store,'upstash');ok('store adapter','two app instances → REST shim → redis-server');}
 const ws='ws_flush';await I1.f.setJ('gl:user:'+sha('o@flush.example'),{id:'u',email:'o@flush.example',ws});await I1.f.setJ('gl:sess:'+sha('ck'),{uid:'u',email:'o@flush.example',ws});
 const own=(app,m,u,b)=>call(app,m,u,{cookie:'ck',body:b});
 const bot=(await I1.f.als.run({ws},()=>I1.f.createAgent('Idle bot','x','custom',false,{preset:'balanced'}))).agent.id;
 // ---- real time, real TTLs: the second assignment is deferred; then no request reaches either instance
 const t0=Date.now();await own(I1,'POST','/api/tasks',{title:'job 1',assignee:bot});assert.equal(mailed.length,1,'first wake sent');
 await sleep(4000);await own(I2,'POST','/api/tasks',{title:'job 2',assignee:bot});assert.equal(mailed.length,1,'second wake deferred');
 const due=JSON.parse(await R.cmd(['GET','gl:wakeDue:'+bot]));const ttl=await R.cmd(['PTTL','gl:wake:'+bot]);
 const quiet=shimCalls;await sleep(Math.max(0,due.dueAt-Date.now())+5000);
 assert.equal(mailed.length,2,'delivered with no further requests');const lat=(mailed[1].at-due.dueAt)/1000;
 assert.equal(await R.cmd(['EXISTS','gl:wakeDue:'+bot]),0,'record closed in redis');assert.equal(mailed[1].key,due.id,'the follow-up carries the record\'s event id');
 ok('idle delivery, real time',`throttle key PTTL was ${ttl} ms; follow-up sent ${lat.toFixed(2)} s after the window ended (${((mailed[1].at-t0)/1000).toFixed(1)} s after the first wake), with no request to either app instance after the deferral (the only store traffic was the timer's own flush: ${shimCalls-quiet} REST calls)`);
 assert.equal(blocked.length,0,'no network beyond the local shim: '+blocked.join(','));
 console.log(`\nwake flush real-redis: ${results.length}/${results.length} groups passed; redis ${ver}; local Node process (not Vercel's runtime)`);
 shim.close();const gone=new Promise(ok=>rs.once('exit',ok));R.cmd(['SHUTDOWN','NOSAVE']).catch(()=>{});await Promise.race([gone,sleep(3000)]);R.close();cleanup();
 console.log('redis-server stopped; temp dir removed');process.exit(0);
})().catch(e=>{console.error('FAIL',e&&e.stack||e);process.exit(1);});
