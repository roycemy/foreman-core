// Setup-message wake ladder (one paste per bot; each provider's message sets up its own wake rung):
// - Grok: the paste adds the MCP connector AND tells Grok to create its own 5-min routine (rung 2).
// - Instinct: the console link declares &poll=300 and the message sets its own 5-min schedule (rung 2).
// - Muse: paste + acts-when-messaged + owner Copy nudge (rung 3); no cadence declared.
// The console stamps the declared pollSec on its own authenticated calls; HQ shows Checks in every
// N min and Late on missed checks - an honest status, never a live promise.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const raw=fs.readFileSync('public/js/connect.js','utf8'),source=raw.replace(/\}\)\(\);\s*$/,"window.test={set:x=>W=x,runnerMessage,setupMessageFor,gatewayMessage,pairUrl};})();");
const BB={$:()=>null,esc:x=>x,toast:()=>{},S:{agents:[]},sync:async()=>{},presence:a=>a.presence};
const ctx={window:{BB},BRAND:{name:'Alter'},location:{origin:'https://foreman-core.vercel.app'},clearInterval,setInterval,navigator:{},console};
vm.runInNewContext(source,ctx);const f=ctx.window.test;
const forP=p=>{f.set({p,label:p,agent:{id:'agent_test',name:'Owner bot'}});return {msg:f.runnerMessage(),mcp:f.setupMessageFor(),url:f.pairUrl()};};

// All three browser-console paths use one action and one declared two-minute cadence.
for(const p of ['instinct','grok','muse']){const x=forP(p);assert(x.url.includes('&poll=120'));assert(x.msg.includes('every 2 minutes'));assert(x.msg.includes('20 seconds'));assert(x.msg.includes('saved authorization before'));assert(!x.msg.includes('MCP'));assert(!x.msg.includes('keep this page open'));assert(x.msg.includes('same paired browser'));assert(x.msg.includes('No purchases'));}
// Explicit MCP alternative retains its existing provider-specific optional wake controls.
const g=forP('grok');assert(g.mcp.includes('ALTER AUTO-WAKE SETUP'));assert(g.mcp.includes('wakeNonce'));

// Other providers: unchanged generic copy, no grok routine text
const c=forP('studio');
assert(!c.mcp.includes('add a Routine'),'generic MCP message has no grok routine step');
assert(!c.url.includes('poll='),'generic link declares no cadence');
assert(!c.mcp.includes('start this routine from that event'),'instant-push offer is grok-only');
// Owner hint: the grok authorize sheet documents the free env wiring for instant push
assert(raw.includes('WAKE_GROK_SLACK_WEBHOOK')&&raw.includes('WAKE_GITHUB_TOKEN')&&raw.includes('WAKE_GITHUB_REPO'),'authorize sheet names the optional free env channels');
assert(raw.includes('Optional, free: instant push on queued jobs'),'owner hint copy present');
assert(raw.includes('declared target wins'),'owner hint notes a bot-declared target wins over env');
assert(raw.includes("${W.p==='grok'?'<p"),'owner hint is grok-only');

// Console: reads &poll= (60-3600 clamped, same clamp as the server) and stamps pollSec on its own calls
const rh=fs.readFileSync('public/runner.html','utf8');
assert(rh.includes("qp.get('poll')"),'console reads the declared cadence from its link');
assert(/v>=60&&v<=3600/.test(rh.replace(/\s+/g,'')),'console clamps cadence 60..3600');
assert(rh.includes('body={...body,pollSec}'),'console stamps pollSec on POST calls');
assert(rh.includes("'pollSec='+pollSec"),'console stamps pollSec on GET calls');
assert(rh.includes("qp.get('wake')"),'console reads the declared wake target from its link');
assert(rh.includes('body={...body,...wake}'),'console stamps the wake target on POST calls');
assert(/email\|slack/.test(rh),'console accepts only email or slack wake channels');

// Server: pollSec is still recorded only from the bot's own authenticated gateway calls
const api=fs.readFileSync('api/index.js','utf8');
assert(api.includes('if(_ps)await notePollCadence(agent,_ps)'),'server records declared cadence');
assert(api.includes('if(_wt)await noteWakeTarget(agent,_wt)'),'server records declared wake targets from gateway calls');
assert(api.includes('wakeChannel'),'MCP foreman_presence schema accepts wake declarations');
console.log('PASS revised browser pairing: grok routine + instinct declared cadence in one paste each, muse verified client cadence with honest capability fallback, console stamps pollSec honestly. No network.');
