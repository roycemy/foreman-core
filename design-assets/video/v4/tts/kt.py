import sys,soundfile as sf
from kokoro_onnx import Kokoro
k=Kokoro('kokoro-v1.0.onnx','voices-v1.0.bin')
print(sorted(k.get_voices()))
t="Your AI bot just asked for twelve hundred dollars. Did you approve it? With Altar, you'd know."
for v in sys.argv[1:]:
    s,sr=k.create(t,voice=v,speed=0.95,lang='en-us'); sf.write(f'test_{v}.wav',s,sr); print(v,len(s)/sr)
