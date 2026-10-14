const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/api/index.js','utf8')+'\nmodule.exports.t={AUTHZ,r,setJ,getJ,als,cardControl,cardPropose,cardDecision,cardData,createAgent,grantJob,gatewayAct,decide,newTask};';
const ctx={require,module:{exports:{}},process:{env:{}},global:{},console,fetch:()=>{throw Error('NO NETWORK OR PAYMENT')},setTimeout,clearTimeout,URL,AbortSignal};vm.runInNewContext(src,ctx);const f=ctx.module.exports.t;
(async()=>{await f.als.run({ws:'auth-test'},async()=>{
 const {agent:a}=await f.createAgent('Fixture','Ops','custom',false,{preset:'balanced'});a.permissionScope='job';a.permissions={'notes.write':'AUTO','notes.delete':'NEVER'};await f.setJ('fm:agent:'+a.id,a);
 const t=await f.newTask({title:'Fixture',assignee:a.id});t.status='running';await f.setJ('fm:task:'+t.id,t);
 assert.equal((await f.cardControl({botId:a.id,taskId:t.id,budgetCents:3000,confirmed:true,policy:{allowedCategories:['software'],perActionCents:3000,maxPerHour:2}})).status,200);
 const q=async(sourceId,amountCents=2000,extra={})=>(await f.cardPropose(a,{sourceId,amountCents,merchant:'Fixture',purpose:'Synthetic',currency:'USD',taskId:t.id,category:'software',...extra})).body.proposal;
 let p=await q('a');assert.equal((await f.cardDecision(p.id,'approve','bad')).status,409);
 let approved=await f.cardDecision(p.id,'approve',p.detailsHash);assert.equal(approved.body.proposal.status,'simulated');assert.equal(approved.body.proposal.authorization.code,'owner_approved');assert.equal(approved.body.receipt.chargedCents,0);
 await f.cardDecision(p.id,'approve',p.detailsHash);assert.equal((await f.getJ('fm:task:'+t.id)).sandboxGrant.spentCents,2000);
 const p2=await q('b'),p3=await q('c');const race=await Promise.all([f.cardDecision(p2.id,'approve',p2.detailsHash),f.cardDecision(p3.id,'approve',p3.detailsHash)]);assert(race.some(x=>x.status===409));assert(race.some(x=>x.body?.proposal.authorization.code==='limit_job'));assert.equal((await f.getJ('fm:task:'+t.id)).sandboxGrant.spentCents,2000);
 assert.equal((await f.cardControl({botId:a.id,taskId:t.id,budgetCents:1000,confirmed:true})).status,400);
 const merchant=await q('merchant',500,{category:'travel'});assert.equal((await f.cardDecision(merchant.id,'approve',merchant.detailsHash)).body.proposal.authorization.code,'merchant_category');
 const noJob=await q('nojob',500,{taskId:null});assert.equal((await f.cardDecision(noJob.id,'approve',noJob.detailsHash)).body.proposal.authorization.code,'job_inactive');
 let denied=await q('deny',500);assert.equal((await f.cardDecision(denied.id,'deny',denied.detailsHash)).body.proposal.status,'denied');assert.equal((await f.cardDecision(denied.id,'approve',denied.detailsHash)).body.proposal.status,'denied');
 const pause=await q('pause',500);await f.setJ('fm:agent:'+a.id,{...a,paused:true});assert.equal((await f.cardDecision(pause.id,'approve',pause.detailsHash)).body.proposal.authorization.code,'paused');await f.setJ('fm:agent:'+a.id,a);
 const data=await f.cardData();assert.equal(data.bots[0].trust.sampleCount,6);assert(data.ledger.every(q=>q.chargedCents===0));
 // Real gateway ledger loop: exact cap, concurrent admission, approval-time recheck, replay.
 await f.grantJob(t.id,{expectedAssignee:a.id,confirmed:true,budgetCents:2,actions:{'notes.write':'AUTO'}});
 const act={action:'notes.write',task_id:t.id,params:{title:'Synthetic',text:'test'}};
 let r=await Promise.all([f.gatewayAct(a,act),f.gatewayAct(a,act)]);assert(r.some(x=>x.status===200));assert(r.some(x=>x.status===409));assert.equal((await f.gatewayAct(a,act)).body.code,'limit_job');assert.equal((await f.getJ('fm:task:'+t.id)).jobGrant.spentCents,2);
 await f.grantJob(t.id,{expectedAssignee:a.id,confirmed:true,budgetCents:4,actions:{'notes.write':'ASK'}});let ask=await f.gatewayAct(a,act);assert.equal(ask.status,202);
 // spend remaining budget through a fixture state change; approval must not overshoot.
 let live=await f.getJ('fm:task:'+t.id);live.jobGrant.spentCents=4;await f.setJ('fm:task:'+t.id,live);assert.equal((await f.decide(ask.body.request_id,'approve')).body.request.status,'blocked');assert.equal((await f.decide(ask.body.request_id,'approve')).status,409);
 await f.setJ('fm:agent:'+a.id,{...a,status:'revoked'});assert.equal((await f.gatewayAct(a,act)).status,403);
 console.log('PASS exact sandbox job cap, concurrent decisions, replay, immutable details, category, pause, independent ledger budget, concurrent gateway actions, approval recheck, stale-agent revoke. ZERO network/payment calls.');
 });
 await f.als.run({ws:'isolated'},async()=>assert.equal((await f.cardData()).proposals.length,0));
 const base={active:true,spentToday:0,dailyLimit:10000,ownerApproved:true,recentCount:0,policy:{}};const rq={amountCents:100,currency:'USD',botId:'x'};assert.equal(f.AUTHZ.evaluate(rq,{...base,policy:{maxPerHour:1},recentCount:1}).code,'velocity');assert.equal(f.AUTHZ.evaluate(rq,{...base,policy:{perActionCents:99}}).code,'limit_action');assert.equal(f.AUTHZ.evaluate(rq,{...base,killed:true}).code,'paused');assert.equal(f.AUTHZ.evaluate(rq,{...base,expired:true}).code,'expired');assert.equal(f.AUTHZ.evaluate(rq,{...base,dailyLimit:99}).code,'limit_daily');assert.equal(f.AUTHZ.evaluate(rq,{...base,spentToday:NaN}).code,'invalid_policy');const scenarios=f.AUTHZ.demo().scenarios;assert.equal(scenarios[0].result.decision,'ALLOW_SANDBOX');assert.equal(scenarios[1].result.code,'limit_job');assert.equal(scenarios[4].result.decision,'ASK');assert.equal(f.AUTHZ.trust([]).score,null);console.log('PASS same-evaluator demo and isolation');
})().catch(e=>{console.error(e);process.exit(1)});
