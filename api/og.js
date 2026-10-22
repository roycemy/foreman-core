// OG image for a public receipt (vnext D-og-1200x630): the owner-written title at 76/600 on porcelain, the artifact card tilted -3deg,
// the two facts and the mark. Built as SVG and rasterised with resvg using the bundled Geist fonts (SIL OFL, api/fonts).
// Only the owner-reviewed public snapshot is read (no bot or owner identity), so the image never shows more than the public page.
const fs = require('fs'), path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const { publicReceiptRead, invitePreview } = require('./index.js');
const invitePage = (() => { try { return require('../lib/invite-page.cjs'); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; return require('./lib/invite-page.cjs'); } })();
const FONT_DIR = path.join(__dirname, 'fonts');
const FONTS = { 400: 'Geist-Regular.ttf', 500: 'Geist-Medium.ttf', 600: 'Geist-SemiBold.ttf' };
const MONO = 'GeistMono-Variable.ttf'; // SIL OFL, same family as Geist
const BRAND = process.env.BRAND_NAME || 'alter';

/* --- advance widths straight from the font (cmap format 4 + hmtx), for line breaking --- */
const METRICS = {};
function metrics(w) {
  if (METRICS[w]) return METRICS[w];
  const b = fs.readFileSync(path.join(FONT_DIR, FONTS[w])), n = b.readUInt16BE(4), T = {};
  for (let i = 0; i < n; i++) { const o = 12 + i * 16; T[b.toString('latin1', o, o + 4)] = b.readUInt32BE(o + 8); }
  const upm = b.readUInt16BE(T.head + 18), nh = b.readUInt16BE(T.hhea + 34), adv = i => b.readUInt16BE(T.hmtx + Math.min(i, nh - 1) * 4);
  const cm = T.cmap, nt = b.readUInt16BE(cm + 2); let sub = null;
  for (let i = 0; i < nt; i++) { const pid = b.readUInt16BE(cm + 4 + i * 8), eid = b.readUInt16BE(cm + 6 + i * 8), off = b.readUInt32BE(cm + 8 + i * 8); if (pid === 3 && eid === 1 && b.readUInt16BE(cm + off) === 4) sub = cm + off; }
  const glyph = c => {
    if (!sub) return 0; const seg = b.readUInt16BE(sub + 6) / 2, ends = sub + 14, starts = ends + seg * 2 + 2, deltas = starts + seg * 2, ranges = deltas + seg * 2;
    for (let i = 0; i < seg; i++) {
      if (c > b.readUInt16BE(ends + i * 2)) continue; const st = b.readUInt16BE(starts + i * 2); if (c < st) return 0;
      const d = b.readInt16BE(deltas + i * 2), ro = b.readUInt16BE(ranges + i * 2);
      if (!ro) return (c + d) & 0xffff; const g = b.readUInt16BE(ranges + i * 2 + ro + (c - st) * 2); return g ? (g + d) & 0xffff : 0;
    } return 0;
  };
  const cache = {}; return METRICS[w] = { upm, width: ch => { const c = ch.codePointAt(0); return cache[c] != null ? cache[c] : (cache[c] = adv(glyph(c > 0xffff ? 63 : c))); } };
}
function measure(text, size, w, track) { const m = metrics(w); let u = 0; for (const ch of text) u += m.width(ch); return u * size / m.upm + (track || 0) * size * Math.max(0, [...text].length - 1); }
/* balanced wrap (text-wrap: balance): fewest lines that fit, then the narrowest widest line */
function wrap(text, size, w, track, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean); if (!words.length) return [''];
  const fits = lim => { const out = []; let cur = ''; for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (measure(t, size, w, track) <= lim) cur = t; else { if (cur) out.push(cur); cur = wd; } } if (cur) out.push(cur); return out; };
  let lines = fits(maxW); if (lines.length > maxLines) return null;
  let lo = maxW * .5, hi = maxW; for (let k = 0; k < 18; k++) { const mid = (lo + hi) / 2; if (fits(mid).length <= lines.length) hi = mid; else lo = mid; }
  lines = fits(hi); return lines.length > maxLines ? null : lines;
}
function clip(text, size, w, maxW) { let t = String(text); if (measure(t, size, w) <= maxW) return t; while (t && measure(t + '…', size, w) > maxW) t = t.slice(0, -1); return t.trim() + '…'; }
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = usd => usd == null ? null : usd > 0 && usd < .01 ? '<$0.01' : '$' + Number(usd).toFixed(2);
const mark = (x, y, s, ink) => { const k = s / 48; return `<g transform="translate(${x} ${y}) scale(${k}) translate(-4 -17)"><path d="M8 33 V37 L32 49 L56 37 V33" fill="${ink}" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/><path d="M8 33 L32 21 L56 33 L32 45 Z" fill="#F4F4F1" stroke="${ink}" stroke-width="3.5" stroke-linejoin="round"/><circle cx="36" cy="33" r="4" fill="#E8452C"/></g>`; };

function card(snap) {
  const s = snap, W = 1200, H = 630, T = 'font-family="Geist"';
  let size = 76, lines = null; for (const sz of [76, 68, 60, 52]) { lines = wrap(s.title, sz, 600, -.045, 600, 3); if (lines) { size = sz; break; } }
  if (!lines) { size = 52; lines = wrap(clip(s.title, 52, 600, 1700), 52, 600, -.045, 600, 3) || [clip(s.title, 52, 600, 600)]; }
  const lh = size * 1.02, hy = 144 + size * .8;
  const head = lines.map((l, i) => `<text x="72" y="${(hy + i * lh).toFixed(1)}" ${T} font-weight="600" font-size="${size}" letter-spacing="${(-.045 * size).toFixed(2)}" fill="#121212">${esc(l)}</text>`).join('');
  const facts = []; const c = money(s.reportedModelCostUsd); if (c) facts.push([c, 'model costs (reported)']); if (s.approvals != null) facts.push([String(s.approvals), s.approvals === 1 ? 'approval' : 'approvals']);
  let fx = 72; const factSvg = facts.map(([v, l]) => { const a = `<text x="${fx}" y="${H - 64}" ${T} font-size="22"><tspan font-weight="600" fill="#121212">${esc(v)}</tspan><tspan font-weight="400" fill="#5C5C57"> ${esc(l)}</tspan></text>`; fx += measure(v + ' ' + l, 22, 500) + 40; return a; }).join('');
  /* card: the owner-written reusable template, never the job's raw result */
  const tl = String(s.template).split(/\n+/).map(x => x.trim()).filter(Boolean), at = tl[0] || s.title, ap = tl.slice(1).join(' ') || s.summary;
  const atl = wrap(at, 36, 600, -.03, 440, 2) || [clip(at, 36, 600, 440)], apl = clip(ap, 16, 400, 440), name = clip(s.outcome === 'completed' ? 'Reusable job template' : 'Template · job stopped', 16, 500, 440);
  const cx = 720, cy = 96, cw = 520, ph = 320, mh = 62;
  const artSvg = `<g transform="rotate(-3 ${cx + cw / 2} ${cy + (ph + mh) / 2})" filter="url(#sh)">
    <rect x="${cx}" y="${cy}" width="${cw}" height="${ph + mh}" rx="20" fill="#FFFFFF"/>
    <clipPath id="top"><rect x="${cx}" y="${cy}" width="${cw}" height="${ph}" rx="20"/><rect x="${cx}" y="${cy + 40}" width="${cw}" height="${ph - 40}"/></clipPath>
    <rect x="${cx}" y="${cy}" width="${cw}" height="${ph}" fill="url(#dark)" clip-path="url(#top)"/>
    <text x="${cx + 32}" y="${cy + 44}" ${T} font-size="12" font-weight="400" fill="#FFFFFF" fill-opacity=".7">Job template</text>
    <rect x="${cx + cw - 96}" y="${cy + 30}" width="64" height="64" rx="16" fill="#E2452B"/>
    ${atl.map((l, i) => `<text x="${cx + 32}" y="${cy + ph - 72 - (atl.length - 1 - i) * 40}" ${T} font-size="36" font-weight="600" letter-spacing="-1.1" fill="#FFFFFF">${esc(l)}</text>`).join('')}
    <text x="${cx + 32}" y="${cy + ph - 36}" ${T} font-size="16" font-weight="400" fill="#FFFFFF" fill-opacity=".7">${esc(apl)}</text>
    <text x="${cx + 24}" y="${cy + ph + 38}" ${T} font-size="16" font-weight="500" fill="#121212">${esc(name)}</text></g>`;
  const bn = 'Public receipt' + (s.outcome === 'completed' ? '' : ' · stopped');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="dark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1B1B1A"/><stop offset="1" stop-color="#2A2826"/></linearGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#121212" flood-opacity=".16"/></filter></defs>
    <rect width="${W}" height="${H}" fill="#F4F4F1"/>${artSvg}
    ${mark(72, 70, 28, '#121212')}<text x="112" y="91" ${T} font-size="20" font-weight="500" fill="#5C5C57">${esc(bn)}</text>
    ${head}${factSvg}
    ${mark(W - 72 - measure(BRAND, 20, 600, -.045) - 34, H - 56 - 21, 22, '#121212')}<text x="${W - 72}" y="${H - 58}" text-anchor="end" ${T} font-size="20" font-weight="600" letter-spacing="-.9" fill="#121212">${esc(BRAND)}</text></svg>`;
}

/* --- invite card (direction B, og-b3): the HQ floor on the right, nameplate on the floor, text bottom-left. Static. --- */
let FLOOR = null;
const floorUri = () => FLOOR || (FLOOR = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(FONT_DIR, 'invite-floor.jpg')).toString('base64'));
const LOCKUP = (x, y, h) => { const k = h / 48; return `<g transform="translate(${x} ${y}) scale(${k})"><g transform="translate(0 6) scale(.72) translate(-4 -17)"><path d="M8 33 V37 L32 49 L56 37 V33" fill="#111" stroke="#111" stroke-width="3" stroke-linejoin="round"/><path d="M8 33 L32 21 L56 33 L32 45 Z" fill="#F4F3EF" stroke="#111" stroke-width="3.5" stroke-linejoin="round"/><circle cx="36" cy="33" r="4" fill="#E8452C"/></g><text x="52" y="34" font-family="Geist" font-weight="600" font-size="30" letter-spacing="-1.2" fill="#111">alter</text></g>`; };
function inviteCard(v) {
  const name = v && v.name ? invitePage.cleanName(v.name) : '', seat = v ? invitePage.nextSeat(v.taken) : null, personal = !!(name && seat);
  const W = 1200, H = 630, T = 'font-family="Geist"', M = 'font-family="Geist Mono"';
  const hs = 74, nameW = measure(name + ' saved', hs, 600, -3 / hs);
  const size = personal && nameW > 560 ? Math.max(48, Math.floor(hs * 560 / nameW)) : hs;
  const l1 = personal ? (measure(name + ' saved', size, 600, -3 / hs) <= 600 ? name + ' saved' : clip(name, size, 600, 600 - measure(' saved', size, 600)) + ' saved') : 'A seat is';
  const l2 = personal ? 'you a seat.' : 'saved for you.';
  const eb = personal ? `from ${name}, at alter hq` : 'an invite to alter hq';
  const plateTxt = personal ? `seat ${String(seat).padStart(3, '0')} / 1,000` : 'founding seat / 1,000';
  const pw = Math.max(measure('Reserved for you', 24, 600) , 26 + 17 * .6 * plateTxt.length) + 44, px = 760, py = 250, ph = 78;
  const ty = H - 70, tagY = ty - 6, h2 = tagY - 26 - 20 - 4, h1y = h2 - size * 1.02, eY = h1y - size * .78 - 18;
  const tx = px + pw / 2, dotX = tx - (17 * .6 * plateTxt.length + 17) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><linearGradient id="fx" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F4F4F1"/><stop offset=".34" stop-color="#F4F4F1"/><stop offset=".44" stop-color="#F4F4F1" stop-opacity=".85"/><stop offset=".6" stop-color="#F4F4F1" stop-opacity="0"/></linearGradient>
  <linearGradient id="fy" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#F4F4F1" stop-opacity=".9"/><stop offset=".22" stop-color="#F4F4F1" stop-opacity="0"/></linearGradient>
  <radialGradient id="gl"><stop offset="0" stop-color="#FFE2AA" stop-opacity=".55"/><stop offset="1" stop-color="#FFE2AA" stop-opacity="0"/></radialGradient>
  <filter id="ps" x="-30%" y="-30%" width="160%" height="190%"><feDropShadow dx="0" dy="22" stdDeviation="20" flood-color="#000" flood-opacity=".22"/></filter></defs>
  <rect width="${W}" height="${H}" fill="#F4F4F1"/>
  <image x="320" y="-34" width="1180" height="652" preserveAspectRatio="none" xlink:href="${floorUri()}" href="${floorUri()}"/>
  <ellipse cx="${tx}" cy="${py + 40}" rx="200" ry="150" fill="url(#gl)"/>
  <rect width="${W}" height="${H}" fill="url(#fx)"/><rect width="${W}" height="${H}" fill="url(#fy)"/>
  <g filter="url(#ps)"><rect x="${px}" y="${py + 8}" width="${pw}" height="${ph}" rx="9" fill="#2A2A27"/><rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="9" fill="#111"/></g>
  <text x="${tx}" y="${py + 34}" text-anchor="middle" ${T} font-weight="600" font-size="24" letter-spacing="-.3" fill="#F4F4F1">Reserved for you</text>
  <circle cx="${dotX + 4.5}" cy="${py + 58}" r="4.5" fill="#E8452C"/>
  <text x="${dotX + 17}" y="${py + 64}" ${M} font-size="17" fill="#F4F4F1" fill-opacity=".78">${esc(plateTxt)}</text>
  ${LOCKUP(80, 68, 42)}
  <text x="80" y="${eY.toFixed(1)}" ${M} font-size="19" fill="#6B6A64">${esc(eb)}</text>
  <text x="77" y="${h1y.toFixed(1)}" ${T} font-weight="600" font-size="${size}" letter-spacing="-3" fill="#111">${esc(l1)}</text>
  <text x="77" y="${h2.toFixed(1)}" ${T} font-weight="600" font-size="${size}" letter-spacing="-3" fill="#111">${esc(l2)}</text>
  <text x="80" y="${tagY}" ${T} font-size="26" fill="#3A3935">Your bots work. You stay in control.</text></svg>`;
}
function missing() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#F4F4F1"/>${mark(72, 72, 28, '#121212')}<text x="116" y="94" font-family="Geist" font-size="22" font-weight="600" letter-spacing="-1" fill="#121212">${esc(BRAND)}</text><text x="72" y="330" font-family="Geist" font-size="64" font-weight="600" letter-spacing="-2.8" fill="#121212">Receipt not available</text></svg>`;
}
function render(svg) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 }, font: { fontFiles: [...Object.values(FONTS), MONO].map(f => path.join(FONT_DIR, f)), loadSystemFonts: false, defaultFontFamily: 'Geist' } });
  return r.render().asPng();
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const q = req.query || Object.fromEntries(new URL(req.url || '/', 'http://x').searchParams);
    const m = String(req.url || '').split('?')[0].match(/\/og\/([A-Za-z0-9_-]+)(?:\.png)?$/) || [null, String(q.file || q.token || '').replace(/\.png$/, '')];
    const inv = String(m[1] || '').match(/^invite-([a-f0-9]{32}|generic)$/);
    if (inv) { // per-invite link card: seat + name come from the database via the invite code, never from the query string
      let v = null; if (inv[1] !== 'generic') { try { v = await invitePreview(inv[1]); } catch { v = null; } }
      const png = render(inviteCard(v));
      res.setHeader('Content-Type', 'image/png'); res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400');
      res.statusCode = 200; return res.end(png);
    }
    const x = m[1] && m[1] !== 'missing' ? await publicReceiptRead(m[1]) : null;
    const png = render(x ? card(x.snapshot) : missing());
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = x || m[1] === 'missing' ? 200 : 404; res.end(png);
  } catch (e) { res.statusCode = 500; res.setHeader('Content-Type', 'text/plain'); res.end('og error'); }
};
module.exports.card = card; module.exports.inviteCard = inviteCard; module.exports.render = render;
