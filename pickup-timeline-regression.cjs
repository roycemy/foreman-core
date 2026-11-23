// GET /api/jobs/:id carries a pickup timeline for latency measurement: assigned, wake sent (channel), claimed, finished, and the seconds
// between them, taken from the job and its events. A fake clock moves 4 s to the wake, 7 s to the claim and 20 s to the finish.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert'),crypto=require('crypto');
let off=0;class FD extends Date{constructor(...a){if(a.length)super(...a);else super(Date.now()+off)}static now(){return Date.now()+off}}
const API=path.join(__dirname,'api/index.js'),src='Date=FD;'+fs.readFileSync(API,'utf8')+'\nmodule.exports.t={setJ,sha,als,createAgent};';
const ctx={FD,require:require('module').createRequire(API),module:{exports:{}},process:{env:{RESEND_API_KEY:'re_synthetic',WAKE_EMAIL_FROM:'Alter <wake@mail.example>',WAKE_CUSTOM_EMAIL:'bot@example.com'}},global:{},console:{log(){},warn(){},error(){}},
 fetch:async()=>{off+=4000;return {ok:true,status:200,json:async()=>({})};},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const h=ctx.module.exports,f=h.t;const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
async function http(method,url,{key,cookie,body}={}){let o;const headers={host:'localhost',origin:'http://localhost'};if(key)headers.authorization='Bearer '+key;if(cookie)headers.cookie='fm_sess='+cookie;const res={setHeader(){},status(c){this.code=c;return this},json(j){o={code:this.code||200,j}},send(b){o={code:this.code||200,j:b}},end(){o={code:this.code||204}}};await h({method,url,headers,body:body||{}},res);return o;}
(async()=>{const ws='ws_pt';await f.setJ('gl:user:'+sha('o@pt.example'),{id:'u',email:'o@pt.example',ws});await f.setJ('gl:sess:'+sha('ck'),{uid:'u',email:'o@pt.example',ws});
 const b=await f.als.run({ws},()=>f.createAgent('Bot','x','custom',false,{preset:'balanced'}));
 const t=await http('POST','/api/tasks',{cookie:'ck',body:{title:'Trivial job',assignee:b.agent.id}});const id=(t.j.task||t.j).id; // the wake's provider call advances the clock 4 s
 off+=3000;const c=await http('GET','/api/gateway/tasks/next',{key:b.key});assert.equal(c.j.task.id,id);
 off+=20000;await http('POST','/api/gateway/tasks/'+id+'/complete',{key:b.key,body:{result:'done'}});
 const p=(await http('GET','/api/jobs/'+id,{cookie:'ck'})).j.pickup;
 assert.equal(p.wakeChannel,'email');assert.equal(p.assignee,b.agent.id);for(const k of ['assignedAt','wakeSentAt','claimedAt','finishedAt'])assert.ok(p[k],k);
 assert.ok(Date.parse(p.assignedAt)<=Date.parse(p.wakeSentAt)&&Date.parse(p.wakeSentAt)<=Date.parse(p.claimedAt)&&Date.parse(p.claimedAt)<=Date.parse(p.finishedAt),'monotonic');
 assert.equal(p.secondsAssignToWake,4);assert.equal(p.secondsWakeToClaim,3);assert.equal(p.secondsAssignToClaim,7);assert.equal(p.secondsClaimToFinish,20);
 console.log('PASS pickup timeline: assigned -> wake sent (email) 4 s -> claimed 3 s later (7 s from assignment) -> finished 20 s later, read from GET /api/jobs/:id');
})().catch(e=>{console.error(e);process.exit(1)});
