// One adapter interface; honest transport claims; onboarding UI has no per-bot branches.
const assert=require('assert'),fs=require('fs'),{BOT_TYPES,TRANSPORTS,LINK_ENDPOINT}=require('./api/bot-link.js'),{makeLink,fresh}=require('./botlink-helpers.cjs');
const {bl}=makeLink();const want=['connect','verify','call','reconnect','revoke','status'];
assert.deepEqual(Object.values(BOT_TYPES).map(t=>t.transport).sort(),['http_key','mcp','runner']);
for(const t of Object.keys(BOT_TYPES)){const a=bl.adapter(t);for(const m of want)assert.equal(typeof a[m],'function',t+'.'+m);assert(TRANSPORTS[a.transport.id]);assert.equal(a.keyEndpoint,LINK_ENDPOINT);}
// The claim is narrowed: only the HTTP link-key path accepts a link key today; MCP and the runner do not.
assert.equal(LINK_ENDPOINT,'/api/link/call');assert.equal(TRANSPORTS.http_key.acceptsLinkKey,true);assert.equal(TRANSPORTS.mcp.acceptsLinkKey,false);assert.equal(TRANSPORTS.runner.acceptsLinkKey,false);
assert(bl.types().every(t=>t.transport==='HTTP link key'),'every type says which transport the key really uses');
assert.equal(bl.types().find(t=>t.id==='grok').acceptsLinkKeyNatively,false);
const ui=fs.readFileSync(__dirname+'/public/connect.html','utf8');for(const n of ['Instinct','Grok','Muse','instinct','grok','muse'])assert(!ui.includes(n),'onboarding UI must not special-case '+n);
assert(!/typing|presence|online|heartbeat/i.test(ui.replace(/<style>[\s\S]*?<\/style>/,'')),'UI has no presence/typing indicators');
// adding a type changes nothing in the UI: it comes from /api/botlink/types
BOT_TYPES.fixture={id:'fixture',name:'Fixture',transport:'http_key',live:{possible:false,why:'test'},message:l=>'open '+l};assert(bl.types().some(t=>t.id==='fixture'));delete BOT_TYPES.fixture;
// New-bot collisions: a failed index add must not strand the pairing at 'collected'.
(async()=>{
 // case 1: the agentBot index already holds a different bot for this agent
 {const {bl,store}=makeLink();
  const pid=(await bl.createPairing({ws:'ws_test',type:'instinct',agentId:'ag_1',origin:'https://alter.invalid'})).body.pairingId;
  await store.add('bl:agentBot:ws_test:ag_1','bot_other');
  const secret=fresh();assert.equal((await bl.hello(pid,{nonce:fresh(),callerSecret:secret})).status,202);
  assert.equal((await bl.approve('ws_test',pid)).status,200);
  const r=await bl.pickup(pid,{callerSecret:secret});assert.equal(r.status,409);assert.equal(r.body.error,'agent_already_linked');
  assert.equal(JSON.parse(await store.get('bl:pair:'+pid)).status,'invalidated','pairing restored, not stranded at collected');
  const again=await bl.pickup(pid,{callerSecret:secret});assert.equal(again.status,410);assert.equal(again.body.error,'pairing_invalidated');}
 // case 2: the exact minted bot key is already taken; every other key delegates
 {const {bl,store}=makeLink();let fired=0;
  const pid=(await bl.createPairing({ws:'ws_test',type:'instinct',origin:'https://alter.invalid'})).body.pairingId;
  const realAdd=store.add.bind(store);
  store.add=async(k,v,ms)=>{if(k.startsWith('bl:bot:')){const want='bl:bot:'+JSON.parse(store.kv.get('bl:pair:'+pid)).botId;if(k===want){fired++;return false;}}return realAdd(k,v,ms);};
  const secret=fresh();assert.equal((await bl.hello(pid,{nonce:fresh(),callerSecret:secret})).status,202);
  assert.equal((await bl.approve('ws_test',pid)).status,200);
  const r=await bl.pickup(pid,{callerSecret:secret});assert.equal(r.status,409);assert.equal(r.body.error,'bot_exists');
  assert.equal(fired,1,'wrapper failed the exact minted bot key, once');
  assert.equal(JSON.parse(await store.get('bl:pair:'+pid)).status,'invalidated','pairing restored, not stranded at collected');
  const again=await bl.pickup(pid,{callerSecret:secret});assert.equal(again.status,410);assert.equal(again.body.error,'pairing_invalidated');}
 console.log('PASS one adapter interface over three native transports; link key claimed only on /api/link/call (not MCP, not runner); UI is data-driven with no per-bot or presence code; new-bot collisions restore the pairing to invalidated.');
})().catch(e=>{console.error(e);process.exit(1)});
