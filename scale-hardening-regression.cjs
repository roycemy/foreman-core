// 100-user hardening (Royce, Oct 19), free only:
// - heartbeat economy: a beat stamps fm:seen but the event feed hears only about a resume after 10+ min away
// - console heartbeat thinned to 60s; the flat dark rule follows at 150s (2.5 missed beats), never dark between beats
// - fixed-window IP bucket on the public /connect write (pairing redeem already had gl:pairRate, 10/min/IP)
const fs=require('fs'),vm=require('vm'),assert=require('assert');
let src=fs.readFileSync(require('path').join(__dirname,'api/index.js'),'utf8');
src+='\nmodule.exports.t={runnerPresenceAccepted,ipRateLimited,getJ,setJ,r,als,mem};';
const ctx={require,module:{exports:{}},process:{env:{}},global:{},console,fetch:()=>{throw Error('NETWORK FORBIDDEN')},setTimeout,clearTimeout,URL,AbortSignal};
vm.runInNewContext(src,ctx);const f=ctx.module.exports.t;
const evCount=async()=>(await f.r(['LRANGE','fm:events',0,299])).length;
(async()=>{await f.als.run({ws:'t'},async()=>{
 // 1. first beat after silence writes one resume event; the steady pulse writes nothing more
 await f.setJ('fm:agent:a1',{id:'a1',name:'Bot',status:'active'});
 const before=await evCount();
 await f.runnerPresenceAccepted({id:'a1',status:'active'});
 assert.equal(await evCount(),before+1,'first presence after silence is a feed-worthy resume');
 await f.runnerPresenceAccepted({id:'a1',status:'active'});
 await f.runnerPresenceAccepted({id:'a1',status:'active'});
 assert.equal(await evCount(),before+1,'steady pulse stays out of the feed');
 assert.ok(await f.r(['GET','fm:seen:a1']),'every beat still stamps lastSeen');
 // 2. a return after 10+ minutes away is a fresh resume event
 await f.r(['SET','fm:seen:a1',new Date(Date.now()-660000).toISOString()]);
 await f.runnerPresenceAccepted({id:'a1',status:'active'});
 assert.equal(await evCount(),before+2,'resume after 10+ min is feed-worthy again');
 // 3. IP bucket: first N allowed, then limited; a different IP or window is fresh
 for(let i=0;i<30;i++)assert.equal(await f.ipRateLimited('connect','1.2.3.4',30,3600),false,'attempt '+i+' allowed');
 assert.equal(await f.ipRateLimited('connect','1.2.3.4',30,3600),true,'31st connect attempt in the hour is limited');
 assert.equal(await f.ipRateLimited('connect','5.6.7.8',30,3600),false,'different IP is fresh');
 console.log('PASS scale hardening: resume-only presence events, lastSeen still stamped every beat, connect IP bucket opens at 30/hr.');
});})().catch(e=>{console.error(e);process.exit(1)});
// source contract
const api=src,rh=fs.readFileSync(require('path').join(__dirname,'public/runner.html'),'utf8'),cj=fs.readFileSync(require('path').join(__dirname,'public/js/core.js'),'utf8');
assert.ok(api.includes('await runnerPresenceAccepted(agent)'),'presence route uses the resume-only helper');
assert.ok(!api.includes('Runner presence accepted'),'no per-beat feed event remains');
assert.ok(api.includes("ipRateLimited('connect',_ip,30,3600)"),'/connect is bucketed at 30/hr/IP');
assert.ok(api.includes("gl:pairRate:"),'pairing redeem keeps its existing 10/min IP bucket');
assert.ok(api.includes('staleAfterSeconds:150'),'session-restore staleness follows the 60s heartbeat');
assert.ok(!rh.includes('setInterval(presence,30000)'),'console heartbeat thinned to 60s');
assert.ok(rh.includes('setInterval(presence,120000)'),'2-minute heartbeat in place');
assert.ok(cj.includes('BB.DARK_MS = 150000'),'flat dark rule is 150s (2.5 missed 60s beats)');
assert.ok(!/2 \* ps \* 1000 : 60000/.test(cj),'old flat 60s rule gone');
