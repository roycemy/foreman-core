// Runs the real Lua text of spend-envelope.cjs in fengari (pure-JS Lua 5.3) with a single-threaded redis.call shim.
// Proves script logic and single-key discipline only; it is not Upstash execution proof. FENGARI_PATH may point at a fengari install.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const {lua,lauxlib,lualib,to_luastring}=require(process.env.FENGARI_PATH||'fengari');
global.fetch=()=>{throw Error('NO NETWORK OR PAYMENT')};
const E=require('./spend-envelope.cjs');
// No upstream file covers it: minimal Redis EVAL emulator (hash commands only) that refuses keys outside KEYS and cross-slot KEYS.
const store=new Map(),calls=[];
const tag=k=>{const m=/\{([^}]+)\}/.exec(k);return m?m[1]:k};
function hashCmd(declared,[op,k,...a]){
 if(!declared.includes(k))throw Error('undeclared key '+k);
 const h=store.get(k);
 switch(op.toUpperCase()){
  case 'EXISTS':return store.has(k)?1:0;
  case 'HSET':{const m=h||new Map();let n=0;for(let i=0;i<a.length;i+=2){if(!m.has(a[i]))n++;m.set(a[i],a[i+1])}store.set(k,m);return n}
  case 'HMGET':return a.map(f=>h&&h.has(f)?h.get(f):null);
  case 'HEXISTS':return h&&h.has(a[0])?1:0;
  case 'HINCRBY':{const m=h||new Map(),v=parseInt(m.get(a[0])||'0',10)+parseInt(a[1],10);m.set(a[0],String(v));store.set(k,m);return v}
 }
 throw Error('unsupported '+op);
}
function push(L,v){if(v===null)lua.lua_pushboolean(L,false);else if(typeof v==='number')lua.lua_pushinteger(L,v);else if(Array.isArray(v)){lua.lua_createtable(L,v.length,0);v.forEach((x,i)=>{push(L,x);lua.lua_rawseti(L,-2,i+1)})}else lua.lua_pushstring(L,to_luastring(String(v)))}
function reply(L,i){
 const t=lua.lua_type(L,i);
 if(t===lua.LUA_TNUMBER)return Math.trunc(lua.lua_tonumber(L,i));
 if(t===lua.LUA_TSTRING)return lua.lua_tojsstring(L,i);
 if(t===lua.LUA_TTABLE){const out=[];for(let n=1;;n++){lua.lua_geti(L,i,n);if(lua.lua_isnil(L,-1)||(lua.lua_isboolean(L,-1)&&!lua.lua_toboolean(L,-1))){lua.lua_pop(L,1);break}out.push(reply(L,lua.lua_gettop(L)));lua.lua_pop(L,1)}return out}
 return null;
}
async function call(cmd){
 calls.push(cmd[0]);
 if(cmd[0]!=='EVAL')throw Error('only EVAL expected');
 const [,script,n,...rest]=cmd,keys=rest.slice(0,Number(n)),argv=rest.slice(Number(n));
 assert(new Set(keys.map(tag)).size===1,'cross-slot keys');
 const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
 for(const [name,vals] of [['KEYS',keys],['ARGV',argv]]){push(L,vals);lua.lua_setglobal(L,to_luastring(name))}
 lua.lua_createtable(L,0,1);lua.lua_pushjsfunction(L,L=>{const args=[];for(let i=1;i<=lua.lua_gettop(L);i++)args.push(lua.lua_tojsstring(L,i));push(L,hashCmd(keys,args));return 1});lua.lua_setfield(L,-2,to_luastring('call'));lua.lua_setglobal(L,to_luastring('redis'));
 if(lauxlib.luaL_loadstring(L,to_luastring(script))!==lua.LUA_OK||lua.lua_pcall(L,0,1,0)!==lua.LUA_OK)throw Error('lua: '+lua.lua_tojsstring(L,-1));
 return reply(L,lua.lua_gettop(L));
}
const NOW=Date.parse('2026-10-29T12:00:00Z'),bot='agent_fixture',merchant='merchant_fixture';
const terms=(extra={})=>({botId:bot,merchantNetworkId:merchant,currency:'usd',maxTotalCents:4000,expiresAtMs:NOW+600000,...extra});
const auth=(id,amountCents,extra={})=>({eventId:'evt_'+id,authorizationId:'iauth_'+id,botId:bot,merchantNetworkId:merchant,currency:'usd',amountCents,...extra});
const row=hash=>Object.fromEntries(store.get(E.envelopeKey(hash))||[]);
async function approved(t){const p=await E.propose(call,t,NOW);assert.equal(p.code,'proposed');assert.equal((await E.decide(call,p.hash,'approve',NOW)).code,'approved');return p.hash}
(async()=>{
 // 1. Binding hash: deterministic, and every bound term changes it.
 const base=E.bindingHash(terms());assert.equal(base,E.bindingHash(terms()));
 for(const [k,v] of [['botId','agent_other'],['merchantNetworkId','merchant_other'],['maxTotalCents',4001],['expiresAtMs',NOW+600001]])assert.notEqual(E.bindingHash(terms({[k]:v})),base,k);
 assert.throws(()=>E.bindingHash(terms({currency:'eur'})));assert.throws(()=>E.bindingHash(terms({maxTotalCents:40.5})));
 // 3. Duplicate proposal rejected; expired proposal refused.
 const p=await E.propose(call,terms(),NOW);assert.equal(p.code,'proposed');assert.equal(row(p.hash).status,'pending_approval');
 assert.equal((await E.propose(call,terms(),NOW)).code,'duplicate_proposal');
 assert.equal((await E.propose(call,terms({expiresAtMs:NOW}),NOW)).code,'expired');
 // Approval row binds to the hash the owner saw; no reservation before approval; first decision wins.
 assert.equal((await E.reserve(call,p.hash,auth('early',100),NOW)).code,'not_approved');
 assert.equal((await E.decide(call,'0'.repeat(64),'approve',NOW)).code,'not_found');
 assert.equal((await E.decide(call,'bad','approve',NOW)).code,'binding_mismatch');
 const race=await Promise.all([E.decide(call,p.hash,'approve',NOW),E.decide(call,p.hash,'deny',NOW)]);
 assert.deepEqual(race.map(x=>x.code),['approved','already_decided']);assert.equal(row(p.hash).status,'approved');
 // 2. Atomic reservation against the $40 envelope.
 let x=await E.reserve(call,p.hash,auth('a',2500),NOW);assert.deepEqual([x.code,x.reservedCents,x.remainingCents,x.chargedCents],['reserved',2500,1500,0]);
 const pair=await Promise.all([E.reserve(call,p.hash,auth('b',1000),NOW),E.reserve(call,p.hash,auth('c',1000),NOW)]);
 assert.deepEqual(pair.map(y=>y.code),['reserved','insufficient_envelope']);assert.equal(row(p.hash).reservedCents,'3500');
 x=await E.reserve(call,p.hash,auth('e',500),NOW);assert.deepEqual([x.code,x.reservedCents,x.remainingCents],['reserved',4000,0]);
 assert.equal((await E.reserve(call,p.hash,auth('d',1),NOW)).code,'closed_envelope');
 // Terms other than amount must match the approved envelope.
 const p2=await approved(terms({maxTotalCents:4000,expiresAtMs:NOW+900000}));
 assert.equal((await E.reserve(call,p2,auth('m1',100,{merchantNetworkId:'merchant_other'}),NOW)).code,'envelope_mismatch');
 assert.equal((await E.reserve(call,p2,auth('m2',100,{botId:'agent_other'}),NOW)).code,'envelope_mismatch');
 assert.equal((await E.reserve(call,p2,auth('m3',100,{currency:'eur'}),NOW)).code,'envelope_mismatch');
 assert.equal((await E.reserve(call,p2,auth('m4',100),NOW+900000)).code,'expired');assert.equal(row(p2).reservedCents,'0');
 // 4. Replayed signed webhook is rejected, using the existing issuer-webhook.cjs verify().
 const secret='whsec_disposable_fixture_not_a_real_secret',hctx={require:q=>q==='./api/index'?{}:require(q),module:{exports:{}},process:{env:{}},console,Buffer,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(__dirname+'/issuer-webhook.cjs','utf8'),hctx);const verify=hctx.module.exports.verify;
 const p3=await approved(terms({expiresAtMs:NOW+1200000}));
 const raw=Buffer.from(JSON.stringify({id:'evt_replay',account:'acct_fixture',type:'issuing_authorization.request',livemode:false,data:{object:{id:'iauth_replay',livemode:false,card:'ic_fixture',pending_request:{amount:1000,currency:'usd'},merchant_data:{network_id:merchant}}}}));
 const ts=Math.floor(Date.now()/1000),sig='t='+ts+',v1='+crypto.createHmac('sha256',secret).update(ts+'.').update(raw).digest('hex');
 const deliver=async(body,eventId)=>{assert(verify(body,sig,secret));const ev=JSON.parse(body),o=ev.data.object;return E.reserve(call,p3,{eventId:eventId||ev.id,authorizationId:o.id,botId:bot,merchantNetworkId:o.merchant_data.network_id,currency:o.pending_request.currency,amountCents:o.pending_request.amount},NOW)};
 assert.equal((await deliver(raw)).code,'reserved');
 assert.equal((await deliver(raw)).code,'replay_declined');
 assert.equal((await deliver(raw,'evt_redelivered')).code,'replay_declined');
 assert.equal(verify(Buffer.from(raw.toString().replace('1000','100')),sig,secret),false);
 assert.equal(row(p3).reservedCents,'1000');
 // Ported from formancehq/wallets pkg/api/handler_holds_confirm_test.go @3177b665175c33867cf4a1a02b0c792d7d3d2dfd (hold USD 100 -> envelope 100 cents).
 const f=async (name,extra)=>approved(terms({maxTotalCents:100,expiresAtMs:NOW+600000+extra}));
 let h=await f('TestHoldsConfirm',1);x=await E.reserve(call,h,auth('fc',100),NOW);assert.deepEqual([x.code,x.reservedCents,x.remainingCents],['reserved',100,0]);
 h=await f('TestHoldsPartialConfirm',2);x=await E.reserve(call,h,auth('fp',50),NOW);assert.deepEqual([x.code,x.reservedCents,x.remainingCents],['reserved',50,50]);
 h=await f('TestHoldsConfirmWithTooHighAmount',3);assert.equal((await E.reserve(call,h,auth('fh',500),NOW)).code,'insufficient_envelope');assert.equal(row(h).reservedCents,'0');
 h=await f('TestHoldsConfirmWithClosedHold',4);await E.reserve(call,h,auth('fx',100),NOW);assert.equal((await E.reserve(call,h,auth('fy',1),NOW)).code,'closed_envelope');
 h=await f('TestHoldsPartialConfirmWithFinal',5);x=await E.reserve(call,h,auth('ff',50,{final:true}),NOW);assert.deepEqual([x.code,x.reservedCents,x.remainingCents],['reserved',50,0]);assert.equal(row(h).status,'closed');assert.equal(row(h).releasedCents,'50');assert.equal((await E.reserve(call,h,auth('fg',10),NOW)).code,'closed_envelope');
 assert(calls.every(c=>c==='EVAL'));
 console.log('PASS binding hash over bot/merchant/currency/max/expiry, duplicate proposal rejected, owner approval bound to hash, first decision wins, $40 atomic reservation with concurrent overdraw refused, envelope term mismatch, expiry, signed webhook replay rejected (event and authorization id), 5 ported Formance hold-confirm cases. '+calls.length+' EVALs, single-slot keys only, ZERO network/payment calls. Lua run in fengari, not Upstash.');
})().catch(e=>{console.error(e);process.exit(1)});
