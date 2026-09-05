"""焼いたスプライトを並べて見比べる1枚を作る。

    python3 sheet.py 出力.png 見出し=フォルダ [見出し=フォルダ ...] -- 名前 [名前 ...]

同じ名前のスプライトを縦に積むので、直す前と直したあとを上下で見比べられる。
名前を省くと最初のフォルダにあるもの全部を並べる。
背景はあつ森の草に近い色。透明のまま見ると接地影の濃さが分からないため。
"""
import os
import sys

from PIL import Image, ImageDraw

CELL = 190
BG = (168, 208, 106)      # 島の草の色。影の濃さをここで見る
PAPER = (238, 232, 210)


def load(d, name):
    for ext in (".png", ".webp"):
        p = os.path.join(d, name + ext)
        if os.path.exists(p):
            im = Image.open(p).convert("RGBA")
            # 焼きたての PNG は 1024 角のまま。透明の余白を落とさないと小さくしか映らない
            box = im.getchannel("A").point(lambda v: 255 if v > 6 else 0).getbbox()
            return im.crop(box) if box else im
    return None


def main():
    out = sys.argv[1]
    args = sys.argv[2:]
    cols = []
    while args and args[0] != "--":
        label, _, d = args.pop(0).partition("=")
        cols.append((label, d))
    if args:
        args.pop(0)
    names = args
    if not names:
        names = sorted({f.rsplit(".", 1)[0] for f in os.listdir(cols[0][1])
                        if f.endswith((".png", ".webp"))})

    per = 6
    rows = (len(names) + per - 1) // per
    w = per * CELL
    h = rows * (len(cols) * CELL + 18) + 20
    sheet = Image.new("RGB", (w, h), PAPER)
    dr = ImageDraw.Draw(sheet)

    for i, name in enumerate(names):
        cx = (i % per) * CELL
        cy = (i // per) * (len(cols) * CELL + 18) + 20
        dr.text((cx + 6, cy - 13), name, fill=(60, 60, 60))
        for j, (label, d) in enumerate(cols):
            y = cy + j * CELL
            sheet.paste(BG, (cx, y, cx + CELL, y + CELL))
            im = load(d, name)
            if im is None:
                continue
            k = min((CELL - 12) / im.width, (CELL - 12) / im.height)
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))),
                           Image.LANCZOS)
            sheet.paste(im, (cx + (CELL - im.width) // 2, y + (CELL - im.height) // 2), im)
            if len(cols) > 1:
                dr.text((cx + 4, y + 3), label, fill=(40, 60, 20))
        dr.line([(cx, cy), (cx, cy + len(cols) * CELL)], fill=(210, 204, 184))

    sheet.save(out)
    print(f"{len(names)} 点 → {out}")


main()
