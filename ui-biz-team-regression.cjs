// Owner-facing functional team surface on the Business page. Responsibility-led rows: the
// functional title is primary, the owner is a secondary line MIRRORING the server's own
// resolver (bizRespBot/bizDelegateBot): research reads public pages on the engine even with
// a stray bot field; an explicit assignment is the exact owner and is never substituted
// (not connected = refuse with reassign/connect, never engine fallback); an unassigned
// non-research responsibility follows the connected delegate (automatic pick); a
// bot-marked responsibility with no unambiguous connected pick asks for an explicit
// assignment and never invents a gone owner. Every state is a saved classification - no
// live-presence or online claims, no universal manual-only promises, no proposals confused
// with run drafts. A paused schedule never hides an in-flight run. The surface dies with
// the identity. Real Chromium over CDP, stubbed API, synthetic data only.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert'),{spawn}=require('child_process');

const AGT={id:'agent_1',name:'Grokbot',providerId:'grok',status:'active',lastSeen:'2026-10-24T08:00:00Z',connection:{status:'active'},room:'ops'};
const TEAM=[
  {id:'agent_1',name:'Grokbot',providerId:'grok',connection:{status:'active'}},
  {id:'agent_2',name:'Quill',providerId:'anthropic',connection:{status:'revoked'}},
  {id:'agent_4',name:'Scout',providerId:'openai',connection:{status:'active'}} // paired, nothing handed off
];
const TEAM_C=[ // two connected non-grok bots: NO unambiguous automatic pick
  {id:'agent_2',name:'Quill',providerId:'anthropic',connection:{status:'active'}},
  {id:'agent_4',name:'Scout',providerId:'openai',connection:{status:'active'}}
];
const SRC=[{id:'s1',kind:'note',title:'Notes',text:'Synthetic note text.',version:1,updatedAt:'2026-10-23T00:00:00Z',createdAt:'2026-10-23T00:00:00Z'}];
const RESP_ASSIGNED={id:'resp_1',title:'Estimate follow-up desk',summary:'s',boundary:'Drafts only',status:'active',createdAt:'2026-10-23T00:00:00Z',runsCount:1,sourceIds:[],fp:'f1',
  assignment:{botId:'agent_1',botName:'Grokbot',assignedAt:'2026-10-23T02:00:00Z'}, // explicit, to the connected bot: exact owner retained
  runs:[{id:'run_1',kind:'work',status:'delegated',at:'2026-10-24T07:00:00Z',bot:{id:'agent_1',name:'Grokbot'},job:{status:'queued'}}]};
const RESP_NEEDSREVIEW={id:'resp_2',title:'Invoice chase desk',summary:'s',boundary:'Drafts only',status:'active',createdAt:'2026-10-23T00:00:00Z',runsCount:1,sourceIds:[],fp:'f2',
  assignment:{botId:'agent_2',botName:'Quill',assignedAt:'2026-10-23T02:00:00Z'},
  schedule:{freq:'daily',instruction:'x',delegateHash:'h',enabledAt:'2026-10-23T03:00:00Z',lastQueuedAt:null,needsReview:'2026-10-24T01:00:00Z'},
  runs:[{id:'run_2',kind:'daily',status:'delegated',at:'2026-10-24T06:00:00Z',bot:{id:'agent_2',name:'Quill'},job:{status:'queued'}}]}; // paused schedule AND an in-flight run: both must show
const RESP_GONE={id:'resp_3',title:'Permit tracker',summary:'s',boundary:'Drafts only',status:'active',createdAt:'2026-10-23T00:00:00Z',runsCount:0,sourceIds:[],fp:'f3',runs:[],
  assignment:{botId:'agent_9',botName:'Ghost',assignedAt:'2026-10-23T02:00:00Z'}}; // disappeared explicit owner
const RESP_RESEARCH={id:'resp_4',title:'Competitor watch',summary:'s',boundary:'Drafts only',status:'paused',createdAt:'2026-10-23T00:00:00Z',runsCount:2,sourceIds:[],fp:'f4',research:true,
  bot:{id:'agent_1',name:'Grokbot',providerId:'grok'}, // stray field: research still wins
  runs:[{id:'run_4',kind:'daily',status:'failed',at:'2026-10-23T09:00:00Z'}]};
const RESP_AUTOPICK={id:'resp_5',title:'Client update drafts',summary:'s',boundary:'Drafts only',status:'active',createdAt:'2026-10-23T00:00:00Z',runsCount:1,sourceIds:[],fp:'f5',
  runs:[{id:'run_5',kind:'work',status:'done',at:'2026-10-23T18:00:00Z',output:'draft text',bot:{id:'agent_1',name:'Grokbot'}}]}; // unassigned non-research: automatic pick
const RESP_BOTONLY={id:'resp_6',title:'Supplier nudges',summary:'s',boundary:'Drafts only',status:'active',createdAt:'2026-10-23T00:00:00Z',runsCount:0,sourceIds:[],bot:{id:'agent_2',name:'Quill',providerId:'anthropic'},fp:'f6',runs:[]};
const RESP_PLAIN={id:'resp_7',title:'Seasonal checklist',summary:'s',boundary:'Drafts only',status:'active',createdAt:'2026-10-23T00:00:00Z',runsCount:0,sourceIds:[],fp:'f7',runs:[]};
let C_RESPS=null; // mutable copy so an assignment save can land like the real server
function bizState(ident){
  if(ident==='F')return {engine:{configured:false,enabled:false,consent:null},profile:{name:'North Bend Contracting',blurb:'Demo',updatedAt:'2026-10-23T00:00:00Z'},
    delegate:{id:'agent_1',name:'Grokbot',providerId:'grok',connection:{status:'active'}},team:TEAM,
    sources:SRC,proposals:[],
    responsibilities:[RESP_ASSIGNED,RESP_NEEDSREVIEW,RESP_GONE,RESP_RESEARCH,RESP_AUTOPICK],log:[],opPending:null}; // same shape as A: the same-id trap
  if(ident==='B')return {engine:{configured:false,enabled:false,consent:null},delegate:null,team:[],sources:SRC,proposals:[],responsibilities:[],log:[],opPending:null};
  if(ident==='C'){if(!C_RESPS)C_RESPS=JSON.parse(JSON.stringify([RESP_BOTONLY,RESP_PLAIN]));return {engine:{configured:false,enabled:false,consent:null},profile:{name:'Two Bot Shop',blurb:'',updatedAt:'2026-10-23T00:00:00Z'},delegate:null,team:TEAM_C,sources:SRC,proposals:[],responsibilities:C_RESPS,log:[],opPending:null};}
  return {engine:{configured:false,enabled:false,consent:null},profile:{name:'North Bend Contracting',blurb:'Demo',updatedAt:'2026-10-23T00:00:00Z'},
    delegate:{id:'agent_1',name:'Grokbot',providerId:'grok',connection:{status:'active'}},team:TEAM,
    sources:SRC,proposals:[],
    responsibilities:[RESP_ASSIGNED,RESP_NEEDSREVIEW,RESP_GONE,RESP_RESEARCH,RESP_AUTOPICK],log:[],opPending:null};
}
let ident='A';
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://x');
  const json=o=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(o));};
  if(u.pathname==='/__ident'){ident=u.searchParams.get('to');return json({ok:true});}
  if(u.pathname==='/api/me')return json({email:ident.toLowerCase()+'@'+ident.toLowerCase()+'.test',workspace:'w'+ident});
  if(u.pathname==='/api/state')return json({now:new Date().toISOString(),agents:[AGT]});
  if(u.pathname==='/api/money')return json({requests:[]});
  if(u.pathname==='/api/cards')return json({proposals:[],bots:[],ledger:[]});
  if(u.pathname==='/api/business/state'){
    if(ident==='F'){setTimeout(()=>json(bizState(ident)),700);return;} // slow: leaves a window where the cleared view holds NO state
    return json(bizState(ident));
  }
  if(u.pathname==='/api/business/responsibilities/resp_6/assign'&&req.method==='POST'){
    let body='';req.on('data',d=>body+=d);req.on('end',()=>{
      const b=JSON.parse(body||'{}');
      const rp=C_RESPS&&C_RESPS.find(x=>x.id==='resp_6');
      if(!rp)return json({error:'not found'});
      if(b.reviewedFp!==rp.fp)return json({error:'changed'});
      rp.assignment=b.botId?{botId:b.botId,botName:(TEAM_C.find(t=>t.id===b.botId)||{}).name,assignedAt:new Date().toISOString()}:undefined;
      return json({responsibility:rp});
    });return;
  }
  if(u.pathname.startsWith('/api/'))return json({});
  if(u.pathname==='/'||u.pathname==='/app.html'||u.pathname==='/index.html'){res.setHeader('content-type','text/html');return res.end(fs.readFileSync('public/app.html'));}
  const fp=path.join('public',u.pathname);
  if(fs.existsSync(fp)&&fs.statSync(fp).isFile()){
    const ext=path.extname(fp);
    res.setHeader('content-type',ext==='.css'?'text/css':ext==='.js'?'text/javascript':ext==='.svg'?'image/svg+xml':ext==='.png'?'image/png':ext==='.webmanifest'?'application/manifest+json':'application/octet-stream');
    return res.end(fs.readFileSync(fp));
  }
  res.statusCode=404;res.end('nf');
});
function chrome(){for(const b of['google-chrome','google-chrome-stable','chromium','chromium-browser']){try{return fs.realpathSync(require('child_process').execSync('command -v '+b).toString().trim())}catch(e){}}return null;}

(async()=>{
 const bin=chrome();assert(bin,'a Chromium/Chrome binary is required for this browser regression');
 await new Promise(r=>server.listen(0,r));const port=server.address().port;
 const cp=spawn(bin,['--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port=0','about:blank'],{stdio:['ignore','ignore','pipe']});
 const wsUrl=await new Promise((res,rej)=>{let buf='';cp.stderr.on('data',d=>{buf+=d;const m=buf.match(/DevTools listening on (ws:\/\/\S+)/);if(m)res(m[1]);});cp.on('exit',()=>rej(new Error('chrome exited')));setTimeout(()=>rej(new Error('no DevTools endpoint')),15000);});
 const ws=new WebSocket(wsUrl);await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
 let idc=0;const pend={};
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend[m.id]){m.error?pend[m.id].rej(new Error(JSON.stringify(m.error))):pend[m.id].res(m.result);delete pend[m.id];}};
 const send=(method,params,sessionId)=>new Promise((res,rej)=>{const id=++idc;pend[id]={res,rej};ws.send(JSON.stringify({id,method,params:params||{},sessionId}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'});
 const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const ev=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw new Error('page eval: '+JSON.stringify((r.exceptionDetails.exception&&r.exceptionDetails.exception.description)||r.exceptionDetails.text));return r.result.value;};
 const poll=async(expr,timeout=16000)=>{const t0=Date.now();while(Date.now()-t0<timeout){if(await ev(expr))return true;await new Promise(r=>setTimeout(r,120));}return false;};
 const shot=async name=>{const s=await send('Page.captureScreenshot',{format:'png'},sessionId);fs.writeFileSync('/downloads/'+name,Buffer.from(s.data,'base64'));};
 const teamTxt=`(document.getElementById('bz-team')||{textContent:''}).textContent`;
 const rowTxt=`(()=>{const rows=[...document.querySelectorAll('#bz-team .bz-row')];return t=>{const r=rows.find(x=>x.textContent.includes(t));return r?r.textContent:'';};})()`;

 await send('Page.enable',{},sessionId);
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/#business'},sessionId);
 assert(await poll(`(document.getElementById('v-business')||{textContent:''}).textContent.includes('Estimate follow-up desk')`),'business view loaded');
 assert(await poll(`!!document.getElementById('bz-team')`),'team card renders');
 let t=await ev(teamTxt);
 assert(t.includes('Your team'),'team heading');

 // Functional responsibility titles are the primary rows
 assert(await ev(`(()=>{const c=document.getElementById('bz-team');const bs=[...c.querySelectorAll('.bz-row b')].map(b=>b.textContent);return ['Estimate follow-up desk','Invoice chase desk','Permit tracker','Competitor watch','Client update drafts'].every(x=>bs.includes(x));})()`),'every responsibility title is a primary row');

 // Owner lines mirror the server resolver, secondary to the title
 assert(await ev(`(${rowTxt})('Estimate follow-up desk').includes('Assigned to Grokbot · paired bot · grok')`),'explicit assignment to the connected bot keeps its exact owner');
 assert(await ev(`!(${rowTxt})('Estimate follow-up desk').includes('automatic pick')`),'an explicit assignment is never displayed as the automatic pick');
 assert(await ev(`(${rowTxt})('Client update drafts').includes('Handled by Grokbot · automatic pick · paired bot · grok')`),'unassigned non-research follows the connected delegate');
 assert(await ev(`(${rowTxt})('Invoice chase desk').includes('Assigned to Quill · paired bot · anthropic')`),'assigned owner named with provider secondary');
 assert(await ev(`(${rowTxt})('Permit tracker').includes('Assigned to Ghost')`),'disappeared explicit owner still named');
 assert(await ev(`(${rowTxt})('Competitor watch').includes('Runs on the reasoning engine · reads public pages')`),'research stays on the engine even with a stray bot field');
 assert(await ev(`!(${rowTxt})('Competitor watch').includes('Grokbot')`),'research never shows a bot owner');

 // Saved-state blocks: exact-owner refusal, no engine substitution, no auto-resume promise
 assert(t.includes('Not connected right now - reassign it or connect that bot first; the reasoning engine is never substituted. New runs go only when you send them; no automatic sends are live on this deployment.'),'assigned-not-connected refusal, deployment-bounded');
 assert(t.includes('No longer on your team - work assigned to it refuses until you reassign it or pair the bot again. The reasoning engine is never substituted.'),'disappeared explicit owner is a refusal, not an automatic-pick gap');
 assert(t.includes('The reasoning engine is not connected and allowed on this deployment yet - runs and daily check-ins are off until setup finishes.'),'engine block names the current off state without a manual-only promise');
 assert(!/every run yourself|nothing runs on its own/i.test(t),'no universal manual-only promise');

 // A paused schedule never hides an in-flight run
 assert(await ev(`(()=>{const x=(${rowTxt})('Invoice chase desk');return x.includes('schedule paused - the text it would send changed since your review')&&x.includes('a run was sent - waiting for its draft');})()`),'needsReview and the in-flight run both show');

 // Run states from saved runs only
 assert(await ev(`(${rowTxt})('Competitor watch').includes('last run')&&(${rowTxt})('Competitor watch').includes('did not finish')`),'failed run state');
 assert(await ev(`(${rowTxt})('Competitor watch').includes('Paused ·')`),'paused tag');
 assert(await ev(`(${rowTxt})('Client update drafts').includes('last draft')`),'settled draft state');
 assert(await ev(`(${rowTxt})('Permit tracker').includes('no runs yet')`),'no-runs state');

 // Chips are saved classifications only
 assert(await ev(`(()=>{const c=document.getElementById('bz-team');const chips=[...c.querySelectorAll('.bzc')].map(x=>x.textContent);return chips.includes('Paired')&&chips.includes('Reconnect needed')&&chips.includes('Reassign needed')&&chips.includes('Setup unfinished');})()`),'owner chips are saved classifications');

 // Honesty: no live-presence claims; proposals never equated with drafts
 for(const bad of ['online','is working on','Working on it','live now','active now'])
   assert(!t.toLowerCase().includes(bad.toLowerCase()),'no live-presence claim: '+bad);
 assert(!/proposal/i.test(t),'the team surface never equates proposals with drafts');

 // Unassigned paired bots: one secondary closing line, only the truly unassigned
 assert(await ev(`(()=>{const m=[...document.querySelectorAll('#bz-team p.meta')].map(p=>p.textContent).join('|');return m.includes('Also paired, with nothing handed off yet: Scout')&&!m.includes('Grokbot')&&!m.includes('Quill');})()`),'the unassigned line names only truly unassigned bots');

 // Assignment-shaped blocks carry their recovery on the row
 assert(await ev(`(()=>{const rows=[...document.querySelectorAll('#bz-team .bz-row')];const g=rows.find(r=>r.textContent.includes('Permit tracker'));return !!g.querySelector('[data-team-assign="resp_3"]')&&g.querySelector('[data-team-assign="resp_3"]').textContent==='Reassign';})()`),'disappeared-owner row carries Reassign');

 // Open navigates to the responsibility's own card
 await ev(`[...document.querySelectorAll('#bz-team [data-hq-target]')].find(b=>b.getAttribute('data-hq-target')==='[data-resp="resp_3"]').click();'go'`);
 assert(await poll(`!!document.querySelector('[data-run-input="resp_3"]')`),'Open expands that responsibility card');

 await ev(`document.getElementById('bz-team').scrollIntoView({block:'start'});'scroll'`);
 await new Promise(r=>setTimeout(r,300));
 await shot('biz-team-desktop.png');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true},sessionId);
 await ev(`document.getElementById('bz-team').scrollIntoView({block:'start'});'scroll'`);
 await new Promise(r=>setTimeout(r,300));
 await shot('biz-team-mobile.png');
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false},sessionId);

 // A retained A-identity team node across an in-page identity flip (the reviewer's repro),
 // in BOTH post-flip states:
 await ev(`window.__oldTeamCta=document.querySelector('[data-team-assign="resp_3"]');'stash'`);
 await ev(`fetch('/__ident?to=F');'flip'`);
 await ev(`window.BB.who={email:'f@f.test',workspace:'wF'};'flip-who'`);
 await ev(`location.hash='#floor';'away'`);
 await new Promise(r=>setTimeout(r,400));
 await ev(`location.hash='#business';'back'`); // route handler drops A's state (B = null) and starts the slow reload
 await new Promise(r=>setTimeout(r,250)); // the drop is synchronous with routing; the fetch is still out
 // 1. while the cleared view holds NO state: must not throw
 const stale1=await ev(`(()=>{try{window.__oldTeamCta.click();return 'no-throw';}catch(e){return 'threw: '+e.message;}})()`);
 assert(stale1==='no-throw','a retained A team node on the cleared view must not throw - got '+stale1);
 assert(!(await ev(`!!document.querySelector('[data-assign-save]')`)),'no chooser from the retained node while cleared');
 // 2. once the new identity's state (same responsibility ids) HAS loaded: must not open it
 assert(await poll(`!!document.getElementById('bz-team')`),'flipped identity state loads');
 const stale2=await ev(`(()=>{try{window.__oldTeamCta.click();return 'no-throw';}catch(e){return 'threw: '+e.message;}})()`);
 assert(stale2==='no-throw','retained node still must not throw - got '+stale2);
 assert(!(await ev(`!!document.querySelector('[data-assign-save]')`)),"a retained A node never opens a same-id responsibility under the new identity");

 // Workspace C: two connected non-grok bots - no unambiguous automatic pick. A bot-marked
 // responsibility asks for an explicit assignment and never invents a gone owner; a plain
 // responsibility falls to the engine with its setup-off state.
 await ev(`fetch('/__ident?to=C');'flip'`);
 await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/?to=C#business'},sessionId); // query change forces a real reload: the shell re-fetches identity fresh
 assert(await poll(`(()=>{const t=(document.getElementById('v-business')||{textContent:''}).textContent;return t.includes('Two Bot Shop');})()`),'C business view loaded');
 assert(await poll(`!!document.getElementById('bz-team')`),'C team card renders');
 t=await ev(teamTxt);
 assert(await ev(`(${rowTxt})('Supplier nudges').includes('Runs on a connected bot')`),'bot-marked responsibility says what it runs on');
 assert(t.includes('Alter does not pick between your connected bots on its own - assign a specific bot from its card below. The reasoning engine is never substituted.'),'no unambiguous pick asks for an explicit assignment');
 assert(!t.includes('No longer on your team'),'an unavailable automatic pick is never shown as a disappeared owner');
 assert(await ev(`(()=>{const c=document.getElementById('bz-team');return [...c.querySelectorAll('.bzc')].some(x=>x.textContent==='Assignment needed');})()`),'assignment-needed chip');
 assert(await ev(`(${rowTxt})('Seasonal checklist').includes('Runs on the reasoning engine')`),'plain responsibility with no pick falls to the engine');
 assert(t.includes('runs and daily check-ins are off until setup finishes'),'engine off state in C');
 assert(await ev(`(()=>{const m=[...document.querySelectorAll('#bz-team p.meta')].map(p=>p.textContent).join('|');return m.includes('Quill')&&m.includes('Scout');})()`),'both unassigned paired bots named in C');

 // Team-row recovery: the row's Assign a bot opens the SAME reviewed chooser inside the
 // responsibility's own card; saving through it lands like any assignment save.
 assert(await ev(`(()=>{const rows=[...document.querySelectorAll('#bz-team .bz-row')];const r6=rows.find(r=>r.textContent.includes('Supplier nudges'));const b=r6&&r6.querySelector('[data-team-assign="resp_6"]');if(!b||b.textContent!=='Assign a bot')return false;b.click();return true;})()`),'no-pick row carries Assign a bot');
 assert(await poll(`!!document.querySelector('[data-assign-save="resp_6"]')`),'the reviewed chooser opens inside the responsibility card');
 assert(await ev(`(()=>{const r=[...document.querySelectorAll('[data-assign-bot]')];return r.length===3&&r.some(x=>x.value==='agent_4')&&r.some(x=>x.value==='');})()`),'chooser lists the paired bots plus the automatic pick');
 await ev(`[...document.querySelectorAll('[data-assign-bot]')].find(x=>x.value==='agent_4').click();'pick'`);
 await ev(`document.querySelector('[data-assign-save="resp_6"]').click();'save'`);
 assert(await poll(`(()=>{const rows=[...document.querySelectorAll('#bz-team .bz-row')];const r6=rows.find(r=>r.textContent.includes('Supplier nudges'));return r6&&r6.textContent.includes('Assigned to Scout');})()`),'the saved assignment repaints the team row with the exact new owner');
 assert(await ev(`(()=>{const rows=[...document.querySelectorAll('#bz-team .bz-row')];const r6=rows.find(r=>r.textContent.includes('Supplier nudges'));return !r6.querySelector('[data-team-assign]');})()`),'the recovery CTA clears once assigned');

 // Identity flip: another workspace's empty state never paints A's team
 await ev(`fetch('/__ident?to=B');'flip'`);
 await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/?to=B#business'},sessionId);
 assert(await poll(`(()=>{const t=(document.getElementById('v-business')||{textContent:''}).textContent;return t.includes('What Alter knows')&&!t.includes('North Bend Contracting')&&!t.includes('Two Bot Shop');})()`),'B business view loaded');
 await new Promise(r=>setTimeout(r,400));
 assert(!(await ev(`!!document.getElementById('bz-team')`)),"no team card under another workspace's empty state");
 t=await ev(`(document.getElementById('v-business')||{textContent:''}).textContent`);
 assert(!t.includes('Grokbot')&&!t.includes('Estimate follow-up desk'),"none of A's team data paints under B");


 cp.kill();server.close();
 console.log('ui-biz-team-regression: PASS');
})().catch(e=>{console.error('ui-biz-team-regression: FAIL -',e.message);process.exit(1);});
