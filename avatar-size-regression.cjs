const assert=require('node:assert/strict'),fs=require('node:fs');
const floor=fs.readFileSync('public/js/floor.js','utf8');
assert.equal((floor.match(/BB.phone\(\) \? \.062 : \.054/g)||[]).length,3);
assert.match(floor,/fw = Math.max\(100, Math.min\(W \+ \(BB.phone\(\) \? -8 : 16\), \(bottom - top\) \* ASPECT\)\)/);
console.log('desktop/tablet figures reduced; phone figures and island fit preserved');
