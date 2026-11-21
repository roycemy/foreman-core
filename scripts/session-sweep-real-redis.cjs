// Password reset session sweep on REAL Redis (local only). Same harness as scripts/real-redis-proof.cjs: a throwaway redis-server on 127.0.0.1
// behind a local Upstash-protocol REST shim, the UNMODIFIED api/index.js. Proves the SCAN-based sweep, the login barrier and fail-closed resume on a real store.
// tiny local REST shim in front of it that speaks the Upstash REST command protocol (POST a JSON command array, get {result} or {error}),
// and points the UNMODIFIED api/index.js at the shim through KV_REST_API_URL with a dummy, non-secret token. So the app's real store
// adapter r() and the production Lua scripts run on real Redis. This is NOT Upstash: the shim is local code, and Upstash REST behaviour
// end to end is not proven here. No network beyond 127.0.0.1; no cloud resource; nothing persists after exit.
// Usage: node scripts/session-sweep-real-redis.cjs
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
 function load(){const src=fs.readFileSync(API,'utf8')+'\nmodule.exports.t={r,setJ,getJ,sha};';
  const ctx={require:createRequire(API),module:{exports:{}},process:{env:{KV_REST_API_URL:SHIM,KV_REST_API_TOKEN:'local-shim-not-a-secret'}},global:{},console:{...console,log(){},warn(){},error(){}},
   fetch:async(u,o)=>{if(String(u).startsWith(SHIM))return realFetch(u,o);blocked.push(String(u));throw Error('NO NETWORK '+u);},setTimeout,clearTimeout,setInterval,clearInterval,URL,URLSearchParams,AbortSignal,Buffer,TextEncoder,TextDecoder};
  vm.runInNewContext(src,ctx);const h=ctx.module.exports;const origR=ctx.r;const st={hook:null,gate:null};
  ctx.r=function(cmd){if(st.gate&&!st.gate.reached&&st.gate.match(cmd)){st.gate.reached=true;const s=h.t.als.getStore();return new Promise(ok=>{st.gate.release=()=>ok(h.t.als.run(s,()=>origR(cmd)));});}
   if(st.hook&&st.hook.match(cmd)){const hh=st.hook;st.hook=null;hh.hit=true;return hh.after?origR(cmd).then(()=>new Promise(()=>{})):new Promise(()=>{});}return origR(cmd);};
  return {h,f:h.t,st};}
 async function call(app,method,url,{key,cookie,body}={}){let out;const headers={host:'localhost',origin:'http://localhost'};if(key)headers.authorization='Bearer '+key;if(cookie)headers.cookie='fm_sess='+cookie;
  const res={setHeader(){},status(c){this.code=c;return this},json(j){out={code:this.code||200,j}},send(b){out={code:this.code||200,j:b}},end(){out={code:this.code||204}}};await app.h({method,url,headers,body:body||{}},res);return out||{code:0};}
 const results=[];const ok=(name,detail)=>{results.push(['PASS',name,detail||'']);console.log('PASS',name,detail?'— '+detail:'');};
 const I1=load(),I2=load();const sha=s=>require('crypto').createHash('sha256').update(s).digest('hex'),rnd=()=>require('crypto').randomBytes(32).toString('hex');
 {const hz=await call(I1,'GET','/api/health');assert.equal(hz.j.store,'upstash');ok('store adapter','two app instances → REST shim → redis-server');}
 // synthetic accounts; the reset route itself does not check the founder list (only the email request does), so no real address is needed
 const A='owner-a@example.com',B='owner-b@example.com';let pwA='pw-A-original';
 const signup=(app,e,p)=>call(app,'POST','/api/auth/signup',{body:{email:e,password:p}});
 const login=(app,e,p)=>call(app,'POST','/api/auth/login',{body:{email:e,password:p}});
 const loginTok=async(app,e,p)=>{let tok=null;const r=await callCookie(app,'POST','/api/auth/login',{email:e,password:p},c=>tok=c);return {code:r.code,tok};};
 async function callCookie(app,method,url,body,onCookie){let out;const headers={host:'localhost',origin:'http://localhost'};const res={setHeader(k,v){if(k==='Set-Cookie'){const m=/fm_sess=([^;]*)/.exec(String(v));if(m&&m[1])onCookie(m[1]);}},status(c){this.code=c;return this},json(j){out={code:this.code||200,j}},send(b){out={code:this.code||200,j:b}},end(){out={code:this.code||204}}};await app.h({method,url,headers,body:body||{}},res);return out||{code:0};}
 {const s1=await signup(I1,A,pwA);assert.equal(s1.code,200,JSON.stringify(s1.j));}assert.equal((await signup(I1,B,'pw-B-original')).code,200);
 const user=async e=>JSON.parse(await R.cmd(['GET','gl:user:'+sha(e)]));
 // 0991388's session check, resolved directly on redis: session record by token, user by its email, id and ws must match; no pwAt
 const oldResolve=async tok=>{const v=await R.cmd(['GET','gl:sess:'+sha(tok)]);if(!v)return null;const s=JSON.parse(v),u=JSON.parse(await R.cmd(['GET','gl:user:'+sha(s.email)])||'null');return u&&u.id===s.uid&&u.ws===s.ws?s:null;};
 const sessionsOf=async uid=>{let c='0',n=0;do{const [nx,ks]=await R.cmd(['SCAN',c,'MATCH','gl:sess:*','COUNT',5000]);c=nx;if(ks.length){const vs=await R.cmd(['MGET',...ks]);n+=vs.filter(v=>v&&JSON.parse(v).uid===uid).length;}}while(c!=='0');return n;};
 const link=async e=>{const u=await user(e),tok=rnd();await R.cmd(['SET','gl:pwreset:'+sha(tok),JSON.stringify({uid:u.id,email:e,at:Date.now(),used:false}),'EX',1800]);return tok;}; // as /auth/reset-request stores it (no sender in this harness)
 const reset=(app,tok,p)=>call(app,'POST','/api/auth/reset',{body:{token:tok,password:p}});
 // a large keyspace: 25,000 unrelated keys, 400 sessions of account B, 30 pre-fix sessions of A (0991388's format), 5 logins of A
 const uA=await user(A),uB=await user(B);
 for(let i=0;i<25000;i+=500){const args=[];for(let j=i;j<i+500;j++)args.push('w:wsfill:fm:filler:'+j,'x');await R.cmd(['MSET',...args]);}
 for(let i=0;i<400;i++)await R.cmd(['SET','gl:sess:'+sha(rnd()),JSON.stringify({uid:uB.id,email:B,ws:uB.ws}),'EX',2592000]);
 const prior=[];for(let i=0;i<30;i++){const t=rnd();prior.push(t);await R.cmd(['SET','gl:sess:'+sha(t),JSON.stringify({uid:uA.id,email:A,ws:uA.ws}),'EX',2592000]);}
 for(let i=0;i<5;i++){const x=await loginTok(I2,A,pwA);assert.equal(x.code,200);prior.push(x.tok);}
 const size=await R.cmd(['DBSIZE']),bBefore=await sessionsOf(uB.id);for(const t of prior)assert.ok(await oldResolve(t),'0991388 accepts the prior session before the reset');
 // ---- 1. reset on real Redis: every prior session key deleted; 0991388 resolves none; B untouched
 {const t0=Date.now(),r1=await reset(I1,await link(A),pwA='pw-A-second'),ms=Date.now()-t0;assert.equal(r1.code,200,JSON.stringify(r1.j));
  let alive=0;for(const t of prior){if(await R.cmd(['EXISTS','gl:sess:'+sha(t)]))alive++;assert.equal(await oldResolve(t),null);}assert.equal(alive,0,'no prior session key left in redis');
  assert.equal(await sessionsOf(uA.id),1,'only the resetter\'s new session');assert.equal(await sessionsOf(uB.id),bBefore,'the other account keeps every session');
  ok('durable sign-out',`${prior.length} prior sessions (30 in 0991388's format) deleted from redis; 0991388's check resolves none; ${bBefore} sessions of another account untouched; keyspace ${size} keys; reset took ${ms} ms`);}
 // ---- 2. logins racing a reset across two instances: none survives
 {const tok=await link(A),old=pwA;let stop=false;const logins=[];
  const loop=async app=>{while(!stop){logins.push(await loginTok(app,A,old));}};
  const L=[loop(I2),loop(I2),loop(I1)];await sleep(150);
  const rr=await reset(I1,tok,pwA='pw-A-third');stop=true;await Promise.all(L);assert.equal(rr.code,200,JSON.stringify(rr.j));
  const won=logins.filter(x=>x.code===200);let survived=0;for(const x of won)if(x.tok&&await R.cmd(['EXISTS','gl:sess:'+sha(x.tok)]))survived++;
  assert.equal(survived,0,'no login with the old password survives the reset');assert.equal(await sessionsOf(uA.id),1);
  ok('racing logins',`${logins.length} logins with the old password raced the reset on two instances (${won.length} returned 200 before it, ${logins.filter(x=>x.code===409).length} withdrawn by the barrier, ${logins.filter(x=>x.code===401).length} refused, ${logins.filter(x=>x.code===429).length} stopped by the existing login rate limit): none survives`);}
 // ---- 3. an instance stalls mid-sweep (simulated crash): never reports success; a fresh instance finishes with the same link and password
 {const p=[];for(let i=0;i<10;i++){const t=rnd();p.push(t);await R.cmd(['SET','gl:sess:'+sha(t),JSON.stringify({uid:uA.id,email:A,ws:uA.ws})]);}
  const tok=await link(A);let scans=0;I1.st.hook={match:c=>c[0]==='SCAN'&&++scans===3};
  const out=await Promise.race([reset(I1,tok,'pw-A-fourth'),sleep(3000).then(()=>'hung')]);assert.equal(out,'hung','the stalled instance never answers');I1.st.hook=null;
  const I3=load();const fin=await reset(I3,tok,'pw-A-fourth');pwA='pw-A-fourth';assert.equal(fin.code,200,JSON.stringify(fin.j));
  for(const t of p)assert.equal(await oldResolve(t),null);assert.equal(await sessionsOf(uA.id),1);
  ok('crash mid-sweep','a stalled instance never reports success; a fresh instance finishes with the same link and password; 0991388 resolves none of the 10 prior sessions');}
 assert.equal(blocked.length,0,'no network beyond the local shim: '+blocked.join(','));
 console.log(`\nsession sweep real-redis: ${results.length}/${results.length} groups passed; ${shimCalls} REST calls through the local shim; redis ${ver}; no outbound network`);
 shim.close();const gone=new Promise(ok=>rs.once('exit',ok));R.cmd(['SHUTDOWN','NOSAVE']).catch(()=>{});await Promise.race([gone,sleep(3000)]);R.close();cleanup();
 console.log('redis-server stopped; temp dir removed');process.exit(0);
})().catch(e=>{console.error('FAIL',e&&e.stack||e);process.exit(1);});
