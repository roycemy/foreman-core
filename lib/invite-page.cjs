// Invite page (direction B, "seat nameplate"). One template for the static public/i.html (generic, no invite data)
// and the server-rendered per-invite page, so link crawlers (iMessage, Mac Messages, WhatsApp) get real meta tags
// without running JS. Only the inviter's public first name and the next founding seat number are ever filled in.
const ORIGIN='https://www.alterhq.app',LIMIT=1000;
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cleanName=n=>{const t=String(n||'').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').trim();return [...t].length>24?[...t].slice(0,23).join('')+'…':t;};
const clampSeat=n=>{n=Math.floor(Number(n));return Number.isFinite(n)&&n>=1?Math.min(LIMIT,n):null;};
// The seat an invitee would be given next: founding seats taken so far + 1, capped at 1,000. Null when the list is full.
const nextSeat=taken=>{const t=Math.floor(Number(taken));return Number.isFinite(t)&&t>=0&&t<LIMIT?t+1:null;};
const pad=n=>String(n).padStart(3,'0');
function meta({code,name,seat}){
 const valid=/^[a-f0-9]{32}$/.test(code||''),who=cleanName(name),s=clampSeat(seat),personal=valid&&who&&s;
 const title=personal?`${who} saved you a seat, #${s}`:'A seat is saved for you on alter';
 const url=valid?`${ORIGIN}/i.html?code=${code}`:`${ORIGIN}/i.html`;
 const img=valid?`${ORIGIN}/og/invite-${code}.png${s?'?s='+s:''}`:`${ORIGIN}/og/invite-generic.png`;
 const alt=personal?`${who} saved you a seat, #${s} on alter`:'A founding seat is saved for you on alter';
 return {title,url,img,alt,who,seat:s};
}
function render(data={}){
 const m=meta(data),who=m.who,s=m.seat,d='Your bots work. You stay in control.';
 const tags=[['property','og:type','website'],['property','og:site_name','alter'],['property','og:title',m.title],['property','og:description',d],['property','og:url',m.url],['property','og:image',m.img],['property','og:image:type','image/png'],['property','og:image:width','1200'],['property','og:image:height','630'],['property','og:image:alt',m.alt],['name','twitter:card','summary_large_image'],['name','twitter:title',m.title],['name','twitter:description',d],['name','twitter:image',m.img],['name','twitter:image:alt',m.alt]]
  .map(([k,n,v])=>`<meta ${k}="${n}" content="${esc(v)}">`).join('');
 const from=who?esc(who):'Someone';
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#f4f4f1"><title>${esc(m.title)}</title><meta name="description" content="${d}"><link rel="canonical" href="${esc(m.url)}">${tags}<link rel="icon" href="/brand/favicon.svg"><link rel="apple-touch-icon" href="/brand/alter-icon-light-180.png"><link rel="stylesheet" href="/invite/invite.css"></head><body><div class="v"><div class="stage" aria-hidden="true"><div class="floor"></div><div class="glow"></div><span class="bot" style="left:552px;top:22px"><span class="nm">Instinct</span><span class="st">working</span></span><span class="bot" style="left:640px;top:130px"><span class="nm">Grok Bot</span><span class="st d">done · receipt</span></span><span class="bot" style="left:574px;top:210px"><span class="nm">Muse</span><span class="st"><i></i>needs you</span></span></div><div class="tagd" aria-hidden="true">illustration</div><header><a href="/" aria-label="alter home"><img src="/brand/alter-lockup.svg" alt="alter" width="98" height="24"></a></header><div class="plate" id="plate"><div class="n">Reserved for you</div><div class="s"><span class="dot"></span><span id="count">${s?'seat '+pad(s)+' / 1,000':'founding seat / 1,000'}</span></div></div><main><p class="eyebrow" id="from">${who?'from '+from+', at alter hq':'an invite to alter hq'}</p><h1 id="title">${who?from+' saved you a&nbsp;seat.':'A seat is saved for&nbsp;you.'}</h1><p class="tag">${d}</p><form id="join"><label class="sr" for="email">Email address</label><input id="email" type="email" autocomplete="email" maxlength="254" required placeholder="you@email.com"><label class="consent"><input id="consent" type="checkbox" required><span>Email me when my seat is ready.</span></label><div class="trap" aria-hidden="true"><label>Website<input id="website" tabindex="-1" autocomplete="off"></label></div><button id="submit" disabled>Claim your founding seat</button></form><p id="status" role="status" aria-live="polite"></p></main><footer><div class="fine">Access list only. Your inviter never sees your email. <details><summary>Details</summary>One seat per email, from the website or a shared invite. Access list only, not platform access or a paid benefit. This invitation never grants access to the inviter's workspace. Already have access? <a href="/hq">Open your own HQ</a>.</details></div></footer></div><script src="/invite/invite.js"></script></body></html>
`;
}
module.exports={render,meta,nextSeat,clampSeat,cleanName,LIMIT};
