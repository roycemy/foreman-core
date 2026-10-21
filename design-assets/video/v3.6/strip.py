import subprocess, sys
from PIL import Image
fmt,tag=sys.argv[1],sys.argv[2]
ts=[6.6,7.1,7.5,8.3,9.0,18.3,22.0,22.7,26.9,27.4,28.0,0.0,1.5,4.5,4.65,6.9,7.55,7.65,9.8,10.95,11.05,14.95,15.05,17.0,18.55,18.65,20.95,21.05,23.5,27.5,28.55,28.65,31.35,31.45,31.7,34.55,34.65,38,42.45]
ims=[]
for t in ts:
    subprocess.run(['ffmpeg','-loglevel','error','-y','-ss',str(t),'-i',f'master-{fmt}.mp4','-frames:v','1',f'qa/{fmt}-{t}.png'])
    ims.append(Image.open(f'qa/{fmt}-{t}.png').resize((480,270) if fmt=='d' else (270,480)))
w,h=ims[0].size; c=6 if fmt=='d' else 9
W=Image.new('RGB',(w*c,h*((len(ims)+c-1)//c)),'white');[W.paste(im,((k%c)*w,(k//c)*h)) for k,im in enumerate(ims)];W.save(f'qa/strip-{fmt}-{tag}.png')
