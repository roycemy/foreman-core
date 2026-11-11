// D1: GET /api/cron/business-daily (scheduled daily in vercel.json) crashed after a successful CRON_SECRET check: it called send(),
// which exists only inside routes(), so every authorized run answered 500 "send is not defined" and the daily tick never ran.
// The route must run bizDailyTick and answer with its result; a wrong or missing bearer is still 401, and no secret configured is 401.
// Real handler, in-memory store, offline.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8');
function load(env){const ctx={require,module:{exports:{}},process:{env},global:{},console:{...console,log(){},warn(){},error(){}},fetch:async u=>{throw Error('NO NETWORK '+u)},setTimeout,clearTimeout,URL,AbortSignal,Buffer};vm.runInNewContext(src,ctx);return ctx.module.exports;}
async function call(h,headers){let out;const res={setHeader(){},status(c){this.code=c;return this},json(j){out={code:this.code||200,j}},send(b){out={code:this.code||200,j:b}},end(){out={code:this.code||204}}};
 await h({method:'GET',url:'/api/cron/business-daily',headers:{host:'localhost',...headers},body:{}},res);return out||{code:0};}
(async()=>{
 const h=load({CRON_SECRET:'local-cron-secret'});
 const ok=await call(h,{authorization:'Bearer local-cron-secret'});
 assert.equal(ok.code,200,'an authorized cron run succeeds ('+JSON.stringify(ok.j)+')');
 assert.ok(ok.j&&typeof ok.j==='object'&&!ok.j.error,'it answers with the daily tick result, not an error');
 assert.equal((await call(h,{authorization:'Bearer wrong-secret'})).code,401,'a wrong bearer is refused');
 assert.equal((await call(h,{})).code,401,'a missing bearer is refused');
 assert.equal((await call(load({}),{authorization:'Bearer '})).code,401,'no CRON_SECRET configured: refused');
 console.log('PASS cron route: an authorized GET /api/cron/business-daily runs the daily tick and answers 200 with its result; wrong, missing or unconfigured secrets get 401');
})().catch(e=>{console.error(e);process.exit(1)});
