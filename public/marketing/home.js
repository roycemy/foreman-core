(function(){var els=document.querySelectorAll('[data-seats]');if(!els.length||!window.fetch)return;
fetch('/api/founding/count',{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(j){
if(!j||typeof j.taken!=='number'||typeof j.limit!=='number')return;var left=Math.max(0,j.limit-j.taken);
var t=left?j.taken.toLocaleString()+' of '+j.limit.toLocaleString()+' founding seats claimed':'All '+j.limit.toLocaleString()+' founding seats are claimed';
els.forEach(function(e){e.textContent=t;e.classList.add('on')})}).catch(function(){});})();
