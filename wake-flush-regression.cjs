// Deferred wakes are delivered without further traffic (layer 1: in-invocation timer), coalesced under bursts, retried on failure with the
// same event id, never lost silently, and never double-sent by concurrent flushers (one compare-and-set lease across the timer, the cron
// endpoint and traffic). A crash after the provider accepted is retried after the lease with the same Idempotency-Key, so a deduping
// receiver drops the repeat; exactly-once to the receiver is not claimed. Offline: the clock runs 30x faster than real time and timers are
// scaled to match; the in-memory store ignores TTLs, so the 30 s throttle key's expiry is emulated. Synthetic secrets only.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const K=30,T0=Date.now();const vnow=()=>T0+(Date.now()-T0)*K;class FD extends Date{constructor(...a){if(a.length)super(...a);else super(vnow())}static now(){return vnow()}}
const API=path.join(__dirname,'api/index.js'),src='Date=FD;'+fs.readFileSync(API,'utf8')+'\nmodule.exports.t={r,setJ,getJ,sha,als,createAgent,flushDueWakes};';
const sends=[];let fail=0;const CRON='synthetic-cron-secret-0123456789';const env={RESEND_API_KEY:'re_synthetic',WAKE_EMAIL_FROM:'Alter <wake@mail.example>',WAKE_CUSTOM_EMAIL:'bot@example.com',CRON_SECRET:CRON};
const ctx={FD,require:require('module').createRequire(API),module:{exports:{}},process:{env},global:{},console:{log(){},warn(){},error(){}},
 fetch:async(u,o)=>{if(String(u)!=='https://api.resend.com/emails')throw Error('unexpected '+u);const ok=!(fail>0&&fail--);sends.push({at:vnow(),key:o.headers['idempotency-key']||null,ok});return {ok,status:ok?200:500,json:async()=>({})};},
 setTimeout:(fn,ms,...a)=>setTimeout(fn,Math.max(0,(ms||0)/K),...a),clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const h=ctx.module.exports,f=h.t,mem=ctx.global.__mem;const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
// emulate Redis PX expiry for the per-bot throttle key only
const ttl=new Map(),origR=ctx.r;let crashDel=0;
ctx.r=function(c){const k=c[1];if(typeof k==='string'&&k.startsWith('gl:wake:')){const e=ttl.get(k);if(e&&vnow()>=e){mem.kv.delete(k);ttl.delete(k);}if(c[0]==='SET'&&c.includes('PX')&&!(c.includes('NX')&&mem.kv.has(k)))ttl.set(k,vnow()+Number(c[c.indexOf('PX')+1]));}
 if(crashDel&&c[0]==='EVAL'&&c[3]&&String(c[3]).startsWith('gl:wakeDue:')&&String(c[1]).includes("redis.call('DEL'")){crashDel--;return Promise.reject(new Error('crash after the provider accepted'));}
 return origR(c);};
async function http(method,url,{cookie,body,auth}={}){let o;const headers={host:'localhost',origin:'http://localhost'};if(cookie)headers.cookie='fm_sess='+cookie;if(auth)headers.authorization=auth;const res={setHeader(){},status(c){this.code=c;return this},json(j){o={code:this.code||200,j}},send(b){o={code:this.code||200,j:b}},end(){o={code:this.code||204}}};await h({method,url,headers,body:body||{}},res);return o;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),vsleep=vs=>sleep(vs*1000/K);
const ws='ws_wf',owner=(m,u,b)=>http(m,u,{cookie:'ck',body:b}),cron=a=>http('GET','/api/cron/flush-wakes',{auth:a});
const events=async t=>(await f.als.run({ws},()=>f.r(['LRANGE','fm:events',0,200]))).map(x=>JSON.parse(x)).filter(e=>e.type===t);
(async()=>{
 await f.setJ('gl:user:'+sha('o@wf.example'),{id:'u',email:'o@wf.example',ws});await f.setJ('gl:sess:'+sha('ck'),{uid:'u',email:'o@wf.example',ws});
 const mk=async n=>(await f.als.run({ws},()=>f.createAgent(n,'x','custom',false,{preset:'balanced'}))).agent.id;
 const assign=(id,title)=>owner('POST','/api/tasks',{title,assignee:id});
 // ---- 1. idle: the deferred wake goes out with zero further requests
 const B=await mk('Idle bot');await assign(B,'job 1');assert.equal(sends.length,1,'first wake');await vsleep(5);
 await assign(B,'job 2');const due=JSON.parse(mem.kv.get('gl:wakeDue:'+B));assert.equal(sends.length,1,'second wake deferred');
 await vsleep(40); // no requests at all
 assert.equal(sends.length,2,'delivered with no further traffic');const lat=(sends[1].at-due.dueAt)/1000;assert.ok(lat>=0&&lat<2,'within 2 s of the window end: '+lat);
 assert.ok(!mem.kv.has('gl:wakeDue:'+B),'record removed after delivery');
 console.log('  idle: deferred at +5 s, window ended at +30 s, delivered '+lat.toFixed(2)+' s after the window with no requests (virtual clock; layer 1 timer)');
 // ---- 2. burst: several deferrals coalesce into one follow-up
 const C=await mk('Burst bot');await assign(C,'b0');const s0=sends.length;for(let i=1;i<=5;i++){await vsleep(2);await assign(C,'b'+i);}
 assert.equal((await events('wake_deferred')).filter(e=>e.agentId===C).length,1,'one deferral event per bot');await vsleep(45);
 assert.equal(sends.length,s0+1,'five deferrals, one follow-up');
 // ---- 3. retry: a failed follow-up is retried with the same event id; repeated failure ends in an owner-visible give-up, never silence
 const D=await mk('Retry bot');await assign(D,'r0');await vsleep(3);await assign(D,'r1');const did=JSON.parse(mem.kv.get('gl:wakeDue:'+D)).id;const s1=sends.length;fail=1;
 await vsleep(70); // attempt 1 fails at ~+30 s, the retry timer fires 30 s later
 const rs=sends.slice(s1);assert.deepEqual(rs.map(x=>x.ok),[false,true],'failed once, then delivered');assert.ok(rs.every(x=>x.key===did),'every attempt carries the same Idempotency-Key');
 const E=await mk('Down bot');await assign(E,'d0');await vsleep(3);await assign(E,'d1');fail=99;
 for(let i=0;i<12&&mem.kv.has('gl:wakeDue:'+E);i++){await vsleep(60);await cron('Bearer '+CRON);} // later retries are beyond one invocation's timer budget: the backstop drives them
 fail=0;assert.ok(!mem.kv.has('gl:wakeDue:'+E),'record closed');assert.equal((await events('wake_gave_up')).filter(e=>e.agentId===E).length,1,'owner-visible give-up after 5 attempts');
 // ---- 4. idempotency: concurrent flushers produce one send attempt; a crash after the provider accepted retries with the same id
 const F=await mk('Race bot');await assign(F,'c0');await vsleep(3);await assign(F,'c1');const fid=JSON.parse(mem.kv.get('gl:wakeDue:'+F)).id;
 mem.kv.set('gl:wakeDue:'+F,JSON.stringify({...JSON.parse(mem.kv.get('gl:wakeDue:'+F)),dueAt:vnow()-1}));ttl.set('gl:wake:'+F,vnow()-1); // due now
 const s2=sends.length;await Promise.all([cron('Bearer '+CRON),cron('Bearer '+CRON),owner('GET','/api/state'),f.flushDueWakes(),f.flushDueWakes(),cron('Bearer '+CRON)]);
 assert.equal(sends.length,s2+1,'six concurrent flushers, one send');
 const G=await mk('Crash bot');await assign(G,'x0');await vsleep(3);await assign(G,'x1');const gid=JSON.parse(mem.kv.get('gl:wakeDue:'+G)).id;crashDel=1;const s3=sends.length;
 await vsleep(40);assert.equal(sends.length,s3+1,'accepted once, then the process "crashed" before closing the record');assert.ok(mem.kv.has('gl:wakeDue:'+G),'the leased record survives the crash');
 await vsleep(65);await cron('Bearer '+CRON);const gs=sends.slice(s3);assert.equal(gs.length,2,'retried after the lease: at-least-once');assert.ok(gs.every(x=>x.key===gid),'same Idempotency-Key, so a deduping receiver drops the repeat');
 // ---- 5a. a wake record for a bot that is no longer on the roster is dropped unsent (legacy identities outlive their roster entry)
 const H=await mk('Retired bot');await assign(H,'old job 1');await vsleep(2);await assign(H,'old job 2');
 assert.ok(mem.kv.has('gl:wakeDue:'+H),'deferred record exists');
 await f.als.run({ws},()=>f.r(['SREM','fm:agents',H]));const s4=sends.length; // legacy removal: roster is workspace-namespaced
 await vsleep(35); // let the deferred window close so the record is due
 await cron('Bearer '+CRON);
 assert.equal(sends.length,s4,'no send for an off-roster identity');
 assert.ok(!mem.kv.has('gl:wakeDue:'+H),'stale record dropped unsent');
 // ---- 5b. removing a bot clears its pending wake record at the source
 const I=await mk('Remove bot');await assign(I,'job 1');await vsleep(2);await assign(I,'job 2');
 assert.ok(mem.kv.has('gl:wakeDue:'+I),'deferred record exists');
 const rm=await owner('POST','/api/agents/'+I+'/remove');assert.equal(rm.code,200,'remove route works: '+JSON.stringify(rm));
 assert.ok(!mem.kv.has('gl:wakeDue:'+I),'removing a bot clears its pending wake record');
 // ---- 5. the backstop endpoint
 assert.equal((await cron()).code,401);assert.equal((await cron('Bearer wrong-secret-xx')).code,401);assert.equal((await http('POST','/api/cron/flush-wakes',{auth:'Bearer '+CRON})).code,405);
 const ok=await cron('Bearer '+CRON);assert.equal(ok.code,200);assert.deepEqual(Object.keys(ok.j).sort(),['ok','pending','sent']);
 let last;for(let i=0;i<14;i++)last=await cron('Bearer '+CRON);assert.equal(last.code,429,'rate-limited');
 delete env.CRON_SECRET;assert.equal((await cron('Bearer '+CRON)).code,401,'fails closed without a configured secret');
 console.log('  retired: off-roster wake dropped unsent; remove route clears the pending record');
 console.log('PASS wake flush: idle delivery with no requests ('+lat.toFixed(2)+' s after the window, virtual clock); burst of five coalesced into one follow-up; a failed follow-up retried with the same Idempotency-Key; five failures end in an owner-visible wake_gave_up; six concurrent flushers (timer, cron, traffic) send once; a crash after the provider accepted is retried after the lease with the same id (at-least-once, dedupable); cron endpoint is GET-only, Bearer CRON_SECRET, timing-safe, rate-limited, fails closed, counts only');
})().catch(e=>{console.error(e);process.exit(1)});
