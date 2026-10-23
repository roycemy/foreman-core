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
const LONGURL='https://good.example/'+'p'.repeat(560)+'?token=secretLONG'; // 600+ chars: candidate-valid (<=2048) but over the citation cap (500)
const HUGEURL='https://good.example/'+'q'.repeat(2200); // over the 2048 extraction/fetch ceiling
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
  const nFetch=body.messages.filter(m=>/<fetched_page url=/.test(m.content)).length, item=body.messages[1].content;
  if(/fetch_requests/.test(sys)&&/invoicing note/.test(item)) return reply(JSON.stringify({draft:'Invoice summary draft.',blocked_step:null,sources_used:[c.process.env.__sid],citations:[],next_steps:[]})); // immediate final: the race run
  if(/fetch_requests/.test(sys)&&/long link/.test(item)) return reply(JSON.stringify({draft:'Long-link draft.',blocked_step:null,sources_used:[c.process.env.__sid],citations:[{url:c.process.env.__longurl,quote:'quote echoing token=secretLONG tail'},{url:'https://good.example/page2',quote:'never fetched either'}],next_steps:[]})); // over-cap + unlocated citations
  if(/fetch_requests/.test(sys)&&/huge link/.test(item)&&nFetch===0) return reply(JSON.stringify({fetch_requests:[{url:c.process.env.__hugeurl,purpose:'over-long address'}]}));
  if(/fetch_requests/.test(sys)&&/huge link/.test(item)) return reply(JSON.stringify({draft:'Huge-link draft.',blocked_step:null,sources_used:[],citations:[],next_steps:[]}));
  if(/fetch_requests/.test(sys)&&nFetch===0) return reply(JSON.stringify({fetch_requests:[{url:'https://good.example/',purpose:'company page'}]}));
  if(/fetch_requests/.test(sys)) return reply(JSON.stringify({draft:'Acme Manufacturing looks like a fit; draft outreach inside.',blocked_step:'Sending the outreach email',sources_used:[c.process.env.__sid],citations:[{url:'https://good.example/',quote:'Acme Manufacturing plans a 40-person hiring wave in Dallas this quarter.'},{url:'https://good.example/page2',quote:'never fetched, can echo anything'}],next_steps:['Review the draft']}));
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
 const input='Research https://good.example/ and also read https://good.example/page2 for context'; // the source's URL is ALSO pasted here: overlap precedence is exercised below
 const RV=(await f.bizRespAct(respId,'candidates',{input})).body.sourceVersions;
 const res=await f.bizRespAct(respId,'run',{input,approvedUrls:['https://good.example/','https://good.example/page2'],reviewedVersions:RV});
 assert.equal(res.status,200,'research run completes in the combined tree');
 assert.equal(res.body.run.status,'done');
 assert.deepEqual(res.body.run.approvedUrls,['https://good.example/','https://good.example/page2']);
 assert.equal(res.body.run.citations.length,2);
 assert.equal(res.body.run.fetchedPages.filter(p=>p.ok).length,1,'the approved page was actually read');
 const runKey='fm:biz:run:'+res.body.run.id;

 // --- source delete scrubs the source's own addresses EVERYWHERE in research metadata:
 // approvedUrls (even where the owner also pasted the address into the work item - source
 // presence wins the overlap), fetched-page entries (redacted, shape kept) and citations that
 // reference them (their quotes can echo source text). Input text, drafts and pointers stay.
 const del=await f.bizSourceDel(sid,{});
 assert.equal(del.status,200);assert.equal(del.body.researchUrlsScrubbed,1,'one research run scrubbed');
 const runAfter=await f.getJ(runKey);
 assert(runAfter,'run record itself is kept (derived work)');
 assert.deepEqual(runAfter.approvedUrls,['https://good.example/page2'],'overlap: the source URL leaves approvedUrls even though the work item also pasted it');
 assert.equal(runAfter.fetchedPages[0].url,null,'fetched-page address redacted');
 assert.equal(runAfter.fetchedPages[0].scrubbedWithSource,true,'redaction marked, fetch history shape kept');
 assert.equal(runAfter.citations.length,1,'the citation referencing the source address leaves (its quote can echo source text)');
 assert.equal(runAfter.citations[0].url,'https://good.example/page2','the input-only citation stays');
 assert(runAfter.input.includes('https://good.example/'),'the work item TEXT stays as the owner record (disclosed)');
 assert(runAfter.output.includes('Acme Manufacturing'),'the run draft stays as reviewable derived work (disclosed)');
 assert(runAfter.sourceVersions[sid]!=null,'source version pointer kept for honest history');
 const sdLog=(await f.bizState()).log.find(l=>l.kind==='source_deleted');
 assert(sdLog&&sdLog.researchUrlsScrubbed===1,'activity entry records the research scrub');

 // --- round-3 repro: a >500-char source URL must not dodge the scrub through a TRUNCATED
 // persisted citation. Ingestion rejects over-cap citation URLs whole; after the source is
 // deleted, no run field may carry the URL, its prefix or its token.
 const sLong=await f.bizSourceAdd({kind:'note',title:'Long link',text:'Reference: '+LONGURL});
 c.process.env.__sid=sLong.body.source.id;c.process.env.__longurl=LONGURL;
 const pL=(await f.bizDiscover()).body.proposals[0];
 const respL=(await f.bizProposalAct(pL.id,'activate',{research:true})).body.responsibility.id;
 const inputL='long link run';
 const RVL=(await f.bizRespAct(respL,'candidates',{input:inputL})).body.sourceVersions;
 assert(RVL[sLong.body.source.id]!=null,'the long URL is a real candidate from the source');
 const resL=await f.bizRespAct(respL,'run',{input:inputL,approvedUrls:[LONGURL],reviewedVersions:RVL});
 assert.equal(resL.status,200,'long-link run completes');
 const runL=resL.body.run;
 assert.equal(runL.citations.length,1,'over-cap citation rejected whole at ingestion, not truncated');
 assert.equal(runL.citations[0].url,'https://good.example/page2');
 assert(!JSON.stringify(runL.citations).includes('secretLONG'),'no token or URL prefix persisted from the rejected citation');
 assert.deepEqual(runL.approvedUrls,[LONGURL],'the approved destination itself is kept verbatim until the source is deleted');
 const delL=await f.bizSourceDel(sLong.body.source.id,{});
 assert.equal(delL.status,200);
 const runLAfter=JSON.stringify(await f.getJ('fm:biz:run:'+runL.id));
 assert(!runLAfter.includes('secretLONG'),'after source delete: no token, no full URL, no truncated prefix anywhere in the run record');
 assert(!runLAfter.includes(LONGURL.slice(0,500)),'not even the 500-char prefix survives');

 // --- same class in fetch recording: an over-2048 requested address is rejected whole,
 // never silently sliced into a persistable prefix
 c.process.env.__hugeurl=HUGEURL;
 const RVH=(await f.bizRespAct(respL,'candidates',{input:'huge link run'})).body.sourceVersions;
 const resH=await f.bizRespAct(respL,'run',{input:'huge link run',approvedUrls:[],reviewedVersions:RVH});
 assert.equal(resH.status,200);
 const runH=resH.body.run;
 assert.equal(runH.fetchedPages.length,1);
 assert.equal(runH.fetchedPages[0].url,null,'over-ceiling address recorded as no-address');
 assert.equal(runH.fetchedPages[0].error,'url_too_long');
 assert(!JSON.stringify(runH).includes(HUGEURL.slice(0,2000)),'no sliced prefix of the over-ceiling address persisted');
 assert(!requests.some(k=>k.includes('qqqq')),'over-ceiling address never contacted');

 // --- purge while a research run is parked inside the provider call: nothing recreated
 const s2=await f.bizSourceAdd({kind:'note',title:'Ops',text:'Fridays are for invoicing. See https://good.example/'});
 c.process.env.__sid=s2.body.source.id;
 const p2=(await f.bizDiscover()).body.proposals[0];
 const resp2=(await f.bizProposalAct(p2.id,'activate',{research:true})).body.responsibility.id;
 const input2='Summarize the invoicing note'; // immediate-final flow: the purge race must surface the 409 fence refusal, not a later engine gate
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

 console.log('PASS combined research+privacy: fenced research persistence under a mid-run purge (no recreated objects or log), source addresses scrubbed from research approvedUrls/fetchedPages/citations inside the delete op (overlap: source presence wins), work-item text/drafts/pointers kept per the disclosed policy, research runs green in the combined tree.');
})().catch(e=>{console.error(e);process.exit(1)});
