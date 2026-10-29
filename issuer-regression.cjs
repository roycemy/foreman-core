const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');const src=fs.readFileSync(__dirname+'/api/index.js','utf8')+'\nmodule.exports.t={r,setJ,getJ,als,issuerMandate,issuerProcess,createAgent,newTask,issuerEnvelopeTarget,issuerStore,envelopePropose,envelopeDecide,envelopeAdjudicate,spendSummary,issuerEnvelopeForEvent,envelopesOn,routes,mem,envelopeNotice};';const ctx={require,module:{exports:{}},process:{env:{}},global:{},console,fetch:()=>{throw Error('NO NETWORK OR PAYMENT')},setTimeout,clearTimeout,URL,AbortSignal};vm.runInNewContext(src,ctx);const f=ctx.module.exports.t;
const secret='whsec_disposable_fixture_not_a_real_secret',handlerCtx={require:p=>p==='./api/index'?{issuerProcess:f.issuerProcess,issuerEnvelopeTarget:e=>f.issuerEnvelopeTarget(e),issuerEnvelopeForEvent:f.issuerEnvelopeForEvent,issuerStore:f.issuerStore,envelopesEnabled:f.envelopesOn,envelopeNotice:f.envelopeNotice}:require(p),module:{exports:{}},process:{env:{STRIPE_ISSUING_TEST_WEBHOOK_SECRET:secret}},console,Buffer,setTimeout,clearTimeout};vm.runInNewContext(fs.readFileSync(__dirname+'/issuer-webhook.cjs','utf8'),handlerCtx);const h=handlerCtx.module.exports;
const event=(id='evt_fixture',amount=1000,extra={})=>({id,account:'acct_fixture',type:'issuing_authorization.request',livemode:false,data:{object:{id:'iauth_'+id.replace(/[^A-Za-z0-9]/g,''),livemode:false,card:'ic_fixture',pending_request:{amount,currency:'usd'},merchant_data:{network_id:'merchant_fixture',category:'computer_software_stores'},...extra}}});
async function call(e,{signature=true,body}={}){const raw=body||Buffer.from(JSON.stringify(e)),t=Math.floor(Date.now()/1000),sig='t='+t+',v1='+crypto.createHmac('sha256',secret).update(t+'.').update(raw).digest('hex');let out;const hd={};await h({method:'POST',body:raw,headers:{'stripe-signature':signature?sig:'t=0,v1=bad'}},{setHeader(k,v){hd[k]=v},status(n){this.code=n;return this},json(j){out={status:this.code,body:j,headers:hd}}});return out}
(async()=>{let a,t;await f.als.run({ws:'issuerfixture'},async()=>{a=(await f.createAgent('Fixture','Ops','custom',false,{preset:'balanced'})).agent;t=await f.newTask({title:'Fixture',assignee:a.id});t.status='running';await f.setJ('fm:task:'+t.id,t);const b={confirmed:true,cardId:'ic_fixture',accountId:'acct_fixture',botId:a.id,taskId:t.id,amountCents:1000,jobBudgetCents:1500,merchantNetworkId:'merchant_fixture',category:'computer_software_stores'};assert.equal((await f.issuerMandate({...b,confirmed:false})).status,400);assert.equal((await f.issuerMandate(b)).status,200);assert.equal((await f.issuerMandate(b)).status,409);});
 assert.equal((await call(event(),{signature:false})).status,400);assert.equal((await call({...event(),livemode:true})).body.approved,false);assert.equal((await call(event('evt_mismatch',999))).body.metadata.alter_reason,'mandate_mismatch');
 const start=performance.now(),pair=await Promise.all([call(event('evt_one')),call(event('evt_two'))]);assert.equal(pair.filter(x=>x.body.approved).length,1);assert(performance.now()-start<1000);assert(pair.every(x=>x.headers['Stripe-Version']==='2025-03-31.basil'));const winner=pair[0].body.approved?'evt_one':'evt_two';assert.equal((await call(event(winner))).body.metadata.alter_reason,'replay_declined');
 const state=await f.getJ('gl:issuer-test:acct_fixture:ic_fixture');assert.equal(state.jobs[t.id].reservedCents,1000);assert.equal(state.decisions.length,1);assert.equal(state.decisions[0].chargedCents,0);
 await f.als.run({ws:'issuerfixture'},async()=>{assert.equal((await f.issuerMandate({confirmed:true,cardId:'ic_fixture',accountId:'acct_fixture',botId:a.id,taskId:t.id,amountCents:1000,jobBudgetCents:1500,merchantNetworkId:'merchant_fixture',category:'computer_software_stores'})).status,400);});
 assert.equal((await f.issuerProcess(event(),Date.now()-1)).reason,'internal_deadline');assert.equal((await call(event('evt_live',1000,{livemode:true}))).body.approved,false);
 assert.equal((await call(event('evt_currency',1000,{pending_request:{amount:1000,currency:'eur'}}))).body.approved,false);
 const raw=Buffer.from('{}'),old=Math.floor(Date.now()/1000)-301,sig=crypto.createHmac('sha256',secret).update(old+'.').update(raw).digest('hex');assert.equal(h.verify(raw,'t='+old+',v1='+sig,secret),false);
 const baseLatency=(performance.now()-start).toFixed(1);
 // Envelope path (spend-envelope.cjs), behind ALTER_SPEND_ENVELOPES (default off).
 const SE=require('./spend-envelope.cjs'),owner=fn=>f.als.run({ws:'issuerfixture',uid:'user_fixture'},fn);
 const route=(path,body)=>owner(async()=>{let o;await f.routes({method:'POST',url:'/api'+path,headers:{host:'localhost',origin:'http://localhost'}},{setHeader(){},status(n){this.code=n;return this},json(j){o={code:this.code,j}}},path,body,null);return o});
 const ev=(id,amount,card='ic_env',extra={})=>({id,account:'acct_env',type:'issuing_authorization.request',livemode:false,data:{object:{id:'iauth_'+id.replace(/[^A-Za-z0-9]/g,''),livemode:false,card,pending_request:{amount,currency:'usd'},merchant_data:{network_id:'merchant_env',category:'computer_software_stores'},...extra}}});
 const authEv=(id,authId,amount,approved,status,card='ic_env')=>({id,account:'acct_env',type:'issuing_authorization.'+(status==='pending'?'created':'updated'),livemode:false,data:{object:{id:authId,livemode:false,card,approved,status,amount,currency:'usd'}}});
 const txEv=(id,txId,authId,amount,type='capture',card='ic_env')=>({id,account:'acct_env',type:'issuing_transaction.created',livemode:false,data:{object:{id:txId,type,amount:type==='capture'?-amount:amount,currency:'usd',authorization:authId,card}}});
 const reason=async e=>{const o=await call(e);assert.equal(o.status,200);return o.body.approved?'APPROVED':o.body.metadata.alter_reason};
 const evidence=async e=>{const o=await call(e);assert.equal(o.status,200);return o.body.envelope||o.body.skipped};
 const usd=async hash=>owner(async()=>(await f.spendSummary()).envelopes.find(x=>x.hash===hash).buckets.find(b=>b.currency==='usd'));
 const tot=async hash=>{const b=await usd(hash);return [b.unresolvedCents,b.reservedCents,b.settledCents,b.availableCents]};
 const base={botId:a.id,accountId:'acct_env',cardId:'ic_env',merchantNetworkId:'merchant_env',maxTotalCents:4000,expiresAtMs:Date.now()+600000};
 // Flag off: owner routes 404, /money has no envelope fields, a card mapping is ignored (mandate path decides), provider events skipped.
 assert.equal(ctx.process.env.ALTER_SPEND_ENVELOPES,undefined);
 assert.equal((await route('/money/envelopes',base)).code,404);
 await owner(async()=>{const m=await f.spendSummary();assert.equal(m.envelopesEnabled,false);assert.equal(m.envelopes,undefined);});
 await f.setJ('gl:issuer-envelope-card:acct_env:ic_env',{ws:'issuerfixture',botId:a.id,hash:'0'.repeat(64)});
 assert.equal(await f.issuerEnvelopeTarget(ev('evt_off',100)),null);assert.equal(await reason(ev('evt_off',100)),'unmapped_card');
 assert.equal(await evidence(authEv('evt_offa','iauth_evtoff',100,true,'pending')),'flag_off');
 await f.r(['DEL','gl:issuer-envelope-card:acct_env:ic_env']);
 ctx.process.env.ALTER_SPEND_ENVELOPES='1';
 let env,b2,rev;
 {const bad=await route('/money/envelopes',{...base,expiresAtMs:Date.now()-1});assert.equal(bad.code,400);assert.equal((await route('/money/envelopes',{...base,botId:'agent_missing'})).code,400);
  const made=await route('/money/envelopes',base);assert.equal(made.code,201);env=made.j.envelope;assert.equal(env.status,'pending_approval');assert.equal(env.proposedBy,'owner:user_fixture');
  const dup=await route('/money/envelopes',base);assert.deepEqual([dup.code,dup.j.error],[409,'duplicate_proposal']);
  await owner(async()=>{const m=await f.spendSummary();assert.equal(m.envelopesEnabled,true);assert.equal(m.envelopes[0].hash,env.hash);assert(m.envelopeEligible.bots.some(x=>x.id===a.id));b2=(await f.createAgent('Fixture Two','Ops','custom',false,{preset:'balanced'})).agent;});}
 await f.als.run({ws:'other-owner'},async()=>{assert.equal((await f.envelopeDecide(env.hash,'approve')).status,404)});
 assert.notEqual(await reason(ev('evt_env0',1000)),'APPROVED');
 {const d=await route('/money/envelopes/'+env.hash+'/approve',{});assert.deepEqual([d.code,d.j.code,d.j.envelope.decidedBy],[200,'approved','owner:user_fixture']);assert.equal((await route('/money/envelopes/'+env.hash+'/deny',{})).j.code,'already_decided');}
 // Approve at request time: accepted cents are unresolved until provider evidence.
 assert.equal(await reason(ev('evt_env1',2500)),'APPROVED');assert.deepEqual(await tot(env.hash),[2500,0,0,1500]);
 assert.equal(await reason(ev('evt_env1',2500)),'replay_declined');
 assert.equal(await reason(ev('evt_env1b',100,'ic_env',{id:'iauth_evtenv1'})),'replay_declined');
 assert.equal(await reason(ev('evt_env2',2000)),'insufficient_available');
 assert.equal(await reason(ev('evt_env3',100,'ic_env',{merchant_data:{network_id:'merchant_other',category:'computer_software_stores'}})),'envelope_mismatch');
 const mapKey='gl:issuer-envelope-card:acct_env:ic_env',mapping=await f.getJ(mapKey);
 await f.setJ(mapKey,{...mapping,botId:b2.id});assert.equal(await reason(ev('evt_env4',100)),'envelope_mismatch');await f.setJ(mapKey,mapping);
 await owner(async()=>{await f.r(['SET','fm:kill','1'])});assert.equal(await reason(ev('evt_env5',100)),'bot_inactive_or_killed');await owner(async()=>{await f.r(['DEL','fm:kill'])});
 // Provider evidence through the signed webhook: confirm, partial capture (reserved and settled at once), duplicates once, close.
 assert.equal(await evidence(authEv('evt_c1','iauth_evtenv1',2500,true,'pending')),'confirmed');assert.deepEqual(await tot(env.hash),[0,2500,0,1500]);
 assert.equal(await evidence(txEv('evt_c2','ipi_cap1','iauth_evtenv1',1000)),'capture');assert.deepEqual(await tot(env.hash),[0,1500,1000,1500]);
 assert.equal(await evidence(txEv('evt_c2','ipi_cap1','iauth_evtenv1',1000)),'duplicate');assert.equal(await evidence(txEv('evt_c3','ipi_cap1','iauth_evtenv1',1000)),'duplicate');
 assert.equal(await evidence(authEv('evt_c4','iauth_evtenv1',0,true,'closed')),'closed');assert.deepEqual(await tot(env.hash),[0,0,1000,3000]);
 assert.equal(await evidence(txEv('evt_c5','ipi_ref1','iauth_evtenv1',400,'refund')),'refund');assert.deepEqual(await tot(env.hash),[0,0,600,3400]);
 // Fix 3: revoke between mint and use. The mapping stays; card use re-checks state and declines; never the mandate path.
 rev=(await route('/money/envelopes',{...base,cardId:'ic_envrev'})).j.envelope;assert.equal((await route('/money/envelopes/'+rev.hash+'/approve',{})).j.code,'approved');
 assert.equal((await f.getJ('gl:issuer-envelope-card:acct_env:ic_envrev')).hash,rev.hash);
 assert.equal((await route('/money/envelopes/'+rev.hash+'/revoke',{})).j.code,'revoked');
 assert.equal(await reason(ev('evt_rev1',100,'ic_envrev')),'envelope_revoked');
 // Revoke lands after the use-time pre-check but before RESERVE: the reserve script's own state check refuses.
 const rev2=(await route('/money/envelopes',{...base,cardId:'ic_envrev2'})).j.envelope;await route('/money/envelopes/'+rev2.hash+'/approve',{});
 const SEs=require('./spend-envelope.cjs');
 const mkHandler=wrap=>{const c={require:p=>p==='./api/index'?{issuerProcess:f.issuerProcess,issuerEnvelopeTarget:e=>f.issuerEnvelopeTarget(e),issuerEnvelopeForEvent:f.issuerEnvelopeForEvent,issuerStore:wrap,envelopesEnabled:f.envelopesOn,envelopeNotice:f.envelopeNotice}:require(p),module:{exports:{}},process:{env:{STRIPE_ISSUING_TEST_WEBHOOK_SECRET:secret}},console,Buffer,setTimeout,clearTimeout};vm.runInNewContext(fs.readFileSync(__dirname+'/issuer-webhook.cjs','utf8'),c);return c.module.exports};
 const postTo=async(handler,e)=>{const raw=Buffer.from(JSON.stringify(e)),t=Math.floor(Date.now()/1000),sg='t='+t+',v1='+crypto.createHmac('sha256',secret).update(t+'.').update(raw).digest('hex');let o;await handler({method:'POST',body:raw,headers:{'stripe-signature':sg}},{setHeader(){},status(n){this.code=n;return this},json(j){o={code:this.code,...j}}});return o};
 const raceH=mkHandler(deadline=>{const s=f.issuerStore(deadline);return async cmd=>{if(cmd[0]==='EVAL'&&cmd[1]===SEs.RESERVE)await owner(()=>f.envelopeDecide(rev2.hash,'revoke'));return s(cmd)}});
 {const o=await postTo(raceH,ev('evt_rev2',100,'ic_envrev2'));assert.deepEqual([o.approved,o.metadata.alter_reason],[false,'envelope_revoked']);assert.deepEqual(await tot(rev2.hash),[0,0,0,4000]);}
 // Missing envelope behind a mapping declines as mapping_unavailable (no fallback); expiry at use declines.
 await f.setJ('gl:issuer-envelope-card:acct_env:ic_envgone',{ws:'issuerfixture',botId:a.id,hash:'f'.repeat(64)});assert.equal(await reason(ev('evt_gone',100,'ic_envgone')),'mapping_unavailable');
 const short=(await route('/money/envelopes',{...base,cardId:'ic_envshort',expiresAtMs:Date.now()+300})).j.envelope;await route('/money/envelopes/'+short.hash+'/approve',{});
 await new Promise(s=>setTimeout(s,350));assert.equal(await reason(ev('evt_env7',100,'ic_envshort')),'envelope_expired');
 // Late reserve: lands after the 1000ms deadline. Webhook declines; nothing is released locally; the cents stay unresolved until evidence.
 const late=(await route('/money/envelopes',{...base,cardId:'ic_envlate'})).j.envelope;await route('/money/envelopes/'+late.hash+'/approve',{});
 const lateH=mkHandler(deadline=>{const s=f.issuerStore(deadline);return async cmd=>{const out=await s(cmd);if(deadline&&cmd[1]===SEs.RESERVE)await new Promise(x=>setTimeout(x,1200));return out}});
 {const began=performance.now(),o=await postTo(lateH,ev('evt_late1',1000,'ic_envlate'));assert.deepEqual([o.approved,o.metadata.alter_reason],[false,'internal_deadline']);assert(performance.now()-began<1150);}
 await new Promise(x=>setTimeout(x,300));assert.deepEqual(await tot(late.hash),[1000,0,0,3000]);
 assert.equal(await reason(ev('evt_late1',1000,'ic_envlate')),'replay_declined');
 assert.equal(await evidence(authEv('evt_late2','iauth_evtlate1',1000,false,'closed','ic_envlate')),'released');assert.deepEqual(await tot(late.hash),[0,0,0,4000]);
 assert.equal(await reason(ev('evt_late1b',1000,'ic_envlate',{id:'iauth_evtlate1'})),'replay_declined');
 // Store down while provider evidence arrives: 500 (provider retries), the item stays unresolved and reduces available.
 const sd=(await route('/money/envelopes',{...base,cardId:'ic_envdown'})).j.envelope;await route('/money/envelopes/'+sd.hash+'/approve',{});
 assert.equal(await reason(ev('evt_down1',800,'ic_envdown')),'APPROVED');
 const downH=mkHandler(()=>async()=>{throw Error('store unreachable')});
 {const o=await postTo(downH,authEv('evt_down2','iauth_evtdown1',800,false,'closed','ic_envdown'));assert.deepEqual([o.code,o.received],[500,false]);}
 assert.deepEqual(await tot(sd.hash),[800,0,0,3200]);
 // Stuck state and owner adjudication with an audit entry (age the record past the threshold instead of sleeping 2 minutes).
 {const k=SE.envelopeKey(sd.hash);assert.equal((await route('/money/envelopes/'+sd.hash+'/authorizations/iauth_evtdown1/adjudicate',{decision:'declined',note:'issuer shows declined'})).j.code,'not_stuck');
  f.mem.hashes.get(k).set('a:iauth_evtdown1:at',String(Date.now()-SE.STUCK_MS-1));
  const view=await owner(async()=>(await f.spendSummary()).envelopes.find(x=>x.hash===sd.hash));assert.deepEqual(view.stuck.map(x=>x.authorizationId),['iauth_evtdown1']);
  assert.equal((await route('/money/envelopes/'+sd.hash+'/authorizations/iauth_evtdown1/adjudicate',{decision:'declined'})).code,400);
  const adj=await route('/money/envelopes/'+sd.hash+'/authorizations/iauth_evtdown1/adjudicate',{decision:'declined',note:'issuer shows declined'});assert.deepEqual([adj.code,adj.j.code],[200,'adjudicated']);
  const entry=adj.j.envelope.history.find(x=>x.kind==='manual_adjudication:declined');assert.deepEqual([entry.actor,entry.note,entry.du],['owner:user_fixture','issuer shows declined',-800]);
  // R3: the decline keeps the cents held. Available does not move; the item is declined_pending and shows a persistent notice.
  const dpOf=async hh=>(await usd(hh)).declinedPendingCents,sdView=()=>owner(async()=>(await f.spendSummary()).envelopes.find(x=>x.hash===sd.hash));
  assert.deepEqual(await tot(sd.hash),[0,0,0,3200]);assert.equal(await dpOf(sd.hash),800);
  {const v=await sdView();assert.deepEqual(v.declinedPending.map(x=>x.authorizationId),['iauth_evtdown1']);assert.deepEqual(v.notices.map(n=>n.kind),['manual_adjudication:declined']);}
  // R2: a request larger than available declines with insufficient_available; no partial reservation.
  assert.equal(await reason(ev('evt_down6',3500,'ic_envdown')),'insufficient_available');assert.deepEqual(await tot(sd.hash),[0,0,0,3200]);
  assert.equal(await reason(ev('evt_down4',2400,'ic_envdown')),'APPROVED');assert.deepEqual(await tot(sd.hash),[2400,0,0,800]);
  // R4: a capture equal to the held amount settles it and closes the item. No discrepancy, no owner notice, and the declined notice clears.
  {const cap=await call(txEv('evt_down3','ipi_down1','iauth_evtdown1',800,'capture','ic_envdown'));
   assert.deepEqual([cap.status,cap.body.envelope,cap.body.ownerNotified],[200,'capture_resolved_declined_pending',undefined]);
   assert.deepEqual(await tot(sd.hash),[2400,0,800,800]);assert.equal(await dpOf(sd.hash),0);const v=await sdView();assert.equal(v.notices.length,0);assert.equal(v.declinedPending.length,0);}
  // A capture larger than its own reservation is the remaining overspend path (R8): discrepancy entry, owner feed notice, ack never releases.
  assert.equal(await reason(ev('evt_down5',700,'ic_envdown')),'APPROVED');assert.deepEqual(await tot(sd.hash),[3100,0,800,100]);
  f.mem.hashes.get(k).set('a:iauth_evtdown5:at',String(Date.now()-SE.STUCK_MS-1));
  assert.equal((await route('/money/envelopes/'+sd.hash+'/authorizations/iauth_evtdown5/adjudicate',{decision:'declined',note:'issuer shows declined'})).j.code,'adjudicated');
  assert.deepEqual(await tot(sd.hash),[2400,0,800,100]);assert.equal(await dpOf(sd.hash),700);
  const cap2=await call(txEv('evt_down7','ipi_down5','iauth_evtdown5',900,'capture','ic_envdown'));
  assert.deepEqual([cap2.status,cap2.body.envelope,cap2.body.ownerNotified],[200,'discrepancy:capture_differs_from_held',true]);
  const ub=await usd(sd.hash);assert.deepEqual([ub.unresolvedCents,ub.settledCents,ub.declinedPendingCents,ub.availableCents,ub.overspendCents],[2400,1700,0,0,100]);
  const feed=(await owner(()=>f.r(['LRANGE','fm:events',0,20]))).map(x=>JSON.parse(x)).find(x=>x.envelopeHash===sd.hash);
  assert.deepEqual([feed.kind,feed.discrepancy,feed.agentId,feed.text],['BLOCKED','discrepancy:capture_differs_from_held',a.id,'Issuer captured 9.00 USD on an authorization you declined; the amount differs from what was held. It now counts as spent.']);
  const nv=await sdView();assert.deepEqual(nv.notices.map(n=>n.kind),['discrepancy:capture_differs_from_held']);
  const ak=await route('/money/envelopes/'+sd.hash+'/notices/ack',{seq:nv.notices[0].seq});assert.deepEqual([ak.code,ak.j.code,ak.j.envelope.notices.length],[200,'acknowledged',0]);
  assert.equal(ak.j.envelope.history.slice(-1)[0].actor,'owner:user_fixture');}
 for(const hh of [env.hash,rev2.hash,late.hash,sd.hash]){const au=await SE.audit(f.r,hh);assert(au.ok,au.errors.join('; '));}
 // Timeout: a hung envelope lookup declines at the internal deadline.

 {const slowCtx={require:p=>p==='./api/index'?{issuerProcess:f.issuerProcess,issuerEnvelopeTarget:()=>new Promise(()=>{}),issuerEnvelopeForEvent:f.issuerEnvelopeForEvent,issuerStore:f.issuerStore,envelopesEnabled:f.envelopesOn,envelopeNotice:f.envelopeNotice}:require(p),module:{exports:{}},process:{env:{STRIPE_ISSUING_TEST_WEBHOOK_SECRET:secret}},console,Buffer,setTimeout,clearTimeout};vm.runInNewContext(fs.readFileSync(__dirname+'/issuer-webhook.cjs','utf8'),slowCtx);
  const began=performance.now(),o=await postTo(slowCtx.module.exports,ev('evt_env9',100));assert.deepEqual([o.approved,o.metadata.alter_reason],[false,'internal_deadline']);assert(performance.now()-began<1500);}
 {let o;await ctx.module.exports({url:'/api/money/envelopes',method:'POST',headers:{host:'localhost'},body:base},{setHeader(){},status(n){this.code=n;return this},json(j){o={code:this.code,j}}});assert.equal(o.code,401);}
 console.log('PASS envelope (ALTER_SPEND_ENVELOPES): flag off = 404 routes, no /money fields, mapping ignored, evidence skipped; flag on: owner propose/duplicate/approve with owner identity, cross-workspace 404, request approves into unresolved, replayed event/authorization, over-limit, wrong merchant/bot, kill decline; signed provider evidence confirms, partial capture, duplicates once, close, refund; revoke between mint and use declines (pre-check and inside RESERVE), missing envelope and expiry decline with no fallback; late reserve declines and stays unresolved until evidence; store-down evidence returns 500 and keeps unresolved; stuck item adjudicated by owner with audit entry; manual decline keeps cents held as declined_pending (no budget freed, request over available declines insufficient_available, no partial reservation), capture equal to held settles with no notice, capture beyond its own reservation = discrepancy + overspend + owner feed notice, ack route clears it without releasing; audit replay ok; hung lookup declines; unauthenticated route 401. chargedCents 0.');
 console.log('PASS signed raw body, stale/bad signatures, live-mode refusal, exact mandate, concurrent atomic budget reservation, replay decline, independent issuer-test job cap, synchronous direct response and deadline. ZERO network/payment calls. Local latency '+baseLatency+'ms, not Stripe delivery proof.');
})().catch(e=>{console.error(e);process.exit(1)});
