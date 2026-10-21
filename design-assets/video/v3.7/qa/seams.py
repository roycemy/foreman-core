import subprocess,numpy as np,sys
from PIL import Image
f=sys.argv[1]; W,H=(480,270) if '16x9' in f else (270,480)
raw=subprocess.run(['ffmpeg','-loglevel','error','-i',f,'-vf',f'scale={W}:{H}','-f','rawvideo','-pix_fmt','gray','-'],capture_output=True).stdout
a=np.frombuffer(raw,np.uint8).reshape(-1,H,W).astype(float)
d=np.abs(np.diff(a,axis=0)).mean((1,2)); br=a.mean((1,2))
cuts=[float(x) for x in sys.argv[2].split(',')]
for c in cuts:
    n=int(round(c*30)); seg=d[n-6:n+14]
    print(f'{c:5.1f} diffs',' '.join(f'{x:.1f}' for x in seg),'| max',f'{seg.max():.1f}','zeros',int((seg<0.01).sum()),'bright',f'{br[n-6]:.0f}->{br[n+14]:.0f}')
print('loop seam last->first',np.abs(a[-1]-a[0]).mean().round(3),'frames',len(a))
