import sys,glob,subprocess
from faster_whisper import WhisperModel
m=WhisperModel('small',device='cpu',compute_type='int8')
for v in sys.argv[1:]:
  import os
  for i in range(7):
    f=f'vo/{v}/{i}.mp3'
    d=float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f],capture_output=True,text=True).stdout)
    import numpy as np; a=np.frombuffer(subprocess.run(['ffmpeg','-loglevel','error','-i',f,'-ac','1','-ar','16000','-f','f32le','-'],capture_output=True).stdout,np.float32); seg,_=m.transcribe(a,language='en',beam_size=5)
    print(v,i,f'{d:.2f}s',' '.join(s.text.strip() for s in seg),flush=True)
