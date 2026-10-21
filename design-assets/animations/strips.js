window.STRIPS=(function(){const {F,S,O}=DEFS;const bed=b=>({k:'bed',x:4,y:1.5,o:{c:BB.CAST[PZ.BOTS[b].c].c}});
const bb=[{k:'beanbag',x:4,y:4}],mug={k:'mug',x:8.4,y:7.6};
const desk=o=>({k:'desk',x:4,y:4,o}),glow=O('glow',7.2,4,0,[],{oy:-17,d:-5});
const tbl=[{k:'board',x:.5,y:1},{k:'table',x:3.5,y:4.5}];
return [
{id:'t1-bed-stretch-idle',t:'Bed → stretch → idle',sub:'Only on the first real handshake. Every later reconnect skips the stretch.',
 f:[[bed('grok'),{k:'head',b:'grok',x:6.2,y:2.7,z:2.7,d:20},O('zzz',6,2.6,4,[],{ox:10,oy:-10})],[bed('grok'),F('grok',9.5,6,'stretch',{up:true})],[bed('grok'),F('grok',11,10,'walk')],[...bb,F('grok',6,6,'stand',{sit:true,dy:4}),mug,O('pill',0,0,0,['Last spoke just now',{muted:true}],{p:[120,24]})]],
 c:['Asleep','Stretch, once','Walks to the lounge','Idle'],a:['first heartbeat','stretch ends','arrives']},
{id:'t2-idle-desk-typing',t:'Idle → desk → typing',sub:'The walk starts on queued → running, never on a timer.',
 f:[[...bb,F('grok',6,6,'stand',{sit:true,dy:4}),mug],[F('grok',6,7,'walk',{frame:1})],[desk({}),S('grok',7,3.6)],[desk({glow:true}),S('grok',7,3.6,{type:true}),glow]],
 c:['Idle','Walks to its desk','Sits','Typing'],a:['job running','arrives','first step event']},
{id:'t3-desk-meeting-back',t:'Desk → meeting → back',sub:'Handoff job created opens it. Child job claimed (or ended) closes it.',
 f:[[desk({glow:true}),S('instinct',7,3.6,{type:true}),glow],[F('instinct',6,7,'hold'),O('folder',6,7,0,[],{oy:-34})],[...tbl,{k:'table',x:3.5,y:4.5,o:{glow:true}},F('instinct',5,3.4,'stand',{d:5}),F('manus',12.4,7.4,'stand',{flip:true}),O('wcard',0,0,0,['Competitor pricing','Instinct to Manus'],{p:[64,166]})],[F('instinct',6,7,'walk',{flip:true})],[desk({}),S('instinct',7,3.6)]],
 c:['Working','Takes the folder','Both at the table','Walks back','Back at desk'],a:['HANDOFF event','arrives','child claimed','arrives']},
{id:'t4-muse-wakes',t:'Muse dozing → wakes on a message',sub:'Muse never moves on her own. Only your message or her own reply wakes her.',
 f:[[{k:'armchair',x:4,y:4},F('muse',6.2,6.6,'stand',{sit:true,closed:true,tilt:-6,dy:-6}),O('pill',0,0,0,['Wakes when you message it',{muted:true}],{p:[120,24]})],[{k:'armchair',x:4,y:4},F('muse',6.2,6.6,'stand',{sit:true,up:true,dy:-6}),O('bubble',0,0,0,['You: draft the launch note'],{p:[120,44]})],[F('muse',6,7,'walk')],[desk({glow:true}),S('muse',7,3.6,{type:true}),glow]],
 c:['Dozing','Opens eyes, looks up','Walks to a desk','Typing'],a:['owner message sent','Muse replies, job running','first step event']},
];})();
