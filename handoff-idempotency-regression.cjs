// work.handoff is retry-safe: repeating the same handoff (same task, same target) returns the existing child job, with no second job and no
// second wake. A handoff to a different bot is still a new child. Offline, in-memory store, outbound calls stubbed.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const API=path.join(__dirname,'api/index.js'),src=fs.readFileSync(API,'utf8')+'\nmodule.exports.t={r,setJ,getJ,sha,als,createAgent};';
const out=[];const ctx={require:require('module').createRequire(API),module:{exports:{}},process:{env:{RESEND_API_KEY:'re_synthetic',WAKE_EMAIL_FROM:'Alter <wake@mail.example>',WAKE_CUSTOM_EMAIL:'bots@example.com'}},global:{},console:{log(){},warn(){},error(){}},fetch:async(u,o)=>{out.push(String(u));return {ok:true,status:200,json:async()=>({})};},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const h=ctx.module.exports,f=h.t;const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
async function http(method,url,{key,cookie,body}={}){let o;const headers={host:'localhost',origin:'http://localhost'};if(key)headers.authorization='Bearer '+key;if(cookie)headers.cookie='fm_sess='+cookie;const res={setHeader(){},status(c){this.code=c;return this},json(j){o={code:this.code||200,j}},send(b){o={code:this.code||200,j:b}},end(){o={code:this.code||204}}};await h({method,url,headers,body:body||{}},res);return o;}
(async()=>{const ws='ws_ho';await f.setJ('gl:user:'+sha('o@ho.example'),{id:'u',email:'o@ho.example',ws});await f.setJ('gl:sess:'+sha('ck'),{uid:'u',email:'o@ho.example',ws});
 const bot=async n=>{const b=await f.als.run({ws},()=>f.createAgent(n,'x','custom',false,{preset:'balanced'}));return {id:b.agent.id,key:b.key};};const A=await bot('A'),B=await bot('B'),C=await bot('C');
 const t=await http('POST','/api/tasks',{cookie:'ck',body:{title:'Parent',assignee:A.id}});const id=(t.j.task||t.j).id;await http('GET','/api/gateway/tasks/next',{key:A.key});
 const ho=()=>http('POST','/api/gateway/act',{key:A.key,body:{action:'work.handoff',task_id:id,params:{task_id:id,to:B.id,title:'Child'}}});
 const r1=await ho(),mails1=out.length,r2=await ho(),r3=await ho();
 assert.equal(r1.code,200,JSON.stringify(r1.j));assert.equal(r2.j.result.child_task_id,r1.j.result.child_task_id,'a retry returns the same child');assert.equal(r3.j.result.duplicate,true);
 const kids=(await f.als.run({ws},()=>f.r(['LRANGE','fm:tasklist',0,59]))).length;assert.equal(out.length,mails1,'no second wake on retry');
 const toC=await http('POST','/api/gateway/act',{key:A.key,body:{action:'work.handoff',task_id:id,params:{task_id:id,to:C.id,title:'Other'}}});assert.notEqual(toC.j.result.child_task_id,r1.j.result.child_task_id,'a different target is a new child');
 assert.equal((await f.als.run({ws},()=>f.r(['LRANGE','fm:tasklist',0,59]))).length,kids+1,'exactly one more job, for the new target');
 console.log('PASS work.handoff retry-safe: the same handoff repeated returns the existing child (no second job, no second wake); a different target is a new child');
})().catch(e=>{console.error(e);process.exit(1)});
