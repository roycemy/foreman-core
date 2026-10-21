// Installed PWAs pick up new builds: SW v6 fetches with no-cache, the page re-checks on resume and reloads (or shows an Update bar while typing). The Grok manual wake box is gone.
const fs=require('fs'),assert=require('assert');
const sw=fs.readFileSync('public/sw.js','utf8'),h=fs.readFileSync('public/app.html','utf8'),con=fs.readFileSync('public/js/connect.js','utf8');
assert(/alter-shell-v9/.test(sw)&&/skipWaiting/.test(sw)&&/clients\.claim/.test(sw),'new service worker activates at once');
assert((sw.match(/cache: 'no-cache'/g)||[]).length>=2,'SW never serves the browser HTTP cache for shell files');
assert(/visibilitychange/.test(h)&&/r\.update\(\)/.test(h)&&/location\.reload\(\)/.test(h),'resume checks for a new SW and reloads');
assert(/typing\(\)\)bar\(\)/.test(h)&&/A new version of Alter is ready/.test(h),'Update bar when the user is typing');
assert(!/id="wakebox"/.test(con),'manual wake box is gone from the Reconnect sheet');
console.log('PASS pwa-update: new builds reach installed PWAs');
