const { chromium } = require('/workspace/blackbox/shot/node_modules/playwright-core');
(async()=>{const [,,w,h,out,file,path]=process.argv;const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
const c=await b.newContext({viewport:{width:+w,height:+h}});const p=await c.newPage();p.on('pageerror',e=>console.log('PAGEERR',e.message));p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});
await p.route('**/__page',r=>r.fulfill({path:file,contentType:'text/html'}));
await p.goto('http://127.0.0.1:8771/__page',{waitUntil:'networkidle'});await p.waitForTimeout(800);await p.screenshot({path:out,fullPage:true});
console.log(await p.evaluate(()=>[document.title,[...document.querySelectorAll('[data-brand-href]')].map(a=>a.getAttribute('href')).join(',')]));await b.close()})();
