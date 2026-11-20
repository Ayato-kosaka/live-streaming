"""`/goods` の LINEスタンプの欄に出す、**LINE のお店への札の1枚**を焼く。

    python3 tools/goods/linestore.py        # site/public/goods/line-store.webp に置く

## 何を焼くか

LINE に出したセットのメイン（店の一覧に出る1枚）は「すぐもどる」
（あやと、#716。`.claude/skills/line-creators/SKILL.md` の 0）。
その元絵 `tools/goods/line-src/sugumodoru.png` を、SUZURI の札
（`shopgoods.py`）と同じ形——**白地 560角の真ん中に、長い辺 490px**——に置く。
同じ升目の形で並ぶので、重さをそろえないと片方だけ遠くに見える。

LINE のメインは元絵に白いフチを足したもの（`line_pack.py main --outline 24`）だが、
**白地に置くとフチは見えない**ので足さない。絵そのものは1画素も変えていない。

## 透かしを焼かない理由

売り出す前の候補の絵には「取ってそのまま使えない」ように透かしを焼いていた
（2026-11-20 に、候補の欄ごと絵も道具も消した。`site/content/goods.ts` の頭）。
この1枚は**売り出したあとの店の札**で、同じ絵は LINE のお店の頁に
透かし無しで出ている。
"""

import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "tools/goods/line-src/sugumodoru.png"
DEST = ROOT / "site/public/goods/line-store.webp"

#: SUZURI の札（`shopgoods.py` の `SIDE` / `BOX`）と同じ
SIDE = 560
BOX = 490


def bake(src: Image.Image) -> Image.Image:
    """透過の絵を白地に落として、560角の真ん中に長い辺 490px で置き直す。"""
    rgba = src.convert("RGBA")
    # ほぼ透明の画素で外接矩形を広げない（`line_pack.py` の `load` と同じ切り捨て）
    bb = rgba.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if bb is None:
        raise SystemExit(f"{SRC}: 絵が1画素も無い")
    art = rgba.crop(bb)
    w, h = art.size
    s = BOX / max(w, h)
    art = art.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    canvas = Image.new("RGB", (SIDE, SIDE), (255, 255, 255))
    canvas.paste(art, ((SIDE - art.width) // 2, (SIDE - art.height) // 2), art)
    return canvas


def main() -> int:
    bake(Image.open(SRC)).save(DEST, "WEBP", quality=78, method=6)
    print(f"{DEST.relative_to(ROOT)} {DEST.stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
