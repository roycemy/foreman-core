# Builds the hero floor treatments from the real high-DPR floor capture (assets/floor-hd.png, 5600x3184, alpha).
import numpy as np, json
from PIL import Image, ImageFilter
from scipy.ndimage import gaussian_filter
F=Image.open('assets/floor-hd.png').convert('RGBA')
W,H=F.size; P=420
SEAT=(1531,1980)  # dashed open spot (the real "new seat" slot) in floor-hd px
LAMP=(2953,820)
a=np.asarray(F).astype(np.float32)/255.
rgb,al=a[...,:3],a[...,3:]
def blur(x,s): return gaussian_filter(x,s)
def radial(cx,cy,rx,ry,shape):
    yy,xx=np.mgrid[0:shape[0],0:shape[1]].astype(np.float32)
    return np.sqrt(((xx-cx)/rx)**2+((yy-cy)/ry)**2)
# screens: the flat monitor colour (62,74,71)
scr=(np.abs(a[...,0]-62/255)<.02)&(np.abs(a[...,1]-74/255)<.02)&(np.abs(a[...,2]-71/255)<.02)&(a[...,3]>.9)
scr=scr.astype(np.float32)
def build(mode):
    c=rgb.copy()
    # contrast + a touch of saturation around mid
    c=np.clip((c-.5)*1.13+.5,0,1); g=c.mean(-1,keepdims=True); c=np.clip(g+(c-g)*1.12,0,1)
    # ambient occlusion feel: darken where alpha edges / object bases sit (blurred alpha gradient on darker pixels)
    lum=c.mean(-1); ao=blur((lum<.75).astype(np.float32),18)*.10; c=c*(1-ao[...,None])
    d=radial(SEAT[0],SEAT[1],1900,1100,lum.shape)
    if mode=='light':
        c=c*(1-np.clip(d-0.25,0,1.6)[...,None]*.15)      # gentle falloff away from the seat
        warm=np.array([1.0,.965,.90])
        c=c*(1-.06+.06*warm)                              # warm ambient
        scrc=np.array([.40,.50,.48]); sg=blur(scr,6)[...,None]
        c=c*(1-scr[...,None])+scrc*scr[...,None]+sg*np.array([.10,.11,.09])*0.0
        glow=blur(scr,40)[...,None]*np.array([1,.97,.88])*.10
    else:
        dim=.44+.50*np.clip(1-d/1.6,0,1)**1.4               # lights mostly off, falling away from the seat
        c=c*dim[...,None]*np.array([1.0,.97,.93])
        scrc=np.array([.70,.80,.76]); c=c*(1-scr[...,None])+scrc*scr[...,None]
        glow=blur(scr,36)[...,None]*np.array([.95,1,.96])*.55
    # lamp glow
    lg=np.exp(-(radial(LAMP[0],LAMP[1],260,170,lum.shape)**2))[...,None]*np.array([1,.86,.6])*(.12 if mode=='light' else .55)
    # seat light pool (iso ellipse, 2:1)
    pd=radial(SEAT[0],SEAT[1]-40,560,290,lum.shape)
    pool=np.exp(-(pd**2)*1.6)[...,None]*np.array([1,.93,.82])*(.20 if mode=='light' else .62)
    c=1-(1-c)*(1-glow)*(1-lg)*(1-pool)               # screen blend
    c=np.clip(c,0,1)
    fl=np.concatenate([c,al],-1)
    bg=np.array([244,244,241])/255. if mode=='light' else np.array([14,14,15])/255.
    CW,CH=W+2*P,H+2*P
    out=np.ones((CH,CW,3),np.float32)*bg
    A=np.zeros((CH,CW),np.float32); A[P:P+H,P:P+W]=al[...,0]
    # cast shadows: wide soft + contact
    def sh(dy,s,op):
        s_=np.roll(A,dy,axis=0); return blur(s_,s)*op
    shade=sh(140,90,.32 if mode=='light' else .55)+sh(26,14,.30 if mode=='light' else .5)
    shade=np.clip(shade,0,.6)
    out=out*(1-shade[...,None]*(1 if mode=='light' else 1))
    if mode=='dark':  # faint warm bounce under the lit seat corner
        b=np.exp(-(radial(P+SEAT[0],P+SEAT[1]+500,1400,500,(CH,CW))**2))*.035
        out=np.clip(out+b[...,None]*np.array([1,.85,.7]),0,1)
    fA=np.zeros((CH,CW,1),np.float32);fA[P:P+H,P:P+W]=al
    fc=np.zeros((CH,CW,3),np.float32);fc[P:P+H,P:P+W]=c
    out=fc*fA+out*(1-fA)
    if mode=='dark':  # thin lit rim so the island reads on black
        e=np.clip(blur(A,2.5)-blur(A,9),0,1)[...,None]
        out=np.clip(out+e*.35*np.array([1,.97,.92]),0,1)
    # vignette (canvas)
    v=radial(CW/2,CH/2,CW*.62,CH*.62,(CH,CW)); vig=np.clip(v-.55,0,1)**1.5*(.10 if mode=='light' else .5)
    out=out*(1-vig[...,None])
    Image.fromarray((out*255+.5).astype(np.uint8)).save(f'assets/floor-{mode}.jpg',quality=93)
    return CW,CH
for m in ['light','dark']: CW,CH=build(m)
json.dump({'w':CW,'h':CH,'seat':[(SEAT[0]+P)/CW,(SEAT[1]+P)/CH]},open('assets/floor-hero.json','w'))
print(CW,CH,(SEAT[0]+P)/CW,(SEAT[1]+P)/CH)
