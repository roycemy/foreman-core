// Round 3.3 shots. Usage: node r33shots.js (server on 8771)
const { chromium } = require('/workspace/blackbox/shot/node_modules/playwright-core');
const {mock,reset}=require('./mock.js');const BASE='http://127.0.0.1:8771',OUT='/workspace/blackbox/export/shots/';
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});const E=[];
for(const w of [390,1440]){reset();const mob=w<500;const c=await b.newContext({viewport:{width:w,height:mob?844:900},deviceScaleFactor:mob?2:1,isMobile:mob,hasTouch:mob,reducedMotion:'reduce'});const p=await c.newPage();p.on('pageerror',e=>E.push(w+' '+e.message));await mock(p);
 await p.goto(BASE+'/index.html#office',{waitUntil:'networkidle'});await p.waitForTimeout(1500);
 await p.screenshot({path:OUT+'r33-'+w+'-hq.png'});
 for(const [h,n] of mob?[['stubs','team'],['work','work'],['money','money'],['cards','cards'],['policies','rules']]:[['money','money']]){await p.evaluate(h=>location.hash='#'+h,h);await p.waitForTimeout(900);await p.screenshot({path:OUT+'r33-'+w+'-'+n+'.png'})}}
console.log('errors',JSON.stringify(E));await b.close()})();
