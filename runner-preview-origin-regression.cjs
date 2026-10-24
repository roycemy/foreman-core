/* Preview runner origin regression: a runner console served from a Vercel PREVIEW
   deployment (branch alias or deployment URL) must pass the runner route origin gate,
   untrusted origins must still 403, and prod-mode behavior must stay prod-only.
   Env is VM-injected before module load; no network. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.test={als,createAgent,startRunnerSession,runnerRoutes,updateAgent};';
function boot(env){const ctx={module:{exports:{}},require,process:{env},global:{},console,Buffer,fetch:()=>{throw Error('NO NETWORK')},URL,AbortSignal,setTimeout,clearTimeout};vm.runInNewContext(src,ctx);return ctx.module.exports.test;}
const PREVIEW_HOST='foreman-core-git-feat-biz-grokbot-backend-royce-myers.vercel.app',DEPLOY_HOST='foreman-core-abc123-royce-myers.vercel.app';
(async()=>{
 // Preview deployment: branch alias + deployment URL trusted, everything else refused.
 const p=boot({VERCEL_ENV:'preview',VERCEL_BRANCH_URL:PREVIEW_HOST,VERCEL_URL:DEPLOY_HOST});
 let c;await p.als.run({ws:'po_test'},async()=>{c=await p.createAgent('Test','Ops','custom',false,{});});
 let hdr={};const res={setHeader(k,v){hdr[k]=v}};const out=await p.startRunnerSession(res,'po_test',c.agent.id,c.key);const cookie=hdr['Set-Cookie'].split(';')[0];
 async function call(action,method,origin,extra={}){let result;const r={setHeader(){},status(c){this.code=c;return this},json(j){result={code:this.code||200,j};return result}};const headers={cookie,...(origin?{origin}:{}) ,...extra};await p.runnerRoutes({method,headers},r,'/runner/'+c.agent.id+'/'+action,{});return result;}
 const alias='https://'+PREVIEW_HOST,dep='https://'+DEPLOY_HOST;
 assert.equal((await call('session','GET',alias)).code,200,'preview branch alias origin must pass GET session');
 assert.equal((await call('session','GET',dep)).code,200,'preview deployment URL origin must pass GET session');
 assert.equal((await call('gateway/presence','POST',alias,{'x-alter-csrf':out.csrf})).code,200,'presence via branch alias must pass');
 assert.equal((await call('gateway/presence','POST',dep,{'x-alter-csrf':out.csrf})).code,200,'presence via deployment URL must pass');
 const claim=await call('gateway/tasks/next','GET',alias,{'x-alter-csrf':out.csrf});assert.notEqual(claim.code,403,'task claim read via branch alias must not be origin-blocked');
 const report=await call('gateway/tasks/task_none/complete','POST',alias,{'x-alter-csrf':out.csrf});assert.notEqual(report.code,403,'task report via branch alias must not be origin-blocked');
 assert.equal((await call('session','GET','https://evil.test')).code,403,'untrusted origin refused on GET');
 assert.equal((await call('gateway/presence','POST','https://evil.test',{'x-alter-csrf':out.csrf})).code,403,'untrusted origin refused on POST');
 assert.equal((await call('gateway/presence','POST','https://attacker-controlled-host.example',{'x-alter-csrf':out.csrf})).code,403,'spoofed host-derived origin refused');
 assert.equal((await call('gateway/presence','POST',alias)).code,403,'CSRF still required on POST');
 assert.equal((await call('gateway/presence','POST',alias,{'x-alter-csrf':out.csrf,'sec-fetch-site':'cross-site'})).code,403,'cross-site still refused');
 // Prod deployment: preview hostnames must NOT be trusted; prod origins unchanged.
 const d=boot({});
 let c2;await d.als.run({ws:'po_prod'},async()=>{c2=await d.createAgent('Test','Ops','custom',false,{});});
 let h2={};const res2={setHeader(k,v){h2[k]=v}};const out2=await d.startRunnerSession(res2,'po_prod',c2.agent.id,c2.key);const ck2=h2['Set-Cookie'].split(';')[0];
 async function call2(action,method,origin,extra={}){let result;const r={setHeader(){},status(c){this.code=c;return this},json(j){result={code:this.code||200,j};return result}};await d.runnerRoutes({method,headers:{cookie:ck2,origin,...extra}},r,'/runner/'+c2.agent.id+'/'+action,{});return result;}
 assert.equal((await call2('gateway/presence','POST',alias,{'x-alter-csrf':out2.csrf})).code,403,'prod must refuse preview branch alias origin');
 assert.equal((await call2('gateway/presence','POST','https://foreman-core.vercel.app',{'x-alter-csrf':out2.csrf})).code,200,'prod origin still accepted on prod');
 assert.equal((await call2('gateway/presence','POST','https://www.alterhq.app',{'x-alter-csrf':out2.csrf})).code,200,'public origin still accepted on prod');
 console.log('PASS runner preview origin: alias+deployment origins trusted on preview, spoof/untrusted refused, CSRF+cross-site retained, prod unchanged. No network.');
})().catch(e=>{console.error(e);process.exit(1)});
