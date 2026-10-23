// Delegated business runs (Grokbot-first bridge): a connected bot does the work through the
// existing job claim/report path. Covers: engine fallback with no bot, hash-bound payload
// review, exact task payload, claim/complete/fail/stop/stall settles, idempotency, source
// edit invalidating the review, source delete cancelling pending jobs, purge removing
// delegated jobs and refusing late settles, research never delegating, and multi-bot rules.
// Engine endpoint and bot side are exercised through the real internal call path the
// gateway/MCP adapters use (claimTask/completeTask/stopTask); no real network, no real bot.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={bizSourceAdd,bizSourceEdit,bizSourceDel,bizDiscover,bizProposalAct,bizRespAct,bizDataPurge,bizConsentAct,bizState,bizDelegateBot,bizSettleDelegatedRun,createAgent,claimTask,completeTask,stopTask,expireStalledTasks,listTasks,setJ,getJ,r,als};';
const c={require:(m)=>require(m),module:{exports:{}},process:{env:{}},global:{},console,URL,Buffer,AbortSignal,setTimeout,clearTimeout,
 fetch:(u,o)=>{const body=JSON.parse(o.body);const sys=body.messages[0].content;
  const reply=content=>Promise.resolve({ok:true,json:async()=>({choices:[{message:{content}}],usage:{prompt_tokens:1,completion_tokens:1}})});
  if(/propose areas of responsibility/i.test(sys))return reply(JSON.stringify({proposals:[{title:'Customer reply desk',summary:'Draft replies to customer emails.',evidence:[{sourceId:c.process.env.__sid,excerpt:'we answer every customer email within a day'}],unknowns:[],systems:[],boundary:'Drafts only; owner approves every reply.'}]}));
  if(/fetch_requests/.test(sys))return reply(JSON.stringify({draft:'research draft',blocked_step:null,sources_used:[],citations:[],next_steps:[]}));
  return reply(JSON.stringify({draft:'engine draft',blocked_step:null,sources_used:[]}));}};
vm.runInNewContext(src,c);const f=c.module.exports.t;
const ISO=ms=>new Date(ms).toISOString();

(async()=>{
 c.process.env.ALTER_MODEL_KEY='k';c.process.env.ALTER_MODEL_WS='wsdel,wslegacy,wsres';

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
  const sL=await f.bizSourceAdd({kind:'note',title:'L',text:'Legacy source text.'});
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

 console.log('biz-delegation-regression: all assertions passed');
})().catch(e=>{console.error(e);process.exit(1);});
