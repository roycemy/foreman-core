// Muse gateway path end to end through the real api/index.js handler (memory store, no network),
// plus AT3: revoke halts only that bot's retry queue, rejects its pending broker approvals, leaves others untouched.
const fs=require('fs'),os=require('os'),path=require('path'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const src=fs.readFileSync(__dirname+'/api/index.js','utf8')+'\nmodule.exports.t={r,setJ,getJ,als,newTask,brokerRequest,botLink};';
const logs=[];const quiet={...console,log:(...a)=>logs.push(a.join(' ')),error:(...a)=>logs.push(a.join(' ')),warn:(...a)=>logs.push(a.join(' '))};
const ctx={require,module:{exports:{}},process:{env:{}},global:{},console:quiet,fetch:()=>{throw Error('NO NETWORK')},setTimeout,clearTimeout,URL,URLSearchParams,Buffer,AbortSignal};vm.runInNewContext(src,ctx);const h=ctx.module.exports,f=h.t;
const ORIGIN='https://foreman-core.vercel.app';
async function call(url,method='GET',body={},headers={}){let out={};await h({url,method,body,headers:{host:'foreman-core.vercel.app',...headers}},{setHeader(k,v){(this.h||(this.h={}))[k]=v},status(n){this.code=n;return this},json(j){out={code:this.code||200,j,h:this.h}},send(x){out={code:this.code,j:x}},end(){}});return out}
const sh=s=>crypto.createHash('sha256').update(s).digest('hex'),fresh=()=>'test_'+crypto.randomBytes(16).toString('hex');
(async()=>{const session='fixture-session-botlink';await f.setJ('gl:sess:'+sh(session),{uid:'u1',email:'owner@example.test',ws:'wsA'});await f.setJ('gl:user:'+sh('owner@example.test'),{id:'u1',email:'owner@example.test',ws:'wsA'});
 const C={cookie:'fm_sess='+session};
 assert.equal((await call('/api/botlink/types','GET',{},{})).code,401,'owner routes need a session');
 const types=(await call('/api/botlink/types','GET',{},C)).j.types;assert.deepEqual(types.map(t=>t.id).sort(),['grok','instinct','muse']);
 const csrf=(await call('/api/botlink/csrf','GET',{},C)).j.csrf;
 assert.equal((await call('/api/botlink/pairings','POST',{type:'muse'},C)).code,403,'CSRF required');
 assert.equal((await call('/api/botlink/pairings','POST',{type:'muse'},{...C,'x-alter-csrf':csrf,origin:'https://evil.example'})).code,403,'foreign origin refused');
 const W={...C,'x-alter-csrf':csrf,origin:ORIGIN};
 async function link(type){const p=(await call('/api/botlink/pairings','POST',{type},W)).j;const pid=p.pairingId,secret=fresh();
  assert.equal((await call('/api/pair/'+pid,'POST',{nonce:fresh(),callerSecret:secret},{'user-agent':'fixture-muse/1.0','x-vercel-ip-country':'US'})).code,202);
  assert.equal((await call('/api/pair/'+pid,'GET',{},{authorization:'Pairing '+secret})).code,202,'poll before approval waits');
  const v=(await call('/api/botlink/pairings/'+pid,'GET',{},C)).j;assert.equal(v.account,'owner@example.test');assert.equal(v.fingerprint.userAgent,'fixture-muse/1.0');
  assert.equal((await call('/api/botlink/pairings/'+pid+'/approve','POST',{},C)).code,403,'approve needs CSRF');
  assert.equal((await call('/api/botlink/pairings/'+pid+'/approve','POST',{},W)).code,200);
  const k=await call('/api/pair/'+pid,'GET',{},{authorization:'Pairing '+secret});assert.equal(k.code,200);assert.equal(k.h['Cache-Control'],'no-store');
  assert.equal((await call('/api/pair/'+pid,'GET',{},{authorization:'Pairing '+secret})).code,410);
  const e=await call('/api/link/call','POST',{op:'echo',text:'ping'},{authorization:'Bearer '+k.j.key});assert.equal(e.code,200);assert.equal(e.j.result.echo,'ping');
  return {botId:k.j.botId,key:e.j.nextKey};}
 const muse=await link('muse'),grok=await link('grok');
 let bots=(await call('/api/botlink/bots','GET',{},C)).j.bots;const mb=bots.find(b=>b.botId===muse.botId);assert.equal(mb.label,'Connected');assert.equal(mb.tiers.find(t=>t.tier==='Live').state,'unavailable');
 assert.equal((await call('/api/link/call','POST',{op:'echo'},{authorization:'Bearer test_not_a_key'})).code,401);
 assert.equal((await call('/api/pair/pr_doesnotexist0000000000','POST',{nonce:fresh(),callerSecret:fresh()})).code,404,'unknown pairing ID gets nothing');
 // AT3: pending broker approvals for both bots, then revoke Muse only
 const rec=async id=>JSON.parse(await f.r(['GET','bl:bot:'+id]));const mA=(await rec(muse.botId)).agentId,gA=(await rec(grok.botId)).agentId;assert(mA&&gA);
 const qs=await f.als.run({ws:'wsA'},async()=>{const out=[];for(const id of [mA,gA]){const a=await f.getJ('fm:agent:'+id),t=await f.newTask({title:'Fixture',assignee:id});t.status='running';await f.setJ('fm:task:'+t.id,t);out.push((await f.brokerRequest(a,{taskId:t.id,sourceId:'s',route:'fixture.echo',input:'x',maxCents:0})).body.request.id);}return out;});
 const {Bridge}=require('./worker/live-bridge/bridge.cjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bl-')),hx=s=>'agent_'+sh(s).slice(0,10);
 const br=new Bridge({bots:[{id:hx(mA),url:'https://alter.example',gatewayKey:'test_gw_a',intakeToken:'test_in_a'},{id:hx(gA),url:'https://alter.example',gatewayKey:'test_gw_b',intakeToken:'test_in_b'}],stateFile:path.join(dir,'s.json'),fetchImpl:async()=>({ok:false,status:503}),now:()=>Date.now()});
 for(const [id,tok] of [[hx(mA),'test_in_a'],[hx(gA),'test_in_b']])assert.equal(br.intake(id,tok,{phase:'start',event_id:'e1',session_id:'s1',at:Date.now()}).status,202);
 f.botLink.onRevoke=(orig=>async b=>{await orig(b);if(b.agentId===mA)br.halt(hx(mA),'revoked');})(f.botLink.onRevoke);
 const rv=await call('/api/botlink/bots/'+muse.botId+'/revoke','POST',{},W);assert.equal(rv.code,200);assert(/cannot stop calls the bot makes outside Alter/.test(rv.j.copy));
 const [q1,q2]=await f.als.run({ws:'wsA'},async()=>[await f.getJ('fm:broker:q:'+qs[0]),await f.getJ('fm:broker:q:'+qs[1])]);
 assert.equal(q1.status,'blocked');assert.equal(q1.reason,'bot_revoked');assert.equal(q2.status,'pending','other bot approvals untouched');
 const bs=br.status();assert.equal(bs.find(x=>x.id===hx(mA)).halted,true);assert.equal(bs.find(x=>x.id===hx(mA)).queued,0);assert.equal(bs.find(x=>x.id===hx(gA)).halted,false);assert.equal(bs.find(x=>x.id===hx(gA)).queued,1);
 assert.equal((await call('/api/link/call','POST',{op:'echo'},{authorization:'Bearer '+muse.key})).code,401,'revoked Muse key dead');
 assert.equal((await call('/api/link/call','POST',{op:'echo'},{authorization:'Bearer '+grok.key})).code,200,'Grok still works');
 bots=(await call('/api/botlink/bots','GET',{},C)).j.bots;assert.equal(bots.find(b=>b.botId===muse.botId).label,'Needs re-paste');assert.equal(bots.find(b=>b.botId===grok.botId).label,'Connected');
 // UI states the limit plainly
 assert(fs.readFileSync(__dirname+'/public/connect.html','utf8').includes('It cannot stop calls the bot makes outside Alter'));
 // secrets never logged, never stored in plaintext
 const all=logs.join('\n');assert(!/alk_|test_gw|Pairing test_/.test(all));
 fs.rmSync(dir,{recursive:true});
 console.log('PASS Muse HTTP gateway e2e (pair, owner approve w/ CSRF, poll collect-once, echo -> Connected, no Live) + AT3 revoke isolation (broker pending blocked, bridge queue halted, other bot untouched, honest copy). No network/spend.');
})().catch(e=>{console.error(e);process.exit(1)});
