// Bot link end to end through the real api/index.js handler (memory store, no network):
// pair over HTTP, owner approve with CSRF + exact Origin, collect once, echo -> Connected, a real act through
// gatewayAct policy -> Governed, honest transport (link key refused on /api/mcp and /api/gateway), owner cancel,
// and AT3: revoke isolates one bot (pending broker blocked) and a SEPARATE bridge process halts through the real
// HTTP contract, not a hand-wired hook.
const fs=require('fs'),os=require('os'),path=require('path'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const src=fs.readFileSync(__dirname+'/api/index.js','utf8')+'\nmodule.exports.t={r,setJ,getJ,als,newTask,brokerRequest,botLink,createAgent};';
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
 assert.equal((await call('/api/botlink/pairings','POST',{type:'muse'},{...C,'x-alter-csrf':csrf})).code,403,'missing Origin refused');
 assert.equal((await call('/api/botlink/pairings','POST',{type:'muse'},{...C,'x-alter-csrf':csrf+'x',origin:ORIGIN})).code,403,'wrong CSRF refused');
 const W={...C,'x-alter-csrf':csrf,origin:ORIGIN};
 // Two existing gateway workers (they hold ordinary gateway keys used by a separate bridge process).
 const [gw1,gw2]=await f.als.run({ws:'wsA'},async()=>[await f.createAgent('Existing one','Ops','custom',false,{preset:'balanced'}),await f.createAgent('Existing two','Ops','custom',false,{preset:'balanced'})]);
 assert((await call('/api/botlink/linkable','GET',{},C)).j.agents.some(a=>a.id===gw1.agent.id),'existing worker can be linked');
 assert.equal((await call('/api/botlink/pairings','POST',{type:'muse',agentId:'agent_notmine00'},W)).code,409,'cannot link an agent outside this workspace');
 async function link(type,agentId){const p=(await call('/api/botlink/pairings','POST',agentId?{type,agentId}:{type},W)).j;const pid=p.pairingId,secret=fresh();
  assert(p.message.includes(p.link)&&!/alk_|test_/.test(p.message),'one secret-free message');
  const st=await call('/api/pair/'+pid,'GET',{},{});assert.equal(st.code,200,'JSON steps are really returned');assert.deepEqual(st.j.steps.map(s=>s.step),['hello','wait_for_owner','echo','keep_going']);assert(!/alk_|test_/.test(JSON.stringify(st.j)));
  assert.equal((await call('/api/pair/'+pid,'POST',{nonce:fresh(),callerSecret:secret},{'user-agent':'fixture-'+type+'/1.0','x-vercel-ip-country':'US'})).code,202);
  assert.equal((await call('/api/pair/'+pid,'GET',{},{authorization:'Pairing '+secret})).code,202,'poll before approval waits');
  const v=(await call('/api/botlink/pairings/'+pid,'GET',{},C)).j;assert.equal(v.account,'owner@example.test');assert.equal(v.fingerprint.userAgent,'fixture-'+type+'/1.0');
  assert.equal((await call('/api/botlink/pairings/'+pid+'/approve','POST',{},C)).code,403,'approve needs CSRF');
  assert.equal((await call('/api/botlink/pairings/'+pid+'/approve','POST',{},W)).code,200);
  const k=await call('/api/pair/'+pid,'GET',{},{authorization:'Pairing '+secret});assert.equal(k.code,200);assert.equal(k.h['Cache-Control'],'no-store');
  assert.equal((await call('/api/pair/'+pid,'GET',{},{authorization:'Pairing '+secret})).code,410);
  const e=await call('/api/link/call','POST',{op:'echo',text:'ping',requestId:fresh()},{authorization:'Bearer '+k.j.key});assert.equal(e.code,200);assert.equal(e.j.result.echo,'ping');
  return {botId:k.j.botId,key:e.j.nextKey,firstKey:k.j.key};}
 const muse=await link('muse',gw1.agent.id),grok=await link('grok');
 assert(!(await call('/api/botlink/linkable','GET',{},C)).j.agents.some(a=>a.id===gw1.agent.id),'one link per agent');
 const rec=async id=>JSON.parse(await f.r(['GET','bl:bot:'+id]));const mA=(await rec(muse.botId)).agentId,gA=(await rec(grok.botId)).agentId;assert.equal(mA,gw1.agent.id,'reuses the existing agent ID');assert(gA&&gA!==mA);
 assert.equal(await f.als.run({ws:'wsA'},()=>f.r(['GET','fm:gatewayKeyHash:'+gA])),null,'a new linked agent gets no hidden gateway key');
 let bots=(await call('/api/botlink/bots','GET',{},C)).j.bots;const mb=bots.find(b=>b.botId===muse.botId);assert.equal(mb.label,'Connected');assert.equal(mb.tiers.find(t=>t.tier==='Live').state,'unavailable');
 assert.equal(mb.tiers.find(t=>t.tier==='Governed').state,'not_yet','echo alone does not earn Governed');
 // Honest transport: the link key is refused everywhere except /api/link/call.
 assert.equal((await call('/api/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/list'},{authorization:'Bearer '+grok.key})).code,401,'link key not accepted on /api/mcp');
 assert.equal((await call('/api/gateway/me','GET',{},{authorization:'Bearer '+grok.key})).code,401,'link key not accepted on the gateway');
 assert.equal((await call('/api/link/call','POST',{op:'unsupported-operation'},{authorization:'Bearer '+grok.key})).code,400,'unknown op refused');
 assert.equal((await call('/api/link/call','POST',{op:'act',action:'money.move'},{authorization:'Bearer '+grok.key})).code,400,'unknown action refused');
 // A real act goes through gatewayAct: notes.write is ASK in the balanced preset, so it waits for the owner. That earns Governed.
 const a1=await call('/api/link/call','POST',{op:'act',action:'notes.write',params:{title:'Fixture',text:'x'},requestId:fresh()},{authorization:'Bearer '+grok.key});
 assert.equal(a1.code,200);assert.equal(a1.j.result.status,'pending');assert(a1.j.result.request_id);grok.key=a1.j.nextKey;
 const q=await f.als.run({ws:'wsA'},()=>f.getJ('fm:req:'+a1.j.result.request_id));assert.equal(q.agentId,gA);assert.equal(q.status,'pending','the owner approval queue has the real request');
 bots=(await call('/api/botlink/bots','GET',{},C)).j.bots;assert.equal(bots.find(b=>b.botId===grok.botId).tiers.find(t=>t.tier==='Governed').state,'earned');
 const hq=await call('/api/state','GET',{},C);assert.equal(hq.j.agents.find(a=>a.id===gA).connection.status,'active','HQ shows the linked agent from real calls');
 // Owner cancel is server-side.
 const cp=(await call('/api/botlink/pairings','POST',{type:'muse'},W)).j;assert.equal((await call('/api/botlink/pairings/'+cp.pairingId+'/cancel','POST',{},W)).code,200);
 assert.equal((await call('/api/pair/'+cp.pairingId,'POST',{nonce:fresh(),callerSecret:fresh()})).code,410,'cancelled link is dead');
 assert.equal((await call('/api/link/call','POST',{op:'echo'},{authorization:'Bearer test_not_a_key'})).code,401);
 assert.equal((await call('/api/pair/pr_doesnotexist0000000000','POST',{nonce:fresh(),callerSecret:fresh()})).code,404,'unknown pairing ID gets nothing');
 // AT3: pending broker approvals for both linked agents.
 const qs=await f.als.run({ws:'wsA'},async()=>{const out=[];for(const id of [mA,gA]){const a=await f.getJ('fm:agent:'+id),t=await f.newTask({title:'Fixture',assignee:id});t.status='running';await f.setJ('fm:task:'+t.id,t);out.push((await f.brokerRequest(a,{taskId:t.id,sourceId:'s',route:'fixture.echo',input:'x',maxCents:0})).body.request.id);}return out;});
 // A separate bridge process delivers lifecycle events with the existing workers' ordinary gateway keys over HTTP.
 const {Bridge}=require('./worker/live-bridge/bridge.cjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bl-'));let t=Date.now();
 const viaHandler=async(url,o={})=>{const u=new URL(url),res=await call(u.pathname,o.method||'GET',o.body?JSON.parse(o.body):{},{authorization:o.headers.Authorization});return {ok:res.code>=200&&res.code<300,status:res.code,json:async()=>res.j};};
 const cfg=[{id:mA,url:'https://alter.example',gatewayKey:gw1.key,intakeToken:'test_in_a_000000000000000'},{id:gw2.agent.id,url:'https://alter.example',gatewayKey:gw2.key,intakeToken:'test_in_b_000000000000000'}];
 const br=new Bridge({bots:cfg,stateFile:path.join(dir,'s.json'),fetchImpl:viaHandler,now:()=>t});
 const ev=(phase,id)=>({phase,event_id:id,session_id:'s1',at:t});
 for(const b of cfg){assert.equal(br.intake(b.id,b.intakeToken,ev('start','e1')).status,202);await br.drain(b.id);}
 assert(br.status().every(x=>!x.halted&&x.queued===0),'both bots deliver before revoke');
 const rv=await call('/api/botlink/bots/'+muse.botId+'/revoke','POST',{},W);assert.equal(rv.code,200);assert(/cannot stop calls the bot makes outside Alter/.test(rv.j.copy));
 const [q1,q2]=await f.als.run({ws:'wsA'},async()=>[await f.getJ('fm:broker:q:'+qs[0]),await f.getJ('fm:broker:q:'+qs[1])]);
 assert.equal(q1.status,'blocked');assert.equal(q1.reason,'bot_revoked');assert.equal(q2.status,'pending','other bot approvals untouched');
 for(const b of cfg){br.intake(b.id,b.intakeToken,ev('update','e2'));await br.drain(b.id);}
 let bs=br.status();assert.equal(bs.find(x=>x.id===mA).halted,true,'revoked bot halts in the bridge through the real HTTP rejection');assert.equal(bs.find(x=>x.id===mA).reason,'upstream_rejected');
 assert.equal(bs.find(x=>x.id===gw2.agent.id).halted,false);assert.equal(bs.find(x=>x.id===gw2.agent.id).queued,0,'other bot keeps delivering');
 const restarted=new Bridge({bots:cfg,stateFile:path.join(dir,'s2.json'),fetchImpl:viaHandler,now:()=>t});restarted.intake(mA,cfg[0].intakeToken,ev('start','r1'));await restarted.drain(mA);
 assert.equal(restarted.status().find(x=>x.id===mA).reason,'identity_rejected','a fresh bridge process refuses the revoked bot too');
 assert.equal((await call('/api/link/call','POST',{op:'echo'},{authorization:'Bearer '+muse.key})).code,401,'revoked Muse key dead');
 assert.equal((await call('/api/link/call','POST',{op:'echo'},{authorization:'Bearer '+grok.key})).code,200,'Grok still works');
 assert.equal((await call('/api/botlink/bots/'+muse.botId+'/repaste','POST',{},W)).code,409,'a revoked bot cannot be re-pasted back');
 bots=(await call('/api/botlink/bots','GET',{},C)).j.bots;assert.equal(bots.find(b=>b.botId===muse.botId).label,'Revoked');assert.equal(bots.find(b=>b.botId===grok.botId).label,'Connected');
 assert(fs.readFileSync(__dirname+'/public/connect.html','utf8').includes('It cannot stop calls the bot makes outside Alter'));
 // secrets never logged, never stored in plaintext
 const all=logs.join('\n');assert(!/alk_|test_in_|fmk_|Pairing test_/.test(all));
 const dump=JSON.stringify([...ctx.global.__mem.kv.entries()]);for(const k of [muse.key,muse.firstKey,grok.key,grok.firstKey])assert(!dump.includes(k),'link keys hashed at rest');
 fs.rmSync(dir,{recursive:true});
 console.log('PASS bot link e2e (pair, CSRF+Origin approve, collect-once, echo -> Connected, real gatewayAct -> Governed, key refused on /api/mcp and gateway, server-side cancel) + AT3 revoke isolation (broker blocked, separate bridge halts via real HTTP, other bot untouched). No network/spend.');
})().catch(e=>{console.error(e);process.exit(1)});
