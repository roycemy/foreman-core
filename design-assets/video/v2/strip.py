import subprocess, sys
from PIL import Image
fmt,tag=sys.argv[1],sys.argv[2]
ts=[0.3,2,4.3,5.5,6.8,7.8,9.5,13,17,19.5,23,26.5,28,30,33,36,39,44.9]
ims=[]
for t in ts:
    subprocess.run(['ffmpeg','-loglevel','error','-y','-ss',str(t),'-i',f'master-{fmt}.mp4','-frames:v','1',f'qa/{fmt}-{t}.png'])
    ims.append(Image.open(f'qa/{fmt}-{t}.png').resize((480,270) if fmt=='d' else (270,480)))
w,h=ims[0].size; c=6 if fmt=='d' else 9
W=Image.new('RGB',(w*c,h*((len(ims)+c-1)//c)),'white');[W.paste(im,((k%c)*w,(k//c)*h)) for k,im in enumerate(ims)];W.save(f'qa/strip-{fmt}-{tag}.png')
