// Email-token password reset, offline. The email provider is a stub that records calls; no real email and no network. Covers: origin,
// generic answers (no account enumeration), founders-only recipients, sender missing or failing, rate limits, one live link per account,
// single use under concurrency, 30-minute expiry (fake clock), old sessions ended, account replaced, old password refused, the token
// never stored in plain form or printed, and existing account data kept.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
let off=0;class FD extends Date{constructor(...a){if(a.length)super(...a);else super(Date.now()+off)}static now(){return Date.now()+off}}
const API=path.join(__dirname,'api/index.js'),src='Date=FD;'+fs.readFileSync(API,'utf8')+'\nmodule.exports.t={r,setJ,getJ,sha,als};';
const sent=[],printed=[];let providerOk=true;const env={RESEND_API_KEY:'re_synthetic_test_only',WAKE_EMAIL_FROM:'Alter <wake@mail.example>'};
const cap=(...a)=>printed.push(a.map(String).join(' '));
const ctx={FD,require:require('module').createRequire(API),module:{exports:{}},process:{env},global:{},console:{log:cap,warn:cap,error:cap,info:cap},
 fetch:async(u,o)=>{if(String(u)==='https://api.resend.com/emails'){sent.push(JSON.parse(o.body));return {ok:providerOk,status:providerOk?200:500,json:async()=>({id:'x'})};}throw Error('NO NETWORK '+u)},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const h=ctx.module.exports,f=h.t;
let ipN=0;
async function http(method,url,{body,cookie,origin,ip}={}){let out,set=null;const headers={host:'www.alterhq.app',origin:origin===undefined?'https://www.alterhq.app':origin,'x-forwarded-for':ip||'203.0.113.'+(++ipN%200)};if(cookie)headers.cookie='fm_sess='+cookie;
 const res={setHeader(k,v){if(k==='Set-Cookie'){const m=/fm_sess=([^;]*)/.exec(String(v));if(m)set=m[1];}},status(c){this.code=c;return this},json(j){out={code:this.code||200,j}},send(b){out={code:this.code||200,j:b}},end(){out={code:this.code||204}}};
 await h({method,url,headers,body:body||{}},res);return {...out,cookie:set};}
const FOUNDER='roycemyers20@gmail.com',OTHER='someone@example.com';
const signup=async(email,pw)=>{const r=await http('POST','/api/auth/signup',{body:{email,password:pw}});assert.equal(r.code,200,JSON.stringify(r.j));return r.cookie;};
const login=async(email,pw)=>http('POST','/api/auth/login',{body:{email,password:pw}});
const me=async c=>(await http('GET','/api/me',{cookie:c})).code;
const linkToken=()=>{const t=/\/hq#reset=([a-f0-9]{64})\n/.exec(sent[sent.length-1].text);assert.ok(t,'the email carries a /hq#reset= link');return t[1];};
const dump=()=>JSON.stringify([...ctx.global.__mem.kv.entries()].map(([k,v])=>[k,v instanceof Set?[...v]:v]))+JSON.stringify([...ctx.global.__mem.lists.values()]);
(async()=>{
 const oldCookie=await signup(FOUNDER,'old-password-1');await signup(OTHER,'other-password');
 const before=await f.getJ('gl:user:'+f.sha(FOUNDER));
 // origin and validation
 assert.equal((await http('POST','/api/auth/reset-request',{body:{email:FOUNDER},origin:'https://evil.example'})).code,403,'foreign origin refused');
 assert.equal((await http('GET','/api/auth/reset-request')).code,405);
 assert.equal((await http('POST','/api/auth/reset-request',{body:{email:'nope'}})).code,400);
 // generic answers; only a founder account gets mail
 const g1=await http('POST','/api/auth/reset-request',{body:{email:'nobody@example.com'}}),g2=await http('POST','/api/auth/reset-request',{body:{email:OTHER}});
 assert.equal(sent.length,0,'no mail for an unknown or non-founder address');
 const r1=await http('POST','/api/auth/reset-request',{body:{email:FOUNDER}});assert.equal(r1.code,200);assert.deepEqual([g1.j,g2.j],[r1.j,r1.j],'same answer whether or not the account exists');
 assert.equal(sent.length,1);assert.deepEqual(sent[0].to,[FOUNDER]);assert.equal(sent[0].from,env.WAKE_EMAIL_FROM,'existing sender');assert.ok(sent[0].text.includes('https://www.alterhq.app/hq#reset='),'production link, token in the fragment');
 const tok1=linkToken();assert.ok(!dump().includes(tok1),'the token is stored only as a hash');
 // a newer link replaces the older one
 await http('POST','/api/auth/reset-request',{body:{email:FOUNDER}});const tok2=linkToken();assert.notEqual(tok1,tok2);
 assert.equal((await http('POST','/api/auth/reset',{body:{token:tok1,password:'new-password-1'}})).code,400,'the older link no longer works');
 // per-email rate limit: 3 per hour
 assert.equal((await http('POST','/api/auth/reset-request',{body:{email:FOUNDER}})).code,200);assert.equal((await http('POST','/api/auth/reset-request',{body:{email:FOUNDER}})).code,429,'4th request in an hour refused');
 const tok3=linkToken();
 // reset validation
 assert.equal((await http('POST','/api/auth/reset',{body:{token:'zz',password:'new-password-1'}})).code,400);
 assert.equal((await http('POST','/api/auth/reset',{body:{token:tok3,password:'short'}})).code,400,'short password refused, link not consumed');
 // single use under concurrency
 const [a,b]=await Promise.all([http('POST','/api/auth/reset',{body:{token:tok3,password:'new-password-1'}}),http('POST','/api/auth/reset',{body:{token:tok3,password:'new-password-2'}})]);
 assert.equal([a,b].filter(x=>x.code===200).length,1,'exactly one reset wins: '+JSON.stringify([a.j,b.j]));const win=a.code===200?a:b,pw=a.code===200?'new-password-1':'new-password-2';
 assert.ok(win.cookie,'the winner is signed in');assert.equal(await me(win.cookie),200);
 assert.equal((await http('POST','/api/auth/reset',{body:{token:tok3,password:'another-pass'}})).code,400,'a used link fails');
 assert.equal((await login(FOUNDER,'old-password-1')).code,401,'old password refused');assert.equal((await login(FOUNDER,pw)).code,200,'new password works');
 assert.equal(await me(oldCookie),401,'a session from before the reset is ended');
 const after=await f.getJ('gl:user:'+f.sha(FOUNDER));for(const k of ['id','email','ws','createdAt'])assert.equal(after[k],before[k],'account '+k+' kept');
 assert.equal((await login(OTHER,'other-password')).code,200,'another account is untouched');
 // expiry: 30 minutes (new hour bucket so the rate limit allows the request)
 off+=3600000;await http('POST','/api/auth/reset-request',{body:{email:FOUNDER}});const tok4=linkToken();off+=31*60000;
 assert.equal((await http('POST','/api/auth/reset',{body:{token:tok4,password:'late-password'}})).code,400,'an expired link fails');
 // account replaced after the link was issued
 off+=3600000;await http('POST','/api/auth/reset-request',{body:{email:FOUNDER}});const tok5=linkToken();
 const u=await f.getJ('gl:user:'+f.sha(FOUNDER));await f.setJ('gl:user:'+f.sha(FOUNDER),{...u,id:'user_replaced'});
 assert.equal((await http('POST','/api/auth/reset',{body:{token:tok5,password:'whatever-pass'}})).code,400,'a link for a replaced account fails');await f.setJ('gl:user:'+f.sha(FOUNDER),u);
 // sender missing or failing: 503, nothing usable left behind
 off+=3600000;providerOk=false;const n0=sent.length;assert.equal((await http('POST','/api/auth/reset-request',{body:{email:FOUNDER}})).code,503,'provider failure reported');const tok6=linkToken();
 assert.equal((await http('POST','/api/auth/reset',{body:{token:tok6,password:'unused-password'}})).code,400,'a link whose email failed does not work');providerOk=true;
 delete env.RESEND_API_KEY;assert.equal((await http('POST','/api/auth/reset-request',{body:{email:FOUNDER}})).code,503,'no sender configured: 503');assert.equal(sent.length,n0+1,'no send attempted without a sender');env.RESEND_API_KEY='re_synthetic_test_only';
 // per-IP limits
 off+=3600000;let last;for(let i=0;i<11;i++)last=await http('POST','/api/auth/reset-request',{body:{email:'x'+i+'@example.com'},ip:'198.51.100.7'});assert.equal(last.code,429,'11th request from one IP in an hour refused');
 for(let i=0;i<11;i++)last=await http('POST','/api/auth/reset',{body:{token:'0'.repeat(64),password:'whatever-pass'},ip:'198.51.100.8'});assert.equal(last.code,429,'11th reset try from one IP in 15 minutes refused');
 // nothing secret printed
 for(const t of [tok1,tok2,tok3,tok4,tok5,tok6,pw,'old-password-1'])assert.ok(!printed.join('\n').includes(t),'nothing secret printed');
 console.log('PASS password reset (provider stubbed, no real email): same-origin only; same answer for any address; only founder accounts get mail, from the existing sender, with the token in the /hq#reset= fragment; token stored hashed; newest link only; 3/hour per address, 10/hour per IP for requests, 10/15 min per IP for resets; single use under concurrency; 30-minute expiry; failed or missing sender is 503 and leaves no working link; old password and older sessions end; account data and other accounts untouched; nothing secret printed');
})().catch(e=>{console.error(e);process.exit(1)});
