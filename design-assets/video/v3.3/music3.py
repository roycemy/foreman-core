# Original composition for Alter hero v3 (synthesized, no samples) -> CC0 by author
import numpy as np, soundfile as sf
SR=48000; T=42.5; N=int(SR*T); rng=np.random.default_rng(7)
L=np.zeros(N); R=np.zeros(N)
BPM=92; beat=60/BPM; bar=4*beat
def n2f(m): return 440*2**((m-69)/12)
def add(sig,t,pan=0.0,g=1.0):
    i=int(t*SR); j=min(N,i+len(sig))
    if i>=N: return
    s=sig[:j-i]*g; L[i:j]+=s*np.sqrt((1-pan)/2); R[i:j]+=s*np.sqrt((1+pan)/2)
def env(n,a,d):
    t=np.arange(n)/SR; return np.minimum(1,t/a)*np.exp(-t/d)
def piano(m,dur=3.0,v=1.0):
    n=int(dur*SR); t=np.arange(n)/SR; f=n2f(m)
    s=sum((0.6**k)*np.sin(2*np.pi*f*(k+1)*t*(1+0.0004*k*k))*np.exp(-t*(1.2+0.9*k)) for k in range(5))
    return s*np.minimum(1,t/0.004)*v
def pad(ms,dur,a=1.2):
    n=int(dur*SR); t=np.arange(n)/SR; s=np.zeros(n)
    for m in ms:
        for dt in (-0.06,0.06): s+=np.sin(2*np.pi*n2f(m)*(1+dt/100)*t+rng.random()*6)
    e=np.minimum(1,t/a)*np.minimum(1,(dur-t)/1.0).clip(0); return s*e/len(ms)
def pulse(m,dur=beat/2*0.9):
    n=int(dur*SR); t=np.arange(n)/SR; f=n2f(m)
    s=np.sin(2*np.pi*f*t)+0.3*np.sin(2*np.pi*2*f*t)+0.12*np.sin(2*np.pi*3*f*t)
    return s*np.minimum(1,t/0.006)*np.exp(-t/0.11)
def kick():
    n=int(0.35*SR); t=np.arange(n)/SR; f=48+70*np.exp(-t*30)
    return np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t*9)
def hat(dec=0.03):
    n=int(0.12*SR); x=rng.standard_normal(n); x=np.diff(np.concatenate([[0],x]))  # highpass-ish
    return x*np.exp(-np.arange(n)/SR/dec)*0.5
# progression (D major): Dmaj9, Bm7, Gmaj7, A6sus  -- 2 bars each loop
CH=[[50,57,64,66,69],[47,54,62,66,69],[43,50,59,62,66],[45,52,59,61,64]]
nb=int(T/bar)+1
for b in range(nb):
    t0=b*bar; c=CH[(b//2)%4] if t0<34.6 else [50,57,64,66,69]
    if t0>=34.6: break
    if b%2==0: add(pad([x+12 for x in c[1:4]],2*bar+1.0,1.5),t0,0,0.10)
    # pulse eighths
    for k in range(8):
        tt=t0+k*beat/2; m=c[1+(k%3)]+12
        add(pulse(m),tt,-0.3 if k%2 else 0.3,0.05*(0.75 if k%2 else 1))
    # piano: sparse
    add(piano(c[0]+12,3.0,0.22),t0); add(piano(c[2]+12,2.5,0.14),t0+beat*1.5,0.2)
    if t0>=21: add(piano(c[3]+24,2.5,0.10),t0+beat*2.5,-0.2)
    # percussion from connect (4.6s)
    if t0>=4.6-1e-3 or t0+bar>4.6:
        for k in range(4):
            tt=t0+k*beat
            if tt<4.6 or tt>=34.4: continue
            if k in (0,2): add(kick(),tt,0,0.22)
            add(hat(),tt+beat/2,0.25,0.06)
            if tt>=21: # lift: 16th shaker
                for q in (1,3): add(hat(0.018),tt+q*beat/4,-0.25,0.035)
# swell into lift
n=int(1.6*SR); t=np.arange(n)/SR; sw=rng.standard_normal(n); 
from scipy.signal import butter,lfilter
b,a=butter(2,[1500/(SR/2),6000/(SR/2)],'band'); sw=lfilter(b,a,sw)*(t/1.6)**2*0.08; add(sw,21.0-1.6)
# lift pad layer 21-34.6
add(pad([74,78,81],13.6,2.0),21.0,0,0.05)
# resolve: final chord on end card
for m,dt,v in ((38,0,0.30),(50,0,0.25),(57,0.05,0.18),(62,0.1,0.16),(66,0.15,0.14),(69,0.2,0.12),(74,0.6,0.10)):
    add(piano(m+12 if m<45 else m,6.0,v),34.6+dt)
add(pad([62,66,69,74],7.4,0.8),34.6,0,0.10)
mix=np.stack([L,R],1)
# soft lowpass for warmth
b,a=butter(2,9000/(SR/2)); mix=lfilter(b,a,mix,axis=0)
fo=np.ones(N); k=int(1.2*SR); fo[-k:]=np.linspace(1,0,k)**2; fi=np.minimum(1,np.arange(N)/(0.25*SR))
mix*= (fo*fi)[:,None]
sf.write('audio/music.wav',mix/np.abs(mix).max()*0.8,SR)
# SFX
S=np.zeros((N,2))
def sadd(sig,t,g):
    i=int(t*SR); S[i:i+len(sig)]+=sig[:,None]*g
tt=np.arange(int(0.05*SR))/SR; click=(rng.standard_normal(len(tt))*0.4+np.sin(2*np.pi*2400*tt))*np.exp(-tt*180)
sadd(click,7.15,0.35)
tt=np.arange(int(0.25*SR))/SR; tick=np.sin(2*np.pi*1760*tt)*np.exp(-tt*40)+0.4*np.sin(2*np.pi*2640*tt)*np.exp(-tt*55)
sadd(tick,8.3,0.18)
tt=np.arange(int(1.4*SR))/SR
chime=sum(g*np.sin(2*np.pi*f*tt)*np.exp(-tt*k) for f,g,k in ((1318.5,1,3.5),(1975.5,0.6,4.5),(2637,0.25,6)))
chime2=sum(g*np.sin(2*np.pi*f*tt)*np.exp(-tt*k) for f,g,k in ((1760,1,3.5),(2637,0.5,4.5)))
for tp in (18.41,22.78,27.41): sadd(click,tp,0.16)
sadd(chime*np.minimum(1,tt/0.003),22.85,0.15); sadd(chime2*np.minimum(1,tt/0.003),22.97,0.11)
deny=sum(g*np.sin(2*np.pi*f*tt*(1-0.15*np.minimum(1,tt/0.08)))*np.exp(-tt*k) for f,g,k in ((98,1,9),(147,0.5,12)))+rng.standard_normal(len(tt))*0.15*np.exp(-tt*60)
sadd(deny*np.minimum(1,tt/0.004),27.45,0.30)
sf.write('audio/sfx.wav',S,SR)
