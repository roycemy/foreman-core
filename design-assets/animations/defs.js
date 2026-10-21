/* pose + action definitions: frames of scene items. Tile world patch 0..12. */
window.DEFS=(function(){const P0=PZ.BOTS;
const F=(b,x,y,pose,o)=>Object.assign({k:'fig',b,x,y,pose:pose||'stand'},o||{});
const S=(b,x,y,o)=>F(b,x+.2,y+.4,'stand',Object.assign({sit:true,d:6},o||{}));   // seated at a desk whose front edge is y=4
const O=(t,x,y,z,a,o)=>Object.assign({k:'ov',t,x,y,z,a},o||{});
const desk=(o)=>({k:'desk',x:4,y:4,o});const chair={k:'chair',x:7,y:1};
const bedOf=b=>({k:'bed',x:4,y:1.5,o:{c:PZ.fig&&BB.CAST[P0[b].c].c}});
const sleeper=(b,o)=>[bedOf(b),{k:'head',b,x:6.2,y:2.7,z:2.7,d:20},O('zzz',6,2.6,4,[],{ox:10,oy:-10,d:2})].concat(o||[]);
const DESK=(b,o,extra)=>[desk(o),S(b,7,3.6,extra)].concat(o&&o.glow?[O('glow',7.2,4,0,[],{oy:-17,d:-5})]:[]);
const card=(t,s)=>({t,s});
/* the six owner poses */
const poses=[
{id:'p1',n:'Asleep in bed',frames:[sleeper('grok')],note:'Not connected: never paired, key expired or revoked. Gray Zs.'},
{id:'p1b',n:'Tap the bed',frames:[sleeper('grok',[O('pill',6.2,2.7,6,['Reconnect Grok Bot',{dot:true,red:true}],{p:[120,26]})])],html:'repaste',note:'Tap shows the one-tap re-paste card (v3 copy).'},
{id:'p2',n:'Gets up and stretches',frames:[[bedOf('grok'),F('grok',9.5,6,'stretch',{up:true})]],note:'Plays once on the first real handshake.'},
{id:'p3',n:'Idle, beanbag and coffee',frames:[[{k:'beanbag',x:4,y:4},F('poke',6,6,'stand',{sit:true,dy:4}),{k:'mug',x:8.4,y:7.6},O('pill',6,6,0,['Last spoke 3h ago',{muted:true}],{oy:-82})]],note:'Connected, no job. Label on hover, tap on phone.'},
{id:'p4',n:'At the desk, typing',frames:[DESK('grok',{glow:true},{type:true})],note:'Only while a job is running.'},
{id:'p5',n:'Meeting room',frames:[[{k:'board',x:.5,y:1},{k:'table',x:3.5,y:4.5,o:{glow:true}},F('instinct',5,3.4,'stand',{d:5}),F('manus',12.4,7.4,'stand',{flip:true}),O('wcard',0,0,0,['Competitor pricing','Instinct to Manus'],{p:[64,166],d:5})]],note:'Both walk in on a real handoff; card shows the job.'},
{id:'p6',n:'Muse dozing in a chair',frames:[[{k:'armchair',x:4,y:4},F('muse',6.2,6.6,'stand',{sit:true,closed:true,tilt:-6,dy:-6}),O('pill',6.2,6.6,0,['Wakes when you message it',{muted:true}],{oy:-86})]],note:'Never animates on her own.'},
];
/* 23 actions */
const A=[
{n:'Idle at desk',frames:[DESK('chatgpt',{},{look:-1.6}),DESK('chatgpt',{},{look:1.6})],note:'Seated, small head turn toward the event. No typing.'},
{n:'Offline',frames:[sleeper('chatgpt',[{k:'raw',d:-1,svg:''}])],dim:true,note:'Lights dim over the nook; asleep in bed.'},
{n:'Needs reconnect',frames:[[bedOf('grok'),F('grok',9.5,6,'wave',{up:true}),O('flag',9.5,6,0,[],{oy:-72,ox:14})]],note:'Sits up, waves. Red flag. Tap = re-paste card.'},
{n:'Working',frames:[DESK('grok',{glow:true},{type:true}),DESK('grok',{glow:true},{type:true,frame:1})],note:'Typing at 2x the idle-hand pace, screen glow.'},
{n:'Job assigned',frames:[DESK('instinct',{tray:true}),[desk({tray:true,paper:{}}),S('instinct',7,3.6,{look:1.6,up:true})]],note:'Paper drops into the desk tray.'},
{n:'Claims',frames:[[desk({tray:true,paper:{}}),F('instinct',7,3,'reach',{d:6})],[desk({tray:true}),F('instinct',8,8.5,'hold'),O('paperS',8,8.5,0,[],{oy:-38,ox:10})]],note:'Stands, takes the paper.'},
{n:'Walks to tool station',frames:[[{k:'shelf',x:1,y:1},F('grok',7,7,'walk',{frame:0})],[{k:'maildesk',x:2,y:1},F('grok',7,7,'walk',{frame:1})],[{k:'terminal',x:3,y:2},F('grok',7,7,'walk',{frame:0})]],note:'Research shelf, mail desk or card terminal, by step type.'},
{n:'Collecting',frames:[[{k:'shelf',x:1,y:1},F('grok',5,6,'reach',{d:5})],[{k:'shelf',x:1,y:1},F('grok',8,8,'hold',{d:16}),{k:'raw',d:17,svg:''},O('folder',8,8,0,[],{oy:-34})]],note:'Picks up files, carries back.'},
{n:'Progress',frames:[[...DESK('grok',{glow:true},{type:true}),O('ring',7,3.6,0,[null],{oy:-82})],[...DESK('grok',{glow:true},{type:true}),O('ring',7,3.6,0,[.6],{oy:-82})]],note:'Spinner unless real step counts exist (gap).'},
{n:'Done',frames:[[{k:'printer',x:3,y:3},F('devin',7,8),O('receipt',4.6,4.4,3.2,[],{oy:-6})],[{k:'rtray',x:3,y:3,o:{n:1}},F('devin',7,8,'hold'),O('pill',5,5,0,['1 new',{dot:true}],{oy:-30})]],note:'Receipt prints, walked to the Receipts tray.'},
{n:'Failed or stopped',frames:[[desk({paper:{mark:1}}),F('grok',8,8,'shrug')]],note:'Shrug. Red mark on the paper.'},
{n:'Handoff',frames:[[F('instinct',4,6,'walk'),F('manus',9,8,'walk',{flip:true,frame:1})],[F('instinct',5.5,6.5,'hold'),F('manus',8,8,'hold',{flip:true}),O('folder',6.8,7.2,0,[],{oy:-34})]],note:'Walk to the meeting room, pass a folder.'},
{n:'Meeting',frames:[poses[5].frames[0]],note:'Both at the table, board shows the job.'},
{n:'Waiting on another bot',frames:[[...DESK('poke'),O('clock',7,3.6,0,[],{oy:-80,ox:16}),O('pill',0,0,0,['Waiting on Instinct',{muted:true}],{p:[100,24],d:-1})]],note:'Seated, clock icon.'},
{n:'Needs approval',frames:[[desk({paper:{}}),F('grok',7,3.6,'raise',{sit:true,d:6}),{k:'door',x:.3,y:6},O('lock',.6,8,7,[false,true]),O('pill',7,3.6,0,['1 needs you',{dot:true,red:true}],{p:[190,30]})]],note:'Raises hand, locked door, Inbox pulses.'},
{n:'Approved',frames:[[desk({glow:true}),S('grok',7,3.6,{type:true}),{k:'door',x:.3,y:6,o:{open:1}},O('lock',.6,8,7,[true,false])]],note:'Door unlocks, typing resumes.'},
{n:'Denied',frames:[[desk({}),F('grok',7,3.6,'hold',{sit:true,d:6}),O('stamp',6,8,0,['Blocked'])]],note:'Paper lowered, Blocked stamp.'},
{n:'Spend',frames:[[{k:'terminal',x:3,y:2,o:{lit:1}},F('chatgpt',6,7,'reach'),O('budget',9,3,6,[.62])]],note:'Card taps terminal, budget bar ticks down.'},
{n:'Budget limit',frames:[[{k:'terminal',x:3,y:2},F('chatgpt',6,7,'hold'),O('budget',9,3,6,[1,true])]],note:'Bar full and red, bot stops.'},
{n:'Owner message',frames:[[...DESK('grok',{},{up:true}),O('look',7,3.6,0,[],{oy:-94})],[F('poke',3,8,'stand',{up:true}),F('instinct',8,4,'stand',{up:true})]],note:'Everyone looks up once.'},
{n:'Auto-routing',frames:[[desk({tray:true}),S('devin',7,3.6),O('paperS',1,9,0,[],{oy:-10}),O('pill',1,9,0,['Routed to Devin',{muted:true}],{oy:-26,ox:10})],[desk({tray:true,paper:{}}),S('devin',7,3.6,{up:true})]],route:true,note:'Paper slides to the chosen bot\'s desk.'},
{n:'New bot joins',frames:[[F('devin',2,10,'walk',{frame:0})],[F('devin',5,7,'walk',{frame:1})],[desk({}),S('devin',7,3.6)]],note:'Walks in from the door, takes a free desk.'},
{n:'Disconnected',frames:[[desk({}),F('manus',8,8,'hold'),{k:'raw',d:30,svg:''},O('folder',8,8,0,[],{oy:-34})],[F('manus',3,11,'walk',{frame:1,dim:true})]],note:'Packs the desk, walks out.'},
];
return {poses,A,F,S,O};})();
