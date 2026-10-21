const v={bots:7,run:{a1:'Weekly memo'}};
const ph=(wx,wy,z)=>`SC.freeze();BB.floorReset();const f=document.getElementById('floor');const r=f.getBoundingClientRect();const p=BB.W2P(${wx},${wy});const ox=p[0]/100*r.width,oy=p[1]/100*r.height;f.style.transformOrigin=ox+'px '+oy+'px';f.style.scale='${z}';const r2=f.getBoundingClientRect();const cx=r.left+ox,cy=r.top+oy;f.style.translate=(195-cx)+'px '+(400-cy)+'px';`;
module.exports=[
{w:1440,h:900,v,js:"SC.freeze();SC.zoomTo(1.25,62,74);PZ.floorScene(FS({s:1}));document.querySelectorAll('.wdot').forEach(e=>e.remove())",out:'floor/floor-1440.png'},
{w:390,h:844,v,js:"SC.freeze();setTimeout(()=>{SC.zoomTo(.8,64,80);setTimeout(()=>PZ.floorScene(FS({s:1.8,phone:true})),200)},400)",wait:1200,out:'floor/floor-390.png'},
{w:390,h:844,v,js:"SC.freeze();setTimeout(()=>{SC.zoomTo(.8,48,96);setTimeout(()=>PZ.floorScene(FS({s:1.8,labels:false,tap:true})),200)},400)",wait:1200,out:'floor/floor-390-tap-bed.png'},
];
