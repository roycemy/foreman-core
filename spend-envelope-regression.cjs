// Runs the real Lua text of spend-envelope.cjs. Default: in-process fengari (devDependency) via localEval.
// REDIS_URL=redis://127.0.0.1:<port> runs the same assertions against a real, disposable loopback Redis (FLUSHALL first),
// with a second connection so fence/reserve races interleave on the server, not in this process.
const fs=require('fs'),vm=require('vm'),net=require('net'),assert=require('assert'),crypto=require('crypto');
global.fetch=()=>{throw Error('NO NETWORK OR PAYMENT')};
const E=require('./spend-envelope.cjs');
const store=new Map(),calls=[],slot=k=>{const m=/\{([^}]+)\}/.exec(k);return m?m[1]:k};
// No upstream file covers it: dependency-free RESP2 client for the loopback test Redis only.
function resp(url){
 const u=new URL(url);if(!['127.0.0.1','localhost'].includes(u.hostname))throw Error('loopback Redis only');
 const sock=net.connect(Number(u.port||6379),u.hostname),queue=[];let buf=Buffer.alloc(0);
 const parse=(b,i)=>{const nl=b.indexOf('\r\n',i);if(nl<0)return null;const t=String.fromCharCode(b[i]),line=b.toString('utf8',i+1,nl),next=nl+2;
  if(t==='+')return [line,next];if(t==='-')return [Object.assign(Error(line),{redis:true}),next];if(t===':')return [Number(line),next];
  if(t==='$'){const n=Number(line);if(n<0)return [null,next];if(b.length<next+n+2)return null;return [b.toString('utf8',next,next+n),next+n+2]}
  if(t==='*'){const n=Number(line);if(n<0)return [null,next];const out=[];let p=next;for(let j=0;j<n;j++){const r=parse(b,p);if(!r)return null;out.push(r[0]);p=r[1]}return [out,p]}
  throw Error('bad RESP')};
 sock.on('data',d=>{buf=Buffer.concat([buf,d]);for(;;){const r=parse(buf,0);if(!r)break;buf=buf.subarray(r[1]);const q=queue.shift();r[0] instanceof Error?q.reject(r[0]):q.resolve(r[0])}});
 const send=cmd=>new Promise((resolve,reject)=>{queue.push({resolve,reject});sock.write('*'+cmd.length+'\r\n'+cmd.map(x=>{const s=String(x);return '$'+Buffer.byteLength(s)+'\r\n'+s+'\r\n'}).join(''))});
 return {send,close:()=>sock.end()};
}
const real=process.env.REDIS_URL?resp(process.env.REDIS_URL):null,real2=process.env.REDIS_URL?resp(process.env.REDIS_URL):null;
const via=conn=>async cmd=>{calls.push(cmd[0]);if(cmd[0]==='EVAL'){const keys=cmd.slice(3,3+Number(cmd[2]));assert(new Set(keys.map(slot)).size===1,'cross-slot keys')}return conn?conn.send(cmd):E.localEval(store,cmd)};
const call=via(real),call2=via(real2);
const NOW=Date.parse('2026-10-29T12:00:00Z'),bot='agent_fixture',merchant='merchant_fixture',acct='acct_fixture',card='ic_fixture';
let seq=0;const terms=(extra={})=>({botId:bot,accountId:acct,cardId:card,merchantNetworkId:merchant,currency:'usd',maxTotalCents:4000,expiresAtMs:NOW+600000+(++seq),...extra});
const auth=(id,amountCents,extra={})=>({eventId:'evt_'+id,authorizationId:'iauth_'+id,botId:bot,accountId:acct,cardId:card,merchantNetworkId:merchant,currency:'usd',amountCents,...extra});
const pe=(id,kind,a,amountCents,extra={})=>({eventId:'evt_p'+id,kind,authorizationId:'iauth_'+a,currency:'usd',amountCents,...extra});
async function approved(t){const p=await E.propose(call,t,NOW);assert.equal(p.code,'proposed');assert.equal((await E.decide(call,p.hash,'approve',NOW,'owner_fixture')).code,'approved');return p.hash}
const usd=async(h,now=NOW)=>{const v=await E.read(call,h,now);return v.buckets.find(b=>b.currency==='usd')};
const tot=async h=>{const b=await usd(h);return [b.unresolvedCents,b.reservedCents,b.settledCents,b.availableCents,b.overspendCents]};
const audited=async h=>{const a=await E.audit(call,h);assert(a.ok,a.errors.join('; '));};
(async()=>{
 let mode='fengari (in-process Lua 5.3)';
 if(real){await real.send(['FLUSHALL']);const info=await real.send(['INFO','server']),ci=await real.send(['INFO','cluster']);mode='Redis '+/redis_version:(\S+)/.exec(info)[1]+(/cluster_enabled:1/.test(ci)?' cluster mode':' standalone')+' at '+process.env.REDIS_URL+' (two connections)';}
 // Binding hash: deterministic; every bound term changes it; currency is a 3-letter lowercase code.
 const base=E.bindingHash(terms({expiresAtMs:NOW+1}));assert.equal(base,E.bindingHash(terms({expiresAtMs:NOW+1})));
 for(const [k,v] of [['botId','agent_other'],['accountId','acct_other'],['cardId','ic_other'],['merchantNetworkId','merchant_other'],['currency','eur'],['maxTotalCents',4001],['expiresAtMs',NOW+2]])assert.notEqual(E.bindingHash(terms({expiresAtMs:NOW+1,[k]:v})),base,k);
 for(const bad of [{currency:'USD'},{currency:'us'},{maxTotalCents:40.5},{cardId:'card_1'},{accountId:undefined},{merchantNetworkId:'a|b'}])assert.throws(()=>E.bindingHash(terms(bad)),JSON.stringify(bad));
 // Duplicate proposal rejected; identical terms on another card are separate; owner decision binds to the hash; first decision wins.
 const t0=terms(),p=await E.propose(call,t0,NOW,'owner_fixture');assert.equal(p.code,'proposed');
 assert.equal((await E.propose(call,t0,NOW)).code,'duplicate_proposal');
 assert.equal((await E.propose(call,terms({expiresAtMs:NOW}),NOW)).code,'expired');
 assert.notEqual((await E.propose(call,{...t0,cardId:'ic_other'},NOW)).hash,p.hash);
 assert.equal((await E.reserve(call,p.hash,auth('early',100),NOW)).code,'envelope_pending_approval');
 assert.equal((await E.decide(call,'0'.repeat(64),'approve',NOW)).code,'not_found');
 const race=await Promise.all([E.decide(call,p.hash,'approve',NOW,'owner_fixture'),E.decide(call2,p.hash,'deny',NOW,'owner_fixture')]);
 assert.equal(race.filter(x=>x.code==='approved').length+race.filter(x=>x.code==='denied').length,1);const h=p.hash;
 if(race[0].code!=='approved'){console.log('note: deny won the decision race on this run');}
 const H=race[0].code==='approved'?h:await approved(terms());
 // Atomic reservation against the $40 envelope: accepted cents start unresolved until provider evidence.
 let x=await E.reserve(call,H,auth('a',2500),NOW);assert.deepEqual([x.code,x.usedCents,x.remainingCents,x.chargedCents],['reserved',2500,1500,0]);
 assert.deepEqual(await tot(H),[2500,0,0,1500,0]);
 const pair=await Promise.all([E.reserve(call,H,auth('b',1000),NOW),E.reserve(call2,H,auth('c',1000),NOW)]);
 assert.deepEqual(pair.map(y=>y.code).sort(),['insufficient_available','reserved']);
 assert.equal((await E.reserve(call,H,auth('e',500),NOW)).code,'reserved');assert.equal((await E.reserve(call,H,auth('d',1),NOW)).code,'insufficient_available');
 assert.deepEqual(await tot(H),[4000,0,0,0,0]);await audited(H);
 // Terms other than amount must match; expiry refuses at use; replay of event or authorization id refuses.
 const H2=await approved(terms());
 for(const [id,ex] of [['m1',{merchantNetworkId:'merchant_other'}],['m2',{botId:'agent_other'}],['m3',{currency:'eur'}],['m5',{cardId:'ic_other'}],['m6',{accountId:'acct_other'}]])assert.equal((await E.reserve(call,H2,auth(id,100,ex),NOW)).code,'envelope_mismatch',id);
 assert.equal((await E.reserve(call,H2,auth('m4',100),NOW+900000)).code,'envelope_expired');
 assert.equal((await E.reserve(call,H2,auth('m1',100),NOW)).code,'replay_declined');
 assert.equal((await E.reserve(call,H2,auth('m7',100,{authorizationId:'iauth_m1'}),NOW)).code,'replay_declined');
 assert.deepEqual(await tot(H2),[0,0,0,4000,0]);
 // Signed webhook replay rejected, using the existing issuer-webhook.cjs verify().
 const secret='whsec_disposable_fixture_not_a_real_secret',hctx={require:q=>q==='./api/index'?{}:require(q),module:{exports:{}},process:{env:{}},console,Buffer,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(__dirname+'/issuer-webhook.cjs','utf8'),hctx);const verify=hctx.module.exports.verify;
 const H3=await approved(terms());
 const raw=Buffer.from(JSON.stringify({id:'evt_replay',account:acct,type:'issuing_authorization.request',livemode:false,data:{object:{id:'iauth_replay',livemode:false,card,pending_request:{amount:1000,currency:'usd'},merchant_data:{network_id:merchant}}}}));
 const ts=Math.floor(Date.now()/1000),sig='t='+ts+',v1='+crypto.createHmac('sha256',secret).update(ts+'.').update(raw).digest('hex');
 const deliver=async(body,eventId)=>{assert(verify(body,sig,secret));const ev=JSON.parse(body),o=ev.data.object;return E.reserve(call,H3,{eventId:eventId||ev.id,authorizationId:o.id,botId:bot,accountId:ev.account,cardId:o.card,merchantNetworkId:o.merchant_data.network_id,currency:o.pending_request.currency,amountCents:o.pending_request.amount},NOW)};
 assert.equal((await deliver(raw)).code,'reserved');assert.equal((await deliver(raw)).code,'replay_declined');assert.equal((await deliver(raw,'evt_redelivered')).code,'replay_declined');
 assert.equal(verify(Buffer.from(raw.toString().replace('1000','100')),sig,secret),false);assert.deepEqual(await tot(H3),[1000,0,0,3000,0]);
 // FIX 1, fence race, both interleavings. Order A: reserve lands first, fence finds it and frees nothing.
 const F=await approved(terms());
 assert.equal((await E.reserve(call,F,auth('fa',700),NOW)).code,'reserved');
 assert.deepEqual(await E.fence(call,F,'iauth_fa',NOW),{code:'found',state:'open'});assert.deepEqual(await tot(F),[700,0,0,3300,0]);
 // Order B: fence lands first; the late reserve re-checks inside its own script and refuses, so nothing is spent.
 assert.equal((await E.fence(call,F,'iauth_fb',NOW)).code,'fenced');
 assert.equal((await E.reserve(call,F,auth('fb',700),NOW)).code,'replay_declined');assert.deepEqual(await tot(F),[700,0,0,3300,0]);
 // Concurrent: 40 fence/reserve pairs sent on two connections; each authorization ends either reserved (fence found) or fenced (reserve refused), never both.
 const RC=await approved(terms({maxTotalCents:100000}));let wonR=0,wonF=0;
 for(let i=0;i<40;i++){const id='race'+i,flip=i%2===0;const [rv,fv]=await Promise.all(flip?[E.reserve(call,RC,auth(id,100),NOW),E.fence(call2,RC,'iauth_'+id,NOW)]:[E.reserve(call2,RC,auth(id,100),NOW),E.fence(call,RC,'iauth_'+id,NOW)]);
  if(rv.code==='reserved'){assert.equal(fv.code,'found');wonR++}else{assert.equal(rv.code,'replay_declined');assert.equal(fv.code,'fenced');wonF++}}
 assert.equal((await usd(RC)).unresolvedCents,wonR*100);await audited(RC);
 // Provider evidence: confirmation moves unresolved -> reserved; partial capture leaves the rest reserved (per-cent buckets).
 const P=await approved(terms());
 await E.reserve(call,P,auth('p1',1000),NOW);
 assert.equal((await E.provider(call,P,pe(1,'auth','p1',1000,{approved:true,status:'pending'}),NOW)).code,'confirmed');assert.deepEqual(await tot(P),[0,1000,0,3000,0]);
 assert.equal((await E.provider(call,P,pe(2,'capture','p1',600,{transactionId:'ipi_1'}),NOW)).code,'capture');assert.deepEqual(await tot(P),[0,400,600,3000,0]);
 const pv=(await E.read(call,P,NOW)).authorizations.find(a=>a.authorizationId==='iauth_p1').amounts[0];assert.deepEqual([pv.reservedCents,pv.settledCents],[400,600]);
 assert.equal((await E.provider(call,P,pe(3,'auth','p1',0,{approved:true,status:'closed'}),NOW)).code,'closed');assert.deepEqual(await tot(P),[0,0,600,3400,0]);
 // Duplicate provider event id and duplicate transaction id apply once.
 assert.equal((await E.provider(call,P,pe(2,'capture','p1',600,{transactionId:'ipi_1'}),NOW)).code,'duplicate');
 assert.equal((await E.provider(call,P,pe(4,'capture','p1',600,{transactionId:'ipi_1'}),NOW)).code,'duplicate');assert.deepEqual(await tot(P),[0,0,600,3400,0]);
 // Refunds reduce settled; gross capture stays in history; excess refund is a discrepancy with no bucket change.
 assert.equal((await E.provider(call,P,pe(5,'refund','p1',200,{transactionId:'ipi_2'}),NOW)).code,'refund');assert.deepEqual(await tot(P),[0,0,400,3600,0]);
 assert.equal((await E.provider(call,P,pe(6,'refund','p1',900,{transactionId:'ipi_3'}),NOW)).code,'discrepancy:refund_exceeds_settled');assert.deepEqual(await tot(P),[0,0,0,4000,0]);
 assert((await E.read(call,P,NOW)).history.some(e=>e.kind==='capture'&&e.ds===600));await audited(P);
 // Capture after a local decline and after release: provider authoritative, enters settled with a discrepancy entry.
 const D=await approved(terms({maxTotalCents:1000}));
 assert.equal((await E.reserve(call,D,auth('big',5000),NOW)).code,'insufficient_available');
 assert.equal((await E.provider(call,D,pe(10,'capture','big',300,{transactionId:'ipi_d1'}),NOW)).code,'discrepancy:capture_after_declined');
 await E.reserve(call,D,auth('rel',200),NOW);assert.equal((await E.provider(call,D,pe(11,'auth','rel',200,{approved:false,status:'closed'}),NOW)).code,'released');
 assert.equal((await E.provider(call,D,pe(12,'capture','rel',200,{transactionId:'ipi_d2'}),NOW)).code,'discrepancy:capture_after_released');
 assert.deepEqual(await tot(D),[0,0,500,500,0]);assert.equal((await E.read(call,D,NOW)).discrepancies.length,2);await audited(D);
 // Capture beyond reserved: excess enters settled as a discrepancy; it is overspend only once C crosses max, and never also unresolved.
 const O=await approved(terms({maxTotalCents:1000}));
 await E.reserve(call,O,auth('o1',500),NOW);await E.provider(call,O,pe(20,'auth','o1',500,{approved:true,status:'pending'}),NOW);
 assert.equal((await E.provider(call,O,pe(21,'capture','o1',700,{transactionId:'ipi_o1'}),NOW)).code,'discrepancy:capture_beyond_reserved');
 assert.deepEqual(await tot(O),[0,0,700,300,0]);
 await E.reserve(call,O,auth('o2',300),NOW);await E.provider(call,O,pe(22,'auth','o2',300,{approved:true,status:'pending'}),NOW);
 assert.equal((await E.provider(call,O,pe(23,'capture','o2',450,{transactionId:'ipi_o2'}),NOW)).code,'discrepancy:capture_beyond_reserved');
 assert.deepEqual(await tot(O),[0,0,1150,0,150]);await audited(O);
 // Store-down persistence: unresolved stays unresolved, counted in C and visible as stuck; nothing releases it with time.
 const S=await approved(terms({expiresAtMs:NOW+86400000*30}));
 await E.reserve(call,S,auth('s1',800),NOW);
 const down=async()=>{throw Error('store unreachable')};
 await assert.rejects(E.provider(down,S,pe(30,'auth','s1',800,{approved:false,status:'closed'}),NOW+1000));
 for(const later of [NOW+1000,NOW+E.STUCK_MS,NOW+86400000*7]){const v=await E.read(call,S,later),b=v.buckets[0];assert.deepEqual([b.unresolvedCents,b.availableCents],[800,3200]);assert.equal(v.stuck.length,later>=NOW+E.STUCK_MS?1:0);}
 // Manual adjudication: only stuck unresolved cents move, and an audit entry names the owner.
 assert.equal((await E.adjudicate(call,S,'iauth_s1','declined',NOW+1000,'owner_fixture','checked dashboard')).code,'not_stuck');
 assert.deepEqual(await E.adjudicate(call,S,'iauth_s1','declined',NOW+E.STUCK_MS,'owner_fixture','issuer shows declined'),{code:'adjudicated',movedCents:800});
 const adj=(await E.read(call,S,NOW+E.STUCK_MS)).history.find(e=>e.kind==='manual_adjudication:declined');assert.deepEqual([adj.actor,adj.note,adj.du],['owner_fixture','issuer shows declined',-800]);
 assert.equal((await E.adjudicate(call,S,'iauth_s1','declined',NOW+E.STUCK_MS,'owner_fixture','')).code,'not_unresolved');
 assert.equal((await E.reserve(call,S,auth('s1',800),NOW)).code,'replay_declined');
 assert.deepEqual(await tot(S),[0,0,0,3200,0]);assert.equal((await usd(S)).declinedPendingCents,800);
 assert.equal((await E.provider(call,S,pe(31,'capture','s1',800,{transactionId:'ipi_s1'}),NOW)).code,'capture_resolved_declined_pending');
 await E.reserve(call,S,auth('s2',100),NOW);assert.equal((await E.adjudicate(call,S,'iauth_s2','approved',NOW+E.STUCK_MS,'owner_fixture','issuer approved')).code,'adjudicated');
 assert.deepEqual(await tot(S),[0,100,800,3100,0]);await audited(S);
 // ---- Contract R1-R8: declined_pending stays held. available = max - settled - held; held = unresolved + reserved + declined_pending.
 // $10 limit throughout the T-cases. Times: a manual decline needs the item stuck (NOW + STUCK_MS).
 const row=async hh=>{const flat=await call(['HGETALL',E.envelopeKey(hh)]),o={};for(let i=0;i<flat.length;i+=2)o[flat[i]]=flat[i+1];return o};
 const AT=NOW+E.STUCK_MS,dpOf=async h=>(await usd(h)).declinedPendingCents,heldOf=async h=>(await usd(h)).heldCents;
 const decline=async(h,id,note='issuer shows declined')=>{const r=await E.adjudicate(call,h,'iauth_'+id,'declined',AT,'owner_fixture',note);assert.equal(r.code,'adjudicated');return r};
 // T1: $10 limit, $8 approved, decline, $9 request -> declined, available $2. Then $8 captures -> settled $8, held 0, available $2, overspend $0.
 {const h=await approved(terms({maxTotalCents:1000}));
  assert.equal((await E.reserve(call,h,auth('t1a',800),NOW)).code,'reserved');await decline(h,'t1a');
  assert.deepEqual([await dpOf(h),await heldOf(h)],[800,800]);assert.deepEqual(await tot(h),[0,0,0,200,0]);
  const nine=await E.reserve(call,h,auth('t1b',900),NOW);assert.equal(nine.code,'insufficient_available');assert.deepEqual(await tot(h),[0,0,0,200,0]);
  assert.equal((await E.provider(call,h,pe(70,'capture','t1a',800,{transactionId:'ipi_t1'}),AT)).code,'capture_resolved_declined_pending');
  const v=await E.read(call,h,AT),b=v.buckets[0];assert.deepEqual([b.settledCents,b.heldCents,b.declinedPendingCents,b.availableCents,b.overspendCents],[800,0,0,200,0]);
  assert.equal(v.discrepancies.length,0);assert.equal(v.notices.length,0);assert.equal(v.declinedPending.length,0);await audited(h);}
 // T2: $10 limit, $8 approved, decline, void -> available $10, $9 approved, $9 captures -> settled $9, available $1, overspend $0.
 {const h=await approved(terms({maxTotalCents:1000}));
  await E.reserve(call,h,auth('t2a',800),NOW);await decline(h,'t2a');assert.deepEqual(await tot(h),[0,0,0,200,0]);
  assert.equal((await E.provider(call,h,pe(71,'auth','t2a',0,{approved:true,status:'closed'}),AT)).code,'closed');
  assert.deepEqual([await dpOf(h),await heldOf(h)],[0,0]);assert.deepEqual(await tot(h),[0,0,0,1000,0]);
  assert.equal((await E.reserve(call,h,auth('t2b',900),NOW)).code,'reserved');
  assert.equal((await E.provider(call,h,pe(72,'capture','t2b',900,{transactionId:'ipi_t2'}),AT)).code,'capture');
  const b=await usd(h);assert.deepEqual([b.settledCents,b.heldCents,b.availableCents,b.overspendCents],[900,0,100,0]);await audited(h);
  // expiry/reversal of another declined item releases it the same way (any non-pending terminal status).
  const g=await approved(terms({maxTotalCents:1000}));await E.reserve(call,g,auth('t2c',600),NOW);await decline(g,'t2c');
  assert.equal((await E.provider(call,g,pe(73,'auth','t2c',0,{approved:true,status:'reversed'}),AT)).code,'closed');assert.deepEqual(await tot(g),[0,0,0,1000,0]);await audited(g);}
 // T3: decline, then timeout (days pass, no provider event), then capture. Nothing releases on time (R5); the capture settles with a
 // discrepancy entry because it differs from what was held; no double release when the issuer later closes the authorization.
 {const h=await approved(terms({maxTotalCents:1000}));
  await E.reserve(call,h,auth('t3a',800),NOW);await decline(h,'t3a');
  const later=NOW+86400000*7,bl=(await E.read(call,h,later)).buckets[0];assert.deepEqual([bl.declinedPendingCents,bl.availableCents],[800,200]);
  assert.deepEqual((await E.read(call,h,later)).notices.map(n=>n.kind),['manual_adjudication:declined']);
  assert.equal((await E.provider(call,h,pe(74,'capture','t3a',700,{transactionId:'ipi_t3'}),later)).code,'discrepancy:capture_differs_from_held');
  let v=await E.read(call,h,later),b=v.buckets[0];assert.deepEqual([b.settledCents,b.heldCents,b.availableCents,b.overspendCents],[700,0,300,0]);
  assert.equal(v.discrepancies.length,1);assert.deepEqual(v.notices.map(n=>n.kind),['discrepancy:capture_differs_from_held']);
  assert.equal((await E.provider(call,h,pe(75,'auth','t3a',0,{approved:true,status:'closed'}),later)).code,'closed');
  v=await E.read(call,h,later);assert.deepEqual(await tot(h),[0,0,700,300,0]);
  assert.equal(v.history.reduce((n,e)=>n+e.dd,0),0,'declined_pending cents were released exactly once (+800 then -800)');
  assert.equal((await E.ack(call,h,v.notices[0].seq,later,'owner_fixture')).code,'acknowledged');assert.equal((await E.read(call,h,later)).notices.length,0);await audited(h);}
 // T4: decline, acknowledgement, capture. Acknowledging hides the notice and never releases (R6).
 {const h=await approved(terms({maxTotalCents:1000}));
  await E.reserve(call,h,auth('t4a',800),NOW);await decline(h,'t4a');
  let v=await E.read(call,h,AT);assert.equal(v.notices.length,1);
  assert.equal((await E.ack(call,h,v.notices[0].seq,AT,'owner_fixture')).code,'acknowledged');
  v=await E.read(call,h,AT);assert.equal(v.notices.length,0);assert.deepEqual([v.buckets[0].declinedPendingCents,v.buckets[0].availableCents],[800,200]);
  const ackEntry=v.history.find(e=>e.kind==='notices_acknowledged');assert.deepEqual([ackEntry.du,ackEntry.dr,ackEntry.ds,ackEntry.dd],[0,0,0,0]);
  assert.equal((await E.reserve(call,h,auth('t4b',300),NOW)).code,'insufficient_available');
  assert.equal((await E.provider(call,h,pe(76,'capture','t4a',800,{transactionId:'ipi_t4'}),AT)).code,'capture_resolved_declined_pending');
  assert.deepEqual(await tot(h),[0,0,800,200,0]);await audited(h);}
 // T5: FENCE during declined_pending -> cents still held, and a reserve sees them.
 {const h=await approved(terms({maxTotalCents:1000}));
  await E.reserve(call,h,auth('t5a',800),NOW);await decline(h,'t5a');
  assert.deepEqual(await E.fence(call,h,'iauth_t5a',AT),{code:'found',state:'open'});
  assert.deepEqual([await dpOf(h),await heldOf(h)],[800,800]);assert.deepEqual(await tot(h),[0,0,0,200,0]);
  assert.equal((await E.reserve(call,h,auth('t5b',300),NOW)).code,'insufficient_available');
  assert.equal((await E.reserve(call,h,auth('t5c',200),NOW)).code,'reserved');assert.deepEqual(await tot(h),[200,0,0,0,0]);
  assert.equal((await E.fence(call,h,'iauth_t5z',AT)).code,'fenced');assert.equal(await dpOf(h),800);await audited(h);}
 // T6: duplicate capture webhook after a decline -> one settled entry.
 {const h=await approved(terms({maxTotalCents:1000}));
  await E.reserve(call,h,auth('t6a',800),NOW);await decline(h,'t6a');
  assert.equal((await E.provider(call,h,pe(77,'capture','t6a',800,{transactionId:'ipi_t6'}),AT)).code,'capture_resolved_declined_pending');
  assert.equal((await E.provider(call,h,pe(77,'capture','t6a',800,{transactionId:'ipi_t6'}),AT)).code,'duplicate');
  assert.equal((await E.provider(call,h,pe(78,'capture','t6a',800,{transactionId:'ipi_t6'}),AT)).code,'duplicate');
  const v=await E.read(call,h,AT);assert.equal(v.history.filter(e=>e.kind==='capture_resolved_declined_pending').length,1);assert.deepEqual(await tot(h),[0,0,800,200,0]);await audited(h);}
 // T7: merchant canonicalization (hash_version 2) and pre-branch approvals (hash_version 1).
 {const form=m=>terms({merchantNetworkId:m,expiresAtMs:NOW+999000});
  assert.equal(E.bindingHash(form('Acme Corp')),E.bindingHash(form(' Acme  Corp ')));assert.equal(E.bindingHash(form('Acme Corp')),E.bindingHash(form('Acme\t\n Corp')));
  assert.notEqual(E.bindingHash(form('Acme Corp')),E.bindingHash(form('acme corp')),'case stays as-is');
  assert.equal(E.canon(' Acme  Corp '),'Acme Corp');assert.notEqual(E.bindingHashV1(form('Acme  Corp')),E.bindingHash(form('Acme  Corp')),'v1 hashed the raw merchant');
  const p1=await E.propose(call,form('Acme Corp'),NOW);assert.equal(p1.code,'proposed');
  assert.deepEqual([(await E.propose(call,form(' Acme  Corp '),NOW)).code,(await E.propose(call,form(' Acme  Corp '),NOW)).hash],['duplicate_proposal',p1.hash]);
  assert.equal((await E.decide(call,p1.hash,'approve',NOW,'owner_fixture')).code,'approved');
  assert.deepEqual(await E.verify(call,p1.hash),{ok:true,version:2});assert.equal((await E.read(call,p1.hash,NOW)).hashVersion,2);assert.equal((await row(p1.hash)).hash_version,'2');
  assert.equal((await E.reserve(call,p1.hash,auth('m7a',100,{merchantNetworkId:' Acme   Corp '}),NOW)).code,'reserved');
  assert.equal((await E.reserve(call,p1.hash,auth('m7b',100,{merchantNetworkId:'ACME Corp'}),NOW)).code,'envelope_mismatch');
  // a v1-era envelope: written by the pre-branch algorithm (raw merchant hashed, no hash_version row), then approved
  const legacyTerms=form('Acme  Corp'),h1=E.bindingHashV1(legacyTerms),h2=E.bindingHash(legacyTerms);assert.notEqual(h1,h2);
  assert.deepEqual(await call(['EVAL',E.PROPOSE,'1',E.envelopeKey(h1),h1,bot,acct,card,'Acme  Corp','usd','4000',String(legacyTerms.expiresAtMs),String(NOW),'owner_fixture','']),['proposed']);
  assert.equal((await E.decide(call,h1,'approve',NOW,'owner_fixture')).code,'approved');
  assert.deepEqual(await E.verify(call,h1),{ok:true,version:1});assert.equal((await E.read(call,h1,NOW)).hashVersion,1);assert.equal((await row(h1)).hash_version,undefined,'existing rows are not rewritten');
  assert.equal((await E.reserve(call,h1,auth('m7c',100,{merchantNetworkId:'Acme Corp'}),NOW)).code,'reserved','canonical event merchant matches the legacy row');
  assert.deepEqual([(await E.propose(call,form(' Acme  Corp '),NOW)).code,(await E.propose(call,form(' Acme  Corp '),NOW)).hash],['duplicate_proposal',h1],'same merchant proposed again falls back to the v1 row');
  // a v2-stamped row never verifies through the v1 path, and tampered stored terms fail either way
  const tamper=async(h,f,v)=>real?real.send(['HSET',E.envelopeKey(h),f,v]):store.get(E.envelopeKey(h)).set(f,v);
  await tamper(h1,'merchant','Other Co');assert.deepEqual(await E.verify(call,h1),{ok:false,code:'binding_invalid'});
  await tamper(p1.hash,'maxCents','999999');assert.deepEqual(await E.verify(call,p1.hash),{ok:false,code:'binding_invalid'});
  assert.deepEqual(await E.verify(call,'0'.repeat(64)),{ok:false,code:'no_envelope'});await audited(p1.hash);}
 // T8 (extended 40-pair harness): with declined_pending cents in the mix, 40 concurrent reserves over two connections never exceed
 // available; exactly the number that fit are approved; the declined_pending cents stay held throughout; fence interleaves too.
 {const h=await approved(terms({maxTotalCents:3000}));
  await E.reserve(call,h,auth('t8a',2000),NOW);await decline(h,'t8a');assert.deepEqual(await tot(h),[0,0,0,1000,0]);
  const out=await Promise.all(Array.from({length:40},(_,i)=>E.reserve(i%2?call2:call,h,auth('t8r'+i,100),NOW)));
  assert.equal(out.filter(x=>x.code==='reserved').length,10);assert.equal(out.filter(x=>x.code==='insufficient_available').length,30);
  const b=await usd(h);assert.deepEqual([b.unresolvedCents,b.declinedPendingCents,b.usedCents,b.availableCents,b.overspendCents],[1000,2000,3000,0,0]);
  const mix=await Promise.all(Array.from({length:40},(_,i)=>i%2?E.fence(call2,h,'iauth_t8f'+i,AT):E.reserve(call,h,auth('t8g'+i,100),NOW)));
  assert(mix.every(x=>['fenced','insufficient_available'].includes(x.code)));assert.deepEqual(await tot(h),[1000,0,0,0,0]);assert.equal(await dpOf(h),2000);await audited(h);}
 // Shuffled delivery: every order of the same provider events ends in identical totals; duplicates mixed in apply once.
 const evs=[pe(40,'auth','sh',1000,{approved:true,status:'pending'}),pe(41,'capture','sh',600,{transactionId:'ipi_sh1'}),pe(42,'auth','sh',0,{approved:true,status:'closed'}),pe(43,'refund','sh',100,{transactionId:'ipi_sh2'})];
 const perms=a=>a.length<2?[a]:a.flatMap((v,i)=>perms([...a.slice(0,i),...a.slice(i+1)]).map(r=>[v,...r]));
 const finals=new Set();
 for(const order of perms(evs)){const hS=await approved(terms());await E.reserve(call,hS,auth('sh',1000),NOW);for(const e of [...order,order[0],order[2]])await E.provider(call,hS,e,NOW);finals.add(JSON.stringify(await tot(hS)));await audited(hS);}
 assert.deepEqual([...finals],[JSON.stringify([0,0,500,3500,0])]);
 // Multi-currency: buckets are per currency; max applies only to the envelope currency.
 const M=await approved(terms());await E.reserve(call,M,auth('mc',1000),NOW);await E.provider(call,M,pe(50,'auth','mc',1000,{approved:true,status:'pending'}),NOW);
 await E.provider(call,M,{...pe(51,'capture','mc',900,{transactionId:'ipi_mc1'}),currency:'eur'},NOW);
 const mv=await E.read(call,M,NOW),mu=mv.buckets.find(b=>b.currency==='usd'),me=mv.buckets.find(b=>b.currency==='eur');
 assert.deepEqual([mu.reservedCents,mu.settledCents,mu.availableCents],[1000,0,3000]);assert.deepEqual([me.maxCents,me.settledCents,me.overspendCents],[0,900,900]);await audited(M);
 // Audit is falsifiable: a corrupted bucket total or per-authorization amount is reported.
 if(!real){const k=E.envelopeKey(M),saved=store.get(k).get('b:usd:r');store.get(k).set('b:usd:r','999');assert(!(await E.audit(call,M)).ok);store.get(k).set('b:usd:r',saved);store.get(k).set('a:iauth_mc:usd:r','5');assert(!(await E.audit(call,M)).ok);store.get(k).set('a:iauth_mc:usd:r','1000');await audited(M);}
 if(!real)assert.throws(()=>E.localEval(store,['EVAL',E.RESERVE,'2','{a}x','{b}y']),/CROSSSLOT/);
 assert(calls.every(c=>['EVAL','HGETALL','HGET','HMGET','HSET'].includes(c)));
 const evals=calls.filter(c=>c==='EVAL').length;if(real){real.close();real2.close();}
 console.log('PASS binding hash (7 terms, per-currency), duplicate proposal, first decision wins, $40 atomic reservation (accepted cents unresolved until provider evidence), term mismatch, expiry, signed replay; fence both orders + 40 concurrent fence/reserve pairs ('+wonR+' reserve-first, '+wonF+' fence-first, never both); per-cent partial capture; duplicate event/transaction ids once; refunds reduce settled; capture after decline/release as discrepancy; capture beyond reserved only overspends past max; store-down unresolved persists 7 days and shows stuck; owner adjudication with audit entry; declined_pending stays held (T1-T6, T8), canonical merchant hash v2 with v1 fallback (T7); 24 shuffled orders identical; per-currency buckets; audit catches corruption. '+evals+' EVALs, single-slot keys, ZERO network/payment calls beyond the test store. Lua run in '+mode+', not Upstash.');
})().catch(e=>{console.error(e);process.exit(1)});
