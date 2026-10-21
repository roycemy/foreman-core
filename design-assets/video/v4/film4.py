import sys, subprocess, json
from comp import *
from timeline import VO, CAP, T
fmt=sys.argv[1]; W,H=(1920,1080) if fmt=='d' else (1080,1920)
C='clips/'; D=dict
dur={}
for tag,_ in VO:
    dur[tag]=float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f'tts/am_michael/{tag}.wav'],capture_output=True,text=True).stdout)
ST=dict(VO)
# scenes: (start,end,kind,params,xfade_in)
SC=[(0.0,5.2,'hook',D(),0),
    (5.2,24.1,'win',D(src='take-d',ss=1.7),0),
    (24.1,30.9,'win' if fmt=='d' else 'ph',D(src='auth-'+fmt,ss=1.3),0.5),
    (30.9,35.9,'ph',D(src='inbox-m',ss=2.4),0.5),
    (35.9,39.2,'win' if fmt=='d' else 'ph',D(src='card-'+fmt,ss=3.1 if fmt=='d' else 4.7),0.5),
    (39.2,42.2,'close',D(),0.6),
    (42.2,T,'end',D(),0)]
if fmt=='d':
    CAPY,CAPS,CAPW=1003,40,1500; CHIPY=66
    CW,CH=1376,774; CX,CY=(W-CW)//2,118
    PW,PH=430,764; PX,PY=(W-PW-28)//2,116
    TSZ=74; LOGO=520
else:
    CAPY,CAPS,CAPW=330,54,940; CHIPY=468
    CW,CH=1000,562; CX,CY=(W-CW)//2,830
    PW,PH=680,1209; PX,PY=(W-PW-28)//2,560
    TSZ=82; LOGO=600
WHITE=(245,245,247); GREY=(142,142,147)
srcs={}
def S(key,clip,ss):
    if key not in srcs: srcs[key]=Src(C+clip+'.mp4',ss)
    return srcs[key]
def text_layer(lines,size,maxw):  # lines: list of (text,color,alpha)
    pass
def put_text(im,txt,cy,size,col,al,weight='SemiBold',maxw=None):
    if al<=0: return
    m=caption(txt,W,size,maxw or W-160) if weight=='SemiBold' else None
    if m is None:
        f=font(size,weight); m=Image.new('L',(W,int(size*1.4)),0); ImageDraw.Draw(m).text((W/2,m.size[1]/2),txt,font=f,fill=255,anchor='mm')
    y=int(cy-m.size[1]/2); im.paste(Image.new('RGB',m.size,col),(0,y),m.point(lambda v:int(v*al)))
LK=Image.open('/workspace/foreman-core/public/brand/alter-lockup-dark-784.png').convert('RGBA')
LK=LK.resize((LOGO,int(LOGO*LK.size[1]/LK.size[0])),Image.LANCZOS)
CHIPTXT="Book my team offsite and buy what’s needed."
def chip():
    k=('chip',fmt)
    if k in CACHE: return CACHE[k]
    f=font(22 if fmt=='d' else 26,'Medium'); fl=font(17 if fmt=='d' else 20,'SemiBold')
    d=ImageDraw.Draw(Image.new('L',(1,1))); lab='TASK'; lw=d.textlength(lab,font=fl); tw=d.textlength(CHIPTXT,font=f)
    h=46 if fmt=='d' else 56; w=int(28+12+12+lw+16+tw+26)
    im=Image.new('RGBA',(w,h),(0,0,0,0)); dd=ImageDraw.Draw(im)
    dd.rounded_rectangle([0,0,w-1,h-1],h//2,fill=(28,28,31,255),outline=(58,58,62,255),width=1)
    dd.ellipse([22,h/2-5,32,h/2+5],fill=(232,72,48,255))
    dd.text((44,h/2),lab,font=fl,fill=(142,142,147,255),anchor='lm'); dd.text((44+lw+14,h/2),CHIPTXT,font=f,fill=(235,235,240,255),anchor='lm')
    CACHE[k]=im; return im
def win(im,f):
    c=f.resize((CW,CH),Image.LANCZOS) if f.size!=(CW,CH) else f
    paste_shadowed(im,browser(c),CX,CY,14)
def ph(im,f):
    p,r=phone(f.resize((PW,PH),Image.LANCZOS)); paste_shadowed(im,p,PX,PY,r)
def draw(i,t):
    st,en,kind,p,_=SC[i]; lt=max(0,t-st); im=stage(W,H)
    if kind=='hook':
        a1=eo((t-0.15)/0.5); a2=eo((t-ST['hook2']+0.05)/0.4)
        if fmt=='d':
            put_text(im,"Your AI bot just asked for $1,200.",H/2-52,TSZ,WHITE,a1); put_text(im,"Did you approve it?",H/2+52,TSZ,GREY,a2)
        else:
            put_text(im,"Your AI bot just asked for $1,200.",H/2-120,TSZ,WHITE,a1,maxw=900); put_text(im,"Did you approve it?",H/2+110,TSZ,GREY,a2,maxw=900)
        return im
    if kind=='close':
        a1=eo((t-st-0.2)/0.5); a2=eo((t-(ST['close']+1.15))/0.45)
        dy=52 if fmt=='d' else 60
        put_text(im,"Your bots work.",H/2-dy,TSZ,WHITE,a1); put_text(im,"You stay in control.",H/2+dy,TSZ,WHITE,a2)
        return im
    if kind=='end':
        a=eo((t-st-0.05)/0.7); ly=int(H/2-(90 if fmt=='d' else 110))
        lk=LK.copy(); lk.putalpha(lk.getchannel('A').point(lambda v:int(v*a)))
        im.paste(lk,((W-lk.size[0])//2,ly-lk.size[1]//2),lk)
        a2=eo((t-ST['cta']+0.1)/0.45)
        put_text(im,"Claim your founding spot.",H/2+(60 if fmt=='d' else 80),48 if fmt=='d' else 60,WHITE,a2)
        put_text(im,"alterhq.app",H/2+(130 if fmt=='d' else 165),26 if fmt=='d' else 34,GREY,a2,weight='Medium')
        return im
    f=S((i,),p['src'],p['ss']).get(lt)
    (win if kind=='win' else ph)(im,f)
    return im
def cap_windows():
    out=[]; tags=[t for t,_ in VO]
    for k,(tag,s) in enumerate(VO):
        if tag not in CAP: continue
        nxt=VO[k+1][1] if k+1<len(VO) else T
        out.append((s-0.1,min(s+dur[tag]+0.7,nxt-0.12),CAP[tag]))
    return out
NOCAP=len(sys.argv)>2 and sys.argv[2]=='nocap'
CW_=[] if NOCAP else cap_windows()
out=subprocess.Popen(['ffmpeg','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-c:v','libx264','-preset','medium','-crf','12','-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',f'master-{fmt}'+('-nocap' if NOCAP else '')+'.mp4'],stdin=subprocess.PIPE)
for n in range(int(round(T*FPS))):
    t=n/FPS
    i=max(k for k,s in enumerate(SC) if s[0]<=t)
    fr=draw(i,t)
    # crossfade into scene i+1 if within its half-window before start, or blend from i-1 after start
    if i+1<len(SC) and SC[i+1][4]>0 and t>=SC[i+1][0]-SC[i+1][4]/2:
        x=SC[i+1][4]; fr=Image.blend(fr,draw(i+1,t),ease((t-(SC[i+1][0]-x/2))/x))
    elif SC[i][4]>0 and t<SC[i][0]+SC[i][4]/2:
        x=SC[i][4]; fr=Image.blend(draw(i-1,t),fr,ease((t-(SC[i][0]-x/2))/x))
    # chip (outside UI) from send to the close card
    ca=min(eo((t-12.2)/0.45),eo((39.2+0.3-t)/0.45)) if 12.2<=t<=39.5 else 0
    if ca>0:
        c=chip(); a=c.getchannel('A').point(lambda v:int(v*ca)); fr.paste(c.convert('RGB'),((W-c.size[0])//2,CHIPY-c.size[1]//2),a)
    for a,b,txt in CW_:
        if a<=t<=b:
            al=min(eo((t-a)/0.2),eo((b-t)/0.2)); m=caption(txt,W,CAPS,CAPW); y=int(CAPY-m.size[1]/2)
            fr.paste(Image.new('RGB',m.size,WHITE),(0,y),m.point(lambda v:int(v*al)))
    out.stdin.write(fr.tobytes())
    if n%300==0: print(fmt,n,flush=True)
out.stdin.close(); out.wait()
