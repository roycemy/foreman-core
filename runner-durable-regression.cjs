// Durable authorization is distinct from executor presence. No network or live account.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
let at=Date.parse('2026-10-14T20:00:00Z');class Clock extends Date{constructor(...a){super(...(a.length?a:[at]))}static now(){return at}}
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.test={als,createAgent,startRunnerSession,runnerSession,runnerRoutes,getJ,r,sha,updateAgent,RUNNER_TTL};';
const ctx={module:{exports:{}},require,process:{env:{}},global:{},console,Buffer,fetch:()=>{throw Error('NO NETWORK')},URL,AbortSignal,setTimeout,clearTimeout,Date:Clock};vm.runInNewContext(src,ctx);const f=ctx.module.exports.test;
(async()=>{
 let c;await f.als.run({ws:'durable_test'},async()=>{c=await f.createAgent('Instinct','Ops','instinct',false,{})});let h={};const created=await f.startRunnerSession({setHeader(k,v){h[k]=v}},'durable_test',c.agent.id,c.key);let cookie=h['Set-Cookie'].split(';')[0];const tokenHash=f.sha(cookie.split('=')[1]);const initial=await f.getJ('gl:runner:'+tokenHash);assert.notEqual(initial.key,c.key);assert(!created.key);assert.equal(initial.expires,at+30*86400000);
 const req={method:'GET',headers:{cookie,origin:'https://foreman-core.vercel.app'}};
 async function call(action,method='GET',extra={}){let result;const headers={};const res={setHeader(k,v){headers[k]=v},status(c){this.code=c;return this},json(j){result={code:this.code||200,j,headers};return result}};await f.runnerRoutes({method,headers:{...req.headers,...extra}},res,'/runner/'+c.agent.id+'/'+action,{});return result}
 // Reopen after 29 days without an executor, no code; authorization renewed, presence remains stale.
 at+=29*86400000;const before=await f.als.run({ws:'durable_test'},()=>f.getJ('fm:agent:'+c.agent.id));const renewed=await call('session');assert.equal(renewed.code,200);assert.equal(renewed.j.authorization,'saved');assert.equal(renewed.j.executor.state,'stale');assert.equal(renewed.j.executor.staleAfterSeconds,150);assert.equal(Date.parse(renewed.j.expiresAt),at+30*86400000);assert.equal(renewed.j.csrf,created.csrf);assert.equal(renewed.headers['Set-Cookie'].split(';')[0],cookie);const after=await f.als.run({ws:'durable_test'},()=>f.getJ('fm:agent:'+c.agent.id));assert.equal(after.lastSeen,before.lastSeen);assert.equal(after.state,before.state);
 // Bad origin and cross-site restores cannot prolong the grant.
 const expiry=(await f.getJ('gl:runner:'+tokenHash)).expires;at+=1000;assert.equal((await call('session','GET',{origin:'https://evil.invalid'})).code,403);assert.equal((await call('session','GET',{'sec-fetch-site':'cross-site'})).code,403);assert.equal((await f.getJ('gl:runner:'+tokenHash)).expires,expiry);
 // Gateway identity binding and current key are checked on every resume.
 assert.equal(await f.runnerSession(req,'agent_other'),null);const kh=await f.als.run({ws:'durable_test'},()=>f.r(['GET','fm:gatewayKeyHash:'+c.agent.id]));await f.als.run({ws:'durable_test'},()=>f.r(['SET','fm:gatewayKeyHash:'+c.agent.id,'rotated']));assert.equal((await call('session')).code,401);await f.als.run({ws:'durable_test'},()=>f.r(['SET','fm:gatewayKeyHash:'+c.agent.id,kh]));
 // Owner revocation/reset invalidate the pair without browser cooperation.
 await f.als.run({ws:'durable_test'},()=>f.updateAgent(c.agent.id,a=>a.status='revoked'));assert.equal((await call('session')).code,401);await f.als.run({ws:'durable_test'},()=>f.updateAgent(c.agent.id,a=>{a.status='active';a.oauthEpoch=1}));assert.equal((await call('session')).code,401);await f.als.run({ws:'durable_test'},()=>f.updateAgent(c.agent.id,a=>a.oauthEpoch=0));
 // An expired pair cannot be renewed; there is no unconditional background refresh.
 at=expiry;assert.equal((await call('session')).code,401);
 at=expiry-1000;assert.equal((await call('disconnect','POST',{'x-alter-csrf':created.csrf})).code,200);assert.equal((await call('session')).code,401);
 console.log('PASS rolling 30-day renewal, stable scoped cookie/CSRF, encrypted credential, no fake presence, stale detection, origin/cross-site, bot/key binding, owner revoke/reset, hard idle expiry and disconnect.');
})().catch(e=>{console.error(e);process.exit(1)});
