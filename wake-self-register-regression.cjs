// Grok registers its own webhook trigger from the one setup message: via the console card or foreman_presence, never in chat.
const fs=require('fs'),assert=require('assert');
const con=fs.readFileSync('public/js/connect.js','utf8'),run=fs.readFileSync('public/runner.html','utf8'),srv=fs.readFileSync('api/index.js','utf8');
assert(/first choice[^']*Webhook trigger[^']*Instant wake card of the console/.test(con),'setup message makes the webhook trigger the first choice and points at the console card');
assert(/Never print the secret in chat, in a URL or in a log/.test(con),'setup message forbids printing the secret');
assert(/email fallback/.test(con),'email stays as the fallback');
assert(/id="wakesec" type="password"/.test(run)&&/\$\('wakesec'\)\.value=''/.test(run),'console card masks the secret and clears it after sending');
assert(/call\('presence',\{wakeChannel:'webhook',wakeTarget:u,wakeSecret:s\}\)/.test(run),'console sends it over the authenticated presence call');
assert(!/location|searchParams|href/.test(run.slice(run.indexOf("$('wakereg')"),run.indexOf("$('disconnect')"))),'secret never goes in a URL');
assert(/if\(w\.channel==='webhook'\)\{let ok=false[\s\S]*Test wake accepted \(webhook\)/.test(srv),'a newly stored webhook target gets one test ping, result logged for the owner');
console.log('PASS wake-self-register: one setup message, secret never in chat');
