const {chromium}=require('/usr/local/lib/pnpm/5/.pnpm/playwright@1.63.0-alpha-2026-08-31/node_modules/playwright');
const [,,w,h,dir,fps]=process.argv;
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});const p=await b.newPage({viewport:{width:+w,height:+h},deviceScaleFactor:+w<900?2:1});
await p.goto('file://'+__dirname+'/screens/reveal.html?t=0');await p.waitForTimeout(400);require('fs').mkdirSync(dir,{recursive:true});
const n=Math.round(3.4*fps);for(let i=0;i<=n;i++){const t=Math.min(3000,i*1000/fps);await p.evaluate(t=>setT(t),t);await p.screenshot({path:`${dir}/f${String(i).padStart(3,'0')}.png`});}
await b.close();})();
