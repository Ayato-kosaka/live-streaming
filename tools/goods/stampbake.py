"""LINEスタンプの絵に、透かしを**焼き込んで**出す。

    python3 tools/goods/stampbake.py            # 焼く
    python3 tools/goods/stampbake.py --drill    # 対照だけ回して帰る
    python3 tools/goods/stampbake.py --make-tile  # 透かしの型を作り直す（字が要る）

## なぜ焼くのか

あやとの言葉（2026-10-08）:

> LINEスタンプ（検討中）→ …… ダウンロードできないように透かし
> （「LINEスタンプ」みたいな）

**「ダウンロードできない」は作れない。** 画面に出ている絵は、
右クリックを塞いでも、開発者ツールからでも、画面を撮るだけでも取れる。
作れるのは「**取ったものがそのまま使えない**」ほうだけなので、
そちらをやる——絵の上に「LINEスタンプ」の字を焼き込んでから配る。

だから見せかけの防止（右クリック禁止・ドラッグ禁止）は**1つも入れない。**
効かないうえ、ふつうに読んでいる人の邪魔をする。

## 毎回ブラウザで描かない

透かしを CSS や canvas で重ねると、**絵を見るたびに描き直す**ことになるし、
重ねただけの字は要素を1つ消せば外れる。ここで1回だけ焼いて、
焼いたものを配る。配るファイルの画素そのものに字が入っている。

## 字は、焼くときに描かない

透かしの型（`tools/goods/mark-tile.png`）を git に入れてある。
ここで毎回 `ImageFont` を呼ぶと、**日本語の字体が入っていない箱で
透かしが豆腐になる**（CI の ubuntu がそれ）。字が要るのは型を作る
`--make-tile` のときだけで、そちらは手元で回して、出来たものを git に置く。

## 焼いたものしか配らない、を機械で守る

焼いた1枚ずつの sha256 を `tools/goods/stamped.json` に書く。
`python/goods_stamp_selftest.py` が、`site/content/goods.ts` の
`art` が指す先ぜんぶについて「この帳面に載っていて、指紋が合う」ことを見る。
**帳面に無い絵を `art` に書いた時点で赤くなる**ので、透かしの無い絵が
面に出る道が閉じる。

## 置き場

| | どこ |
| --- | --- |
| 元の絵（透かし無し。**配らない**） | `tools/goods/line-src/<id>.(png/jpg/webp)` |
| 焼いたもの（**配るのはこちら**） | `site/public/goods/line/<id>.webp` |

`pending` だけは元の絵を持たない。**絵がまだ1枚も届いていないあいだ、
枠に出しておく板**で、透かしだけが載っている。絵が届いたら
`line-src/` に置いて、ここをもう一度回す。
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent          # tools/goods/
REPO = HERE.parent.parent

SRC = HERE / "line-src"
TILE = HERE / "mark-tile.png"
LEDGER = HERE / "stamped.json"
OUT = REPO / "site" / "public" / "goods" / "line"

#: 焼いて出す1辺（px）。板に出るのは 150px 前後なので、dpr2 で足りる大きさ。
SIDE = 360
#: 透かしの型を、出来上がりの何割の幅で置くか。
TILE_W = 0.62
#: 型を置く間隔（型の幅・高さに対する割合）。1.0 だとぴったり並ぶ。
STEP_X, STEP_Y = 1.02, 0.78
#: 透かしの濃さ。0〜1。**読めるいちばん薄いところ。**
#:
#: あやとの言葉（2026-10-08）: 「LINEスタンプの透かしが濃すぎる。薄くて良い」。
#: 0.62 / 0.45 / 0.35 / 0.25 / 0.18 で焼いて並べ、**100%（360px）と、面に出る
#: 150px の両方で「LINEスタンプ」が読める**いちばん薄いところとして 0.30 にした。
#: 0.25 より下は 150px で字が地に沈んで、見た人には汚れにしか見えない——
#: 透かしは「取ったものがそのまま使えない」ためのものなので、
#: **読めなくなった時点で、薄いのではなく効いていない。**
INK = 0.30

#: 透かしで「動いた」とみなす1画素の差（RGB の差の合計）。**下げない。**
#: 下げると、ほとんど動いていない画素まで数えて、
#: 透かしの載っていない絵が対照を素通りする。
#: 濃さを薄くしたぶんは、`MOVED` を下げるのではなく `STRONG`（下）で見る。
MOVED = 24

#: 白地に置いたとき、動く画素の**割合**。これは**字の形**で決まるので、
#: 濃さを変えてもほとんど動かない（INK 0.1〜0.9 で 0.102〜0.132）。
#: つまり**ここだけ見ても濃さは分からない。** 見ているのは「置いたかどうか」。
COVER = (0.08, 0.20)

#: 動いた画素の、1画素あたりの差の平均。**濃さはこちらに出る**（INK に比例する。
#: 実測 0.20→88 / 0.25→108 / 0.30→127 / 0.35→147 / 0.45→186 / 0.62→251）。
#: 幅は INK ≒ 0.25〜0.35 ぶん。**濃さを変えたらここも一緒に直す**——
#: 直さずに通るなら、それは濃さを見ていない対照。
STRONG = (105.0, 150.0)

#: 絵がまだ無いあいだ、枠に出しておく板の地の色（`app/goods/goods.css` の紙と同じ系）。
PENDING_BG = (244, 238, 226)


def paint(base: Image.Image) -> Image.Image:
    """1枚に透かしを置く。**元の画素を返さない**（置いたものを返す）。"""
    tile = Image.open(TILE).convert("RGBA")
    w = max(1, int(base.width * TILE_W))
    h = max(1, int(tile.height * w / tile.width))
    tile = tile.resize((w, h), Image.LANCZOS)
    # 濃さは、型の alpha をまるごと薄めて決める（型そのものは濃いまま持つ）
    a = tile.getchannel("A").point(lambda v: int(v * INK))
    tile.putalpha(a)

    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    dx, dy = max(1, int(w * STEP_X)), max(1, int(h * STEP_Y))
    row = 0
    y = -dy
    while y < base.height + dy:
        # 1行ごとに半分ずらす。まっすぐ並べると、字と字のあいだに
        # 透かしの載っていない帯ができて、そこだけ切り出せてしまう
        x = -dx + (dx // 2 if row % 2 else 0)
        while x < base.width + dx:
            layer.alpha_composite(tile, (x, y))
            x += dx
        y += dy
        row += 1
    return Image.alpha_composite(base.convert("RGBA"), layer)


def square(im: Image.Image, side: int) -> Image.Image:
    """正方形に収める。**切らずに、余りは地で埋める**（スタンプの形は縦横いろいろ）。"""
    im = im.convert("RGBA")
    im.thumbnail((side, side), Image.LANCZOS)
    box = Image.new("RGBA", (side, side), PENDING_BG + (255,))
    box.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    return box


def sources() -> list[tuple[str, Path | None]]:
    """焼く相手。`pending`（元の絵を持たない板）＋ `line-src/` に在るぶん。"""
    out: list[tuple[str, Path | None]] = [("pending", None)]
    if SRC.is_dir():
        for p in sorted(SRC.iterdir()):
            if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"):
                out.append((p.stem, p))
    return out


def bake_one(name: str, src: Path | None) -> Path:
    base = (
        square(Image.open(src), SIDE) if src else
        Image.new("RGBA", (SIDE, SIDE), PENDING_BG + (255,))
    )
    OUT.mkdir(parents=True, exist_ok=True)
    dst = OUT / f"{name}.webp"
    paint(base).convert("RGB").save(dst, "WEBP", quality=86, method=6)
    return dst


def inked(before: Image.Image, after: Image.Image) -> tuple[float, float]:
    """透かしで動いた画素の **割合** と、動いた画素1つあたりの **差の平均**。

    **両方返すのは、割合だけでは濃さが見えないから。** 字の形は濃さを変えても
    同じなので、割合は INK 0.1 でも 0.9 でも 0.10〜0.13 のまま。
    薄くしすぎたことに気づけるのは平均のほう（`STRONG`）。

    **どちらも 0 なら、1画素も動いていない＝焼けていない。**
    """
    # `getdata()` は Pillow 14 で消える。**版で名前の変わらない `tobytes()`**
    # を使う（CI と手元で Pillow の版が違っても同じ数が出る）
    a = before.convert("RGB").tobytes()
    b = after.convert("RGB").tobytes()
    moved = 0
    total = 0
    for i in range(0, len(a), 3):
        d = (abs(a[i] - b[i]) + abs(a[i + 1] - b[i + 1])
             + abs(a[i + 2] - b[i + 2]))
        if d > MOVED:
            moved += 1
            total += d
    px = before.width * before.height
    return moved / px, (total / moved if moved else 0.0)


def band(name: str, got: tuple[float, float]) -> list[str]:
    """割合と濃さが、どちらも幅の中にいるか。**外れたぶんを字にして返す。**"""
    cover, strong = got
    out = []
    if not COVER[0] < cover < COVER[1]:
        out.append(f"{name}: 動いた画素 {cover:.4f}（{COVER[0]}〜{COVER[1]} を見込む）")
    if not STRONG[0] < strong < STRONG[1]:
        out.append(f"{name}: 濃さ {strong:.1f}（{STRONG[0]}〜{STRONG[1]} を見込む）")
    return out


def drill() -> bool:
    """対照。**本物を1枚も焼く前に、焼けていないものを見分けられるかを見る。**

    足は4本。1本でも外れたら、本物の数字を1つも出さずに帰る。

    見るのは「置いたか」だけではなく「**どれだけ濃く**置いたか」。
    割合（`COVER`）は字の形で決まるので濃さを変えても動かず、
    **割合だけの対照は、透かしをいくら薄くしても通ってしまう。**
    """
    ok = True
    bad: list[str] = []

    # (1) 平らな地に置いたら、字のぶんの画素が、その濃さで動く
    flat = Image.new("RGBA", (SIDE, SIDE), (255, 255, 255, 255))
    got = paint(flat)
    one = inked(flat, got)
    bad += band("対照1 白地", one)

    # (2) 置かなければ1画素も動かない（判定そのものが何にでも反応していないか）
    if inked(flat, flat) != (0.0, 0.0):
        bad.append("対照2: 同じ絵どうしで差が出た")

    # (3) webp にして読み直しても残る（**配るのは webp**）
    import io
    buf = io.BytesIO()
    got.convert("RGB").save(buf, "WEBP", quality=86, method=6)
    back = Image.open(io.BytesIO(buf.getvalue()))
    two = inked(flat, back)
    bad += band("対照3 webp", two)

    # (4) **本物の絵で、焼いた／焼いていないが見分けられるか。**
    #     平らな白だけで見ていると、「0 と出る」のが地の平らさのおかげなのか
    #     判定が効いているからなのか分からない。元の絵そのものを両側に当てる。
    three = (0.0, 0.0)
    src = next((p for _, p in sources() if p), None)
    if src is None:
        bad.append("対照4: 元の絵が1枚も無いので、焼いた／焼いていないを比べられない")
    else:
        raw = square(Image.open(src), SIDE)
        if inked(raw, raw) != (0.0, 0.0):
            bad.append(f"対照4: 焼いていない絵どうしで差が出た（{src.name}）")
        three = inked(raw, paint(raw))
        if three[0] < 0.05 or three[1] < STRONG[0] - 20:
            bad.append(
                f"対照4: 焼いた絵と元の絵の差が小さすぎる（{src.name} "
                f"{three[0]:.4f} / {three[1]:.1f}）"
            )

    for b in bad:
        print(b)
        ok = False
    print(
        f"対照: 白地 {one[0]:.4f}/{one[1]:.1f}"
        f" · webp {two[0]:.4f}/{two[1]:.1f}"
        f" · 元の絵 {three[0]:.4f}/{three[1]:.1f}"
        f" · 焼いていない 0.0000/0.0"
        f"（割合 {COVER[0]}〜{COVER[1]} / 濃さ {STRONG[0]}〜{STRONG[1]}）"
    )
    return ok


def make_tile() -> int:
    """透かしの型を作り直す。**手元でだけ回す**（日本語の字体が要る）。"""
    from PIL import ImageDraw, ImageFont
    fonts = [
        "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf",
        "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
    ]
    path = next((f for f in fonts if Path(f).exists()), None)
    if not path:
        print("日本語の字体が無い。型は作れない")
        return 2
    word = "LINEスタンプ"
    font = ImageFont.truetype(path, 72)
    pad = 26
    tmp = Image.new("RGBA", (10, 10))
    l, t, r, b = ImageDraw.Draw(tmp).textbbox((0, 0), word, font=font)
    flat = Image.new("RGBA", (r - l + pad * 2, b - t + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(flat)
    # 明るい絵でも暗い絵でも読めるように、濃い縁を先に置いて白を乗せる
    d.text((pad - l, pad - t), word, font=font, fill=(24, 28, 34, 190),
           stroke_width=7, stroke_fill=(24, 28, 34, 190))
    d.text((pad - l, pad - t), word, font=font, fill=(255, 255, 255, 235))
    flat.rotate(28, expand=True, resample=Image.BICUBIC).save(TILE)
    print(f"型を書いた: {TILE.relative_to(REPO)}")
    return 0


def main() -> int:
    if "--make-tile" in sys.argv:
        return make_tile()
    if not TILE.exists():
        print(f"透かしの型が無い: {TILE.relative_to(REPO)}")
        return 2
    if not drill():
        print("対照が外れた。本物は1枚も焼いていない")
        return 2
    if "--drill" in sys.argv:
        return 0

    book: dict[str, str] = {}
    for name, src in sources():
        dst = bake_one(name, src)
        book[dst.name] = hashlib.sha256(dst.read_bytes()).hexdigest()
        print(f"焼いた: {dst.relative_to(REPO)}  {dst.stat().st_size:,}B"
              f"{'' if src else '（元の絵はまだ無い。枠に出す板）'}")
    LEDGER.write_text(
        json.dumps(book, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"帳面: {LEDGER.relative_to(REPO)}  {len(book)}枚")
    return 0


if __name__ == "__main__":
    sys.exit(main())
