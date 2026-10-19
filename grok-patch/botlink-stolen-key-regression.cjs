// AT2 stolen key: renewal never passes the absolute cap; two holders of one key collide and the bot drops to Needs re-paste.
const assert=require('assert'),{makeLink,connect}=require('./botlink-helpers.cjs');const DAY=864e5;
(async()=>{const alerts=[];const {bl,clock}=makeLink({onAlert:async a=>alerts.push(a)});
 let x=await connect(bl,'muse');const b0=JSON.parse(await bl.s.get('bl:bot:'+x.botId));assert.equal(b0.capAt-b0.createdAt,90*DAY);
 // steady use every 20 days: renews idle, but never beyond cap
 let key=x.key;for(let i=0;i<4;i++){clock.t+=20*DAY;const r=await bl.call(key,{op:'act'});assert.equal(r.status,200);assert(r.body.idleExpiresAt<=b0.capAt);key=r.body.nextKey;}
 clock.t=b0.capAt;const dead=await bl.call(key,{op:'act'});assert.equal(dead.status,401);assert.equal(dead.body.reason,'absolute_cap_reached');
 let st=(await bl.list('ws_test'))[0];assert.equal(st.state,'needs_repaste');assert.equal(st.reason,'absolute_cap_reached');
 // copied key: thief and bot both hold the same key
 const y=await connect(bl,'grok');const stolen=y.key;const r1=await bl.call(stolen,{op:'act'});assert.equal(r1.status,200);
 const r2=await bl.call(stolen,{op:'act'});assert.equal(r2.status,401,'second use of rotated key fails');
 assert.equal((await bl.call(r1.body.nextKey,{op:'act'})).status,401,'the holder of the fresh key is dropped too');
 const g=(await bl.list('ws_test')).find(s=>s.botId===y.botId);assert.equal(g.state,'needs_repaste');assert.equal(g.reason,'key_reuse_detected');assert(alerts.some(a=>a.kind==='key_reuse_detected'));
 // keys hashed at rest
 const dump=JSON.stringify([...bl.s.kv.entries()]);assert(!dump.includes(r1.body.nextKey)&&!dump.includes(y.firstKey)&&!dump.includes(x.secret));
 console.log('PASS AT2 stolen key: renew-on-use bounded by 90-day cap, rotation collision drops both holders to Needs re-paste, keys/secrets hashed at rest.');
})().catch(e=>{console.error(e);process.exit(1)});
