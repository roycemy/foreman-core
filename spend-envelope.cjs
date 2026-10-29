// $40 non-charging spend envelope proof. Internal accounting only: nothing here moves, holds or blocks real money.
// The issuer webhook decides in ~2s, so the owner approves this envelope ahead of time, not each authorization instant.
const crypto=require('crypto');
const TERMS=['botId','accountId','cardId','merchantNetworkId','currency','maxTotalCents','expiresAtMs'];
// No upstream file covers it: canonical sha256 over exactly the seven approved envelope terms (bot, issuer account, card, merchant, currency, max, expiry), in fixed order.
function bindingHash(t){
 if(!t||typeof t.botId!=='string'||!/^[A-Za-z0-9_]{1,120}$/.test(t.botId)||!/^acct_[A-Za-z0-9]+$/.test(t.accountId||'')||!/^ic_[A-Za-z0-9]+$/.test(t.cardId||'')||typeof t.merchantNetworkId!=='string'||!t.merchantNetworkId.trim()||t.merchantNetworkId.length>100||t.currency!=='usd'||!Number.isSafeInteger(t.maxTotalCents)||t.maxTotalCents<1||t.maxTotalCents>1000000||!Number.isSafeInteger(t.expiresAtMs))throw Error('Envelope needs botId, issuer accountId, cardId, merchantNetworkId, usd, integer maxTotalCents (1..1000000) and integer expiresAtMs');
 return crypto.createHash('sha256').update(JSON.stringify(TERMS.map(k=>t[k]))).digest('hex');
}
// One key per envelope; the {hash} tag pins every script to a single slot. gl: keys are never workspace-prefixed by nsKey.
const envelopeKey=hash=>'gl:spend-envelope:{'+hash+'}';
// No upstream file covers it: SET-NX style create on a Redis hash, rejecting a duplicate proposal of the same terms.
const PROPOSE="if redis.call('EXISTS',KEYS[1])==1 then return {'duplicate_proposal'} end\n"+
 "if tonumber(ARGV[8])<=tonumber(ARGV[9]) then return {'expired'} end\n"+
 "redis.call('HSET',KEYS[1],'hash',ARGV[1],'botId',ARGV[2],'accountId',ARGV[3],'cardId',ARGV[4],'merchant',ARGV[5],'currency',ARGV[6],'maxCents',ARGV[7],'expiresAtMs',ARGV[8],'reservedCents','0','status','pending_approval','createdAtMs',ARGV[9])\n"+
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
const RESERVE="local s=redis.call('HMGET',KEYS[1],'hash','status','botId','accountId','cardId','merchant','currency','maxCents','reservedCents','expiresAtMs')\n"+
 "if not s[1] then return {'no_envelope'} end\n"+
 "local evt,auth='evt:'..ARGV[2],'auth:'..ARGV[3]\n"+
 "if redis.call('HEXISTS',KEYS[1],evt)==1 or redis.call('HEXISTS',KEYS[1],auth)==1 then return {'replay_declined'} end\n"+
 "local max,res,amt=tonumber(s[8]),tonumber(s[9]),tonumber(ARGV[9])\n"+
 "local code\n"+
 "if s[1]~=ARGV[1] then code='binding_mismatch'\n"+
 "elseif s[2]=='closed' or res>=max then code='closed_envelope'\n"+
 "elseif s[2]~='approved' then code='not_approved'\n"+
 "elseif tonumber(s[10])<=tonumber(ARGV[11]) then code='expired'\n"+
 "elseif s[3]~=ARGV[4] or s[4]~=ARGV[5] or s[5]~=ARGV[6] or s[6]~=ARGV[7] or s[7]~=ARGV[8] then code='envelope_mismatch'\n"+
 "elseif not amt or amt<1 or amt%1~=0 then code='invalid_amount'\n"+
 "elseif res+amt>max then code='insufficient_envelope' end\n"+
 "if code then redis.call('HSET',KEYS[1],evt,code,auth,code) return {code,res,max-res} end\n"+
 "res=redis.call('HINCRBY',KEYS[1],'reservedCents',amt)\n"+
 "local remaining=max-res\n"+
 "if ARGV[10]=='1' then redis.call('HSET',KEYS[1],'status','closed','releasedCents',tostring(remaining)) remaining=0 end\n"+
 "redis.call('HSET',KEYS[1],evt,'reserved:'..amt,auth,'reserved:'..amt)\n"+
 "return {'reserved',res,remaining}";
// call is a Redis command function (e.g. api/index.js r). Every script declares its single key in KEYS.
async function propose(call,terms,nowMs=Date.now()){const hash=bindingHash(terms),key=envelopeKey(hash);const out=await call(['EVAL',PROPOSE,'1',key,hash,terms.botId,terms.accountId,terms.cardId,terms.merchantNetworkId.trim(),terms.currency,String(terms.maxTotalCents),String(terms.expiresAtMs),String(nowMs)]);return {hash,key,code:out[0]};}
async function decide(call,hash,decision,nowMs=Date.now()){if(!/^[a-f0-9]{64}$/.test(hash||''))return {code:'binding_mismatch'};const out=await call(['EVAL',DECIDE,'1',envelopeKey(hash),hash,decision==='approve'?'approve':'deny',String(nowMs)]);return {code:out[0],status:out[1]};}
// botId must come from Alter's own card/bot mapping, never from merchant or webhook metadata; accountId and cardId come from the signed event and must equal the approved terms.
async function reserve(call,hash,a,nowMs=Date.now()){
 if(!/^[a-f0-9]{64}$/.test(hash||'')||!/^evt_[A-Za-z0-9]+$/.test(a.eventId||'')||!/^iauth_[A-Za-z0-9]+$/.test(a.authorizationId||''))return {code:'invalid_or_unsupported_request'};
 if(!Number.isSafeInteger(a.amountCents)||a.amountCents<1)return {code:'invalid_amount'};
 const out=await call(['EVAL',RESERVE,'1',envelopeKey(hash),hash,a.eventId,a.authorizationId,String(a.botId),String(a.accountId),String(a.cardId),String(a.merchantNetworkId),String(a.currency),String(a.amountCents),a.final?'1':'0',String(nowMs)]);
 return {code:out[0],reservedCents:out[1],remainingCents:out[2],chargedCents:0};
}
// No upstream file covers it: owner-facing row view; per-event decision fields are counted, not listed.
async function read(call,hash){
 const flat=await call(['HGETALL',envelopeKey(hash)])||[],o={};for(let i=0;i<flat.length;i+=2)o[flat[i]]=flat[i+1];
 if(!o.hash)return null;
 return {hash:o.hash,status:o.status,botId:o.botId,accountId:o.accountId,cardId:o.cardId,merchantNetworkId:o.merchant,currency:o.currency,maxTotalCents:Number(o.maxCents),reservedCents:Number(o.reservedCents),releasedCents:Number(o.releasedCents||0),expiresAtMs:Number(o.expiresAtMs),decisionCount:Object.keys(o).filter(k=>k.startsWith('evt:')).length,chargedCents:0};
}
// No upstream file covers it: in-process EVAL for the memory store and tests. Runs the same Lua text in fengari
// (devDependency, loaded lazily) over a Map of Redis hashes, refusing keys outside KEYS and KEYS that span hash slots.
const SCRIPTS=new Set([PROPOSE,DECIDE,RESERVE]),slot=k=>{const m=/\{([^}]+)\}/.exec(k);return m?m[1]:k};
function hashCmd(store,declared,[op,k,...a]){
 if(!declared.includes(k))throw Error('undeclared key '+k);
 const h=store.get(k);
 switch(String(op).toUpperCase()){
  case 'EXISTS':return store.has(k)?1:0;
  case 'HSET':{const m=h||new Map();let n=0;for(let i=0;i<a.length;i+=2){if(!m.has(a[i]))n++;m.set(a[i],a[i+1])}store.set(k,m);return n}
  case 'HMGET':return a.map(f=>h&&h.has(f)?h.get(f):null);
  case 'HEXISTS':return h&&h.has(a[0])?1:0;
  case 'HINCRBY':{const m=h||new Map(),v=parseInt(m.get(a[0])||'0',10)+parseInt(a[1],10);m.set(a[0],String(v));store.set(k,m);return v}
 }
 throw Error('unsupported '+op);
}
function localEval(store,cmd){
 const op=String(cmd[0]).toUpperCase();
 if(op==='HGETALL'){const h=store.get(cmd[1]);return h?[...h].flat():[]}
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
module.exports={bindingHash,envelopeKey,propose,decide,reserve,read,localEval,SCRIPTS,PROPOSE,DECIDE,RESERVE};
