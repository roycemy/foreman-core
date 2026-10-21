const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
// usage: node shoot.js jobs.json   jobs: [[url,out,w,h,full,reduce]]
(async()=>{const jobs=require(require('path').resolve(process.argv[2]));const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--allow-file-access-from-files']});
for(const [u,o,w,h,full,red] of jobs){const c=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,reducedMotion:red?'reduce':'no-preference'});const p=await c.newPage();p.on('pageerror',e=>console.log('ERR',o,e.message));
await p.goto('file:///workspace/alter-pack-v2/'+u);await p.waitForTimeout(500);await p.screenshot({path:'/workspace/alter-pack-v2/shots/'+o,fullPage:!!full,animations:'disabled'});await c.close();console.log('ok',o);}
await b.close();})();
