/* Ship a receipt card from a bot's floor position to the Receipts tab. */
window.ReceiptShip = function (fromXY, receipt, tabEl) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const c = document.createElement('div'); c.className = 'rcard fly';
  c.innerHTML = `<div class="h"><i style="background:${receipt.color}">${receipt.initials}</i>${receipt.bot} · done</div><b>${receipt.title}</b><div class="r">${receipt.result}</div><div class="c"><span>Model costs</span><span>${receipt.cost}</span></div>`;
  c.style.left = fromXY[0] + 'px'; c.style.top = fromXY[1] + 'px';
  const t = tabEl.getBoundingClientRect();
  c.style.setProperty('--dx', (t.left - fromXY[0]) + 'px'); c.style.setProperty('--dy', (t.top - fromXY[1]) + 'px');
  if (reduce) { c.style.left = (t.left - 60) + 'px'; c.style.top = (t.bottom + 8) + 'px'; }
  document.body.appendChild(c);
  c.addEventListener('animationend', () => { c.remove(); const b = tabEl.querySelector('.badge-new'); if (b) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); } });
};
/* Opening Receipts: rows with id in unseen get .new for this visit only, then badge clears. */
window.ReceiptSeen = { mark(unseenIds) { document.querySelectorAll('.rrow').forEach(r => r.classList.toggle('new', unseenIds.includes(r.dataset.id))); localStorage.setItem('alter.receipts.seenAt', Date.now()); document.querySelectorAll('.badge-new').forEach(b => b.remove()); } };
