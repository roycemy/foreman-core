// A password reset deletes every prior session of the account from the store, so no version of the code (including production 0991388,
// which has no pwAt check) can authenticate them afterwards. Covers: sessions made before this code (no `at`), deletion checked on the store
// itself, a rollback simulation using 0991388's session check, three orderings of a login racing a reset, a sweep failing mid-scan
// (fails closed, then resumes with the same link), account-write contention (fails closed, nothing changed), another account untouched,
// a large keyspace, and nothing secret printed. Real handler, offline, email provider stubbed.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const API=path.join(__dirname,'api/index.js'),src=fs.readFileSync(API,'utf8')+'\nmodule.exports.t={r,setJ,getJ,sha,WAITLIST_ADMINS};';
const sent=[],printed=[];const cap=(...a)=>printed.push(a.map(String).join(' '));
const ctx={require:require('module').createRequire(API),module:{exports:{}},process:{env:{RESEND_API_KEY:'re_synthetic',WAKE_EMAIL_FROM:'Alter <wake@mail.example>'}},global:{},console:{log:cap,warn:cap,error:cap,info:cap},
 fetch:async(u,o)=>{if(String(u)==='https://api.resend.com/emails'){sent.push(JSON.parse(o.body));return {ok:true,status:200};}throw Error('NO NETWORK '+u)},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const h=ctx.module.exports,f=h.t,mem=ctx.global.__mem;const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
// store hooks: gates hold a matching command until released; fail throws on a matching command
const origR=ctx.r;let hooks=[];ctx.r=function(cmd){for(const hk of hooks){if(!hk.done&&hk.match(cmd)){if(hk.skip&&hk.skip-->0)continue;hk.done=true;if(hk.fail)return Promise.reject(new Error('store down'));if(hk.value!==undefined)return Promise.resolve(hk.value);return new Promise(ok=>{hk.reached=true;hk.release=()=>ok(origR(cmd));});}}return origR(cmd);};
const until=async p=>{for(let i=0;i<500&&!p();i++)await new Promise(x=>setTimeout(x,4));assert.ok(p(),'gate reached');};
let ipN=0;async function http(method,url,{body,cookie}={}){let out,set=null;const headers={host:'www.alterhq.app',origin:'https://www.alterhq.app','x-forwarded-for':'203.0.113.'+(++ipN%200)};if(cookie)headers.cookie='fm_sess='+cookie;
 const res={setHeader(k,v){if(k==='Set-Cookie'){const m=/fm_sess=([^;]*)/.exec(String(v));if(m)set=m[1];}},status(c){this.code=c;return this},json(j){out={code:this.code||200,j}},send(b){out={code:this.code||200,j:b}},end(){out={code:this.code||204}}};
 await h({method,url,headers,body:body||{}},res);return {...out,cookie:set};}
const [A,B]=[...f.WAITLIST_ADMINS];let pwA='pw-A-original';
const login=(e,p)=>http('POST','/api/auth/login',{body:{email:e,password:p}});
const me=c=>http('GET','/api/me',{cookie:c}).then(x=>x.code);
const sessKeyAlive=tok=>mem.kv.has('gl:sess:'+sha(tok));
// 0991388's getSession, verbatim logic: session record by token, user by the session's email, id and ws must match. No pwAt check.
const oldGetSession=async tok=>{const v=await origR(['GET','gl:sess:'+sha(tok)]);if(!v)return null;const s=JSON.parse(v),u=await f.getJ('gl:user:'+sha(s.email));return u&&u.id===s.uid&&u.ws===s.ws?s:null;};
const legacySession=async email=>{const u=await f.getJ('gl:user:'+sha(email)),tok=crypto.randomBytes(32).toString('hex');await origR(['SET','gl:sess:'+sha(tok),JSON.stringify({uid:u.id,email:u.email,ws:u.ws})]);return tok;}; // as 0991388 writes it: no `at`
const requestLink=async()=>{off();const n=sent.length;const r=await http('POST','/api/auth/reset-request',{body:{email:A}});assert.equal(r.code,200);assert.equal(sent.length,n+1);return /#reset=([a-f0-9]{64})/.exec(sent[sent.length-1].text)[1];};
const off=()=>{for(const k of [...mem.kv.keys()])if(k.startsWith('gl:resetReq'))mem.kv.delete(k);}; // keep tests clear of the hourly request limits
const reset=(tok,p)=>http('POST','/api/auth/reset',{body:{token:tok,password:p}});
const userSessions=async email=>{const u=await f.getJ('gl:user:'+sha(email));return [...mem.kv.entries()].filter(([k,v])=>k.startsWith('gl:sess:')&&JSON.parse(v).uid===u.id).length;};
(async()=>{
 assert.equal((await http('POST','/api/auth/signup',{body:{email:A,password:pwA}})).code,200);assert.equal((await http('POST','/api/auth/signup',{body:{email:B,password:'pw-B-original'}})).code,200);
 // ---- 1. coverage and rollback: new-style and pre-fix (legacy) sessions all gone from the store
 const prior=[(await login(A,pwA)).cookie,(await login(A,pwA)).cookie,await legacySession(A),await legacySession(A)];const bTok=(await login(B,'pw-B-original')).cookie;
 for(const t of prior){assert.equal(await me(t),200);assert.ok(await oldGetSession(t),'0991388 accepts it before the reset');}
 const r1=await reset(await requestLink(),pwA='pw-A-second');assert.equal(r1.code,200,JSON.stringify(r1.j));assert.equal(r1.j.signedOutEverywhere,true);
 for(const t of prior){assert.ok(!sessKeyAlive(t),'the prior session key is deleted from the store');assert.equal(await me(t),401);assert.equal(await oldGetSession(t),null,'rollback simulation: 0991388 resolves the prior session to nothing');}
 assert.equal(await userSessions(A),1,'only the resetter\'s new session remains');assert.equal(await me(r1.cookie),200);
 // ---- 2. isolation: the other account is untouched
 assert.ok(sessKeyAlive(bTok));assert.equal(await me(bTok),200,'another account keeps its session');
 // ---- 3a. a login whose re-check runs after the reset's account write is withdrawn
 {const pre=(await login(A,pwA)).cookie;const tok=await requestLink();
  const g={match:c=>c[0]==='GET'&&c[1]==='gl:user:'+sha(A)&&g.armed};hooks=[g];g.armed=false;
  // arm the gate after the login's first user read: skip one GET (password check), hold the second (the barrier re-read)
  g.skip=1;g.armed=true;const L=login(A,pwA);await until(()=>g.reached);
  const R=await reset(tok,pwA='pw-A-third');g.release();const lr=await L;hooks=[];
  assert.equal(R.code,200);assert.equal(lr.code,409,'the racing login is refused: '+JSON.stringify(lr.j));assert.ok(!lr.cookie||!sessKeyAlive(lr.cookie),'and its session key is gone');
  assert.ok(!sessKeyAlive(pre));assert.equal(await userSessions(A),1,'only the newest resetter session: reset 3a also signed out reset 1\'s session');}
 // ---- 3b. a login that completes while the reset is between claiming the link and writing the account: deleted by the sweep
 {const tok=await requestLink();const g={match:c=>c[0]==='EVAL'&&c[3]==='gl:user:'+sha(A)};hooks=[g];
  const R=reset(tok,'pw-A-fourth');await until(()=>g.reached);const lr=await login(A,pwA);assert.equal(lr.code,200,'old password still valid before the account write');
  g.release();const rr=await R;hooks=[];pwA='pw-A-fourth';assert.equal(rr.code,200);
  assert.ok(!sessKeyAlive(lr.cookie),'a session that existed when the sweep began is deleted');assert.equal(await oldGetSession(lr.cookie),null);}
 // ---- 3c. a login whose session is written mid-sweep: withdrawn by the barrier (the sweep may have passed its key)
 {const tok=await requestLink();
  const gs={match:c=>c[0]==='SET'&&String(c[1]).startsWith('gl:sess:')&&gs.armed};const gscan={match:c=>c[0]==='SCAN'};hooks=[gs,gscan];gs.armed=true;
  const L=login(A,pwA);await until(()=>gs.reached);gs.armed=false;            // the login verified the old password and is about to write its session
  const R=reset(tok,'pw-A-fifth');await until(()=>gscan.reached);                 // the reset has written the account and is starting the sweep
  gs.release();const lr=await L;gscan.release();const rr=await R;hooks=[];pwA='pw-A-fifth';
  assert.equal(rr.code,200);assert.equal(lr.code,409);assert.ok(!sessKeyAlive(lr.cookie||'x'),'the mid-sweep session does not survive');
  assert.equal(await userSessions(A),1,'only the resetter\'s new session');}
 // ---- 4. the sweep fails mid-scan: not reported as success; the same link and password finish it
 {const p1=(await login(A,pwA)).cookie,p2=await legacySession(A);for(let i=0;i<3000;i++)await origR(['SET','gl:sess:'+sha('other'+i),JSON.stringify({uid:'user_someone_else',email:'x@example.com',ws:'wsx'})]);
  const tok=await requestLink();hooks=[{match:c=>c[0]==='SCAN',skip:1,fail:true}];
  const rr=await reset(tok,'pw-A-sixth');hooks=[];assert.equal(rr.code,503);assert.equal(rr.j.code,'sweep_incomplete');assert.ok(!rr.cookie,'not signed in');assert.ok(/did not finish/.test(rr.j.error));
  assert.equal((await login(A,pwA)).code,401,'the password did change');for(const t of [p1,p2])assert.equal(await me(t),401,'new code rejects prior sessions meanwhile (pwAt)');
  assert.equal((await reset(tok,'not-the-same')).code,400,'finishing needs the same new password');
  const fin=await reset(tok,'pw-A-sixth');pwA='pw-A-sixth';assert.equal(fin.code,200,JSON.stringify(fin.j));
  for(const t of [p1,p2]){assert.ok(!sessKeyAlive(t));assert.equal(await oldGetSession(t),null);}
  assert.equal((await reset(tok,'pw-A-sixth')).code,400,'a finished link is spent');
  assert.equal([...mem.kv.keys()].filter(k=>k.startsWith('gl:sess:')&&JSON.parse(mem.kv.get(k)).uid==='user_someone_else').length,3000,'3,000 other sessions untouched across a multi-page sweep');}
 // ---- 5. the account write loses every compare-and-set: nothing changes, the link can be retried
 {const p=(await login(A,pwA)).cookie;const tok=await requestLink();hooks=[1,2,3,4,5].map(()=>({match:c=>c[0]==='EVAL'&&c[3]==='gl:user:'+sha(A),value:0}));
  const rr=await reset(tok,'pw-A-seventh');hooks=[];assert.equal(rr.code,409);assert.ok(/nothing changed/i.test(rr.j.error));
  assert.equal((await login(A,pwA)).code,200,'password unchanged');assert.equal(await me(p),200,'sessions untouched, and the owner was told nothing changed');
  const again=await reset(tok,'pw-A-seventh');assert.equal(again.code,200,'the same link works on retry');assert.ok(!sessKeyAlive(p));pwA='pw-A-seventh';}
 // ---- 6. a store failure on a delete also fails closed
 {const p=await legacySession(A);const tok=await requestLink();hooks=[{match:c=>c[0]==='DEL'&&String(c[1]).startsWith('gl:sess:'),fail:true}];
  const rr=await reset(tok,'pw-A-eighth');hooks=[];assert.equal(rr.code,503);assert.equal(await me(p),401);
  assert.equal((await reset(tok,'pw-A-eighth')).code,200);assert.equal(await oldGetSession(p),null);}
 // ---- hygiene
 const tokens=[...mem.kv.keys()].filter(k=>k.startsWith('gl:sess:')).map(k=>k.slice(8));for(const x of [...tokens,...prior])assert.ok(!printed.join('\n').includes(x),'no session identifier printed');
 assert.ok(!printed.join('\n').includes('gl:sess:'),'no session key printed');
 console.log('PASS reset signs out everywhere, durably: prior sessions (new and pre-fix) are deleted from the store and resolve to nothing under 0991388\'s session check; another account untouched; racing logins withdrawn (re-check after the account write) or swept (existed when the sweep began, or written mid-sweep); a mid-scan or delete failure returns 503 not signed in and the same link and password finish it; compare-and-set contention changes nothing and the link retries; 3,000 other sessions across pages untouched; nothing secret printed');
})().catch(e=>{console.error(e);process.exit(1)});
