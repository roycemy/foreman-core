// One-paste connect: the setup message carries the one-time code in the runner URL fragment
// (never in the query string, so it stays out of server/proxy logs); the runner auto-pairs.
const fs=require('fs'),assert=require('assert');
const cj=fs.readFileSync('public/js/connect.js','utf8');
const rh=fs.readFileSync('public/runner.html','utf8');
// messages build the pair URL with the code in the FRAGMENT, not the query
assert(cj.includes("return W.pairCode?u+'#pair='+W.pairCode:u;"),'pairUrl must put the code in the fragment');
assert(!cj.includes("'/runner?agent='+encodeURIComponent(W.agent.id)+'&pair="),'code must never go in the query string');
// owner never retypes a code: no typing instructions remain in the prompts
assert(!cj.includes('I will take control to type'),'prompt must not ask the owner to type a code');
assert(!cj.includes('I will take control once to type'),'prompt must not ask the owner to type a code');
// both prompt variants tell the bot the console pairs itself
assert(cj.includes('The console pairs itself when the page opens'),'runner prompt must promise auto-pair');
// sheet auto-issues and gates copy on a live code
assert(cj.includes("BB.api('/api/agents/' + W.agent.id + '/pairing', 'POST', {})"),'sheet must auto-issue the code');
// runner reads the code from the fragment, with a scrubbed ?pair= query fallback for browsers that drop fragments, and auto-pairs only when no saved session
assert(rh.includes("const pc=hp.get('pair')||qp.get('pair');"),'runner must read the fragment with query fallback');
assert(rh.includes("qp.delete('pair')"),'runner must scrub the query pair param');
assert(rh.includes("if(pc&&expected&&!persistent&&sessionMissing)$('pairconnect').click()"),'runner must auto-pair');
// redeem endpoint still rejects query-string-only knowledge: code validation unchanged server-side
const api=fs.readFileSync('api/index.js','utf8');
assert(api.includes("if(!await r(['SET','gl:pairUsed:'+hash,'1','NX','PX',300000]))"),'single-use burn must remain');
assert(api.includes("await r(['GET','fm:pairLatest:'+a.id])!==hash"),'latest-code-only check must remain');
// retry-safe: same browser/IP may replay a just-redeemed code within its window; note carries the code as plain text fallback
assert(api.includes("gl:pairReplay:"),'redeem must allow same-IP replay within the code window');
console.log('ONE-PASTE REGRESSION: ALL PASS');

assert(cj.includes('use the code from the link fragment'),'code appears only in link; fallback reads that fragment');
