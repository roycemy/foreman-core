// Research tool layer (P1): SSRF-hardened fetch + honest citation locating. All network is stubbed.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),{EventEmitter}=require('events');
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={bizWebFetch,bizLocateCitation,bizCheckCitations,bizIpBlocked,bizNorm};';

// --- stub DNS: hostname -> chosen IPs ---
const HOSTS={'good.example':['93.184.216.34'],'priv.example':['192.168.1.10'],'loop.example':['127.0.0.1'],
 'v6local.example':['fd00::1'],'mapped.example':['::ffff:10.0.0.5'],'rebind.example':['93.184.216.34']};
const dnsStub={lookup:(h,o,cb)=>{const ips=HOSTS[h]; if(!ips)return cb(new Error('ENOTFOUND')); cb(null,ips.map(a=>({address:a,family:a.includes(':')?6:4})));}};

// --- stub http(s): canned responses per path; records every attempted connection ---
const requests=[];
const PAGES={
 'good.example/':{status:200,body:'<html><body><p>Acme Manufacturing plans a 40-person hiring wave in Dallas this quarter.</p></body></html>'},
 'good.example/redir-priv':{status:302,headers:{location:'http://priv.example/'}},
 'priv.example/':{status:200,body:'<html><body>intranet</body></html>'},
 'good.example/loop1':{status:302,headers:{location:'/loop2'}},
 'good.example/loop2':{status:302,headers:{location:'/loop1'}},
 'good.example/big':{status:200,body:'x'.repeat(600*1024)},
 'good.example/secret':{status:200,body:'<html><body>public page</body></html>'},
};
function fakeLib(proto){return {request:(opts,cb)=>{
  const key=opts.hostname+opts.path; requests.push({proto,hostname:opts.hostname,path:opts.path,headers:opts.headers,lookup:opts.lookup});
  const res=new EventEmitter(); res.statusCode=(PAGES[key]||{status:404}).status; res.headers=(PAGES[key]||{}).headers||{};
  const req=new EventEmitter(); req.destroy=()=>{}; req.end=()=>{
    // exercise the connect-time lookup guard exactly like real http would
    opts.lookup(opts.hostname,{},(err)=>{ if(err){req.emit('error',err);return;}
      const p=PAGES[key]; if(!p){res.statusCode=404;res.headers={};} 
      process.nextTick(()=>{cb(res); if(p&&p.body){res.emit('data',Buffer.from(p.body));} res.emit('end');});});
  };
  req.setTimeout=()=>{}; process.nextTick(()=>cb&&null); return req;}};}
const c={require:(m)=>m==='dns'?dnsStub:m==='https'?fakeLib('https'):m==='http'?fakeLib('http'):require(m),
 module:{exports:{}},process:{env:{}},global:{},console,URL,Buffer,AbortSignal,setTimeout,clearTimeout,
 fetch:async()=>({ok:false})};
vm.runInNewContext(src,c);const f=c.module.exports.t;

(async()=>{
 // IP classification
 assert(f.bizIpBlocked('10.1.2.3')&&f.bizIpBlocked('192.168.0.1')&&f.bizIpBlocked('169.254.1.1')&&f.bizIpBlocked('127.0.0.1')&&f.bizIpBlocked('100.64.0.1')&&f.bizIpBlocked('172.16.5.5')&&f.bizIpBlocked('224.0.0.1')&&f.bizIpBlocked('0.0.0.0'));
 assert(f.bizIpBlocked('::1')&&f.bizIpBlocked('fd00::1')&&f.bizIpBlocked('fe80::1')&&f.bizIpBlocked('::ffff:10.0.0.5'),'v6 + mapped v4 blocked');
 assert(!f.bizIpBlocked('93.184.216.34')&&!f.bizIpBlocked('8.8.8.8'));
 // 1) public fetch works; no cookie/auth headers forwarded
 let r=await f.bizWebFetch('https://good.example/');assert(r.ok,'public fetch ok');assert(r.body.includes('hiring wave'));
 const h1=requests[requests.length-1].headers;assert(!h1.Cookie&&!h1.cookie&&!h1.Authorization&&!h1.authorization,'no credentials forwarded');
 // 2) private host blocked before any connect
 let n=requests.length;r=await f.bizWebFetch('http://priv.example/');assert.equal(r.error,'ssrf_blocked');assert.equal(requests.length,n+1,'request object created');
 // 3) loopback and v6 unique-local blocked
 assert.equal((await f.bizWebFetch('http://loop.example/')).error,'ssrf_blocked');
 assert.equal((await f.bizWebFetch('http://v6local.example/')).error,'ssrf_blocked');
 assert.equal((await f.bizWebFetch('http://mapped.example/')).error,'ssrf_blocked');
 // 4) redirect to private blocked at the hop
 n=requests.length;r=await f.bizWebFetch('https://good.example/redir-priv');assert.equal(r.error,'ssrf_blocked','redirect hop re-validated');
 // 5) scheme and credentials-in-url refused
 assert.equal((await f.bizWebFetch('file:///etc/passwd')).error,'scheme_not_allowed');
 assert.equal((await f.bizWebFetch('ftp://good.example/')).error,'scheme_not_allowed');
 assert.equal((await f.bizWebFetch('https://user:pw@good.example/')).error,'credentials_in_url');
 // 6) redirect loop bounded
 r=await f.bizWebFetch('https://good.example/loop1');assert.equal(r.error,'too_many_redirects');
 // 7) size cap
 r=await f.bizWebFetch('https://good.example/big');assert.equal(r.error,'too_large');
 // 8) citation locating: exact quote located, misquote not, and "located" is the vocabulary
 r=await f.bizLocateCitation('https://good.example/','Acme Manufacturing plans a 40-person hiring wave in Dallas this quarter.');
 assert.equal(r.located,true);assert.equal(r.reason,'located');
 r=await f.bizLocateCitation('https://good.example/','Acme Manufacturing plans a 400-person hiring wave in Dallas.');
 assert.equal(r.located,false);assert.equal(r.reason,'excerpt_not_found');
 r=await f.bizLocateCitation('http://priv.example/','intranet page');assert.equal(r.located,false);assert.equal(r.reason,'ssrf_blocked');
 // 9) citation cap: 6 claims -> 5 fetches, 6th is citation_cap
 n=requests.length;
 const claims=Array.from({length:6},()=>({url:'https://good.example/',quote:'Acme Manufacturing plans a 40-person hiring wave in Dallas this quarter.'}));
 const checks=await f.bizCheckCitations(claims);assert.equal(checks.length,6);
 assert.equal(checks.filter(x=>x.located).length,5);assert.equal(checks[5].reason,'citation_cap');
 assert.equal(requests.length,n+5,'exactly five fetches');
 console.log('PASS research tools: SSRF guard (private/loopback/link-local/mapped-v6/credential/scheme/redirect-hop), bounded redirects, size cap, no credential forwarding, citation located-vs-not-found vocabulary, citation cap.');
})().catch(e=>{console.error(e);process.exit(1)});
