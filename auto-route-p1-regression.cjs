// Routing phase 1: declared strengths are a fallback only. Scored history wins; exactly one declared bot routes; ties and no match stay unrouted.
const fs=require('fs'),assert=require('assert');
const srv=fs.readFileSync('api/index.js','utf8');
const CATEGORY_KEYWORDS={ops:[],sales:[],support:[],finance:[],research:[],marketing:[],creative:[]};
const i=srv.indexOf('const DEFAULT_STRENGTHS'),j=srv.indexOf('async function routingOrDeclared');
const {effStrengths}=new Function('CATEGORY_KEYWORDS',srv.slice(i,j)+';return {effStrengths};')(CATEGORY_KEYWORDS);
assert.deepStrictEqual(effStrengths({providerId:'grok'}),['research'],'Grok defaults to research');
assert.deepStrictEqual(effStrengths({providerId:'muse'}),['marketing','creative'],'Muse defaults to marketing and creative');
assert.deepStrictEqual(effStrengths({providerId:'grok',strengths:['sales','nonsense']}),['sales'],'owner list wins and unknown types are dropped');
assert.deepStrictEqual(effStrengths({providerId:'custom'}),[],'unknown providers declare nothing');
const f=srv.slice(srv.indexOf('async function routingOrDeclared'),srv.indexOf('async function routingOrDeclared')+900);
assert(/const adv = await routing\(cat\); if \(adv\.suggested\) return adv;/.test(f),'scored history is checked first and wins');
assert(/if \(ds\.length !== 1\) return adv;/.test(f),'two or zero declared bots stay unrouted');
assert(/!a\.paused/.test(f)&&/a\.status === 'active'/.test(f),'paused or inactive bots are never picked');
assert(/freshRoutingPick\(leadCat\)/.test(srv)&&/routingOrDeclared\(m\.category\)/.test(srv),'lead goes through the awake-aware pick; planned hops use the same advice');
assert(/const adv = await routingOrDeclared\(cat\)/.test(srv),'the awake-aware pick still defers to scored history and the single-declared rule first');
assert(/strengths\)\|\|body\.strengths\.length>8|body\.strengths\.length>8/.test(srv)&&/hasOwnProperty\.call\(CATEGORY_KEYWORDS,k\)/.test(srv),'strengths endpoint validates the list');
console.log('PASS auto-route-p1: declared strengths only as a single-bot fallback');
