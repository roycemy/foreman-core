const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');const source=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.test={waitlistAdmin,waitlistAdminClaim,WAITLIST_ADMIN_CLAIMS,r,getJ,sha};';const ctx={module:{exports:{}},require,process:{env:{}},global:{},console,URL,setTimeout,clearTimeout,AbortSignal,fetch:()=>{throw Error('NO NETWORK')}};vm.runInNewContext(source,ctx);const f=ctx.module.exports.test;
(async()=>{
 const sha=f.sha,r=f.r,ORIGIN='https://foreman-core.vercel.app';
 async function call(handler,{cookie,method='GET',body,ip='127.0.0.1'}={}){let out,code;const res={setHeader(){},status(c){code=c;return this},json(j){out={code:code||200,j};return out}};await handler({method,headers:{cookie:cookie||'',origin:ORIGIN,'x-forwarded-for':ip}},res,body||{});return out;}
 const mk=async(id,email)=>{await r(['SET','gl:user:'+sha(email),JSON.stringify({id,email,ws:'wsA',salt:'s',hash:'h'})]);const t=id+'tok';await r(['SET','gl:sess:'+sha(t),JSON.stringify({uid:id,email,ws:'wsA'})]);return 'fm_sess='+t;};
 // seed two online signups + 3 in-person reservations
 await r(['SET','gl:waitlist:'+sha('first@example.test'),JSON.stringify({email:'first@example.test',requestedAt:'2026-11-18T01:00:00.000Z',consent:'Access availability email only',source:'alter-site'})]);
 await r(['SADD','gl:waitlist',sha('first@example.test')]);
 await r(['SET','gl:waitlist:'+sha('second@example.test'),JSON.stringify({email:'second@example.test',requestedAt:'2026-11-19T14:00:00.000Z',consent:'Access availability email only',source:'alter-site',campaign:'yash-conf'})]);
 await r(['SADD','gl:waitlist',sha('second@example.test')]);
 await r(['SET','gl:foundingInPerson','3']);
 // build a claim pair for a test founder by patching the claims map the same way production codes are made
 const testCode=crypto.randomBytes(32).toString('hex'),founder='founder@example.test';
 f.WAITLIST_ADMIN_CLAIMS[sha(testCode)]=sha(founder);
 // the production map must carry only live, unclaimed codes as hashes (Royce's consumed code was rotated out) and nothing human-readable
 const entries=Object.entries(f.WAITLIST_ADMIN_CLAIMS);
 assert.equal(entries.length,2); // yash's rotated production code + injected test founder code
 assert.ok(entries.every(([c,e])=>/^[a-f0-9]{64}$/.test(c)&&/^[a-f0-9]{64}$/.test(e)));
 assert.ok(entries.some(([,e])=>e===sha('yashshah8778@gmail.com')));
 assert.ok(!entries.some(([,e])=>e===sha('roycemyers20@gmail.com')));
 // waitlistAdmin is not patched for the test founder (allowlist is real), so exercise claim flow with the real founders and data flow via a claim grant
 const stranger=await mk('u1','stranger@example.test'),admin=await mk('u2','roycemyers20@gmail.com'),admin2=await mk('u3','yashshah8778@gmail.com');
 // claim: auth, method, origin, bad code, wrong account, rate limit
 assert.equal((await call(f.waitlistAdminClaim,{method:'POST',body:{code:testCode}})).code,401);
 assert.equal((await call(f.waitlistAdminClaim,{cookie:admin,method:'GET'})).code,405);
 assert.equal((await call(f.waitlistAdminClaim,{cookie:admin,method:'POST',body:{code:testCode}})).code,403); // code bound to someone else
 assert.equal((await call(f.waitlistAdminClaim,{cookie:stranger,method:'POST',body:{code:testCode}})).code,403);
 assert.equal((await call(f.waitlistAdminClaim,{cookie:admin,method:'POST',body:{code:'nope'}})).code,400);
 // admin view before any claim: founders get claim_required, strangers stay out
 let out=await call(f.waitlistAdmin,{cookie:admin});
 assert.equal(out.code,403);assert.equal(out.j.error,'claim_required');
 assert.equal((await call(f.waitlistAdmin,{cookie:stranger})).code,403);
 assert.equal((await call(f.waitlistAdmin)).code,401);
 assert.equal((await call(f.waitlistAdmin,{cookie:admin,method:'POST'})).code,405);
 // Royce's production grant predates uid binding and is stored as the legacy '1' flag
 await r(['SET','gl:waitlistAdmin:'+sha('roycemyers20@gmail.com'),'1']);
 // replay of a redeemed code is rejected even from the right account
 // (its plaintext is unknowable here, so assert the redeemed marker path via a fresh code bound to the same email)
 const replayCode=crypto.randomBytes(32).toString('hex');f.WAITLIST_ADMIN_CLAIMS[sha(replayCode)]=sha('roycemyers20@gmail.com');
 await r(['SET','gl:waitlistAdminClaim:'+sha(replayCode),JSON.stringify({email:'roycemyers20@gmail.com',at:'2026-11-19T20:01:00.000Z'})]);
 assert.equal((await call(f.waitlistAdminClaim,{cookie:admin,method:'POST',body:{code:replayCode}})).code,409);
 // the legacy '1' flag grants the read once and is upgraded in place to a uid-bound grant
 out=await call(f.waitlistAdmin,{cookie:admin});
 assert.equal(out.code,200);
 const upgraded=JSON.parse(await r(['GET','gl:waitlistAdmin:'+sha('roycemyers20@gmail.com')]));
 assert.equal(upgraded.uid,'u2');assert.ok(upgraded.at);
 assert.equal(out.j.onlineSignups,2);
 assert.equal(out.j.inPerson,3);
 assert.equal(out.j.taken,5);
 assert.equal(out.j.campaigns['yash-conf'],1);
 assert.equal(out.j.campaigns['no tag'],1);
 assert.equal(out.j.signups[0].email,'first@example.test');
 assert.equal(out.j.signups[0].seat,4);
 assert.equal(out.j.signups[1].seat,5);
 assert.equal(out.j.signups[1].campaign,'yash-conf');
 // the other founder is still locked out until their own claim
 out=await call(f.waitlistAdmin,{cookie:admin2});
 assert.equal(out.code,403);assert.equal(out.j.error,'claim_required');
 // the other founder redeems their own code: grant is written uid-bound and the view opens
 const yashCode=crypto.randomBytes(32).toString('hex');f.WAITLIST_ADMIN_CLAIMS[sha(yashCode)]=sha('yashshah8778@gmail.com');
 const claimed=await call(f.waitlistAdminClaim,{cookie:admin2,method:'POST',body:{code:yashCode}});
 assert.equal(claimed.code,200);assert.equal(claimed.j.ok,true);
 const yashGrant=JSON.parse(await r(['GET','gl:waitlistAdmin:'+sha('yashshah8778@gmail.com')]));
 assert.equal(yashGrant.uid,'u3');
 out=await call(f.waitlistAdmin,{cookie:admin2});
 assert.equal(out.code,200);assert.equal(out.j.onlineSignups,2);
 // claim rate limit: 10 tries per IP per hour
 for(let i=0;i<10;i++)await call(f.waitlistAdminClaim,{cookie:admin,method:'POST',body:{code:'nope'},ip:'10.9.9.9'});
 assert.equal((await call(f.waitlistAdminClaim,{cookie:admin,method:'POST',body:{code:'nope'},ip:'10.9.9.9'})).code,429);
 // read cap for the granted founder
 for(let i=0;i<239;i++)await call(f.waitlistAdmin,{cookie:admin});
 assert.equal((await call(f.waitlistAdmin,{cookie:admin})).code,429);
 // entitlement must not survive account deletion/re-registration: a new account on the same email gets a new uid and the uid-bound grant no longer matches
 const adminRe=await mk('u2b','roycemyers20@gmail.com'); // re-register same email under a new user id
 out=await call(f.waitlistAdmin,{cookie:adminRe});
 assert.equal(out.code,403);assert.equal(out.j.error,'claim_required');
 // the pre-deletion session is invalidated too (its uid no longer matches the record)
 assert.equal((await call(f.waitlistAdmin,{cookie:admin})).code,401);
 console.log('PASS waitlist admin: claim-gated founders only, uid-bound grants, legacy grant upgrade, no inheritance across re-registration, rotated claims map, replay rejection, claim_required state, seats after in-person offset, campaign counts, claim and read rate limits; no network.');
})().catch(e=>{console.error(e);process.exit(1)});
