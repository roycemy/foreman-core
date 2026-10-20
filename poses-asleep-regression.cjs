// Asleep pose: closed eyes + static Zs only on real offline signals (reconnect, dark, Muse idle). No loop.
const fs=require('fs'),assert=require('assert'),f=fs.readFileSync('public/js/floor.js','utf8'),c=fs.readFileSync('public/styles/app.css','utf8');
assert(/\['reconnect', 'dark', 'msg'\]\.includes\(s\.kind\)/.test(f),'asleep only from real botState kinds');
assert(/opts\.asleep/.test(f)&&/class="zzz"/.test(f),'figure draws closed eyes and Zs when asleep');
assert(!/\.zzz[^}]*animation/.test(c),'Zs are static, no loop');
console.log('PASS asleep pose: real signals only, static');
