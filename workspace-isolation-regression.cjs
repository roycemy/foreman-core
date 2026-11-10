// Broad workspace isolation through the real handler: owner B's session is fired at every id-bearing owner route with owner A's ids
// (jobs, tasks, agents, requests, cards, money). Afterwards every stored record of workspace A is byte-identical, nothing B received
// carries A's content, and no provider was called. Storage isolation is structural (nsKey prefixes fm: keys with w:<ws>:); this checks
// the routes do not reach around it. Offline: fetch is a fake that records every call.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={r,setJ,getJ,als,createAgent,newTask,sha};';
const calls=[];const resp=(s,j)=>({ok:s>=200&&s<300,status:s,json:async()=>j,text:async()=>JSON.stringify(j)});
async function fakeFetch(url,o={}){calls.push(String(url));const u=new URL(url);if(u.hostname!=='api.resend.com')throw Error('NO NETWORK: '+url);return resp(200,{id:'em_'+calls.length});}
const env={RESEND_API_KEY:'re_test_fixture',WAKE_EMAIL_FROM:'Alter <alerts@alter.example>',ALTER_EMAIL_ALLOWED_TO:'owner@example.com'};
const ctx={require,module:{exports:{}},process:{env},global:{},console,fetch:fakeFetch,setTimeout,clearTimeout,URL,AbortSignal,Buffer};vm.runInNewContext(src,ctx);
const handler=ctx.module.exports,f=handler.t;
async function http(method,url,{key,cookie,body}={}){let out;const headers={host:'localhost',origin:'http://localhost'};if(key)headers.authorization='Bearer '+key;if(cookie)headers.cookie='fm_sess='+cookie;
 const res={setHeader(){},status(c){this.code=c;return this},json(j){out={code:this.code||200,j};return out},send(b){out={code:this.code||200,j:b};return out},end(){out={code:this.code||204};return out},redirect(){out={code:302};return out}};
 await handler({method,url,headers,body:body||{}},res);return out||{code:0};}
async function owner(tag){const email=tag+'@owner.example',ws='ws_'+tag,u={id:'user_'+tag,email,ws};await f.setJ('gl:user:'+f.sha(email),u);await f.setJ('gl:sess:'+f.sha('cookie_'+tag),{uid:u.id,email,ws});return {ws,cookie:'cookie_'+tag};}
function snapshot(ws){const m=ctx.global.__mem,pre='w:'+ws+':',o={};for(const [k,v] of m.kv)if(String(k).startsWith(pre))o['kv '+k]=JSON.stringify(v);for(const [k,v] of m.lists)if(String(k).startsWith(pre))o['list '+k]=JSON.stringify(v);return o;}
(async()=>{
 const A=await owner('a'),B=await owner('b');
 const botA=await f.als.run({ws:A.ws},()=>f.createAgent('Bot A','Ops','custom',false,{preset:'balanced'}));
 const botB=await f.als.run({ws:B.ws},()=>f.createAgent('Bot B','Ops','custom',false,{preset:'balanced'}));
 const SECRET_TITLE='Workspace A secret plan',SECRET_BODY='Workspace A confidential body text';
 const job=await f.als.run({ws:A.ws},()=>f.newTask({title:SECRET_TITLE,brief:'brief A',assignee:botA.agent.id}));
 await http('GET','/api/gateway/tasks/next',{key:botA.key});
 const p=await http('POST','/api/gateway/act',{key:botA.key,body:{action:'email.send',params:{to:'owner@example.com',subject:SECRET_TITLE,text:SECRET_BODY},task_id:job.id}});
 const rid=p.j.request_id;assert.ok(rid,'A has a pending email request');
 const pending=await f.als.run({ws:A.ws},()=>f.getJ('fm:req:'+rid));
 // let A's stored state settle, then snapshot every key of workspace A
 const before=snapshot(A.ws);assert.ok(Object.keys(before).length>5,'workspace A has stored records ('+Object.keys(before).length+')');
 const callsBefore=calls.length;const aid=botA.agent.id,tid=job.id;
 const barrage=[
  ['GET','/api/jobs/'+tid],['POST','/api/tasks/'+tid+'/assign',{assignee:botB.agent.id}],['POST','/api/tasks/'+tid+'/dismiss'],['POST','/api/tasks/'+tid+'/stop'],
  ['POST','/api/tasks/'+tid+'/reassign',{assignee:botB.agent.id}],['POST','/api/tasks/'+tid+'/grant',{actions:['email.send']}],
  ['POST','/api/requests/'+rid+'/approve',{detailsHash:pending.detailsHash}],['POST','/api/requests/'+rid+'/deny'],['POST','/api/requests/'+rid+'/reconcile'],['POST','/api/requests/'+rid+'/delivery'],
  ...['revoke','restore','permissions','limits','room','pause','strengths','remove','gateway-key','wake','pairing','connection','reconnect','permission-scope'].map(a=>['POST','/api/agents/'+aid+'/'+a,{mode:'AUTO',permissions:{'email.send':'AUTO'},dailyCents:99999,paused:false,scope:'all'}]),
  ['GET','/api/agents/'+aid+'/connection'],['POST','/api/cards/card_'+'0'.repeat(12)+'/approve'],['POST','/api/money/spend_'+'0'.repeat(12)+'/approve'],
 ];
 const leaks=[];
 for(const [m,u,b] of barrage){const x=await http(m,u,{cookie:B.cookie,body:b||{}});const s=JSON.stringify(x.j||'');
  for(const needle of [SECRET_TITLE,SECRET_BODY,'brief A',botA.key])if(s.includes(needle))leaks.push(m+' '+u+' leaked '+needle.slice(0,12));}
 assert.deepEqual(leaks,[],'nothing of workspace A reaches owner B');
 const after=snapshot(A.ws);
 const changed=Object.keys({...before,...after}).filter(k=>before[k]!==after[k]);
 assert.deepEqual(changed,[],'workspace A is byte-identical after owner B\'s '+barrage.length+' calls');
 assert.equal(calls.length,callsBefore,'no provider was called');
 // B's own view never contains A's job, request or bot
 const sb=JSON.stringify((await http('GET','/api/state',{cookie:B.cookie})).j);for(const needle of [tid,rid,aid,SECRET_TITLE])assert.ok(!sb.includes(needle),'B\'s state has no '+needle.slice(0,14));
 // and A still works: its owner approves its own request, one send
 const ap=await http('POST','/api/requests/'+rid+'/approve',{cookie:A.cookie,body:{detailsHash:pending.detailsHash}});assert.equal(ap.j.request.status,'executed');
 console.log('PASS workspace isolation: owner B hit '+barrage.length+' id-bearing owner routes with A\'s ids; workspace A stayed byte-identical ('+Object.keys(before).length+' records), nothing of A leaked, no provider call; A\'s own approval still works');
})().catch(e=>{console.error(e);process.exit(1)});
