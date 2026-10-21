import numpy as np, wave
sr=44100; bpm=120; beat=60/bpm; D=45.0; n=int(sr*D); t=np.arange(n)/sr
out=np.zeros(n)
def note(f): return 440*2**((f-69)/12)
def env(L,a=0.005,r=0.2):
    e=np.ones(L); A=int(a*sr); e[:A]=np.linspace(0,1,A); R=int(min(r,L/sr)*sr); e[-R:]*=np.linspace(1,0,R); return e
def add(start,sig):
    s=int(start*sr); e=min(n,s+len(sig)); out[s:e]+=sig[:e-s]
# chords: Cmaj9 - Am7 - Fmaj7 - G6, one bar each (2s)
prog=[[48,55,64,71,74],[45,52,60,67,72],[41,48,57,64,69],[43,50,59,64,71]]
bars=int(D/(4*beat))+1
rng=np.random.default_rng(1)
for b in range(bars):
    ch=prog[b%4]; st=b*4*beat
    # pad: sustained detuned saws lowpassed (approx with few harmonics)
    L=int(4*beat*sr); tt=np.arange(L)/sr
    pad=sum(sum(np.sin(2*np.pi*note(m)*k*(1+d)*tt)/k**1.6 for k in range(1,5)) for m in ch[1:] for d in (-0.002,0.002))
    add(st,0.022*pad*env(L,0.25,0.4))
    # pulse: eighth-note plucks of chord tones
    for i in range(8):
        m=ch[[1,2,3,4,3,2,3,4][i]]+12; L2=int(0.22*sr); tt=np.arange(L2)/sr
        s=np.sin(2*np.pi*note(m)*tt)*np.exp(-tt*14); add(st+i*beat/2,0.05*s)
    # bass: root on 8ths with offbeat accent
    for i in range(8):
        L2=int(0.24*sr); tt=np.arange(L2)/sr; f=note(ch[0]-12)
        s=(np.sin(2*np.pi*f*tt)+0.3*np.sin(4*np.pi*f*tt))*np.exp(-tt*9); add(st+i*beat/2,(0.14 if i%2 else 0.10)*s)
    for i in range(4):
        # kick on beats
        L2=int(0.3*sr); tt=np.arange(L2)/sr; f=50+90*np.exp(-tt*30)
        add(st+i*beat,0.38*np.sin(2*np.pi*np.cumsum(f)/sr)*np.exp(-tt*9))
        # clap on 2 and 4
        if i%2: L3=int(0.15*sr); add(st+i*beat,0.07*rng.standard_normal(L3)*np.exp(-np.arange(L3)/sr*28))
    for i in range(8):
        # hat on offbeats, tick on downbeats
        L3=int(0.05*sr); hp=rng.standard_normal(L3); hp=np.diff(hp,prepend=0)
        add(st+i*beat/2,(0.05 if i%2 else 0.018)*hp*np.exp(-np.arange(L3)/sr*(70 if i%2 else 110)))
# intro/outro shaping for loop: fade in 0.25s, fade out last 1.2s
fi=int(0.25*sr); out[:fi]*=np.linspace(0,1,fi); fo=int(1.2*sr); out[-fo:]*=np.linspace(1,0,fo)**1.5
out=out/np.max(np.abs(out))*0.85
st=np.stack([out,out*0.98],1)
with wave.open('build/music.wav','wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes((st*32767).astype(np.int16).tobytes())
