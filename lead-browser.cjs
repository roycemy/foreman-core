// Browser check + screenshots for lead routing: type box only, running lead task with handed-off parts, waiting-for-wake.
// Mocked API only. Run: PLAYWRIGHT_MODULE=/path/to/playwright-core ARTIFACT_DIR=/tmp node lead-browser.cjs
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core'),fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'public'),out=process.env.ARTIFACT_DIR||'/tmp',now=new Date().toISOString(),old=new Date(Date.now()-3600e3).toISOString();
const server=http.createServer((q,r)=>{const f=path.join(root,q.url.split('?')[0]);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}r.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'})[path.extname(f)]||'application/octet-stream');r.end(fs.readFileSync(f))});
(async()=>{await new Promise(r=>server.listen(0,r));const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
for(const [width,asleep] of [[1440,false],[390,false],[1440,true],[390,true]]){const phone=width===390,p=await b.newPage({viewport:{width,height:phone?844:1000}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const g={id:'g',name:'Grok Bot',status:'active',providerId:'grok',lastSeen:asleep?old:now,pollSec:300,connection:{status:'active'}},i={id:'i',name:'Instinct',status:'active',providerId:'instinct',lastSeen:asleep?old:now,pollSec:300,connection:{status:'active'}},m={id:'m',name:'Muse',status:'active',providerId:'muse',lastSeen:old,pollSec:300,connection:{status:'active'}};
 let lead=null,kids=[],writes=0,bodies=[];await p.addInitScript(()=>localStorage.setItem('alter.tour','1'));
 await p.route('**/api/**',route=>{const u=new URL(route.request().url()),post=route.request().method()==='POST';let j={};
  if(u.pathname==='/api/me')j={email:'owner@example.test'};
  if(u.pathname==='/api/state')j={agents:[g,i,m],tasks:lead?[lead,...kids]:[],requests:[],events:[],receipts:[],notes:[],kinds:[]};
  if(u.pathname==='/api/tasks/plan')throw Error('no plan step');
  if(u.pathname==='/api/tasks'&&post){const body=route.request().postDataJSON();bodies.push(body);writes++;assert.equal(body.lead,true);assert(/^[A-Za-z0-9_-]{8,80}$/.test(body.requestId));assert(!('team' in body)&&!('mode' in body)&&!('roles' in body));
   lead={id:'L1',title:body.title,lead:true,assignee:'g',team:['g','i','m'],status:asleep?'queued':'running',createdAt:now,startedAt:asleep?null:now,routingReason:asleep?'Nobody is awake. Grok Bot checked in most recently, so the task waits for it to wake.':'Grok Bot is awake and checked in most recently, so it leads.'};
   kids=asleep?[]:[{id:'K1',parentId:'L1',title:'Find three competitors with pricing',assignee:'i',status:'done',result:'Acme $20/mo, Beta $35/mo, Gamma $12/mo',createdAt:now,finishedAt:now},{id:'K2',parentId:'L1',title:'Fact-check the price list',assignee:'m',status:'queued',createdAt:now}];
   j={task:lead,lead:{id:'g',name:'Grok Bot'},waiting:asleep};}
  if(u.pathname==='/api/jobs/L1')j={task:lead,children:kids,timeline:[],receipts:[],events:[],requests:[]};
  route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j)})});
 await p.goto('http://localhost:'+server.address().port+'/app.html#floor');await p.waitForFunction(()=>BB.who&&BB.S&&BB.S.agents.length);
 assert.equal(await p.locator('[data-team],[data-mode],[data-role],#teampick').count(),0,'no picker, mode switch or roles');
 const title='Research three competitors then write a memo';
 if(phone){await p.evaluate(()=>BB.go('#inbox'));await p.locator('[data-newjob]').first().click();await p.locator('#nj-t').fill(title);assert.equal(await p.locator('#modal select').count(),0,'no bot select');}
 else await p.locator('#askin').fill(title);
 if(!asleep){await p.waitForTimeout(250);await p.screenshot({path:out+'/'+width+'-1-type-box.png'});}
 await p.locator(phone?'#nj-go':'#ask button').click();await p.locator('.lead-view').waitFor({state:'visible'});assert.equal(writes,1,'one write per submit');
 await p.evaluate(()=>{const t=document.querySelector('#toast');t&&t.classList.remove('on')});await p.waitForTimeout(400);
 const txt=await p.locator('.lead-view').innerText();assert(/Lead: Grok Bot/.test(txt));assert(/don\u2019t message each other directly/.test(txt));
 if(asleep){assert(/Waiting for Grok Bot to wake/.test(txt));await p.screenshot({path:out+'/'+width+'-3-waiting-for-wake.png'});}
 else{assert(/Handed to Instinct/.test(txt)&&/Acme \$20\/mo/.test(txt)&&/Handed to Muse/.test(txt));await p.screenshot({path:out+'/'+width+'-2-running-lead.png'});}
 assert.equal(errors.length,0,errors.join('\n'));assert(await p.evaluate(()=>document.documentElement.scrollWidth)<=width);
 console.log('PASS lead UI',width,asleep?'waiting-for-wake':'running','- type box only, one write, lead + handed-off parts with real results');await p.close();}
await b.close();server.close();})().catch(e=>{console.error(e);process.exit(1)});
