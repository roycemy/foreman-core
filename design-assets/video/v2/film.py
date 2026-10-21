import sys, subprocess, json
from comp import *
fmt=sys.argv[1]; W,H=(1920,1080) if fmt=='d' else (1080,1920)
C='clips/'; XF=0.3; T=45.0
mk=lambda s:json.load(open(C+s+'.json'))
# shot: (start,end,kind,params)
D=dict
SH=[
 (0.0,4.5,'win',D(src='hook-d',ss=3.6,cam=[(0,1.0,.5,.5),(4.5,1.32,.53,.6)],sq=D(cam=[(0,1.12,.5,.55),(4.5,1.3,.52,.6)]))),
 (4.5,8.0,'win',D(src='connect-d',ss=6.2,speed=1.15,cam=[(0,1.0,.5,.46),(1.2,1.28,.5,.4),(3.5,1.36,.5,.4)],ph=D(src='connect-m',ss=4.2,speed=1.15))),
 (8.0,11.0,'win',D(src='connect-d',ss=10.9,cam=[(0,1.32,.42,.42),(3,1.16,.45,.45)],sq=D(cam=[(0,1.25,.42,.42),(3,1.15,.44,.45)]))),
 (11.0,18.0,'win',D(src='team-d',ss=0.6,cam=[(0,1.3,.36,.42),(7,1.55,.33,.38)],sq=D(cam=[(0,1.45,.33,.42),(7,1.75,.32,.38)]))),
 (18.0,21.6,'win',D(src='task-d',ss=1.6,speed=1.8,cam=[(0,1.75,.5,.92),(3.6,1.9,.5,.92)],sq=D(cam=[(0,1.7,.5,.9),(3.6,1.85,.5,.9)]))),
 (21.6,25.5,'win',D(src='task-d',ss=8.1,speed=2.2,cam=[(0,1.14,.5,.62),(3.9,1.04,.5,.52)],sq=D(cam=[(0,0.8,.5,.56),(3.9,0.86,.5,.56)]))),
 (25.5,31.0,'combo',D(src='approve-d',ss=0.3,hold=2.0,psrc='approve-m',pss=1.4,pspeed=1.2,cam=[(0,1.05,.45,.55),(5.5,1.14,.42,.58)])),
 (31.0,37.6,'win',D(src='card-d',ss=1.0,cam=[(0,1.0,.5,.45),(3.6,1.02,.5,.45),(4.8,1.3,.5,.38),(6.6,1.36,.5,.38)],ph=D(src='card-m',ss=1.0))),
 (37.6,45.0,'end',D()),
]
CAPS_T=[(0.35,4.3,"Your AI bots can spend money. Who’s in control?"),(4.75,10.4,"One paste connects the bot you already use."),
 (10.75,17.4,"Your whole AI team, in one place."),(18.0,25.3,"One big ask. They split it up and get to work."),
 (25.7,31.0,"Nothing spends without you. Approve or deny in one tap."),(31.3,37.3,"Every bot gets its own budget, on one card. Sandbox for now.")]
if fmt=='d':
    BW,BH,BX,BY=1472,828,224,46; CAPY,CAPS,CAPW=996,42,1500
    CB=D(cw=1120,ch=630,x=120,y=140,pw=412,ph=732,px=1336,py=96)
else:
    BW,BH,BX,BY=960,1100,60,560; CAPY,CAPS,CAPW=330,60,920
    PW,PH,PX,PY=700,1244,176+14,545+14
srcs={}
def S(key,clip,ss,speed=1.0):
    if key not in srcs: srcs[key]=Src(C+clip+'.mp4',ss,speed)
    return srcs[key]
def phone_ss(p,name):
    m=mk(name); return p['ss'] if p.get('ss') is not None else {'connect-m':max(0,m.get('wizard',3)-0.3)}.get(name,1.0)
def draw_shot(i,t):
    st,en,kind,p=SH[i]; lt=t-st; im=stage(W,H)
    if kind=='end':
        n=min(221,int(lt*FPS)); return Image.open(f'end/{fmt}/{n:04d}.png').convert('RGB')
    if kind=='combo':
        if fmt=='d':
            f=S((i,'a'),p['src'],p['ss']).get(min(lt,p['hold']))
            z,cx,cy=lerpcam(p['cam'],lt); c=camview(f,CB['cw'],CB['ch'],z,cx,cy); b=browser(c)
            paste_shadowed(im,b,CB['x'],CB['y'],14)
            pf=S((i,'p'),p['psrc'],p['pss'],p['pspeed']).get(lt); pc=pf.resize((CB['pw'],CB['ph']),Image.LANCZOS); ph,r=phone(pc)
            paste_shadowed(im,ph,CB['px']-14,CB['py']-14,r)
            return im
        pf=S((i,'p'),p['psrc'],p['pss'],p['pspeed']).get(lt); ph,r=phone(pf.resize((PW,PH),Image.LANCZOS)); paste_shadowed(im,ph,PX-14,PY-14,r); return im
    if fmt=='m' and p.get('ph') is not None and 'ph' in p:
        q=p['ph']; pf=S((i,'p'),q['src'],phone_ss(q,q['src']),q.get('speed',1)).get(lt); ph,r=phone(pf.resize((PW,PH),Image.LANCZOS)); paste_shadowed(im,ph,PX-14,PY-14,r); return im
    if fmt=='m' and 'ph' in p and p['ph'] is None: pass
    f=S((i,'a'),p['src'],p['ss'],p.get('speed',1)).get(lt)
    cam=p['sq']['cam'] if (fmt=='m' and 'sq' in p) else p['cam']
    z,cx,cy=lerpcam(cam,lt); c=camview(f,BW,BH,z,cx,cy); b=browser(c); paste_shadowed(im,b,BX,BY,16); return im
def cap_alpha(t,a,b,fi=0.35,fo=0.35):
    return min(eo((t-a)/fi), eo((b-t)/fo)) if a<=t<=b else 0
out=subprocess.Popen(['ffmpeg','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-c:v','libx264','-preset','medium','-crf','10','-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',f'master-{fmt}.mp4'],stdin=subprocess.PIPE)
ink=Image.new('RGB',(W,H),(17,17,17))
for n in range(int(T*FPS)):
    t=n/FPS
    i=max(k for k,s in enumerate(SH) if s[0]<=t)
    fr=draw_shot(i,t)
    if i>0 and t-SH[i][0]<XF and SH[i][2]!='end' or (i>0 and SH[i][2]=='end' and t-SH[i][0]<0.5):
        xf=XF if SH[i][2]!='end' else 0.5
        prev=draw_shot(i-1,t); fr=Image.blend(prev,fr,ease((t-SH[i][0])/xf))
    if t<0.5: fr=Image.blend(Image.new('RGB',(W,H),BG),fr,ease(t/0.5))
    for a,b,txt in CAPS_T:
        al=cap_alpha(t,a,b)
        if al>0:
            m=caption(txt,W,CAPS,CAPW); y=int(CAPY-m.size[1]/2)
            fr.paste(Image.new('RGB',m.size,(17,17,17)),(0,y),m.point(lambda v:int(v*al)))
    out.stdin.write(fr.tobytes())
    if n%150==0: print(fmt,n,flush=True)
out.stdin.close(); out.wait()
