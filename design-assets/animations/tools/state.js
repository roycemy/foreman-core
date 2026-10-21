// Fake but shape-correct /api/state. v: {bots:n, run:{a1:'Weekly memo'}, queued:{a3:'...'}, rec:{a1:'session_expired'}, paused:['a4'], console:'a1', hist:{a3:[6,6,7]}, need:true}
module.exports=function(v){const now=Date.now(),iso=m=>new Date(now-m*60000).toISOString();
const N=[['a1','Grok Bot','grok','ops'],['a2','Muse','muse','marketing'],['a3','Instinct','instinct','finance'],['a4','Manus','manus','sales'],['a5','Poke','poke','lounge'],['a6','ChatGPT','chatgpt','ops'],['a7','Devin','devin','ops']];
const agents=N.slice(0,v.bots||3).map(([id,name,providerId,room])=>({id,name,providerId,provider:providerId,room,status:'active',lastSeen:new Date(now-(v.seen&&v.seen[id]!=null?v.seen[id]*60000:10000)).toISOString(),state:{kind:'HEARTBEAT',at:iso(0)},connection:{status:'active',transport:'botlink'},permissions:{},limits:{}}));
for(const id in v.rec||{}){const a=agents.find(x=>x.id===id);a.connection={status:'needs_reauth',reason:v.rec[id]};if(v.console===id)a.harness='console';}
(v.paused||[]).forEach(id=>agents.find(x=>x.id===id).paused=true);
const tasks=[];let n=0;const T=(o)=>tasks.push(Object.assign({id:'t'+(++n),createdAt:iso(40),updatedAt:iso(1)},o));
for(const id in v.run||{})T({title:v.run[id],assignee:id,status:'running',startedAt:iso((v.started&&v.started[id])||2)});
for(const id in v.queued||{})T({title:v.queued[id],assignee:id,status:'queued'});
for(const id in v.hist||{})v.hist[id].forEach((m,i)=>T({title:['Summarize inbox','Check vendor invoice','Research competitor pricing','Tidy notes'][i%4],assignee:id,status:'done',createdAt:iso(200+i*60+m),startedAt:iso(200+i*60+m),finishedAt:iso(200+i*60),result:'Done',modelCostUsd:.01*(i+1)}));
const R=v.receipts||[['a2','Draft launch note','Launch note, three short paragraphs',0.04,12],['a1','Summarize inbox','Five items, two need replies',0.02,50],['a3','Check vendor invoice','Invoice matches the order',0.01,90]];
R.forEach(([id,title,result,c,m])=>{if(agents.find(a=>a.id===id))T({title,assignee:id,status:'done',startedAt:iso(m+5),finishedAt:iso(m),result,modelCostUsd:c})});
return {now:new Date(now).toISOString(),agents,tasks,requests:v.need?[{id:'r1',agentId:'a2',status:'pending',action:'web.fetch',createdAt:iso(2),text:'Read a web page'}]:[],events:[],killed:false};};
