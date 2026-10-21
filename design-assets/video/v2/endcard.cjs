const {chromium}=require('/usr/local/lib/pnpm/5/.pnpm/playwright@1.63.0-alpha-2026-08-31/node_modules/playwright');
const fs=require('fs');const b64=fs.readFileSync('/usr/share/fonts/truetype/sand-box/google/Geist/Geist-VariableFont_wght.ttf').toString('base64');
const DUR=+process.argv[2]||7.4, FPS=30;
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});
for(const [fmt,w,h,L,W,T,U] of [['d',1920,1080,230,150,60,36],['m',1080,1920,280,170,70,46]]){
 const p=await b.newPage({viewport:{width:w,height:h}});
 await p.setContent(`<style>@font-face{font-family:G;font-weight:100 900;src:url(data:font/ttf;base64,${b64})}*{margin:0}
 body{width:${w}px;height:${h}px;background:radial-gradient(ellipse at 50% 45%,#F8F8F5 0%,#F4F4F1 60%,#EFEFEB 100%);font-family:G;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden}
 .mk{width:${L}px;height:${L}px;position:relative}.mk svg{width:100%;height:100%;overflow:visible}
 .band{animation:band 1.1s cubic-bezier(.2,.8,.2,1) both .15s}.top{animation:top 1.1s cubic-bezier(.2,.8,.2,1) both 0s}
 .dot{transform-origin:36px 33px;animation:dot .7s cubic-bezier(.3,1.4,.4,1) both 1.05s}.glow{transform-origin:36px 33px;animation:glow 1.6s ease-out both 1.05s}
 @keyframes top{from{transform:translateY(-10px);opacity:0}to{transform:none;opacity:1}}
 @keyframes band{from{transform:translateY(8px);opacity:0}to{transform:none;opacity:1}}
 @keyframes dot{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}
 @keyframes glow{0%{transform:scale(.5);opacity:0}35%{opacity:.55}100%{transform:scale(2.6);opacity:0}}
 .w{font-size:${W}px;font-weight:700;letter-spacing:-.04em;color:#111;margin-top:${W*0.05}px;animation:up .9s cubic-bezier(.2,.8,.2,1) both 1.5s}
 .t{font-size:${T}px;font-weight:600;letter-spacing:-.025em;line-height:1.15;color:#111;text-align:center;margin-top:${T*0.7}px;animation:up .9s cubic-bezier(.2,.8,.2,1) both 2.0s}.t span{color:#6B6B66}
 .u{font-size:${U}px;font-weight:500;color:#111;margin-top:${U*1.1}px;padding:${U*.35}px ${U*.8}px;border:1.5px solid #DADAD3;border-radius:999px;animation:up .9s cubic-bezier(.2,.8,.2,1) both 2.6s}
 @keyframes up{from{transform:translateY(14px);opacity:0;filter:blur(4px)}to{transform:none;opacity:1;filter:none}}
 .fade{position:fixed;inset:0;background:#F4F4F1;opacity:0;animation:f .95s linear both ${DUR-1.0}s}@keyframes f{to{opacity:1}}
 </style><div class="mk"><svg viewBox="8 18 50 34"><g class="band"><path d="M8 33 V37 L32 49 L56 37 V33" fill="#111" stroke="#111" stroke-width="3" stroke-linejoin="round"/></g><g class="top"><path d="M8 33 L32 21 L56 33 L32 45 Z" fill="#F4F3EF" stroke="#111" stroke-width="3.5" stroke-linejoin="round"/></g><circle class="glow" cx="36" cy="33" r="4" fill="#E8452C"/><circle class="dot" cx="36" cy="33" r="4" fill="#E8452C"/></svg></div>
 <div class="w">alter</div><div class="t">Let your bots work.<br><span>You stay in control.</span></div><div class="u">alterhq.app</div><div class="fade"></div>`);
 await p.evaluate(()=>document.fonts.ready);
 await p.evaluate(()=>document.getAnimations().forEach(a=>a.pause()));
 fs.mkdirSync(`end/${fmt}`,{recursive:true});
 for(let i=0;i<Math.round(DUR*FPS);i++){await p.evaluate(t=>document.getAnimations().forEach(a=>a.currentTime=t),i*1000/FPS);await p.screenshot({path:`end/${fmt}/${String(i).padStart(4,'0')}.png`});}
 await p.close();}
await b.close();})();
