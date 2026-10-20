/* Pan clamp. Call from floor.js fit() before writing --px/--py:  pan = BB.clampPan(pan, fw, stageW, stageH).
   The floor's centre may move anywhere inside the free band between the top bar and the dock;
   anything beyond is cut by the dock fade, so it can never sit under the heading, chips or type box. */
(function(){const BB=window.BB=window.BB||{};
BB.clampPan=function(pan,fw,W,H){const st=document.getElementById('stage');const dock=parseFloat(getComputedStyle(st).getPropertyValue('--dock'))||188;
 const fh=fw*750/1320, freeTop=20, freeBot=H-dock, cy0=H*.48; // floor centre at rest (translate -52%)
 const maxX=Math.max(0,(fw-W)/2+W*.25), minY=Math.min(0,freeTop+fh*.25-cy0), maxY=Math.max(0,freeBot-fh*.25-cy0);
 return [Math.max(-maxX,Math.min(maxX,pan[0])),Math.max(minY-Math.max(0,(fh-(freeBot-freeTop))/2),Math.min(maxY,pan[1]))];};})();
