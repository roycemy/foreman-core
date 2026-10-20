// The inspector header sits in a narrow side sheet at every width: it must always wrap so the status gets its own row, and Grok must offer Reconnect with the instant-wake box.
const fs=require('fs'),assert=require('assert');
const css=fs.readFileSync('public/styles/components/bot-status.css','utf8'),ins=fs.readFileSync('public/js/inspector.js','utf8'),con=fs.readFileSync('public/js/connect.js','utf8');
assert(/\.ins-h\{flex-wrap:wrap\}/.test(css),'header wraps at every width, not only under 760px');
assert(/\.ins-h \.t\{flex:1 1 200px;min-width:160px\}/.test(css),'status column keeps a readable minimum width');
assert(/\.ins-h \.ins-acts\{order:5;flex:1 1 100%/.test(css),'action buttons take their own row');
assert(/<div class="ins-acts">\$\{prim\}\$\{rec2\}<\/div>/.test(ins),'buttons live in the actions row');
assert(/providerId === 'grok' \? `<button class="b ink sm" type="button" data-rec[^`]*Reconnect/.test(ins),'Grok shows one Reconnect');
assert(/a\.providerId !== 'grok'/.test(ins),'Grok does not show the console-only New pairing code');
const dp=con.slice(con.indexOf('function drawPairing'),con.indexOf('/* HTTP gateway'));
assert(/wakeBoxHtml\(\)/.test(dp)&&/bindWake\(box\)/.test(dp),'Reconnect sheet for Grok carries the webhook URL and secret box');
console.log('PASS inspector-layout: header wraps, Grok Reconnect carries the wake box');
