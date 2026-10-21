/* Drop-in: pan clamp + panning state for the floor. Wire to floor.js pan/zoom. */
(function(){
  const MARGIN = 24; // px of island that must stay visible from every edge
  /* clamp(pan, zoom, islandRect, stageRect): keeps the island inside the stage (which already ends above the dock) */
  window.AlterDock = {
    clamp(pan, islandW, islandH, stageW, stageH){
      // island smaller than stage: it stays fully inside (MARGIN from every edge, so never behind dock/top bar)
      // island larger (zoomed): edges may travel only MARGIN past the stage edge
      const lim = (i, s) => i <= s ? Math.max(0, (s - i) / 2 - MARGIN) : (i - s) / 2 + MARGIN;
      const lx = lim(islandW, stageW), ly = lim(islandH, stageH);
      return [Math.min(lx, Math.max(-lx, pan[0])), Math.min(ly, Math.max(-ly, pan[1]))];
    },
    /* call on pointerdown/move (panning=true) and 1.2s after the last move or on reset (false) */
    setPanning(on){
      const d = document.querySelector('.dock'); if (!d) return;
      d.classList.toggle('panning', on);
      const inp = d.querySelector('.typebox input');
      if (inp) inp.placeholder = on ? 'Tell your team what to do' : 'Type a message for the team…';
    }
  };
  let t; addEventListener('alter:pan', e => { AlterDock.setPanning(true); clearTimeout(t); t = setTimeout(() => AlterDock.setPanning(false), 1200); });
})();
