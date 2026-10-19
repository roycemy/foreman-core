const { chromium } = require('/workspace/blackbox/shot/node_modules/playwright-core');
const {mock,reset}=require('/workspace/blackbox/export/tools/mock.js');const OUT='/workspace/blackbox/vnext/live/';const U='http://127.0.0.1:8772';
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});const info={};
if(0){const c=await b.newContext({viewport:{width:1440,height:900}});const p=await c.newPage();await p.goto(U+'/hq',{waitUntil:'networkidle'}).catch(()=>{});await p.waitForTimeout(2500);await p.screenshot({path:OUT+'raw-hq-1440.png'});info.rawText=(await p.evaluate(()=>document.body.innerText)).slice(0,600);
 await p.goto(U+'/',{waitUntil:'networkidle'}).catch(()=>{});await p.waitForTimeout(1500);await p.screenshot({path:OUT+'raw-root-1440.png',fullPage:false});await c.close()}
for(const w of [1440,390]){reset();const mob=w<500;const c=await b.newContext({viewport:{width:w,height:mob?844:900},deviceScaleFactor:mob?2:1,isMobile:mob,hasTouch:mob});const p=await c.newPage();await mock(p);
 await p.goto(U+'/index.html#office',{waitUntil:'networkidle'}).catch(e=>info.err=String(e));await p.waitForTimeout(3000);await p.screenshot({path:OUT+'mock-hq-'+w+'.png'});
 info['nav'+w]=await p.evaluate(()=>[...document.querySelectorAll('#nav a')].map(a=>a.innerText+'→'+a.getAttribute('href')));
 info['signs'+w]=await p.evaluate(()=>[...document.querySelectorAll('.zone-sign,[class*=room-label],[class*=sign]')].slice(0,12).map(e=>e.className+': '+e.innerText.replace(/\n/g,' ')+' vis='+(getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden')));
 info['roster'+w]=await p.evaluate(()=>{const r=document.querySelector('#floor-workers');return r?r.innerText.slice(0,500):null});
 info['bubble'+w]=await p.evaluate(()=>[...document.querySelectorAll('[class*=bub],[class*=typing]')].map(e=>e.className+' '+getComputedStyle(e).display).slice(0,8));
 for(const v of ['work','stubs','receipts','policies']){await p.evaluate(v=>location.hash='#'+v,v);await p.waitForTimeout(1200);await p.screenshot({path:OUT+'mock-'+v+'-'+w+'.png'});if(w===1440)info['view-'+v]=(await p.evaluate(v=>{const e=document.querySelector('#v-'+v);return e?e.innerText:''},v)).slice(0,700)}
 if(w===1440){await p.evaluate(()=>location.hash='#office');await p.waitForTimeout(1200);
  const ok=await p.evaluate(()=>{const b=document.querySelector('#floor-workers button, .fw');if(b){b.click();return b.innerText}return null});await p.waitForTimeout(1200);info.drawerClick=ok;await p.screenshot({path:OUT+'mock-drawer-1440.png'});
  info.drawer=await p.evaluate(()=>{const d=document.querySelector('#drawer,.drawer,[id*=drawer]');return d?d.id+'|'+d.innerText.slice(0,1200):null})}
 await c.close()}
require('fs').writeFileSync(OUT+'info.json',JSON.stringify(info,null,1));await b.close()})();
