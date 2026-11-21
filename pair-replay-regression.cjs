// A lost pairing response can be replayed (same code, same IP, within 5 minutes) and returns the same key, but the store keeps that key only
// encrypted. A replay record written before this change (plaintext, 5-minute TTL) is still honored. Offline, in-memory store.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const API=path.join(__dirname,'api/index.js'),src=fs.readFileSync(API,'utf8')+'\nmodule.exports.t={setJ,getJ,sha,als,createAgent};';
const ctx={require:require('module').createRequire(API),module:{exports:{}},process:{env:{}},global:{},console:{log(){},warn(){},error(){}},fetch:async u=>{throw Error('NO NETWORK '+u)},setTimeout,clearTimeout,URL,AbortSignal,Buffer};
vm.runInNewContext(src,ctx);const h=ctx.module.exports,f=h.t,mem=ctx.global.__mem;const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
async function http(method,url,{cookie,body,origin,ip}={}){let o;const headers={host:'alter.example',origin:origin||'https://alter.example','x-forwarded-for':ip||'198.51.100.9'};if(cookie)headers.cookie='fm_sess='+cookie;const res={setHeader(){},status(c){this.code=c;return this},json(j){o={code:this.code||200,j}},send(b){o={code:this.code||200,j:b}},end(){o={code:this.code||204}}};await h({method,url,headers,body:body||{}},res);return o;}
(async()=>{const ws='ws_pr';await f.setJ('gl:user:'+sha('o@pr.example'),{id:'u',email:'o@pr.example',ws});await f.setJ('gl:sess:'+sha('ck'),{uid:'u',email:'o@pr.example',ws});
 const b=await f.als.run({ws},()=>f.createAgent('Muse','x','muse',false,{preset:'balanced'}));
 const pair=await http('POST','/api/agents/'+b.agent.id+'/pairing',{cookie:'ck'});assert.equal(pair.code,200,JSON.stringify(pair.j));
 const r1=await http('POST','/api/pairing/redeem',{body:{code:pair.j.code,expected_agent_id:b.agent.id}});assert.equal(r1.code,200,JSON.stringify(r1.j));const key=r1.j.key;assert.ok(/^fmk_/.test(key));
 const dump=JSON.stringify([...mem.kv.entries()].map(([k,v])=>[k,v instanceof Set?[...v]:v]));assert.ok(!dump.includes(key),'the gateway key is not stored in plain form anywhere');
 const r2=await http('POST','/api/pairing/redeem',{body:{code:pair.j.code,expected_agent_id:b.agent.id}});assert.equal(r2.code,200);assert.equal(r2.j.key,key,'a replay from the same IP returns the same key');
 assert.notEqual((await http('POST','/api/pairing/redeem',{body:{code:pair.j.code,expected_agent_id:b.agent.id},ip:'203.0.113.77'})).code,200,'another IP gets nothing');
 // a replay record in the pre-change shape (plaintext key) is still read
 const rk=[...mem.kv.keys()].find(k=>k.startsWith('gl:pairReplay:')),rec=JSON.parse(mem.kv.get(rk));mem.kv.set(rk,JSON.stringify({...rec,body:{key,agent:rec.body.agent}}));
 const r3=await http('POST','/api/pairing/redeem',{body:{code:pair.j.code,expected_agent_id:b.agent.id}});assert.equal(r3.j.key,key,'legacy replay record honored');
 console.log('PASS pairing replay: same code and IP within 5 minutes returns the same key; another IP gets nothing; the key is stored only encrypted; a pre-change plaintext replay record is still honored');
})().catch(e=>{console.error(e);process.exit(1)});
