// The email loop through the real top-level handler (module.exports), not routes(): bot keys are resolved from the Authorization
// header and owners from the session cookie. Proves: no key, a garbage key and a revoked bot's key cannot propose; a bot cannot
// read another workspace's request; an owner cannot see, approve, deny or reconcile another workspace's request; and only the
// owning workspace's approval sends, once. Offline: Resend is a fake; no network.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path'),crypto=require('crypto');
const src=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={r,setJ,getJ,als,createAgent,newTask,sha};';
const R={sends:0,keys:new Map()};
const resp=(s,j)=>({ok:s>=200&&s<300,status:s,json:async()=>j,text:async()=>JSON.stringify(j)});
async function fakeFetch(url,o={}){const u=new URL(url);if(u.hostname!=='api.resend.com')throw Error('NO NETWORK: '+url);
 const k=(o.headers||{})['idempotency-key'];if(!k)return resp(200,{id:'wake'});if(R.keys.has(k))return resp(200,R.keys.get(k));R.sends++;const out={id:'em_'+R.sends};R.keys.set(k,out);return resp(200,out);}
const env={RESEND_API_KEY:'re_test_fixture',WAKE_EMAIL_FROM:'Alter <alerts@alter.example>',ALTER_EMAIL_ALLOWED_TO:'owner@example.com'};
const ctx={require,module:{exports:{}},process:{env},global:{},console,fetch:fakeFetch,setTimeout,clearTimeout,URL,AbortSignal,Buffer};vm.runInNewContext(src,ctx);
const handler=ctx.module.exports,f=handler.t;
async function http(method,url,{key,cookie,body}={}){let out;const headers={host:'localhost',origin:'http://localhost'};if(key!=null)headers.authorization='Bearer '+key;if(cookie)headers.cookie='fm_sess='+cookie;
 const res={setHeader(){},status(c){this.code=c;return this},json(j){out={code:this.code||200,j};return out},send(b){out={code:this.code||200,b};return out},end(){out={code:this.code||204};return out}};
 await handler({method,url,headers,body:body||{}},res);return out;}
async function owner(tag){const email=tag+'@owner.example',ws='ws_'+tag,u={id:'user_'+tag,email,ws};await f.setJ('gl:user:'+f.sha(email),u);await f.setJ('gl:sess:'+f.sha('cookie_'+tag),{uid:u.id,email,ws});return {ws,cookie:'cookie_'+tag};}
const mail={to:'owner@example.com',subject:'Weekly summary',text:'Here is the summary.'};
(async()=>{
 const A=await owner('a'),B=await owner('b');
 const botA=await f.als.run({ws:A.ws},()=>f.createAgent('Bot A','Ops','custom',false,{preset:'balanced'}));
 const botB=await f.als.run({ws:B.ws},()=>f.createAgent('Bot B','Ops','custom',false,{preset:'balanced'}));
 const job=await f.als.run({ws:A.ws},()=>f.newTask({title:'Summary',assignee:botA.agent.id}));
 const reqCount=()=>f.als.run({ws:A.ws},async()=>(await f.r(['SMEMBERS','fm:reqs'])).length);
 // ---- keys
 const n0=await reqCount();
 assert.equal((await http('POST','/api/gateway/act',{body:{action:'email.send',params:mail,task_id:job.id}})).code,401,'no key: 401');
 assert.equal((await http('POST','/api/gateway/act',{key:'not-a-real-key-'+crypto.randomBytes(8).toString('hex'),body:{action:'email.send',params:mail,task_id:job.id}})).code,401,'garbage key: 401');
 assert.equal(await reqCount(),n0,'nothing created without a valid key');
 assert.equal((await http('GET','/api/gateway/tasks/next',{key:botA.key})).j.task.id,job.id,'the real key claims through the handler');
 const p=await http('POST','/api/gateway/act',{key:botA.key,body:{action:'email.send',params:mail,task_id:job.id}});const rid=p.j.request_id;assert.ok(rid,'the real key proposes');
 // ---- another workspace's bot cannot read it
 const rb=await http('GET','/api/gateway/requests/'+rid,{key:botB.key});assert.equal(rb.code,404,'bot B cannot read bot A\'s request (workspace-scoped: not found)');
 // ---- another workspace's owner cannot see, approve, deny or reconcile it
 const sb=await http('GET','/api/state',{cookie:B.cookie});assert.equal(sb.code,200);assert.ok(!sb.j.requests.some(x=>x.id===rid),'owner B does not see A\'s request');
 const q=await f.als.run({ws:A.ws},()=>f.getJ('fm:req:'+rid));
 for(const act of ['approve','deny','reconcile']){const x=await http('POST','/api/requests/'+rid+'/'+act,{cookie:B.cookie,body:{detailsHash:q.detailsHash}});assert.equal(x.code,404,'owner B cannot '+act+' A\'s request (workspace-scoped: not found)');}
 assert.equal((await f.als.run({ws:A.ws},()=>f.getJ('fm:req:'+rid))).status,'pending','A\'s request is untouched');assert.equal(R.sends,0,'nothing sent');
 // ---- no session: no decision
 assert.equal((await http('POST','/api/requests/'+rid+'/approve',{body:{detailsHash:q.detailsHash}})).code,401,'no session: 401');
 // ---- the owning owner approves: one send
 const ap=await http('POST','/api/requests/'+rid+'/approve',{cookie:A.cookie,body:{detailsHash:q.detailsHash}});assert.equal(ap.code,200);assert.equal(ap.j.request.status,'executed');assert.equal(R.sends,1);
 // ---- a revoked bot's key cannot propose again
 await f.als.run({ws:A.ws},async()=>{const a=await f.getJ('fm:agent:'+botA.agent.id);a.status='revoked';await f.setJ('fm:agent:'+botA.agent.id,a);});
 const n1=await reqCount();const rv=await http('POST','/api/gateway/act',{key:botA.key,body:{action:'email.send',params:{...mail,subject:'Another'},task_id:job.id}});
 assert.deepEqual([rv.code,rv.j.code],[403,'revoked'],'revoked key is refused');assert.equal(await reqCount(),n1,'no request from a revoked key');assert.equal(R.sends,1);
 // ---- no secrets in what the owner screen or the bot receives
 await f.als.run({ws:A.ws},async()=>{const a=await f.getJ('fm:agent:'+botA.agent.id);a.status='active';a.wake={channel:'webhook',target:'https://grok.com/x',secret:'whsec_SECRETSECRETSECRET1234'};await f.setJ('fm:agent:'+botA.agent.id,a);});
 const st=JSON.stringify((await http('GET','/api/state',{cookie:A.cookie})).j)+JSON.stringify((await http('GET','/api/gateway/requests/'+rid,{key:botA.key})).j);
 assert.ok(st.includes(botA.agent.id)&&st.includes('"channel":"webhook"'),'the state does carry the bot and its wake channel, so a leak would show');
 for(const bad of ['whsec_SECRETSECRETSECRET1234',env.RESEND_API_KEY,botA.key,botB.key,f.sha(botA.key)])assert.ok(!st.includes(bad),'no secret in owner state or bot responses: '+bad.slice(0,6));
 console.log('PASS gateway auth and isolation through the real handler: no/garbage/revoked keys cannot propose; bot B cannot read A\'s request; owner B cannot see, approve, deny or reconcile it; no session cannot decide; only owner A\'s approval sends, once');
})().catch(e=>{console.error(e);process.exit(1)});
