/* Work cycle, only while BB.runningTask(a) exists. Needs floor.js to expose its walkTo(r,x,y) as BB.walkTo and SLOTS/W2P as BB.propPoint(room,i).
   Timeline: sit->stand 200ms · walk to prop (floor.js pace, 42ms/unit, legs 320-1900ms) · 3 bobs x 400ms · crate appears · walk back · sit 200ms · crate drops on desk.
   Runs once per job start. Idle and queued bots stay seated. Reduced motion: no walk, no bob; crate appears on the desk and the dot is static. */
(function(){const BB=window.BB=window.BB||{};
BB.CRATE='<svg class="crate" viewBox="0 0 24 20" aria-hidden="true"><polygon points="12,1 23,6 12,11 1,6" fill="#E2C9A0"/><polygon points="1,6 12,11 12,19 1,14" fill="#C9A673"/><polygon points="23,6 12,11 12,19 23,14" fill="#B38F5E"/><polygon points="6.5,3.5 17.5,8.5 17.5,9.6 6.5,4.6" fill="#C99634" opacity=".7"/></svg>';
const PROP_BY_ROOM={ops:1,finance:0,marketing:1,sales:0,lounge:0}; // toolbox/crates, bookcase, canvases, map table, records
const done=new Set();
BB.workCycle=async function(r,a,home){const t=BB.runningTask(a);if(!t||done.has(t.id)||r.away)return;done.add(t.id);
 if(!r.el.querySelector('.crate'))r.el.querySelector('.body').insertAdjacentHTML('beforeend',BB.CRATE);
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches,started=Date.parse(t.startedAt||t.createdAt);
 /* a job that was already running when the page opened just shows its crate: the walk marks a job START, it is not replayed */
 if(reduce||document.hidden||!(Date.now()-started<120000)){r.el.classList.add('has-desk-crate');return}
 const room=BB.roomOf(a),p=BB.propPoint(room,PROP_BY_ROOM[room==='support'?'sales':room]||0),still=()=>BB.runningTask(a)&&BB.runningTask(a).id===t.id;
 r.away=true;BB.floorDraw&&BB.floorDraw(r);
 try{await BB.sleep(200);await BB.walkTo(r,p[0],p[1]);if(!still())return await BB.walkTo(r,home[0],home[1]);
  r.el.classList.add('gather');await BB.sleep(1200);r.el.classList.remove('gather');if(!still())return await BB.walkTo(r,home[0],home[1]);
  r.el.classList.add('carry');await BB.walkTo(r,home[0],home[1]);r.el.classList.remove('carry');}
 finally{r.away=false;BB.floorDraw&&BB.floorDraw(r);}
 if(still()){await BB.sleep(200);r.el.classList.add('has-desk-crate')}};
/* indicator: <=5 working bots keep the existing activity glyph; 6+ collapse every glyph to a .wdot so the floor stays readable */
BB.useDots=()=>BB.agents().filter(a=>BB.signal(a)==='working').length>=6;})();
