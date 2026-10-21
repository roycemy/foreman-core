// High-DPR still of the real HQ floor from the real app (sample state), UI chrome hidden.
const {chromium}=require('/usr/local/lib/pnpm/5/.pnpm/playwright@1.63.0-alpha-2026-08-31/node_modules/playwright');
const ago=m=>new Date(Date.now()-m*60000).toISOString(),now=()=>new Date().toISOString();
const agent=(id,name,room,x)=>Object.assign({id,name,providerId:id,status:'active',room,visibleRoom:room,connection:{status:'active',transport:'gateway'},lastSeen:now(),permissions:{}},x||{});
const S={killed:false,agents:[agent('grok','Grok Bot','ops'),agent('instinct','Instinct','finance'),agent('muse','Muse','marketing'),agent('devin','Scout','sales'),agent('manus','Manus','ops')],
 tasks:[{id:'d1',assignee:'grok',status:'done',title:'Competitor pricing scan',createdAt:ago(90),startedAt:ago(80),finishedAt:ago(60)}],requests:[],events:[]};
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--force-prefers-no-reduced-motion']});
const ctx=await b.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:4});
await ctx.addInitScript(()=>{try{localStorage.setItem('alter.tour','1');localStorage.setItem('bb.tour','1')}catch(e){}});
const p=await ctx.newPage();
await p.route('**/api/**',r=>{const u=new URL(r.request().url()).pathname;let o={};if(u==='/api/me')o={email:'royce@alterhq.app',workspace:'w1'};else if(u==='/api/state')o=S;else if(u==='/api/money')o={requests:[]};else if(u.startsWith('/api/cards'))o={killed:false,proposals:[],ledger:[],bots:[]};r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)})});
await p.goto('http://localhost:5055/app.html#floor',{waitUntil:'networkidle'}).catch(()=>{});
await p.waitForTimeout(6000);
const info=await p.evaluate(()=>{const s=[...document.querySelectorAll('svg')].sort((a,b)=>b.getBoundingClientRect().width-a.getBoundingClientRect().width)[0];s.id=s.id||'bigsvg';const r=s.getBoundingClientRect();return {id:s.id,r:[r.x,r.y,r.width,r.height]}});
console.log(JSON.stringify(info));
const t=await p.evaluate(()=>{const r=document.getElementById('rooms');let e=r,out=[];while(e&&e!==document.body){out.push(e.tagName+'#'+e.id+'.'+e.className.baseVal??e.className);const sib=[...e.parentElement.children].map(c=>c.tagName+'#'+c.id+'.'+(typeof c.className==='string'?c.className:'')).join(' | ');out.push('  sibs: '+sib.slice(0,600));e=e.parentElement;}return out.join('\n')});console.log(t);
await b.close();})();
