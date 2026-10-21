/* Reasons map 1:1 to existing signals in public/js/core.js + connect.js (presence, W.reason, wentDark). */
window.ReconnectFlag = {
  WHY: {
    session_expired: 'Its session expired',
    refresh_replay: 'Its renewal token was reused',
    persistent_grant_missing: 'Its saved login is missing',
    revoked: 'Its access was revoked',
    quiet: 'Quiet for 30+ min'
  },
  /* el: .rflag; message: exact setup text from connect.js; console: {code} for console bots */
  async copy(el, message, opts = {}) {
    try { await navigator.clipboard.writeText(message); } catch (e) {}
    el.classList.add('copied');
    el.querySelector('button').textContent = 'Copied';
    el.querySelector('p').textContent = opts.console ? 'Pairing code ready' : 'Now paste it in Grok\'s chat';
    setTimeout(() => el.dispatchEvent(new CustomEvent('alter:paste-card', { bubbles: true, detail: opts })), 450);
  }
};
