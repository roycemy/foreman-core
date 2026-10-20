/* Estimate = median duration of this bot's last 10 finished jobs (min 3). Whole minutes, '~', always labelled. Refresh once a minute, not per second. */
(function(){const BB=window.BB=window.BB||{};
BB.medianMs=function(botId,tasks){const d=(tasks||[]).filter(t=>t.assignee===botId&&t.status==='done'&&t.finishedAt&&(t.startedAt||t.createdAt)).sort((a,b)=>String(b.finishedAt).localeCompare(String(a.finishedAt))).slice(0,10).map(t=>Date.parse(t.finishedAt)-Date.parse(t.startedAt||t.createdAt)).filter(x=>x>0).sort((a,b)=>a-b);
 if(d.length<3)return null;const m=d.length>>1;return d.length%2?d[m]:(d[m-1]+d[m])/2;};
const mins=ms=>Math.max(1,Math.round(ms/60000));
BB.estimate=function(t,tasks){const med=BB.medianMs(t.assignee,tasks);if(med==null)return{k:'none',text:'No estimate yet'};
 if(t.status!=='running')return{k:'usual',text:'Usually about '+mins(med)+' min once started (estimate)'};
 const el=Date.now()-Date.parse(t.startedAt||t.createdAt),left=med-el;
 if(el>med*1.25)return{k:'long',text:'Taking longer than usual (usually about '+mins(med)+' min)'};
 if(left<=60000)return{k:'left',text:'~1 min left (estimate)'};
 return{k:'left',text:'~'+mins(left)+' min left (estimate)'};};
BB.estimateHTML=(t,tasks)=>{const e=BB.estimate(t,tasks);return `<span class="est" data-k="${e.k}">${e.text}</span>`};})();
