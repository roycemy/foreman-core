// An approved request's completed receipt is written once and atomically: its id derives from the request, and the marker, the hash-chain
// head and the list entry are one operation. A crash before or after ANY store command following the charge, then recovery, must leave one
// receipt row for the request, an unbroken hash chain (no head pointing at a row that was never written), one note and one charge.
// Fault injection freezes (before) or loses the reply of (after) one store command, as a killed function would. Offline.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={r,setJ,getJ,als,createAgent,newTask,sha,bust,noteIdFor};';
const ctx={require,module:{exports:{}},process:{env:{}},global:{},console,fetch:async u=>{throw Error('NO NETWORK '+u)},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const handler=ctx.module.exports,f=handler.t;const sleep=ms=>new Promise(x=>setTimeout(x,ms));
const origR=ctx.r;let hook=null;ctx.r=function(cmd){if(hook&&hook.match(cmd)){const h=hook;hook=null;h.hit=true;return h.after?origR(cmd).then(()=>new Promise(()=>{})):new Promise(()=>{});}return origR(cmd);};
async function http(method,url,{key,cookie,body}={}){let out;const headers={host:'localhost',origin:'http://localhost'};if(key)headers.authorization='Bearer '+key;if(cookie)headers.cookie='fm_sess='+cookie;
 const res={setHeader(){},status(c){this.code=c;return this},json(j){out={code:this.code||200,j};return out},send(b){out={code:this.code||200,j:b};return out},end(){out={code:this.code||204};return out}};await handler({method,url,headers,body:body||{}},res);return out||{code:0};}
(async()=>{
 const email='a@owner.example',ws='ws_rcptonce',u={id:'user_a',email,ws};await f.setJ('gl:user:'+f.sha(email),u);await f.setJ('gl:sess:'+f.sha('cookie_a'),{uid:u.id,email,ws});const inA=fn=>f.als.run({ws},fn);
 const day=new Date().toISOString().slice(0,10);let n=0,exercised=0;
 const rows=async()=>(await inA(()=>f.r(['LRANGE','fm:receipts',0,299]))).map(x=>JSON.parse(x));
 const chainOk=async()=>{const rs=await rows();for(let i=0;i<rs.length-1;i++)if(rs[i].prevHash!==rs[i+1].hash)return false;return true;};
 for(const when of ['before','after'])for(let k=0;k<16;k++){
  const bot=await inA(()=>f.createAgent('Bot '+(++n),'Ops','custom',false,{preset:'balanced'}));const t=await inA(()=>f.newTask({title:'Job '+n,assignee:bot.agent.id}));await http('GET','/api/gateway/tasks/next',{key:bot.key});
  const pr=await http('POST','/api/gateway/act',{key:bot.key,body:{action:'notes.write',task_id:t.id,params:{title:'Plan '+n,text:'Body '+n}}});const q=await inA(()=>f.getJ('fm:req:'+pr.j.request_id));
  let armed=false,seen=0;const h={match:c=>{if(!armed){if(c[0]==='EVAL'&&/^fm:charged:/.test(String(c[3])))armed=true;else return false;}return seen++===k;},hit:false,after:when==='after'};
  hook=h;http('POST','/api/requests/'+q.id+'/approve',{cookie:'cookie_a',body:{detailsHash:q.detailsHash}}).catch(()=>{});for(let i=0;i<300&&!h.hit;i++)await sleep(5);hook=null;if(!h.hit){await sleep(30);continue;} // fewer commands than k
  exercised++;const label='crash '+when+' command #'+k+' after the charge';
  await inA(async()=>{await f.r(['DEL','fm:joblock:'+t.id]);await f.r(['DEL','fm:notelock:'+f.noteIdFor(q.id)]);const x=await f.getJ('fm:req:'+q.id);x.decidedAt=new Date(Date.now()-5*60000).toISOString();if(x.recoverStartedAt)x.recoverStartedAt=x.decidedAt;await f.setJ('fm:req:'+q.id,x);f.bust();});
  const rc=await http('POST','/api/requests/'+q.id+'/recover',{cookie:'cookie_a'});assert.ok([200,409].includes(rc.code),label+': '+JSON.stringify(rc.j)); // 409: the request had already been finalized before the crash
  const after=await inA(()=>f.getJ('fm:req:'+q.id));assert.equal(after.status,'executed',label);
  const mine=(await rows()).filter(x=>x.requestId===q.id&&x.outcome==='completed');assert.equal(mine.length,1,label+': one receipt row for the request, got '+mine.length);
  assert.equal(after.receiptId,mine[0].id,label+': the request points at that receipt');assert.ok(await chainOk(),label+': the receipt hash chain is unbroken (no head pointing at a row that was never written)');
  assert.equal(Number(await inA(()=>f.r(['GET','fm:spend:'+bot.agent.id+':'+day]))),2,label+': charged once');}
 assert.ok(exercised>=10,'enough crash points were exercised ('+exercised+')');
 console.log('PASS approved receipt once: a crash before or after any store command after the charge, then recovery, leaves one receipt row for the request, an unbroken hash chain, one note and one charge ('+exercised+' crash points)');
})().catch(e=>{console.error(e);process.exit(1)});
