// Tenant identity guard: Business view state belongs to the workspace it was fetched under.
// Switching workspaces while the view is visible must drop every cached card and reload;
// nothing from wsA may stay painted under wsB.
const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync('public/js/business.js','utf8');
let state=null, apiCalls=[], syncH=null, routeH=null;
const V={classList:{contains:()=>true,add(){},remove(){}},innerHTML:'',querySelectorAll:()=>[]};
const el=()=>({classList:{contains:()=>false,add(){},remove(){}},style:{},innerHTML:'',textContent:'',onclick:null,addEventListener(){},closest:()=>null});
const BB={
  who:{email:'a@x.com',workspace:'wsA'},
  $:(s)=>s==='#v-business'?V:el(),
  $$:(s)=>[],
  esc:(x)=>String(x),
  onRoute:(h)=>{routeH=h}, on:(h)=>{syncH=h},
  toast(){}, modal(){}, when(){return 'now'}, initials:()=> 'A',
  ICON:{chev:'',gear:'',plus:'',link:'',doc:'',x:'',eye:'',play:'',pause:'',trash:'',clock:'',check:'',warn:'',spark:'',globe:'',mail:'',cal:'',note:'',bot:'',shield:'',lock:'',search:'',arrow:'',user:'',key:'',db:'',refresh:''},
  api:async(p)=>{apiCalls.push(p);
    if(p.endsWith('/state'))return Object.assign({},BB.who.workspace==='wsB'?wsBState:state); // server scopes state to the session workspace
    return {};}
};
global.window={BB};global.document={getElementById:()=>null,querySelectorAll:()=>[]};global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};global.history={replaceState(){}};global.location={hash:'#business'};
global.BB=BB;global.prompt=()=>null;global.confirm=()=>false;
eval(src);
const wsBState={sources:[],proposals:[],responsibilities:[],log:[],engine:{on:false},opPending:null};
const wsAState={sources:[{id:'sA1',title:'wsA source',kind:'note',text:'alpha'}],proposals:[],responsibilities:[],log:[],engine:{on:false},opPending:null};
state=wsAState;
routeH({v:'business'});
setTimeout(()=>{
  assert(apiCalls.filter(p=>p.endsWith('/state')).length===1,'initial load fetched state once');
  assert(V.innerHTML.includes('wsA source'),'wsA card painted under wsA');
  const callsBefore=apiCalls.length;
  BB.who={email:'b@x.com',workspace:'wsB'};
  syncH();
  setTimeout(()=>{
    assert(apiCalls.filter(p=>p.endsWith('/state')).length===callsBefore+1,'workspace switch triggers a fresh fetch');
    assert(!V.innerHTML.includes('wsA source'),'stale wsA card never painted under wsB');
    assert(!V.innerHTML.includes('alpha'),'no wsA text survives into wsB render');
    console.log('PASS business tenant guard: workspace switch drops cached state, reloads, never paints cross-tenant cards');
  },10);
},10);
