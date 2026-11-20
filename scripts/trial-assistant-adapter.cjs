#!/usr/bin/env node
// Trial adapter for a real assistant that cannot call Alter itself (for example a chat app with no HTTP tools).
// It makes the four trial calls under ONE bot's own Alter gateway key; the assistant does the thinking in its own account, and the
// owner relays text between the assistant's chat and this tool. Label such a run "owner-relayed", never "autonomous".
//
// The key is read from the environment (ALTER_GATEWAY_KEY) or a file (ALTER_GATEWAY_KEY_FILE); it is never printed or logged.
// No model calls, no provider keys, no spend. No polling loop unless you ask for `wait`, which checks at most once a minute.
//
//   ALTER_BASE=https://<preview-host> ALTER_GATEWAY_KEY_FILE=~/.alter-scout-key node scripts/trial-assistant-adapter.cjs <command>
//   claim                     claim this bot's next job (prints the job id and title)
//   wait [minutes]            claim, checking once a minute for up to N minutes (default 10)
//   input <job>               print the job's input to paste into the assistant's chat (data, not instructions)
//   propose <job> <file>      A only: send the assistant's moments (JSON: {"moments":[...]}) as one pilot.handoff proposal
//   status <request>          show a proposal's status
//   complete <job> <file>     B only: return the assistant's captions (plain text, max 4,000 characters)
'use strict';
const fs = require('fs');
const BASE = String(process.env.ALTER_BASE || '').replace(/\/+$/, '');
const keyFile = process.env.ALTER_GATEWAY_KEY_FILE;
const KEY = String(process.env.ALTER_GATEWAY_KEY || (keyFile ? fs.readFileSync(keyFile.replace(/^~/, process.env.HOME || ''), 'utf8') : '')).trim();
const die = (msg, code) => { console.error(msg); process.exit(code || 2); };
if (!/^https?:\/\/[^/]+$/.test(BASE)) die('Set ALTER_BASE to the Alter origin, e.g. https://example.vercel.app');
if (!/^https:\/\//.test(BASE) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) die('ALTER_BASE must be https (http only for localhost)');
if (!KEY) die('Set ALTER_GATEWAY_KEY or ALTER_GATEWAY_KEY_FILE (this bot\'s own gateway key). The key is never printed.');
const ID = /^[A-Za-z0-9_]{1,64}$/;
async function call(method, path, body) {
  let res, j = {};
  try { res = await fetch(BASE + '/api' + path, { method, headers: { authorization: 'Bearer ' + KEY, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) }); }
  catch (e) { die('Network error: ' + String(e && e.message || e).slice(0, 120) + '. Nothing was changed by this tool; run the same command again.', 3); }
  try { j = await res.json(); } catch {}
  return { code: res.status, j };
}
const show = o => console.log(JSON.stringify(o, null, 2));
const [cmd, a1, a2] = process.argv.slice(2);
(async () => {
  if (cmd === 'claim' || cmd === 'wait') {
    const until = Date.now() + (cmd === 'wait' ? Math.min(60, Math.max(1, Number(a1) || 10)) : 0) * 60000;
    for (;;) {
      const r = await call('GET', '/gateway/tasks/next');
      if (r.code !== 200) die('Claim refused (' + r.code + '): ' + (r.j.reason || r.j.error || 'unknown'), 4);
      if (r.j.task) return show({ job: r.j.task.id, title: r.j.task.title, status: r.j.task.status, trial: r.j.task.pilot ? r.j.task.pilot.role : null, next: 'input ' + r.j.task.id });
      if (Date.now() >= until) return show({ job: null, note: 'No job for this bot yet. For the caption bot this means the owner has not approved a handoff.' });
      await new Promise(ok => setTimeout(ok, 60000));
    }
  }
  if (cmd === 'input') {
    if (!ID.test(a1 || '')) die('Usage: input <job id>');
    const r = await call('GET', '/gateway/tasks/' + a1 + '/input');
    if (r.code !== 200) die('Input not available (' + r.code + '): ' + (r.j.reason || r.j.error || 'not found'), 4);
    console.log('--- paste everything below into the assistant\'s chat ---');
    console.log('NOTE: ' + r.j.notice);
    if (r.j.role === 'source') {
      console.log('\nTASK: ' + r.j.instructions + '\nReply with JSON only, exactly this shape (1 to 5 moments, excerpts quoted exactly from the transcript):');
      console.log(JSON.stringify({ moments: r.j.next_step.request.params.moments }, null, 2));
      console.log('\nTRANSCRIPT' + (r.j.input_kind === 'paragraphs' ? ' (no timestamps: use paragraph refs like ¶3)' : '') + ':\n' + (r.j.paragraphs ? r.j.paragraphs.map(p => p.ref + ' ' + p.text).join('\n\n') : r.j.transcript));
    } else {
      console.log('\nTASK: ' + r.j.request.title + '\n' + r.j.request.instructions + '\nReply with the captions as plain text.');
      console.log('\nAPPROVED MOMENTS from ' + r.j.from.name + ':\n' + r.j.moments.map((m, i) => (i + 1) + '. [' + (m.ref || m.start + '-' + m.end) + '] "' + m.excerpt + '" (' + m.reason + ')').join('\n'));
    }
    return console.log('--- end ---');
  }
  if (cmd === 'propose') {
    if (!ID.test(a1 || '') || !a2) die('Usage: propose <job id> <moments.json>');
    let params; try { params = JSON.parse(fs.readFileSync(a2, 'utf8')); } catch { die('The file must contain JSON like {"moments":[...]}'); }
    if (!params || typeof params !== 'object' || Array.isArray(params) || Object.keys(params).join() !== 'moments') die('The JSON must have exactly one field, "moments". Alter refuses anything else.');
    const r = await call('POST', '/gateway/act', { action: 'pilot.handoff', task_id: a1, params });
    if (r.code === 202 || r.code === 200) return show({ request: r.j.request_id, status: r.j.status, duplicate: !!r.j.duplicate, next: 'The owner reviews the exact package in Alter. Nothing reaches the other bot unless they approve.' });
    die('Proposal refused (' + r.code + '): ' + (r.j.code ? r.j.code + ': ' : '') + (r.j.reason || r.j.error || 'unknown') + (r.j.receipt_id ? ' (receipt ' + r.j.receipt_id + ')' : ''), 4);
  }
  if (cmd === 'status') {
    if (!ID.test(a1 || '')) die('Usage: status <request id>');
    const r = await call('GET', '/gateway/requests/' + a1);
    if (r.code !== 200) die('Not found (' + r.code + ')', 4);
    return show({ request: r.j.id, status: r.j.status, reason: r.j.reason || null, decided: r.j.decidedAt || null });
  }
  if (cmd === 'complete') {
    if (!ID.test(a1 || '') || !a2) die('Usage: complete <job id> <captions.txt>');
    const text = fs.readFileSync(a2, 'utf8').trim();
    if (!text || text.length > 4000) die('Captions must be 1 to 4,000 characters of text.');
    const r = await call('POST', '/gateway/tasks/' + a1 + '/complete', { result: text });
    if (r.code === 200) return show({ job: a1, status: r.j.task.status, next: 'The owner sees the captions on the trial page. Nothing was published.' });
    die('Completion refused (' + r.code + '): ' + (r.j.reason || r.j.error || 'unknown'), 4);
  }
  die('Commands: claim | wait [minutes] | input <job> | propose <job> <file> | status <request> | complete <job> <file>');
})();
