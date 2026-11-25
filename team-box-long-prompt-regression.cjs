const fs=require('fs'),vm=require('vm'),assert=require('assert');
// Client: the team box must accept long pastes (was maxlength=120, which silently cut an owner's pasted team prompt mid-word).
const html=fs.readFileSync('public/app.html','utf8');
const m=html.match(/id="askin"[^>]*?maxlength="(\d+)"/);
assert(m,'ask box declares a maxlength');
assert(Number(m[1])>=4000,'ask box accepts long prompts, got '+m[1]);
// Server: full text is preserved into brief before the 120-char title cap applies.
const src=fs.readFileSync('api/index.js','utf8')+'\nmodule.exports.t={preserveFullPrompt,newTask};';
const c={require,module:{exports:{}},process:{env:{}},global:{},console,fetch:()=>{throw Error('NO NETWORK')},setTimeout,clearTimeout,URL,AbortSignal};
vm.runInNewContext(src,c);const f=c.module.exports.t;
(async()=>{
const long='Team task: improve the Alter dashboard itself. Grok: research the best examples of live, interactive AI team dashboards. Muse: propose the floor visuals. Instinct: audit and synthesize everything into one result for the owner.';
assert(long.length>120,'fixture is longer than the title cap');
const b=f.preserveFullPrompt({title:long});
assert.equal(b.brief,long,'full text preserved in brief');
const t=await f.newTask(b);
assert.equal(t.title.length,120,'title still capped at 120 for display');
assert(t.brief.includes('Instinct: audit and synthesize'),'nothing past char 120 is lost');
const short=f.preserveFullPrompt({title:'short job'});
assert.equal(short.brief,undefined,'short prompts unchanged');
const kept=f.preserveFullPrompt({title:long,brief:'explicit brief'});
assert.equal(kept.brief,'explicit brief','an explicit brief always wins');
const handler=src.slice(src.indexOf("if (path === '/tasks' && req.method"));
assert(handler.includes('preserveFullPrompt(body)'),'the tasks route preserves the full prompt before routing');
console.log('PASS team box long prompts: client accepts long pastes, server preserves full text in brief, 120-char display cap intact, explicit brief wins, no network');
})().catch(e=>{console.error(e);process.exit(1)});
