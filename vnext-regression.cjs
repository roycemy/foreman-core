// vNext owner endpoints: assign, pause, job detail, reported model costs, and the public receipt boundary (PR #33).
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(require('path').join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={routes,r,setJ,getJ,als,sha,createAgent,newTask};';
const ctx={require,module:{exports:{}},process:{env:{}},global:{},console,fetch:()=>{throw Error('NO NETWORK')},setTimeout,clearTimeout,URL,AbortSignal};vm.runInNewContext(src,ctx);const f=ctx.module.exports.t,h=ctx.module.exports;
const H={host:'localhost',origin:'http://localhost'};
async function call(method,path,body,agent){let out;const res={status(n){this.code=n;return this},json(j){out={code:this.code||200,j};return out},setHeader(){},end(){out={code:this.code||204};return out}};await f.routes({method,headers:H,url:'/api'+path},res,path.split('?')[0],body||{},agent||null);return out;}
const gw=(agent,method,path,body)=>call(method,'/gateway'+path,body,agent);
// public, no session: through the real top-level handler
async function pubGet(path){let out;const res={headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;return this},status(n){this.code=n;return this},json(j){out={code:this.code||200,j,hd:this.headers};return out},send(b){out={code:this.code||200,b,hd:this.headers};return out}};await h({method:'GET',url:'/api'+path,headers:{host:'localhost'}},res);return out;}
(async()=>{await f.als.run({ws:'vnexttest'},async()=>{
 const {agent:bot}=await f.createAgent('Bot','Ops','custom',false,{preset:'balanced'});
 const {agent:other}=await f.createAgent('Other','Ops','custom',false,{preset:'balanced'});
 // assign: only unassigned queued jobs, only active unpaused bots, origin-checked
 const t=await f.newTask({title:'Draft launch email'});
 assert.equal((await call('POST','/tasks/'+t.id+'/assign',{assignee:'nope'})).code,400);
 const a1=await call('POST','/tasks/'+t.id+'/assign',{assignee:bot.id});assert.equal(a1.code,200);assert.equal(a1.j.task.assignee,bot.id);assert.equal(a1.j.task.status,'queued');
 assert.equal((await call('POST','/tasks/'+t.id+'/assign',{assignee:other.id})).code,409);
 {let out;const res={status(n){this.code=n;return this},json(j){out={code:this.code};return out}};await f.routes({method:'POST',headers:{host:'localhost',origin:'https://evil.example'}},res,'/tasks/'+t.id+'/assign',{assignee:bot.id},null);assert.equal(out.code,403);}
 console.log('PASS assign: unassigned only, active bot only, no double assign, origin checked');
 // pause: blocks claims and actions, keeps everything, resume restores; revoke-free (no epoch change)
 const epoch=(await f.getJ('fm:agent:'+bot.id)).oauthEpoch||0;
 assert.equal((await call('POST','/agents/'+bot.id+'/pause',{on:true})).code,200);
 let live=await f.getJ('fm:agent:'+bot.id);assert.equal(live.paused,true);assert.equal(live.status,'active');assert.equal(live.oauthEpoch||0,epoch);
 assert.equal((await gw(live,'GET','/tasks/next')).j.task,null);
 const blocked=await gw(live,'POST','/act',{action:'web.fetch',params:{url:'https://example.com'}});assert.equal(blocked.code,403);assert.equal(blocked.j.code,'paused');
 const t2=await f.newTask({title:'Other job'});assert.equal((await call('POST','/tasks/'+t2.id+'/assign',{assignee:bot.id})).code,409);
 assert.equal((await call('POST','/agents/'+bot.id+'/pause',{on:false})).code,200);live=await f.getJ('fm:agent:'+bot.id);assert.equal(live.paused,undefined);
 const claimed=await gw(live,'GET','/tasks/next');assert.equal(claimed.j.task.id,t.id);assert.equal(claimed.j.task.status,'running');
 console.log('PASS pause: blocks claims and actions, no reconnect needed, resume restores');
 // model costs: bot-reported only, validated, accumulated; never invented
 assert.equal((await gw(live,'POST','/events',{kind:'TOOL_USED',text:'Drafted',task_id:t.id,model_cost_usd:0.12})).code,200);
 assert.equal((await gw(live,'POST','/events',{kind:'TOOL_USED',text:'Bad',task_id:t.id,model_cost_usd:-5})).code,200);
 assert.equal((await gw(live,'POST','/events',{kind:'TOOL_USED',text:'Bad',task_id:t.id,model_cost_usd:'abc'})).code,200);
 const ask=await gw(live,'POST','/act',{action:'notes.write',params:{title:'Draft'},task_id:t.id});assert.equal(ask.j.status,'pending');
 assert.equal((await call('POST','/requests/'+ask.j.request_id+'/approve')).code,200);
 assert.equal((await gw(live,'POST','/tasks/'+t.id+'/complete',{result:'Done',model_cost_usd:0.3})).code,200);
 let done=await f.getJ('fm:task:'+t.id);assert.equal(done.modelCostUsd,0.42);assert.equal(done.modelCostSource,'bot');
 const u=await f.newTask({title:'No cost',assignee:other.id});const lo=await f.getJ('fm:agent:'+other.id);await gw(lo,'GET','/tasks/next');await gw(lo,'POST','/tasks/'+u.id+'/complete',{result:'ok'});assert.equal((await f.getJ('fm:task:'+u.id)).modelCostUsd,undefined);
 console.log('PASS model costs: reported only, validated, summed; absent when not reported');
 // job detail: timeline in plain language with the owner approval
 const d=await call('GET','/jobs/'+t.id);assert.equal(d.code,200);const texts=d.j.timeline.map(x=>x.text);
 assert.equal(texts[0],'Owner assigned the job');assert.ok(texts.includes('Bot took the job'));assert.ok(d.j.timeline.some(x=>x.kind==='approval'&&/^Owner approved: save a note/.test(x.text)));assert.equal(texts[texts.length-1],'Delivered');
 assert.equal(d.j.requests.length,1);assert.equal((await call('GET','/jobs/task_missing')).code,404);
 console.log('PASS job detail: timeline, linked approvals, 404 for unknown');
 // ---- public receipts: the PR #33 boundary (owner-written, exact review, allowlisted payload, copy-only template) ----
 const t3=await f.newTask({title:'Acme Corp hero copy',brief:'Use /home/owner/acme/brief.md and the API key sk-live-123',assignee:bot.id});await gw(live,'GET','/tasks/next');
 await gw(live,'POST','/events',{kind:'TOOL_USED',text:'Opened /home/owner/acme/brief.md for Acme',task_id:t3.id});
 await gw(live,'POST','/act',{action:'web.fetch',params:{url:'https://acme.example/brief'},task_id:t3.id});
 const hand=await gw(live,'POST','/act',{action:'work.handoff',params:{task_id:t3.id,to:'Other',title:'Acme secret subproject',brief:'private'},task_id:t3.id});assert.equal(hand.j.status,'completed');
 await gw(live,'POST','/tasks/'+t3.id+'/complete',{result:'RAW RESULT: Acme launch plan for jane@acme.com',model_cost_usd:0.84});
 const draft={taskId:t3.id,title:'A launch page in an afternoon',summary:'A bot drafted three hero lines for a product launch page. The owner approved one save step.',template:'Write three short hero lines for a product launch page.\nAsk for the audience and tone before writing anything.'};
 // blank fields are rejected: nothing is prefilled from the private job
 assert.equal((await call('POST','/public-receipts/review',{taskId:t3.id,title:'',summary:'',template:''})).code,400);
 const dr=await call('GET','/public-receipts/draft?taskId='+t3.id);assert.equal(dr.code,200);assert.equal(dr.j.title,'');assert.equal(dr.j.summary,'');assert.equal(dr.j.template,'');
 assert.equal(dr.j.suggestedBudgetCents,84);// gateway ledger 0¢ (no network in tests, so the fetch failed and cost nothing; handoff is 0¢) + 0.84 model costs = 84¢
 // exact pre-share review rejects secrets, contacts, URLs, file paths, tool details, internal IDs and private names
 const bad={secret:['sk-live-abcdef123','fmk_0123456789abcdef','xai-AbCdEf123456','Bearer abc.def','api key: hunter2','password=hunter2','AKIAABCDEFGHIJKLMNOP','eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0NTY3','a'.repeat(40)],
  contact:['mail jane@acme.com','call +1 (650) 555-0101','ping @janedoe'],link:['see https://x.test/a','www.example.org','acme.com launch'],
  'file path':['notes in /home/owner/acme/','C:\\Users\\owner\\brief','~/drafts/x','read brief.md first'],
  'tool detail':['used web.fetch twice','then notes.write','foreman_next_task loop','POST /gateway/act','the /api gateway','via MCP'],
  'internal id':['job task_0123abcd','bot agent_0123abcdef'],'private name':['Other wrote this','Acme Corp hero copy','Acme secret subproject plan']};
 for(const [kind,list] of Object.entries(bad))for(const v of list)for(const field of ['title','summary','template']){
  const r=await call('POST','/public-receipts/review',{...draft,[field]:v.slice(0,field==='title'?100:700)});
  assert.equal(r.code,400,kind+' not rejected in '+field+': '+v);assert.ok(r.j.problems.some(p=>p.field===field&&p.kind===kind),kind+' not named for '+field+': '+v+' -> '+JSON.stringify(r.j.problems));}
 assert.equal((await call('POST','/public-receipts/review',{...draft,budgetCents:-1})).code,400);
 // the reviewed snapshot is allowlisted: no bot names, child titles, step notes, raw results, params or IDs
 const rv=await call('POST','/public-receipts/review',{...draft,budgetCents:84});assert.equal(rv.code,200,JSON.stringify(rv.j));const snap=rv.j.snapshot,sj=JSON.stringify(snap);
 assert.deepEqual(Object.keys(snap),['version','title','summary','template','budgetCents','outcome','elapsedSeconds','reportedModelCostUsd','externalCost','ledgerCents','trackedActions','approvals','steps','provenance']);
 for(const leak of ['Bot','Other','Acme','acme','Secret','secret','RAW RESULT','jane@','/home/','brief.md','web.fetch','work.handoff','task_','agent_','req_','rcpt_','Opened','http'])assert.ok(!sj.includes(leak),'public snapshot leaks '+leak);
 for(const s of snap.steps){assert.deepEqual(Object.keys(s).filter(k=>!['at','code','n'].includes(k)),[]);assert.ok(['assigned','claimed','actions','approved','denied','blocked','handoff','part_done','delivered','stopped'].includes(s.code));}
 assert.ok(snap.steps.some(s=>s.code==='handoff'));assert.equal(snap.reportedModelCostUsd,0.84);assert.equal(snap.externalCost,null);assert.equal(snap.budgetCents,84);
 assert.equal(rv.j.hash,f.sha(sj));
 // publishing needs the exact reviewed snapshot and an explicit public audience
 assert.equal((await call('POST','/public-receipts/publish',{reviewId:rv.j.reviewId,hash:rv.j.hash,confirmed:true})).code,400);
 assert.equal((await call('POST','/public-receipts/publish',{reviewId:rv.j.reviewId,hash:'0'.repeat(64),confirmed:true,audience:'public'})).code,409);
 const both=await Promise.all([call('POST','/public-receipts/publish',{reviewId:rv.j.reviewId,hash:rv.j.hash,confirmed:true,audience:'public'}),call('POST','/public-receipts/publish',{reviewId:rv.j.reviewId,hash:rv.j.hash,confirmed:true,audience:'public'})]);
 assert.equal(both.filter(x=>x.code===201).length,1);const pub=both.find(x=>x.code===201).j;assert.match(pub.token,/^[a-f0-9]{48}$/);assert.equal(pub.path,'/receipt/'+pub.token);
 // the public payload: only the snapshot, its fingerprint and dates
 const out=await pubGet('/public-receipts/'+pub.token);assert.equal(out.hd['cache-control'],'no-store');assert.equal(out.code,200);assert.deepEqual(Object.keys(out.j).sort(),['expiresAt','hash','publishedAt','snapshot','token']);assert.equal(out.j.hash,f.sha(JSON.stringify(out.j.snapshot)));
 // the public page: noindex, no private text, and the footer says what the hash proves (no "Verified receipt")
 let page;await h({method:'GET',url:'/receipt/'+pub.token,headers:{host:'localhost'}},{headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;return this},status(n){this.code=n;return this},send(b){page={code:this.code,b,hd:this.headers};return this},json(b){page={code:this.code,b:JSON.stringify(b)}}});
 assert.equal(page.code,200);assert.ok(/noindex/.test(page.hd['x-robots-tag']));assert.equal(page.hd['referrer-policy'],'no-referrer');assert.ok(!/Verified receipt/.test(page.b));
 for(const leak of ['Other wrote','Acme','RAW RESULT','jane@',bot.name+' ','task_'])assert.ok(!page.b.includes(leak),'page leaks '+leak);
 const doc=fs.readFileSync(require('path').join(__dirname,'public/js/receipt-doc.js'),'utf8');assert.ok(!/Verified receipt/.test(doc));assert.ok(/does not prove the work itself, its timing or its cost/.test(doc));
 // a source change after review blocks publishing
 const rv2=await call('POST','/public-receipts/review',draft);const live3=await f.getJ('fm:task:'+t3.id);live3.result='changed';await f.setJ('fm:task:'+t3.id,live3);
 assert.equal((await call('POST','/public-receipts/publish',{reviewId:rv2.j.reviewId,hash:rv2.j.hash,confirmed:true,audience:'public'})).code,409);
 // "Run this job" never creates anything server-side: the old clone route is gone
 assert.equal((await call('POST','/receipts/clone',{token:pub.token})).code,404);assert.equal((await call('POST','/jobs/'+t3.id+'/shares',{headline:'x'})).code,404);
 // revoke and expiry
 await f.als.run({ws:'elsewhere'},async()=>assert.equal((await call('POST','/public-receipts/'+pub.token+'/revoke')).code,404));
 assert.equal((await call('GET','/public-receipts?taskId='+t3.id)).j.receipts.length,1);
 assert.equal((await call('POST','/public-receipts/'+pub.token+'/revoke')).code,200);assert.equal((await pubGet('/public-receipts/'+pub.token)).code,404);
 const rv3=await call('POST','/public-receipts/review',{...draft,taskId:t.id});const p3=await call('POST','/public-receipts/publish',{reviewId:rv3.j.reviewId,hash:rv3.j.hash,confirmed:true,audience:'public'});assert.equal(p3.code,201);
 const rec=await f.getJ('gl:publicReceipt:'+p3.j.token);rec.expiresAt=new Date(Date.now()-1000).toISOString();await f.setJ('gl:publicReceipt:'+p3.j.token,rec);assert.equal((await pubGet('/public-receipts/'+p3.j.token)).code,404);
 assert.equal((await call('POST','/public-receipts/review',{...draft,taskId:t2.id})).code,404);
 console.log('PASS public receipts: blank owner fields, exact review rejects secrets/contacts/links/paths/tool details/IDs/private names, allowlisted payload, explicit audience, source-change guard, fingerprint, copy-only (no clone), revoke, expiry');
});
await f.als.run({ws:'elsewhere'},async()=>{assert.equal((await call('GET','/jobs/x')).code,404);});
await f.als.run({ws:'elsewhere'},async()=>{assert.equal((await call('GET','/public-receipts')).j.receipts.length,0);});
console.log('PASS workspace isolation. ZERO network calls.');
})().catch(e=>{console.error(e);process.exit(1)});
