// Privacy repair: per-workspace owner consent gates ALL provider processing (discover,
// manual runs AND scheduled daily check-ins), bound to the exact provider host + model.
// Engine endpoint must be public HTTPS. No real network: model endpoint stubbed.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={bizSourceAdd,bizDiscover,bizProposalAct,bizRespAct,bizDailyTick,bizConsentAct,bizState,bizEngine,als,setJ,getJ,r};';
const calls=[];
const c={require,module:{exports:{}},process:{env:{}},global:{},console,URL,Buffer,AbortSignal,setTimeout,clearTimeout,
 fetch:async(u,o)=>{calls.push(String(u));const body=JSON.parse(o.body);
  const reply=content=>({ok:true,json:async()=>({choices:[{message:{content}}],usage:{}})});
  if(/propose areas of responsibility/i.test(body.messages[0].content)) return reply(JSON.stringify({proposals:[{title:'Reply desk',summary:'Draft replies.',evidence:[],unknowns:[],systems:[],boundary:'Drafts only.'}]}));
  return reply(JSON.stringify({draft:'d',blocked_step:null,sources_used:[]}));}};
vm.runInNewContext(src,c);const f=c.module.exports.t;
(async()=>{
 await f.bizSourceAdd({kind:'note',title:'N',text:'We answer customer emails within a day.'});
 // configured + allowlisted, but NO owner consent: every processing path refuses pre-call
 c.process.env.ALTER_MODEL_KEY='k';c.process.env.ALTER_MODEL_WS='legacy';
 let n=calls.length;
 let d=await f.bizDiscover();assert.equal(d.status,503);assert.equal(d.body.code,'engine_no_consent');
 const tick=await f.bizDailyTick();assert.equal(tick.body.workspaces,0,'scheduled processing skipped without consent');
 assert.equal(calls.length,n,'zero provider calls without consent (manual + scheduled)');
 // plain-HTTP or private engine endpoints are refused even with consent granted
 c.process.env.ALTER_MODEL_BASE_URL='http://api.example.com/v1';
 let g=await f.bizConsentAct(true); // consent records host but engine still refuses: not HTTPS
 d=await f.bizDiscover();assert.equal(d.body.code,'engine_bad_endpoint');
 c.process.env.ALTER_MODEL_BASE_URL='https://10.0.0.4/v1';
 await f.bizConsentAct(true);
 d=await f.bizDiscover();assert.equal(d.body.code,'engine_bad_endpoint','private host refused');
 // grant against the real HTTPS provider: processing allowed, consent visible in state
 c.process.env.ALTER_MODEL_BASE_URL='https://api.groq.com/openai/v1';
 g=await f.bizConsentAct(true);assert.equal(g.status,200);assert.equal(g.body.consent.host,'api.groq.com');
 d=await f.bizDiscover();assert.equal(d.status,200);assert(calls.length>n,'model called after consent');
 const st=await f.bizState();assert(st.engine.consent&&st.engine.consent.current===true);
 // provider or model change invalidates consent: processing stops until re-approval
 c.process.env.ALTER_MODEL_NAME='other-model';
 d=await f.bizDiscover();assert.equal(d.body.code,'engine_no_consent','model change invalidates consent');
 const st2=await f.bizState();assert(st2.engine.consent.current===false,'state reports stale consent honestly');
 c.process.env.ALTER_MODEL_NAME='openai/gpt-oss-120b';
 // withdrawal stops everything again, scheduled included
 await f.bizConsentAct(false);
 n=calls.length;
 d=await f.bizDiscover();assert.equal(d.body.code,'engine_no_consent','withdrawn consent blocks manual processing');
 const tick2=await f.bizDailyTick();assert.equal(tick2.body.workspaces,0,'withdrawn consent blocks scheduled processing');
 assert.equal(calls.length,n,'zero provider calls after withdrawal');
 // consent is per-workspace: another workspace is unaffected
 await f.bizConsentAct(true);
 const other=await f.als.run({ws:'tenant-two'},()=>f.bizEngine());
 assert.equal(other.ok,false);assert.equal(other.code,'engine_not_enabled','no cross-workspace consent');
 console.log('PASS privacy consent: owner consent gates manual AND scheduled provider processing, bound to exact host+model, HTTPS-only endpoint, withdrawal and provider change stop processing, per-workspace isolation.');
})().catch(e=>{console.error(e);process.exit(1)});
