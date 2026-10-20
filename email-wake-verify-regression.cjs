// Grok declares its own +alter inbox: test email with a one-time code, instant wake only after the bot echoes it; job id in later wake mails.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
let src=fs.readFileSync(require('path').join(__dirname,'api/index.js'),'utf8');
src+='\nmodule.exports.t={maybeWakeBot,newTask,getJ,setJ,als,wakeTargetFrom,noteWakeTarget,noteWakeNonce,wakeChannelFor};';
const sends=[];
const ctx={require,module:{exports:{}},process:{env:{RESEND_API_KEY:'k',WAKE_EMAIL_FROM:'Alter <w@alter.test>'}},global:{},console,
 fetch:(u,o)=>{if(String(u).includes('resend.com')){sends.push(JSON.parse(o.body));return Promise.resolve({ok:true,status:200});}throw Error('NETWORK '+u);},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const f=ctx.module.exports.t;
(async()=>{await f.als.run({ws:'t'},async()=>{
 const g={id:'g1',name:'Grok Bot',providerId:'grok',status:'active',paused:false,createdAt:'2026-10-20',limits:{perActionCents:10,dailyCents:50}};
 await f.setJ('fm:agent:g1',g);
 const w=f.wakeTargetFrom({wakeChannel:'email',wakeTarget:'grokbot+alter@x.ai'});await f.noteWakeTarget(g,w);
 let live=await f.getJ('fm:agent:g1');
 assert.equal(sends.length,1,'one test email');assert.ok(sends[0].subject.startsWith('Alter: wake test'));
 const code=live.wake.nonce;assert.ok(code&&sends[0].text.includes(code)&&!live.wake.verified);
 assert.equal(f.wakeChannelFor(live),null,'not instant before verification');
 await f.noteWakeNonce(live,{wakeNonce:'wrong'});live=await f.getJ('fm:agent:g1');assert.ok(!live.wake.verified,'wrong code ignored');
 await f.noteWakeNonce(live,{wakeNonce:code});live=await f.getJ('fm:agent:g1');
 assert.ok(live.wake.verified&&!live.wake.nonce);assert.equal(f.wakeChannelFor(live),'email','instant after verification');
 const t=await f.newTask({title:'Secret Q4',assignee:'g1'});
 const m=sends[sends.length-1];assert.deepEqual(m.to,['grokbot+alter@x.ai']);assert.ok(m.text.includes('Job: '),'job id in the wake mail');assert.ok(!JSON.stringify(m).includes('Secret Q4'),'no details');
});console.log('PASS email wake verify: test code, echo, job id, no details');})().catch(e=>{console.error(e);process.exit(1)});
