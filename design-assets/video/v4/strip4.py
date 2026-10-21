import subprocess,sys
from PIL import Image, ImageDraw
fmt,tag=sys.argv[1],sys.argv[2]
ts=[float(x) for x in sys.argv[3].split(',')]
w,h=(384,216) if fmt=='d' else (162,288); c=6 if fmt=='d' else 10
ims=[]
for t in ts:
    subprocess.run(['ffmpeg','-loglevel','error','-y','-ss',str(t),'-i',f'master-{fmt}.mp4','-frames:v','1','-vf',f'scale={w}:{h}',f'/tmp/s4_{fmt}.png']); ims.append(Image.open(f'/tmp/s4_{fmt}.png').copy())
S=Image.new('RGB',(w*c,(h+14)*((len(ims)+c-1)//c)),'white'); d=ImageDraw.Draw(S)
for k,im in enumerate(ims): S.paste(im,((k%c)*w,(k//c)*(h+14)+14)); d.text(((k%c)*w+3,(k//c)*(h+14)),f'{ts[k]:.2f}',fill='red')
S.save(f'qa/strip-{fmt}-{tag}.png')
