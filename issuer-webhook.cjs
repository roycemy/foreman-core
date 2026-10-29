// Stripe test-only synchronous authorization. No Stripe API calls or live execution.
const crypto=require('crypto');
const core=require('./api/index');
const ENVELOPE=require('./spend-envelope.cjs');
const VERSION='2025-03-31.basil';
// No upstream file covers it: a card with an owner-approved envelope decides by atomic reserve(); every code but 'reserved' declines.
// Envelope and bot come only from Alter's card mapping. Cards without one keep the exact-mandate path. Reservations are internal accounting only.
// A reserve that lands after the deadline (or errors) is released and the response declines; the event and authorization ids stay recorded, so a replay still declines.
async function decide(event,deadline){
 const target=await core.issuerEnvelopeTarget(event,deadline);
 if(!target)return core.issuerProcess(event,deadline);
 if(target.blocked)return {approved:false,reason:target.blocked};
 const auth=event.data?.object,p=auth?.pending_request,card=typeof auth?.card==='string'?auth.card:auth?.card?.id;
 if(auth?.livemode!==false)return {approved:false,reason:'live_mode_disabled'};
 const a={eventId:event.id,authorizationId:auth?.id,botId:target.botId,accountId:event.account,cardId:card,merchantNetworkId:auth?.merchant_data?.network_id,currency:p?.currency,amountCents:p?.amount};
 // Release runs with no deadline (issuerStore(null)) and is idempotent per authorization id, so it is safe after any outcome of the reserve call.
 const release=()=>ENVELOPE.release(core.issuerStore(null),target.hash,a);
 let out;try{out=await ENVELOPE.reserve(core.issuerStore(deadline),target.hash,a)}catch(e){await release().catch(()=>{});throw e}
 // Adapted from formancehq/wallets pkg/api/handler_holds_void.go @3177b665175c33867cf4a1a02b0c792d7d3d2dfd: a hold that will not be used is voided. The response here is a decline, so give the cents back.
 if(Date.now()>=deadline){if(out.code==='reserved')await release();return {approved:false,reason:'internal_deadline'}}
 return out.code==='reserved'?{approved:true,reason:'envelope_reserved'}:{approved:false,reason:out.code};
}
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
 if(event.type!=='issuing_authorization.request')return res.status(200).json({received:true});
 let timer;try{
  const result=await Promise.race([decide(event,start+1000),new Promise(resolve=>{timer=setTimeout(()=>resolve({approved:false,reason:'internal_deadline'}),Math.max(0,1000-(Date.now()-start)))})]);
  return res.status(200).json({approved:result.approved===true,metadata:{alter_reason:result.reason}});
 }catch{return res.status(200).json({approved:false,metadata:{alter_reason:'internal_error'}})}finally{clearTimeout(timer)}
}
module.exports=handler;module.exports.config={api:{bodyParser:false}};module.exports.verify=verify;
