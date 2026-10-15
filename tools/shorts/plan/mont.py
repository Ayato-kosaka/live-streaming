import sys
from PIL import Image
# 使い方: mont.py out.jpg cols scale img1 img2 ...
out, cols, scale = sys.argv[1], int(sys.argv[2]), float(sys.argv[3])
ims = [Image.open(p).convert("RGB") for p in sys.argv[4:]]
ims = [im.resize((int(im.width*scale), int(im.height*scale))) for im in ims]
w = max(i.width for i in ims); h = max(i.height for i in ims)
rows = (len(ims)+cols-1)//cols
canvas = Image.new("RGB", (w*cols, h*rows), (0,0,0))
for k, im in enumerate(ims):
    canvas.paste(im, ((k%cols)*w, (k//cols)*h))
canvas.save(out, quality=82)
print(out, canvas.size)
