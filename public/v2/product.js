/* Renders the real sandbox authorization demo. No invented rows. */
(function () {
  'use strict';
  var list = document.querySelector('#demo-list');
  var note = document.querySelector('#demo-note');
  if (!list) return;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function usd(cents) {
    return '$' + (Number(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  var word = { ALLOW_SANDBOX: 'Allow', DENY: 'Deny', ASK: 'Ask' };

  fetch('/api/authorization/demo', { cache: 'no-store' }).then(function (r) {
    if (!r.ok) throw new Error('status');
    return r.json();
  }).then(function (data) {
    if (!data || !Array.isArray(data.scenarios)) throw new Error('shape');
    list.innerHTML = data.scenarios.map(function (row) {
      var result = row.result || {};
      var request = row.request || {};
      var decision = word[result.decision] || result.decision || '';
      var kind = result.decision === 'DENY' ? 'deny' : result.decision === 'ASK' ? 'ask' : '';
      return '<article class="row"><div><b>' + esc(row.name) + '</b><span class="amt">' + esc(usd(request.amountCents)) + '</span></div><div class="dec ' + kind + '">' + esc(decision) + '</div><p class="why">' + esc(result.reason || '') + '</p><p class="rule">' + esc(result.code || '') + ' · charged ' + esc(usd(result.chargedCents || 0)) + '</p></article>';
    }).join('');
    if (note) {
      note.textContent = 'Sandbox fixture from /api/authorization/demo. ' + (data.note || '') + ' Stored: ' + (data.stored ? 'yes' : 'no') + '. Charged on this response: ' + usd(data.chargedCents || 0) + '.';
    }
  }).catch(function () {
    list.innerHTML = '';
    if (note) note.textContent = 'The sandbox demo could not be read from this server.';
  });
})();
