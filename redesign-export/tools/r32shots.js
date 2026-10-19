// Round 3.2 shots. Usage: node r32shots.js (server on 8771)
const { chromium } = require('/workspace/blackbox/shot/node_modules/playwright-core');
const {mock,reset}=require('./mock.js');const BASE='http://127.0.0.1:8771',OUT='/workspace/blackbox/export/shots/';
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});const E=[];
async function page(w,h,hash){reset();const mob=w<500;const c=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:mob?2:1,isMobile:mob,hasTouch:mob,reducedMotion:'reduce'});
 const p=await c.newPage();p.on('pageerror',e=>E.push(w+' '+e.message));await mock(p);await p.goto(BASE+'/index.html'+(hash||'#office'),{waitUntil:'networkidle'});await p.waitForTimeout(1500);return p}
let p=await page(390,844);await p.screenshot({path:OUT+'r32-390-hq.png'});
await p.evaluate(()=>location.hash='#stubs');await p.waitForTimeout(900);await p.screenshot({path:OUT+'r32-390-team.png'});
await p.evaluate(()=>location.hash='#policies');await p.waitForTimeout(900);await p.screenshot({path:OUT+'r32-390-rules.png'});
p=await page(320,640);await p.screenshot({path:OUT+'r32-320-hq.png'});
p=await page(1440,900);
const r=await p.evaluate(()=>{const bc=document.querySelector('#chl .pv-prop[data-kind=bookcase]');const a=agents[0];a._walkEpoch=(a._walkEpoch||0)+9;const wx=+bc.dataset.wx,wy=+bc.dataset.wy;const [x,y]=HQ_FLOOR.W2P(wx-0.3,wy+1.4);setPos(a,x,y,0);const e=a.el.getBoundingClientRect();return {x:e.left,y:e.top}});
await p.waitForTimeout(300);await p.screenshot({path:OUT+'r32-1440-hq-closeup-bookcase.png',clip:{x:Math.max(0,r.x-160),y:Math.max(0,r.y-170),width:340,height:260}});
await p.evaluate(()=>location.hash='#policies');await p.waitForTimeout(900);await p.screenshot({path:OUT+'r32-1440-rules.png'});
console.log('errors',JSON.stringify(E));await b.close()})();
