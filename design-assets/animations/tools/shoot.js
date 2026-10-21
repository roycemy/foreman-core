const {chromium}=require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
const http=require('http'),fs=require('fs'),path=require('path');
const SHOTS=process.env.RAW?'':'';const OUT='/workspace/alter-poses';const PUB='/workspace/foreman-core/public',PK='/workspace/alter-pack-v3';
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf','.json':'application/json','.webmanifest':'application/json'};
const PATCH=require('./patch.js');const srv=http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u==='/')u='/app.html';if(PATCH[u]&&!q.url.includes('orig')){r.setHeader('Content-Type','text/javascript');return r.end(PATCH[u](fs.readFileSync(PUB+u,'utf8')))}let f=u.startsWith('/poses/')?path.join(OUT,u.slice(7)):u.startsWith('/pack/')?path.join(PK,u.slice(6)):path.join(PUB,u);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}r.setHeader('Content-Type',types[path.extname(f)]||'application/octet-stream');fs.createReadStream(f).pipe(r)});
module.exports=async function(jobs){await new Promise(ok=>srv.listen(0,ok));const B='http://localhost:'+srv.address().port;
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
for(const j of jobs){const phone=j.w<=430;const c=await b.newContext({viewport:{width:j.w,height:j.h},deviceScaleFactor:2,isMobile:phone,hasTouch:phone,reducedMotion:j.reduce?'reduce':'no-preference'});
 await c.route('**/fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 const st=require('./state.js');await c.route('**/api/**',r=>{const u=r.request().url();let body={};if(/\/api\/me/.test(u))body={email:'royce@example.com',workspace:'w1'};else if(/\/api\/state/.test(u))body=st(j.v||{});else if(/money|cards/.test(u))body={requests:[],proposals:[],bots:[],ledger:[]};else if(/jobs\//.test(u))body={task:st(j.v||{}).tasks[0],timeline:[]};r.fulfill({contentType:'application/json',body:JSON.stringify(body)})});
 if(j.nopatch)await c.route('**/js/*.js',async r=>{const u=new URL(r.request().url());r.fulfill({contentType:'text/javascript',body:fs.readFileSync(PUB+u.pathname,'utf8')})});
 await c.addInitScript(t=>{try{if(!t)localStorage.setItem('alter.tour','1')}catch(e){}},!!j.tour);
 const p=await c.newPage();p.on('console',m=>console.log('C',m.text().slice(0,600)));p.on('pageerror',e=>console.log('ERR',j.out,e.message));
 if(j.url){await p.goto(B+j.url);await p.waitForTimeout(400);await p.screenshot({path:OUT+'/'+j.out,fullPage:true});console.log('ok',j.out);await c.close();continue}
 await p.goto(B+'/app.html'+(j.hash||'#floor'));await p.waitForTimeout(1200);
 await p.addStyleTag({url:'/pack/tools/fonts.css'});
 if(j.inject!==false){for(const n of ['tokens.css']) await p.addStyleTag({url:'/pack/'+n});for(const n of fs.readdirSync(PK+'/components').filter(x=>x.endsWith('.css')))await p.addStyleTag({url:'/pack/components/'+n});for(const n of fs.readdirSync(PK+'/components').filter(x=>x.endsWith('.js')))await p.addScriptTag({url:'/pack/components/'+n});}
 if(j.inject!==false)await p.evaluate(()=>{BB.reconnectFlag.mount();const g=document.querySelector('#fx');if(g&&BB.meetGlowSVG)g.insertAdjacentHTML('beforeend',BB.meetGlowSVG());});await p.addScriptTag({url:'/pack/tools/scenes.js'});for(const n of ['floorscene.js','poses.js','defs.js','strips.js','trig.js','render.js'])await p.addScriptTag({url:'/poses/'+n});if(j.drag){await p.mouse.move(700,300);await p.mouse.down();await p.mouse.move(700+j.drag[0]/2,300+j.drag[1]/2,{steps:5});await p.mouse.move(700+j.drag[0],300+j.drag[1],{steps:5});await p.waitForTimeout(150);await p.screenshot({path:OUT+'/'+j.out,animations:'disabled'});await p.mouse.up();console.log('ok',j.out);await c.close();continue}if(j.js)await p.evaluate(j.js);await p.waitForTimeout(j.wait||500);
 await p.screenshot({path:OUT+'/'+j.out,fullPage:!!j.full,animations:'disabled'});console.log('ok',j.out);await c.close();}
await b.close();srv.close();};
if(require.main===module)module.exports(require(path.resolve(process.argv[2])));
