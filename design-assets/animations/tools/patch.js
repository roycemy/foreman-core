// The exact source edits CLAUDE_CODE_PROMPT.md asks for, applied on the fly for previews.
module.exports={
'/js/floor.js':s=>s
 .replace("mailroom: { name: 'Mailroom', props: ['pigeonholes', 'parcels', 'cart'], verb: 'writing' },","mailroom: { name: 'Mailroom', props: ['pigeonholes', 'parcels', 'cart'], verb: 'writing' }, meeting: { name: 'Meeting room', props: ['maptable', 'board', 'mugs'], verb: 'meeting' },")
 .replace("sales: 'mailroom', support: 'mailroom'","sales: 'meeting', support: 'meeting'")
 .replace("f.style.setProperty('--px', (pan[0] + shift) + 'px');","if (BB.clampPan) pan = BB.clampPan(pan, fw, W, H); f.style.setProperty('--px', (pan[0] + shift) + 'px');")
 .replace("(s.kind === 'run' && BB.signal(a) === 'working' && r.tk && r.tk.startsWith('home') ? 'sit' : 'stand')","(r.tk && r.tk.startsWith('home') && !ghost && s.kind !== 'reconnect' ? 'sit' : 'stand')")
 .replace("r.el.dataset.activity = BB.withOwner(a)","r.el.dataset.idle = String(s.kind !== 'run'); r.el.dataset.activity = BB.withOwner(a)")
 .replace("window.HQ_FLOOR = { W2P, P2W, route, fit, PJ };","window.HQ_FLOOR = { W2P, P2W, route, fit, PJ }; BB.W2P = W2P; BB.PJ = PJ; BB.F = F; BB.walkTo = walkTo; BB.setPos = setPos; BB.propPoint = (room, i) => { const sl = SLOTS[room][i] || SLOTS[room][0], f = FOOT[typeOf(room).props[i % typeOf(room).props.length]] || [3, 3]; return W2P(sl[0] + f[0] + 1.2, sl[1] + f[1] / 2); }; BB.setPan = p => { pan = p; fit(); };"),
'/js/app-off':s=>s.replace("if (below) c.style.top = (r.bottom + 14) + 'px'; else c.style.bottom = (innerHeight - r.top + 14) + 'px';",
 "if (sel === '#crew' && innerWidth > 760) { c.style.left = (r.right + 14) + 'px'; c.style.bottom = (innerHeight - r.bottom) + 'px'; } else if (below) c.style.top = (r.bottom + 14) + 'px'; else c.style.bottom = (innerHeight - r.top + 14) + 'px';")
};
