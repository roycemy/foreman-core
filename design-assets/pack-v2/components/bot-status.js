/* Honest status. Inputs come from BB.status(a)/BB.signal(a) in public/js/core.js. Never says Working without a running job. */
window.BotStatus = function (a, now = Date.now()) {
  const mins = a.lastSeen ? Math.max(1, Math.round((now - a.lastSeen) / 60000)) : null;
  if (a.needsReconnect) return { cls: 'reconnect', line: 'Needs reconnect', why: a.reasonText, act: 'Fix' };
  if (a.paused) return { cls: 'paused', line: 'Paused', why: 'Paused by you · jobs wait', act: 'Resume' };
  if (a.runningJob) return { cls: 'working', line: `Working · ${a.runningJob.title}`, why: null };
  return { cls: 'queued', line: `Queued · last check-in ${mins ?? '–'} min ago`, why: a.cadence ? `${a.name} checks in about every ${a.cadence} min` : 'Starts at its next check-in' };
};
