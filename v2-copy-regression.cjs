const fs = require('fs'), assert = require('assert'), path = require('path');
const files = [
  'public/v2/index.html',
  'public/v2/product/index.html',
  'public/v2/waitlist/index.html',
  'public/v2/example-receipt.html',
  'public/v2/v2.css',
  'public/v2/story.js',
  'public/v2/waitlist.js',
  'public/v2/product.js'
];
const text = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
assert.ok(!text.includes('\u2014'), 'em dash');
assert.ok(!/smart routing/i.test(text), 'smart routing');
assert.ok(!/take rate|market size|Apple Pay|Shopify/i.test(text), 'business claim');
assert.ok(!/Foreman|Your bots work/i.test(text), 'old name or old headline');
assert.ok(text.includes('Alter is the spending permission for AI agents: one budget and one receipt across every bot you run. Free for people.'), 'position');
assert.ok(text.includes('/api/waitlist'), 'waitlist endpoint');
assert.ok(text.includes('/api/founding/count'), 'seat counter');
assert.ok(text.includes('/api/authorization/demo'), 'sandbox demo');
assert.ok(text.includes('Example. Not a live job.'), 'example label');
assert.ok(text.includes('scrub: true'), '1:1 scrub');
assert.ok(fs.existsSync('public/v2/vendor/gsap.min.js') && fs.existsSync('public/v2/vendor/ScrollTrigger.min.js'), 'gsap files');
assert.ok(!/console\.log/.test(fs.readFileSync('public/v2/waitlist.js', 'utf8')), 'no client log');
const live = fs.readFileSync('public/index.html', 'utf8');
assert.ok(live.includes('Your bots work. You stay in'), 'live homepage left as it is');
assert.equal(path.basename('public/v2/index.html'), 'index.html');
console.log('PASS v2 copy stays on the spending-permission line, wires the real endpoints, and leaves the live homepage alone.');
