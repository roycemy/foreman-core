const v={bots:3};const o=[];
for(const [w,t] of [[1440,'1440'],[390,'390']]){const ph=w===390;
 o.push({w,h:900,v,js:`SC.freeze();R.poses(${ph})`,full:true,out:`sheets/poses-${t}.png`});
 o.push({w,h:900,v,js:`SC.freeze();R.actions(${ph})`,full:true,out:`sheets/actions-contact-${t}.png`});
 o.push({w,h:900,v,js:`SC.freeze();R.actionStrips(${ph})`,full:true,out:`strips/actions-strips-${t}.png`});
 for(let i=0;i<4;i++)o.push({w,h:340,v,js:`SC.freeze();const s=STRIPS[${i}];R.strip(s.t,s.sub,s.f,s.c,s.a,${ph})`,full:true,out:`strips/${['t1-bed-stretch-idle','t2-idle-desk-typing','t3-desk-meeting-back','t4-muse-wakes'][i]}-${t}.png`});}
module.exports=o;
