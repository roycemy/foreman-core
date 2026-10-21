# Neutral, unbranded chat window: the owner pastes Alter's real setup message (connect.js runnerMessage) and sends it. No reply is shown.
from comp import *
MSG=("Connect my existing Instinct assistant Instinct to Alter using the browser agent console. Keep my provider account and credits. Do not create another bot or buy credits.\n\n"
     "FIRST open https://foreman-core.vercel.app/runner?agent=instinct&poll=300#pair=4K7Q2M in YOUR own browser. The link carries a one-time pairing code in its fragment and the console pairs itself when the page opens.")
INK=(17,17,17); MUTE=(120,120,114); LINE=(224,224,218); BGc=(246,246,243); WHITE=(255,255,255)
def wrap(d,text,f,maxw):
    out=[]
    for para in text.split('\n'):
        if not para: out.append(''); continue
        cur=''
        for w in para.split(' '):
            t=(cur+' '+w).strip()
            if d.textlength(t,font=f)<=maxw: cur=t
            else:
                if cur: out.append(cur)
                cur=w
                while d.textlength(cur,font=f)>maxw:   # break very long tokens (the link)
                    k=len(cur)
                    while d.textlength(cur[:k],font=f)>maxw: k-=1
                    out.append(cur[:k]); cur=cur[k:]
        out.append(cur)
    return out
def cursor(im,x,y,s,press=0,rip=None):
    o=Image.new('RGBA',im.size,(0,0,0,0)); d=ImageDraw.Draw(o); r=17*s*(1-0.2*press)
    if rip is not None and 0<=rip<0.6:
        k=eo(rip/0.5); rr=(22*s)*(0.4+1.2*k); d.ellipse([x-rr,y-rr,x+rr,y+rr],outline=(17,17,17,int(90*(1-k))),width=max(2,int(2*s)))
    d.ellipse([x-r,y-r,x+r,y+r],fill=(17,17,17,46),outline=(255,255,255,230),width=max(2,int(2*s)))
    im.paste(o,(0,0),o)
def chat(W,H,lt,T_PASTE=0.6,T_SEND=1.6):
    m=W<H; s=2.5 if m else 1.25
    im=Image.new('RGB',(W,H),BGc); d=ImageDraw.Draw(im)
    hb=int(78 if not m else 150)          # header
    d.rectangle([0,0,W,hb],fill=WHITE); d.line([0,hb,W,hb],fill=LINE,width=2)
    fh=font(int(22*(1.6 if m else 1)),'SemiBold'); d.text((W/2,hb/2),'Your bot',font=fh,fill=INK,anchor='mm')
    d.ellipse([W/2-d.textlength('Your bot',font=fh)/2-int(22*(1.6 if m else 1)), hb/2-5, W/2-d.textlength('Your bot',font=fh)/2-int(12*(1.6 if m else 1)), hb/2+5],fill=(150,150,144))
    fm=font(int(20*(1.7 if m else 1.25)),'Regular'); lh=int(fm.size*1.45)
    cw=int(W*(0.9 if m else 0.62)); cx0=(W-cw)//2
    # input box
    ih=int(lh*4.2+36*(1.6 if m else 1)); iy=H-ih-int(40*(1.6 if m else 1)); ix=cx0
    pasted=lt>=T_PASTE and lt<T_SEND
    sent=lt>=T_SEND
    d.rounded_rectangle([ix,iy,ix+cw,iy+ih],int(18*(1.6 if m else 1)),fill=WHITE,outline=(200,200,194) if pasted else LINE,width=2)
    bs=int(40*(1.6 if m else 1)); bx=ix+cw-bs-16; by=iy+ih-bs-16
    d.ellipse([bx,by,bx+bs,by+bs],fill=INK if pasted else (205,205,199))
    ax,ay=bx+bs/2,by+bs/2; a=bs*0.22; d.line([ax,ay+a,ax,ay-a],fill=WHITE,width=max(2,int(bs/12))); d.line([ax-a*0.8,ay-a*0.2,ax,ay-a],fill=WHITE,width=max(2,int(bs/12))); d.line([ax+a*0.8,ay-a*0.2,ax,ay-a],fill=WHITE,width=max(2,int(bs/12)))
    tw=cw-bs-64; tx=ix+24; ty=iy+20
    lines=wrap(d,MSG,fm,tw)
    if pasted:
        for j,l in enumerate(lines[:4]): d.text((tx,ty+j*lh),l,font=fm,fill=INK)
        # the box scrolls: fade the overflow
        g=Image.new('L',(tw,lh),0); gd=ImageDraw.Draw(g)
        for yy in range(lh): gd.line([0,yy,tw,yy],fill=int(255*yy/lh))
        im.paste(Image.new('RGB',(tw,lh),WHITE),(tx,ty+3*lh),g)
    else:
        d.text((tx,ty),'Message your bot',font=fm,fill=(160,160,154))
    if sent:
        k=eo((lt-T_SEND)/0.3); bw=cw-int(cw*0.12); bl=wrap(d,MSG,fm,bw-44)[:7]
        bh=len(bl)*lh+40; bxx=cx0+cw-bw; byy=iy-36-bh+int(12*(1-k))
        b=Image.new('RGB',(bw,bh),(232,232,227)); bd=ImageDraw.Draw(b)
        for j,l in enumerate(bl): bd.text((22,20+j*lh),l,font=fm,fill=INK)
        g=Image.new('L',(bw,lh*2),0); gd=ImageDraw.Draw(g)
        for yy in range(lh*2): gd.line([0,yy,bw,yy],fill=int(255*yy/(lh*2)))
        b.paste(Image.new('RGB',(bw,lh*2),(232,232,227)),(0,bh-lh*2),g)
        mk=rrect_mask(bw,bh,int(18*(1.6 if m else 1))).point(lambda v:int(v*k)); im.paste(b,(bxx,byy),mk)
        fs=font(int(15*(1.6 if m else 1)),'Medium'); d.text((cx0+cw,byy+bh+10),'Sent',font=fs,fill=(150,150,144),anchor='ra')
    # cursor path: into the input, paste, then to send
    p0=(W*0.72,H*0.45); p1=(tx+tw*0.4,iy+ih*0.45); p2=(ax,ay)
    if lt<0.5: q=p0; 
    if lt<T_PASTE: k=ease(min(1,max(0,(lt-0.0)/0.5))); x=p0[0]+(p1[0]-p0[0])*k; y=p0[1]+(p1[1]-p0[1])*k; c0=T_PASTE-0.1
    else: k=ease(min(1,max(0,(lt-(T_SEND-0.75))/0.65))); x=p1[0]+(p2[0]-p1[0])*k; y=p1[1]+(p2[1]-p1[1])*k
    clicks=[T_PASTE-0.08,T_SEND-0.08]
    press=max((1 if 0<=lt-c<0.09 else 0) for c in clicks)
    rip=None
    for c in clicks:
        if 0<=lt-c<0.6: rip=lt-c
    cursor(im,x,y,s,press,rip)
    return im
