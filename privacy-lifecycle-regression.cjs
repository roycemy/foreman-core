// Privacy repair round 2: reviewer reproductions for PR #116 HOLD.
//  1. Orphaned run objects (fell out of the trimmed index) are deleted by resp delete AND purge.
//  2. A paused in-flight run/discover cannot recreate records after a successful purge (fence).
//  3. Partial failures: source delete and purge report a truthful incomplete state; retry finishes.
//  4. IPv6 loopback/private, internal DNS suffixes and redirects are refused for the engine.
// No real network: model endpoint stubbed with a controllable deferred fetch.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={bizSourceAdd,bizSourceDel,bizDiscover,bizProposalAct,bizRespAct,bizDataPurge,bizConsentAct,bizState,bizEngine,bizRunKeysAll,als,setJ,getJ,r};';
let gate=null; // {promise,open} - when set, the stubbed provider call waits for open()
const seen=[];
const c={require,module:{exports:{}},process:{env:{}},global:{},console,URL,Buffer,AbortSignal,setTimeout,clearTimeout,
 fetch:(u,o)=>{seen.push(String(u));
  const respond=()=>{const body=JSON.parse(o.body);
   const reply=content=>({ok:true,status:200,json:async()=>({choices:[{message:{content}}],usage:{}})});
   if(c.process.env.REDIRECT_ONCE){delete c.process.env.REDIRECT_ONCE;return {ok:false,status:302,json:async()=>({})};}
   if(/propose areas of responsibility/i.test(body.messages[0].content)) return reply(JSON.stringify({proposals:[{title:'Reply desk',summary:'Draft replies.',evidence:[{sourceId:c.process.env.__s1,excerpt:'answer customer emails within a day'}],unknowns:[],systems:[],boundary:'Drafts only.'}]}));
   return reply(JSON.stringify({draft:'d',blocked_step:null,sources_used:[]}));};
  if(gate){const g=gate;return g.promise.then(respond);}
  return Promise.resolve(respond());}};
vm.runInNewContext(src,c);const f=c.module.exports.t;
const consent=()=>f.bizConsentAct(true,{host:'api.groq.com',model:'openai/gpt-oss-120b'});
(async()=>{
 c.process.env.ALTER_MODEL_KEY='k';c.process.env.ALTER_MODEL_WS='legacy';
 await consent();
 const s1=(await f.bizSourceAdd({kind:'note',title:'Replies',text:'We answer customer emails within a day.'})).body.source.id;
 c.process.env.__s1=s1;
 const p=(await f.bizDiscover()).body.proposals[0];
 const respId=(await f.bizProposalAct(p.id,'activate',{})).body.responsibility.id;

 // --- 1a) index overflow: the 51st run drops the oldest OBJECT, not just the id
 for(let i=0;i<51;i++) await f.bizRespAct(respId,'run',{input:'work '+i});
 let idx=await f.r(['LRANGE','fm:biz:runs:'+respId,0,60]);
 assert.equal(idx.length,50,'index trimmed to RUNS_KEEP');
 let keys=await f.bizRunKeysAll();
 assert.equal(keys.length,50,'run objects bounded to the index - no orphans accumulate');

 // --- 1b) pre-existing orphan (predating the bound) is still collected by resp delete
 await f.setJ('fm:biz:run:run_orphan9',{id:'run_orphan9',respId,kind:'manual',at:new Date().toISOString(),input:'old',output:'old',status:'done'});
 const rd=await f.bizRespAct(respId,'delete',{});
 assert.equal(rd.body.deleted,true);assert.equal(rd.body.runsDeleted,51,'index 50 + 1 orphan');
 keys=await f.bizRunKeysAll();assert.equal(keys.length,0,'orphan run object deleted with the responsibility');

 // --- 2a) purge race: paused in-flight run cannot recreate run/index/log after purge
 const s2=(await f.bizSourceAdd({kind:'note',title:'Ops',text:'Fridays are for invoicing.'})).body.source.id;
 const p2=(await f.bizDiscover()).body.proposals[0];
 const resp2=(await f.bizProposalAct(p2.id,'activate',{})).body.responsibility.id;
 let opened;gate={promise:new Promise(res=>{opened=res;})};
 const inflight=f.bizRespAct(resp2,'run',{input:'slow work'});
 await new Promise(r=>setTimeout(r,20)); // run is now parked inside the provider call
 const purge=await f.bizDataPurge({confirm:'DELETE'});
 assert.equal(purge.body.purged,true);
 opened();gate=null;
 const raced=await inflight;
 assert.equal(raced.status,409);assert.equal(raced.body.code,'workspace_changed','stale in-flight run refused after purge');
 keys=await f.bizRunKeysAll();assert.equal(keys.length,0,'purge race: no run object recreated');
 const st=await f.bizState();
 assert.equal(st.responsibilities.length,0);assert.equal(st.log.length,0,'purge race: no log entry recreated');

 // --- 2b) discover race: paused discovery cannot recreate proposals after purge
 await f.bizSourceAdd({kind:'note',title:'Again',text:'We answer customer emails within a day.'});
 await consent();
 gate={promise:new Promise(res=>{opened=res;})};
 const disc=f.bizDiscover();
 await new Promise(r=>setTimeout(r,20));
 await f.bizDataPurge({confirm:'DELETE'});
 opened();gate=null;
 const draced=await disc;
 assert.equal(draced.status,409,'stale in-flight discover refused after purge');
 assert.equal((await f.bizProposals?[]:[]).length,0);
 assert.equal((await f.bizState()).proposals.length,0,'no proposal recreated');

 // --- 3a) source delete partial failure: source survives, retry finishes
 await f.bizSourceAdd({kind:'note',title:'Keep',text:'Fridays are for invoicing.'});
 const victim=(await f.bizState()).sources[0];
 await f.r(['SADD','fm:biz:proposals','prop_bad']);await f.r(['SET','fm:biz:prop:prop_bad','not json']);
 const partial=await f.bizSourceDel(victim.id);
 assert.equal(partial.status,503);assert.equal(partial.body.code,'delete_incomplete','truthful partial state, not "no data changed"');
 assert(await f.getJ('fm:biz:src:'+victim.id),'source NOT deleted when scrub could not complete');
 await f.r(['DEL','fm:biz:prop:prop_bad']);await f.r(['SREM','fm:biz:proposals','prop_bad']);
 const retry=await f.bizSourceDel(victim.id);
 assert.equal(retry.status,200,'retry completes after the storage fault clears');

 // --- 3b) purge partial failure: truthful counts, retry finishes
 await f.r(['SET','fm:biz:src:src_bad','not json']);await f.r(['SADD','fm:biz:sources','src_bad']);
 const pfail=await f.bizDataPurge({confirm:'DELETE'});
 assert.equal(pfail.status,503);assert.equal(pfail.body.code,'purge_incomplete');assert.equal(pfail.body.purged,false);
 await f.r(['DEL','fm:biz:src:src_bad']);await f.r(['SREM','fm:biz:sources','src_bad']);
 const pretry=await f.bizDataPurge({confirm:'DELETE'});
 assert.equal(pretry.status,200);assert.equal(pretry.body.purged,true,'purge retry completes');

 // --- 4a) IPv6 / internal-DNS / CGNAT endpoints refused
 for(const bad of ['https://[::1]/v1','https://[fd00::8]/v1','https://[fe80::1]/v1','https://[::ffff:127.0.0.1]/v1','https://x.internal/v1','https://x.local/v1','https://100.64.0.1/v1']){
  c.process.env.ALTER_MODEL_BASE_URL=bad;
  const e=await f.bizEngine();assert.equal(e.ok,false,bad);assert.equal(e.code,'engine_bad_endpoint',bad);
 }
 c.process.env.ALTER_MODEL_BASE_URL='https://api.groq.com/openai/v1';

 // --- 4b) redirect: the payload never follows a 3xx off the consented host
 await f.bizSourceAdd({kind:'note',title:'R',text:'We answer customer emails within a day.'});
 await consent();
 const pr=(await f.bizDiscover()).body.proposals[0];
 const rr=(await f.bizProposalAct(pr.id,'activate',{})).body.responsibility.id;
 c.process.env.REDIRECT_ONCE='1';
 const n0=seen.length;
 const red=await f.bizRespAct(rr,'run',{input:'hello'});
 assert.equal(red.status,503);assert.equal(red.body.code,'engine_redirect','redirect refused');
 assert.equal(seen.length,n0+1,'exactly one call, to the consented endpoint only');
 console.log('PASS privacy lifecycle: orphan run inventory (overflow + pre-existing), purge/discover race fenced (no recreation), truthful partial deletes with working retry, IPv6/internal-DNS/CGNAT endpoints refused, redirect refused pre-payload.');
})().catch(e=>{console.error(e);process.exit(1)});
