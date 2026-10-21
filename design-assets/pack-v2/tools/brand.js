// export brand svgs + pngs
const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
global.window={};require('../brand/logos.js');const L=window.LOGOS,fs=require('fs');
const k=window.CHOSEN,o=L[k];
const files={'alter-mark-lit.svg':o.f(true),'alter-mark-idle.svg':o.f(false),'alter-mark-dark-lit.svg':o.f(true,1),'favicon.svg':L.L1.f(true)};
const icon=(dark)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="114" fill="${dark?'#111':'#F4F3EF'}"/><g transform="translate(76 120) scale(15.6) translate(11.5 2.2)">${o.f(true,dark).replace(/^<svg[^>]*>|<\/svg>$/g,'')}</g></svg>`;
files['app-icon-light.svg']=icon(0);files['app-icon-dark.svg']=icon(1);
for(const[n,s]of Object.entries(files))fs.writeFileSync('../brand/'+n,s);
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});const p=await b.newPage();
for(const [n,src,w,h] of [['app-icon-light-512.png','app-icon-light.svg',512,512],['app-icon-dark-512.png','app-icon-dark.svg',512,512],['apple-touch-icon-180.png','app-icon-light.svg',180,180],['favicon-32.png','favicon.svg',32,32],['favicon-16.png','favicon.svg',16,16],['alter-mark-256.png','alter-mark-lit.svg',256,180]]){
await p.setViewportSize({width:w,height:h});const svg=fs.readFileSync('../brand/'+src,'utf8');await p.setContent(`<style>body{margin:0}svg{width:${w}px;height:${h}px;display:block}</style>${svg}`);await p.waitForTimeout(150);await p.screenshot({path:'../brand/'+n,omitBackground:true});}
await b.close();})();
