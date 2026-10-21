const assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('public/styles/components/reconnect-flag.css','utf8');
assert.match(css,/@media\(min-width:761px\)\{\s*\.a-corner\{width:300px;gap:6px\}/);
assert.match(css,/\.a-corner \.crew\{width:100%/);
assert.match(css,/\.dark-bar\{display:none!important\}/);
console.log('compact reconnect and duplicate banner regression passed');
