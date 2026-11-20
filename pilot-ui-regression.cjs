// Two-bot trial UI wiring (static; the full browser run is scripts outside CI). A handoff approval must open the exact-package review
// first; the page must be routable; the trial helper must not overwrite the floor's BB.handoffLine; bot text goes through esc().
const fs=require('fs'),path=require('path'),assert=require('assert');const rd=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const html=rd('public/app.html'),core=rd('public/js/core.js'),app=rd('public/js/app.js'),trial=rd('public/js/trial.js'),inbox=rd('public/js/inbox.js'),css=rd('public/styles/components/trial.css');
assert.ok(html.includes('<script src="/js/trial.js"></script>')&&html.includes('id="v-trial"')&&html.includes('data-act="trial"')&&html.includes('/styles/components/trial.css'),'page, menu entry, script and styles are wired');
assert.ok(/VIEWS = \[[^\]]*'trial'/.test(app)&&app.includes("if (k === 'trial') return BB.go('#trial');"),'#trial is a route');
assert.ok(/q\.action === 'pilot\.handoff' && d === 'approve' && !\(opts && opts\.reviewed\)\) return BB\.reviewHandoff/.test(core),'approving a handoff anywhere opens the review first');
assert.ok(!/BB\.handoffLine\s*=/.test(trial),'trial.js leaves the floor animation helper alone');
assert.ok(inbox.includes("i.q.action === 'pilot.handoff' && BB.pilotLine"),'HQ cards use the trial line');
assert.ok(trial.includes("pkg.fingerprint !== q.detailsHash")&&trial.includes("detailsHash: pkg.fingerprint"),'the review refuses a changed package and approves the fingerprint it showed');
for(const f of ['m.excerpt','m.reason','pkg.request.instructions','pkg.request.title','p.result','p.transcript','r.summary'])assert.ok(trial.includes('esc('+f),f+' is escaped');
assert.ok(!/innerHTML\s*=\s*[^`'"]*\+\s*(?:m|pkg|p|q)\./.test(trial),'no raw concatenation of bot text into innerHTML');
assert.ok(css.includes('.modal>.box.tr-review{max-height'),'the review scrolls inside the box on small screens');
console.log('PASS trial UI wiring: route, menu, review-first approval, no helper collision, escaped bot text, scrollable review');
