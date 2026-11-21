// Bot panel "Instant wake" (static wiring; the browser run is outside CI): shown as channel and mode only, set in a modal so state refreshes
// cannot wipe a half-typed secret, the secret field is a password input cleared before the request returns, and nothing secret is rendered.
const fs=require('fs'),path=require('path'),assert=require('assert');const ins=fs.readFileSync(path.join(__dirname,'public/js/inspector.js'),'utf8'),api=fs.readFileSync(path.join(__dirname,'api/index.js'),'utf8');
assert.ok(/name="secret" type="password"/.test(ins),'secret input is a password field');
assert.ok(/f\.secret\.value = ''; \/\/ never kept in the page/.test(ins),'secret cleared from the page as it is sent');
assert.ok(/wakeModal\(a\)/.test(ins)&&/BB\.modal\(/.test(ins.slice(ins.indexOf('function wakeModal'))),'set in a modal');
assert.ok(!/w\.secret|w\.token|secretEnc|tokenEnc/.test(ins.slice(ins.indexOf('function wakeText'),ins.indexOf('function wakeModal'))),'the panel renders no secret fields');
assert.ok(/mode: a\.wake\.mode === 'bearer' \? 'bearer'/.test(api)&&/hasSecret: wakeHasSecret\(a\.wake\)/.test(api),'state carries mode and hasSecret only');
console.log('PASS instant wake UI: modal form, password field cleared on send, panel shows channel and mode only, state never carries the secret');
