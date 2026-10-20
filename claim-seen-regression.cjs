// A bot that checks in but never asks for work is shown as such; a bot that asked recently keeps the plain cadence line.
const fs=require('fs'),assert=require('assert');
const BB={tasks:()=>BB._t,presence:()=>'connected',isGhost:()=>false,pollSec:()=>300,wentDark:()=>false,runningTask:()=>null,signal:()=>'available',S:{}};global.window={BB};
eval(fs.readFileSync('public/js/components/bot-status.js','utf8'));
const ago=m=>new Date(Date.now()-m*60000).toISOString();
const a=o=>Object.assign({id:'g',name:'Grok Bot',status:'active',providerId:'grok',lastSeen:ago(2)},o);
BB._t=[{id:'t',assignee:'g',status:'queued'}];
let s=BB.honestStatus(a({}));assert(/has not asked for work \(never\)/.test(s.why),'never asked: '+s.why);
s=BB.honestStatus(a({lastClaimAt:ago(40)}));assert(/last 40 min ago/.test(s.why),'old claim: '+s.why);
s=BB.honestStatus(a({lastClaimAt:ago(3)}));assert(!/not asked/.test(s.why),'recent claim is fine');
BB._t=[];s=BB.honestStatus(a({}));assert(!/not asked/.test(s.why),'nothing waiting, nothing to flag');
const srv=fs.readFileSync('api/index.js','utf8');
assert(/SET','fm:claimSeen:'\+agent\.id/.test(srv),'claimTask records the claim time');
assert(/lastClaimAt: cls\[i\]/.test(srv),'state exposes lastClaimAt');
console.log('PASS claim-seen: pinging without claiming is visible');
assert(/a\.providerId === 'grok' && process\.env\.RESEND_API_KEY && process\.env\.WAKE_EMAIL_FROM && process\.env\.WAKE_GROK_EMAIL \? 'email'/.test(srv),'grok email wake via WAKE_GROK_EMAIL (Gmail, then a Gmail filter forwards to the bot inbox)');
assert(/Alter: job waiting for ' \+ who/.test(srv),'subject stays "Alter: job waiting for <bot name>"');
assert(/Waiting on '\+\[\.\.\.new Set\(openKids/.test(srv)&&/openKids\.length\?'Waiting on '/.test(srv),'a done parent with an open handed-off part reads Waiting on <bot>, not Delivered');
