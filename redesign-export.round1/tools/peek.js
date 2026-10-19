const { chromium } = require('/workspace/blackbox/shot/node_modules/playwright-core');
const {mock}=require('./mock.js');
(async()=>{const [,,hash,w,h,out,wait]=process.argv;const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
const mob=+w<500;const c=await b.newContext({viewport:{width:+w,height:+h},deviceScaleFactor:mob?2:1,isMobile:mob,hasTouch:mob});const p=await c.newPage();
p.on('pageerror',e=>console.log('PAGEERR',e.message));p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});
await mock(p);await p.goto('http://127.0.0.1:8771/index.html'+hash,{waitUntil:'networkidle'});await p.waitForTimeout(+(wait||2500));
await p.screenshot({path:out});await b.close()})();
