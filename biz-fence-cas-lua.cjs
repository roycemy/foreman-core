// Real-Redis evidence for the bridge's fenced write scripts. The in-memory mirror in
// api/index.js is a test double; this harness exercises the ACTUAL Lua against an actual
// Redis server (EVAL semantics, atomicity, concurrency), plus mirror parity on the same
// sequences. Requires a redis-server binary: node biz-fence-cas-lua.cjs [path-to-redis-server]
const fs=require('fs'),vm=require('vm'),net=require('net'),assert=require('assert');
const {spawn}=require('child_process');

// Pull the exact production script strings out of api/index.js (no copies to drift).
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={BIZ_FENCE_CAS,BIZ_FENCE_RUN,BIZ_FENCE_SET,r,als};';
const c={require:(m)=>require(m),module:{exports:{}},process:{env:{}},global:{},console,URL,Buffer,AbortSignal,setTimeout,clearTimeout,fetch:async()=>{throw new Error('no network in fixture')}};
vm.runInNewContext(src,c);const f=c.module.exports.t;

// Minimal RESP2 client.
function redis(port){
  const sock=net.connect(port,'127.0.0.1');let buf=Buffer.alloc(0);const waiters=[];
  function parse(){
    while(true){
      if(!buf.length)return;
      const t=String.fromCharCode(buf[0]);
      const end=buf.indexOf('\r\n');
      if(end<0)return;
      const line=buf.slice(1,end).toString();
      if(t==='+'||t==='-'||t===':'){
        buf=buf.slice(end+2);
        const v=t==='+'?line:t==='-'?new Error(line):Number(line);
        const w=waiters.shift();w&&(v instanceof Error?w.rej(v):w.res(v));
        continue;
      }
      if(t==='$'){
        const len=Number(line);
        if(len===-1){buf=buf.slice(end+2);const w=waiters.shift();w&&w.res(null);continue;}
        if(buf.length<end+2+len+2)return;
        const v=buf.slice(end+2,end+2+len).toString();
        buf=buf.slice(end+2+len+2);
        const w=waiters.shift();w&&w.res(v);
        continue;
      }
      if(t==='*'){
        const n=Number(line);
        if(n===-1){buf=buf.slice(end+2);const w=waiters.shift();w&&w.res(null);continue;}
        // decode inline (small arrays only in this harness)
        let off=end+2;const out=[];let ok=true;
        for(let i=0;i<n;i++){
          if(off>=buf.length){ok=false;break;}
          const t2=String.fromCharCode(buf[off]);const e2=buf.indexOf('\r\n',off);
          if(e2<0){ok=false;break;}
          const l2=buf.slice(off+1,e2).toString();
          if(t2==='$'){const ln=Number(l2);if(buf.length<e2+2+ln+2){ok=false;break;}out.push(buf.slice(e2+2,e2+2+ln).toString());off=e2+2+ln+2;}
          else if(t2===':'){out.push(Number(l2));off=e2+2;}
          else if(t2==='+'){out.push(l2);off=e2+2;}
          else{ok=false;break;}
        }
        if(!ok)return;
        buf=buf.slice(off);const w=waiters.shift();w&&w.res(out);
        continue;
      }
      throw new Error('bad RESP type '+t);
    }
  }
  sock.on('data',d=>{buf=Buffer.concat([buf,d]);parse();});
  const call=(...args)=>new Promise((res,rej)=>{
    waiters.push({res,rej});
    const parts=['*'+args.length,...args.flatMap(a=>{const s=String(a);return ['$'+Buffer.byteLength(s),s]})];
    sock.write(parts.join('\r\n')+'\r\n');
  });
  return {call,close:()=>sock.destroy()};
}

(async()=>{
 const bin=process.argv[2]||'/tmp/redisbuild/redis-stable/src/redis-server';
 assert(fs.existsSync(bin),'redis-server binary not found: '+bin);
 const port=40000+Math.floor(Math.random()*20000);
 const srv=spawn(bin,['--port',String(port),'--save','','--appendonly','no','--bind','127.0.0.1'],{stdio:'ignore'});
 await new Promise(r=>setTimeout(r,800));
 const R=redis(port);
 const CAS=f.BIZ_FENCE_CAS,K=(n)=>'t:'+n;
 try{
  await R.call('FLUSHALL');
  await R.call('SET',K('fence'),'7');

  // 1. wrong fence refuses
  assert.equal(await R.call('EVAL',CAS,4,K('fence'),K('freeze'),K('op_pending'),K('key'),'6','old','new'),0,'stale fence refuses');
  // 2. missing target key reports -1 (create-vs-conflict distinguishable)
  assert.equal(await R.call('EVAL',CAS,4,K('fence'),K('freeze'),K('op_pending'),K('missing'),'7','old','new'),-1,'missing key reports -1');
  // 3. freeze excludes every writer
  await R.call('SET',K('key'),'v0');
  await R.call('SET',K('freeze'),'x');
  assert.equal(await R.call('EVAL',CAS,4,K('fence'),K('freeze'),K('op_pending'),K('key'),'7','v0','v1'),0,'freeze refuses');
  await R.call('DEL',K('freeze'));
  // 4. durable delete intent quiesces writes
  await R.call('SET',K('op_pending'),'x');
  assert.equal(await R.call('EVAL',CAS,4,K('fence'),K('freeze'),K('op_pending'),K('key'),'7','v0','v1'),0,'op_pending refuses');
  await R.call('DEL',K('op_pending'));
  // 5. wrong expected value refuses
  assert.equal(await R.call('EVAL',CAS,4,K('fence'),K('freeze'),K('op_pending'),K('key'),'7','WRONG','v1'),0,'stale read refuses');
  // 6. correct fence + value swaps atomically
  assert.equal(await R.call('EVAL',CAS,4,K('fence'),K('freeze'),K('op_pending'),K('key'),'7','v0','v1'),1,'correct CAS succeeds');
  assert.equal(await R.call('GET',K('key')),'v1','the new value is stored');

  // 7. concurrency: 16 racing CAS on the same expected value - exactly one wins
  await R.call('SET',K('race'),'base');
  const results=await Promise.all([...Array(16)].map((_,i)=>R.call('EVAL',CAS,4,K('fence'),K('freeze'),K('op_pending'),K('race'),'7','base','winner'+i)));
  assert.equal(results.filter(x=>x===1).length,1,'exactly one of 16 racing CAS calls wins');
  assert.equal(results.filter(x=>x===0).length,15,'all losers see the stale-read refusal');
  const final=await R.call('GET',K('race'));
  assert(/^winner\d+$/.test(final),'the stored value is the single winner');

  // 8. mirror parity: the in-memory double returns identical results on the same sequence
  await f.als.run({ws:'wslua'},async()=>{
   const seq=async rr=>{
    const out=[];
    out.push(await rr(['EVAL',CAS,4,'fm:biz:fence','fm:biz:freeze','fm:biz:op_pending','fm:biz:k','6','old','new']));
    out.push(await rr(['EVAL',CAS,4,'fm:biz:fence','fm:biz:freeze','fm:biz:op_pending','fm:biz:missing','0','old','new']));
    await rr(['SET','fm:biz:k','v0']);
    out.push(await rr(['EVAL',CAS,4,'fm:biz:fence','fm:biz:freeze','fm:biz:op_pending','fm:biz:k','0','WRONG','v1']));
    out.push(await rr(['EVAL',CAS,4,'fm:biz:fence','fm:biz:freeze','fm:biz:op_pending','fm:biz:k','0','v0','v1']));
    out.push(await rr(['GET','fm:biz:k']));
    return out;
   };
   const mirror=await seq(f.r);
   assert.deepEqual(mirror,[0,-1,0,1,'v1'],'mem mirror parity with real Redis on the CAS matrix');
  });

  // 9. BIZ_FENCE_RUN smoke on real Redis: record + list push + trim overflow drop
  await R.call('DEL',K('runlist'));
  for(let i=0;i<5;i++){
    assert.equal(await R.call('EVAL',f.BIZ_FENCE_RUN,5,K('fence'),K('freeze'),K('op_pending'),K('run:run_'+i),K('runlist'),'7',JSON.stringify({i}),'run_'+i,'3',K('run:')),1,'RUN write '+i); // record key = prefix + id, as the app writes it
  }
  const list=await R.call('LRANGE',K('runlist'),0,-1);
  assert.deepEqual(list,['run_4','run_3','run_2'],'list trimmed to keep-window');
  assert.equal(await R.call('GET',K('run:run_0')),null,'overflowed record deleted by the script');
  assert.equal(await R.call('GET',K('run:run_4')),'{"i":4}','kept record intact');
 } finally {
  R.close();srv.kill();
 }
 console.log('biz-fence-cas-lua: all assertions passed (real Redis EVAL: fence/freeze/op_pending/missing/stale matrix, 16-way CAS race, mem-mirror parity, BIZ_FENCE_RUN trim)');
})().catch(e=>{console.error(e);process.exit(1);});
