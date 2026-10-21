import sys,torch,torchaudio as ta
from chatterbox.tts import ChatterboxTTS
m=ChatterboxTTS.from_pretrained(device='cpu')
L=["Your AI bots can already spend your money. So who's in control?",
   "Altar connects any bot you already use, with a single paste. It walks right into your H Q."]
for name,ref,ex,cfg in [('warm-male','ref/am_michael.wav',0.45,0.5),('warm-female','ref/af_heart.wav',0.5,0.5),('british-male','ref/bm_george.wav',0.4,0.5),('bright-female','ref/af_sarah.wav',0.6,0.4)]:
    for i,l in enumerate(L):
        w=m.generate(l,audio_prompt_path=ref,exaggeration=ex,cfg_weight=cfg); ta.save(f'raw-{name}-{i}.wav',w,m.sr); print(name,i,flush=True)
