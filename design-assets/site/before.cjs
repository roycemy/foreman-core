const {chromium}=require('/usr/local/lib/pnpm/5/.pnpm/playwright@1.63.0-alpha-2026-08-31/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});
for(const [n,u] of [['home','https://www.alterhq.app/'],['signin','https://www.alterhq.app/hq'],['waitlist','https://www.alterhq.app/waitlist']])for(const w of [390,1440]){
const p=await b.newPage({viewport:{width:w,height:w==390?844:900},deviceScaleFactor:w==390?2:1});
try{await p.goto(u,{waitUntil:'networkidle',timeout:30000});await p.waitForTimeout(2500);await p.screenshot({path:`shots/before/${n}-${w}.png`,fullPage:true});console.log(n,w,p.url(),await p.title())}catch(e){console.log('err',n,w,e.message)}await p.close()}
await b.close()})();
