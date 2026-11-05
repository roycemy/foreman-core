// Honest status for a gateway-key bot. Three different facts, kept apart:
//   the key is valid and has been used (an authenticated call happened),
//   it was used recently (a call in the last few minutes),
//   a worker keeps checking in (it polls presence or tasks/next).
// An authenticated request proves the first two at that moment; only polling is evidence of a running worker. A valid key that
// is merely idle is not "lost access", not "Reconnect" and not "Not connected yet". A revoked bot is. Also: the phone inbox renders a
// sent email as an executed request with its provider id, never as a reconnect card; and a bot key cannot approve anything.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={routes,r,setJ,getJ,als,createAgent,connectionState,fullState};';
const env={};const ctx={require,module:{exports:{}},process:{env},global:{},console,fetch:()=>{throw Error('NO NETWORK')},setTimeout,clearTimeout,URL,AbortSignal};vm.runInNewContext(src,ctx);
const f=ctx.module.exports.t,handler=ctx.module.exports;
const H={host:'localhost',origin:'http://localhost'};
async function call(method,p,body,agent,extra={}){let out;const res={status(n){this.code=n;return this},json(j){out={code:this.code||200,j};return out},setHeader(){},end(){out={code:this.code||204};return out}};await f.routes({method,headers:H,url:'/api'+p,...extra},res,p.split('?')[0],body||{},agent||null);return out;}
// the real top-level handler, as a caller with only a bot key and no owner session
async function top(method,p,body,headers){let out;const res={setHeader(){return this},status(n){this.code=n;return this},json(j){out={code:this.code||200,j};return out},end(){out={code:this.code||204};return out},send(b){out={code:this.code||200,b};return out}};await handler({method,url:'/api'+p,headers:{host:'localhost',origin:'http://localhost',...headers},body},res);return out;}
const ago=ms=>new Date(Date.now()-ms).toISOString();
(async()=>{
 let bot,key,conn;
 await f.als.run({ws:'statustest'},async()=>{
  bot=(await f.createAgent('Test Bot','Ops','custom',false,{preset:'balanced'})).agent;
  const k=await call('POST','/agents/'+bot.id+'/gateway-key',{});assert.equal(k.code,200);key=k.j.key;
  conn=async()=>f.connectionState(await f.getJ('fm:agent:'+bot.id));
  // never used: genuinely not connected yet
  assert.equal((await conn()).status,'awaiting_bot');
  // one authenticated action (the manual email proposal) proves the key works now; it is not a worker
  const live=await f.getJ('fm:agent:'+bot.id);
  assert.equal((await call('POST','/gateway/act',{action:'notes.write',params:{title:'t',text:'x'}},live,{gatewayKeyAuth:true})).code,202);
  let c=await conn();assert.deepEqual([c.status,c.transport],['active','gateway'],'a used key is an active connection');
  assert(c.lastCallAt&&Date.now()-Date.parse(c.lastCallAt)<5000,'last authenticated call is recorded');assert.equal(c.polledAt,null,'an action is not a check-in');
  // a GET /gateway/me alone also proves the key
  assert.equal((await call('GET','/gateway/me',{},live,{gatewayKeyAuth:true})).code,200);
  // a poll is the only evidence of a worker
  assert.equal((await call('GET','/gateway/tasks/next',{},live,{gatewayKeyAuth:true})).code,200);c=await conn();assert(c.polledAt,'tasks/next records a check-in');
  // a new key starts over: not used yet
  const k2=await call('POST','/agents/'+bot.id+'/gateway-key',{});assert.equal(k2.code,200);c=await conn();assert.deepEqual([c.status,c.lastCallAt,c.polledAt],['awaiting_bot',undefined,undefined]);
  key=k2.j.key;
  // revoked is revoked
  await f.setJ('fm:agent:'+bot.id,{...(await f.getJ('fm:agent:'+bot.id)),status:'revoked'});assert.equal((await conn()).status,'revoked');
  await f.setJ('fm:agent:'+bot.id,{...(await f.getJ('fm:agent:'+bot.id)),status:'active'});
 });
 console.log('PASS server: unused key = awaiting_bot; any authenticated call = active with lastCallAt and no polledAt; tasks/next = polledAt; new key resets; revoked = revoked');

 // ---- approval separation: a bot key cannot approve, through any door
 let rid;
 await f.als.run({ws:'statustest'},async()=>{const live=await f.getJ('fm:agent:'+bot.id);
  const p=await call('POST','/gateway/act',{action:'notes.write',params:{title:'needs owner',text:'x'}},live,{gatewayKeyAuth:true});rid=p.j.request_id;});
 const q0=await f.als.run({ws:'statustest'},()=>f.getJ('fm:req:'+rid));
 for(const [p,body] of [['/requests/'+rid+'/approve',{detailsHash:q0.detailsHash}],['/requests/'+rid+'/deny',{}],['/gateway/requests/'+rid+'/approve',{detailsHash:q0.detailsHash}],['/gateway/../requests/'+rid+'/approve',{}]]){
  const o=await top('POST',p,body,{authorization:'Bearer '+key});assert.notEqual(o.code,200,p+' must not succeed with a bot key: '+JSON.stringify(o));}
 {const m=await top('POST','/mcp',{jsonrpc:'2.0',id:1,method:'tools/list',params:{}},{authorization:'Bearer '+key});const names=((m.j&&m.j.result&&m.j.result.tools)||[]).map(x=>x.name);assert(names.length>5,'tools listed: '+names.length);assert(!names.some(n=>/approve|deny|decide|request_decision/i.test(n)),'no MCP tool decides a request: '+names.join(','));}
 assert.equal((await f.als.run({ws:'statustest'},()=>f.getJ('fm:req:'+rid))).status,'pending','still pending: only the owner session decides');
 console.log('PASS a bot key cannot approve or deny: owner routes answer 401 without a session, the gateway has no decide route, MCP has no decide tool; the request stays pending');

 // ---- client: the real core.js and bot-status.js decide what the owner sees
 const NOW=Date.now();
 const win={BB:undefined,matchMedia:()=>({matches:false}),innerWidth:390,localStorage:{getItem:()=>null,setItem(){}}};
 const cctx={window:win,document:{addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,hidden:false},matchMedia:win.matchMedia,innerWidth:390,localStorage:win.localStorage,fetch:()=>{throw Error('NO NETWORK')},setInterval:()=>0,clearInterval(){},setTimeout:()=>0,clearTimeout(){},console,Date};
 vm.createContext(cctx);for(const file of ['public/js/core.js','public/js/components/bot-status.js','public/js/components/reconnect-flag.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),cctx);
 const BB=win.BB;BB.withOwner=()=>false;
 const gw=(o)=>({id:'agent_t',name:'Test Bot',status:'active',providerId:'custom',connectionMode:'gateway',lastSeen:o.lastSeen||null,connection:{status:'active',transport:'gateway',persistent:false,lastCallAt:o.lastCallAt||null,polledAt:o.polledAt||null},...(o.extra||{})});
 const set=(agents,requests=[])=>{BB.S={killed:false,agents,tasks:[],requests,events:[],receipts:[]};BB.money={requests:[]};BB.cards={proposals:[]};};
 const view=a=>{set([a]);return {presence:BB.presence(a),state:BB.botState(a).text,line:BB.honestStatus(a).line,offline:BB.isOffline(a),dark:BB.wentDark(a,NOW),flag:BB.reconnectFlag.needs(a),onYou:BB.onYou().map(i=>i.type)};};
 // valid but idle: used 2 hours ago, never checked in
 {const v=view(gw({lastSeen:ago(2*3600e3),lastCallAt:ago(2*3600e3)}));
  assert.equal(v.presence,'connected');assert.notEqual(v.state,'Not connected yet');assert.match(v.line,/^Idle · last call/);
  assert.deepEqual([v.offline,v.dark,v.flag],[false,false,false],'idle is not offline, not dark, not reconnect');assert.deepEqual(v.onYou,[],'nothing on the owner for an idle valid key');
  assert.match(BB.honestStatus(gw({lastSeen:ago(2*3600e3),lastCallAt:ago(2*3600e3)})).why,/can.t tell whether a worker is running/);}
 // recently active: one call a minute ago, never checked in
 {const v=view(gw({lastSeen:ago(60e3),lastCallAt:ago(60e3)}));assert.match(v.line,/^Active · last call/);assert.deepEqual([v.dark,v.flag,v.onYou.length],[false,false,0]);}
 // the floor no longer says "Not connected yet" once the key has been used, even before lastSeen is known
 {const v=view(gw({lastCallAt:ago(30e3)}));assert.equal(v.presence,'connected');assert.notEqual(v.state,'Not connected yet');}
 // stale: it used to check in, and stopped. That is a worker that went dark, not a lost key; the advice is not re-paste
 {const v=view(gw({lastSeen:ago(3*3600e3),lastCallAt:ago(3*3600e3),polledAt:ago(3*3600e3)}));assert.equal(v.dark,true);assert(v.onYou.includes('dark'));assert(!v.onYou.includes('reconnect'));assert.equal(v.flag,false,'a valid key is never told to re-paste');}
 // checking in now: a live poller is not idle
 {const v=view(gw({lastSeen:ago(20e3),lastCallAt:ago(20e3),polledAt:ago(20e3)}));assert.doesNotMatch(v.line,/^Idle/);assert.equal(v.dark,false);}
 // never used: genuinely not connected
 {const a={id:'agent_n',name:'New Bot',status:'active',providerId:'custom',connectionMode:'gateway',connection:{status:'awaiting_bot',transport:'gateway'}};set([a]);assert.equal(BB.botState(a).text,'Not connected yet');}
 // genuinely revoked
 {const a=gw({lastSeen:ago(60e3),lastCallAt:ago(60e3),extra:{status:'revoked'}});a.connection={status:'revoked'};set([a]);
  assert.equal(BB.presence(a),'revoked');assert.match(BB.botState(a).text,/revoked/);assert(!BB.onYou().some(i=>i.type==='reconnect'));}
 console.log('PASS client: valid-but-idle = Idle (not offline, dark or reconnect); recently active = Active; stopped poller = went dark, never re-paste; live poller not idle; unused = Not connected yet; revoked = revoked');

 // ---- a sent email stays visible as an executed request with its provider id
 {const a=gw({lastSeen:ago(60e3),lastCallAt:ago(60e3)});
  const sent={id:'req_14db6561e9',action:'email.send',status:'executed',agentId:a.id,executedAt:ago(120e3),params:{to:'owner@example.com',subject:'Alter email test (owner-approved)'},delivery:{state:'accepted',providerMessageId:'01a1adf4-efd3-74c2-ab94-f8c24f809956'}};
  set([a],[sent]);const items=BB.onYou();const e=items.find(i=>i.type==='email');assert(e,'the executed email is listed');assert(!items.some(i=>i.type==='reconnect'),'not a reconnect');
  assert.equal(BB.teamSummary().needs,0,'an accepted email is information, not something that needs the owner');
  assert.equal(BB.emailOutcome(e.q),'Accepted by Resend. Delivery not confirmed yet.');
  const ib=fs.readFileSync(path.join(__dirname,'public/js/inbox.js'),'utf8');
  const compact=ib.slice(ib.indexOf('const card = i =>'),ib.indexOf('const jrow ='));
  assert(/if \(i\.type === 'email'\)/.test(compact),'the phone list renders email items itself');
  assert(compact.indexOf("i.type === 'email'")<compact.indexOf("' lost access'"),'before the reconnect fallthrough');
  assert(/providerMessageId/.test(compact),'with the provider id');
  const fl=fs.readFileSync(path.join(__dirname,'public/js/floor.js'),'utf8');assert(/i\.type === 'email'/.test(fl.slice(fl.indexOf('BB.itemTitle ='))),'titled as an email, not blank');}
 console.log('PASS the sent email stays visible as an executed request with its provider id; it is not a reconnect card and does not count as needing the owner');
})().catch(e=>{console.error(e);process.exit(1)});
