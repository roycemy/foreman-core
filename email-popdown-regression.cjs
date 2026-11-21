// Item E: opening the desktop "Anything on me?" pop-down or the phone sheet with an email whose outcome is unknown threw
// "Cannot read properties of undefined (reading 'id')": pop.js had no line or action for email items and fell back to the unassigned-job
// row, which reads i.t.id. The owner must see the real email request (recipient, true state) with the existing Reconcile action, and any
// item type without a job must render without throwing. UI only: email send, recovery and idempotency are untouched.
// Real core.js + pop.js in a sandbox with minimal element stubs; offline.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const read=f=>fs.readFileSync(path.join(__dirname,f),'utf8');
function el(id){return {id,innerHTML:'',dataset:{},style:{setProperty(){}},classList:{_s:new Set(),add(c){this._s.add(c)},remove(c){this._s.delete(c)},contains(c){return this._s.has(c)},toggle(){}},
 querySelector:()=>({onclick:null,focus(){},closest:()=>null}),querySelectorAll:()=>[],addEventListener(){},setAttribute(){},getAttribute(){return null},getBoundingClientRect:()=>({width:40,left:900,right:940}),focus(){}};}
const els={'#pop':el('pop'),'#sheet':el('sheet'),'#scrim':el('scrim'),'#ibtn':el('ibtn')};
const win={BB:undefined,matchMedia:()=>({matches:false}),innerWidth:1280,localStorage:{getItem:()=>null,setItem(){}},addEventListener(){}};
const doc={addEventListener(){},querySelector:s=>els[s]||null,querySelectorAll:()=>[],hidden:false,activeElement:null};
const cctx={window:win,document:doc,matchMedia:win.matchMedia,innerWidth:1280,localStorage:win.localStorage,addEventListener(){},requestAnimationFrame:f=>0,fetch:()=>{throw Error('NO NETWORK')},setInterval:()=>0,clearInterval(){},setTimeout:()=>0,clearTimeout(){},console,Date};
vm.createContext(cctx);vm.runInContext(read('public/js/core.js'),cctx);const BB=win.BB;
// pieces from other app files the pop-down calls; their real versions are exercised by the Chromium check
BB.bindItems=()=>{};BB.av=()=>'<span class="av"></span>';BB.glyph=()=>'';BB.itemTitle=i=>i.type==='email'?(i.q.status==='outcome_unknown'?'Email outcome unknown':'Email sent'):i.type==='notesave'?'Note not saved yet':i.t?i.t.title:'';
BB.go=()=>{};BB.openRail=()=>{};BB.closeRail=()=>{};BB.phone=()=>false;BB.reduced=()=>true;BB.GLYPH=BB.GLYPH||{tick:''};
vm.runInContext(read('public/js/pop.js'),cctx);
const now=Date.now(),iso=ms=>new Date(now-ms).toISOString();
const mail={id:'req_mail',action:'email.send',status:'outcome_unknown',agentId:'agent_t',params:{to:'owner@example.com',subject:'Weekly <b>summary</b>',text:'x'},delivery:{state:'unknown'},executedAt:iso(8e5),decidedAt:iso(8e5)};
BB.S={killed:false,agents:[{id:'agent_t',name:'Mail Bot',status:'active',connection:{status:'active',transport:'gateway',lastCallAt:iso(1000)}}],tasks:[],requests:[mail],events:[],receipts:[]};BB.money={requests:[]};BB.cards={proposals:[]};
assert.deepEqual(BB.onYou().map(i=>i.type),['email'],'the unknown-outcome email is on the owner\'s list');
// desktop pop-down
assert.doesNotThrow(()=>BB.openPop(),'opening the pop-down with an unknown-outcome email does not throw');
const pop=els['#pop'].innerHTML;
assert.ok(/Email outcome unknown/.test(pop),'the pop-down names it');assert.ok(pop.includes('owner@example.com'),'with its recipient');
assert.ok(pop.includes(BB.emailOutcome(mail).replace(/&/g,'&amp;')),'and its true state');assert.ok(/data-d="reconcile"/.test(pop),'with the existing Reconcile action');assert.ok(!/data-assign=/.test(pop),'not the unassigned-job row');
// phone sheet
assert.doesNotThrow(()=>BB.openSheet(),'opening the phone sheet does not throw');const sh=els['#sheet'].innerHTML;
assert.ok(/Email outcome unknown/.test(sh)&&sh.includes('owner@example.com')&&/data-d="reconcile"/.test(sh),'the sheet shows the same email and Reconcile');
// a sent email (not outcome_unknown) is shown without a Reconcile button; any job-less item renders without throwing
mail.status='executed';mail.delivery={state:'accepted',providerMessageId:'em_1'};BB.emailFollowups=()=>[mail];
assert.doesNotThrow(()=>BB.openPop());assert.ok(!/data-d="reconcile"/.test(els['#pop'].innerHTML),'no Reconcile for an email whose outcome is known');
// the action posts to the existing email recovery route, unchanged
const calls=[];BB.api=async(p,m,b)=>{calls.push([p,m]);return {request:{...mail,status:'executed'}}};BB.toast=()=>{};BB.sync=async()=>{};
(async()=>{await BB.decide({type:'email',q:{...mail,status:'outcome_unknown'}},'reconcile');assert.deepEqual(calls[0],['/api/requests/req_mail/reconcile','POST'],'Reconcile uses the existing route');
 console.log('PASS email pop-down: the desktop pop-down and phone sheet render an unknown-outcome email (recipient, true state, the existing Reconcile action) instead of throwing on i.t.id; a known outcome shows no Reconcile; job-less items no longer fall into the unassigned-job row');})().catch(e=>{console.error(e);process.exit(1)});
