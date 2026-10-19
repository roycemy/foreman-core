"""Round 2 splice: pv-diorama.r1.js (round 1) + pv-r2.js -> pv-diorama.js. Explicit anchors; fails loudly if one moves."""
L=open('pv-diorama.r1.js').read().split('\n')
r2=open('pv-r2.js').read().rstrip('\n')
def idx(prefix,start=0):
    for i in range(start,len(L)):
        if L[i].lstrip().startswith(prefix.lstrip()): return i
    raise SystemExit('missing '+prefix)
a=idx('/* ---------- identity'); b=idx('window.avatarHTML=')
L[a:b+1]=['const hash=s=>{let h=0;for(const ch of String(s))h=(h*31+ch.charCodeAt(0))>>>0;return h};']+r2.split('\n')
def rep(prefix,new):
    i=idx(prefix); L[i]=new
i=idx('ROOMS={sales:')
L[i]=" ROOMS={};['sales','support','marketing','ops','finance','lounge'].forEach(k=>{ROOMS[k]={n:typeOf(k).name.toUpperCase(),type:ROOM_MAP[k],...rect(BOXW[k])}});"
rep("const oldMk=mkEl;","const oldMk=mkEl;mkEl=function(a){oldMk(a);a._fig='';const b=a.el.querySelector('.body');['.bub','.tok','.tag2','.bdg','.gnd'].forEach(s=>{const x=a.el.querySelector(s);if(x){x.hidden=true;x.setAttribute('aria-hidden','true')}});const d=document.createElement('i');d.className='sdot';d.setAttribute('aria-hidden','true');b.appendChild(d);drawFig(a);a.el.setAttribute('aria-label','Open '+a.name+' details');a.el.addEventListener('mouseenter',()=>showLabel(a));a.el.addEventListener('mouseleave',()=>hideLabel(a));a.el.addEventListener('focus',()=>showLabel(a));a.el.addEventListener('blur',()=>hideLabel(a));};")
rep("function drawFig(a)","const poseOf=a=>a.el&&a.el.classList.contains('walk')&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'walk':(['working','handoff','meeting'].includes(a.st)&&!a._motion&&!a._approvalWalking&&!a._approvalArrival&&presence(a)==='connected'?'sit':'stand');\nfunction drawFig(a){if(!a.el)return;const p=presence(a),pose=poseOf(a),key=p+'|'+a.name+'|'+pose+'|'+(castMap[a.id]);if(a._fig===key)return;a._fig=key;const av=a.el.querySelector('.avs');if(av)av.innerHTML=figureSVG(a,{ghost:p==='prepared'||p==='waiting',pose})}")
i=idx("function list(){")
L[i+1]="  el.innerHTML=head+agents.map(a=>{const p=presence(a);return '<button data-worker=\"'+a.id+'\" class=\"fw p-'+p+'\" data-kind=\"'+statusKind(a)+'\">'+avatarHTML(a,26)+'<span class=\"fw-t\"><b>'+esc(a.name)+'</b><small><i class=\"d\" aria-hidden=\"true\"></i>'+esc(humanStatus(a))+'</small></span></button>'}).join('');"
i=idx("const signs=Object.entries(SIGNS)")
L[i]=" const signs=Object.entries(SIGNS).map(([k,v])=>{const p=signPct(...v);return '<div class=\"zone-sign\" data-room=\"'+k+'\" data-type=\"'+ROOM_MAP[k]+'\" style=\"left:'+p[0]+'%;top:'+p[1]+'%\">'+roomIcon(k)+'<span class=\"zs-name\">'+esc(typeOf(k).name)+'</span><span id=\"ct-'+k+'\"></span></div>'}).join('');"
i=idx("f.innerHTML='<img class=\"environment\"")
s=L[i]
s=s.replace("HQ floor: Research Center, Creative / Marketing, Outreach Center, Execution Center, a lounge, an arrivals pad and the approval island in the middle","HQ floor: '+['finance','marketing','sales','ops'].map(k=>typeOf(k).name).join(', ')+', '+typeOf('lounge').name+', an arrivals pad and the approval island in the middle")
s=s.replace("'+signs+'<div class=\"zone-sign appr\" style=\"left:'+ap[0]+'%;top:'+ap[1]+'%\">NEEDS APPROVAL<span id=\"ct-approval\"></span></div><div class=\"zone-sign arrivals\" style=\"left:'+ar[0]+'%;top:'+ar[1]+'%\">ARRIVALS</div>';","'+signs+'<div class=\"zone-sign appr\" style=\"left:'+ap[0]+'%;top:'+ap[1]+'%\"><span class=\"zs-name\">Needs you</span><span id=\"ct-approval\"></span></div><div class=\"zone-sign arrivals\" style=\"left:'+ar[0]+'%;top:'+ar[1]+'%\"><span class=\"zs-name\">Arrivals</span></div>';renderProps();")
assert 'renderProps' in s and 'typeOf(k).name).join' in s, 'buildFloor'
L[i]=s
i=idx("e.setAttribute('aria-label',a.name+': '+a.now);drawFig(a)}")
L[i]="   const k=statusKind(a);e.dataset.kind=k;const sd=e.querySelector('.sdot');if(sd&&sd.dataset.k!==k){sd.dataset.k=k;sd.innerHTML=k==='reconnect'?presenceIcon('reconnect'):''}e.classList.toggle('at-island',!!a._approvalArrival);e.setAttribute('aria-label',a.name+': '+humanStatus(a)+'. Open details');drawFig(a)}"
i=idx("workerLabel(a);list();")
L[i]="  if(LBL===a.id&&a.el&&$('#floor-label'))showLabel(a,$('#floor-label').dataset.sticky==='1');list();const isl=$('#pv-island');if(isl&&isl.dataset.n!==String(G.approvals.length)){isl.dataset.n=G.approvals.length;isl.innerHTML=islandSVG(G.approvals.length)}"
i=idx("workDestination=function")
L[i]=L[i].replace("place:'Research Center'","place:typeOf('finance').name").replace("place:'Execution Center'","place:typeOf('ops').name").replace("place:'Lounge (animation)'","place:typeOf('lounge').name")
i=idx("function workerLabel(a){")
j=i
while not L[j].rstrip().endswith("}}"): j+=1
L[i:j+1]=["/* old always-on name cards are gone: the single #floor-label (showLabel) replaces them */","function workerLabel(a){const o=document.querySelector('#worker-labels [data-label=\"'+a.id+'\"]');if(o)o.remove()}"]
i=idx("walk=async function(a,x,y)")
L[i+1]=L[i+1].replace("a.el.classList.add('walk');workerLabel(a);","a.el.classList.add('walk');drawFig(a);if(LBL===a.id)hideLabel(a);")
L[i+3]=L[i+3].replace("if(check()){a.el.classList.remove('walk');workerLabel(a)}","if(check()){a.el.classList.remove('walk');drawFig(a)}")
assert "drawFig(a);if(LBL" in L[i+1] and "remove('walk');drawFig" in L[i+3]
# 3.2: one eased glide per trip (ease in on the first leg, constant through corners, ease out on the last)
o3="for(const p of pts){if(!check())return;await walkStep(a,...p)}if(check()){a.el.classList.remove('walk');drawFig(a)}};"
assert o3 in L[i+3]
L[i+3]=L[i+3].replace(o3,"for(let k=0;k<pts.length;k++){if(!check())return;const n=pts.length;a.el.style.transitionTimingFunction=n===1?'cubic-bezier(.45,.05,.3,1)':k===0?'cubic-bezier(.42,0,1,1)':k===n-1?'cubic-bezier(0,0,.3,1)':'linear';await walkStep(a,...pts[k])}if(check()){a.el.style.transitionTimingFunction='';a.el.classList.remove('walk');drawFig(a)}};")
i=idx("card.innerHTML='<div class=\"fa-top\">")
s2=L[i].replace("'<div class=\"fa-top\"><span><i aria-hidden=\"true\"></i>At the approval island · '+ready.length+' waiting</span><span>Needs approval</span></div>","'<div class=\"fa-top\"><span><i aria-hidden=\"true\"></i>Needs you</span><span>'+(ready.length>1?'1 of '+ready.length:'')+'</span></div>").replace("' · '+esc(rawq.action||'')","(ACT[rawq.action]?' · '+ACT[rawq.action]:'')")
assert s2!=L[i]; L[i]=s2
i=idx("const oldRenderTray=renderTray;")
s2=L[i].replace("strip.innerHTML='Needs approval · Worker is walking to the center island. <a href=\"#approvals\">Review queue</a>';","const w=G.approvals.find(r=>r.a._approvalWalking&&!r.a._approvalArrival);strip.innerHTML=esc(w?w.a.name:'Someone')+' is bringing you a request. <a href=\"#approvals\">Review</a>';").replace("strip.className='clear';","strip.className='walking';")
assert s2!=L[i]; L[i]=s2
i=idx("window.HQ_FLOOR=")
L[i]="const _oDr=openDr;openDr=function(id){_oDr(id);const a=byId[id];if(a&&a.el&&$('#v-office').classList.contains('on'))showLabel(a,true)};const _cDr=closeDr;closeDr=function(){_cDr.apply(this,arguments);const l=$('#floor-label');if(l){l.style.display='none';LBL=null}};\nwindow.HQ_FLOOR={W2P,P2W,route,fit,ROOM_TYPES,ROOM_MAP};"
i=idx("function placeCard(){")
anchor="card.style.left=x+'px';card.style.top=y+'px';"
assert anchor in L[i+2] or anchor in L[i+1], 'placeCard anchor'
k=i+2 if anchor in L[i+2] else i+1
L[k]=L[k].replace(anchor,"{const lg=document.querySelector('.zone-sign[data-room=lounge]');if(lg){const r=lg.getBoundingClientRect(),L=r.left-vr.left,R=r.right-vr.left,T=r.top-vr.top,B=r.bottom-vr.top,h=card.offsetHeight;if(x<R&&x+card.offsetWidth>L&&y<B&&y+h>T){y=(B+10+h<=vr.height-12)?B+10:Math.max(12,T-h-10)}}}"+anchor,1)
i=idx("function fit(){")
old="f.style.setProperty('--floor-width',base*zoom+'px');f.style.setProperty('--floor-height',base*zoom/ASPECT+'px');"
assert old in L[i+2], 'fit anchor'
L[i+2]=L[i+2].replace(old,"const pz=(c&&innerWidth<760)?(window.HQ_PHONE_ZOOM||Math.max(1.3,Math.min(1.45,innerHeight*.4*ASPECT/Math.max(1,w)))):1;f.style.setProperty('--floor-width',base*zoom*pz+'px');f.style.setProperty('--floor-height',base*zoom*pz/ASPECT+'px');if(pz>1){const fwid=String(Math.round(base*zoom*pz));if(wrap.dataset.fw!==fwid&&!wrap.dataset.panned){wrap.dataset.fw=fwid;requestAnimationFrame(()=>{wrap.scrollLeft=(wrap.scrollWidth-wrap.clientWidth)/2})}}")
open('pv-diorama.js','w').write('\n'.join(L))
print('ok')
