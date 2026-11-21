// Owner decision (Q11): restoring a revoked bot must not silently bring its old gateway key back. Revoke still answers the old key with
// an honest 403 (blocked, access revoked). Restore invalidates the old key (it then gets 401) and says the bot needs a new key; the owner
// issues one with POST /agents/:id/gateway-key, which works; the old key stays dead. Restoring a bot that has no key record is harmless.
// Real handler, offline.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={r,setJ,getJ,als,createAgent,sha};';
const ctx={require,module:{exports:{}},process:{env:{}},global:{},console:{...console,log(){},warn(){},error(){}},fetch:async u=>{throw Error('NO NETWORK '+u)},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const h=ctx.module.exports,f=h.t;
async function http(method,url,{key,cookie,body,origin='http://localhost'}={}){let out;const headers={host:'localhost',origin};if(key)headers.authorization='Bearer '+key;if(cookie)headers.cookie='fm_sess='+cookie;
 const res={setHeader(){},status(c){this.code=c;return this},json(j){out={code:this.code||200,j}},send(b){out={code:this.code||200,j:b}},end(){out={code:this.code||204}}};await h({method,url,headers,body:body||{}},res);return out||{code:0};}
(async()=>{
 const email='r@o.example',ws='ws_restore',u={id:'u',email,ws};await f.setJ('gl:user:'+f.sha(email),u);await f.setJ('gl:sess:'+f.sha('ck'),{uid:'u',email,ws});const inW=fn=>f.als.run({ws},fn);
 const bot=await inW(()=>f.createAgent('Restore bot','Ops','custom',false,{preset:'balanced'}));const id=bot.agent.id,OLD=bot.key;
 const presence=key=>http('POST','/api/gateway/presence',{key,body:{}});
 assert.equal((await presence(OLD)).code,200,'the key works while the bot is active');
 assert.equal((await http('POST','/api/agents/'+id+'/revoke',{cookie:'ck'})).code,200);
 {const p=await presence(OLD);assert.equal(p.code,403,'revoked: the old key gets the honest "revoked" answer, not a silent 401 ('+p.code+')');}
 const rs=await http('POST','/api/agents/'+id+'/restore',{cookie:'ck'});assert.equal(rs.code,200,JSON.stringify(rs.j));assert.equal(rs.j.agent.status,'active','the bot is active again');
 assert.equal(rs.j.needsNewKey,true,'the response says the bot needs a new key');
 assert.equal((await presence(OLD)).code,401,'the OLD key does not regain access after restore');
 assert.equal(await inW(()=>f.r(['GET','fm:key:'+f.sha(OLD)])),null,'its key record is gone');assert.equal(await inW(()=>f.r(['GET','gl:key:'+f.sha(OLD)])),null,'including the global index');
 // the owner issues a new key; it works, and the old one stays dead
 const nk=await http('POST','/api/agents/'+id+'/gateway-key',{cookie:'ck'});assert.equal(nk.code,200,JSON.stringify(nk.j).slice(0,160));const NEW=nk.j.key||nk.j.gatewayKey||nk.j.apiKey;assert.ok(NEW&&NEW!==OLD,'a new key is issued');
 assert.equal((await presence(NEW)).code,200,'the new key works');assert.equal((await presence(OLD)).code,401,'the old key is still dead');
 // restoring an active bot, or one with no key record, is harmless
 assert.equal((await http('POST','/api/agents/'+id+'/restore',{cookie:'ck'})).code,200,'restore on an active bot does not error');
 assert.equal((await presence(NEW)).code,200,'and does NOT kill the current key (nothing was revoked)');
 console.log('PASS restore needs a new key: revoke still answers the old key 403; restore reactivates the bot, invalidates the old gateway key (401) and reports needsNewKey; a newly issued key works and the old one stays dead; restoring an active bot leaves its working key alone');
})().catch(e=>{console.error(e);process.exit(1)});
