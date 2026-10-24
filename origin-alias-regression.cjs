// alterhq.app is the canonical origin; foreman-core.vercel.app keeps working as an alias.
const fs=require('fs'),assert=require('assert');
const api=fs.readFileSync('api/index.js','utf8'),con=fs.readFileSync('public/js/connect.js','utf8');
assert(api.includes("const PUBLIC_ORIGIN='https://www.alterhq.app'"),'canonical origin is alterhq.app');
assert(api.includes("const OAUTH_ORIGIN='https://foreman-core.vercel.app'"),'old origin kept');
assert(/originOk=o=>o===OAUTH_ORIGIN\|\|o===PUBLIC_ORIGIN/.test(api),'both origins accepted');
assert(/originOk\(req\.headers\.origin\)/.test(api),'origin checks use both');
assert(/alterhq\\.app\$\/.test\(String\(req&&req.headers/.test(api),'metadata host-aware');
assert(!/FIRST open \$\{OAUTH_ORIGIN\}\/runner/.test(api),'setup message runner link uses alterhq.app');
assert(con.includes("PRODUCTION_ORIGIN = 'https://www.alterhq.app'")&&con.includes("ALT_ORIGIN = 'https://foreman-core.vercel.app'"),'connect page treats both as production');
assert(/onProd\(\)/.test(con),'no redirect off alterhq.app');
console.log('PASS origin alias: alterhq.app canonical, vercel.app keeps working');

// Pairing/bot-instruction origin: canonical on production, the Vercel-injected branch URL on
// preview deployments - so a bot paired from a preview is pointed at the deployment the owner
// actually used, never at production's older write routes. VERCEL_ENV/VERCEL_BRANCH_URL are
// Vercel system variables (no project setting, not caller-controlled).
const vm=require('vm');
assert(api.includes("const PAIR_ORIGIN=()=>process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_BRANCH_URL?'https://'+process.env.VERCEL_BRANCH_URL:PUBLIC_ORIGIN;"),'PAIR_ORIGIN resolves preview branch URL only from Vercel system env');
for(const frag of ["botLink.steps(pm[1],PAIR_ORIGIN())","createPairing({ws:sess.ws,account:sess.email,type:body.type,agentId,origin:PAIR_ORIGIN()})","repasteMessage(sess.ws,m[1],PAIR_ORIGIN())","const base = PAIR_ORIGIN();","FIRST open ${PAIR_ORIGIN()}/runner?agent="]){
  assert(api.includes(frag),'bot-facing instruction origin uses PAIR_ORIGIN: '+frag.slice(0,50));
}
assert(!/botLink\.steps\(pm\[1\],PUBLIC_ORIGIN\)/.test(api),'pairing steps never hardcode the production origin');
assert(!/createPairing\(\{[^}]*origin:PUBLIC_ORIGIN\}/.test(api),'pairing payload never hardcodes the production origin');
// OAuth/MCP client metadata and invite links keep the canonical origin in every environment.
assert(api.includes("const params=new URLSearchParams({client_id:body.client_id,redirect_uri:body.redirect_uri,response_type:'code',code_challenge_method:'S256',code_challenge:body.code_challenge,scope:'blackbox.bot',resource:PUBLIC_ORIGIN+'/api/mcp'"),'MCP resource stays canonical');
assert(api.includes("invite-flow.cjs')}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;return require('./lib/invite-flow.cjs')}})()({r,getJ,origin:PUBLIC_ORIGIN"),'invite flow origin stays canonical');

// Behavior: same code, prod env -> canonical; preview env -> branch URL. env is read per call.
const c={require:(m)=>require(m),module:{exports:{}},process:{env:{}},global:{},console,URL,Buffer,AbortSignal,setTimeout,clearTimeout,fetch:()=>{throw new Error('no network')}};
vm.runInNewContext(api+'\nmodule.exports.o={PAIR_ORIGIN};',c);
const PO=c.module.exports.o.PAIR_ORIGIN;
assert.equal(PO(),'https://www.alterhq.app','no Vercel env -> canonical origin');
c.process.env.VERCEL_BRANCH_URL='foreman-core-git-feat-biz-grokbot-backend-royce-myers.vercel.app';
assert.equal(PO(),'https://www.alterhq.app','branch URL alone is not enough (VERCEL_ENV must be preview)');
c.process.env.VERCEL_ENV='preview';
assert.equal(PO(),'https://foreman-core-git-feat-biz-grokbot-backend-royce-myers.vercel.app','preview deployment pairs against its own branch URL');
c.process.env.VERCEL_ENV='production';
assert.equal(PO(),'https://www.alterhq.app','production deployment pairs against the canonical origin even if a branch URL leaks in');
console.log('PASS pair origin: preview targets itself, production unchanged');
