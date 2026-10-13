"""その月の住人を、番号だけ振って1枚に並べる（ChatGPT に添付する見本）。名前は入れない。

    python3 tools/goods/calcast/sheet.py <絵の置き場> <出力.png> <図鑑ID> [<図鑑ID> …]

絵は図鑑の images.plain.url（背景なし PNG）を `<絵の置き場>/<図鑑ID>.png` に落としておく。
"""
import sys
from PIL import Image, ImageDraw, ImageFont

C = 380


def main(src, out, ids):
    try:
        f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 44)
    except Exception:
        f = ImageFont.load_default()
    cols = 4
    rows = (len(ids) + cols - 1) // cols
    sh = Image.new("RGB", (cols * C, rows * C), "white")
    d = ImageDraw.Draw(sh)
    for i, cid in enumerate(ids):
        im = Image.open(f"{src}/{cid}.png").convert("RGBA")
        im.thumbnail((C - 40, C - 70))
        x, y = (i % cols) * C, (i // cols) * C
        sh.paste(im, (x + (C - im.width) // 2, y + 60 + (C - 70 - im.height) // 2), im)
        d.text((x + 14, y + 8), str(i + 1), fill=(40, 40, 40), font=f)
    sh.save(out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3:])
