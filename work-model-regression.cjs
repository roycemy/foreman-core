// Work visibility model (public/js/work-model.js): honest statuses and reasons from stored state only. Pure functions, fixed clock, no network.
const assert=require('assert');const M=require('./public/js/work-model.js');
const NOW=Date.parse('2026-11-23T15:00:00Z'),iso=s=>new Date(NOW-s*1000).toISOString();
const bot=(o)=>({id:'a1',name:'Grok Bot',status:'active',lastSeen:iso(30),...o});
const task=(o)=>({id:'t'+Math.random().toString(36).slice(2,8),title:'Task',status:'queued',assignee:'a1',createdAt:iso(100),assignedAt:iso(100),...o});
const S=(o)=>({tasks:[],agents:[bot()],requests:[],events:[],killed:false,...o});
const act=(s)=>M.activeItems(s,NOW);

// ---- queued is not running; no pickup is implied; cadence only when declared and valid
{const t=task({id:'q1',status:'queued'});const [i]=act(S({tasks:[t]}));
 assert.equal(i.status,'queued');assert.equal(i.label,'Queued');assert.ok(i.detail.includes('Pickup not confirmed'));assert.ok(/Queued for Grok Bot · 1 min/.test(i.detail[0]),i.detail[0]);
 assert.ok(!i.detail.some(d=>/Declared check-in/.test(d)),'no cadence line when none is declared');
 const withCad=act(S({tasks:[t],agents:[bot({pollSec:300})]}))[0].detail.join('|');assert.ok(/Declared check-in about every 5 min/.test(withCad));
 for(const bad of [0,5,99999,'abc',null])assert.ok(!act(S({tasks:[t],agents:[bot({pollSec:bad})]}))[0].detail.some(d=>/Declared check-in/.test(d)),'invalid cadence '+bad+' is not shown');
 assert.ok(!/ETA|expected|will pick|within/.test(i.detail.join(' ')),'no pickup promise');}
// ---- running means claimed; "no update since claiming" is said when true
{const r=task({status:'running',startedAt:iso(90),progressAt:iso(90)});assert.deepEqual(act(S({tasks:[r]}))[0].detail,['Claimed by Grok Bot 1 min ago','No update since it was claimed']);
 const r2=task({status:'running',startedAt:iso(90),progressAt:iso(10)});assert.ok(/Last update 10 s ago/.test(act(S({tasks:[r2]}))[0].detail[1]));}
// ---- the label says Claimed until the bot reports real progress; only then In progress
{const r=task({status:'running',startedAt:iso(90),progressAt:iso(90)});assert.equal(act(S({tasks:[r]}))[0].label,'Claimed','claimed with no progress report is not In progress');
 const r2=task({status:'running',startedAt:iso(90),progressAt:iso(10)});assert.equal(act(S({tasks:[r2]}))[0].label,'In progress','a post-claim report means the bot is working');
 const r3=task({status:'running',startedAt:iso(90)});assert.equal(act(S({tasks:[r3]}))[0].label,'Claimed','no progressAt at all is still only claimed');}
// ---- finishCount: a plan is one job; only fully done counts as finished; partial/failed/stopped counted separately
{const d0=Date.parse('2026-11-23T00:00:00Z');
 const done1=task({id:'f1',status:'done',finishedAt:iso(60)}),old1=task({id:'f2',status:'done',finishedAt:new Date(d0-1000).toISOString()});
 const failed1=task({id:'f3',status:'failed',finishedAt:iso(50)});
 const parent=task({id:'pp',status:'failed',orchestration:true,partIds:['pa','pb'],finishedAt:iso(40)});
 const pa=task({id:'pa',status:'done',parentId:'pp',partIndex:0,finishedAt:iso(41)}),pb=task({id:'pb',status:'failed',parentId:'pp',partIndex:1,finishedAt:iso(40)});
 const c=M.finishCount([done1,old1,failed1,parent,pa,pb],d0);
 assert.deepEqual(c,{done:1,bad:2},'one done today, one partial-failed plan (one job, not two), one failed; yesterday excluded');
 const stopped=task({id:'f4',status:'failed',result:'Stopped by owner',finishedAt:iso(30)});
 assert.deepEqual(M.finishCount([stopped],d0),{done:0,bad:1},'owner-stopped counts as not finished');
 assert.deepEqual(M.finishCount([],d0),{done:0,bad:0});}
// ---- a wake notice is never pickup
{const t=task({id:'w1'});const ev=[{id:'e1',type:'wake_sent',taskId:'w1',agentId:'a1',at:iso(20),text:'Instant wake sent (email)'}];const d=act(S({tasks:[t],events:ev}))[0].detail;
 assert.ok(d.some(x=>/Wake sent by email 20 s ago; pickup not confirmed/.test(x)));assert.equal(act(S({tasks:[t],events:ev}))[0].phase,'queued','still queued after a wake');
 assert.ok(act(S({tasks:[t],events:[{id:'e2',type:'wake_failed',taskId:'w1',at:iso(5),text:'Instant wake failed (email): HTTP 500'}]}))[0].detail.some(x=>/Wake failed by email/.test(x)));}
// ---- supported waiting reasons, and honest unknowns
{const unassigned=act(S({tasks:[task({assignee:null,unrouted:true})]}))[0];assert.equal(unassigned.reason,'needs_owner');assert.ok(/couldn't route it/.test(unassigned.detail[0]));
 assert.equal(act(S({tasks:[task({assignee:null,allAsleep:true})]}))[0].detail[0].startsWith('Every bot was asleep'),true);
 assert.equal(act(S({tasks:[task()],agents:[bot({status:'revoked'})]}))[0].reason,'revoked');
 assert.equal(act(S({tasks:[task()],agents:[bot({paused:true})]}))[0].reason,'paused');
 assert.equal(act(S({tasks:[task()],killed:true}))[0].reason,'killed');
 assert.equal(act(S({tasks:[task()],agents:[bot({lastSeen:null})]}))[0].reason,'never_checked_in');
 assert.equal(act(S({tasks:[task()],agents:[bot({lastSeen:iso(900)})]}))[0].reason,'stale_checkin');
 assert.equal(act(S({tasks:[task()],agents:[bot({lastSeen:iso(400),pollSec:300})]}))[0].reason,'pickup_unconfirmed','a 5-minute poller 400 s ago is within its declared window');
 const q=act(S({tasks:[task({id:'p1',status:'running',startedAt:iso(30)})],requests:[{id:'r',status:'pending',taskId:'p1',label:'Save a note',createdAt:iso(8)}]}))[0];assert.equal(q.label,'Waiting for you');assert.equal(q.reason,'approval');
 const unknown=act(S({tasks:[task()],agents:[]}))[0];assert.ok(/not in your workspace/.test(unknown.detail[0]),'unknown bot is stated, not guessed');}
// ---- runs: parts are nested, never counted separately; done only when every part is done
{const plan={id:'P',title:'Review it',orchestration:true,status:'running',partIds:['p1','p2','p3'],createdAt:iso(500)};
 const mk=(st,more)=>[{...plan},{id:'p1',title:'Part A',parentId:'P',partIndex:0,status:st[0],assignee:'a1',createdAt:iso(500),finishedAt:st[0]==='done'?iso(300):null,result:'A result',...(more||{})},{id:'p2',title:'Part B',parentId:'P',partIndex:1,dependsOn:'p1',status:st[1],assignee:'a1',createdAt:iso(500),finishedAt:st[1]==='done'?iso(200):null,result:'B result'},{id:'p3',title:'Part C',parentId:'P',partIndex:2,dependsOn:'p2',status:st[2],assignee:'a1',createdAt:iso(500),finishedAt:st[2]==='done'?iso(100):null,result:'C result'}];
 let s=S({tasks:mk(['done','running','waiting'])});assert.equal(act(s).length,1,'one run, not four');assert.equal(act(s)[0].part.n,2);assert.equal(act(s)[0].part.of,3);assert.equal(M.finishedItems(s,NOW).length,0,'a part done is not a finished run');
 s=S({tasks:mk(['done','queued','waiting'])});assert.equal(act(s)[0].status,'queued');
 s=S({tasks:mk(['done','done','waiting'])});assert.equal(act(s)[0].status,'waiting');assert.ok(/Waiting for part 2 \(Part B\) to finish/.test(act(s)[0].detail[0]),act(s)[0].detail[0]);
 s=S({tasks:[{...mk(['done','done','done'])[0],status:'done',finishedAt:iso(100)},...mk(['done','done','done']).slice(1)]});assert.equal(M.finishedItems(s,NOW).length,1,'one finished run');assert.equal(M.finishedItems(s,NOW)[0].status,'done');
 // parent says done but a part is not: the run is NOT shown as complete
 s=S({tasks:[{...plan,status:'done',finishedAt:iso(50)},...mk(['done','running','waiting']).slice(1)]});assert.equal(M.finishedItems(s,NOW).length,0);assert.equal(act(s)[0].status,'running');
 // failure after a success is partial; the remaining part is "not run", not "failed"
 const bad=mk(['done','failed','failed']);bad[3].notRun=true;bad[3].result='Not run: an earlier part stopped.';bad[2].finishedAt=iso(150);bad[3].finishedAt=iso(150);
 s=S({tasks:[{...plan,status:'failed',finishedAt:iso(150)},...bad.slice(1)]});const f=M.finishedItems(s,NOW)[0];assert.equal(f.status,'partial');assert.equal(f.partsDone,1);assert.equal(f.parts[2].phase,'notrun');assert.ok(/Partly finished \(1 of 3 parts\)/.test(M.finishCopy(f)));
 // failed with no successes is failed
 const none=mk(['failed','failed','failed']);none[2].notRun=none[3].notRun=true;none.forEach(t=>t.finishedAt=iso(100));s=S({tasks:[{...plan,status:'failed',finishedAt:iso(100)},...none.slice(1)]});assert.equal(M.finishedItems(s,NOW)[0].status,'failed');
 // a failure while other parts still run stays visible
 s=S({tasks:mk(['failed','running','waiting'])});assert.equal(act(s)[0].failedSoFar,1);
 // parts aged out of state: the plan's own status and a stated limitation
 s=S({tasks:[{...plan,status:'done',finishedAt:iso(50),result:'Part 1: x [done]\nsaved summary'}]});const g=M.finishedItems(s,NOW)[0];assert.equal(g.partsMissing,true);assert.equal(g.kind,'summary_only');assert.ok(/no longer available/.test(g.note));
 // results: a plan has no stitched answer; each part's own result in order, labelled
 s=S({tasks:[{...mk(['done','done','done'])[0],status:'done',finishedAt:iso(100),result:'STITCHED SERVER TEXT'},...mk(['done','done','done']).slice(1)]});const h=M.finishedItems(s,NOW)[0];assert.equal(h.kind,'parts');assert.equal(h.text,'');assert.deepEqual(h.parts.map(p=>p.result),['A result','B result','C result']);assert.ok(/No single combined answer/.test(h.note));assert.ok(!JSON.stringify(h).includes('STITCHED'),'the server-stitched text is not presented as a conclusion');}
// ---- standalone finished: result is the stored result, unchanged; sources only if the result itself links them
{const t=task({id:'f1',status:'done',finishedAt:iso(60),result:'See https://example.com/a. Also http://example.org/b, and javascript:alert(1) or ftp://x.example/z'});const f=M.finishedItems(S({tasks:[t]}),NOW)[0];assert.equal(f.text,t.result,'original output preserved byte for byte');assert.deepEqual(f.sources,['https://example.com/a','http://example.org/b'],'only http(s) links the result contains');
 assert.deepEqual(M.finishedItems(S({tasks:[task({status:'done',finishedAt:iso(5),result:'no links here'})]}),NOW)[0].sources,[]);
 assert.equal(M.finishedItems(S({tasks:[task({status:'failed',finishedAt:iso(5),result:'Stopped by owner'})]}),NOW)[0].status,'stopped','a job the owner stopped is Stopped, not Failed');
 assert.equal(M.phaseOf({status:'failed',result:'Stopped by owner'}),'stopped');assert.equal(M.finishedItems(S({tasks:[task({status:'dismissed',finishedAt:iso(5)})]}),NOW).length,0,'dismissed work is not finished work');}
// ---- completion transitions fire once per observed change, never from a first snapshot, and never for old completions
{const q=task({id:'c1',status:'running',startedAt:iso(50)});const s1=S({tasks:[q]});const snap=M.snapshot(s1);
 assert.deepEqual(M.transitions(null,s1,NOW),[],'no baseline: nothing announced');
 const doneT={...q,status:'done',finishedAt:iso(1),result:'ok'};const s2=S({tasks:[doneT]});const tr=M.transitions(snap,s2,NOW);assert.equal(tr.length,1);assert.equal(tr[0].id,'c1');
 assert.deepEqual(M.transitions(M.snapshot(s2),s2,NOW),[],'the same finished state does not re-announce');
 assert.deepEqual(M.transitions({c1:'done'},s2,NOW),[],'already final in the baseline: not announced');
 assert.deepEqual(M.transitions(snap,S({tasks:[{...q}]}),NOW),[],'still running: nothing');}
// ---- acknowledgement: opening or marking sets it; fetching and re-rendering does not; old finishes before the baseline are not unseen
{let ack=M.newAck(NOW-1000*1000);const mkf=(id,f)=>M.finishedItems(S({tasks:[task({id,status:'done',finishedAt:iso(f),result:'r'})]}),NOW)[0];
 const fin=[mkf('x1',2000),mkf('x2',100),mkf('x3',50)].sort((a,b)=>b.finishedAtMs-a.finishedAtMs);
 assert.deepEqual(M.unseen(fin,ack).map(f=>f.id),['x3','x2'],'finished before the baseline is not new');
 for(let i=0;i<5;i++)assert.equal(M.unseen(fin,ack).length,2,'polling or re-rendering does not mark anything seen');
 ack=M.markSeen(ack,['x2'],fin);assert.deepEqual(M.unseen(fin,ack).map(f=>f.id),['x3']);ack=M.markSeen(ack,null,fin);assert.equal(M.unseen(fin,ack).length,0);
 const again=[{...fin[0],finishedAtMs:fin[0].finishedAtMs+5000}];assert.equal(M.unseen(again,ack).length,1,'a later finish of the same id is new again');
 const big=M.newAck(0);const many=Array.from({length:400},(_,i)=>({id:'m'+i,finishedAtMs:1000+i}));assert.ok(Object.keys(M.markSeen(big,null,many).seen).length<=300,'the seen record stays bounded');}
// ---- overhead updates: real lifecycle, right task, no fabrication; failure outranks routine; counts the rest
{const a=bot();const none=M.botBubble(a,S({tasks:[]}),NOW);assert.equal(none,null,'an idle bot shows nothing');
 const queued=M.botBubble(a,S({tasks:[task({id:'b1',title:'Queued thing'})]}),NOW);assert.equal(queued.tone,'queue');assert.ok(/^Queued:/.test(queued.text));assert.ok(!/Working/.test(queued.text),'a queued task is not shown as work');
 const running=M.botBubble(a,S({tasks:[task({id:'b2',title:'Real work',status:'running',startedAt:iso(5)}),task({id:'b3',title:'Later',status:'queued'})]}),NOW);assert.equal(running.tone,'work');assert.equal(running.task,'b2');assert.equal(running.more,1);
 const mixed=M.botBubble(a,S({tasks:[task({id:'b4',status:'running',startedAt:iso(5)}),task({id:'b5',title:'Broken one',status:'failed',finishedAt:iso(60),result:'boom'})]}),NOW);assert.equal(mixed.tone,'bad');assert.equal(mixed.task,'b5','a failure is not hidden behind a routine message');
 assert.equal(M.botBubble(a,S({tasks:[task({status:'failed',finishedAt:iso(1200)})]}),NOW),null,'an old failure stops being a bubble');
 assert.equal(M.botBubble(a,S({tasks:[task({status:'done',finishedAt:iso(5),title:'Just done'})]}),NOW).tone,'good');assert.equal(M.botBubble(a,S({tasks:[task({status:'done',finishedAt:iso(120)})]}),NOW),null,'finished long ago: no bubble');
 const ask=M.botBubble(a,S({tasks:[task({id:'b6',status:'running',startedAt:iso(30)})],requests:[{status:'pending',taskId:'b6',createdAt:iso(5)}]}),NOW);assert.equal(ask.tone,'ask');
 assert.equal(M.botBubble(bot({id:'other'}),S({tasks:[task({id:'b7'})]}),NOW),null,'another bot\'s task is never shown on this bot');
 const evil=M.botBubble(a,S({tasks:[task({title:'<img src=x onerror=alert(1)>'.repeat(10)})]}),NOW);assert.ok(evil.text.length<60,'long hostile titles are clipped; the UI escapes the rest');}
// ---- a running bot's own report is quoted as its claim, only while recent, and is never turned into a status
{const a=bot();const t=task({id:'rp1',title:'Doing it',status:'running',startedAt:iso(120)});const ev=[{id:'r1',type:'reported',taskId:'rp1',agentId:'a1',at:iso(10),text:'Read the checklist <b>x</b>'}];
 const b=M.botBubble(a,S({tasks:[t],events:ev}),NOW);assert.ok(/^“Read the checklist/.test(b.sub)&&/bot-reported, 10 s ago/.test(b.sub),b.sub);assert.equal(b.tone,'work');
 assert.equal(M.botBubble(a,S({tasks:[t],events:[{...ev[0],at:iso(400)}]}),NOW).sub,null,'an old report is not shown');
 assert.equal(M.botBubble(a,S({tasks:[task({id:'rp2',status:'queued'})],events:[{...ev[0],taskId:'rp2'}]}),NOW).sub,null,'a queued task never shows a progress claim');
 assert.ok(M.recentUpdates(S({tasks:[t],events:ev}),NOW).some(u=>u.kind==='Bot reported'),'reports appear in recent updates');}
// ---- updates: sorted by their own time, de-duplicated, only for work still in state
{const t=task({id:'u1'});const ev=[{id:'e3',type:'completed',taskId:'u1',agentId:'a1',at:iso(5),text:'Finished: Task'},{id:'e1',type:'task_started',taskId:'u1',agentId:'a1',at:iso(60),text:'Started: Task'},{id:'e1',type:'task_started',taskId:'u1',agentId:'a1',at:iso(60),text:'Started: Task'},{id:'e2',type:'wake_sent',taskId:'u1',agentId:'a1',at:iso(80),text:'Instant wake sent (email)'},{id:'e9',type:'completed',taskId:'gone',at:iso(1),text:'x'},{id:'e8',type:'attempt',taskId:'u1',at:iso(2),text:'Attempted'},{id:'e7',type:'completed',taskId:'u1',at:new Date(NOW+3600e3).toISOString(),text:'from the future'}];
 const u=M.recentUpdates(S({tasks:[t],events:ev}),NOW);assert.deepEqual(u.map(x=>x.id),['e3','e1','e2'],'out-of-order input sorted by time; duplicates, unknown work, noise and future-dated events dropped');}
// ---- freshness: unknown is not live
{assert.equal(M.freshness(NOW,NOW-10000,false).state,'live');assert.equal(M.freshness(NOW,NOW-120000,false).state,'stale');assert.equal(M.freshness(NOW,NOW-10000,true).state,'offline');assert.equal(M.freshness(NOW,null,false).state,'loading');}
console.log('PASS work model: queued is not running and a wake is not pickup; cadence only when declared and valid; supported waiting reasons, unknowns stated; runs nest their parts, done only when every part is done, partial and not-run distinguished, a parent claiming done early is not believed; results preserved and never stitched, sources only from the result\'s own http(s) links; transitions fire once, never from a first snapshot; acknowledgement is explicit and bounded; overhead lines follow real state with failures outranking routine; updates sorted, de-duplicated and tied to work still present; staleness reported');
