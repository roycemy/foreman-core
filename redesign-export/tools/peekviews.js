const { chromium } = require('/workspace/blackbox/shot/node_modules/playwright-core');
const {mock}=require('./mock.js');
(async()=>{const [,,w,h,prefix]=process.argv;const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
const mob=+w<500;const c=await b.newContext({viewport:{width:+w,height:+h},deviceScaleFactor:1,isMobile:mob,hasTouch:mob});const p=await c.newPage();
p.on('pageerror',e=>console.log('PAGEERR',e.message));p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});
await mock(p);await p.goto('http://127.0.0.1:8771/index.html#office',{waitUntil:'networkidle'});await p.waitForTimeout(2000);
for(const v of ['work','approvals','stubs','policies','money','cards']){await p.evaluate(h=>location.hash=h,'#'+v);await p.waitForTimeout(1300);await p.screenshot({path:prefix+v+'.png'})}
await p.evaluate(()=>location.hash='#office');await p.waitForTimeout(800);await p.evaluate(()=>openDr('a1'));await p.waitForTimeout(700);await p.screenshot({path:prefix+'drawer.png'});
await p.keyboard.press('Escape');await p.waitForTimeout(400);console.log('drawer after esc:',await p.evaluate(()=>document.querySelector('#dr').className));
await p.click('#emer');await p.waitForTimeout(400);await p.screenshot({path:prefix+'emer.png'});await p.keyboard.press('Escape');await p.waitForTimeout(300);
console.log('emodal after esc:',await p.evaluate(()=>document.querySelector('#emodal').className));
await b.close()})();
