import numpy as np, subprocess, sys, json, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops
FPS=30; BG=(244,244,241); FONT='/usr/share/fonts/truetype/sand-box/google/Geist/Geist-VariableFont_wght.ttf'
def font(sz,w='SemiBold'):
    f=ImageFont.truetype(FONT,sz); f.set_variation_by_name(w); return f
def ease(t): t=min(1,max(0,t)); return 4*t*t*t if t<.5 else 1-(-2*t+2)**3/2
def eo(t): t=min(1,max(0,t)); return 1-(1-t)**3
class Src:
    """sequential frame reader for a 30fps clip, with speed"""
    def __init__(s,clip,ss,speed=1.0):
        w,h=map(int,subprocess.run(['ffprobe','-v','error','-select_streams','v','-show_entries','stream=width,height','-of','csv=p=0',clip],capture_output=True,text=True).stdout.strip().split(','))
        s.w,s.h=w,h; s.speed=speed
        s.p=subprocess.Popen(['ffmpeg','-loglevel','error','-ss',str(ss),'-i',clip,'-vf','format=rgb24','-f','rawvideo','-'],stdout=subprocess.PIPE)
        s.i=-1; s.cur=None; s.pos=0.0
    def get(s,local_t):
        want=int(local_t*FPS*s.speed+1e-6)
        while s.i<want:
            b=s.p.stdout.read(s.w*s.h*3)
            if len(b)<s.w*s.h*3: break
            s.cur=Image.frombuffer('RGB',(s.w,s.h),b,'raw','RGB',0,1); s.i+=1
        return s.cur
def lerpcam(keys,t):
    # keys: list of (t,z,cx,cy); eased between keys
    if t<=keys[0][0]: return keys[0][1:]
    for a,b in zip(keys,keys[1:]):
        if t<=b[0]:
            k=ease((t-a[0])/(b[0]-a[0])); return tuple(a[i]+(b[i]-a[i])*k for i in (1,2,3))
    return keys[-1][1:]
def camview(img,W,H,z,cx,cy):
    sw,sh=img.size; asp=W/H
    if sh/z>sh+1:
        pad=int((sh/z-sh)/2)+2; bgc=img.getpixel((4,sh//2)); n=Image.new('RGB',(sw,sh+2*pad),bgc); n.paste(img.crop((0,88,sw,sh)),(0,pad+88))
        cy=(cy*sh+pad)/(sh+2*pad); img=n; sw,sh=img.size; z=1.0
    rh=sh/z; rw=rh*asp
    if rw>sw/z*1.0 and asp>sw/sh: rw=sw/z; rh=rw/asp
    rw=min(rw,sw); rh=min(rh,sh)
    x0=min(max(cx*sw-rw/2,0),sw-rw); y0=min(max(cy*sh-rh/2,0),sh-rh)
    return img.transform((W,H),Image.AFFINE,(rw/W,0,x0,0,rh/H,y0),resample=Image.BICUBIC)
def rrect_mask(w,h,r,ss=3):
    m=Image.new('L',(w*ss,h*ss),0); ImageDraw.Draw(m).rounded_rectangle([0,0,w*ss-1,h*ss-1],r*ss,fill=255); return m.resize((w,h),Image.LANCZOS)
CACHE={}
def shadow(w,h,r,blur=40,dy=24,alpha=46,pad=110):
    k=(w,h,r,blur,dy,alpha)
    if k in CACHE: return CACHE[k]
    s=Image.new('L',(w+2*pad,h+2*pad),0); ImageDraw.Draw(s).rounded_rectangle([pad,pad+dy,pad+w,pad+h+dy],r,fill=alpha); s=s.filter(ImageFilter.GaussianBlur(blur))
    s2=Image.new('L',(w+2*pad,h+2*pad),0); ImageDraw.Draw(s2).rounded_rectangle([pad,pad+3,pad+w,pad+h+3],r,fill=28); s2=s2.filter(ImageFilter.GaussianBlur(5))
    CACHE[k]=(ImageChops.add(s,s2),pad); return CACHE[k]
def stage(W,H):
    k=('stage',W,H)
    if k in CACHE: return CACHE[k].copy()
    y,x=np.mgrid[0:H,0:W]; d=np.sqrt(((x-W/2)/(W*0.75))**2+((y-H*0.45)/(H*0.75))**2)
    v=np.clip(1-d*0.035,0.955,1.0)[...,None]*np.array([248,248,245]); im=Image.fromarray(v.astype(np.uint8)); CACHE[k]=im; return im.copy()
def paste_shadowed(base,img,x,y,r):
    w,h=img.size; sh,pad=shadow(w,h,r)
    ink=Image.new('RGB',sh.size,(17,17,12)); base.paste(ink,(int(x)-pad,int(y)-pad),sh)
    base.paste(img,(int(x),int(y)),rrect_mask(w,h,r) if ('m',w,h,r) not in CACHE else CACHE[('m',w,h,r)])
    CACHE[('m',w,h,r)]=rrect_mask(w,h,r) if ('m',w,h,r) not in CACHE else CACHE[('m',w,h,r)]
def browser(content,url='alterhq.app',bar=34):
    w,h=content.size; k=('bar',w,bar)
    if k not in CACHE:
        b=Image.new('RGB',(w,bar),(236,236,232)); d=ImageDraw.Draw(b)
        for i,c in enumerate([(220,220,214)]*3): d.ellipse([16+i*20,bar/2-6,28+i*20,bar/2+6],fill=c)
        f=font(15,'Medium'); tw=d.textlength(url,font=f); pw=max(260,tw+60)
        d.rounded_rectangle([w/2-pw/2,6,w/2+pw/2,bar-6],8,fill=(248,248,245)); d.text((w/2,bar/2),url,font=f,fill=(110,110,104),anchor='mm')
        d.line([0,bar-1,w,bar-1],fill=(222,222,216)); CACHE[k]=b
    out=Image.new('RGB',(w,h+bar)); out.paste(CACHE[k],(0,0)); out.paste(content,(0,bar)); return out
def phone(content,bez=14):
    w,h=content.size; r=int(w*0.11); o=Image.new('RGB',(w+2*bez,h+2*bez),(18,18,18))
    o.paste(content,(bez,bez),rrect_mask(w,h,r-bez//2)); return o,r
CAPS={}
def caption(text,W,size,maxw):
    k=(text,W,size)
    if k in CAPS: return CAPS[k]
    f=font(size,'SemiBold'); d=ImageDraw.Draw(Image.new('L',(1,1)))
    words=text.split()
    if d.textlength(text,font=f)<=maxw: lines=[text]
    else:
        best=None
        for k in range(1,len(words)):
            a=' '.join(words[:k]); b=' '.join(words[k:]); la,lb=d.textlength(a,font=f),d.textlength(b,font=f)
            if max(la,lb)>maxw: continue
            pen=abs(la-lb)-(2000 if a.endswith(('.','?')) else 300 if a.endswith(',') else 0)
            if best is None or pen<best[0]: best=(pen,[a,b])
        lines=best[1]
    lh=int(size*1.18)
    im=Image.new('L',(W,lh*len(lines)+10),0); dd=ImageDraw.Draw(im)
    for i,l in enumerate(lines): dd.text((W/2,i*lh+lh/2),l,font=f,fill=255,anchor='mm')
    CAPS[k]=im; return im
