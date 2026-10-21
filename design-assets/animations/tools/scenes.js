window.SC=(function(){const BB=window.BB;
const freeze=()=>{BB.emit=()=>{};BB.sync=async()=>{};};
const pose=(id,wx,wy,ps,cls)=>{const r=BB.F[id],a=BB.agent(id);const p=wx==null?[r.x,r.y]:BB.W2P(wx,wy);BB.setPos(r,p[0],p[1],0);r.key=null;
 r.el.classList.remove('walk','carry','gather');(cls||[]).forEach(c=>r.el.classList.add(c));
 r.el.querySelector('.avs').innerHTML=BB.figureSVG(a,{pose:ps||'stand',frame:ps==='walk'?1:undefined});
 if((cls||[]).includes('carry')&&!r.el.querySelector('.crate'))r.el.querySelector('.body').insertAdjacentHTML('beforeend',BB.CRATE);return r;};
const ov=()=>document.getElementById('ov');
const dot=(id,i)=>{const r=BB.F[id],sit=r.key==null?false:false;const d=document.createElement('div');d.className='wdot';d.style.left=r.x+'%';d.style.top=(r.y-(r.el.dataset.sit?11.2:14))+'%';d.style.setProperty('--wd',(-i*.4)+'s');ov().appendChild(d)};
const deskCrate=(id)=>{const r=BB.F[id];const d=document.createElement('div');d.className='desk-crate';d.style.left=(r.x+2.2)+'%';d.style.top=(r.y-3.2)+'%';d.style.setProperty('--fig',getComputedStyle(r.el).getPropertyValue('--fig'));d.innerHTML=BB.CRATE.replace('class="crate"','style="width:100%;display:block"');ov().appendChild(d)};
const sitDots=ids=>{document.querySelectorAll('#ov .fx').forEach(e=>e.remove());ids.forEach((id,i)=>{BB.F[id].el.dataset.sit=1;dot(id,i)})};
const zoomTo=(z,wx,wy)=>{BB.floorReset();BB.floorZoom(z);const st=document.getElementById('stage').getBoundingClientRect(),f=document.getElementById('floor').getBoundingClientRect();const p=BB.W2P(wx,wy);const px=f.left+p[0]/100*f.width,py=f.top+p[1]/100*f.height;BB.setPan([st.left+st.width/2-px,st.top+(st.height-(innerWidth>760?188:84))/2-py+30]);};
return{freeze,pose,dot,deskCrate,sitDots,zoomTo,
flag(st){freeze();Object.assign(BB.reconnectFlag.state,st||{});BB.reconnectFlag.paint()},
badge(ids){sessionStorage.setItem('alter.receipts.new',JSON.stringify(ids));BB.receiptsBadge()},
flight(taskId){freeze();const t=BB.task(taskId);const a=BB.agent(t.assignee);const from=document.querySelector('.ch[data-id="'+t.assignee+'"]').getBoundingClientRect();const to=document.querySelector(innerWidth<=760?'#tabs a[data-v=receipts]':'#nav a[data-v=receipts]').getBoundingClientRect();
 const w=232;const mk=()=>{const c=document.createElement('div');c.className='rship';c.innerHTML=BB.receiptCard(t,{name:a.name,ini:BB.initials(a.name),color:BB.avColor(a)});document.body.appendChild(c);return c};
 const c0=mk(),h=c0.offsetHeight;const x0=Math.max(12,Math.min(innerWidth-w-12,from.left+from.width/2-w/2)),y0=from.top-h-50,x1=to.left+to.width/2-w/2,y1=to.top+to.height/2-h/2;
 const P=[[x0,y0,1,1],[(x0+x1)/2+(innerWidth<=760?-70:0),innerWidth<=760?(y0+y1)/2+60:y0-10,.62,.55],[x1,y1,.2,.3]];
 c0.remove();P.forEach(([x,y,s,o],i)=>{const c=mk();c.style.left='0';c.style.top='0';c.style.transform=`translate(${x}px,${y}px) scale(${s})`;c.style.opacity=o;});
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('style','position:fixed;inset:0;width:100vw;height:100vh;z-index:59;pointer-events:none');
 const q=a=>[a[0]+w/2,a[1]+h/2];const A=q(P[0]),M=q(P[1]),Z=[to.left+to.width/2,to.top+to.height/2];svg.innerHTML=`<path d="M${A} Q${M[0]},${M[1]-(innerWidth<=760?0:40)} ${Z}" fill="none" stroke="#121212" stroke-opacity=".25" stroke-width="1.2" stroke-dasharray="2 5" stroke-linecap="round"/>`;document.body.appendChild(svg);},
receipts(ids){sessionStorage.setItem('alter.receipts.new',JSON.stringify(ids));BB.markNewRows(document.getElementById('v-receipts'));freeze();},
roster(){document.getElementById('crew').click();setTimeout(()=>{document.querySelectorAll('#roster button.r').forEach(b=>{const a=BB.agent(b.dataset.bot);const s=BB.honestStatus(a);b.classList.add('bst');b.dataset.s=s.s;b.querySelector('.t').innerHTML=`<b>${BB.esc(a.name)}</b><span class="bst-line"><i class="bst-dot"></i>${BB.esc(s.line)}</span>${s.why?`<span class="bst-why">${BB.esc(s.why)}</span>`:''}`;const sib=b.querySelector('.t').nextElementSibling;if(sib)sib.remove();});freeze();},300)},
insp(id){BB.openInspector(id);setTimeout(()=>{const a=BB.agent(id);const h=document.querySelector('#insp .ins-h .t p');if(h){const s=BB.honestStatus(a);h.outerHTML=`<div class="bst" data-s="${s.s}" style="margin-top:4px"><i class="bst-dot"></i><div class="bst-t"><span class="bst-line">${BB.esc(s.line)}</span>${s.why?`<span class="bst-why">${BB.esc(s.why)}</span>`:''}</div></div>`}
 document.querySelectorAll('#insp .job button[data-job]').forEach(b=>{const t=BB.task(b.dataset.job);if(t&&['running','queued'].includes(t.status))b.querySelector('small').insertAdjacentHTML('afterend',BB.estimateHTML(t,BB.tasks()))});freeze();},400)},
};})();
