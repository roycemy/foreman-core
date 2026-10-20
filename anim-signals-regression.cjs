// Animations follow real signals: meetings end on the child job leaving queued (no 4.5s timer), no ambient breathing loop.
const fs=require('fs'),assert=require('assert');
const m=fs.readFileSync('public/js/components/meeting.js','utf8'),f=fs.readFileSync('public/js/floor.js','utf8'),c=fs.readFileSync('public/styles/app.css','utf8');
assert(!/sleep\(4500\)/.test(m),'no 4.5s meeting timer');
assert(/taskId&&BB\.task\(taskId\)/.test(m)&&/status!=='queued'/.test(m),'meeting ends when the child job leaves queued');
assert(/i<180/.test(m),'safety cap so a bot never stays away');
assert(/\[rf\.tp, rt\.tp\], t\.id\)/.test(f),'floor passes the child task id');
assert(!/animation:bb-breathe/.test(c),'no constant breathing loop');
console.log('PASS anim signals: meeting ends on job state, no idle loop');
