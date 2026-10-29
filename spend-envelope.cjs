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
const STUCK_MS=120000,HELD_WINDOW_MS=7*86400000; // authorization expiry default: 7 days from the stored held_since
// No upstream file covers it: canonical sha256 over exactly the seven approved envelope terms (bot, issuer account, card, merchant, currency, max, expiry), in fixed order.
// hash_version 2 hashes the merchant canonicalized (trim, whitespace runs -> one space, case kept). hash_version 1 (envelopes written before
// this change) hashed it raw; bindingHashV1 and verify() keep those approvals valid. Existing rows are never rewritten.
const HASH_VERSION=2,canon=m=>String(m).replace(/\s+/g,' ').trim();
const hashOf=(t,m)=>crypto.createHash('sha256').update(JSON.stringify(TERMS.map(k=>k==='merchantNetworkId'?m:t[k]))).digest('hex');
function validTerms(t){
 if(!t||typeof t.botId!=='string'||!/^[A-Za-z0-9_]{1,120}$/.test(t.botId)||!/^acct_[A-Za-z0-9]+$/.test(t.accountId||'')||!/^ic_[A-Za-z0-9]+$/.test(t.cardId||'')||typeof t.merchantNetworkId!=='string'||!t.merchantNetworkId.trim()||t.merchantNetworkId.length>100||/[|,]/.test(t.merchantNetworkId)||!/^[a-z]{3}$/.test(t.currency||'')||!Number.isSafeInteger(t.maxTotalCents)||t.maxTotalCents<1||t.maxTotalCents>1000000||!Number.isSafeInteger(t.expiresAtMs))throw Error('Envelope needs botId, issuer accountId, cardId, merchantNetworkId, a 3-letter lowercase currency, integer maxTotalCents (1..1000000) and integer expiresAtMs');
}
const bindingHash=t=>{validTerms(t);return hashOf(t,canon(t.merchantNetworkId))};
const bindingHashV1=t=>{validTerms(t);return hashOf(t,t.merchantNetworkId)};
// One key per envelope; the {hash} tag pins every script to a single slot. gl: keys are never workspace-prefixed by nsKey.
const envelopeKey=hash=>'gl:spend-envelope:{'+hash+'}';
// No upstream file covers it: shared Lua helpers. Every bucket change goes through move(), which updates the per-authorization
// per-currency amounts and the envelope totals together; hist() appends the same deltas so audit() can replay them.
const PRELUDE="local K=KEYS[1]\n"+
 "local function num(f) return tonumber(redis.call('HGET',K,f) or '0') or 0 end\n"+
 "local function add(f,d) if d~=0 then redis.call('HINCRBY',K,f,d) end end\n"+
 "local function addcur(f,c) local l=redis.call('HGET',K,f) or '' if not string.find(','..l..',',','..c..',',1,true) then if l=='' then redis.call('HSET',K,f,c) else redis.call('HSET',K,f,l..','..c) end end end\n"+
 "local function move(a,c,du,dr,ds,dd) dd=dd or 0 addcur('curs',c) addcur('a:'..a..':curs',c) local p='a:'..a..':'..c..':' add(p..'u',du) add(p..'r',dr) add(p..'s',ds) add(p..'d',dd) add('b:'..c..':u',du) add('b:'..c..':r',dr) add('b:'..c..':s',ds) add('b:'..c..':d',dd) end\n"+
 "local function hist(now,actor,kind,a,c,du,dr,ds,ref,note,dc,dd) local n=redis.call('HINCRBY',K,'hseq',1) redis.call('HSET',K,'h:'..n,table.concat({now,actor,kind,a,c,du,dr,ds,ref,note,dc or 0,dd or 0},'|')) end\n";
// No upstream file covers it: SET-NX style create on a Redis hash, rejecting a duplicate proposal of the same terms.
// ARGV: hash, bot, account, card, merchant (canonical), currency, max, expiresAt, now, actor, hash_version ('' for a pre-version row)
const PROPOSE=PRELUDE+"if redis.call('EXISTS',K)==1 then return {'duplicate_proposal'} end\n"+
 "if tonumber(ARGV[8])<=tonumber(ARGV[9]) then return {'expired'} end\n"+
 "redis.call('HSET',K,'hash',ARGV[1],'botId',ARGV[2],'accountId',ARGV[3],'cardId',ARGV[4],'merchant',ARGV[5],'currency',ARGV[6],'maxCents',ARGV[7],'expiresAtMs',ARGV[8],'status','pending_approval','createdAtMs',ARGV[9],'proposedBy',ARGV[10])\n"+
 "if ARGV[11]~='' then redis.call('HSET',K,'hash_version',ARGV[11]) end\n"+
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
// amount above what remains rejects (ErrInsufficientFund). R1: available = max - settled - held, held = unresolved + reserved + declined_pending.
// R2: approve only if amount <= available; otherwise decline insufficient_available. The approve path never reserves a partial amount.
// Fence re-check: the authorization record ('a:'..id) is read and written inside this one script, so a fence or provider
// record written first makes a later reserve refuse, and a reserve written first is what the fence finds. No check-then-write gap.
// Accepted cents go to unresolved until provider evidence confirms them.
// ARGV: hash, eventId, authId, bot, account, card, merchant, currency, amount, now, actor, authExpiryMs
const RESERVE=PRELUDE+"local s=redis.call('HMGET',K,'hash','status','botId','accountId','cardId','merchant','currency','maxCents','expiresAtMs')\n"+
 "if not s[1] then return {'no_envelope'} end\n"+
 "local a,c,now=ARGV[3],ARGV[8],ARGV[10]\n"+
 "if redis.call('HEXISTS',K,'e:'..ARGV[2])==1 or redis.call('HEXISTS',K,'a:'..a)==1 then return {'replay_declined'} end\n"+
 "local function cn(x) x=string.gsub(x,'%s+',' ') x=string.gsub(x,'^ ','') x=string.gsub(x,' $','') return x end\n"+
 "local max,amt=tonumber(s[8]),tonumber(ARGV[9])\n"+
 "local used=num('b:'..s[7]..':u')+num('b:'..s[7]..':r')+num('b:'..s[7]..':s')+num('b:'..s[7]..':d')\n"+
 "local code\n"+
 "if s[1]~=ARGV[1] then code='binding_mismatch'\n"+
 "elseif s[2]~='approved' then code='envelope_'..s[2]\n"+
 "elseif tonumber(s[9])<=tonumber(now) then code='envelope_expired'\n"+
 "elseif s[3]~=ARGV[4] or s[4]~=ARGV[5] or s[5]~=ARGV[6] or cn(s[6])~=cn(ARGV[7]) or s[7]~=c then code='envelope_mismatch'\n"+
 "elseif not amt or amt<1 or amt%1~=0 then code='invalid_amount'\n"+
 "elseif amt>max-used then code='insufficient_available' end\n"+
 "redis.call('HSET',K,'e:'..ARGV[2],a)\n"+
 "if code then redis.call('HSET',K,'a:'..a,'declined') hist(now,ARGV[11],'declined:'..code,a,c,0,0,0,ARGV[2],'') return {code,used,math.max(0,max-used)} end\n"+
 "redis.call('HSET',K,'a:'..a,'open','a:'..a..':at',now)\n"+
 "move(a,c,amt,0,0)\n"+
 // A1/A2: held_since and the deadline are written with the first held cents and never moved afterwards.
 "redis.call('HSET',K,'a:'..a..':since',now,'a:'..a..':deadline',tostring(tonumber(now)+(tonumber(ARGV[12]) or 604800000)))\n"+
 "hist(now,ARGV[11],'reserve_unresolved',a,c,amt,0,0,ARGV[2],'')\n"+
 "return {'reserved',used+amt,math.max(0,max-used-amt)}";
// No upstream file covers it: reconciler fence. Same key and same 'a:'..id field RESERVE checks, so exactly one of
// "reserve then fence (fence finds it)" or "fence then reserve (reserve refuses)" happens. A found record is never freed here;
// R7: an item in declined_pending keeps its record, so FENCE finds it and its cents stay held.
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
// ARGV: hash, kind (auth|capture|refund), providerEventId, authId, currency, amount, approved (1|0), status, transactionId, now, actor, cardId, how, authExpiryMs
const PROVIDER=PRELUDE+"if not redis.call('HGET',K,'hash') then return {'no_envelope'} end\n"+
 "if redis.call('HEXISTS',K,'p:'..ARGV[3])==1 then return {'duplicate'} end\n"+
 "if ARGV[9]~='' and redis.call('HEXISTS',K,'t:'..ARGV[9])==1 then redis.call('HSET',K,'p:'..ARGV[3],'dup_tx') return {'duplicate'} end\n"+
 "redis.call('HSET',K,'p:'..ARGV[3],ARGV[2])\n"+
 "if ARGV[9]~='' then redis.call('HSET',K,'t:'..ARGV[9],ARGV[3]) end\n"+
 "local a,c,amt,now,actor,ref=ARGV[4],ARGV[5],tonumber(ARGV[6]),ARGV[10],ARGV[11],ARGV[3]\n"+
 "local st=redis.call('HGET',K,'a:'..a)\n"+
 "local p='a:'..a..':'..c..':'\n"+
 "local u,r,s,d=num(p..'u'),num(p..'r'),num(p..'s'),num(p..'d')\n"+
 "local win=tonumber(ARGV[14]) or 604800000\n"+
 "local function usedOf(cur) return num('b:'..cur..':u')+num('b:'..cur..':r')+num('b:'..cur..':d')+num('b:'..cur..':s') end\n"+
 // B1/B2/B4: cents Alter never reserved are consumed the moment they are recorded (available is derived from the buckets, clamped at 0),
 // marked unreserved with their source, and the overspend realized by this entry (how far it pushed use past the limit) is written into it.
 // An unreserved approval cannot be declined: the issuer window closed before it reached us, so it consumes and notifies, nothing more.
 "local function unres(src,dr,ds,kind) local mx=tonumber(redis.call('HGET',K,'maxCents') or '0') or 0 if c~=redis.call('HGET',K,'currency') then mx=0 end local before=usedOf(c) move(a,c,0,dr,ds) local after=usedOf(c) local over=math.max(0,after-mx)-math.max(0,before-mx) redis.call('HSET',K,'a:'..a..':unreserved',src) hist(now,actor,kind,a,c,0,dr,ds,ref,'card='..ARGV[12]..' source='..src..' how='..ARGV[13]..' overspend_realized='..over) end\n"+
 "if ARGV[2]=='auth' then\n"+
 " local approved,status=ARGV[7]=='1',ARGV[8]\n"+
 " if not st then\n"+
 "  if approved and status=='pending' then redis.call('HSET',K,'a:'..a,'open','a:'..a..':at',now,'a:'..a..':since',now,'a:'..a..':deadline',tostring(tonumber(now)+win)) unres('approval',amt,0,'discrepancy:unreserved_approval') return {'discrepancy:unreserved_approval'} end\n"+
 "  redis.call('HSET',K,'a:'..a,'fenced') hist(now,actor,'fence:provider_'..status,a,c,0,0,0,ref,'') return {'fenced'}\n"+
 " end\n"+
 " if (not approved or status~='pending') and u+r+d==0 then local by=redis.call('HGET',K,'a:'..a..':releasedBy') if by then hist(now,actor,'release_noop',a,c,0,0,0,ref,'already released by '..by) return {'noop_already_released'} end end\n"+
 " if not approved then move(a,c,-u,-r,0,-d) if u+r+d>0 then redis.call('HSET',K,'a:'..a..':releasedBy','webhook:'..ref,'a:'..a..':releasedAt',now) end if s==0 then redis.call('HSET',K,'a:'..a,'released') end hist(now,actor,'provider_declined',a,c,-u,-r,0,ref,'',0,-d) return {'released'} end\n"+
 " if status=='pending' then\n"+
 "  if u>0 then local keep=math.min(amt,u) move(a,c,-u,keep,0) hist(now,actor,'provider_approved',a,c,-u,keep,0,ref,'') return {'confirmed'} end\n"+
 "  if st=='open' and r>amt then move(a,c,0,amt-r,0) hist(now,actor,'partial_reversal',a,c,0,amt-r,0,ref,'') return {'reduced'} end\n"+
 "  hist(now,actor,'ignored_snapshot',a,c,0,0,0,ref,st) return {'ignored'}\n"+
 " end\n"+
 " move(a,c,-u,-r,0,-d) if u+r+d>0 then redis.call('HSET',K,'a:'..a..':releasedBy','webhook:'..ref,'a:'..a..':releasedAt',now) end redis.call('HSET',K,'a:'..a,'closed') hist(now,actor,'provider_'..status,a,c,-u,-r,0,ref,'',0,-d) return {'closed'}\n"+
 "end\n"+
 "if not amt or amt<1 or amt%1~=0 then hist(now,actor,'discrepancy:invalid_amount',a,c,0,0,0,ref,ARGV[6]) return {'invalid_amount'} end\n"+
 "if ARGV[2]=='capture' then\n"+
 " if not st then redis.call('HSET',K,'a:'..a,'closed','a:'..a..':at',now) unres('capture',0,amt,'discrepancy:unreserved_capture') return {'discrepancy:unreserved_capture'} end\n"+
 " local cc=math.min(num(p..'c'),amt)\n"+
 " if d>0 and st=='open' then\n"+
 // R4 (revised): a capture settles only the cents captured, drawing them from declined_pending. Unmatched held cents stay held and are
 // released only by void, reversal or expiry (the auth branch above), never by a capture. The item closes when held reaches 0, so a
 // second capture draws from what is left. A capture that differs from what was held is a discrepancy entry; any excess beyond the
 // held cents enters settled (the remaining overspend path). Settled gets the full captured amount, net of refund credit.
 "  local fd=math.min(amt,d)\n"+
 "  move(a,c,0,0,amt-cc,-fd) add(p..'c',-cc)\n"+
 "  if d-fd==0 and u==0 and r==0 then redis.call('HSET',K,'a:'..a,'closed') end\n"+
 "  local kd='capture_resolved_declined_pending' if amt~=d then kd='discrepancy:capture_differs_from_held' end\n"+
 "  hist(now,actor,kd,a,c,0,0,amt-cc,ref,tostring(amt),-cc,-fd)\n"+
 "  return {kd}\n"+
 " end\n"+
 " local fr=math.min(amt,r) local rest=amt-fr local fu=math.min(rest,u) rest=rest-fu\n"+
 " move(a,c,-fu,-fr,amt-cc) add(p..'c',-cc)\n"+
 " local kind='capture' if st~='open' then kind='discrepancy:capture_after_'..st elseif rest>0 then kind='discrepancy:capture_beyond_reserved' end\n"+
 " hist(now,actor,kind,a,c,-fu,-fr,amt-cc,ref,tostring(amt),-cc)\n"+
 " return {kind}\n"+
 "end\n"+
 // A refund larger than what is settled so far (refund delivered before its capture, or beyond it) keeps the excess as a
 // per-authorization credit: not a bucket, never part of C, applied against the next capture so delivery order cannot change totals.
 "if ARGV[2]=='refund' then\n"+
 " local rf=math.min(amt,s) move(a,c,0,0,-rf) add(p..'c',amt-rf)\n"+
 " local kind='refund' if amt>rf then kind='discrepancy:refund_exceeds_settled' end\n"+
 " hist(now,actor,kind,a,c,0,0,-rf,ref,tostring(amt),amt-rf)\n"+
 " return {kind}\n"+
 "end\n"+
 "return {'unsupported_kind'}";
// No upstream file covers it: owner adjudication of a stuck unresolved authorization, with an audit entry naming the owner.
// Only unresolved cents move; only after the stuck threshold; nothing here is time-triggered. Marks 'a:'..id..':manual'.
// R3: a manual decline moves unresolved -> declined_pending (bucket 'd'). The cents stay held, available does not move, and the
// authorization stays open. It resolves only through PROVIDER (each capture settles what it captures; void/reversal/expiry releases
// what is still held). R5: no timer.
// ARGV: hash, authId, decision (approved|declined), now, actor, note, stuckMs
const ADJUDICATE=PRELUDE+"if not redis.call('HGET',K,'hash') then return {'no_envelope'} end\n"+
 "local a=ARGV[2] local st=redis.call('HGET',K,'a:'..a)\n"+
 "if not st then return {'not_found'} end\n"+
 "if tonumber(redis.call('HGET',K,'a:'..a..':at') or '0')+tonumber(ARGV[7])>tonumber(ARGV[4]) then return {'not_stuck'} end\n"+
 "local moved=0 local other=0\n"+
 "for c in string.gmatch(redis.call('HGET',K,'a:'..a..':curs') or '','[^,]+') do\n"+
 " local p='a:'..a..':'..c..':' local u=num(p..'u') other=other+num(p..'r')+num(p..'s')\n"+
 " if u>0 then moved=moved+u if ARGV[3]=='approved' then move(a,c,-u,u,0) else move(a,c,-u,0,0,u) end hist(ARGV[4],ARGV[5],'manual_adjudication:'..ARGV[3],a,c,-u,(ARGV[3]=='approved' and u or 0),0,'',ARGV[6],0,(ARGV[3]=='declined' and u or 0)) end\n"+
 "end\n"+
 "if moved==0 then return {'not_unresolved'} end\n"+
 "redis.call('HSET',K,'a:'..a..':manual',ARGV[3])\n"+
  "return {'adjudicated',moved}";
// No upstream file covers it: reconcile one authorization's held cents against what the provider reported. The caller has already read the
// provider (reconcile() below); this script only applies that reading, atomically, on the same key. open -> release nothing, mark stuck.
// closed -> settle the provider's net captured cents not already settled and release the remainder. voided/expired -> release the remainder.
// A4: the release records its authority; a second authority for cents already released is a no-op with a note. A5: concurrent callers
// serialize on this one key, so exactly one applies and the rest see nothing held.
// Capture/void semantics adapted from formancehq/wallets pkg/numscript/confirm-hold.num and cancel-hold.num @3177b665175c33867cf4a1a02b0c792d7d3d2dfd.
// ARGV: hash, authId, outcome (open|closed|voided|expired|unreadable), currency, netCapturedCents, now, authority, note
const RECONCILE=PRELUDE+"if not redis.call('HGET',K,'hash') then return {'no_envelope'} end\n"+
 "local a,outcome,c,net,now,authority,note=ARGV[2],ARGV[3],ARGV[4],tonumber(ARGV[5]) or 0,ARGV[6],ARGV[7],ARGV[8]\n"+
 "if not redis.call('HGET',K,'a:'..a) then return {'not_found'} end\n"+
 "local held=0 local rows={}\n"+
 "for cc in string.gmatch(redis.call('HGET',K,'a:'..a..':curs') or '','[^,]+') do local p='a:'..a..':'..cc..':' local u,r,d=num(p..'u'),num(p..'r'),num(p..'d') held=held+u+r+d rows[#rows+1]={cc,u,r,d} end\n"+
 "if held==0 then local by=redis.call('HGET',K,'a:'..a..':releasedBy') hist(now,authority,'release_noop',a,c,0,0,0,authority,by and ('already released by '..by) or 'nothing held') return {'noop',by or ''} end\n"+
 "if outcome=='open' or outcome=='unreadable' then if outcome=='open' then redis.call('HSET',K,'a:'..a..':stuck',now) end hist(now,authority,'reconcile:'..outcome,a,c,0,0,0,authority,note) return {outcome} end\n"+
 "local delta=0 if outcome=='closed' then delta=math.max(0,net-num('a:'..a..':'..c..':s')) end\n"+
 "local seen=false for i=1,#rows do local x=rows[i] local ds=0 if x[1]==c then ds=delta seen=true end move(a,x[1],-x[2],-x[3],ds,-x[4]) hist(now,authority,'reconcile:'..outcome,a,x[1],-x[2],-x[3],ds,authority,note,0,-x[4]) end\n"+
 "if not seen and delta>0 then move(a,c,0,0,delta,0) hist(now,authority,'reconcile:'..outcome,a,c,0,0,delta,authority,note) end\n"+
 "redis.call('HSET',K,'a:'..a,'closed','a:'..a..':releasedBy',authority,'a:'..a..':releasedAt',now) redis.call('HDEL',K,'a:'..a..':stuck')\n"+
 "return {'released',delta,held}";
// No upstream file covers it: B3 unassigned bucket. One system row per issuer account, created on first need. Its status is 'unassigned'
// and it has no limit, so RESERVE refuses it and nothing is ever approved against it; it exists only to record cents that could not be attributed.
// ARGV: hash, account, currency, now
const UNASSIGNED=PRELUDE+"if redis.call('EXISTS',K)==1 then return {'exists'} end\n"+
 "redis.call('HSET',K,'hash',ARGV[1],'botId','unassigned','accountId',ARGV[2],'cardId','ic_unassigned','merchant','unassigned','currency',ARGV[3],'maxCents','0','expiresAtMs','9999999999999','status','unassigned','createdAtMs',ARGV[4],'proposedBy','system','hash_version','2')\n"+
 "hist(ARGV[4],'system','unassigned_bucket_created','','',0,0,0,'',ARGV[2])\n"+
 "return {'created'}";
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
async function propose(call,terms,nowMs=Date.now(),actor='owner'){
 const hash=bindingHash(terms),key=envelopeKey(hash),m=canon(terms.merchantNetworkId);
 // Same merchant proposed before this change (hash_version 1, merchant hashed trimmed-only by the API): still a duplicate.
 const legacy=bindingHashV1({...terms,merchantNetworkId:String(terms.merchantNetworkId).trim()});
 if(legacy!==hash&&await call(['HGET',envelopeKey(legacy),'hash']))return {hash:legacy,key:envelopeKey(legacy),code:'duplicate_proposal'};
 const out=await call(['EVAL',PROPOSE,'1',key,hash,terms.botId,terms.accountId,terms.cardId,m,terms.currency,String(terms.maxTotalCents),String(terms.expiresAtMs),String(nowMs),clean(actor),String(HASH_VERSION)]);return {hash,key,code:out[0]};}
async function decide(call,hash,decision,nowMs=Date.now(),actor='owner'){if(!okHash(hash))return {code:'binding_mismatch'};const d=['approve','revoke'].includes(decision)?decision:'deny';const out=await call(['EVAL',DECIDE,'1',envelopeKey(hash),hash,d,String(nowMs),clean(actor)]);return {code:out[0],status:out[1]};}
// botId must come from Alter's own card/bot mapping, never from merchant or webhook metadata; account, card and currency come from the signed event.
async function reserve(call,hash,a,nowMs=Date.now(),actor='issuer_webhook',opts={}){
 if(!okHash(hash)||!/^evt_[A-Za-z0-9]+$/.test(a.eventId||'')||!okAuth(a.authorizationId))return {code:'invalid_or_unsupported_request'};
 if(!Number.isSafeInteger(a.amountCents)||a.amountCents<1)return {code:'invalid_amount'};
 const out=await call(['EVAL',RESERVE,'1',envelopeKey(hash),hash,a.eventId,a.authorizationId,clean(a.botId),clean(a.accountId),clean(a.cardId),canon(clean(a.merchantNetworkId)),clean(a.currency),String(a.amountCents),String(nowMs),clean(actor),String(opts.authExpiryMs||HELD_WINDOW_MS)]);
 return {code:out[0],usedCents:out[1],remainingCents:out[2],chargedCents:0};
}
async function fence(call,hash,authorizationId,nowMs=Date.now(),actor='reconciler',ref=''){if(!okHash(hash)||!okAuth(authorizationId))return {code:'invalid'};const out=await call(['EVAL',FENCE,'1',envelopeKey(hash),hash,authorizationId,String(nowMs),clean(actor),clean(ref)]);return {code:out[0],state:out[1]};}
// e: {kind:'auth'|'capture'|'refund', eventId, authorizationId, currency, amountCents, approved, status, transactionId}
async function provider(call,hash,e,nowMs=Date.now(),actor='provider'){
 if(!okHash(hash)||!/^evt_[A-Za-z0-9]+$/.test(e.eventId||'')||!okAuth(e.authorizationId)||!/^[a-z]{3}$/.test(e.currency||'')||!['auth','capture','refund'].includes(e.kind))return {code:'invalid_or_unsupported_event'};
 const out=await call(['EVAL',PROVIDER,'1',envelopeKey(hash),hash,e.kind,e.eventId,e.authorizationId,e.currency,String(Number.isSafeInteger(e.amountCents)?e.amountCents:0),e.approved?'1':'0',clean(e.status||''),clean(e.transactionId||''),String(nowMs),clean(actor),clean(e.cardId||''),clean(e.how||'card'),String(e.authExpiryMs||HELD_WINDOW_MS)]);
 return {code:out[0]};
}
// ---- A3/A5/A6: reconciliation. reader(authorizationId) -> {state:'open'|'closed'|'voided'|'expired', capturedCents, currency}; it must be a READ.
// A reader that throws or answers anything else is 'unreadable': nothing is released and the attempt is recorded. No timer, ever, without a read.
async function reconcile(call,hash,authorizationId,reader,nowMs=Date.now(),authority='reconcile'){
 if(!okHash(hash)||!okAuth(authorizationId)||typeof reader!=='function')return {code:'invalid'};
 let p;try{p=await reader(authorizationId)}catch(e){p={state:'unreadable',note:String((e&&e.message)||e).slice(0,80)}}
 const state=p&&['open','closed','voided','expired'].includes(p.state)?p.state:'unreadable';
 const out=await call(['EVAL',RECONCILE,'1',envelopeKey(hash),hash,authorizationId,state,/^[a-z]{3}$/.test(p&&p.currency||'')?p.currency:'usd',String(Number.isSafeInteger(p&&p.capturedCents)?p.capturedCents:0),String(nowMs),clean(authority),clean((p&&p.note)||'')]);
 return {code:out[0],settledCents:out[0]==='released'?out[1]:0,releasedCents:out[0]==='released'?out[2]:0,by:out[0]==='noop'?out[1]:undefined,providerState:state};
}
// A2: sweep the items whose stored deadline has passed. One provider read per item; bounded per call.
async function reconcileDue(call,hash,reader,nowMs=Date.now(),authority='reconcile:sweep',limit=5){
 const v=await read(call,hash,nowMs);if(!v)return [];const out=[];
 for(const x of v.pastDeadline.slice(0,limit))out.push({authorizationId:x.authorizationId,...await reconcile(call,hash,x.authorizationId,reader,nowMs,authority+':'+x.authorizationId)});
 return out;
}
// A6: owner action. Runs the same reconcile for one item and refuses when the provider says it is still open.
async function releaseStranded(call,hash,authorizationId,reader,nowMs=Date.now(),actor='owner'){
 const r=await reconcile(call,hash,authorizationId,reader,nowMs,'owner_release:'+clean(actor));
 return r.code==='open'?{...r,code:'refused_provider_open'}:r;
}
// No upstream file covers it: read-only Stripe test-mode authorization reader. GET only; refuses anything but a test-mode key.
// Field mapping follows Stripe Issuing docs and is NOT verified against live test-mode objects: status pending -> open, reversed -> voided,
// expired -> expired, closed -> closed (captured = -sum of expanded transaction amounts, captures negative and refunds positive; an
// unexpanded closed authorization is unreadable, never guessed; approved:false -> voided).
function stripeReader({fetch:fx,key,version='2025-03-31.basil',timeoutMs=2500}){
 if(typeof fx!=='function'||!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(key||''))throw Error('A Stripe test-mode key and a fetch are required');
 return async id=>{
  if(!okAuth(id))throw Error('bad_authorization_id');
  const res=await fx('https://api.stripe.com/v1/issuing/authorizations/'+id+'?expand[]=transactions',{method:'GET',headers:{Authorization:'Bearer '+key,'Stripe-Version':version},signal:AbortSignal.timeout(timeoutMs)});
  if(!res||!res.ok)throw Error('provider_http_'+(res&&res.status));
  const j=await res.json();if(!j||j.id!==id)throw Error('provider_id_mismatch');
  const currency=String(j.currency||'usd').toLowerCase();
  if(j.status==='pending')return {state:'open',capturedCents:0,currency};
  if(j.status==='reversed')return {state:'voided',capturedCents:0,currency};
  if(j.status==='expired')return {state:'expired',capturedCents:0,currency};
  if(j.status==='closed'){
   if(j.approved===false)return {state:'voided',capturedCents:0,currency};
   const tx=j.transactions&&j.transactions.data;if(!Array.isArray(tx))throw Error('transactions_not_expanded');
   const net=tx.reduce((n,t)=>n-Number(t.amount||0),0);return {state:'closed',capturedCents:Math.max(0,Math.trunc(net)),currency};
  }
  throw Error('unknown_provider_status');
 };
}
const unassignedHash=account=>crypto.createHash('sha256').update('unassigned:'+account).digest('hex');
async function ensureUnassigned(call,account,currency='usd',nowMs=Date.now()){
 if(!/^acct_[A-Za-z0-9]+$/.test(account||'')||!/^[a-z]{3}$/.test(currency))return null;
 const hash=unassignedHash(account);await call(['EVAL',UNASSIGNED,'1',envelopeKey(hash),hash,account,currency,String(nowMs)]);return hash;
}
async function ack(call,hash,seq,nowMs=Date.now(),actor='owner'){if(!okHash(hash)||!Number.isSafeInteger(seq))return {code:'invalid_seq'};const out=await call(['EVAL',ACK,'1',envelopeKey(hash),hash,String(seq),String(nowMs),clean(actor)]);return {code:out[0]};}
async function adjudicate(call,hash,authorizationId,decision,nowMs=Date.now(),actor='owner',note='',stuckMs=STUCK_MS){
 if(!okHash(hash)||!okAuth(authorizationId)||!['approved','declined'].includes(decision))return {code:'invalid'};
 const out=await call(['EVAL',ADJUDICATE,'1',envelopeKey(hash),hash,authorizationId,decision,String(nowMs),clean(actor),clean(note),String(stuckMs)]);
 return {code:out[0],movedCents:out[1]};
}
const HFIELDS=['at','actor','kind','authorizationId','currency','du','dr','ds','ref','note','dc','dd'];
function parse(flat){const o={};for(let i=0;i<flat.length;i+=2)o[flat[i]]=flat[i+1];return o}
function history(o){return Object.keys(o).filter(k=>/^h:\d+$/.test(k)).map(k=>[Number(k.slice(2)),o[k].split('|')]).sort((x,y)=>x[0]-y[0]).map(([n,v])=>{const h={seq:n};HFIELDS.forEach((f,i)=>h[f]=['at','du','dr','ds','dc','dd'].includes(f)?Number(v[i]||0):v[i]);return h})}
// No upstream file covers it: card-use check that the stored terms still hash to the key. v2 first; v1 only for rows not stamped
// hash_version 2 (envelopes approved before this change). Read-only: nothing is rewritten.
async function verify(call,hash){
 if(!okHash(hash))return {ok:false,code:'invalid_hash'};
 const f=await call(['HMGET',envelopeKey(hash),'hash','botId','accountId','cardId','merchant','currency','maxCents','expiresAtMs','hash_version']);
 if(!f||!f[0])return {ok:false,code:'no_envelope'};
 const t={botId:f[1],accountId:f[2],cardId:f[3],merchantNetworkId:f[4],currency:f[5],maxTotalCents:Number(f[6]),expiresAtMs:Number(f[7])};
 try{if(f[0]===hash&&bindingHash(t)===hash)return {ok:true,version:2};if(f[8]!=='2'&&f[0]===hash&&bindingHashV1(t)===hash)return {ok:true,version:1};}catch{}
 return {ok:false,code:'binding_invalid'};
}
// No upstream file covers it: owner-facing view. Per currency: available, reserved, unsettled (unresolved), spent (settled), overspend.
async function read(call,hash,nowMs=Date.now(),stuckMs=STUCK_MS){
 const o=parse(await call(['HGETALL',envelopeKey(hash)])||[]);if(!o.hash)return null;
 const max=Number(o.maxCents),curs=[...new Set([o.currency,...String(o.curs||'').split(',').filter(Boolean)])];
 const buckets=curs.map(c=>{const u=Number(o['b:'+c+':u']||0),r=Number(o['b:'+c+':r']||0),s=Number(o['b:'+c+':s']||0),d=Number(o['b:'+c+':d']||0),C=u+r+d+s,m=c===o.currency?max:0;return {currency:c,maxCents:m,unresolvedCents:u,reservedCents:r,declinedPendingCents:d,heldCents:u+r+d,settledCents:s,usedCents:C,availableCents:Math.max(0,m-C),overspendCents:Math.max(0,C-m)}});
 const auths=Object.keys(o).filter(k=>/^a:iauth_[A-Za-z0-9]+$/.test(k)).map(k=>{const id=k.slice(2),at=Number(o[k+':at']||0),per=String(o[k+':curs']||'').split(',').filter(Boolean).map(c=>({currency:c,unresolvedCents:Number(o[k+':'+c+':u']||0),reservedCents:Number(o[k+':'+c+':r']||0),declinedPendingCents:Number(o[k+':'+c+':d']||0),settledCents:Number(o[k+':'+c+':s']||0)}));const unresolved=per.some(x=>x.unresolvedCents>0),manual=o[k+':manual']||null,heldCents=per.reduce((n,x)=>n+x.unresolvedCents+x.reservedCents+x.declinedPendingCents,0),since=Number(o[k+':since']||0)||null,deadline=Number(o[k+':deadline']||0)||null;return {authorizationId:id,state:o[k],at,amounts:per,unresolved,stuck:unresolved&&at+stuckMs<=nowMs,manual,declinedPending:per.some(x=>x.declinedPendingCents>0),heldCents,heldSinceMs:since,heldAgeMs:since&&heldCents>0?Math.max(0,nowMs-since):null,deadlineMs:deadline,pastDeadline:heldCents>0&&!!deadline&&deadline<=nowMs,providerStuckAtMs:Number(o[k+':stuck']||0)||null,unreserved:o[k+':unreserved']||null,releasedBy:o[k+':releasedBy']||null}});
 const hist=history(o),ackSeq=Number(o.noticeAck||0);
 const dp=new Set(auths.filter(x=>x.declinedPending).map(x=>x.authorizationId));
 const late=auths.filter(x=>x.pastDeadline),lateHeld={};for(const x of late)for(const m of x.amounts){const n=m.unresolvedCents+m.reservedCents+m.declinedPendingCents;if(n)lateHeld[m.currency]=(lateHeld[m.currency]||0)+n;}
 return {hash:o.hash,hashVersion:o.hash_version?Number(o.hash_version):1,status:o.status,botId:o.botId,accountId:o.accountId,cardId:o.cardId,merchantNetworkId:o.merchant,currency:o.currency,maxTotalCents:max,expiresAtMs:Number(o.expiresAtMs),proposedBy:o.proposedBy||null,decidedBy:o.decidedBy||null,decidedAtMs:o.decidedAtMs?Number(o.decidedAtMs):null,revokedBy:o.revokedBy||null,buckets,authorizations:auths,stuck:auths.filter(x=>x.stuck),history:hist,discrepancies:hist.filter(h=>h.kind.startsWith('discrepancy:')),notices:hist.filter(h=>h.seq>ackSeq&&(h.kind.startsWith('discrepancy:')||(h.kind==='manual_adjudication:declined'&&dp.has(h.authorizationId)))),noticeAck:ackSeq,declinedPending:auths.filter(x=>x.declinedPending),pastDeadline:late,pastDeadlineCount:late.length,pastDeadlineHeld:Object.entries(lateHeld).map(([currency,heldCents])=>({currency,heldCents})),oldestHeldSinceMs:auths.filter(x=>x.heldCents>0&&x.heldSinceMs).reduce((m,x)=>m===null||x.heldSinceMs<m?x.heldSinceMs:m,null),unreserved:auths.filter(x=>x.unreserved).map(x=>({authorizationId:x.authorizationId,source:x.unreserved,amounts:x.amounts})),unassigned:o.botId==='unassigned',chargedCents:0};
}
// No upstream file covers it: the falsifiable checks. (1) Each cent is in exactly one bucket: every per-authorization per-currency
// bucket amount is non-negative and equals the replay of history deltas. (2) Sum of buckets equals C: the envelope totals equal
// the per-authorization sums, per currency.
async function audit(call,hash){
 const o=parse(await call(['HGETALL',envelopeKey(hash)])||[]),errors=[],replay={},totals={},Z=()=>({u:0,r:0,s:0,d:0,c:0});
 for(const h of history(o)){if(!h.authorizationId||!h.currency)continue;const k=h.authorizationId+':'+h.currency,x=replay[k]||(replay[k]=Z());x.u+=h.du;x.r+=h.dr;x.s+=h.ds;x.c+=h.dc;x.d+=h.dd;}
 // 'c' is the refund credit: replay-checked like a bucket but never part of C. 'd' is declined_pending and is part of C.
 for(const f of Object.keys(o)){const m=/^a:(iauth_[A-Za-z0-9]+):([a-z]{3}):([ursdc])$/.exec(f);if(!m)continue;const v=Number(o[f]),k=m[1]+':'+m[2];if(v<0)errors.push('negative '+f);if((replay[k]||Z())[m[3]]!==v)errors.push('replay mismatch '+f+' stored '+v+' replayed '+((replay[k]||{})[m[3]]||0));if(m[3]==='c')continue;const t=totals[m[2]]||(totals[m[2]]=Z());t[m[3]]+=v;}
 for(const k of Object.keys(replay)){const [id,c]=k.split(':');for(const b of ['u','r','s','d','c'])if(replay[k][b]!==Number(o['a:'+id+':'+c+':'+b]||0))errors.push('history without stored field a:'+k+':'+b);}
 const curs=new Set([...Object.keys(totals),...Object.keys(o).map(f=>(/^b:([a-z]{3}):[ursd]$/.exec(f)||[])[1]).filter(Boolean)]);
 for(const c of curs)for(const b of ['u','r','s','d']){const stored=Number(o['b:'+c+':'+b]||0),sum=(totals[c]||Z())[b];if(stored!==sum)errors.push('bucket total b:'+c+':'+b+' '+stored+' != per-authorization sum '+sum);}
 return {ok:errors.length===0,errors};
}
// No upstream file covers it: in-process EVAL for the memory store and tests. Runs the same Lua text in fengari
// (devDependency, loaded lazily) over a Map of Redis hashes, refusing keys outside KEYS and KEYS that span hash slots.
const SCRIPTS=new Set([PROPOSE,DECIDE,RESERVE,FENCE,PROVIDER,ADJUDICATE,ACK,RECONCILE,UNASSIGNED]),slot=k=>{const m=/\{([^}]+)\}/.exec(k);return m?m[1]:k};
function hashCmd(store,declared,[op,k,...a]){
 if(!declared.includes(k))throw Error('undeclared key '+k);
 const h=store.get(k);
 switch(String(op).toUpperCase()){
  case 'EXISTS':return store.has(k)?1:0;
  case 'HSET':{const m=h||new Map();let n=0;for(let i=0;i<a.length;i+=2){if(!m.has(a[i]))n++;m.set(a[i],a[i+1])}store.set(k,m);return n}
  case 'HMGET':return a.map(f=>h&&h.has(f)?h.get(f):null);
  case 'HEXISTS':return h&&h.has(a[0])?1:0;
  case 'HGET':return h&&h.has(a[0])?h.get(a[0]):null;
  case 'HDEL':{let n=0;if(h)for(const f of a)if(h.delete(f))n++;return n}
  case 'HINCRBY':{const m=h||new Map(),v=parseInt(m.get(a[0])||'0',10)+parseInt(a[1],10);m.set(a[0],String(v));store.set(k,m);return v}
 }
 throw Error('unsupported '+op);
}
function localEval(store,cmd){
 const op=String(cmd[0]).toUpperCase();
 if(op==='HGETALL'){const h=store.get(cmd[1]);return h?[...h].flat():[]}
 if(op==='HGET'){const h=store.get(cmd[1]);return h&&h.has(cmd[2])?h.get(cmd[2]):null}
 if(op==='HMGET'){const h=store.get(cmd[1]);return cmd.slice(2).map(x=>h&&h.has(x)?h.get(x):null)}
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
module.exports={STUCK_MS,HELD_WINDOW_MS,reconcile,reconcileDue,releaseStranded,stripeReader,unassignedHash,ensureUnassigned,RECONCILE,UNASSIGNED,HASH_VERSION,canon,bindingHash,bindingHashV1,verify,envelopeKey,propose,decide,reserve,fence,provider,adjudicate,ack,read,audit,localEval,SCRIPTS,PROPOSE,DECIDE,RESERVE,FENCE,PROVIDER,ADJUDICATE,ACK};
