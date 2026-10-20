// Owner-pasted Grok webhook trigger: validated, signed per Standard Webhooks, secret never in state or the UI after save.
const fs=require('fs'),assert=require('assert'),crypto=require('crypto');
const srv=fs.readFileSync('api/index.js','utf8');
const grab=n=>{const i=srv.indexOf(n);assert(i>=0,n);let d=0,j=srv.indexOf('{',i);const st=j;for(;j<srv.length;j++){if(srv[j]==='{')d++;if(srv[j]==='}'){d--;if(!d)break;}}return srv.slice(i,j+1);};
let seen;const fetch=async(u,o)=>{seen={u,o};return {status:202,ok:true};};
const code=grab('function wakeTargetFrom')+';'+grab('async function postSignedPing');
const {wakeTargetFrom,postSignedPing}=new Function('crypto','fetch',code+';return {wakeTargetFrom,postSignedPing};')(crypto,fetch);
const sec='whsec_'+crypto.randomBytes(24).toString('base64');
assert(wakeTargetFrom({wakeChannel:'webhook',wakeTarget:'https://api.x.ai/hook/abc',wakeSecret:sec}),'valid x.ai trigger accepted');
assert(!wakeTargetFrom({wakeChannel:'webhook',wakeTarget:'https://evil.example/hook',wakeSecret:sec}),'other hosts refused');
assert(!wakeTargetFrom({wakeChannel:'webhook',wakeTarget:'http://api.x.ai/hook',wakeSecret:sec}),'http refused');
assert(!wakeTargetFrom({wakeChannel:'webhook',wakeTarget:'https://api.x.ai/hook',wakeSecret:'nope'}),'bad secret refused');
(async()=>{
  await postSignedPing({target:'https://api.x.ai/hook/abc',secret:sec});
  const h=seen.o.headers,body=seen.o.body;
  const exp=crypto.createHmac('sha256',Buffer.from(sec.replace(/^whsec_/,''),'base64')).update(h['webhook-id']+'.'+h['webhook-timestamp']+'.'+body).digest('base64');
  assert.strictEqual(h['webhook-signature'],'v1,'+exp,'signature matches the Standard Webhooks recipe');
  assert(!/task|brief/i.test(body),'ping carries no task details');
  assert(/wake: a\.wake && a\.wake\.channel \? \{ channel: a\.wake\.channel, declaredAt: a\.wake\.declaredAt \|\| null, hasSecret/.test(srv),'state shows only channel and hasSecret, never the secret');
  assert(/agents\\\/\(\\w\+\)\\\/wake\$/.test(srv)&&/origin'\}\);return send\(await setOwnerWake/.test(srv),'owner endpoint is origin checked');
  const ui=fs.readFileSync('public/js/connect.js','utf8');
  assert(/id="wakesec" type="password"/.test(ui)&&/\$\('#wakesec'\)\.value = ''/.test(ui),'secret field is masked and cleared after save');
  console.log('PASS wake-url: owner-pasted webhook is validated, signed, hidden');
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
