import sys,json,soundfile as sf,numpy as np
from kokoro_onnx import Kokoro
k=Kokoro('kokoro-v1.0.onnx','voices-v1.0.bin'); v=sys.argv[1]
import os; os.makedirs(v,exist_ok=True)
for tag,t,sp,_ in json.load(open('lines.json')):
    s,sr=k.create(t,voice=v,speed=sp,lang='en-us')
    a=np.abs(s)>0.01; i=np.argmax(a); j=len(s)-np.argmax(a[::-1])
    sf.write(f'{v}/{tag}.wav',s[max(0,i-240):j+1200],sr); print(tag,round((j-i)/sr,2))
