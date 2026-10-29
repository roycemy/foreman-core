const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');const src=fs.readFileSync(__dirname+'/api/index.js','utf8')+'\nmodule.exports.t={r,setJ,getJ,als,issuerMandate,issuerProcess,createAgent,newTask,issuerEnvelopeTarget,issuerStore,envelopePropose,envelopeDecide,spendSummary};';const ctx={require,module:{exports:{}},process:{env:{}},global:{},console,fetch:()=>{throw Error('NO NETWORK OR PAYMENT')},setTimeout,clearTimeout,URL,AbortSignal};vm.runInNewContext(src,ctx);const f=ctx.module.exports.t;
const secret='whsec_disposable_fixture_not_a_real_secret',handlerCtx={require:p=>p==='./api/index'?{issuerProcess:f.issuerProcess,issuerEnvelopeTarget:e=>f.issuerEnvelopeTarget(e),issuerStore:f.issuerStore}:require(p),module:{exports:{}},process:{env:{STRIPE_ISSUING_TEST_WEBHOOK_SECRET:secret}},console,Buffer,setTimeout,clearTimeout};vm.runInNewContext(fs.readFileSync(__dirname+'/issuer-webhook.cjs','utf8'),handlerCtx);const h=handlerCtx.module.exports;
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
 // Envelope path (spend-envelope.cjs): owner approves an envelope ahead of time; the webhook approves only on 'reserved'.
 const ev=(id,amount,card='ic_env',extra={})=>({id,account:'acct_env',type:'issuing_authorization.request',livemode:false,data:{object:{id:'iauth_'+id.replace(/[^A-Za-z0-9]/g,''),livemode:false,card,pending_request:{amount,currency:'usd'},merchant_data:{network_id:'merchant_env',category:'computer_software_stores'},...extra}}});
 const reason=async e=>{const o=await call(e);assert.equal(o.status,200);return o.body.approved?'APPROVED':o.body.metadata.alter_reason};
 const base={botId:a.id,accountId:'acct_env',cardId:'ic_env',merchantNetworkId:'merchant_env',maxTotalCents:4000,expiresAtMs:Date.now()+600000};let env,b2,pend,short;
 await f.als.run({ws:'issuerfixture'},async()=>{
  assert.equal((await f.envelopePropose({...base,expiresAtMs:Date.now()-1})).status,400);assert.equal((await f.envelopePropose({...base,botId:'agent_missing'})).status,400);
  env=(await f.envelopePropose(base)).body.envelope;assert.equal(env.status,'pending_approval');
  const dup=await f.envelopePropose(base);assert.equal(dup.status,409);assert.equal(dup.body.error,'duplicate_proposal');
  assert.equal((await f.spendSummary()).envelopes[0].hash,env.hash);
  b2=(await f.createAgent('Fixture Two','Ops','custom',false,{preset:'balanced'})).agent;
 });
 await f.als.run({ws:'other-owner'},async()=>{assert.equal((await f.envelopeDecide(env.hash,'approve')).status,404)});
 assert.notEqual(await reason(ev('evt_env0',1000)),'APPROVED');
 await f.als.run({ws:'issuerfixture'},async()=>{const d=await f.envelopeDecide(env.hash,'approve');assert.equal(d.body.code,'approved');assert.equal((await f.envelopeDecide(env.hash,'deny')).body.code,'already_decided');});
 assert.equal(await reason(ev('evt_env1',2500)),'APPROVED');
 assert.equal(await reason(ev('evt_env1',2500)),'replay_declined');
 assert.equal(await reason(ev('evt_env1b',100,'ic_env',{id:'iauth_evtenv1'})),'replay_declined');
 assert.equal(await reason(ev('evt_env2',2000)),'insufficient_envelope');
 assert.equal(await reason(ev('evt_env3',100,'ic_env',{merchant_data:{network_id:'merchant_other',category:'computer_software_stores'}})),'envelope_mismatch');
 const mapKey='gl:issuer-envelope-card:acct_env:ic_env',mapping=await f.getJ(mapKey);
 await f.setJ(mapKey,{...mapping,botId:b2.id});assert.equal(await reason(ev('evt_env4',100)),'envelope_mismatch');await f.setJ(mapKey,mapping);
 await f.als.run({ws:'issuerfixture'},async()=>{await f.r(['SET','fm:kill','1'])});assert.equal(await reason(ev('evt_env5',100)),'bot_inactive_or_killed');await f.als.run({ws:'issuerfixture'},async()=>{await f.r(['DEL','fm:kill'])});
 await f.als.run({ws:'issuerfixture'},async()=>{
  // The card is not a bound term, so identical terms on another card are still a duplicate proposal.
  assert.equal((await f.envelopePropose({...base,cardId:'ic_envpending'})).status,409);
  pend=(await f.envelopePropose({...base,cardId:'ic_envpending',maxTotalCents:4001})).body.envelope;
  short=(await f.envelopePropose({...base,cardId:'ic_envshort',maxTotalCents:4002,expiresAtMs:Date.now()+300})).body.envelope;assert.equal((await f.envelopeDecide(short.hash,'approve')).body.code,'approved');
 });
 await f.setJ('gl:issuer-envelope-card:acct_env:ic_envpending',{ws:'issuerfixture',botId:a.id,hash:pend.hash});assert.equal(await reason(ev('evt_env6',100,'ic_envpending')),'not_approved');
 await new Promise(s=>setTimeout(s,350));assert.equal(await reason(ev('evt_env7',100,'ic_envshort')),'expired');
 assert.equal(await reason(ev('evt_env8',500)),'APPROVED');
 await f.als.run({ws:'issuerfixture'},async()=>{const live=(await f.spendSummary()).envelopes.find(x=>x.hash===env.hash);assert.deepEqual([live.reservedCents,live.chargedCents,live.status],[3000,0,'approved'])});
 // Timeout: a hung envelope lookup declines at the internal deadline.
 const slowCtx={require:p=>p==='./api/index'?{issuerProcess:f.issuerProcess,issuerEnvelopeTarget:()=>new Promise(()=>{}),issuerStore:f.issuerStore}:require(p),module:{exports:{}},process:{env:{STRIPE_ISSUING_TEST_WEBHOOK_SECRET:secret}},console,Buffer,setTimeout,clearTimeout};vm.runInNewContext(fs.readFileSync(__dirname+'/issuer-webhook.cjs','utf8'),slowCtx);
 {const raw=Buffer.from(JSON.stringify(ev('evt_env9',100))),t0=Math.floor(Date.now()/1000),s='t='+t0+',v1='+crypto.createHmac('sha256',secret).update(t0+'.').update(raw).digest('hex');let o;const began=performance.now();await slowCtx.module.exports({method:'POST',body:raw,headers:{'stripe-signature':s}},{setHeader(){},status(n){this.code=n;return this},json(j){o=j}});assert.equal(o.approved,false);assert.equal(o.metadata.alter_reason,'internal_deadline');assert(performance.now()-began<1500);}
 {let o;await ctx.module.exports({url:'/api/money/envelopes',method:'POST',headers:{host:'localhost'},body:base},{setHeader(){},status(n){this.code=n;return this},json(j){o={code:this.code,j}}});assert.equal(o.code,401);}
 console.log('PASS envelope: owner propose/duplicate/decide, cross-workspace 404, approved envelope approves, unapproved/over-limit/wrong merchant/wrong bot/expired/killed/replayed event/replayed authorization decline, hung lookup declines at deadline, unauthenticated route 401. chargedCents 0.');
 console.log('PASS signed raw body, stale/bad signatures, live-mode refusal, exact mandate, concurrent atomic budget reservation, replay decline, independent issuer-test job cap, synchronous direct response and deadline. ZERO network/payment calls. Local latency '+baseLatency+'ms, not Stripe delivery proof.');
})().catch(e=>{console.error(e);process.exit(1)});
