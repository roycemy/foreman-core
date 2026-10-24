// Business app connections (Gmail connector): OAuth client lifecycle against a stubbed
// Google surface. Covers: honest unconfigured/unsafe-storage states, consent URL shape,
// session-bound single-use state (atomic consume), full-grant verification (offline token +
// scope set + profile) before anything is called connected, dedicated-key encryption at
// rest (tokens AND the snippet-bearing inbox snapshot), connector-epoch + record CAS across
// callback/refresh/sync/disconnect (no resurrection after disconnect or purge), revocation
// in RFC 7009 body form (never a URL) with honest grant status, strict recipient/header
// injection rejection, purge invalidating pending states and revoking grants.
// Stubbed provider only - no real network, no real account, no live-Google proof.
const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={bizAppConnect,bizAppCallback,bizAppStatus,bizAppSync,bizAppDraftCreate,bizAppDisconnect,bizDataPurge,bizState,getJ,setJ,r,als,BIZ_APPS};';
const calls=[];let F=null;
const c={require:(m)=>require(m),module:{exports:{}},process:{env:{}},global:{},console,URL,URLSearchParams,Buffer,crypto:require('crypto'),AbortSignal,setTimeout,clearTimeout,
 fetch:async(u,o)=>{
  u=String(u);calls.push({u,method:(o&&o.method)||'GET',body:o&&o.body,auth:o&&o.headers&&o.headers.Authorization});
  const reply=(j,ok=true,st=200)=>Promise.resolve({ok,status:st,json:async()=>j});
  const E=c.process.env;
  if(u.startsWith('https://oauth2.googleapis.com/token')){
   const p=new URLSearchParams(o.body);
   assert.equal(p.get('client_id'),'cid123','token calls carry the configured client id');
   assert.equal(p.get('client_secret'),'sec456','token calls carry the configured client secret');
   if(E.__G_FAIL)return reply({error:E.__G_FAIL},false,400);
   if(p.get('grant_type')==='authorization_code'){assert.ok(p.get('code'),'exchange carries the code');assert.equal(p.get('redirect_uri'),'https://test.local/api/business/apps/gmail/callback','exchange carries the exact redirect');return reply({access_token:'ya29.first',refresh_token:'1//rt',expires_in:3600,token_type:'Bearer',scope:E.__G_SCOPE_NARROW?'https://www.googleapis.com/auth/gmail.readonly':'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose'});}
   if(p.get('grant_type')==='refresh_token'){if(E.__G_REFRESH_HOLD)await new Promise(res=>{E.__G_REFRESH_GO=res;});assert.equal(p.get('refresh_token'),'1//rt','refresh presents the stored credential');return reply({access_token:'ya29.refreshed',expires_in:3600,token_type:'Bearer',...(E.__G_REFRESH_NARROW?{scope:'https://www.googleapis.com/auth/gmail.readonly'}:{})});}
   throw new Error('unexpected grant');}
  if(u==='https://oauth2.googleapis.com/revoke'){
   assert.equal(o.method,'POST','revocation is a POST');
   assert.ok(!u.includes('token='),'the token never travels in a URL');
   const p=new URLSearchParams(o.body||'');assert.ok(p.get('token'),'revocation carries the token in the BODY (RFC 7009)');
   if(E.__PARK_SYNC){delete E.__PARK_SYNC;E.__PARKED=await F.bizAppSync('gmail');} // a parked sync wakes mid-disconnect
   if(E.__G_REVOKE_FAIL)return reply({error:'temporarily_unavailable'},false,503);
   return reply({},true,200);}
  assert.ok(!String(u).includes('1//rt')&&!String(u).includes('ya29.'),'no token ever appears in any URL');
  if(u==='https://gmail.googleapis.com/gmail/v1/users/me/profile'){
   if(E.__G_PROFILE_THROW)throw new Error('profile socket reset');
   if(E.__G_PROFILE_FAIL)return reply({error:{message:'profile boom'}},false,500);
   if(E.__RACE_APPGEN)await F.setJ('fm:biz:appgen:gmail','zzz-'+calls.length+'-'+Date.now()); // a disconnect/purge lands mid-callback
   assert.ok(/^Bearer ya29\./.test(calls[calls.length-1].auth),'profile call is authed');
   return reply({emailAddress:'royce@northbend.example',messagesTotal:42});}
  if(u.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/messages?')){
   if(E.__RACE_DISCONNECT)await F.bizAppDisconnect('gmail'); // a completed disconnect lands mid-sync
   return reply({messages:[{id:'m1',threadId:'t1'},{id:'m2',threadId:'t2'}],resultSizeEstimate:2});}
  if(u.includes('/messages/m1'))return reply({id:'m1',threadId:'t1',snippet:'Hi - can you send the estimate when',labelIds:['UNREAD','INBOX'],payload:{headers:[{name:'From',value:'Dana Customer <dana@example.com>'},{name:'Subject',value:'Estimate for the fence repair'},{name:'Date',value:'Fri, 23 Oct 2026 18:02:11 -0400'}]}});
  if(u.includes('/messages/m2'))return reply({id:'m2',threadId:'t2',snippet:'Following up on the quote you sent',labelIds:['INBOX'],payload:{headers:[{name:'From',value:'Sam Owner <sam@example.com>'},{name:'Subject',value:'Re: Deck estimate'},{name:'Date',value:'Thu, 22 Oct 2026 09:14:00 -0400'}]}});
  if(u==='https://gmail.googleapis.com/gmail/v1/users/me/drafts'&&o.method==='POST'){const d=JSON.parse(o.body);E.__DRAFT=d.message.raw;return reply({id:'draft_9',message:{id:'msg_9',labelIds:['DRAFT']}});}
  throw new Error('unexpected fetch: '+u);
 }};
require('vm').runInNewContext(src,c);const f=c.module.exports.t;F=f;

(async()=>{
 await f.als.run({ws:'wsapp', email:'royce@northbend.example', sid:'suite-session-1'},async()=>{
  const E=c.process.env;
  const cookieOf=cn=>{const sc=cn.setCookie;assert.ok(sc&&sc.includes('HttpOnly')&&sc.includes('Secure')&&sc.includes('SameSite=Lax'),'the session cookie is HttpOnly/Secure/Lax');return sc.split(';')[0];};
  const connect=async()=>{const cn=await f.bizAppConnect("gmail","https://test.local");assert.equal(cn.status,200);const nonce=new URL(cn.body.authorizationUrl).searchParams.get("state");return{nonce,cookie:cookieOf(cn),body:cn.body};};

  // 1. honest unconfigured state
  let st=await f.bizAppStatus('gmail');
  assert.equal(st.configured,false);assert.equal(st.connected,false);assert.equal(st.status,'not_connected');
  assert.equal(st.credentialStorage,'unavailable','no encryption secret is reported honestly');
  assert.ok((await f.bizAppConnect('gmail','https://test.local')).body.code==='app_not_configured');

  // 2. fail-closed storage: Google credentials alone are NOT enough (the shared enc() would
  // fall back to a publicly derivable 'dev' key - the connector refuses instead)
  E.BIZ_GOOGLE_CLIENT_ID='cid123';E.BIZ_GOOGLE_CLIENT_SECRET='sec456';
  const noKey=await f.bizAppConnect('gmail','https://test.local');
  assert.equal(noKey.status,503);assert.equal(noKey.body.code,'app_encryption_unavailable','no storage under a public fallback key');
  assert.equal((await f.r(['KEYS','fm:biz:appstate:*'])).length,0,'no state is written when storage is unsafe');

  // 3. configured + dedicated key: documented consent URL + session cookie
  E.BIZ_APP_ENC_KEY='suite-enc-key';
  const c1=await connect();
  const au=new URL(c1.body.authorizationUrl);
  assert.equal(au.origin+au.pathname,'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(au.searchParams.get('access_type'),'offline');assert.equal(au.searchParams.get('prompt'),'consent');
  const scopes=(au.searchParams.get('scope')||'').split(' ');
  assert.ok(scopes.includes('https://www.googleapis.com/auth/gmail.readonly')&&scopes.includes('https://www.googleapis.com/auth/gmail.compose'),'narrowest documented scopes');
  assert.ok(!scopes.some(x=>/gmail\.send$/.test(x)),'the send-only scope is never requested');
  const stateRaw=await f.r(['GET','fm:biz:appstate:'+c1.nonce]);
  assert.ok(stateRaw,'state stored');assert.ok(JSON.parse(stateRaw).vh,'state carries only the verifier HASH');

  // 4. session binding: no cookie / wrong-session cookie -> refused, state NOT consumed
  assert.equal((await f.bizAppCallback('gmail',{state:c1.nonce,code:'x'},'https://test.local')).body.code,'app_session_mismatch','a cookie-less callback cannot attach an account');
  const other=await connect();
  assert.equal((await f.bizAppCallback('gmail',{state:c1.nonce,code:'x'},'https://test.local',other.cookie)).body.code,'app_session_mismatch','a different session cannot complete this sign-in');
  assert.ok(await f.r(['GET','fm:biz:appstate:'+c1.nonce]),'a mismatched session never consumes the state');
  await f.als.run({ws:'wsapp', email:'dana@example.com', sid:'suite-session-1'},async()=>{
   const rp=await f.bizAppCallback('gmail',{state:c1.nonce,code:'x'},'https://test.local',c1.cookie);
   assert.equal(rp.body.code,'app_principal_mismatch','a shared browser cannot carry one account\'s flow into another account');
  });
  assert.ok(await f.r(['GET','fm:biz:appstate:'+c1.nonce]),'a mismatched principal never consumes the state');
  await f.als.run({ws:'wsapp', email:'royce@northbend.example', sid:'suite-session-2'},async()=>{
   const rs=await f.bizAppCallback('gmail',{state:c1.nonce,code:'x'},'https://test.local',c1.cookie);
   assert.equal(rs.body.code,'app_principal_mismatch','a re-login (new session) ends the binding, same account or not');
  });
  assert.equal((await f.bizAppCallback('gmail',{state:'bogus',code:'x'},'https://test.local',c1.cookie)).body.code,'app_state_invalid');
  assert.equal((await f.bizAppCallback('gmail',{error:'access_denied',state:c1.nonce},'https://test.local',c1.cookie)).body.code,'app_consent_declined');
  const cb=await f.bizAppCallback('gmail',{state:c1.nonce,code:'authcode1'},'https://test.local',c1.cookie);
  assert.equal(cb.status,200);assert.equal(cb.body.email,'royce@northbend.example');
  assert.equal((await f.bizAppCallback('gmail',{state:c1.nonce,code:'authcode1'},'https://test.local',c1.cookie)).body.code,'app_state_invalid','the state nonce is single-use');

  // 5. concurrent same-state callbacks: exactly ONE exchange, exactly ONE connect
  const c2=await connect();calls.length=0;
  const [r1,r2]=await Promise.all([
    f.bizAppCallback('gmail',{state:c2.nonce,code:'authcode1'},'https://test.local',c2.cookie),
    f.bizAppCallback('gmail',{state:c2.nonce,code:'authcode1'},'https://test.local',c2.cookie)]);
  assert.ok([r1.status,r2.status].sort().join(',')==='200,400','exactly one concurrent callback connects: '+r1.status+'/'+r2.status);
  assert.equal(calls.filter(x=>x.u.startsWith('https://oauth2.googleapis.com/token')).length,1,'exactly one token exchange');

  // 5b. two DISTINCT in-flight sign-ins: the connect lock admits exactly one
  const d1=await connect(), d2=await connect(); calls.length=0;
  const [dr1,dr2]=await Promise.all([
    f.bizAppCallback('gmail',{state:d1.nonce,code:'authcode1'},'https://test.local',d1.cookie),
    f.bizAppCallback('gmail',{state:d2.nonce,code:'authcode1'},'https://test.local',d2.cookie)]);
  assert.ok([dr1.status,dr2.status].sort().join(',')==='200,409','distinct concurrent sign-ins serialize: '+dr1.status+'/'+dr2.status);
  assert.equal((dr1.status===409?dr1:dr2).body.code,'app_connect_busy');
  assert.equal(calls.filter(x=>x.u.startsWith('https://oauth2.googleapis.com/token')).length,1,'exactly one exchange reaches Google');
  assert.ok(!calls.some(x=>x.u==='https://oauth2.googleapis.com/revoke'),'no grant is revoked while a winner persists');

  // 5c. a failure AFTER the record persisted never revokes it
  c.global.__bizAppThrowAfterPut=true;const d3=await connect();calls.length=0;
  await assert.rejects(()=>f.bizAppCallback('gmail',{state:d3.nonce,code:'authcode1'},'https://test.local',d3.cookie));
  assert.ok(!calls.some(x=>x.u==='https://oauth2.googleapis.com/revoke'),'post-commit failure revokes nothing');
  assert.equal((await f.getJ('fm:biz:app:gmail')||{}).status,'connected','the persisted connection survives');

  // 6. encryption at rest; status view is public-safe
  const rawRec=JSON.stringify(await f.getJ('fm:biz:app:gmail'));
  assert.ok(!rawRec.includes('1//rt')&&!rawRec.includes('ya29.first'),'no plaintext token at rest');
  st=await f.bizAppStatus('gmail');
  assert.equal(st.connected,true);assert.equal(st.credentialStorage,'ready');
  const stJson=JSON.stringify(st);
  assert.ok(!stJson.includes('ya29')&&!stJson.includes('1//')&&!stJson.includes('sec456'),'the status view never leaks tokens or secrets');
  assert.ok(/excerpt/.test(st.syncDisclosure),'the snippet disclosure is explicit about body-derived excerpts');

  // 7. sync: METADATA-only over the wire; the snippet-bearing snapshot is ENCRYPTED at rest
  const sy=await f.bizAppSync('gmail');
  assert.equal(sy.status,200);assert.equal(sy.body.count,2);
  assert.ok(calls.some(x=>x.u.includes('format=METADATA')&&x.u.includes('metadataHeaders=From')),'messages fetched as METADATA with named headers');
  assert.ok(!calls.some(x=>/format=(FULL|RAW)/.test(x.u)),'full/raw message content is never fetched');
  const mailRaw=JSON.stringify(await f.getJ('fm:biz:app:gmail:mail'));
  assert.ok(mailRaw.includes('"enc"'),'the stored snapshot is wrapped ciphertext');
  assert.ok(!mailRaw.includes('dana@example.com')&&!mailRaw.includes('can you send the estimate'),'body-derived snippets are not stored in plaintext');
  assert.equal((await f.bizState()).apps.gmail.mailCount,2,'state surfaces only the count');
  assert.ok(!JSON.stringify((await f.bizState()).apps).includes('dana@example.com'),'state never carries message content');

  // 8. a disconnect landing mid-sync: the late write loses, nothing resurrects
  E.__RACE_DISCONNECT='1';
  const syRace=await f.bizAppSync('gmail');
  assert.equal(syRace.status,409);assert.equal(syRace.body.code,'app_race_lost');
  delete E.__RACE_DISCONNECT;
  assert.equal(await f.getJ('fm:biz:app:gmail'),null,'the disconnected record is not resurrected');
  assert.equal(await f.getJ('fm:biz:app:gmail:mail'),null,'the mail snapshot is not resurrected');

  // 9. a purge/disconnect landing mid-callback: the new grant is revoked, not stored
  const c3=await connect();E.__RACE_APPGEN='1';calls.length=0;
  const cbRace=await f.bizAppCallback('gmail',{state:c3.nonce,code:'authcode1'},'https://test.local',c3.cookie);
  assert.equal(cbRace.status,409);assert.equal(cbRace.body.code,'app_race_lost');assert.equal(cbRace.body.grantStatus,'revoked','a fresh unshared grant is revoked and reported');
  delete E.__RACE_APPGEN;
  assert.ok(calls.some(x=>x.u==='https://oauth2.googleapis.com/revoke'),'the stranded grant is revoked');
  assert.equal(await f.getJ('fm:biz:app:gmail'),null,'nothing is stored after a lost race');

  // 10. partial grants are refused and revoked: narrower scope, then profile failure
  E.__G_SCOPE_NARROW='1';const c4=await connect();calls.length=0;
  const cbScope=await f.bizAppCallback('gmail',{state:c4.nonce,code:'authcode1'},'https://test.local',c4.cookie);
  assert.equal(cbScope.status,502);assert.equal(cbScope.body.code,'app_scope_missing');assert.equal(cbScope.body.grantStatus,'revoked');
  assert.ok(calls.some(x=>x.u==='https://oauth2.googleapis.com/revoke'),'the narrow grant is revoked');
  assert.equal(await f.getJ('fm:biz:app:gmail'),null,'a partial grant is never stored');
  delete E.__G_SCOPE_NARROW;
  E.__G_PROFILE_FAIL='1';const c5=await connect();calls.length=0;
  const cbProf=await f.bizAppCallback('gmail',{state:c5.nonce,code:'authcode1'},'https://test.local',c5.cookie);
  assert.equal(cbProf.status,502);assert.equal(cbProf.body.code,'app_profile_failed');assert.equal(cbProf.body.grantStatus,'revoked');
  delete E.__G_PROFILE_FAIL;
  assert.equal(await f.getJ('fm:biz:app:gmail'),null,'no profile, no connection');
  E.__G_PROFILE_THROW='1';const c5b=await connect();calls.length=0;
  await assert.rejects(()=>f.bizAppCallback('gmail',{state:c5b.nonce,code:'authcode1'},'https://test.local',c5b.cookie));
  delete E.__G_PROFILE_THROW;
  assert.ok(calls.some(x=>x.u==='https://oauth2.googleapis.com/revoke'),'a crashed callback still revokes the fresh, unshared grant');
  assert.equal(await f.getJ('fm:biz:app:gmail'),null,'a crashed callback stores nothing');

  // 11. drafts: strict validation (header injection is rejected, not sanitized)
  const c6=await connect();await f.bizAppCallback('gmail',{state:c6.nonce,code:'authcode1'},'https://test.local',c6.cookie);
  calls.length=0;
  assert.equal((await f.bizAppDraftCreate('gmail',{to:'dana@example.com\r\nBcc: covert@example.com',text:'hi'})).body.code,'app_input_invalid','CRLF in the recipient is rejected outright');
  assert.equal((await f.bizAppDraftCreate('gmail',{to:'dana@example.com',subject:'x\nCc: y@z.com',text:'hi'})).body.code,'app_input_invalid','CRLF in the subject is rejected outright');
  assert.equal((await f.bizAppDraftCreate('gmail',{to:'not-an-email',text:'hi'})).body.code,'app_input_invalid');
  assert.equal((await f.bizAppDraftCreate('gmail',{to:'dana@example.com',text:'hi',threadId:'t1\r\nBcc:x'})).body.code,'app_input_invalid','thread target is validated');
  assert.ok(!calls.some(x=>x.u.includes('/drafts')),'rejected input never reaches Google');
  assert.equal((await f.bizAppDraftCreate('gmail',{to:'dana@example.com',subject:'x'.repeat(301),text:'hi'})).body.code,'app_input_invalid','an over-length subject is rejected, never truncated');
  assert.equal((await f.bizAppDraftCreate('gmail',{to:'dana@example.com',text:'y'.repeat(20001)})).body.code,'app_input_invalid','an over-length text is rejected, never truncated');
  const dr=await f.bizAppDraftCreate('gmail',{to:'dana@example.com',subject:'Re: Estimate for the fence repair',text:'Hi Dana - attached is the estimate.',threadId:'t1'});
  assert.equal(dr.status,200);assert.deepEqual(dr.body.to,['dana@example.com'],'the exact recipient set is echoed for approval');
  assert.equal(dr.body.account,'royce@northbend.example','the approval view shows the linked account');
  const mime=Buffer.from(E.__DRAFT,'base64url').toString('utf8');
  assert.ok(mime.includes('To: dana@example.com')&&mime.includes('Subject: Re: Estimate for the fence repair'),'the draft carries the exact RFC 2822 content');
  assert.ok(!calls.some(x=>x.u.includes('/send')||x.u.includes(':send')),'no send endpoint is ever called');
  assert.ok(!fs.readFileSync('api/index.js','utf8').match(/messages\/send|drafts\/send|:send/),'the source contains no send path at all');
  const longOk='z'.repeat(20000);
  const drLong=await f.bizAppDraftCreate('gmail',{to:'dana@example.com',text:longOk});
  assert.equal(drLong.status,200);assert.ok(Buffer.from(E.__DRAFT,'base64url').toString('utf8').endsWith(longOk),'the draft carries the owner\'s exact bytes');

  // 11b. a callback losing its race over an EXISTING connection revokes nothing shared
  const c6b=await connect();E.__RACE_APPGEN='1';
  const recBefore=JSON.stringify(await f.getJ('fm:biz:app:gmail'));calls.length=0;
  const cbR2=await f.bizAppCallback('gmail',{state:c6b.nonce,code:'authcode1'},'https://test.local',c6b.cookie);
  delete E.__RACE_APPGEN;
  assert.equal(cbR2.status,409);assert.equal(cbR2.body.grantStatus,'not_revoked','a possibly-shared grant is discarded, never revoked');
  assert.ok(!calls.some(x=>x.u==='https://oauth2.googleapis.com/revoke'),'no revocation fires against the live connection');
  assert.equal(JSON.stringify(await f.getJ('fm:biz:app:gmail')),recBefore,'the live connection is untouched');

  // 12. refresh lifecycle, invalid_grant, key rotation
  const rec=await f.getJ('fm:biz:app:gmail');rec.accessTokenExpiresAt=Date.now()-1000;await f.setJ('fm:biz:app:gmail',rec);
  calls.length=0;
  assert.equal((await f.bizAppSync('gmail')).status,200);
  assert.ok(calls.some(x=>x.u.startsWith('https://oauth2.googleapis.com/token')),'a refresh happened');
  assert.ok(calls.some(x=>x.auth==='Bearer ya29.refreshed'),'the refreshed token is used');
  const recC=await f.getJ('fm:biz:app:gmail');recC.accessTokenExpiresAt=Date.now()-1000;await f.setJ('fm:biz:app:gmail',recC);
  calls.length=0;
  const [syA,syB]=await Promise.all([f.bizAppSync('gmail'),f.bizAppSync('gmail')]);
  assert.equal([syA.status,syB.status].sort().join(','),'200,409','concurrent refreshes serialize: one winner, one honest busy');
  assert.equal((syA.status===409?syA:syB).body.code,'app_refresh_busy');
  assert.equal(calls.filter(x=>x.u.startsWith('https://oauth2.googleapis.com/token')).length,1,'exactly one refresh reaches Google');
  assert.ok(!calls.some(x=>x.u==='https://oauth2.googleapis.com/revoke'),'a refresh loser never revokes the shared grant');
  E.__G_REFRESH_NARROW='1';
  const recN=await f.getJ('fm:biz:app:gmail');recN.accessTokenExpiresAt=Date.now()-1000;await f.setJ('fm:biz:app:gmail',recN);
  const syN=await f.bizAppSync('gmail');
  assert.equal(syN.status,409);assert.equal(syN.body.code,'app_needs_reconnect','a narrowed refresh grant means reconnect, honestly');
  delete E.__G_REFRESH_NARROW;
  const cN=await connect();await f.bizAppCallback('gmail',{state:cN.nonce,code:'authcode1'},'https://test.local',cN.cookie);
  E.__G_FAIL='invalid_grant';
  const rec2=await f.getJ('fm:biz:app:gmail');rec2.accessTokenExpiresAt=Date.now()-1000;await f.setJ('fm:biz:app:gmail',rec2);
  const sy3=await f.bizAppSync('gmail');
  assert.equal(sy3.status,409);assert.equal(sy3.body.code,'app_needs_reconnect');
  assert.equal((await f.bizAppStatus('gmail')).status,'needs_reconnect');
  delete E.__G_FAIL;
  E.BIZ_APP_ENC_KEY='rotated-key';
  const c7=await connect();await f.bizAppCallback('gmail',{state:c7.nonce,code:'authcode1'},'https://test.local',c7.cookie);
  E.BIZ_APP_ENC_KEY='suite-enc-key'; // the record was written under rotated-key; reading under suite-enc-key now fails
  const sy4=await f.bizAppSync('gmail');
  assert.equal(sy4.status,409);assert.equal(sy4.body.code,'app_needs_reconnect','an unreadable credential means reconnect, honestly');
  E.BIZ_APP_ENC_KEY='rotated-key'; // restore the matching key

  // 13. disconnect: body-form revocation BEFORE local delete, epoch bump, honest grant status
  const genBefore=(await f.r(['GET','fm:biz:appgen:gmail']))||'0';calls.length=0;
  const dc=await f.bizAppDisconnect('gmail');
  assert.equal(dc.status,200);assert.equal(dc.body.grantStatus,'revoked');
  assert.ok(calls.some(x=>x.u==='https://oauth2.googleapis.com/revoke'&&new URLSearchParams(x.body).get('token')==='1//rt'),'revocation presents the refresh token in the body');
  assert.notEqual((await f.r(['GET','fm:biz:appgen:gmail']))||'0',genBefore,'disconnect bumps the connector epoch');
  assert.equal(await f.getJ('fm:biz:app:gmail'),null);assert.equal(await f.getJ('fm:biz:app:gmail:mail'),null);
  const c8=await connect();await f.bizAppCallback('gmail',{state:c8.nonce,code:'authcode1'},'https://test.local',c8.cookie);
  E.__G_REVOKE_FAIL='1';
  const dc2=await f.bizAppDisconnect('gmail');
  assert.equal(dc2.status,200);assert.equal(dc2.body.grantStatus,'revoke_unconfirmed','an unconfirmed revocation says so');
  assert.ok(/Google account/.test(dc2.body.note),'the note points at the Google account permissions page');
  delete E.__G_REVOKE_FAIL;
  assert.equal(await f.getJ('fm:biz:app:gmail'),null,'local removal does not wait on the provider');
  assert.equal((await f.bizAppStatus('gmail')).grantStatus,'revoke_unconfirmed','the unconfirmed grant stays visible in status');
  assert.ok(!JSON.stringify(await f.getJ('fm:biz:apptomb:gmail')).includes('1//rt'),'the tombstone keeps the token encrypted');

  // 13a2. an ordinary disconnect retries an older unresolved tombstone (no live record)
  {
   const before=calls.filter(x=>x.u==='https://oauth2.googleapis.com/revoke').length;
   const drt=await f.bizAppDisconnect('gmail');
   assert.equal(drt.status,200);assert.equal(drt.body.priorGrant,'revoked','the older unconfirmed grant is retried and confirmed');
   assert.ok(calls.filter(x=>x.u==='https://oauth2.googleapis.com/revoke').length>before,'the retry reached Google');
   assert.notEqual((await f.bizAppStatus('gmail')).grantStatus,'revoke_unconfirmed','the resolved retry clears the status flag');
  }
  // 13a3. the retry never touches a live (possibly shared) reconnection
  {
   E.__G_REVOKE_FAIL='1';const x1=await connect();await f.bizAppCallback('gmail',{state:x1.nonce,code:'authcode1'},'https://test.local',x1.cookie);
   await f.bizAppDisconnect('gmail');delete E.__G_REVOKE_FAIL; // unresolved tomb, token held
   const x2=await connect();await f.bizAppCallback('gmail',{state:x2.nonce,code:'authcode1'},'https://test.local',x2.cookie); // live connection
   calls.length=0;
   const dx=await f.bizAppDisconnect('gmail'); // kills the live record, revokes its grant, then retries the old tomb under the connect lock
   assert.equal(dx.body.grantStatus,'revoked');
   assert.equal(dx.body.priorGrant,'revoked','with no live connection at cleanup time, the older grant is safely retried');
   assert.equal(calls.filter(x=>x.u==='https://oauth2.googleapis.com/revoke').length,2,'both the live grant and the old tomb grant were revoked');
   // a NEW sign-in cannot complete while the retry holds the connect lock: covered by 5b\'s
   // app_connect_busy serialization - no delayed cleanup can meet a live shared grant.
  }
  // 13b. a parked sync completing mid-disconnect: local state is gone BEFORE the network
  const cE=await connect();await f.bizAppCallback('gmail',{state:cE.nonce,code:'authcode1'},'https://test.local',cE.cookie);
  await f.bizAppSync('gmail');
  E.__PARK_SYNC='1';
  const dcE=await f.bizAppDisconnect('gmail');
  assert.equal(dcE.status,200,'the disconnect completes regardless of the parked sync');
  assert.equal(dcE.body.grantStatus,'revoked');
  assert.ok(E.__PARKED&&E.__PARKED.status===409,'the parked sync lost ('+(E.__PARKED&&E.__PARKED.status)+')');
  assert.equal(await f.getJ('fm:biz:app:gmail'),null,'no live-looking record survives a completed revocation');
  assert.equal(await f.getJ('fm:biz:app:gmail:mail'),null,'no snapshot survives either');
  delete E.__PARKED;

  // 13c. a disconnect with NO connection still cancels pending sign-ins and bumps the epoch
  const cz=await connect();
  const dcz=await f.bizAppDisconnect('gmail');
  assert.equal(dcz.status,200);assert.equal(dcz.body.grantStatus,'not_connected');assert.equal(dcz.body.pendingCancelled,true);
  assert.equal((await f.r(['KEYS','fm:biz:appstate:*'])).length,0,'pending sign-ins are cancelled');
  assert.equal((await f.bizAppCallback('gmail',{state:cz.nonce,code:'authcode1'},'https://test.local',cz.cookie)).body.code,'app_state_invalid','a cancelled sign-in can never complete');

  // 14. purge: revokes grants, kills pending states and the epoch, counts honestly
  const c9=await connect(); // a pending state that is never completed
  const c10=await connect();await f.bizAppCallback('gmail',{state:c10.nonce,code:'authcode1'},'https://test.local',c10.cookie);
  await f.bizAppSync('gmail');calls.length=0;
  const pg=await f.bizDataPurge({confirm:'DELETE'});
  assert.equal(pg.status,200);assert.ok(pg.body.counts.connections>=1,'purge counts the connection family');
  assert.ok(pg.body.counts.grantsRevoked>=1,'purge revokes the stored grant (and retries any unresolved tombstone)');
  assert.equal((await f.r(['KEYS','fm:biz:apptomb:*'])).length,0,'tombstones die with the purge');
  assert.ok(calls.some(x=>x.u==='https://oauth2.googleapis.com/revoke'),'purge performs the revocation');
  assert.equal((await f.r(['KEYS','fm:biz:appstate:*'])).length,0,'pending OAuth states die with the purge');
  assert.equal((await f.r(['KEYS','fm:biz:appgen:*'])).length,0,'the connector epoch dies with the purge');
  assert.equal((await f.bizAppCallback('gmail',{state:c9.nonce,code:'authcode1'},'https://test.local',c9.cookie)).body.code,'app_state_invalid','a pre-purge state can never connect');

  // 15. source invariants + state surface
  assert.ok(fs.readFileSync('api/index.js','utf8').match(/BIZ_STATE_SET = .*'PX'/s),'OAuth states carry a real store TTL');
  assert.ok(!fs.readFileSync('api/index.js','utf8').match(/revokeEndpoint \+ '/),'revocation never uses the URL form');
  assert.ok((await f.bizState()).apps.gmail.configured===true,'state surfaces configuration honestly');
  assert.ok(!calls.some(x=>/groq|openai|anthropic|api\.x\.ai/.test(x.u)),'the connector never touches any AI engine');
 });
 console.log('biz-apps-regression: all assertions passed');
})().catch(e=>{console.error(e);process.exit(1);});
