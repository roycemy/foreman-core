// Round 3 shots. Usage: node r3shots.js (server on 8771)
const { chromium } = require('/workspace/blackbox/shot/node_modules/playwright-core');
const {S,mock,reset}=require('./mock.js');const BASE='http://127.0.0.1:8771',OUT='/workspace/blackbox/export/shots/';
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});const E=[];
async function page(w,h,hash){reset();const mob=w<500;const c=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:mob?2:1,isMobile:mob,hasTouch:mob,reducedMotion:'reduce'});
 const p=await c.newPage();p.on('pageerror',e=>E.push(w+' '+e.message));p.on('console',m=>{if(m.type()==='error'&&!/401/.test(m.text()))E.push(w+' console '+m.text())});await mock(p);await p.goto(BASE+'/index.html'+(hash||'#office'),{waitUntil:'networkidle'});await p.waitForTimeout(2200);return p}
let p=await page(1440,900);await p.screenshot({path:OUT+'r3-after-1440-hq.png'});await p.screenshot({path:OUT+'r3-after-1440-topbar.png',clip:{x:0,y:0,width:1440,height:120}});
await p.evaluate(()=>location.hash='#work');await p.waitForTimeout(900);await p.screenshot({path:OUT+'r3-after-1440-work.png'});
p=await page(390,844);await p.screenshot({path:OUT+'r3-after-390-hq.png'});
await p.click('#floor-approval .fa-peek');await p.waitForTimeout(500);await p.screenshot({path:OUT+'r3-after-390-sheet-open.png'});
await p.click('#floor-approval .fa-peek');await p.waitForTimeout(300);await p.click('#floor-workers .fw-h');await p.waitForTimeout(300);await p.evaluate(()=>document.querySelector('#v-office').scrollTop=9999);await p.waitForTimeout(200);await p.screenshot({path:OUT+'r3-after-390-roster-open.png'});
await p.evaluate(()=>location.hash='#work');await p.waitForTimeout(900);await p.screenshot({path:OUT+'r3-after-390-work.png'});
await p.evaluate(()=>location.hash='#stubs');await p.waitForTimeout(900);await p.screenshot({path:OUT+'r3-after-390-team.png'});
p=await page(320,640);await p.screenshot({path:OUT+'r3-after-320-hq.png'});
p=await page(768,1024);await p.screenshot({path:OUT+'r3-after-768-hq.png'});
console.log('errors',JSON.stringify(E));await b.close()})();
