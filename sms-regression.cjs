const fs=require('fs'),vm=require('vm'),assert=require('assert'),twilio=require('twilio');
const env={},ctx={require,module:{exports:{}},process:{env},global:{},console,fetch:()=>{throw Error('UNEXPECTED NETWORK')},setTimeout,clearTimeout,URL,URLSearchParams,Buffer,AbortSignal};
vm.runInNewContext(fs.readFileSync(__dirname+'/api/index.js','utf8')+'\nmodule.exports.t={r,setJ,getJ,als,smsEnroll,smsDisable,smsAlert,smsWebhook,smsSettings,smsFingerprint,decide};',ctx);const h=ctx.module.exports,f=h.t;let calls=0,sequence=0;
const sid='AC'+'a'.repeat(32),token='fixture-not-real',from='+18005550111',phone='+12145550111',base='https://fixture.example';
const ws=(name,fn)=>f.als.run({ws:name},fn);const get=(k,w='sms-a')=>ws(w,()=>f.getJ(k));const set=(k,v,w='sms-a')=>ws(w,()=>f.setJ(k,v));
async function inbound(text,opts={}){const p='/sms/inbound',body={AccountSid:sid,From:phone,To:from,Body:text,MessageSid:'SM'+(++sequence).toString(16).padStart(32,'0'),...opts};const req={method:'POST',url:'/api'+p,headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':twilio.getExpectedTwilioSignature(token,base+'/api'+p,body)}};return f.smsWebhook(req,body,p);}
async function request(id){const q={id,agentId:'a',agentName:'Fixture',action:'notes.write',costCents:2,rawParams:{title:'Fixture note',text:'Test text'},params:{title:'Fixture note',text:'Test text'},status:'pending',createdAt:new Date().toISOString()};await set('fm:req:'+id,q);return q;}
async function alert(id){const q=await request(id);await ws('sms-a',()=>f.smsAlert(q));return get('fm:sms:alert:'+id);}
async function enroll(w='sms-a'){const r=await ws(w,()=>f.smsEnroll({phone,confirmed:true}));assert.equal(r.status,200);return r.body.instruction.match(/START ([A-F0-9]+)/)[1];}
(async()=>{
 await set('fm:agent:a',{id:'a',name:'Fixture',status:'active',limits:{perActionCents:10,dailyCents:100},permissions:{'notes.write':'ASK'}});
 assert.equal((await ws('sms-a',()=>f.smsAlert({status:'pending'}))).status,'disabled');assert.equal(calls,0);
 Object.assign(env,{BLACKBOX_SMS_LIVE:'true',TWILIO_ACCOUNT_SID:sid,TWILIO_AUTH_TOKEN:token,TWILIO_SMS_FROM:from,BLACKBOX_PUBLIC_ORIGIN:base});
 assert.equal((await ws('sms-a',()=>f.smsEnroll({phone,confirmed:false}))).status,400);
 const code=await enroll();assert.equal((await inbound('START '+code,{From:'+12145550999'})).body.ignored,true);assert.equal((await get('fm:sms:owner')).verified,false);
 assert.equal((await inbound('START '+code)).body.verified,true);assert.equal((await get('fm:sms:owner')).verified,true);
 const other=await enroll('sms-b');assert.equal((await inbound('START '+other)).status,409);assert.equal((await get('fm:sms:owner','sms-b')).verified,false);
 ctx.fetch=async(url,options)=>{assert(url.startsWith('https://api.twilio.com/'));calls++;const b=new URLSearchParams(options.body);assert.equal(b.get('To'),phone);assert.equal(b.get('From'),from);assert(b.get('Body').includes('YES '));return {ok:true,json:async()=>({sid:'SM'+calls.toString(16).padStart(32,'0'),status:'queued'})};};
 let a=await alert('q1');assert.equal(a.status,'queued');assert.equal(calls,1);await ws('sms-a',async()=>f.smsAlert(await get('fm:req:q1')));assert.equal(calls,1);
 assert.equal((await inbound('YES')).body.ignored,true);assert.equal((await get('fm:req:q1')).status,'pending');
 assert.equal((await inbound('YES '+a.code,{From:'+12145550999'})).body.ignored,true);assert.equal((await inbound('YES '+a.code,{To:'+18005550999'})).status,403);
 const badBody={AccountSid:sid,MessageSid:'SM'+'b'.repeat(32),From:phone,To:from,Body:'YES '+a.code};assert.equal((await f.smsWebhook({method:'POST',url:'/api/sms/inbound',headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':'wrong'}},badBody,'/sms/inbound')).status,403);
 const results=await Promise.all([inbound('YES '+a.code),inbound('YES '+a.code)]);assert.equal(results.filter(r=>r.body.accepted).length,1);assert.equal((await get('fm:req:q1')).status,'executed');assert.equal((await ws('sms-a',()=>f.r(['LRANGE','fm:notes',0,99]))).length,1);
 assert.equal((await inbound('YES '+a.code)).body.ignored,true);
 a=await alert('q2');let b=await get('fm:sms:code:'+a.code);b.expiresAt='2020-01-01';await set('fm:sms:code:'+a.code,b);assert.equal((await inbound('YES '+a.code)).body.ignored,true);assert.equal((await get('fm:req:q2')).status,'pending');
 a=await alert('q3');let q=await get('fm:req:q3');q.rawParams.text='Changed';await set('fm:req:q3',q);assert.equal((await inbound('YES '+a.code)).body.accepted,false);assert.equal((await get('fm:req:q3')).status,'pending');
 a=await alert('q4');assert.equal((await inbound('NO '+a.code)).body.accepted,true);assert.equal((await get('fm:req:q4')).status,'denied');
 a=await alert('q5');await set('fm:kill','1');assert.equal((await inbound('YES '+a.code)).body.accepted,true);assert.equal((await get('fm:req:q5')).status,'blocked');await ws('sms-a',()=>f.r(['DEL','fm:kill']));
 a=await alert('q6');const reenroll=await enroll();assert.equal((await inbound('START '+reenroll)).body.verified,true);assert.equal((await inbound('YES '+a.code)).body.accepted,false);assert.equal((await get('fm:req:q6')).status,'pending');
 let secret=await request('secret');secret.rawParams={token:'fixture'};assert.equal((await ws('sms-a',()=>f.smsAlert(secret))).status,'in_app_only');
 let unicode=await request('unicode');unicode.rawParams={text:'snowman ☃'};assert.equal((await ws('sms-a',()=>f.smsAlert(unicode))).status,'in_app_only');
 a=await alert('q7');const sameSid='SM'+'d'.repeat(32);assert.equal((await inbound('NO '+a.code,{MessageSid:sameSid})).body.accepted,true);assert.equal((await inbound('NO '+a.code,{MessageSid:sameSid})).body.ignored,true);
 await inbound('STOP');assert.equal((await get('fm:sms:owner')).optedOut,true);const before=calls;await alert('q8');assert.equal(calls,before);
 let response;await h({method:'GET',url:'/api/sms/settings',headers:{}},{setHeader(){},status(n){this.code=n;return this},json(b){response={code:this.code,body:b}}});assert.equal(response.code,401);
 env.BLACKBOX_SMS_LIVE='false';assert.equal((await inbound('YES 123456ABCDEF')).status,403);assert.equal((await ws('sms-b',()=>f.getJ('fm:req:q1'))),null);
 console.log('PASS disabled default, owner enrollment, transport signature, wrong phone/account/workspace, bare YES rejection, expiry, mutable details, duplicate/concurrent action-once, deny/kill, re-enrollment invalidation, secret/unicode fallback, STOP, session auth. Twilio fetches were mocked; no real texts or charges.');
})().catch(e=>{console.error(e);process.exit(1)});
