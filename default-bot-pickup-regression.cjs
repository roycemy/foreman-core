// Default pickup for new users: one provider-capability table drives the setup paste and the pickup labels; Muse gets the queue-watch steps, Grok the email-wake steps; sub-minute cadences never read "every 0 min"; instant wake shows even without a backup cadence.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const raw=fs.readFileSync('public/js/connect.js','utf8'),source=raw.replace(/\}\)\(\);\s*$/,"window.test={set:x=>W=x,runnerMessage,setupMessageFor,gatewayMessage};})();");
const CAPS={instinct:{mcp:true,emailWake:true,queueWatch:false},grok:{mcp:true,emailWake:true,queueWatch:false},muse:{mcp:true,emailWake:false,queueWatch:true}};
function load(origin){const BB={$:()=>null,esc:x=>x,toast:()=>{},S:{agents:[]},sync:async()=>{},presence:a=>a.presence,PROVIDER_CAPS:CAPS};const ctx={window:{BB},BRAND:{name:'Alter'},location:{origin},clearInterval,setInterval,navigator:{},console};vm.runInNewContext(source,ctx);return ctx.window.test;}
const f=load('https://www.alterhq.app');
/* Muse: the paste carries the queue-watch self-setup with honest cost note, quiet-stop rules and the timed-test proof bar */
f.set({p:'muse',label:'Muse',agent:{id:'agent_muse',name:'Muse'}});
const mm=f.setupMessageFor();
assert(mm.includes('ALTER QUEUE-WATCH SETUP'),'muse paste includes queue-watch steps');
assert(mm.includes('every 10 seconds'),'the watch cadence is explicit');
assert(mm.includes('foreman_next_task'),'the watch claims through the real tool');
assert(/count toward your Muse plan/.test(mm),'honest cost note');
assert(mm.includes('run it twice')&&mm.includes('measured times'),'proof bar matches the Grok email-wake bar');
assert(mm.includes('stay in message mode'),'honest fallback when automations are unavailable');
assert(!mm.includes('ALTER AUTO-WAKE SETUP'),'muse is not offered the email-wake path (capability table says no inbox trigger)');
/* Grok: email-wake steps stay; no queue-watch block */
f.set({p:'grok',label:'Grok Bot',agent:{id:'agent_grok',name:'Grok Bot'}});
const gm=f.setupMessageFor();
assert(gm.includes('ALTER AUTO-WAKE SETUP')&&gm.includes('wake@mail.alterhq.app'),'grok paste keeps the email-wake steps');
assert(!gm.includes('ALTER QUEUE-WATCH SETUP'),'grok is not offered the muse watch');
/* Without the table (core not loaded yet) the fallback keeps both blocks */
const BB2={$:()=>null,esc:x=>x,toast:()=>{},S:{agents:[]},sync:async()=>{},presence:a=>a.presence};const ctx2={window:{BB:BB2},BRAND:{name:'Alter'},location:{origin:'https://www.alterhq.app'},clearInterval,setInterval,navigator:{},console};vm.runInNewContext(source,ctx2);const g2=ctx2.window.test;
g2.set({p:'muse',label:'Muse',agent:{id:'agent_muse',name:'Muse'}});assert(g2.setupMessageFor().includes('ALTER QUEUE-WATCH SETUP'),'fallback table keeps the muse block');
g2.set({p:'grok',label:'Grok Bot',agent:{id:'agent_grok',name:'Grok Bot'}});assert(g2.setupMessageFor().includes('ALTER AUTO-WAKE SETUP'),'fallback table keeps the grok block');
/* core.js: the table exists once and labels use the shared cadence formatter */
const core=fs.readFileSync('public/js/core.js','utf8');
assert(core.includes('BB.PROVIDER_CAPS = {'),'capability table defined in core.js');
assert(/muse: \{ mcp: true, emailWake: false, queueWatch: true, browserPairing: true \}/.test(core),'muse row: queue watch, no inbox trigger');
assert(/grok: \{ mcp: true, emailWake: true, queueWatch: false, browserPairing: true \}/.test(core),'grok row: email wake');
assert((core.match(/BB\.fmtEvery\(/g)||[]).length>=5,'all cadence labels use the shared formatter');
assert(!core.includes("Math.round(poll / 60) + ' min'")&&!core.includes("Math.round(BB.pollSec(a) / 60) + ' min'"),'no unformatted minute rounding left in core labels');
assert(core.includes("if (!poll && !t && a.instantWake) return { kind: 'poll', text: 'Instant wake on · last activity ' + last };"),'instant wake shows without a backup cadence');
/* fmtEvery behaves: seconds under a minute, minutes above */
const fmt=eval(core.match(/BB\.fmtEvery = ([^;]+);/)[1]);
assert(fmt(10)==='10 sec'&&fmt(120)==='2 min'&&fmt(300)==='5 min'&&fmt(90)==='2 min','formatter output');
const bs=fs.readFileSync('public/js/components/bot-status.js','utf8');
assert((bs.match(/BB\.fmtEvery\?BB\.fmtEvery\(ps\)/g)||[]).length===2,'bot-status lines use the formatter with a safe fallback');
/* existing wording preserved for minute cadences */
assert(core.includes("'Instant wake on · backup check every ' + BB.fmtEvery(poll)"),'instant label wording kept');
console.log('PASS default bot pickup: capability table gates paste steps per bot type (Muse queue-watch with cost note, Grok email-wake), honest sub-minute cadence labels, instant wake shown without backup cadence. No network.');
