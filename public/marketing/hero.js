(function(){var rm=matchMedia('(prefers-reduced-motion: reduce)').matches;var $=function(s){return document.querySelector(s)};
function loop(steps,T){if(rm){steps.forEach(function(s){s[2]&&s[2]()});return;}function run(){steps.forEach(function(s){setTimeout(s[1],s[0])});setTimeout(run,T)}run();}
var A=$('#hvA');if(A){var f=$('.fold'),h=$('.hand'),k=$('.ask'),t=$('.toast'),reqs=[['Approve Meta ads for $49','Launch campaign · Daily budget'],['Publish post','LinkedIn · Launch announcement'],['Delete 120 old files','Shared drive · Cleanup']],n=0;
function mv(x,y){f.style.left=x+'%';f.style.top=y+'%'}
f.style.transition='left 2.4s cubic-bezier(.4,0,.2,1),top 2.4s cubic-bezier(.4,0,.2,1),opacity .4s';
loop([[0,function(){k.className='ask';h.className='hand';mv(30.4,23.4);f.style.opacity=0;t.textContent='Grok Bot is drafting the launch post'}],
[1200,function(){f.style.opacity=1}],[1800,function(){mv(49.3,38.3);t.textContent='Grok Bot handed off to Muse'}],[4400,function(){f.style.opacity=0}],
[5600,function(){var r=reqs[n++%3];k.querySelector('b').textContent=r[0];k.querySelector('.d').textContent='Muse · '+r[1];h.className='hand on';t.textContent='Muse raised a hand'}],
[6400,function(){k.className='ask on'}],[11000,function(){k.className='ask on ap';h.className='hand'}],[12600,function(){t.textContent='Approved by you · work continues'}],[15500,function(){k.className='ask'}]],17000);
if(rm){k.className='ask on'}}
var B=$('#hvB');if(B){var fd=$('.feed'),kb=$('.ask'),ev=[['GB','#121212','Grok Bot','finished competitor scan'],['IN','#2F6B55','Instinct','handed invoices to Muse'],['MU','#5A4A8A','Muse','drafted this week\'s memo'],['CL','#B4552D','Claude','started reconcile invoices']],i=0;
function add(){var e=ev[i++%ev.length],d=document.createElement('div');d.innerHTML='<span class="av" style="background:'+e[1]+';width:20px;height:20px;font-size:8px">'+e[0]+'</span><span><b>'+e[2]+'</b> '+e[3]+'</span>';fd.prepend(d);while(fd.children.length>3)fd.lastChild.remove()}
add();add();add();if(!rm){setInterval(add,3000)}
loop([[0,function(){kb.className='ask'}],[4000,function(){kb.className='ask on'}],[10000,function(){kb.className='ask on ap'}],[14000,function(){kb.className='ask'}]],16000);if(rm)kb.className='ask on'}
var C=$('#hvC');if(C){var ac=C.querySelector('.ask');
loop([[0,function(){C.classList.remove('in');ac.className='ask'}],[4500,function(){C.classList.add('in')}],[7000,function(){ac.className='ask on'}],[12000,function(){ac.className='ask on ap'}],[15500,function(){ac.className='ask'}]],17500);if(rm){C.classList.add('in');ac.className='ask on'}}
if(document.body.classList.contains('pa')){var rs=document.querySelectorAll('.rv');if(rm||!('IntersectionObserver' in window)){rs.forEach(function(e){e.classList.add('in')})}else{var io=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target)}})},{rootMargin:'0px 0px -10% 0px'});rs.forEach(function(e){io.observe(e)})}}
var v=$('.vid video');if(v&&v.play){var p=v.play();p&&p.catch&&p.catch(function(){})}
})();
