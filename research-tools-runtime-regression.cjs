// Research tool layer (P1): RUNTIME tests against real Node http/dns/sockets, local fixtures only.
// Real client behavior cannot be masked here: Node truly skips lookup() for literal IPs, truly
// applies the Node 22 lookup callback contract, and truly drips bytes against the hard deadline.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),http=require('http');
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={bizWebFetch,bizLookupGuarded,BIZWEB};';

function load(dnsImpl){
  const c={require:(m)=>m==='dns'?dnsImpl:require(m),
    module:{exports:{}},process:{env:{}},global:{},console,URL,Buffer,AbortSignal,setTimeout,clearTimeout,
    fetch:async()=>({ok:false})};
  vm.runInNewContext(src,c);return c.module.exports.t;
}
(async()=>{
 // --- real DNS through the guarded lookup: localhost resolves to loopback and is refused ---
 const fReal=load(require('dns'));
 let r=await fReal.bizWebFetch('http://localhost/');
 assert.equal(r.error,'ssrf_blocked','localhost refused via real DNS lookup');
 // --- literal IPs: real Node connects without calling lookup; precheck must fire first ---
 // Nothing is listening on 127.0.0.1:80, so any bypass would surface as connect_error, not ssrf_blocked.
 for(const u of ['http://127.0.0.1/','http://2130706433/','http://0x7f.0.0.1/','http://0177.0.0.1/','http://127.1/','http://0.0.0.0/','http://[::1]/','http://[::ffff:127.0.0.1]/']){
   const t0=Date.now(); r=await fReal.bizWebFetch(u);
   assert.equal(r.error,'ssrf_blocked',u); assert(Date.now()-t0<1000,'refused pre-connect: '+u);
 }
 // --- fixture server on loopback, reached ONLY through test seams (port + classifier overrides) ---
 const seen=[];let dripClosed=false;
 const server=http.createServer((req,res)=>{
   seen.push(req.url);
   if(req.url==='/drip'){res.writeHead(200,{'content-type':'text/plain'});const iv=setInterval(()=>res.write('x'),50);res.on('close',()=>{clearInterval(iv);dripClosed=true;});return;}
   if(req.url==='/text'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end('<html><body><p>Acme Manufacturing plans a 40-person hiring wave in Dallas this quarter.</p></body></html>');return;}
   if(req.url==='/binary'){res.writeHead(200,{'content-type':'application/octet-stream'});res.end(Buffer.from([0,159,146,150]));return;}
   if(req.url==='/redir-literal'){res.writeHead(302,{location:'http://10.9.9.9/'});res.end();return;}
   if(req.url==='/noct'){res.writeHead(200);res.end('<html><body>untyped</body></html>');return;}
   res.writeHead(404);res.end();
 });
 await new Promise(res=>server.listen(0,'127.0.0.1',res));
 const port=server.address().port;
 const dnsStub={lookup:(h,o,cb)=>{ if(h!=='fixture.test')return cb(new Error('ENOTFOUND')); cb(null,[{address:'127.0.0.1',family:4}]); }};
 const f=load(dnsStub);
 // Without seam overrides the fixture is unreachable two ways:
 assert.equal((await f.bizWebFetch('http://fixture.test:'+port+'/text')).error,'port_not_allowed','non-default port refused');
 const savedPort=f.BIZWEB.allowPort; f.BIZWEB.allowPort=(p,proto)=>String(p)===String(port)||savedPort(p,proto);
 assert.equal((await f.bizWebFetch('http://fixture.test:'+port+'/text')).error,'ssrf_blocked','loopback DNS answer refused');
 assert.equal((await f.bizWebFetch('http://127.0.0.1:'+port+'/text')).error,'ssrf_blocked','literal loopback refused even on the fixture port');
 assert.equal(seen.length,0,'server saw zero requests');
 // Open the classifier seam for the drip/contract tests (127.0.0.1 treated as public ONLY here):
 const savedIp=f.BIZWEB.ipPublic; f.BIZWEB.ipPublic=(ip)=>ip==='127.0.0.1'?true:savedIp(ip);
 // Real Node lookup contract: wrong callback shape would throw ERR_INVALID_IP_ADDRESS inside http.
 r=await f.bizWebFetch('http://fixture.test:'+port+'/text');
 assert(r.ok,'real socket fetch through guarded lookup works');assert(r.body.includes('hiring wave'));
 // Content-type refusal on a real 200:
 r=await f.bizWebFetch('http://fixture.test:'+port+'/binary');assert.equal(r.error,'content_type_not_allowed');
 // Redirect to a literal IP the seam does NOT permit: initial fixture fetch succeeds
 // (seen by the server), the redirect hop's literal precheck refuses the target.
 const seenBefore=seen.length;
 r=await f.bizWebFetch('http://fixture.test:'+port+'/redir-literal');
 assert.equal(r.error,'ssrf_blocked','redirect to literal refused at the hop');
 assert(seen.slice(seenBefore).includes('/redir-literal'),'initial fixture request actually happened');
 r=await f.bizWebFetch('http://fixture.test:'+port+'/noct');assert.equal(r.error,'content_type_missing','missing content-type fails closed on real server');
 // Absolute deadline: drip one byte every 50ms; inactivity timeouts would never fire.
 const t0=Date.now(); r=await f.bizWebFetch('http://fixture.test:'+port+'/drip',null,1500);
 const elapsed=Date.now()-t0;
 assert.equal(r.error,'timeout','absolute abort while body drips');assert(elapsed>=1400&&elapsed<4000,'elapsed '+elapsed+'ms ~ 1500ms budget');
 await new Promise(res=>setTimeout(res,200)); assert(dripClosed,'timed-out request destroyed server-side');
 // Citation flow over real sockets:
 const cite=await (async()=>{const m=load(dnsStub);m.BIZWEB.allowPort=f.BIZWEB.allowPort;m.BIZWEB.ipPublic=f.BIZWEB.ipPublic;
   return m.bizWebFetch('http://fixture.test:'+port+'/text');})();
 assert(cite.ok&&cite.body.includes('40-person hiring wave'),'citation fixture reachable');
 f.BIZWEB.allowPort=savedPort; f.BIZWEB.ipPublic=savedIp;
 server.close();
 console.log('PASS research tools runtime: localhost refused via real DNS, 8 literal-IP forms refused pre-connect with real http (no lookup masking), real-socket fetch via guarded lookup (Node 22 contract), content-type refusal, redirect-to-literal refusal, absolute 1500ms abort under 50ms byte drip with server-side cleanup, zero fixture requests when guards engaged.');
})().catch(e=>{console.error(e);process.exit(1)});
