const {chromium}=require('/usr/local/lib/pnpm/5/.pnpm/playwright@1.63.0-alpha-2026-08-31/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});const p=await b.newPage({viewport:{width:1320,height:750},deviceScaleFactor:1});
await p.setContent('<body style="margin:0;background:#F4F4F1">'+require('fs').readFileSync('/workspace/foreman-core/public/hq/floor.svg','utf8')+'</body>');
await p.screenshot({path:'/tmp/floorsvg-a.png'});await b.close();})();
