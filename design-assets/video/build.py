import subprocess, os, sys
from PIL import Image, ImageDraw, ImageFilter
B='build'; C='clips'; FPS=30; BG='0xF4F4F1'
def run(cmd):
    r=subprocess.run(cmd,shell=True,capture_output=True,text=True)
    if r.returncode: print(cmd); print(r.stderr[-3000:]); sys.exit(1)
# rounded phone mask + shadow
def phone_assets(w,h,r,name):
    m=Image.new('L',(w,h),0); ImageDraw.Draw(m).rounded_rectangle([0,0,w-1,h-1],r,fill=255); m.save(f'{B}/{name}-mask.png')
    pad=80; s=Image.new('RGBA',(w+2*pad,h+2*pad),(0,0,0,0)); d=ImageDraw.Draw(s)
    d.rounded_rectangle([pad,pad+18,pad+w,pad+h+18],r,fill=(17,17,17,60)); s=s.filter(ImageFilter.GaussianBlur(34))
    d=ImageDraw.Draw(s); d.rounded_rectangle([pad-6,pad-6,pad+w+5,pad+h+5],r+6,outline=(17,17,17,255),width=7)  # thin ink bezel
    s.save(f'{B}/{name}-shadow.png')
phone_assets(506,900,52,'pd'); phone_assets(734,1305,74,'pm')
ZP=lambda z0,z1,d,cx,cy,W,H: (f"scale={2*W}:{2*H},zoompan=z='{z0}+({z1}-{z0})*on/{int(d*FPS)}':"
     f"x='max(0,min(iw-iw/zoom,{cx}*iw-iw/zoom/2))':y='max(0,min(ih-ih/zoom,{cy}*ih-ih/zoom/2))':d=1:s={W}x{H}:fps={FPS}")
def cap_overlay(cap,d,W,H,inp_idx):
    return f"[{inp_idx}:v]format=rgba,fade=in:st=0.1:d=0.3:alpha=1[c];"
def seg(out,fmt,kind,d,**k):
    W,H=(1920,1080) if fmt=='d' else (1080,1920)
    cap=k.get('cap'); spd=k.get('speed',1)
    ins=f"-ss {k['ss']} -t {d*spd+0.5} -i {C}/{k['src']}.mp4" if 'src' in k else ''
    f=''
    if kind=='push':   # desktop push-in on a 16:9 clip
        f=f"[0:v]setpts=(PTS-STARTPTS)/{spd},fps={FPS},{ZP(k['z0'],k['z1'],d,k['cx'],k['cy'],W,H)}[v0];"
    elif kind=='square':  # 9:16: square crop of a desktop clip, centered in an off-white frame
        S=1080
        f=(f"[0:v]setpts=(PTS-STARTPTS)/{spd},fps={FPS},crop={S}:{S}:{k['x0']}:0,{ZP(k['z0'],k['z1'],d,k['cx'],k['cy'],S,S)}[sq];"
           f"color=c={BG}:s={W}x{H}:r={FPS}:d={d}[bg];[bg][sq]overlay=0:{k.get('y',600)}[v0];")
    elif kind=='phone':   # phone layout clip in a rounded frame on off-white (9:16)
        pw,ph=734,1305; x,y=173,575
        ins+=f" -i {B}/pm-mask.png -i {B}/pm-shadow.png"
        f=(f"[0:v]setpts=(PTS-STARTPTS)/{spd},fps={FPS},scale={pw}:{ph}[ph];[ph][1:v]alphamerge[phm];"
           f"color=c={BG}:s={W}x{H}:r={FPS}:d={d}[bg];[bg][2:v]overlay={x-80}:{y-80}[b2];[b2][phm]overlay={x}:{y}[v0];")
    elif kind=='combo':   # 16:9: desktop floor (frozen after tray) + phone layout at right
        pw,ph=506,900; x,y=W-pw-150,120
        ins=(f"-ss {k['ss']} -t {k['bgdur']} -i {C}/{k['src']}.mp4 -ss {k['pss']} -t {d+0.5} -i {C}/{k['psrc']}.mp4 -i {B}/pd-mask.png -i {B}/pd-shadow.png")
        f=(f"[0:v]setpts=PTS-STARTPTS,fps={FPS},tpad=stop_mode=clone:stop_duration={d},{ZP(k['z0'],k['z1'],d,k['cx'],k['cy'],W,H)}[fl];"
           f"[1:v]setpts=PTS-STARTPTS,fps={FPS},scale={pw}:{ph}[ph];[ph][2:v]alphamerge[phm];[fl][3:v]overlay={x-80}:{y-80}[b2];[b2][phm]overlay={x}:{y}[v0];")
    elif kind=='end':
        ins=f"-loop 1 -t {d} -i {B}/cap/close-{fmt}-dotoff.png -loop 1 -t {d} -i {B}/cap/close-{fmt}.png"
        f=(f"[0:v]fps={FPS},format=yuv420p[a];[1:v]fps={FPS},format=rgba,fade=in:st=0.7:d=0.25:alpha=1[b];[a][b]overlay[ab];"
           f"color=c={BG}:s={W}x{H}:r={FPS}:d={d},format=rgba,fade=in:st={d-1.0}:d=0.93:alpha=1[wf];[ab][wf]overlay[v0];")
        cap=None
    n_in=ins.count('-i ')
    if cap:
        ins+=f" -loop 1 -t {d} -i {B}/cap/{cap}-{fmt}.png"
        f+=f"[{n_in}:v]format=rgba,fade=in:st=0.12:d=0.3:alpha=1[c];[v0][c]overlay=0:0[v1];"
    else: f+="[v0]null[v1];"
    if k.get('fadein'): f+=f"[v1]fade=in:st=0:d={k['fadein']}:color={BG}[v2];"
    else: f+="[v1]null[v2];"
    f+="[v2]scale=out_range=tv,format=yuv420p,trim=duration=%s,setpts=PTS-STARTPTS[o]"%d
    run(f"ffmpeg -loglevel error -y {ins} -filter_complex \"{f}\" -map [o] -r {FPS} -c:v libx264 -crf 12 -preset fast -color_range tv -an {out}")
D=[ ('push',4,dict(src='hook-d',ss=1.5,z0=1.0,z1=1.14,cx=0.55,cy=0.58,cap='hook',fadein=0.35)),
    ('push',7,dict(src='connect-d',ss=1.9,z0=1.02,z1=1.10,cx=0.5,cy=0.42,cap='connect')),
    ('push',9,dict(src='team-d',ss=0.6,z0=1.35,z1=1.5,cx=0.33,cy=0.40,cap='team')),
    ('push',3,dict(src='task-d',ss=0.6,z0=1.7,z1=1.8,cx=0.5,cy=0.9,cap='task')),
    ('push',5,dict(src='task-d',ss=3.6,speed=2,z0=1.0,z1=1.08,cx=0.5,cy=0.5,cap='task')),
    ('combo',7,dict(src='approve-d',ss=0.3,bgdur=2.1,psrc='approve-m',pss=0.3,z0=1.05,z1=1.12,cx=0.42,cy=0.55,cap='approve')),
    ('push',3,dict(src='card-d',ss=1.2,z0=1.05,z1=1.12,cx=0.5,cy=0.3,cap='approveb')),
    ('end',7,dict()) ]
Mm=[('square',4,dict(src='hook-d',ss=1.5,x0=560,z0=1.1,z1=1.22,cx=0.42,cy=0.6,cap='hook',fadein=0.35)),
    ('phone',7,dict(src='connect-m',ss=1.9,cap='connect')),
    ('square',9,dict(src='team-d',ss=0.6,x0=100,z0=1.5,z1=1.6,cx=0.45,cy=0.42,cap='team')),
    ('square',3,dict(src='task-d',ss=0.6,x0=416,z0=1.45,z1=1.55,cx=0.5,cy=0.9,cap='task')),
    ('square',5,dict(src='task-d',ss=3.6,speed=2,x0=420,z0=1.15,z1=1.22,cx=0.5,cy=0.56,cap='task')),
    ('phone',7,dict(src='approve-m',ss=0.3,cap='approve')),
    ('phone',3,dict(src='card-m',ss=1.6,cap='approve')),
    ('end',7,dict())]
for fmt,L in (('d',D),('m',Mm)):
    lst=[]
    for i,(kind,d,k) in enumerate(L):
        o=f'{B}/seg-{fmt}-{i}.mp4'; seg(o,fmt,kind,d,**k); lst.append(f"file '{os.path.abspath(o)}'")
    open(f'{B}/list-{fmt}.txt','w').write('\n'.join(lst))
    run(f"ffmpeg -loglevel error -y -f concat -safe 0 -i {B}/list-{fmt}.txt -c copy {B}/master-{fmt}.mp4")
    print(fmt,'ok')
