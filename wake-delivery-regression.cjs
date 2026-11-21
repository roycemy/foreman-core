// Wake delivery: every assigned job gets one wake attempt (work.assign, trial source and caption jobs); a second wake inside the 30s throttle
// is deferred and coalesced, then sent once after the window if a job is still waiting (never silently dropped, never duplicated); any
// provider can use the env fallback WAKE_<PROVIDER>_EMAIL (Muse included); the owner can set a Bearer-mode webhook (Grok Bot routines),
// stored encrypted and never shown or logged; legacy plaintext signing secrets keep working and the owner migration encrypts them.
// Offline, in-memory store (which ignores TTLs, so the throttle's expiry is simulated by deleting its key), outbound calls stubbed.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const API=path.join(__dirname,'api/index.js'),src=fs.readFileSync(API,'utf8')+'\nmodule.exports.t={r,setJ,getJ,sha,als,createAgent,enc,dec};';
const out=[],logs=[];const env={RESEND_API_KEY:'re_synthetic',WAKE_EMAIL_FROM:'Alter <wake@mail.example>',WAKE_CUSTOM_EMAIL:'custom-bot@example.com',WAKE_MUSE_EMAIL:'muse-inbox@example.com'};
const ctx={require:require('module').createRequire(API),module:{exports:{}},process:{env},global:{},console:{log:(...a)=>logs.push(a.join(' ')),warn:(...a)=>logs.push(a.join(' ')),error:(...a)=>logs.push(a.join(' '))},
 fetch:async(u,o)=>{out.push({u:String(u),o});return {ok:true,status:202,json:async()=>({id:'x'})};},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const h=ctx.module.exports,f=h.t,mem=ctx.global.__mem;const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
async function http(method,url,{key,cookie,body}={}){let o;const headers={host:'localhost',origin:'http://localhost'};if(key)headers.authorization='Bearer '+key;if(cookie)headers.cookie='fm_sess='+cookie;const res={setHeader(){},status(c){this.code=c;return this},json(j){o={code:this.code||200,j}},send(b){o={code:this.code||200,j:b}},end(){o={code:this.code||204}}};await h({method,url,headers,body:body||{}},res);return o;}
const ws='ws_wake';const inW=fn=>f.als.run({ws},fn);const owner=(m,u,b)=>http(m,u,{cookie:'ck',body:b});
const emails=to=>out.filter(x=>x.u==='https://api.resend.com/emails'&&JSON.parse(x.o.body).to[0]===to);
const expireThrottle=id=>mem.kv.delete('gl:wake:'+id); // what Redis does after 30 s
(async()=>{
 await f.setJ('gl:user:'+sha('o@w.example'),{id:'u',email:'o@w.example',ws});await f.setJ('gl:sess:'+sha('ck'),{uid:'u',email:'o@w.example',ws});
 const bot=async(n,prov)=>{const b=await inW(()=>f.createAgent(n,'x',prov||'custom',false,{preset:'balanced'}));return {id:b.agent.id,key:b.key};};
 const A=await bot('Assigner'),B=await bot('Assignee'),M=await bot('Muse','muse');
 // ---- T1: work.assign wakes the assignee (it used to send nothing)
 await inW(async()=>{const a=await f.getJ('fm:agent:'+A.id);a.permissions={...a.permissions,'work.assign':'AUTO'};await f.setJ('fm:agent:'+A.id,a);});
 const wa=await http('POST','/api/gateway/act',{key:A.key,body:{action:'work.assign',params:{assignee:B.id,title:'Hand this over',source_id:'s1'}}});assert.equal(wa.code,200,JSON.stringify(wa.j));
 assert.equal(emails('custom-bot@example.com').length,1,'work.assign woke the assignee');assert.ok(!/Hand this over/.test(emails('custom-bot@example.com')[0].o.body),'the wake carries no job content');
 // ---- T2: a second assignment inside 30 s is deferred, then sent once after the window, only if the job still waits
 const t2=await owner('POST','/api/tasks',{title:'Second job',assignee:B.id});assert.equal(t2.code,200,JSON.stringify(t2.j));const j2=(t2.j.task||t2.j).id;
 assert.equal(emails('custom-bot@example.com').length,1,'throttled: no second email inside the window');
 const ev=(await inW(()=>f.r(['LRANGE','fm:events',0,50]))).map(x=>JSON.parse(x)).filter(e=>e.type==='wake_deferred'&&e.agentId===B.id);assert.equal(ev.length,1,'the deferral is an owner-visible event, not silent');
 const t3=await owner('POST','/api/tasks',{title:'Third job',assignee:B.id});assert.equal((await inW(()=>f.r(['LRANGE','fm:events',0,50]))).map(x=>JSON.parse(x)).filter(e=>e.type==='wake_deferred'&&e.agentId===B.id).length,1,'coalesced: one deferral per bot');
 await owner('GET','/api/state');assert.equal(emails('custom-bot@example.com').length,1,'not before the window passes');
 expireThrottle(B.id);mem.kv.set('gl:wakeDue:'+B.id,JSON.stringify({...JSON.parse(mem.kv.get('gl:wakeDue:'+B.id)),dueAt:Date.now()-1}));
 await Promise.all([owner('GET','/api/state'),owner('GET','/api/state'),http('GET','/api/gateway/tasks/next',{key:A.key})]);
 assert.equal(emails('custom-bot@example.com').length,2,'exactly one follow-up wake after the window, despite three concurrent flush points');
 await owner('GET','/api/state');assert.equal(emails('custom-bot@example.com').length,2,'no duplicate on later traffic');
 // a deferred wake whose jobs were claimed meanwhile is dropped, not sent
 const t4=await owner('POST','/api/tasks',{title:'Fourth',assignee:B.id});await http('GET','/api/gateway/tasks/next',{key:B.key});await http('POST','/api/gateway/tasks/'+(await http('GET','/api/gateway/tasks/next',{key:B.key})).j.task.id+'/complete',{key:B.key,body:{result:'ok'}});
 for(let i=0;i<4;i++){const c=await http('GET','/api/gateway/tasks/next',{key:B.key});if(c.j.task)await http('POST','/api/gateway/tasks/'+c.j.task.id+'/complete',{key:B.key,body:{result:'ok'}});}
 const n0=emails('custom-bot@example.com').length;expireThrottle(B.id);const due=mem.kv.get('gl:wakeDue:'+B.id);if(due)mem.kv.set('gl:wakeDue:'+B.id,JSON.stringify({...JSON.parse(due),dueAt:Date.now()-1}));
 await owner('GET','/api/state');assert.equal(emails('custom-bot@example.com').length,n0,'no follow-up when nothing is waiting any more');
 // ---- T6: any provider can use WAKE_<PROVIDER>_EMAIL; Muse included; a malformed value is ignored; a declared target wins
 await owner('POST','/api/tasks',{title:'Muse job',assignee:M.id});assert.equal(emails('muse-inbox@example.com').length,1,'Muse woken through WAKE_MUSE_EMAIL');
 env.WAKE_MUSE_EMAIL='not an address';expireThrottle(M.id);const n1=out.length;await owner('POST','/api/tasks',{title:'Muse job 2',assignee:M.id});assert.equal(out.filter(x=>x.u==='https://api.resend.com/emails').length,out.slice(0,n1).filter(x=>x.u==='https://api.resend.com/emails').length,'malformed env inbox: no send');
 // ---- T5: owner sets a Bearer-mode webhook (Grok Bot routine); stored encrypted; never shown or logged
 const TOK='synthetic-bearer-'+crypto.randomBytes(12).toString('hex'),G=await bot('Grok Bot','grok');
 assert.equal((await owner('POST','/api/agents/'+G.id+'/wake',{mode:'bearer',url:'https://evil.example/hook',token:TOK})).code,400,'other hosts refused');
 assert.equal((await owner('POST','/api/agents/'+G.id+'/wake',{mode:'bearer',url:'https://api.x.ai/routines/abc/trigger',token:'short'})).code,400,'short token refused');
 const set=await owner('POST','/api/agents/'+G.id+'/wake',{mode:'bearer',url:'https://api.x.ai/routines/abc/trigger',token:TOK});assert.equal(set.code,200,JSON.stringify(set.j));
 let hook=out.filter(x=>x.u==='https://api.x.ai/routines/abc/trigger');assert.equal(hook.length,1,'test ping sent');assert.equal(hook[0].o.headers.authorization,'Bearer '+TOK,'Bearer header');assert.ok(!/task|brief/i.test(hook[0].o.body),'content-free');
 const rec=await inW(()=>f.getJ('fm:agent:'+G.id));assert.equal(rec.wake.mode,'bearer');assert.ok(rec.wake.tokenEnc&&!rec.wake.token&&!JSON.stringify(rec).includes(TOK),'stored encrypted only');
 const st=await owner('GET','/api/state');const ga=st.j.agents.find(a=>a.id===G.id);assert.equal(ga.wake.mode,'bearer');assert.equal(ga.wake.hasSecret,true);assert.ok(!JSON.stringify(st.j).includes(TOK)&&!JSON.stringify(st.j).includes(rec.wake.tokenEnc),'state never carries the token or its ciphertext');
 expireThrottle(G.id);await owner('POST','/api/tasks',{title:'Grok job',assignee:G.id});hook=out.filter(x=>x.u==='https://api.x.ai/routines/abc/trigger');assert.equal(hook.length,2,'a job wakes the routine');assert.equal(hook[1].o.headers.authorization,'Bearer '+TOK);
 // ---- T4: a legacy plaintext whsec secret keeps signing; the owner migration encrypts it with an exact round-trip and changes nothing for the receiver
 const H=await bot('Grok Automations','grok'),SEC='whsec_'+crypto.randomBytes(24).toString('base64');
 await inW(async()=>{const a=await f.getJ('fm:agent:'+H.id);a.wake={channel:'webhook',target:'https://grok.com/automations/hook1',secret:SEC,declaredAt:new Date().toISOString(),by:'owner'};await f.setJ('fm:agent:'+H.id,a);});
 const sign=async()=>{expireThrottle(H.id);const n=out.length;await owner('POST','/api/tasks',{title:'HMAC job '+n,assignee:H.id});const x=out.slice(n).find(y=>y.u==='https://grok.com/automations/hook1');const hd=x.o.headers;return crypto.createHmac('sha256',Buffer.from(SEC.replace(/^whsec_/,''),'base64')).update(hd['webhook-id']+'.'+hd['webhook-timestamp']+'.'+x.o.body).digest('base64')===hd['webhook-signature'].slice(3);};
 assert.ok(await sign(),'legacy plaintext secret signs correctly');
 assert.equal((await owner('POST','/api/wake/encrypt-secrets',{})).code,400,'needs confirmation');
 const m1=await owner('POST','/api/wake/encrypt-secrets',{confirmed:true});assert.equal(m1.code,200);assert.ok(m1.j.migrated>=1);assert.ok(!JSON.stringify(m1.j).includes(SEC));
 const after=await inW(()=>f.getJ('fm:agent:'+H.id));assert.ok(after.wake.secretEnc&&!after.wake.secret,'plaintext removed after an exact round-trip');assert.ok(await sign(),'the receiver sees the same valid signature after migration');
 const m2=await owner('POST','/api/wake/encrypt-secrets',{confirmed:true});assert.equal(m2.j.migrated,0,'idempotent');
 // an unreadable secret (for example a changed ENC_SECRET) fails loudly as an owner-visible event, not silently
 await inW(async()=>{const a=await f.getJ('fm:agent:'+H.id);a.wake.secretEnc='bad.cipher.text';await f.setJ('fm:agent:'+H.id,a);});expireThrottle(H.id);await owner('POST','/api/tasks',{title:'Broken secret',assignee:H.id});
 assert.ok((await inW(()=>f.r(['LRANGE','fm:events',0,20]))).map(x=>JSON.parse(x)).some(e=>e.type==='wake_failed'&&e.agentId===H.id&&/unreadable/.test(e.text)),'unreadable secret: wake_failed event naming the fix');
 // ---- T1: trial jobs are woken too (source on creation, caption bot on approval), and the wake carries no transcript or package text
 {const P=await bot('Picker','instinct'),C=await bot('Captioner','muse');env.WAKE_INSTINCT_EMAIL='instinct-inbox@example.com';env.WAKE_MUSE_EMAIL='muse-inbox@example.com';expireThrottle(C.id);
  const TR='[0:05] Intro SECRETLINE.\n[1:10] The hinge sags because the post leans.';
  const c=await owner('POST','/api/pilots',{sourceAgentId:P.id,targetAgentId:C.id,transcript:TR,sourceInstructions:'Pick.',targetTitle:'Captions',targetInstructions:'One each.',confirmed:true});assert.equal(c.code,201,JSON.stringify(c.j));
  const pw=emails('instinct-inbox@example.com');assert.equal(pw.length,1,'trial source job wakes its bot');assert.ok(!/SECRETLINE|hinge/.test(pw[0].o.body),'no transcript text in the wake');
  await http('GET','/api/gateway/tasks/next',{key:P.key});const pr=await http('POST','/api/gateway/act',{key:P.key,body:{action:'pilot.handoff',task_id:c.j.pilot.source.taskId,params:{moments:[{start:'1:10',end:'1:20',reason:'Cause',excerpt:'The hinge sags because the post leans.'}]}}});
  const v=(await owner('GET','/api/pilots/'+c.j.pilot.id)).j.pilot;const before=emails('muse-inbox@example.com').length;
  assert.equal((await owner('POST','/api/requests/'+pr.j.request_id+'/approve',{detailsHash:v.package.fingerprint})).j.request.status,'executed');
  const cw=emails('muse-inbox@example.com');assert.equal(cw.length,before+1,'the approved caption job wakes its bot');assert.ok(!/hinge|SECRETLINE/.test(cw[cw.length-1].o.body),'no package text in the wake');}
 for(const s of [TOK,SEC])assert.ok(!logs.join('\n').includes(s),'no token or secret in logs');
 console.log('PASS wake delivery: work.assign wakes the assignee (content-free); a second wake inside 30 s is deferred (owner-visible), coalesced per bot, sent exactly once after the window across concurrent flush points, and dropped if nothing waits; WAKE_<PROVIDER>_EMAIL works for any provider incl. Muse, malformed values ignored; Bearer-mode webhook validated, sent with Authorization: Bearer, stored encrypted, absent from state and logs; trial source and caption jobs woken without any transcript or package text; legacy plaintext whsec secret still signs, the confirmed owner migration encrypts it with identical signatures and is idempotent; an unreadable secret fails as an owner-visible event');
})().catch(e=>{console.error(e);process.exit(1)});
