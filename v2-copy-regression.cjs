const fs = require('fs'), assert = require('assert');
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
const home = fs.readFileSync('public/v2/index.html', 'utf8');
assert.ok(!text.includes('\u2014'), 'em dash');
assert.ok(!/smart routing/i.test(text), 'smart routing');
assert.ok(!/take rate|market size|Apple Pay|Shopify/i.test(text), 'business claim');
assert.ok(!/Foreman|Your bots work/i.test(text), 'old name or old headline');
assert.ok(!/halts bots|sandboxes bots|sandbox(?:es)? the bot/i.test(text), 'bot halt or bot sandbox');
assert.ok(!/href="\/security"(?!\.html)/.test(text), 'bare /security link');
assert.ok(text.includes('href="/security.html"'), 'security page');
assert.ok(text.includes('Alter is the spending permission for AI agents: one budget and one receipt across every bot you run. Free for people.'), 'position');
assert.ok(text.includes('The bots keep working on their own servers. Alter routes the job and hands it off.'), 'action');
assert.ok(text.includes('You tap. The card is armed for that amount and that merchant. Anything else is declined.'), 'feedback');
assert.ok(text.includes('The hash is verified from the snapshot. What the bot says about the work is reported, not verified.'), 'memory');
assert.ok(text.includes('Example. No live card is issued. Nothing is charged.'), 'card example');
assert.ok(text.includes('/api/waitlist'), 'waitlist endpoint');
assert.ok(text.includes('/api/founding/count'), 'seat counter');
assert.ok(text.includes('/api/authorization/demo'), 'card sandbox fixture');
assert.ok(text.includes('Example. Not a live job.'), 'example label');
assert.ok(text.includes('scrub: true'), '1:1 scrub');
assert.ok(home.includes('id="hvA"'), 'homepage hero');
assert.ok(home.includes('/marketing/hero.css') && home.includes('/marketing/hero.js'), 'homepage motion');
assert.ok(home.includes('class="pa'), 'homepage body');
assert.ok(fs.existsSync('public/v2/vendor/gsap.min.js') && fs.existsSync('public/v2/vendor/ScrollTrigger.min.js'), 'gsap files');
assert.ok(!/console\.log/.test(fs.readFileSync('public/v2/waitlist.js', 'utf8')), 'no client log');
const live = fs.readFileSync('public/index.html', 'utf8');
assert.ok(live.includes('Your bots work. You stay in'), 'live homepage headline stays');
assert.ok(live.includes('id="hvA"'), 'live hero stays');
assert.ok(live.includes('href="/security.html"'), 'live security link');
assert.ok(!/href="\/security"(?!\.html)/.test(live), 'live bare security link');
console.log('PASS v2 extends the live homepage, keeps the spending-permission line, and leaves the live headline in place.');
