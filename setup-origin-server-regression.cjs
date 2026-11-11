// Item H: server-built setup links (bot pairing message and link, the pairing steps a bot fetches, the re-paste message, and the
// Connect runner instructions) named the live site even on a Preview, so a bot paired from a Preview was sent to production, whose
// store never issued its code or key. They now use the request's own origin on non-production hosts and the live site on production
// hosts. Remote MCP and OAuth stay production-only (their issuer is the live site). A malformed Host falls back to the live site.
// Real handler; memory store; offline.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const src=fs.readFileSync(__dirname+'/api/index.js','utf8')+'\nmodule.exports.t={setJ,als,createAgent};';
const quiet={...console,log(){},warn(){},error(){}};
const ctx={require,module:{exports:{}},process:{env:{}},global:{},console:quiet,fetch:()=>{throw Error('NO NETWORK')},setTimeout,clearTimeout,URL,URLSearchParams,Buffer,AbortSignal};vm.runInNewContext(src,ctx);const h=ctx.module.exports,f=h.t;
const LIVE='https://www.alterhq.app',PREVIEW_HOST='foreman-core-git-fix-email-loop-example.vercel.app',PREVIEW='https://'+PREVIEW_HOST;
const sh=s=>crypto.createHash('sha256').update(s).digest('hex');
async function call(host,url,method='GET',body={},headers={}){let out={};await h({url,method,body,headers:{host,...headers}},{setHeader(){},status(n){this.code=n;return this},json(j){out={code:this.code||200,j}},send(x){out={code:this.code,j:x}},end(){}});return out}
(async()=>{
 await f.setJ('gl:sess:'+sh('sess-h'),{uid:'u1',email:'owner@example.test',ws:'wsH'});await f.setJ('gl:user:'+sh('owner@example.test'),{id:'u1',email:'owner@example.test',ws:'wsH'});
 const C={cookie:'fm_sess=sess-h'};
 async function pairingOn(host,origin){const csrf=(await call(host,'/api/botlink/csrf','GET',{},C)).j.csrf;const W={...C,'x-alter-csrf':csrf,origin};
  const p=await call(host,'/api/botlink/pairings','POST',{type:'muse'},W);assert.equal(p.code,200,host+': '+JSON.stringify(p.j));return {p:p.j,W};}
 const urlsIn=x=>(JSON.stringify(x).match(/https?:\/\/[a-z0-9.:-]+/g)||[]);
 // ---- Preview: every setup link names the Preview itself
 {const {p}=await pairingOn(PREVIEW_HOST,PREVIEW);assert.ok(p.link.startsWith(PREVIEW+'/'),'the pairing link is the Preview ('+p.link+')');assert.ok(p.message.includes(PREVIEW),'the setup message names the Preview');
  assert.ok(!p.message.includes(LIVE),'and not the live site');
  const st=await call(PREVIEW_HOST,'/api/pair/'+p.pairingId);assert.equal(st.code,200);assert.ok(st.j.steps.filter(s=>s.url).every(s=>s.url.startsWith(PREVIEW+'/')),'the pairing steps point back at the Preview');
  const cn=await call(PREVIEW_HOST,'/api/connect','POST',{provider:'custom',name:'Preview bot',connectionMode:'existing'},{...C,origin:PREVIEW});assert.equal(cn.code,200,JSON.stringify(cn.j));
  assert.ok(cn.j.runnerUrl.startsWith(PREVIEW+'/runner?agent='),'the runner link is the Preview');assert.ok(cn.j.instructions.includes(PREVIEW+'/runner?agent='),'the Connect instructions open the Preview runner');
  assert.equal(cn.j.mcpUrl,LIVE+'/api/mcp','Remote MCP stays production-only');}
 // ---- production hosts are unchanged: the live site
 for(const host of ['www.alterhq.app','alterhq.app','foreman-core.vercel.app']){const origin='https://'+host;const {p}=await pairingOn(host,origin);
  assert.ok(p.link.startsWith(LIVE+'/'),host+': the pairing link is the live site');const st=await call(host,'/api/pair/'+p.pairingId);assert.ok(st.j.steps.filter(s=>s.url).every(s=>s.url.startsWith(LIVE+'/')),host+': steps on the live site');
  const cn=await call(host,'/api/connect','POST',{provider:'custom',name:'Live bot',connectionMode:'existing'},{...C,origin});assert.ok(cn.j.runnerUrl.startsWith(LIVE+'/runner'),host+': runner on the live site');assert.equal(cn.j.mcpUrl,LIVE+'/api/mcp');}
 // ---- the re-paste message for a paired bot follows the same rule
 {const pv=await pairingOn(PREVIEW_HOST,PREVIEW); // re-paste needs a paired bot: pair one through the real flow on the Preview
  const secret='s_'+crypto.randomBytes(16).toString('hex');await call(PREVIEW_HOST,'/api/pair/'+pv.p.pairingId,'POST',{nonce:crypto.randomBytes(12).toString('hex'),callerSecret:secret},{'user-agent':'fixture/1.0'});
  assert.equal((await call(PREVIEW_HOST,'/api/botlink/pairings/'+pv.p.pairingId+'/approve','POST',{},pv.W)).code,200);const k=await call(PREVIEW_HOST,'/api/pair/'+pv.p.pairingId,'GET',{},{authorization:'Pairing '+secret});assert.equal(k.code,200);
  const rp=await call(PREVIEW_HOST,'/api/botlink/bots/'+k.j.botId+'/repaste','POST',{},pv.W);assert.equal(rp.code,200,JSON.stringify(rp.j));assert.ok(rp.j.link.startsWith(PREVIEW+'/')&&!rp.j.message.includes(LIVE),'the re-paste message names the Preview');
  const rpLive=await call('www.alterhq.app','/api/botlink/bots/'+k.j.botId+'/repaste','POST',{},{...C,'x-alter-csrf':pv.W['x-alter-csrf'],origin:LIVE});assert.ok(rpLive.j.link.startsWith(LIVE+'/'),'and the live site on production');}
 // ---- a malformed Host cannot inject a link target
 {const {p}=await pairingOn('localhost:3000','http://localhost:3000');assert.ok(p.link.startsWith('http://localhost:3000/'),'local dev uses its own http origin');
  for(const host of ['evil.example/phish','a b','x"onload=1',''])assert.ok(urlsIn((await call(host,'/api/connect','POST',{provider:'custom',name:'X',connectionMode:'existing'},{...C,origin:'https://'+host})).j).every(u=>!u.includes('evil')&&!u.includes('onload')),'malformed host '+JSON.stringify(host)+' never reaches a link');}
 // ---- MCP discovery and OAuth stay on production regardless of host
 {const wk=await call(PREVIEW_HOST,'/.well-known/oauth-protected-resource');if(wk.code===200)assert.ok(urlsIn(wk.j).every(u=>!u.includes(PREVIEW_HOST)),'OAuth metadata never names the Preview');}
 console.log('PASS setup origin: on a Preview the pairing link and message, the pairing steps, the re-paste message and the Connect runner link and instructions all name the Preview; production hosts keep the live site; Remote MCP and OAuth stay production-only; a malformed Host never reaches a link');
})().catch(e=>{console.error(e);process.exit(1)});
