const { chromium } = require('/workspace/blackbox/shot/node_modules/playwright-core');
const {S,mock,reset}=require('./mock.js');const BASE='http://127.0.0.1:8771',OUT=process.argv[2]||'/tmp/r32/';require('fs').mkdirSync(OUT,{recursive:true});
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
for(const w of [390,1440]){reset();const mob=w<500;const c=await b.newContext({viewport:{width:w,height:mob?844:900},deviceScaleFactor:mob?2:1,isMobile:mob,hasTouch:mob,reducedMotion:'reduce'});const p=await c.newPage();await mock(p);
await p.goto(BASE+'/index.html#office',{waitUntil:'networkidle'});await p.waitForTimeout(1500);
for(const h of ['work','stubs','policies','money','cards']){await p.evaluate(h=>location.hash='#'+h,h);await p.waitForTimeout(900);await p.screenshot({path:OUT+h+'-'+w+'.png'})}}
await b.close()})();
