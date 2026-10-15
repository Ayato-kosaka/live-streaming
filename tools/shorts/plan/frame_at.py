"""復号した材料（zoom とアーカイブのシート）から、指定した秒の1コマを切り出す。
使い方: frame_at.py <置き場/videoId> <H:MM:SS> <out.jpg>
zoom（1秒刻み）にあればそれを、無ければアーカイブ（10秒刻み）のいちばん近いコマを使う。"""
import csv, sys
from pathlib import Path
from PIL import Image

def sec(s):
    p = [int(x) for x in s.split(":")]
    while len(p) < 3: p.insert(0, 0)
    return p[0]*3600 + p[1]*60 + p[2]

def geom(img, cols, rows_hint=None):
    gap, head = 4, 30
    tw = (img.width - (cols + 1) * gap) // cols
    return gap, head, tw

def crop(sheet: Path, idx: int, cols: int, th: int, tw: int):
    gap, head = 4, 30
    label = max(20, int(round(th * 0.07)))
    r, c = divmod(idx, cols)
    x = gap + c * (tw + gap); y = head + gap + r * (th + label + gap)
    return Image.open(sheet).convert("RGB").crop((x, y, x + tw, y + th))

def find(base: Path, t: int):
    best = None
    for d in sorted(base.glob("zoom-*")):
        for row in csv.DictReader(open(d / "sheets.csv")):
            a, b, n = float(row["from"]), float(row["to"]), int(row["frames"])
            if a - 0.5 <= t <= b + 0.5:
                step = (b - a) / (n - 1) if n > 1 else 1.0
                k = max(0, min(n - 1, int(round((t - a) / step))))
                return d / row["file"], k, 2, step
    d = base / "archive"
    for row in csv.DictReader(open(d / "sheets.csv")):
        a, b, n = float(row["from"]), float(row["to"]), int(row["frames"])
        if a - 5 <= t <= b + 5:
            step = (b - a) / (n - 1) if n > 1 else 10
            k = max(0, min(n - 1, int(round((t - a) / step))))
            return d / row["file"], k, 5, step
    raise SystemExit(f"見つからない: {t}")

base, hms, out = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
sheet, k, cols, step = find(base, sec(hms))
im = Image.open(sheet)
tw = (im.width - (cols + 1) * 4) // cols
th = int(round(tw * 16 / 9)) if cols == 2 else 320
# zoom は 404x720（長辺720）、アーカイブは 180x320
if cols == 2: th = 720
crop(sheet, k, cols, th, tw).save(out, quality=88)
print(out, sheet.parent.parent.name, f"step={step:.0f}s")
