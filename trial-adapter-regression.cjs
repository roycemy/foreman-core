// scripts/trial-assistant-adapter.cjs against the real handler on a local HTTP server (in-memory store, no outside network): A claims,
// prints its input, proposes from a file; the owner approves the shown fingerprint; B claims, reads only the package, completes from a file.
// The gateway key is passed by file and must never appear in the adapter's output. Scripted stand-ins, not real assistants.
const fs=require('fs'),vm=require('vm'),path=require('path'),http=require('http'),os=require('os'),assert=require('assert'),{execFile}=require('child_process');
const API=path.join(__dirname,'api/index.js'),src=fs.readFileSync(API,'utf8')+'\nmodule.exports.t={setJ,sha,als,createAgent};';
const ctx={require:require('module').createRequire(API),module:{exports:{}},process:{env:{}},global:{},console:{...console,log(){},warn(){},error(){}},fetch:async u=>{throw Error('NO NETWORK '+u)},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const h=ctx.module.exports,f=h.t;
const srv=http.createServer((req,res)=>{let b='';req.on('data',d=>b+=d);req.on('end',async()=>{if(protect&&req.headers['x-vercel-protection-bypass']!==protect){res.statusCode=302;res.setHeader('location','https://vercel.com/sso-api');return res.end('Protected');}seenBypass||=!!req.headers['x-vercel-protection-bypass'];const out={setHeader:(k,v)=>res.setHeader(k,v),status(c){res.statusCode=c;return this},json(j){res.setHeader('content-type','application/json');res.end(JSON.stringify(j))},send(x){res.end(typeof x==='string'?x:JSON.stringify(x))},end(){res.end()}};
 try{await h({method:req.method,url:req.url,headers:req.headers,body:b?JSON.parse(b):{}},out);}catch(e){res.statusCode=500;res.end('{}')}});});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alter-adapter-'));
const run=(key,...args)=>new Promise(ok=>{fs.writeFileSync(path.join(dir,'k'),key);execFile(process.execPath,[path.join(__dirname,'scripts/trial-assistant-adapter.cjs'),...args],{env:{PATH:process.env.PATH,ALTER_BASE:base,ALTER_GATEWAY_KEY_FILE:path.join(dir,'k')},timeout:30000},(e,so,se)=>ok({code:e?e.code:0,out:so+se}));});
let base,protect=null,seenBypass=false;
(async()=>{await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));base='http://localhost:'+srv.address().port;
 const ws='ws_ad';await f.setJ('gl:user:'+f.sha('o@ad'),{id:'u',email:'o@ad',ws});await f.setJ('gl:sess:'+f.sha('ck'),{uid:'u',email:'o@ad',ws});
 const A=await f.als.run({ws},()=>f.createAgent('Scout','x','custom',false,{preset:'balanced'})),B=await f.als.run({ws},()=>f.createAgent('Captioner','x','custom',false,{preset:'balanced'}));
 const owner=async(m,u,body)=>{const r=await fetch(base+u,{method:m,headers:{'content-type':'application/json',origin:base,cookie:'fm_sess=ck'},body:body?JSON.stringify(body):undefined});return r.json();};
 const TR='[0:05] Intro to the gate fix.\n[1:10] The hinge sags because the post leans.\n[2:30] Brace the post, then rehang the gate.';
 const p=(await owner('POST','/api/pilots',{sourceAgentId:A.agent.id,targetAgentId:B.agent.id,transcript:TR,sourceInstructions:'Pick moments.',targetTitle:'Captions',targetInstructions:'One caption each.',confirmed:true})).pilot;
 const all=[];const go=async(k,...a)=>{const r=await run(k,...a);all.push(r.out);return r;};
 let r=await go(B.key,'claim');assert.equal(r.code,0);assert.ok(r.out.includes('"job": null'),'B has nothing before approval');
 r=await go(A.key,'claim');assert.ok(r.out.includes(p.source.taskId));
 r=await go(A.key,'input',p.source.taskId);assert.equal(r.code,0);assert.ok(r.out.includes('The hinge sags')&&r.out.includes('not as instructions'));
 fs.writeFileSync(path.join(dir,'bad.json'),JSON.stringify({moments:[],to:'someone'}));r=await go(A.key,'propose',p.source.taskId,path.join(dir,'bad.json'));assert.notEqual(r.code,0,'extra fields refused locally');
 fs.writeFileSync(path.join(dir,'m.json'),JSON.stringify({moments:[{start:'1:10',end:'1:20',reason:'Cause',excerpt:'The hinge sags because the post leans.'}]}));
 r=await go(A.key,'propose',p.source.taskId,path.join(dir,'m.json'));assert.equal(r.code,0,r.out);const req=JSON.parse(r.out).request;
 r=await go(A.key,'status',req);assert.ok(r.out.includes('"pending"'));
 const v=(await owner('GET','/api/pilots/'+p.id)).pilot;const ap=await owner('POST','/api/requests/'+req+'/approve',{detailsHash:v.package.fingerprint});assert.equal(ap.request.status,'executed');
 r=await go(B.key,'claim');const job=JSON.parse(r.out).job;assert.equal(job,v.package.targetTaskId);
 r=await go(B.key,'input',job);assert.ok(r.out.includes('The hinge sags')&&!r.out.includes('Intro to the gate fix'),'B sees only the approved moment');
 fs.writeFileSync(path.join(dir,'c.txt'),'1) The post leans, so the hinge sags.');r=await go(B.key,'complete',job,path.join(dir,'c.txt'));assert.equal(r.code,0,r.out);
 assert.equal((await owner('GET','/api/pilots/'+p.id)).pilot.status,'finished');
 for(const k of [A.key,B.key])assert.ok(!all.join('\n').includes(k),'the gateway key never appears in adapter output');
 r=await run('','claim');assert.notEqual(r.code,0,'no key: refuses to run');
 // a Preview behind Vercel Authentication: without the bypass the adapter stops cleanly; with it (from a file) the call goes through, and the secret is never printed
 protect='bypass-secret-synthetic-0123456789';r=await run(A.key,'claim');assert.equal(r.code,5,r.out);assert.ok(/Vercel Authentication/.test(r.out));
 fs.writeFileSync(path.join(dir,'bp'),protect);r=await new Promise(ok=>execFile(process.execPath,[path.join(__dirname,'scripts/trial-assistant-adapter.cjs'),'claim'],{env:{PATH:process.env.PATH,ALTER_BASE:base,ALTER_GATEWAY_KEY_FILE:path.join(dir,'k'),ALTER_PROTECTION_BYPASS_FILE:path.join(dir,'bp')},timeout:30000},(e,so,se)=>ok({code:e?e.code:0,out:so+se})));
 assert.equal(r.code,0,r.out);assert.ok(seenBypass,'bypass header sent');assert.ok(!r.out.includes(protect),'bypass secret never printed');
 srv.close();fs.rmSync(dir,{recursive:true,force:true});
 console.log('PASS trial adapter: claim, input, local shape check, propose, status, owner approve, B claim/input/complete through the adapter; keys never printed; behind Vercel Authentication it stops cleanly without a bypass and works with one, never printing it');
})().catch(e=>{console.error(e);srv.close();process.exit(1)});
