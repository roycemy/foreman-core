// Item C: recovery decides "already completed" from a per-request completion marker, not by scanning the last 300 receipts. The function
// dies after the completed receipt was written but before the request is finalized; 310 later receipts push that receipt out of the list;
// recovery must then keep the original receipt, write no second receipt, no second note and no second cost. Requests completed before
// the marker existed still fall back to the scan. Fault injection freezes one store call as a killed function would. Offline.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={r,setJ,getJ,als,createAgent,newTask,sha,bust,noteIdFor};';
const ctx={require,module:{exports:{}},process:{env:{}},global:{},console,fetch:async u=>{throw Error('NO NETWORK '+u)},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const handler=ctx.module.exports,f=handler.t;const sleep=ms=>new Promise(x=>setTimeout(x,ms));
const origR=ctx.r;let hook=null;ctx.r=function(cmd){if(hook&&hook.match(cmd)){const h=hook;hook=null;h.hit=true;return new Promise(()=>{});}return origR(cmd);};
async function crashDuring(match,fn){const h={match,hit:false};hook=h;fn().catch(()=>{});for(let i=0;i<600&&!h.hit;i++)await sleep(5);hook=null;assert.ok(h.hit,'the fault was injected');}
async function http(method,url,{key,cookie,body}={}){let out;const headers={host:'localhost',origin:'http://localhost'};if(key)headers.authorization='Bearer '+key;if(cookie)headers.cookie='fm_sess='+cookie;
 const res={setHeader(){},status(c){this.code=c;return this},json(j){out={code:this.code||200,j};return out},send(b){out={code:this.code||200,j:b};return out},end(){out={code:this.code||204};return out}};await handler({method,url,headers,body:body||{}},res);return out||{code:0};}
(async()=>{
 const email='a@owner.example',ws='ws_trim',u={id:'user_a',email,ws};await f.setJ('gl:user:'+f.sha(email),u);await f.setJ('gl:sess:'+f.sha('cookie_a'),{uid:u.id,email,ws});const inA=fn=>f.als.run({ws},fn);
 const day=new Date().toISOString().slice(0,10);
 const bot=await inA(()=>f.createAgent('Trim bot','Ops','custom',false,{preset:'balanced'}));const t=await inA(()=>f.newTask({title:'Trim job',assignee:bot.agent.id}));
 await http('GET','/api/gateway/tasks/next',{key:bot.key});
 const pr=await http('POST','/api/gateway/act',{key:bot.key,body:{action:'notes.write',task_id:t.id,params:{title:'Kept once',text:'Body'}}});const q=await inA(()=>f.getJ('fm:req:'+pr.j.request_id));
 // die after the completed receipt, before the request is finalized
 await crashDuring(c=>c[0]==='SET'&&c[1]==='fm:req:'+q.id&&String(c[2]).includes('"status":"executed"'),()=>http('POST','/api/requests/'+q.id+'/approve',{cookie:'cookie_a',body:{detailsHash:q.detailsHash}}));
 const mine=async()=>(await inA(()=>f.r(['LRANGE','fm:receipts',0,299]))).map(x=>JSON.parse(x)).filter(x=>x.requestId===q.id&&x.outcome==='completed');
 const original=(await mine())[0];assert.ok(original,'the receipt was written before the crash');
 const notesBefore=(await inA(()=>f.r(['SMEMBERS','fm:noteids']))).length,costBefore=Number(await inA(()=>f.r(['GET','fm:spend:'+bot.agent.id+':'+day])));assert.equal(costBefore,2);
 // 310 later receipts trim it out of the 300-entry list (as receipt() does: LPUSH then LTRIM 0 299)
 await inA(async()=>{for(let i=0;i<310;i++){await f.r(['LPUSH','fm:receipts',JSON.stringify({id:'rcpt_filler'+i,requestId:null,outcome:'completed',action:'web.fetch'})]);await f.r(['LTRIM','fm:receipts',0,299]);}});
 assert.equal((await mine()).length,0,'the original receipt is no longer in the list');
 // the frozen invocation's locks lapse and the request ages past the stale window
 await inA(async()=>{await f.r(['DEL','fm:joblock:'+t.id]);await f.r(['DEL','fm:notelock:'+f.noteIdFor(q.id)]);const x=await f.getJ('fm:req:'+q.id);x.decidedAt=new Date(Date.now()-5*60000).toISOString();await f.setJ('fm:req:'+q.id,x);f.bust();});
 const rc=await http('POST','/api/requests/'+q.id+'/recover',{cookie:'cookie_a'});assert.equal(rc.code,200,JSON.stringify(rc.j));
 const after=await inA(()=>f.getJ('fm:req:'+q.id));
 assert.equal(after.status,'executed');assert.equal(after.receiptId,original.id,'the request keeps the original receipt, found by its completion marker');
 assert.equal((await mine()).length,0,'no second receipt was written');
 assert.equal((await inA(()=>f.r(['SMEMBERS','fm:noteids']))).length,notesBefore,'no second note');
 assert.equal(Number(await inA(()=>f.r(['GET','fm:spend:'+bot.agent.id+':'+day]))),2,'no second cost');
 // the marker points at a real receipt id and holds nothing else
 assert.equal(await inA(()=>f.r(['GET','fm:done:'+q.id])),original.id,'the completion marker holds only the receipt id');
 // a request completed before the marker existed still falls back to scanning the list
 {const t2=await inA(()=>f.newTask({title:'Legacy',assignee:bot.agent.id}));await http('POST','/api/gateway/tasks/'+t.id+'/complete',{key:bot.key,body:{result:'done'}});await http('GET','/api/gateway/tasks/next',{key:bot.key});
  const p2=await http('POST','/api/gateway/act',{key:bot.key,body:{action:'notes.write',task_id:t2.id,params:{title:'Legacy',text:'L'}}});const q2=await inA(()=>f.getJ('fm:req:'+p2.j.request_id));
  await crashDuring(c=>c[0]==='SET'&&c[1]==='fm:req:'+q2.id&&String(c[2]).includes('"status":"executed"'),()=>http('POST','/api/requests/'+q2.id+'/approve',{cookie:'cookie_a',body:{detailsHash:q2.detailsHash}}));
  const orig2=(await inA(()=>f.r(['LRANGE','fm:receipts',0,299]))).map(x=>JSON.parse(x)).find(x=>x.requestId===q2.id&&x.outcome==='completed');
  await inA(async()=>{await f.r(['DEL','fm:done:'+q2.id]);await f.r(['DEL','fm:joblock:'+t2.id]);await f.r(['DEL','fm:notelock:'+f.noteIdFor(q2.id)]);const x=await f.getJ('fm:req:'+q2.id);x.decidedAt=new Date(Date.now()-5*60000).toISOString();await f.setJ('fm:req:'+q2.id,x);f.bust();});
  assert.equal((await http('POST','/api/requests/'+q2.id+'/recover',{cookie:'cookie_a'})).code,200);assert.equal((await inA(()=>f.getJ('fm:req:'+q2.id))).receiptId,orig2.id,'no marker: the list scan still finds it');}
 console.log('PASS receipt trim: recovery finds the completed receipt through a per-request marker, so a receipt trimmed out of the last 300 causes no second receipt, note or cost; older requests without a marker still fall back to the scan');
})().catch(e=>{console.error(e);process.exit(1)});
