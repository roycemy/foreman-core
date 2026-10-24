// Delegated business runs (Grokbot-first bridge): a connected bot does the work through the
// existing job claim/report path. Covers: engine fallback with no bot, hash-bound payload
// review, exact task payload, claim/complete/fail/stop/stall settles, idempotency, source
// edit invalidating the review, source delete cancelling pending jobs, purge removing
// delegated jobs and refusing late settles, research never delegating, and multi-bot rules.
// Engine endpoint and bot side are exercised through the real internal call path the
// gateway/MCP adapters use (claimTask/completeTask/stopTask); no real network, no real bot.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={bizSourceAdd,bizSourceEdit,bizSourceDel,bizDiscover,bizProposalAct,bizRespAct,bizDataPurge,bizConsentAct,bizState,bizDelegateBot,bizDelegatePayload,bizDelegateRun,bizSettleDelegatedRun,bizDailyTick,createAgent,claimTask,completeTask,stopTask,expireStalledTasks,reassignAsleepQueuedTasks,reassignTask,gatewayAct,newTask,bizSources,listTasks,setJ,getJ,r,als};';
const c={require:(m)=>require(m),module:{exports:{}},process:{env:{}},global:{},console,URL,Buffer,AbortSignal,setTimeout,clearTimeout,
 fetch:(u,o)=>{const body=JSON.parse(o.body);const sys=body.messages[0].content;
  const reply=content=>Promise.resolve({ok:true,json:async()=>({choices:[{message:{content}}],usage:{prompt_tokens:1,completion_tokens:1}})});
  if(/propose areas of responsibility/i.test(sys))return reply(JSON.stringify({proposals:[{title:'Customer reply desk',summary:'Draft replies to customer emails.',evidence:[{sourceId:c.process.env.__sid,excerpt:'we answer every customer email within a day'}],unknowns:[],systems:[],boundary:'Drafts only; owner approves every reply.'}]}));
  if(/fetch_requests/.test(sys))return reply(JSON.stringify({draft:'research draft',blocked_step:null,sources_used:[],citations:[],next_steps:[]}));
  return reply(JSON.stringify({draft:'engine draft',blocked_step:null,sources_used:[]}));}};
vm.runInNewContext(src,c);const f=c.module.exports.t;
const ISO=ms=>new Date(ms).toISOString();

(async()=>{
 c.process.env.ALTER_MODEL_KEY='k';c.process.env.ALTER_MODEL_WS='wsdel,wslegacy,wsres,wsorph,wsrace';

 await f.als.run({ws:'wsdel'},async()=>{
  await f.bizConsentAct(true,{host:'api.groq.com',model:'openai/gpt-oss-120b'});

  // --- no bot connected: preview refuses honestly, runs fall back to the engine unchanged
  const s1=await f.bizSourceAdd({kind:'note',title:'How we work',text:'We answer every customer email within a day. Refunds over $50 need Royce.'});
  const sid=s1.body.source.id;c.process.env.__sid=sid;
  const s2=await f.bizSourceAdd({kind:'note',title:'Unrelated ops',text:'ZQX-UNRELATED-MARKER warehouse shelving notes that must never leak into a reply-desk job.'});
  const prev0=await f.bizRespAct('resp_none','delegate-preview',{input:'x'});
  assert.equal(prev0.status,404,'preview on a missing responsibility is 404');
  const p=(await f.bizDiscover()).body.proposals[0];
  const respId=(await f.bizProposalAct(p.id,'activate',{})).body.responsibility.id;
  let resp=(await f.getJ('fm:biz:resp:'+respId));
  assert.deepEqual(resp.sourceIds,[sid],'activation records the proposal-linked sources');
  const pvNoBot=await f.bizRespAct(respId,'delegate-preview',{input:'Draft a reply to a customer asking for a refund.'});
  assert.equal(pvNoBot.status,409);assert.equal(pvNoBot.body.code,'no_delegate_bot','no bot: honest refusal, no silent engine swap in the preview');
  const engRun=await f.bizRespAct(respId,'run',{input:'Draft a reply to a customer asking about hours.'});
  assert.equal(engRun.status,200);assert.equal(engRun.body.run.status,'done');
  assert.equal(engRun.body.run.output,'engine draft');assert.equal(engRun.body.run.backend,undefined,'no bot: engine backend, unchanged behavior');

  // --- one Grok bot connects: delegation becomes the run path (Grokbot-first)
  const g=await f.createAgent('Grokbot','Business work','grok',false,{preset:'balanced'});
  const agent=g.agent;

  // preview: exact payload, linked sources only, destination identity + hash
  const input='Draft a reply to a customer asking for a $60 refund.';
  const pv=await f.bizRespAct(respId,'delegate-preview',{input});
  assert.equal(pv.status,200);const d=pv.body.delegation;
  assert.equal(d.bot.id,agent.id);assert.equal(d.bot.name,'Grokbot');assert.equal(d.bot.providerId,'grok');
  assert(d.hash&&d.hash.length>20,'payload carries a binding hash');
  assert.deepEqual(d.sources.map(s=>s.id),[sid],'only the responsibility-linked source is included');
  assert(d.context.includes(input),'work item is in the exact payload');
  assert(d.context.includes('We answer every customer email within a day'),'linked source text is in the payload');
  assert(!JSON.stringify(d).includes('ZQX-UNRELATED-MARKER'),'an unlinked source never enters the payload');
  assert(d.brief.includes('Drafts only'),'the owner boundary rides the instructions');

  // run without/with a wrong hash: refused with a fresh preview; source edit invalidates the review
  let r1=await f.bizRespAct(respId,'run',{input});
  assert.equal(r1.status,409);assert.equal(r1.body.code,'delegation_review_required','engine-consented workspace still requires payload review once a bot is connected');
  assert.equal(r1.body.delegation.hash,d.hash,'the refusal carries the current preview');
  r1=await f.bizRespAct(respId,'run',{input,delegateHash:'bogus'});
  assert.equal(r1.status,409,'wrong hash refused');
  await f.bizSourceEdit(sid,{text:'We answer every customer email within a day. Refunds over $50 need Royce. Weekend emails answer on Monday.'});
  const rStale=await f.bizRespAct(respId,'run',{input,delegateHash:d.hash});
  assert.equal(rStale.status,409,'a source edit after review invalidates the reviewed hash');
  const pv2=await f.bizRespAct(respId,'delegate-preview',{input});
  assert.notEqual(pv2.body.delegation.hash,d.hash,'edited source (version bump) changes the hash');

  // --- delegated run: exact task payload, honest queued state
  const run1=(await f.bizRespAct(respId,'run',{input,delegateHash:pv2.body.delegation.hash})).body.run;
  assert.equal(run1.status,'delegated');assert.equal(run1.backend,'linked-bot');
  assert.equal(run1.bot.name,'Grokbot');assert(run1.taskId,'run carries its job id');
  const t1=await f.getJ('fm:task:'+run1.taskId);
  assert.equal(t1.status,'queued','job is claimable only after the run record exists');
  assert.equal(t1.assignee,agent.id);assert.equal(t1.createdBy,'owner');
  assert.equal(t1.context,pv2.body.delegation.context,'job context is byte-identical to the reviewed payload');
  assert.equal(t1.brief,pv2.body.delegation.brief,'job brief is byte-identical to the reviewed payload');
  assert.equal(t1.biz.runId,run1.id);assert.equal(t1.biz.respId,respId);
  let st=await f.bizState();
  assert.equal(st.delegate.id,agent.id,'state names the delegation destination');
  const stRun=st.responsibilities.find(rp=>rp.id===respId).runs.find(x=>x.id===run1.id);
  assert.equal(stRun.job.status,'queued','state exposes the live job state');

  // claim marks the run running; a second claimant gets nothing
  const claimed=await f.claimTask(agent);
  assert.equal(claimed.id,t1.id,'the bot claims its delegated job');
  const runAfterClaim=await f.getJ('fm:biz:run:'+run1.id);
  assert.equal(runAfterClaim.status,'running');assert(runAfterClaim.claimedAt,'claim marker landed');
  const reclaim=await f.claimTask(agent);assert.equal(reclaim.id,t1.id,'re-poll returns the same active job, nothing new');

  // complete settles: bot report becomes a bot-reported draft; settle is idempotent
  const done=await f.completeTask(agent,t1.id,{status:'done',result:'Draft: we can offer a $60 refund; Royce approved over-$50 refunds.'});
  assert.equal(done.status,200);
  const runDone=await f.getJ('fm:biz:run:'+run1.id);
  assert.equal(runDone.status,'done');
  assert.equal(runDone.output,'Draft: we can offer a $60 refund; Royce approved over-$50 refunds.','the bot report is the draft, verbatim');
  assert(runDone.settledAt,'settle time recorded');
  assert.equal(runDone.bot.name,'Grokbot','provenance: who did the work');
  const again=await f.completeTask(agent,t1.id,{status:'done',result:'late duplicate'});
  assert.equal(again.status,409,'a second completion is refused');
  assert.equal((await f.getJ('fm:biz:run:'+run1.id)).output.includes('$60 refund'),true,'the settled run is untouched by the duplicate');
  st=await f.bizState();
  const stDone=st.responsibilities.find(rp=>rp.id===respId).runs.find(x=>x.id===run1.id);
  assert.equal(stDone.job,undefined,'no live job block after settle');
  const kinds=(await f.bizState()).log.map(l=>l.kind);
  assert(kinds.includes('run_delegated')&&kinds.includes('run_settled'),'activity log records delegation + settle');
  const respAfter=await f.getJ('fm:biz:resp:'+respId);
  assert(respAfter.runsCount>=2,'responsibility counters include delegated runs');

  // --- destination gone after review: the run refuses, never silently falls to the engine
  const pvG=await f.bizRespAct(respId,'delegate-preview',{input:'Reply while bot away.'});
  const ag=await f.getJ('fm:agent:'+agent.id);ag.status='revoked';await f.setJ('fm:agent:'+agent.id,ag);
  const gone=await f.bizRespAct(respId,'run',{input:'Reply while bot away.',delegateHash:pvG.body.delegation.hash});
  assert.equal(gone.status,409);assert.equal(gone.body.code,'delegate_bot_gone','a reviewed delegation never silently switches to the engine');
  assert.equal((await f.getJ('fm:biz:resp:'+respId)).runsCount,2,'no run record created for the refused delegation');
  ag.status='active';delete ag.revokedAt;await f.setJ('fm:agent:'+agent.id,ag);
  const back=await f.bizRespAct(respId,'run',{input:'Reply while bot away.',delegateHash:pvG.body.delegation.hash});
  assert.equal(back.status,200,'restored destination accepts the same reviewed payload (nothing about it changed)');
  await f.stopTask(back.body.run.taskId); // leave nothing running for later sections
  // --- bot failure settles failed with the bot's reason
  const pvF=await f.bizRespAct(respId,'delegate-preview',{input:'Draft the refund reply again.'});
  const runF=(await f.bizRespAct(respId,'run',{input:'Draft the refund reply again.',delegateHash:pvF.body.delegation.hash})).body.run;
  await f.claimTask(agent);
  await f.completeTask(agent,runF.taskId,{status:'failed',result:'Missing current refund policy.'});
  const runF2=await f.getJ('fm:biz:run:'+runF.id);
  assert.equal(runF2.status,'failed');assert.equal(runF2.failureReason,'bot_failed');
  assert.equal(runF2.failureDetail,'Missing current refund policy.');assert.equal(runF2.output,null,'no draft on failure');

  // --- owner stop settles failed(owner_stopped)
  const pvS=await f.bizRespAct(respId,'delegate-preview',{input:'Third reply.'});
  const runS=(await f.bizRespAct(respId,'run',{input:'Third reply.',delegateHash:pvS.body.delegation.hash})).body.run;
  const stop=await f.stopTask(runS.taskId);
  assert.equal(stop.status,200);
  const runS2=await f.getJ('fm:biz:run:'+runS.id);
  assert.equal(runS2.status,'failed');assert.equal(runS2.failureReason,'owner_stopped');

  // --- stalled bot: auto-stop settles failed(bot_stalled)
  const pvT=await f.bizRespAct(respId,'delegate-preview',{input:'Fourth reply.'});
  const runT=(await f.bizRespAct(respId,'run',{input:'Fourth reply.',delegateHash:pvT.body.delegation.hash})).body.run;
  await f.claimTask(agent);
  const tT=await f.getJ('fm:task:'+runT.taskId);tT.startedAt=ISO(Date.now()-31*60000);tT.progressAt=tT.startedAt;await f.setJ('fm:task:'+runT.taskId,tT);
  await f.expireStalledTasks();
  const runT2=await f.getJ('fm:biz:run:'+runT.id);
  assert.equal(runT2.status,'failed');assert.equal(runT2.failureReason,'bot_stalled','auto-stopped job settles the run honestly');

  // --- source delete cancels a pending delegated job and fails its run inside the delete op
  const pvD=await f.bizRespAct(respId,'delegate-preview',{input:'Fifth reply.'});
  const runD=(await f.bizRespAct(respId,'run',{input:'Fifth reply.',delegateHash:pvD.body.delegation.hash})).body.run;
  const del=await f.bizSourceDel(sid,{});
  assert.equal(del.status,200,'source delete completes');
  const tD=await f.getJ('fm:task:'+runD.taskId);
  assert.equal(tD.status,'failed');assert.equal(tD.result,'Source removed by owner','the pending job is cancelled, not left processing deleted data');
  const runD2=await f.getJ('fm:biz:run:'+runD.id);
  assert.equal(runD2.status,'failed');assert.equal(runD2.failureReason,'source_deleted','its run fails honestly inside the delete op');

  // --- purge: pending delegated jobs cancelled, every delegated job record removed, late settles refused
  const pvP=await f.bizRespAct(respId,'delegate-preview',{input:'Sixth reply.'});
  const runP=(await f.bizRespAct(respId,'run',{input:'Sixth reply.',delegateHash:pvP.body.delegation.hash})).body.run;
  const staleTask=await f.getJ('fm:task:'+runP.taskId);
  const purge=await f.bizDataPurge({confirm:'DELETE'});
  assert.equal(purge.status,200,'purge completes with a pending delegation in flight');
  assert.equal(await f.getJ('fm:task:'+runP.taskId),null,'the delegated job record is removed with the purge');
  assert.equal(await f.getJ('fm:biz:run:'+runP.id),null,'the run record is purged');
  await f.bizSettleDelegatedRun({...staleTask,status:'done',result:'late bot report after purge'});
  assert.equal(await f.getJ('fm:biz:run:'+runP.id),null,'a late bot report after purge recreates nothing');
  assert.equal((await f.bizState()).sources.length,0,'workspace is empty after purge');

  // --- responsibility delete cancels its pending delegated jobs
  await f.bizConsentAct(true,{host:'api.groq.com',model:'openai/gpt-oss-120b'}); // the purge removed consent with everything else
  const s3=await f.bizSourceAdd({kind:'note',title:'Fresh',text:'We answer every customer email within a day.'});
  c.process.env.__sid=s3.body.source.id;
  const p3=(await f.bizDiscover()).body.proposals[0];
  const resp3=(await f.bizProposalAct(p3.id,'activate',{})).body.responsibility.id;
  const pv3=await f.bizRespAct(resp3,'delegate-preview',{input:'Seventh reply.'});
  const run3=(await f.bizRespAct(resp3,'run',{input:'Seventh reply.',delegateHash:pv3.body.delegation.hash})).body.run;
  const rd=await f.bizRespAct(resp3,'delete',{confirm:'DELETE'});
  assert.equal(rd.status,200);
  const t3=await f.getJ('fm:task:'+run3.taskId);
  assert.equal(t3.status,'failed','responsibility delete cancels its pending delegated job');
 });

 // --- a legacy responsibility with no recorded sourceIds delegates the work text alone
 await f.als.run({ws:'wslegacy'},async()=>{
  await f.bizConsentAct(true,{host:'api.groq.com',model:'openai/gpt-oss-120b'});
  const g2=await f.createAgent('Grokbot','Business work','grok',false,{preset:'balanced'});
  const sL=await f.bizSourceAdd({kind:'note',title:'L',text:'Legacy source text. we answer every customer email within a day'});
  c.process.env.__sid=sL.body.source.id;
  const pL=(await f.bizDiscover()).body.proposals[0];
  const respL=(await f.bizProposalAct(pL.id,'activate',{})).body.responsibility.id;
  const rec=await f.getJ('fm:biz:resp:'+respL);delete rec.sourceIds;await f.setJ('fm:biz:resp:'+respL,rec); // pre-bridge record
  const pvL=await f.bizRespAct(respL,'delegate-preview',{input:'Just this work.'});
  assert.equal(pvL.status,200);assert.deepEqual(pvL.body.delegation.sources,[],'no linked sources known: work text alone goes');
  assert(!pvL.body.delegation.context.includes('Legacy source text'),'no source text is pulled in without a link');
 });

 // --- two non-Grok bots: no automatic choice; one non-Grok bot: unambiguous
 await f.als.run({ws:'wstwo'},async()=>{
  await f.createAgent('Bot A','Ops','custom',false,{preset:'balanced'});
  await f.createAgent('Bot B','Ops','custom',false,{preset:'balanced'});
  assert.equal(await f.bizDelegateBot(),null,'two non-Grok bots: no silent pick');
 });
 await f.als.run({ws:'wsone'},async()=>{
  const one=await f.createAgent('Solo','Ops','custom',false,{preset:'balanced'});
  const pick=await f.bizDelegateBot();
  assert.equal(pick&&pick.id,one.agent.id,'a single connected bot of any provider is unambiguous');
 });

 // --- research responsibilities never delegate
 await f.als.run({ws:'wsres'},async()=>{
  await f.bizConsentAct(true,{host:'api.groq.com',model:'openai/gpt-oss-120b'});
  await f.createAgent('Grokbot','Business work','grok',false,{preset:'balanced'});
  const sR=await f.bizSourceAdd({kind:'note',title:'R',text:'We answer every customer email within a day. See https://good.example/'});
  c.process.env.__sid=sR.body.source.id;
  const pR=(await f.bizDiscover()).body.proposals[0];
  const respR=(await f.bizProposalAct(pR.id,'activate',{research:true})).body.responsibility.id;
  const pvR=await f.bizRespAct(respR,'delegate-preview',{input:'Research the prospect.'});
  assert.equal(pvR.status,400,'research responsibility cannot delegate');
  const RV=(await f.bizRespAct(respR,'candidates',{input:'Research the prospect.'})).body.sourceVersions;
  const resR=await f.bizRespAct(respR,'run',{input:'Research the prospect.',approvedUrls:[],reviewedVersions:RV});
  assert.equal(resR.status,200);assert.equal(resR.body.run.research,true,'research run stays on the engine path');
  assert.equal(resR.body.run.backend,undefined,'no delegation backend on a research run');
  assert(!(await f.listTasks()).some(t=>t.biz&&t.biz.respId===respR),'no delegated job exists for the research run');
 });

 // === reviewer HOLD coverage: complete inventory beyond the recent list, pinned destination,
 // payload accuracy (whole sources / fixed rules), refused creation leaving nothing behind ===
 await f.als.run({ws:'wsorph'},async()=>{
  await f.bizConsentAct(true,{host:'api.groq.com',model:'openai/gpt-oss-120b'});
  const g2=await f.createAgent('Grokbot','Business work','grok',false,{preset:'balanced'});const ag2=g2.agent;
  const so=await f.bizSourceAdd({kind:'note',title:'Ops',text:'We answer every customer email within a day. Refunds over $50 need Royce.'});
  c.process.env.__sid=so.body.source.id;
  const po=(await f.bizDiscover()).body.proposals[0];
  const respO=(await f.bizProposalAct(po.id,'activate',{})).body.responsibility.id;
  const pad=async(n,tag)=>{for(let i=0;i<n;i++)await f.newTask({title:tag+i,brief:'b',assignee:'agent_other'});};

  // --- payload accuracy: whole sources (no silent slice), count overflow named, input capped in the builder
  const longText='Start. '+'x'.repeat(1800)+' END-EXCEPTION-MARKER';
  const sL=await f.bizSourceAdd({kind:'note',title:'Long',text:longText});
  const rObj=await f.getJ('fm:biz:resp:'+respO);
  rObj.sourceIds=[so.body.source.id,sL.body.source.id];await f.setJ('fm:biz:resp:'+respO,rObj);
  const pvL=await f.bizRespAct(respO,'delegate-preview',{input:'Reply about the exception.'});
  assert(pvL.body.delegation.context.includes('END-EXCEPTION-MARKER'),'a linked source is included WHOLE - no silent 1500 slice');
  assert.equal(pvL.body.delegation.sources.find(s=>s.id===sL.body.source.id).chars,longText.length,'chars reports the whole source');
  const tiny=[];for(let i=0;i<6;i++)tiny.push((await f.bizSourceAdd({kind:'note',title:'T'+i,text:'t'+i})).body.source.id);
  rObj.sourceIds=[...tiny,so.body.source.id];await f.setJ('fm:biz:resp:'+respO,rObj); // 7 linked
  const pv7=await f.bizRespAct(respO,'delegate-preview',{input:'x'});
  assert.equal(pv7.body.delegation.omittedSources.filter(o=>o.reason==='over_source_limit').length,1,'a source past the count limit is NAMED omitted, not silently dropped');
  const giant=(await f.bizSourceAdd({kind:'note',title:'Giant',text:'G'.repeat(5000)})).body.source.id;
  rObj.sourceIds=[giant];await f.setJ('fm:biz:resp:'+respO,rObj);
  const pvG2=await f.bizRespAct(respO,'delegate-preview',{input:'x'});
  assert.equal(pvG2.body.delegation.omittedSources.filter(o=>o.reason==='did_not_fit').length,1,'a source too large for the context is NAMED omitted');
  assert(!pvG2.body.delegation.context.includes('GGGG'),'its text is never sliced in');
  // fixed control rules survive maximum-length responsibility fields
  rObj.title='T'.repeat(120);rObj.summary='S'.repeat(600);rObj.boundary='B'.repeat(300);
  rObj.sourceIds=[so.body.source.id];await f.setJ('fm:biz:resp:'+respO,rObj);
  const pvB=await f.bizRespAct(respO,'delegate-preview',{input:'x'});
  assert(pvB.body.delegation.brief.length<=1500,'brief stays inside the task cap');
  assert(pvB.body.delegation.brief.endsWith('report what is missing instead.'),'the full fixed rules ride every brief, uncut');
  assert(pvB.body.delegation.brief.includes('Boundary the owner set: '+'B'.repeat(300)),'the owner boundary survives ahead of the summary');
  // the builder caps the work item inside the payload so review and execution bind identical text
  const payloadBig=f.bizDelegatePayload(rObj,await f.bizSources(),'y'.repeat(4000),(await f.bizDelegateBot()));
  assert.equal(payloadBig.input.length,1200,'work item capped inside the builder');
  assert(payloadBig.context.length<=3900,'context can never outgrow the task cap on its own');
  rObj.title='Customer reply desk';rObj.summary='Draft replies.';rObj.boundary='Drafts only';await f.setJ('fm:biz:resp:'+respO,rObj);

  // --- complete inventory: source delete cancels a delegated job pushed outside the recent list
  const pvO=await f.bizRespAct(respO,'delegate-preview',{input:'First orphan reply.'});
  const runO=(await f.bizRespAct(respO,'run',{input:'First orphan reply.',delegateHash:pvO.body.delegation.hash})).body.run;
  await pad(65,'pad1 ');
  assert(!(await f.listTasks()).some(t=>t.id===runO.taskId),'setup: delegated job is outside the recent list');
  const delO=await f.bizSourceDel(so.body.source.id,{});
  assert.equal(delO.status,200,'source delete completes');
  assert.equal((await f.getJ('fm:task:'+runO.taskId)).status,'failed','source delete cancels a delegated job beyond the recent list');
  assert.equal((await f.getJ('fm:biz:run:'+runO.id)).failureReason,'source_deleted','its run settles honestly');

  // --- complete inventory: stall sweep reaches an orphaned running delegated job
  const pvS=await f.bizRespAct(respO,'delegate-preview',{input:'Second orphan reply.'});
  const runS=(await f.bizRespAct(respO,'run',{input:'Second orphan reply.',delegateHash:pvS.body.delegation.hash})).body.run;
  await f.claimTask(ag2);
  const tS=await f.getJ('fm:task:'+runS.taskId);tS.startedAt=ISO(Date.now()-31*60000);tS.progressAt=tS.startedAt;await f.setJ('fm:task:'+runS.taskId,tS);
  await pad(65,'pad2 ');
  assert(!(await f.listTasks()).some(t=>t.id===runS.taskId),'setup: running delegated job is outside the recent list');
  await f.expireStalledTasks();
  assert.equal((await f.getJ('fm:biz:run:'+runS.id)).failureReason,'bot_stalled','stall sweep reaches a delegated job beyond the recent list');

  // --- pinned destination: handoff, owner transfer and asleep reassignment all refused
  const pvH=await f.bizRespAct(respO,'delegate-preview',{input:'Third orphan reply.'});
  const runH=(await f.bizRespAct(respO,'run',{input:'Third orphan reply.',delegateHash:pvH.body.delegation.hash})).body.run;
  const g3=await f.createAgent('OtherBot','Ops','custom',false,{preset:'balanced'});
  const ho=await f.gatewayAct(ag2,{action:'work.handoff',params:{task_id:runH.taskId,to:g3.agent.id}});
  assert(/owner-reviewed destination/.test(JSON.stringify(ho)),'a delegated job cannot be handed to another bot');
  const tAfter=await f.getJ('fm:task:'+runH.taskId);
  assert(tAfter.biz&&tAfter.biz.runId===runH.id,'the biz tag stays on the original job - no child carries it, stop/poll never diverge');
  const mv=await f.reassignTask(runH.taskId,{confirmed:true,assignee:g3.agent.id,expectedAssignee:ag2.id,expectedStatus:'queued'});
  assert.equal(mv.status,409,'owner transfer refuses to move a destination-pinned job');
  const aA=await f.getJ('fm:agent:'+ag2.id);aA.lastSeen=ISO(Date.now()-3*3600000);await f.setJ('fm:agent:'+ag2.id,aA);
  const aB=await f.getJ('fm:agent:'+g3.agent.id);aB.lastSeen=ISO(Date.now());await f.setJ('fm:agent:'+g3.agent.id,aB);
  const tH=await f.getJ('fm:task:'+runH.taskId);tH.assignedAt=ISO(Date.now()-3*3600000);tH.createdAt=tH.assignedAt;await f.setJ('fm:task:'+runH.taskId,tH);
  const ctlTask=await f.newTask({title:'ordinary ctl',brief:'b',assignee:ag2.id});
  const tC=await f.getJ('fm:task:'+ctlTask.id);tC.assignedAt=tH.assignedAt;tC.createdAt=tH.assignedAt;await f.setJ('fm:task:'+ctlTask.id,tC);
  await f.reassignAsleepQueuedTasks('claimant_x');
  assert.equal((await f.getJ('fm:task:'+runH.taskId)).assignee,ag2.id,'a reviewed destination never silently moves, even when the bot is asleep');
  assert.equal((await f.getJ('fm:task:'+ctlTask.id)).assignee,g3.agent.id,'control: an ordinary job in the same state DOES move (the rig was ripe)');

  // --- complete inventory: purge removes an orphaned delegated job record and the inventory itself
  const pvZ=await f.bizRespAct(respO,'delegate-preview',{input:'Fourth orphan reply.'});
  const runZ=(await f.bizRespAct(respO,'run',{input:'Fourth orphan reply.',delegateHash:pvZ.body.delegation.hash})).body.run;
  await pad(65,'pad3 ');
  assert(!(await f.listTasks()).some(t=>t.id===runZ.taskId),'setup: delegated job is outside the recent list before purge');
  const purgeO=await f.bizDataPurge({confirm:'DELETE'});
  assert.equal(purgeO.status,200,'purge completes');
  assert.equal(await f.getJ('fm:task:'+runZ.taskId),null,'purge removes a delegated job record beyond the recent list');
  assert.equal((await f.r(['SMEMBERS','fm:biz:delegated'])||[]).length,0,'the delegated inventory itself is removed with the purge');
 });

 // --- refused creation leaves nothing behind (abandon path, stale fence)
 await f.als.run({ws:'wsrace'},async()=>{
  await f.bizConsentAct(true,{host:'api.groq.com',model:'openai/gpt-oss-120b'});
  await f.createAgent('Grokbot','Business work','grok',false,{preset:'balanced'});
  const sr=await f.bizSourceAdd({kind:'note',title:'R',text:'We answer every customer email within a day.'});
  c.process.env.__sid=sr.body.source.id;
  const pr=(await f.bizDiscover()).body.proposals[0];
  const respR=(await f.bizProposalAct(pr.id,'activate',{})).body.responsibility.id;
  const bot=await f.bizDelegateBot();
  const payload=f.bizDelegatePayload(await f.getJ('fm:biz:resp:'+respR),await f.bizSources(),'Race reply.',bot);
  const out=await f.bizDelegateRun(await f.getJ('fm:biz:resp:'+respR),await f.bizSources(),'Race reply.',bot,'999',payload); // stale fence: a delete/purge landed first
  assert.equal(out.status,409,'a workspace change during creation refuses the run');
  assert.equal((await f.r(['SMEMBERS','fm:biz:delegated'])||[]).length,0,'no inventory entry survives the refused creation');
  assert(!(await f.listTasks()).some(t=>t.biz),'no orphaned job record survives the refused creation');
  assert.equal((await f.r(['LRANGE','fm:biz:runs:'+respR,0,99])||[]).length,0,'no phantom run history survives the refused creation');

  // --- a delete winning the race AFTER the fenced writes (before the queued flip): honest
  // 409, never a false "sent" - and the just-registered run fails honestly
  const pvX=await f.bizRespAct(respR,'delegate-preview',{input:'Race reply 2.'});
  c.global.__bizRaceDelete=1; // test-only: deletes the held job between the fenced writes and the flip
  const race2=await f.bizRespAct(respR,'run',{input:'Race reply 2.',delegateHash:pvX.body.delegation.hash});
  assert.equal(race2.status,409,'a delete winning the final-flip race refuses, no false sent');
  assert.equal((await f.r(['SMEMBERS','fm:biz:delegated'])||[]).length,0,'no inventory entry survives the lost race');
  const xruns=await f.r(['LRANGE','fm:biz:runs:'+respR,0,99]);
  assert.equal(xruns.length,1,'the run was registered before the race');
  const xr=await f.getJ('fm:biz:run:'+xruns[0]);
  assert.equal(xr.status,'failed');assert.equal(xr.failureReason,'workspace_changed','the registered run fails honestly, never a phantom sent');
 });

 // --- scheduled automatic runs: owner-reviewed standing payload, hash-paused on drift, no engine needed
 await f.als.run({ws:'wssched'},async()=>{
  c.process.env.ALTER_MODEL_WS+=',wssched';
  await f.bizConsentAct(true,{host:'api.groq.com',model:'openai/gpt-oss-120b'});
  const g=await f.createAgent('Grokbot','Business work','grok',false,{preset:'balanced'});
  const sr=await f.bizSourceAdd({kind:'note',title:'Estimates',text:'We answer every customer email within a day. We send estimates within two days. Follow up on day three.'});
  c.process.env.__sid=sr.body.source.id;
  const p=(await f.bizDiscover()).body.proposals[0];
  const respS=(await f.bizProposalAct(p.id,'activate',{})).body.responsibility.id;
  // bot-mapped: schedules only exist for responsibilities that run on the reviewed bot
  const rec=await f.getJ('fm:biz:resp:'+respS);rec.bot={id:g.agent.id,name:g.agent.name,providerId:'grok'};await f.setJ('fm:biz:resp:'+respS,rec);
  // an engine-only responsibility (no bot) refuses a bot schedule outright
  const p0=(await f.bizDiscover()).body.proposals[0];
  const respE=(await f.bizProposalAct(p0.id,'activate',{})).body.responsibility.id;
  const nope=await f.bizRespAct(respE,'schedule',{op:'preview',instruction:'x'});
  assert.equal(nope.status,400,'engine responsibilities get no bot schedule');
  // engine consent withdrawn: scheduled bot runs must still queue - the engine is never substituted
  await f.bizConsentAct(false,{});

  const bad=await f.bizRespAct(respS,'schedule',{op:'enable',instruction:'Follow up on open estimates.',delegateHash:'bogus'});
  assert.equal(bad.status,409);assert.equal(bad.body.code,'delegation_review_required','enabling without reviewing the exact daily text refuses');
  const pv=await f.bizRespAct(respS,'schedule',{op:'preview',instruction:'Follow up on open estimates.'});
  assert.equal(pv.status,200);assert.ok(pv.body.delegation.hash);
  const en=await f.bizRespAct(respS,'schedule',{op:'enable',instruction:'Follow up on open estimates.',delegateHash:pv.body.delegation.hash});
  assert.equal(en.status,200);assert.equal(en.body.responsibility.schedule.freq,'daily');

  await f.bizDailyTick();
  const runs1=await f.r(['LRANGE','fm:biz:runs:'+respS,0,9]);
  assert.equal(runs1.length,1,'the daily tick queued one scheduled run without engine consent');
  const run1=await f.getJ('fm:biz:run:'+runs1[0]);
  assert.equal(run1.kind,'auto','the queued run is marked automatic');
  assert.equal(run1.status,'delegated');
  const job1=await f.getJ('fm:task:'+run1.taskId);
  assert.equal(job1.status,'queued');assert.equal(job1.assignee,g.agent.id);
  assert.equal(job1.context,pv.body.delegation.context,'the queued payload is byte-identical to the reviewed one');

  await f.bizDailyTick();
  assert.equal((await f.r(['LRANGE','fm:biz:runs:'+respS,0,9])).length,1,'the 20h gap blocks a duplicate queue');

  await f.bizSourceEdit(sr.body.source.id,{title:'Estimates',text:'We send estimates within THREE days. Follow up on day five.'});
  {const recG=await f.getJ('fm:biz:resp:'+respS);recG.schedule.lastQueuedAt=new Date(Date.now()-21*3600e3).toISOString();await f.setJ('fm:biz:resp:'+respS,recG);} // past the gap: the tick must evaluate, not skip
  await f.bizDailyTick();
  assert.equal((await f.r(['LRANGE','fm:biz:runs:'+respS,0,9])).length,1,'a source edit pauses the schedule instead of sending drifted text');
  const rec2=await f.getJ('fm:biz:resp:'+respS);assert.ok(rec2.schedule.needsReview,'the pause is marked needs-review');

  const pv2=await f.bizRespAct(respS,'schedule',{op:'preview',instruction:'Follow up on open estimates.'});
  const en2=await f.bizRespAct(respS,'schedule',{op:'enable',instruction:'Follow up on open estimates.',delegateHash:pv2.body.delegation.hash});
  assert.equal(en2.status,200);assert.equal(en2.body.responsibility.schedule.needsReview,null,'re-reviewing the new text clears the pause');
  await f.bizDailyTick();
  assert.equal((await f.r(['LRANGE','fm:biz:runs:'+respS,0,9])).length,2,'the resumed schedule queues the re-reviewed text');

  const dis=await f.bizRespAct(respS,'schedule',{op:'disable'});
  assert.equal(dis.status,200);assert.ok(!dis.body.responsibility.schedule,'disable removes the schedule');
  const before=(await f.r(['LRANGE','fm:biz:runs:'+respS,0,9])).length;
  await f.bizDailyTick();
  assert.equal((await f.r(['LRANGE','fm:biz:runs:'+respS,0,9])).length,before,'nothing queues after disable');

  // --- race hardening: concurrent ticks, emergency stop, and mid-flight owner actions
  const pv3=await f.bizRespAct(respS,'schedule',{op:'preview',instruction:'Follow up on open estimates.'});
  const en3=await f.bizRespAct(respS,'schedule',{op:'enable',instruction:'Follow up on open estimates.',delegateHash:pv3.body.delegation.hash});
  assert.equal(en3.status,200,'schedule re-enabled for race tests');

  // two ticks racing the same window: exactly one claim wins, one job queues
  await Promise.all([f.bizDailyTick(),f.bizDailyTick()]);
  assert.equal((await f.r(['LRANGE','fm:biz:runs:'+respS,0,9])).length,before+1,'concurrent ticks queue exactly one scheduled run');
  {const rc=await f.getJ('fm:biz:resp:'+respS);rc.schedule.lastQueuedAt=new Date(Date.now()-21*3600e3).toISOString();await f.setJ('fm:biz:resp:'+respS,rc);} // past the gap again

  // the emergency stop holds unattended queueing: no run, no job, claim not consumed
  await f.r(['SET','fm:kill','1']);
  await f.bizDailyTick();
  assert.equal((await f.r(['LRANGE','fm:biz:runs:'+respS,0,9])).length,before+1,'kill switch blocks the scheduled queue');
  {const rk=await f.getJ('fm:biz:resp:'+respS);assert.ok(Date.now()-Date.parse(rk.schedule.lastQueuedAt)>20*3600e3,'kill did not consume the daily window');}
  await f.r(['DEL','fm:kill']);

  // owner disables between the claim and the visibility flip: the gate refuses, nothing lingers
  c.global.__bizSchedInterleave=async()=>{ await f.bizRespAct(respS,'schedule',{op:'disable'}); };
  await f.bizDailyTick();
  const runsAfterDisable=await f.r(['LRANGE','fm:biz:runs:'+respS,0,9]);
  assert.equal(runsAfterDisable.length,before+2,'the refused run is recorded honestly');
  const refused=await f.getJ('fm:biz:run:'+runsAfterDisable[0]);
  assert.equal(refused.status,'failed','the mid-flight disable fails the run instead of queueing it');
  assert.ok(!(await f.getJ('fm:task:'+refused.taskId)),'the refused job never becomes visible and does not linger');
  assert.equal((await f.r(['SMEMBERS','fm:biz:delegated'])).includes(refused.taskId),false,'the refused job leaves the delegated inventory');
  {const rd=await f.getJ('fm:biz:resp:'+respS);assert.ok(!rd.schedule,'the disable stands after the refused flip');}

  // kill switch landing mid-flight: the gate refuses the same way
  const pv4=await f.bizRespAct(respS,'schedule',{op:'preview',instruction:'Follow up on open estimates.'});
  await f.bizRespAct(respS,'schedule',{op:'enable',instruction:'Follow up on open estimates.',delegateHash:pv4.body.delegation.hash});
  c.global.__bizSchedInterleave=async()=>{ await f.r(['SET','fm:kill','1']); };
  await f.bizDailyTick();
  const runsAfterKill=await f.r(['LRANGE','fm:biz:runs:'+respS,0,9]);
  assert.equal(runsAfterKill.length,before+3,'the kill-refused run is recorded honestly');
  const killedRun=await f.getJ('fm:biz:run:'+runsAfterKill[0]);
  assert.equal(killedRun.status,'failed','a kill mid-flight fails the run instead of queueing it');
  assert.ok(!(await f.getJ('fm:task:'+killedRun.taskId)),'no job becomes visible under the emergency stop');
  await f.r(['DEL','fm:kill']);

  // a source edit between the claim and the flip: the gate binds reviewed source versions
  {const rg=await f.getJ('fm:biz:resp:'+respS);rg.schedule.lastQueuedAt=new Date(Date.now()-21*3600e3).toISOString();await f.setJ('fm:biz:resp:'+respS,rg);} // past the gap: the tick must evaluate
  c.global.__bizSchedInterleave=async()=>{ await f.bizSourceEdit(sr.body.source.id,{title:'Estimates',text:'Follow up on day TEN now.'}); };
  await f.bizDailyTick();
  const runsAfterEdit=await f.r(['LRANGE','fm:biz:runs:'+respS,0,9]);
  assert.equal(runsAfterEdit.length,before+4,'the drift-refused run is recorded honestly');
  const driftRun=await f.getJ('fm:biz:run:'+runsAfterEdit[0]);
  assert.equal(driftRun.status,'failed','a source edit mid-flight refuses the flip - old text never queues');
  assert.ok(!(await f.getJ('fm:task:'+driftRun.taskId)),'the drifted job never becomes visible');

 });

 console.log('biz-delegation-regression: all assertions passed');
})().catch(e=>{console.error(e);process.exit(1);});
