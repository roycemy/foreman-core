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

// Instinct: rung 2 via its own 5-min schedule, declared by the link itself
const i=forP('instinct');
assert(i.url.includes('/runner?agent=agent_test&poll=300'),'instinct link declares its 5-min cadence');
assert(i.msg.includes('every 5 minutes, open this console link, click Claim next task'),'instinct message sets its own schedule');
assert(i.msg.includes('Checks in every 5 min')&&i.msg.includes('Late'),'instinct message promises only honest cadence status');
assert(i.msg.includes('on your 5-minute schedule'),'instinct standing rule covers the schedule');
assert(i.msg.includes('&wake=email:'),'instinct paste shows how to declare its wake inbox on the link');
assert(i.msg.includes('Gmail'),'instinct paste declares the user\'s own Gmail');
assert(i.msg.includes('Gmail push wakes you in seconds'),'instinct paste names the gmail push path');
assert(i.msg.includes('Any valid email address works'),'any inbox works, gmail is fastest');
assert(i.msg.includes('content-free email'),'instinct wake email is content-free');
assert(i.msg.includes('5-minute schedule still covers'),'instinct schedule stays the backup');
assert(!i.msg.includes('Live'),'no live promise');

// Grok: rung 2 via its own routine on the MCP connector
const g=forP('grok');
assert(g.mcp.includes('ALTER AUTO-WAKE SETUP')&&g.mcp.includes('+alter')&&g.mcp.includes('Email trigger'),'grok creates its own +alter email-trigger routine');
assert(g.mcp.includes('Alter: claim queued jobs')&&g.mcp.includes('Alter: backup check')&&/every 5 minutes/i.test(g.mcp)&&g.mcp.includes('foreman_next_task'),'grok creates both routines');
assert(g.mcp.includes('wakeChannel')&&g.mcp.includes('wakeTarget')&&g.mcp.includes('pollSec 300')&&g.mcp.includes('wakeNonce'),'grok registers its address and echoes the test code');
assert(g.mcp.includes('wake verified')&&g.mcp.includes('only after'),'verified only after the test email wakes it');
assert(!/paste (the|a) (trigger|key|secret)/i.test(g.mcp),'no paste step');
assert(!g.url.includes('poll='),'grok link declares no console cadence');

// Muse: rung 3 only - no cadence, no routine; still one paste with the code in the fragment
const m=forP('muse');
assert(!m.url.includes('poll='),'muse link declares no cadence');
assert(!m.msg.includes('5-minute')&&!m.mcp.includes('add a Routine'),'muse stays acts-when-messaged');
assert(m.msg.includes('every time I message you'),'muse keeps the on-message standing rule');
assert(!m.msg.includes('&wake='),'muse paste declares no wake target');

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
console.log('PASS setup wake ladder: grok routine + instinct declared cadence in one paste each, muse stays on-message, console stamps pollSec honestly. No network.');
