'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),crypto=require('crypto');
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(x);
const eq=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
function readSecret(file){const st=fs.statSync(file);if(!st.isFile()||(st.mode&0o077))throw Error('Secret files require owner-only permissions');const s=fs.readFileSync(file,'utf8').trim();if(s.length<24)throw Error('Secret too short');return s;}
class Bridge{
 constructor({bots,stateFile,fetchImpl=fetch,now=Date.now}){this.bots=new Map();this.file=stateFile;this.fetch=fetchImpl;this.now=now;this.running=new Set();this.verified=new Set();this.data={bots:{}};if(fs.existsSync(stateFile))this.data=JSON.parse(fs.readFileSync(stateFile,'utf8'));for(const b of bots){if(!/^agent_[a-f0-9]+$/.test(b.id)||this.bots.has(b.id))throw Error('Invalid or duplicate bot');const u=new URL(b.url);if(u.protocol!=='https:')throw Error('HTTPS upstream required');this.bots.set(b.id,{...b,url:u.origin});this.data.bots[b.id]??={queue:[],seen:{},session:null,halted:false};}this.save();}
 save(){fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(this.data),{mode:0o600});fs.renameSync(tmp,this.file);fs.chmodSync(this.file,0o600);}
 intake(id,token,body){const b=this.bots.get(id);if(!b||!eq(token,b.intakeToken))return {status:401};const d=this.data.bots[id];if(d.halted)return {status:409,error:'Bot stopped; owner must repair or revoke configuration'};
 const allowed=body&&['presence','start','update','end'].includes(body.phase)&&valid(body.event_id)&&Number.isFinite(body.at);if(!allowed||Object.keys(body).some(k=>!['phase','event_id','session_id','at'].includes(k)))return {status:400,error:'Only lifecycle metadata is accepted; no chat content'};
 const age=this.now()-body.at;if(age< -5000||age>10000)return {status:409,error:'Event is stale or future-dated'};
 const hash=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');if(d.seen[body.event_id])return d.seen[body.event_id]===hash?{status:202,duplicate:true}:{status:409,error:'Event ID reused with different metadata'};
 if(d.queue.length>=100)return {status:429,error:'Queue full; stop source and report delivery failure'};
 let payload=null;if(body.phase!=='presence'){if(!valid(body.session_id))return {status:400};if(body.phase==='start'){if(d.session)return {status:409,error:'End current response first'};d.session={id:body.session_id,sequence:0};}if(!d.session||d.session.id!==body.session_id)return {status:409,error:'Response session mismatch'};payload={session_id:d.session.id,event_id:body.event_id,sequence:++d.session.sequence,phase:body.phase};if(body.phase==='end')d.session=null;}
 d.seen[body.event_id]=hash;const ids=Object.keys(d.seen);if(ids.length>1000)delete d.seen[ids[0]];d.queue.push({received:this.now(),phase:body.phase,payload});this.save();return {status:202};}
 async drain(id){if(this.running.has(id))return;this.running.add(id);try{const b=this.bots.get(id),d=this.data.bots[id];
 if(d.halted||!d.queue.length)return;
 if(!this.verified.has(id)){let identity;try{identity=await this.fetch(b.url+'/api/gateway/me',{headers:{Authorization:'Bearer '+b.gatewayKey},signal:AbortSignal.timeout(5000)});}catch{return;}
 if(identity.status>=500||identity.status===429)return;
 let me;try{me=await identity.json()}catch{me=null}
 if(!identity.ok||!me||me.agent?.id!==id||me.agent.status!=='active'){d.halted=true;d.reason='identity_rejected';d.httpStatus=identity.status;this.save();return;}this.verified.add(id);}
 while(!d.halted&&d.queue.length){const e=d.queue[0];
 // Never replay delayed typing or presence as though it is happening now.
 if(e.phase!=='end'&&this.now()-e.received>10000){d.halted=true;d.reason='stale_delivery';this.save();return;}
 let r;try{r=await this.fetch(b.url+'/api/gateway/'+(e.phase==='presence'?'presence':'owner-conversation'),{method:'POST',headers:{Authorization:'Bearer '+b.gatewayKey,'Content-Type':'application/json'},body:JSON.stringify(e.payload||{}),signal:AbortSignal.timeout(5000)});}catch{return;}
 if(r.status>=500||r.status===429)return;
 if(!r.ok){d.halted=true;d.reason='upstream_rejected';d.httpStatus=r.status;this.save();return;}
 d.queue.shift();this.save();}}finally{this.running.delete(id);}}
 // Owner revoke: stop this bot's queue only. Held events are never replayed as live.
 halt(id,reason='revoked'){const d=this.data.bots[id];if(!d)return false;d.halted=true;d.reason=reason;d.queue=[];this.save();return true;}
 status(){return [...this.bots.keys()].map(id=>({id,queued:this.data.bots[id].queue.length,halted:this.data.bots[id].halted,reason:this.data.bots[id].reason||null}));}
}
function server(bridge){return http.createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');const respond=(code,obj)=>{res.statusCode=code;res.end(JSON.stringify(obj));};const m=(req.url||'').match(/^\/bots\/(agent_[a-f0-9]+)\/events$/);if(req.method!=='POST'||!m)return respond(404,{error:'Not found'});let chunks=[],n=0;for await(const c of req){n+=c.length;if(n>2048){respond(413,{error:'Metadata too large'});return;}chunks.push(c);}let body;try{body=JSON.parse(Buffer.concat(chunks).toString())}catch{return respond(400,{error:'Invalid JSON'})}const token=String(req.headers.authorization||'').replace(/^Bearer /,'');const result=bridge.intake(m[1],token,body);respond(result.status,{accepted:result.status===202,duplicate:!!result.duplicate,...(result.error?{error:result.error}:{})});if(result.status===202)void bridge.drain(m[1]);});}
function main(){const config=JSON.parse(fs.readFileSync(process.env.ALTER_BRIDGE_CONFIG||'/etc/alter-bridge/config.json','utf8'));const bots=config.bots.map(b=>({...b,gatewayKey:readSecret(b.gatewayKeyFile),intakeToken:readSecret(b.intakeTokenFile)}));const bridge=new Bridge({bots,stateFile:config.stateFile||'/var/lib/alter-bridge/state.json'});const app=server(bridge);app.listen(config.port||8788,'127.0.0.1',()=>console.log('Alter bridge listening on loopback; no source adapters enabled automatically'));setInterval(()=>{for(const id of bridge.bots.keys())void bridge.drain(id)},1000);}
if(require.main===module){try{main()}catch{console.error('Bridge configuration failed; check owner-only credential files and non-secret configuration');process.exitCode=1;}}
module.exports={Bridge,server,readSecret};
