// Independent negative tests for the bot-link repair. No network, credentials, paid calls or deployment.
// From the repo root, AFTER applying grok-patch/ (or your rebuilt concept) to the root:
//   node review/botlink-hostile-review.cjs
// All five checks FAIL against the submitted patch. The repaired tree must pass all five.
const assert = require('assert');
const {makeLink,connect,fresh} = require('../botlink-helpers.cjs');
async function expiredPickup(){
 const {bl,clock}=makeLink();
 const p=(await bl.createPairing({ws:'w',type:'grok'})).body,secret=fresh();
 await bl.hello(p.pairingId,{nonce:fresh(),callerSecret:secret});
 await bl.approve('w',p.pairingId);clock.t+=11*60000;
 const r=await bl.pickup(p.pairingId,{callerSecret:secret});
 assert.notEqual(r.status,200,'expired pairing must not issue a key');
}
async function concurrentRevoke(){
 const {bl}=makeLink(),c=await connect(bl,'instinct');
 const [call]=await Promise.all([bl.call(c.key,{op:'echo'}),bl.revoke('ws_test',c.botId)]);
 const b=JSON.parse(await bl.s.get('bl:bot:'+c.botId));
 assert.equal(b.revoked,true,'a concurrent call must not overwrite owner revoke');
 if(call.body.nextKey)assert.notEqual((await bl.call(call.body.nextKey,{op:'echo'})).status,200,'new key must not survive revoke');
}
async function pendingApprovalRevoke(){
 const {bl}=makeLink(),c=await connect(bl,'grok');
 const p=(await bl.repasteMessage('ws_test',c.botId,'https://alter.invalid')).body,secret=fresh();
 await bl.hello(p.pairingId,{nonce:fresh(),callerSecret:secret});
 await bl.approve('ws_test',p.pairingId,{confirmBotId:c.botId});
 await bl.revoke('ws_test',c.botId);
 const r=await bl.pickup(p.pairingId,{callerSecret:secret});
 assert.notEqual(r.status,200,'approval before revoke must not restore access after revoke');
}
async function unknownOperation(){
 const {bl}=makeLink(),c=await connect(bl,'grok');
 const r=await bl.call(c.key,{op:'unsupported-operation'});
 assert.notEqual(r.status,200,'unsupported operations must not return accepted success');
}
async function unearnedGovernance(){
 const {bl}=makeLink(),c=await connect(bl,'grok');
 const s=(await bl.list('ws_test')).find(x=>x.botId===c.botId);
 assert.notEqual(s.tiers.find(x=>x.tier==='Governed').state,'earned','echo-only credential without policy transport must not earn Governed');
}
(async()=>{let failures=0;for(const [name,test] of Object.entries({expiredPickup,concurrentRevoke,pendingApprovalRevoke,unknownOperation,unearnedGovernance})){
 try{await test();console.log('PASS',name)}catch(e){failures++;console.error('FAIL',name+':',e.message)}
}process.exitCode=failures?1:0})();
