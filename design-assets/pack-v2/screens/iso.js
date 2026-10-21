/* Alter HQ floor renderer (design reference). World 0..120 x 0..120, iso projection. */
(function(){
const C=.866, S=.5;
const P=(x,y,z=0,s=1)=>[(x-y)*C*s,(x+y)*S*s-z*s];
const pts=a=>a.map(p=>p.map(n=>n.toFixed(2)).join(',')).join(' ');
function box(x0,y0,x1,y1,z0,h,c,o={}){ // c: [top,left(front y1),right(front x1)]
  const z1=z0+h, op=o.op!=null?` opacity="${o.op}"`:'', st=o.stroke?` stroke="${o.stroke}" stroke-width=".35"`:'';
  return `<g${op}${o.cls?` class="${o.cls}"`:''}>`+
  `<polygon fill="${c[1]}"${st} points="${pts([P(x0,y1,z0),P(x1,y1,z0),P(x1,y1,z1),P(x0,y1,z1)])}"/>`+
  `<polygon fill="${c[2]}"${st} points="${pts([P(x1,y0,z0),P(x1,y1,z0),P(x1,y1,z1),P(x1,y0,z1)])}"/>`+
  `<polygon fill="${c[0]}"${st} points="${pts([P(x0,y0,z1),P(x1,y0,z1),P(x1,y1,z1),P(x0,y1,z1)])}"/></g>`;
}
const flat=(x0,y0,x1,y1,z,f,extra='')=>`<polygon fill="${f}" ${extra} points="${pts([P(x0,y0,z),P(x1,y0,z),P(x1,y1,z),P(x0,y1,z)])}"/>`;
const ROOMS={
 library:{name:'Research library',b:[4,4,40,40],tint:'#E5EBE3',why:'Researching'},
 studio:{name:'Drafting studio',b:[44,4,80,40],tint:'#F1EADF',why:'Drafting'},
 review:{name:'Review desk',b:[84,4,116,40],tint:'#E2E7EE',why:'Reviewing'},
 outbox:{name:'Outbox',b:[4,44,40,78],tint:'#ECE8DF',why:'Sending'},
 meeting:{name:'Meeting room',b:[44,44,80,78],tint:'#ECE6EE',why:'Handing off'},
 spend:{name:'Spend counter',b:[84,44,116,78],tint:'#E1EAE8',why:'Paying'},
 lounge:{name:'Lounge',b:[4,82,58,116],tint:'#F0EEE7',why:'Waiting'}
};
const WOOD=['#E9DCC4','#D8C7A8','#CDBB9B'], INK=['#2B2B2B','#1A1A1A','#111'], WHITE=['#FFFFFF','#EDEBE5','#E2E0D9'];
function desk(x,y){return box(x,y,x+7,y+3.5,0,2.4,WOOD)+box(x+2.2,y+.6,x+4.8,y+1.1,2.4,2.4,INK);}
function shelf(x,y,w=2,l=8){let s=box(x,y,x+w,y+l,0,9,['#C9A877','#B38E5C','#A2804F']);const cols=['#3E6B57','#C9B27A','#4A5F86','#8C6E4E','#2F2F2F'];for(let i=0;i<4;i++)s+=`<polygon fill="${cols[i%5]}" opacity=".9" points="${pts([P(x+w,y+1+i*1.8,2),P(x+w,y+2.4+i*1.8,2),P(x+w,y+2.4+i*1.8,7.5),P(x+w,y+1+i*1.8,7.5)])}"/>`;return s;}
function plant(x,y){const[a,b]=P(x,y,0);return box(x-1,y-1,x+1,y+1,0,2,WHITE)+`<circle cx="${a}" cy="${b-5}" r="2.6" fill="#3F7A55"/><circle cx="${a-1.2}" cy="${b-6.6}" r="1.8" fill="#4E8C63"/>`;}
function crate(x,y,z=0){return box(x,y,x+2.6,y+2.6,z,2.2,['#E2B979','#C99A57','#B58847']);}
function propsFor(k){const[x0,y0,x1,y1]=ROOMS[k].b;let s='';
 if(k==='library'){s+=shelf(x0+2,y0+3)+shelf(x0+2,y0+14)+box(x0+24,y0+4,x0+27,y0+7,0,3,['#2F6E5B','#245849','#1E4B3E'])+desk(x0+9,y0+22)+desk(x0+21,y0+22);}
 if(k==='studio'){s+=desk(x0+5,y0+8)+desk(x0+19,y0+8)+desk(x0+5,y0+22);const[a,b]=P(x0+28,y0+24,0);s+=`<g><line x1="${a}" y1="${b}" x2="${a+1}" y2="${b-11}" stroke="#7a6a55" stroke-width=".6"/><rect x="${a-3}" y="${b-13}" width="7" height="6" rx=".6" fill="#fff" stroke="#cfc8bb" stroke-width=".4"/><rect x="${a-1.6}" y="${b-11.5}" width="3.5" height="2.6" fill="#4A5F86" opacity=".8"/></g>`;}
 if(k==='review'){s+=box(x0+5,y0+10,x0+25,y0+14,0,2.6,WOOD)+box(x0+8,y0+10.6,x0+10.6,y0+11.2,2.6,2.6,INK)+box(x0+17,y0+10.6,x0+19.6,y0+11.2,2.6,2.6,INK);const[a,b]=P(x0+23,y0+11,2.6);s+=`<line x1="${a}" y1="${b}" x2="${a}" y2="${b-5}" stroke="#222" stroke-width=".5"/><circle cx="${a+1}" cy="${b-5.3}" r="1.2" fill="#E9D7A8"/>`+box(x0+6,y0+22,x0+13,y0+24,0,1.2,['#fff','#ddd','#ccc'])+box(x0+6,y0+22,x0+13,y0+24,1.2,1,['#f6f5f1','#ddd','#ccc']);}
 if(k==='outbox'){s+=box(x0+2,y0+4,x0+4,y0+20,0,8,['#EFE9DD','#D9D0BE','#CFC5B1']);for(let i=0;i<4;i++)for(let j=0;j<3;j++)s+=`<polygon fill="#bfb39c" points="${pts([P(x0+4,y0+5+i*3.8,1+j*2.4),P(x0+4,y0+7.6+i*3.8,1+j*2.4),P(x0+4,y0+7.6+i*3.8,2.6+j*2.4),P(x0+4,y0+5+i*3.8,2.6+j*2.4)])}"/>`;s+=desk(x0+12,y0+18)+crate(x0+24,y0+6)+crate(x0+27,y0+6)+crate(x0+25.4,y0+7,2.2);}
 if(k==='meeting'){s+=box(x0+9,y0+10,x0+27,y0+22,0,2.6,['#F3EEE4','#D9CDB6','#CDBF A5'.replace(' ','')],{cls:'mtable'})+flat(x0+11,y0+12,x0+25,y0+20,2.62,'#C9D5C7','opacity=".9"')+`<polyline fill="none" stroke="#6E8C79" stroke-width=".35" points="${pts([P(x0+12,y0+15,2.64),P(x0+16,y0+13,2.64),P(x0+20,y0+17,2.64),P(x0+24,y0+14,2.64)])}"/>`;const m1=P(x0+12,y0+21,2.6),m2=P(x0+24,y0+11,2.6);[m1,m2].forEach(([a,b])=>s+=`<rect x="${a-.8}" y="${b-1.8}" width="1.6" height="1.8" rx=".3" fill="#fff" stroke="#999" stroke-width=".2"/>`);s+=`<polygon fill="#fff" stroke="#d6d2c8" stroke-width=".3" points="${pts([P(x0+12,y0+.6,3),P(x0+26,y0+.6,3),P(x0+26,y0+.6,10),P(x0+12,y0+.6,10)])}"/>`+`<polygon fill="#C9B27A" points="${pts([P(x0+14,y0+.7,6),P(x0+17,y0+.7,6),P(x0+17,y0+.7,8.5),P(x0+14,y0+.7,8.5)])}"/><polygon fill="#4A5F86" points="${pts([P(x0+19,y0+.7,5),P(x0+23,y0+.7,5),P(x0+23,y0+.7,8.5),P(x0+19,y0+.7,8.5)])}"/>`;}
 if(k==='spend'){s+=box(x0+4,y0+8,x0+26,y0+12,0,4,['#F7F6F2','#1E1E1E','#2A2A2A'])+box(x0+18,y0+8.8,x0+21,y0+10.6,4,1,['#16161A','#000','#111']);const[a,b]=P(x0+10,y0+9,4);s+=`<rect x="${a-2.2}" y="${b-1.4}" width="4.4" height="2.8" rx=".5" fill="#16161A"/>`+desk(x0+8,y0+22);}
 if(k==='lounge'){s+=box(x0+6,y0+6,x0+18,y0+10,0,2.4,['#D6D3CB','#BDB9AF','#B2AEA3'])+box(x0+6,y0+6,x0+18,y0+7.4,2.4,2,['#D6D3CB','#BDB9AF','#B2AEA3'])+box(x0+26,y0+14,x0+32,y0+18,0,1.8,WOOD)+box(x0+36,y0+6,x0+48,y0+10,0,2.4,['#D6D3CB','#BDB9AF','#B2AEA3'])+plant(x0+50,y0+26)+plant(x0+3,y0+28)+box(x0+38,y0+20,x0+44,y0+25,0,2.2,['#E0DCD0','#C9C4B6','#BDB7A8']);}
 return s;}
function walls(k,o){const[x0,y0,x1,y1]=ROOMS[k].b,W=.8,H=7,h=2.2,c=WHITE,op=.92;
 return box(x0,y0,x1,y0+W,0,H,c,{op})+box(x0,y0,x0+W,y1,0,H,c,{op})+box(x0,y1-W,x0+(x1-x0)*.38,y1,0,h,c,{op})+box(x0+(x1-x0)*.62,y1-W,x1,y1,0,h,c,{op})+box(x1-W,y0,x1,y0+(y1-y0)*.38,0,h,c,{op})+box(x1-W,y0+(y1-y0)*.62,x1,y1,0,h,c,{op});}
function bot(x,y,color,opt={}){const[a,b]=P(x,y,opt.z||0);const bob=opt.bob?' class="bob"':'';let s=`<g${bob} data-bot="${opt.id||''}"><ellipse cx="${a}" cy="${b}" rx="2.6" ry="1.3" fill="rgba(0,0,0,.12)"/><rect x="${a-1.7}" y="${b-7.4}" width="3.4" height="6.6" rx="1.5" fill="${color}"/><circle cx="${a}" cy="${b-9}" r="1.9" fill="#F1D9C4"/><path d="M${a-1.9},${b-9.3} a1.9,1.9 0 0 1 3.8,0 z" fill="${opt.hair||'#222'}"/>`;
 if(opt.carry)s+=`<g transform="translate(${a-1.6},${b-6.2})"><rect width="3.2" height="2.4" rx=".3" fill="#E2B979" stroke="#B58847" stroke-width=".25"/><line x1="0" y1=".8" x2="3.2" y2=".8" stroke="#B58847" stroke-width=".2"/></g>`;
 if(opt.working)s+=`<g class="wk"><circle cx="${a+2.4}" cy="${b-11.2}" r=".75" fill="#111"/><circle cx="${a+2.4}" cy="${b-11.2}" r="1.5" fill="none" stroke="#111" stroke-width=".25" opacity=".35" class="ring"/></g>`;
 if(opt.label)s+=`<g transform="translate(${a},${b-15})"><rect x="${-opt.label.length*1.05-2}" y="-2.6" width="${opt.label.length*2.1+4}" height="4.6" rx="2.3" fill="#111"/><text x="0" y=".9" text-anchor="middle" font-size="2.6" fill="#fff" font-family="Geist" font-weight="500">${opt.label}</text></g>`;
 return s+'</g>';}
function tray(x,y,lit){const[a,b]=P(x+5,y+3,1.4);return box(x,y,x+10,y+6,0,1.4,['#1C1C1C','#0E0E0E','#151515'])+flat(x+.8,y+.8,x+9.2,y+5.2,1.42,'#2A2A2A')+(lit?`<circle cx="${a}" cy="${b}" r="2.6" fill="var(--v-glow,rgba(232,69,44,.35))" class="glow"/><circle cx="${a}" cy="${b}" r="1.1" fill="#E8452C"/>`:'');}
/* render(opts): returns svg string */
function render(o={}){
 const tint=o.tint!==false, hover=o.hover, bots=o.bots||[], extra=o.extra||'';
 let s=box(0,0,120,120,-5,5,['#F7F6F2','#151515','#222'])+box(0,0,120,120,0,.25,['#F7F6F2','#E6E4DE','#DCDAD3']);
 for(let i=6;i<120;i+=6)s+=`<polyline stroke="rgba(0,0,0,.035)" stroke-width=".2" fill="none" points="${pts([P(i,0,.26),P(i,120,.26)])}"/><polyline stroke="rgba(0,0,0,.035)" stroke-width=".2" fill="none" points="${pts([P(0,i,.26),P(120,i,.26)])}"/>`;
 const order=['library','studio','review','outbox','meeting','spend','lounge'];
 order.forEach(k=>{const[x0,y0,x1,y1]=ROOMS[k].b;s+=flat(x0,y0,x1,y1,.27,tint?ROOMS[k].tint:'#EFEEE9',`data-room="${k}" class="roomfloor${hover===k?' hot':''}"`);});
 if(o.meetGlow){const[x0,y0]=ROOMS.meeting.b;s+=flat(x0+7,y0+8,x0+29,y0+24,.3,'rgba(255,214,150,.55)','class="tglow" filter="url(#blur)"');}
 order.forEach(k=>{s+=walls(k)+propsFor(k);});
 s+=plant(64,88)+plant(112,112)+plant(66,112)+tray(84,94,o.lit);
 const bs=bots.slice().sort((a,b)=>(a.x+a.y)-(b.x+b.y));bs.forEach(b=>s+=bot(b.x,b.y,b.c,b));
 if(hover){const[x0,y0,x1,y1]=ROOMS[hover].b;s+=`<polygon fill="none" stroke="#111" stroke-width=".5" points="${pts([P(x0,y0,.3),P(x1,y0,.3),P(x1,y1,.3),P(x0,y1,.3)])}"/>`;}
 s+=extra;
 const vb=o.vb||'-112 -12 224 136';
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" class="hq"><defs><filter id="blur"><feGaussianBlur stdDeviation="1.6"/></filter></defs>${s}</svg>`;
}
window.ISO={P,render,ROOMS,bot,box,tray};
})();
