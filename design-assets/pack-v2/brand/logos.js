/* HQ-faithful logo options. Each fn(lit) -> svg. Dot appears only when lit (someone is there / something waits). */
(function(){
const C=.866,S=.5,P=(x,y,z=0)=>[(x-y)*C,(x+y)*S-z];const pt=a=>a.map(p=>p.map(n=>n.toFixed(2)).join(',')).join(' ');
function slab(x0,y0,x1,y1,h,top,band,band2){return `<polygon fill="${band}" points="${pt([P(x0,y1,-h),P(x1,y1,-h),P(x1,y1,0),P(x0,y1,0)])}"/><polygon fill="${band2}" points="${pt([P(x1,y0,-h),P(x1,y1,-h),P(x1,y1,0),P(x1,y0,0)])}"/><polygon fill="${top}" points="${pt([P(x0,y0,0),P(x1,y0,0),P(x1,y1,0),P(x0,y1,0)])}"/>`;}
function wall(x0,y0,x1,y1,h,c){return `<polygon fill="${c[1]}" points="${pt([P(x0,y1,0),P(x1,y1,0),P(x1,y1,h),P(x0,y1,h)])}"/><polygon fill="${c[2]}" points="${pt([P(x1,y0,0),P(x1,y1,0),P(x1,y1,h),P(x1,y0,h)])}"/><polygon fill="${c[0]}" points="${pt([P(x0,y0,h),P(x1,y0,h),P(x1,y1,h),P(x0,y1,h)])}"/>`;}
const dot=(x,y,z,r=1.6)=>{const[a,b]=P(x,y,z);return `<circle class="dot" cx="${a}" cy="${b}" r="${r}" fill="#E8452C"/>`;};
const W=['#FFFFFF','#D9D6CE','#C9C6BE'];
function wrap(inner,vb,dark){return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${inner}</svg>`;}
const T=d=>d?['#2A2A2A','#0B0B0B','#000']:['#F7F6F2','#111','#2A2A2A'];
const O={
 L1:{name:'Slab',note:'The island itself: porcelain top, ink band.',f:(lit,d)=>{const t=T(d);return wrap(slab(0,0,12,12,3,t[0],t[1],t[2])+(lit?dot(6,6,0):''),'-11.5 -1 23 16');}},
 L2:{name:'Floor plan',note:'Slab with the cross walls that make four rooms. The dot sits in the room where someone is.',f:(lit,d)=>{const t=T(d),w=d?['#555','#333','#3a3a3a']:W;return wrap(slab(0,0,12,12,3,t[0],t[1],t[2])+wall(5.6,0,6.4,5.6,1.6,w)+wall(0,5.6,5.6,6.4,1.6,w)+wall(5.6,5.6,6.4,6.4,1.6,w)+wall(6.4,5.6,12,6.4,1.6,w)+wall(5.6,6.4,6.4,12,1.6,w)+(lit?dot(9.2,9.2,0,1.5):''),'-11.5 -2.2 23 17.4');}},
 L3:{name:'Corner room',note:'One room cut from the HQ: two back walls and a lit floor.',f:(lit,d)=>{const t=T(d),w=d?['#555','#333','#3a3a3a']:W;return wrap(slab(0,0,12,12,2.4,t[0],t[1],t[2])+wall(0,0,12,1,5,w)+wall(0,0,1,12,5,w)+(lit?dot(7,7,0):''),'-11.5 -5.5 23 20');}},
 L4:{name:'Tray',note:'The H1 tray, now sitting on the island slab.',f:(lit,d)=>{const t=T(d);return wrap(slab(0,0,12,12,2.6,t[0],t[1],t[2])+slab(3.5,3.5,8.5,8.5,-1.2,d?'#3a3a3a':'#1A1A1A','#000','#0b0b0b')+(lit?dot(6,6,1.2,1.2):''),'-11.5 -2 23 16');}},
 L5:{name:'Two rooms',note:'Two rooms and a doorway: the meeting point of two bots.',f:(lit,d)=>{const t=T(d),w=d?['#555','#333','#3a3a3a']:W;return wrap(slab(0,0,12,12,3,t[0],t[1],t[2])+wall(5.6,0,6.4,4.4,1.8,w)+wall(5.6,7.6,6.4,12,1.8,w)+(lit?dot(6,6,0,1.4):''),'-11.5 -2.4 23 17.6');}}
};
window.LOGOS=O;window.CHOSEN='L2';
})();
