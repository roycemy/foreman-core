/* Draft keeper: keeps typed work in Business "Bring it work" boxes across navigation.
   Attaches to business.js's existing DOM ([data-run-input]) without changing it.
   Key = account + workspace + responsibility id, in sessionStorage (this tab only).
   Cleared on a successful run, and every saved draft is dropped when the signed-in
   account or workspace changes, so a draft never shows in another workspace/account. */
(function () {
  var BB = window.BB = window.BB || {};
  var P = 'fm:draft:', last;
  function ident() { var w = BB.who; return w && w.email ? w.email + '|' + (w.legacy ? 'legacy' : (w.workspace || '')) : null; }
  function S() { try { return window.sessionStorage; } catch (e) { return null; } }
  function key(id, who) { return P + encodeURIComponent(who) + ':' + encodeURIComponent(id); }
  function purge(keepWho) {
    var s = S(); if (!s) return; var pre = keepWho ? P + encodeURIComponent(keepWho) + ':' : null;
    for (var i = s.length - 1; i >= 0; i--) { var k = s.key(i); if (k && k.indexOf(P) === 0 && (!pre || k.indexOf(pre) !== 0)) s.removeItem(k); }
  }
  function check() { var w = ident(); if (w !== last) { if (last !== undefined) purge(w); last = w; } return w; }
  BB.draftKeeper = {
    key: key, ident: ident, check: check,
    save: function (id, v) { var w = check(), s = S(); if (!w || !s || !id) return; if (v && v.trim()) s.setItem(key(id, w), v); else s.removeItem(key(id, w)); },
    get: function (id) { var w = check(), s = S(); return w && s ? s.getItem(key(id, w)) : null; },
    clear: function (id) { var w = check(), s = S(); if (w && s) s.removeItem(key(id, w)); }
  };
  function restore(root) {
    if (!root || !root.querySelectorAll) return;
    var list = root.matches && root.matches('[data-run-input]') ? [root] : root.querySelectorAll('[data-run-input]');
    for (var i = 0; i < list.length; i++) { var ta = list[i]; if (ta.value) continue; var v = BB.draftKeeper.get(ta.dataset.runInput); if (v) ta.value = v; }
  }
  // Clear only after the server accepted the run (same success test business.js uses), and only if the saved
  // draft is still exactly the submitted text. Newer text typed while the run was in flight is kept and put back
  // after business.js empties the box on completion.
  if (typeof BB.api === 'function' && !BB.api.__draftKeeper) {
    var orig = BB.api;
    BB.api = async function (path, method, body) {
      var m = /^\/api\/business\/responsibilities\/([^/]+)\/run$/.exec(path || '');
      if (!m || method !== 'POST') return orig.apply(this, arguments);
      var id = decodeURIComponent(m[1]), w = ident(), sent = body && typeof body.input === 'string' ? body.input : null;
      var j = await orig.apply(this, arguments);
      if (j && !j.error && w && w === ident()) {
        var cur = BB.draftKeeper.get(id);
        if (cur === null || cur === sent) BB.draftKeeper.clear(id);
        else setTimeout(function () { if (typeof document !== 'undefined') restore(document.getElementById('v-business')); }, 0);
      }
      return j;
    };
    BB.api.__draftKeeper = true;
  }
  if (typeof document === 'undefined') return;
  document.addEventListener('input', function (e) { var t = e.target; if (t && t.matches && t.matches('#v-business [data-run-input]')) BB.draftKeeper.save(t.dataset.runInput, t.value); }, true);
  function attach() {
    var V = document.getElementById('v-business'); if (!V) return;
    new MutationObserver(function (ms) { check(); for (var i = 0; i < ms.length; i++) for (var j = 0; j < ms[i].addedNodes.length; j++) restore(ms[i].addedNodes[j]); }).observe(V, { childList: true, subtree: true });
    restore(V);
  }
  if (BB.on) BB.on(check);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach); else attach();
})();
