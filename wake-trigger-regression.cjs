// Instant wake triggers (Royce, Oct 19): when a job is queued to a bot whose push channel is an inbox,
// Alter emails a content-free nudge ("Alter: job waiting for Instinct") so its poller wakes now.
// No task details, no instructions, one email per 30s per bot, silent no-op without a sender, poll stays the backup.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
let src=fs.readFileSync(require('path').join(__dirname,'api/index.js'),'utf8');
src+='\nmodule.exports.t={maybeWakeBot,newTask,assignTask,reassignTaskUnlocked,getJ,setJ,r,als,mem};';
const sends=[];let fetchFail=false;
const ctx={require,module:{exports:{}},process:{env:{RESEND_API_KEY:'test-key',WAKE_EMAIL_FROM:'Alter <wake@alter.test>'}},global:{},console,
 fetch:(u,o)=>{if(String(u).includes('resend.com')){const b=JSON.parse(o.body);if(fetchFail)return Promise.reject(new Error('network down'));sends.push(b);return Promise.resolve({ok:true,status:200});}throw Error('NETWORK FORBIDDEN: '+u);},
 setTimeout,clearTimeout,URL,AbortSignal};
vm.runInNewContext(src,ctx);const f=ctx.module.exports.t;
const inst=id=>({id,name:'Instinct '+id,providerId:'instinct',status:'active',paused:false,createdAt:'2026-10-19',limits:{perActionCents:10,dailyCents:50}});
const grok=id=>({id,name:'Grok '+id,providerId:'grok',status:'active',paused:false,createdAt:'2026-10-19',limits:{perActionCents:10,dailyCents:50}});
(async()=>{await f.als.run({ws:'t'},async()=>{
 // 1. queue to an Instinct bot with a sender configured: exactly one trigger email, content-free
 await f.setJ('fm:agent:i1',inst('i1'));
 await f.newTask({title:'Secret memo about Q4',assignee:'i1'});
 assert.equal(sends.length,1);const m=sends[0];
 assert.equal(m.subject,'Alter: job waiting for Instinct');
 assert.deepEqual(m.to,['xt1udv@mail.instinct.com']);
 assert.equal(m.from,'Alter <wake@alter.test>');
 assert.equal(m.text,'A job is waiting for Instinct in Alter.');
 assert.ok(!JSON.stringify(m).includes('Secret memo'),'no task details in the trigger');
 assert.ok(!/poll|fetch|run|check|authenticate|claim|start/i.test(m.text),'no instructions in the body');
 // 2. a burst inside 30s sends nothing more
 await f.newTask({title:'Two',assignee:'i1'});await f.newTask({title:'Three',assignee:'i1'});
 assert.equal(sends.length,1,'dedupe: one email per 30s per bot');
 // 3. other providers and unassigned jobs send nothing
 await f.setJ('fm:agent:g1',grok('g1'));
 await f.newTask({title:'Grok job',assignee:'g1'});
 await f.newTask({title:'Unrouted'});
 assert.equal(sends.length,1);
 // 4. paused or revoked Instinct bots send nothing
 await f.setJ('fm:agent:i2',{...inst('i2'),paused:true});
 await f.newTask({title:'Paused',assignee:'i2'});
 await f.setJ('fm:agent:i3',{...inst('i3'),status:'revoked'});
 await f.newTask({title:'Revoked',assignee:'i3'});
 assert.equal(sends.length,1);
 // 5. owner assigns an unrouted job to Instinct: wakes (fresh bot, fresh dedupe slot)
 await f.setJ('fm:agent:i4',inst('i4'));
 const u=await f.newTask({title:'Unassigned job'});
 const ar=await f.assignTask(u.id,{assignee:'i4'});
 assert.equal(ar.status,200);assert.equal(sends.length,2,'owner assignment wakes the bot');
 // 6. owner reassigns a job to Instinct: wakes
 await f.setJ('fm:agent:i5',inst('i5'));await f.setJ('fm:agent:g2',grok('g2'));
 const rt=await f.newTask({title:'Move me',assignee:'g2'});
 const rr=await f.reassignTaskUnlocked(rt.id,{confirmed:true,expectedAssignee:'g2',expectedStatus:'queued',assignee:'i5'});
 assert.equal(rr.status,200);assert.equal(sends.length,3,'reassignment wakes the new bot');
 // 7. no sender configured: silent no-op, nothing throws, queue still works
 delete ctx.process.env.RESEND_API_KEY;
 await f.setJ('fm:agent:i6',inst('i6'));
 await f.newTask({title:'No sender',assignee:'i6'});
 assert.equal(sends.length,3,'silent no-op without RESEND_API_KEY');
 ctx.process.env.RESEND_API_KEY='test-key';
 // 8. sender failure: recorded as an event, never crashes the queue
 fetchFail=true;await f.setJ('fm:agent:i7',inst('i7'));
 await f.newTask({title:'Failing sender',assignee:'i7'});
 const events=await f.r(['LRANGE','fm:events',0,50]);
 assert.ok(events.some(e=>String(e).includes('wake_failed')),'failure lands in the event feed');
 console.log('PASS wake triggers: queue/assign/reassign wake Instinct by content-free email, 30s dedupe, provider+pause+revoke guards, silent without sender, failure recorded not thrown.');
});})().catch(e=>{console.error(e);process.exit(1)});
// source contract
const api=src;
assert.ok(api.includes("'NX', 'PX', 30000]"),'30s dedupe window');
assert.ok(api.includes("subject: 'Alter: job waiting for Instinct'"),'exact subject');
assert.ok(!/text:.*t\.title/.test(api),'email body never interpolates task data');
assert.ok(api.includes("presenceOnly: true });\n  } catch"),'wake events never count as bot activity');
