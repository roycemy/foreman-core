// One adapter interface; honest transport claims; onboarding UI has no per-bot branches.
const assert=require('assert'),fs=require('fs'),{BOT_TYPES,TRANSPORTS,LINK_ENDPOINT}=require('./api/bot-link.js'),{makeLink}=require('./botlink-helpers.cjs');
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
console.log('PASS one adapter interface over three native transports; link key claimed only on /api/link/call (not MCP, not runner); UI is data-driven with no per-bot or presence code.');
