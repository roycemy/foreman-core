/* Estimate from the bot's last 10 finished jobs (min 3). Rounded to whole minutes; refreshed at most every 30s. */
window.JobEstimate = function (history, job, now = Date.now()) {
  const d = history.filter(j => j.finishedAt && j.startedAt).slice(-10).map(j => (j.finishedAt - j.startedAt) / 60000).sort((a, b) => a - b);
  if (d.length < 3) return { cls: 'none', text: 'No estimate yet', frac: 0 };
  const m = d.length % 2 ? d[(d.length - 1) / 2] : (d[d.length / 2 - 1] + d[d.length / 2]) / 2, med = Math.max(1, Math.round(m));
  if (!job.startedAt) return { cls: 'idle', text: `Usually about ${med} min once started (estimate)`, frac: 0 };
  const el = (now - job.startedAt) / 60000;
  if (el > m * 1.5) return { cls: 'long', text: `Taking longer than usual (usually about ${med} min)`, frac: 1 };
  const left = Math.max(1, Math.round(m - el));
  return { cls: 'run', text: `~${left} min left (estimate)`, frac: Math.min(.9, el / m) };
};
