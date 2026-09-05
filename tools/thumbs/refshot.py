import os,io,json,sys,urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw, ImageFont
ph=urllib.request.ProxyHandler({"https":os.environ.get("HTTPS_PROXY","")})
def get(u):
    op=urllib.request.build_opener(ph); op.addheaders=[("User-Agent","Mozilla/5.0")]
    try:
        with op.open(u,timeout=25) as r: return r.read()
    except Exception: return None
rows=json.load(open(sys.argv[1]))[:24]
def load(r):
    for n in ("maxresdefault","hqdefault"):
        b=get(f"https://i.ytimg.com/vi/{r['vid']}/{n}.jpg")
        if b and len(b)>3000:
            im=Image.open(io.BytesIO(b)).convert("RGB")
            if n=="hqdefault": im=im.crop((0,45,480,315))
            return r,im
    return r,None
with ThreadPoolExecutor(max_workers=12) as ex: got=[x for x in ex.map(load,rows) if x[1]]
cols=4; tw,th=440,247
rows_n=(len(got)+cols-1)//cols
sheet=Image.new("RGB",(cols*tw,rows_n*(th+26)),(16,16,16)); dr=ImageDraw.Draw(sheet)
try: f=ImageFont.truetype("/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",15)
except Exception: f=None
for i,(r,im) in enumerate(got):
    x=(i%cols)*tw; y=(i//cols)*(th+26)
    sheet.paste(im.resize((tw,th),Image.LANCZOS),(x,y))
    dr.text((x+4,y+th+5), f"{r['ch'][:14]} / {r['views']:,}", fill=(230,230,230), font=f)
sheet.save(sys.argv[2]); print(len(got),"枚")
