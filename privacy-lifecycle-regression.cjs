// Privacy repair round 2: reviewer reproductions for PR #116 HOLD.
//  1. Orphaned run objects (fell out of the trimmed index) are deleted by resp delete AND purge.
//  2. A paused in-flight run/discover cannot recreate records after a successful purge (fence).
//  3. Partial failures: source delete and purge report a truthful incomplete state; retry finishes.
//  4. IPv6 loopback/private, internal DNS suffixes and redirects are refused for the engine.
// No real network: model endpoint stubbed with a controllable deferred fetch.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
let src=fs.readFileSync('api/index.js','utf8');
if(process.env.TDBG){src=src.replace("async function bizSourceDel(id) {","async function bizSourceDel(id) { console.error('SD enter',id);").replace("for (const p of await bizProposals()) {","console.error('SD pre-props'); for (const p of await bizProposals()) {").replace("stage = 'record';","console.error('SD record'); stage = 'record';").replace("const committed = await bizOpCommit(ctx, 'source_deleted'","console.error('SD pre-commit'); const committed = await bizOpCommit(ctx, 'source_deleted'");}
src+='\nmodule.exports.t={bizSourceAdd,bizSourceDel,bizDiscover,bizProposalAct,bizRespAct,bizDataPurge,bizConsentAct,bizState,bizEngine,bizRunKeysAll,bizSourceScrubbers,bizOpCancel,bizDailyTick,bizEntry,bizLog,als,setJ,getJ,r};';
let gate=null; // {promise,open} - when set, the stubbed provider call waits for open()
const seen=[];
const c={require,module:{exports:{}},process:{env:{}},global:{},console,URL,Buffer,AbortSignal,setTimeout,clearTimeout,
 fetch:(u,o)=>{seen.push(String(u));
  const respond=()=>{const body=JSON.parse(o.body);
   const reply=content=>({ok:true,status:200,json:async()=>({choices:[{message:{content}}],usage:{}})});
   if(c.process.env.REDIRECT_ONCE){delete c.process.env.REDIRECT_ONCE;return {ok:false,status:302,json:async()=>({})};}
   if(/propose areas of responsibility/i.test(body.messages[0].content)) return reply(JSON.stringify({proposals:[{title:'Reply desk',summary:'Draft replies.',evidence:[{sourceId:c.process.env.__s1,excerpt:'answer customer emails within a day'}],unknowns:[],systems:[],boundary:'Drafts only.'}]}));
   return reply(JSON.stringify({draft:'d',blocked_step:null,sources_used:[]}));};
  if(gate){const g=gate;return g.promise.then(respond);}
  return Promise.resolve(respond());}};
vm.runInNewContext(src,c);const f=c.module.exports.t;
const consent=()=>f.bizConsentAct(true,{host:'api.groq.com',model:'openai/gpt-oss-120b'});
(async()=>{
 c.process.env.ALTER_MODEL_KEY='k';c.process.env.ALTER_MODEL_WS='legacy';
 await consent();
 const s1=(await f.bizSourceAdd({kind:'note',title:'Replies',text:'We answer customer emails within a day.'})).body.source.id;
 c.process.env.__s1=s1;
 const p=(await f.bizDiscover()).body.proposals[0];
 const respId=(await f.bizProposalAct(p.id,'activate',{})).body.responsibility.id;

 // --- 1a) index overflow: the 51st run drops the oldest OBJECT, not just the id
 for(let i=0;i<51;i++) await f.bizRespAct(respId,'run',{input:'work '+i});
 let idx=await f.r(['LRANGE','fm:biz:runs:'+respId,0,60]);
 assert.equal(idx.length,50,'index trimmed to RUNS_KEEP');
 let keys=await f.bizRunKeysAll();
 assert.equal(keys.length,50,'run objects bounded to the index - no orphans accumulate');

 // --- 1b) pre-existing orphan (predating the bound) is still collected by resp delete
 await f.setJ('fm:biz:run:run_orphan9',{id:'run_orphan9',respId,kind:'manual',at:new Date().toISOString(),input:'old',output:'old',status:'done'});
 const rd=await f.bizRespAct(respId,'delete',{});
 assert.equal(rd.body.deleted,true);assert.equal(rd.body.runsDeleted,51,'index 50 + 1 orphan');
 keys=await f.bizRunKeysAll();assert.equal(keys.length,0,'orphan run object deleted with the responsibility');

 // --- 2a) purge race: paused in-flight run cannot recreate run/index/log after purge
 const s2=(await f.bizSourceAdd({kind:'note',title:'Ops',text:'Fridays are for invoicing.'})).body.source.id;
 const p2=(await f.bizDiscover()).body.proposals[0];
 const resp2=(await f.bizProposalAct(p2.id,'activate',{})).body.responsibility.id;
 let opened;gate={promise:new Promise(res=>{opened=res;})};
 const inflight=f.bizRespAct(resp2,'run',{input:'slow work'});
 await new Promise(r=>setTimeout(r,20)); // run is now parked inside the provider call
 const purge=await f.bizDataPurge({confirm:'DELETE'});
 assert.equal(purge.body.purged,true);
 opened();gate=null;
 const raced=await inflight;
 assert.equal(raced.status,409);assert.equal(raced.body.code,'workspace_changed','stale in-flight run refused after purge');
 keys=await f.bizRunKeysAll();assert.equal(keys.length,0,'purge race: no run object recreated');
 const st=await f.bizState();
 assert.equal(st.responsibilities.length,0);assert(st.log.every(e=>e.kind==='data_purged'),'purge race: only the purge own atomic commit entry exists, no stale log entry recreated');

 // --- 2b) discover race: paused discovery cannot recreate proposals after purge
 await f.bizSourceAdd({kind:'note',title:'Again',text:'We answer customer emails within a day.'});
 await consent();
 gate={promise:new Promise(res=>{opened=res;})};
 const disc=f.bizDiscover();
 await new Promise(r=>setTimeout(r,20));
 await f.bizDataPurge({confirm:'DELETE'});
 opened();gate=null;
 const draced=await disc;
 assert.equal(draced.status,409,'stale in-flight discover refused after purge');
 assert.equal((await f.bizProposals?[]:[]).length,0);
 assert.equal((await f.bizState()).proposals.length,0,'no proposal recreated');

 // --- 1b) source delete bumps the fence: a parked discover cannot persist the deleted source's quote
 await consent();
 const s9=(await f.bizSourceAdd({kind:'note',title:'Nine',text:'We answer customer emails within a day.'})).body.source.id;
 c.process.env.__s1=s9;
 let open9;gate={promise:new Promise(res=>{open9=res;})};
 const disc9=f.bizDiscover();
 await new Promise(r=>setTimeout(r,20)); // parked in the provider call
 const del9=await f.bizSourceDel(s9);
 assert.equal(del9.status,200,'source delete completes while discover is parked');
 open9();gate=null;
 const d9=await disc9;
 assert.equal(d9.status,409,'parked discover refused after the source delete generation bump');
 assert.equal((await f.bizState()).proposals.length,0,'no proposal carrying the deleted quote persisted');

 // --- 3a) source delete partial failure: source survives, retry finishes
 await f.bizSourceAdd({kind:'note',title:'Keep',text:'Fridays are for invoicing.'});
 const victim=(await f.bizState()).sources[0];
 await f.r(['SADD','fm:biz:proposals','prop_bad']);await f.r(['SET','fm:biz:prop:prop_bad','not json']);
 const partial=await f.bizSourceDel(victim.id);
 assert.equal(partial.status,503);assert.equal(partial.body.code,'delete_incomplete','truthful partial state, not "no data changed"');
 assert(await f.getJ('fm:biz:src:'+victim.id),'source NOT deleted when scrub could not complete');
 await f.r(['DEL','fm:biz:prop:prop_bad']);await f.r(['SREM','fm:biz:proposals','prop_bad']);
 const retry=await f.bizSourceDel(victim.id,{opId:(await f.getJ('fm:biz:op_pending')).opId});
 assert.equal(retry.status,200,'retry completes after the storage fault clears');

 // --- 3b) purge inventory is keyspace-complete: corrupted, index-missing and orphan records of
 // EVERY family are collected (indexes are never trusted), and the freeze clears afterwards
 await f.r(['SET','fm:biz:src:src_bad','not json']); // corrupted AND indexless
 await f.r(['SET','fm:biz:prop:prop_orphan','{"id":"prop_orphan"}']);
 await f.r(['SET','fm:biz:resp:resp_orphan','{"id":"resp_orphan"}']);
 await f.r(['SET','fm:biz:run:run_orphan','{"id":"run_orphan","respId":"resp_orphan"}']);
 await f.r(['LPUSH','fm:biz:runs:resp_orphan','run_orphan']);
 const full=await f.bizDataPurge({confirm:'DELETE'});
 assert.equal(full.status,200);assert.equal(full.body.purged,true);
 for(const k of ['fm:biz:src:src_bad','fm:biz:prop:prop_orphan','fm:biz:resp:resp_orphan','fm:biz:run:run_orphan','fm:biz:runs:resp_orphan','fm:biz:sources','fm:biz:proposals','fm:biz:resps','fm:biz:consent','fm:biz:log'])
  assert.equal(await f.r(['GET',k]),null,k+' purged without any index entry');
 assert.equal(await f.r(['GET','fm:biz:freeze']),null,'freeze cleared after purge');
 assert((await f.r(['GET','fm:biz:fence']))!=='0'&&!!(await f.r(['GET','fm:biz:fence'])),'fence survives the purge to keep invalidating older writers');

 // --- 2c) freeze contract: while the freeze is held, ALL writes are refused (entry gate AND EVAL gate)
 await f.bizSourceAdd({kind:'note',title:'F',text:'We answer customer emails within a day.'});
 await consent();
 await f.r(['SET','fm:biz:freeze','freeze_test','NX','PX',60000]);
 assert.equal((await f.bizSourceAdd({kind:'note',title:'X',text:'x x x x x x x x x x'})).status,409,'add frozen');
 const sF=(await f.bizState()).sources[0];
 assert.equal((await f.bizSourceDel(sF.id)).status,409,'delete cannot start under another freeze');
 assert.equal((await f.bizDataPurge({confirm:'DELETE'})).status,409,'purge cannot start under another freeze');
 assert.equal((await f.bizConsentAct(false)).status,409,'withdraw reports the conflict instead of a fake success');
 const pd=(await f.bizDiscover());
 assert.equal(pd.status,409,'discover frozen pre-flight');
 assert.equal((await f.bizRespAct('resp_none','run',{input:'x'})).status,409,'runs are quiesced under the freeze (409 before any read)');
 await f.r(['DEL','fm:biz:freeze']);
 assert.equal((await f.bizConsentAct(false)).status,200,'withdraw works again once the freeze clears');

 // --- 2d) resp delete excludes a NEW-generation run parked mid-delete window: after the delete
 // completes, a parked old-generation run still cannot persist (fence bump), and the resp is gone
 const sR=(await f.bizSourceAdd({kind:'note',title:'R2',text:'We answer customer emails within a day.'})).body.source.id;
 c.process.env.__s1=sR;
 await consent();
 const pR=(await f.bizDiscover()).body.proposals[0];
 const rR=(await f.bizProposalAct(pR.id,'activate',{})).body.responsibility.id;
 let openR;gate={promise:new Promise(res=>{openR=res;})};
 const runR=f.bizRespAct(rR,'run',{input:'parked work'});
 await new Promise(r=>setTimeout(r,20));
 const delR=await f.bizRespAct(rR,'delete',{});
 assert.equal(delR.status,200,'delete completes while the run is parked in the provider call');
 openR();gate=null;
 const runRes=await runR;
 assert.equal(runRes.status,409,'parked run cannot persist after the delete');
 assert.equal((await f.bizRunKeysAll()).length,0,'no run object recreated');
 assert.equal(await f.getJ('fm:biz:resp:'+rR),null,'responsibility stays deleted');

 // --- 4a) IPv6 / internal-DNS / CGNAT endpoints refused
 // allowlist every bad host so the CLASSIFIER layer is what must refuse them
 c.process.env.ALTER_MODEL_ALLOWED_HOSTS='api.groq.com,::1,fd00::8,fe80::1,ff02::1,fec0::1,::ffff:127.0.0.1,x.internal,x.local,100.64.0.1,localhost,api.openai.com,api.groq.com.';
 for(const bad of ['https://[::1]/v1','https://[fd00::8]/v1','https://[fe80::1]/v1','https://[ff02::1]/v1','https://[fec0::1]/v1','https://[::ffff:127.0.0.1]/v1','https://x.internal/v1','https://x.local/v1','https://100.64.0.1/v1','https://localhost./v1']){
  c.process.env.ALTER_MODEL_BASE_URL=bad;
  const e=await f.bizEngine();assert.equal(e.ok,false,bad);assert.equal(e.code,'engine_bad_endpoint',bad);
 }
 // the allowlist is the real gate: a perfectly public syntactically-valid host is refused when not vetted
 delete c.process.env.ALTER_MODEL_ALLOWED_HOSTS;
 c.process.env.ALTER_MODEL_BASE_URL='https://api.openai.com/v1';
 let e2=await f.bizEngine();assert.equal(e2.ok,false);assert.equal(e2.code,'engine_bad_endpoint','unvetted public origin refused');
 // trailing-dot look-alike of a vetted origin is not the vetted origin
 c.process.env.ALTER_MODEL_BASE_URL='https://api.groq.com./v1';
 e2=await f.bizEngine();assert.equal(e2.ok,false,'trailing-dot origin refused');
 // operator-vetted extension works with owner consent
 c.process.env.ALTER_MODEL_ALLOWED_HOSTS='api.groq.com,api.openai.com';
 c.process.env.ALTER_MODEL_BASE_URL='https://api.openai.com/v1';
 e2=await f.bizEngine();assert.equal(e2.ok,false,'still gated on consent');assert.equal(e2.code,'engine_no_consent');
 delete c.process.env.ALTER_MODEL_ALLOWED_HOSTS;
 c.process.env.ALTER_MODEL_BASE_URL='https://api.groq.com/openai/v1';

 // --- 4b) redirect: the payload never follows a 3xx off the consented host
 await f.bizSourceAdd({kind:'note',title:'R',text:'We answer customer emails within a day.'});
 await consent();
 const pr=(await f.bizDiscover()).body.proposals[0];
 const rr=(await f.bizProposalAct(pr.id,'activate',{})).body.responsibility.id;
 c.process.env.REDIRECT_ONCE='1';
 const n0=seen.length;
 const red=await f.bizRespAct(rr,'run',{input:'hello'});
 assert.equal(red.status,503);assert.equal(red.body.code,'engine_redirect','redirect refused');
 assert.equal(seen.length,n0+1,'exactly one call, to the consented endpoint only');
 // --- R3a) expiry/ownership interleave: parked source delete, lock expires, purge wins,
 // a THIRD holder takes the freeze; the resumed first delete must NOT recreate the proposal,
 // NOT report success, and NOT release the third holder's lock
 await f.bizSourceAdd({kind:'note',title:'X',text:'We answer customer emails within a day.'});
 await consent();
 const sx=(await f.bizState()).sources[0];
 c.process.env.__s1=sx.id;
 const px=(await f.bizDiscover()).body.proposals[0];
 assert(px,'proposal exists');
 let openX;f.bizSourceScrubbers.push(()=>new Promise(res=>{openX=res;}));
 const delX=f.bizSourceDel(sx.id);
 await new Promise(r=>setTimeout(r,30)); // delete parked inside the scrubber, freeze held
 await f.r(['DEL','fm:biz:freeze']); // simulate the 60s TTL expiring
 const purgeX=await f.bizDataPurge({confirm:'DELETE'});
 assert.equal(purgeX.status,200,'second holder purges');
 await f.r(['SET','fm:biz:freeze','holder2','NX','PX',60000]); // a later third holder
 openX();
 const delRes=await delX;
 assert.equal(delRes.status,503,'resumed delete does NOT report success');assert.equal(delRes.body.code,'delete_incomplete');
 assert.equal(await f.r(['GET','fm:biz:freeze']),'holder2','third holder lock NOT erased by the loser');
 assert.equal(await f.getJ('fm:biz:prop:'+px.id),null,'purged proposal NOT recreated by the resumed delete');
 assert.equal(await f.getJ('fm:biz:op_pending'),null,'purge consumed the pending intent');
 await f.r(['DEL','fm:biz:freeze']);
 f.bizSourceScrubbers.length=0; // the parked-scrubber interleave is over: later deletes must not park on it

 // --- R3b) partial purge: durable intent quiesces processing + writes until retry or CANCEL
 await f.bizSourceAdd({kind:'note',title:'Y',text:'We answer customer emails within a day.'});
 await consent();
 c.global.__bizFault='purge:props';
 const pf=await f.bizDataPurge({confirm:'DELETE'});
 assert.equal(pf.status,503);assert.equal(pf.body.code,'purge_incomplete');assert(pf.body.counts.sources>=1,'truthful partial counts');
 const pend=await f.getJ('fm:biz:op_pending');assert(pend&&pend.op==='purge','durable intent recorded');
 assert.equal((await f.bizDiscover()).status,409,'discover quiesced while purge pending');
 assert.equal((await f.bizSourceAdd({kind:'note',title:'Z',text:'z z z z z z z z z z'})).status,409,'adds quiesced');
 assert.equal((await f.bizConsentAct(true,{host:'api.groq.com',model:'openai/gpt-oss-120b'})).status,409,'grants quiesced');
 const tickP=await f.bizDailyTick();assert.equal(tickP.body.workspaces,0,'daily tick quiesced');
 const retryP=await f.bizDataPurge({confirm:'DELETE',opId:(await f.getJ('fm:biz:op_pending')).opId});
 assert.equal(retryP.status,200,"retry completes");assert.equal(await f.getJ('fm:biz:op_pending'),null,'marker cleared on completion');
 // cancel path: another partial, then explicit owner cancellation keeps what remains
 await f.bizSourceAdd({kind:'note',title:'W',text:'Fridays are for invoicing.'});
 c.global.__bizFault='purge:runs';
 const pf2=await f.bizDataPurge({confirm:'DELETE'});assert.equal(pf2.status,503);
 const pendC=await f.getJ('fm:biz:op_pending');
 assert.equal((await f.bizOpCancel({op:'purge',id:''})).status,400,'cancel without the reviewed instance id is refused');
 const cancel=await f.bizOpCancel({op:'purge',id:'',opId:pendC.opId});
 assert.equal(cancel.status,200);assert.equal(cancel.body.cancelled,true);
 assert.equal((await f.bizOpCancel({op:'purge',id:'',opId:pendC.opId})).status,409,'second cancel finds nothing pending');
 assert.equal(await f.getJ('fm:biz:op_pending'),null,'cancel clears the intent');
 assert.equal((await f.bizDataPurge({confirm:'nope'})).status,400,'typed confirmation still required');
 // --- R4-1) durable intent enforced INSIDE fenced writes, not only at entry: a writer holding
 // the NEW post-bump generation is still refused while op_pending exists (reviewer finding 1 repro)
 await f.bizSourceAdd({kind:'note',title:'R4',text:'We answer customer emails within a day.'});
 c.global.__bizFault='purge:begin';
 const pbegin=await f.bizDataPurge({confirm:'DELETE'});
 assert.equal(pbegin.status,503);assert.equal(pbegin.body.code,'purge_not_started','fault before any delete is truthful');
 const pend1=await f.getJ('fm:biz:op_pending');assert(pend1&&pend1.op==='purge'&&pend1.token&&pend1.gen,'intent + ownership + generation registered atomically at begin');
 assert.equal(await f.bizEntry(),null,'coherent entry snapshot refuses during pending intent');
 const newFence=await f.r(['GET','fm:biz:fence']);
 assert.equal(await f.bizLog('source_added',{sourceId:'x',title:'x'},newFence),0,'writer holding the NEW generation still refused while intent pends');
 assert.equal((await f.bizOpCancel({op:'purge',id:'',opId:pend1.opId})).status,200);
 const postCancelFence=await f.r(['GET','fm:biz:fence']);
 assert.notEqual(postCancelFence,newFence,'cancel bumps the generation');
 assert(await f.bizLog('source_added',{sourceId:'x',title:'x'},postCancelFence),'writes resume after owner cancellation');

 // --- R4-2) begin is one coherent OWNED transition: a delayed starter cannot overwrite a newer intent
 const sd1=(await f.bizSourceAdd({kind:'note',title:'S1',text:'We answer customer emails within a day.'})).body.source.id;
 c.global.__bizFault='sourcedel:begin';
 const d1=await f.bizSourceDel(sd1);
 assert.equal(d1.status,503);assert.equal(d1.body.code,'delete_not_started');
 const pendA=await f.getJ('fm:biz:op_pending');assert(pendA&&pendA.op==='source_delete'&&pendA.id===sd1,'intent A durable after a crash at begin');
 const blocked=await f.bizSourceDel('src_other');
 assert.equal(blocked.status,409);assert.equal(blocked.body.code,'operation_pending','a different delete is refused behind the pending intent');
 assert.equal((await f.getJ('fm:biz:op_pending')).id,sd1,'delayed starter did not overwrite the intent');
 const d1r=await f.bizSourceDel(sd1,{opId:pendA.opId});assert.equal(d1r.status,200);assert.strictEqual(d1r.body.auditLogged,true,'completion log written inside the atomic commit');
 assert.equal((await f.bizState()).log[0].kind,'source_deleted');

 // --- R4-3) idempotent retry when the record is already gone: closes intent + cleans indexes
 const sd3=(await f.bizSourceAdd({kind:'note',title:'S3',text:'We answer customer emails within a day.'})).body.source.id;
 c.global.__bizFault='sourcedel:close';
 const d3=await f.bizSourceDel(sd3);assert.equal(d3.status,503);assert.equal(d3.body.code,'delete_incomplete');
 assert.equal(await f.getJ('fm:biz:src:'+sd3),null,'record stage completed before the close fault');
 const d3r=await f.bizSourceDel(sd3,{opId:(await f.getJ('fm:biz:op_pending')).opId});
 assert.equal(d3r.status,200);assert.equal(d3r.body.retried,true,'source retry with record already gone completes');
 assert.equal(await f.getJ('fm:biz:op_pending'),null,'retry closed the intent');
 assert(!(await f.r(['SMEMBERS','fm:biz:sources'])).includes(sd3),'source index membership cleaned');
 const sd4=(await f.bizSourceAdd({kind:'note',title:'S4',text:'We answer customer emails within a day.'})).body.source.id;
 c.process.env.__s1=sd4;
 await consent();
 const disc4=await f.bizDiscover(); if(!disc4.body.proposals||!disc4.body.proposals[0]){console.error('disc4',disc4.status,JSON.stringify(disc4.body));process.exit(3);} const px4=disc4.body.proposals[0];
 const act4=await f.bizProposalAct(px4.id,'activate',{}); if(!act4.body.responsibility){console.error('act4',act4.status,JSON.stringify(act4.body));process.exit(3);} const rx=act4.body.responsibility.id;
 c.global.__bizFault='respdel:close';
 const rd3=await f.bizRespAct(rx,'delete',{}); if(rd3.status!==503){console.error('rd3',rd3.status,JSON.stringify(rd3.body));process.exit(3);}assert.equal(rd3.body.code,'delete_incomplete');
 assert.equal(await f.getJ('fm:biz:resp:'+rx),null,'resp record stage completed before the close fault');
 const rd3r=await f.bizRespAct(rx,'delete',{opId:(await f.getJ('fm:biz:op_pending')).opId});
 assert.equal(rd3r.status,200);assert.equal(rd3r.body.retried,true,'resp retry: no more 404-stranded marker');
 assert.equal(await f.getJ('fm:biz:op_pending'),null);
 assert(!(await f.r(['SMEMBERS','fm:biz:resps'])).includes(rx),'resp index membership cleaned');

 // --- R4-4) cancel carries the reviewed op identity: stale reject + generation invalidation
 const sd5=(await f.bizSourceAdd({kind:'note',title:'S5',text:'We answer customer emails within a day.'})).body.source.id;
 c.global.__bizFault='sourcedel:scrubbed';
 const d5=await f.bizSourceDel(sd5);assert.equal(d5.status,503);assert.equal(d5.body.code,'delete_incomplete');
 const narrowOpId=(await f.getJ('fm:biz:op_pending')).opId;
 c.global.__bizFault='purge:runs';
 const pg=await f.bizDataPurge({confirm:'DELETE'});assert.equal(pg.status,503);assert.equal(pg.body.code,'purge_incomplete','purge subsumes a pending narrower intent atomically');
 assert.equal((await f.getJ('fm:biz:op_pending')).op,'purge','newer purge intent pending');
 const pendS=await f.getJ('fm:biz:op_pending');
 assert(pendS.opId&&pendS.opId!==narrowOpId,'subsume (narrow -> purge) mints a FRESH instance id - changed scope is a new operation');
 const staleCancel=await f.bizOpCancel({op:'source_delete',id:sd5,opId:'op_staleold'});
 assert.equal(staleCancel.status,409);assert.equal(staleCancel.body.code,'op_stale','stale cancel rejected; newer intent untouched');
 assert.equal((await f.bizOpCancel({op:'purge',id:'',opId:'op_staleold'})).status,409,'a prior purge instance cancel is stale against the new purge');
 assert.equal((await f.getJ('fm:biz:op_pending')).op,'purge','stale cancel did not clear the newer purge intent');
 const pgR=await f.bizDataPurge({confirm:'DELETE',opId:pendS.opId});assert.equal(pgR.status,200,'purge retry completes');
 assert.equal((await f.bizOpCancel({op:'purge',id:'',opId:pendS.opId})).status,409,'nothing pending after the completed purge');
 const sd6=(await f.bizSourceAdd({kind:'note',title:'S6',text:'We answer customer emails within a day.'})).body.source.id;
 c.global.__bizFault='sourcedel:begin';
 await f.bizSourceDel(sd6);
 const fence6=await f.r(['GET','fm:biz:fence']);
 const cx=await f.bizOpCancel({op:'source_delete',id:sd6,opId:(await f.getJ('fm:biz:op_pending')).opId});assert.equal(cx.status,200);
 assert.equal(await f.bizLog('source_deleted',{sourceId:sd6,title:'S6'},fence6),0,'cancel generation bump invalidates the in-flight holder next write');
 assert.equal((await f.bizDataPurge({confirm:'nope'})).status,400,'typed confirmation still required');

 // --- R4-5) completion log inside the operation own generation: no post-release write can
 // recreate the activity log after a later purge
 const sd7=(await f.bizSourceAdd({kind:'note',title:'S7',text:'We answer customer emails within a day.'})).body.source.id;
 const preDel=await f.r(['GET','fm:biz:fence']);
 const d7=await f.bizSourceDel(sd7);assert.equal(d7.status,200);assert.strictEqual(d7.body.auditLogged,true);
 await f.bizDataPurge({confirm:'DELETE'});
 assert.equal(await f.bizLog('source_deleted',{sourceId:sd7,title:'S7'},preDel),0,'stale post-release log write refused');
 const stLog=(await f.bizState()).log;assert(stLog.length>0&&stLog.every(e=>e.kind==='data_purged'),'only the purge own commit entry survives');

 // --- R4-6) stable instance id: retry keeps it, a fresh operation gets a fresh one, cancel
 // must carry the reviewed instance (old tab cannot cancel a newer purge)
 c.global.__bizFault='purge:sources';
 const pgA=await f.bizDataPurge({confirm:'DELETE'});assert.equal(pgA.status,503);
 const instA=(await f.getJ('fm:biz:op_pending')).opId;assert(instA,'instance id recorded');
 c.global.__bizFault='purge:runs';
 assert.equal((await f.bizDataPurge({confirm:'DELETE'})).status,409,'retry without the reviewed instance id is refused');
 assert.equal((await f.bizDataPurge({confirm:'DELETE',opId:'op_wrong'})).status,409,'retry with the wrong instance id is refused');
 const pgA2=await f.bizDataPurge({confirm:'DELETE',opId:instA});assert.equal(pgA2.status,503,'retry of the same operation with the reviewed instance id');
 assert.equal((await f.getJ('fm:biz:op_pending')).opId,instA,'retry preserves the intent instance id');
 const cA=await f.bizOpCancel({op:'purge',id:'',opId:instA});assert.equal(cA.status,200,'cancel with the reviewed instance id works');
 c.global.__bizFault='purge:sources';
 await f.bizDataPurge({confirm:'DELETE'});
 const instB=(await f.getJ('fm:biz:op_pending')).opId;assert(instB&&instB!==instA,'a fresh operation defines a fresh instance id');
 const staleB=await f.bizOpCancel({op:'purge',id:'',opId:instA});
 assert.equal(staleB.status,409);assert.equal(staleB.body.code,'op_stale','an old tab cannot cancel the newer purge');
 assert.equal((await f.getJ('fm:biz:op_pending')).opId,instB,'newer purge intent survives the stale cancel');
 // stale Finish after completion (reviewer repro): old partial purge finishes elsewhere, new data
 // is added, then a stale Finish with the old instance id must NOT start a fresh purge over it
 assert.equal((await f.bizDataPurge({confirm:'DELETE',opId:instB})).status,200,'newer purge completes with its own instance id');
 const sNew=(await f.bizSourceAdd({kind:'note',title:'New',text:'We answer customer emails within a day.'})).body.source.id;
 const staleF=await f.bizDataPurge({confirm:'DELETE',opId:instB});
 assert.equal(staleF.status,409);assert.equal(staleF.body.code,'intent_completed','stale Finish after completion is rejected, never a fresh purge');
 assert(await f.getJ('fm:biz:src:'+sNew),'the newer source survives the stale Finish');
 const staleS=await f.bizSourceDel(sNew,{opId:'op_old'});
 assert.equal(staleS.status,409);assert.equal(staleS.body.code,'intent_completed','stale source Finish with no pending intent is rejected');
 assert(await f.getJ('fm:biz:src:'+sNew),'source survives the stale source Finish');

 console.log('PASS privacy lifecycle: orphan inventory, generation bumps, freeze exclusion + ownership-token interleave (expiry/purge/third-holder), durable partial purge with quiescence + retry + CANCEL, truthful partials, keyspace-complete purge, vetted-origin allowlist + full classifier, redirect refused pre-payload, R4 atomic op protocol (pending inside fenced writes, coherent begin, idempotent gone-record retries, reviewed-identity cancel, commit-inside-ownership), stable intent instance ids across retry vs fresh operations.');
})().catch(e=>{console.error(e);process.exit(1)});
