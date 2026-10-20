// alterhq.app is the canonical origin; foreman-core.vercel.app keeps working as an alias.
const fs=require('fs'),assert=require('assert');
const api=fs.readFileSync('api/index.js','utf8'),con=fs.readFileSync('public/js/connect.js','utf8');
assert(api.includes("const PUBLIC_ORIGIN='https://www.alterhq.app'"),'canonical origin is alterhq.app');
assert(api.includes("const OAUTH_ORIGIN='https://foreman-core.vercel.app'"),'old origin kept');
assert(/originOk=o=>o===OAUTH_ORIGIN\|\|o===PUBLIC_ORIGIN/.test(api),'both origins accepted');
assert(/originOk\(req\.headers\.origin\)/.test(api),'origin checks use both');
assert(/alterhq\\.app\$\/.test\(String\(req&&req.headers/.test(api),'metadata host-aware');
assert(!/FIRST open \$\{OAUTH_ORIGIN\}\/runner/.test(api),'setup message runner link uses alterhq.app');
assert(con.includes("PRODUCTION_ORIGIN = 'https://www.alterhq.app'")&&con.includes("ALT_ORIGIN = 'https://foreman-core.vercel.app'"),'connect page treats both as production');
assert(/onProd\(\)/.test(con),'no redirect off alterhq.app');
console.log('PASS origin alias: alterhq.app canonical, vercel.app keeps working');
