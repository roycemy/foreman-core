// The paired runner page (Instinct's pairing path) can do the trial: claim the trial job, read its input, propose pilot.handoff, and as the
// target read only the approved package and complete. Real handler through /api/runner/<bot>/gateway/*, offline, in-memory store.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const API=path.join(__dirname,'api/index.js'),src=fs.readFileSync(API,'utf8')+'\nmodule.exports.t={setJ,getJ,sha,als,createAgent,startRunnerSession,runnerCookieName};';
const ctx={require:require('module').createRequire(API),module:{exports:{}},process:{env:{}},global:{},console:{...console,log(){},warn(){},error(){}},fetch:async u=>{throw Error('NO NETWORK '+u)},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const h=ctx.module.exports,f=h.t;
async function http(method,url,{cookie,body,headers}={}){let out;const hd={host:'localhost',origin:'http://localhost',...(cookie?{cookie}:{}),...(headers||{})};const res={setHeader(k,v){this.h=this.h||{};this.h[k]=v},status(c){this.code=c;return this},json(j){out={code:this.code||200,j}},send(b){out={code:this.code||200,j:b}},end(){out={code:this.code||204}}};await h({method,url,headers:hd,body:body||{}},res);return out;}
(async()=>{
 const html=fs.readFileSync(path.join(__dirname,'public/runner.html'),'utf8');
 assert.ok(html.includes('<option>pilot.handoff</option>'),'runner offers pilot.handoff');assert.ok(/\$\('trialinput'\)\.onclick=.*call\('tasks\/'\+encodeURIComponent\(task\.id\)\+'\/input'\)/.test(html),'runner reads the trial input for the claimed job');
 const ws='ws_rt';await f.setJ('gl:user:'+f.sha('o@rt'),{id:'u',email:'o@rt',ws});await f.setJ('gl:sess:'+f.sha('ck'),{uid:'u',email:'o@rt',ws});
 const A=await f.als.run({ws},()=>f.createAgent('Instinct','x','instinct',false,{preset:'balanced'})),B=await f.als.run({ws},()=>f.createAgent('Grok','x','custom',false,{preset:'balanced'}));
 const runner=async(bot)=>{let cookie;const res={setHeader(k,v){if(k==='Set-Cookie')cookie=String(v).split(';')[0]}};const s=await f.startRunnerSession(res,ws,bot.agent.id,bot.key);
  return (m,p,body)=>http(m,'/api/runner/'+bot.agent.id+'/gateway/'+p,{cookie,body,headers:{'x-alter-csrf':s.csrf}});};
 const owner=(m,u,body)=>http(m,u,{cookie:'fm_sess=ck',body});
 const TR='[0:05] Intro.\n[1:10] The hinge sags because the post leans.\n[2:30] Brace the post, then rehang the gate.';
 const c=await owner('POST','/api/pilots',{sourceAgentId:A.agent.id,targetAgentId:B.agent.id,transcript:TR,sourceInstructions:'Pick moments.',targetTitle:'Captions',targetInstructions:'One each.',confirmed:true});assert.equal(c.code,201,JSON.stringify(c.j));const p=c.j.pilot;
 const RA=await runner(A),RB=await runner(B);
 assert.equal((await RB('GET','tasks/next')).j.task,null,'B: no job before approval (empty claim)');
 assert.equal((await RA('GET','tasks/next')).j.task.id,p.source.taskId);
 const inA=await RA('GET','tasks/'+p.source.taskId+'/input');assert.equal(inA.code,200);assert.equal(inA.j.transcript,TR);
 assert.equal((await RB('GET','tasks/'+p.source.taskId+'/input')).code,404,'B cannot read A\'s input through its runner');
 const pr=await RA('POST','act',{action:'pilot.handoff',task_id:p.source.taskId,params:{moments:[{start:'1:10',end:'1:20',reason:'Cause',excerpt:'The hinge sags because the post leans.'}]}});assert.equal(pr.code,202,JSON.stringify(pr.j));
 const v=(await owner('GET','/api/pilots/'+p.id)).j.pilot;assert.equal((await owner('POST','/api/requests/'+pr.j.request_id+'/approve',{detailsHash:v.package.fingerprint})).j.request.status,'executed');
 const jb=(await RB('GET','tasks/next')).j.task;assert.equal(jb.id,v.package.targetTaskId);
 const inB=await RB('GET','tasks/'+jb.id+'/input');assert.equal(inB.code,200);assert.equal(inB.j.moments.length,1);assert.ok(!JSON.stringify(inB.j).includes('Intro.'));
 assert.equal((await RB('POST','tasks/'+jb.id+'/complete',{result:'The post leans, so the hinge sags.'})).code,200);
 assert.equal((await owner('GET','/api/pilots/'+p.id)).j.pilot.status,'finished');
 assert.equal((await http('GET','/api/runner/'+A.agent.id+'/gateway/tasks/next',{})).code,401,'no runner session: refused');
 console.log('PASS runner trial path: the paired runner page offers pilot.handoff and Read trial input; through runner sessions A claims, reads, proposes, B gets nothing before approval, then claims, reads only the package and completes');
})().catch(e=>{console.error(e);process.exit(1)});
