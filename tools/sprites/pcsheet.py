"""`pcsweep.mjs` が撮った109面を、**一覧に貼って目で見る**ための道具。

109面 × 3幅 = 327枚を1枚ずつ開いても、崩れている面は見つからない。
`audit.py` の「300枚を並べて見てもどれが原則を外しているかは分からない」と
同じで、**並べてから絞る**。ここは数ではなく「崩れているか」を見る側なので、
数で絞ったあとに**必ず元の絵を開く**こと。

    python3 pcsheet.py 1440              # /tmp/pcsheet/1440-01.png … を作る
    python3 pcsheet.py 1440 --top 1400   # 上から1400pxぶんだけ貼る（既定 1200）
    python3 pcsheet.py 1440 --only /map,/nordic

1枚に16面。面の名前を焼き込むので、崩れている札を見つけたらその名前で
`/tmp/pcsweep/<幅>/<面>.png` を開く。
"""
import os
import sys

from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = None

W = sys.argv[1] if len(sys.argv) > 1 else "1440"
args = sys.argv[2:]
top = int(args[args.index("--top") + 1]) if "--top" in args else 1200
only = args[args.index("--only") + 1].split(",") if "--only" in args else None

SRC = f"/tmp/pcsweep/{W}"
OUT = f"/tmp/pcsheet"
os.makedirs(OUT, exist_ok=True)

names = sorted(f for f in os.listdir(SRC) if f.endswith(".png"))
if only:
    names = [n for n in names if any(n.startswith(p.replace("/", "_")) for p in only)]

COLS, ROWS = 4, 4
TW = 380          # 1枚の幅（縮めたあと）
PAD, LABEL = 8, 18

sheets = 0
for i in range(0, len(names), COLS * ROWS):
    chunk = names[i:i + COLS * ROWS]
    th = int(TW * top / int(W))
    sheet = Image.new("RGB", (COLS * (TW + PAD) + PAD, ROWS * (th + LABEL + PAD) + PAD), (28, 28, 32))
    dr = ImageDraw.Draw(sheet)
    for k, nm in enumerate(chunk):
        im = Image.open(os.path.join(SRC, nm)).convert("RGB")
        # 上から top px ぶん。全面を縮めると、どの面も「細長い帯」になって
        # 崩れが見えなくなる。上から順に見るのは、人が実際にそう見るから
        im = im.crop((0, 0, im.width, min(top, im.height)))
        im.thumbnail((TW, th * 4), Image.LANCZOS)
        cx = PAD + (k % COLS) * (TW + PAD)
        cy = PAD + (k // COLS) * (th + LABEL + PAD)
        dr.text((cx + 2, cy + 3), nm[:-4], fill=(235, 235, 235))
        sheet.paste(im, (cx, cy + LABEL))
        # 画面の右端を線で示す。**左右が空っぽになっている面はここで一目で分かる**
        dr.line([(cx + TW - 1, cy + LABEL), (cx + TW - 1, cy + LABEL + min(th, im.height))], fill=(200, 60, 60))
    sheets += 1
    p = f"{OUT}/{W}-{sheets:02d}.png"
    sheet.save(p)
    print(p, len(chunk), "面")
print(f"-- {len(names)}面を {sheets}枚に貼った（{SRC}）")
