// Runner 401s carry a reason code and two booleans (cookie presented, session record found), in the response and in one log line, and
// never any cookie, token or key material. Each reason is produced the way it happens in practice; keyhash-mismatch comes from the owner's
// real key-rotation route (a key issued after pairing). Offline, in-memory store.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const API=path.join(__dirname,'api/index.js'),src=fs.readFileSync(API,'utf8')+'\nmodule.exports.t={setJ,getJ,sha,als,createAgent,startRunnerSession,runnerCookieName};';
const logs=[];const ctx={require:require('module').createRequire(API),module:{exports:{}},process:{env:{}},global:{},console:{log:(...a)=>logs.push(a.join(' ')),warn(){},error(){}},fetch:async u=>{throw Error('NO NETWORK '+u)},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const h=ctx.module.exports,f=h.t;const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
async function http(method,url,{cookie,body,headers}={}){let out;const hd={host:'localhost',origin:'http://localhost',...(cookie?{cookie}:{}),...(headers||{})};const res={setHeader(){},status(c){this.code=c;return this},json(j){out={code:this.code||200,j}},send(b){out={code:this.code||200,j:b}},end(){out={code:this.code||204}}};await h({method,url,headers:hd,body:body||{}},res);return out;}
(async()=>{
 const ws='ws_rc';await f.setJ('gl:user:'+sha('o@rc.example'),{id:'u',email:'o@rc.example',ws});await f.setJ('gl:sess:'+sha('ck'),{uid:'u',email:'o@rc.example',ws});
 const mk=async n=>{const b=await f.als.run({ws},()=>f.createAgent(n,'x','custom',false,{preset:'balanced'}));let cookie;const res={setHeader(k,v){if(k==='Set-Cookie')cookie=String(v).split(';')[0]}};const s=await f.startRunnerSession(res,ws,b.agent.id,b.key);return {id:b.agent.id,key:b.key,cookie,csrf:s.csrf,token:cookie.split('=')[1]};};
 const A=await mk('Muse'),B=await mk('Other');
 const call=(id,cookie,p='gateway/tasks/next')=>http('GET','/api/runner/'+id+'/'+p,{cookie,headers:{'x-alter-csrf':id===A.id?A.csrf:B.csrf}});
 const expect=async(label,r,reason,cookiePresented,recordFound)=>{assert.equal(r.code,401,label+': '+JSON.stringify(r.j));assert.equal(r.j.reason,reason,label);assert.equal(r.j.cookiePresented,cookiePresented,label+' cookie');assert.equal(r.j.recordFound,recordFound,label+' record');
  const line=JSON.parse(logs[logs.length-1]);assert.deepEqual([line.evt,line.reason,line.cookiePresented,line.recordFound],['runner_401',reason,cookiePresented,recordFound],label+' log');};
 assert.equal((await call(A.id,A.cookie)).code,200,'a valid session works');assert.equal((await call(A.id,A.cookie,'session')).code,200);
 await expect('no cookie',await call(A.id,undefined),'no-cookie',false,false);
 await expect('cookie for another path',await call(A.id,B.cookie),'no-cookie',false,false); // B's cookie name is not A's: the browser would not send it here either
 await expect('unknown token',await call(A.id,f.runnerCookieName(A.id)+'='+'ab'.repeat(32)),'no-record',true,false);
 await expect('malformed token',await call(A.id,f.runnerCookieName(A.id)+'=xyz'),'no-record',true,false);
 await expect('agent mismatch',await call(A.id,f.runnerCookieName(A.id)+'='+B.token),'agent-mismatch',true,true);
 {const k='gl:runner:'+sha(A.token),s=await f.getJ(k);await f.setJ(k,{...s,expires:Date.now()-1});await expect('expired',await call(A.id,A.cookie),'expired',true,true);await f.setJ(k,s);}
 {const k='fm:agent:'+A.id,a=await f.als.run({ws},()=>f.getJ(k));await f.als.run({ws},()=>f.setJ(k,{...a,oauthEpoch:(a.oauthEpoch||0)+1}));await expect('epoch',await call(A.id,A.cookie),'epoch-mismatch',true,true);await f.als.run({ws},()=>f.setJ(k,a));}
 assert.equal((await call(A.id,A.cookie)).code,200,'restored');
 const rot=await http('POST','/api/agents/'+A.id+'/gateway-key',{cookie:'fm_sess=ck'});assert.equal(rot.code,200,'owner issues a new key after pairing');
 await expect('key issued after pairing',await call(A.id,A.cookie),'keyhash-mismatch',true,true);
 assert.equal((await http('POST','/api/agents/'+B.id+'/revoke',{cookie:'fm_sess=ck'})).code,200);await expect('revoked',await call(B.id,B.cookie),'revoked',true,true);
 const all=logs.join('\n');for(const s of [A.token,B.token,A.key,B.key,rot.j.key,sha(A.token),sha(B.token),A.csrf])assert.ok(!all.includes(s),'no secret or derived key in logs');
 for(const l of logs.filter(x=>x.includes('runner_401'))){const o=JSON.parse(l);assert.deepEqual(Object.keys(o).sort(),['agentId','at','cookiePresented','evt','reason','recordFound','route'].sort(),'only these fields are logged');}
 console.log('PASS runner 401 reason codes: no-cookie (none, or another path\'s cookie), no-record (unknown or malformed), agent-mismatch, expired, epoch-mismatch, keyhash-mismatch (a key issued after pairing), revoked; each 401 returns and logs only the reason plus cookie-presented and record-found booleans; no cookie, token, key or derived key in any log line');
})().catch(e=>{console.error(e);process.exit(1)});
