// AT5 + idempotent re-paste: nonces single-use, re-attach needs old key or owner naming the bot, old key revoked on reissue, one live worker per record.
const assert=require('assert'),{makeLink,connect,fresh}=require('./botlink-helpers.cjs');
(async()=>{const {bl}=makeLink();const a=await connect(bl,'instinct');
 const nonce=fresh(),c=(await bl.createPairing({ws:'ws_test',type:'grok'})).body,s=fresh();
 assert.equal((await bl.hello(c.pairingId,{nonce,callerSecret:s})).status,202);assert.equal((await bl.hello(c.pairingId,{nonce,callerSecret:s})).status,409,'nonce replay rejected');
 // re-paste without old key: owner must name the existing bot
 const rp=(await bl.repasteMessage('ws_test',a.botId,'https://alter.invalid')).body,sec=fresh();await bl.hello(rp.pairingId,{nonce:fresh(),callerSecret:sec});
 const v=(await bl.approvalView('ws_test',rp.pairingId)).body;assert.equal(v.reattach.botId,a.botId);assert.match(v.title,/^Reconnect Instinct/);
 assert.equal((await bl.approve('ws_test',rp.pairingId)).status,409);assert.equal((await bl.approve('ws_test',rp.pairingId,{confirmBotId:'bot_other'})).status,409);
 assert.equal((await bl.approve('ws_test',rp.pairingId,{confirmBotId:a.botId})).status,200);
 const k=await bl.pickup(rp.pairingId,{callerSecret:sec});assert.equal(k.body.botId,a.botId,'same record');
 assert.equal((await bl.call(a.key,{op:'act'})).status,401,'old key revoked when new one issued');
 assert.equal((await bl.call(k.body.key,{op:'echo'})).status,200);
 let list=await bl.list('ws_test');assert.equal(list.filter(x=>x.type==='Instinct').length,1,'no duplicate Instinct');
 // re-paste with old key proof needs no naming
 const b2=JSON.parse(await bl.s.get('bl:bot:'+a.botId));const cur=(await bl.call((await (async()=>{const r=await connect(bl,'instinct',{reattachBotId:a.botId});return r.key})()),{op:'act'})).body.nextKey;
 const rp2=(await bl.repasteMessage('ws_test',a.botId,'x')).body,s3=fresh();await bl.hello(rp2.pairingId,{nonce:fresh(),callerSecret:s3,oldKey:cur});assert.equal((await bl.approvalView('ws_test',rp2.pairingId)).body.reattach.oldKeyProven,true);assert.equal((await bl.approve('ws_test',rp2.pairingId)).status,200);
 const k3=await bl.pickup(rp2.pairingId,{callerSecret:s3});assert.equal(k3.body.botId,a.botId);assert.equal((await bl.call(cur,{op:'act'})).status,401);
 const bot=JSON.parse(await bl.s.get('bl:bot:'+a.botId));assert.notEqual(bot.workerId,b2.workerId);assert.equal((await bl.list('ws_test')).filter(x=>x.type==='Instinct').length,1,'one live worker per record');
 // a Grok account may bring several bots
 const g1=await connect(bl,'grok'),g2=await connect(bl,'grok');assert.notEqual(g1.botId,g2.botId);list=await bl.list('ws_test');assert.equal(list.filter(x=>x.type==='Grok').length,2);assert(list.some(x=>x.name==='Grok #2'));
 console.log('PASS AT5 + idempotent re-paste: nonce single-use, reattach needs old key or owner naming bot, same record, old key revoked, one worker per Instinct, several Grok bots allowed.');
})().catch(e=>{console.error(e);process.exit(1)});
