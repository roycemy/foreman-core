// Fix 2: when recovery adopts a note an older build already wrote, it records the request's completed receipt itself. That receipt was
// written without the request's once key, so SET lasthash, LPUSH and the done marker were separate calls: a crash between the chain-head
// write and the list write left the chain pointing at a row that was never written, and the rerun chained onto it. With the once key the
// receipt goes through the atomic RECEIPT_ONCE. A crash before or after ANY store command after the charge, then recovery (run twice),
// must leave exactly one completed receipt row for the request, an unbroken chain link, and one charge. Offline, real handler.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={r,setJ,getJ,als,createAgent,newTask,sha,bust};';
const ctx={require,module:{exports:{}},process:{env:{}},global:{},console:{...console,log(){},warn(){},error(){}},fetch:async u=>{throw Error('NO NETWORK '+u)},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const h=ctx.module.exports,f=h.t;const sleep=ms=>new Promise(x=>setTimeout(x,ms));
const origR=ctx.r;let hook=null;ctx.r=function(cmd){if(hook&&hook.match(cmd)){const hh=hook;hook=null;hh.hit=true;return hh.after?origR(cmd).then(()=>new Promise(()=>{})):new Promise(()=>{});}return origR(cmd);};
async function http(method,url,{cookie,body}={}){let out;const headers={host:'localhost',origin:'http://localhost'};if(cookie)headers.cookie='fm_sess='+cookie;
 const res={setHeader(){},status(c){this.code=c;return this},json(j){out={code:this.code||200,j}},send(b){out={code:this.code||200,j:b}},end(){out={code:this.code||204}}};await h({method,url,headers,body:body||{}},res);return out||{code:0};}
(async()=>{
 const email='a@o.example',ws='ws_adopt';await f.setJ('gl:user:'+f.sha(email),{id:'u',email,ws});await f.setJ('gl:sess:'+f.sha('ck'),{uid:'u',email,ws});const inW=fn=>f.als.run({ws},fn);
 const bot=await inW(()=>f.createAgent('Old bot','Ops','custom',false,{preset:'balanced'}));const day=new Date().toISOString().slice(0,10);
 const iso=ms=>new Date(Date.now()-ms).toISOString();let n=0,exercised=0;
 const rows=async()=>(await inW(()=>f.r(['LRANGE','fm:receipts',0,299]))).map(x=>JSON.parse(x));
 const chainOk=async()=>{const rs=await rows();for(let i=0;i<rs.length-1;i++)if(rs[i].prevHash!==rs[i+1].hash)return false;return true;};
 const spentBefore=async()=>Number(await inW(()=>f.r(['GET','fm:spend:'+bot.agent.id+':'+day]))||0);
 for(const when of ['before','after'])for(let k=0;k<14;k++){
  // a request stranded by an older build whose note WAS written (list-only, random id): recovery adopts that note
  const rid='req_adopt_'+(++n),params={title:'Adopted '+n,text:'Written before the upgrade '+n},hash=f.sha(JSON.stringify(['notes.write',params]));
  const t=await inW(()=>f.newTask({title:'Stranded '+n,assignee:bot.agent.id}));const note={id:'note_adoptrc'+String(n).padStart(3,'0'),by:bot.agent.id,...params,at:iso(9*60000)};
  await inW(async()=>{await f.r(['LPUSH','fm:notes',JSON.stringify(note)]);await f.setJ('fm:req:'+rid,{id:rid,agentId:bot.agent.id,agentName:'Old bot',action:'notes.write',status:'approved',params,rawParams:params,detailsHash:hash,decidedAt:iso(10*60000),createdAt:iso(10*60000),taskId:t.id});await f.r(['SADD','fm:reqs',rid]);await f.r(['SADD','fm:taskreqs:'+t.id,rid]);f.bust();});
  const spent0=await spentBefore();
  let armed=false,seen=0;const hh={match:c=>{if(!armed){if(c[0]==='EVAL'&&/^fm:charged:/.test(String(c[3])))armed=true;else return false;}return seen++===k;},hit:false,after:when==='after'};
  hook=hh;http('POST','/api/requests/'+rid+'/recover',{cookie:'ck'}).catch(()=>{});for(let i=0;i<300&&!hh.hit;i++)await sleep(5);hook=null;if(!hh.hit){await sleep(30);continue;} // fewer commands than k
  exercised++;const label='crash '+when+' command #'+k+' after the charge';
  await inW(async()=>{await f.r(['DEL','fm:joblock:'+t.id]);const x=await f.getJ('fm:req:'+rid);if(x.recoverStartedAt)x.recoverStartedAt=iso(5*60000);await f.setJ('fm:req:'+rid,x);f.bust();}); // the killed call's lock lapses
  const r1=await http('POST','/api/requests/'+rid+'/recover',{cookie:'ck'}),r2=await http('POST','/api/requests/'+rid+'/recover',{cookie:'ck'});
  assert.ok([200,409].includes(r1.code)&&[200,409].includes(r2.code),label+': '+r1.code+' '+r2.code+' '+JSON.stringify(r1.j).slice(0,120));
  const q=await inW(()=>f.getJ('fm:req:'+rid));assert.equal(q.status,'executed',label+': the request is finished');assert.equal(q.result.note_id,note.id,label+': it points at the adopted note');
  const mine=(await rows()).filter(x=>x.requestId===rid&&x.outcome==='completed');assert.equal(mine.length,1,label+': exactly one completed receipt row, got '+mine.length);
  assert.equal(q.receiptId,mine[0].id,label+': the request points at that receipt');assert.ok(await chainOk(),label+': one chain link: no head pointing at a row that was never written');
  assert.equal((await spentBefore())-spent0,2,label+': charged once');}
 assert.ok(exercised>=10,'enough crash points exercised ('+exercised+')');
 console.log('PASS adopted-note receipt once: a crash before or after any store command after the charge in the adopted-older-note recovery, then recovery run twice, leaves one completed receipt row, one chain link and one charge ('+exercised+' crash points)');
})().catch(e=>{console.error(e);process.exit(1)});
