// Public waitlist signup. No email delivery or workspace access.
const crypto=require('crypto');
const makeSeats=require('../lib/founding-seats.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function createHandler({r,getJ}){
 const seats=makeSeats({r,getJ});
 return async function signup(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST required'});
  const allowed=new Set(['https://www.alterhq.app','https://alterhq.app','https://foreman-core.vercel.app']);
  if(!allowed.has(req.headers.origin))return res.status(403).json({error:'origin'});
  let body=req.body||{};
  if(typeof body==='string'){if(Buffer.byteLength(body)>4096)return res.status(413).json({error:'Request too large'});try{body=JSON.parse(body)}catch{return res.status(400).json({error:'Invalid request'})}}
  if(!body||typeof body!=='object'||Array.isArray(body))return res.status(400).json({error:'Invalid request'});
  if(Buffer.byteLength(JSON.stringify(body))>4096)return res.status(413).json({error:'Request too large'});
  if(body.website)return res.json({ok:true});
  const email=String(body.email||'').trim().toLowerCase();
  if(email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||(body.consent!==true&&body.consent!==false))return res.status(400).json({error:'Enter a valid email address.'});
  try{
   const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim(),hour=Math.floor(Date.now()/3600000);
   const networkKey='gl:waitlistRate:'+sha(ip)+':'+hour,n=Number(await r(['INCRBY',networkKey,1]));if(n===1)await r(['EXPIRE',networkKey,3600]);
   if(n>2500)return res.status(429).json({error:'Too many requests from this network. Try again later.'});
   const emailKey='gl:waitlistEmailRate:'+sha(email)+':'+hour,en=Number(await r(['INCRBY',emailKey,1]));if(en===1)await r(['EXPIRE',emailKey,3600]);
   if(en>10)return res.status(429).json({error:'Too many attempts for this address. Try again later.'});
   await seats.reconcile();
   const campaign=typeof body.src==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(body.src)?body.src:null;
   const token=/^[a-f0-9]{64}$/.test(body.signupToken||'')?body.signupToken:null;
   const hash=sha(email),entry={email,requestedAt:new Date().toISOString(),consent:body.consent===true?'Access availability email only':'none',source:'alter-site',...(campaign?{campaign}:{}),...(token?{claimHash:sha(token)}:{})};
   const added=await r(['SET','gl:waitlist:'+hash,JSON.stringify(entry),'NX']);
   await r(['SADD','gl:waitlist',hash]);
   return res.json({ok:true,...await seats.receipt(hash,!!added,body.receipt,token,body.consent)});
  }catch(e){res.setHeader('Retry-After','60');return res.status(503).json({error:'Waitlist temporarily unavailable. Please retry shortly.'});}
 };
}
const url=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL;
const token=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;
async function r(command){
 if(!url||!token)throw Error('Persistent storage unavailable');
 const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw Error('Storage unavailable');
 const data=await response.json();if(data.error)throw Error('Storage command failed');return data.result;
}
const getJ=async key=>{const raw=await r(['GET',key]);return raw?JSON.parse(raw):null};
module.exports=createHandler({r,getJ});
module.exports.createHandler=createHandler;
