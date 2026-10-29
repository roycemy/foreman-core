// Runs the real Lua text of spend-envelope.cjs. Default: in-process fengari (devDependency) via localEval.
// REDIS_URL=redis://127.0.0.1:<port> runs the same assertions against a real, disposable loopback Redis (FLUSHALL first).
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
const real=process.env.REDIS_URL?resp(process.env.REDIS_URL):null;
async function call(cmd){
 calls.push(cmd[0]);
 if(cmd[0]==='EVAL'){const keys=cmd.slice(3,3+Number(cmd[2]));assert(new Set(keys.map(slot)).size===1,'cross-slot keys')}
 return real?real.send(cmd):E.localEval(store,cmd);
}
const NOW=Date.parse('2026-10-29T12:00:00Z'),bot='agent_fixture',merchant='merchant_fixture',acct='acct_fixture',card='ic_fixture';
const terms=(extra={})=>({botId:bot,accountId:acct,cardId:card,merchantNetworkId:merchant,currency:'usd',maxTotalCents:4000,expiresAtMs:NOW+600000,...extra});
const auth=(id,amountCents,extra={})=>({eventId:'evt_'+id,authorizationId:'iauth_'+id,botId:bot,accountId:acct,cardId:card,merchantNetworkId:merchant,currency:'usd',amountCents,...extra});
const row=async hash=>{const flat=await call(['HGETALL',E.envelopeKey(hash)]),o={};for(let i=0;i<flat.length;i+=2)o[flat[i]]=flat[i+1];return o};
async function approved(t){const p=await E.propose(call,t,NOW);assert.equal(p.code,'proposed');assert.equal((await E.decide(call,p.hash,'approve',NOW)).code,'approved');return p.hash}
(async()=>{
 let mode='fengari (in-process Lua 5.3)';
 if(real){await real.send(['FLUSHALL']);const info=await real.send(['INFO','server']),ci=await real.send(['INFO','cluster']);mode='Redis '+/redis_version:(\S+)/.exec(info)[1]+(/cluster_enabled:1/.test(ci)?' cluster mode':' standalone')+' at '+process.env.REDIS_URL;}
 // 1. Binding hash: deterministic, and every bound term changes it.
 const base=E.bindingHash(terms());assert.equal(base,E.bindingHash(terms()));
 for(const [k,v] of [['botId','agent_other'],['accountId','acct_other'],['cardId','ic_other'],['merchantNetworkId','merchant_other'],['maxTotalCents',4001],['expiresAtMs',NOW+600001]])assert.notEqual(E.bindingHash(terms({[k]:v})),base,k);
 assert.throws(()=>E.bindingHash(terms({currency:'eur'})));assert.throws(()=>E.bindingHash(terms({maxTotalCents:40.5})));assert.throws(()=>E.bindingHash(terms({cardId:'card_1'})));assert.throws(()=>E.bindingHash(terms({accountId:undefined})));
 // 3. Duplicate proposal rejected; expired proposal refused.
 const p=await E.propose(call,terms(),NOW);assert.equal(p.code,'proposed');assert.equal((await row(p.hash)).status,'pending_approval');
 assert.equal((await E.propose(call,terms(),NOW)).code,'duplicate_proposal');
 assert.equal((await E.propose(call,terms({expiresAtMs:NOW}),NOW)).code,'expired');
 // Identical terms on another card or issuer account are a separate envelope, not a duplicate.
 const otherCard=await E.propose(call,terms({cardId:'ic_other'}),NOW);assert.equal(otherCard.code,'proposed');assert.notEqual(otherCard.hash,p.hash);
 assert.equal((await E.propose(call,terms({accountId:'acct_other'}),NOW)).code,'proposed');
 assert.equal((await E.propose(call,terms({cardId:'ic_other'}),NOW)).code,'duplicate_proposal');
 // Approval row binds to the hash the owner saw; no reservation before approval; first decision wins.
 assert.equal((await E.reserve(call,p.hash,auth('early',100),NOW)).code,'not_approved');
 assert.equal((await E.decide(call,'0'.repeat(64),'approve',NOW)).code,'not_found');
 assert.equal((await E.decide(call,'bad','approve',NOW)).code,'binding_mismatch');
 const race=await Promise.all([E.decide(call,p.hash,'approve',NOW),E.decide(call,p.hash,'deny',NOW)]);
 assert.deepEqual(race.map(x=>x.code),['approved','already_decided']);assert.equal((await row(p.hash)).status,'approved');
 // 2. Atomic reservation against the $40 envelope.
 let x=await E.reserve(call,p.hash,auth('a',2500),NOW);assert.deepEqual([x.code,x.reservedCents,x.remainingCents,x.chargedCents],['reserved',2500,1500,0]);
 const pair=await Promise.all([E.reserve(call,p.hash,auth('b',1000),NOW),E.reserve(call,p.hash,auth('c',1000),NOW)]);
 assert.deepEqual(pair.map(y=>y.code),['reserved','insufficient_envelope']);assert.equal((await row(p.hash)).reservedCents,'3500');
 x=await E.reserve(call,p.hash,auth('e',500),NOW);assert.deepEqual([x.code,x.reservedCents,x.remainingCents],['reserved',4000,0]);
 assert.equal((await E.reserve(call,p.hash,auth('d',1),NOW)).code,'closed_envelope');
 const view=await E.read(call,p.hash);assert.deepEqual([view.status,view.maxTotalCents,view.reservedCents,view.decisionCount,view.chargedCents],['approved',4000,4000,6,0]);
 // Terms other than amount must match the approved envelope.
 const p2=await approved(terms({maxTotalCents:4000,expiresAtMs:NOW+900000}));
 assert.equal((await E.reserve(call,p2,auth('m1',100,{merchantNetworkId:'merchant_other'}),NOW)).code,'envelope_mismatch');
 assert.equal((await E.reserve(call,p2,auth('m2',100,{botId:'agent_other'}),NOW)).code,'envelope_mismatch');
 assert.equal((await E.reserve(call,p2,auth('m3',100,{currency:'eur'}),NOW)).code,'envelope_mismatch');
 assert.equal((await E.reserve(call,p2,auth('m5',100,{cardId:'ic_other'}),NOW)).code,'envelope_mismatch');
 assert.equal((await E.reserve(call,p2,auth('m6',100,{accountId:'acct_other'}),NOW)).code,'envelope_mismatch');
 assert.equal((await E.reserve(call,p2,auth('m4',100),NOW+900000)).code,'expired');assert.equal((await row(p2)).reservedCents,'0');
 // 4. Replayed signed webhook is rejected, using the existing issuer-webhook.cjs verify().
 const secret='whsec_disposable_fixture_not_a_real_secret',hctx={require:q=>q==='./api/index'?{}:require(q),module:{exports:{}},process:{env:{}},console,Buffer,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(__dirname+'/issuer-webhook.cjs','utf8'),hctx);const verify=hctx.module.exports.verify;
 const p3=await approved(terms({expiresAtMs:NOW+1200000}));
 const raw=Buffer.from(JSON.stringify({id:'evt_replay',account:'acct_fixture',type:'issuing_authorization.request',livemode:false,data:{object:{id:'iauth_replay',livemode:false,card:'ic_fixture',pending_request:{amount:1000,currency:'usd'},merchant_data:{network_id:merchant}}}}));
 const ts=Math.floor(Date.now()/1000),sig='t='+ts+',v1='+crypto.createHmac('sha256',secret).update(ts+'.').update(raw).digest('hex');
 const deliver=async(body,eventId)=>{assert(verify(body,sig,secret));const ev=JSON.parse(body),o=ev.data.object;return E.reserve(call,p3,{eventId:eventId||ev.id,authorizationId:o.id,botId:bot,accountId:ev.account,cardId:o.card,merchantNetworkId:o.merchant_data.network_id,currency:o.pending_request.currency,amountCents:o.pending_request.amount},NOW)};
 assert.equal((await deliver(raw)).code,'reserved');
 assert.equal((await deliver(raw)).code,'replay_declined');
 assert.equal((await deliver(raw,'evt_redelivered')).code,'replay_declined');
 assert.equal(verify(Buffer.from(raw.toString().replace('1000','100')),sig,secret),false);
 assert.equal((await row(p3)).reservedCents,'1000');
 // Ported from formancehq/wallets pkg/api/handler_holds_confirm_test.go @3177b665175c33867cf4a1a02b0c792d7d3d2dfd (hold USD 100 -> envelope 100 cents).
 const f=async (name,extra)=>approved(terms({maxTotalCents:100,expiresAtMs:NOW+600000+extra}));
 let h=await f('TestHoldsConfirm',1);x=await E.reserve(call,h,auth('fc',100),NOW);assert.deepEqual([x.code,x.reservedCents,x.remainingCents],['reserved',100,0]);
 h=await f('TestHoldsPartialConfirm',2);x=await E.reserve(call,h,auth('fp',50),NOW);assert.deepEqual([x.code,x.reservedCents,x.remainingCents],['reserved',50,50]);
 h=await f('TestHoldsConfirmWithTooHighAmount',3);assert.equal((await E.reserve(call,h,auth('fh',500),NOW)).code,'insufficient_envelope');assert.equal((await row(h)).reservedCents,'0');
 h=await f('TestHoldsConfirmWithClosedHold',4);await E.reserve(call,h,auth('fx',100),NOW);assert.equal((await E.reserve(call,h,auth('fy',1),NOW)).code,'closed_envelope');
 h=await f('TestHoldsPartialConfirmWithFinal',5);x=await E.reserve(call,h,auth('ff',50,{final:true}),NOW);assert.deepEqual([x.code,x.reservedCents,x.remainingCents],['reserved',50,0]);assert.equal((await row(h)).status,'closed');assert.equal((await row(h)).releasedCents,'50');assert.equal((await E.reserve(call,h,auth('fg',10),NOW)).code,'closed_envelope');
 // Release: returns one authorization's cents once; repeat is a no-op; replay after release still declines.
 h=await approved(terms({maxTotalCents:4000,expiresAtMs:NOW+1300000}));
 await E.reserve(call,h,auth('r1',1500),NOW);x=await E.reserve(call,h,auth('r2',1000),NOW);assert.equal(x.reservedCents,2500);
 let rel=await E.release(call,h,auth('r2',1000));assert.deepEqual([rel.code,rel.reservedCents,rel.releasedCents],['released',1500,1000]);assert.equal((await row(h)).reservedCents,'1500');
 assert.equal((await E.release(call,h,auth('r2',1000))).code,'noop');assert.equal((await row(h)).reservedCents,'1500');
 assert.equal((await Promise.all([E.release(call,h,auth('r1',1500)),E.release(call,h,auth('r1',1500))])).filter(y=>y.code==='released').length,1);assert.equal((await row(h)).reservedCents,'0');
 assert.equal((await E.release(call,h,auth('never',100))).code,'noop');
 assert.equal((await E.reserve(call,h,auth('r2',1000),NOW)).code,'replay_declined');
 assert.equal((await E.reserve(call,h,auth('r2b',1000,{authorizationId:'iauth_r2'}),NOW)).code,'replay_declined');
 assert.equal((await E.reserve(call,h,auth('x9',1000,{eventId:'evt_r2'}),NOW)).code,'replay_declined');
 assert.equal((await row(h)).reservedCents,'0');
 // A declined (not reserved) authorization has nothing to release, and released cents are spendable by a new authorization.
 await E.reserve(call,h,auth('big',9000),NOW);assert.equal((await E.release(call,h,auth('big',9000))).code,'noop');
 x=await E.reserve(call,h,auth('r3',4000),NOW);assert.deepEqual([x.code,x.reservedCents,x.remainingCents],['reserved',4000,0]);
 assert.equal((await E.release(call,'0'.repeat(64),auth('r3',4000))).code,'noop');
 if(!real)assert.throws(()=>E.localEval(store,['EVAL',E.RESERVE,'2','{a}x','{b}y']),/CROSSSLOT/);
 assert(calls.every(c=>c==='EVAL'||c==='HGETALL'));
 const evals=calls.filter(c=>c==='EVAL').length;if(real)real.close();
 console.log('PASS binding hash over bot/issuer account/card/merchant/currency/max/expiry (same terms on another card is a separate envelope), duplicate proposal rejected, owner approval bound to hash, first decision wins, $40 atomic reservation with concurrent overdraw refused, envelope term mismatch, expiry, signed webhook replay rejected (event and authorization id), 5 ported Formance hold-confirm cases, idempotent per-authorization release (repeat no-op, replay after release declined). '+evals+' EVALs, single-slot keys only, ZERO network/payment calls beyond the test store. Lua run in '+mode+', not Upstash.');
})().catch(e=>{console.error(e);process.exit(1)});
