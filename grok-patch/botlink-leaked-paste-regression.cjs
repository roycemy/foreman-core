// AT1 leaked paste: pairing ID single-use + short-lived; a second caller kills it (not first-wins) and alerts the owner.
const assert=require('assert'),{makeLink,connect,fresh}=require('./botlink-helpers.cjs');
(async()=>{const alerts=[];const {bl,clock}=makeLink({onAlert:async a=>alerts.push(a)});
 const c=(await bl.createPairing({ws:'w',account:'owner@example.test',type:'grok'})).body;
 assert(!/alk_|secret|key=/i.test(c.link),'link carries no secret');assert(c.message.includes(c.link));
 const real=fresh(),thief=fresh();
 assert.equal((await bl.hello(c.pairingId,{nonce:fresh(),callerSecret:real})).status,202);
 assert.equal((await bl.hello(c.pairingId,{nonce:fresh(),callerSecret:thief})).status,410,'second caller rejected');
 assert.equal(alerts.length,1);assert.equal(alerts[0].kind,'pairing_second_caller');
 assert.equal((await bl.approve('w',c.pairingId)).status,409,'killed pairing cannot be approved');
 assert.equal((await bl.pickup(c.pairingId,{callerSecret:real})).status,410,'first caller does not win either');
 // owner approval before any bot call is refused; approval view shows type, account, fingerprint
 const c2=(await bl.createPairing({ws:'w',account:'owner@example.test',type:'muse'})).body;assert.equal((await bl.approve('w',c2.pairingId)).status,409);
 const s2=fresh();await bl.hello(c2.pairingId,{nonce:fresh(),callerSecret:s2,fingerprint:{userAgent:'fixture-ua',ipRegion:'US'}});
 const v=(await bl.approvalView('w',c2.pairingId)).body;assert.equal(v.botType,'Muse');assert.equal(v.account,'owner@example.test');assert.equal(v.fingerprint.userAgent,'fixture-ua');assert.equal(v.fingerprint.transport,'HTTP gateway key');
 assert.equal((await bl.approvalView('other_ws',c2.pairingId)).status,404,'other workspace cannot view');
 assert.equal((await bl.pickup(c2.pairingId,{callerSecret:fresh()})).status,403,'link holder without caller secret cannot collect');
 await bl.approve('w',c2.pairingId);const k=await bl.pickup(c2.pairingId,{callerSecret:s2});assert.equal(k.status,200);
 assert.equal((await bl.pickup(c2.pairingId,{callerSecret:s2})).status,410,'key collected exactly once');
 // short-lived
 const c3=(await bl.createPairing({ws:'w',type:'instinct'})).body;clock.t+=10*60e3+1;assert.equal((await bl.hello(c3.pairingId,{nonce:fresh(),callerSecret:fresh()})).status,410);
 console.log('PASS AT1 leaked paste: secret-free link, second caller kills pairing + alert, approval needs bot call, collect-once bound to caller secret, 10-min expiry.');
})().catch(e=>{console.error(e);process.exit(1)});
