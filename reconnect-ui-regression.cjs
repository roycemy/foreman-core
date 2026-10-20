// New pairing code is reachable for a connected-but-quiet bot (inspector button + flag), and not for hosted/revoked/muse.
const fs=require('fs'),assert=require('assert');
const ins=fs.readFileSync('public/js/inspector.js','utf8'),fl=fs.readFileSync('public/js/components/reconnect-flag.js','utf8');
assert(/data-newcode[^`]*New pairing code/.test(ins),'inspector has a New pairing code button');
assert(/!a\.hosted && a\.status !== 'revoked'/.test(ins),'button hidden for hosted and revoked');
assert(/rc2\.onclick = \(\) => BB\.reconnect/.test(ins),'button opens the reconnect pairing screen');
const BB={presence:a=>a.pres,isGhost:()=>false,agents:()=>[],on(){}};global.window={BB};global.matchMedia=()=>({matches:false});global.document={getElementById:()=>null};
eval(fl);
const need=BB.reconnectFlag.needs;assert(need,'needs exported');
const ago=m=>new Date(Date.now()-m*60000).toISOString();
const bot=o=>Object.assign({status:'active',providerId:'instinct',pres:'connected',lastSeen:ago(1)},o);
assert(!need(bot({})),'fresh bot: no flag');
assert(need(bot({lastSeen:ago(180)})),'quiet 3h connected poller: flag');
assert(need(bot({pres:'reconnect'})),'needs_reauth: flag');
assert(!need(bot({providerId:'muse',lastSeen:ago(600)})),'muse never flagged for being dark');
assert(!need(bot({hosted:true,lastSeen:ago(600)})),'hosted not flagged');
assert(!need(bot({status:'revoked',lastSeen:ago(600)})),'revoked not flagged');
console.log('PASS reconnect reachable for quiet bots');
