const {chromium}=require('/usr/local/lib/pnpm/5/.pnpm/playwright@1.63.0-alpha-2026-08-31/node_modules/playwright');
const fs=require('fs');
const [,,scene,mode,hi]=process.argv; const M=mode==='m'; const HI=hi==='hi';
const ago=m=>new Date(Date.now()-m*60000).toISOString(), now=()=>new Date().toISOString(), ahead=m=>new Date(Date.now()+m*60000).toISOString();
const agent=(id,name,room,extra)=>Object.assign({id,name,providerId:id,status:'active',room,visibleRoom:room,connection:{status:'active',transport:'gateway'},lastSeen:ago(0.2),permissions:{}},extra||{});
let AUTHDELAY=350,AUTHN=0;const S={killed:false,agents:[agent('grok','Grok Bot','ops'),agent('instinct','Instinct','finance'),agent('muse','Muse','marketing',{lastSeen:ago(0.3)}),agent('devin','Scout','sales')],
 tasks:[{id:'d1',assignee:'grok',status:'done',title:'Competitor pricing scan',createdAt:ago(90),startedAt:ago(80),finishedAt:ago(60)},{id:'d2',assignee:'instinct',status:'done',title:'Reconcile invoices',createdAt:ago(50),startedAt:ago(45),finishedAt:ago(30)}],requests:[],events:[]};
const MONEY={requests:[]}; const CARDS={killed:false,card:{label:'Team card',last4:'4821'},proposals:[],ledger:[{id:'l1',outcome:'simulated',merchant:'Figma',botId:'instinct',purpose:'Team seat for the launch deck',amountCents:4900,at:ago(12)},{id:'l2',outcome:'simulated',merchant:'Perplexity',botId:'grok',purpose:'Research credits',amountCents:1200,at:ago(95)},{id:'l3',outcome:'simulated',merchant:'Canva',botId:'devin',purpose:'Launch templates',amountCents:800,at:ago(140)}],bots:[{id:'grok',name:'Grok Bot',dailyLimitCents:5000,simulatedTodayCents:1200,status:'active'},{id:'instinct',name:'Instinct',dailyLimitCents:15000,simulatedTodayCents:0,status:'active'},{id:'muse',name:'Muse',dailyLimitCents:10000,simulatedTodayCents:0,status:'active'},{id:'devin',name:'Scout',dailyLimitCents:50000,simulatedTodayCents:0,status:'active'}]};
const W=M?{w:432,h:768,vw:1080,vh:1920,z:1}:{w:1920,h:1080,vw:1920,vh:1080,z:(process.argv[2]==='auth'?1.48:1.3334)};
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:[...(M?['--force-device-scale-factor=2.5']:HI?['--force-device-scale-factor=2']:[]),'--force-prefers-no-reduced-motion','--unsafely-treat-insecure-origin-as-secure=http://alter-demo.vercel.app']});
const ctx=await b.newContext({viewport:{width:W.w,height:W.h},deviceScaleFactor:1,permissions:['clipboard-read','clipboard-write']});
await ctx.addInitScript(z=>{document.addEventListener('DOMContentLoaded',()=>{document.documentElement.style.zoom=z});try{localStorage.setItem('alter.tour','1');localStorage.setItem('bb.tour','1')}catch(e){}},W.z);
await ctx.addInitScript(m=>{addEventListener('DOMContentLoaded',()=>{const c=document.createElement('div');c.id='vcur';c.style.cssText=m?'position:fixed;z-index:2147483647;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(17,17,17,.18);border:2px solid rgba(255,255,255,.9);box-shadow:0 2px 10px rgba(0,0,0,.15);pointer-events:none;opacity:0;transition:opacity .25s,transform .18s ease-out':'position:fixed;z-index:2147483647;left:0;top:0;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#111;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.25);pointer-events:none;opacity:0;transition:opacity .3s,transform .16s ease-out';document.body.appendChild(c);
addEventListener('mousemove',e=>{c.style.left=e.clientX+'px';c.style.top=e.clientY+'px';if(!window.__hide)c.style.opacity=1},true);
addEventListener('mousedown',()=>{c.style.transform='scale(.72)'},true);addEventListener('mouseup',()=>{c.style.transform='scale(1)'},true);})},M);
const p=await ctx.newPage();p.on('pageerror',e=>console.log('PERR',e.message));
const FD=`/workspace/alter-video/v4/clips/${scene}-${mode}`;fs.rmSync(FD,{recursive:true,force:true});fs.mkdirSync(FD,{recursive:true});
const cdp=await ctx.newCDPSession(p);let fi=0;const fl=[];
cdp.on('Page.screencastFrame',async f=>{const n=String(fi++).padStart(5,'0');fs.writeFileSync(`${FD}/${n}.jpg`,Buffer.from(f.data,'base64'));fl.push([n,f.metadata.timestamp]);cdp.send('Page.screencastFrameAck',{sessionId:f.sessionId}).catch(()=>{});});
await p.route(/^http:\/\/alter-demo\.vercel\.app\/(?!api\/)/,async r=>{const u=new URL(r.request().url());const res=await fetch('http://localhost:5055'+u.pathname+u.search);const body=Buffer.from(await res.arrayBuffer());r.fulfill({status:res.status,headers:{'content-type':res.headers.get('content-type')||'text/html'},body});});
await p.route('**/api/**',async r=>{const u=new URL(r.request().url()),path=u.pathname,meth=r.request().method();if(meth==='POST')console.log('POST',path);let o={};
 if(path==='/api/authorization/demo'){if(!(AUTHN++)){o={scenarios:[]};}else{await new Promise(z=>setTimeout(z,AUTHDELAY));const sc=(name,a,decision,code,reason)=>({name,request:{amountCents:a},result:{decision,code,reason}});o={scenarios:[sc('Scout · Lakeside Lodge venue deposit',120000,'ASK','limit_action'),sc('Muse · PrintHouse name badges',3800,'ALLOW_SANDBOX','within_budget','Inside Muse’s daily budget'),sc('Instinct · Snack Box Co snacks',6400,'ALLOW_SANDBOX','within_budget','Inside Instinct’s daily budget'),sc('Scout · Harbor Bar open tab',90000,'DENY','merchant_category')]};}}
 else if(path==='/api/me')o={email:'royce@alterhq.app',workspace:'w1'};
 else if(path==='/api/state')o=S; else if(path==='/api/money')o=MONEY; else if(path.startsWith('/api/cards')&&meth==='GET')o=CARDS;
 else if(/\/pairing$/.test(path))o={code:'4K7Q2M',expiresAt:ahead(5)};
 else if(/^\/api\/cards\/[^/]+\/(approve|deny)$/.test(path)){const [, , , id,d]=path.split('/');const q=CARDS.proposals.find(x=>x.id===id);if(q){q.status=d==='approve'?'simulated':'denied';if(d==='approve'){CARDS.ledger.unshift({id:'c'+id,outcome:'simulated',merchant:q.merchant,botId:q.botId,purpose:q.purpose,amountCents:q.amountCents,at:now()});const bb=CARDS.bots.find(x=>x.id===q.botId);bb.simulatedTodayCents+=q.amountCents;}}o={proposal:q};}
 else if(path==='/api/tasks'&&meth==='POST'){const body=JSON.parse(r.request().postData()||'{}');const t={id:'root',title:body.title,assignee:'grok',status:'running',createdAt:now(),startedAt:now(),category:'research'};S.tasks.push(t);o={task:t,routed:{botId:'grok',botName:'Grok Bot',category:'research',chain:[{botId:'devin',botName:'Scout',category:'sales'},{botId:'muse',botName:'Muse',category:'marketing'},{botId:'instinct',botName:'Instinct',category:'finance'}]}};}
 r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});});
const sync=()=>p.evaluate(()=>window.BB&&BB.sync&&BB.sync(true)).catch(()=>{});
const wait=ms=>p.waitForTimeout(ms);
let T1=Date.now(); const marks={}; const mark=k=>marks[k]=(Date.now()-T1)/1000;
const fresh=()=>S.agents.forEach(a=>{if(a.connection.status==='active'&&a.id!=='instinct'||scene!=='connect')a.lastSeen=now()});
const IV=setInterval(()=>{S.agents.forEach(a=>{if(!(scene==='connect'&&a.id==='instinct'&&!marks.paired))a.lastSeen=now()})},3000);
const hash=scene==='card'?'#card':scene==='inbox'?'#inbox':'#floor'; const PAGE=scene==='auth'?'authorization.html':'app.html'+hash;
const PV={id:'pv',botId:'devin',status:'pending',amountCents:120000,merchant:'Lakeside Lodge',purpose:'Venue deposit for the team offsite',expiresAt:ahead(30),createdAt:now(),detailsHash:'hv'},PB={id:'pb',botId:'muse',status:'pending',amountCents:3800,merchant:'PrintHouse',purpose:'Name badges for the offsite',expiresAt:ahead(30),createdAt:now(),detailsHash:'hb'},PS={id:'ps',botId:'instinct',status:'pending',amountCents:6400,merchant:'Snack Box Co',purpose:'Snacks for the offsite',expiresAt:ahead(30),createdAt:now(),detailsHash:'hs'};
if(scene==='inbox')CARDS.proposals.push(PV,PB,PS);
if(scene==='card'){CARDS.ledger=CARDS.ledger.filter(x=>x.id==='l2');CARDS.ledger.unshift({id:'lb',outcome:'simulated',merchant:'PrintHouse',botId:'muse',purpose:'Name badges for the offsite',amountCents:3800,at:ago(0.5)},{id:'ls',outcome:'simulated',merchant:'Snack Box Co',botId:'instinct',purpose:'Snacks for the offsite',amountCents:6400,at:ago(0.4)});CARDS.bots[1].simulatedTodayCents=6400;CARDS.bots[2].simulatedTodayCents=3800;}
if(scene==='connect'){S.agents[1].lastSeen=null;S.agents[1].connection={status:'awaiting_bot'};}
if(scene==='approve'||scene==='mirror'){CARDS.proposals.push({id:'p1',botId:'instinct',status:'pending',amountCents:4900,merchant:'Figma',purpose:'Team seat for the launch deck',expiresAt:ahead(30),createdAt:ago(0.2),detailsHash:'h1'},{id:'p2',botId:'devin',status:'pending',amountCents:120000,merchant:'AdNetwork Pro',purpose:'Ad spend for launch week',expiresAt:ahead(30),createdAt:ago(0.1),detailsHash:'h2'});}
await p.goto('http://alter-demo.vercel.app/'+PAGE,{waitUntil:'networkidle'}).catch(()=>{});
await wait(1500);console.log('url',p.url());await p.addStyleTag({content:'#upd{display:none!important}'}).catch(()=>{});
if(scene!=='auth'&&hash==='#floor'&&!M){await p.locator('#zin').click().catch(()=>{});await wait(700);}
if(scene==='auth')await p.evaluate(y=>scrollTo(0,y),M?150:205);await wait(1800); let shoot=true;if(false){(async()=>{while(shoot){const r=await p.screenshot({type:'jpeg',quality:90,scale:'device'}).catch(()=>null);if(!r)continue;const n=String(fi++).padStart(5,'0');fs.writeFileSync(`${FD}/${n}.jpg`,r);fl.push([n,Date.now()/1000]);}})();}else await cdp.send('Page.startScreencast',{format:'jpeg',quality:92,maxWidth:HI?3840:W.vw,maxHeight:HI?2160:W.vh,everyNthFrame:1}); T1=Date.now();
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2; let mx=W.w*0.62,my=W.h*0.7;
const glide=async(x,y,ms=650)=>{const n=Math.round(ms/16),x0=mx,y0=my;for(let i=1;i<=n;i++){const k=ease(i/n);await p.mouse.move(x0+(x-x0)*k,y0+(y-y0)*k);await p.waitForTimeout(16);}mx=x;my=y;};
const click=async s=>{const l=p.locator(s).first();try{await l.waitFor({state:'visible',timeout:3000});await p.waitForTimeout(450);const b=await l.boundingBox({timeout:3000});if(!b)throw 0;await glide(b.x+b.width/2,b.y+b.height/2);await p.waitForTimeout(140);await p.mouse.down();await p.waitForTimeout(90);await p.mouse.up();}catch(e){console.log('miss',s)}};
const clickL=async l=>{try{const b=await l.boundingBox({timeout:3000});await glide(b.x+b.width/2,b.y+b.height/2);await p.waitForTimeout(140);await p.mouse.down();await p.waitForTimeout(90);await p.mouse.up();}catch(e){console.log('missL')}};
const typeNat=async tx=>{for(const ch of tx){await p.keyboard.type(ch);let d=55+Math.random()*55;if(ch===' ')d+=35;if(ch===',')d+=180;await p.waitForTimeout(d);}};

if(scene==='hook'){ await wait(1500); S.tasks.push({id:'h1',assignee:'muse',status:'running',title:'Draft launch post',createdAt:now(),startedAt:now()});await sync();await wait(3000);
  mark('spend');await wait(6000);}
if(scene==='connect'){ await wait(700); await p.evaluate(()=>BB.openInspector('instinct')); await wait(1100); await click('[data-rec]'); mark('wizard'); await wait(1300); mark('copy'); await click('#copypairmsg'); await wait(2000);
  mark('paired'); marks.paired=marks.paired; S.agents[1].connection={status:'active',transport:'gateway'}; S.agents[1].lastSeen=now(); S.agents[1].state={kind:'CONNECTED',at:now()}; await sync(); await wait(1500); await p.keyboard.press('Escape'); await p.evaluate(()=>BB.closeModal&&BB.closeModal()).catch(()=>{}); await p.evaluate(()=>BB.closeInspector&&BB.closeInspector()).catch(()=>{}); mark('closed'); await glide(W.w*0.8,W.h*0.25,500); await wait(6000);}
if(scene==='team'){ await wait(800); S.tasks.find(t=>t.id==='d1').category='research';
  S.tasks.push({id:'hx',parentId:'d1',createdBy:'grok',assignee:'instinct',status:'queued',title:'Price the top three plans',createdAt:now()}); mark('handoff'); await sync(); await wait(5200);
  const t=S.tasks.find(t=>t.id==='hx'); t.status='running'; t.startedAt=now(); mark('run'); await sync(); await wait(6000);}
if(scene==='task'){ await wait(600); const tx='Research rivals, write the launch post, set an ad budget'; await click('#askin'); mark('type'); await typeNat(tx); await wait(300); mark('send'); await click('#ask button[type=submit]'); await wait(1500); await p.evaluate(()=>BB.closeInspector&&BB.closeInspector()).catch(()=>{}); await glide(W.w*0.85,W.h*0.3,500); await wait(100);
  const T=id=>S.tasks.find(t=>t.id===id); T('root').status='done';T('root').finishedAt=now();T('root').category='research';
  S.tasks.push({id:'c1',parentId:'root',createdBy:'grok',assignee:'muse',status:'queued',title:'Write the launch post',category:'marketing',createdAt:now()}); mark('h1'); await sync(); await wait(3000);
  T('c1').status='running';T('c1').startedAt=now(); await sync(); await wait(2200);
  T('c1').status='done';T('c1').finishedAt=now(); S.tasks.push({id:'c2',parentId:'c1',createdBy:'muse',assignee:'instinct',status:'queued',title:'Set the ad budget',category:'finance',createdAt:now()}); mark('h2'); await sync(); await wait(3000);
  T('c2').status='running';T('c2').startedAt=now(); mark('run2'); await sync(); await wait(3000);}
if(scene==='approve'){ await wait(M?2000:2500); mark('first');
  if(!M){await click('#ibtn');await wait(1500);}
  const root=M?'#v-inbox':'#pop';
  await clickL(p.locator(root+' [data-d="approve"]').nth(1)); mark('approved'); await sync(); await wait(2600);
  await click(root+' [data-d="deny"]'); mark('denied'); await sync(); await wait(3000);}
if(scene==='mirror'){ await p.mouse.move(-50,-50); await p.evaluate(()=>document.querySelector('#ibtn').click()); await wait(600); mark("first"); await wait(2370);
  CARDS.proposals[0].status='simulated'; CARDS.ledger.unshift({id:'cp1',outcome:'simulated',merchant:'Figma',botId:'instinct',purpose:'Team seat',amountCents:4900,at:now()}); CARDS.bots.find(x=>x.id==='instinct').simulatedTodayCents+=4900; await sync(); mark("approved"); await wait(4700);
  CARDS.proposals[1].status='denied'; await sync(); mark('denied'); await wait(3000);}


if(scene==='take'){ await wait(300); await click('#askin'); mark('type'); await typeNat("Book my team offsite and buy what's needed."); await wait(350); await click('#ask button[type=submit]'); mark('send'); await wait(1500); await p.evaluate(()=>BB.closeInspector&&BB.closeInspector()).catch(()=>{}); await glide(W.w*0.86,W.h*0.32,700);
  const T=id=>S.tasks.find(t=>t.id===id); await wait(1500); T('root').status='done';T('root').finishedAt=now();
  const sub=[['c1','devin','Find the offsite venue','sales'],['c2','muse','Order name badges','marketing'],['c3','instinct','Stock snacks for the offsite','finance']];
  for(const [id,a,ti,c] of sub){S.tasks.push({id,parentId:'root',createdBy:'grok',assignee:a,status:'queued',title:ti,category:c,createdAt:now()});mark(id);await sync();await wait(1300);}
  for(const [id] of sub){T(id).status='running';T(id).startedAt=now();} await sync(); mark('running');
  while((Date.now()-T1)/1000<14.4) await wait(100);
  CARDS.proposals.push(PV); mark('ask'); await sync(); await wait(5500);}
if(scene==='auth'){ await wait(900); await click('#run'); mark('run'); await wait(400); await glide(W.w*0.82,W.h*0.55,900); await wait(6000);}
if(scene==='inbox'){ await wait(1500); mark('first'); await clickL(p.locator('#v-inbox [data-d="deny"]').first()); mark('deny'); await sync(); await wait(1100);
  await clickL(p.locator('#v-inbox [data-d="approve"]').first()); mark('ap1'); await sync(); await wait(450);
  await clickL(p.locator('#v-inbox [data-d="approve"]').first()); mark('ap2'); await sync(); await wait(3000);}
if(scene==='card'){ await wait(1200); if(M){for(let i=0;i<36;i++){await p.mouse.wheel(0,9);await p.waitForTimeout(16);} await wait(400);} await click('[data-limit]'); mark('limits'); if(!M)await glide(W.w*0.9,W.h*0.86,800); await wait(4500);}
fs.writeFileSync(`/workspace/alter-video/v4/clips/${scene}-${mode}.json`,JSON.stringify(marks));
const TEND=Date.now()/1000;shoot=false;await cdp.send('Page.stopScreencast');await wait(300);
let out='';for(let i=0;i<fl.length;i++){const d=i+1<fl.length?fl[i+1][1]-fl[i][1]:Math.max(0.04,TEND-fl[i][1]);out+=`file '${FD}/${fl[i][0]}.jpg'\nduration ${d.toFixed(4)}\n`;}out+=`file '${FD}/${fl[fl.length-1][0]}.jpg'\n`;fs.writeFileSync(FD+'.txt',out);
require('child_process').execSync(`ffmpeg -loglevel error -y -f concat -safe 0 -i ${FD}.txt -vf fps=30,format=yuv420p -c:v libx264 -crf 14 -preset fast ${FD}.mp4`);
await ctx.close(); await b.close(); console.log(scene,mode,marks); process.exit(0);})();
