// Mock API for local verification of the export. Shapes follow live /api/state plus PR #4's agent.connection.
const fs=require('fs');
const ago=s=>new Date(Date.now()-s*1000).toISOString();
const PERM={"web.fetch":"AUTO","notes.write":"ASK","notes.delete":"NEVER","work.handoff":"AUTO"};
const S={log:[],authed:true,connected:false,newAgent:null,reconnected:false,decisions:[],cardPosts:[],connectPosts:[],oauthAuthed:true,oauthMode:'consent',consentPosts:[]};
function conn(status,extra){return Object.assign({status,reconnectEndpoint:status==='not_applicable'?undefined:'/api/agents/:id/reconnect',requiresClientParameters:true},extra||{})}
function state(){
 const agents=[
  {id:'a2',name:'Grok Bot',room:'marketing',role:'Campaign builder',provider:'xAI Grok',providerId:'grok',status:'active',permissions:PERM,limits:{},spentTodayCents:12,lastSeen:ago(8),state:{kind:'ACTION_REQUESTED',at:ago(8),text:'Wants to save campaign brief',eventId:'e2'},connection:conn('active',{authorizedAt:ago(86400),lastRenewedAt:ago(3600)})},
  {id:'a3',name:'Instinct',room:'ops',role:'Chief of staff',provider:'Instinct',providerId:'instinct',status:'active',permissions:PERM,limits:{dailyCents:300},spentTodayCents:64,lastSeen:ago(4),state:{kind:'TASK_STARTED',at:ago(4),text:'Drafting the weekly operations memo',eventId:'e3',taskId:'t1'},connection:conn('active',{authorizedAt:ago(90000),lastRenewedAt:ago(1800)})},
  {id:'a4',name:'Muse',room:'finance',role:'Research and content',provider:'Meta Muse',providerId:'muse',status:'active',permissions:PERM,limits:{},spentTodayCents:3,lastSeen:ago(6),state:{kind:'TASK_STARTED',at:ago(6),text:'Researching launch references',eventId:'e4',taskId:'t4'},connection:conn('active',{authorizedAt:ago(70000)})},
  {id:'a1',name:'Scout',room:'sales',role:'Outreach research',provider:'xAI Grok',providerId:'grok',status:'active',permissions:PERM,limits:{dailyCents:500},spentTodayCents:0,lastSeen:ago(7200),state:{kind:'COMPLETED',at:ago(7200),text:'Finished prospect list',eventId:'e1'},connection:S.reconnected?conn('active',{authorizedAt:ago(1),lastRenewedAt:ago(1)}):conn('needs_reauth',{reason:'refresh_replay',failedAt:ago(1500)})},
  {id:'a6',name:'CEO',room:'ops',role:'Operations',provider:'Instinct',providerId:'instinct',status:'active',permissions:PERM,limits:{},spentTodayCents:0,lastSeen:null,state:null,connection:conn('awaiting_bot')},
 ];
 if(S.newAgent)agents.push({id:S.newAgent.id,name:S.newAgent.name,room:'ops',role:'Operations',provider:'xAI Grok',providerId:'grok',status:'active',permissions:PERM,limits:{},spentTodayCents:0,lastSeen:S.connected?ago(2):null,state:S.connected?{kind:'INTERACTION',at:ago(2),text:'foreman_presence',eventId:'e9'}:null,connection:S.connected?conn('active',{authorizedAt:ago(3)}):conn('awaiting_bot')});
 return {now:new Date().toISOString(),killed:false,agents,
  requests:S.decisions.includes('r1')?[]:[{id:'r1',agentId:'a2',agentName:'Grok Bot',status:'pending',action:'notes.write',label:'Save a note',params:{title:'Q4 campaign brief'},costCents:2}],
  receipts:[{id:'rc1',agentId:'a3',agentName:'Instinct',summary:'Saved note: weekly operations memo',action:'notes.write',outcome:'completed',approvedBy:'owner',hash:'9f2c1a7be0',prevHash:'11aa22bb33',costCents:2,at:ago(30),taskId:'t2'},
   {id:'rc2',agentId:'a4',agentName:'Muse',summary:'Fetched https://example.com/references',action:'web.fetch',outcome:'completed',hash:'7c3d9e0f12',prevHash:'9f2c1a7be0',costCents:1,at:ago(20),taskId:'t4'},
   {id:'rc3',agentId:'a1',agentName:'Scout',summary:'Tried to delete notes',action:'notes.delete',outcome:'blocked',code:'NEVER',hash:'aa11bb22cc',prevHash:'7c3d9e0f12',costCents:0,at:ago(3900)}],
  events:[{agentId:'a3',at:ago(4),text:'Drafting the weekly operations memo',kind:'TASK_STARTED',taskId:'t1'},{agentId:'a2',at:ago(8),text:'Wants to save campaign brief',kind:'NEEDS_APPROVAL'},{agentId:'a4',at:ago(6),text:'Researching launch references',kind:'TASK_STARTED',taskId:'t4'},{agentId:'a1',at:ago(7200),text:'Finished prospect list',kind:'COMPLETED'}],
  tasks:[{id:'t1',title:'Weekly operations memo',status:'running',assignee:'a3',createdAt:ago(300)},{id:'t2',title:'Summarize Q4 forecast',status:'done',assignee:'a3',createdAt:ago(900),result:'Forecast summary saved as a note.'},{id:'t4',title:'Collect launch references',status:'running',assignee:'a4',createdAt:ago(200)},{id:'t3',title:'Draft launch email',status:'queued',assignee:null,createdAt:ago(100)}],
  actions:{"web.fetch":{costCents:1},"notes.write":{costCents:2},"notes.delete":{costCents:1},"work.handoff":{costCents:0}},
  providers:[{id:'grok',name:'Grok',tier:'verified',how:'Key',note:''},{id:'instinct',name:'Instinct',tier:'manual',how:'Message',note:''},{id:'muse',name:'Muse',tier:'manual',how:'Key',note:''}]};
}
const money={bots:[{agentName:'Grok Bot',requestedCents:24000,approvedCents:0,deniedCents:0,chargedCents:0},{agentName:'Instinct',requestedCents:7000,approvedCents:7000,deniedCents:0,chargedCents:0}],
 requests:[{id:'m1',status:'pending_review',agentName:'Grok Bot',amountCents:24000,merchant:'Meta Ads',purpose:'Boost the top post for the Q4 launch',accountLabel:'Company card (not connected)',undoTerms:'Cancel any time before delivery',expiresAt:ago(-3600),detailsHash:'h'}],
 receipts:[{agentName:'Instinct',amountCents:7000,merchant:'Notion',outcome:'approved_not_connected',chargedCents:0,at:ago(7200),note:'Approved proposal only. No payment made.',requestId:'m0'}],metricsScope:'Figures cover proposals reviewed in this workspace only.'};
const cards={killed:false,bots:[{id:'a2',name:'Grok Bot',simulatedTodayCents:7000,dailyLimitCents:20000},{id:'a3',name:'Instinct',simulatedTodayCents:0,dailyLimitCents:10000}],
 proposals:[{id:'p1',botName:'Grok Bot',amountCents:7000,merchant:'Demo Ads',purpose:'Synthetic ad campaign demonstration',status:'pending',detailsHash:'h'},{id:'p0',botName:'Instinct',amountCents:1250,merchant:'Demo SaaS',purpose:'Synthetic subscription test',status:'approved',detailsHash:'h'}],
 ledger:[{botName:'Instinct',merchant:'Demo SaaS',amountCents:1250,outcome:'simulated_approved',note:'Fake provider authorization. $0 real charge.',at:ago(5000),id:'led_01'}]};
const oauthCtx=()=>({client:'Grok Bot (MCP client)',bots:[{id:'a2',name:'Grok Bot',provider:'xAI Grok'},{id:'a1',name:'Scout',provider:'xAI Grok'}],redirectOrigin:'https://grok.com',csrf:'x'});
async function mock(page,opts){opts=opts||{};
 await page.route('**/*',async route=>{const u=new URL(route.request().url());
  if(!/^(localhost|127\.0\.0\.1)$/.test(u.hostname)){ if(/fonts\.(googleapis|gstatic)\.com/.test(u.hostname))return route.continue(); return route.abort(); }
  if(u.pathname==='/oauth/authorize')return route.fulfill({path:opts.oauthFile||'/workspace/blackbox/export/public/oauth.html',contentType:'text/html'});
  if(!u.pathname.startsWith('/api/'))return route.continue();
  const p=u.pathname,m=route.request().method(),body=JSON.parse(route.request().postData()||'null');S.log=(S.log||[]);S.log.push({m,p,body});const J=(o,s)=>route.fulfill({status:s||200,contentType:'application/json',body:JSON.stringify(o)});
  if(p.startsWith('/api/oauth/context')){if(S.oauthMode==='error')return J({error:'This sign-in link expired. Reconnect from your bot.'});if(S.oauthMode==='fail')return route.abort();return S.oauthAuthed?J(oauthCtx()):J({error:'auth'},401)}
  if(p==='/api/auth/login'&&m==='POST'){S.authed=true;S.oauthAuthed=true;return J({ok:true})}
  if(p==='/api/auth/logout'){S.authed=false;return J({ok:true})}
  if(!S.authed)return J({error:'auth'},401);
  if(p==='/api/me')return J({email:'owner@example.com',legacy:false});
  if(p==='/api/state')return J(state());
  if(p==='/api/money')return J(money);
  if(p==='/api/cards'&&m==='GET')return J(cards);
  if(p.startsWith('/api/cards')&&m==='POST'){S.cardPosts.push({p,body});const mm=p.match(/\/api\/cards\/(\w+)\/(approve|deny)/);if(mm){const q=cards.proposals.find(x=>x.id===mm[1]);if(q)q.status=mm[2]==='approve'?'approved':'denied'}if(p==='/api/cards/control'&&body&&'killed' in body)cards.killed=body.killed;return J(cards)}
  if(p==='/api/connect'&&m==='POST'){S.connectPosts.push(body);S.newAgent={id:'n1',name:body.name||'New bot'};return J({agent:S.newAgent})}
  if(/^\/api\/agents\/\w+\/room$/.test(p)&&m==='POST'){S.rooms=(S.rooms||[]).concat([{id:p.split('/')[3],room:body.room}]);return J({agent:{id:p.split('/')[3],room:body.room}})}
  if(/^\/api\/requests\/r\d+/.test(p)||/\/api\/(approve|deny|resolve)/.test(p)){S.decisions.push(body&&body.id||p.split('/')[3]);S.lastDecision={p,body};return J({request:{id:'r1',status:/deny/.test(p+JSON.stringify(body))?'denied':'approved'}})}
  if(p==='/api/oauth/consent'){S.consentPosts.push(body);return J({redirect:'https://grok.com/cb?code=x'})}
  S.other=(S.other||[]).concat([{p,m,body}]);return J({});
 });
}
module.exports={S,mock,state,cards};

function reset(){Object.assign(S,{log:[],authed:true,connected:false,newAgent:null,reconnected:false,decisions:[],cardPosts:[],connectPosts:[],oauthAuthed:true,oauthMode:'consent',consentPosts:[],rooms:[],other:[]});cards.proposals.forEach(q=>{if(q.id==='p1')q.status='pending'});cards.killed=false}
module.exports.reset=reset;
