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
const pres=await p.evaluate(()=>agents.map(a=>({n:a.name,p:a.el.dataset.presence,ghost:!!a.el.querySelector('.figure [stroke-dasharray]'),chip:(document.querySelector('#floor-workers [data-worker="'+a.id+'"] small')||{}).textContent||'',kind:a.el.dataset.kind,x:a.x,y:a.y})));
const P=Object.fromEntries(pres.map(a=>[a.n,a]));
ok('no Ledger on floor or roster',!pres.some(a=>/ledger/i.test(a.n))&&!/ledger/i.test(await p.evaluate(()=>document.querySelector('#v-office').innerText)),pres.map(a=>a.n).join(', '));
ok('presence: Scout = Reconnect needed (solid figure, not ghost, not connected)',P.Scout.p==='reconnect'&&!P.Scout.ghost&&P.Scout.chip==='Reconnect needed',JSON.stringify(P.Scout));
ok('presence: CEO = Prepared ghost in arrivals',P.CEO.p==='prepared'&&P.CEO.ghost&&P.CEO.chip==='Not connected yet',JSON.stringify(P.CEO));
ok('presence: Grok Bot / Instinct / Muse = Connected',['Grok Bot','Instinct','Muse'].every(n=>P[n].p==='connected'&&!P[n].ghost));
/* ---- round 2: quiet floor ---- */
const quiet=await p.evaluate(()=>{const vis=e=>e&&e.offsetParent!==null&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0;
 const stray=[...document.querySelectorAll('#floor .bub,#floor .tok,#floor .tag2,#floor .bdg,#floor .worker-label')].filter(vis).map(e=>e.className+':'+e.textContent);
 const fl=document.querySelector('#floor-label');const txt=[...document.querySelectorAll('#chl .ch')].map(c=>{const k=c.cloneNode(true);k.querySelectorAll('svg,[hidden]').forEach(x=>x.remove());return k.textContent.trim()}).filter(Boolean);
 const scout=agents.find(a=>a.name==='Scout').el,grok=agents.find(a=>a.name==='Grok Bot').el;
 return {stray,label:fl?getComputedStyle(fl).display:'none',txt,scout:scout.dataset.kind+'|'+!!scout.querySelector('.sdot svg')+'|'+vis(scout.querySelector('.sdot')),grok:grok.dataset.kind+'|'+grok.classList.contains('at-island')+'|'+getComputedStyle(grok.querySelector('.sdot'),'::after').content,dots:agents.every(a=>vis(a.el.querySelector('.sdot')))}});
ok('quiet by default: no bubble/token/tag/name-card text on the floor, no label until hover',!quiet.stray.length&&quiet.label==='none'&&!quiet.txt.length,JSON.stringify(quiet));
ok('every figure has a status dot; Scout shows the reconnect badge; Grok Bot at the island shows "!"',quiet.dots&&quiet.scout==='reconnect|true|true'&&/^needs\|true\|"!"/.test(quiet.grok),quiet.scout+' / '+quiet.grok);
const hs=await p.evaluate(()=>{const base=agents.find(a=>a.name==='Instinct');const f=(now,st,x)=>humanStatus(Object.assign({},base,{now,st:st||'working',_ambient:false},x||{}));return {
 a:f('Working: Name research for Black Box'),b:f('Ambient: lounge break','idle',{_ambient:true}),c:f('Working: web.fetch'),d:f('Waiting for approval: notes.write','needs'),e:f('Compare competitor pricing pages and summarize the three cheapest'),g:f('Standing by','idle'),h:f('Task still open; no recent update: Q4 brief','idle'),i:f('Working: Writing the Q4 brief')}});
ok('human copy mapping (prefixes stripped, <= 4 words)',hs.a==='Name research'&&hs.b==='On a break'&&hs.c==='Reading the web'&&hs.d==='Needs you'&&hs.e==='Compare competitor pricing pages…'&&hs.g==='Available'&&hs.h==='No recent update'&&hs.i==='Writing Q4 brief'&&Object.values(hs).every(v=>v.replace('…','').split(' ').length<=4),JSON.stringify(hs));
await p.evaluate(()=>agents.find(a=>a.name==='Instinct').el.focus());await p.waitForTimeout(250);
const hov=await p.evaluate(()=>{const l=document.querySelector('#floor-label');const r=l.getBoundingClientRect();const hit=[...document.querySelectorAll('#floor .zone-sign,#floor-approval')].filter(e=>e.offsetParent).map(e=>e.getBoundingClientRect()).filter(o=>o.left<r.right&&r.left<o.right&&o.top<r.bottom&&r.top<o.bottom).length;return {d:getComputedStyle(l).display,t:l.innerText.replace(/\n/g,' | '),hit,n:document.querySelectorAll('#floor-label').length}});
ok('keyboard focus shows ONE label (name + short status), not covering signs or the island card',hov.d==='block'&&/^Instinct \| /.test(hov.t)&&hov.hit===0&&hov.n===1,JSON.stringify(hov));
await shot(p,'r2-hover-label-desktop');
await p.evaluate(()=>document.activeElement.blur());await p.waitForTimeout(150);
ok('label hides again on blur',await p.evaluate(()=>getComputedStyle(document.querySelector('#floor-label')).display==='none'));
const rooms=await p.evaluate(()=>[...document.querySelectorAll('#floor .zone-sign[data-room]')].map(z=>z.dataset.room+'='+z.innerText.trim().split('\n')[0]).join(', '));
ok('room signs come from the room-type catalog (backend keys unchanged)',rooms.includes('finance=Library')&&rooms.includes('ops=Workshop')&&rooms.includes('marketing=Studio')&&rooms.includes('sales=Mailroom'),rooms);
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
await p.evaluate(()=>location.hash='#work');await p.waitForTimeout(700);await p.click('#strip [data-d="deny"]');await p.waitForTimeout(700);
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
const rw=await p.evaluate(()=>{const b=document.querySelector('#floor-workers [data-worker="n1"]');return b?b.dataset.kind+'|'+b.querySelector('small').textContent:null});
ok('roster shows the new bot as Waiting to connect while step 2 is open',rw==='waiting|Waiting to connect',rw);
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

/* ---------- R3. calm top bar, one request surface, phone sheet ---------- */
reset();[c,p]=await mk(1440,900,{reducedMotion:'reduce'});await p.goto(BASE+'/index.html#office',{waitUntil:'networkidle'});await p.waitForTimeout(1600);
const tb=await p.evaluate(()=>{const t=document.querySelector('.top').getBoundingClientRect(),s=document.querySelector('#sum');return {h:Math.round(t.height),chip:(s.querySelector('.needs-chip')||{}).textContent||'',sr:(s.querySelector('.sr-only')||{}).textContent||'',today:(document.querySelector('#acct-today')||{}).textContent||'',strip:getComputedStyle(document.querySelector('#strip')).display,connect:document.querySelector('#addb').innerText.trim(),emer:document.querySelector('#emer').getAttribute('aria-label')}});
ok('R3 top bar: one row, single "Needs you" chip, spend kept for screen readers + account menu, short Connect, labelled emergency',tb.h<=64&&/^Needs you\s*1$/.test(tb.chip)&&/spent today/.test(tb.sr)&&/spent/.test(tb.today)&&/Connect$/.test(tb.connect)&&tb.emer==='Emergency controls',JSON.stringify(tb));
ok('R3 HQ shows one request surface (island card, strip hidden)',tb.strip==='none'&&await p.evaluate(()=>getComputedStyle(document.querySelector('#floor-approval')).display!=='none'));
await p.click('#sum .needs-chip');await p.waitForTimeout(250);
ok('R3 Needs-you chip on HQ focuses Approve on the island card (stays on HQ)',await p.evaluate(()=>location.hash==='#office'&&document.activeElement&&document.activeElement.dataset.d==='approve'));
await p.evaluate(()=>location.hash='#work');await p.waitForTimeout(700);
ok('R3 non-HQ view keeps a request surface (strip with [data-r])',await p.evaluate(()=>getComputedStyle(document.querySelector('#strip')).display!=='none'&&!!document.querySelector('#strip [data-r][data-d="approve"]')));
await shot(p,'r3-check-work-desktop');await c.close();
{reset();[c,p]=await mk(1440,900);await p.goto(BASE+'/index.html#office',{waitUntil:'networkidle'});await p.waitForTimeout(1500);
 const dp=await p.evaluate(()=>{const bc=document.querySelector('#chl .pv-prop[data-kind=bookcase]');if(!bc)return {err:'no bookcase'};const a=agents[0];a._walkEpoch=(a._walkEpoch||0)+9;const wx=+bc.dataset.wx,wy=+bc.dataset.wy;const [x,y]=HQ_FLOOR.W2P(wx-0.3,wy+1.4);setPos(a,x,y,0);
  const same=bc.parentElement===a.el.parentElement;const behind=+a.el.style.zIndex<+bc.style.zIndex;const [x2,y2]=HQ_FLOOR.W2P(wx+4,wy+8);setPos(a,x2,y2,0);const front=+a.el.style.zIndex>+bc.style.zIndex;
  const props=document.querySelectorAll('#chl .pv-prop').length;return {same,behind,front,props}});
 ok('R3.2 depth: props share the figures\' layer; a figure behind a bookcase sorts under it, in front sorts over it',dp.same&&dp.behind&&dp.front&&dp.props>10,JSON.stringify(dp));
 const wk=await p.evaluate(()=>{const a=agents[0];const d=document.createElement('div');d.innerHTML=figureSVG(a,{pose:'walk'});document.querySelector('#chl').appendChild(d);const f=d.querySelector('.figure');const g=s=>{const e=f&&f.querySelector(s);if(!e)return null;const cs=getComputedStyle(e);return cs.animationName+'@'+cs.animationDelay+'/'+cs.animationTimingFunction};return {ll:g('.leg.l'),lr:g('.leg.r'),al:g('.arm.l'),ar:g('.arm.r'),ease:getComputedStyle(a.el).transitionTimingFunction}});
 ok('R3.2 walk: legs alternate, arms alternate opposite, eased (no step frames)',!!wk.ll&&wk.ll!==wk.lr&&wk.al!==wk.ar&&/swing/.test(wk.al)&&!/steps/.test(wk.ll+wk.al),JSON.stringify(wk));
 await c.close()}
for(const w of [390,320]){reset();[c,p]=await mk(w,w===390?844:640,{reducedMotion:'reduce'});await p.goto(BASE+'/index.html#office',{waitUntil:'networkidle'});await p.waitForTimeout(1600);
 const st=await p.evaluate(()=>{const fw=document.querySelector('#floor').parentElement,fr=fw.getBoundingClientRect(),fl=document.querySelector('#floor').getBoundingClientRect(),rh=document.querySelector('#floor-workers .fw-h').getBoundingClientRect(),sh=document.querySelector('#floor-approval').getBoundingClientRect();const isl=document.querySelector('.zone-sign.appr').getBoundingClientRect(),nb=document.querySelector('#nav').getBoundingClientRect().bottom;const figs=agents.map(a=>a.el.querySelector('.avs').getBoundingClientRect());return {top:Math.round(fl.top-nb),under:Math.round(rh.top-fl.bottom),zoom:+(fl.width/fr.width).toFixed(2),scroll:fw.scrollWidth>fw.clientWidth,inView:figs.concat([isl]).every(r=>r.left>=fr.left-2&&r.right<=fr.right+2)}});
 ok(`R3.2 ${w}: floor starts right under the nav (no empty band), roster follows directly, zoomed ~1.3x and pannable, island + all agents in view`,st.top>=-2&&st.top<=12&&st.under>=-2&&st.under<=16&&st.zoom>=1.2&&st.scroll&&st.inView,JSON.stringify(st));
 const hd=await p.evaluate(()=>{const r=id=>document.querySelector(id).getBoundingClientRect();const wm=r('#wm'),ab=r('#addb'),em=r('#emer'),ac=r('.acct>summary'),nv=document.querySelector('#nav');
  const row=[wm,ab,em,ac].every(x=>Math.abs((x.top+x.bottom)/2-(wm.top+wm.bottom)/2)<8&&x.right<=innerWidth);const tap=ab.height>=36&&ab.width>=36&&em.height>=40&&em.width>=40;
  const cut=[...nv.querySelectorAll('a')].filter(a=>{const b=a.getBoundingClientRect(),n=nv.getBoundingClientRect();return b.right>n.right+1}).map(a=>a.innerText);
  const card=document.querySelector('#floor-approval'),body=card.querySelector('.fa-body');return {row,tap,cut,scroll:nv.scrollWidth>nv.clientWidth,fixed:getComputedStyle(card).position,bodyH:Math.round(body.getBoundingClientRect().height),peek:(card.querySelector('.fa-peek')||{}).innerText||'',strip:getComputedStyle(document.querySelector('#strip')).display,roster:document.querySelectorAll('#floor-workers button.fw').length&&[...document.querySelectorAll('#floor-workers button.fw')].every(b=>b.offsetParent!==null)}});
 ok(`R3 ${w}: compact header in one row (mark, Connect, Emergency, account), >=40px targets`,hd.row&&hd.tap,JSON.stringify(hd));
 ok(`R3 ${w}: nav ${w===390?'fits with no cut-off label':'scrolls (no wrap)'}`,w===390?!hd.cut.length&&!hd.scroll:hd.scroll||!hd.cut.length,JSON.stringify(hd.cut));
 ok(`R3 ${w}: request is a collapsed bottom sheet ("… · Review"), no strip, roster open under the floor`,hd.fixed==='fixed'&&hd.bodyH<=2&&/Review$/.test(hd.peek)&&hd.strip==='none'&&hd.roster,JSON.stringify(hd));
 if(w===390){await p.click('#floor-approval .fa-peek');await p.waitForTimeout(450);
  const op=await p.evaluate(()=>{const c=document.querySelector('#floor-approval'),a=c.querySelector('[data-d="approve"]'),r=a.getBoundingClientRect();return {open:c.classList.contains('open'),exp:c.querySelector('.fa-peek').getAttribute('aria-expanded'),vis:r.height>=44&&r.bottom<=innerHeight,focus:document.activeElement===a}});
  ok('R3 390: sheet expands to Approve once / Deny (44px), focus moves to Approve',op.open&&op.exp==='true'&&op.vis&&op.focus,JSON.stringify(op));
  await p.keyboard.press('Escape');await p.waitForTimeout(300);ok('R3 390: Escape collapses the sheet',await p.evaluate(()=>!document.querySelector('#floor-approval').classList.contains('open')));
  await p.click('#floor-approval .fa-peek');await p.waitForTimeout(400);await p.click('#floor-approval [data-d="approve"]');await p.waitForTimeout(800);
  ok('R3 390: Approve once from the sheet -> POST /api/requests/r1/approve',posted(/^\/api\/requests\/r1\/approve$/,'POST').length>=1);
  await p.focus('#floor-workers .fw-h');await p.keyboard.press('Enter');await p.waitForTimeout(250);const col=await p.evaluate(()=>document.querySelector('#floor-workers .fw-h').getAttribute('aria-expanded')==='false');await p.keyboard.press('Enter');await p.waitForTimeout(250);
  ok('R3 390: roster header is a keyboard toggle (Enter collapses, Enter expands)',col&&await p.evaluate(()=>document.querySelector('#floor-workers .fw-h').getAttribute('aria-expanded')==='true'&&[...document.querySelectorAll('#floor-workers button.fw')].some(b=>b.offsetParent!==null)));}
 await c.close()}

/* ---------- 6. widths: Emergency reachable, floor fits, screenshots ---------- */
for(const [w,h] of [[1440,900],[1024,768],[768,1024],[390,844],[320,640]]){reset();[c,p]=await mk(w,h,{reducedMotion:'reduce'});await p.goto(BASE+'/index.html#office',{waitUntil:'networkidle'});await p.waitForTimeout(1400);
 const m=await p.evaluate(()=>{const e=document.querySelector('#emer'),r=e.getBoundingClientRect(),f=document.querySelector('#floor').getBoundingClientRect(),top=document.querySelector('.top').getBoundingClientRect();return {vis:r.width>0&&r.right<=innerWidth&&r.bottom<=innerHeight&&getComputedStyle(e).visibility!=='hidden',fw:Math.round(document.querySelector('#floor').parentElement.getBoundingClientRect().width),vw:innerWidth,topH:Math.round(top.height),hs:document.documentElement.scrollWidth>innerWidth}});
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
