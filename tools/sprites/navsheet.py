"""頭のバーの絵を、幅ごとに「直す前／直したあと」で1枚に並べる。

絵に焼く札は ASCII だけにする。この箱の DejaVu には日本語が無いので、
日本語で書くと**全部 豆腐（□）になって、どの帯がどれか分からなくなる。**

    python3 tools/sprites/navsheet.py 390,600,820,898,900,1200,1920

`navband.mjs` が /tmp/navband/before と /tmp/navband/after に置いた帯の絵を、
**同じ倍率**で縦に積む。倍率をそろえないと、幅の違う絵が同じ大きさに写って
「820 でも 1440 でも同じだけ字がある」ように見える。左に幅と、その幅で
帯の中の札と字が占めた割合（`navband.mjs` の JSON から）を書く。
"""
import json
import sys
from PIL import Image, ImageDraw, ImageFont

widths = [int(x) for x in (sys.argv[1] if len(sys.argv) > 1 else "390,820,898,1440").split(",")]
out = sys.argv[2] if len(sys.argv) > 2 else "/tmp/navband/sheet.png"

pct = {}
for tag in ("before", "after"):
    try:
        for r in json.load(open(f"/tmp/navband/{tag}/all.json")):
            pct[(tag, r["W"])] = (r["band"]["pct"] if r.get("band") else None, r["band"]["h"] if r.get("band") else None)
    except FileNotFoundError:
        pass

SHEET_W = 1000          # 絵はこの幅に収める。元の幅が違っても倍率をそろえる
LABEL = 150
scale = SHEET_W / max(widths)

rows = []
for w in widths:
    for tag in ("before", "after"):
        try:
            im = Image.open(f"/tmp/navband/{tag}/{w}-band.png")
        except FileNotFoundError:
            continue
        # 撮るときの dpr は2なので、画素の幅は w*2
        k = (w * scale) / im.width
        im = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS)
        p, h = pct.get((tag, w), (None, None))
        rows.append((f"{w}px  {tag}",
                     f"band {h}px / ink+plates {p}%" if p is not None else "", im))

gap = 10
H = sum(r[2].height for r in rows) + gap * (len(rows) + 1)
sheet = Image.new("RGB", (LABEL + SHEET_W + gap * 2, H), (28, 28, 30))
d = ImageDraw.Draw(sheet)
try:
    f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 15)
except OSError:
    f = ImageFont.load_default()

y = gap
for name, note, im in rows:
    sheet.paste(im, (LABEL, y))
    d.text((8, y + 4), name, (255, 240, 200), font=f)
    d.text((8, y + 24), note, (170, 200, 255), font=f)
    d.rectangle([LABEL - 1, y - 1, LABEL + im.width, y + im.height], outline=(90, 90, 95))
    y += im.height + gap

sheet.save(out)
print(out, sheet.size)
