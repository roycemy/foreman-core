// Link preview for /waitlist (text-message card only): public/waitlist.html carries one og/twitter tag set that points at the approved
// founding-seat card at /brand/og-founding.png (static, 1200x630 PNG), canonical and og:url are the bare /waitlist so ?src=... links
// share one card, and nothing the page already promises changed. Static check: node, fs and assert only, no network.
const fs=require('fs'),assert=require('assert');
const page=fs.readFileSync('public/waitlist.html','utf8');
const tag=(attr,name)=>[...page.matchAll(new RegExp('<meta '+attr+'="'+name.replace(/[:.]/g,m=>'\\'+m)+'" content="([^"]*)">','g'))].map(m=>m[1]);
const once=(attr,name)=>{const v=tag(attr,name);assert.equal(v.length,1,name+' appears exactly once (found '+v.length+')');return v[0];};
const IMG='https://www.alterhq.app/brand/og-founding.png';
// the card: exactly one og:image, an absolute production URL for the committed file
const ogImage=once('property','og:image');assert.ok(ogImage===IMG||ogImage.startsWith(IMG+'?v='),'og:image points at '+IMG+' (got '+ogImage+')');
assert.equal(once('name','twitter:image'),ogImage,'twitter:image is the same address as og:image');
assert.equal(once('name','twitter:card'),'summary_large_image','twitter:card is summary_large_image');
assert.equal(once('property','og:image:width'),'1200','og:image:width is 1200');assert.equal(once('property','og:image:height'),'630','og:image:height is 630');
assert.equal(once('property','og:image:type'),'image/png');
// the card text and the page address
assert.equal(once('property','og:title'),'You’ve been granted a founding seat · Alter');assert.equal(once('name','twitter:title'),'You’ve been granted a founding seat · Alter');
assert.equal(once('property','og:description'),'The control layer for AI bots.');assert.equal(once('name','twitter:description'),'The control layer for AI bots.');
assert.equal(once('property','og:type'),'website');assert.equal(once('property','og:site_name'),'Alter');
assert.equal(once('property','og:url'),'https://www.alterhq.app/waitlist','og:url is the bare /waitlist, so ?src= links group under one URL');
assert.equal((page.match(/<link rel="canonical" href="([^"]*)">/g)||[]).length,1);assert.ok(page.includes('<link rel="canonical" href="https://www.alterhq.app/waitlist">'),'canonical is the bare /waitlist');
assert.ok(/Reserved for you/.test(once('property','og:image:alt'))&&/Reserved for you/.test(once('name','twitter:image:alt')),'the image has alt text');
// the tags sit directly after the existing description, and the page's own content is intact
assert.ok(/<meta name="description" content="Join the Alter waitlist for access to one workspace for your AI team."><link rel="canonical"/.test(page),'tags follow the existing description meta');
assert.ok(page.includes('<title>Alter · Claim your founding seat</title>'),'the title is unchanged');
for(const must of ['Claim your founding seat',"fetch('/api/waitlist'",'consent'])assert.ok(page.includes(must),'the page still contains '+must);
// the committed card: a real PNG, 1200x630
const png=fs.readFileSync('public/brand/og-founding.png');
assert.deepEqual([...png.subarray(0,8)],[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],'public/brand/og-founding.png is a PNG');
assert.equal(png.toString('ascii',12,16),'IHDR');assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[1200,630],'the PNG IHDR reads 1200x630');
console.log('PASS waitlist link preview: one og/twitter tag set pointing at the static founding-seat card (png, 1200x630), bare /waitlist canonical and og:url, summary_large_image, page content unchanged');
