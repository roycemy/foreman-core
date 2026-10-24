// Managed execution (owner-approved reasoning-engine runs for bot-marked, unassigned
// responsibilities): route-level coverage through the real handlers with a stubbed provider
// fetch and the in-memory store. Approve/review/confirm lifecycle, exact-request binding,
// snapshot invalidation (source/consent/assignment/pause/config), outcome classes
// (known-result, started-unknown, provider-ambiguous - ANY non-200, generic 4xx included,
// unreadable-200, withheld, refused-no-call), kill handling, unknown-effect outcomes KEEPING
// the retry gate until owner resolution, reviewedFp/consent-provider approval binding,
// atomic grant/ungrant, complete-state begin adoption, lost-settle reconciliation (withheld
// included), source-delete snapshot scrubbing, aged-index delete inventory, resolve (stuck
// intent and orphan), generic-cancel refusal, purge subsumption.
// No real network, no real keys.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={bizRespAct,bizConsentAct,bizSourceAdd,bizSourceEdit,bizSourceDel,bizDataPurge,bizOpCancel,bizState,getJ,setJ,r,als,BIZ,sha,bizStable};';
const behavior={mode:'draft'};
const c={require:(m)=>require(m),module:{exports:{}},process:{env:{}},global:{},console,URL,Buffer,AbortSignal,AbortController,setTimeout,clearTimeout,setInterval,clearInterval,
 fetch:async(u,o)=>{
  behavior.calls=(behavior.calls||0)+1;behavior.lastBody=o.body;behavior.lastUrl=u;behavior.lastAuth=o.headers.authorization;
  if(behavior.mode==='throw')throw new Error('socket hang up');
  if(behavior.mode==='kill'){behavior.killSet=true;const {json}=await behavior.setKill();behavior.mode='draft';return json;}
  if(behavior.mode==='500')return {ok:false,status:500,json:async()=>({})};
  if(behavior.mode==='garbage200')return {ok:true,status:200,json:async()=>({choices:[{message:{content:'not json at all'}}]})};
  if(behavior.mode==='401')return {ok:false,status:401,json:async()=>({error:{message:'Invalid API key',type:'auth'}})};
  if(behavior.mode==='slow')await new Promise(r=>setTimeout(r,50));
  return {ok:true,status:200,json:async()=>({choices:[{message:{content:'{"draft":"managed draft text","blocked_step":null,"sources_used":["'+behavior.sid+'"]}'}}],usage:behavior.usageOverride===undefined?{prompt_tokens:11,completion_tokens:7}:behavior.usageOverride})};
 }};
vm.runInNewContext(src,c);const f=c.module.exports.t;

(async()=>{
 c.process.env.ALTER_MODEL_KEY='k';c.process.env.ALTER_MODEL_WS='wsm';
 const sha256=s=>require('crypto').createHash('sha256').update(s).digest('hex');
 await f.als.run({ws:'wsm'},async()=>{
  await f.bizConsentAct(true,{host:'api.groq.com',model:'openai/gpt-oss-120b'});
  const s1=await f.bizSourceAdd({kind:'note',title:'Hours',text:'We are open 9 to 5 weekdays. Refunds over $50 need the owner.'});
  const sid=s1.body.source.id;behavior.sid=sid;
  const mkResp=async(id,extra)=>{const rp={id,title:'Reply desk',summary:'Draft replies to customers',boundary:'Drafts only',status:'active',bot:{id:null,name:'Grokbot'},createdAt:new Date().toISOString(),runsCount:0,...(extra||{})};await f.setJ('fm:biz:resp:'+id,rp);await f.r(['SADD','fm:biz:resps',id]);return rp;};
  const respId='resp_m';await mkResp(respId);
  const resolveAll=async()=>{const rvx=await f.bizRespAct(respId,'managed',{op:'review',input});const set=rvx.body.attemptSet;if(!set)return;const rs=await f.bizRespAct(respId,'managed',{op:'resolve',reviewedSet:set});assert.equal(rs.status,200,'resolve clears: '+set);assert((await f.bizRespAct(respId,'managed',{op:'review',input})).body.attemptSet==='','set clear after resolve');};

  // --- eligibility refusals before any approval
  await mkResp('resp_plain',{bot:undefined});
  assert.equal((await f.bizRespAct('resp_plain','managed',{op:'approve-preview'})).body.code,'managed_not_eligible','plain engine-path responsibilities are not managed-eligible');
  await mkResp('resp_res',{research:true});
  assert.equal((await f.bizRespAct('resp_res','managed',{op:'approve-preview'})).body.code,'managed_not_eligible','research responsibilities are not managed-eligible');
  await mkResp('resp_asg',{assignment:{botId:'agent_x',botName:'Grokbot',assignedAt:'t'}});
  assert.equal((await f.bizRespAct('resp_asg','managed',{op:'approve-preview'})).body.code,'managed_assigned','assigned responsibilities refuse: never a substitute');
  assert.equal((await f.bizRespAct(respId,'managed',{op:'review',input:'x'})).body.code,'managed_unapproved','run review requires approval first');

  // --- consent must name the ACTUAL provider (parsed host + model), not merely exist:
  // a consent recorded under a previous deployment's config never authorizes this one
  const consentGood=await f.r(['GET','fm:biz:consent']);
  await f.r(['SET','fm:biz:consent',JSON.stringify({host:'api.groq.com',model:'some-other-model',at:'2026-10-23T00:00:00Z'})]);
  const cm=await f.bizRespAct(respId,'managed',{op:'approve-preview'});
  assert.equal(cm.status,409);assert.equal(cm.body.code,'engine_consent_mismatch','stale consent for another provider never authorizes this one');
  await f.r(['SET','fm:biz:consent',consentGood]);

  // --- approve preview/confirm binding
  const pv=await f.bizRespAct(respId,'managed',{op:'approve-preview'});
  assert.equal(pv.status,200);const scopeHash=pv.body.managedPreview.scopeHash;
  assert.equal(pv.body.managedPreview.provider.model,'openai/gpt-oss-120b');
  assert.equal(pv.body.managedPreview.sources.length,1);assert.equal(pv.body.managedPreview.consent.host,'api.groq.com');
  const bad=await f.bizRespAct(respId,'managed',{op:'approve',scopeHash:'bogus',reviewedFp:pv.body.managedPreview.reviewedFp});
  assert.equal(bad.status,409);assert.equal(bad.body.code,'managed_scope_stale');
  assert.equal(await f.r(['GET','fm:biz:mg:'+respId]),null,'a stale approval writes nothing');
  assert(pv.body.managedPreview.reviewedFp,'preview carries the reviewed-state fingerprint');
  const nofp=await f.bizRespAct(respId,'managed',{op:'approve',scopeHash});
  assert.equal(nofp.status,409);assert.equal(nofp.body.code,'managed_review_state','approve without the reviewed fingerprint refuses');
  assert.equal(await f.r(['GET','fm:biz:mg:'+respId]),null,'no fingerprint: nothing written');
  const ap=await f.bizRespAct(respId,'managed',{op:'approve',scopeHash,reviewedFp:pv.body.managedPreview.reviewedFp});
  assert.equal(ap.status,200,'approve lands');assert(ap.body.responsibility.managed.grantId,'grant id recorded');
  const snapRaw=await f.r(['GET','fm:biz:mg:'+respId]);assert(snapRaw,'snapshot record stored');
  const snapObj=JSON.parse(snapRaw);
  const srcRaw=await f.r(['GET','fm:biz:src:'+sid]);assert.equal(snapObj.sources[0].raw,srcRaw,'snapshot stores the exact source raw bytes');
  const consentRawNow=await f.r(['GET','fm:biz:consent']);assert.equal(snapObj.consentRaw,consentRawNow,'snapshot stores the exact consent raw bytes');

  // --- per-run review: exact request content
  const input='Draft a reply to a customer asking for a refund.';
  const rv=await f.bizRespAct(respId,'managed',{op:'review',input});
  assert.equal(rv.status,200);const review=rv.body.managedReview;
  assert(review.systemText.includes('Reply desk'),'review shows the exact system text');
  assert(review.systemText.includes('Drafts only'),'owner boundary rides the system text');
  assert.equal(review.sources[0].block,'We are open 9 to 5 weekdays. Refunds over $50 need the owner.','review shows the exact truncated source block');
  assert.equal(review.sources[0].truncated,false);
  assert.equal(review.destination,'https://api.groq.com/openai/v1/chat/completions','exact destination shown');
  assert.equal(review.input,input,'input verbatim');
  assert(/^[0-9a-f]{64}$/.test(review.requestHash),'request hash over the exact body');
  assert.equal(rv.body.attemptSet,'','no unresolved attempts initially');

  // --- confirm without review hash: refused, provider never called
  behavior.calls=0;
  let cf=await f.bizRespAct(respId,'managed',{op:'confirm',input});
  assert.equal(cf.status,409);assert.equal(cf.body.code,'managed_review_required');assert(cf.body.managedReview.requestHash,'refusal carries the review');
  cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:'bogus'});
  assert.equal(cf.status,409);assert.equal(behavior.calls,0,'no provider call without the exact hash');

  // --- happy run: byte-identical reviewed body, known-result, full terminal state
  cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:review.requestHash});
  assert.equal(cf.status,200);assert.equal(cf.body.managedOutcome.class,'known-result');
  assert.equal(behavior.calls,1,'exactly one provider call');
  assert.equal(behavior.lastAuth,'Bearer k');
  const sentBody=JSON.parse(behavior.lastBody);
  assert.equal(sentBody.model,'openai/gpt-oss-120b');assert.equal(sentBody.max_tokens,1800);assert.equal(sentBody.temperature,0.2);
  assert(sentBody.messages[1].content.includes('We are open 9 to 5 weekdays'),'the snapshot source text is what was sent');
  const rebuilt=await f.bizRespAct(respId,'managed',{op:'review',input});
  assert.equal(sha256(behavior.lastBody),review.requestHash,'the bytes sent hash to the reviewed request hash');
  const run1=cf.body.managedOutcome.run;
  assert.equal(run1.status,'done');assert.equal(run1.output,'managed draft text');assert.equal(run1.backend,'managed-engine');
  assert.deepEqual(run1.sourcesUsed,[sid]);assert(run1.usage&&run1.usage.promptTokens===11,'usage from the response');
  const att1=await f.getJ('fm:biz:matt:'+cf.body.managedOutcome.attemptId);
  assert.equal(att1.status,'known-result');assert(att1.receipt,'terminal receipt recorded');assert.equal(att1.requestHash,review.requestHash);
  // the receipt binds the canonical WHOLE landed payload: terminal record (minus the receipt
  // field), the complete run record, and the complete audit entry - any provenance change is
  // a different receipt
  const runRec1=await f.getJ('fm:biz:run:'+run1.id);
  const logEntry1=(await f.r(['LRANGE','fm:biz:log',0,49])).map(x=>JSON.parse(x)).find(x=>x.attemptId===att1.id);
  const termCore1={...att1};delete termCore1.receipt;
  assert.equal(att1.receipt,f.sha(f.bizStable({term:termCore1,run:runRec1,log:logEntry1})),'receipt binds the whole terminal+run+log payload');
  assert.notEqual(att1.receipt,f.sha(f.bizStable({term:termCore1,run:{...runRec1,blockedStep:'tampered'},log:logEntry1})),'different run provenance never reconciles as the same landing');
  assert.notEqual(att1.receipt,f.sha(f.bizStable({term:termCore1,run:runRec1,log:{...logEntry1,model:'other-model'}})),'different audit provenance never reconciles as the same landing');
  assert.equal(await f.r(['GET','fm:biz:op_pending']),null,'intent released');assert.equal(await f.r(['GET','fm:biz:freeze']),null,'lease released');
  assert.equal((await f.r(['SMEMBERS','fm:biz:munres:'+respId])).length,0,'unresolved set empty after terminal settle');
  assert.equal(await f.r(['GET','fm:biz:calls:'+new Date().toISOString().slice(0,10)]),'1','daily counter consumed once');
  const st1=await f.bizState();
  const rp1=st1.responsibilities.find(x=>x.id===respId);
  assert(rp1.managed&&rp1.managed.scopeHash,'state surfaces the managed approval');
  assert.equal(rp1.managedUnresolved,0);assert(rp1.runs.find(x=>x.id===run1.id),'run in state history');

  // --- managed usage provenance is EXACT: missing or partial usage stays null, never zeros
  behavior.usageOverride=null;
  let rvU=await f.bizRespAct(respId,'managed',{op:'review',input});
  cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:rvU.body.managedReview.requestHash});
  assert.equal(cf.status,200);
  assert.strictEqual(cf.body.managedOutcome.run.usage,null,'absent usage object stays null');
  assert.strictEqual((await f.getJ('fm:biz:matt:'+cf.body.managedOutcome.attemptId)).usage,null,'attempt usage stays null');
  behavior.usageOverride={prompt_tokens:5};
  rvU=await f.bizRespAct(respId,'managed',{op:'review',input});
  cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:rvU.body.managedReview.requestHash});
  assert.equal(cf.status,200);
  assert.deepEqual(cf.body.managedOutcome.run.usage,{promptTokens:5,completionTokens:null},'partial usage keeps the missing field null');
  behavior.usageOverride=undefined;

  // --- source edit after approval: the gate refuses BEFORE any provider contact
  await f.bizSourceEdit(sid,{text:'We are open 9 to 5 weekdays. Refunds over $50 need the owner. Weekend email answered Monday.'});
  const rv2=await f.bizRespAct(respId,'managed',{op:'review',input});
  const callsBefore=behavior.calls;
  cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:rv2.body.managedReview.requestHash});
  assert.equal(cf.status,409);assert.equal(cf.body.code,'managed_sources_changed');assert.equal(behavior.calls,callsBefore,'edited source: no provider call');
  // re-approve against the current sources
  const pv2=await f.bizRespAct(respId,'managed',{op:'approve-preview'});
  await f.bizRespAct(respId,'managed',{op:'approve',scopeHash:pv2.body.managedPreview.scopeHash,reviewedFp:pv2.body.managedPreview.reviewedFp});

  // --- consent withdrawal after approval: refused at the gate
  await f.bizConsentAct(false);
  const rv3=await f.bizRespAct(respId,'managed',{op:'review',input});
  cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:rv3.body.managedReview.requestHash});
  assert.equal(cf.status,409);assert.equal(cf.body.code,'managed_consent_changed');assert.equal(behavior.calls,callsBefore,'withdrawn consent: no provider call');
  await f.bizConsentAct(true,{host:'api.groq.com',model:'openai/gpt-oss-120b'});
  const pv3=await f.bizRespAct(respId,'managed',{op:'approve-preview'});
  await f.bizRespAct(respId,'managed',{op:'approve',scopeHash:pv3.body.managedPreview.scopeHash,reviewedFp:pv3.body.managedPreview.reviewedFp});

  // --- provider config change: refused before the gate (per-deployment truthfulness)
  c.process.env.ALTER_MODEL_NAME='other-model';
  const rv4=await f.bizRespAct(respId,'managed',{op:'review',input});
  cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:rv4.body.managedReview.requestHash});
  assert.equal(cf.status,409);assert.equal(cf.body.code,'managed_config_changed');assert.equal(behavior.calls,callsBefore,'config change: no provider call');
  delete c.process.env.ALTER_MODEL_NAME;

  // --- outcome classes
  const rvH=await f.bizRespAct(respId,'managed',{op:'review',input});
  const hashH=rvH.body.managedReview.requestHash;
  behavior.mode='throw';cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:hashH});
  assert.equal(cf.body.managedOutcome.class,'started-unknown');assert.equal(cf.body.managedOutcome.billing,'unknown-possible','a thrown fetch is honestly unknown');
  assert.equal(cf.body.managedOutcome.run.status,'unknown');assert.equal(cf.body.managedOutcome.run.output,null,'no result saved');
  assert(cf.body.managedOutcome.message.includes('blocks new runs'),'the unknown outcome names the retry gate');
  // the reviewer's duplicate-billing repro: an unreviewed retry after an unknown outcome must
  // NOT make a second provider call
  assert.equal((await f.r(['SMEMBERS','fm:biz:munres:'+respId])).length,1,'unknown outcome KEEPS the attempt in the retry gate');
  const callsU=behavior.calls;
  const dup=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:hashH});
  assert.equal(dup.status,409);assert.equal(dup.body.code,'managed_attempt_review','unreviewed unknown outcome blocks the retry');
  assert.equal(behavior.calls,callsU,'NO second provider call without reviewed risk acceptance');
  await resolveAll();
  behavior.mode='500';cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:hashH});
  assert.equal(cf.body.managedOutcome.class,'provider-ambiguous');assert.equal(cf.body.managedOutcome.httpStatus,500,'5xx recorded verbatim, never called a rejection');
  assert.equal((await f.r(['SMEMBERS','fm:biz:munres:'+respId])).length,1,'ambiguous outcome keeps the gate');
  await resolveAll();
  behavior.mode='garbage200';cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:hashH});
  assert.equal(cf.body.managedOutcome.class,'unknown');assert.equal(cf.body.managedOutcome.httpStatus,200,'200 without a readable draft is unknown');
  assert.equal((await f.r(['SMEMBERS','fm:biz:munres:'+respId])).length,1,'unreadable 200 keeps the gate');
  await resolveAll();
  behavior.mode='401';cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:hashH});
  assert.equal(cf.body.managedOutcome.class,'provider-ambiguous','a generic 4xx is NOT a definitive refusal');
  assert.equal(cf.body.managedOutcome.billing,'unknown-possible','4xx billing stays honestly unknown');
  assert(cf.body.managedOutcome.message.includes('does not prove'),'4xx copy keeps the uncertainty');
  assert.equal((await f.r(['SMEMBERS','fm:biz:munres:'+respId])).length,1,'4xx keeps the gate');
  await resolveAll();
  behavior.mode='draft';

  // --- kill switch: before the run, and racing the flight (withheld, draft never persisted)
  await f.setJ('fm:kill',{at:new Date().toISOString()});
  cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:hashH});
  assert.equal(cf.status,403,'kill before the run refuses');
  await f.r(['DEL','fm:kill']);
  behavior.setKill=async()=>{await f.setJ('fm:kill',{at:new Date().toISOString()});return {json:{ok:true,status:200,json:async()=>({choices:[{message:{content:'{"draft":"WITHHELD-DRAFT-MARKER","blocked_step":null,"sources_used":[]}'}}]})}};};
  behavior.mode='kill';
  cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:hashH});
  assert.equal(cf.body.managedOutcome.class,'withheld','kill racing the flight withholds the result');
  assert.equal(cf.body.managedOutcome.billing,'unknown-possible');
  const keys=await f.r(['KEYS','fm:biz:*']);
  for(const k of keys){const v=await f.r(['GET',k]).catch(()=>null);if(typeof v==='string')assert(!v.includes('WITHHELD-DRAFT-MARKER'),'withheld draft never persisted ('+k+')');}
  const attW=await f.getJ('fm:biz:matt:'+cf.body.managedOutcome.attemptId);
  assert.equal(attW.status,'withheld');
  const logHeadW=JSON.parse((await f.r(['LRANGE','fm:biz:log',0,0]))[0]);
  assert.equal(logHeadW.outcome,'withheld','a kill logs the withheld audit entry, never the supplied known-result outcome');
  assert.strictEqual(logHeadW.model,null);assert.strictEqual(logHeadW.usage,null);
  assert(!JSON.stringify(logHeadW).includes('WITHHELD-DRAFT-MARKER'),'the withheld audit entry carries no result provenance');
  assert((await f.r(['SMEMBERS','fm:biz:munres:'+respId])).includes(cf.body.managedOutcome.attemptId),'withheld KEEPS the retry gate until reviewed');
  // lost settle response reconciled by the read path: the withheld outcome is PRESERVED -
  // the response must not answer with the withheld output
  await f.r(['DEL','fm:kill']); // clear the first flight's kill; the hooked flight sets it again
  const rvW=await f.bizRespAct(respId,'managed',{op:'review',input});
  c.global.__bizManagedSettleLoseOnce=true;behavior.mode='kill';
  cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:hashH,attemptSet:rvW.body.attemptSet,acceptDuplicateRisk:true});
  assert.equal(cf.body.managedOutcome.class,'withheld','lost withheld settle still answers withheld, never the output');
  assert(!cf.body.managedOutcome.run,'no run record is exposed on a withheld landing');
  assert(!JSON.stringify(cf.body).includes('WITHHELD-DRAFT-MARKER'),'withheld text never reaches the response');
  await f.r(['DEL','fm:kill']);
  await resolveAll();
  // lost settle response on a clean landing: reconcile adopts the landed record exactly
  c.global.__bizManagedSettleLoseOnce=true;
  cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:hashH});
  assert.equal(cf.status,200);assert.equal(cf.body.managedOutcome.class,'known-result','lost clean settle reconciles to the landed result');
  assert.equal(cf.body.managedOutcome.run.output,'managed draft text');
  assert.equal((await f.r(['SMEMBERS','fm:biz:munres:'+respId])).length,0,'clean landing leaves the gate clear');

  // --- stuck-attempt blocking + explicit risk-accepted retry
  await f.setJ('fm:biz:matt:mrun_stuck1',{id:'mrun_stuck1',respId,kind:'managed',status:'started',requestHash:'rh_stuck1',token:'tok_dead',gen:9,input:'older work',provider:{baseUrl:'https://api.groq.com/openai/v1',model:'openai/gpt-oss-120b'},startedAt:new Date().toISOString()});
  await f.r(['SADD','fm:biz:munres:'+respId,'mrun_stuck1']);
  cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:hashH});
  assert.equal(cf.status,409);assert.equal(cf.body.code,'managed_attempt_review','unreviewed unknown attempts block new runs');
  assert.equal(cf.body.unresolved[0].id,'mrun_stuck1');assert.equal(cf.body.attemptSet,'mrun_stuck1:rh_stuck1');
  cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:hashH,attemptSet:'mrun_stuck1:rh_stuck1'});
  assert.equal(cf.status,409);assert.equal(cf.body.code,'managed_duplicate_risk','the retry names the duplicate processing/billing risk');
  assert(cf.body.error.includes('SECOND charge'),'risk copy is explicit about a second charge');
  const callsPre=behavior.calls;
  cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:hashH,attemptSet:'mrun_stuck1:rh_stuck1',acceptDuplicateRisk:true});
  assert.equal(cf.status,200,'explicit risk acceptance + exact attempt-set binding proceeds');
  assert.equal(behavior.calls,callsPre+1,'exactly one new provider call');

  // --- resolve: wrong reviewed set, then acknowledged (orphan mode - intent already gone)
  let rs=await f.bizRespAct(respId,'managed',{op:'resolve',reviewedSet:'wrong'});
  assert.equal(rs.status,409);assert.equal(rs.body.code,'managed_resolve_stale');
  rs=await f.bizRespAct(respId,'managed',{op:'resolve',reviewedSet:'mrun_stuck1:rh_stuck1'});
  assert.equal(rs.status,200);assert.equal(rs.body.resolved,1);
  assert(rs.body.note.includes('may still have processed and billed'),'the acknowledgment keeps the billing warning');
  assert.equal((await f.getJ('fm:biz:matt:mrun_stuck1')).status,'acknowledged-unknown');
  assert((await f.bizRespAct(respId,'managed',{op:'review',input})).body.attemptSet==='','set clear after resolve');

  // --- generic cancel route refuses a managed intent (server-side, any caller)
  await f.setJ('fm:biz:op_pending',{op:'managed-run',id:respId,token:'tok_stuck2',gen:5,at:new Date().toISOString(),opId:'mrun_stuck2'});
  const cx=await f.bizOpCancel({op:'managed-run',id:respId,opId:'mrun_stuck2'});
  assert.equal(cx.status,409);assert.equal(cx.body.code,'managed_cancel_refused');
  assert((await f.getJ('fm:biz:op_pending')).opId==='mrun_stuck2','the managed intent survives a generic cancel');
  // resolve with the stuck intent present (no lease: expired) - token binding path
  await f.setJ('fm:biz:matt:mrun_stuck2',{id:'mrun_stuck2',respId,kind:'managed',status:'started',requestHash:'rh_stuck2',token:'tok_stuck2',gen:5,input:'stuck work',provider:{baseUrl:'https://api.groq.com/openai/v1',model:'openai/gpt-oss-120b'},startedAt:new Date().toISOString()});
  await f.r(['SADD','fm:biz:munres:'+respId,'mrun_stuck2']);
  rs=await f.bizRespAct(respId,'managed',{op:'resolve',reviewedSet:'mrun_stuck2:rh_stuck2'});
  if(rs.status!==200)console.error('RESOLVE BODY',JSON.stringify(rs.body),'pend',JSON.stringify(await f.getJ('fm:biz:op_pending')),'freeze',await f.r(['GET','fm:biz:freeze']));
  assert.equal(rs.status,200,'stuck-intent resolve lands');assert.equal(await f.r(['GET','fm:biz:op_pending']),null,'stuck intent cleared');
  assert.equal((await f.getJ('fm:biz:matt:mrun_stuck2')).status,'acknowledged-unknown');

  // --- lost begin response: adopt ONLY the complete durable transition
  c.global.__bizManagedBeginLoseOnce=true;
  cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:hashH});
  assert.equal(cf.status,200);assert.equal(cf.body.managedOutcome.class,'known-result','complete landed begin is adopted and runs');
  const attA=await f.getJ('fm:biz:matt:'+cf.body.managedOutcome.attemptId);
  assert.equal(String(attA.gen),await f.r(['GET','fm:biz:fence']),'adopted generation is the fence generation');
  // a partial transition is never equated with a successful begin: no adoption, no fetch
  c.global.__bizManagedBeginLoseOnce=async()=>{const p=await f.getJ('fm:biz:op_pending');await f.r(['DEL','fm:biz:matt:'+p.opId]);};
  const callsB=behavior.calls;
  cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:hashH});
  assert.equal(cf.status,503);assert.equal(cf.body.code,'managed_begin_unknown','incomplete begin state refuses adoption');
  assert.equal(behavior.calls,callsB,'ambiguous begin: NO provider contact');
  const pS=await f.getJ('fm:biz:op_pending');
  await f.r(['SREM','fm:biz:munres:'+respId,pS.opId]);await f.r(['DEL','fm:biz:op_pending']);await f.r(['DEL','fm:biz:freeze']);

  // --- source delete scrubs managed snapshots (verbatim raw copies leave with the source)
  await mkResp('resp_s');
  const pvs=await f.bizRespAct('resp_s','managed',{op:'approve-preview'});
  const aps=await f.bizRespAct('resp_s','managed',{op:'approve',scopeHash:pvs.body.managedPreview.scopeHash,reviewedFp:pvs.body.managedPreview.reviewedFp});
  assert.equal(aps.status,200);
  assert((await f.r(['GET','fm:biz:mg:resp_s'])).includes('Refunds over $50 need the owner'),'snapshot holds a verbatim source copy before delete');
  const dl=await f.bizSourceDel(sid,{});
  assert.equal(dl.status,200);assert(dl.body.managedScrubbed>=1,'source delete scrubs managed snapshots: '+JSON.stringify(dl.body));
  assert.equal(await f.r(['GET','fm:biz:mg:resp_s']),null,'the verbatim copy leaves with the source');
  assert.equal(await f.r(['GET','fm:biz:mg:'+respId]),null,'every affected snapshot is scrubbed');
  const rvS=await f.bizRespAct('resp_s','managed',{op:'review',input});
  assert.equal(rvS.status,409);assert.equal(rvS.body.code,'managed_snapshot_missing','scrubbed grant refuses until re-approval');

  // --- responsibility delete: attempts aged out of the 50-entry index still leave
  await mkResp('resp_d');
  const pvd=await f.bizRespAct('resp_d','managed',{op:'approve-preview'});
  await f.bizRespAct('resp_d','managed',{op:'approve',scopeHash:pvd.body.managedPreview.scopeHash,reviewedFp:pvd.body.managedPreview.reviewedFp});
  const rvd=await f.bizRespAct('resp_d','managed',{op:'review',input});
  const cfd=await f.bizRespAct(respId==='resp_d'?'resp_d':'resp_d','managed',{op:'confirm',input,requestHash:rvd.body.managedReview.requestHash});
  assert.equal(cfd.status,200,'run with zero bound sources proceeds');
  const attD=cfd.body.managedOutcome.attemptId;
  assert((await f.r(['SMEMBERS','fm:biz:matts:resp_d'])||[]).includes(attD),'durable attempt inventory carries the attempt');
  await f.r(['DEL','fm:biz:mattl:resp_d']); // simulate aging beyond the trimmed display index
  const dd=await f.bizRespAct('resp_d','delete',{});
  assert.equal(dd.status,200,'responsibility delete completes');
  assert.equal(await f.r(['GET','fm:biz:matt:'+attD]),null,'attempt aged out of the index is still deleted');
  assert.equal(await f.r(['GET','fm:biz:matts:resp_d']),null,'durable inventory deleted');
  assert.equal(await f.r(['GET','fm:biz:mg:resp_d']),null);

  // --- purge subsumes managed state: everything managed leaves with the workspace
  await f.setJ('fm:biz:op_pending',{op:'managed-run',id:respId,token:'tok_stuck3',gen:6,at:new Date().toISOString(),opId:'mrun_stuck3'});
  await f.setJ('fm:biz:matt:mrun_stuck3',{id:'mrun_stuck3',respId,kind:'managed',status:'started',requestHash:'rh_stuck3',token:'tok_stuck3',gen:6,input:'stuck work',provider:{baseUrl:'https://api.groq.com/openai/v1',model:'openai/gpt-oss-120b'},startedAt:new Date().toISOString()});
  await f.r(['SADD','fm:biz:munres:'+respId,'mrun_stuck3']);
  const pg=await f.bizDataPurge({confirm:'DELETE'});
  assert.equal(pg.status,200,'purge completes over a stuck managed run');
  assert(pg.body.counts.managedAttempts>=1,'purge reports managed attempt deletion');
  assert.equal(await f.r(['GET','fm:biz:mg:'+respId]),null);assert.equal(await f.r(['GET','fm:biz:matt:mrun_stuck3']),null);
  assert.equal(await f.r(['GET','fm:biz:munres:'+respId]),null);assert.equal(await f.r(['GET','fm:biz:mattl:'+respId]),null);
  assert.equal(await f.r(['GET','fm:biz:matts:'+respId]),null,'durable attempt inventory purged');
  assert.equal(await f.r(['GET','fm:biz:resp:'+respId]),null);

  console.log('biz-managed-regression: ALL CHECKS PASSED');
 }) ;
 process.exit(0);
})().catch(e=>{console.error('FAIL:',e&&e.stack||e);process.exit(1);});
