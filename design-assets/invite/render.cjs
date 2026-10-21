const {chromium}=require('/usr/local/lib/pnpm/5/.pnpm/playwright@1.63.0-alpha-2026-08-31/node_modules/playwright');
// usage: node render.cjs file.html out.png w h [full]
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});const jobs=JSON.parse(process.argv[2]);
for(const [f,o,w,h,full,js] of jobs){const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:o.includes('og')||o.includes('card')?1:2});
await p.goto('file://'+__dirname+'/screens/'+f);await p.waitForTimeout(250);if(js)await p.evaluate(js);await p.waitForTimeout(80);
await p.screenshot({path:__dirname+'/shots/'+o,fullPage:!!full});await p.close();}
await b.close();})();
