// Instant wake triggers (Royce, Oct 19): when a job is queued to a bot, Alter pings it on the free
// push channel wired at setup - Instinct: content-free email; Grok: content-free Slack message or a
// GitHub trigger issue closed right after creation (the notification is the wake signal).
// No task details, no instructions, one ping per 30s per bot, silent no-op without a channel, schedule stays the backup.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
// Source-text assertions below match LF; Windows checkouts (core.autocrlf) see CRLF, so normalize before matching.
let src=fs.readFileSync(require('path').join(__dirname,'api/index.js'),'utf8').replace(/\r\n/g,'\n');
src+='\nmodule.exports.t={maybeWakeBot,newTask,assignTask,reassignTaskUnlocked,getJ,setJ,r,als,mem,wakeTargetFrom,noteWakeTarget};';
const sends=[],slacks=[],slackUrls=[],whooks=[],ghPosts=[],ghPatches=[];let fetchFail=false;
const ctx={require,module:{exports:{}},process:{env:{RESEND_API_KEY:'test-key',WAKE_EMAIL_FROM:'Alter <wake@alter.test>'}},global:{},console,
 fetch:(u,o)=>{u=String(u);
  if(fetchFail)return Promise.reject(new Error('network down'));
  if(u.includes('resend.com')){sends.push(JSON.parse(o.body));return Promise.resolve({ok:true,status:200});}
  if(u.includes('hooks.slack.com')){slacks.push(JSON.parse(o.body));slackUrls.push(u);return Promise.resolve({ok:true,status:200});}
  if(u.includes('grok.com')||u.includes('x.ai')){whooks.push({u,headers:o.headers,body:o.body});return Promise.resolve({ok:true,status:202});}
  if(u.includes('api.github.com')){if(o.method==='PATCH'){ghPatches.push({u,body:JSON.parse(o.body)});return Promise.resolve({ok:true,status:200,json:async()=>({})});}ghPosts.push({u,body:JSON.parse(o.body)});return Promise.resolve({ok:true,status:201,json:async()=>({number:42})});}
  throw Error('NETWORK FORBIDDEN: '+u);},
 setTimeout,clearTimeout,URL,AbortSignal,Buffer};
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
 // 3. other providers (no channel wired) and unassigned jobs send nothing
 await f.setJ('fm:agent:g0',grok('g0'));
 await f.newTask({title:'Grok job',assignee:'g0'});
 await f.newTask({title:'Unrouted'});
 assert.equal(sends.length,1);assert.equal(slacks.length,0);assert.equal(ghPosts.length,0);
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
 let events=await f.r(['LRANGE','fm:events',0,50]);
 assert.ok(events.some(e=>String(e).includes('wake_failed')),'failure lands in the event feed');
 fetchFail=false;
 // 9. Grok with a Slack webhook wired: one content-free Slack message, deduped, GitHub untouched
 ctx.process.env.WAKE_GROK_SLACK_WEBHOOK='https://hooks.slack.com/services/T00/B00/secret';
 ctx.process.env.WAKE_GITHUB_TOKEN='ghp_test';ctx.process.env.WAKE_GITHUB_REPO='roycemy/alter-wake';
 await f.setJ('fm:agent:g9',grok('g9'));
 await f.newTask({title:'Secret Grok brief',assignee:'g9'});
 assert.equal(slacks.length,1,'slack fires when wired');
 assert.deepEqual(slacks[0],{text:'Alter: job waiting for Grok'},'slack trigger is content-free');
 assert.ok(!JSON.stringify(slacks[0]).includes('Secret Grok brief'),'no task details in the slack trigger');
 assert.equal(ghPosts.length,0,'slack wins over github when both are wired');
 await f.newTask({title:'Burst two',assignee:'g9'});
 assert.equal(slacks.length,1,'dedupe: one slack per 30s per bot');
 // 10. Grok with only GitHub wired: trigger issue created then closed, notification is the signal
 delete ctx.process.env.WAKE_GROK_SLACK_WEBHOOK;
 await f.setJ('fm:agent:g10',grok('g10'));
 await f.newTask({title:'Another secret brief',assignee:'g10'});
 assert.equal(ghPosts.length,1,'github issue fires when wired');
 assert.equal(ghPosts[0].u,'https://api.github.com/repos/roycemy/alter-wake/issues');
 assert.equal(ghPosts[0].body.title,'Alter: job waiting for Grok');
 assert.ok(!JSON.stringify(ghPosts[0].body).includes('Another secret brief'),'no task details in the issue');
 assert.equal(ghPatches.length,1,'issue closed right after creation');
 assert.equal(ghPatches[0].u,'https://api.github.com/repos/roycemy/alter-wake/issues/42');
 assert.equal(ghPatches[0].body.state,'closed');
 // 11. slack failure for a Grok bot: recorded, never thrown
 ctx.process.env.WAKE_GROK_SLACK_WEBHOOK='https://hooks.slack.com/services/T00/B00/secret';
 fetchFail=true;await f.setJ('fm:agent:g11',grok('g11'));
 await f.newTask({title:'Failing slack',assignee:'g11'});
 events=await f.r(['LRANGE','fm:events',0,50]);
 assert.ok(events.filter(e=>String(e).includes('wake_failed')).length>=2,'grok failure also lands in the event feed');
 // 12. declared email target wins over the deployment default inbox
 fetchFail=false;
 ctx.process.env.WAKE_INSTINCT_EMAIL='zzz-default@mail.instinct.com';
 await f.setJ('fm:agent:i8',{...inst('i8'),wake:{channel:'email',target:'crew99@mail.instinct.com',declaredAt:'2026-10-19'}});
 await f.newTask({title:'Declared inbox',assignee:'i8'});
 assert.equal(sends.length,4,'declared email target fires');
 assert.deepEqual(sends[3].to,['crew99@mail.instinct.com'],'declared inbox wins over env default');
 assert.equal(sends[3].subject,'Alter: job waiting for Instinct i8','declared-target email names the bot');
 delete ctx.process.env.WAKE_INSTINCT_EMAIL;
 // 13. declared slack target wins over the env webhook
 ctx.process.env.WAKE_GROK_SLACK_WEBHOOK='https://hooks.slack.com/services/T00/B00/secret';
 await f.setJ('fm:agent:g12',{...grok('g12'),wake:{channel:'slack',target:'https://hooks.slack.com/services/T11/B11/ownhook',declaredAt:'2026-10-19'}});
 await f.newTask({title:'Declared hook',assignee:'g12'});
 assert.equal(slacks.length,2,'declared slack target fires');
 assert.equal(slackUrls[slackUrls.length-1],'https://hooks.slack.com/services/T11/B11/ownhook','declared webhook wins over env webhook');
 assert.deepEqual(slacks[slacks.length-1],{text:'Alter: job waiting for Grok g12'},'declared-target slack names the bot, content-free');
 // 14. declared email still needs the sender env: silent no-op without it
 delete ctx.process.env.RESEND_API_KEY;
 await f.setJ('fm:agent:i9',{...inst('i9'),wake:{channel:'email',target:'crew88@mail.instinct.com',declaredAt:'2026-10-19'}});
 await f.newTask({title:'No sender declared',assignee:'i9'});
 assert.equal(sends.length,4,'declared email without sender env is a silent no-op');
 ctx.process.env.RESEND_API_KEY='test-key';
 // 15. wakeTargetFrom validation: domain-locked email, slack-only webhooks, nothing else
 assert.deepEqual(f.wakeTargetFrom({wakeChannel:'email',wakeTarget:'ok@mail.instinct.com'}),{channel:'email',target:'ok@mail.instinct.com'},'on-domain email accepted');
 assert.deepEqual(f.wakeTargetFrom({wakeChannel:'email',wakeTarget:'owner@gmail.com'}),{channel:'email',target:'owner@gmail.com'},'any valid email accepted (own Gmail is the common case)');
 assert.equal(f.wakeTargetFrom({wakeChannel:'email',wakeTarget:'not-an-email'}),null,'malformed email rejected');
 assert.deepEqual(f.wakeTargetFrom({wakeChannel:'slack',wakeTarget:'https://hooks.slack.com/services/T1AAAAAAA/B1BBBBBBB/secretsecret'}),{channel:'slack',target:'https://hooks.slack.com/services/T1AAAAAAA/B1BBBBBBB/secretsecret'},'slack webhook accepted');
 assert.equal(f.wakeTargetFrom({wakeChannel:'slack',wakeTarget:'https://evil.example.com/hook'}),null,'non-slack URL rejected');
 assert.equal(f.wakeTargetFrom({wakeChannel:'sms',wakeTarget:'+15551234567'}),null,'unknown channel rejected');
 assert.equal(f.wakeTargetFrom({}),null,'empty declaration rejected');
 // 16. noteWakeTarget records a valid declaration and ignores repeats
 const nwa={...inst('i10')};
 await f.setJ('fm:agent:i10',nwa);
 await f.noteWakeTarget(nwa,f.wakeTargetFrom({wakeChannel:'email',wakeTarget:'i10@mail.instinct.com'}));
 const stored=await f.getJ('fm:agent:i10');
 assert.equal(stored.wake.channel,'email');assert.equal(stored.wake.target,'i10@mail.instinct.com','declaration stored on the bot record');
 // 16b. email target changes are capped: the 6th distinct address in 24h is ignored
 for(const t of ['a1@gmail.com','a2@gmail.com','a3@gmail.com','a4@gmail.com','a5@gmail.com'])await f.noteWakeTarget(nwa,f.wakeTargetFrom({wakeChannel:'email',wakeTarget:t}));
 assert.equal((await f.getJ('fm:agent:i10')).wake.target,'a5@gmail.com','five changes land');
 await f.noteWakeTarget(nwa,f.wakeTargetFrom({wakeChannel:'email',wakeTarget:'a6@gmail.com'}));
 assert.equal((await f.getJ('fm:agent:i10')).wake.target,'a5@gmail.com','the sixth change in 24h is ignored');
 // 17. declared webhook: signed content-free POST to the bot's own Grok Webhook Trigger, wins over env channels
 ctx.process.env.WAKE_GROK_SLACK_WEBHOOK='https://hooks.slack.com/services/T00/B00/secret';
 await f.setJ('fm:agent:g13',{...grok('g13'),wake:{channel:'webhook',target:'https://grok.com/api/automations/wh_123/deliveries',secret:'whsec_dGVzdHNlY3JldA==',declaredAt:'2026-10-19'}});
 await f.newTask({title:'Webhook secret brief',assignee:'g13'});
 assert.equal(whooks.length,1,'declared webhook fires');
 assert.equal(slacks.length,2,'webhook wins over the env slack webhook');
 const wh=whooks[0];
 assert.equal(wh.u,'https://grok.com/api/automations/wh_123/deliveries','ping goes to the declared endpoint');
 assert.deepEqual(JSON.parse(wh.body),{event:'alter.job.waiting'},'webhook ping is content-free');
 assert.ok(/^msg_[a-f0-9]{32}$/.test(wh.headers['webhook-id']),'standard webhooks id');
 assert.ok(Math.abs(Date.now()/1000-Number(wh.headers['webhook-timestamp']))<60,'fresh timestamp');
 const expectSig='v1,'+crypto.createHmac('sha256',Buffer.from('dGVzdHNlY3JldA==','base64')).update(wh.headers['webhook-id']+'.'+wh.headers['webhook-timestamp']+'.'+wh.body).digest('base64');
 assert.equal(wh.headers['webhook-signature'],expectSig,'HMAC signature matches the Standard Webhooks format');
 // 18. wakeTargetFrom webhook validation: x.ai/grok.com https endpoint + whsec_ secret required
 assert.deepEqual(f.wakeTargetFrom({wakeChannel:'webhook',wakeTarget:'https://grok.com/api/automations/wh_9/deliveries',wakeSecret:'whsec_dGVzdHNlY3JldA=='}),{channel:'webhook',target:'https://grok.com/api/automations/wh_9/deliveries',secret:'whsec_dGVzdHNlY3JldA=='},'webhook endpoint+secret accepted');
 assert.equal(f.wakeTargetFrom({wakeChannel:'webhook',wakeTarget:'https://evil.example.com/hook',wakeSecret:'whsec_dGVzdHNlY3JldA=='}),null,'off-platform endpoint rejected');
 assert.equal(f.wakeTargetFrom({wakeChannel:'webhook',wakeTarget:'http://grok.com/x',wakeSecret:'whsec_dGVzdHNlY3JldA=='}),null,'plain http rejected');
 assert.equal(f.wakeTargetFrom({wakeChannel:'webhook',wakeTarget:'https://grok.com/api/automations/wh_9/deliveries'}),null,'missing secret rejected');
 assert.equal(f.wakeTargetFrom({wakeChannel:'webhook',wakeTarget:'https://grok.com/api/automations/wh_9/deliveries',wakeSecret:'not-a-secret'}),null,'non-whsec secret rejected');
 assert.equal(f.wakeTargetFrom({wakeChannel:'webhook',wakeTarget:'https://grok.com.evil.com/x',wakeSecret:'whsec_dGVzdHNlY3JldA=='}),null,'lookalike host rejected');
 console.log('PASS wake triggers: queue/assign/reassign wake Instinct by email and Grok by slack/github, content-free, 30s dedupe, provider+pause+revoke guards, silent without a channel, failures recorded not thrown.');
});})().catch(e=>{console.error(e);process.exit(1)});
// source contract
const api=src;
assert.ok(api.includes("'NX', 'PX', 30000]"),'30s dedupe window');
assert.ok(api.includes("subject: 'Alter: job waiting for ' + who"),'email subject is a fixed prefix plus the bot name');
assert.ok(api.includes("'Alter: job waiting for Grok'"),'default slack text literal kept for the env fallback');
assert.ok(api.includes("title: 'Alter: job waiting for Grok'"),'exact issue title');
assert.ok(api.includes("state_reason: 'completed'"),'trigger issue closed as completed');
assert.ok(!/text:.*t\.title/.test(api),'trigger bodies never interpolate task data');
assert.ok(api.includes("presenceOnly: true, taskId:jobId||null });\n  } catch"),'wake events never count as bot activity');
assert.ok(api.includes('declared target wins'),'per-bot declared target documented as winning over env');
assert.ok(api.includes('gl:wakeChg:'),'email target changes are capped per bot per day');
assert.ok(api.includes('hooks\\.slack\\.com\\/services\\/'),'slack targets locked to webhook URLs');
assert.ok(api.includes('const _wt=wakeTargetFrom(body);if(_wt)await noteWakeTarget(agent,_wt)'),'gateway hook records declared targets');
assert.ok(api.includes('wakeTargetFrom(args||{})'),'MCP foreman_presence records declared targets');
assert.ok(api.includes('webhook-signature'),'webhook sender signs deliveries');
assert.ok(api.includes('alter.job.waiting'),'webhook ping body is the fixed content-free event');
assert.ok(api.includes('whsec_'),'webhook secrets are validated in the whsec_ format');
