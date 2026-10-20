// A bot with an instant wake (email or webhook) says so; one without keeps the plain cadence line.
const fs=require('fs'),assert=require('assert');
const core=fs.readFileSync('public/js/core.js','utf8'),bs=fs.readFileSync('public/js/components/bot-status.js','utf8');
assert(/Instant wake on · backup check every/.test(core)&&/Instant wake on · backup every/.test(core),'cards say instant wake is on and keep the backup cadence');
assert(/has instant wake on; backup check every/.test(bs),'status line says it too');
assert(/a\.instantWake/.test(core),'only when the server says an instant wake is wired');
assert(/Checks in every '/.test(core),'no wake keeps the old cadence wording');
const srv=fs.readFileSync('api/index.js','utf8');assert(/instantWake: !!\(a\.status === 'active' && !a\.paused && !a\.hosted && wakeChannelFor\(a\)\)/.test(srv),'state says whether an instant wake is wired, env fallbacks included');
const BB={pollSec:()=>300};global.window={BB};
eval(bs);
assert(/instant wake on/.test(BB.checkInWhy({name:'Instinct',instantWake:true})),'wake bot line');
assert(/checks in about every 5 min/.test(BB.checkInWhy({name:'Grok Bot'})),'plain line without wake');
console.log('PASS instant-label');
