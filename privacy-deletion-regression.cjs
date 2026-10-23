// Privacy repair: deletion lifecycle. Source delete scrubs derived proposal excerpts;
// responsibility delete removes its whole work history; workspace purge removes ALL
// business records (sources, proposals, responsibilities, runs, consent, log) with typed
// confirmation. Scope honestly excludes provider-side retention and platform backups
// (documented in code, not claimed as covered). No real network: model endpoint stubbed.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={bizSourceAdd,bizSourceDel,bizDiscover,bizProposalAct,bizRespAct,bizDataPurge,bizConsentAct,bizState,bizProposals,bizSources,bizResps,als,setJ,getJ,r};';
const calls=[];
const c={require,module:{exports:{}},process:{env:{}},global:{},console,URL,Buffer,AbortSignal,setTimeout,clearTimeout,
 fetch:async(u,o)=>{calls.push(String(u));const body=JSON.parse(o.body);
  const reply=content=>({ok:true,json:async()=>({choices:[{message:{content}}],usage:{}})});
  if(/propose areas of responsibility/i.test(body.messages[0].content)) return reply(JSON.stringify({proposals:[{title:'Reply desk',summary:'Draft same-day replies.',evidence:[{sourceId:calls.__s1,excerpt:'answer customer emails within a day'},{sourceId:calls.__s2,excerpt:'Fridays are for invoicing'}],unknowns:[],systems:[],boundary:'Drafts only.'}]}));
  return reply(JSON.stringify({draft:'draft text',blocked_step:null,sources_used:[]}));}};
vm.runInNewContext(src,c);const f=c.module.exports.t;
(async()=>{
 c.process.env.ALTER_MODEL_KEY='k';c.process.env.ALTER_MODEL_WS='legacy';
 await f.bizConsentAct(true,{host:'api.groq.com',model:'openai/gpt-oss-120b'});
 const s1=(await f.bizSourceAdd({kind:'note',title:'Replies',text:'We answer customer emails within a day.'})).body.source.id;
 const s2=(await f.bizSourceAdd({kind:'note',title:'Ops',text:'Fridays are for invoicing.'})).body.source.id;
 calls.__s1=s1;calls.__s2=s2;
 const p=(await f.bizDiscover()).body.proposals[0];
 assert.equal(p.evidence.length,2);
 const act=await f.bizProposalAct(p.id,'activate',{});
 const respId=act.body.responsibility.id;
 await f.bizRespAct(respId,'run',{input:'Draft the Friday note'});
 // SOURCE DELETE: derived excerpts quoting it are scrubbed everywhere, pointer kept
 const del=await f.bizSourceDel(s1);
 assert.equal(del.body.proposalsScrubbed,1);
 const props=await f.bizProposals();
 const ev=props[0].evidence;
 assert.equal(ev[0].sourceId,s1);assert.equal(ev[0].excerpt,null);assert(ev[0].excerptDeleted,'deleted source excerpt scrubbed from decided proposal');
 assert.equal(ev[1].excerpt,'Fridays are for invoicing','other sources untouched');
 // RESPONSIBILITY DELETE: removes the responsibility AND its run history
 const before=await f.bizState();assert(before.responsibilities[0].runs.length===1);
 const rd=await f.bizRespAct(respId,'delete',{});
 assert.equal(rd.body.deleted,true);assert.equal(rd.body.runsDeleted,1);
 const gone=await f.bizRespAct(respId,'run',{input:'x'});assert.equal(gone.status,404);
 const mid=await f.bizState();assert.equal(mid.responsibilities.length,0);
 // PURGE requires typed confirmation
 const bad=await f.bizDataPurge({confirm:'yes'});assert.equal(bad.status,400);
 // tenant isolation: another workspace's data survives a purge here
 await f.als.run({ws:'tenant-two'},async()=>{await f.bizSourceAdd({kind:'note',title:'Other',text:'other workspace data'});});
 const purge=await f.bizDataPurge({confirm:'DELETE'});
 assert.equal(purge.body.purged,true);assert(purge.body.counts.sources>=1&&purge.body.counts.proposals===1);
 const after=await f.bizState();
 assert.equal(after.sources.length,0);assert.equal(after.proposals.length,0);assert.equal(after.responsibilities.length,0);
 assert(after.log.length<=1&&after.log.every(e=>e.kind==='data_purged'),'activity log is purged; only the purge own atomic commit entry remains');
 assert.equal(after.engine.consent,null,'provider consent is part of the purge');
 const other=await f.als.run({ws:'tenant-two'},()=>f.bizSources());
 assert.equal(other.length,1,'other workspace untouched by purge');
 const wss=await f.r(['SMEMBERS','gl:biz:workspaces']);
 assert(!wss.includes('legacy'),'purged workspace removed from the daily-tick registry (registration happens at activation, not source add)');
 console.log('PASS privacy deletion: source delete scrubs derived excerpts (pointer kept, others intact), responsibility delete removes full run history, typed-confirm purge clears sources/proposals/responsibilities/runs/consent/log with tenant isolation.');
})().catch(e=>{console.error(e);process.exit(1)});
