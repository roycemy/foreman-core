// Exercise the real rules dialog's Save handler. No network or owner policy writes.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/public/js/card.js','utf8');
const extracted=source.replace('  /* daily limit:', '  window.testRules = rules;\n  /* daily limit:');
async function run(cap,budget){
  const nodes={},node=id=>nodes[id]||(nodes[id]={value:'',textContent:'',hidden:false,options:[{}, {value:'job'}],classList:{add(){}},setAttribute(k,v){this[k]=String(v)},getAttribute(k){return this[k]}});
  const bot={id:'bot',status:'active',policy:{}},job={id:'job',title:'Fixture job',assignee:'bot',status:'running'},writes=[];
  const BB={cards:{bots:[bot]},$:()=>node('view'),esc:String,modal:()=>({classList:{add(){}},querySelector:node,querySelectorAll:()=>[]}),onRoute(){},tasks:()=>[job],task:()=>job,on(){},api:async(u,m,b)=>{writes.push({u,m,b});return {bots:[bot]}},closeModal(){},sync:async()=>{},emit(){},toast(){}};
  const ctx={window:{BB},console};vm.runInNewContext(extracted,ctx);ctx.window.testRules();
  node('#rule-cap').value=cap;
  if(budget!==undefined){node('#rule-apply').onclick();node('#rule-budget').value=budget;}
  await node('#rule-save').onclick();return {writes,error:node('#rule-error').textContent};
}
(async()=>{
 for(const [text,cents] of [['25.00',2500],['25',2500],['0.5',50],['0',0],[' 25.00 ',2500]]){
  let r=await run(text);assert.equal(r.error,'');assert.equal(r.writes.length,1);assert.equal(r.writes[0].b.policy.perActionCents,cents);
  r=await run('',text);assert.equal(r.error,'');assert.equal(r.writes[0].b.budgetCents,cents);assert.equal(r.writes[0].b.taskId,'job');assert.equal(r.writes[0].b.confirmed,true);
 }
 for(const invalid of ['d','25.000','25x00','-1','abc','$25.00']){
  for(const r of [await run(invalid),await run('',invalid)]){assert.equal(r.writes.length,0);assert.match(r.error,/must be a dollar amount/);}
 }
 const blank=await run('');assert.equal(blank.writes.length,1);assert.equal(blank.writes[0].b.policy.perActionCents,undefined);
 console.log('PASS real rules Save handler converts dollar caps and job budgets; rejects malformed values without writes');
})().catch(e=>{console.error(e);process.exit(1)});
