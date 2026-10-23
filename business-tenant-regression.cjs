// Tenant identity guard v2: Business view state belongs to the exact identity (account +
// workspace, generation-stamped) it was fetched under. Any identity change synchronously clears
// cached state AND the painted DOM, discards late in-flight responses, and reloads - wsA cards
// can never stay painted under wsB, and a restore can never attach wsB text to stale wsA DOM.
const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync('public/js/business.js','utf8');
let syncH=null,routeH=null,resolvers=[];
const V={classList:{contains:()=>true,add(){},remove(){}},innerHTML:'',querySelectorAll:()=>[]};
const el=()=>({classList:{contains:()=>false,add(){},remove(){}},style:{},innerHTML:'',textContent:'',onclick:null,addEventListener(){},closest:()=>null});
const stateFor=w=>({sources:w==='wsA'?[{id:'sA1',title:'wsA source',kind:'note',text:'alpha'}]:[],proposals:[],responsibilities:[],log:[],engine:{on:false},opPending:null});
const BB={who:{email:'a@x.com',workspace:'wsA'},
  $:(s)=>s==='#v-business'?V:el(), $$:()=>[], esc:String,
  onRoute:h=>{routeH=h}, on:h=>{syncH=h},
  toast(){}, modal(){}, when:()=>'now', initials:()=>'A', ICON:{chev:''},
  api:(p)=>{ if(p.endsWith('/state')) return new Promise(res=>resolvers.push(()=>res(Object.assign({},stateFor(BB.who.workspace))))); return Promise.resolve({}); }};
global.window={BB};global.document={getElementById:()=>null,querySelectorAll:()=>[]};global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};global.history={replaceState(){}};global.location={hash:'#business'};
global.BB=BB;global.prompt=()=>null;global.confirm=()=>false;
const flush=()=>new Promise(r=>setTimeout(r,5));
eval(src);
(async()=>{
  // 1) identity change while the FIRST fetch is still in flight: DOM cleared synchronously,
  //    fresh fetch started, late wsA response discarded before it can assign or paint
  routeH({v:'business'});
  assert.equal(resolvers.length,1,'initial load fetched state');
  V.innerHTML='wsA partial paint';
  BB.who={email:'a@x.com',workspace:'wsB'};
  syncH();
  assert.equal(V.innerHTML,'','synchronous DOM clear on workspace switch');
  assert.equal(resolvers.length,2,'reload for the new identity started');
  resolvers[0](); await flush(); // late wsA response lands after the switch
  assert(!V.innerHTML.includes('wsA source') && !V.innerHTML.includes('alpha'),'late wsA response never painted');
  resolvers[1](); await flush(); // wsB response
  assert(!V.innerHTML.includes('wsA source') && !V.innerHTML.includes('alpha'),'no wsA text under wsB');
  // 2) identity change with wsA state already painted
  BB.who={email:'a@x.com',workspace:'wsA'};
  resolvers.length=0; routeH({v:'business'}); resolvers[0](); await flush();
  assert(V.innerHTML.includes('wsA source'),'wsA card painted under wsA');
  BB.who={email:'a@x.com',workspace:'wsB'};
  syncH();
  assert.equal(V.innerHTML,'','painted wsA cards cleared synchronously');
  assert.equal(resolvers.length,2,'wsB reload started');
  resolvers[1](); await flush();
  assert(!V.innerHTML.includes('wsA source'),'wsB render carries no wsA cards');
  // 3) same workspace, different account: also invalidates
  resolvers.length=0;
  BB.who={email:'b@x.com',workspace:'wsB'};
  syncH();
  assert.equal(V.innerHTML,'','account change on the same workspace clears too');
  assert.equal(resolvers.length,1,'account change triggers reload');
  resolvers[0](); await flush();
  console.log('PASS business tenant guard v2: account+workspace+generation stamp, synchronous DOM clear, late in-flight response discarded, same-workspace account change invalidates');
})().catch(e=>{console.error(e);process.exit(1)});
