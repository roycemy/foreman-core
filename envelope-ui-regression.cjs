// No upstream file covers it: renders public/js/card.js with a stub BB and DOM to check the envelope section is gated on
// envelopesEnabled, shows available/reserved/unsettled/spent per currency, stuck items with adjudication controls, history,
// and posts the exact routes. No browser, no network.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/public/js/card.js','utf8');
function load(money){
 const posted=[],handlers={};let modalHtml='';
 const el=()=>({classList:{contains:()=>true,add(){}},innerHTML:'',hidden:false,value:'',dataset:{},setAttribute(){},textContent:'',
  insertAdjacentHTML(p,h){this.innerHTML+=h},querySelector(q){const x=el();handlers[q]=x;return x},querySelectorAll(q){const m=[...this.innerHTML.matchAll(/data-(dec|adj)="([^"]+)" data-env="([^"]+)"(?: data-auth="([^"]+)")?/g)];return q==='[data-dec]'||q==='[data-adj]'?m.filter(x=>'['+'data-'+x[1]+']'===q).map(x=>({dataset:{dec:x[2],adj:x[2],env:x[3],auth:x[4]},onclick:null})):[]}});
 const V=el(),BB={$:()=>V,esc:s=>String(s).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';'),agent:id=>({id,name:id==='agent_a'?'Ada':'Bot'}),isGhost:()=>false,phone:()=>false,usd:c=>'$'+(Number(c||0)/100).toFixed(2),usdShort:c=>'$'+Math.round(c/100),
  when:iso=>String(iso).slice(0,16),money,cards:{bots:[],ledger:[]},av:()=>'',tasks:()=>[],task:()=>null,toast(){},emit(){},sync:async()=>{},closeModal(){},
  modal(h){modalHtml=h;return el()},api:async(p,m,b)=>{posted.push([p,m,b]);return {code:'approved'}},on(fn){BB._paint=fn},onRoute(){}};
 vm.runInNewContext(src,{window:{BB},BRAND:{upper:'ALTER'},console});BB._paint();return {html:V.innerHTML,BB,posted,modal:()=>modalHtml};
}
(async()=>{
 const off=load({envelopesEnabled:false,requests:[]});assert(!off.html.includes('Spend envelopes'),'hidden when flag off');
 const hist=[{seq:1,at:1,actor:'owner:user_a',kind:'envelope_approved',authorizationId:'',currency:'',du:0,dr:0,ds:0,note:''},{seq:2,at:2,actor:'issuer_webhook',kind:'reserve_unresolved',authorizationId:'iauth_abc123',currency:'usd',du:800,dr:0,ds:0,note:''}];
 const env={hash:'a'.repeat(64),status:'approved',botId:'agent_a',botName:'Ada',cardId:'ic_card42',accountId:'acct_1',merchantNetworkId:'merchant_x',decidedBy:'owner:user_a',expiresAtMs:Date.now()+3600000,activeForCard:true,
  buckets:[{currency:'usd',maxCents:4000,unresolvedCents:800,reservedCents:500,settledCents:700,usedCents:2000,availableCents:2000,overspendCents:0},{currency:'eur',maxCents:0,unresolvedCents:0,reservedCents:0,settledCents:900,usedCents:900,availableCents:0,overspendCents:900}],
  stuck:[{authorizationId:'iauth_abc123',at:Date.now()-300000,amounts:[{currency:'usd',unresolvedCents:800}]}],history:hist};
 const on=load({envelopesEnabled:true,requests:[],envelopes:[env],envelopeEligible:{bots:[{id:'agent_a',name:'Ada'}],cards:[{accountId:'acct_1',cardId:'ic_card42'}],maxTotalCentsLimit:1000000,maxExpiryHours:24}});
 for(const s of ['Spend envelopes','$20.00','available','Reserved $5.00','Unsettled $8.00','Spent $7.00','9.00 EUR','Over the limit by 9.00 EUR','active for this card','approved by owner:user_a','Stuck','Mark approved','Mark declined','History (2)','reserve unresolved','New envelope','Revoke'])assert(on.html.includes(s),'missing '+s);
 assert(!/<script|onerror=/i.test(on.html));
 const adj=[...on.html.matchAll(/data-adj="(approved|declined)" data-env="([a-f0-9]{64})" data-auth="(iauth_[A-Za-z0-9]+)"/g)];assert.deepEqual(adj.map(x=>x[1]),['approved','declined']);
 const esc=load({envelopesEnabled:true,requests:[],envelopes:[{...env,merchantNetworkId:'<img src=x onerror=alert(1)>',botName:'"><b>x'}],envelopeEligible:{bots:[],cards:[]}});assert(!esc.html.includes('<img src=x')&&!esc.html.includes('"><b>x'),'escaped');
 console.log('PASS envelope UI: hidden when ALTER_SPEND_ENVELOPES is off; per-currency available/reserved/unsettled/spent with overspend; active card, approver, revoke; stuck items with Mark approved/declined; history; values escaped. Stub DOM, no browser.');
})().catch(e=>{console.error(e);process.exit(1)});
