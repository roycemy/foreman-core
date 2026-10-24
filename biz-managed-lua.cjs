// Real-Redis evidence for the managed-execution lifecycle scripts (BIZ_MANAGED_BEGIN,
// BIZ_MANAGED_SETTLE, BIZ_MANAGED_RESOLVE) and the managed guard in BIZ_OP_CANCEL. The
// in-memory mirror is a test double; this exercises the ACTUAL Lua against an actual Redis:
// validation-before-writes (a refusal leaves zero side effects), exact source/consent
// binding, atomic terminal settle with exact receipt reconciliation, kill withholding, and
// resolve-after-expiry ownership. Requires a redis-server binary.
const fs=require('fs'),vm=require('vm'),net=require('net'),assert=require('assert');
const {spawn}=require('child_process');
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={BIZ_MANAGED_BEGIN,BIZ_MANAGED_SETTLE,BIZ_MANAGED_RESOLVE,BIZ_MANAGED_GRANT,BIZ_MANAGED_UNGRANT,BIZ_MANAGED_MGDEL,BIZ_MANAGED_ADOPT,BIZ_OP_CANCEL,BIZ_OP_BEGIN};';
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
const K={fence:P+'fence',freeze:P+'freeze',pend:P+'op_pending',kill:'fm:kill',consent:P+'consent',resp:P+'resp:resp_1',mg:P+'mg:resp_1',sources:P+'sources',counter:P+'calls:2026-10-24',munres:P+'munres:resp_1',src1:P+'src:src_a',src2:P+'src:src_b',log:P+'log',matt:id=>P+'matt:'+id,mattl:P+'mattl:resp_1',matts:P+'matts:resp_1',run:id=>P+'run:'+id,runs:P+'runs:resp_1'};
const SRC1=JSON.stringify({id:'src_a',kind:'note',title:'Alpha source',text:'alpha text',version:1});
const SRC2=JSON.stringify({id:'src_b',kind:'note',title:'Beta source',text:'beta text',version:3});
const CONSENT=JSON.stringify({host:'api.groq.com',model:'m1',at:'2026-10-24T00:00:00Z'});
const SNAP={v:1,grantId:'mgrant_1',approvedAt:'2026-10-24T00:00:00Z',promptRev:1,provider:{baseUrl:'https://api.groq.com/openai/v1',model:'m1',maxTokens:1800,temperature:0.2},consentRaw:CONSENT,sources:[{id:'src_a',raw:SRC1},{id:'src_b',raw:SRC2}],respFields:{title:'T','summary':'S','boundary':'B'},scopeHash:'scope1'};
const RESP={id:'resp_1',title:'T',summary:'S',boundary:'B',status:'active',bot:{id:null,name:'Grokbot'},managed:{grantId:'mgrant_1',scopeHash:'scope1',approvedAt:SNAP.approvedAt}};
function beginArgv(attId,extra){
  const att={id:attId,respId:'resp_1',kind:'managed',status:'started',requestHash:'rh_'+attId,scopeHash:'scope1',grantId:'mgrant_1',token:'tok_'+attId,gen:null,input:'do work',provider:{baseUrl:SNAP.provider.baseUrl,model:'m1'},startedAt:'2026-10-24T01:00:00Z'};
  return ['managed-run','resp_1','tok_'+attId,'60000','2026-10-24T01:00:00Z','mgrant_1','scope1','200',extra&&extra.attemptSet||'',attId,JSON.stringify(att),'2','172800',P+'matt:'];
}
function beginKeys(attId){return [K.fence,K.freeze,K.pend,K.kill,K.consent,K.resp,K.mg,K.sources,K.counter,K.munres,K.src1,K.src2,K.matt(attId),K.mattl,K.matts];}
async function seed(R){await R.call('FLUSHALL');await R.call('SET',K.consent,CONSENT);await R.call('SET',K.resp,JSON.stringify(RESP));await R.call('SET',K.mg,JSON.stringify(SNAP));await R.call('SADD',K.sources,'src_a','src_b');await R.call('SET',K.src1,SRC1);await R.call('SET',K.src2,SRC2);}
async function zeroState(R,attId,expectCounter,expectUnresolved){
  assert.equal(await R.call('GET',K.fence),null,'fence untouched');
  assert.equal(await R.call('GET',K.freeze),null,'no freeze');
  assert.equal(await R.call('GET',K.pend),null,'no pending intent');
  assert.equal(await R.call('GET',K.counter),expectCounter===undefined?null:expectCounter,'counter not consumed');
  assert.equal(await R.call('GET',K.matt(attId)),null,'no attempt record');
  assert.deepEqual((await R.call('SMEMBERS',K.munres)).sort(),expectUnresolved||[],'unresolved set holds only pre-seeded members');
  assert.deepEqual(await R.call('SMEMBERS',K.matts),[],'durable inventory holds nothing');
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
  let res=await R.call('EVAL',f.BIZ_MANAGED_BEGIN,15,...beginKeys('a1'),...beginArgv('a1'));
  assert.equal(res[0],'ok','begin succeeds');assert.equal(res[1],1,'gen returned');
  assert.equal(await R.call('GET',K.fence),'1','fence bumped');
  assert.equal(await R.call('GET',K.freeze),'tok_a1','freeze lease held');
  const pend=JSON.parse(await R.call('GET',K.pend));assert.equal(pend.op,'managed-run');assert.equal(pend.opId,'a1');assert.equal(pend.gen,1);
  assert.equal(await R.call('GET',K.counter),'1','counter consumed once');
  const att=JSON.parse(await R.call('GET',K.matt('a1')));assert.equal(att.status,'started');assert.equal(att.gen,1,'returned gen injected into the durable attempt');
  assert.deepEqual(await R.call('SMEMBERS',K.munres),['a1'],'unresolved set carries the attempt');
  assert.equal((await R.call('LRANGE',K.mattl,0,-1))[0],'a1','attempt indexed');
  assert.deepEqual(await R.call('SMEMBERS',K.matts),['a1'],'durable never-trimmed inventory carries the attempt');

  // --- second begin while held: refused, nothing doubled
  res=await R.call('EVAL',f.BIZ_MANAGED_BEGIN,15,...beginKeys('a2'),...beginArgv('a2'));
  assert.equal(res[0],'held','a live freeze refuses a second run');
  assert.equal(await R.call('GET',K.counter),'1','no double counter');

  // --- generic cancel refuses managed intents, intent intact
  res=await R.call('EVAL',f.BIZ_OP_CANCEL,4,K.fence,K.freeze,K.pend,K.log,'resp_1','managed-run','x','10','a1');
  assert.equal(res[0],'managed','generic cancel refused for managed-run');
  assert.equal(JSON.parse(await R.call('GET',K.pend)).opId,'a1','intent untouched by refused cancel');
  assert.equal(await R.call('GET',K.fence),'1','fence not bumped by refused cancel');

  // --- settle with a WRONG token: lost, nothing written
  res=await R.call('EVAL',f.BIZ_MANAGED_SETTLE,9,K.fence,K.freeze,K.pend,K.kill,K.matt('a1'),K.munres,K.run('r1'),K.runs,K.log,'tok_WRONG','1','a1','rh_a1','{}','{}','','','50','{"kind":"managed_run"}','100','rc1','rc2',P+'run:','1','{"kind":"managed_run","outcome":"withheld"}');
  assert.equal(res[0],'lost','wrong token cannot settle');
  assert.equal(JSON.parse(await R.call('GET',K.matt('a1'))).status,'started','attempt unchanged');

  // --- kill racing the flight: settle withholds, the draft is never stored anywhere
  await R.call('SET',K.kill,'1');
  const runJson=JSON.stringify({id:'run_x',respId:'resp_1',output:'DRAFT-SECRET-MARKER',status:'done'});
  res=await R.call('EVAL',f.BIZ_MANAGED_SETTLE,9,K.fence,K.freeze,K.pend,K.kill,K.matt('a1'),K.munres,K.run('run_x'),K.runs,K.log,'tok_a1','1','a1','rh_a1',JSON.stringify({id:'a1',status:'known-result',receipt:'RC_GOOD',requestHash:'rh_a1',token:'tok_a1',gen:1}),JSON.stringify({id:'a1',status:'withheld',receipt:'RC_W',requestHash:'rh_a1',token:'tok_a1',gen:1}),runJson,'run_x','50','{"kind":"managed_run"}','100','RC_GOOD','RC_W',P+'run:','1','{"kind":"managed_run","outcome":"withheld"}');
  assert.deepEqual(res,['ok','withheld'],'kill at settle withholds');
  assert.equal(await R.call('GET',K.run('run_x')),null,'no run record under kill');
  for(const k of await R.call('KEYS','*')){const v=await R.call('GET',k).catch(()=>null);if(typeof v==='string')assert(!v.includes('DRAFT-SECRET-MARKER'),'draft text never persisted under kill ('+k+')');}
  const attW=JSON.parse(await R.call('GET',K.matt('a1')));assert.equal(attW.status,'withheld');assert.equal(attW.receipt,'RC_W');
  assert.equal(await R.call('LINDEX',K.log,0),'{"kind":"managed_run","outcome":"withheld"}','the audit entry is the withheld one, never the supplied known-result outcome');
  assert.equal(await R.call('GET',K.pend),null,'intent released');assert.equal(await R.call('GET',K.freeze),null,'lease released');
  assert.deepEqual(await R.call('SMEMBERS',K.munres),['a1'],'withheld KEEPS the attempt in the retry gate');
  // idempotent landed: same settle args after the fact reconcile to landed WITH the record's
  // own withheld status - never reported as a clean landing
  res=await R.call('EVAL',f.BIZ_MANAGED_SETTLE,9,K.fence,K.freeze,K.pend,K.kill,K.matt('a1'),K.munres,K.run('run_x'),K.runs,K.log,'tok_a1','1','a1','rh_a1',JSON.stringify({id:'a1',status:'known-result',receipt:'RC_GOOD',requestHash:'rh_a1',token:'tok_a1',gen:1}),JSON.stringify({id:'a1',status:'withheld',receipt:'RC_W',requestHash:'rh_a1',token:'tok_a1',gen:1}),runJson,'run_x','50','{"kind":"managed_run"}','100','RC_GOOD','RC_W',P+'run:','1','{"kind":"managed_run","outcome":"withheld"}');
  assert.deepEqual(res,['landed','withheld'],'a repeated identical settle reconciles as landed, withheld preserved');
  assert.equal(await R.call('GET',K.run('run_x')),null,'landed reconcile still writes nothing (withheld stood)');
  // reconcile refuses when ownership fields differ: same receipts, wrong token in the record
  await R.call('SET',K.matt('a1'),JSON.stringify({id:'a1',status:'withheld',receipt:'RC_W',requestHash:'rh_a1',token:'tok_OTHER',gen:1}));
  res=await R.call('EVAL',f.BIZ_MANAGED_SETTLE,9,K.fence,K.freeze,K.pend,K.kill,K.matt('a1'),K.munres,K.run('run_x'),K.runs,K.log,'tok_a1','1','a1','rh_a1','{}','{}','','','50','{"kind":"managed_run"}','100','RC_GOOD','RC_W',P+'run:','1','{"kind":"managed_run","outcome":"withheld"}');
  assert.equal(res[0],'lost','receipt match with wrong ownership fields never reconciles as landed');
  await R.call('SET',K.matt('a1'),JSON.stringify(attW));
  // owner reviews and resolves the withheld attempt (orphan mode: intent already released)
  res=await R.call('EVAL',f.BIZ_MANAGED_RESOLVE,5,K.fence,K.freeze,K.pend,K.munres,K.log,'a1:rh_a1','{"kind":"managed_resolved"}','100','2026-10-24T01:30:00Z',P+'matt:','{"a1":"RC_ACK_W"}');
  assert.deepEqual(res,['ok',1],'a withheld terminal attempt resolves after review');
  assert.equal(JSON.parse(await R.call('GET',K.matt('a1'))).status,'acknowledged-unknown');
  assert.equal((await R.call('SMEMBERS',K.munres)).length,0,'gate clear after resolution');
  await R.call('DEL',K.kill);

  // --- refusal battery: each failing check leaves ZERO side effects
  const refuse=async(label,mut,code,expectCounter,expectUnresolved)=>{
    await seed(R);await mut();
    const r2=await R.call('EVAL',f.BIZ_MANAGED_BEGIN,15,...beginKeys('b_'+label),...beginArgv('b_'+label));
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
  res=await R.call('EVAL',f.BIZ_MANAGED_BEGIN,15,...beginKeys('a3'),...beginArgv('a3',{attemptSet:'old1:rh_old'}));
  assert.equal(res[0],'ok','a reviewed retry bound to the exact attempt-set proceeds');
  assert.deepEqual((await R.call('SMEMBERS',K.munres)).sort(),['a3','old1'],'both attempts now unresolved');

  // --- resolve: requires the lease gone, binds the reviewed set, retires only this op's attempts
  res=await R.call('EVAL',f.BIZ_MANAGED_RESOLVE,5,K.fence,K.freeze,K.pend,K.munres,K.log,'old1:rh_old','{"kind":"managed_resolved"}','100','2026-10-24T02:00:00Z',P+'matt:','{"old1":"RC_ACK"}');
  assert.equal(res[0],'held','a live lease refuses resolution');
  // simulate the a3 holder dying: its lease expires (delete freeze). NOW the set is checked:
  await R.call('DEL',K.freeze);
  res=await R.call('EVAL',f.BIZ_MANAGED_RESOLVE,5,K.fence,K.freeze,K.pend,K.munres,K.log,'WRONGSET','{"kind":"managed_resolved"}','100','2026-10-24T02:00:00Z',P+'matt:','{}');
  assert.equal(res[0],'stale','a mismatched reviewed set refuses');
  // the live set is a3+old1; old1's token does not match the pending intent -> unbound honesty
  res=await R.call('EVAL',f.BIZ_MANAGED_RESOLVE,5,K.fence,K.freeze,K.pend,K.munres,K.log,'a3:rh_a3\nold1:rh_old','{"kind":"managed_resolved"}','100','2026-10-24T02:00:00Z',P+'matt:','{"a3":"RC_A","old1":"RC_O"}');
  assert.equal(res[0],'unbound','attempts from another intent refuse the resolve');
  // remove the foreign attempt the honest way (it belongs to a different, older intent: purge
  // territory), leaving only this op's own attempt:
  await R.call('SREM',K.munres,'old1');await R.call('DEL',K.matt('old1'));
  res=await R.call('EVAL',f.BIZ_MANAGED_RESOLVE,5,K.fence,K.freeze,K.pend,K.munres,K.log,'a3:rh_a3','{"kind":"managed_resolved"}','100','2026-10-24T02:00:00Z',P+'matt:','{"a3":"RC_A"}');
  assert.deepEqual(res,['ok',1],'resolve retires the reviewed set');
  const attA=JSON.parse(await R.call('GET',K.matt('a3')));assert.equal(attA.status,'acknowledged-unknown');assert.equal(attA.receipt,'RC_A');
  assert.equal(await R.call('GET',K.pend),null,'stuck intent cleared');
  assert.equal(await R.call('GET',K.fence),'2','generation bumped: the dead holder can never write again');
  res=await R.call('EVAL',f.BIZ_MANAGED_SETTLE,9,K.fence,K.freeze,K.pend,K.kill,K.matt('a3'),K.munres,K.run('run_late'),K.runs,K.log,'tok_a3','1','a3','rh_a3','{}','{}','','','50','{"kind":"managed_run"}','100','RC_GOOD','RC_W',P+'run:','1','{"kind":"managed_run","outcome":"withheld"}');
  assert.equal(res[0],'lost','the expired holder\u2019s late settle can never land after resolve');
  assert.equal(JSON.parse(await R.call('GET',K.matt('a3'))).status,'acknowledged-unknown','late settle did not touch the resolved attempt');

  // --- concurrent begins: exactly one wins
  await seed(R);
  const [r1,r2]=await Promise.all([
    R.call('EVAL',f.BIZ_MANAGED_BEGIN,15,...beginKeys('c1'),...beginArgv('c1')),
    R.call('EVAL',f.BIZ_MANAGED_BEGIN,15,...beginKeys('c2'),...beginArgv('c2'))]);
  const oks=[r1,r2].filter(x=>x[0]==='ok');
  assert.equal(oks.length,1,'exactly one begin wins the race');
  assert.equal(await R.call('GET',K.counter),'1','one counter consumed across the race');

  // --- settle known-result: run record + index + terminal attempt + receipt reconcile
  const win=oks[0]===r1?'c1':'c2';
  const runOk=JSON.stringify({id:'run_ok',respId:'resp_1',kind:'managed',output:'DRAFT-OK',status:'done',attemptId:win});
  res=await R.call('EVAL',f.BIZ_MANAGED_SETTLE,9,K.fence,K.freeze,K.pend,K.kill,K.matt(win),K.munres,K.run('run_ok'),K.runs,K.log,'tok_'+win,'1',win,'rh_'+win,JSON.stringify({id:win,status:'known-result',receipt:'RC_K',requestHash:'rh_'+win}),JSON.stringify({id:win,status:'withheld',receipt:'RC_W2',requestHash:'rh_'+win}),runOk,'run_ok','50','{"kind":"managed_run"}','100','RC_K','RC_W2',P+'run:','1','{"kind":"managed_run","outcome":"withheld"}');
  assert.deepEqual(res,['ok','settled'],'known-result settles');
  assert.equal((await R.call('SMEMBERS',K.munres)).length,0,'a clean outcome leaves the retry gate');
  assert.equal(JSON.parse(await R.call('GET',K.run('run_ok'))).output,'DRAFT-OK','run record persisted');
  assert.equal((await R.call('LRANGE',K.runs,0,-1))[0],'run_ok','run indexed');
  assert.equal(JSON.parse(await R.call('GET',K.matt(win))).status,'known-result');
  assert((await R.call('LRANGE',K.log,0,-1)).length>=1,'log entry written');
  // receipt mismatch: a terminal attempt with a DIFFERENT receipt is not "landed"
  res=await R.call('EVAL',f.BIZ_MANAGED_SETTLE,9,K.fence,K.freeze,K.pend,K.kill,K.matt(win),K.munres,K.run('run_z'),K.runs,K.log,'tok_'+win,'1',win,'rh_'+win,JSON.stringify({id:win,status:'known-result',receipt:'RC_OTHER',requestHash:'rh_'+win}),JSON.stringify({id:win,status:'withheld',receipt:'RC_W3',requestHash:'rh_'+win}),'','','50','{"kind":"managed_run"}','100','RC_OTHER','RC_W3',P+'run:','1','{"kind":"managed_run","outcome":"withheld"}');
  assert.equal(res[0],'lost','a different outcome for the same attempt never reconciles as landed');

  // --- orphan-mode resolve: no intent at all, a crashed/raced 'started' attempt still resolves
  await seed(R);
  await R.call('SADD',K.munres,'or1');await R.call('SET',K.matt('or1'),JSON.stringify({id:'or1',status:'started',requestHash:'rh_or1',token:'tok_dead',gen:7}));
  res=await R.call('EVAL',f.BIZ_MANAGED_RESOLVE,5,K.fence,K.freeze,K.pend,K.munres,K.log,'or1:rh_or1','{"kind":"managed_resolved"}','100','2026-10-24T03:00:00Z',P+'matt:','{"or1":"RC_OR"}');
  assert.deepEqual(res,['ok',1],'orphaned started attempt resolves without an intent');
  assert.equal(JSON.parse(await R.call('GET',K.matt('or1'))).status,'acknowledged-unknown');
  assert.equal((await R.call('SMEMBERS',K.munres)).length,0,'orphan retired from the set');

  // --- REVIEWER REPRO: wrongtype index - BEGIN validates BEFORE any write (no partial state)
  await seed(R);await R.call('SET',K.mattl,'wrongtype');
  res=await R.call('EVAL',f.BIZ_MANAGED_BEGIN,15,...beginKeys('bad'),...beginArgv('bad'));
  assert.deepEqual(res,['corrupt'],'wrongtype index refuses as corrupt, never a runtime error');
  await zeroState(R,'bad'); // fence/freeze/pending/counter/attempt all absent: zero partial mutation
  await seed(R);await R.call('SET',K.munres,'wrongtype');
  res=await R.call('EVAL',f.BIZ_MANAGED_BEGIN,15,...beginKeys('bad2'),...beginArgv('bad2'));
  assert.deepEqual(res,['corrupt'],'wrongtype unresolved set refuses before writes');
  await R.call('DEL',K.munres); // remove the poisoned fixture before the zero-state audit
  await zeroState(R,'bad2');

  // --- REVIEWER REPRO: settle with the attempt deleted under held ownership - lost, no resurrection
  await seed(R);await R.call('EVAL',f.BIZ_MANAGED_BEGIN,15,...beginKeys('a1'),...beginArgv('a1'));await R.call('DEL',K.matt('a1'));
  res=await R.call('EVAL',f.BIZ_MANAGED_SETTLE,9,K.fence,K.freeze,K.pend,K.kill,K.matt('a1'),K.munres,K.run('r1'),K.runs,K.log,'tok_a1','1','a1','rh_a1',JSON.stringify({id:'a1',status:'known-result',requestHash:'rh_a1'}),'{}',JSON.stringify({id:'r1',output:'private output'}),'r1','50','{"kind":"managed_run"}','100','rc1','rc2',P+'run:','1','{"kind":"managed_run","outcome":"withheld"}');
  assert.equal(res[0],'lost','absent original attempt: settle refuses');
  assert.equal(await R.call('GET',K.matt('a1')),null,'absence never recreates an attempt');
  assert.equal(await R.call('GET',K.run('r1')),'null'===String(await R.call('GET',K.run('r1')))?null:null,'run not written');
  assert.equal(await R.call('GET',K.run('r1')),null,'private output never persisted');
  assert.equal(JSON.parse(await R.call('GET',K.pend)).opId,'a1','intent untouched by the refused settle');
  // a mismatched original attempt (requestHash) under held ownership also refuses
  await seed(R);await R.call('EVAL',f.BIZ_MANAGED_BEGIN,15,...beginKeys('a9'),...beginArgv('a9'));
  await R.call('SET',K.matt('a9'),JSON.stringify({id:'a9',status:'started',requestHash:'rh_OTHER',token:'tok_a9',gen:1}));
  res=await R.call('EVAL',f.BIZ_MANAGED_SETTLE,9,K.fence,K.freeze,K.pend,K.kill,K.matt('a9'),K.munres,K.run('r9'),K.runs,K.log,'tok_a9','1','a9','rh_a9','{}','{}','','','50','{"kind":"managed_run"}','100','x','y',P+'run:','1','{"kind":"managed_run","outcome":"withheld"}');
  assert.equal(res[0],'lost','mismatched original attempt: settle refuses');

  // --- wrongtype settle targets refuse as corrupt BEFORE any write
  await seed(R);await R.call('EVAL',f.BIZ_MANAGED_BEGIN,15,...beginKeys('a8'),...beginArgv('a8'));
  await R.call('SET',K.runs,'wrongtype');
  res=await R.call('EVAL',f.BIZ_MANAGED_SETTLE,9,K.fence,K.freeze,K.pend,K.kill,K.matt('a8'),K.munres,K.run('r8'),K.runs,K.log,'tok_a8','1','a8','rh_a8','{}','{}','','','50','{"kind":"managed_run"}','100','x','y',P+'run:','1','{"kind":"managed_run","outcome":"withheld"}');
  assert.equal(res[0],'corrupt','wrongtype run index refuses as corrupt');
  assert.equal(JSON.parse(await R.call('GET',K.matt('a8'))).status,'started','attempt untouched');
  assert.equal(JSON.parse(await R.call('GET',K.pend)).opId,'a8','intent intact');
  await R.call('DEL',K.runs);

  // --- an unknown-effect settle (clean flag 0) KEEPS the retry gate; resolve acks it
  res=await R.call('EVAL',f.BIZ_MANAGED_SETTLE,9,K.fence,K.freeze,K.pend,K.kill,K.matt('a8'),K.munres,K.run('r8'),K.runs,K.log,'tok_a8','1','a8','rh_a8',JSON.stringify({id:'a8',status:'started-unknown',receipt:'RC_U',requestHash:'rh_a8'}),JSON.stringify({id:'a8',status:'withheld',receipt:'RC_W8',requestHash:'rh_a8'}),'','','50','{"kind":"managed_run"}','100','RC_U','RC_W8',P+'run:','0','{"kind":"managed_run","outcome":"withheld"}');
  assert.deepEqual(res,['ok','settled'],'unknown-effect outcome settles');
  assert.deepEqual(await R.call('SMEMBERS',K.munres),['a8'],'unknown-effect outcome STAYS in the retry gate');
  res=await R.call('EVAL',f.BIZ_MANAGED_RESOLVE,5,K.fence,K.freeze,K.pend,K.munres,K.log,'a8:rh_a8','{"kind":"managed_resolved"}','100','2026-10-24T04:00:00Z',P+'matt:','{"a8":"RC_ACK8"}');
  assert.deepEqual(res,['ok',1],'settled unknown-effect attempt resolves after owner review');
  assert.equal(JSON.parse(await R.call('GET',K.matt('a8'))).status,'acknowledged-unknown');
  assert.equal((await R.call('SMEMBERS',K.munres)).length,0);

  // --- GRANT: atomic pair; a stale concurrent approval strands nothing
  await seed(R);await R.call('DEL',K.resp);await R.call('DEL',K.mg);
  const respOld=JSON.stringify({id:'resp_1',v:1});
  await R.call('SET',K.resp,respOld);
  res=await R.call('EVAL',f.BIZ_MANAGED_GRANT,5,K.fence,K.freeze,K.pend,K.resp,K.mg,'0',respOld,JSON.stringify({id:'resp_1',v:2,managed:{grantId:'g1'}}),JSON.stringify({grantId:'g1',sources:[]}));
  assert.deepEqual(res,['ok'],'grant lands atomically');
  res=await R.call('EVAL',f.BIZ_MANAGED_GRANT,5,K.fence,K.freeze,K.pend,K.resp,K.mg,'0',respOld,JSON.stringify({id:'resp_1',v:3,managed:{grantId:'g2'}}),JSON.stringify({grantId:'g2',sources:[]}));
  assert.deepEqual(res,['conflict'],'stale loser refuses');
  assert.equal(JSON.parse(await R.call('GET',K.mg)).grantId,'g1','winner snapshot never stranded by the loser');
  assert.equal(JSON.parse(await R.call('GET',K.resp)).v,2,'winner responsibility intact');
  res=await R.call('EVAL',f.BIZ_MANAGED_GRANT,5,K.fence,K.freeze,K.pend,K.resp,K.mg,'0','""','{"v":9}','{"grantId":"gx"}');
  assert.deepEqual(res,['conflict'],'empty old bytes never match');
  await R.call('DEL',K.resp);
  res=await R.call('EVAL',f.BIZ_MANAGED_GRANT,5,K.fence,K.freeze,K.pend,K.resp,K.mg,'0','""','{"v":9}','{"grantId":"gx"}');
  assert.deepEqual(res,['notfound'],'missing responsibility: notfound');

  // --- UNGRANT: compare-delete removes only the revoked grant
  await seed(R);await R.call('DEL',K.mg);
  const respG=JSON.stringify({id:'resp_1',managed:{grantId:'g1'}});
  await R.call('SET',K.resp,respG);await R.call('SET',K.mg,JSON.stringify({grantId:'g1'}));
  res=await R.call('EVAL',f.BIZ_MANAGED_UNGRANT,5,K.fence,K.freeze,K.pend,K.resp,K.mg,'0',respG,JSON.stringify({id:'resp_1'}),'g1');
  assert.deepEqual(res,['ok'],'revoke lands');assert.equal(await R.call('GET',K.mg),null,'revoked grant deleted');
  // a stale revoke against a NEWER grant: responsibility updates, newer snapshot preserved
  const respG2=JSON.stringify({id:'resp_1',managed:{grantId:'g2'}});
  await R.call('SET',K.resp,respG2);await R.call('SET',K.mg,JSON.stringify({grantId:'g2'}));
  res=await R.call('EVAL',f.BIZ_MANAGED_UNGRANT,5,K.fence,K.freeze,K.pend,K.resp,K.mg,'0',respG2,JSON.stringify({id:'resp_1'}),'g1');
  assert.deepEqual(res,['ok']);assert.equal(JSON.parse(await R.call('GET',K.mg)).grantId,'g2','a stale revoke never deletes the newer grant');

  // --- MGDEL: compare-delete for the assignment-clear path
  res=await R.call('EVAL',f.BIZ_MANAGED_MGDEL,4,K.fence,K.freeze,K.pend,K.mg,'0','g1');
  assert.equal(res,0,'mismatched grant id: nothing deleted');
  assert.equal(JSON.parse(await R.call('GET',K.mg)).grantId,'g2');
  res=await R.call('EVAL',f.BIZ_MANAGED_MGDEL,4,K.fence,K.freeze,K.pend,K.mg,'0','g2');
  assert.equal(res,1,'exact grant id deletes');assert.equal(await R.call('GET',K.mg),null);

  // --- a fractional/corrupt counter refuses BEFORE any write: zero partial state
  await seed(R);await R.call('SET',K.counter,'1.5');
  res=await R.call('EVAL',f.BIZ_MANAGED_BEGIN,15,...beginKeys('f1'),...beginArgv('f1'));
  assert.deepEqual(res,['corrupt'],'non-integer counter refuses cleanly');
  await zeroState(R,'f1','1.5');
  // --- fractional lease/cap/TTL arguments refuse before any write
  await seed(R);
  const argvBadPx=beginArgv('f2');argvBadPx[3]='1.5';
  res=await R.call('EVAL',f.BIZ_MANAGED_BEGIN,15,...beginKeys('f2'),...argvBadPx);
  assert.deepEqual(res,['bad_args'],'fractional lease ms refuses');
  await zeroState(R,'f2');
  const argvBadCap=beginArgv('f3');argvBadCap[7]='200.5';
  res=await R.call('EVAL',f.BIZ_MANAGED_BEGIN,15,...beginKeys('f3'),...argvBadCap);
  assert.deepEqual(res,['bad_args'],'fractional daily cap refuses');
  await zeroState(R,'f3');
  // --- SETTLE/RESOLVE reject fractional keep-counts before any write
  await seed(R);await R.call('EVAL',f.BIZ_MANAGED_BEGIN,15,...beginKeys('f4'),...beginArgv('f4'));
  res=await R.call('EVAL',f.BIZ_MANAGED_SETTLE,9,K.fence,K.freeze,K.pend,K.kill,K.matt('f4'),K.munres,K.run('rf4'),K.runs,K.log,'tok_f4','1','f4','rh_f4','{}','{}','','','1.5','{"kind":"managed_run"}','100','x','y',P+'run:','1','{"kind":"managed_run"}');
  assert.deepEqual(res,['bad_args'],'fractional runs-keep refuses');
  assert.equal(JSON.parse(await R.call('GET',K.matt('f4'))).status,'started','attempt untouched');
  assert.equal(JSON.parse(await R.call('GET',K.pend)).opId,'f4','intent intact');
  res=await R.call('EVAL',f.BIZ_MANAGED_RESOLVE,5,K.fence,K.freeze,K.pend,K.munres,K.log,'f4:rh_f4','{"kind":"managed_resolved"}','100.5','now',P+'matt:','{"f4":"RC"}');
  assert.deepEqual(res,['bad_args'],'fractional log-keep refuses');
  // --- a scalar-but-valid-JSON managed snapshot refuses UNGRANT BEFORE the resp write
  await seed(R);await R.call('SET',K.mg,'42');
  const respNext=JSON.parse(JSON.stringify(RESP));delete respNext.managed;
  res=await R.call('EVAL',f.BIZ_MANAGED_UNGRANT,5,K.fence,K.freeze,K.pend,K.resp,K.mg,'0',JSON.stringify(RESP),JSON.stringify(respNext),'mgrant_1');
  assert.deepEqual(res,['corrupt'],'scalar managed snapshot refuses cleanly');
  assert.equal(await R.call('GET',K.resp),JSON.stringify(RESP),'responsibility untouched');
  assert.equal(await R.call('GET',K.mg),'42','snapshot untouched');
  // --- GRANT validates argument JSON before any write
  await seed(R);
  res=await R.call('EVAL',f.BIZ_MANAGED_GRANT,5,K.fence,K.freeze,K.pend,K.resp,K.mg,'0',JSON.stringify(RESP),'42',JSON.stringify(SNAP));
  assert.deepEqual(res,['bad_args'],'scalar new-responsibility argument refuses');
  assert.equal(await R.call('GET',K.resp),JSON.stringify(RESP),'responsibility untouched');
  // --- multi-unknown resolve: an older owner-reviewed terminal-uncertain attempt resolves
  // alongside the CURRENT stuck attempt; the pending intent binds only its own LIVE attempt
  await seed(R);await R.call('EVAL',f.BIZ_MANAGED_BEGIN,15,...beginKeys('m1'),...beginArgv('m1'));
  await R.call('DEL',K.freeze,K.pend);
  await R.call('SET',K.matt('m1'),JSON.stringify({id:'m1',status:'unknown',token:'tok_m1',requestHash:'rh_m1'}));
  res=await R.call('EVAL',f.BIZ_MANAGED_BEGIN,15,...beginKeys('m2'),...beginArgv('m2',{attemptSet:'m1:rh_m1'}));
  assert.deepEqual(res,['ok',2],'retry admitted with the older uncertain attempt reviewed');
  await R.call('DEL',K.freeze);
  res=await R.call('EVAL',f.BIZ_MANAGED_RESOLVE,5,K.fence,K.freeze,K.pend,K.munres,K.log,'m1:rh_m1\nm2:rh_m2','{"kind":"managed_resolved"}','100','now',P+'matt:','{"m1":"RC1","m2":"RC2"}');
  assert.deepEqual(res,['ok',2],'older terminal-uncertain + current stuck attempt resolve together');
  assert.equal(JSON.parse(await R.call('GET',K.matt('m1'))).status,'acknowledged-unknown');
  assert.equal(JSON.parse(await R.call('GET',K.matt('m2'))).status,'acknowledged-unknown');
  assert.equal(await R.call('GET',K.pend),null,'stuck intent released');
  // negative control: a LIVE started attempt owned by a DIFFERENT token still refuses
  await seed(R);await R.call('EVAL',f.BIZ_MANAGED_BEGIN,15,...beginKeys('n2'),...beginArgv('n2'));
  await R.call('SET',K.matt('nX'),JSON.stringify({id:'nX',status:'started',token:'tok_OTHER',requestHash:'rh_nX'}));await R.call('SADD',K.munres,'nX');
  await R.call('DEL',K.freeze);
  res=await R.call('EVAL',f.BIZ_MANAGED_RESOLVE,5,K.fence,K.freeze,K.pend,K.munres,K.log,'n2:rh_n2\nnX:rh_nX','{"kind":"managed_resolved"}','100','now',P+'matt:','{"n2":"RC1","nX":"RCX"}');
  assert.deepEqual(res,['unbound'],'a live attempt owned by another token cannot resolve under this intent');
  assert.equal(JSON.parse(await R.call('GET',K.matt('n2'))).status,'started','pending attempt untouched');
  assert.equal(JSON.parse(await R.call('GET',K.matt('nX'))).status,'started','foreign live attempt untouched');
  // --- ADOPT: one coherent atomic proof - intent, fence/freeze, exact attempt, unresolved
  // membership, the never-trimmed inventory, and the counted call
  await seed(R);await R.call('EVAL',f.BIZ_MANAGED_BEGIN,15,...beginKeys('d1'),...beginArgv('d1'));
  const adoptKeys=[K.fence,K.pend,K.freeze,K.matt('d1'),K.munres,K.mattl,K.matts,K.counter];
  const adoptArgv=['resp_1','tok_d1','d1','rh_d1'];
  res=await R.call('EVAL',f.BIZ_MANAGED_ADOPT,8,...adoptKeys,...adoptArgv);
  assert.deepEqual(res,['ok','1'],'complete state adopts');
  await R.call('SREM',K.matts,'d1');
  res=await R.call('EVAL',f.BIZ_MANAGED_ADOPT,8,...adoptKeys,...adoptArgv);
  assert.deepEqual(res,['no'],'missing from the durable inventory refuses adoption');
  await R.call('SADD',K.matts,'d1');await R.call('SREM',K.munres,'d1');
  res=await R.call('EVAL',f.BIZ_MANAGED_ADOPT,8,...adoptKeys,...adoptArgv);
  assert.deepEqual(res,['no'],'missing from the unresolved set refuses adoption');
  await R.call('SADD',K.munres,'d1');await R.call('SET',K.counter,'0');
  res=await R.call('EVAL',f.BIZ_MANAGED_ADOPT,8,...adoptKeys,...adoptArgv);
  assert.deepEqual(res,['no'],'an uncounted call refuses adoption');
  await R.call('SET',K.counter,'1');await R.call('DEL',K.pend);
  res=await R.call('EVAL',f.BIZ_MANAGED_ADOPT,8,...adoptKeys,...adoptArgv);
  assert.deepEqual(res,['no'],'a lost intent refuses adoption');
  console.log('biz-managed-lua: ALL REAL-REDIS CHECKS PASSED');
 } finally { R.close(); srv.kill(); }
 process.exit(0);
})().catch(e=>{console.error('FAIL:',e&&e.stack||e);process.exit(1);});
