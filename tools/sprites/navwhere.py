"""**島の入口が、その幅でどこに出ているか**を1枚の絵にする。

    python3 tools/sprites/navwhere.py after 390,820,1440

`navband.mjs` が撮った `<幅>-where.png`（入口に赤い枠を描いた全面）から、
入口の写っているところだけを切り出して横に並べる。JSON に入っている
入口の座標を使うので、**どこを切ったかは推測ではなく実測**。

「頭から消えた」を「どこにも無い」と読まないために要る
（`docs/island-misses.md` #72）。足元に7つ並んでいるなら、それを絵で見せる。
"""
import json
import sys
from PIL import Image, ImageDraw, ImageFont

tag = sys.argv[1] if len(sys.argv) > 1 else "after"
widths = [int(x) for x in (sys.argv[2] if len(sys.argv) > 2 else "390,820,1440").split(",")]
out = sys.argv[3] if len(sys.argv) > 3 else f"/tmp/navband/{tag}-どこにある.png"

rows = {r["W"]: r for r in json.load(open(f"/tmp/navband/{tag}/all.json"))}
PANE_W = 420
try:
    f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 15)
except OSError:
    f = ImageFont.load_default()

panes = []
for w in widths:
    r = rows[w]
    im = Image.open(f"/tmp/navband/{tag}/{w}-where.png")
    dpr = im.width / w
    # 入口（島じたいを除く6つ）が**足元に**写っている縦の範囲。
    # 頭の帯にも出ている幅（900px 以上）でそちらを混ぜると、
    # 切り取りが面ぜんぶに広がって、足元の6つが豆粒になる
    ys = [g["y"] for d in r["doors"] if d["label"] != "島じたい" for g in d["found"] if g["where"] == "足元"]
    hs = [g["box"][1] for d in r["doors"] if d["label"] != "島じたい" for g in d["found"] if g["where"] == "足元"]
    top = int((min(ys) - 40) * dpr)
    bot = int((max(y + h for y, h in zip(ys, hs)) + 40) * dpr)
    foot = im.crop((0, max(0, top), im.width, min(im.height, bot)))
    band = im.crop((0, 0, im.width, int(min(r["band"]["h"] + 10, 140) * dpr)))
    k = PANE_W / im.width
    foot = foot.resize((PANE_W, int(foot.height * k)), Image.LANCZOS)
    band = band.resize((PANE_W, int(band.height * k)), Image.LANCZOS)
    n_head = sum(1 for d in r["doors"] if d["label"] != "島じたい" for g in d["found"] if g["where"] == "頭の帯")
    n_foot = sum(1 for d in r["doors"] if d["label"] != "島じたい" for g in d["found"] if g["where"] == "足元")
    panes.append((w, band, foot, n_head, n_foot))

head_h = max(p[1].height for p in panes)
foot_h = max(p[2].height for p in panes)
TOP = 54
MID = 46
sheet = Image.new("RGB", (PANE_W * len(panes) + 12 * (len(panes) + 1), TOP + head_h + MID + foot_h + 16), (28, 28, 30))
d = ImageDraw.Draw(sheet)
x = 12
for w, band, foot, nh, nf in panes:
    d.text((x, 8), f"{w}px", (255, 240, 200), font=f)
    d.text((x, 28), f"head bar: {nh} of 6   footer: {nf} of 6", (170, 200, 255), font=f)
    sheet.paste(band, (x, TOP))
    d.text((x, TOP + head_h + 10), "-- footer (red = island entrance) --", (200, 200, 200), font=f)
    sheet.paste(foot, (x, TOP + head_h + MID))
    x += PANE_W + 12
sheet.save(out)
print(out, sheet.size)
