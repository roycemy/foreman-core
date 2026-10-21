import sys, subprocess
from comp import *
fmt=sys.argv[1]; NOCAP=len(sys.argv)>2; W,H=(1920,1080) if fmt=='d' else (1080,1920)
C='clips/'; T=42.5; D=dict; TASK1=12.2
J=lambda c:json.load(open(C+c+'.json'))
if fmt=='d':
    SH=[(0.0,4.6,'full',D(src='hook-d',ss=3.6)),
     (4.6,7.6,'full',D(src='connect-d',ss=10.636)),
     (7.6,11.0,'full',D(src='connect1-d',ss=13.95)),
     (11.0,13.4,'full',D(src='team-d',ss=0.6)),
     (13.4,18.9,'full',D(src='task-d',ss=6.0)),
     (18.9,21.0,'full',D(src='task1-d',ss=TASK1)),
     (21.0,28.6,'combo',D(src='mirror-d',ss=1.475,psrc='approve-m',pss=1.734,split=1.4)),
     (28.6,34.6,'full',D(src='card-d',ss=0.7)),
     (34.6,T,'end',D())]
else:
    SH=[(0.0,4.6,'full',D(src='hook-m',ss=3.6)),
     (4.6,8.6,'full',D(src='connect-m',ss=3.2)),
     (8.6,11.0,'full',D(src='connect-m',ss=10.7)),
     (11.0,13.4,'full',D(src='team-m',ss=0.6)),
     (13.4,18.9,'dfit',D(src='task-d',ss=6.0)),
     (18.9,21.0,'dfit',D(src='task1-d',ss=TASK1)),
     (21.0,28.6,'combo',D(src='mirror-d',ss=1.475,psrc='approve-m',pss=1.734,split=1.4)),
     (28.6,34.6,'full',D(src='card-m',ss=1.331)),
     (34.6,T,'end',D())]
CAPS_T=[(0.3,4.5,"Your bots can spend your money. Who’s in control?"),(4.8,10.8,"One paste. Your bot walks in."),
 (11.2,14.8,"Every bot you run. One HQ."),(15.2,20.8,"One ask. They split it, hand it off, finish it."),
 (21.2,28.3,"Nothing spends without your tap."),(28.8,34.4,"Per-bot budgets. One card. Your rules.")]
if fmt=='m':  # phone: start the connect line once the inspector sheet is gone; card line moves to the dimmed backdrop once the limit sheet opens
    CAPS_T[1]=(5.4,10.8,CAPS_T[1][2]); CAPS_T[5:]=[(28.8,32.3,CAPS_T[5][2])]
# caption placement: where the UI has free space, so no key UI is covered
if fmt=='d': CAPS,CAPW=46,1500; POS=lambda t:('top',104,78,80)   # under the app header, above the floor
else: CAPS,CAPW=60,960; POS=lambda t:('top',300,140,250) if (t<15.0 or t>=32.5) else ('bot',1790,1920-300,300)
CB=D(cw=1120,ch=630,x=120,y=140,pw=412,ph=732,px=1336,py=96)
srcs={}
def S(key,clip,ss):
    if key not in srcs: srcs[key]=Src(C+clip+'.mp4',ss)
    return srcs[key]
def fit(f):  # whole viewport, scaled to the frame (same aspect: edge to edge)
    return f if f.size==(W,H) else f.resize((W,H),Image.LANCZOS)
def draw_shot(i,t):
    st,en,kind,p=SH[i]; lt=t-st
    if kind=='end':
        n=min(236,int(lt*FPS)); return Image.open(f'end/{fmt}/{n:04d}.png').convert('RGB')
    if kind=='combo':
        pf=S((i,'p'),p['psrc'],p['pss']).get(lt)
        if fmt=='m': return fit(pf)
        f=S((i,'a'),p['src'],p['ss']).get(lt)
        dur=SH[i][1]-SH[i][0]
        k=min(ease((lt-p['split'])/0.45), ease((dur-lt)/0.45))   # phone eases in, then back out before the next shot
        if k<=0: return fit(f)
        im=stage(W,H)
        tx,ty,tw,th=CB['x'],CB['y'],CB['cw'],CB['ch']+34
        x=round(tx*k); y=round(ty*k); w=round(W+(tw-W)*k); h=round(H+(th-H)*k)
        paste_shadowed(im,f.resize((w,h),Image.LANCZOS),x,y,round(14*k))
        ph,r=phone(pf.resize((CB['pw'],CB['ph']),Image.LANCZOS))
        px=round(W+40+(CB['px']-14-W-40)*k); paste_shadowed(im,ph,px,CB['py']-14,r); return im
    f=S((i,'a'),p['src'],p['ss']).get(lt)
    if kind=='dfit':  # whole desktop dashboard, scaled to fit the width
        im=stage(W,H); c=f.resize((1000,int(1000*f.size[1]/f.size[0])),Image.LANCZOS); b=browser(c); paste_shadowed(im,b,40,int(H*0.42-b.size[1]/2),14); return im
    return fit(f)
# bottom gradient (warm off-white, matches the UI), only while a caption is up
def grad(kind,gh):
    y=np.linspace(0,1,gh)[:,None]
    if kind=='top': y=np.minimum(1,np.minimum(y*6,(1-y)*1.6))   # quick fade-in from the header edge, long fade-out
    return y**1.4*0.85*255
def cap_alpha(t,a,b,fi=0.25,fo=0.25):
    return min(eo((t-a)/fi), eo((b-t)/fo)) if a<=t<=b else 0
out=subprocess.Popen(['ffmpeg','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-c:v','libx264','-preset','medium','-crf','12','-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',f'master-{fmt}'+('-nocap' if NOCAP else '')+'.mp4'],stdin=subprocess.PIPE)
XF=10; NF=int(T*FPS)
for n in range(NF):
    t=n/FPS
    i=max(k for k,s in enumerate(SH) if s[0]<=t)
    fr=draw_shot(i,t).copy()
    lt=t-SH[i][0]
    if i>0 and lt<XF/FPS:   # 10-frame dissolve: the outgoing shot keeps playing under the incoming one
        fr=Image.blend(draw_shot(i-1,t).copy(),fr,ease((lt*FPS+1)/(XF+1)))
    if n==0: FIRST=fr.copy()
    if n>=NF-XF: fr=Image.blend(fr,FIRST,ease((n-(NF-XF)+1)/(XF+1)))   # loop: dissolve into frame 0
    for a,b,txt in ([] if NOCAP else CAPS_T):
        al=cap_alpha(t,a,b)
        if al>0:
            kind,CAPY,gy,gh=POS(a)
            fr.paste(Image.new('RGB',(W,gh),(246,246,243)),(0,gy),Image.fromarray(np.repeat((grad(kind,gh)*al).astype(np.uint8),W,1)))
            m=caption(txt,W,CAPS,CAPW); yy=int(CAPY-m.size[1]/2+10*(1-eo(min(1,(t-a)/0.35))))
            fr.paste(Image.new('RGB',m.size,(17,17,17)),(0,yy),m.point(lambda v:int(v*al)))
    out.stdin.write(fr.tobytes())
out.stdin.close(); out.wait()
