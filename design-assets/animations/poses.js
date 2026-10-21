/* Alter poses mockup kit. Reuses BB.figureSVG (floor.js) and the floor projection; adds props, poses, overlays. */
window.PZ=(function(){const BB=window.BB;
if(BB.CAST.length<7)BB.CAST.push({k:'visor',c:'#7A5C46',av:'#6E5240',body:'blazer',acc:'#2B2D31'});
const BOTS={grok:{n:'Grok Bot',c:0},muse:{n:'Muse',c:1},instinct:{n:'Instinct',c:2},manus:{n:'Manus',c:3},poke:{n:'Poke',c:4},chatgpt:{n:'ChatGPT',c:5},devin:{n:'Devin',c:6}};
const RED='#E2452B',INK='#121212',MUTE='#8C8C86',SKIN='#EBDDCB';
const proj=(K,OX,OY)=>(x,y,z)=>[OX+(x-y)*K,OY+(x+y)*K*.5-(z||0)*K];
const pts=a=>a.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
const poly=(a,f,ex)=>'<polygon points="'+pts(a)+'" fill="'+f+'"'+(ex||'')+'/>';
function box(P,x,y,z,w,d,h,c){return poly([P(x,y+d,z),P(x+w,y+d,z),P(x+w,y+d,z+h),P(x,y+d,z+h)],c[1])+poly([P(x+w,y,z),P(x+w,y+d,z),P(x+w,y+d,z+h),P(x+w,y,z+h)],c[2])+poly([P(x,y,z+h),P(x+w,y,z+h),P(x+w,y+d,z+h),P(x,y+d,z+h)],c[0])}
/* figure: real floor.js figure with pose edits */
const ARM_L=/<rect x="-15" y="-47" width="5" height="(21|16)" rx="2.5"( fill="[^"]+")\/>/,ARM_R=/<rect x="10" y="-47" width="5" height="(21|16)" rx="2.5"( fill="[^"]+")\/>/;
function fig(bot,pose,o){o=o||{};const b=BOTS[bot];let s=BB.figureSVG({id:bot,name:b.n},{cast:b.c,pose:pose==='walk'?'walk':(o.sit?'sit':'stand'),frame:pose==='walk'?(o.frame||0):undefined});
 s=s.replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'');
 const arm=(l,r)=>{const hand=(x,a)=>'';s=s.replace(ARM_L,(m,h,f)=>'<g transform="rotate('+l+' -12.5 -45)"><rect x="-15" y="-47" width="5" height="21" rx="2.5"'+f+'/><circle cx="-12.5" cy="-25" r="2.7" fill="'+SKIN+'"/></g>').replace(ARM_R,(m,h,f)=>'<g transform="rotate('+r+' 12.5 -45)"><rect x="10" y="-47" width="5" height="21" rx="2.5"'+f+'/><circle cx="12.5" cy="-25" r="2.7" fill="'+SKIN+'"/></g>')};
 if(pose==='stretch')arm(160,-160);if(pose==='wave')arm(0,-150+(o.frame?20:0));if(pose==='raise')arm(0,-172);if(pose==='shrug')arm(48,-48);if(pose==='reach')arm(0,-95);if(pose==='hold')arm(-35,35);
 if(o.look)s=s.replace(/(<ellipse cx=")(-?3\.3)(" cy="-60\.5")/g,(m,a,x,c)=>a+(+x+o.look)+c);
 if(o.up)s=s.replace(/cy="-60\.5"/g,'cy="-62.3"');
 if(o.closed)s=s.replace(/<ellipse cx="(-?3\.3)" cy="-60\.5" rx="1\.15" ry="1\.4" fill="#2B2D31"\/>/g,(m,x)=>'<path d="M'+(x-1.8)+' -59.6 q1.8 1.4 3.6 0" fill="none" stroke="#2B2D31" stroke-width="1.1" stroke-linecap="round"/>');
 if(o.type&&o.sit)s=s.replace(/class="arm-t l" cx="-12" cy="-18\.5"/,'class="arm-t l" cx="-12" cy="'+(o.frame?-20.5:-18.5)+'"').replace(/class="arm-t r" cx="12" cy="-18\.5"/,'class="arm-t r" cx="12" cy="'+(o.frame?-18.5:-20.5)+'"');
 if(o.sit&&!o.type&&!o.laptop)s=s.replace(/<path d="M-12 -31 L12 -31 L10 -17 L-10 -17 Z" fill="#B7BDC2"\/><path d="M-12 -31 L12 -31 L11\.6 -29\.4 L-11\.6 -29\.4 Z" fill="#D7DBDF"\/><circle cx="0" cy="-24" r="1\.6" fill="#F4F4F1"\/>/,'');
 if(o.tilt)s='<g transform="rotate('+o.tilt+' 0 -10)">'+s+'</g>';
 return s}
function head(bot,o){/* head only, eyes closed, for the bed */let s=fig(bot,'stand',{closed:true});return '<g clip-path="url(#pzHead)"><g transform="translate(0 0)">'+s+'</g></g>'}
const DEFS='<defs><clipPath id="pzHead"><rect x="-20" y="-82" width="40" height="29"/></clipPath><radialGradient id="pzGlow"><stop offset="0" stop-color="#DDEBFF" stop-opacity=".95"/><stop offset="1" stop-color="#DDEBFF" stop-opacity="0"/></radialGradient><radialGradient id="pzWarm"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".95"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient></defs>';
/* props */
const C={wood:['#E6DCCB','#CDBFA8','#B9AB93'],white:['#FFFFFF','#E4E4DF','#D3D3CD'],ink:['#3A3936','#22211F','#2C2B29'],sheet:['#F7F6F2','#DAD8D1','#C9C7BF'],blanket:['#CFCFC9','#B5B5AE','#A3A39C'],term:['#2C2B29','#1B1A19','#242321']};
const PROP={
desk:(P,x,y,o)=>box(P,x,y,0,6,2.2,1.7,C.wood)+(o&&o.glow?'<ellipse cx="'+P(x+3,y+1.2,5)[0]+'" cy="'+P(x+3,y+1.2,5)[1]+'" rx="'+(P(9,0)[0]-P(0,0)[0])*.35+'" ry="'+(P(9,0)[0]-P(0,0)[0])*.2+'" fill="url(#pzGlow)"/>'+'':'')+(o&&o.paper?PROP.paper(P,x+4.2,y+.2,1.7,o.paper):'')+(o&&o.tray?box(P,x+4.2,y+.3,1.7,1.6,1.6,.4,['#EDEDE8','#CFCFC9','#BDBDB6']):''),
chair:(P,x,y)=>box(P,x,y,0,2.4,2.4,1.8,C.ink)+box(P,x,y+2.1,1.8,2.4,.4,2.6,C.ink),
bed:(P,x,y,o)=>box(P,x,y,0,4.4,8,1.4,C.wood)+box(P,x+.2,y+.2,1.4,4,7.6,1,C.sheet)+box(P,x+.6,y+.5,2.4,3.2,1.6,.6,['#FFFFFF','#E9E9E4','#DCDCD6'])+box(P,x+.2,y+2.8,2.3,4,5,.5,o&&o.c?[0,.1,.18].map(f=>shade(mix(o.c,.55),f)):C.blanket)+box(P,x,y+7.6,0,4.4,.4,3.2,C.wood),
beanbag:(P,x,y,c)=>{const p=P(x+2,y+2,0),k=P(1,0)[0]-P(0,0)[0];return '<ellipse cx="'+p[0]+'" cy="'+(p[1]+1)+'" rx="'+k*2.9+'" ry="'+k*1.5+'" fill="#1A1A18" opacity=".12"/><path d="M'+(p[0]-k*2.6)+' '+p[1]+' q0 -'+k*2.6+' '+k*2.6+' -'+k*2.8+' q'+k*2.6+' .2 '+k*2.6+' '+k*2.8+' q-'+k*2.6+' '+k*1.4+' -'+k*5.2+' 0z" fill="'+(c||'#C9BBA6')+'"/><path d="M'+(p[0]-k*1.8)+' '+(p[1]-k*1.3)+' q'+k*1.8+' -'+k*1+' '+k*3.6+' 0" stroke="#000" stroke-opacity=".08" fill="none" stroke-width="'+k*.3+'"/>'},
armchair:(P,x,y)=>box(P,x,y,0,4.5,4.5,2,['#7C8A86','#60706B','#55645F'])+box(P,x,y+3.6,2,4.5,.9,3,['#7C8A86','#60706B','#55645F'])+box(P,x,y,2,.8,3.6,1.3,['#7C8A86','#60706B','#55645F'])+box(P,x+3.7,y,2,.8,3.6,1.3,['#7C8A86','#60706B','#55645F']),
mug:(P,x,y,z)=>{const p=P(x,y,z||0),k=P(1,0)[0]-P(0,0)[0];return '<rect x="'+(p[0]-k*.5)+'" y="'+(p[1]-k*1.1)+'" width="'+k+'" height="'+k*1.1+'" rx="'+k*.2+'" fill="#FFFFFF" stroke="#C9C7BF" stroke-width=".6"/><path d="M'+(p[0]+k*.5)+' '+(p[1]-k*.8)+' q'+k*.45+' .1 0 '+k*.55+'" fill="none" stroke="#C9C7BF" stroke-width=".8"/>'},
coffee:(P,x,y)=>box(P,x,y,0,3,3,3.6,C.white)+box(P,x+.5,y+.5,3.6,2,1.6,1.4,C.ink)+PROP.mug(P,x+2.4,y+2.6,3.6),
shelf:(P,x,y)=>box(P,x,y,0,1.8,6,7,C.wood)+[1.6,3.4,5.2].map(z=>box(P,x+1.2,y+.3,z,.7,5.4,1.2,['#9FB4C4','#6F8798','#7E95A6'])).join(''),
maildesk:(P,x,y)=>box(P,x,y,0,6,3,3.4,C.wood)+box(P,x,y,3.4,6,1,3,['#EDEDE8','#CFCFC9','#BDBDB6'])+[1,2.5,4].map(i=>box(P,x+i,y+.2,3.8,1,1,.25,C.sheet)).join(''),
terminal:(P,x,y,o)=>box(P,x,y,0,2,2,3.6,C.white)+box(P,x+.3,y+.3,3.6,1.4,1.4,1,C.term)+(o&&o.lit?'<circle cx="'+P(x+1,y+1,4.8)[0]+'" cy="'+P(x+1,y+1,4.8)[1]+'" r="2" fill="#FFFFFF"/>':''),
printer:(P,x,y)=>box(P,x,y,0,4,3,3,C.white)+box(P,x+.4,y+.4,3,3.2,2.2,1,['#EDEDE8','#CFCFC9','#BDBDB6']),
rtray:(P,x,y,o)=>box(P,x,y,0,4,4,1.6,C.ink)+box(P,x+.4,y+.4,1.6,3.2,3.2,.2,C.sheet)+(o&&o.n?PROP.paper(P,x+1,y+1,1.9,{}):''),
table:(P,x,y,o)=>(o&&o.glow?'<ellipse cx="'+P(x+4,y+2.5,2.6)[0]+'" cy="'+P(x+4,y+2.5,2.6)[1]+'" rx="'+(P(1,0)[0]-P(0,0)[0])*7+'" ry="'+(P(1,0)[0]-P(0,0)[0])*3.4+'" fill="url(#pzWarm)"/>':'')+box(P,x,y,0,8,5,2.6,C.wood)+poly([P(x+1.5,y+1,2.62),P(x+6.5,y+1,2.62),P(x+6.5,y+4,2.62),P(x+1.5,y+4,2.62)],'#D9E2D6'),
door:(P,x,y,o)=>box(P,x,y,0,.4,4,7,C.white)+poly([P(x+.42,y+.8,0),P(x+.42,y+3.2,0),P(x+.42,y+3.2,5.6),P(x+.42,y+.8,5.6)],o&&o.open?'#F4F4F1':'#D3D3CD'),
board:(P,x,y)=>box(P,x,y,0,.5,9,7,C.white),
paper:(P,x,y,z,o)=>{o=o||{};return poly([P(x,y,z),P(x+1.6,y,z),P(x+1.6,y+2.1,z),P(x,y+2.1,z)],'#FFFFFF',' stroke="#C9C7BF" stroke-width=".6"')+(o.mark?'<path d="M'+P(x+.5,y+.8,z)[0]+' '+P(x+.5,y+.8,z)[1]+' l6 3" stroke="'+RED+'" stroke-width="1.6" stroke-linecap="round"/>':'')},
};
function mix(c,t){const n=parseInt(c.slice(1),16);const m=v=>Math.round(v+(255-v)*t);return '#'+((1<<24)+(m(n>>16&255)<<16)+(m(n>>8&255)<<8)+m(n&255)).toString(16).slice(1)}
function shade(c,f){const n=parseInt(c.slice(1),16);const m=v=>Math.round(v*(1-f));return '#'+((1<<24)+(m(n>>16&255)<<16)+(m(n>>8&255)<<8)+m(n&255)).toString(16).slice(1)}
/* overlays: [kind, ...] drawn in screen units at point p */
const T=(x,y,t,sz,c,w,a)=>'<text x="'+x+'" y="'+y+'" font-family="Geist,ui-sans-serif,sans-serif" font-size="'+sz+'" font-weight="'+(w||500)+'" fill="'+(c||INK)+'" text-anchor="'+(a||'middle')+'">'+t+'</text>';
const OV={
zzz:(p,s)=>T(p[0]+6*s,p[1]-2*s,'z',7*s,MUTE,500,'start')+T(p[0]+12*s,p[1]-9*s,'z',9*s,MUTE,500,'start')+T(p[0]+19*s,p[1]-18*s,'Z',11*s,'#A9A9A3',500,'start'),
pill:(p,s,t,o)=>{o=o||{};const w=(t.length*5.6+(o.dot?20:16))*s,h=18*s;return '<g><rect x="'+(p[0]-w/2)+'" y="'+(p[1]-h)+'" width="'+w+'" height="'+h+'" rx="'+h/2+'" fill="'+(o.dark?INK:'#FFFFFF')+'" stroke="'+(o.red?'rgba(226,69,43,.35)':'rgba(18,18,18,.10)')+'"/>'+(o.dot?'<circle cx="'+(p[0]-w/2+9*s)+'" cy="'+(p[1]-h/2)+'" r="'+2.6*s+'" fill="'+(o.dot===true?RED:o.dot)+'"/>':'')+T(p[0]+(o.dot?4*s:0),p[1]-h/2+3.4*s,t,9.5*s,o.dark?'#FFF':(o.muted?'#5C5C57':INK),500)+'</g>'},
clock:(p,s)=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="'+7*s+'" fill="#FFF" stroke="'+INK+'" stroke-width="'+1.2*s+'"/><path d="M'+p[0]+' '+(p[1]-4*s)+' V'+p[1]+' h'+3*s+'" stroke="'+INK+'" stroke-width="'+1.2*s+'" fill="none" stroke-linecap="round"/>',
lock:(p,s,open,red)=>{const c=red?RED:INK;return '<rect x="'+(p[0]-9*s)+'" y="'+(p[1]-9*s)+'" width="'+18*s+'" height="'+18*s+'" rx="'+5*s+'" fill="#FFF" stroke="rgba(18,18,18,.12)"/><rect x="'+(p[0]-4*s)+'" y="'+(p[1]-1*s)+'" width="'+8*s+'" height="'+6*s+'" rx="'+1.2*s+'" fill="'+c+'"/><path d="M'+(p[0]-2.6*s)+' '+(p[1]-1*s)+' v-'+2.4*s+' a'+2.6*s+' '+2.6*s+' 0 0 1 '+5.2*s+' 0'+(open?' v-1':' v'+2.4*s)+'" transform="'+(open?'translate('+3*s+' '+(-1.5*s)+')':'')+'" fill="none" stroke="'+c+'" stroke-width="'+1.4*s+'"/>'},
ring:(p,s,f)=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="'+6*s+'" fill="#FFF" stroke="rgba(18,18,18,.12)" stroke-width="'+2.2*s+'"/>'+(f==null?'<path d="M'+p[0]+' '+(p[1]-6*s)+' a'+6*s+' '+6*s+' 0 0 1 '+6*s+' '+6*s+'" fill="none" stroke="'+INK+'" stroke-width="'+2.2*s+'" stroke-linecap="round"/>':'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="'+6*s+'" fill="none" stroke="'+INK+'" stroke-width="'+2.2*s+'" stroke-dasharray="'+(f*37.7*s)+' 99" transform="rotate(-90 '+p[0]+' '+p[1]+')" stroke-linecap="round"/>'),
stamp:(p,s,t)=>'<g transform="rotate(-8 '+p[0]+' '+p[1]+')"><rect x="'+(p[0]-24*s)+'" y="'+(p[1]-9*s)+'" width="'+48*s+'" height="'+18*s+'" rx="'+3*s+'" fill="#FFF" stroke="'+INK+'" stroke-width="'+1.3*s+'"/>'+T(p[0],p[1]+3.4*s,t||'Blocked',9.5*s,INK,600)+'</g>',
flag:(p,s)=>'<path d="M'+p[0]+' '+p[1]+' v-'+22*s+'" stroke="'+INK+'" stroke-width="'+1.4*s+'"/><path d="M'+p[0]+' '+(p[1]-22*s)+' h'+13*s+' l-'+3*s+' '+4*s+' l'+3*s+' '+4*s+' h-'+13*s+'z" fill="'+RED+'"/>',
budget:(p,s,f,red)=>'<rect x="'+(p[0]-30*s)+'" y="'+(p[1]-20*s)+'" width="'+60*s+'" height="'+20*s+'" rx="'+6*s+'" fill="#FFF" stroke="'+(red?'rgba(226,69,43,.35)':'rgba(18,18,18,.10)')+'"/><rect x="'+(p[0]-24*s)+'" y="'+(p[1]-8*s)+'" width="'+48*s+'" height="'+3*s+'" rx="'+1.5*s+'" fill="rgba(18,18,18,.08)"/><rect x="'+(p[0]-24*s)+'" y="'+(p[1]-8*s)+'" width="'+48*f*s+'" height="'+3*s+'" rx="'+1.5*s+'" fill="'+(red?RED:INK)+'"/>'+T(p[0]-24*s,p[1]-11*s,red?'Budget used':'Budget left',6.5*s,red?RED:'#5C5C57',500,'start'),
folder:(p,s)=>'<path d="M'+(p[0]-7*s)+' '+(p[1]-5*s)+' h'+5*s+' l'+1.5*s+' '+1.5*s+' h'+7.5*s+' v'+8.5*s+' h-'+14*s+'z" fill="#E7C98A" stroke="#C9A673" stroke-width=".6"/>',
paperS:(p,s,mark)=>'<rect x="'+(p[0]-5*s)+'" y="'+(p[1]-7*s)+'" width="'+10*s+'" height="'+13*s+'" rx="'+1*s+'" fill="#FFF" stroke="#C9C7BF" stroke-width=".7"/><path d="M'+(p[0]-3*s)+' '+(p[1]-3*s)+' h6 M'+(p[0]-3*s)+' '+(p[1])+' h6 M'+(p[0]-3*s)+' '+(p[1]+3*s)+' h4" stroke="#C9C7BF" stroke-width=".8"/>'+(mark?'<path d="M'+(p[0]-2*s)+' '+(p[1]-2*s)+' l'+4*s+' '+4*s+' M'+(p[0]+2*s)+' '+(p[1]-2*s)+' l-'+4*s+' '+4*s+'" stroke="'+RED+'" stroke-width="'+1.5*s+'" stroke-linecap="round"/>':''),
receipt:(p,s)=>'<path d="M'+(p[0]-7*s)+' '+(p[1]-10*s)+' h'+14*s+' v'+18*s+' l-'+2.3*s+' -'+1.5*s+' l-'+2.3*s+' '+1.5*s+' l-'+2.3*s+' -'+1.5*s+' l-'+2.3*s+' '+1.5*s+' l-'+2.3*s+' -'+1.5*s+' l-'+2.4*s+' '+1.5*s+'z" fill="#FFF" stroke="#C9C7BF" stroke-width=".7"/><path d="M'+(p[0]-4*s)+' '+(p[1]-6*s)+' h8 M'+(p[0]-4*s)+' '+(p[1]-3*s)+' h6 M'+(p[0]-4*s)+' '+(p[1]+1*s)+' h8" stroke="#C9C7BF" stroke-width=".8"/>',
bubble:(p,s,t)=>{const w=(t.length*5.3+18)*s,h=20*s;return '<rect x="'+(p[0]-w/2)+'" y="'+(p[1]-h-5*s)+'" width="'+w+'" height="'+h+'" rx="'+8*s+'" fill="#FFF" stroke="rgba(18,18,18,.10)"/><path d="M'+(p[0]-4*s)+' '+(p[1]-5.5*s)+' l4 '+5*s+' l4 -'+5*s+'z" fill="#FFF"/>'+T(p[0],p[1]-h/2-1.6*s,t,9*s,INK,500)},
wcard:(p,s,title,sub)=>{const w=Math.max(title.length*5.6,sub.length*4.9)*s+22*s,h=34*s;return '<rect x="'+(p[0]-w/2)+'" y="'+(p[1]-h)+'" width="'+w+'" height="'+h+'" rx="'+7*s+'" fill="#FFF" stroke="rgba(18,18,18,.10)"/>'+T(p[0]-w/2+11*s,p[1]-h+14*s,title,9.5*s,INK,600,'start')+T(p[0]-w/2+11*s,p[1]-h+26*s,sub,8*s,'#5C5C57',400,'start')},
dash:(a,b,s)=>'<path d="M'+a[0]+' '+a[1]+' Q'+((a[0]+b[0])/2)+' '+(Math.min(a[1],b[1])-24*s)+' '+b[0]+' '+b[1]+'" fill="none" stroke="'+INK+'" stroke-opacity=".3" stroke-width="'+1.1*s+'" stroke-dasharray="2 4" stroke-linecap="round"/>',
look:(p,s)=>'<path d="M'+(p[0]-4*s)+' '+p[1]+' l'+4*s+' -'+5*s+' l'+4*s+' '+5*s+'" fill="none" stroke="'+MUTE+'" stroke-width="'+1.3*s+'" stroke-linecap="round"/>',
glow:(p,s)=>'<ellipse cx="'+p[0]+'" cy="'+p[1]+'" rx="'+16*s+'" ry="'+9*s+'" fill="url(#pzGlow)"/><path d="M'+(p[0]-8*s)+' '+(p[1]-1*s)+' h'+16*s+'" stroke="#CFE0FF" stroke-width="'+1.4*s+'" stroke-linecap="round"/>',
dot:(p,s,c)=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="'+3*s+'" fill="'+(c||INK)+'"/>',
};
/* scene: items {k:'prop'|'fig'|'ov', x,y,...} -> svg markup sorted by depth */
function scene(P,items,fs){fs=fs||.7;const out=[];items.forEach(it=>{const d=it.d!=null?it.d:(it.x+it.y+(it.k==='fig'?.5:0));
 if(it.k==='fig'){const p=P(it.x,it.y,it.z||0);out.push([d,'<g opacity="'+(it.dim?.55:1)+'" transform="translate('+p[0]+' '+(p[1]+(it.dy||0))+') scale('+fs*(it.flip?-1:1)+' '+fs+')">'+(it.bed?'':fig(it.b,it.pose||'stand',it))+'</g>'])}
 else if(it.k==='head'){const p=P(it.x,it.y,it.z||0);out.push([d,'<g transform="translate('+p[0]+' '+p[1]+') scale('+fs+') rotate(-62) translate(0 62)">'+head(it.b)+'</g>'])}
 else if(it.k==='ov'){const p=it.p||P(it.x,it.y,it.z||0);out.push([999+(it.d||0),OV[it.t]([p[0]+(it.ox||0),p[1]+(it.oy||0)],it.s||1,...(it.a||[]))])}
 else if(it.k==='raw')out.push([d,it.svg]);
 else out.push([d,PROP[it.k](P,it.x,it.y,it.o)])});
 return out.sort((a,b)=>a[0]-b[0]).map(x=>x[1]).join('')}
return {BOTS,proj,box,fig,scene,PROP,OV,DEFS,poly,RED};})();
/* floor overlay on the real floor: each item is its own layer in #chl with the same z rule as props and figures, labels go to #ov */
PZ.floorScene=function(items,o){o=o||{};const PJ=BB.PJ,P=PZ.proj(PJ.K,PJ.OX,PJ.OY),fs=o.fs||.66;document.querySelectorAll('#ov .wdot,#ov .fx,#ov .desk-crate').forEach(e=>e.remove());document.querySelectorAll('.ch,.pz').forEach(e=>{if(e.classList.contains('ch'))e.style.display='none';else e.remove()});
 const vb=PJ.X0+' '+PJ.Y0+' '+PJ.W+' '+PJ.H,chl=document.getElementById('chl'),ov=document.getElementById('ov');
 items.forEach(it=>{const e=document.createElementNS('http://www.w3.org/2000/svg','svg');e.setAttribute('class','pz pv-prop');e.setAttribute('viewBox',vb);e.style.cssText='position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none';
  e.innerHTML=PZ.DEFS+PZ.scene(P,[Object.assign({},it,{d:0})],fs);
  if(it.k==='ov'){e.style.zIndex=1;ov.appendChild(e)}else{const wx=it.x+(it.k==='fig'||it.k==='head'?0:(it.k==='bed'?2:2)),wy=it.y+(it.k==='bed'?7.8:it.k==='fig'||it.k==='head'?0:2);e.style.zIndex=Math.round(BB.W2P(wx,wy)[1]*10)+(it.zb||0)+(it.k==='head'?80:0);chl.appendChild(e)}});
 return P};
