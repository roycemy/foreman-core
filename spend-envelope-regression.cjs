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
 assert.deepEqual(pair.map(y=>y.code).sort(),['insufficient_envelope','reserved']);
 assert.equal((await E.reserve(call,H,auth('e',500),NOW)).code,'reserved');assert.equal((await E.reserve(call,H,auth('d',1),NOW)).code,'closed_envelope');
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
 assert.equal((await E.reserve(call,D,auth('big',5000),NOW)).code,'insufficient_envelope');
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
 assert.equal((await E.provider(call,S,pe(31,'capture','s1',800,{transactionId:'ipi_s1'}),NOW)).code,'discrepancy:capture_after_adjudicated_declined');
 await E.reserve(call,S,auth('s2',100),NOW);assert.equal((await E.adjudicate(call,S,'iauth_s2','approved',NOW+E.STUCK_MS,'owner_fixture','issuer approved')).code,'adjudicated');
 assert.deepEqual(await tot(S),[0,100,800,3100,0]);await audited(S);
 // Manual decline is provisional: budget returns, the authorization stays open to provider capture; a later capture is a
 // discrepancy in settled, overspends once C crosses max, and raises an owner notice until acknowledged.
 const MD=await approved(terms({maxTotalCents:1000}));
 await E.reserve(call,MD,auth('md1',800),NOW);
 assert.equal((await E.adjudicate(call,MD,'iauth_md1','declined',NOW+E.STUCK_MS,'owner_fixture','issuer shows declined')).code,'adjudicated');
 {const v=await E.read(call,MD,NOW+E.STUCK_MS);assert.deepEqual(v.provisional.map(x=>[x.authorizationId,x.manual]),[['iauth_md1','declined']]);assert.equal(v.notices.length,0);}
 assert.deepEqual(await tot(MD),[0,0,0,1000,0]);
 assert.equal((await E.reserve(call,MD,auth('md2',900),NOW)).code,'reserved');assert.deepEqual(await tot(MD),[900,0,0,100,0]);
 assert.equal((await E.provider(call,MD,pe(60,'capture','md1',800,{transactionId:'ipi_md1'}),NOW)).code,'discrepancy:capture_after_adjudicated_declined');
 {const v=await E.read(call,MD,NOW),b=v.buckets[0];assert.deepEqual([b.unresolvedCents,b.settledCents,b.availableCents,b.overspendCents],[900,800,0,700]);
  assert.deepEqual(v.notices.map(n=>[n.kind,n.authorizationId,n.ds]),[['discrepancy:capture_after_adjudicated_declined','iauth_md1',800]]);assert.equal(v.provisional.length,0);
  assert.equal((await E.ack(call,MD,v.notices[0].seq,NOW,'owner_fixture')).code,'acknowledged');assert.equal((await E.ack(call,MD,v.notices[0].seq,NOW,'owner_fixture')).code,'already_acknowledged');assert.equal((await E.ack(call,MD,99999,NOW)).code,'invalid_seq');}
 assert.equal((await E.read(call,MD,NOW)).notices.length,0);await audited(MD);
 // Same rule when the authorization still holds other cents (partial capture before the manual decline).
 const MP=await approved(terms());
 await E.reserve(call,MP,auth('mp1',500),NOW);await E.provider(call,MP,pe(61,'capture','mp1',200,{transactionId:'ipi_mp1'}),NOW);
 assert.equal((await E.adjudicate(call,MP,'iauth_mp1','declined',NOW+E.STUCK_MS,'owner_fixture','rest declined at issuer')).code,'adjudicated');assert.deepEqual(await tot(MP),[0,0,200,3800,0]);
 assert.equal((await E.provider(call,MP,pe(62,'capture','mp1',100,{transactionId:'ipi_mp2'}),NOW)).code,'discrepancy:capture_after_adjudicated_declined');assert.deepEqual(await tot(MP),[0,0,300,3700,0]);
 assert.equal((await E.read(call,MP,NOW)).notices.length,1);await audited(MP);
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
 assert(calls.every(c=>c==='EVAL'||c==='HGETALL'));
 const evals=calls.filter(c=>c==='EVAL').length;if(real){real.close();real2.close();}
 console.log('PASS binding hash (7 terms, per-currency), duplicate proposal, first decision wins, $40 atomic reservation (accepted cents unresolved until provider evidence), term mismatch, expiry, signed replay; fence both orders + 40 concurrent fence/reserve pairs ('+wonR+' reserve-first, '+wonF+' fence-first, never both); per-cent partial capture; duplicate event/transaction ids once; refunds reduce settled; capture after decline/release as discrepancy; capture beyond reserved only overspends past max; store-down unresolved persists 7 days and shows stuck; owner adjudication with audit entry; manual decline provisional (later capture = discrepancy + overspend + notice, ack once); 24 shuffled orders identical; per-currency buckets; audit catches corruption. '+evals+' EVALs, single-slot keys, ZERO network/payment calls beyond the test store. Lua run in '+mode+', not Upstash.');
})().catch(e=>{console.error(e);process.exit(1)});
