import numpy as np, soundfile as sf
SR=48000; T=42.5; N=int(SR*T)
st=[0.3,4.7,11.55,15.0,21.0,28.0,35.0]
vo=np.zeros(N); act=np.zeros(N)
for i,s in enumerate(st):
    x,sr=sf.read(f'vot/{i}.wav'); assert sr==SR
    x=x.copy(); f=int(0.015*SR); x[:f]*=np.linspace(0,1,f); x[-f:]*=np.linspace(1,0,f)
    a=int(s*SR); vo[a:a+len(x)]+=x; act[max(0,a-int(.15*SR)):a+len(x)+int(.25*SR)]=1
# smooth gate (attack 150ms, release 400ms)
g=np.zeros(N); y=0
for k in range(0,N,48):
    tgt=act[k]; c=0.048/0.15 if tgt>y else 0.048/0.4; y+= (tgt-y)*min(1,c); g[k:k+48]=y
duck=10**(-13*g/20)
m,_=sf.read('audio/music.wav'); s,_=sf.read('audio/sfx.wav')
vo/=np.abs(vo).max()
mus=m*duck[:,None]*0.55
mix=mus+vo[:,None]*0.9+s
sf.write('audio/mix_raw.wav',mix/np.abs(mix).max()*0.9,SR)
sf.write('audio/vo_only.wav',np.stack([vo,vo],1)*0.9,SR)
print('duck dB',20*np.log10(duck.min()))
