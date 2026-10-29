// Spend envelopes. Internal accounting only: nothing here moves, holds or blocks real money.
// The issuer webhook decides in ~2s, so the owner approves an envelope ahead of time, not each authorization instant.
// Gated by ALTER_SPEND_ENVELOPES=1 at the call sites (api/index.js, issuer-webhook.cjs); this module has no side effects on load.
//
// Accounting (per envelope, per currency, per cent):
//   unresolved (u): Alter accepted the request but the provider outcome is not confirmed yet.
//   reserved   (r): provider confirmed the approval; not captured.
//   settled    (s): provider captured, net of refunds (refunds reduce settled; gross captures live in history only).
//   C = u + r + s per currency. available = max(0, max - C), overspend = max(0, C - max), both derived, so
//   max + overspend = available + C holds by construction. The falsifiable checks are audit(): every cent's
//   bucket amounts replay exactly from history, and the bucket totals equal the per-authorization sums.
//   max applies only to the envelope's own currency; any other currency has max 0.
const crypto=require('crypto');
const TERMS=['botId','accountId','cardId','merchantNetworkId','currency','maxTotalCents','expiresAtMs'];
const STUCK_MS=120000;
// No upstream file covers it: canonical sha256 over exactly the seven approved envelope terms (bot, issuer account, card, merchant, currency, max, expiry), in fixed order.
function bindingHash(t){
 if(!t||typeof t.botId!=='string'||!/^[A-Za-z0-9_]{1,120}$/.test(t.botId)||!/^acct_[A-Za-z0-9]+$/.test(t.accountId||'')||!/^ic_[A-Za-z0-9]+$/.test(t.cardId||'')||typeof t.merchantNetworkId!=='string'||!t.merchantNetworkId.trim()||t.merchantNetworkId.length>100||/[|,]/.test(t.merchantNetworkId)||!/^[a-z]{3}$/.test(t.currency||'')||!Number.isSafeInteger(t.maxTotalCents)||t.maxTotalCents<1||t.maxTotalCents>1000000||!Number.isSafeInteger(t.expiresAtMs))throw Error('Envelope needs botId, issuer accountId, cardId, merchantNetworkId, a 3-letter lowercase currency, integer maxTotalCents (1..1000000) and integer expiresAtMs');
 return crypto.createHash('sha256').update(JSON.stringify(TERMS.map(k=>t[k]))).digest('hex');
}
// One key per envelope; the {hash} tag pins every script to a single slot. gl: keys are never workspace-prefixed by nsKey.
const envelopeKey=hash=>'gl:spend-envelope:{'+hash+'}';
// No upstream file covers it: shared Lua helpers. Every bucket change goes through move(), which updates the per-authorization
// per-currency amounts and the envelope totals together; hist() appends the same deltas so audit() can replay them.
const PRELUDE="local K=KEYS[1]\n"+
 "local function num(f) return tonumber(redis.call('HGET',K,f) or '0') or 0 end\n"+
 "local function add(f,d) if d~=0 then redis.call('HINCRBY',K,f,d) end end\n"+
 "local function addcur(f,c) local l=redis.call('HGET',K,f) or '' if not string.find(','..l..',',','..c..',',1,true) then if l=='' then redis.call('HSET',K,f,c) else redis.call('HSET',K,f,l..','..c) end end end\n"+
 "local function move(a,c,du,dr,ds) addcur('curs',c) addcur('a:'..a..':curs',c) local p='a:'..a..':'..c..':' add(p..'u',du) add(p..'r',dr) add(p..'s',ds) add('b:'..c..':u',du) add('b:'..c..':r',dr) add('b:'..c..':s',ds) end\n"+
 "local function hist(now,actor,kind,a,c,du,dr,ds,ref,note,dc) local n=redis.call('HINCRBY',K,'hseq',1) redis.call('HSET',K,'h:'..n,table.concat({now,actor,kind,a,c,du,dr,ds,ref,note,dc or 0},'|')) end\n";
// No upstream file covers it: SET-NX style create on a Redis hash, rejecting a duplicate proposal of the same terms.
// ARGV: hash, bot, account, card, merchant, currency, max, expiresAt, now, actor
const PROPOSE=PRELUDE+"if redis.call('EXISTS',K)==1 then return {'duplicate_proposal'} end\n"+
 "if tonumber(ARGV[8])<=tonumber(ARGV[9]) then return {'expired'} end\n"+
 "redis.call('HSET',K,'hash',ARGV[1],'botId',ARGV[2],'accountId',ARGV[3],'cardId',ARGV[4],'merchant',ARGV[5],'currency',ARGV[6],'maxCents',ARGV[7],'expiresAtMs',ARGV[8],'status','pending_approval','createdAtMs',ARGV[9],'proposedBy',ARGV[10])\n"+
 "hist(ARGV[9],ARGV[10],'envelope_proposed','','',0,0,0,'',ARGV[7]..' '..ARGV[6])\n"+
 "return {'proposed'}";
// Adapted from this repo, api/index.js AGENT_CAS + reviewSpend detailsHash check (roycemy/foreman-core@d67990f): the owner's decision binds to the hash they reviewed; first decision wins.
// Revoke is new (no upstream file covers it): approved -> revoked, after which RESERVE refuses at card use.
// ARGV: hash, decision (approve|deny|revoke), now, actor
const DECIDE=PRELUDE+"local s=redis.call('HMGET',K,'hash','status','expiresAtMs')\n"+
 "if not s[1] then return {'not_found'} end\n"+
 "if s[1]~=ARGV[1] then return {'binding_mismatch'} end\n"+
 "if ARGV[2]=='revoke' then if s[2]~='approved' then return {'not_revocable',s[2]} end redis.call('HSET',K,'status','revoked','revokedAtMs',ARGV[3],'revokedBy',ARGV[4]) hist(ARGV[3],ARGV[4],'envelope_revoked','','',0,0,0,'','') return {'revoked'} end\n"+
 "if s[2]~='pending_approval' then return {'already_decided',s[2]} end\n"+
 "if tonumber(s[3])<=tonumber(ARGV[3]) then redis.call('HSET',K,'status','expired') hist(ARGV[3],ARGV[4],'envelope_expired','','',0,0,0,'','') return {'expired'} end\n"+
 "local st='denied' if ARGV[2]=='approve' then st='approved' end\n"+
 "redis.call('HSET',K,'status',st,'decidedAtMs',ARGV[3],'decidedBy',ARGV[4])\n"+
 "hist(ARGV[3],ARGV[4],'envelope_'..st,'','',0,0,0,'','')\n"+
 "return {st}";
// Adapted from formancehq/wallets pkg/hold.go (ConfirmHold.resolveAmount, ExpandedDebitHold.IsClosed) @3177b665175c33867cf4a1a02b0c792d7d3d2dfd:
// no capacity left rejects, amount above remaining rejects (ErrInsufficientFund).
// Fence re-check: the authorization record ('a:'..id) is read and written inside this one script, so a fence or provider
// record written first makes a later reserve refuse, and a reserve written first is what the fence finds. No check-then-write gap.
// Accepted cents go to unresolved until provider evidence confirms them.
// ARGV: hash, eventId, authId, bot, account, card, merchant, currency, amount, now, actor
const RESERVE=PRELUDE+"local s=redis.call('HMGET',K,'hash','status','botId','accountId','cardId','merchant','currency','maxCents','expiresAtMs')\n"+
 "if not s[1] then return {'no_envelope'} end\n"+
 "local a,c,now=ARGV[3],ARGV[8],ARGV[10]\n"+
 "if redis.call('HEXISTS',K,'e:'..ARGV[2])==1 or redis.call('HEXISTS',K,'a:'..a)==1 then return {'replay_declined'} end\n"+
 "local max,amt=tonumber(s[8]),tonumber(ARGV[9])\n"+
 "local used=num('b:'..s[7]..':u')+num('b:'..s[7]..':r')+num('b:'..s[7]..':s')\n"+
 "local code\n"+
 "if s[1]~=ARGV[1] then code='binding_mismatch'\n"+
 "elseif s[2]~='approved' then code='envelope_'..s[2]\n"+
 "elseif tonumber(s[9])<=tonumber(now) then code='envelope_expired'\n"+
 "elseif s[3]~=ARGV[4] or s[4]~=ARGV[5] or s[5]~=ARGV[6] or s[6]~=ARGV[7] or s[7]~=c then code='envelope_mismatch'\n"+
 "elseif not amt or amt<1 or amt%1~=0 then code='invalid_amount'\n"+
 "elseif used>=max then code='closed_envelope'\n"+
 "elseif used+amt>max then code='insufficient_envelope' end\n"+
 "redis.call('HSET',K,'e:'..ARGV[2],a)\n"+
 "if code then redis.call('HSET',K,'a:'..a,'declined') hist(now,ARGV[11],'declined:'..code,a,c,0,0,0,ARGV[2],'') return {code,used,max-used} end\n"+
 "redis.call('HSET',K,'a:'..a,'open','a:'..a..':at',now)\n"+
 "move(a,c,amt,0,0)\n"+
 "hist(now,ARGV[11],'reserve_unresolved',a,c,amt,0,0,ARGV[2],'')\n"+
 "return {'reserved',used+amt,max-used-amt}";
// No upstream file covers it: reconciler fence. Same key and same 'a:'..id field RESERVE checks, so exactly one of
// "reserve then fence (fence finds it)" or "fence then reserve (reserve refuses)" happens. A found record is never freed here.
// ARGV: hash, authId, now, actor, ref
const FENCE=PRELUDE+"if not redis.call('HGET',K,'hash') then return {'no_envelope'} end\n"+
 "local st=redis.call('HGET',K,'a:'..ARGV[2])\n"+
 "if st then return {'found',st} end\n"+
 "redis.call('HSET',K,'a:'..ARGV[2],'fenced')\n"+
 "hist(ARGV[3],ARGV[4],'fence',ARGV[2],'',0,0,0,ARGV[5],'')\n"+
 "return {'fenced'}";
// Provider evidence (A4: authoritative even after a local terminal state). Partial capture leaves the rest reserved (per-cent buckets);
// capture beyond reserved/unresolved enters settled as a discrepancy (overspend only if C crosses max); refunds reduce settled.
// Capture/void semantics adapted from formancehq/wallets pkg/api/handler_holds_confirm.go, pkg/numscript/confirm-hold.num and
// cancel-hold.num @3177b665175c33867cf4a1a02b0c792d7d3d2dfd; provider-first discrepancy recording is new, no upstream file covers it.
// Duplicate provider event ids and transaction ids apply once.
// ARGV: hash, kind (auth|capture|refund), providerEventId, authId, currency, amount, approved (1|0), status, transactionId, now, actor
const PROVIDER=PRELUDE+"if not redis.call('HGET',K,'hash') then return {'no_envelope'} end\n"+
 "if redis.call('HEXISTS',K,'p:'..ARGV[3])==1 then return {'duplicate'} end\n"+
 "if ARGV[9]~='' and redis.call('HEXISTS',K,'t:'..ARGV[9])==1 then redis.call('HSET',K,'p:'..ARGV[3],'dup_tx') return {'duplicate'} end\n"+
 "redis.call('HSET',K,'p:'..ARGV[3],ARGV[2])\n"+
 "if ARGV[9]~='' then redis.call('HSET',K,'t:'..ARGV[9],ARGV[3]) end\n"+
 "local a,c,amt,now,actor,ref=ARGV[4],ARGV[5],tonumber(ARGV[6]),ARGV[10],ARGV[11],ARGV[3]\n"+
 "local st=redis.call('HGET',K,'a:'..a)\n"+
 "local p='a:'..a..':'..c..':'\n"+
 "local u,r,s=num(p..'u'),num(p..'r'),num(p..'s')\n"+
 "if ARGV[2]=='auth' then\n"+
 " local approved,status=ARGV[7]=='1',ARGV[8]\n"+
 " if not st then\n"+
 "  if approved and status=='pending' then redis.call('HSET',K,'a:'..a,'open','a:'..a..':at',now) move(a,c,0,amt,0) hist(now,actor,'discrepancy:approved_without_alter_reservation',a,c,0,amt,0,ref,'') return {'discrepancy'} end\n"+
 "  redis.call('HSET',K,'a:'..a,'fenced') hist(now,actor,'fence:provider_'..status,a,c,0,0,0,ref,'') return {'fenced'}\n"+
 " end\n"+
 " if not approved then move(a,c,-u,-r,0) if s==0 then redis.call('HSET',K,'a:'..a,'released') end hist(now,actor,'provider_declined',a,c,-u,-r,0,ref,'') return {'released'} end\n"+
 " if status=='pending' then\n"+
 "  if u>0 then local keep=math.min(amt,u) move(a,c,-u,keep,0) hist(now,actor,'provider_approved',a,c,-u,keep,0,ref,'') return {'confirmed'} end\n"+
 "  if st=='open' and r>amt then move(a,c,0,amt-r,0) hist(now,actor,'partial_reversal',a,c,0,amt-r,0,ref,'') return {'reduced'} end\n"+
 "  hist(now,actor,'ignored_snapshot',a,c,0,0,0,ref,st) return {'ignored'}\n"+
 " end\n"+
 " move(a,c,-u,-r,0) redis.call('HSET',K,'a:'..a,'closed') hist(now,actor,'provider_'..status,a,c,-u,-r,0,ref,'') return {'closed'}\n"+
 "end\n"+
 "if not amt or amt<1 or amt%1~=0 then hist(now,actor,'discrepancy:invalid_amount',a,c,0,0,0,ref,ARGV[6]) return {'invalid_amount'} end\n"+
 "if ARGV[2]=='capture' then\n"+
 " if not st then redis.call('HSET',K,'a:'..a,'closed','a:'..a..':at',now) move(a,c,0,0,amt) hist(now,actor,'discrepancy:capture_without_alter_record',a,c,0,0,amt,ref,'') return {'discrepancy'} end\n"+
 " local fr=math.min(amt,r) local rest=amt-fr local fu=math.min(rest,u) rest=rest-fu\n"+
 " local cc=math.min(num(p..'c'),amt)\n"+
 " move(a,c,-fu,-fr,amt-cc) add(p..'c',-cc)\n"+
 " local man=redis.call('HGET',K,'a:'..a..':manual')\n"+
 " local kind='capture' if st~='open' then kind='discrepancy:capture_after_'..st elseif man=='declined' then kind='discrepancy:capture_after_adjudicated_declined' elseif rest>0 then kind='discrepancy:capture_beyond_reserved' end\n"+
 " hist(now,actor,kind,a,c,-fu,-fr,amt-cc,ref,tostring(amt),-cc)\n"+
 " return {kind}\n"+
 "end\n"+
 // A refund larger than what is settled so far (refund delivered before its capture, or beyond it) keeps the excess as a
 // per-authorization credit: not a bucket, never part of C, applied against the next capture so delivery order cannot change totals.
 "if ARGV[2]=='refund' then\n"+
 " local d=math.min(amt,s) move(a,c,0,0,-d) add(p..'c',amt-d)\n"+
 " local kind='refund' if amt>d then kind='discrepancy:refund_exceeds_settled' end\n"+
 " hist(now,actor,kind,a,c,0,0,-d,ref,tostring(amt),amt-d)\n"+
 " return {kind}\n"+
 "end\n"+
 "return {'unsupported_kind'}";
// No upstream file covers it: owner adjudication of a stuck unresolved authorization, with an audit entry naming the owner.
// Only unresolved cents move; only after the stuck threshold; nothing here is time-triggered. Marks 'a:'..id..':manual'.
// A manual decline is provisional: budget returns now, but a later provider capture still enters settled as
// discrepancy:capture_after_adjudicated_declined (overspend if C crosses max) and raises an owner notice.
// ARGV: hash, authId, decision (approved|declined), now, actor, note, stuckMs
const ADJUDICATE=PRELUDE+"if not redis.call('HGET',K,'hash') then return {'no_envelope'} end\n"+
 "local a=ARGV[2] local st=redis.call('HGET',K,'a:'..a)\n"+
 "if not st then return {'not_found'} end\n"+
 "if tonumber(redis.call('HGET',K,'a:'..a..':at') or '0')+tonumber(ARGV[7])>tonumber(ARGV[4]) then return {'not_stuck'} end\n"+
 "local moved=0 local other=0\n"+
 "for c in string.gmatch(redis.call('HGET',K,'a:'..a..':curs') or '','[^,]+') do\n"+
 " local p='a:'..a..':'..c..':' local u=num(p..'u') other=other+num(p..'r')+num(p..'s')\n"+
 " if u>0 then moved=moved+u if ARGV[3]=='approved' then move(a,c,-u,u,0) else move(a,c,-u,0,0) end hist(ARGV[4],ARGV[5],'manual_adjudication:'..ARGV[3],a,c,-u,(ARGV[3]=='approved' and u or 0),0,'',ARGV[6]) end\n"+
 "end\n"+
 "if moved==0 then return {'not_unresolved'} end\n"+
 "redis.call('HSET',K,'a:'..a..':manual',ARGV[3])\n"+
 "if ARGV[3]~='approved' and other==0 then redis.call('HSET',K,'a:'..a,'adjudicated_declined') end\n"+
 "return {'adjudicated',moved}";
// No upstream file covers it: owner acknowledges discrepancy notices up to a history sequence number (audit entry kept).
// ARGV: hash, seq, now, actor
const ACK=PRELUDE+"if not redis.call('HGET',K,'hash') then return {'no_envelope'} end\n"+
 "local seq=tonumber(ARGV[2]) local top=tonumber(redis.call('HGET',K,'hseq') or '0')\n"+
 "if not seq or seq<1 or seq>top then return {'invalid_seq'} end\n"+
 "if seq<=tonumber(redis.call('HGET',K,'noticeAck') or '0') then return {'already_acknowledged'} end\n"+
 "redis.call('HSET',K,'noticeAck',tostring(seq))\n"+
 "hist(ARGV[3],ARGV[4],'notices_acknowledged','','',0,0,0,'',ARGV[2])\n"+
 "return {'acknowledged'}";
const clean=s=>String(s==null?'':s).replace(/[|,\r\n]/g,' ').slice(0,200);
const okHash=h=>/^[a-f0-9]{64}$/.test(h||''),okAuth=x=>/^iauth_[A-Za-z0-9]+$/.test(x||'');
// call is a Redis command function (e.g. api/index.js r). Every script declares its single key in KEYS.
async function propose(call,terms,nowMs=Date.now(),actor='owner'){const hash=bindingHash(terms),key=envelopeKey(hash);const out=await call(['EVAL',PROPOSE,'1',key,hash,terms.botId,terms.accountId,terms.cardId,terms.merchantNetworkId.trim(),terms.currency,String(terms.maxTotalCents),String(terms.expiresAtMs),String(nowMs),clean(actor)]);return {hash,key,code:out[0]};}
async function decide(call,hash,decision,nowMs=Date.now(),actor='owner'){if(!okHash(hash))return {code:'binding_mismatch'};const d=['approve','revoke'].includes(decision)?decision:'deny';const out=await call(['EVAL',DECIDE,'1',envelopeKey(hash),hash,d,String(nowMs),clean(actor)]);return {code:out[0],status:out[1]};}
// botId must come from Alter's own card/bot mapping, never from merchant or webhook metadata; account, card and currency come from the signed event.
async function reserve(call,hash,a,nowMs=Date.now(),actor='issuer_webhook'){
 if(!okHash(hash)||!/^evt_[A-Za-z0-9]+$/.test(a.eventId||'')||!okAuth(a.authorizationId))return {code:'invalid_or_unsupported_request'};
 if(!Number.isSafeInteger(a.amountCents)||a.amountCents<1)return {code:'invalid_amount'};
 const out=await call(['EVAL',RESERVE,'1',envelopeKey(hash),hash,a.eventId,a.authorizationId,clean(a.botId),clean(a.accountId),clean(a.cardId),clean(a.merchantNetworkId),clean(a.currency),String(a.amountCents),String(nowMs),clean(actor)]);
 return {code:out[0],usedCents:out[1],remainingCents:out[2],chargedCents:0};
}
async function fence(call,hash,authorizationId,nowMs=Date.now(),actor='reconciler',ref=''){if(!okHash(hash)||!okAuth(authorizationId))return {code:'invalid'};const out=await call(['EVAL',FENCE,'1',envelopeKey(hash),hash,authorizationId,String(nowMs),clean(actor),clean(ref)]);return {code:out[0],state:out[1]};}
// e: {kind:'auth'|'capture'|'refund', eventId, authorizationId, currency, amountCents, approved, status, transactionId}
async function provider(call,hash,e,nowMs=Date.now(),actor='provider'){
 if(!okHash(hash)||!/^evt_[A-Za-z0-9]+$/.test(e.eventId||'')||!okAuth(e.authorizationId)||!/^[a-z]{3}$/.test(e.currency||'')||!['auth','capture','refund'].includes(e.kind))return {code:'invalid_or_unsupported_event'};
 const out=await call(['EVAL',PROVIDER,'1',envelopeKey(hash),hash,e.kind,e.eventId,e.authorizationId,e.currency,String(Number.isSafeInteger(e.amountCents)?e.amountCents:0),e.approved?'1':'0',clean(e.status||''),clean(e.transactionId||''),String(nowMs),clean(actor)]);
 return {code:out[0]};
}
async function ack(call,hash,seq,nowMs=Date.now(),actor='owner'){if(!okHash(hash)||!Number.isSafeInteger(seq))return {code:'invalid_seq'};const out=await call(['EVAL',ACK,'1',envelopeKey(hash),hash,String(seq),String(nowMs),clean(actor)]);return {code:out[0]};}
async function adjudicate(call,hash,authorizationId,decision,nowMs=Date.now(),actor='owner',note='',stuckMs=STUCK_MS){
 if(!okHash(hash)||!okAuth(authorizationId)||!['approved','declined'].includes(decision))return {code:'invalid'};
 const out=await call(['EVAL',ADJUDICATE,'1',envelopeKey(hash),hash,authorizationId,decision,String(nowMs),clean(actor),clean(note),String(stuckMs)]);
 return {code:out[0],movedCents:out[1]};
}
const HFIELDS=['at','actor','kind','authorizationId','currency','du','dr','ds','ref','note','dc'];
function parse(flat){const o={};for(let i=0;i<flat.length;i+=2)o[flat[i]]=flat[i+1];return o}
function history(o){return Object.keys(o).filter(k=>/^h:\d+$/.test(k)).map(k=>[Number(k.slice(2)),o[k].split('|')]).sort((x,y)=>x[0]-y[0]).map(([n,v])=>{const h={seq:n};HFIELDS.forEach((f,i)=>h[f]=['at','du','dr','ds','dc'].includes(f)?Number(v[i]||0):v[i]);return h})}
// No upstream file covers it: owner-facing view. Per currency: available, reserved, unsettled (unresolved), spent (settled), overspend.
async function read(call,hash,nowMs=Date.now(),stuckMs=STUCK_MS){
 const o=parse(await call(['HGETALL',envelopeKey(hash)])||[]);if(!o.hash)return null;
 const max=Number(o.maxCents),curs=[...new Set([o.currency,...String(o.curs||'').split(',').filter(Boolean)])];
 const buckets=curs.map(c=>{const u=Number(o['b:'+c+':u']||0),r=Number(o['b:'+c+':r']||0),s=Number(o['b:'+c+':s']||0),C=u+r+s,m=c===o.currency?max:0;return {currency:c,maxCents:m,unresolvedCents:u,reservedCents:r,settledCents:s,usedCents:C,availableCents:Math.max(0,m-C),overspendCents:Math.max(0,C-m)}});
 const auths=Object.keys(o).filter(k=>/^a:iauth_[A-Za-z0-9]+$/.test(k)).map(k=>{const id=k.slice(2),at=Number(o[k+':at']||0),per=String(o[k+':curs']||'').split(',').filter(Boolean).map(c=>({currency:c,unresolvedCents:Number(o[k+':'+c+':u']||0),reservedCents:Number(o[k+':'+c+':r']||0),settledCents:Number(o[k+':'+c+':s']||0)}));const unresolved=per.some(x=>x.unresolvedCents>0),manual=o[k+':manual']||null;return {authorizationId:id,state:o[k],at,amounts:per,unresolved,stuck:unresolved&&at+stuckMs<=nowMs,manual,provisional:manual==='declined'&&!per.some(x=>x.settledCents>0)}});
 const hist=history(o),ackSeq=Number(o.noticeAck||0);
 return {hash:o.hash,status:o.status,botId:o.botId,accountId:o.accountId,cardId:o.cardId,merchantNetworkId:o.merchant,currency:o.currency,maxTotalCents:max,expiresAtMs:Number(o.expiresAtMs),proposedBy:o.proposedBy||null,decidedBy:o.decidedBy||null,decidedAtMs:o.decidedAtMs?Number(o.decidedAtMs):null,revokedBy:o.revokedBy||null,buckets,authorizations:auths,stuck:auths.filter(x=>x.stuck),history:hist,discrepancies:hist.filter(h=>h.kind.startsWith('discrepancy:')),notices:hist.filter(h=>h.kind.startsWith('discrepancy:')&&h.seq>ackSeq),noticeAck:ackSeq,provisional:auths.filter(x=>x.provisional),chargedCents:0};
}
// No upstream file covers it: the falsifiable checks. (1) Each cent is in exactly one bucket: every per-authorization per-currency
// bucket amount is non-negative and equals the replay of history deltas. (2) Sum of buckets equals C: the envelope totals equal
// the per-authorization sums, per currency.
async function audit(call,hash){
 const o=parse(await call(['HGETALL',envelopeKey(hash)])||[]),errors=[],replay={},totals={};
 for(const h of history(o)){if(!h.authorizationId||!h.currency)continue;const k=h.authorizationId+':'+h.currency,x=replay[k]||(replay[k]={u:0,r:0,s:0,c:0});x.u+=h.du;x.r+=h.dr;x.s+=h.ds;x.c+=h.dc;}
 // 'c' is the refund credit: replay-checked like a bucket but never part of C.
 for(const f of Object.keys(o)){const m=/^a:(iauth_[A-Za-z0-9]+):([a-z]{3}):([ursc])$/.exec(f);if(!m)continue;const v=Number(o[f]),k=m[1]+':'+m[2];if(v<0)errors.push('negative '+f);if((replay[k]||{u:0,r:0,s:0,c:0})[m[3]]!==v)errors.push('replay mismatch '+f+' stored '+v+' replayed '+((replay[k]||{})[m[3]]||0));if(m[3]==='c')continue;const t=totals[m[2]]||(totals[m[2]]={u:0,r:0,s:0});t[m[3]]+=v;}
 for(const k of Object.keys(replay)){const [id,c]=k.split(':');for(const b of ['u','r','s','c'])if(replay[k][b]!==Number(o['a:'+id+':'+c+':'+b]||0))errors.push('history without stored field a:'+k+':'+b);}
 const curs=new Set([...Object.keys(totals),...Object.keys(o).map(f=>(/^b:([a-z]{3}):[urs]$/.exec(f)||[])[1]).filter(Boolean)]);
 for(const c of curs)for(const b of ['u','r','s']){const stored=Number(o['b:'+c+':'+b]||0),sum=(totals[c]||{u:0,r:0,s:0})[b];if(stored!==sum)errors.push('bucket total b:'+c+':'+b+' '+stored+' != per-authorization sum '+sum);}
 return {ok:errors.length===0,errors};
}
// No upstream file covers it: in-process EVAL for the memory store and tests. Runs the same Lua text in fengari
// (devDependency, loaded lazily) over a Map of Redis hashes, refusing keys outside KEYS and KEYS that span hash slots.
const SCRIPTS=new Set([PROPOSE,DECIDE,RESERVE,FENCE,PROVIDER,ADJUDICATE,ACK]),slot=k=>{const m=/\{([^}]+)\}/.exec(k);return m?m[1]:k};
function hashCmd(store,declared,[op,k,...a]){
 if(!declared.includes(k))throw Error('undeclared key '+k);
 const h=store.get(k);
 switch(String(op).toUpperCase()){
  case 'EXISTS':return store.has(k)?1:0;
  case 'HSET':{const m=h||new Map();let n=0;for(let i=0;i<a.length;i+=2){if(!m.has(a[i]))n++;m.set(a[i],a[i+1])}store.set(k,m);return n}
  case 'HMGET':return a.map(f=>h&&h.has(f)?h.get(f):null);
  case 'HEXISTS':return h&&h.has(a[0])?1:0;
  case 'HGET':return h&&h.has(a[0])?h.get(a[0]):null;
  case 'HINCRBY':{const m=h||new Map(),v=parseInt(m.get(a[0])||'0',10)+parseInt(a[1],10);m.set(a[0],String(v));store.set(k,m);return v}
 }
 throw Error('unsupported '+op);
}
function localEval(store,cmd){
 const op=String(cmd[0]).toUpperCase();
 if(op==='HGETALL'){const h=store.get(cmd[1]);return h?[...h].flat():[]}
 if(op==='HGET'){const h=store.get(cmd[1]);return h&&h.has(cmd[2])?h.get(cmd[2]):null}
 if(op!=='EVAL'||!SCRIPTS.has(cmd[1]))throw Error('unsupported local envelope command');
 const {lua,lauxlib,lualib,to_luastring}=require('fengari');
 const n=Number(cmd[2]),keys=cmd.slice(3,3+n).map(String),argv=cmd.slice(3+n).map(String);
 if(new Set(keys.map(slot)).size!==1)throw Error('CROSSSLOT');
 const push=(L,v)=>{if(v===null)lua.lua_pushboolean(L,false);else if(typeof v==='number')lua.lua_pushinteger(L,v);else if(Array.isArray(v)){lua.lua_createtable(L,v.length,0);v.forEach((x,i)=>{push(L,x);lua.lua_rawseti(L,-2,i+1)})}else lua.lua_pushstring(L,to_luastring(String(v)))};
 // Redis reply conversion: number -> integer, string -> bulk, table -> array up to first nil/false.
 const reply=(L,i)=>{const t=lua.lua_type(L,i);
  if(t===lua.LUA_TNUMBER)return Math.trunc(lua.lua_tonumber(L,i));
  if(t===lua.LUA_TSTRING)return lua.lua_tojsstring(L,i);
  if(t===lua.LUA_TTABLE){const out=[];for(let j=1;;j++){lua.lua_geti(L,i,j);if(lua.lua_isnil(L,-1)||(lua.lua_isboolean(L,-1)&&!lua.lua_toboolean(L,-1))){lua.lua_pop(L,1);break}out.push(reply(L,lua.lua_gettop(L)));lua.lua_pop(L,1)}return out}
  return null};
 const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
 push(L,keys);lua.lua_setglobal(L,to_luastring('KEYS'));push(L,argv);lua.lua_setglobal(L,to_luastring('ARGV'));
 lua.lua_createtable(L,0,1);lua.lua_pushjsfunction(L,L=>{const args=[];for(let i=1;i<=lua.lua_gettop(L);i++)args.push(lua.lua_tojsstring(L,i));push(L,hashCmd(store,keys,args));return 1});lua.lua_setfield(L,-2,to_luastring('call'));lua.lua_setglobal(L,to_luastring('redis'));
 if(lauxlib.luaL_loadstring(L,to_luastring(cmd[1]))!==lua.LUA_OK||lua.lua_pcall(L,0,1,0)!==lua.LUA_OK)throw Error('lua: '+lua.lua_tojsstring(L,-1));
 return reply(L,lua.lua_gettop(L));
}
module.exports={STUCK_MS,bindingHash,envelopeKey,propose,decide,reserve,fence,provider,adjudicate,ack,read,audit,localEval,SCRIPTS,PROPOSE,DECIDE,RESERVE,FENCE,PROVIDER,ADJUDICATE,ACK};
