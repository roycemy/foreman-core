import subprocess,numpy as np
from PIL import Image
from scipy import ndimage
def fr(f,t,W,H):
    b=subprocess.run(['ffmpeg','-loglevel','error','-ss',str(t),'-i',f,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True).stdout
    return np.frombuffer(b,np.uint8).reshape(H,W,3)
for fmt,W,H in (('d',1920,1080),('m',1080,1920)):
    print('== floor bbox',fmt)
    for t in (1.0,4.0,8.0,10.5,12.0,14.5,19.0,20.8):
        a=fr(f'master-{fmt}.mp4',t,W,H).astype(int); dark=a.max(2)<50
        lab,n=ndimage.label(dark); sz=ndimage.sum(dark,lab,range(1,n+1)); k=int(np.argmax(sz))+1
        ys,xs=np.where(lab==k); print(f' t={t:5.1f} bbox x{xs.min()}-{xs.max()} y{ys.min()}-{ys.max()} px={int(sz[k-1])}')
    print('== red Approve-button pixels 0-20s',fmt)
    out=[]
    for t in np.arange(0,20.01,0.5):
        a=fr(f'master-{fmt}.mp4',t,W,H).astype(int); r=((a[...,0]>200)&(a[...,1]<110)&(a[...,2]<90)).sum(); out.append(f'{t:.1f}:{r}')
    print(' '.join(out))
    print('== last 30 frames vs final frame',fmt)
    b=subprocess.run(['ffmpeg','-loglevel','error','-sseof','-1.0','-i',f'master-{fmt}.mp4','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True).stdout
    fs=np.frombuffer(b,np.uint8).reshape(-1,H,W,3).astype(int)[-30:]
    print(' n',len(fs),'max mean-abs-diff vs last',max(np.abs(f-fs[-1]).mean() for f in fs),'mean luma first/last',fs[0].mean(),fs[-1].mean(),'dark px last',(fs[-1].max(3 if False else 2)<60).sum())
