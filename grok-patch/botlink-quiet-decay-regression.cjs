// AT4 + no fake signals: Connected decays to Quiet without real calls, idle expiry -> Needs re-paste, nothing emitted without a real signal, Muse never Live.
const assert=require('assert'),{makeLink,connect}=require('./botlink-helpers.cjs');const H=36e5,DAY=24*H;
(async()=>{const {bl,clock}=makeLink();const m=await connect(bl,'muse'),i=await connect(bl,'instinct'),g=await connect(bl,'grok');
 let s=await bl.list('ws_test');assert(s.every(x=>x.state==='connected'&&x.lastSpoke==='just now'));
 const before=bl.events.length;clock.t+=7*H;s=await bl.list('ws_test');for(let n=0;n<50;n++)await bl.list('ws_test');
 assert.equal(bl.events.length,before,'reading status or time passing emits nothing');
 assert(s.every(x=>x.state==='quiet'&&x.label==='Quiet'&&x.lastSpoke==='7h ago'));assert(s.every(x=>/does not mean the bot is offline/.test(x.note)));
 assert(s.every(x=>x.presence===null&&x.typing===null),'no synthesized presence or typing');
 const muse=s.find(x=>x.type==='Muse');const live=muse.tiers.find(t=>t.tier==='Live');assert.equal(live.state,'unavailable');assert(!muse.tiers.some(t=>t.tier==='Live'&&t.state==='earned'));
 assert.equal(s.find(x=>x.type==='Instinct').tiers.find(t=>t.tier==='Live').state,'unavailable');
 assert.notEqual(s.find(x=>x.type==='Grok').tiers.find(t=>t.tier==='Live').state,'earned','Grok Live only from real events, not from a key');
 // a real call brings it back
 const r=await bl.call(m.key,{op:'act'});assert.equal(r.status,200);assert.equal(bl.events.length,before+1);assert.equal(bl.events.at(-1).type,'real_call');
 assert.equal((await bl.list('ws_test')).find(x=>x.botId===m.botId).state,'connected');
 // 30 idle days -> Needs re-paste with one-tap message for that bot only
 clock.t+=30*DAY+1;s=await bl.list('ws_test');assert(s.every(x=>x.state==='needs_repaste'&&x.reason==='idle_expired'));
 assert.equal(bl.events.length,before+1,'expiry by time is a label change, not an event');
 const rp=(await bl.repasteMessage('ws_test',m.botId,'https://alter.invalid')).body;assert(rp.message.includes(rp.link)&&rp.reattach);
 console.log('PASS AT4 Connected->Quiet->Needs re-paste by real-call age only, no events/presence/typing without a real call, Muse and Instinct show no Live.');
})().catch(e=>{console.error(e);process.exit(1)});
