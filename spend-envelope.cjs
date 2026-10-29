// $40 non-charging spend envelope proof. Internal accounting only: nothing here moves, holds or blocks real money.
// The issuer webhook decides in ~2s, so the owner approves this envelope ahead of time, not each authorization instant.
const crypto=require('crypto');
const TERMS=['botId','merchantNetworkId','currency','maxTotalCents','expiresAtMs'];
// No upstream file covers it: canonical sha256 over exactly the five approved envelope terms, in fixed order.
function bindingHash(t){
 if(!t||typeof t.botId!=='string'||!/^[A-Za-z0-9_]{1,120}$/.test(t.botId)||typeof t.merchantNetworkId!=='string'||!t.merchantNetworkId.trim()||t.merchantNetworkId.length>100||t.currency!=='usd'||!Number.isSafeInteger(t.maxTotalCents)||t.maxTotalCents<1||t.maxTotalCents>1000000||!Number.isSafeInteger(t.expiresAtMs))throw Error('Envelope needs botId, merchantNetworkId, usd, integer maxTotalCents (1..1000000) and integer expiresAtMs');
 return crypto.createHash('sha256').update(JSON.stringify(TERMS.map(k=>t[k]))).digest('hex');
}
// One key per envelope; the {hash} tag pins every script to a single slot. gl: keys are never workspace-prefixed by nsKey.
const envelopeKey=hash=>'gl:spend-envelope:{'+hash+'}';
// No upstream file covers it: SET-NX style create on a Redis hash, rejecting a duplicate proposal of the same terms.
const PROPOSE="if redis.call('EXISTS',KEYS[1])==1 then return {'duplicate_proposal'} end\n"+
 "if tonumber(ARGV[6])<=tonumber(ARGV[7]) then return {'expired'} end\n"+
 "redis.call('HSET',KEYS[1],'hash',ARGV[1],'botId',ARGV[2],'merchant',ARGV[3],'currency',ARGV[4],'maxCents',ARGV[5],'expiresAtMs',ARGV[6],'reservedCents','0','status','pending_approval','createdAtMs',ARGV[7])\n"+
 "return {'proposed'}";
// Adapted from this repo, api/index.js AGENT_CAS + reviewSpend detailsHash check (roycemy/foreman-core@d67990f): the owner's decision binds to the hash they reviewed; first decision wins.
const DECIDE="local s=redis.call('HMGET',KEYS[1],'hash','status','expiresAtMs')\n"+
 "if not s[1] then return {'not_found'} end\n"+
 "if s[1]~=ARGV[1] then return {'binding_mismatch'} end\n"+
 "if s[2]~='pending_approval' then return {'already_decided',s[2]} end\n"+
 "if tonumber(s[3])<=tonumber(ARGV[3]) then redis.call('HSET',KEYS[1],'status','expired') return {'expired'} end\n"+
 "local st='denied' if ARGV[2]=='approve' then st='approved' end\n"+
 "redis.call('HSET',KEYS[1],'status',st,'decidedAtMs',ARGV[3])\n"+
 "return {st}";
// Adapted from formancehq/wallets pkg/hold.go (ConfirmHold.resolveAmount, ExpandedDebitHold.IsClosed) @3177b665175c33867cf4a1a02b0c792d7d3d2dfd:
// closed hold rejects, amount above remaining rejects (ErrInsufficientFund), final confirm releases the remainder.
// Replay refusal mirrors this repo's issuerProcess replay_declined (roycemy/foreman-core@d67990f api/index.js): any seen event or authorization id declines, before any other check.
const RESERVE="local s=redis.call('HMGET',KEYS[1],'hash','status','botId','merchant','currency','maxCents','reservedCents','expiresAtMs')\n"+
 "if not s[1] then return {'no_envelope'} end\n"+
 "local evt,auth='evt:'..ARGV[2],'auth:'..ARGV[3]\n"+
 "if redis.call('HEXISTS',KEYS[1],evt)==1 or redis.call('HEXISTS',KEYS[1],auth)==1 then return {'replay_declined'} end\n"+
 "local max,res,amt=tonumber(s[6]),tonumber(s[7]),tonumber(ARGV[7])\n"+
 "local code\n"+
 "if s[1]~=ARGV[1] then code='binding_mismatch'\n"+
 "elseif s[2]=='closed' or res>=max then code='closed_envelope'\n"+
 "elseif s[2]~='approved' then code='not_approved'\n"+
 "elseif tonumber(s[8])<=tonumber(ARGV[9]) then code='expired'\n"+
 "elseif s[3]~=ARGV[4] or s[4]~=ARGV[5] or s[5]~=ARGV[6] then code='envelope_mismatch'\n"+
 "elseif not amt or amt<1 or amt%1~=0 then code='invalid_amount'\n"+
 "elseif res+amt>max then code='insufficient_envelope' end\n"+
 "if code then redis.call('HSET',KEYS[1],evt,code,auth,code) return {code,res,max-res} end\n"+
 "res=redis.call('HINCRBY',KEYS[1],'reservedCents',amt)\n"+
 "local remaining=max-res\n"+
 "if ARGV[8]=='1' then redis.call('HSET',KEYS[1],'status','closed','releasedCents',tostring(remaining)) remaining=0 end\n"+
 "redis.call('HSET',KEYS[1],evt,'reserved:'..amt,auth,'reserved:'..amt)\n"+
 "return {'reserved',res,remaining}";
// call is a Redis command function (e.g. api/index.js r). Every script declares its single key in KEYS.
async function propose(call,terms,nowMs=Date.now()){const hash=bindingHash(terms),key=envelopeKey(hash);const out=await call(['EVAL',PROPOSE,'1',key,hash,terms.botId,terms.merchantNetworkId.trim(),terms.currency,String(terms.maxTotalCents),String(terms.expiresAtMs),String(nowMs)]);return {hash,key,code:out[0]};}
async function decide(call,hash,decision,nowMs=Date.now()){if(!/^[a-f0-9]{64}$/.test(hash||''))return {code:'binding_mismatch'};const out=await call(['EVAL',DECIDE,'1',envelopeKey(hash),hash,decision==='approve'?'approve':'deny',String(nowMs)]);return {code:out[0],status:out[1]};}
// botId must come from Alter's own card/bot mapping, never from merchant or webhook metadata.
async function reserve(call,hash,a,nowMs=Date.now()){
 if(!/^[a-f0-9]{64}$/.test(hash||'')||!/^evt_[A-Za-z0-9]+$/.test(a.eventId||'')||!/^iauth_[A-Za-z0-9]+$/.test(a.authorizationId||''))return {code:'invalid_or_unsupported_request'};
 if(!Number.isSafeInteger(a.amountCents)||a.amountCents<1)return {code:'invalid_amount'};
 const out=await call(['EVAL',RESERVE,'1',envelopeKey(hash),hash,a.eventId,a.authorizationId,String(a.botId),String(a.merchantNetworkId),String(a.currency),String(a.amountCents),a.final?'1':'0',String(nowMs)]);
 return {code:out[0],reservedCents:out[1],remainingCents:out[2],chargedCents:0};
}
module.exports={bindingHash,envelopeKey,propose,decide,reserve,PROPOSE,DECIDE,RESERVE};
