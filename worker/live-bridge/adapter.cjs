'use strict';
// Explicit adapter, no polling, no simulated provider lifecycle.
const crypto=require('crypto');
function createAdapter({botId,intakeToken,base='http://127.0.0.1:8788',fetchImpl=fetch,now=Date.now}){const u=new URL(base);if(u.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname))throw Error('Adapter requires local loopback intake');let session=null,pending=null;
 async function emit(phase){if(pending&&pending.phase!==phase)throw Error('Resolve prior delivery first');if(!pending){if(phase==='start'){if(session)throw Error('Already composing');session=crypto.randomUUID();}if(phase!=='presence'&&!session)throw Error('No response session');pending={phase,event_id:crypto.randomUUID(),at:now(),...(phase==='presence'?{}:{session_id:session})};}const r=await fetchImpl(base+'/bots/'+botId+'/events',{method:'POST',headers:{Authorization:'Bearer '+intakeToken,'Content-Type':'application/json'},body:JSON.stringify(pending),signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('Bridge rejected lifecycle event ('+r.status+')');if(phase==='end')session=null;pending=null;}
 return {start:()=>emit('start'),update:()=>emit('update'),end:()=>emit('end'),presence:()=>emit('presence')};}
module.exports={createAdapter};
