// Managed execution (owner-approved reasoning-engine runs for bot-marked, unassigned
// responsibilities): route-level coverage through the real handlers with a stubbed provider
// fetch and the in-memory store. Approve/review/confirm lifecycle, exact-request binding,
// snapshot invalidation (source/consent/assignment/pause/config), outcome classes
// (known-result, started-unknown, provider-ambiguous, provider-refused, unreadable-200,
// withheld, refused-no-call), kill handling, unresolved-attempt blocking + risk-accepted
// retry, resolve (stuck intent and orphan), generic-cancel refusal, purge subsumption.
// No real network, no real keys.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={bizRespAct,bizConsentAct,bizSourceAdd,bizSourceEdit,bizDataPurge,bizOpCancel,bizState,getJ,setJ,r,als,BIZ};';
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
  return {ok:true,status:200,json:async()=>({choices:[{message:{content:'{"draft":"managed draft text","blocked_step":null,"sources_used":["'+behavior.sid+'"]}'}}],usage:{prompt_tokens:11,completion_tokens:7}})};
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

  // --- eligibility refusals before any approval
  await mkResp('resp_plain',{bot:undefined});
  assert.equal((await f.bizRespAct('resp_plain','managed',{op:'approve-preview'})).body.code,'managed_not_eligible','plain engine-path responsibilities are not managed-eligible');
  await mkResp('resp_res',{research:true});
  assert.equal((await f.bizRespAct('resp_res','managed',{op:'approve-preview'})).body.code,'managed_not_eligible','research responsibilities are not managed-eligible');
  await mkResp('resp_asg',{assignment:{botId:'agent_x',botName:'Grokbot',assignedAt:'t'}});
  assert.equal((await f.bizRespAct('resp_asg','managed',{op:'approve-preview'})).body.code,'managed_assigned','assigned responsibilities refuse: never a substitute');
  assert.equal((await f.bizRespAct(respId,'managed',{op:'review',input:'x'})).body.code,'managed_unapproved','run review requires approval first');

  // --- approve preview/confirm binding
  const pv=await f.bizRespAct(respId,'managed',{op:'approve-preview'});
  assert.equal(pv.status,200);const scopeHash=pv.body.managedPreview.scopeHash;
  assert.equal(pv.body.managedPreview.provider.model,'openai/gpt-oss-120b');
  assert.equal(pv.body.managedPreview.sources.length,1);assert.equal(pv.body.managedPreview.consent.host,'api.groq.com');
  const bad=await f.bizRespAct(respId,'managed',{op:'approve',scopeHash:'bogus'});
  assert.equal(bad.status,409);assert.equal(bad.body.code,'managed_scope_stale');
  assert.equal(await f.r(['GET','fm:biz:mg:'+respId]),null,'a stale approval writes nothing');
  const ap=await f.bizRespAct(respId,'managed',{op:'approve',scopeHash});
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
  assert.equal(await f.r(['GET','fm:biz:op_pending']),null,'intent released');assert.equal(await f.r(['GET','fm:biz:freeze']),null,'lease released');
  assert.equal((await f.r(['SMEMBERS','fm:biz:munres:'+respId])).length,0,'unresolved set empty after terminal settle');
  assert.equal(await f.r(['GET','fm:biz:calls:'+new Date().toISOString().slice(0,10)]),'1','daily counter consumed once');
  const st1=await f.bizState();
  const rp1=st1.responsibilities.find(x=>x.id===respId);
  assert(rp1.managed&&rp1.managed.scopeHash,'state surfaces the managed approval');
  assert.equal(rp1.managedUnresolved,0);assert(rp1.runs.find(x=>x.id===run1.id),'run in state history');

  // --- source edit after approval: the gate refuses BEFORE any provider contact
  await f.bizSourceEdit(sid,{text:'We are open 9 to 5 weekdays. Refunds over $50 need the owner. Weekend email answered Monday.'});
  const rv2=await f.bizRespAct(respId,'managed',{op:'review',input});
  const callsBefore=behavior.calls;
  cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:rv2.body.managedReview.requestHash});
  assert.equal(cf.status,409);assert.equal(cf.body.code,'managed_sources_changed');assert.equal(behavior.calls,callsBefore,'edited source: no provider call');
  // re-approve against the current sources
  const pv2=await f.bizRespAct(respId,'managed',{op:'approve-preview'});
  await f.bizRespAct(respId,'managed',{op:'approve',scopeHash:pv2.body.managedPreview.scopeHash});

  // --- consent withdrawal after approval: refused at the gate
  await f.bizConsentAct(false);
  const rv3=await f.bizRespAct(respId,'managed',{op:'review',input});
  cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:rv3.body.managedReview.requestHash});
  assert.equal(cf.status,409);assert.equal(cf.body.code,'managed_consent_changed');assert.equal(behavior.calls,callsBefore,'withdrawn consent: no provider call');
  await f.bizConsentAct(true,{host:'api.groq.com',model:'openai/gpt-oss-120b'});
  const pv3=await f.bizRespAct(respId,'managed',{op:'approve-preview'});
  await f.bizRespAct(respId,'managed',{op:'approve',scopeHash:pv3.body.managedPreview.scopeHash});

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
  behavior.mode='500';cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:hashH});
  assert.equal(cf.body.managedOutcome.class,'provider-ambiguous');assert.equal(cf.body.managedOutcome.httpStatus,500,'5xx recorded verbatim, never called a rejection');
  behavior.mode='garbage200';cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:hashH});
  assert.equal(cf.body.managedOutcome.class,'unknown');assert.equal(cf.body.managedOutcome.httpStatus,200,'200 without a readable draft is unknown');
  behavior.mode='401';cf=await f.bizRespAct(respId,'managed',{op:'confirm',input,requestHash:hashH});
  assert.equal(cf.body.managedOutcome.class,'provider-refused');assert.equal(cf.body.managedOutcome.billing,'refused-by-provider');
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
  await f.r(['DEL','fm:kill']);

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

  // --- purge subsumes managed state: everything managed leaves with the workspace
  await f.setJ('fm:biz:op_pending',{op:'managed-run',id:respId,token:'tok_stuck3',gen:6,at:new Date().toISOString(),opId:'mrun_stuck3'});
  await f.setJ('fm:biz:matt:mrun_stuck3',{id:'mrun_stuck3',respId,kind:'managed',status:'started',requestHash:'rh_stuck3',token:'tok_stuck3',gen:6,input:'stuck work',provider:{baseUrl:'https://api.groq.com/openai/v1',model:'openai/gpt-oss-120b'},startedAt:new Date().toISOString()});
  await f.r(['SADD','fm:biz:munres:'+respId,'mrun_stuck3']);
  const pg=await f.bizDataPurge({confirm:'DELETE'});
  assert.equal(pg.status,200,'purge completes over a stuck managed run');
  assert(pg.body.counts.managedAttempts>=1,'purge reports managed attempt deletion');
  assert.equal(await f.r(['GET','fm:biz:mg:'+respId]),null);assert.equal(await f.r(['GET','fm:biz:matt:mrun_stuck3']),null);
  assert.equal(await f.r(['GET','fm:biz:munres:'+respId]),null);assert.equal(await f.r(['GET','fm:biz:mattl:'+respId]),null);
  assert.equal(await f.r(['GET','fm:biz:resp:'+respId]),null);

  console.log('biz-managed-regression: ALL CHECKS PASSED');
 }) ;
 process.exit(0);
})().catch(e=>{console.error('FAIL:',e&&e.stack||e);process.exit(1);});
