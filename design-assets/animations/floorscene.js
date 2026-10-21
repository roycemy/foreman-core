window.FS=function(o){o=o||{};const s=o.s||1.25,F=(b,x,y,pose,e)=>Object.assign({k:'fig',b,x,y,pose:pose||'stand'},e||{}),O=(t,x,y,z,a,e)=>Object.assign({k:'ov',t,x,y,z,a,s},e||{});
const it=[
 // sleep nook (arrivals corner): three beds
 {k:'bed',x:45,y:105,o:{c:'#5B4470'}},{k:'bed',x:50.5,y:105,o:{c:'#46627A'}},{k:'bed',x:56,y:105},
 {k:'head',b:'chatgpt',x:52.6,y:106.3,z:2.7,d:300},O('zzz',52.6,106.2,4,[],{ox:6,oy:-8,d:3}),
 // lounge: beanbags + coffee cart, Muse's armchair
 F('poke',95,77,'stand',{sit:true,dy:3,zb:2}),
 {k:'armchair',x:108,y:70},F('muse',110.2,72.6,'stand',{sit:true,closed:true,tilt:-6,dy:-4}),
 // ops: Grok typing at a real desk, Devin idle (head turn)
 F('grok',58,59.6,'stand',{sit:true,type:true,laptop:true}),O('glow',58,59.6,0,[],{oy:-11,d:-9}),
 F('devin',72,59.6,'stand',{sit:true,look:1.6}),
 // meeting room: Instinct + Manus at the map table
 F('instinct',21,83,'stand'),F('manus',30,82,'stand',{flip:true}),
];
const lab=[];const L=(x,y,t,e)=>lab.push(O('pill',x,y,0,[t,Object.assign({muted:true},e||{})],{oy:-60-(e&&e.up||0)}));
const sh=o.short;if(o.phone){L(95,77,'Poke · last spoke 3h ago',{muted:false,dark:true});lab.push(O('pill',110.2,72.6,0,['Wakes when you message it',{muted:true}],{oy:26}));lab.push(O('wcard',0,0,0,['Competitor pricing','Instinct to Manus'],{x:27,y:87,z:16,d:9}));}
else if(o.labels!==false){L(52.6,107,'ChatGPT · asleep',{up:2});L(95,77,sh?'Poke · 3h ago':'Poke · last spoke 3h ago',{up:-2});L(110.2,72.6,sh?'Muse · dozing':'Muse · wakes when you message it',{up:4});L(58,59.6,sh?'Grok Bot · working':'Grok Bot · Weekly memo');L(72,59.6,'Devin · idle',{up:0});
 lab.push(O('wcard',0,0,0,['Competitor pricing','Instinct to Manus · handoff'],{x:27,y:87,z:16,d:9}));}
if(o.card)lab.push(O('wcard',0,0,0,['Competitor pricing','Instinct to Manus'],{x:27,y:87,z:16,d:9}));
if(o.tap)lab.push(O('pill',52.6,107,0,['Reconnect ChatGPT',{dot:true,red:true}],{oy:-34}));
(o.drop||[]).forEach(i=>lab.splice(i,1));
return it.concat(lab);};
