// Real-Redis evidence for the managed-execution lifecycle scripts (BIZ_MANAGED_BEGIN,
// BIZ_MANAGED_SETTLE, BIZ_MANAGED_RESOLVE) and the managed guard in BIZ_OP_CANCEL. The
// in-memory mirror is a test double; this exercises the ACTUAL Lua against an actual Redis:
// validation-before-writes (a refusal leaves zero side effects), exact source/consent
// binding, atomic terminal settle with exact receipt reconciliation, kill withholding, and
// resolve-after-expiry ownership. Requires a redis-server binary.
const fs=require('fs'),vm=require('vm'),net=require('net'),assert=require('assert');
const {spawn}=require('child_process');
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={BIZ_MANAGED_BEGIN,BIZ_MANAGED_SETTLE,BIZ_MANAGED_RESOLVE,BIZ_OP_CANCEL,BIZ_OP_BEGIN};';
const c={require:(m)=>require(m),module:{exports:{}},process:{env:{}},global:{},console,URL,Buffer,AbortSignal,setTimeout,clearTimeout,fetch:async()=>{throw new Error('no network in fixture')}};
vm.runInNewContext(src,c);const f=c.module.exports.t;
function redis(port){
  const sock=net.connect(port,'127.0.0.1');let buf=Buffer.alloc(0);const waiters=[];
  function parse(){
    while(true){
      if(!buf.length)return;
      const t=String.fromCharCode(buf[0]);const end=buf.indexOf('\r\n');if(end<0)return;
      const line=buf.slice(1,end).toString();
      if(t==='+'||t==='-'||t===':'){buf=buf.slice(end+2);const v=t==='+'?line:t==='-'?new Error(line):Number(line);const w=waiters.shift();w&&(v instanceof Error?w.rej(v):w.res(v));continue;}
      if(t==='$'){const len=Number(line);if(len===-1){buf=buf.slice(end+2);const w=waiters.shift();w&&w.res(null);continue;}if(buf.length<end+2+len+2)return;const v=buf.slice(end+2,end+2+len).toString();buf=buf.slice(end+2+len+2);const w=waiters.shift();w&&w.res(v);continue;}
      if(t==='*'){const n=Number(line);if(n===-1){buf=buf.slice(end+2);const w=waiters.shift();w&&w.res(null);continue;}
        let off=end+2;const out=[];let ok=true;
        for(let i=0;i<n;i++){if(off>=buf.length){ok=false;break;}const t2=String.fromCharCode(buf[off]);const e2=buf.indexOf('\r\n',off);if(e2<0){ok=false;break;}const l2=buf.slice(off+1,e2).toString();
          if(t2==='$'){const ln=Number(l2);if(buf.length<e2+2+ln+2){ok=false;break;}out.push(buf.slice(e2+2,e2+2+ln).toString());off=e2+2+ln+2;}
          else if(t2===':'){out.push(Number(l2));off=e2+2;}else if(t2==='+'){out.push(l2);off=e2+2;}else{ok=false;break;}}
        if(!ok)return;buf=buf.slice(off);const w=waiters.shift();w&&w.res(out);continue;}
      throw new Error('bad RESP type '+t);
    }
  }
  sock.on('data',d=>{buf=Buffer.concat([buf,d]);parse();});
  const call=(...args)=>new Promise((res,rej)=>{waiters.push({res,rej});const parts=['*'+args.length,...args.flatMap(a=>{const s=String(a);return ['$'+Buffer.byteLength(s),s]})];sock.write(parts.join('\r\n')+'\r\n');});
  return {call,close:()=>sock.destroy()};
}
const P='fm:biz:';
const K={fence:P+'fence',freeze:P+'freeze',pend:P+'op_pending',kill:'fm:kill',consent:P+'consent',resp:P+'resp:resp_1',mg:P+'mg:resp_1',sources:P+'sources',counter:P+'calls:2026-10-24',munres:P+'munres:resp_1',src1:P+'src:src_a',src2:P+'src:src_b',log:P+'log',matt:id=>P+'matt:'+id,mattl:P+'mattl:resp_1',run:id=>P+'run:'+id,runs:P+'runs:resp_1'};
const SRC1=JSON.stringify({id:'src_a',kind:'note',title:'Alpha source',text:'alpha text',version:1});
const SRC2=JSON.stringify({id:'src_b',kind:'note',title:'Beta source',text:'beta text',version:3});
const CONSENT=JSON.stringify({host:'api.groq.com',model:'m1',at:'2026-10-24T00:00:00Z'});
const SNAP={v:1,grantId:'mgrant_1',approvedAt:'2026-10-24T00:00:00Z',promptRev:1,provider:{baseUrl:'https://api.groq.com/openai/v1',model:'m1',maxTokens:1800,temperature:0.2},consentRaw:CONSENT,sources:[{id:'src_a',raw:SRC1},{id:'src_b',raw:SRC2}],respFields:{title:'T','summary':'S','boundary':'B'},scopeHash:'scope1'};
const RESP={id:'resp_1',title:'T',summary:'S',boundary:'B',status:'active',bot:{id:null,name:'Grokbot'},managed:{grantId:'mgrant_1',scopeHash:'scope1',approvedAt:SNAP.approvedAt}};
function beginArgv(attId,extra){
  const att={id:attId,respId:'resp_1',kind:'managed',status:'started',requestHash:'rh_'+attId,scopeHash:'scope1',grantId:'mgrant_1',token:'tok_'+attId,gen:null,input:'do work',provider:{baseUrl:SNAP.provider.baseUrl,model:'m1'},startedAt:'2026-10-24T01:00:00Z'};
  return ['managed-run','resp_1','tok_'+attId,'60000','2026-10-24T01:00:00Z','mgrant_1','scope1','200',extra&&extra.attemptSet||'',attId,JSON.stringify(att),'2','172800',P+'matt:'];
}
function beginKeys(attId){return [K.fence,K.freeze,K.pend,K.kill,K.consent,K.resp,K.mg,K.sources,K.counter,K.munres,K.src1,K.src2,K.matt(attId),K.mattl];}
async function seed(R){await R.call('FLUSHALL');await R.call('SET',K.consent,CONSENT);await R.call('SET',K.resp,JSON.stringify(RESP));await R.call('SET',K.mg,JSON.stringify(SNAP));await R.call('SADD',K.sources,'src_a','src_b');await R.call('SET',K.src1,SRC1);await R.call('SET',K.src2,SRC2);}
async function zeroState(R,attId,expectCounter,expectUnresolved){
  assert.equal(await R.call('GET',K.fence),null,'fence untouched');
  assert.equal(await R.call('GET',K.freeze),null,'no freeze');
  assert.equal(await R.call('GET',K.pend),null,'no pending intent');
  assert.equal(await R.call('GET',K.counter),expectCounter===undefined?null:expectCounter,'counter not consumed');
  assert.equal(await R.call('GET',K.matt(attId)),null,'no attempt record');
  assert.deepEqual((await R.call('SMEMBERS',K.munres)).sort(),expectUnresolved||[],'unresolved set holds only pre-seeded members');
}
(async()=>{
 const bin=process.argv[2]||'/tmp/redisbuild/redis-stable/src/redis-server';
 assert(fs.existsSync(bin),'redis-server binary not found: '+bin);
 const port=40000+Math.floor(Math.random()*20000);
 const srv=spawn(bin,['--port',String(port),'--save','','--appendonly','no','--bind','127.0.0.1'],{stdio:'ignore'});
 await new Promise(r=>setTimeout(r,800));
 const R=redis(port);
 try{
  // --- happy begin: all bindings satisfied, one atomic transition
  await seed(R);
  let res=await R.call('EVAL',f.BIZ_MANAGED_BEGIN,14,...beginKeys('a1'),...beginArgv('a1'));
  assert.equal(res[0],'ok','begin succeeds');assert.equal(res[1],1,'gen returned');
  assert.equal(await R.call('GET',K.fence),'1','fence bumped');
  assert.equal(await R.call('GET',K.freeze),'tok_a1','freeze lease held');
  const pend=JSON.parse(await R.call('GET',K.pend));assert.equal(pend.op,'managed-run');assert.equal(pend.opId,'a1');assert.equal(pend.gen,1);
  assert.equal(await R.call('GET',K.counter),'1','counter consumed once');
  const att=JSON.parse(await R.call('GET',K.matt('a1')));assert.equal(att.status,'started');assert.equal(att.gen,1,'returned gen injected into the durable attempt');
  assert.deepEqual(await R.call('SMEMBERS',K.munres),['a1'],'unresolved set carries the attempt');
  assert.equal((await R.call('LRANGE',K.mattl,0,-1))[0],'a1','attempt indexed');

  // --- second begin while held: refused, nothing doubled
  res=await R.call('EVAL',f.BIZ_MANAGED_BEGIN,14,...beginKeys('a2'),...beginArgv('a2'));
  assert.equal(res[0],'held','a live freeze refuses a second run');
  assert.equal(await R.call('GET',K.counter),'1','no double counter');

  // --- generic cancel refuses managed intents, intent intact
  res=await R.call('EVAL',f.BIZ_OP_CANCEL,4,K.fence,K.freeze,K.pend,K.log,'resp_1','managed-run','x','10','a1');
  assert.equal(res[0],'managed','generic cancel refused for managed-run');
  assert.equal(JSON.parse(await R.call('GET',K.pend)).opId,'a1','intent untouched by refused cancel');
  assert.equal(await R.call('GET',K.fence),'1','fence not bumped by refused cancel');

  // --- settle with a WRONG token: lost, nothing written
  res=await R.call('EVAL',f.BIZ_MANAGED_SETTLE,9,K.fence,K.freeze,K.pend,K.kill,K.matt('a1'),K.munres,K.run('r1'),K.runs,K.log,'tok_WRONG','1','a1','rh_a1','{}','{}','','','50','le','100','rc1','rc2',P+'run:');
  assert.equal(res[0],'lost','wrong token cannot settle');
  assert.equal(JSON.parse(await R.call('GET',K.matt('a1'))).status,'started','attempt unchanged');

  // --- kill racing the flight: settle withholds, the draft is never stored anywhere
  await R.call('SET',K.kill,'1');
  const runJson=JSON.stringify({id:'run_x',respId:'resp_1',output:'DRAFT-SECRET-MARKER',status:'done'});
  res=await R.call('EVAL',f.BIZ_MANAGED_SETTLE,9,K.fence,K.freeze,K.pend,K.kill,K.matt('a1'),K.munres,K.run('run_x'),K.runs,K.log,'tok_a1','1','a1','rh_a1',JSON.stringify({id:'a1',status:'known-result',receipt:'RC_GOOD',requestHash:'rh_a1'}),JSON.stringify({id:'a1',status:'withheld',receipt:'RC_W',requestHash:'rh_a1'}),runJson,'run_x','50','{"kind":"managed_run"}','100','RC_GOOD','RC_W',P+'run:');
  assert.deepEqual(res,['ok','withheld'],'kill at settle withholds');
  assert.equal(await R.call('GET',K.run('run_x')),null,'no run record under kill');
  for(const k of await R.call('KEYS','*')){const v=await R.call('GET',k).catch(()=>null);if(typeof v==='string')assert(!v.includes('DRAFT-SECRET-MARKER'),'draft text never persisted under kill ('+k+')');}
  const attW=JSON.parse(await R.call('GET',K.matt('a1')));assert.equal(attW.status,'withheld');assert.equal(attW.receipt,'RC_W');
  assert.equal(await R.call('GET',K.pend),null,'intent released');assert.equal(await R.call('GET',K.freeze),null,'lease released');
  assert.equal((await R.call('SMEMBERS',K.munres)).length,0,'resolved out of the unresolved set');
  // idempotent landed: same settle args after the fact reconcile to landed, not lost
  res=await R.call('EVAL',f.BIZ_MANAGED_SETTLE,9,K.fence,K.freeze,K.pend,K.kill,K.matt('a1'),K.munres,K.run('run_x'),K.runs,K.log,'tok_a1','1','a1','rh_a1',JSON.stringify({id:'a1',status:'known-result',receipt:'RC_GOOD',requestHash:'rh_a1'}),JSON.stringify({id:'a1',status:'withheld',receipt:'RC_W',requestHash:'rh_a1'}),runJson,'run_x','50','{"kind":"managed_run"}','100','RC_GOOD','RC_W',P+'run:');
  assert.equal(res[0],'landed','a repeated identical settle reconciles as landed');
  assert.equal(await R.call('GET',K.run('run_x')),null,'landed reconcile still writes nothing (withheld stood)');
  await R.call('DEL',K.kill);

  // --- refusal battery: each failing check leaves ZERO side effects
  const refuse=async(label,mut,code,expectCounter,expectUnresolved)=>{
    await seed(R);await mut();
    const r2=await R.call('EVAL',f.BIZ_MANAGED_BEGIN,14,...beginKeys('b_'+label),...beginArgv('b_'+label));
    assert.equal(r2[0],code,label+' refuses with '+code);
    await zeroState(R,'b_'+label,expectCounter,expectUnresolved);
  };
  await refuse('killed',()=>R.call('SET',K.kill,'1'),'killed');
  await refuse('consent',()=>R.call('SET',K.consent,JSON.stringify({host:'api.groq.com',model:'m2',at:'x'})),'consent_changed');
  await refuse('consentgone',()=>R.call('DEL',K.consent),'consent_changed');
  await refuse('srccontent',()=>R.call('SET',K.src2,SRC2.replace('beta text','beta text EDITED')),'sources_changed');
  await refuse('srcmember',()=>R.call('SREM',K.sources,'src_b'),'sources_changed');
  await refuse('srcextra',()=>{return R.call('SADD',K.sources,'src_c')},'sources_changed');
  await refuse('srctitle',()=>R.call('SET',K.src1,SRC1.replace('Alpha source','Alpha retitled')),'sources_changed');
  await refuse('assigned',async()=>{const rp={...RESP,assignment:{botId:'agent_x',botName:'Grokbot',assignedAt:'t'}};await R.call('SET',K.resp,JSON.stringify(rp));},'assigned');
  await refuse('paused',async()=>{await R.call('SET',K.resp,JSON.stringify({...RESP,status:'paused'}));},'inactive');
  await refuse('grant',async()=>{await R.call('SET',K.resp,JSON.stringify({...RESP,managed:{grantId:'mgrant_OTHER',scopeHash:'scope1'}}));},'grant_changed');
  await refuse('respfield',async()=>{await R.call('SET',K.resp,JSON.stringify({...RESP,title:'T2'}));},'resp_changed');
  await refuse('cap',()=>R.call('SET',K.counter,'200'),'capped','200');
  await refuse('unresolved',async()=>{await R.call('SADD',K.munres,'old1');await R.call('SET',K.matt('old1'),JSON.stringify({id:'old1',status:'started',requestHash:'rh_old'}));},'unresolved',undefined,['old1']);
  // unresolved set exactly as reviewed: a retry bound to it proceeds
  await seed(R);
  await R.call('SADD',K.munres,'old1');await R.call('SET',K.matt('old1'),JSON.stringify({id:'old1',status:'started',requestHash:'rh_old',token:'tok_old',gen:9}));
  res=await R.call('EVAL',f.BIZ_MANAGED_BEGIN,14,...beginKeys('a3'),...beginArgv('a3',{attemptSet:'old1:rh_old'}));
  assert.equal(res[0],'ok','a reviewed retry bound to the exact attempt-set proceeds');
  assert.deepEqual((await R.call('SMEMBERS',K.munres)).sort(),['a3','old1'],'both attempts now unresolved');

  // --- resolve: requires the lease gone, binds the reviewed set, retires only this op's attempts
  res=await R.call('EVAL',f.BIZ_MANAGED_RESOLVE,5,K.fence,K.freeze,K.pend,K.munres,K.log,'old1:rh_old','le','100','2026-10-24T02:00:00Z',P+'matt:','{"old1":"RC_ACK"}');
  assert.equal(res[0],'held','a live lease refuses resolution');
  // simulate the a3 holder dying: its lease expires (delete freeze). NOW the set is checked:
  await R.call('DEL',K.freeze);
  res=await R.call('EVAL',f.BIZ_MANAGED_RESOLVE,5,K.fence,K.freeze,K.pend,K.munres,K.log,'WRONGSET','le','100','2026-10-24T02:00:00Z',P+'matt:','{}');
  assert.equal(res[0],'stale','a mismatched reviewed set refuses');
  // the live set is a3+old1; old1's token does not match the pending intent -> unbound honesty
  res=await R.call('EVAL',f.BIZ_MANAGED_RESOLVE,5,K.fence,K.freeze,K.pend,K.munres,K.log,'a3:rh_a3\nold1:rh_old','le','100','2026-10-24T02:00:00Z',P+'matt:','{"a3":"RC_A","old1":"RC_O"}');
  assert.equal(res[0],'unbound','attempts from another intent refuse the resolve');
  // remove the foreign attempt the honest way (it belongs to a different, older intent: purge
  // territory), leaving only this op's own attempt:
  await R.call('SREM',K.munres,'old1');await R.call('DEL',K.matt('old1'));
  res=await R.call('EVAL',f.BIZ_MANAGED_RESOLVE,5,K.fence,K.freeze,K.pend,K.munres,K.log,'a3:rh_a3','{"kind":"managed_resolved"}','100','2026-10-24T02:00:00Z',P+'matt:','{"a3":"RC_A"}');
  assert.deepEqual(res,['ok',1],'resolve retires the reviewed set');
  const attA=JSON.parse(await R.call('GET',K.matt('a3')));assert.equal(attA.status,'acknowledged-unknown');assert.equal(attA.receipt,'RC_A');
  assert.equal(await R.call('GET',K.pend),null,'stuck intent cleared');
  assert.equal(await R.call('GET',K.fence),'2','generation bumped: the dead holder can never write again');
  res=await R.call('EVAL',f.BIZ_MANAGED_SETTLE,9,K.fence,K.freeze,K.pend,K.kill,K.matt('a3'),K.munres,K.run('run_late'),K.runs,K.log,'tok_a3','1','a3','rh_a3','{}','{}','','','50','le','100','RC_GOOD','RC_W',P+'run:');
  assert.equal(res[0],'lost','the expired holder\u2019s late settle can never land after resolve');
  assert.equal(JSON.parse(await R.call('GET',K.matt('a3'))).status,'acknowledged-unknown','late settle did not touch the resolved attempt');

  // --- concurrent begins: exactly one wins
  await seed(R);
  const [r1,r2]=await Promise.all([
    R.call('EVAL',f.BIZ_MANAGED_BEGIN,14,...beginKeys('c1'),...beginArgv('c1')),
    R.call('EVAL',f.BIZ_MANAGED_BEGIN,14,...beginKeys('c2'),...beginArgv('c2'))]);
  const oks=[r1,r2].filter(x=>x[0]==='ok');
  assert.equal(oks.length,1,'exactly one begin wins the race');
  assert.equal(await R.call('GET',K.counter),'1','one counter consumed across the race');

  // --- settle known-result: run record + index + terminal attempt + receipt reconcile
  const win=oks[0]===r1?'c1':'c2';
  const runOk=JSON.stringify({id:'run_ok',respId:'resp_1',kind:'managed',output:'DRAFT-OK',status:'done',attemptId:win});
  res=await R.call('EVAL',f.BIZ_MANAGED_SETTLE,9,K.fence,K.freeze,K.pend,K.kill,K.matt(win),K.munres,K.run('run_ok'),K.runs,K.log,'tok_'+win,'1',win,'rh_'+win,JSON.stringify({id:win,status:'known-result',receipt:'RC_K',requestHash:'rh_'+win}),JSON.stringify({id:win,status:'withheld',receipt:'RC_W2',requestHash:'rh_'+win}),runOk,'run_ok','50','{"kind":"managed_run"}','100','RC_K','RC_W2',P+'run:');
  assert.deepEqual(res,['ok','settled'],'known-result settles');
  assert.equal(JSON.parse(await R.call('GET',K.run('run_ok'))).output,'DRAFT-OK','run record persisted');
  assert.equal((await R.call('LRANGE',K.runs,0,-1))[0],'run_ok','run indexed');
  assert.equal(JSON.parse(await R.call('GET',K.matt(win))).status,'known-result');
  assert((await R.call('LRANGE',K.log,0,-1)).length>=1,'log entry written');
  // receipt mismatch: a terminal attempt with a DIFFERENT receipt is not "landed"
  res=await R.call('EVAL',f.BIZ_MANAGED_SETTLE,9,K.fence,K.freeze,K.pend,K.kill,K.matt(win),K.munres,K.run('run_z'),K.runs,K.log,'tok_'+win,'1',win,'rh_'+win,JSON.stringify({id:win,status:'known-result',receipt:'RC_OTHER',requestHash:'rh_'+win}),JSON.stringify({id:win,status:'withheld',receipt:'RC_W3',requestHash:'rh_'+win}),'','','50','le','100','RC_OTHER','RC_W3',P+'run:');
  assert.equal(res[0],'lost','a different outcome for the same attempt never reconciles as landed');

  // --- orphan-mode resolve: no intent at all, a crashed/raced 'started' attempt still resolves
  await seed(R);
  await R.call('SADD',K.munres,'or1');await R.call('SET',K.matt('or1'),JSON.stringify({id:'or1',status:'started',requestHash:'rh_or1',token:'tok_dead',gen:7}));
  res=await R.call('EVAL',f.BIZ_MANAGED_RESOLVE,5,K.fence,K.freeze,K.pend,K.munres,K.log,'or1:rh_or1','{"kind":"managed_resolved"}','100','2026-10-24T03:00:00Z',P+'matt:','{"or1":"RC_OR"}');
  assert.deepEqual(res,['ok',1],'orphaned started attempt resolves without an intent');
  assert.equal(JSON.parse(await R.call('GET',K.matt('or1'))).status,'acknowledged-unknown');
  assert.equal((await R.call('SMEMBERS',K.munres)).length,0,'orphan retired from the set');

  console.log('biz-managed-lua: ALL REAL-REDIS CHECKS PASSED');
 } finally { R.close(); srv.kill(); }
 process.exit(0);
})().catch(e=>{console.error('FAIL:',e&&e.stack||e);process.exit(1);});
