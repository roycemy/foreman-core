import sys,json,subprocess,numpy as np
from faster_whisper import WhisperModel
m=WhisperModel('small',device='cpu',compute_type='int8')
for v in sys.argv[1:]:
  for tag,t,_,_ in json.load(open('lines.json')):
    a=np.frombuffer(subprocess.run(['ffmpeg','-loglevel','error','-i',f'{v}/{tag}.wav','-ac','1','-ar','16000','-f','f32le','-'],capture_output=True).stdout,np.float32)
    seg,_=m.transcribe(a,language='en',beam_size=5); print(v,tag,'|',' '.join(s.text.strip() for s in seg),flush=True)
