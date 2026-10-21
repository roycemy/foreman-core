module.exports=[{w:1440,h:900,v:{bots:7},js:`SC.freeze();const it=[];for(let x=0;x<=120;x+=10)for(let y=0;y<=120;y+=10)it.push({k:'ov',x,y,z:0,t:'dot',a:[x%20==0&&y%20==0?'#E2452B':'#121212'],s:.5});
[[0,0],[20,100],[40,100],[90,50],[110,70],[30,90]].forEach(([x,y])=>it.push({k:'ov',x,y,z:0,t:'pill',a:[x+','+y],s:1.2}));PZ.floorScene(it)`,out:'floor/_probe.png'}];
