// Shared (public) receipt parity with the private job receipt: a job whose email the provider only accepted (or that failed) ends
// "Finished", never "Delivered"; "Delivered" only once the request's delivery state is delivered; a job without email is unchanged.
// The public snapshot stays allowlisted: same keys, steps carry only at/code/n, the label is a fixed server-chosen code, and nothing
// about the email (recipient, subject, request id, provider id) reaches the snapshot or the public read. Offline: Resend is a fake.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={routes,r,setJ,getJ,als,createAgent,newTask,publicReceiptRead};';
const R={mode:'ok',n:0};const res=(s,j)=>({ok:s>=200&&s<300,status:s,json:async()=>j,text:async()=>JSON.stringify(j)});
async function fakeFetch(url,o={}){const u=new URL(url);if(u.hostname!=='api.resend.com')throw Error('NO NETWORK: '+url);if(!(o.headers||{})['idempotency-key'])return res(200,{id:'wake'});
 if(R.mode==='422')return res(422,{message:'Invalid'});R.n++;return res(200,{id:'em_pub_'+R.n});}
const env={RESEND_API_KEY:'re_test_fixture',WAKE_EMAIL_FROM:'Alter <alerts@alter.example>',ALTER_EMAIL_ALLOWED_TO:'owner@example.com'};
const ctx={require,module:{exports:{}},process:{env},global:{},console,fetch:fakeFetch,setTimeout,clearTimeout,URL,AbortSignal,Buffer};vm.runInNewContext(src,ctx);const f=ctx.module.exports.t;
const H={host:'localhost',origin:'http://localhost'};
async function call(method,p,body,agent){let out;const r={status(n){this.code=n;return this},json(j){out={code:this.code||200,j};return out},setHeader(){},end(){out={code:this.code||204};return out}};await f.routes({method,headers:H,url:'/api'+p,gatewayKeyAuth:!!agent},r,p.split('?')[0],body||{},agent||null);return out;}
const SUBJECT='Quarterly numbers for Dana',RECIPIENT='owner@example.com';
const KEYS=['version','title','summary','template','budgetCents','outcome','elapsedSeconds','reportedModelCostUsd','externalCost','ledgerCents','trackedActions','approvals','steps','provenance'];
(async()=>{await f.als.run({ws:'pub'},async()=>{
 let n=0;
 // one finished job per case: with an email the owner approved (accepted or failed at the provider), or with no email at all
 async function job(withEmail){const A=(await f.createAgent('Bot '+(++n),'Ops','custom',false,{preset:'balanced'})).agent;const live=()=>f.getJ('fm:agent:'+A.id);
  const t=await f.newTask({title:'Weekly update '+n,assignee:A.id});await call('GET','/gateway/tasks/next',{},await live());let rid=null;
  if(withEmail){const p=await call('POST','/gateway/act',{action:'email.send',params:{to:RECIPIENT,subject:SUBJECT,text:'Numbers attached.'},task_id:t.id},await live());rid=p.j.request_id;
   const q=await f.getJ('fm:req:'+rid);await call('POST','/requests/'+rid+'/approve',{detailsHash:q.detailsHash});}
  const d=await call('POST','/gateway/tasks/'+t.id+'/complete',{result:'Done.'},await live());assert.equal(d.code,200,'job completes: '+JSON.stringify(d.j));return {t,rid};}
 async function review(t){const rv=await call('POST','/public-receipts/review',{taskId:t.id,title:'Weekly update',summary:'A short weekly update for the team.',template:'Weekly update',budgetCents:0});
  assert.equal(rv.code,200,JSON.stringify(rv.j));return rv.j;}
 function allowlisted(snap,label){assert.deepEqual(Object.keys(snap),KEYS,label+': snapshot keys unchanged');
  for(const s of snap.steps)assert.deepEqual(Object.keys(s).filter(k=>!['at','code','n'].includes(k)),[],label+': steps carry only at/code/n');
  const sj=JSON.stringify(snap);for(const leak of [RECIPIENT,SUBJECT,'Dana','req_','em_pub','rcpt_','task_','agent_','email','Resend','accepted'])assert.ok(!sj.includes(leak),label+': snapshot leaks '+leak);}
 const codes=snap=>snap.steps.map(s=>s.code),last=snap=>codes(snap)[codes(snap).length-1];

 // 1. accepted-only email: Finished, no Delivered anywhere, through review AND publish AND the public read
 {const {t,rid}=await job(true);assert.equal((await f.getJ('fm:req:'+rid)).delivery.state,'accepted');
  const rv=await review(t);allowlisted(rv.snapshot,'accepted');assert.equal(last(rv.snapshot),'finished','accepted only: the shared receipt ends Finished');assert.ok(!codes(rv.snapshot).includes('delivered'),'no Delivered step while delivery is unconfirmed');
  const pub=await call('POST','/public-receipts/publish',{reviewId:rv.reviewId,hash:rv.hash,confirmed:true,audience:'public'});assert.equal(pub.code,201,JSON.stringify(pub.j));
  const read=await f.publicReceiptRead(pub.j.token);assert.equal(last(read.snapshot),'finished','the public read says Finished');allowlisted(read.snapshot,'public read');
  assert.deepEqual(Object.keys(read).sort(),['expiresAt','hash','publishedAt','snapshot','token'],'public read shape unchanged');
  // 2. the provider later confirms delivery: a new review says Delivered
  const q=await f.getJ('fm:req:'+rid);await f.setJ('fm:req:'+rid,{...q,delivery:{...q.delivery,state:'delivered'}});
  const rv2=await review(t);allowlisted(rv2.snapshot,'delivered');assert.equal(last(rv2.snapshot),'delivered','confirmed delivered: the shared receipt ends Delivered');assert.ok(!codes(rv2.snapshot).includes('finished'));}
 // 3. an email the provider rejected (not sent): Finished, not Delivered
 {R.mode='422';const {t,rid}=await job(true);R.mode='ok';assert.equal((await f.getJ('fm:req:'+rid)).status,'failed');
  const rv=await review(t);allowlisted(rv.snapshot,'failed');assert.equal(last(rv.snapshot),'finished','failed email: Finished');assert.ok(!codes(rv.snapshot).includes('delivered'));}
 // 4. a job with no email: unchanged, ends Delivered
 {const {t}=await job(false);const rv=await review(t);allowlisted(rv.snapshot,'no email');assert.equal(last(rv.snapshot),'delivered','no email: unchanged');assert.ok(!codes(rv.snapshot).includes('finished'));}
 // 5. the public page renders the code from its own fixed word list
 {const doc=fs.readFileSync(path.join(__dirname,'public/js/receipt-doc.js'),'utf8');assert.match(doc,/finished: 'Finished'/,'the public page words the finished code as Finished');assert.match(doc,/delivered: 'Delivered'/);}
});console.log('PASS public receipt parity: accepted-only and failed email jobs end Finished (review, publish and public read), confirmed delivery ends Delivered, no-email jobs unchanged; snapshot keys, step shape and the public read are unchanged and carry nothing about the email');})().catch(e=>{console.error(e);process.exit(1)});
