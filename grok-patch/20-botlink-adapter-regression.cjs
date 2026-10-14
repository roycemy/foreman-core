// One adapter interface over three transports; onboarding UI has no per-bot branches.
const assert=require('assert'),fs=require('fs'),{BOT_TYPES,TRANSPORTS}=require('./api/bot-link.js'),{makeLink}=require('./botlink-helpers.cjs');
const {bl}=makeLink();const want=['connect','verify','call','reconnect','revoke','status'];
assert.deepEqual(Object.values(BOT_TYPES).map(t=>t.transport).sort(),['http_key','mcp','runner']);
for(const t of Object.keys(BOT_TYPES)){const a=bl.adapter(t);for(const m of want)assert.equal(typeof a[m],'function',t+'.'+m);assert(TRANSPORTS[a.transport.id]);}
const ui=fs.readFileSync(__dirname+'/public/connect.html','utf8');for(const n of ['Instinct','Grok','Muse','instinct','grok','muse'])assert(!ui.includes(n),'onboarding UI must not special-case '+n);
assert(!/typing|presence|online|heartbeat/i.test(ui.replace(/<style>[\s\S]*?<\/style>/,'')),'UI has no presence/typing indicators');
// adding a type changes nothing in the UI: it comes from /api/botlink/types
BOT_TYPES.fixture={id:'fixture',name:'Fixture',transport:'http_key',live:{possible:false,why:'test'},message:l=>'open '+l};assert(bl.types().some(t=>t.id==='fixture'));delete BOT_TYPES.fixture;
console.log('PASS one adapter interface (connect/verify/call/reconnect/revoke/status) over MCP, HTTP key, runner; UI is data-driven with no per-bot or presence code.');
