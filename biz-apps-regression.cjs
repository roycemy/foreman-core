// Business app connections (Gmail connector): OAuth client lifecycle against a stubbed
// Google surface. Covers: honest unconfigured state, consent URL shape (documented params),
// single-use state, token exchange + encrypted-at-rest storage, status never leaking tokens,
// bounded metadata-only sync (no bodies, no FULL/RAW), refresh + invalid_grant ->
// needs_reconnect, DRAFTS-only creation (no send path anywhere), documented revocation on
// disconnect, purge coverage. No real network, no real account.
const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={bizAppConnect,bizAppCallback,bizAppStatus,bizAppSync,bizAppDraftCreate,bizAppDisconnect,bizDataPurge,bizState,getJ,setJ,r,als,BIZ_APPS};';
const calls=[];
const c={require:(m)=>require(m),module:{exports:{}},process:{env:{}},global:{},console,URL,URLSearchParams,Buffer,crypto:require('crypto'),AbortSignal,setTimeout,clearTimeout,
 fetch:(u,o)=>{
  u=String(u);calls.push({u,method:(o&&o.method)||'GET',body:o&&o.body,auth:o&&o.headers&&o.headers.Authorization});
  const reply=(j,ok=true,st=200)=>Promise.resolve({ok,status:st,json:async()=>j});
  if(u.startsWith('https://oauth2.googleapis.com/token')){
   const p=new URLSearchParams(o.body);
   assert.equal(p.get('client_id'),'cid123','token calls carry the configured client id');
   assert.equal(p.get('client_secret'),'sec456','token calls carry the configured client secret');
   if(c.process.env.__G_FAIL)return reply({error:c.process.env.__G_FAIL},false,400);
   if(p.get('grant_type')==='authorization_code'){assert.ok(p.get('code'),'exchange carries the code');assert.equal(p.get('redirect_uri'),'https://test.local/api/business/apps/gmail/callback','exchange carries the exact redirect');return reply({access_token:'ya29.first',refresh_token:'1//rt',expires_in:3600,token_type:'Bearer',scope:'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose'});}
   if(p.get('grant_type')==='refresh_token'){assert.equal(p.get('refresh_token'),'1//rt','refresh presents the stored credential');return reply({access_token:'ya29.refreshed',expires_in:3600,token_type:'Bearer'});}
   throw new Error('unexpected grant');}
  if(u.startsWith('https://oauth2.googleapis.com/revoke'))return reply({},true,200);
  if(u==='https://gmail.googleapis.com/gmail/v1/users/me/profile'){assert.ok(/^Bearer ya29\./.test(calls[calls.length-1].auth),'profile call is authed');return reply({emailAddress:'royce@northbend.example',messagesTotal:42});}
  if(u.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/messages?'))return reply({messages:[{id:'m1',threadId:'t1'},{id:'m2',threadId:'t2'}],resultSizeEstimate:2});
  if(u.includes('/messages/m1'))return reply({id:'m1',threadId:'t1',snippet:'Hi - can you send the estimate when',labelIds:['UNREAD','INBOX'],payload:{headers:[{name:'From',value:'Dana Customer <dana@example.com>'},{name:'Subject',value:'Estimate for the fence repair'},{name:'Date',value:'Fri, 23 Oct 2026 18:02:11 -0400'}]}});
  if(u.includes('/messages/m2'))return reply({id:'m2',threadId:'t2',snippet:'Following up on the quote you sent',labelIds:['INBOX'],payload:{headers:[{name:'From',value:'Sam Owner <sam@example.com>'},{name:'Subject',value:'Re: Deck estimate'},{name:'Date',value:'Thu, 22 Oct 2026 09:14:00 -0400'}]}});
  if(u==='https://gmail.googleapis.com/gmail/v1/users/me/drafts'&&o.method==='POST'){const d=JSON.parse(o.body);c.process.env.__DRAFT=d.message.raw;return reply({id:'draft_9',message:{id:'msg_9',labelIds:['DRAFT']}});}
  throw new Error('unexpected fetch: '+u);
 }};
require('vm').runInNewContext(src,c);const f=c.module.exports.t;

(async()=>{
 await f.als.run({ws:'wsapp'},async()=>{
  // honest unconfigured state
  let st=await f.bizAppStatus('gmail');
  assert.equal(st.configured,false,'unconfigured is reported, not hidden');
  assert.equal(st.connected,false);assert.equal(st.status,'not_connected');
  const c0=await f.bizAppConnect('gmail','https://test.local');
  assert.equal(c0.status,503);assert.equal(c0.body.code,'app_not_configured','unconfigured connect refuses honestly');

  // configured: consent URL carries the documented parameters
  c.process.env.BIZ_GOOGLE_CLIENT_ID='cid123';c.process.env.BIZ_GOOGLE_CLIENT_SECRET='sec456';
  st=await f.bizAppStatus('gmail');assert.equal(st.configured,true);
  const c1=await f.bizAppConnect('gmail','https://test.local');
  assert.equal(c1.status,200);
  const au=new URL(c1.body.authorizationUrl);
  assert.equal(au.origin+au.pathname,'https://accounts.google.com/o/oauth2/v2/auth','documented authorization endpoint');
  assert.equal(au.searchParams.get('client_id'),'cid123');
  assert.equal(au.searchParams.get('redirect_uri'),'https://test.local/api/business/apps/gmail/callback');
  assert.equal(au.searchParams.get('response_type'),'code');
  assert.equal(au.searchParams.get('access_type'),'offline','offline access requested (documented refresh-token condition)');
  assert.equal(au.searchParams.get('prompt'),'consent','consent forced so a refresh token is (re)issued');
  const scopes=(au.searchParams.get('scope')||'').split(' ');
  assert.ok(scopes.includes('https://www.googleapis.com/auth/gmail.readonly')&&scopes.includes('https://www.googleapis.com/auth/gmail.compose'),'narrowest documented scopes');
  assert.ok(!scopes.some(x=>/gmail\.send$/.test(x)),'the send-only scope is never requested');
  const nonce=au.searchParams.get('state');assert.ok(nonce&&nonce.length>=16,'CSRF state issued');

  // state validation: bad state, declined consent, then the real exchange
  assert.equal((await f.bizAppCallback('gmail',{state:'bogus',code:'x'},'https://test.local')).body.code,'app_state_invalid');
  assert.equal((await f.bizAppCallback('gmail',{error:'access_denied',state:nonce},'https://test.local')).body.code,'app_consent_declined');
  const cb=await f.bizAppCallback('gmail',{state:nonce,code:'authcode1'},'https://test.local');
  assert.equal(cb.status,200);assert.equal(cb.body.email,'royce@northbend.example');
  assert.equal((await f.bizAppCallback('gmail',{state:nonce,code:'authcode1'},'https://test.local')).body.code,'app_state_invalid','the state nonce is single-use');

  // tokens at rest are encrypted; the public status never carries them
  const rawRec=JSON.stringify(await f.getJ('fm:biz:app:gmail'));
  assert.ok(!rawRec.includes('1//rt')&&!rawRec.includes('ya29.first'),'no plaintext token at rest');
  st=await f.bizAppStatus('gmail');
  assert.equal(st.connected,true);assert.equal(st.email,'royce@northbend.example');
  const stJson=JSON.stringify(st);
  assert.ok(!stJson.includes('ya29')&&!stJson.includes('1//')&&!stJson.includes('sec456'),'the status view never leaks tokens or secrets');

  // sync: bounded, METADATA-only (no bodies), stored, timestamped
  const sy=await f.bizAppSync('gmail');
  assert.equal(sy.status,200);assert.equal(sy.body.count,2);
  assert.equal(sy.body.messages[0].subject,'Estimate for the fence repair');
  assert.equal(sy.body.messages[0].unread,true);assert.equal(sy.body.messages[1].unread,false);
  assert.ok(!('body' in sy.body.messages[0])&&!('text' in sy.body.messages[0]),'no message bodies are pulled');
  assert.ok(calls.some(x=>x.u.includes('format=METADATA')&&x.u.includes('metadataHeaders=From')),'messages fetched as METADATA with named headers');
  assert.ok(!calls.some(x=>/format=(FULL|RAW)/.test(x.u)),'full/raw message content is never fetched');
  const mailStored=await f.getJ('fm:biz:app:gmail:mail');assert.equal(mailStored.length,2,'bounded metadata is stored');
  assert.ok((await f.bizAppStatus('gmail')).lastSyncAt,'sync timestamp recorded');

  // drafts only: created via POST /drafts; nothing ever calls a send endpoint
  const dr=await f.bizAppDraftCreate('gmail',{to:'dana@example.com',subject:'Re: Estimate for the fence repair',text:'Hi Dana - attached is the estimate.',threadId:'t1'});
  assert.equal(dr.status,200);assert.equal(dr.body.draftId,'draft_9');
  const mime=Buffer.from(c.process.env.__DRAFT,'base64url').toString('utf8');
  assert.ok(mime.includes('To: dana@example.com')&&mime.includes('Subject: Re: Estimate for the fence repair')&&mime.includes('attached is the estimate'),'the draft carries the exact RFC 2822 content');
  assert.ok(!calls.some(x=>x.u.includes('/send')||x.u.includes(':send')),'no send endpoint is ever called');
  assert.ok(!fs.readFileSync('api/index.js','utf8').match(/messages\/send|drafts\/send|:send/),'the source contains no send path at all');
  assert.equal((await f.bizAppDraftCreate('gmail',{to:'',text:'x'})).status,400,'a draft needs a recipient');

  // refresh lifecycle: expired access token -> refresh grant -> new access token
  const rec=await f.getJ('fm:biz:app:gmail');rec.accessTokenExpiresAt=Date.now()-1000;await f.setJ('fm:biz:app:gmail',rec);
  calls.length=0;
  const sy2=await f.bizAppSync('gmail');assert.equal(sy2.status,200);
  assert.ok(calls.some(x=>x.u.startsWith('https://oauth2.googleapis.com/token')),'a refresh happened');
  assert.ok(calls.some(x=>x.auth==='Bearer ya29.refreshed'),'the refreshed token is used');

  // revoked/expired refresh token (invalid_grant) -> needs_reconnect, honest, no loop
  c.process.env.__G_FAIL='invalid_grant';
  const rec2=await f.getJ('fm:biz:app:gmail');rec2.accessTokenExpiresAt=Date.now()-1000;await f.setJ('fm:biz:app:gmail',rec2);
  const sy3=await f.bizAppSync('gmail');
  assert.equal(sy3.status,409);assert.equal(sy3.body.code,'app_needs_reconnect');
  assert.equal((await f.bizAppStatus('gmail')).status,'needs_reconnect');
  delete c.process.env.__G_FAIL;

  // disconnect: documented revocation with the refresh token, local records gone
  const dc=await f.bizAppDisconnect('gmail');assert.equal(dc.status,200);
  assert.ok(calls.some(x=>x.u.startsWith('https://oauth2.googleapis.com/revoke?token=1%2F%2Frt')||x.u.includes('revoke?token=1//rt')),'revocation presents the refresh token');
  assert.equal(await f.getJ('fm:biz:app:gmail'),null);assert.equal(await f.getJ('fm:biz:app:gmail:mail'),null);
  assert.equal((await f.bizAppStatus('gmail')).connected,false);

  // purge covers the connection family: reconnect, then DELETE
  const c2=await f.bizAppConnect('gmail','https://test.local');
  const n2=new URL(c2.body.authorizationUrl).searchParams.get('state');
  await f.bizAppCallback('gmail',{state:n2,code:'authcode2'},'https://test.local');
  await f.bizAppSync('gmail');
  const pg=await f.bizDataPurge({confirm:'DELETE'});
  assert.equal(pg.status,200);assert.ok(pg.body.counts.connections>=1,'purge counts the connection family');
  assert.equal(await f.getJ('fm:biz:app:gmail'),null);assert.equal(await f.getJ('fm:biz:app:gmail:mail'),null);
  assert.equal((await f.bizAppStatus('gmail')).connected,false,'purge severs the connection');

  // state surface: apps ride the existing business state, public-safe
  assert.ok((await f.bizState()).apps.gmail.configured===true,'state surfaces configuration honestly');
  assert.ok(!JSON.stringify((await f.bizState()).apps).includes('ya29'),'state never leaks tokens');

  // the connector never touched the engine: no engine-host call in the whole suite
  assert.ok(!calls.some(x=>/groq|openai|anthropic/.test(x.u)),'the connector never touches the AI engine');
 });
 console.log('biz-apps-regression: all assertions passed');
})().catch(e=>{console.error(e);process.exit(1);});
