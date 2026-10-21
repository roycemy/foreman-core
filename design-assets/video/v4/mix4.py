import numpy as np, soundfile as sf, subprocess, sys
from timeline import VO,T
SR=48000; N=int(SR*T); V=sys.argv[1] if len(sys.argv)>1 else 'am_michael'
vo=np.zeros(N); act=np.zeros(N)
for tag,s in VO:
    x=np.frombuffer(subprocess.run(['ffmpeg','-loglevel','error','-i',f'tts/{V}/{tag}.wav','-ar',str(SR),'-ac','1','-f','f32le','-'],capture_output=True).stdout,np.float32)
    a=int(s*SR); vo[a:a+len(x)]+=x; act[max(0,a-int(.12*SR)):a+len(x)+int(.2*SR)]=1
g=np.zeros(N); y=0
for k in range(0,N,48):
    c=0.001/0.12 if act[k]>y else 0.001/0.45; y+=(act[k]-y)*min(1,c*48); g[k:k+48]=y
duck=10**(-12*g/20)
m,_=sf.read('audio/music.wav'); s,_=sf.read('audio/sfx.wav')
vo/=np.abs(vo).max()
tt=np.arange(N)/SR; dip=1-0.85*np.clip(np.minimum((tt-19.3)/0.3,(20.85-tt)/0.25),0,1)
mix=m*(duck*dip)[:,None]*0.6+vo[:,None]*0.9+s
sf.write('audio/mix_raw.wav',mix/np.abs(mix).max()*0.9,SR); sf.write('audio/vo_only.wav',np.stack([vo,vo],1)*0.9,SR)
print('duck min dB',round(20*np.log10(duck.min()),1))
