/* Meeting room. In floor.js: ROOM_TYPES.meeting = {name:'Meeting room', props:['maptable','board','mugs'], verb:'meeting'};
   ROOM_MAP sales/support -> 'meeting' (the old mailroom position; same SLOTS, same art kit: maptable, board, mugs already exist in PROPS).
   Handoff trigger: a real HANDOFF event (BB.S.events type 'handoff' or a.state.kind==='HANDOFF') between two connected bots.
   Choreography: both walk to the two table seats (floor.js walkTo) -> table glows once 600ms -> bubble over the sender while the child job is queued -> both walk home. */
(function(){const BB=window.BB=window.BB||{};
BB.MEET_SEATS=[[27,93],[32.5,88]];          // world coords either side of the map table at SLOTS.sales[0]=[24,86]
BB.handoffLine=(from,to,what)=>'Handing you the '+(what||'work');
BB.handoff=async function(rFrom,rTo,text,homes,taskId){rFrom.away=rTo.away=true;try{const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches,W=BB.W2P;
 const s0=W(...BB.MEET_SEATS[0]),s1=W(...BB.MEET_SEATS[1]);
 if(!reduce)await Promise.all([BB.walkTo(rFrom,s0[0],s0[1]),BB.walkTo(rTo,s1[0],s1[1])]);
 const g=document.querySelector('#fx .mglow');if(g&&!reduce){g.classList.remove('on');void g.getBBox();g.classList.add('on')}
 const ov=document.getElementById('ov'),b=document.createElement('div');b.className='mbub';b.textContent=text+(taskId&&BB.task(taskId)?' · '+BB.task(taskId).title:'');b.classList.add('with-folder');rFrom.el.classList.add('pass-folder');rTo.el.classList.add('receive-folder');
 const at=reduce?[rFrom.x,rFrom.y]:s0;b.style.left=at[0]+'%';b.style.top=(at[1]-12)+'%';ov.appendChild(b);
 /* the meeting lasts while the handed-off job is still queued; it ends on a real state change (running, done, failed), not a timer. 90s safety cap so a bot never stays stuck away. */
 await BB.sleep(700);for(let i=0;i<180;i++){const ct=taskId&&BB.task(taskId);if(!ct||ct.status!=='queued')break;await BB.sleep(500);}b.remove();rFrom.el.classList.remove('pass-folder');rTo.el.classList.remove('receive-folder');
 if(!reduce)await Promise.all([BB.walkTo(rFrom,homes[0][0],homes[0][1]),BB.walkTo(rTo,homes[1][0],homes[1][1])]);}finally{rFrom.away=rTo.away=false;BB.floorDraw&&BB.floorDraw(rFrom);BB.floorDraw&&BB.floorDraw(rTo);}};
/* glow ellipse to append into #fx once: soft white, never red */
BB.meetGlowSVG=function(){const c=BB.W2P(27.5,88.5),PJ=BB.PJ,x=c[0]/100*PJ.W+PJ.X0,y=c[1]/100*PJ.H+PJ.Y0;
 return `<defs><radialGradient id="mgl"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><ellipse class="mglow" cx="${x.toFixed(1)}" cy="${(y-6).toFixed(1)}" rx="${(PJ.K*9).toFixed(1)}" ry="${(PJ.K*4.5).toFixed(1)}" fill="url(#mgl)"/>`;};})();
