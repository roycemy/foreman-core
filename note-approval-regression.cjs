// A note a bot proposes (notes.write, ASK by default) is approved only after the owner sees all of it, and Alter writes exactly what the
// owner saw. Server: the request stores the note normalized to what execute writes (title 120, text 2000 chars), shows it in full in
// /api/state (not cut to 200), and the fingerprint binds the approval to it. Client (real core.js): the review shows title and full
// text escaped with the fingerprint; a compact Approve opens the review instead of approving; the inbox card shows the full note and
// only that counts as reviewed. Offline: no network.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8')+'\nmodule.exports.t={routes,r,setJ,getJ,als,createAgent,newTask};';
const ctx={require,module:{exports:{}},process:{env:{}},global:{},console,fetch:async u=>{throw Error('NO NETWORK '+u)},setTimeout,clearTimeout,URL,AbortSignal,Buffer};vm.runInNewContext(src,ctx);const f=ctx.module.exports.t;
const H={host:'localhost',origin:'http://localhost'};
async function call(method,p,body,agent){let out;const r={status(n){this.code=n;return this},json(j){out={code:this.code||200,j};return out},setHeader(){},end(){out={code:this.code||204};return out}};await f.routes({method,headers:H,url:'/api'+p,gatewayKeyAuth:!!agent},r,p.split('?')[0],body||{},agent||null);return out;}
(async()=>{await f.als.run({ws:'notes'},async()=>{
 let n=0;async function proposal(params){const A=(await f.createAgent('Bot '+(++n),'Ops','custom',false,{preset:'balanced'})).agent;const live=()=>f.getJ('fm:agent:'+A.id);
  const t=await f.newTask({title:'Note job '+n,assignee:A.id});await call('GET','/gateway/tasks/next',{},await live());
  const p=await call('POST','/gateway/act',{action:'notes.write',params,task_id:t.id},await live());assert.equal(p.code,202,JSON.stringify(p.j));return {A,t,rid:p.j.request_id};}
 const notes=async()=>(await call('GET','/state')).j.notes;
 // 1. a long note: the owner's view holds all of it, and what is written is exactly that
 {const text='Line one & <b>bold</b>\n'+'x'.repeat(1500);const {rid}=await proposal({title:'Monday plan',text});
  const shown=(await call('GET','/state')).j.requests.find(x=>x.id===rid);
  assert.equal(shown.params.text,text,'the owner sees the whole note, not 200 characters');assert.equal(shown.params.title,'Monday plan');assert.ok(!('rawParams' in shown),'raw params stay server-side');
  assert.equal((await call('POST','/requests/'+rid+'/approve',{detailsHash:'0'.repeat(64)})).code,409,'a fingerprint for other content is refused');
  const ap=await call('POST','/requests/'+rid+'/approve',{detailsHash:shown.detailsHash});assert.equal(ap.j.request.status,'executed');
  const note=(await notes()).find(x=>x.id===ap.j.request.result.note_id);assert.deepEqual([note.title,note.text],[shown.params.title,shown.params.text],'Alter writes exactly what the owner saw');}
 // 2. over the limits: shown and written are the same normalized note (title 120, text 2000), so nothing hidden is written
 {const {rid}=await proposal({title:'T'.repeat(300),text:'y'.repeat(3000)});const shown=(await call('GET','/state')).j.requests.find(x=>x.id===rid);
  assert.deepEqual([shown.params.title.length,shown.params.text.length],[120,2000],'shown at the limits execute writes');
  const ap=await call('POST','/requests/'+rid+'/approve',{detailsHash:shown.detailsHash});const note=(await notes()).find(x=>x.id===ap.j.request.result.note_id);
  assert.deepEqual([note.title,note.text],[shown.params.title,shown.params.text],'written = shown');}
 // 3. a missing title is shown as Alter will write it
 {const {rid}=await proposal({text:'No title given'});const shown=(await call('GET','/state')).j.requests.find(x=>x.id===rid);assert.equal(shown.params.title,'untitled');}
});
 // 4. the owner's screen: real core.js. Full escaped review; a compact Approve opens it instead of approving; the reviewed approve sends the fingerprint
 {const win={BB:undefined,matchMedia:()=>({matches:false}),innerWidth:390,localStorage:{getItem:()=>null,setItem(){}}},apiCalls=[];let modalHtml=null;
  const cctx={window:win,document:{addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],hidden:false},matchMedia:win.matchMedia,innerWidth:390,localStorage:win.localStorage,fetch:()=>{throw Error('NO NETWORK')},setInterval:()=>0,clearInterval(){},setTimeout:()=>0,clearTimeout(){},console,Date};
  vm.createContext(cctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'public/js/core.js'),'utf8'),cctx);const BB=win.BB;
  BB.api=async(p,m,b)=>{apiCalls.push([p,m,b]);return {request:{action:'notes.write',status:'executed',result:{note_id:'note_1'}}}};BB.toast=()=>{};BB.sync=async()=>{};
  BB.modal=html=>{modalHtml=html;return {querySelector:()=>({})}};BB.closeModal=()=>{};
  const q={id:'req_n',action:'notes.write',status:'pending',params:{title:'Plan <i>A</i>',text:'One & <script>x</script>\nTwo'},detailsHash:'b'.repeat(64),expiresAt:new Date(Date.now()+10*60000).toISOString()};
  assert.equal(typeof BB.noteReview,'function','core.js has a full note review');const html=BB.noteReview(q);
  for(const s of ['Plan &lt;i&gt;A&lt;/i&gt;','One &amp; &lt;script&gt;x&lt;/script&gt;\nTwo','Fingerprint bbbbbbbbbbbb','note-review'])assert(html.includes(s),'note review shows: '+s);assert(!/<script>/.test(html),'escaped');
  await BB.decide({type:'approval',q},'approve');assert.equal(apiCalls.length,0,'a compact Approve does not approve a note');assert(modalHtml&&modalHtml.includes('One &amp;'),'it opens the full note review');
  await BB.decide({type:'approval',q},'approve',{reviewed:true});assert.deepEqual(apiCalls[0],['/api/requests/req_n/approve','POST',{detailsHash:q.detailsHash}]);
  await BB.decide({type:'approval',q},'deny');assert.deepEqual(apiCalls[1].slice(0,2),['/api/requests/req_n/deny','POST'],'deny needs no review');
  const ib=fs.readFileSync(path.join(__dirname,'public/js/inbox.js'),'utf8');assert(/BB\.noteReview\(i\.q\)/.test(ib),'the inbox card shows the full note');assert(/\.note-review/.test(ib),'only a card showing the full note counts as reviewed');}
 console.log('PASS note approval: the owner sees the whole note (normalized to what Alter writes), the fingerprint binds it, Alter writes exactly that; a compact Approve opens the full escaped review; the inbox card shows the full note');
})().catch(e=>{console.error(e);process.exit(1)});
