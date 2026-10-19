#!/usr/bin/env python3
"""Build export/public/index.html by editing the LIVE index.html (fetched from production).
Usage: python3 build_index.py /tmp/live/index.html ../public/index.html
Every edit is an exact-match replacement that asserts it applied once, so a changed upstream file fails loudly."""
import re, sys, subprocess, os, json
from jsbrand import brandify
src, dst = sys.argv[1], sys.argv[2]
H = open(src, encoding='utf-8').read()
TOOLS = os.path.dirname(os.path.abspath(__file__))
LOG = []
def rep(old, new, count=1, where=None):
    global H
    n = H.count(old)
    if n != count:
        raise SystemExit(f'EDIT FAILED ({n} matches, expected {count}): {old[:120]!r}')
    H = H.replace(old, new)
    LOG.append(where or old[:70])

# ---------- 1. head ----------
rep('<title>Black Box - Every AI employee. One workplace.</title>',
    '<title data-brand-title="{brand} - Every AI employee. One workplace.">Every AI employee. One workplace.</title>')
H = re.sub(r'<link rel="icon" href="data:image/svg\+xml,[^"]*">',
    '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E%3Crect width=\'32\' height=\'32\' fill=\'%23121212\'/%3E%3Crect x=\'8\' y=\'8\' width=\'16\' height=\'16\' fill=\'none\' stroke=\'%23F4F4F1\' stroke-width=\'2.5\'/%3E%3Crect x=\'11\' y=\'11\' width=\'10\' height=\'3\' fill=\'%23E2452B\'/%3E%3C/svg%3E">\n'
    '<meta name="theme-color" content="#F4F4F1">\n'
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap">\n'
    '<link rel="stylesheet" href="/styles/tokens.css">\n<link rel="stylesheet" href="/styles/app.css">\n'
    '<script src="/brand.js"></script>', H, count=1)

# ---------- 2. remove every legacy <style> block (styling now lives in tokens.css + app.css) ----------
n_styles = len(re.findall(r'<style[^>]*>.*?</style>', H, re.S))
H = re.sub(r'<style[^>]*>.*?</style>', '', H, flags=re.S)
LOG.append(f'removed {n_styles} <style> blocks')
# JS-injected style text -> emptied (selectors re-specified in app.css)
for pat in [r'(const st0=document\.createElement\("style"\);st0\.textContent=)"[^"]*"',
            r'(au\.id="fmauth";)', ]:
    pass
H, k = re.subn(r'(const st0=document\.createElement\("style"\);st0\.textContent=)"[^"]*"', r'\1""', H); assert k == 1
H, k = re.subn(r'(const st=document\.createElement\("style"\);st\.textContent=)`[^`]*`', r'\1``', H); assert k == 2, k
LOG.append('emptied 3 JS-injected style strings')
# leftover inline style tags created dynamically elsewhere
dyn = re.findall(r'createElement\(["\']style["\']\)', H)

# ---------- 3. static markup ----------
rep('<div class="top"><div class="mark"></div><div class="brand">BLACK <b>BOX</b></div>',
    '<a class="skip-link" href="#main">Skip to content</a>\n'
    '<header class="top" role="banner"><a class="wm" id="wm" href="#office" aria-label="HQ home"><span class="mark" aria-hidden="true"></span><span class="brand" data-brand-wordmark>HQ</span></a>')
rep('<div class="sum" id="sum"></div><div class="sp"></div>\n<button class="btn" id="recap">While you were away</button><button class="btn pri" id="addb">+ Connect a bot</button><button class="elink" id="emer">Emergency controls</button></div>',
    '<div class="sp"></div><div class="sum" id="sum" role="status" aria-live="polite" aria-label="Team status"></div>\n'
    '<button class="btn" id="recap" hidden>While you were away</button><button class="btn pri" id="addb"><span aria-hidden="true">+</span> Connect a bot</button>'
    '<button class="elink iconbtn" id="emer" aria-label="Emergency controls" aria-haspopup="dialog"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M5.2 1.5h5.6l3.7 3.7v5.6l-3.7 3.7H5.2l-3.7-3.7V5.2z" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="5.5" y="5.2" width="1.6" height="5.6" fill="currentColor"/><rect x="8.9" y="5.2" width="1.6" height="5.6" fill="currentColor"/></svg><span class="tip" aria-hidden="true">Emergency controls</span></button>'
    '<details class="acct" id="acct"><summary id="acctbtn" aria-label="Account menu"><span id="acctini" aria-hidden="true">·</span></summary><div id="acctmenu" role="menu" aria-label="Account"><div class="acct-who"><span class="eyebrow">Signed in</span><b id="acctmail">Your account</b></div></div></details></header>')
rep('<main>', '<main id="main" tabindex="-1">')
rep('<section class="view" id="v-office"><div class="floor" id="floor"></div></section>',
    '<section class="view" id="v-office" aria-label="HQ floor"><div class="floorwrap" id="floorwrap"><div class="floor" id="floor"></div></div></section>')
rep('<button class="elink mobemer" id="emer2">Emergency</button>',
    '<button class="elink mobemer" id="emer2" aria-haspopup="dialog"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M5.2 1.5h5.6l3.7 3.7v5.6l-3.7 3.7H5.2l-3.7-3.7V5.2z" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="5.5" y="5.2" width="1.6" height="5.6" fill="currentColor"/><rect x="8.9" y="5.2" width="1.6" height="5.6" fill="currentColor"/></svg><span>Emergency</span></button>')
rep('<div class="logo"><div class="mark"></div><div class="brand">BLACK <b>BOX</b></div></div>',
    '<div class="logo"><div class="mark"></div><div class="brand" data-brand-wordmark>HQ</div></div>')
rep('<div class="dr" id="dr"></div>', '<div class="dr" id="dr" role="dialog" aria-modal="false" aria-label="Employee details"></div>')
rep('<div class="toast" id="toast"></div>', '<div class="toast" id="toast" role="status" aria-live="polite"></div>')
rep('<div class="modal" id="emodal"><div class="box"><h3 style="margin:0 0 4px">Emergency Controls</h3>',
    '<div class="modal" id="emodal" role="dialog" aria-modal="true" aria-labelledby="emodal-h"><div class="box"><h3 id="emodal-h" style="margin:0 0 4px">Emergency Controls</h3>')
rep('<div class="modal" id="modal">', '<div class="modal" id="modal" role="dialog" aria-modal="true" aria-label="Connect a bot">')
rep('<body data-theme="daylight">',
    '<body data-theme="daylight">\n<noscript><div class="nojs"><b><span data-brand>Your HQ</span> needs JavaScript.</b> Turn it on to see your team, approvals and receipts. Nothing runs without your approval while this page is closed.</div></noscript>')

# ---------- 3b. TODO-wire 3: remove the dead "While you were away" demo (#away, with "Ledger" copy) ----------
# Unreachable: #recap is hidden, obShow() is never called (so the #ob handlers that call showAway never fire), and app.css hides #away.
H, k = re.subn(r'<div class="away" id="away">.*?<button class="btn pri go" id="awaygo">Go to the office</button></div></div>\n', '', H, count=1, flags=re.S); assert k == 1, 'away markup not found'
rep('/* away */\nfunction showAway(){const e=$("#away");e.classList.add("on");requestAnimationFrame(()=>requestAnimationFrame(()=>e.classList.add("show")))}\n'
    'function hideAway(){const e=$("#away");e.classList.remove("show");setTimeout(()=>e.classList.remove("on"),260);location.hash="#office"}\n'
    '$("#awaygo").onclick=hideAway;$("#away").onclick=e=>{if(e.target.id==="away")hideAway()};$("#recap").onclick=showAway;document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("#away").classList.contains("on"))hideAway()});',
    '/* away: the demo recap (#away) was unreachable and is removed; showAway stays as a no-op for the dormant #ob handlers */\nfunction showAway(){}',
    where='removed dead #away demo')

# ---------- 4. brand literals inside scripts -> BRAND token ----------
def script_sub(fn):
    global H
    out = []; pos = 0
    for m in re.finditer(r'(<script>)(.*?)(</script>)', H, re.S):
        out.append(H[pos:m.start(2)]); out.append(fn(m.group(2))); pos = m.end(2)
    out.append(H[pos:]); H = ''.join(out)
total = [0]
def br(code):
    code, c = brandify(code, [('BLACK BOX', 'BRAND.upper'), ('BLACK <b>BOX</b>', 'BRAND.wordmarkHTML'), ('Black Box', 'BRAND.name')]); total[0] += c
    # comments that name the product
    code = code.replace('Black Box', 'the product').replace('BLACK BOX', 'THE PRODUCT')
    return code
script_sub(br)
LOG.append(f'brand literals tokenized in scripts: {total[0]}')

# ---------- 5. legacy palette hexes in script-built markup -> P&V ----------
PAL = {'#16a34a':'#1C7A4A','#15803d':'#1C7A4A','#22c55e':'#1C7A4A','#4ade80':'#1C7A4A','#dc2626':'#A62D17','#e5484d':'#A62D17','#b91c1c':'#A62D17','#c2262b':'#A62D17',
       '#2563eb':'#2F5DA8','#3b82f6':'#2F5DA8','#2f7cf6':'#2F5DA8','#64748b':'#5C5C57','#94a3b8':'#5C5C57','#475569':'#5C5C57','#334155':'#121212','#0f172a':'#121212',
       '#d97706':'#7A5A00','#f59e0b':'#7A5A00','#b45309':'#7A5A00','#92400e':'#7A5A00','#4f46e5':'#121212','#6366f1':'#121212','#4338ca':'#121212','#8b5cf6':'#2F5DA8','#14b8a6':'#1C7A4A',
       '#e2e8f0':'#D4D4CE','#cbd5e1':'#D4D4CE','#f1f5f9':'#E9E9E4','#f8fafc':'#F4F4F1','#eef2ff':'#E9E9E4','#0b1020':'#F4F4F1'}
def pal(code):
    def f(m):
        return PAL.get(m.group(0).lower(), m.group(0))
    return re.sub(r'#[0-9a-fA-F]{6}\b', f, code)
script_sub(pal)

# ---------- 6. sign-in bridge (#fmauth) + account menu ----------
rep('au.id="fmauth";au.innerHTML=`<div class="bx"><h2>${BRAND.name}</h2><div style="color:#5C5C57;font-size:13px;margin-bottom:14px" id="aus">Sign in to manage your AI employees.</div><input id="aue" type="email" placeholder="Email" autocomplete="email"><input id="aup" type="password" placeholder="Password (8+ characters)" autocomplete="current-password"><input id="auc" placeholder="Claim code (only if you were given one)" style="display:none"><div class="e" id="aur"></div><button class="btn pri" id="aug" style="width:100%">Sign in</button><div style="margin-top:12px;display:flex;justify-content:space-between"><a id="aum">Create an account</a><a id="aucl" style="color:#5C5C57">Have a claim code?</a></div></div>`',
    'au.id="fmauth";au.setAttribute("role","dialog");au.setAttribute("aria-modal","true");au.setAttribute("aria-labelledby","fmauth-h");au.innerHTML=`<div class="au-side" aria-hidden="true"><div class="au-wm"><span class="mark"></span><span class="brand">${BRAND.wordmarkHTML}</span></div><p class="au-quote">Every AI employee.<br><em>One workplace.</em></p><ol class="au-steps"><li><b>Sign in</b><span>Your private workspace</span></li><li><b>Land on your HQ floor</b><span>See who is working and who needs you</span></li><li><b>Approve at the island</b><span>Nothing risky runs without you</span></li></ol></div><div class="bx"><span class="eyebrow">${BRAND.name} HQ</span><h2 id="fmauth-h">Sign in to your HQ</h2><div class="au-sub" id="aus">Sign in to manage your AI employees.</div><label class="fl" for="aue">Email</label><input id="aue" type="email" placeholder="Email" autocomplete="email"><label class="fl" for="aup">Password</label><input id="aup" type="password" placeholder="Password (8+ characters)" autocomplete="current-password"><input id="auc" placeholder="Claim code (only if you were given one)" aria-label="Claim code" style="display:none"><div class="e" id="aur" role="alert"></div><button class="btn pri" id="aug" style="width:100%">Sign in</button><div class="au-links"><a id="aum" href="#" role="button">Create an account</a><a id="aucl" href="#" role="button">Have a claim code?</a></div><p class="au-after">After you sign in you land on your HQ floor.</p></div>`')
rep('A("aum").onclick=()=>setMode(mode==="in"?"up":"in");A("aucl").onclick=()=>{setMode("up");',
    'A("aum").onclick=e=>{e&&e.preventDefault();setMode(mode==="in"?"up":"in")};A("aucl").onclick=e=>{e&&e.preventDefault();setMode("up");')
rep('function needAuth(){au.classList.add("on")}', 'function needAuth(){au.classList.add("on");document.body.classList.add("signed-out");setTimeout(()=>{const f=A("aue");if(f&&!f.value)f.focus()},30)}')
rep('A("aup").value="";au.classList.remove("on");SIG="~";await boot()}', 'A("aup").value="";au.classList.remove("on");document.body.classList.remove("signed-out");location.hash="#office";SIG="~";await boot()}')
rep('let so=A("fmso");if(!so){so=document.createElement("button");so.id="fmso";so.className="btn";so.style.cssText="margin-left:8px";const t=document.querySelector(".top");t.appendChild(so);',
    'let so=A("fmso");if(!so){so=document.createElement("button");so.id="fmso";so.className="btn ghost";so.setAttribute("role","menuitem");const t=document.getElementById("acctmenu")||document.querySelector(".top");t.appendChild(so);')
rep('so.textContent="Sign out ("+who.email+")";sync()}',
    'so.textContent="Sign out";so.setAttribute("aria-label","Sign out ("+who.email+")");const am=A("acctmail");if(am)am.textContent=who.email;const ai=A("acctini");if(ai)ai.textContent=(who.email||"?").slice(0,2).toUpperCase();sync()}')

# ---------- 7. diorama layer -> P&V floor ----------
m = re.search(r'<script>\n/\* Artwork only\. Keep owner records.*?</script>', H, re.S)
assert m, 'diorama script not found'
H = H[:m.start()] + '<script>\n' + open(os.path.join(TOOLS, 'pv-diorama.js')).read() + '</script>' + H[m.end():]
LOG.append('diorama layer replaced by P&V floor layer')

# ---------- 8. connect flow, reconnect, deeplink pairing, card sandbox ----------
exec(open(os.path.join(TOOLS, 'edits_link.py')).read())

# ---------- 9. P&V layer (dialogs, presence on Team/drawer, avatars, shortcuts) ----------
H = H.replace('</body></html>', '<script>\n' + open(os.path.join(TOOLS, 'pv-layer.js')).read() + '</script>\n</body></html>')
assert '/* P&V layer' in H

open(dst, 'w', encoding='utf-8', newline='\n').write(H)
# validate every inline script parses
bad = 0
for i, s in enumerate(re.findall(r'<script>(.*?)</script>', H, re.S)):
    import tempfile; p = os.path.join(tempfile.gettempdir(), f'_chk_{i}.js'); open(p, 'w', encoding='utf-8').write(s)
    r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
    if r.returncode: bad += 1; print('SCRIPT', i, 'FAILED\n', r.stderr[:800])
print('\n'.join(LOG)); print('scripts ok' if not bad else f'{bad} scripts failed'); print('bytes', len(H.encode()))
