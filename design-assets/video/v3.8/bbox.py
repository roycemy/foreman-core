import subprocess,numpy as np
def fr(f,t,W,H):
    b=subprocess.run(['ffmpeg','-loglevel','error','-ss',str(t),'-i',f,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True).stdout
    return np.frombuffer(b,np.uint8).reshape(H,W,3)
for fmt,W,H,y0,y1 in (('d',1920,1080,140,760),('m',1080,1920,640,1500)):
    print('== floor black slab corners (left x, right x, bottom-tip y, side y)',fmt)
    for sh,ts in (('1 hook',(1.0,4.0)),('3 connect walk-in',(8.0,10.5)),('4 team',(12.0,14.5)),('6 handoffs',(19.0,20.8))):
        for t in ts:
            a=fr(f'master-{fmt}.mp4',t,W,H).astype(int); d=a.max(2)<50; d[:y0]=0; d[y1:]=0; d[:,:W//2-560 if fmt=='d' else 66]=0; d[:,(W//2+560 if fmt=='d' else W-66):]=0
            ys,xs=np.where(d); xr=xs.max(); yr=int(np.median(ys[xs>=xr-2]))
            band=d[yr-25:yr+25]; bx=np.where(band.any(0))[0]; xl=bx.min()
            yb=ys.max()
            print(f' {sh:18s} t={t:5.1f}  left {xl}  right {xr}  bottom {yb}  side-y {yr}  width {xr-xl}')
