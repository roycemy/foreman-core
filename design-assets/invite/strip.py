from PIL import Image,ImageDraw,ImageFont
ts=[0,400,800,1100,1400,1700,2000,2300,2600,3000]
F=ImageFont.truetype('assets/Geist-Medium.ttf',26)
for k,dir,sc in [('390','/tmp/rv-m',0.5),('1440','/tmp/rv-d',0.3)]:
  ims=[Image.open(f'{dir}/f{round(t*30/1000):03d}.png').convert('RGB') for t in ts]
  ims=[i.resize((int(i.width*sc),int(i.height*sc))) for i in ims]
  w,h=ims[0].size; cols=5
  S=Image.new('RGB',(cols*(w+20)+20,2*(h+60)+20),(244,244,241));d=ImageDraw.Draw(S)
  for n,(t,i) in enumerate(zip(ts,ims)):
    x=20+(n%cols)*(w+20);y=20+(n//cols)*(h+60);S.paste(i,(x,y));d.text((x,y+h+12),f'{t} ms',fill=(18,18,18),font=F)
  S.save(f'shots/02-reveal-strip-{k}.png')
