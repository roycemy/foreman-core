const fs=require('fs'),vm=require('vm'),assert=require('assert');
const raw=fs.readFileSync('public/js/connect.js','utf8'),source=raw.replace(/\}\)\(\);\s*$/,"window.test={set:x=>W=x,runnerMessage,setupMessageFor,gatewayMessage,accessFinale};})();");
const BB={$:()=>null,esc:x=>x,toast:()=>{},S:{agents:[]},sync:async()=>{},presence:a=>a.presence};const ctx={window:{BB},BRAND:{name:'Alter'},location:{origin:'https://preview-protected.vercel.app'},clearInterval,setInterval,navigator:{},console};vm.runInNewContext(source,ctx);const f=ctx.window.test;
for(const p of ['instinct','grok','studio','muse','custom','future-provider']){f.set({p,label:p,agent:{id:'agent_test',name:'Owner bot'}});
// Bot-facing instructions target the deployment in use (here a preview): the bot must call the
// preview's own reviewed code, never production's older routes. The MCP connector flow stays
// on the canonical origin (that flow is unchanged), so setupMessageFor keeps alterhq.app.
const rm=f.runnerMessage(),gm=f.gatewayMessage(),sm=f.setupMessageFor();
assert(rm.includes('https://preview-protected.vercel.app')&&!rm.includes('www.alterhq.app'),'runner instructions use the deployment origin');
assert(gm.includes('Base URL: https://preview-protected.vercel.app/api')&&!gm.includes('www.alterhq.app'),'gateway base URL uses the deployment origin');
assert(sm.includes('https://www.alterhq.app/api/mcp'),'MCP connector address stays canonical');
assert(!/fmk_[a-z0-9]+/i.test(rm+gm+sm));
const msg=f.runnerMessage();assert(msg.includes('Open https://preview-protected.vercel.app/runner?agent=agent_test'));assert(msg.includes('20 seconds'));assert(!msg.includes('OAuth'));assert(msg.includes('presence is stale'));assert(msg.includes('presence accepted'));}
const api=fs.readFileSync('api/index.js','utf8');const connect=api.slice(api.indexOf("if (path === '/connect'"),api.indexOf("if (path === '/track'"));assert(!connect.includes('${c.key}'));assert(!connect.includes('key: c.key'));assert(connect.includes('const base = PAIR_ORIGIN();'));
// bot-facing connect URLs resolve per-deployment: canonical on production, the preview's own
// branch URL on preview (origin-alias-regression proves the env behavior)
assert(connect.includes('runnerUrl:'));assert(raw.includes('prefers-reduced-motion')||fs.readFileSync('public/styles/app.css','utf8').includes('prefers-reduced-motion'));assert(raw.includes('if(!bots.length||pending.length)'));console.log('PASS provider setup: bot-facing instructions use the deployment origin (prod on prod, preview on preview), MCP address stays canonical, runner-first, stale-state guidance, no raw key; finale rejects unfinished setup. No network.');
