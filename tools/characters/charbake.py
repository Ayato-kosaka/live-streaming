"""島に立っているあやとの絵を、配る1枚に焼く。

    python3 tools/characters/charbake.py           # 焼く
    python3 tools/characters/charbake.py --drill   # 対照だけ回して帰る

## なぜスクリプトにしてあるか

絵が描き直されるたびに、同じ手で焼けるようにするため。手で焼くと、
**次に大きさを変えたくなった日に、前と同じ切り方で焼けない。**
元の絵（`isle-src/ayato.png`）を git に置いてあるのは、そのため。

## やっていること

1. **目に見えない塵を落とす。** 届いた絵は、透明なはずのところに
   alpha 1〜7 の点が 12,268個（全体の 0.8%）散っていた。目には何も
   見えないが、**外接矩形はそこまで伸びる**——塵まで数えると
   1232×1238（比 0.995）、塵を落とすと 850×1232（比 0.690）。
   比を 0.995 のまま使うと、島のあやとは正しい背の 69% にしか描かれない
2. **中身で切る。** 切ったあとはファイルの縦横比＝絵の中の人の縦横比に
   なるので、置く側が余白を当て込まなくてよくなる
3. **長辺 640 で焼く**（下に理由）

## なぜ 640 なのか

| 使う先 | 要る大きさ |
| --- | --- |
| 島（`IsleStage` / `IslandStage`） | 背 60 の世界座標。dpr3 でも 180px |
| あやと島カード（`components/nordic/stamp.ts`） | 貼る写真は長辺 1600（`UPLOAD_LONG`）。縦の写真なら 1200×1600 で、あやとは幅の 34%（`STAMP.byWidth`）＝ 408px・背 592px |
| ステッカーとして落とす（`content/goods.ts`） | 落ちるのは**この同じファイル**。写しは作らない |

いちばん大きく要るのがカードで、背 592px。**640 はそこをちょうど超える。**
512 まで落とすとカードに貼ったあやとだけ 1.16倍に伸びて眠くなるし、
900 まで上げても島でもカードでも1画素も得をしない。

質は 82。90 との差は画素の RMS で 2.7/255（人の目には出ない）で、
ファイルは 75KB → 59KB になる。島の最初の面に乗る1枚なので、ここは軽いほうを取る。
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent          # tools/characters/
REPO = HERE.parent.parent

SRC = HERE / "isle-src" / "ayato.png"
OUT = REPO / "site" / "public" / "characters" / "ayato.webp"

#: 透明とみなす alpha。**これ未満は 0 に倒す。** 届いた絵の塵がここに入る
DUST = 8
#: 焼き上がりの背（px）。根拠は頭の表
TALL = 640
#: webp の質
QUALITY = 82


def bake(src: Image.Image, tall: int = TALL, quality: int = QUALITY) -> Image.Image:
    """塵を落として、中身で切って、背をそろえる。**保存はしない。**"""
    im = src.convert("RGBA")
    im.putalpha(im.getchannel("A").point(lambda v: 0 if v < DUST else v))
    box = im.getchannel("A").getbbox()
    if box is None:
        raise ValueError("中身が1画素も無い")
    im = im.crop(box)
    wide = max(1, round(im.width * tall / im.height))
    return im.resize((wide, tall), Image.LANCZOS)


def drill() -> bool:
    """対照。**本物を1枚も焼く前に回す。**

    見るのは2つ。**塵を落としていること**と、**中身で切っていること**。
    片方だけでも外れると、比が静かに変わって島のあやとの背が狂う。
    """
    ok = True

    # 中身は真ん中の 50×100。そのまわりに alpha 3 の塵を1枚ぶん敷く
    probe = Image.new("RGBA", (200, 200), (0, 0, 0, 3))
    probe.paste((20, 30, 40, 255), (75, 50, 125, 150))
    got = bake(probe, tall=100)
    if got.size != (50, 100):
        print(f"対照1 外れ: 塵ごと切っている（{got.size}。50×100 のはず）")
        ok = False

    # 塵が1つも無い絵は、そのまま中身の比で出る
    plain = Image.new("RGBA", (200, 200), (0, 0, 0, 0))
    plain.paste((20, 30, 40, 255), (50, 20, 150, 180))
    got = bake(plain, tall=160)
    if got.size != (100, 160):
        print(f"対照2 外れ: 中身で切れていない（{got.size}。100×160 のはず）")
        ok = False

    return ok


def main(argv: list[str]) -> int:
    if not drill():
        print("対照が外れた。本物は焼いていない")
        return 2
    if "--drill" in argv:
        print("対照2つ 通った")
        return 0
    if not SRC.is_file():
        print(f"{SRC.relative_to(REPO)} が無い")
        return 2
    with Image.open(SRC) as raw:
        out = bake(raw)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, "WEBP", quality=QUALITY, method=6)
    print(
        f"{SRC.relative_to(REPO)} {raw.size} → {OUT.relative_to(REPO)} "
        f"{out.size}（比 {out.width / out.height:.4f} / "
        f"{OUT.stat().st_size / 1024:.1f}KB）"
    )
    print("`site/lib/ayatoArt.ts` の寸法も合わせること（site/selftest/ayatoart_selftest.mjs が見る）")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
