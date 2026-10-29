// Stripe test-only synchronous authorization. No Stripe API calls or live execution.
const crypto=require('crypto');
const core=require('./api/index');
const ENVELOPE=require('./spend-envelope.cjs');
const VERSION='2025-03-31.basil';
// No upstream file covers it: with ALTER_SPEND_ENVELOPES=1, a card with an envelope mapping decides by atomic reserve();
// every code but 'reserved' declines, and a mapped card never falls back to the exact-mandate path. Flag off: unchanged path.
// Envelope and bot come only from Alter's card mapping. Reservations are internal accounting only.
// Accepted cents stay unresolved until provider evidence (issuing_authorization.created/updated, issuing_transaction.created)
// or owner adjudication. A late, failed or timed-out reserve is never released here: the response declines and the record,
// if it landed, stays unresolved and visible.
const cardOf=o=>typeof o?.card==='string'?o.card:o?.card?.id;
async function decide(event,deadline){
 const target=await core.issuerEnvelopeTarget(event,deadline);
 if(!target)return core.issuerProcess(event,deadline);
 if(target.blocked)return {approved:false,reason:target.blocked};
 const auth=event.data?.object,p=auth?.pending_request;
 if(auth?.livemode!==false)return {approved:false,reason:'live_mode_disabled'};
 const a={eventId:event.id,authorizationId:auth?.id,botId:target.botId,accountId:event.account,cardId:cardOf(auth),merchantNetworkId:auth?.merchant_data?.network_id,currency:p?.currency,amountCents:p?.amount};
 const store=core.issuerStore(deadline);
 // Route later provider events for this authorization to this envelope even if the card mapping changes.
 if(/^iauth_[A-Za-z0-9]+$/.test(a.authorizationId||''))await store(['SET','gl:issuer-envelope-auth:'+a.authorizationId,target.hash,'NX']);
 const out=await ENVELOPE.reserve(store,target.hash,a);
 if(Date.now()>=deadline)return {approved:false,reason:'internal_deadline'};
 return out.code==='reserved'?{approved:true,reason:'envelope_reserved'}:{approved:false,reason:out.code};
}
// No upstream file covers it: provider evidence for envelope cards. Field names follow Stripe Issuing docs (not verified
// against live deliveries): authorization {id, approved, status, amount, currency, card}; transaction {id, type, amount,
// currency, authorization, card}. Capture amounts are negative in Stripe, so the absolute value is used.
async function evidence(event){
 if(!core.envelopesEnabled())return {skipped:'flag_off'};
 const o=event.data?.object||{},isTx=event.type==='issuing_transaction.created';
 const authorizationId=isTx?(typeof o.authorization==='string'?o.authorization:o.authorization?.id)||(/^ipi_[A-Za-z0-9]+$/.test(o.id||'')?'iauth_tx'+o.id.slice(4):null):o.id;
 const hash=await core.issuerEnvelopeForEvent(authorizationId,event.account,cardOf(o));if(!hash)return {skipped:'not_an_envelope_card'};
 const kind=isTx?(o.type==='refund'?'refund':o.type==='capture'?'capture':null):'auth';if(!kind)return {skipped:'unsupported_transaction_type'};
 const e={kind,eventId:event.id,authorizationId,currency:String(o.currency||'').toLowerCase(),amountCents:Number.isSafeInteger(o.amount)?Math.abs(o.amount):0,approved:o.approved===true,status:o.status==='expired'?'closed':o.status,transactionId:isTx?o.id:''};
 const code=(await ENVELOPE.provider(core.issuerStore(null),hash,e)).code;
 // A notice failure never changes the accounting already written; it is reported in the response for the provider log.
 let notified=null;if(code.startsWith('discrepancy:')){try{notified=!!(await core.envelopeNotice(hash,code,e))}catch{notified=false}}
 return {envelope:code,...(notified===null?{}:{ownerNotified:notified})};
}
const EVIDENCE=new Set(['issuing_authorization.created','issuing_authorization.updated','issuing_transaction.created']);
function verify(raw,header,secret,clock=Date.now()){
 if(!secret||!Buffer.isBuffer(raw))return false;
 const parts=String(header||'').split(','),t=parts.find(x=>x.startsWith('t='))?.slice(2),sigs=parts.filter(x=>x.startsWith('v1=')).map(x=>x.slice(3));
 if(!/^\d+$/.test(t||'')||Math.abs(clock/1000-Number(t))>300)return false;
 const expected=crypto.createHmac('sha256',secret).update(t+'.').update(raw).digest();
 return sigs.some(s=>/^[a-f0-9]{64}$/.test(s)&&crypto.timingSafeEqual(expected,Buffer.from(s,'hex')));
}
async function payload(req){
 if(Buffer.isBuffer(req.body))return req.body;
 if(typeof req.body==='string')return Buffer.from(req.body);
 if(req.body!=null)throw Error('Raw body required');
 const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>262144)throw Error('Too large');chunks.push(chunk)}return Buffer.concat(chunks);
}
async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Stripe-Version',VERSION);
 if(req.method!=='POST')return res.status(405).json({error:'POST required'});
 if(!process.env.STRIPE_ISSUING_TEST_WEBHOOK_SECRET)return res.status(503).json({approved:false,error:'Test endpoint not configured'});
 const start=Date.now();let event;
 try{const raw=await payload(req);if(!verify(raw,req.headers['stripe-signature'],process.env.STRIPE_ISSUING_TEST_WEBHOOK_SECRET))return res.status(400).json({error:'Invalid signature'});event=JSON.parse(raw)}catch{return res.status(400).json({error:'Invalid raw event'})}
 if(event.livemode!==false)return res.status(200).json({approved:false,metadata:{alter_reason:'live_mode_disabled'}});
 // Store failures return 500 so the provider retries; nothing is released or settled on our side in the meantime.
 if(EVIDENCE.has(event.type)){try{return res.status(200).json({received:true,...await evidence(event)})}catch{return res.status(500).json({received:false,error:'store_unavailable'})}}
 if(event.type!=='issuing_authorization.request')return res.status(200).json({received:true});
 let timer;try{
  const result=await Promise.race([decide(event,start+1000),new Promise(resolve=>{timer=setTimeout(()=>resolve({approved:false,reason:'internal_deadline'}),Math.max(0,1000-(Date.now()-start)))})]);
  return res.status(200).json({approved:result.approved===true,metadata:{alter_reason:result.reason}});
 }catch{return res.status(200).json({approved:false,metadata:{alter_reason:'internal_error'}})}finally{clearTimeout(timer)}
}
module.exports=handler;module.exports.config={api:{bodyParser:false}};module.exports.verify=verify;
