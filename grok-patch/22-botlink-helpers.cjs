// Shared fixtures for botlink-*-regression.cjs. Fake values only; no network, no spend.
const crypto=require('crypto'),{BotLink,memoryStore}=require('./api/bot-link.js');
const fresh=(n=24)=>'test_'+crypto.randomBytes(n).toString('hex');
function makeLink(extra={}){const clock={t:Date.UTC(2026,9,14,12)};const store=memoryStore();const bl=new BotLink({store,now:()=>clock.t,...extra});return {bl,store,clock};}
async function connect(bl,type,{ws='ws_test',account='owner@example.test',reattachBotId=null,confirm=true}={}){
 const c=(reattachBotId?await bl.repasteMessage(ws,reattachBotId,'https://alter.invalid'):await bl.createPairing({ws,account,type,origin:'https://alter.invalid'})).body;
 const secret=fresh();const h=await bl.hello(c.pairingId,{nonce:fresh(),callerSecret:secret,fingerprint:{userAgent:'fixture-agent'}});if(h.status!==202)throw Error('hello '+h.status+' '+JSON.stringify(h.body));
 const a=await bl.approve(ws,c.pairingId,{confirmBotId:reattachBotId&&confirm?reattachBotId:null});if(a.status!==200)return {pairing:c,secret,approve:a};
 const k=await bl.pickup(c.pairingId,{callerSecret:secret});const e=await bl.call(k.body.key,{op:'echo',text:'hi'});
 return {pairing:c,secret,botId:k.body.botId,firstKey:k.body.key,key:e.body.nextKey,echo:e};}
module.exports={makeLink,connect,fresh};
