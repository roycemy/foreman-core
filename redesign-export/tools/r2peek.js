const { chromium } = require('/workspace/blackbox/shot/node_modules/playwright-core');
const {S,mock,reset}=require('./mock.js');const BASE='http://127.0.0.1:8771';
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
for(const [w,h] of [[1440,900],[390,844]]){reset();const mob=w<500;const c=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:mob?2:1,isMobile:mob,hasTouch:mob,reducedMotion:'reduce'});
const p=await c.newPage();const E=[];p.on('pageerror',e=>E.push(e.message));p.on('console',m=>{if(m.type()==='error')E.push(m.text())});await mock(p);
await p.goto(BASE+'/index.html#office',{waitUntil:'networkidle'});await p.waitForTimeout(2500);
await p.screenshot({path:'/tmp/r2-'+w+'.png',fullPage:mob});
console.log(E);const info=await p.evaluate(()=>agents.map(a=>(a.el&&a.el.querySelector('svg.figure').getAttribute('class'))+' m='+a._motion+' fig='+a._fig+' '+a.name+' | '+a.st+' | '+(a.el?a.el.dataset.kind:'NOEL')+' | '+humanStatus(a)+' | raw: '+a.now));console.log(w,E,info.join('\n'));}
await b.close()})();
