// scripts/trial-assistant-adapter.cjs and Vercel's protection-bypass header. The header is sent ONLY when ALTER_PROTECTION_BYPASS or
// ALTER_PROTECTION_BYPASS_FILE is set, and the value never appears in stdout or stderr on any path: success, 3xx refusal, 4xx refusal,
// network error, local validation error. A local stub server records headers; no outside network. Synthetic secret values only.
const fs=require('fs'),path=require('path'),http=require('http'),os=require('os'),assert=require('assert'),{execFile}=require('child_process');
const ADAPTER=path.join(__dirname,'scripts/trial-assistant-adapter.cjs');
const BYPASS='synthetic-bypass-value-7f3a9c0e1d2b',KEY='fmk_'+'0'.repeat(40);
let mode='ok',seen=[];
const srv=http.createServer((req,res)=>{seen.push({url:req.url,bypass:req.headers['x-vercel-protection-bypass']});req.resume();req.on('end',()=>{
 if(mode==='redirect'){res.writeHead(302,{location:'https://vercel.com/sso-api?x='+encodeURIComponent(req.headers['x-vercel-protection-bypass']||'')});return res.end('Protected by Vercel Authentication');}
 if(mode==='refuse'){res.writeHead(403,{'content-type':'application/json'});return res.end(JSON.stringify({status:'blocked',reason:'echo:'+(req.headers['x-vercel-protection-bypass']||'')}));}
 res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({task:null}));});});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alter-bypass-'));fs.writeFileSync(path.join(dir,'k'),KEY);fs.writeFileSync(path.join(dir,'bp'),BYPASS+'\n');
let base;
const run=(env,...args)=>new Promise(ok=>execFile(process.execPath,[ADAPTER,...args],{env:{PATH:process.env.PATH,ALTER_BASE:base,ALTER_GATEWAY_KEY_FILE:path.join(dir,'k'),...env},timeout:30000},(e,so,se)=>ok({code:e?e.code:0,out:String(so)+String(se)})));
const noLeak=(r,label)=>{assert.ok(!r.out.includes(BYPASS),label+': bypass value printed');assert.ok(!r.out.includes(KEY),label+': key printed');};
(async()=>{await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));base='http://localhost:'+srv.address().port;
 const cases=[['unset',{}],['env',{ALTER_PROTECTION_BYPASS:BYPASS}],['file',{ALTER_PROTECTION_BYPASS_FILE:path.join(dir,'bp')}],['empty env',{ALTER_PROTECTION_BYPASS:''}]];
 for(const [label,env] of cases){
  const want=label==='env'||label==='file'?BYPASS:undefined;
  for(const m of ['ok','redirect','refuse']){mode=m;seen=[];const r=await run(env,'claim');
   assert.equal(seen.length,1,label+'/'+m+': one request, no redirect followed ('+seen.length+')');assert.equal(seen[0].bypass,want,label+'/'+m+': header '+(want?'sent with the exact value':'absent'));
   assert.equal(r.code,m==='ok'?0:m==='redirect'?5:4,label+'/'+m+': exit code ('+r.out+')');noLeak(r,label+'/'+m);
   if(m==='redirect')assert.ok(/Vercel Authentication/.test(r.out),'the 3xx refusal explains itself');}
  // other commands on the same paths
  mode='refuse';seen=[];noLeak(await run(env,'input','task_x'),label+'/input');noLeak(await run(env,'status','req_x'),label+'/status');
  fs.writeFileSync(path.join(dir,'m.json'),'{"moments":[]}');noLeak(await run(env,'propose','task_x',path.join(dir,'m.json')),label+'/propose');
  fs.writeFileSync(path.join(dir,'c.txt'),'caption');noLeak(await run(env,'complete','task_x',path.join(dir,'c.txt')),label+'/complete');
  for(const s of seen)assert.equal(s.bypass,want,label+': every command sends the header only when set');
  // local validation errors and a network error print nothing secret either
  noLeak(await run(env,'propose','task_x'),label+'/usage');noLeak(await run(env,'bogus'),label+'/unknown');
  noLeak(await run({...env,ALTER_BASE:'http://localhost:1'},'claim'),label+'/network');}
 const src=fs.readFileSync(ADAPTER,'utf8');assert.ok(!/console\.(log|error|warn)\([^)]*BYPASS/.test(src)&&!/die\([^)]*BYPASS/.test(src),'no output call references the bypass value');
 srv.close();fs.rmSync(dir,{recursive:true,force:true});
 console.log('PASS adapter bypass header: sent with the exact value only when ALTER_PROTECTION_BYPASS or _FILE is set (absent when unset or empty); one request per call, redirects not followed; the value never appears in output on success, 3xx refusal, 4xx refusal, usage errors or network errors');
})().catch(e=>{console.error(e);srv.close();process.exit(1)});
