// Research tool layer (P1): SSRF-hardened fetch + honest citation locating.
// LOGIC tests: dns + http stubbed. The http stub deliberately mimics real Node: it SKIPS
// the lookup callback for literal IP hosts, so a missing literal-host precheck cannot be
// masked here. Runtime behavior against real sockets lives in research-tools-runtime-regression.cjs.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),net=require('net'),{EventEmitter}=require('events');
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={bizWebFetch,bizLocateCitation,bizCheckCitations,bizIpPublic,bizHostLiteralBlocked,bizLookupGuarded,bizPageText,bizNorm,BIZWEB};';

// --- stub DNS: hostname -> chosen IPs ---
const HOSTS={'good.example':['93.184.216.34'],'priv.example':['192.168.1.10'],'loop.example':['127.0.0.1'],
 'v6local.example':['fd00::1'],'mapped.example':['::ffff:10.0.0.5'],'multi.example':['93.184.216.34','10.1.2.3'],
 'throw.example':['93.184.216.34'],'slow.example':['93.184.216.34']};
const dnsCalls=[];
const dnsStub={lookup:(h,o,cb)=>{dnsCalls.push({h,o});const ips=HOSTS[h]; if(!ips)return cb(new Error('ENOTFOUND')); cb(null,ips.map(a=>({address:a,family:a.includes(':')?6:4})));}};

// --- stub http(s): canned responses; records every attempted connection ---
const requests=[];
const LONGP='Acme Manufacturing plans a 40-person hiring wave in Dallas this quarter. '.repeat(12).trim();
const PAGES={
 'good.example/':{status:200,headers:{'content-type':'text/html; charset=utf-8'},body:'<html><body><p>'+LONGP+'</p><!-- hidden comment with the words hiring wave --><template><p>template only text</p></template></body></html>'},
 'good.example/charset-quoted':{status:200,headers:{'content-type':'text/html; charset="utf-16"'},body:'<html><body>quoted</body></html>'},
 'good.example/charset-spaced':{status:200,headers:{'content-type':'text/html; charset = utf-16'},body:'<html><body>spaced</body></html>'},
 'good.example/charset-ok':{status:200,headers:{'content-type':'text/html; charset = "utf-8"'},body:'<html><body>spaced utf8 ok</body></html>'},
 'good.example/noct':{status:200,headers:{},body:'<html><body>untyped</body></html>'},
 'slow.example/':{status:200,headers:{'content-type':'text/plain'},delay:700,body:'Slow page quote for budget test. '+LONGP},
 '2606:4700:4700::1111/':{status:200,headers:{'content-type':'text/plain'},body:'public v6 literal page'},
 'good.example/redir-priv':{status:302,headers:{location:'http://priv.example/'}},
 'good.example/redir-literal':{status:302,headers:{location:'http://2130706433/'}},
 'good.example/redir-bad':{status:302,headers:{location:'http://['}},
 'good.example/binary':{status:200,headers:{'content-type':'application/octet-stream'},body:'<html><body>binary</body></html>'},
 'good.example/charset':{status:200,headers:{'content-type':'text/html; charset=utf-16'},body:'<html><body>wide</body></html>'},
 'good.example/gzip':{status:200,headers:{'content-type':'text/html','content-encoding':'gzip'},body:'<html><body>zipped</body></html>'},
 'good.example/loop1':{status:302,headers:{location:'/loop2'}},
 'good.example/loop2':{status:302,headers:{location:'/loop1'}},
 'good.example/big':{status:200,headers:{'content-type':'text/plain'},body:'x'.repeat(600*1024)},
 'priv.example/':{status:200,headers:{'content-type':'text/html'},body:'<html><body>intranet</body></html>'},
};
function fakeLib(proto){return {request:(opts,cb)=>{
  if(opts.hostname==='throw.example') throw new Error('boom');
  const key=opts.hostname+opts.path; requests.push({proto,hostname:opts.hostname,path:opts.path,headers:opts.headers});
  const res=new EventEmitter(); res.statusCode=(PAGES[key]||{status:404}).status; res.headers=(PAGES[key]||{}).headers||{};
  const req=new EventEmitter(); req.destroy=()=>{}; req.end=()=>{
    const serve=()=>{const p=PAGES[key]; const go=()=>{cb(res); if(p&&p.body){res.emit('data',Buffer.from(p.body));} res.emit('end');}; if(p&&p.delay)setTimeout(go,p.delay); else process.nextTick(go);};
    if(net.isIP(opts.hostname.replace(/^\[|\]$/g,''))) return serve(); // REAL NODE BEHAVIOR: no lookup for literal IPs
    opts.lookup(opts.hostname,{},(err)=>{ if(err){req.emit('error',err);return;} serve();});
  };
  return req;}};}
const c={require:(m)=>m==='dns'?dnsStub:m==='https'?fakeLib('https'):m==='http'?fakeLib('http'):require(m),
 module:{exports:{}},process:{env:{}},global:{},console,URL,Buffer,AbortSignal,setTimeout,clearTimeout,
 fetch:async()=>({ok:false})};
vm.runInNewContext(src,c);const f=c.module.exports.t;

(async()=>{
 // --- classifier: allowlist of global unicast, hand-rolled from IANA special registries ---
 for(const ip of ['10.1.2.3','192.168.0.1','169.254.1.1','127.0.0.1','100.64.0.1','100.127.9.9','172.16.5.5','172.31.0.1',
   '224.0.0.1','240.1.2.3','255.255.255.255','0.0.0.0','192.0.0.1','192.0.2.1','192.88.99.1','198.18.0.1','198.19.255.1',
   '198.51.100.1','203.0.113.1']) assert(!f.bizIpPublic(ip),'v4 special blocked: '+ip);
 for(const ip of ['::','::1','::ffff:10.0.0.5','::ffff:7f00:1','::ffff:0a00:0001','64:ff9b::a00:1','64:ff9b::10.0.0.1',
   '64:ff9b:1::1','100::1','2001::1','2001:0::1','2001:2::1','2001:10::1','2001:db8::1','2002::1','2002:7f00:1::',
   '3fff::1','3fff:0fff::1','fc00::1','fd12:3456::1','fe80::1','febf::1','ff02::1','ff00::1','::','1::1','3fff::1'])
   assert(!f.bizIpPublic(ip),'v6 special blocked: '+ip);
 for(const ip of ['8.8.8.8','93.184.216.34','1.1.1.1','193.0.0.1','100.63.0.1','172.15.0.1','172.32.0.1','192.0.1.1','192.0.3.1'])
   assert(f.bizIpPublic(ip),'v4 global allowed: '+ip);
 for(const ip of ['2606:4700:4700::1111','2001:4860:4860::8888','2001:500::1','::ffff:8.8.8.8','::ffff:808:808','64:ff9b::8.8.8.8'])
   assert(f.bizIpPublic(ip),'v6 global allowed: '+ip);
 assert(!f.bizIpPublic('')&&!f.bizIpPublic('not-an-ip')&&!f.bizIpPublic('fe80::1%eth0'),'garbage refused');
 // literal-host precheck (the PR113 round-1 bypass): URL-canonicalized forms of loopback
 for(const u of ['http://127.0.0.1/','http://2130706433/','http://0x7f.0.0.1/','http://0177.0.0.1/','http://127.1/','http://0.0.0.0/',
   'http://[::1]/','http://[::ffff:127.0.0.1]/','http://[::ffff:7f00:1]/','http://[fe80::1]/','http://[ff02::1]/','http://[2002:7f00:1::]/'])
   assert(f.bizHostLiteralBlocked(new URL(u).hostname),'literal blocked: '+u);
 assert(!f.bizHostLiteralBlocked('93.184.216.34')&&!f.bizHostLiteralBlocked('good.example')&&!f.bizHostLiteralBlocked('[2606:4700:4700::1111]'),'public literal/name allowed');
 // lookup guard callback contracts (Node 22): opts.all -> array; default -> (address, family)
 await new Promise((res,rej)=>f.bizLookupGuarded('good.example',{all:true},(e,r)=>{try{assert.ifError(e);assert(Array.isArray(r)&&r[0].address==='93.184.216.34'&&r[0].family===4);res();}catch(x){rej(x)}}));
 await new Promise((res,rej)=>f.bizLookupGuarded('good.example',{},(e,a,fam)=>{try{assert.ifError(e);assert(a==='93.184.216.34'&&fam===4);res();}catch(x){rej(x)}}));
 await new Promise((res,rej)=>f.bizLookupGuarded('priv.example',{},(e)=>{try{assert(e&&e.code==='ssrf_blocked');res();}catch(x){rej(x)}}));
 await new Promise((res,rej)=>f.bizLookupGuarded('multi.example',{},(e)=>{try{assert(e&&e.code==='ssrf_blocked','mixed DNS answer rejected');res();}catch(x){rej(x)}}));
 // 1) public fetch works; no cookie/auth headers forwarded
 let r=await f.bizWebFetch('https://good.example/');assert(r.ok,'public fetch ok');assert(r.body.includes('hiring wave'));
 const h1=requests[requests.length-1].headers;assert(!h1.Cookie&&!h1.cookie&&!h1.Authorization&&!h1.authorization,'no credentials forwarded');
 // 2) private DNS host blocked
 r=await f.bizWebFetch('http://priv.example/');assert.equal(r.error,'ssrf_blocked');
 // 3) literal IPs blocked BEFORE any request object is built (stub mimics real Node: no lookup for literals)
 for(const u of ['http://127.0.0.1/','http://2130706433/','http://0x7f.0.0.1/','http://127.1/','http://[::1]/','http://[::ffff:127.0.0.1]/']){
   const n=requests.length; r=await f.bizWebFetch(u); assert.equal(r.error,'ssrf_blocked',u); assert.equal(requests.length,n,'no request constructed for '+u);
 }
 // 4) redirect to private host and to literal IP blocked at the hop
 r=await f.bizWebFetch('https://good.example/redir-priv');assert.equal(r.error,'ssrf_blocked','redirect to private DNS host');
 r=await f.bizWebFetch('https://good.example/redir-literal');assert.equal(r.error,'ssrf_blocked','redirect to literal 2130706433');
 assert(!requests.some(q=>q.hostname==='2130706433'||q.hostname==='127.0.0.1'),'literal redirect target never constructed');
 // 5) scheme, credentials, port refused
 assert.equal((await f.bizWebFetch('file:///etc/passwd')).error,'scheme_not_allowed');
 assert.equal((await f.bizWebFetch('ftp://good.example/')).error,'scheme_not_allowed');
 assert.equal((await f.bizWebFetch('https://user:pw@good.example/')).error,'credentials_in_url');
 assert.equal((await f.bizWebFetch('http://good.example:8080/')).error,'port_not_allowed');
 assert.equal((await f.bizWebFetch('http://127.0.0.1:8080/')).error,'port_not_allowed');
 assert.equal((await f.bizWebFetch('https://good.example:443/')).ok,true,'default port explicit ok');
 // 6) malformed redirect target and sync request-construction failure are error results, not throws
 assert.equal((await f.bizWebFetch('https://good.example/redir-bad')).error,'bad_redirect');
 assert.equal((await f.bizWebFetch('http://throw.example/')).error,'request_error');
 // 7) redirect loop bounded
 assert.equal((await f.bizWebFetch('https://good.example/loop1')).error,'too_many_redirects');
 // 8) size cap
 assert.equal((await f.bizWebFetch('https://good.example/big')).error,'too_large');
 // 9) content-type / charset / encoding validation
 assert.equal((await f.bizWebFetch('https://good.example/binary')).error,'content_type_not_allowed');
 assert.equal((await f.bizWebFetch('https://good.example/charset')).error,'unsupported_charset');
 assert.equal((await f.bizWebFetch('https://good.example/gzip')).error,'unsupported_encoding');
 assert.equal((await f.bizWebFetch('https://good.example/charset-quoted')).error,'unsupported_charset','quoted charset parsed');
 assert.equal((await f.bizWebFetch('https://good.example/charset-spaced')).error,'unsupported_charset','spaced charset parsed');
 assert.equal((await f.bizWebFetch('https://good.example/charset-ok')).ok,true,'spaced quoted utf-8 accepted');
 assert.equal((await f.bizWebFetch('https://good.example/noct')).error,'content_type_missing','missing content-type fails closed');
 // bracketed IPv6 literal: bare address on the socket/TLS, bracketed Host header
 let n0=requests.length; r=await f.bizWebFetch('http://[2606:4700:4700::1111]/');
 assert(r.ok,'public v6 literal fetch ok');assert.equal(requests[n0].hostname,'2606:4700:4700::1111','brackets stripped for connect');
 assert.equal(requests[n0].headers.Host,'[2606:4700:4700::1111]','Host keeps brackets');
 // 10) citation locating: exact quote located, misquote not; comments/templates stripped from matching
 r=await f.bizLocateCitation('https://good.example/','Acme Manufacturing plans a 40-person hiring wave in Dallas this quarter.');
 assert.equal(r.located,true);assert.equal(r.reason,'located');
 r=await f.bizLocateCitation('https://good.example/','Acme Manufacturing plans a 400-person hiring wave in Dallas.');
 assert.equal(r.located,false);assert.equal(r.reason,'excerpt_not_found');
 r=await f.bizLocateCitation('https://good.example/','hidden comment with the words hiring wave');
 assert.equal(r.located,false,'HTML comments do not match'); 
 r=await f.bizLocateCitation('https://good.example/','template only text');
 assert.equal(r.located,false,'templates do not match');
 r=await f.bizLocateCitation('http://priv.example/','intranet page');assert.equal(r.located,false);assert.equal(r.reason,'ssrf_blocked');
 // 11) excerpt checked whole after normalization: 300 REAL matching chars + invented suffix must NOT locate
 const real300=f.bizNorm(LONGP).slice(0,300);
 r=await f.bizLocateCitation('https://good.example/',real300);assert.equal(r.located,true,'300 real chars located');
 r=await f.bizLocateCitation('https://good.example/',real300+' invented suffix that is not on the page');
 assert.equal(r.located,false,'300 real chars + invented suffix is NOT located');assert.equal(r.reason,'excerpt_not_found');
 r=await f.bizLocateCitation('https://good.example/','Acme Manufacturing plans a 40-person hiring wave in Dallas this quarter.'+'y'.repeat(1200));
 assert.equal(r.reason,'excerpt_too_long');
 r=await f.bizLocateCitation('https://good.example/','          ');assert.equal(r.reason,'excerpt_too_short','whitespace-only excerpt cannot match everything');
 // 12) citation cap and shared time budget
 let n=requests.length;
 const claims=Array.from({length:6},()=>({url:'https://good.example/',quote:'Acme Manufacturing plans a 40-person hiring wave in Dallas this quarter.'}));
 const checks=await f.bizCheckCitations(claims);assert.equal(checks.length,6);
 assert.equal(checks.filter(x=>x.located).length,5);assert.equal(checks[5].reason,'citation_cap');
 assert.equal(requests.length,n+5,'exactly five fetches');
 const t0=Date.now();
 const slow=await f.bizCheckCitations([1,2,3].map(()=>({url:'https://slow.example/',quote:'Slow page quote for budget test.'})),2500);
 assert.equal(slow[0].located,true,'first slow citation located');
 assert.equal(slow[1].located,true,'second slow citation located');
 assert.equal(slow[2].reason,'time_budget','third citation exhausts the shared cumulative budget');
 assert(Date.now()-t0<2400,'cumulative elapsed bounded, not per-citation fresh budgets');
 console.log('PASS research tools logic: global-unicast classifier (IANA v4/v6 specials incl mapped/NAT64/6to4/Teredo/multicast), literal-host precheck (decimal/octal/hex/partial v4, v6), lookup contracts, redirect-hop revalidation, port/scheme/credential refusal, bad_redirect/request_error, size cap, content-type/charset/encoding validation, citation located vocabulary with whole-excerpt matching, cap + shared budget.');
})().catch(e=>{console.error(e);process.exit(1)});
