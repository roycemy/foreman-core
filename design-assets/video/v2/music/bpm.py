import numpy as np, subprocess, sys
def load(f,ss=20,t=40):
    r=subprocess.run(['ffmpeg','-loglevel','error','-ss',str(ss),'-t',str(t),'-i',f,'-ac','1','-ar','11025','-f','f32le','-'],capture_output=True); return np.frombuffer(r.stdout,np.float32)
for f in sys.argv[1:]:
    x=load(f); h=256; n=len(x)//h; e=np.array([np.sum(x[i*h:(i+1)*h]**2) for i in range(n)]); o=np.maximum(0,np.diff(np.log(e+1e-9)))
    o-=o.mean(); ac=np.correlate(o,o,'full')[len(o)-1:]; fr=11025/h
    lags=np.arange(len(ac)); bpm=60*fr/np.maximum(lags,1); m=(bpm>80)&(bpm<170); L=lags[m][np.argmax(ac[m])]
    rms=np.sqrt(np.mean(x**2)); print(f"{f}: ~{60*fr/L:.1f} bpm, rms {20*np.log10(rms):.1f} dB")
