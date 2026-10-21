(function(){var el=document.getElementById('loop');if(!el)return;
var rm=matchMedia('(prefers-reduced-motion: reduce)').matches;
if(rm){el.setAttribute('data-st','5');return;}
var steps=[[1,0],[2,2500],[3,8000],[4,10000],[5,12500]],T=20000;
function run(){el.classList.remove('out');steps.forEach(function(s){setTimeout(function(){el.setAttribute('data-st',s[0])},s[1])});setTimeout(function(){el.classList.add('out')},T-1200);setTimeout(function(){el.removeAttribute('data-st');setTimeout(run,300)},T-300);}
run();
var v=document.querySelector('.vid video');if(v){var p=v.play&&v.play();if(p&&p.catch)p.catch(function(){});}
})();
