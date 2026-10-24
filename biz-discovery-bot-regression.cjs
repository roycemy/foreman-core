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
// a real connection proof: delegation eligibility is connected-only
const connect=async(f,ag)=>{const a=await f.getJ('fm:agent:'+ag.agent.id);a.connectionMode='gateway';await f.setJ('fm:agent:'+ag.agent.id,a);await f.setJ('fm:gatewaySeen:'+ag.agent.id,{epoch:a.oauthEpoch||0,seenAt:new Date().toISOString()});};
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={bizSourceAdd,bizSourceEdit,bizSourceDel,bizProposalAct,bizRespAct,bizDailyTick,bizDataPurge,bizState,bizDiscoveryDelegatePreview,bizDiscoverDelegateRun,bizDiscoverPayload,bizSettleDiscovery,bizMakeProposals,bizProposals,bizSources,createAgent,claimTask,completeTask,stopTask,newTask,listTasks,setJ,getJ,r,als};';
const c={require:(m)=>require(m),module:{exports:{}},process:{env:{}},global:{},console,URL,Buffer,AbortSignal,setTimeout,clearTimeout,
 fetch:(u,o)=>{throw new Error('the bot discovery path must never call the engine or any network: '+u);}};
vm.runInNewContext(src,c);const f=c.module.exports.t;

const S1='We answer every customer email within a day. Refunds over $50 need Royce.';
const S2='We send 15 to 20 estimates a month and nobody follows up unless the customer calls back.';

(async()=>{
 await f.als.run({ws:'wsdisc'},async()=>{
  const g=await f.createAgent('Grokbot','Business work','grok',false,{preset:'balanced'});await connect(f,g);
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
  const g=await f.createAgent('Grokbot','Business work','grok',false,{preset:'balanced'});await connect(f,g);
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
  const g=await f.createAgent('Grokbot','Business work','grok',false,{preset:'balanced'});await connect(f,g);
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
  assert.equal(d.droppedProposals,1,'a proposal whose only quote went stale is dropped, not kept on its summary');
  assert(d.note&&d.note.includes('dropped'),'the note says unsupported ideas are dropped');
  // Grounded or dropped: no proposal survives on its summary with zero verified quotes.
  const props3=await f.bizProposals();
  assert.equal(props3.length,0,'the stale quote and its proposal never reach the owner');
 });

 // --- bot gone between review and run: explicit refusal, no silent destination switch
 await f.als.run({ws:'wsdisc4'},async()=>{
  const g=await f.createAgent('Grokbot','Business work','grok',false,{preset:'balanced'});await connect(f,g);
  await f.bizSourceAdd({kind:'note',title:'N',text:S1});
  const pv=await f.bizDiscoveryDelegatePreview();
  const ag=await f.getJ('fm:agent:'+g.agent.id);ag.paused=true;await f.setJ('fm:agent:'+g.agent.id,ag);
  const run=await f.bizDiscoverDelegateRun({delegateHash:pv.body.delegation.hash});
  assert.equal(run.status,409);assert.equal(run.body.code,'delegate_bot_gone');
  assert.equal((await f.listTasks()).filter(t=>t.biz).length,0,'no job created for a gone destination');
 });

 // --- final-flip race: a delete winning after the fenced writes refuses, never a false sent
 await f.als.run({ws:'wsdisc5'},async()=>{
  await connect(f,await f.createAgent('Grokbot','Business work','grok',false,{preset:'balanced'}));
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
  const g=await f.createAgent('Grokbot','Business work','grok',false,{preset:'balanced'});await connect(f,g);
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
  const g=await f.createAgent('Grokbot','Business work','grok',false,{preset:'balanced'});await connect(f,g);
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

 // --- whitespace-only excerpts never "match"; evidence must come from the REVIEWED
 // snapshot (reviewed ids at unchanged current versions), and summary-only proposals drop
 await f.als.run({ws:'wsdisc8'},async()=>{
  const g=await f.createAgent('Grokbot','Business work','grok',false,{preset:'balanced'});await connect(f,g);
  const s1=(await f.bizSourceAdd({kind:'note',title:'N1',text:S1})).body.source;
  const pv=await f.bizDiscoveryDelegatePreview();
  const run=await f.bizDiscoverDelegateRun({delegateHash:pv.body.delegation.hash});
  const disc=run.body.discovery;
  await f.claimTask(g.agent);
  // a source added AFTER the reviewed scan payload is outside the reviewed snapshot
  const s2=(await f.bizSourceAdd({kind:'note',title:'N2',text:S2})).body.source;
  await f.completeTask(g.agent,disc.taskId,{status:'done',result:JSON.stringify({proposals:[
    {title:'Reply desk',summary:'Draft replies.',evidence:[
      {sourceId:s1.id,excerpt:'          '}, // 10 spaces: passes the raw length gate, normalizes to empty
      {sourceId:s1.id,excerpt:'We answer every customer email within a day'}],unknowns:[],systems:[],boundary:'Drafts only.'},
    {title:'Estimate chase',summary:'Chase estimates.',evidence:[
      {sourceId:s2.id,excerpt:'nobody follows up unless the customer calls back'}],unknowns:[],systems:[],boundary:'Drafts only.'}]})});
  const d=await f.getJ('fm:biz:disc:'+disc.id);
  assert.equal(d.status,'done');
  assert.equal(d.proposals,1,'only the proposal with reviewed-snapshot evidence survives');
  assert.equal(d.droppedEvidence,2,'whitespace-only and post-scan-source quotes both dropped');
  assert.equal(d.droppedProposals,1,'the proposal grounded only in the unreviewed source is dropped');
  const props=await f.bizProposals();
  assert.equal(props.length,1);
  assert.equal(props[0].evidence.length,1,'the whitespace excerpt never validated');
  assert.equal(props[0].evidence[0].excerpt,'We answer every customer email within a day');
 });

 // --- edited-since-scan source cannot ground a proposal even when the quote matches the
 // NEW text: validation never poses a changed source as the reviewed one
 await f.als.run({ws:'wsdisc9'},async()=>{
  const g=await f.createAgent('Grokbot','Business work','grok',false,{preset:'balanced'});await connect(f,g);
  const s=(await f.bizSourceAdd({kind:'note',title:'N',text:S1})).body.source;
  const pv=await f.bizDiscoveryDelegatePreview();
  const run=await f.bizDiscoverDelegateRun({delegateHash:pv.body.delegation.hash});
  const disc=run.body.discovery;
  await f.claimTask(g.agent);
  await f.bizSourceEdit(s.id,{text:'Completely replaced content about something else entirely now.'});
  await f.completeTask(g.agent,disc.taskId,{status:'done',result:JSON.stringify({proposals:[
    {title:'New-text desk',summary:'From the new text.',evidence:[{sourceId:s.id,excerpt:'Completely replaced content about something else'}],unknowns:[],systems:[],boundary:'Drafts only.'}]})});
  const d=await f.getJ('fm:biz:disc:'+disc.id);
  assert.equal(d.status,'done');
  assert.equal(d.proposals,0,'a quote matching only the POST-scan text cannot ground a proposal');
  assert.equal(d.droppedProposals,1);
  assert.equal((await f.bizProposals()).length,0);
 });

 // --- daily tick in a MIXED engine-consented registered workspace: the bot-mapped
 // responsibility is skipped, the engine-mapped one runs, and no manual run on the
 // bot-mapped responsibility ever falls back to the engine
 await f.als.run({ws:'wsdisc10'},async()=>{
  c.process.env.ALTER_MODEL_KEY='test-key';c.process.env.ALTER_MODEL_WS='wsdisc10';
  await f.setJ('fm:biz:consent',{host:'api.groq.com',model:'openai/gpt-oss-120b',at:'now'});
  const srcE={id:'src_e10',kind:'note',title:'E',text:'Engine source text with enough words.',version:1,createdAt:'now',updatedAt:'now'};
  await f.setJ('fm:biz:src:'+srcE.id,srcE);await f.r(['SADD','fm:biz:sources',srcE.id]);
  const f0=String((await f.r(['EVAL','if redis.call(\'EXISTS\',KEYS[2])==1 then return {\'held\'} end; if redis.call(\'EXISTS\',KEYS[3])==1 then return {\'pending\'} end; return {\'ok\', redis.call(\'GET\',KEYS[1]) or \'0\'}',3,'fm:biz:fence','fm:biz:freeze','fm:biz:op_pending']))[1]);
  const mk=async(prov,title)=>(await f.bizMakeProposals({proposals:[{title,summary:'S.',evidence:[{sourceId:'src_e10',excerpt:'Engine source text with enough words'}],unknowns:[],systems:[],boundary:'Drafts only.'}]},[srcE],prov,f0,4)).made[0];
  const engProp=await mk({engine:{model:'test-model',at:'now'}},'Engine desk');
  const botProp=await mk({bot:{id:'agent_gone',name:'Grokbot',viaScan:'disc_x',at:'now'}},'Bot desk');
  const engResp=(await f.bizProposalAct(engProp.id,'activate',{})).body.responsibility;
  const botResp=(await f.bizProposalAct(botProp.id,'activate',{})).body.responsibility;
  assert(botResp.bot&&botResp.bot.name==='Grokbot','the bot/manual-only marker persists on the responsibility');
  assert((await f.r(['SMEMBERS','gl:biz:workspaces'])||[]).includes('wsdisc10'),'the workspace is engine-registered (mixed state)');
  // engine mock: count calls, answer the run prompt
  let engineCalls=0;
  const realThrow=c.fetch;
  c.fetch=async(u,o)=>{engineCalls++;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({draft:'Draft: daily note',blocked_step:null,sources_used:['src_e10']})}}],usage:{prompt_tokens:1,completion_tokens:1}})};};
  const tick=await f.bizDailyTick();
  assert.equal(tick.status,200);
  assert.equal(tick.body.runs,1,'exactly one daily run: the engine-mapped responsibility');
  assert(tick.body.skipped>=1,'the bot-mapped responsibility is skipped, not engine-run');
  const st=await f.bizState();
  const botDaily=(st.responsibilities.find(x=>x.id===botResp.id).runs||[]).filter(x=>x.kind==='daily');
  assert.equal(botDaily.length,0,'no daily engine run recorded for the bot-mapped responsibility');
  assert((st.responsibilities.find(x=>x.id===engResp.id).runs||[]).some(x=>x.kind==='daily'),'the engine-mapped responsibility still gets its daily run');
  // manual run on the bot-mapped responsibility with its bot disconnected: refusal, no fallback
  const before=engineCalls;
  const mr=await f.bizRespAct(botResp.id,'run',{input:'Draft something.'});
  assert.equal(mr.status,409);assert.equal(mr.body.code,'delegate_bot_gone');
  assert(mr.body.error.includes('never substituted'),'the refusal says the engine is never substituted');
  assert.equal(engineCalls,before,'no engine call from the refused manual run');
  const ctrl=await f.bizRespAct(engResp.id,'run',{input:'Draft something.'});
  assert.equal(ctrl.status,200,'the engine-mapped responsibility still runs manually (control)');
  assert(engineCalls>before,'the control manual run did reach the engine');
  c.fetch=realThrow;
  delete c.process.env.ALTER_MODEL_KEY;delete c.process.env.ALTER_MODEL_WS;
 });

 // --- a legacy proposal with no checked quote cannot be activated as grounded work
 await f.als.run({ws:'wsdisc11'},async()=>{
  const legacy={id:'prop_legacy',title:'Old desk',summary:'Pre-rule record.',evidence:[],unknowns:[],systems:[],boundary:'Drafts only.',status:'draft',sourceMap:{},createdAt:'now',editedByOwner:false};
  await f.setJ('fm:biz:prop:'+legacy.id,legacy);await f.r(['SADD','fm:biz:proposals',legacy.id]);
  const act=await f.bizProposalAct(legacy.id,'activate',{});
  assert.equal(act.status,409);assert.equal(act.body.code,'ungrounded_proposal');
 });

 console.log('biz-discovery-bot-regression: all assertions passed');
})().catch(e=>{console.error(e);process.exit(1);});
