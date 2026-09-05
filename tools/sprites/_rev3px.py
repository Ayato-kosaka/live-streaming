import json, numpy as np
from PIL import Image
def lum(c):
    c = np.asarray(c, float) / 255.0
    c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126*c[...,0] + 0.7152*c[...,1] + 0.0722*c[...,2]
def ratio(a, b):
    x, y = sorted([float(lum(a)), float(lum(b))], reverse=True)
    return (x + .05) / (y + .05)
out = []
for m in json.load(open("/tmp/r3/px.json")):
    if "file" not in m:
        out.append((99, m)); continue
    im = Image.open(m["file"]).convert("RGBA")
    a = np.asarray(im).reshape(-1, 4)
    a = a[a[:,3] > 200][:, :3]
    if len(a) < 30:
        m["note"] = "小さすぎ"; out.append((99, m)); continue
    q = (a >> 4).astype(int)
    key = q[:,0]*256 + q[:,1]*16 + q[:,2]
    vals, cnt = np.unique(key, return_counts=True)
    top = vals[cnt.argmax()]
    bg = a[key == top].mean(0)
    L = lum(a)
    o = np.argsort(L)
    import re
    mm = re.findall(r"[\d.]+", m.get("col","rgb(0,0,0)"))
    fg = np.array([float(mm[0]), float(mm[1]), float(mm[2])])  # 字の色は computed をそのまま使う（アイコンに引っぱられないように）
    m["r"] = round(ratio(fg, bg), 2)
    m["fghex"] = "#%02x%02x%02x" % tuple(int(v) for v in fg)
    m["bghex"] = "#%02x%02x%02x" % tuple(int(v) for v in bg)
    out.append((m["r"], m))
for r, m in sorted(out, key=lambda x: x[0]):
    if "r" not in m:
        print(f'  --   {m["path"]:20} {m["sel"][:32]:32} {m.get("note","")}'); continue
    ng = "NG" if m["r"] < 4.5 else "ok"
    print(f'{m["r"]:6.2f} {ng}  {m["path"]:20} {m["sel"][:32]:32} {m["fs"]:5.1f}px {m["w"]}x{m["h"]:>4} 字{m["fghex"]} 地{m["bghex"]}  {m["t"][:18]}')
