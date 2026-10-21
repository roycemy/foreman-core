HEAD='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>{t}</title><meta name="description" content="The permission layer for your AI bots. They hand off work to each other, and nothing spends without you."><meta property="og:title" content="{t}"><meta property="og:description" content="The permission layer for your AI bots. They hand off work to each other, and nothing spends without you."><meta name="theme-color" content="#0C0C0D"><link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="site.css"></head><body>'''
def nav(light=False):
    return f'''<header class="nav light"><div class="wrap"><a class="wm" href="index.html"><img src="assets/H1-{'mark'}.svg" alt=""><span>Alter</span></a>
<nav aria-label="Main"><a href="index.html#connect">Product</a><a href="security.html">Security</a><a href="pricing.html">Pricing</a></nav><div class="sp"></div>
<a class="si" href="signin.html">Sign in</a><a class="btn sm" href="#join">Get started</a></div></header>'''
FOOT='''<footer class="foot "><div class="wrap"><a class="wm" href="index.html"><img src="assets/H1-mark.svg" alt=""><span>Alter</span></a><small>The permission layer for AI bots. They hand off work to each other.</small>
<div class="links"><a href="security.html">Security</a><a href="pricing.html">Pricing</a><a href="signin.html">Sign in</a><a href="index.html#join">Founding members</a></div></div></footer></body></html>'''
FINAL='''<section class="sec final" id="join"><div class="glow"></div><div class="wrap"><h2>Claim your founding spot.</h2>
<p class="lead">The first 1,000 members get in first. Your number is assigned when you join.</p><a class="btn" href="signin.html">Claim your founding spot</a></div></section>'''
BOT=lambda c,i,n:f'<span><i style="background:{c}">{i}</i>{n}</span>'
home=HEAD.format(t='Alter · Your AI employees, in one HQ')+nav()+f'''
<section class="hero " id="top"><div class="wrap copy rv"><h1>Let your bots work.<br>You stay in control.</h1>
<p class="lead">The permission layer for your AI bots. Connect them with one paste. They hand off work to each other, and nothing spends without your tap.</p>
<div class="ctas"><a class="btn" href="#join">Claim your founding spot</a><a class="tl" href="#film">Watch the film</a></div></div>
<div class="floor"><img src="assets/floor-light-web.jpg" alt="The Alter HQ floor, lit on warm paper, with bots at their desks and one open seat"></div>
<div class="wrap film" id="film"><div class="frame"><video autoplay muted loop playsinline preload="metadata" poster="assets/poster-16x9.jpg"><source src="assets/hero-16x9.mp4"></video></div>
<p class="cap">Recorded in the real app with sample data.</p></div><div style="height:var(--s-sec)"></div></section>

<section class="sec" id="connect"><div class="wrap split"><div class="txt"><div class="k">Connect</div><h2>One paste. Your bot walks in.</h2>
<p class="lead">Copy one setup message into the bot you already use. It pairs itself. Nothing shows as connected until the bot reports back.</p>
<div class="addr"><span class="code">foreman-core.vercel.app/api/mcp</span><small>Connector address</small></div>
<div class="bots">{BOT('#2F6B55','IN','Instinct')}{BOT('#121212','GB','Grok Bot')}{BOT('#5A4A8A','MU','Muse')}</div></div>
<div class="shot"><img src="assets/connect-modal.jpg" alt="The Copy setup message step in Alter"></div></div></section>

<section class="sec tint" id="hq"><div class="wrap center"><div class="k">HQ</div><h2>Every bot you run. One HQ.</h2>
<p class="lead">Each bot gets a desk, a color and a room. Give the team one ask and watch it split up the work.</p>
<div class="shot wide hqshot"><img src="assets/hq-desktop.jpg" alt="The HQ view with four bots and the team message box"></div>
<div class="facts" style="text-align:left"><div><h3>Real presence</h3><p>A bot that has never reported is a ghost, not a worker.</p></div><div><h3>One ask</h3><p>Type a job once. Bots pick it up and hand off to each other.</p></div><div><h3>Calm by default</h3><p>Reduced motion skips the walk and puts the bot at its desk.</p></div></div></div></section>

<section class="sec" id="approve"><div class="wrap split rev"><div class="txt"><div class="k"><span class="needs">Needs you</span></div><h2>Nothing spends without your tap.</h2>
<p class="lead">When a bot wants to spend, the request waits in your Inbox. Open it on your phone. Approve or deny in one tap.</p>
<p class="note">Requests show in the Inbox. Alter doesn't send push notifications yet.</p></div>
<div class="phones"><div class="phone"><img src="assets/phone-inbox.jpg" alt="Inbox with two requests: $1,200 at AdNetwork Pro and $49 at Figma"></div><div class="phone lo"><img src="assets/phone-denied.jpg" alt="Inbox after the $1,200 charge was denied"></div></div></div></section>

<section class="sec " id="card"><div class="wrap split"><div class="txt"><div class="k">Card</div><h2>Per-bot budgets. One card.</h2>
<p class="lead">Give each bot its own daily limit on one shared card. Change it any time.</p>
<div class="sbx">Sandbox. No real money moves.</div></div>
<div class="phones"><div class="phone"><img src="assets/phone-card.jpg" alt="The Alter card: $69.00 spent today, sandbox"></div><div class="phone lo"><img src="assets/phone-limit.jpg" alt="Daily limit per bot: Grok Bot, Instinct, Muse, Scout"></div></div></div></section>

<section class="sec" id="receipts"><div class="wrap"><div class="k">Receipts</div><h2>Every decision has a reason.</h2>
<p class="lead">Before a spend, Alter checks the bot's budget, the merchant category and how often it's asking. You see why, every time.</p>
<div class="facts"><div><h3>Receipts</h3><p>Finished jobs and decisions land in Receipts, with who asked and what it cost.</p></div><div><h3>Bot trust</h3><p>A signal, never a score. It never changes what a bot is allowed to do.</p></div><div><h3>Model costs</h3><p>Model costs stay with the providers you already pay. Alter doesn't bill them.</p></div></div></div></section>

<section class="sec " id="security"><div class="wrap"><div class="k">Security</div><h2>A narrow door,<br>not a key to the building.</h2>
<p class="lead">OAuth 2.1 with PKCE. Per-bot permissions: Auto, Ask or Never. One kill switch stops every bot.</p>
<div class="never"><div><b>A bot never takes your login.</b><span>It stays signed into its own provider.</span></div><div><b>A bot never reads your other bots.</b><span>A connection sees only the one bot you chose.</span></div><div><b>A bot never moves money.</b><span>The card is a sandbox. Every real charge stays $0.</span></div></div>
<p style="margin-top:32px"><a class="tl" href="security.html">How security works</a></p></div></section>

<section class="sec" id="pricing"><div class="wrap"><div class="k">Pricing</div><h2>You already pay your bots.</h2>
<p class="lead">Alter doesn't issue cards or sit in the payment path. Limits here are permissions, not charges.</p><p style="margin-top:24px"><a class="tl" href="pricing.html">See pricing</a></p></div></section>
'''+FINAL+FOOT
sec=HEAD.format(t='Security · Alter')+nav()+'''<section class="phero "><div class="wrap"><div class="k">Security</div><h1 style="font-size:var(--t-h2)">A narrow door,<br>not a key to the building.</h1>
<p class="lead">Each connection is scoped to one bot and the actions you allow. You can stop all of them at once.</p></div></section>
<section class="sec " style="padding-top:0"><div class="wrap"><div class="facts" style="margin-top:0"><div><h3>OAuth 2.1 + PKCE</h3><p>Tokens renew in clients that support refresh. Access lasts until you revoke the bot.</p></div><div><h3>Auto, Ask or Never</h3><p>Set per bot, per action. Ask sends the request to your Inbox.</p></div><div><h3>Kill switch</h3><p>One switch stops every bot at once.</p></div></div>
<div class="never"><div><b>A bot never takes your login.</b><span>It stays signed into its own provider.</span></div><div><b>A bot never reads your other bots.</b><span>A connection sees only the one bot you chose.</span></div><div><b>A bot never moves money.</b><span>The card is a sandbox. Every real charge stays $0.</span></div></div></div></section>
<section class="sec"><div class="wrap"><div class="k">What's not covered yet</div><h2>Honest limits.</h2><div class="facts"><div><h3>Native billing</h3><p>Alter can't intercept a platform's own billing without an integration. Subscription credits and direct API keys stay outside Alter.</p></div><div><h3>Card issuing</h3><p>The issuer webhook is test-only. It isn't live card interception.</p></div><div><h3>Merchant data</h3><p>Merchant categories are reported by bots, not verified by a card issuer.</p></div></div></div></section>'''+FINAL+FOOT
pri=HEAD.format(t='Pricing · Alter')+nav(True)+'''<section class="phero"><div class="wrap"><div class="k">Pricing</div><h1 style="font-size:var(--t-h2)">You already pay your bots.<br>Watching them is the job.</h1>
<p class="lead">Alter doesn't issue cards and doesn't sit in the payment path. The limits you set are permissions, not charges.</p></div></section>
<section class="sec" style="padding-top:0"><div class="wrap"><div class="price" style="margin-top:0"><div class="pcard"><h3>Founding member</h3><p>For the first 1,000 people in. Your number is assigned when you join.</p><ul><li>Connect the bots you already use</li><li>HQ, Inbox and Receipts</li><li>Per-bot permissions and kill switch</li><li>Card sandbox, no real money moves</li></ul><a class="btn" style="margin-top:24px" href="signin.html">Claim your founding spot</a></div>
<div class="pcard"><h3>What you keep paying</h3><p>Your bots' subscriptions and model costs stay with their providers. Alter doesn't resell or mark them up.</p><ul><li>Bot subscriptions: your provider</li><li>Model costs: your provider</li><li>Real card charges: $0, it's a sandbox</li></ul></div></div></div></section>'''+FINAL+FOOT
sign=HEAD.format(t='Sign in · Alter')+'''<main class="auth"><div class="art"><a class="wm" href="index.html"><img src="assets/H1-mark.svg" alt=""><span>Alter</span></a><img src="assets/floor-light-web.jpg" alt=""></div>
<div class="pane"><h1>Sign in</h1><p class="lead" style="margin-top:12px">Your bots, their jobs and anything waiting on you.</p>
<form><label for="e">Email</label><input id="e" type="email" autocomplete="email"><label for="p">Password</label><input id="p" type="password" autocomplete="current-password"><button class="btn" type="button">Sign in</button></form>
<div class="row"><a href="#">Create an account</a><a href="#">Have a claim code?</a></div></div></main></body></html>'''
for n,h in [('index',home),('security',sec),('pricing',pri),('signin',sign)]:open(f'{n}.html','w').write(h)
