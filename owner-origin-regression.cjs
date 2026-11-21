// D2: owner write routes that changed state with only the session cookie (no Origin check): POST /tasks, /tasks/plan,
// /money/:id/approve|deny, /agents, /agents/:id/(revoke|restore|permissions|limits|room|pause|strengths), /agents/:id/remove, /kill,
// /connect. Every other owner write already requires the request's Origin to equal the app's own origin. These must too: a foreign or
// missing Origin gets 403 {error:'origin'} and changes nothing; the app's own origin keeps working. Real handler, offline.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={r,setJ,getJ,als,createAgent,sha};';
const ctx={require,module:{exports:{}},process:{env:{}},global:{},console:{...console,log(){},warn(){},error(){}},fetch:async u=>{throw Error('NO NETWORK '+u)},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const h=ctx.module.exports,f=h.t;
const SELF='http://localhost';
async function post(url,body,origin){let out;const headers={host:'localhost',cookie:'fm_sess=cookie_o','content-type':'application/json'};if(origin!==undefined)headers.origin=origin;
 const res={setHeader(){},status(c){this.code=c;return this},json(j){out={code:this.code||200,j}},send(b){out={code:this.code||200,j:b}},end(){out={code:this.code||204}}};
 await h({method:'POST',url,headers,body:body||{}},res);return out||{code:0};}
(async()=>{
 const email='o@owner.example',ws='ws_origin',u={id:'user_o',email,ws};await f.setJ('gl:user:'+f.sha(email),u);await f.setJ('gl:sess:'+f.sha('cookie_o'),{uid:u.id,email,ws});const inW=fn=>f.als.run({ws},fn);
 const bot=await inW(()=>f.createAgent('Origin bot','Ops','custom',false,{preset:'balanced'}));const id=bot.agent.id;
 const agent=()=>inW(()=>f.getJ('fm:agent:'+id));const agentCount=async()=>(await inW(()=>f.r(['SMEMBERS','fm:agents']))).length;
 const routes=[
  ['/api/tasks/plan',{title:'Draft the plan; then review it'}],
  ['/api/tasks',{title:'Origin test job'}],
  ['/api/money/spend_0123abcd/approve',{detailsHash:'x'}],
  ['/api/money/spend_0123abcd/deny',{}],
  ['/api/agents',{name:'Should not exist',role:'Ops',provider:'custom'}],
  ['/api/agents/'+id+'/permissions',{action:'notes.write',mode:'NEVER'}],
  ['/api/agents/'+id+'/limits',{dailyCents:0}],
  ['/api/agents/'+id+'/room',{room:'lab'}],
  ['/api/agents/'+id+'/pause',{paused:true}],
  ['/api/agents/'+id+'/strengths',{strengths:['research']}],
  ['/api/agents/'+id+'/revoke',{}],
  ['/api/agents/'+id+'/restore',{}],
  ['/api/agents/'+id+'/remove',{}],
  ['/api/kill',{on:true}],
  ['/api/connect',{provider:'custom',name:'Should not exist',connectionMode:'existing'}],
 ];
 const before={agent:JSON.stringify(await agent()),count:await agentCount(),kill:await inW(()=>f.r(['GET','fm:kill'])),tasks:(await inW(()=>f.r(['LRANGE','fm:tasklist',0,99]))).length};
 for(const [url,body] of routes)for(const origin of ['https://evil.example',undefined,'http://localhost.evil.example']){
  const r=await post(url,body,origin);assert.deepEqual([r.code,r.j&&r.j.error],[403,'origin'],url+' with Origin '+JSON.stringify(origin)+' is refused (got '+r.code+' '+JSON.stringify(r.j).slice(0,100)+')');}
 assert.equal(JSON.stringify(await agent()),before.agent,'no refused call changed the bot (permissions, limits, room, pause, strengths, revoke, restore, remove)');
 assert.equal(await agentCount(),before.count,'no refused call created a bot');assert.equal(await inW(()=>f.r(['GET','fm:kill'])),before.kill,'no refused call flipped the kill switch');
 assert.equal((await inW(()=>f.r(['LRANGE','fm:tasklist',0,99]))).length,before.tasks,'no refused call created a job');
 // the app's own origin still works for every route (some answer 4xx on their own validation, never 403 origin)
 for(const [url,body] of routes){const r=await post(url,body,SELF);assert.ok(!(r.code===403&&r.j&&r.j.error==='origin'),url+' from the app\'s own origin is not refused for origin ('+r.code+')');}
 assert.equal((await agent()).status,'revoked','same-origin calls take effect (remove ran last on a revoked bot; restore then remove)');
 assert.equal(await inW(()=>f.r(['GET','fm:kill'])),'1','same-origin kill switch works');
 console.log('PASS owner origin: POST /tasks, /tasks/plan, /money/:id/approve|deny, /agents, /agents/:id/(revoke|restore|permissions|limits|room|pause|strengths|remove), /kill and /connect refuse a foreign or missing Origin with 403 and change nothing; the app\'s own origin still works');
})().catch(e=>{console.error(e);process.exit(1)});
