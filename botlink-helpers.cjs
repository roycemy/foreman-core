// Shared fixtures for botlink-*-regression.cjs. Fake values only; no network, no spend. Not a suite.
// The fixture policy executor stands in for api/index.js gatewayAct; botlink-gateway-e2e runs the real one.
const crypto=require('crypto'),{BotLink,memoryStore}=require('./api/bot-link.js');
const fresh=(n=24)=>'test_'+crypto.randomBytes(n).toString('hex');
const ACTIONS=['notes.write','web.fetch'];
function fixturePolicy(acts=[]){return async(bot,{action,params})=>{acts.push({botId:bot.id,action,params});return {status:202,body:{status:'pending',request_id:'req_fixture'+acts.length},governed:true};};}
function makeLink(extra={}){const clock={t:Date.UTC(2026,9,14,12)};const store=memoryStore(()=>clock.t);const acts=[];
 const bl=new BotLink({store,now:()=>clock.t,executeAct:fixturePolicy(acts),actions:()=>ACTIONS,...extra});return {bl,store,clock,acts};}
async function connect(bl,type,{ws='ws_test',account='owner@example.test',reattachBotId=null,confirm=true}={}){
 const c=(reattachBotId?await bl.repasteMessage(ws,reattachBotId,'https://alter.invalid'):await bl.createPairing({ws,account,type,origin:'https://alter.invalid'})).body;
 const secret=fresh();const h=await bl.hello(c.pairingId,{nonce:fresh(),callerSecret:secret,fingerprint:{userAgent:'fixture-agent'}});if(h.status!==202)throw Error('hello '+h.status+' '+JSON.stringify(h.body));
 const a=await bl.approve(ws,c.pairingId,{confirmBotId:reattachBotId&&confirm?reattachBotId:null});if(a.status!==200)return {pairing:c,secret,approve:a};
 const k=await bl.pickup(c.pairingId,{callerSecret:secret});const e=await bl.call(k.body.key,{op:'echo',text:'hi'});
 return {pairing:c,secret,botId:k.body.botId,firstKey:k.body.key,key:e.body.nextKey,echo:e};}
const act=(bl,key,extra={})=>bl.call(key,{op:'act',action:'notes.write',params:{title:'fixture'},...extra});
module.exports={makeLink,connect,fresh,act,fixturePolicy,ACTIONS};
// Localhost stub downstream for botlink-live-regression.cjs: node:http on 127.0.0.1, ephemeral port, in-process.
// Synthetic costs only. It charges its own ledger only for work it actually performs, so the ledger is
// independent evidence of spend. Starts PERMISSIVE (no scope check) so a bypass is observable; strict:true enforces it.
function startStubDownstream({secret,now=Date.now}={}){
 const http=require('http'),{verifyScope}=require('./api/bot-link.js');
 const ledger=[],st={mode:'ok',costCents:100,delayMs:5,failStatus:500,partialCents:0,chunks:3,overBy:50,strict:false};
 const charge=(jobId,cents)=>{if(cents>0)ledger.push({jobId,cents,at:now()});};
 const json=(res,code,body,cost)=>{res.writeHead(code,{'Content-Type':'application/json',...(cost!=null?{'X-Stub-Cost-Cents':String(cost)}:{})});res.end(JSON.stringify(body));};
 const hung=new Set();
 const srv=http.createServer((req,res)=>{let raw='';req.on('data',d=>raw+=d);req.on('end',async()=>{
  let body={};try{body=raw?JSON.parse(raw):{}}catch{return json(res,400,{error:'bad_json'})}
  const path=req.url.split('?')[0];
  if(path==='/health'&&req.method==='GET')return json(res,200,{ok:true});
  if(path==='/__ledger'&&req.method==='GET')return json(res,200,{ledger,totalCents:ledger.reduce((n,x)=>n+x.cents,0)});
  if(path==='/__control'&&req.method==='POST'){Object.assign(st,body);return json(res,200,{state:st});}
  if(path!=='/v1/run'||req.method!=='POST')return json(res,404,{error:'not_found'});
  let scope=null;
  if(st.strict){
   const auth=String(req.headers.authorization||''),hdr=String(req.headers['x-alter-scope']||'');
   if(/^Bearer\s+alk_/.test(auth)||/^alk_/.test(hdr))return json(res,401,{error:'alter_link_key_not_accepted'});
   const v=verifyScope(hdr,secret,now);if(v.error)return json(res,401,{error:v.error});
   if(v.scope.jobId!==body.jobId)return json(res,403,{error:'scope_job_mismatch'});
   scope=v.scope;
  }
  const jobId=body.jobId,cap=scope?scope.maxCents:Infinity,out='stub:'+String(body.input||'');
  if(st.mode==='hang'){hung.add(res);return;}
  if(st.mode==='fail'){charge(jobId,Math.min(st.partialCents,cap));return json(res,st.failStatus,{ok:false,error:'stub_failure',costCents:Math.min(st.partialCents,cap)},Math.min(st.partialCents,cap));}
  if(st.mode==='overrun'){const c=(scope?scope.maxCents:st.costCents)+st.overBy;charge(jobId,c);return json(res,200,{ok:true,output:out,costCents:c},c);}
  if(st.mode==='slow'){
   res.writeHead(200,{'Content-Type':'application/x-ndjson'});let cum=0,closed=false;res.on('close',()=>{closed=true;});
   for(let i=0;i<st.chunks;i++){
    await new Promise(r=>setTimeout(r,st.delayMs));if(closed)return;
    if(cum+st.costCents>cap){res.end(JSON.stringify({done:true,ok:false,refused:'scope_max',costCents:cum})+'\n');return;}
    cum+=st.costCents;charge(jobId,st.costCents);res.write(JSON.stringify({chunk:i,cents:st.costCents,cumulative:cum})+'\n');
   }
   if(!closed)res.end(JSON.stringify({done:true,ok:true,output:out,costCents:cum})+'\n');return;
  }
  const c=Math.min(st.costCents,cap);charge(jobId,c);return json(res,200,{ok:true,output:out,costCents:c},c);
 });});
 return new Promise(resolve=>srv.listen(0,'127.0.0.1',()=>{const url='http://127.0.0.1:'+srv.address().port;
  resolve({url,state:st,ledger:()=>ledger.slice(),control:o=>Object.assign(st,o),
   close:()=>new Promise(r=>{for(const h of hung)try{h.destroy()}catch{};srv.closeAllConnections&&srv.closeAllConnections();srv.close(()=>r());})});}));
}
module.exports.startStubDownstream=startStubDownstream;
