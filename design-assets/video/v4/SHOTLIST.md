# Alter hero v4: shot list (45.0s, 30fps, no speed changes, no zooms)
The stage is near-black; the light app sits in a dark-chrome browser frame (16:9 window 1376×774) or a dark phone bezel, with a soft shadow and a 1px rim.
Captions and the persistent TASK chip ("Book my team offsite and buy what's needed.") sit outside the UI.
16:9: chip y≈66, frame 118–928, captions y≈1003. 9:16: captions y≈330, chip y≈468, frame/phone from y≥560.
| # | Time | Scene | Source (real UI, mocked API) | Transition in |
|---|---|---|---|---|
| A | 0–5.2 | Dark title card: "Your AI bot just asked for $1,200." / "Did you approve it?" | rendered | (loop) |
| B | 5.2–24.1 | ONE continuous take: type the task in the team box, send, routing panel, handoffs to Scout/Muse/Instinct, then the real floor popup "Charge $1200.00 at Lakeside Lodge" at about 20.4 | take-d | hard cut |
| C | 24.1–30.9 | authorization.html: tap "Run the six scenarios". Rows: Scout · Lakeside Lodge $1,200 ASK (max per purchase); Muse badges $38 ALLOW; Instinct snacks $64 ALLOW; Scout Harbor Bar $900 DENY (merchant category). 9:16 uses the phone layout | auth-d / auth-m | 0.5s crossfade |
| D | 30.9–35.9 | Phone Inbox (3 need you): Deny $1,200 at 31.3 ("Card charge denied."), approve badges at 33.6 and snacks at 35.2 ("Approved on the example card. No real money moved.") | inbox-m | 0.5s crossfade |
| E | 35.9–39.2 | Card page with the Daily limit modal: Grok $50, Instinct $150 ($64 used), Muse $100 ($38 used), Scout $500 ($0 used). One Team card ••••4821, sandbox | card-d / card-m | 0.5s crossfade |
| F | 39.2–42.2 | Dark card: "Your bots work." / "You stay in control." | rendered | 0.6s crossfade |
| G | 42.2–45.0 | Alter lockup (brand/alter-lockup-dark), "Claim your founding spot.", alterhq.app; ends dark and hard-cuts to the dark hook card | rendered | cut (silence) |
QA: qa/strip-{d,m}-a.png (cuts), qa/strip-{d,m}-final.png, qa/keyframes_d_a.png, qa/loop_first|last_*.png (16:9 means 12.7 → 14.3, 9:16 means 12.7 → 15.1, both dark).
