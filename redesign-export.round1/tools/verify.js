// End-to-end verification of the export against a mocked API. Usage: node verify.js  (server: python3 -m http.server 8771 --directory ../public)
const { chromium } = require('/workspace/blackbox/shot/node_modules/playwright-core');
const fs=require('fs');const {S,mock,reset}=require('./mock.js');
const BASE='http://127.0.0.1:8771',OUT='/workspace/blackbox/export/shots/';fs.mkdirSync(OUT,{recursive:true});
const R=[];const ok=(name,pass,detail)=>{R.push({name,pass:!!pass,detail:detail||''});console.log((pass?'PASS ':'FAIL ')+name+(detail?' :: '+detail:''))};
const ERR=[];
(async()=>{
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
async function mk(w,h,extra){const mob=w<500;const c=await b.newContext(Object.assign({viewport:{width:w,height:h},deviceScaleFactor:mob?2:1,isMobile:mob,hasTouch:mob},extra||{}));
 await c.grantPermissions(['clipboard-read','clipboard-write'],{origin:BASE});const p=await c.newPage();
 p.on('pageerror',e=>ERR.push('pageerror '+e.message));p.on('console',m=>{if(m.type()==='error')ERR.push('console '+m.text())});p.on('dialog',d=>d.accept());p.on('response',r=>{if(r.status()>=400)ERR.push('http '+r.status()+' '+r.url())});p.on('requestfailed',r=>ERR.push('reqfailed '+r.url()+' '+(r.failure()||{}).errorText));await mock(p);return [c,p]}
const shot=async(p,n,o)=>{await p.screenshot(Object.assign({path:OUT+n+'.png'},o||{}))};
const hash=async(p,h,w)=>{await p.evaluate(h=>location.hash=h,h);await p.waitForTimeout(w||900)};
const posted=(re,m)=>S.log.filter(x=>(m?x.m===m:true)&&re.test(x.p));
let c,p;

/* ---------- 1. routes + floor + presence (desktop, reduced motion for determinism) ---------- */
reset();[c,p]=await mk(1440,900,{reducedMotion:'reduce'});
await p.goto(BASE+'/index.html#office',{waitUntil:'networkidle'});await p.waitForTimeout(1800);
const routes={office:'v-office',work:'v-work',approvals:'v-approvals',stubs:'v-stubs',policies:'v-policies',receipts:'v-work',money:'v-money',cards:'v-cards'};
let rbad=[];for(const [k,v] of Object.entries(routes)){await hash(p,'#'+k,700);const on=await p.evaluate(()=>[...document.querySelectorAll('.view.on')].map(e=>e.id));if(on.length!==1||on[0]!==v)rbad.push(k+'->'+on.join('|'))}
ok('route switching (8 route keys incl. receipts->work)',!rbad.length,rbad.join(', ')||'all views toggle exactly one .view.on');
await hash(p,'#office',900);
const pres=await p.evaluate(()=>agents.map(a=>({n:a.name,p:a.el.dataset.presence,ghost:!!a.el.querySelector('.figure [stroke-dasharray]'),chip:(document.querySelector('#floor-workers [data-worker="'+a.id+'"] .pres')||{}).textContent||'',x:a.x,y:a.y})));
const P=Object.fromEntries(pres.map(a=>[a.n,a]));
ok('no Ledger on floor or roster',!pres.some(a=>/ledger/i.test(a.n))&&!/ledger/i.test(await p.evaluate(()=>document.querySelector('#v-office').innerText)),pres.map(a=>a.n).join(', '));
ok('presence: Scout = Reconnect needed (solid figure, not ghost, not connected)',P.Scout.p==='reconnect'&&!P.Scout.ghost&&P.Scout.chip==='Reconnect needed',JSON.stringify(P.Scout));
ok('presence: CEO = Prepared ghost in arrivals',P.CEO.p==='prepared'&&P.CEO.ghost&&P.CEO.chip==='Prepared',JSON.stringify(P.CEO));
ok('presence: Grok Bot / Instinct / Muse = Connected',['Grok Bot','Instinct','Muse'].every(n=>P[n].p==='connected'&&!P[n].ghost));
const lbl=await p.evaluate(()=>{const l=document.querySelector('[data-label="a1"]');return l&&getComputedStyle(l).display+'|'+l.innerText});
ok('Reconnect label always visible on floor',/^block\|Scout/.test(lbl||''),lbl);
await shot(p,'03-hq-floor-desktop');
// floor approval card + A/D hint + approve handler sends data-r/data-d
const card=await p.evaluate(()=>{const c=document.querySelector('#floor-approval');if(!c||c.style.display==='none')return null;const a=c.querySelector('[data-d="approve"]'),d=c.querySelector('[data-d="deny"]');return {r:a.dataset.r,ad:a.dataset.d,dd:d.dataset.d,txt:c.innerText.slice(0,80)}});
ok('approval island card renders with [data-r][data-d] buttons',card&&card.ad==='approve'&&card.dd==='deny',JSON.stringify(card));
await p.click('#floor-approval [data-d="approve"]');await p.waitForTimeout(900);
ok('Approve once -> POST /api/requests/r1/approve',posted(/^\/api\/requests\/r1\/approve$/,'POST').length===1,JSON.stringify(posted(/requests/)));
// drawer + moveRoom
await p.evaluate(()=>openDr('a1'));await p.waitForTimeout(600);
const drs=await p.evaluate(()=>({on:document.querySelector('#dr').classList.contains('on'),pres:(document.querySelector('#dr-presence .pres')||{}).textContent,btn:!!document.querySelector('#dr [data-reconnect="a1"]'),sel:!!document.querySelector('#worker-room')}));
ok('drawer opens with Connection section + Reconnect action',drs.on&&drs.pres==='Reconnect needed'&&drs.btn&&drs.sel,JSON.stringify(drs));
await shot(p,'08-drawer-reconnect-desktop');
await p.selectOption('#worker-room','finance');await p.waitForTimeout(700);
ok('moveRoom -> POST /api/agents/a1/room {room:finance}',posted(/^\/api\/agents\/a1\/room$/,'POST').some(x=>x.body&&x.body.room==='finance'));
await p.keyboard.press('Escape');await p.waitForTimeout(400);
ok('Escape closes drawer',await p.evaluate(()=>!document.querySelector('#dr').classList.contains('on')));
// team
await hash(p,'#stubs',900);
const team=await p.evaluate(()=>[...document.querySelectorAll('.team-row')].map(r=>({p:r.dataset.presence,chip:(r.querySelector('.pres')||{}).textContent,rec:!!r.querySelector('[data-reconnect]')})));
ok('Team rows show presence chips; only Reconnect-needed row has Reconnect',team.length===5&&team.filter(t=>t.rec).length===1&&team.find(t=>t.rec).chip==='Reconnect needed',JSON.stringify(team));
await shot(p,'09-team-desktop');
for(const [n,h] of [['10-work','#work'],['11-needs-you','#approvals'],['12-permissions','#policies'],['13-money','#money']]){await hash(p,h,1100);await shot(p,n+'-desktop')}
// card sandbox
await hash(p,'#cards',1300);await shot(p,'14-card-sandbox-desktop');
const gaps=await p.evaluate(()=>[...document.querySelectorAll('#v-cards h3.sbx-h')].map(h=>{const prev=h.previousElementSibling;return Math.round(h.getBoundingClientRect().top-prev.getBoundingClientRect().bottom)}));
ok('card sandbox: tightened gap above Decisions / Synthetic ledger',gaps.length===2&&gaps.every(g=>g<=24),'gaps px '+gaps.join(','));
await p.evaluate(()=>{document.documentElement.style.height='auto';document.body.style.height='auto';document.body.style.overflow='visible';const v=document.querySelector('#v-cards');v.style.overflow='visible';document.querySelector('main').style.flex='none'});await p.waitForTimeout(200);
await shot(p,'14b-card-sandbox-full-desktop',{fullPage:true});await p.reload({waitUntil:'networkidle'});await hash(p,'#cards',1300);
await p.click('#cardpropose');await p.waitForTimeout(700);
await p.click('[data-card="p1"][data-decision="approve"]');await p.waitForTimeout(700);
await p.click('[data-cap="a2"]');await p.waitForTimeout(700);
await p.click('#cardkill');await p.waitForTimeout(700);
const cp=S.cardPosts.map(x=>x.p);
ok('card sandbox actions -> proposals / p1 approve / cap / kill',posted(/^\/api\/cards\/proposals$/).some(x=>x.body.amountCents===7000)&&cp.includes('/api/cards/p1/approve')&&S.cardPosts.some(x=>x.p==='/api/cards/control'&&x.body.botId==='a2')&&S.cardPosts.some(x=>x.p==='/api/cards/control'&&x.body.killed===true),cp.join(' '));
// reduced motion
await hash(p,'#office',900);
const rm=await p.evaluate(()=>({walking:agents.filter(a=>a.el.classList.contains('walk')).length,dur:getComputedStyle(document.querySelector('.sh i')||document.body).animationDuration,mq:matchMedia('(prefers-reduced-motion: reduce)').matches}));
ok('reduced motion: no walking, animations ~0',rm.mq&&rm.walking===0&&/^(0s|1e-06s|0\.001ms|1e-05s)$|^0/.test(rm.dur),JSON.stringify(rm));
await c.close();

/* ---------- 2. strip deny + A/D keys + keyboard + dialogs ---------- */
reset();[c,p]=await mk(1440,900,{reducedMotion:'reduce'});
await p.goto(BASE+'/index.html#office',{waitUntil:'networkidle'});await p.waitForTimeout(1600);
await p.keyboard.press('d');await p.waitForTimeout(800);
ok('D key at island -> POST /api/requests/r1/deny',posted(/^\/api\/requests\/r1\/deny$/,'POST').length===1);
await p.reload({waitUntil:'networkidle'});S.decisions=[];await p.waitForTimeout(1600);
await p.click('#strip [data-d="deny"]');await p.waitForTimeout(700);
ok('strip Deny -> POST /api/requests/r1/deny (delegate on [data-r])',posted(/^\/api\/requests\/r1\/deny$/,'POST').length>=2);
S.decisions=[];await p.reload({waitUntil:'networkidle'});await p.waitForTimeout(1200);
await p.keyboard.press('Tab');const f1=await p.evaluate(()=>document.activeElement.className+'|'+getComputedStyle(document.activeElement).top);
ok('first Tab = skip link (visible on focus)',/skip-link/.test(f1),f1);
let seen=[];for(let i=0;i<14;i++){await p.keyboard.press('Tab');seen.push(await p.evaluate(()=>{const e=document.activeElement;return (e.id||e.tagName)+'|'+getComputedStyle(e).outlineStyle}))}
ok('keyboard reaches nav, Connect, Emergency, account with visible outline',['addb','emer','acctbtn'].every(id=>seen.some(s=>s.startsWith(id+'|')))&&seen.filter(s=>/\|solid$/.test(s)).length>=8,seen.join(' '));
await p.focus('#emer');await shot(p,'15-emergency-hover-label-desktop',{clip:{x:1040,y:0,width:400,height:110}});
await p.keyboard.press('Enter');await p.waitForTimeout(400);
ok('Emergency icon opens #emodal, focus moves inside',await p.evaluate(()=>document.querySelector('#emodal').classList.contains('on')&&document.querySelector('#emodal').contains(document.activeElement)));
await shot(p,'16-emergency-dialog-desktop');
await p.keyboard.press('Escape');await p.waitForTimeout(300);
ok('Escape closes #emodal and restores focus to #emer',await p.evaluate(()=>!document.querySelector('#emodal').classList.contains('on')&&document.activeElement.id==='emer'));
await p.click('#acctbtn');await p.waitForTimeout(200);
const acct=await p.evaluate(()=>({open:document.querySelector('#acct').open,so:!!document.querySelector('#acctmenu #fmso'),txt:document.querySelector('#fmso').textContent,al:document.querySelector('#fmso').getAttribute('aria-label'),mail:document.querySelector('#acctmail').textContent}));
ok('account menu holds Sign out (#fmso) + email',acct.open&&acct.so&&acct.txt==='Sign out'&&/owner@example.com/.test(acct.al),JSON.stringify(acct));
await shot(p,'17-account-menu-desktop');await p.keyboard.press('Escape');

/* connect flow */
await p.click('#addb');await p.waitForTimeout(400);
ok('connect step 0: three [data-link] bots, focus in dialog',await p.evaluate(()=>document.querySelectorAll('#modal [data-link]').length===3&&document.querySelector('#modal').contains(document.activeElement)));
await shot(p,'04-connect-step0-desktop');
for(let i=0;i<25;i++)await p.keyboard.press('Tab');
ok('focus trapped inside connect dialog',await p.evaluate(()=>document.querySelector('#modal').contains(document.activeElement)));
await p.click('[data-link="grok"]');await p.waitForTimeout(300);await shot(p,'05-connect-step1-desktop');
await p.click('#linkcreate');await p.waitForTimeout(200);
ok('step 1 validation message',await p.evaluate(()=>document.querySelector('#linkerr').textContent==='Enter the name of your existing bot.'));
await p.fill('#linkname','Atlas');await p.fill('#linkrole','Operations');await p.click('#linkcreate');await p.waitForTimeout(1500);
ok('step 1 -> POST /api/connect {provider:grok,connectionMode:existing}',S.connectPosts.some(x=>x.provider==='grok'&&x.name==='Atlas'&&x.connectionMode==='existing'));
const s2=await p.evaluate(()=>{const c=document.querySelector('#copysetup'),i=document.querySelector('#cursorinstall'),rc=c.getBoundingClientRect(),ri=i.getBoundingClientRect();const href=i.getAttribute('href');const u=new URL(href.replace('cursor://','https://'));return {order:!!(c.compareDocumentPosition(i)&Node.DOCUMENT_POSITION_FOLLOWING),cw:Math.round(rc.width),iw:Math.round(ri.width),ch:Math.round(rc.height),ih:Math.round(ri.height),href,name:u.searchParams.get('name'),cfg:atob(u.searchParams.get('config')),al:i.getAttribute('aria-label'),st:document.querySelector('#linkstatus').dataset.presence,stt:document.querySelector('#linkstatus').innerText,role:document.querySelector('#linkstatus').getAttribute('role'),pri:c.classList.contains('pri')}});
ok('step 2: Copy setup message (primary, first) + Install in Cursor, equal size',s2.order&&s2.pri&&Math.abs(s2.cw-s2.iw)<=2&&s2.ch===s2.ih,JSON.stringify({cw:s2.cw,iw:s2.iw,ch:s2.ch,ih:s2.ih}));
ok('deeplink format preserved from PR #3',s2.href.startsWith('cursor://anysphere.cursor-deeplink/mcp/install?name=Black%20Box&config=')&&JSON.parse(s2.cfg).url===BASE+'/api/mcp'&&s2.al==='Install Black Box MCP connector in Cursor',s2.href);
ok('#linkstatus = Waiting for bot (role=status)',s2.st==='waiting'&&s2.role==='status'&&/Waiting for your bot\. No live connection confirmed yet\./.test(s2.stt),s2.stt);
const rw=await p.evaluate(()=>(document.querySelector('#floor-workers [data-worker="n1"] .pres')||{}).textContent);
ok('roster shows the new bot as Waiting for bot while step 2 is open',rw==='Waiting for bot',rw);
await shot(p,'06-connect-step2-waiting-desktop');
await p.click('#copysetup');await p.waitForTimeout(400);
const clip=await p.evaluate(async()=>{try{return await navigator.clipboard.readText()}catch(e){const f=document.querySelector('#setupfallback');return 'FALLBACK:'+(f&&f.value)}});
ok('Copy setup message copies the shipped 6-paragraph message',/^(FALLBACK:)?Connect my existing Grok Bot assistant, Atlas, to my Black Box workspace\./.test(clip)&&clip.split('\n\n').length===6&&/ask me to reconnect\.$/.test(clip),clip.slice(0,90));
S.connected=true;await p.waitForTimeout(5200);
const s3=await p.evaluate(()=>({p:document.querySelector('#linkstatus').dataset.presence,t:document.querySelector('#linkstatus').innerText,r:(document.querySelector('#floor-workers [data-worker="n1"]')||{}).className}));
ok('poll flips #linkstatus to Connected only after a real report',s3.p==='connected'&&/^Connected: Atlas/.test(s3.t),JSON.stringify(s3));
await p.evaluate(()=>document.querySelector('#linkstatus').scrollIntoView({block:'center'}));await shot(p,'06b-connect-step2-connected-desktop');
await p.keyboard.press('Escape');await p.waitForTimeout(300);
ok('Escape closes connect dialog (via #linkclose, poll cleared) and restores focus',await p.evaluate(()=>!document.querySelector('#modal').classList.contains('on')&&window.__linkWaiting==null));
// reconnect flow from Team
await hash(p,'#stubs',900);await p.click('[data-reconnect="a1"]');await p.waitForTimeout(500);
const rc=await p.evaluate(()=>({h:document.querySelector('#cw-title').textContent,st:document.querySelector('#linkstatus').dataset.presence,note:!!document.querySelector('#reconnectnote'),both:!!document.querySelector('#copysetup')&&!!document.querySelector('#cursorinstall')}));
ok('Reconnect reopens connect step 2 for the existing bot (no POST /api/connect)',rc.h==='Reconnect Scout'&&rc.st==='reconnect'&&rc.note&&rc.both&&S.connectPosts.length===1,JSON.stringify(rc));
await shot(p,'07-reconnect-dialog-desktop');
S.reconnected=true;await p.waitForTimeout(5200);
ok('reconnect clears only when grant is active again',await p.evaluate(()=>document.querySelector('#linkstatus').dataset.presence==='connected'));
await p.click('#cwx');await c.close();

/* ---------- 3. sign-in bridge ---------- */
reset();S.authed=false;[c,p]=await mk(1440,900);
await p.goto(BASE+'/index.html#stubs',{waitUntil:'networkidle'});await p.waitForTimeout(1000);
const au=await p.evaluate(()=>({on:document.querySelector('#fmauth').classList.contains('on'),f:document.activeElement.id,ids:['aue','aup','auc','aur','aug','aum','aucl','aus'].every(i=>document.getElementById(i))}));
ok('401 -> sign-in overlay (#fmauth) with all hooks, focus on email',au.on&&au.ids&&au.f==='aue',JSON.stringify(au));
await shot(p,'02-signin-desktop');
await p.click('#aum');await p.waitForTimeout(150);
ok('Create account toggle keeps shipped copy',await p.evaluate(()=>document.querySelector('#aus').textContent==='Black Box lets you decide what your AI employees can do, and keeps a receipt of everything they do.'&&document.querySelector('#aug').textContent==='Create account'));
await p.click('#aum');await p.fill('#aue','owner@example.com');await p.fill('#aup','password123');await p.click('#aug');await p.waitForTimeout(1500);
ok('sign in -> overlay closes and lands on the HQ floor',await p.evaluate(()=>!document.querySelector('#fmauth').classList.contains('on')&&location.hash==='#office'&&document.querySelector('#v-office').classList.contains('on')));
await c.close();

/* ---------- 4. OAuth page states ---------- */
reset();[c,p]=await mk(1440,900);
const oa=async()=>{await p.goto(BASE+'/oauth/authorize?client_id=demo&redirect_uri=https%3A%2F%2Fgrok.com%2Fcb',{waitUntil:'networkidle'});await p.waitForTimeout(600)};
await oa();const ctext=await p.evaluate(()=>document.querySelector('#content').innerText);
const want=['Grok Bot (MCP client) wants to connect one bot to your workspace.',"This connection can report activity and call Black Box tools under this bot's permissions. It cannot import your provider account, read other bots, or move money. This authorization can renew automatically in clients that support OAuth refresh. It stays available until you revoke this bot in Black Box.",'Existing bot','Return address: https://grok.com','Authorize connection','If your bot is missing, open HQ and start Connect AI Employee first.'];
ok('OAuth consent copy verbatim',want.every(w=>ctext.includes(w))&&await p.evaluate(()=>document.title==='Connect to Black Box'&&document.querySelector('h1').textContent==='Connect to Black Box'),ctext.replace(/\n/g,' / ').slice(0,160));
await shot(p,'18-oauth-consent-desktop');
await p.selectOption('#bot','a1');await p.click('#allow');await p.waitForTimeout(600);
ok('Authorize -> POST /oauth/consent {csrf,agentId}',S.log.some(x=>x.p==='/oauth/consent'||false)||S.consentPosts.length||posted(/consent/).length,'');
S.oauthAuthed=false;await oa();
ok('OAuth sign-in state copy verbatim',await p.evaluate(()=>document.querySelector('#content p').textContent==='Sign into your Black Box workspace. Your bot stays signed into its own provider.'&&!!document.querySelector('#login #email')&&!!document.querySelector('#login #password')));
await shot(p,'19-oauth-signin-desktop');
await p.fill('#email','owner@example.com');await p.fill('#password','password123');await p.click('#login button');await p.waitForTimeout(800);
ok('OAuth sign in -> consent',await p.evaluate(()=>!!document.querySelector('#allow')));
S.oauthMode='error';await oa();ok('OAuth error state shows server text',await p.evaluate(()=>document.querySelector('#content').textContent==='This sign-in link expired. Reconnect from your bot.'));await shot(p,'20-oauth-error-desktop');
S.oauthMode='fail';await oa();ok('OAuth load failure copy verbatim',await p.evaluate(()=>document.querySelector('#error').textContent==='Could not load sign-in. Reconnect from your bot.'));
await c.close();

/* ---------- 5. one-line rebrand proof ---------- */
reset();[c,p]=await mk(1440,900,{reducedMotion:'reduce'});await p.addInitScript(()=>{window.BRAND={name:'Acme Ops'}});
await p.goto(BASE+'/index.html#office',{waitUntil:'networkidle'});await p.waitForTimeout(1200);
await p.click('#addb');await p.click('[data-link="muse"]');await p.fill('#linkname','Muse 2');await p.click('#linkcreate');await p.waitForTimeout(1300);
const rb=await p.evaluate(()=>({t:document.title,wm:document.querySelector('.top .brand').textContent,body:document.body.innerText,href:document.querySelector('#cursorinstall').getAttribute('href'),al:document.querySelector('#cursorinstall').getAttribute('aria-label')}));
ok('rebrand: app title, wordmark, connect copy, deeplink name, aria-label all follow BRAND.name',rb.t.startsWith('Acme Ops')&&rb.wm==='ACME OPS'&&!/Black Box|BLACK BOX/i.test(rb.body)&&rb.href.includes('name=Acme%20Ops')&&rb.al==='Install Acme Ops MCP connector in Cursor',JSON.stringify({t:rb.t,wm:rb.wm,leak:(rb.body.match(/.{30}black box.{10}/i)||[''])[0]}));
await p.goto(BASE+'/oauth/authorize?x=1',{waitUntil:'networkidle'});await p.waitForTimeout(500);
ok('rebrand: OAuth page follows BRAND.name',await p.evaluate(()=>document.title==='Connect to Acme Ops'&&!/Black Box/.test(document.body.innerText)&&/Acme Ops tools/.test(document.body.innerText)));
await c.close();

/* ---------- 6. widths: Emergency reachable, floor fits, screenshots ---------- */
for(const [w,h] of [[1440,900],[1024,768],[768,1024],[390,844],[320,640]]){reset();[c,p]=await mk(w,h,{reducedMotion:'reduce'});await p.goto(BASE+'/index.html#office',{waitUntil:'networkidle'});await p.waitForTimeout(1400);
 const m=await p.evaluate(()=>{const e=document.querySelector('#emer'),r=e.getBoundingClientRect(),f=document.querySelector('#floor').getBoundingClientRect(),top=document.querySelector('.top').getBoundingClientRect();return {vis:r.width>0&&r.right<=innerWidth&&r.bottom<=innerHeight&&getComputedStyle(e).visibility!=='hidden',fw:Math.round(f.width),vw:innerWidth,topH:Math.round(top.height),hs:document.documentElement.scrollWidth>innerWidth}});
 ok(`width ${w}: Emergency visible, no horizontal page scroll, floor ${'<='} viewport`,m.vis&&!m.hs&&m.fw<=m.vw,JSON.stringify(m));
 if(w===768){await shot(p,'03c-hq-floor-768')}if(w===1024){await shot(p,'03d-hq-floor-1024')}await c.close()}

/* ---------- 7. mobile 390 screenshot set ---------- */
reset();[c,p]=await mk(390,844,{reducedMotion:'reduce'});await p.goto(BASE+'/index.html#office',{waitUntil:'networkidle'});await p.waitForTimeout(1500);
await shot(p,'03-hq-floor-390');
await p.evaluate(()=>document.querySelector('#v-office').scrollTop=9999);await p.waitForTimeout(200);await shot(p,'03b-hq-roster-390');
for(const [n,h] of [['09-team','#stubs'],['10-work','#work'],['11-needs-you','#approvals'],['12-permissions','#policies'],['13-money','#money'],['14-card-sandbox','#cards']]){await hash(p,h,1100);await shot(p,n+'-390')}
await hash(p,'#office',700);await p.evaluate(()=>openDr('a1'));await p.waitForTimeout(500);await shot(p,'08-drawer-reconnect-390');await p.keyboard.press('Escape');
await p.click('#emer');await p.waitForTimeout(300);await shot(p,'16-emergency-dialog-390');await p.keyboard.press('Escape');
await p.click('#addb');await p.waitForTimeout(300);await shot(p,'04-connect-step0-390');await p.click('[data-link="instinct"]');await p.waitForTimeout(200);await shot(p,'05-connect-step1-390');
await p.fill('#linkname','Atlas');await p.click('#linkcreate');await p.waitForTimeout(1300);await shot(p,'06-connect-step2-waiting-390');
await p.evaluate(()=>{const b=document.querySelector('#modal .box');b.scrollTop=b.scrollHeight});await p.waitForTimeout(150);await shot(p,'06c-connect-step2-bottom-390');
await p.click('#cwx');await hash(p,'#stubs',800);await p.click('[data-reconnect="a1"]');await p.waitForTimeout(400);await shot(p,'07-reconnect-dialog-390');
await c.close();
reset();S.authed=false;[c,p]=await mk(390,844);await p.goto(BASE+'/index.html',{waitUntil:'networkidle'});await p.waitForTimeout(900);await shot(p,'02-signin-390');await c.close();
reset();[c,p]=await mk(390,844);await p.goto(BASE+'/oauth/authorize?x=1',{waitUntil:'networkidle'});await p.waitForTimeout(600);await shot(p,'18-oauth-consent-390');S.oauthAuthed=false;await p.reload({waitUntil:'networkidle'});await p.waitForTimeout(500);await shot(p,'19-oauth-signin-390');await c.close();
/* marketing */
for(const [w,h,n] of [[1440,900,'01-marketing-desktop'],[390,844,'01-marketing-390']]){[c,p]=await mk(w,h);await p.route('**/__mk',r=>r.fulfill({path:'/workspace/blackbox/export/marketing/index.html',contentType:'text/html'}));await p.goto(BASE+'/__mk',{waitUntil:'networkidle'});await p.waitForTimeout(600);await shot(p,n,{fullPage:true});
 if(w===1440)ok('marketing: Sign in / Open your HQ route via BRAND.appUrl, title tokenized',await p.evaluate(()=>[...document.querySelectorAll('[data-brand-href="appUrl"]')].length===5&&document.title.startsWith('Black Box')&&/Sign in/.test(document.querySelector('header').innerText)));await c.close()}

const errs=ERR.filter(e=>!/fonts\.(googleapis|gstatic)/.test(e)&&!/status of 401|http 401 .*\/api\/|Failed to load resource: net::ERR_FAILED|reqfailed .*(oauth\/context|grok\.com)/.test(e));
ok('no console errors / page errors',errs.length===0,errs.slice(0,6).join(' || '));
fs.writeFileSync(OUT+'../tools/verify-results.json',JSON.stringify({at:new Date().toString(),results:R,errors:ERR},null,1));
console.log(`\n${R.filter(r=>r.pass).length}/${R.length} passed`);await b.close()})().catch(e=>{console.error('VERIFY CRASH',e);process.exit(1)});
