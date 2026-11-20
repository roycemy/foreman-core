#!/usr/bin/env node
// Preview isolation preflight. Fails closed. Static configuration evidence only: it reads two config exports (Preview and Production) that
// the owner produced on their own machine, and makes ZERO network requests (no Alter, no provider, no store). It is not a runtime proof.
//
// It resolves the store each environment would use EXACTLY as api/index.js:52-53 does:
//   URL   = KV_REST_API_URL   || UPSTASH_REDIS_REST_URL
//   TOKEN = KV_REST_API_TOKEN || UPSTASH_REDIS_REST_TOKEN
// and then compares store IDENTITY (normalized REST host), never tokens. It aborts (exit 1) on anything missing, unknown, ambiguous, or
// with mismatched provenance (URL and TOKEN not from the same variable family), and if the Preview would reach the production store.
// It never prints a secret value: only variable names, normalized hosts, and "same"/"different" verdicts.
//
// Usage:
//   node scripts/preview-isolation-preflight.cjs --preview <preview.env> --production <production.env> [--allow-outbound NAME[,NAME]]
// Input: dotenv files (KEY=value or KEY="value", # comments), e.g. the files `vercel env pull` writes for each environment and branch,
// or a JSON object {"KEY":"value"}. Delete those files after the run: they hold secret values.
'use strict';
const fs = require('fs'), crypto = require('crypto'), path = require('path');

// Variables that let a Preview reach real external services or real people. A Preview used for the bot proof should not carry them.
const OUTBOUND = ['RESEND_API_KEY', 'WAKE_EMAIL_FROM', 'WAKE_INSTINCT_EMAIL', 'WAKE_GROK_EMAIL', 'WAKE_GROK_SLACK_WEBHOOK', 'WAKE_GITHUB_TOKEN',
  'WAKE_GITHUB_REPO', 'ALTER_MODEL_KEY', 'ALTER_MODEL_WS', 'CRON_SECRET', 'STRIPE_ISSUING_TEST_WEBHOOK_SECRET'];
const STORE_URL_VARS = ['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL'];
const STORE_ALL_URL_VARS = ['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL', 'KV_URL', 'REDIS_URL'];

function parseArgs(argv) {
  const a = { allow: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--preview') { a.preview = v; i++; } else if (k === '--production') { a.production = v; i++; }
    else if (k === '--allow-outbound') { a.allow = String(v || '').split(',').map(s => s.trim()).filter(Boolean); i++; }
    else throw new Error('unknown argument ' + k);
  }
  return a;
}
function parseExport(file) {
  if (!file) throw new Error('missing file argument');
  if (!fs.existsSync(file)) throw new Error('file not found: ' + file);
  const text = fs.readFileSync(file, 'utf8');
  if (/^\s*\{/.test(text)) { const o = JSON.parse(text); if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('JSON export must be an object'); return o; }
  const env = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/); if (!m) throw new Error('unparseable line in ' + path.basename(file));
    let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (m[1] in env && env[m[1]] !== v) throw new Error('variable ' + m[1] + ' is defined twice with different values in ' + path.basename(file));
    env[m[1]] = v;
  }
  return env;
}
const present = (env, k) => typeof env[k] === 'string' && env[k].trim() !== '';
const digest = v => crypto.createHash('sha256').update(String(v)).digest('hex'); // compared, never printed
function host(u) {
  let x; try { x = new URL(String(u).trim()); } catch { return null; }
  if (!x.hostname) return null;
  return { host: x.hostname.toLowerCase().replace(/\.$/, ''), protocol: x.protocol };
}
// Resolve the store exactly as the app does, and check where URL and TOKEN came from.
function resolveStore(env, label, out) {
  const urlVar = present(env, 'KV_REST_API_URL') ? 'KV_REST_API_URL' : present(env, 'UPSTASH_REDIS_REST_URL') ? 'UPSTASH_REDIS_REST_URL' : null;
  const tokVar = present(env, 'KV_REST_API_TOKEN') ? 'KV_REST_API_TOKEN' : present(env, 'UPSTASH_REDIS_REST_TOKEN') ? 'UPSTASH_REDIS_REST_TOKEN' : null;
  if (!urlVar) { out.fail(label + ': no store URL (neither KV_REST_API_URL nor UPSTASH_REDIS_REST_URL); the app would run on its in-memory store'); return null; }
  if (!tokVar) { out.fail(label + ': store URL set (' + urlVar + ') but no store token; UNKNOWN credentials'); return null; }
  const family = v => v.startsWith('KV_') ? 'KV' : 'UPSTASH';
  if (family(urlVar) !== family(tokVar)) { out.fail(label + ': mismatched provenance: URL from ' + urlVar + ' but token from ' + tokVar + ' (they may belong to different stores)'); return null; }
  const h = host(env[urlVar]);
  if (!h) { out.fail(label + ': ' + urlVar + ' is not a valid URL'); return null; }
  if (h.protocol !== 'https:') { out.fail(label + ': ' + urlVar + ' is not https'); return null; }
  // Every store URL the export carries must name the same store; otherwise it is ambiguous which one is real.
  const hosts = new Set();
  for (const k of STORE_ALL_URL_VARS) if (present(env, k)) { const hk = host(env[k]); if (!hk) { out.fail(label + ': ' + k + ' is not a valid URL'); return null; } hosts.add(hk.host); }
  if (hosts.size > 1) { out.fail(label + ': ambiguous store: the export names more than one store host (' + [...hosts].sort().join(', ') + ')'); return null; }
  // Both token families present with different values while one host is named: provenance is unclear.
  if (present(env, 'KV_REST_API_TOKEN') && present(env, 'UPSTASH_REDIS_REST_TOKEN') && env.KV_REST_API_TOKEN !== env.UPSTASH_REDIS_REST_TOKEN) {
    out.fail(label + ': ambiguous credentials: KV_REST_API_TOKEN and UPSTASH_REDIS_REST_TOKEN are both set and differ'); return null; }
  out.pass(label + ': store resolves from ' + urlVar + ' + ' + tokVar + ' -> host ' + h.host);
  return { host: h.host, tokenDigest: digest(env[tokVar]) };
}
function run(argv) {
  const lines = [], out = { failed: false, pass: m => lines.push('PASS  ' + m), fail: m => { out.failed = true; lines.push('FAIL  ' + m); } };
  let a, pre, prod;
  try { a = parseArgs(argv); pre = parseExport(a.preview); prod = parseExport(a.production); }
  catch (e) { return { code: 1, text: 'ABORT ' + e.message + '\nRESULT: FAIL (nothing was compared)' }; }
  lines.push('inputs: preview export sha256 ' + digest(fs.readFileSync(a.preview)).slice(0, 12) + ', production export sha256 ' + digest(fs.readFileSync(a.production)).slice(0, 12) + ' (file fingerprints, not values)');
  const p = resolveStore(pre, 'preview', out), q = resolveStore(prod, 'production', out);
  if (p && q) {
    if (p.host === q.host) out.fail('preview and production resolve to the SAME store host (' + p.host + '); the Preview would read and write production data');
    else out.pass('preview store host differs from production (' + p.host + ' vs ' + q.host + ')');
    if (p.tokenDigest === q.tokenDigest) out.fail('preview and production store tokens are the same value');
    else out.pass('preview and production store tokens differ');
  } else if (!q) out.fail('production store identity UNKNOWN: cannot prove the Preview is isolated from it');
  if (!present(pre, 'ENC_SECRET')) out.fail('preview: ENC_SECRET missing; the app would derive its encryption key from the store token or the literal "dev" (api/index.js:912)');
  else if (present(prod, 'ENC_SECRET') && digest(pre.ENC_SECRET) === digest(prod.ENC_SECRET)) out.fail('preview: ENC_SECRET reuses the production value; generate a fresh one');
  else out.pass('preview: ENC_SECRET present' + (present(prod, 'ENC_SECRET') ? ' and different from production' : ' (production export has none to compare)'));
  const outbound = OUTBOUND.filter(k => present(pre, k) && !a.allow.includes(k));
  if (outbound.length) out.fail('preview carries outbound-capable variables: ' + outbound.join(', ') + ' (unset them for the bot proof, or pass --allow-outbound with the owner\'s approval)');
  else out.pass('preview carries no outbound-capable variables' + (a.allow.length ? ' (allowed by flag: ' + a.allow.join(', ') + ')' : ''));
  lines.push('RESULT: ' + (out.failed ? 'FAIL (do not deploy this Preview)' : 'PASS (static configuration only; not a runtime proof)'));
  return { code: out.failed ? 1 : 0, text: lines.join('\n') };
}
module.exports = { run };
if (require.main === module) { const r = run(process.argv.slice(2)); console.log(r.text); process.exit(r.code); }
