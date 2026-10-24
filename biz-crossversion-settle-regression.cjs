// Cross-version operation: production serves the previous release, whose claim and report
// routes persist the terminal job but have NO bizSettle hook (the hook exists only in this
// version - verified by git: 'bizSettle' has no match on main). A bot claiming/reporting
// through the OLD deployment therefore leaves a terminal job next to an unsettled business
// record in the shared store. The business state read (the owner's dashboard) must settle
// it through the same fenced, idempotent path the report route uses, so the flow completes
// end-to-end whichever deployment the bot talked to. The old deployment is simulated by
// writing the job terminal directly - exactly what the old report route persists (terminal
// status, sliced result, finishedAt; no events, no settle call).
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={bizSourceAdd,bizProposalAct,bizRespAct,bizState,bizDiscoveryDelegatePreview,bizDiscoverDelegateRun,bizProposals,createAgent,setJ,getJ,r,als};';
const c={require:(m)=>require(m),module:{exports:{}},process:{env:{}},global:{},console,URL,Buffer,AbortSignal,setTimeout,clearTimeout,
 fetch:(u,o)=>{throw new Error('no network in the cross-version settle path: '+u);}};
vm.runInNewContext(src,c);const f=c.module.exports.t;

const S1='We answer every customer email within a day. Refunds over $50 need Royce.';
const S2='We send 15 to 20 estimates a month and nobody follows up unless the customer calls back.';
async function oldCodeTerminal(taskId,status,result){
  const t=await f.getJ('fm:task:'+taskId);
  await f.setJ('fm:task:'+taskId,{...t,status,result:String(result).slice(0,4000),finishedAt:new Date().toISOString()});
}

(async()=>{
 await f.als.run({ws:'wscvx'},async()=>{
  const g=await f.createAgent('Grokbot','Business work','grok',false,{preset:'balanced'});
  const s1=(await f.bizSourceAdd({kind:'note',title:'How we communicate',text:S1})).body.source;
  const s2=(await f.bizSourceAdd({kind:'note',title:'Estimates',text:S2})).body.source;

  // --- scan created on THIS version; the job finishes through the OLD deployment
  const pv=await f.bizDiscoveryDelegatePreview();
  const disc=(await f.bizDiscoverDelegateRun({delegateHash:pv.body.delegation.hash})).body.discovery;
  const answer=JSON.stringify({proposals:[
    {title:'Customer reply desk',summary:'Draft replies to customer emails.',evidence:[{sourceId:s1.id,excerpt:'We answer every customer email within a day'}],unknowns:['Which inbox'],systems:['Email'],boundary:'Drafts only; owner approves every reply.'},
    {title:'Estimate follow-up',summary:'Draft estimate reminders.',evidence:[{sourceId:s2.id,excerpt:'nobody follows up unless the customer calls back'}],unknowns:[],systems:[],boundary:'Drafts only.'}]});
  await oldCodeTerminal(disc.taskId,'done',answer);
  const before=await f.getJ('fm:biz:disc:'+disc.id);
  assert.equal(before.status,'delegated','the old report route leaves the scan unsettled (no hook exists there)');

  const st=await f.bizState();
  const dView=st.discoveries.find(d=>d.id===disc.id);
  assert(dView,'the state read still lists the scan');
  assert.equal(dView.status,'done','the state read settles the scan the old deployment finished');
  assert.equal(dView.proposals,2,'proposals are built through the full evidence validation');
  assert(dView.job&&dView.job.status==='done','the view still exposes the job outcome');
  const after=await f.getJ('fm:biz:disc:'+disc.id);
  assert.equal(after.status,'done');assert.equal(after.proposals,2);
  assert.equal((await f.bizProposals()).length,2);

  // --- idempotent: a second read settles nothing twice
  await f.bizState();
  assert.equal((await f.bizProposals()).length,2,'no duplicated proposals on repeated reads');

  // --- a delegated responsibility run finished through the OLD deployment settles the same way
  const props=await f.bizProposals();
  const act=await f.bizProposalAct(props.find(p=>p.title==='Customer reply desk').id,'activate',{});
  assert.equal(act.status,200);
  const respId=act.body.responsibility.id;
  const input='Draft a reply to a customer asking for a refund.';
  const dpv=await f.bizRespAct(respId,'delegate-preview',{input});
  assert.equal(dpv.status,200);
  const r1=await f.bizRespAct(respId,'run',{input,delegateHash:dpv.body.delegation.hash});
  assert.equal(r1.status,200);const run=r1.body.run;
  assert.equal(run.status,'delegated');
  await oldCodeTerminal(run.taskId,'done','Draft: happy to help with the refund. Because it is over $50, Royce confirms it before anything is sent.');
  const st2=await f.bizState();
  const runView=st2.responsibilities.find(x=>x.id===respId).runs.find(x=>x.id===run.id);
  assert.equal(runView.status,'done','the state read settles the run the old deployment finished');
  assert(runView.output&&runView.output.includes('happy to help'),'the bot draft lands as the reviewable output');
  assert(runView.job&&runView.job.status==='done');

  // --- a job that FAILED through the old deployment settles failed, honestly
  const pv2=await f.bizDiscoveryDelegatePreview();
  const disc2=(await f.bizDiscoverDelegateRun({delegateHash:pv2.body.delegation.hash})).body.discovery;
  await oldCodeTerminal(disc2.taskId,'failed','The bot hit an error and could not finish.');
  const st3=await f.bizState();
  const d2=st3.discoveries.find(d=>d.id===disc2.id);
  assert.equal(d2.status,'failed','a failed old-deployment job settles failed');
  assert.equal(d2.failureReason,'bot_failed','the failure is named honestly');
  assert.equal((await f.getJ('fm:biz:disc:'+disc2.id)).status,'failed');

  // --- a job still in flight through the old deployment is NOT settled
  const pv3=await f.bizDiscoveryDelegatePreview();
  const disc3=(await f.bizDiscoverDelegateRun({delegateHash:pv3.body.delegation.hash})).body.discovery;
  const t3=await f.getJ('fm:task:'+disc3.taskId);
  await f.setJ('fm:task:'+disc3.taskId,{...t3,status:'running',startedAt:new Date().toISOString(),progressAt:new Date().toISOString()});
  const st4=await f.bizState();
  const d3=st4.discoveries.find(d=>d.id===disc3.id);
  assert(d3.status==='delegated'||d3.status==='running','an unfinished job is never settled');
  assert(d3.job&&d3.job.status==='running','the view shows it still running');
  assert(!(await f.getJ('fm:biz:disc:'+disc3.id)).settledAt,'no settle stamp on a live job');

  console.log('biz-crossversion-settle-regression: PASS');
 });
})().catch(e=>{console.error('biz-crossversion-settle-regression: FAIL');console.error(e);process.exit(1);});
