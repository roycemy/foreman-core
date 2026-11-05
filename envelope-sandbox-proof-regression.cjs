// Offline self-test for scripts/envelope-sandbox-proof.cjs. No network: a fake Stripe signs events and delivers them to the REAL
// issuer-webhook.cjs and api/index.js (in-memory store). This proves the proof script's scenarios and expectations agree with the
// code, that it detects the failure modes it exists to catch, and that it never leaks a secret. It cannot prove Stripe behaves
// like the fake: that is what running the script against a real sandbox is for (docs/ENVELOPE-SANDBOX-PROOF.md).
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const P=require('./scripts/envelope-sandbox-proof.cjs');
const net=[];
function build(){
 const src=fs.readFileSync(__dirname+'/api/index.js','utf8')+'\nmodule.exports.t={r,setJ,getJ,als,createAgent,issuerEnvelopeTarget,issuerProcess,issuerStore,issuerEnvelopeForEvent,envelopesOn,envelopeNotice,routes,mem};';
 const ctx={require,module:{exports:{}},process:{env:{ALTER_SPEND_ENVELOPES:'1'}},global:{},console,fetch:()=>{throw Error('NO NETWORK')},setTimeout,clearTimeout,URL,AbortSignal};
 vm.runInNewContext(src,ctx);const f=ctx.module.exports.t;
 const secret='whsec_disposable_fixture_not_a_real_secret';
 const hctx={require:p=>p==='./api/index'?{issuerProcess:f.issuerProcess,issuerEnvelopeTarget:e=>f.issuerEnvelopeTarget(e),issuerEnvelopeForEvent:f.issuerEnvelopeForEvent,issuerStore:f.issuerStore,envelopesEnabled:f.envelopesOn,envelopeNotice:f.envelopeNotice}:require(p),module:{exports:{}},process:{env:{STRIPE_ISSUING_TEST_WEBHOOK_SECRET:secret}},console,Buffer,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(__dirname+'/issuer-webhook.cjs','utf8'),hctx);
 return {f,h:hctx.module.exports,secret};
}
// ---- fake Alter: the real routes behind an owner session ----
function fakeAlterFetch(f,token){
 return async(url,o)=>{
  const u=new URL(url),p=u.pathname,method=(o&&o.method)||'GET';
  if(p==='/api/issuing')return resp(200,{mode:'stripe_test_only',liveEnabled:false});
  if(!/fm_sess=tok_owner_fixture/.test((o.headers||{}).Cookie||''))return resp(401,{error:'auth'});
  const body=o.body?JSON.parse(o.body):{};let out;
  await f.als.run({ws:'proofws',uid:'user_proof'},()=>f.routes({method,url:p,headers:{host:'localhost',origin:'http://localhost',...(o.headers||{}).Origin?{origin:o.headers.Origin}:{}}},{setHeader(){},status(n){this.code=n;return this},json(j){out={code:this.code||200,j}}},p.replace(/^\/api/,''),body,null));
  return resp(out.code,out.j);
 };
}
const resp=(status,j)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(j),json:async()=>j});
// ---- fake Stripe: test helpers + webhook delivery into the real handler ----
function fakeStripe({h,secret,accountOnEvents=true,order='normal',cardId='ic_proof1',acct='acct_proof1',lateMs=20}){
 const auths=new Map(),txs=[],events=[];let n=0,en=0;
 const sign=raw=>{const t=Math.floor(Date.now()/1000);return 't='+t+',v1='+crypto.createHmac('sha256',secret).update(t+'.').update(raw).digest('hex')};
 async function deliver(type,object,sync){
  const e={id:'evt_p'+(++en)+crypto.randomBytes(3).toString('hex'),type,livemode:false,created:Math.floor(Date.now()/1000),data:{object},...(accountOnEvents?{account:acct}:{})};events.unshift(e);
  const raw=Buffer.from(JSON.stringify(e));let o;await h({method:'POST',body:raw,headers:{'stripe-signature':sign(raw)}},{setHeader(){},status(c){this.code=c;return this},json(j){o={code:this.code,...j}}});return o;
 }
 const later=(fn)=>new Promise(r=>setTimeout(async()=>{await fn();r()},lateMs));
 const pending=new Set();const bg=fn=>{const p=later(fn).finally(()=>pending.delete(p));pending.add(p)};
 const cardObj=()=>({id:cardId,object:'issuing.card'});
 async function create(q){
  const id='iauth_p'+(++n)+crypto.randomBytes(2).toString('hex'),amount=Number(q.amount),mid=q['merchant_data[network_id]'];
  const a={id,object:'issuing.authorization',livemode:false,amount:0,currency:'usd',approved:false,status:'closed',card:cardObj(),merchant_data:{network_id:mid,category:q['merchant_data[category]']},pending_request:{amount,currency:'usd'},request_history:[],metadata:{},transactions:{data:[]}};
  const o=await deliver('issuing_authorization.request',a);const ok=o.approved===true;
  a.approved=ok;a.status=ok?'pending':'closed';a.amount=ok?amount:0;a.metadata={alter_reason:(o.metadata||{}).alter_reason};a.request_history=[{approved:ok,reason:ok?'webhook_approved':'webhook_declined',amount}];
  auths.set(id,a);const snap=JSON.parse(JSON.stringify(a));bg(()=>deliver('issuing_authorization.created',snap));return a;
 }
 const upd=a=>deliver('issuing_authorization.updated',JSON.parse(JSON.stringify(a)));
 const route={
  'GET /v1/account':()=>({id:acct,type:'standard',country:'US',capabilities:{card_issuing:'active'}}),
  'POST /v1/test_helpers/issuing/authorizations':q=>create(q),
  'GET /v1/issuing/authorizations/':(q,id)=>{const a=auths.get(id);if(!a)throw Object.assign(Error('missing'),{s:404});return a},
  'GET /v1/events':q=>({data:events.filter(e=>e.type===q.type).slice(0,Number(q.limit)||5)}),
 };
 const fetch=async(url,o)=>{
  const u=new URL(url),p=u.pathname,method=(o&&o.method)||'GET';net.push(method+' '+p);
  if(!/^Bearer (sk|rk)_test_/.test(o.headers.Authorization))return resp(401,{error:{message:'bad key'}});
  const q=method==='GET'?Object.fromEntries(u.searchParams):Object.fromEntries(new URLSearchParams(o.body||''));
  try{
   let m;
   if(method==='GET'&&(m=p.match(/^(\/v1\/issuing\/authorizations\/)(iauth_\w+)$/)))return resp(200,route['GET /v1/issuing/authorizations/'](q,m[2]));
   if(route[method+' '+p])return resp(200,await route[method+' '+p](q));
   if(method==='POST'&&(m=p.match(/^\/v1\/test_helpers\/issuing\/authorizations\/(iauth_\w+)\/(capture|reverse|expire)$/))){
    const a=auths.get(m[1]);if(!a)return resp(404,{error:{message:'no such authorization'}});
    if(m[2]==='capture'){const cents=Number(q.capture_amount);const tx={id:'ipi_p'+(++n),object:'issuing.transaction',type:'capture',amount:-cents,currency:'usd',authorization:a.id,card:cardId,merchant_data:a.merchant_data};txs.push(tx);a.transactions.data.push(tx);
     const close=q.close_authorization==='true';if(close)a.status='closed';
     const sendTx=()=>deliver('issuing_transaction.created',tx),sendClose=()=>upd(a);
     if(close&&order==='closed_first'){bg(sendClose);bg(async()=>{await new Promise(r=>setTimeout(r,lateMs*2));await sendTx()});}else{bg(sendTx);if(close)bg(async()=>{await new Promise(r=>setTimeout(r,lateMs*2));await sendClose()});}
     return resp(200,a);}
    if(m[2]==='reverse'){a.status='reversed';bg(()=>upd(a));return resp(200,a);}
    a.status='expired';bg(()=>upd(a));return resp(200,a);
   }
   if(method==='POST'&&(m=p.match(/^\/v1\/test_helpers\/issuing\/transactions\/(ipi_\w+)\/refund$/))){
    const orig=txs.find(t=>t.id===m[1]);if(!orig)return resp(404,{error:{message:'no such transaction'}});
    const tx={id:'ipi_p'+(++n),object:'issuing.transaction',type:'refund',amount:Number(q.refund_amount),currency:'usd',authorization:orig.authorization,card:cardId};txs.push(tx);bg(()=>deliver('issuing_transaction.created',tx));return resp(200,tx);}
  }catch(e){return resp(e.s||500,{error:{message:e.message}});}
  return resp(404,{error:{message:'unhandled '+method+' '+p}});
 };
 return {fetch,drain:()=>Promise.all([...pending])};
}
async function proof(opts={}){
 const {f,h,secret}=build(),fk=fakeStripe({h,secret,...opts.stripe}),acct=opts.stripe&&opts.stripe.acct||'acct_proof1',cardId='ic_proof1';
 let bot;await f.als.run({ws:'proofws'},async()=>{bot=(await f.createAgent('Proof bot','Ops','custom',false,{preset:'balanced'})).agent});
 const stripe=P.stripeClient({fetch:fk.fetch,key:'sk_test_fixture123'}),alter=P.alterClient({fetch:fakeAlterFetch(f,'tok'),base:'http://localhost',token:'tok_owner_fixture'});
 const rep=await P.run({stripe,alter,cardId,accountId:acct,botId:bot.id,sleep:ms=>new Promise(r=>setTimeout(r,Math.min(ms,25))),pollMs:25,settleMs:1500,...opts.run});
 await fk.drain();return {rep,f};
}
const by=(rep,id)=>rep.steps.find(s=>s.id===id);
(async()=>{
 // 1. Faithful fake: every automated step passes; R1 and O1 are observations, not assertions.
 {const {rep}=await proof();
  assert.equal(rep.ok,true,JSON.stringify(rep.steps.filter(s=>s.status==='fail'),null,1));
  for(const id of ['P0','E1','A1','A2','A3','C1','V1','X1','P1','K1','L1'])assert.equal(by(rep,id).status,'pass',id+': '+JSON.stringify(by(rep,id)));
  assert.equal(by(rep,'O1').status,'observed');assert.equal(by(rep,'R1').status,'observed');
  assert.deepEqual(by(rep,'A1').actual.tuple,[0,1000,0,3000]);assert.equal(by(rep,'A1').actual.requestHistory,'webhook_approved');
  assert.equal(by(rep,'A2').actual.alterReason,'insufficient_available');assert.equal(by(rep,'A3').actual.alterReason,'envelope_mismatch');assert.equal(by(rep,'K1').actual.alterReason,'envelope_revoked');
  assert.equal(rep.observations.events['issuing_authorization.request'].accountFieldPresent,true);assert.equal(rep.observations.events['issuing_authorization.request'].cardIs,'object');
  assert(rep.manual.length>=3);assert(rep.observations.latency.samples>=7);
  const md=P.markdown(rep);assert(/Result: \*\*PASS\*\*/.test(md));
  // The report must never contain a credential: not the owner token, not the Stripe key, not the webhook secret.
  const text=JSON.stringify(rep)+md;for(const s of ['tok_owner_fixture','sk_test_fixture123','whsec_disposable'])assert(!text.includes(s),'leaked '+s);
  // Only test-helper, read and event endpoints were called, never anything that could create a live object.
  assert(net.every(x=>/^(GET|POST) \/v1\/(account|events|issuing\/authorizations\/iauth_\w+|test_helpers\/issuing\/(authorizations|transactions)(\/\w+)?(\/(capture|reverse|expire|refund))?)$/.test(x)),net.filter(x=>!/test_helpers|events|account|authorizations/.test(x)).join(','));}
 // 2. A direct (non-Connect) account whose events carry no `account`: the proof must fail loudly at A1 and name the cause at O1.
 {const {rep}=await proof({stripe:{accountOnEvents:false}});
  assert.equal(rep.ok,false);assert.equal(by(rep,'A1').status,'fail');assert.equal(by(rep,'A1').actual.stripeApproved,false);
  assert.equal(by(rep,'O1').status,'fail');assert(/event\.account is ABSENT/.test(by(rep,'O1').note),by(rep,'O1').note);
  for(const id of ['A2','A3','C1','V1','X1'])assert.equal(by(rep,id).status,'skipped',id);}
 // 3. Stripe delivers "closed" before the capture transaction: totals still come out right, but the proof says so.
 {const {rep}=await proof({stripe:{order:'closed_first'}});
  const c1=by(rep,'C1');assert.equal(c1.status,'pass',JSON.stringify(c1));assert(/ORDERING/.test(c1.note),c1.note);assert(c1.actual.historyKinds.some(k=>/^discrepancy:capture_after_closed$/.test(k)),JSON.stringify(c1.actual));}
 // 4. Safety rails on the script itself.
 assert.throws(()=>P.stripeClient({fetch:()=>{},key:'sk_live_abc123'}),/TEST-mode/);
 assert.throws(()=>P.stripeClient({fetch:()=>{},key:'pk_test_abc'}),/TEST-mode/);
 assert.throws(()=>P.alterClient({fetch:()=>{},base:'http://example.com',token:'x'}),/https/);
 assert.equal(P.redact('Authorization sk_test_abc123 rk_live_ZZ9 whsec_Q1 fm_sess=deadbeef'),'Authorization sk_test_[redacted] rk_live_[redacted] whsec_[redacted] fm_sess=[redacted]');
 const src=fs.readFileSync(__dirname+'/scripts/envelope-sandbox-proof.cjs','utf8');
 assert(!/sk_live|livemode\s*[:=]\s*true/.test(src.replace(/sk_live_/g,'')) ,'script must not mention live-mode actions');
 console.log('PASS envelope sandbox proof script: faithful fake passes every automated step (propose/approve, in-envelope approve then confirm, over-limit and wrong-merchant decline with no movement, partial capture closes and releases the rest, reversal and expiry release, provider reader maps open/voided/expired/closed, revoke declines, latency recorded); a no-`account` event stream fails at A1 and is named at O1 with later steps skipped; closed-before-capture ordering is reported as a spurious discrepancy while totals stay right; live/publishable keys and non-https hosts are refused; reports contain no token, key or webhook secret; only test-helper, read and event endpoints are called.');
})().catch(e=>{console.error(e);process.exit(1)});
