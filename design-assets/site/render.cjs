const {chromium}=require('/usr/local/lib/pnpm/5/.pnpm/playwright@1.63.0-alpha-2026-08-31/node_modules/playwright');
const fs=require('fs');fs.mkdirSync('shots/390',{recursive:true});fs.mkdirSync('shots/1440',{recursive:true});
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});
for(const n of ['index','security','pricing','signin'])for(const w of [390,1440]){
const p=await b.newPage({viewport:{width:w,height:w==390?844:900},deviceScaleFactor:2,reducedMotion:'reduce'});
await p.goto('file://'+__dirname+'/'+n+'.html');await p.waitForTimeout(800);
await p.screenshot({path:`shots/${w}/${n}-full.png`,fullPage:true});
if(n=='index'&&w==390){const ids=await p.$$eval('section',s=>s.map((e,i)=>e.id||('s'+i)));let k=0;for(const id of ids){const el=(await p.$$('section'))[k++];await el.evaluate(e=>window.scrollTo(0,e.offsetTop));await p.waitForTimeout(150);await p.screenshot({path:`shots/390/index-${String(k).padStart(2,'0')}-${id}.png`})}}
// audit: small tap targets, low contrast
const r=await p.evaluate(()=>{const out=[];document.querySelectorAll('a,button,input').forEach(e=>{const b=e.getBoundingClientRect();if(b.width&&b.height<44)out.push('tap '+b.height.toFixed(0)+' '+(e.textContent||e.id).trim().slice(0,30))});
const sw=document.documentElement.scrollWidth;if(sw>innerWidth)out.push('hscroll '+sw);return out});
console.log(n,w,JSON.stringify(r));await p.close()}
await b.close()})();
