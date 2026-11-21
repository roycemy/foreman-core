// Item A: "Note not saved yet" must not wait for the 30 s /api/state cache. Approving busts that cache, so the client already holds the
// request as approved with its decidedAt; the client decides "stalled" from that time and its server-synced clock, and redraws every
// second. The server flag still works, and the server stays the authority (the recover route refuses a request that is not stale).
// Real core.js in a sandbox; offline.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const core=fs.readFileSync(path.join(__dirname,'public/js/core.js'),'utf8'),api=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8');
const win={BB:undefined,matchMedia:()=>({matches:false}),innerWidth:390,localStorage:{getItem:()=>null,setItem(){}}};
const cctx={window:win,document:{addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],hidden:false},matchMedia:win.matchMedia,innerWidth:390,localStorage:win.localStorage,fetch:()=>{throw Error('NO NETWORK')},setInterval:()=>0,clearInterval(){},setTimeout:()=>0,clearTimeout(){},console,Date};
vm.createContext(cctx);vm.runInContext(core,cctx);const BB=win.BB;
const ago=ms=>new Date(BB.now()-ms).toISOString();
const base={action:'notes.write',agentId:'agent_t',params:{title:'Plan',text:'Body'},detailsHash:'a'.repeat(64)};
const reqs=[
 {...base,id:'old_approved',status:'approved',decidedAt:ago(121000)},                 // past 2 min, server flag not yet in the cached view
 {...base,id:'fresh_approved',status:'approved',decidedAt:ago(60000)},                // may still be running
 {...base,id:'old_recovering',status:'recovering',decidedAt:ago(600000),recoverStartedAt:ago(130000)},
 {...base,id:'live_recovering',status:'recovering',decidedAt:ago(600000),recoverStartedAt:ago(10000)},
 {...base,id:'flagged',status:'approved',decidedAt:ago(60000),stalled:true},          // the server flag alone is still honored
 {...base,id:'done',status:'executed',decidedAt:ago(600000)},
 {...base,id:'mail',action:'email.send',status:'approved',decidedAt:ago(600000)},     // email keeps its own path
];
BB.S={killed:false,agents:[{id:'agent_t',name:'Bot',status:'active',connection:{status:'active',transport:'gateway',lastCallAt:ago(1000)}}],tasks:[],requests:reqs,events:[],receipts:[]};BB.money={requests:[]};BB.cards={proposals:[]};
const ids=()=>BB.onYou().filter(i=>i.type==='notesave').map(i=>i.q.id).sort();
assert.deepEqual(ids(),['flagged','old_approved','old_recovering'],'stalled from decidedAt/recoverStartedAt on the client, plus the server flag');
// the client threshold is the server's, so the client never offers what the server would refuse as not yet stale
const serverMs=Number((api.match(/const INFLIGHT_STALE_MS = (\d+);/)||[])[1]);assert.equal(serverMs,120000);
assert.ok(new RegExp('NOTE_STALE_MS = '+serverMs+'\\b').test(core),'the client uses the same 120 s threshold as the server');
// uses the server-synced clock (BB.now), not the device clock alone
assert.ok(/BB\.now\(\) - Date\.parse\(/.test(core.slice(core.indexOf('BB.noteFollowups'),core.indexOf('BB.noteFollowups')+600)),'measured with BB.now()');
// it flips on the 1 s local redraw, with no network: a request crossing the threshold appears without any new state
reqs[1].decidedAt=ago(120500);assert.deepEqual(ids(),['flagged','fresh_approved','old_approved','old_recovering'],'crosses the threshold on the next redraw');
assert.ok(/setInterval\(\(\) => \{ if \(!document\.hidden && BB\.S\) BB\.emit\(\); \}, 1000\);/.test(core),'the local 1 s redraw that re-evaluates it is in place');
// the state cache is not removed for everyone
assert.ok(/Date\.now\(\) - c\.t < 30000/.test(api),'the 30 s state cache is unchanged');
console.log('PASS stalled-note lag: the client flags a note save stalled from decidedAt (or recoverStartedAt) with the server-synced clock and the server\'s 120 s threshold, so it appears within the 1 s redraw instead of after the 30 s state cache; the cache and server authority are unchanged');
