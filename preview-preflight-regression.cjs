// The Preview isolation preflight (scripts/preview-isolation-preflight.cjs) must fail closed: it passes only when the Preview resolves (by
// the app's own precedence, KV_* before UPSTASH_*) to a different store host than production, with URL and token from the same variable
// family, a fresh ENC_SECRET, and no outbound-capable variables. Anything missing, unknown, ambiguous or mixed fails. It never prints a
// value and has no network code. Fixtures are fake; offline.
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert');
const {run}=require('./scripts/preview-isolation-preflight.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'preflight-'));let n=0;
const file=obj=>{const p=path.join(dir,'e'+(++n)+'.env');fs.writeFileSync(p,Object.entries(obj).map(([k,v])=>k+'="'+v+'"').join('\n')+'\n');return p;};
const SECRETS=['tok-prod-SECRET-1','tok-prev-SECRET-2','enc-prod-SECRET-3','enc-prev-SECRET-4','resend-SECRET-5','tok-other-SECRET-6'];
const PROD={KV_REST_API_URL:'https://prod-store-111.upstash.io',KV_REST_API_TOKEN:'tok-prod-SECRET-1',ENC_SECRET:'enc-prod-SECRET-3',RESEND_API_KEY:'resend-SECRET-5'};
const PREV={KV_REST_API_URL:'https://preview-store-222.upstash.io',KV_REST_API_TOKEN:'tok-prev-SECRET-2',ENC_SECRET:'enc-prev-SECRET-4'};
const check=(prev,prod,extra=[])=>{const r=run(['--preview',typeof prev==='string'?prev:file(prev),'--production',typeof prod==='string'?prod:file(prod),...extra]);for(const s of SECRETS)assert.ok(!r.text.includes(s),'never prints a value ('+s+')');return r;};
const fails=(r,re,label)=>{assert.equal(r.code,1,label+': must fail\n'+r.text);assert.match(r.text,re,label);assert.match(r.text,/RESULT: FAIL/,label);};
// pass: separate store, same-family credentials, fresh ENC_SECRET, no outbound variables
{const r=check(PREV,PROD);assert.equal(r.code,0,r.text);assert.match(r.text,/host preview-store-222\.upstash\.io/);assert.match(r.text,/RESULT: PASS \(static configuration only; not a runtime proof\)/);}
// UPSTASH_* family alone also passes (the app falls back to it)
{const r=check({UPSTASH_REDIS_REST_URL:'https://preview-store-222.upstash.io',UPSTASH_REDIS_REST_TOKEN:'tok-prev-SECRET-2',ENC_SECRET:'enc-prev-SECRET-4'},PROD);assert.equal(r.code,0,r.text);}
// the dangerous case: Preview resolves to the production store
fails(check({...PREV,KV_REST_API_URL:'https://PROD-STORE-111.upstash.io/'},PROD),/SAME store host \(prod-store-111\.upstash\.io\)/,'same host (case and trailing slash normalized)');
// KV_* wins over UPSTASH_*: a Preview-only UPSTASH_* binding is ignored if a shared KV_* is present
fails(check({KV_REST_API_URL:PROD.KV_REST_API_URL,KV_REST_API_TOKEN:'tok-prod-SECRET-1',UPSTASH_REDIS_REST_URL:'https://preview-store-222.upstash.io',UPSTASH_REDIS_REST_TOKEN:'tok-prev-SECRET-2',ENC_SECRET:'enc-prev-SECRET-4'},PROD),/ambiguous store/,'KV_* shared with production overrides a Preview UPSTASH_* binding');
// missing store: the app would silently run on memory
fails(check({ENC_SECRET:'enc-prev-SECRET-4'},PROD),/in-memory store/,'no store URL');
// mismatched provenance: URL from KV_*, token falls back to UPSTASH_*
fails(check({KV_REST_API_URL:'https://preview-store-222.upstash.io',UPSTASH_REDIS_REST_TOKEN:'tok-prev-SECRET-2',ENC_SECRET:'enc-prev-SECRET-4'},PROD),/mismatched provenance/,'URL and token from different families');
// URL with no token at all
fails(check({KV_REST_API_URL:'https://preview-store-222.upstash.io',ENC_SECRET:'enc-prev-SECRET-4'},PROD),/no store token/,'no token');
// two token families that disagree
fails(check({...PREV,UPSTASH_REDIS_REST_TOKEN:'tok-other-SECRET-6'},PROD),/ambiguous credentials/,'two different tokens');
// KV_URL pointing at another store
fails(check({...PREV,KV_URL:'rediss://default:x@prod-store-111.upstash.io:6379'},PROD),/ambiguous store/,'KV_URL names another store');
// same token value reused, even with a different host
fails(check({...PREV,KV_REST_API_TOKEN:'tok-prod-SECRET-1'},PROD),/tokens are the same value/,'token reused');
// not https / not a URL
fails(check({...PREV,KV_REST_API_URL:'http://preview-store-222.upstash.io'},PROD),/not https/,'http');
fails(check({...PREV,KV_REST_API_URL:'not a url'},PROD),/not a valid URL/,'garbage URL');
// ENC_SECRET missing or reused
fails(check({KV_REST_API_URL:PREV.KV_REST_API_URL,KV_REST_API_TOKEN:PREV.KV_REST_API_TOKEN},PROD),/ENC_SECRET missing/,'ENC_SECRET missing');
fails(check({...PREV,ENC_SECRET:'enc-prod-SECRET-3'},PROD),/reuses the production value/,'ENC_SECRET reused');
// outbound-capable variables on the Preview fail unless explicitly allowed
fails(check({...PREV,RESEND_API_KEY:'resend-SECRET-5'},PROD),/outbound-capable variables: RESEND_API_KEY/,'outbound variable');
{const r=check({...PREV,RESEND_API_KEY:'resend-SECRET-5'},PROD,['--allow-outbound','RESEND_API_KEY']);assert.equal(r.code,0,r.text);assert.match(r.text,/allowed by flag: RESEND_API_KEY/);}
// production identity unknown: cannot prove isolation
fails(check(PREV,{ENC_SECRET:'enc-prod-SECRET-3'}),/production store identity UNKNOWN/,'production unknown');
fails(check(PREV,path.join(dir,'missing.env')),/ABORT file not found/,'production export missing');
fails(check(file({...PREV}),file({...PROD}),['--bogus','x']),/ABORT unknown argument/,'bad argument');
// a duplicate key with different values is ambiguous
{const p=path.join(dir,'dup.env');fs.writeFileSync(p,'KV_REST_API_URL=https://a.upstash.io\nKV_REST_API_URL=https://b.upstash.io\n');fails(check(p,PROD),/defined twice/,'duplicate key');}
// no network code in the script at all
{const src=fs.readFileSync(path.join(__dirname,'scripts/preview-isolation-preflight.cjs'),'utf8');assert.ok(!/require\(['"](https?|net|dns|tls|child_process)['"]\)|\bfetch\s*\(/.test(src),'the preflight has no network or process-spawning code');}
fs.rmSync(dir,{recursive:true,force:true});
console.log('PASS preview preflight: passes only for a separate store host with same-family credentials, a fresh ENC_SECRET and no outbound variables; fails closed on the same host, KV_* overriding a Preview UPSTASH_* binding, no store, mixed provenance, missing token, two tokens, conflicting store URLs, a reused token, non-https or bad URLs, missing or reused ENC_SECRET, outbound variables, an unknown or missing production export and bad input; prints no values; has no network code');
