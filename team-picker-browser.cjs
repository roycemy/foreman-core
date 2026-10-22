// Browser check + screenshots: team picker and the auto plan router (submit = plan + start). Mocked API only.
// Run: PLAYWRIGHT_MODULE=/path/to/playwright-core ARTIFACT_DIR=/tmp node team-picker-browser.cjs
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core'),fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'public'),out=process.env.ARTIFACT_DIR||'/tmp';const now=new Date().toISOString(),old=new Date(Date.now()-3600e3).toISOString();
const bots=[{id:'i',name:'Instinct',status:'active',providerId:'instinct',lastSeen:now,pollSec:300,connection:{status:'active'}},{id:'g',name:'Grok Bot',status:'active',providerId:'grok',lastSeen:now,pollSec:300,connection:{status:'active'}},{id:'m',name:'Muse',status:'active',providerId:'muse',lastSeen:old,pollSec:300,connection:{status:'active'}}];
const BASIC='Basic split: No planner key is set. Alter split on explicit steps only and assigned by availability, not AI reasoning.';
function planFor(team,title,n){const id='p'+n,mk=(i,t,a,st,why)=>({id:id+'c'+i,parentId:id,partIndex:i,title:t,assignee:a,status:st,routingReason:why,team,createdAt:now});
 if(team.join()==='m'){const parts=[mk(0,'Draft a launch post','m','queued','Muse is asleep; the part waits for its next check-in. Rule-based, not AI.'),mk(1,'Review the post','m','waiting','Muse is asleep; the part waits for its next check-in. Rule-based, not AI.')];return {plan:{method:'basic',allTeamAsleep:true,summary:'Muse drafts, then Muse reviews'},task:{id,title,orchestration:true,team,planMethod:'basic',planNote:BASIC,waitNote:'Everyone on this team is asleep. Parts wait until a teammate checks in; Alter never hands them to a bot outside the team.',status:'running',createdAt:now,startedAt:now,partIds:parts.map(p=>p.id)},parts};}
 if(team.join()==='i'){const parts=[mk(0,'Summarize the support tickets','i','queued','Instinct is awake with 0 queued or running, declared support strength. Rule-based, not AI.')];return {plan:{method:'basic',summary:'Instinct summarizes'},task:{id,title,orchestration:true,team,planMethod:'basic',planNote:BASIC,status:'running',createdAt:now,startedAt:now,partIds:parts.map(p=>p.id)},parts};}
 const parts=[mk(0,'Research three competitors','g','queued','Awake with the lightest load; research strength.'),mk(1,'Write a one-page memo','i','waiting','Awake and free; writes from part 1\u2019s real list.')];return {plan:{method:'ai',summary:'Grok Bot researches, then Instinct writes'},task:{id,title,orchestration:true,team,planMethod:'ai',planNote:'AI plan from 2 picked bots.',status:'running',createdAt:now,startedAt:now,partIds:parts.map(p=>p.id)},parts};}
const server=http.createServer((q,r)=>{const f=path.join(root,q.url.split('?')[0]);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}r.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'})[path.extname(f)]||'application/octet-stream');r.end(fs.readFileSync(f))});
(async()=>{await new Promise(r=>server.listen(0,r));const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
for(const width of [1440,390]){const phone=width===390,p=await b.newPage({viewport:{width,height:phone?844:1000}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const plans=[];let writes=0,planCalls=0;await p.addInitScript(()=>{localStorage.setItem('alter.tour','1')});
 await p.route('**/api/**',route=>{const u=new URL(route.request().url()),post=route.request().method()==='POST',body=post?route.request().postDataJSON():null;let j={};
  if(u.pathname==='/api/me')j={email:'owner@example.test'};
  if(u.pathname==='/api/state')j={agents:bots,tasks:plans.flatMap(x=>[x.task,...x.parts]),requests:[],events:[],receipts:[],notes:[],kinds:[]};
  if(u.pathname==='/api/tasks/plan')planCalls++;
  if(u.pathname==='/api/tasks'&&post){writes++;assert.equal(body.orchestrate,true);assert.equal(body.auto,true);assert(body.team.length);const x=planFor(body.team.slice().sort(),body.title,plans.length);plans.push(x);j={task:x.task,parts:x.parts,plan:x.plan};}
  const cm=u.pathname.match(/^\/api\/tasks\/(\w+)\/cancel-pending$/);if(cm){const x=plans.find(y=>y.task.id===cm[1]);let n=0;x.parts.forEach(c=>{if(['waiting','queued'].includes(c.status)){c.status='failed';c.cancelled=true;c.result='Cancelled by owner before it started.';n++;}});x.task.status='failed';j={cancelled:n,task:x.task};}
  const jm=u.pathname.match(/^\/api\/jobs\/(\w+)$/);if(jm){const x=plans.find(y=>y.task.id===jm[1]);j=x?{task:x.task,children:x.parts,timeline:[],receipts:[],events:[],requests:[]}:{};}
  route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j)})});
 const base='http://localhost:'+server.address().port+'/app.html';
 async function open(){await p.goto(base+'#floor');await p.reload();await p.waitForFunction(()=>BB.who&&BB.S&&BB.S.agents.length);if(phone){await p.evaluate(()=>BB.go('#inbox'));await p.locator('[data-newjob]').first().click();}}
 const scope=phone?'#modal':'#teampick',input=phone?'#nj-t':'#askin',send=phone?'#nj-go':'#ask button';
 async function pick(ids){for(const id of ['i','g','m']){const on=(await p.locator(scope+' [data-team="'+id+'"]').getAttribute('aria-pressed'))==='true';if(on!==ids.includes(id))await p.locator(scope+' [data-team="'+id+'"]').click();}}
 async function submit(title,ids,shot){await open();await p.locator(input).fill(title);await pick(ids);const w0=writes;await p.locator(send).click();await p.locator('.parts-progress').waitFor({state:'visible'});assert.equal(writes,w0+1,'exactly one write per submit');await p.waitForTimeout(350);await p.evaluate(()=>{const t=document.querySelector('#toast');t&&t.classList.remove('on')});await p.waitForTimeout(300);await p.screenshot({path:out+'/'+width+'-'+shot+'.png'});return p.locator('.parts-progress').innerText();}
 // 1. picker: nothing preselected, disabled, asleep tag, 44px, racing taps
 await open();await p.locator(input).fill('Research three competitors then write a memo');
 assert(await p.locator(send).isDisabled(),'submit disabled with no team');assert.equal(await p.locator(scope+' [data-team][aria-pressed=true]').count(),0,'no default selection');
 assert((await p.locator(scope+' [data-team="m"]').innerText()).includes('asleep'));assert((await p.locator(scope+' [data-team="i"]').boundingBox()).height>=44);
 await p.locator(scope+' [data-team="g"]').click();await Promise.all([1,2,3].map(()=>p.locator(scope+' [data-team="i"]').click({force:true}).catch(()=>{})));
 assert.equal(await p.locator(scope+' [data-team][aria-pressed=true]').count(),await p.evaluate(()=>BB.teamPicked().length),'chip state = picked state after racing taps');
 await pick(['g','i']);assert(!(await p.locator(send).isDisabled()));await p.waitForTimeout(250);await p.screenshot({path:out+'/'+width+'-1-picker.png'});
 // 2. AI plan starts immediately: parent shows parts, bots, reasons, Cancel
 let txt=await submit('Research three competitors then write a memo',['g','i'],'2-running-parent');
 assert(txt.includes('Grok Bot')&&txt.includes('Instinct')&&txt.includes('lightest load'),'parts, owners, reasons');assert(!/basic split/i.test(txt));assert.equal(await p.locator('#plan-sum,#plan-start,#plan-adjust').count(),0,'no summary/Start/Adjust step');
 await p.locator('[data-cancel-pending]').click();await p.waitForFunction(()=>!document.querySelector('[data-cancel-pending]')&&document.querySelector('.parts-progress')&&/cancelled/.test(document.querySelector('.parts-progress').innerText));
 // 3. all asleep: queued and waiting, clear note
 txt=await submit('Draft a launch post then review it',['m'],'3-all-asleep-waiting');assert(/everyone on this team is asleep/i.test(txt));assert(/waiting for Muse to wake/i.test(txt));
 // 4. basic split note
 txt=await submit('Summarize the support tickets',['i'],'4-basic-split');assert(/basic split/i.test(txt));
 assert.equal(planCalls,0,'client never calls a separate plan step');assert.equal(errors.length,0,errors.join('\n'));assert(await p.evaluate(()=>document.documentElement.scrollWidth)<=width,'no horizontal overflow');
 console.log('PASS auto router UI',width,': no default team, gated submit, racing taps, one write per submit, starts immediately, reasons + cancel, all-asleep note, basic split note');await p.close();}
await b.close();server.close();})().catch(e=>{console.error(e);process.exit(1)});
