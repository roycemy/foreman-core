const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const ctx={module:{exports:{}},require,process:{env:{}},global:{},console,URL,AbortSignal,setTimeout,clearTimeout,fetch:()=>{throw Error('NO NETWORK')}};
vm.runInNewContext(fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.test={joinWaitlist,foundingSeats,r,getJ,sha};',ctx);
const f=ctx.module.exports.test;f.joinWaitlist=require('./api/waitlist-signup').createHandler({r:f.r,getJ:f.getJ});
async function join(email,extra={},ip='shared-fixture'){let out;const res={setHeader(){},status(c){this.code=c;return this},json(j){return out={status:this.code||200,...j}}};await f.joinWaitlist({method:'POST',headers:{origin:'https://www.alterhq.app','x-forwarded-for':ip},body:{email,consent:true,...extra}},res);return out;}
(async()=>{
 const token=crypto.randomBytes(32).toString('hex');
 const a=await join('retry@fixture.test',{signupToken:token,src:'yash-group'});
 assert.equal(a.waitlistNumber,1);assert.equal(a.receipt,token);
 const entry=await f.getJ('gl:waitlist:'+f.sha('retry@fixture.test'));assert.equal(entry.campaign,'yash-group');assert.equal(entry.claimHash,f.sha(token));assert(!JSON.stringify(entry).includes(token));
 await f.r(['DEL','gl:seatReceipt:'+f.sha(token)]);
 assert.equal((await join('retry@fixture.test',{signupToken:token})).waitlistNumber,1,'retry recovers when receipt write failed');
 assert.equal((await join('retry@fixture.test',{signupToken:'a'.repeat(64)})).waitlistNumber,undefined,'arbitrary recovery token cannot get existing number');
 assert.equal((await join('retry@fixture.test',{receipt:token,signupToken:'b'.repeat(64)})).waitlistNumber,1,'known receipt beats unrelated pending token');
 for(let i=0;i<6;i++)await join('retry@fixture.test');
 assert.equal((await join('retry@fixture.test')).status,429,'per-email bound');
 const many=await Promise.all(Array.from({length:120},(_,i)=>join('batch'+i+'@fixture.test')));
 assert(many.every(x=>x.status===200));assert.equal(new Set(many.map(x=>x.waitlistNumber)).size,120);
 assert.equal((await join('campaign@fixture.test',{src:'<script>bad</script>'})).status,200);
 assert.equal((await f.getJ('gl:waitlist:'+f.sha('campaign@fixture.test'))).campaign,undefined);
 const rate='gl:waitlistRate:'+f.sha('blocked-fixture')+':'+Math.floor(Date.now()/3600000);await f.r(['SET',rate,2500]);assert.equal((await join('limited@fixture.test',{},'blocked-fixture')).status,429);
 assert.equal(await f.getJ('gl:waitlist:'+f.sha('limited@fixture.test')),null);
 console.log('PASS campaign validation, retry recovery, receipt privacy, email and shared-network limits, 120 concurrent isolated signups. Not a production load test.');
})().catch(e=>{console.error(e);process.exit(1)});
