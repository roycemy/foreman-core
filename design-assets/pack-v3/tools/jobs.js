const base={bots:3,run:{a2:'Draft launch note'},queued:{a3:'Research competitor pricing'}};
const V=o=>Object.assign({},base,o);
const S=[ // [name, v, js, extra]
['01-dock-before',V({}),null,{nopatch:true,inject:false,drag:[0,420]}],
['02-dock-after',V({}),null,{drag:[0,420]}],
['10-reconnect',V({rec:{a1:'session_expired'}}),"SC.flag({})"],
['11-reconnect-copied',V({rec:{a1:'session_expired'}}),"SC.flag({a1:'copied'})"],
['12-reconnect-paste',V({rec:{a1:'session_expired'}}),"SC.flag({a1:'paste'})"],
['13-reconnect-console',V({rec:{a1:'session_expired'},console:'a1'}),"BB.agent('a1')._code='K7Q-42M';SC.flag({a1:'paste'})"],
['14-reconnect-several',V({rec:{a1:'session_expired',a2:'token_reused'},run:{}}),"SC.flag({})"],
['15-reconnect-with-tour',V({rec:{a1:'session_expired'}}),"SC.freeze()",{tour:true,wait:1600}],
['20-receipt-flight',V({}),"SC.flight('t3')"],
['21-receipts-badge',V({}),"SC.freeze();SC.badge(['t3','t4'])"],
['22-receipts-new-rows',V({}),"SC.receipts(['t3','t4'])",{hash:'#receipts'}],
['30-working-seated',V({run:{a1:'Weekly memo',a2:'Draft launch note'}}),"SC.freeze();SC.zoomTo(.7,66,68);SC.pose('a1',null,null,'sit');SC.sitDots(['a1'])"],
['31-working-walk-to-prop',V({run:{a1:'Weekly memo'}}),"SC.freeze();SC.zoomTo(.7,66,68);const p=BB.propPoint('ops',1),h=BB.F.a1;BB.setPos(h,(h.x+p[0])/2+1,(h.y+p[1])/2+1,0);SC.pose('a1',null,null,'walk',['walk'])"],
['32-working-gather',V({run:{a1:'Weekly memo'}}),"SC.freeze();SC.zoomTo(.7,66,68);const p=BB.propPoint('ops',1);BB.setPos(BB.F.a1,p[0],p[1],0);SC.pose('a1',null,null,'stand',['gather'])"],
['33-working-carry-back',V({run:{a1:'Weekly memo'}}),"SC.freeze();SC.zoomTo(.7,66,68);const p=BB.propPoint('ops',1),h=BB.W2P(58,59.6);BB.setPos(BB.F.a1,(h[0]+p[0])/2,(h[1]+p[1])/2,0);SC.pose('a1',null,null,'walk',['walk','carry'])"],
['34-working-back-at-desk',V({run:{a1:'Weekly memo'}}),"SC.freeze();SC.zoomTo(.7,66,68);SC.pose('a1',null,null,'sit');SC.sitDots(['a1']);SC.deskCrate('a1')"],
['35-working-six-plus',V({bots:7,run:{a1:'Weekly memo',a2:'Draft launch note',a3:'Research pricing',a4:'Tidy notes',a5:'Check invoice',a6:'Summarize inbox',a7:'Plan week'},queued:{}}),"SC.freeze();SC.sitDots(['a1','a2','a3','a4','a5','a6','a7'])"],
['36-working-reduced-motion',V({run:{a1:'Weekly memo'}}),"SC.freeze();SC.zoomTo(.7,66,68);SC.pose('a1',null,null,'sit');SC.sitDots(['a1']);SC.deskCrate('a1')",{reduce:true}],
['40-meeting-room',V({}),"SC.freeze();SC.zoomTo(.8,24,84)"],
['41-meeting-handoff',V({run:{a3:'Research competitor pricing'}}),"SC.freeze();SC.zoomTo(.8,24,84);const s=BB.MEET_SEATS;SC.pose('a3',s[0][0],s[0][1],'stand');SC.pose('a2',s[1][0],s[1][1],'stand');document.querySelector('#fx .mglow').style.opacity=.7;const r=BB.F.a3,b=document.createElement('div');b.className='mbub';b.textContent='Handing you the research';b.style.left=r.x+'%';b.style.top=(r.y-12.5)+'%';document.getElementById('ov').appendChild(b)"],
['50-status-roster',V({bots:4,rec:{a1:'session_expired'},run:{a2:'Draft launch note'},queued:{a3:'Research competitor pricing'},paused:['a4'],seen:{a3:4}}),"SC.roster()",{wait:900}],
['51-status-inspector-working',V({hist:{a2:[6,5,7]}}),"SC.insp('a2')",{wait:900}],
['52-status-inspector-queued',V({seen:{a3:4},hist:{a3:[6,6,7,5]}}),"SC.insp('a3')",{wait:900}],
['60-estimate-left',V({run:{a3:'Research competitor pricing'},started:{a3:2},hist:{a3:[6,6,7,5]}}),"SC.insp('a3')",{wait:900}],
['61-estimate-longer',V({run:{a2:'Draft launch note'},started:{a2:11},hist:{a2:[6,6,7]}}),"SC.insp('a2')",{wait:900}],
['62-estimate-none',V({run:{a2:'Draft launch note'},started:{a2:3},hist:{}}),"SC.insp('a2')",{wait:900}],
];
const out=[];for(const [n,v,js,x] of S)for(const [w,h,tag] of [[1440,900,'1440'],[390,844,'390']])out.push(Object.assign({w,h,out:'context/'+n+'-'+tag+'.png',v,js},x||{}));
module.exports=out;if(require.main===module){const f=process.argv[2];require('./shoot.js')(f?out.filter(j=>j.out.includes(f)):out)}
