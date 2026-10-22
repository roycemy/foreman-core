// Browser check + screenshots for the team picker and plan flow (mocked API, no network, no server state).
// Run: PLAYWRIGHT_MODULE=/path/to/playwright-core ARTIFACT_DIR=/tmp node team-picker-browser.cjs
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core'),fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'public'),out=process.env.ARTIFACT_DIR||'/tmp';const now=new Date().toISOString(),old=new Date(Date.now()-3600e3).toISOString();
const bots=[{id:'i',name:'Instinct',status:'active',providerId:'instinct',lastSeen:now,pollSec:300,connection:{status:'active'}},{id:'g',name:'Grok Bot',status:'active',providerId:'grok',lastSeen:now,pollSec:300,connection:{status:'active'}},{id:'m',name:'Muse',status:'active',providerId:'muse',lastSeen:old,pollSec:300,connection:{status:'active'}}];
const server=http.createServer((q,r)=>{const f=path.join(root,q.url.split('?')[0]);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}r.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'})[path.extname(f)]||'application/octet-stream');r.end(fs.readFileSync(f))});
(async()=>{await new Promise(r=>server.listen(0,r));const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
for(const width of [1440,390]){const phone=width===390,p=await b.newPage({viewport:{width,height:phone?844:1000}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 let started=null,writes=0,plans=[];await p.addInitScript(()=>{localStorage.setItem('alter.tour','1')});
 await p.route('**/api/**',route=>{const u=new URL(route.request().url()),body=route.request().postDataJSON&&route.request().method()==='POST'?route.request().postDataJSON():null;let j={};
  if(u.pathname==='/api/me')j={email:'owner@example.test'};
  if(u.pathname==='/api/state'){const tasks=started?[started.parent,...started.parts]:[];j={agents:bots,tasks,requests:[],events:[],receipts:[],notes:[],kinds:[]};}
  if(u.pathname==='/api/tasks/plan'){plans.push(body.team);const team=bots.filter(a=>body.team.includes(a.id)).map(a=>({id:a.id,name:a.name,awake:a.id!=='m',load:0,strengths:[]}));j={method:'basic',basicReason:'No planner key is set.',note:'Basic split: No planner key is set. Alter split on explicit steps only and assigned by availability, not AI reasoning.',team,allTeamAsleep:false,summary:'',parts:[{title:'Research three competitors',instruction:'Find three competitors with pricing',needs:'Nothing',assignee:'g',reason:'Grok Bot is awake with 0 queued or running. Rule-based, not AI.'},{title:'Write a one-page memo',instruction:'Write a one-page memo from the research',needs:'The result of part 1',assignee:'i',reason:'Instinct is awake with 0 queued or running. Rule-based, not AI.'}]};}
  if(u.pathname==='/api/tasks'&&route.request().method()==='POST'){writes++;assert.deepEqual(body.team.slice().sort(),['g','i']);assert.equal(body.orchestrate,true);const parent={id:'parent',title:body.title,orchestration:true,team:body.team,planMethod:body.planMethod,status:'running',createdAt:now,startedAt:now,partIds:['c1','c2'],result:'Part 1: Research three competitors [done]\nAcme ($20), Beta ($35), Gamma ($12)'};const parts=[{id:'c1',parentId:'parent',partIndex:0,title:body.parts[0].title,assignee:'g',status:'done',result:'Acme ($20), Beta ($35), Gamma ($12)',createdAt:now,finishedAt:now},{id:'c2',parentId:'parent',partIndex:1,title:body.parts[1].title,assignee:'i',status:'running',createdAt:now,startedAt:now}];started={parent,parts};j={task:parent,parts};}
  if(u.pathname==='/api/jobs/parent')j={task:started.parent,children:started.parts,timeline:[],receipts:[],events:[],requests:[]};
  route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j)})});
 await p.goto('http://localhost:'+server.address().port+'/app.html#floor');await p.waitForFunction(()=>BB.who&&BB.S&&BB.S.agents.length);
 const scope=phone?'#modal':'#teampick';
 if(phone){await p.evaluate(()=>BB.go('#inbox'));await p.locator('[data-newjob]').first().click();await p.locator('#nj-t').fill('Research three competitors then write a memo');assert(await p.locator('#nj-go').isDisabled(),'Plan disabled with no team');}
 else{await p.locator('#askin').fill('Research three competitors then write a memo');assert(await p.locator('#ask button').isDisabled(),'send disabled with no team picked');}
 assert.equal(await p.locator(scope+' [data-team][aria-pressed=true]').count(),0,'no bot selected by default');
 assert((await p.locator(scope+' [data-team="m"]').innerText()).includes('asleep'),'asleep tag');
 const h=await p.locator(scope+' [data-team="i"]').boundingBox();assert(h.height>=44,'tap target >=44px');
 await p.locator(scope+' [data-team="g"]').click();await Promise.all([1,2,3].map(()=>p.locator(scope+' [data-team="i"]').click({force:true}).catch(()=>{})));// racing taps
 const iOn=await p.locator(scope+' [data-team="i"]').getAttribute('aria-pressed');if(iOn!=='true')await p.locator(scope+' [data-team="i"]').click();
 assert.deepEqual((await p.evaluate(()=>BB.teamPicked())).sort(),['g','i'],'chip state = what the screen shows');
 assert(!(await p.locator(phone?'#nj-go':'#ask button').isDisabled()),'enabled once a bot is picked');
 await p.waitForTimeout(250);await p.screenshot({path:out+'/'+width+'-1-picker.png'});
 await p.locator(phone?'#nj-go':'#ask button').click();await p.locator('#plan-sum').waitFor();
 assert.equal(writes,0,'no task before Start');assert.equal(await p.locator('#plan-sum').innerText(),'Grok Bot researches, then Instinct writes');assert(/basic split/i.test(await p.locator('#plan-basic').innerText()));
 await p.waitForTimeout(250);await p.screenshot({path:out+'/'+width+'-2-plan-summary.png'});
 await p.locator('#plan-adjust').click();await p.locator('[data-i="1"] [data-k=title]').fill('Write a one-page memo for the board');await p.locator('[data-i="0"] [data-k=assignee]').selectOption('i');
 await p.waitForTimeout(250);await p.screenshot({path:out+'/'+width+'-3-adjust.png'});
 await p.keyboard.press('Escape');await p.locator('#plan-sum').waitFor();assert.equal(writes,0);assert.equal(await p.locator('#plan-sum').innerText(),'Instinct researches, then Instinct writes','edits survive closing Adjust');
 await p.locator('#plan-adjust').click();assert.equal(await p.locator('[data-i="1"] [data-k=title]').inputValue(),'Write a one-page memo for the board','edits survive reopening');await p.locator('[data-i="0"] [data-k=assignee]').selectOption('g');await p.locator('#adj-done').click();await p.locator('#plan-sum').waitFor();
 await p.locator('#plan-start').click();await p.locator('.parts-progress').waitFor({state:'visible'});assert.equal(writes,1,'exactly one write, on Start');
 const pp=await p.locator('.parts-progress').innerText();assert(pp.includes('Grok Bot')&&pp.includes('Instinct'));
 await p.waitForTimeout(400);await p.screenshot({path:out+'/'+width+'-4-running-parent.png',fullPage:false});
 assert.equal(errors.length,0,errors.join('\n'));assert(await p.evaluate(()=>document.documentElement.scrollWidth)<=width,'no horizontal overflow');
 console.log('PASS team picker UI',width,': none preselected, asleep tag, 44px chips, racing taps, no write before Start, adjust keeps edits, one write on Start');await p.close();}
await b.close();server.close();})().catch(e=>{console.error(e);process.exit(1)});
