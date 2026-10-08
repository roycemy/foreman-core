/* Brand: the ONE source of truth for the product name.
   To rebrand the app, the OAuth consent page, the marketing site, the setup message, the Cursor
   deeplink server name, <title>s, aria-labels and alt text, change `name` below. Everything else derives from it.
   Load this file synchronously in <head> BEFORE any other script. */
window.BRAND = (function (prev) {
  var B = Object.assign({
    name: 'Black Box',            // <-- the one line to change
    upper: null,                  // derived: wordmark/caps text
    short: null,                  // derived: initials for compact marks
    siteUrl: null,                // public marketing site URL (null = no "Back to the site" link). Owner decides routing.
    appUrl: '/hq',                // where "Sign in" / "Open your HQ" go. Marketing is served at '/', the app at '/hq' (vercel.json).
    tagline: 'Every AI employee. One workplace.'
  }, prev || {});
  B.upper = B.upper || B.name.toUpperCase();
  B.short = B.short || B.name.split(/\s+/).map(function (w) { return w.charAt(0); }).join('').toUpperCase();
  var parts = B.upper.split(/\s+/);
  B.wordmarkHTML = parts.length > 1 ? parts.slice(0, -1).join(' ') + ' <b>' + parts[parts.length - 1] + '</b>' : '<b>' + B.upper + '</b>';
  B.t = function (s) { return String(s).replace(/\{brand\}/g, B.name).replace(/\{BRAND\}/g, B.upper); };
  /* Fill static slots. No-JS fallback: each slot keeps the neutral text authored inside it. */
  B.fill = function (root) {
    root = root || document;
    var q = function (sel, fn) { Array.prototype.forEach.call(root.querySelectorAll(sel), fn); };
    q('[data-brand]', function (el) { var v = el.getAttribute('data-brand'); el.textContent = v === 'upper' ? B.upper : v === 'short' ? B.short : B.name; });
    q('[data-brand-wordmark]', function (el) { el.innerHTML = B.wordmarkHTML; });
    q('[data-brand-attr]', function (el) {
      el.getAttribute('data-brand-attr').split(';').forEach(function (pair) {
        var i = pair.indexOf(':'); if (i < 1) return; el.setAttribute(pair.slice(0, i).trim(), B.t(pair.slice(i + 1).trim()));
      });
    });
    q('[data-brand-href]', function (el) { var k = el.getAttribute('data-brand-href'); if (B[k]) el.setAttribute('href', B[k]); else if (k === 'siteUrl') el.hidden = true; });
    var t = document.querySelector('title[data-brand-title]'); if (t) document.title = B.t(t.getAttribute('data-brand-title'));
  };
  var css = document.documentElement.style;
  css.setProperty('--brand-name', JSON.stringify(B.name));
  css.setProperty('--brand-upper', JSON.stringify(B.upper));
  css.setProperty('--brand-short', JSON.stringify(B.short));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { B.fill(document); });
  else B.fill(document);
  return B;
})(window.BRAND);
