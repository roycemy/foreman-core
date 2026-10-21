import sys, subprocess
from comp import *
fmt=sys.argv[1]; W,H=(1920,1080) if fmt=='d' else (1080,1920)
C='clips/'; T=42.5; D=dict
if fmt=='d': WIDE,MED,ANC=1.0,1.304,(.5,.435)
else: WIDE,MED,ANC=0.62,1.3,(.5,.435)
w=lambda z:[(0,z,*ANC)]
SH=[
 (0.0,4.6,'win',D(src='hook-d',ss=3.6,cam=w(WIDE))),
 (4.6,7.6,'strip',D(src='connect-d',ss=10.8,cam=[(0,2.91,.5,.288)])),
 (7.6,11.0,'win',D(src='connect1-d',ss=13.95,cam=w(WIDE))),
 (11.0,15.0,'win',D(src='team-d',ss=0.6,cam=w(WIDE))),
 (15.0,18.6,'strip',D(src='task-d',ss=4.6,speed=1.8,cam=[(0,2.13,.5,.888)])),
 (18.6,21.0,'win',D(src='task1-d',ss=11.4,speed=2.4,cam=w(WIDE))),
 (21.0,28.6,'combo',D(src='mirror-d',ss=1.46,psrc='approve-m',pss=1.46)),
 (28.6,31.4,'win',D(src='card-d',ss=1.0,cam=w(WIDE),ph=D(src='card-m',ss=1.0))),
 (31.4,34.6,'win',D(src='card-d',ss=3.8,cam=[(0,MED*0.94,*ANC),(0.25,MED,*ANC)],ph=D(src='card-m',ss=3.8))),
 (34.6,T,'end',D()),
]
CAPS_T=[(0.3,4.5,"Your bots can spend your money. Who’s in control?"),(4.8,10.8,"One paste. Your bot walks in."),
 (11.2,14.8,"Every bot you run. One HQ."),(15.2,20.8,"One ask. They split it, hand it off, finish it."),
 (21.2,28.3,"Nothing spends without your tap."),(28.8,34.4,"Per-bot budgets. One card. Your rules.")]
if fmt=='d':
    BW,BH,BX,BY=1472,828,224,46; CAPY,CAPS,CAPW=996,46,1500
    SW,SHh=1472,456; SX,SY=224,460-(456+34)//2
    CB=D(cw=1120,ch=630,x=120,y=140,pw=412,ph=732,px=1336,py=96)
else:
    BW,BH,BX,BY=960,1100,60,560; CAPY,CAPS,CAPW=330,64,920
    SW,SHh=960,297; SX,SY=60,560+(1100+34)//2-(297+34)//2
    PW,PH,PX,PY=700,1244,176+14,545+14
srcs={}
def S(key,clip,ss,speed=1.0):
    if key not in srcs: srcs[key]=Src(C+clip+'.mp4',ss,speed)
    return srcs[key]
def phone_at(im,pf):
    ph,r=phone(pf.resize((PW,PH),Image.LANCZOS)); paste_shadowed(im,ph,PX-14,PY-14,r)
def draw_shot(i,t):
    st,en,kind,p=SH[i]; lt=t-st; im=stage(W,H)
    if kind=='end':
        n=min(236,int(lt*FPS)); return Image.open(f'end/{fmt}/{n:04d}.png').convert('RGB')
    if kind=='combo':
        pf=S((i,'p'),p['psrc'],p['pss']).get(lt)
        if fmt=='d':
            f=S((i,'a'),p['src'],p['ss']).get(lt)
            c=camview(f,CB['cw'],CB['ch'],1.0,.5,.5); paste_shadowed(im,browser(c),CB['x'],CB['y'],14)
            ph,r=phone(pf.resize((CB['pw'],CB['ph']),Image.LANCZOS)); paste_shadowed(im,ph,CB['px']-14,CB['py']-14,r)
        else: phone_at(im,pf)
        return im
    if fmt=='m' and p.get('ph'):
        q=p['ph']; phone_at(im,S((i,'p'),q['src'],q['ss']).get(lt)); return im
    f=S((i,'a'),p['src'],p['ss'],p.get('speed',1)).get(lt)
    z,cx,cy=lerpcam(p['cam'],lt)
    if kind=='strip':
        c=camview(f,SW,SHh,z,cx,cy); paste_shadowed(im,browser(c),SX,SY,16); return im
    c=camview(f,BW,BH,z,cx,cy); paste_shadowed(im,browser(c),BX,BY,16); return im
def cap_alpha(t,a,b,fi=0.25,fo=0.25):
    return min(eo((t-a)/fi), eo((b-t)/fo)) if a<=t<=b else 0
out=subprocess.Popen(['ffmpeg','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-c:v','libx264','-preset','medium','-crf','10','-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',f'master-{fmt}.mp4'],stdin=subprocess.PIPE)
for n in range(int(T*FPS)):
    t=n/FPS
    i=max(k for k,s in enumerate(SH) if s[0]<=t)
    fr=draw_shot(i,t)
    if t<0.3: fr=Image.blend(Image.new('RGB',(W,H),BG),fr,ease(t/0.3))
    for a,b,txt in CAPS_T:
        al=cap_alpha(t,a,b)
        if al>0:
            m=caption(txt,W,CAPS,CAPW); y=int(CAPY-m.size[1]/2)
            fr.paste(Image.new('RGB',m.size,(17,17,17)),(0,y),m.point(lambda v:int(v*al)))
    out.stdin.write(fr.tobytes())
    if n%300==0: print(fmt,n,flush=True)
out.stdin.close(); out.wait()
