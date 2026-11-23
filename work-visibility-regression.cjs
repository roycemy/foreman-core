// Work visibility, server and wiring (the browser run is scripts/work-visibility-harness.cjs, outside CI):
//  - POST /api/tasks with a clientRef is retry-safe: the same ref returns the same task (no second job, no second wake), sequentially and
//    under concurrency, for single tasks and for plans; refs are workspace-scoped and malformed refs are ignored;
//  - parts that never ran are marked notRun, so the UI can say "Not run" and not "Failed";
//  - the model fed by REAL server state: queued after create, in progress after a claim, a plan only finished when every part is, partial on failure;
//  - the UI is wired through the pending-aware send, receipts nest parts and keep expansion state outside the DOM;
//  - no simulation switch exists in shipped code (public/, api/), and the harness is not reachable from them.
// Real handler, in-memory store, email provider stubbed (no real email); fixed synthetic data only.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const M=require('./public/js/work-model.js');
const API=path.join(__dirname,'api/index.js'),src=fs.readFileSync(API,'utf8')+'\nmodule.exports.t={setJ,getJ,sha,als,createAgent,r};';
const sends=[];const ctx={require:require('module').createRequire(API),module:{exports:{}},process:{env:{RESEND_API_KEY:'re_synthetic',WAKE_EMAIL_FROM:'Alter <wake@mail.example>',WAKE_CUSTOM_EMAIL:'bot@example.com'}},global:{},console:{log(){},warn(){},error(){}},
 fetch:async(u,o)=>{sends.push(String(u));return {ok:true,status:200,json:async()=>({})};},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const h=ctx.module.exports,f=h.t,sha=f.sha;
async function http(method,url,{key,cookie,body}={}){let o;const headers={host:'localhost',origin:'http://localhost'};if(key)headers.authorization='Bearer '+key;if(cookie)headers.cookie='fm_sess='+cookie;const res={setHeader(){},status(c){this.c=c;return this},json(j){o={code:this.c||200,j}},send(b){o={code:this.c||200,j:b}},end(){o={code:204}}};await h({method,url,headers,body:body||{}},res);return o;}
(async()=>{
 const mkWs=async(ws,ck)=>{await f.setJ('gl:user:'+sha(ws+'@x'),{id:'u_'+ws,email:ws+'@x',ws});await f.setJ('gl:sess:'+sha(ck),{uid:'u_'+ws,email:ws+'@x',ws});return {ws,ck};};
 const A=await mkWs('ws_vis','ckA'),B=await mkWs('ws_other','ckB');const inW=(w,fn)=>f.als.run({ws:w.ws},fn);
 const bot=async(w,n)=>{const b=await inW(w,()=>f.createAgent(n,'x','custom',false,{preset:'balanced'}));return {id:b.agent.id,key:b.key};};
 const G=await bot(A,'Grok Bot'),Mu=await bot(A,'Muse');const own=(w,m,u,b)=>http(m,u,{cookie:w.ck,body:b});
 const list=async w=>inW(w,()=>f.r(['LRANGE','fm:tasklist',0,99]));
 // ---- retry-safe creation
 const ref='ref-0123456789abcdef';const t1=await own(A,'POST','/api/tasks',{title:'Review it',assignee:G.id,clientRef:ref});assert.equal(t1.code,200);assert.ok(!t1.j.duplicate);assert.equal(sends.length,1,'first creation wakes the bot once');
 const t2=await own(A,'POST','/api/tasks',{title:'Review it',assignee:G.id,clientRef:ref});assert.equal(t2.j.task.id,t1.j.task.id,'same ref, same task');assert.equal(t2.j.duplicate,true);assert.equal((await list(A)).length,1,'no second job');assert.equal(sends.length,1,'no second wake');
 const racers=await Promise.all(Array.from({length:6},()=>own(A,'POST','/api/tasks',{title:'Race',assignee:Mu.id,clientRef:'race-ref-0123456789'})));assert.equal(new Set(racers.map(x=>x.j.task.id)).size,1,'six concurrent posts, one task');assert.equal((await list(A)).length,2,'exactly one more job');
 const other=await own(B,'POST','/api/tasks',{title:'Review it',clientRef:ref});assert.notEqual(other.j.task.id,t1.j.task.id,'refs are scoped to the workspace');assert.ok(!other.j.duplicate);
 for(const bad of ['short','has space in it!!','x'.repeat(65),123,null]){const a=await own(A,'POST','/api/tasks',{title:'Unkeyed',clientRef:bad}),b=await own(A,'POST','/api/tasks',{title:'Unkeyed',clientRef:bad});assert.notEqual(a.j.task.id,b.j.task.id,'a malformed ref ('+String(bad).slice(0,8)+') is ignored, not trusted as a key');}
 const noRef1=await own(A,'POST','/api/tasks',{title:'Same title'}),noRef2=await own(A,'POST','/api/tasks',{title:'Same title'});assert.notEqual(noRef1.j.task.id,noRef2.j.task.id,'without a ref behaviour is unchanged');
 // ---- plans are retry-safe too
 const parts=[{title:'One',assignee:G.id},{title:'Two',assignee:Mu.id},{title:'Three',assignee:G.id}];const before=(await list(A)).length;
 const plans=await Promise.all(Array.from({length:4},()=>own(A,'POST','/api/tasks',{title:'A plan',orchestrate:true,clientRef:'plan-ref-0123456789',parts})));
 assert.equal(new Set(plans.map(x=>x.j.task.id)).size,1,'four concurrent plan posts, one plan');const after=(await list(A)).length;assert.equal(after-before,4,'one plan and its three parts, once: '+(after-before));
 const planId=plans[0].j.task.id;assert.equal((await own(A,'POST','/api/tasks',{title:'A plan',orchestrate:true,clientRef:'plan-ref-0123456789',parts})).j.duplicate,true);
 // ---- the model on real state: queued, claimed, plan only done when every part is, failure marks the rest "not run"
 const state=async()=>(await own(A,'GET','/api/state')).j;const now=()=>Date.now();
 let S=await state();let act=M.activeItems(S,now());assert.ok(act.some(i=>i.id===t1.j.task.id&&i.status==='queued'),'queued after create');assert.ok(!act.some(i=>i.status==='running'),'nothing is running before a claim');
 const planRow=act.find(i=>i.id===planId);assert.ok(planRow&&planRow.part.n===1&&planRow.part.of===3,'the plan is one row at part 1 of 3');assert.equal(act.filter(i=>/^(One|Two|Three)$/.test(i.title)).length,0,'its parts are not separate rows');
 const claim=await http('GET','/api/gateway/tasks/next',{key:G.key});assert.ok(claim.j.task,'claim');S=await state();assert.equal(M.activeItems(S,now()).find(i=>i.id===claim.j.task.id).status,'running','in progress only after a claim');
 // drain Grok's queue, then run the plan: part one fails -> parts two and three are "not run"
 const done=async(b,res,st)=>{for(let i=0;i<60;i++){const c=await http("GET","/api/gateway/tasks/next",{key:b.key});if(!c.j.task)return null;const id=c.j.task.id,isPart=/^(One|Two|Three)$/.test(c.j.task.title);if(!isPart){await http('POST','/api/gateway/tasks/'+id+'/complete',{key:b.key,body:{result:'ok'}});continue;}await http('POST','/api/gateway/tasks/'+id+'/complete',{key:b.key,body:st==='failed'?{status:'failed',result:res}:{result:res}});return id;}};
 await done(G,'could not do part one','failed');S=await state();const kids=S.tasks.filter(t=>t.parentId===planId).sort((a,b)=>a.partIndex-b.partIndex);
 assert.equal(kids[0].status,'failed');assert.ok(!kids[0].notRun,'a part that ran and failed is not "not run"');assert.deepEqual(kids.slice(1).map(k=>[k.status,k.notRun===true,/^Not run:/.test(k.result)]),[['failed',true,true],['failed',true,true]],'parts that never ran are marked');
 const fin=M.finishedItems(S,now()).find(x=>x.id===planId);assert.equal(fin.status,'failed');assert.deepEqual(fin.parts.map(p=>p.phase),['failed','notrun','notrun']);
 // a second plan: first part succeeds, second fails -> partial; the plan is not finished until the last part is terminal
 const p2=await own(A,'POST','/api/tasks',{title:'Second plan',orchestrate:true,parts:[{title:'One',assignee:G.id},{title:'Two',assignee:Mu.id}]});await done(G,'one ok');S=await state();assert.ok(!M.finishedItems(S,now()).some(x=>x.id===p2.j.task.id),'not finished while a part remains');assert.ok(M.activeItems(S,now()).some(i=>i.id===p2.j.task.id));
 await done(Mu,'two broke','failed');S=await state();const f2=M.finishedItems(S,now()).find(x=>x.id===p2.j.task.id);assert.equal(f2.status,'partial');assert.equal(f2.partsDone,1);assert.equal(f2.text,'','no combined text invented');assert.ok(!JSON.stringify(f2).includes('Part 1: One ['),'the server\'s stitched summary is not presented');
 // ---- wiring (static): all creation sites go through the pending-aware send; receipts keep expansion out of the DOM
 const rd=p=>fs.readFileSync(path.join(__dirname,p),'utf8');const app=rd('public/js/app.js'),rcp=rd('public/js/receipts.js'),core=rd('public/js/core.js'),doc=rd('public/js/receipt-doc.js'),html=rd('public/app.html'),css=rd('public/styles/components/work.css');
 assert.equal((app.match(/BB\.work \? BB\.work\.send\(|BB\.work\?BB\.work\.send\(/g)||[]).length,3,'type box, plan review and New job all use the pending-aware send');assert.ok(!/await BB\.api\('\/api\/tasks', 'POST'/.test(app),'no direct task creation left');
 assert.ok(html.includes('/js/work-model.js')&&html.includes('/js/work.js')&&html.includes('id="wbtn"')&&html.includes('floor-work'),'control, scripts and the phone Floor slot are in the page');
 assert.ok(/isOpen:\s*k\s*=>\s*exp\.id === id && exp\.keys\.has\(k\)/.test(rcp)&&/data-rexp/.test(rcp)&&/receiptBind\(V, o\)/.test(rcp),'expansion lives in a keyed state object and is re-rendered from it');
 assert.ok(/o\.isOpen && o\.isOpen\('full'\)/.test(doc)&&/o\.onToggle\('full'/.test(doc),'Show all is drawn from state and reports toggles');
 assert.ok(/if \(html === lastDetail\) return;/.test(rcp)&&/if \(html !== lastList\)/.test(rcp),'receipts repaint only when what is visible changed');
 assert.ok(/!runs\.get\(t\.id\)\.active/.test(core)&&/runs\.has\(t\.id\)/.test(core),'the receipt feed lists a run once and never an unfinished one');
 assert.ok(/white-space:normal/.test(css)&&/-webkit-line-clamp:3/.test(css),'receipt titles wrap instead of being cut to one line');
 assert.ok(/prefers-reduced-motion:reduce/.test(css),'motion is off under reduced motion');
 // ---- no simulation switch in shipped code, and the harness is not reachable from it
 const walk=d=>fs.readdirSync(path.join(__dirname,d),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
 const shipped=[...walk('public'),...walk('api')].filter(p=>/\.(js|mjs|html|css|json)$/.test(p));const bad=/__SIM\b|WORK_SIM|SIMULATE_WORK|[?&]sim=|alter\.sim\b|work-visibility-harness|allowSimulation/;
 for(const p of shipped)assert.ok(!bad.test(rd(p)),'no simulation switch in '+p);
 assert.ok(!Object.keys(M).some(k=>/sim/i.test(k)),'the model exposes no simulation entry point');assert.ok(!/fixture|simulat/i.test(rd('public/js/work.js').replace(/\/\*[\s\S]*?\*\//g,'')),'work.js carries no fixture data');
 for(const p of ['vercel.json','package.json'])assert.ok(!/work-visibility-harness/.test(rd(p)),p+' does not reference the harness');
 assert.ok(fs.existsSync(path.join(__dirname,'scripts/work-visibility-harness.cjs'))&&/scripts\/work-visibility-harness\.cjs/.test(rd('docs/work-visibility/README.md')),'the harness lives outside the app and is documented');
 assert.ok(!sends.some(u=>!/api\.resend\.com\/emails$/.test(u)),'the only outbound calls are the stubbed wake email for the first creation');
 console.log('PASS work visibility: clientRef makes task and plan creation retry-safe (sequential and concurrent, no second job or wake, workspace-scoped, malformed refs ignored); parts that never ran are marked; the model on real server state shows queued, in progress only after a claim, a plan as one row, finished only when every part is, partial and failed correctly with no invented combined result; UI creation sites use the pending-aware send; receipts nest parts, wrap titles and keep expansion in state; no simulation switch in shipped code');
})().catch(e=>{console.error(e);process.exit(1)});
