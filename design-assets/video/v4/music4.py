# Original score for Alter hero v4, synthesized in code (numpy/scipy), no samples. CC0.
import numpy as np, soundfile as sf
from scipy.signal import butter, lfilter, sosfilt
from timeline import T, SFX
SR=48000; N=int(SR*T); rng=np.random.default_rng(11)
L=np.zeros(N); R=np.zeros(N)
n2f=lambda m:440*2**((m-69)/12)
def add(s,t,pan=0,g=1):
    i=int(t*SR); j=min(N,i+len(s));
    if i>=N or j<=i: return
    s=s[:j-i]*g; L[i:j]+=s*np.sqrt((1-pan)/2); R[i:j]+=s*np.sqrt((1+pan)/2)
def tt(d): return np.arange(int(d*SR))/SR
def env_ar(d,a,r):
    t=tt(d); return np.minimum(1,t/a)*np.clip((d-t)/r,0,1)
def drone(ms,d,a=1.5,r=1.5,det=0.08):
    t=tt(d); s=0
    for m in ms:
        f=n2f(m)
        for dt in (-det,det): s=s+np.sin(2*np.pi*f*(1+dt/100)*t+rng.random()*6)+0.25*np.sin(2*np.pi*2*f*(1+dt/100)*t)
    return s*env_ar(d,a,r)/len(ms)
def piano(m,d=4.0,v=1.0,bright=1.0):
    t=tt(d); f=n2f(m)
    s=sum((0.55**k)*bright**k*np.sin(2*np.pi*f*(k+1)*t*(1+0.0003*k*k))*np.exp(-t*(0.9+0.8*k)) for k in range(5))
    return s*np.minimum(1,t/0.005)*v
def pulse(m,d=0.22):
    t=tt(d); f=n2f(m); return (np.sin(2*np.pi*f*t)+0.2*np.sin(4*np.pi*f*t))*np.minimum(1,t/0.004)*np.exp(-t/0.07)
def kick(g=1):
    t=tt(0.45); f=42+60*np.exp(-t*28); return np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t*7)*g
def tick(dec=0.02):
    x=rng.standard_normal(int(0.08*SR)); x=lfilter(*butter(2,5000/(SR/2),'high'),x); return x*np.exp(-tt(0.08)/dec)*0.4
def sub_heart(t0):
    add(kick(0.9),t0,0,0.30); add(kick(0.6),t0+0.28,0,0.18)
BPM=100; b=60/BPM
# --- A: hook 0-5.2 : low tense drone + ticking clock
add(drone([38,45,50],5.6,0.25,0.4),0,0,0.22)
add(drone([63],5.4,0.5,0.4,0.2),0,0,0.035)   # high dissonant minor 2nd shimmer vs D
for k in range(int(5.0/(b/2))): add(tick(0.012),0.2+k*b/2,0.3 if k%2 else -0.3,0.05)
sub_heart(0.35); sub_heart(2.75)
# --- B1: setup 5.2-12 curious piano, D minor, sparse
mot=[(5.4,62),(6.2,65),(7.0,69),(8.6,67),(9.4,65),(10.2,64)]
add(drone([38,45],7.2,1.2,1.0),5.2,0,0.12)
for t0,m in mot: add(piano(m,3.5,0.18),t0,0.15)
add(piano(50,5,0.16),5.2); add(piano(46,5,0.14),8.6)
# --- B2: bots work 12-19.4 : pulse + soft kit, Bb - F - C - Dm
ch=[[46,53,58,62],[41,48,53,57],[48,55,60,64],[50,57,62,65]]
t0=12.0; bar=4*b
while t0<19.3:
    c=ch[int((t0-12)/bar)%4]
    add(drone([c[0]-12,c[1]],bar+0.6,0.4,0.6),t0,0,0.10)
    for k in range(8):
        tk=t0+k*b/2
        if tk>=19.3: break
        add(pulse(c[1+(k%3)]+12),tk,-0.25 if k%2 else 0.25,0.06)
        add(tick(0.015),tk+b/4,0.2,0.035)
        if k%4==0: add(kick(),tk,0,0.20)
    t0+=bar
# riser into the held pause, then near-silence 19.4-20.9
x=rng.standard_normal(int(1.6*SR)); x=lfilter(*butter(2,[800/(SR/2),5000/(SR/2)],'band'),x)*(tt(1.6)/1.6)**2.5*0.07; add(x,17.8)
add(drone([38],1.6,0.3,0.6),19.4,0,0.025)
# --- C: the ask + intercept 20.9-31.2 : tense low drone, heartbeat, high minor-2nd
add(drone([38,45,51],10.6,0.6,0.6),20.7,0,0.17)
add(drone([75,76],10.0,2.0,0.5,0.15),21.0,0,0.018)
for t0 in np.arange(21.0,31.0,1.6): sub_heart(t0)
for t0 in np.arange(24.4,31.0,b/2): add(pulse(62,0.12),t0,0.2,0.025)
# --- D: deny release 31.2 : warm major (D major), piano bloom
add(drone([50,57,62,66],8.2,0.5,1.5),31.2,0,0.14)
for dt,m,v in ((0,62,0.22),(0.08,66,0.16),(0.16,69,0.14),(0.3,74,0.12)): add(piano(m,5,v,1.1),31.25+dt,0.1)
# light return of motion 33-39 (G - D - A), gentle
ch2=[[43,50,55,59],[50,57,62,66],[45,52,57,61]]
t0=33.0
while t0<39.0:
    c=ch2[int((t0-33)/bar)%3]
    for k in range(8):
        tk=t0+k*b/2
        if tk>=39.0: break
        add(pulse(c[1+(k%3)]+12),tk,-0.2 if k%2 else 0.2,0.045)
        if k%4==0: add(kick(0.7),tk,0,0.13)
    add(drone([c[0],c[2]],bar+0.5,0.5,0.6),t0,0,0.08)
    t0+=bar
# --- F/G: close + resolve
add(drone([50,57,62],2.7,0.6,1.2),39.2,0,0.10); add(piano(62,3,0.14),39.4)
# held silence ~42.0-42.3, then resolve chord ring-out
for dt,m,v in ((0,38,0.26),(0,50,0.22),(0.05,57,0.17),(0.1,62,0.15),(0.15,66,0.13),(0.22,69,0.11),(0.5,74,0.09)): add(piano(m,3.2,v),42.85+dt)
add(drone([62,66,69,74],2.15,0.5,1.4),42.85,0,0.08)
mix=np.stack([L,R],1)
mix=lfilter(*butter(2,9500/(SR/2)),mix,axis=0)
fi=np.minimum(1,np.arange(N)/(0.08*SR)); fo=np.ones(N); k=int(1.4*SR); fo[-k:]=np.linspace(1,0,k)**1.5
mix*=(fi*fo)[:,None]
sf.write('audio/music.wav',mix/np.abs(mix).max()*0.8,SR)
# --- SFX (subtle)
S=np.zeros((N,2))
def sadd(s,t,g):
    i=int(t*SR); j=min(N,i+len(s)); S[i:j]+=s[:j-i,None]*g
def sine_env(fs,d,dec):
    t=tt(d); return sum(a*np.sin(2*np.pi*f*t)*np.exp(-t*k) for f,a,k in zip(fs,[1,0.5,0.25],dec))*np.minimum(1,t/0.003)
for kind,t in SFX:
    if kind=='send': sadd(lfilter(*butter(2,2500/(SR/2),'high'),rng.standard_normal(int(0.03*SR)))*np.exp(-tt(0.03)*150)+0.5*np.sin(2*np.pi*1800*tt(0.03))*np.exp(-tt(0.03)*120),t,0.18)
    if kind=='pop': sadd(sine_env([880,1320],0.6,[6,9]),t,0.07)
    if kind=='rows':
        for q in range(4): sadd(sine_env([1568],0.15,[30]),t+q*0.09,0.03)
    if kind=='deny': sadd(sine_env([293.7,220],0.9,[5,6]),t,0.09)
    if kind=='ok': sadd(sine_env([1318.5,1975.5],0.8,[5,7]),t,0.06)
    if kind=='logo': sadd(sine_env([2349,3136],1.6,[2.5,3.5]),t,0.035)
sf.write('audio/sfx.wav',S,SR)
