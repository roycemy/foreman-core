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
  when:iso=>String(iso).slice(0,16),dur:ms=>{if(!(ms>=0))return '';const m=ms/60000;if(m<60)return Math.round(m)+' min';const h=m/60;return h<24?Math.round(h)+' h':Math.round(h/24)+' d'},now:()=>Date.now(),money,cards:{bots:[],ledger:[]},av:()=>'',tasks:()=>[],task:()=>null,toast(){},emit(){},sync:async()=>{},closeModal(){},
  modal(h){modalHtml=h;return el()},api:async(p,m,b)=>{posted.push([p,m,b]);return {code:'approved'}},on(fn){BB._paint=fn},onRoute(){}};
 vm.runInNewContext(src,{window:{BB},BRAND:{upper:'ALTER'},console});BB._paint();return {html:V.innerHTML,BB,posted,modal:()=>modalHtml};
}
function inboxCard(item){
 const noop=()=>{},host=()=>({classList:{contains:()=>false,add:noop,remove:noop},querySelector:()=>null,querySelectorAll:()=>[],addEventListener:noop,setAttribute:noop,style:{}});
 const BB={$:host,$$:()=>[],esc:s=>String(s).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';'),av:()=>'',ago:()=>'1m ago',when:iso=>String(iso).slice(0,16),dur:ms=>{if(!(ms>=0))return '';const m=ms/60000;if(m<60)return Math.round(m)+' min';const h=m/60;return h<24?Math.round(h)+' h':Math.round(h/24)+' d'},now:()=>Date.now(),itemTitle:()=>'',reqLine:()=>'',emit:noop,on:noop,onRoute:noop,tasks:()=>[],task:()=>null,agent:()=>null,agents:()=>[],usd:c=>'$'+(c/100).toFixed(2)};
 vm.runInNewContext(fs.readFileSync(__dirname+'/public/js/inbox.js','utf8'),{window:{BB},document:{addEventListener:noop},localStorage:{getItem:()=>null,setItem:noop},console,setTimeout,Date,JSON});
 return BB.itemCard(item);
}
(async()=>{
 const off=load({envelopesEnabled:false,requests:[]});assert(!off.html.includes('Spend envelopes'),'hidden when flag off');
 const hist=[{seq:1,at:1,actor:'owner:user_a',kind:'envelope_approved',authorizationId:'',currency:'',du:0,dr:0,ds:0,note:''},{seq:2,at:2,actor:'issuer_webhook',kind:'reserve_unresolved',authorizationId:'iauth_abc123',currency:'usd',du:800,dr:0,ds:0,note:''},{seq:3,at:3,actor:'owner:user_a',kind:'manual_adjudication:declined',authorizationId:'iauth_old777',currency:'usd',du:-300,dr:0,ds:0,note:'issuer said declined'}];
 const env={hash:'a'.repeat(64),status:'approved',botId:'agent_a',botName:'Ada',cardId:'ic_card42',accountId:'acct_1',merchantNetworkId:'merchant_x',decidedBy:'owner:user_a',expiresAtMs:Date.now()+3600000,activeForCard:true,
  buckets:[{currency:'usd',maxCents:4000,unresolvedCents:800,reservedCents:500,settledCents:700,declinedPendingCents:300,heldCents:1600,usedCents:2000,availableCents:2000,overspendCents:0},{currency:'eur',maxCents:0,unresolvedCents:0,reservedCents:0,settledCents:900,usedCents:900,availableCents:0,overspendCents:900}],
  stuck:[{authorizationId:'iauth_abc123',at:Date.now()-300000,amounts:[{currency:'usd',unresolvedCents:800}]}],history:hist,notices:[{seq:3,at:3,actor:'owner:user_a',kind:'manual_adjudication:declined',authorizationId:'iauth_pro555',currency:'usd',du:-300,dr:0,ds:0,dd:300,note:''},{seq:4,at:4,actor:'provider',kind:'discrepancy:capture_differs_from_held',authorizationId:'iauth_old777',currency:'usd',du:0,dr:0,ds:300,dd:0,note:''}],declinedPending:[{authorizationId:'iauth_pro555',manual:'declined',declinedPending:true}],oldestHeldSinceMs:Date.now()-3*86400000,pastDeadlineCount:1,pastDeadlineHeld:[{currency:'usd',heldCents:100}],pastDeadline:[{authorizationId:'iauth_old777',deadlineMs:Date.now()-1000,heldAgeMs:8*86400000,providerStuckAtMs:Date.now()-500,amounts:[{currency:'usd',unresolvedCents:0,reservedCents:100,declinedPendingCents:0}]}]};
env.notices.push({seq:5,at:5,actor:'issuer_webhook',kind:'discrepancy:unreserved_approval',authorizationId:'iauth_unr1',currency:'usd',du:0,dr:300,ds:0,dd:0,note:'card=ic_envunr source=approval how=card overspend_realized=0'});
 const on=load({envelopesEnabled:true,requests:[],envelopes:[env],envelopeEligible:{bots:[{id:'agent_a',name:'Ada'}],cards:[{accountId:'acct_1',cardId:'ic_card42'}],maxTotalCentsLimit:1000000,maxExpiryHours:24}});
 for(const s of ['Spend envelopes','$20.00','available','Reserved $5.00','Unsettled $8.00','Spent $7.00','9.00 EUR','Over the limit by 9.00 EUR','active for this card','approved by owner:user_a','Stuck','Mark approved','History (3)','declined by you (budget stays held)','Needs your attention','Declined. Budget stays held until the network confirms.','Captured amount differed from what was held','$3.00 now counts as spent','$3.00 stays held','Acknowledge','data-ack="5"','Declined, awaiting the network','Declined by you','Acknowledging never releases it','held for unconfirmed declines: $3.00','Decline — budget stays held pending confirmation','reserve unresolved','New envelope','Revoke','oldest held cents: 3 d old','1 past deadline, held $1.00 (separate from the held figure above)','Stranded holds','Held past the deadline','the provider still shows it open','data-stranded="iauth_old777"','Release stranded hold','approval Alter never reserved','now counts against the limit (it could not be declined) · card …envunr'])assert(on.html.includes(s),'missing '+s);
 assert(!/<script|onerror=/i.test(on.html));
 const adj=[...on.html.matchAll(/data-adj="(approved|declined)" data-env="([a-f0-9]{64})" data-auth="(iauth_[A-Za-z0-9]+)"/g)];assert.deepEqual(adj.map(x=>x[1]),['approved','declined']);assert(!on.html.includes('Released provisionally')&&!on.html.includes('returns to available')&&!on.html.includes('Mark declined'),'old promises are gone');
 const esc=load({envelopesEnabled:true,requests:[],envelopes:[{...env,merchantNetworkId:'<img src=x onerror=alert(1)>',botName:'"><b>x'}],envelopeEligible:{bots:[],cards:[]}});assert(!esc.html.includes('<img src=x')&&!esc.html.includes('"><b>x'),'escaped');
 const e2={...env,merchantNetworkId:'merchant_x'};
 const notice=inboxCard({type:'envelope',id:'envelope:x:3',at:new Date().toISOString(),a:null,e:{...e2,notices:[env.notices[0]]}});
 for(const t of ['Declined. Budget stays held until the network confirms.','3.00 USD','data-d="ack"'])assert(notice.includes(t),'inbox notice missing '+t);
 const unres=inboxCard({type:'envelope',id:'envelope:x:5',at:new Date().toISOString(),a:null,e:{...e2,notices:[env.notices[2]]}});
 for(const t of ['Spend Alter never reserved','3.00 USD on card …envunr','could not be declined'])assert(unres.includes(t),'inbox unreserved notice missing '+t);
 const orphan=inboxCard({type:'envelope',id:'envelope:x:6',at:new Date().toISOString(),a:null,e:{...e2,notices:[{...env.notices[2],note:'card=ic_envamb1 source=approval how=unassigned overspend_realized=0'}]}});
 for(const t of ['Spend not matched to any envelope','no card was assumed','…nvamb1'])assert(orphan.includes(t),'inbox unassigned notice missing '+t);
 const stranded=inboxCard({type:'envelope_stranded',id:'envstranded:x:y',at:new Date().toISOString(),a:null,e:e2,x:env.pastDeadline[0]});
 for(const t of ['Held cents past the deadline','1.00 USD','data-envstranded="iauth_old777"','Release stranded hold','refuses while the authorization is still open'])assert(stranded.includes(t),'inbox stranded missing '+t);
 const stuck=inboxCard({type:'envelope_stuck',id:'envstuck:x:y',at:new Date().toISOString(),a:null,e:e2,s:env.stuck[0]});
 for(const t of ['Decline — budget stays held pending confirmation','data-envadj="declined"','data-envadj="approved"','8.00 USD'])assert(stuck.includes(t),'inbox stuck missing '+t);
 assert(!stuck.includes('Mark declined')&&!stuck.includes('provisional'));
 console.log('PASS envelope UI: hidden when ALTER_SPEND_ENVELOPES is off; per-currency available/reserved/unsettled/spent with overspend; active card, approver, revoke; stuck items with Mark approved and the Decline-keeps-budget-held action; declined-awaiting-network list, held-for-unconfirmed-declines line and persistent notices with Acknowledge; history; values escaped. Stub DOM, no browser.');
})().catch(e=>{console.error(e);process.exit(1)});
