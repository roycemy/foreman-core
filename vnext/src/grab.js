const { chromium } = require('/workspace/blackbox/shot/node_modules/playwright-core');
const {mock,reset}=require('/workspace/blackbox/export/tools/mock.js');const OUT='/workspace/blackbox/vnext/src/img/';
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});reset();
const c=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2,reducedMotion:'reduce'});const p=await c.newPage();await mock(p);
await p.goto('http://127.0.0.1:8771/index.html#office',{waitUntil:'networkidle'});await p.waitForTimeout(2000);
await p.addStyleTag({content:'.zone-sign,#floor-label,#worker-labels,#floor-approval,#diorama-tools,.ch .sdot,.ch .bub,.ch .tag2,#pv-island .pv-isl-glow{display:none!important} *,*::before,*::after{background-color:transparent!important;background-image:none!important;box-shadow:none!important;border-color:transparent!important}'});
await p.evaluate(()=>{const f=document.querySelector('#floor');f.style.setProperty('--floor-width','1320px');f.style.setProperty('--floor-height','750px')});await p.waitForTimeout(800);
const data=await p.evaluate(()=>{const F=HQ_FLOOR;const B={library:[4,4,42,42],studio:[50,4,116,40],mailroom:[4,50,40,116],workshop:[50,48,82,82],lounge:[88,48,116,78]};const poly={};for(const k in B){const [x0,y0,x1,y1]=B[k];poly[k]=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(([x,y])=>F.W2P(x,y))}
 const ag=agents.map(a=>{const r=a.el.getBoundingClientRect(),fr=document.querySelector('#floor').getBoundingClientRect();return {id:a.id,name:a.name,x:+((r.left+r.width/2-fr.left)/fr.width*100).toFixed(2),y:+((r.top-fr.top)/fr.height*100).toFixed(2)}});return {poly,ag}});
require('fs').writeFileSync(OUT+'floor.json',JSON.stringify(data));
await p.locator('#floor').screenshot({path:OUT+'floor.png',omitBackground:true});
await p.evaluate(()=>agents.forEach(a=>a.el.setAttribute('data-grab',a.id)));for(const a of data.ag){const el=p.locator('[data-grab="'+a.id+'"] .avs').first();if(await el.count())await el.screenshot({path:OUT+'fig-'+a.id+'.png',omitBackground:true})}
await p.addStyleTag({content:'#pv-island,[data-grab=a2]{display:none!important}'});await p.waitForTimeout(300);await p.locator('#floor').screenshot({path:OUT+'floor-noisl.png',omitBackground:true});
await p.addStyleTag({content:'#floor>*:not(#chl),#chl>*:not(.ch){visibility:hidden!important} [data-grab=a2]{display:block!important}'});await p.evaluate(()=>{const e=document.querySelector('[data-grab=a2]');if(e)e.style.display='block'});await p.waitForTimeout(300);
for(const a of data.ag){const el=p.locator('[data-grab="'+a.id+'"] .avs').first();if(await el.count())await el.screenshot({path:OUT+'fig-'+a.id+'.png',omitBackground:true})}
console.log(JSON.stringify(data.ag));await b.close()})();
