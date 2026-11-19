const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');const source=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.test={waitlistAdmin,waitlistAdminClaimEmail,waitlistAdminClaimToken,r,getJ,sha};';const ctx={module:{exports:{}},require,process:{env:{}},global:{},console,URL,setTimeout,clearTimeout,AbortSignal,fetch:()=>{throw Error('NO NETWORK')}};vm.runInNewContext(source,ctx);const f=ctx.module.exports.test;
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
 const stranger=await mk('u1','stranger@example.test'),admin=await mk('u2','roycemyers20@gmail.com'),admin2=await mk('u3','yashshah8778@gmail.com');
 // the view before any grant: founders get claim_required, strangers stay out
 let out=await call(f.waitlistAdmin,{cookie:admin});
 assert.equal(out.code,403);assert.equal(out.j.error,'claim_required');
 assert.equal((await call(f.waitlistAdmin,{cookie:stranger})).code,403);
 assert.equal((await call(f.waitlistAdmin)).code,401);
 assert.equal((await call(f.waitlistAdmin,{cookie:admin,method:'POST'})).code,405);
 // a malformed stored flag never grants
 await r(['SET','gl:waitlistAdmin:'+sha('roycemyers20@gmail.com'),'1']);
 out=await call(f.waitlistAdmin,{cookie:admin});
 assert.equal(out.code,403);assert.equal(out.j.error,'claim_required');
 // Royce's production grant: uid-bound
 await r(['SET','gl:waitlistAdmin:'+sha('roycemyers20@gmail.com'),JSON.stringify({uid:'u2',at:'2026-11-19T20:53:00.000Z'})]);
 out=await call(f.waitlistAdmin,{cookie:admin});
 assert.equal(out.code,200);
 assert.equal(out.j.onlineSignups,2);
 assert.equal(out.j.inPerson,3);
 assert.equal(out.j.taken,5);
 assert.equal(out.j.campaigns['yash-conf'],1);
 assert.equal(out.j.campaigns['no tag'],1);
 assert.equal(out.j.signups[0].email,'first@example.test');
 assert.equal(out.j.signups[0].seat,4);
 assert.equal(out.j.signups[1].seat,5);
 assert.equal(out.j.signups[1].campaign,'yash-conf');
 // the other founder is still locked out until their own enrollment
 out=await call(f.waitlistAdmin,{cookie:admin2});
 assert.equal(out.code,403);assert.equal(out.j.error,'claim_required');
 // email-verified enrollment: request link, redeem on the right account, reject everything else
 const sent=[],realFetch=ctx.fetch;
 ctx.process.env.RESEND_API_KEY='test-key';ctx.process.env.WAKE_EMAIL_FROM='wake@mail.alterhq.app';
 assert.equal((await call(f.waitlistAdminClaimEmail,{method:'POST'})).code,401);
 assert.equal((await call(f.waitlistAdminClaimEmail,{cookie:stranger,method:'POST'})).code,403);
 // sender failure -> 503, no grant (uses admin's fresh per-account allowance)
 ctx.fetch=async()=>({ok:false,status:422});
 assert.equal((await call(f.waitlistAdminClaimEmail,{cookie:admin,method:'POST'})).code,503);
 // the founder requests their activation email; it goes only to their own allowlisted address
 ctx.fetch=async(url,opts)=>{sent.push({url,body:JSON.parse(opts.body)});return{ok:true,status:200};};
 const reqOut=await call(f.waitlistAdminClaimEmail,{cookie:admin2,method:'POST'});
 assert.equal(reqOut.code,200);assert.equal(reqOut.j.ok,true);
 assert.equal(sent.length,1);
 assert.equal(sent[0].body.to[0],'yashshah8778@gmail.com');
 const link=sent[0].body.text.match(/https:\/\/www\.alterhq\.app\/waitlist-admin\?claim=([a-f0-9]{64})/);
 assert.ok(link,'activation link in email');const emailedToken=link[1];
 // redemption: auth, method, shape, unknown, wrong account, right account, replay
 assert.equal((await call(f.waitlistAdminClaimToken,{method:'POST',body:{token:emailedToken}})).code,401);
 assert.equal((await call(f.waitlistAdminClaimToken,{cookie:admin2,method:'GET'})).code,405);
 assert.equal((await call(f.waitlistAdminClaimToken,{cookie:admin2,method:'POST',body:{token:'zzz'}})).code,400);
 assert.equal((await call(f.waitlistAdminClaimToken,{cookie:admin2,method:'POST',body:{token:crypto.randomBytes(32).toString('hex')}})).code,400);
 assert.equal((await call(f.waitlistAdminClaimToken,{cookie:admin,method:'POST',body:{token:emailedToken}})).code,403); // right inbox, wrong account: no grant
 const okT=await call(f.waitlistAdminClaimToken,{cookie:admin2,method:'POST',body:{token:emailedToken}});
 assert.equal(okT.code,200);assert.equal(okT.j.ok,true);
 const emailGrant=JSON.parse(await r(['GET','gl:waitlistAdmin:'+sha('yashshah8778@gmail.com')]));
 assert.equal(emailGrant.uid,'u3');assert.equal(emailGrant.via,'email');
 out=await call(f.waitlistAdmin,{cookie:admin2});
 assert.equal(out.code,200);assert.equal(out.j.onlineSignups,2);
 assert.equal((await call(f.waitlistAdminClaimToken,{cookie:admin2,method:'POST',body:{token:emailedToken}})).code,400); // single use
 // request rate limit: 3 emails per account per hour (admin2 used 1)
 await call(f.waitlistAdminClaimEmail,{cookie:admin2,method:'POST'});
 await call(f.waitlistAdminClaimEmail,{cookie:admin2,method:'POST'});
 assert.equal((await call(f.waitlistAdminClaimEmail,{cookie:admin2,method:'POST'})).code,429);
 // redemption attempts: 10 per IP per hour
 for(let i=0;i<10;i++)await call(f.waitlistAdminClaimToken,{cookie:admin2,method:'POST',body:{token:'zzz'},ip:'10.9.9.9'});
 assert.equal((await call(f.waitlistAdminClaimToken,{cookie:admin2,method:'POST',body:{token:'zzz'},ip:'10.9.9.9'})).code,429);
 ctx.fetch=realFetch;delete ctx.process.env.RESEND_API_KEY;delete ctx.process.env.WAKE_EMAIL_FROM;
 // read cap for the granted founder
 for(let i=0;i<239;i++)await call(f.waitlistAdmin,{cookie:admin});
 assert.equal((await call(f.waitlistAdmin,{cookie:admin})).code,429);
 // entitlement must not survive account deletion/re-registration: a new account on the same email gets a new uid and the uid-bound grant no longer matches
 const adminRe=await mk('u2b','roycemyers20@gmail.com'); // re-register same email under a new user id
 out=await call(f.waitlistAdmin,{cookie:adminRe});
 assert.equal(out.code,403);assert.equal(out.j.error,'claim_required');
 // the pre-deletion session is invalidated too (its uid no longer matches the record)
 assert.equal((await call(f.waitlistAdmin,{cookie:admin})).code,401);
 console.log('PASS waitlist admin: email-verified founders-only enrollment, uid-bound grants, malformed-flag rejection, wrong-account and replay rejection, sender-failure 503, request/redemption/read rate limits, no inheritance across re-registration, seats after in-person offset, campaign counts; no network.');
})().catch(e=>{console.error(e);process.exit(1)});
