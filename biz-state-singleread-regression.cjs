// bizState single-read proof: the displayed responsibility objects and their reviewed-snapshot
// fingerprints must come from ONE raw read. The pre-fix code read the objects via bizResps()
// and then did a SECOND MGET for the fingerprints: a boundary edit landing between the two
// reads would display the OLD record while fingerprinting the NEW unseen bytes, and an owner
// assign bound to that fp would be accepted against bytes they never reviewed.
// Method: the REAL bizState source is extracted from api/index.js on disk and executed with
// synthetic stubs (the reviewer's exact-function method) - no string-presence checks.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const src=fs.readFileSync('api/index.js','utf8');
const start=src.indexOf('async function bizState(');
assert(start>=0,'bizState source found');
let i=src.indexOf('{',start),depth=0,end=-1;
for(let j=i;j<src.length;j++){const ch=src[j];if(ch==='{')depth++;else if(ch==='}'){depth--;if(depth===0){end=j+1;break;}}}
assert(end>0,'bizState body extracted');
const fnSrc=src.slice(start,end);

const RAW_NEW=JSON.stringify({id:'resp_1',title:'Customer reply desk',summary:'Draft replies',boundary:'NEW unseen bytes - the edit that landed between the two reads',status:'active',createdAt:'2026-10-23T00:00:00Z'});
const OBJ_OLD={id:'resp_1',title:'Customer reply desk',summary:'Draft replies',boundary:'OLD reviewed: drafts only, never send anything',status:'active',createdAt:'2026-10-23T00:00:00Z'};
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');

const r=async cmd=>{
  const c=cmd[0];
  if(c==='SMEMBERS')return ['resp_1'];
  if(c==='MGET')return cmd.slice(1).map(k=>k==='fm:biz:resp:resp_1'?RAW_NEW:null);
  if(c==='LRANGE')return [];
  if(c==='GET')return null;
  if(c==='EVAL')return 1;
  return null;
};
const ctx={
  console,URL,
  r,
  sha,
  getJ:async()=>null,
  withJobLock:async(id,fn)=>fn(),
  bizSettleDelegatedRun:async()=>({}),
  bizResps:async()=>[OBJ_OLD], // the pre-fix code path reads its objects here
  bizSources:async()=>[],
  bizProposals:async()=>[],
  bizEngineEnv:()=>({key:null,allow:[],base:'',model:''}),
  bizAppStatus:async()=>({connected:false,status:'not_connected'}),
  bizDelegateBot:async()=>null,
  bizTeamRoster:async()=>[],
  connectionState:async()=>({status:'active'}),
  bizStale:()=>[],
  wsId:()=>'ws1',
};
ctx.global=ctx;
(async()=>{
  const bizState=vm.runInNewContext('('+fnSrc+')',ctx);
  const st=await bizState();
  const rp=(st.responsibilities||[])[0];
  assert(rp,'a responsibility is present');
  // The invariant: what is DISPLAYED is exactly what is FINGERPRINTED.
  assert.equal(rp.boundary,'NEW unseen bytes - the edit that landed between the two reads','the displayed record is the fingerprinted record: one raw read feeds both (a second read shows stale bytes beside a fresh fp)');
  assert.equal(rp.fp,sha(RAW_NEW),'the fingerprint is over the same bytes the owner sees');
  console.log('biz-state-singleread-regression: PASS - displayed record and reviewed-snapshot fingerprint derive from ONE raw read');
})().catch(e=>{console.error(e);process.exit(1);});
