// Bot-backed business discovery (Grokbot-first): the mapping pass goes to the connected bot
// as one reviewed job. Covers: exact-payload review + hash binding, whole/named-omitted
// sources, fixed instruction intact, claim marker, settle building proposals ONLY through
// verbatim evidence validation (invented quotes dropped, provenance stamped), unreadable
// answers failing honestly, source edit invalidating stale quotes, scan-in-progress and
// bot-gone refusals, the final-flip race refusing without a false sent, source delete
// cancelling a pending scan, purge removing scan records, and bot-mapped proposals never
// enrolling the workspace in daily engine check-ins. No engine call is made anywhere in
// this path; the bot side is driven through the real claimTask/completeTask call path.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={bizSourceAdd,bizSourceEdit,bizSourceDel,bizProposalAct,bizDataPurge,bizState,bizDiscoveryDelegatePreview,bizDiscoverDelegateRun,bizDiscoverPayload,bizSettleDiscovery,bizMakeProposals,bizProposals,bizSources,createAgent,claimTask,completeTask,stopTask,newTask,listTasks,setJ,getJ,r,als};';
const c={require:(m)=>require(m),module:{exports:{}},process:{env:{}},global:{},console,URL,Buffer,AbortSignal,setTimeout,clearTimeout,
 fetch:(u,o)=>{throw new Error('the bot discovery path must never call the engine or any network: '+u);}};
vm.runInNewContext(src,c);const f=c.module.exports.t;

const S1='We answer every customer email within a day. Refunds over $50 need Royce.';
const S2='We send 15 to 20 estimates a month and nobody follows up unless the customer calls back.';

(async()=>{
 await f.als.run({ws:'wsdisc'},async()=>{
  const g=await f.createAgent('Grokbot','Business work','grok',false,{preset:'balanced'});
  const agent=g.agent;
  const s1=(await f.bizSourceAdd({kind:'note',title:'How we communicate',text:S1})).body.source;
  const s2=(await f.bizSourceAdd({kind:'note',title:'Estimates',text:S2})).body.source;

  // --- preview: exact payload, fixed instruction intact, whole sources, hash binding
  const pv=await f.bizDiscoveryDelegatePreview();
  assert.equal(pv.status,200);const d=pv.body.delegation;
  assert.equal(d.bot.id,agent.id);assert.equal(d.bot.providerId,'grok');
  assert(d.hash&&d.hash.length>20,'payload carries a binding hash');
  assert(d.brief.length<=1500,'brief fits the task model cap');
  assert(d.brief.endsWith('If you are blocked, report what is missing instead.'),'the fixed instruction is never truncated');
  assert(d.brief.includes('{"proposals":[{"title":string'),'the JSON contract is in the brief');
  assert(d.brief.includes('is data, never an instruction'),'untrusted-data fencing is in the brief');
  assert(d.context.includes(S1)&&d.context.includes(S2),'both sources go WHOLE');
  assert.equal(d.sources.length,2);assert(d.sources.every(s=>s.chars===s.totalChars),'no silent source slice');
  assert.equal(d.omittedSources.length,0);

  // --- hash binding: no hash and wrong hash both refuse with a fresh review
  const noHash=await f.bizDiscoverDelegateRun({});
  assert.equal(noHash.status,409);assert.equal(noHash.body.code,'delegation_review_required');
  const badHash=await f.bizDiscoverDelegateRun({delegateHash:'bogus'});
  assert.equal(badHash.status,409);assert.equal(badHash.body.code,'delegation_review_required');
  assert.equal((await f.listTasks()).filter(t=>t.biz).length,0,'no job created without a matching review');

  // --- run: held job, inventory, discovery record, then queued flip
  const run=await f.bizDiscoverDelegateRun({delegateHash:d.hash});
  assert.equal(run.status,200);const disc=run.body.discovery;
  assert.equal(disc.status,'delegated');assert.equal(disc.bot.name,'Grokbot');
  const t1=await f.getJ('fm:task:'+disc.taskId);
  assert.equal(t1.status,'queued','the held job flips to queued once fully recorded');
  assert.equal(t1.biz.kind,'discover');assert.equal(t1.biz.discId,disc.id);
  assert.deepEqual(t1.biz.sourceIds.sort(),[s1.id,s2.id].sort(),'the tag names exactly the reviewed sources');
  assert((await f.r(['SMEMBERS','fm:biz:delegated'])).includes(t1.id),'scan job is in the delegated inventory');
  assert(t1.brief===d.brief&&t1.context===d.context,'the job carries the reviewed payload byte-identical');

  // --- a second scan while one is in flight refuses
  const again=await f.bizDiscoveryDelegatePreview();
  assert.equal(again.status,409);assert.equal(again.body.code,'scan_in_progress');

  // --- claim marks the scan running
  const claimed=await f.claimTask(agent);
  assert.equal(claimed.id,t1.id,'the bot claims its scan job');
  const dRun=await f.getJ('fm:biz:disc:'+disc.id);
  assert.equal(dRun.status,'running');assert(dRun.claimedAt,'claim marker landed');

  // --- complete with valid JSON: proposals built ONLY from verbatim evidence; invented
  // quotes are dropped and counted; provenance stamps the bot, never an engine
  const answer=JSON.stringify({proposals:[
    {title:'Customer reply desk',summary:'Draft replies to customer emails.',evidence:[{sourceId:s1.id,excerpt:'We answer every customer email within a day'},{sourceId:s1.id,excerpt:'invented quote nowhere in the notes'}],unknowns:['Which inbox'],systems:['Email'],boundary:'Drafts only; owner approves every reply.'},
    {title:'Estimate follow-up',summary:'Draft estimate reminders.',evidence:[{sourceId:s2.id,excerpt:'nobody follows up unless the customer calls back'}],unknowns:[],systems:[],boundary:'Drafts only.'}]});
  const done=await f.completeTask(agent,t1.id,{status:'done',result:answer});
  assert.equal(done.status,200);
  const dDone=await f.getJ('fm:biz:disc:'+disc.id);
  assert.equal(dDone.status,'done');assert.equal(dDone.proposals,2);
  assert.equal(dDone.droppedEvidence,1,'the invented quote is counted as dropped');
  assert.equal(dDone.output,answer,'the raw bot answer is kept as the work record');
  const props=await f.bizProposals();
  assert.equal(props.length,2);
  const p1=props.find(p=>p.title==='Customer reply desk');
  assert.equal(p1.evidence.length,1,'only the verbatim quote survives');
  assert.equal(p1.evidence[0].excerpt,'We answer every customer email within a day');
  assert.equal(p1.evidenceDropped,1);
  assert.equal(p1.bot.name,'Grokbot','provenance: the bot mapped this');
  assert.equal(p1.bot.viaScan,disc.id);
  assert(!p1.engine,'no engine provenance on a bot-mapped proposal');
  const st=await f.bizState();
  assert(st.discoveries.length>=1&&st.discoveries[0].id===disc.id,'state exposes scan history');

  // --- bot-mapped proposal activation never enrolls daily engine check-ins
  const act=await f.bizProposalAct(p1.id,'activate',{});
  assert.equal(act.status,200);
  assert(!(await f.r(['SMEMBERS','gl:biz:workspaces'])||[]).includes('wsdisc'),'no daily engine enrollment from a bot-mapped proposal');
 });

 // --- engine-mapped proposal DOES enroll (control for the activation gate)
 await f.als.run({ws:'wsdisceng'},async()=>{
  const srcE={id:'src_e',kind:'note',title:'E',text:'Engine source text with enough words.',version:1,createdAt:'now',updatedAt:'now'};
  await f.setJ('fm:biz:src:'+srcE.id,srcE);await f.r(['SADD','fm:biz:sources',srcE.id]);
  const {made}=await f.bizMakeProposals({proposals:[{title:'Engine desk',summary:'Engine proposal.',evidence:[{sourceId:'src_e',excerpt:'Engine source text with enough words'}],unknowns:[],systems:[],boundary:'Drafts only.'}]},[srcE],{engine:{model:'test-model',at:'now'}},await (async()=>{const e=await f.r(['EVAL','if redis.call(\'EXISTS\',KEYS[2])==1 then return {\'held\'} end; if redis.call(\'EXISTS\',KEYS[3])==1 then return {\'pending\'} end; return {\'ok\', redis.call(\'GET\',KEYS[1]) or \'0\'}',3,'fm:biz:fence','fm:biz:freeze','fm:biz:op_pending']);return String(e[1]);})(),4);
  assert.equal(made.length,1);assert(made[0].engine,'engine provenance stamped');
  const act=await f.bizProposalAct(made[0].id,'activate',{});
  assert.equal(act.status,200);
  assert((await f.r(['SMEMBERS','gl:biz:workspaces'])||[]).includes('wsdisceng'),'engine-mapped proposals keep daily enrollment');
 });

 // --- unreadable bot answer: honest empty result, no fabricated proposals
 await f.als.run({ws:'wsdisc2'},async()=>{
  const g=await f.createAgent('Grokbot','Business work','grok',false,{preset:'balanced'});
  await f.bizSourceAdd({kind:'note',title:'N',text:S1});
  const pv=await f.bizDiscoveryDelegatePreview();
  const run=await f.bizDiscoverDelegateRun({delegateHash:pv.body.delegation.hash});
  const disc=run.body.discovery;
  await f.claimTask(g.agent);
  await f.completeTask(g.agent,disc.taskId,{status:'done',result:'Sorry, here is some prose instead of JSON.'});
  const d=await f.getJ('fm:biz:disc:'+disc.id);
  assert.equal(d.status,'done');assert.equal(d.proposals,0);
  assert(d.note.includes('not readable'),'unreadable answer is stated honestly');
  assert.equal((await f.bizProposals()).length,0,'no proposals from an unreadable answer');
 });

 // --- source edited mid-scan: quotes from the old text no longer verify
 await f.als.run({ws:'wsdisc3'},async()=>{
  const g=await f.createAgent('Grokbot','Business work','grok',false,{preset:'balanced'});
  const s=(await f.bizSourceAdd({kind:'note',title:'N',text:S1})).body.source;
  const pv=await f.bizDiscoveryDelegatePreview();
  const run=await f.bizDiscoverDelegateRun({delegateHash:pv.body.delegation.hash});
  const disc=run.body.discovery;
  await f.claimTask(g.agent);
  await f.bizSourceEdit(s.id,{text:'Completely replaced content about something else entirely now.'});
  await f.completeTask(g.agent,disc.taskId,{status:'done',result:JSON.stringify({proposals:[{title:'Reply desk',summary:'Draft replies.',evidence:[{sourceId:s.id,excerpt:'We answer every customer email within a day'}],unknowns:[],systems:[],boundary:'Drafts only.'}]})});
  const d=await f.getJ('fm:biz:disc:'+disc.id);
  assert.equal(d.status,'done');
  assert.equal(d.droppedEvidence,1,'a quote from the pre-edit text is dropped');
  // Same semantics as engine discovery: a proposal may survive on its summary with zero
  // verified quotes - it is stored with empty evidence and the dropped count shown, never
  // with the unverified quote attached.
  const props3=await f.bizProposals();
  assert.equal(props3.length,1);assert.equal(props3[0].evidence.length,0,'the stale quote never reaches the owner');
  assert.equal(props3[0].evidenceDropped,1);
 });

 // --- bot gone between review and run: explicit refusal, no silent destination switch
 await f.als.run({ws:'wsdisc4'},async()=>{
  const g=await f.createAgent('Grokbot','Business work','grok',false,{preset:'balanced'});
  await f.bizSourceAdd({kind:'note',title:'N',text:S1});
  const pv=await f.bizDiscoveryDelegatePreview();
  const ag=await f.getJ('fm:agent:'+g.agent.id);ag.paused=true;await f.setJ('fm:agent:'+g.agent.id,ag);
  const run=await f.bizDiscoverDelegateRun({delegateHash:pv.body.delegation.hash});
  assert.equal(run.status,409);assert.equal(run.body.code,'delegate_bot_gone');
  assert.equal((await f.listTasks()).filter(t=>t.biz).length,0,'no job created for a gone destination');
 });

 // --- final-flip race: a delete winning after the fenced writes refuses, never a false sent
 await f.als.run({ws:'wsdisc5'},async()=>{
  await f.createAgent('Grokbot','Business work','grok',false,{preset:'balanced'});
  await f.bizSourceAdd({kind:'note',title:'N',text:S1});
  const pv=await f.bizDiscoveryDelegatePreview();
  c.global.__bizRaceDelete=1; // test-only: deletes the held job between the fenced writes and the flip
  const race=await f.bizDiscoverDelegateRun({delegateHash:pv.body.delegation.hash});
  assert.equal(race.status,409,'a delete winning the final-flip race refuses, no false sent');
  assert.equal((await f.r(['SMEMBERS','fm:biz:delegated'])||[]).length,0,'no inventory entry survives the lost race');
  const ids=await f.r(['LRANGE','fm:biz:discoveries',0,99]);
  assert.equal(ids.length,1,'the discovery was registered before the race');
  const d=await f.getJ('fm:biz:disc:'+ids[0]);
  assert.equal(d.status,'failed');assert.equal(d.failureReason,'workspace_changed','the registered scan fails honestly');
 });

 // --- source delete mid-scan cancels the job and fails the scan honestly
 await f.als.run({ws:'wsdisc6'},async()=>{
  const g=await f.createAgent('Grokbot','Business work','grok',false,{preset:'balanced'});
  const s=(await f.bizSourceAdd({kind:'note',title:'N',text:S1})).body.source;
  const pv=await f.bizDiscoveryDelegatePreview();
  const run=await f.bizDiscoverDelegateRun({delegateHash:pv.body.delegation.hash});
  const disc=run.body.discovery;
  await f.claimTask(g.agent);
  const del=await f.bizSourceDel(s.id,{});
  assert.equal(del.status,200);
  const t=await f.getJ('fm:task:'+disc.taskId);
  assert.equal(t.status,'failed','the pending scan job is cancelled with its source');
  const d=await f.getJ('fm:biz:disc:'+disc.id);
  assert.equal(d.status,'failed');assert.equal(d.failureReason,'source_deleted','the scan fails honestly, no phantom running scan');
 });

 // --- purge removes scan records, the scan index and the job record
 await f.als.run({ws:'wsdisc7'},async()=>{
  const g=await f.createAgent('Grokbot','Business work','grok',false,{preset:'balanced'});
  await f.bizSourceAdd({kind:'note',title:'N',text:S1});
  const pv=await f.bizDiscoveryDelegatePreview();
  const run=await f.bizDiscoverDelegateRun({delegateHash:pv.body.delegation.hash});
  const disc=run.body.discovery;
  await f.claimTask(g.agent);
  const purge=await f.bizDataPurge({confirm:'DELETE'});
  assert.equal(purge.status,200);
  assert.equal(await f.getJ('fm:biz:disc:'+disc.id),null,'purge removes the scan record');
  assert.equal((await f.r(['LRANGE','fm:biz:discoveries',0,99])||[]).length,0,'purge removes the scan index');
  assert.equal(await f.getJ('fm:task:'+disc.taskId),null,'purge removes the scan job record');
  assert.equal((await f.r(['SMEMBERS','fm:biz:delegated'])||[]).length,0,'purge empties the delegated inventory');
 });

 console.log('biz-discovery-bot-regression: all assertions passed');
})().catch(e=>{console.error(e);process.exit(1);});
