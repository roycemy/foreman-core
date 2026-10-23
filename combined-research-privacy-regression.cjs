// Combined branch trial: research integration (115) + privacy repair (116) in one tree.
//  1. A research run parked inside the provider call cannot recreate records after a purge:
//     its persistence is fenced with the entry snapshot, exactly like a classic run.
//  2. Source delete scrubs the source's own verbatim URLs from research runs' approvedUrls
//     (fenced, inside the delete op) while input-derived URLs, citations (public-page quotes)
//     and sourceVersion pointers stay - matching the stated deletion policy.
// Engine endpoint stubbed (fetch); page fetches use the real SSRF-guarded helper over
// stubbed dns/http fixtures. No real network.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),net=require('net'),{EventEmitter}=require('events');
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={bizSourceAdd,bizSourceDel,bizDiscover,bizProposalAct,bizRespAct,bizDataPurge,bizConsentAct,bizState,bizRunKeysAll,setJ,getJ,r,als};';
const HOSTS={'good.example':['93.184.216.34']};
const PAGES={'good.example/':{status:200,headers:{'content-type':'text/plain'},body:'Acme Manufacturing plans a 40-person hiring wave in Dallas this quarter. '.repeat(10)}};
const requests=[];
const dnsStub={lookup:(h,o,cb)=>{const ips=HOSTS[h]; if(!ips)return cb(new Error('ENOTFOUND')); cb(null,ips.map(a=>({address:a,family:4})));}};
function fakeLib(){return {request:(opts,cb)=>{
  const key=opts.hostname+opts.path; requests.push(key);
  const res=new EventEmitter(); res.statusCode=(PAGES[key]||{status:404}).status; res.headers=(PAGES[key]||{}).headers||{};
  const req=new EventEmitter(); req.destroy=()=>{}; req.end=()=>{
    const serve=()=>{const p=PAGES[key]; process.nextTick(()=>{cb(res); if(p&&p.body){res.emit('data',Buffer.from(p.body));} res.emit('end');});};
    if(net.isIP(opts.hostname.replace(/^\[|\]$/g,''))) return serve();
    opts.lookup(opts.hostname,{},(err)=>{ if(err){req.emit('error',err);return;} serve();});
  };
  return req;}};}
let gate=null; // {promise,open} - parks the stubbed provider call
const c={require:(m)=>m==='dns'?dnsStub:m==='https'?fakeLib():m==='http'?fakeLib():require(m),
 module:{exports:{}},process:{env:{}},global:{},console,URL,Buffer,AbortSignal,setTimeout,clearTimeout,
 fetch:(u,o)=>{const respond=()=>{const body=JSON.parse(o.body);
  const reply=content=>({ok:true,json:async()=>({choices:[{message:{content}}],usage:{}})});
  const sys=body.messages[0].content;
  if(/propose areas of responsibility/i.test(sys)) return reply(JSON.stringify({proposals:[{title:'Prospect desk',summary:'Research prospects and draft outreach.',evidence:[{sourceId:c.process.env.__sid,excerpt:'we want more mid-size manufacturing clients'}],unknowns:[],systems:[],boundary:'Drafts only.'}]}));
  if(/fetch_requests/.test(sys)) return reply(JSON.stringify({draft:'Acme Manufacturing looks like a fit; draft outreach inside.',blocked_step:'Sending the outreach email',sources_used:[c.process.env.__sid],citations:[{url:'https://good.example/',quote:'Acme Manufacturing plans a 40-person hiring wave in Dallas this quarter.'}],next_steps:['Review the draft']}));
  return reply(JSON.stringify({draft:'plain draft',blocked_step:null,sources_used:[]}));};
  if(gate){const g=gate;return g.promise.then(respond);}
  return Promise.resolve(respond());}};
vm.runInNewContext(src,c);const f=c.module.exports.t;

(async()=>{
 c.process.env.ALTER_MODEL_KEY='k';c.process.env.ALTER_MODEL_WS='legacy';
 await f.bizConsentAct(true,{host:'api.groq.com',model:'openai/gpt-oss-120b'});

 // --- setup: research responsibility over a source that itself names a page
 const s1=await f.bizSourceAdd({kind:'note',title:'Ideal client',text:'We want more mid-size manufacturing clients in Texas. Example prospect: https://good.example/'});
 const sid=s1.body.source.id;c.process.env.__sid=sid;
 const p=(await f.bizDiscover()).body.proposals[0];
 const respId=(await f.bizProposalAct(p.id,'activate',{research:true})).body.responsibility.id;
 const input='Research https://good.example/ and also read https://good.example/page2 for context';
 const RV=(await f.bizRespAct(respId,'candidates',{input})).body.sourceVersions;
 const res=await f.bizRespAct(respId,'run',{input,approvedUrls:['https://good.example/','https://good.example/page2'],reviewedVersions:RV});
 assert.equal(res.status,200,'research run completes in the combined tree');
 assert.equal(res.body.run.status,'done');
 assert.deepEqual(res.body.run.approvedUrls,['https://good.example/','https://good.example/page2']);
 assert.equal(res.body.run.citations.length,1);
 const runKey='fm:biz:run:'+res.body.run.id;

 // --- source delete scrubs the source's own URLs from the run, keeps input URLs + citations
 const del=await f.bizSourceDel(sid,{});
 assert.equal(del.status,200);assert.equal(del.body.researchUrlsScrubbed,1,'one research run scrubbed');
 const runAfter=await f.getJ(runKey);
 assert(runAfter,'run record itself is kept (derived work)');
 assert.deepEqual(runAfter.approvedUrls,['https://good.example/page2'],'source-verbatim URL scrubbed, work-item URL kept');
 assert.equal(runAfter.citations.length,1,'citations quote the fetched public page, never the source - kept');
 assert(runAfter.sourceVersions[sid]!=null,'source version pointer kept for honest history');
 const sdLog=(await f.bizState()).log.find(l=>l.kind==='source_deleted');
 assert(sdLog&&sdLog.researchUrlsScrubbed===1,'activity entry records the research scrub');

 // --- purge while a research run is parked inside the provider call: nothing recreated
 const s2=await f.bizSourceAdd({kind:'note',title:'Ops',text:'Fridays are for invoicing. See https://good.example/'});
 c.process.env.__sid=s2.body.source.id;
 const p2=(await f.bizDiscover()).body.proposals[0];
 const resp2=(await f.bizProposalAct(p2.id,'activate',{research:true})).body.responsibility.id;
 const input2='Research https://good.example/ and draft outreach';
 const RV2=(await f.bizRespAct(resp2,'candidates',{input:input2})).body.sourceVersions;
 let opened;gate={promise:new Promise(res=>{opened=res;})};
 const inflight=f.bizRespAct(resp2,'run',{input:input2,approvedUrls:['https://good.example/'],reviewedVersions:RV2});
 await new Promise(r=>setTimeout(r,20)); // parked inside the provider call
 const purge=await f.bizDataPurge({confirm:'DELETE'});
 assert.equal(purge.body.purged,true);
 opened();gate=null;
 const raced=await inflight;
 assert.equal(raced.status,409);assert.equal(raced.body.code,'workspace_changed','parked research run refused after purge - fenced persistence');
 assert.equal((await f.bizRunKeysAll()).length,0,'no research run object recreated after purge');
 const st=await f.bizState();
 assert.equal(st.responsibilities.length,0);assert(st.log.every(e=>e.kind==='data_purged'),'only the purge receipt survives - no research run log entry recreated');

 console.log('PASS combined research+privacy: fenced research persistence under a mid-run purge (no recreated objects or log), source-verbatim URLs scrubbed from research approvedUrls inside the delete op, input URLs/citations/version pointers kept, research runs green in the combined tree.');
})().catch(e=>{console.error(e);process.exit(1)});
