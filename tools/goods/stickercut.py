"""あやとステッカーの元絵から、**地を抜いて、配る2枚を焼く。**

    python3 tools/goods/stickercut.py            # 5枚ぜんぶ焼く
    python3 tools/goods/stickercut.py cooking    # 名前を渡せば、その1枚だけ
    python3 tools/goods/stickercut.py --drill    # 対照だけ回して帰る
    python3 tools/goods/stickercut.py --check    # 焼かずに、置いてある絵を数える
    python3 tools/goods/stickercut.py --grey /tmp/x.png   # 灰色の上に並べて、目で見る

焼くのは2枚。**落とすほう**（`site/public/goods/<id>.png`。原寸・透過）と、
**面に並べるほう**（`<id>.webp`。長辺480）。置き場といまの2枚
（`ayato-walk`）の作法を合わせてある。

## 地とみなすもの

**「無彩色（RGB の最大−最小 ≤ 8）で、かつ明るい（最小チャンネル ≥ 225）」画素だけ。**
それを**ふちからの塗りつぶしで広げる。**

明るさだけで抜かない。この5枚は、**ステッカーの地そのものが明るい**:

| | まわりの地 | ステッカーの地 |
| --- | --- | --- |
| `cooking` | (255,255,255)〜(245,245,245) | 赤 (235,27,14) |
| `georgia` / `stockholm` | (253,253,253) | **生成り (249,227,178)** |

生成りは明るいが**無彩色ではない**（青みが 70 低い）ので、色の条件で残る。
そして全体のしきい値では抜かない。コック帽・コック服・丸の中の白い字が
**ぜんぶ白**なので、しきい値だと中が穴だらけになる。ふちから広げれば、
赤い丸・生成りの丸が壁になって中へ入れない。

## 紙のふちに届いている不透明は、**写り込み**として落とす

`cooking.jpg` の右上から右半分にかけて、**色のにじみ**（239,178,149 ほか）が
写り込んでいる。無彩色ではないので、地の塗りつぶしでは落ちない。

**「いちばん大きい塊だけ残す」では落ちなかった。** 測ったら、にじみは丸の
右のふちに**べったり接していて**、丸と1つの塊になっていた（丸の外に
86,757画素）。離れ小島ではないので、塊を数えても分かれない。

落とす決め手は**紙のふち**。ステッカーは紙の白に囲まれて写っているので、
**紙のふちから、白を渡らずに歩いて行ける不透明は、絵ではない。**
そこから、濃い色か鮮やかな色（`min < 60` か `彩度 > 130`。赤い丸は彩度221、
黒い線は `min < 60`）にぶつかるまで広げる。

**この広げかたを止めるのは、濃い縁か、白の切れ目のどちらか。**
`georgia` / `stockholm` のふちにも灰色の影が 201 / 238 画素あるが、
丸との間が白で切れているので**1画素も動かない**（実測）。
もし将来、淡い縁のステッカーに写り込みが直に接したら、この広げかたは
丸の中まで入る。**そのときは黙って出ない**——下の「不透明の割合」が
外れて赤くなる。

## 残った塊のうち、いちばん大きい1つだけ残す

写り込みを落とすと、ふちに届いていなかった小さな残り（にじみの淡いところ）が
離れ小島になる。それを落とす。

## 看板の2枚（`sign-color` / `sign-mono`）は切らない

**青い四角は地ではなく絵の一部**（元のロゴが青い四角の上に丸を乗せた形）。
丸だけにすると形が崩れる。もともと透過を持っているので、**四隅の透明な
余白を落として中身で切るだけ**にする（`bbox` のみ）。

## `linecut.py` を流用しなかった理由

あちらは**明るさだけ**で地を判定する（`r,g,b >= 255-14`、つまり 241 以上）。
3つ外れる:

1. **`georgia` / `stockholm` の四隅が残る。** 右下の角は (236,236,236) で
   241 に届かない。抜けずに灰色の角が出る
2. **にじみが落ちない。** いちばん大きい塊を残す仕組みが無い
3. **切り出しも、なじませも、webp も無い。** 透明な余白が付いたまま出て、
   面が場所を先に取る寸法（`w`/`h`）が絵の中身と合わなくなる

地の判定そのものが違うので、引数で分けられる差ではない。**別に作った。**
あちらは LINEスタンプの線画が通っている道なので、1行も触らない。
"""

from __future__ import annotations

import os
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

REPO = Path(__file__).resolve().parents[2]
SRC = REPO / "tools" / "goods" / "sticker-src"
OUT = REPO / "site" / "public" / "goods"

#: 面に並べるほうの長辺
ART_LONG = 480

#: 地とみなす色の幅。**無彩色であること**（最大−最小がこれ以下）
GRAY = 8
#: 地とみなす明るさ。**いちばん暗いチャンネルがこれ以上**
BRIGHT = 225

#: **わざと壊す。** 対照が落ちることを当てるための裏口（`docs/island-standards.md` 15章）
#:
#:   thresh  ふちから広げるのをやめて、全体のしきい値で抜く（帽子と白い字に穴）
#:   nowash  紙のふちからの写り込みを広げない（にじみが丸ごと残る）
#:   noblob  いちばん大きい塊だけ残すのをやめる（離れ小島が残る）
BREAK = os.environ.get("BREAK", "")

#: 写り込みを広げるときの壁。これより暗ければ絵の線（赤い丸の黒い縁は 0〜40）
INK_DARK = 60
#: 同じく壁。これより鮮やかなら絵の色（赤い丸は 221、にじみは 110 まで）
INK_CHROMA = 130


class Spec:
    """1枚ぶんの決め。

    `cut` は地を抜くもの、`keep` はもう透過を持っていて切るだけのもの。
    `opaque` は**抜けたことを数で確かめる**ための幅（不透明の割合）。
    丸なら四角の中の 70〜85%、四角なら 95% 以上。
    """

    def __init__(self, ident: str, ext: str, mode: str, opaque: tuple[float, float],
                 corners: bool = True):
        self.id = ident
        self.ext = ext
        self.mode = mode
        self.opaque = opaque
        #: 四隅が抜けているはずか。**四角い絵だけ False**
        self.corners = corners


SPECS = [
    # 丸い絵は、正方形の枠に対して π/4 ＝ 78.5% ぶんしか埋まらない
    Spec("cooking", "jpg", "cut", (0.70, 0.85)),
    Spec("georgia", "jpg", "cut", (0.70, 0.85)),
    Spec("stockholm", "jpg", "cut", (0.70, 0.85)),
    # 青い四角ごと配るので、切ったあとはほぼ全面が不透明。**四隅も抜けない**
    Spec("sign-color", "png", "keep", (0.95, 1.0), corners=False),
    # 黒い丸のワッペン。もう透過なので切るだけだが、形は丸
    Spec("sign-mono", "png", "keep", (0.70, 0.85)),
]


def flood_bg(im: Image.Image) -> bytearray:
    """**ふちから繋がっている地**に 1 を立てた板を返す。

    1枚 1.4M 画素を1画素ずつ見るので、`getpixel` ではなく生のバイト列で回す
    （`getpixel` だと1枚20秒かかる）。
    """
    rgb = im.convert("RGB")
    w, h = rgb.size
    data = rgb.tobytes()

    def is_bg(i: int) -> bool:
        r, g, b = data[3 * i], data[3 * i + 1], data[3 * i + 2]
        return max(r, g, b) - min(r, g, b) <= GRAY and min(r, g, b) >= BRIGHT

    if BREAK == "thresh":
        # **直す前の姿。** ふちから広げず、いちめんの明るい無彩色を抜く
        return bytearray(1 if is_bg(i) else 0 for i in range(w * h))

    seen = bytearray(w * h)
    q: deque[int] = deque()
    for x in range(w):
        for y in (0, h - 1):
            i = y * w + x
            if not seen[i] and is_bg(i):
                seen[i] = 1
                q.append(i)
    for y in range(h):
        for x in (0, w - 1):
            i = y * w + x
            if not seen[i] and is_bg(i):
                seen[i] = 1
                q.append(i)
    while q:
        i = q.popleft()
        x, y = i % w, i // w
        if x + 1 < w:
            j = i + 1
            if not seen[j] and is_bg(j):
                seen[j] = 1
                q.append(j)
        if x:
            j = i - 1
            if not seen[j] and is_bg(j):
                seen[j] = 1
                q.append(j)
        if y + 1 < h:
            j = i + w
            if not seen[j] and is_bg(j):
                seen[j] = 1
                q.append(j)
        if y:
            j = i - w
            if not seen[j] and is_bg(j):
                seen[j] = 1
                q.append(j)
    return seen


def flood_wash(im: Image.Image, bg: bytearray) -> bytearray:
    """**紙のふちに届いている写り込み**に 1 を立てた板を返す。

    種は「紙のふちにいて、地ではない画素」。そこから**白を渡らずに**、
    濃い色・鮮やかな色（絵の線と、絵の地の色）にぶつかるまで広げる。

    白を渡らないので、**丸との間が白で切れていれば1画素も動かない。**
    `georgia` / `stockholm` のふちの影がそれ。
    """
    w, h = im.size
    if BREAK == "nowash":
        return bytearray(w * h)
    d = im.convert("RGB").tobytes()

    def ink(i: int) -> bool:
        r, g, b = d[3 * i], d[3 * i + 1], d[3 * i + 2]
        return min(r, g, b) < INK_DARK or max(r, g, b) - min(r, g, b) > INK_CHROMA

    seen = bytearray(w * h)
    q: deque[int] = deque()
    for x in range(w):
        for y in (0, h - 1):
            i = y * w + x
            if not seen[i] and not bg[i] and not ink(i):
                seen[i] = 1
                q.append(i)
    for y in range(h):
        for x in (0, w - 1):
            i = y * w + x
            if not seen[i] and not bg[i] and not ink(i):
                seen[i] = 1
                q.append(i)
    while q:
        i = q.popleft()
        x, y = i % w, i // w
        for j, ok in ((i + 1, x + 1 < w), (i - 1, x > 0), (i + w, y + 1 < h), (i - w, y > 0)):
            if ok and not seen[j] and not bg[j] and not ink(j):
                seen[j] = 1
                q.append(j)
    return seen


def keep_largest(bg: bytearray, w: int, h: int) -> bytearray:
    """残った不透明のうち、**いちばん大きい塊だけ**に 1 を立てて返す。

    にじみ・ごみ・離れ小島は、ここで落ちる。
    """
    if BREAK == "noblob":
        return bytearray(0 if v else 1 for v in bg)

    comp = bytearray(w * h)
    best: list[int] = []
    q: deque[int] = deque()
    for s in range(w * h):
        if bg[s] or comp[s]:
            continue
        comp[s] = 1
        q.append(s)
        blob = [s]
        while q:
            i = q.popleft()
            x, y = i % w, i // w
            for j, ok in ((i + 1, x + 1 < w), (i - 1, x > 0), (i + w, y + 1 < h), (i - w, y > 0)):
                if ok and not bg[j] and not comp[j]:
                    comp[j] = 1
                    q.append(j)
                    blob.append(j)
        if len(blob) > len(best):
            best = blob
    keep = bytearray(w * h)
    for i in best:
        keep[i] = 1
    return keep


def soften(alpha: Image.Image) -> Image.Image:
    """縁を **1px だけ**なじませる。

    真っ二つ（0 か 255）のままだと、丸い縁が階段に見える。ぼかすのは縁だけで、
    中も外も値は変わらない（半径 0.6 のガウスは 1px 先までしか届かない）。
    """
    return alpha.filter(ImageFilter.GaussianBlur(0.6))


def bleed(im: Image.Image, keep: bytearray, w: int, h: int) -> Image.Image:
    """なじませる前に、**縁の色を1px だけ外へ広げる。**

    抜いたところの色は白のまま残っている。そこへ半端な不透明度を置くと、
    赤い丸の縁に**白いふち**が出る。先に中の色で塗っておけば出ない。
    """
    rgb = bytearray(im.convert("RGB").tobytes())
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if keep[i]:
                continue
            for j, ok in ((i + 1, x + 1 < w), (i - 1, x > 0), (i + w, y + 1 < h), (i - w, y > 0)):
                if ok and keep[j]:
                    rgb[3 * i] = rgb[3 * j]
                    rgb[3 * i + 1] = rgb[3 * j + 1]
                    rgb[3 * i + 2] = rgb[3 * j + 2]
                    break
    return Image.frombytes("RGB", (w, h), bytes(rgb))


def cut(im: Image.Image) -> Image.Image:
    """地を抜いて、中身で切った RGBA を返す。"""
    w, h = im.size
    bg = flood_bg(im)
    wash = flood_wash(im, bg)
    gone = bytearray(a | b for a, b in zip(bg, wash))
    keep = keep_largest(gone, w, h)
    flat = bleed(im, keep, w, h)
    alpha = Image.frombytes("L", (w, h), bytes(255 if k else 0 for k in keep))
    # **切る枠は、なじませる前の形から取る。** なじませたあとの透け具合で
    # 切ると、ぼかしが届いたぶんだけ枠が外へ広がって、面が取る寸法
    # （`w`/`h`）が絵の中身より大きくなる
    bb = alpha.getbbox()
    if bb is None:
        raise SystemExit("中身が1画素も残らなかった。しきいが強すぎる")
    out = flat.convert("RGBA")
    out.putalpha(soften(alpha))
    return out.crop(bb)


def crop(im: Image.Image) -> Image.Image:
    """透明な余白を落とす。**中身が1画素も無ければ落ちる。**"""
    bb = im.getchannel("A").getbbox()
    if bb is None:
        raise SystemExit("中身が1画素も残らなかった。しきいが強すぎる")
    return im.crop(bb)


def opaque_rate(im: Image.Image) -> float:
    """切ったあとの枠のうち、**ちゃんと塗ってある画素の割合**。"""
    a = im.getchannel("A").tobytes()
    return sum(1 for v in a if v >= 128) / (im.width * im.height)


def corners_clear(im: Image.Image) -> bool:
    """四隅が抜けているか。**抜けたことの、いちばん短い証拠。**"""
    w, h = im.size
    return all(im.getpixel(p)[3] == 0 for p in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)))


def drill() -> bool:
    """対照。**本物を1枚も抜く前に回す。**

    判定の足を1本ずつ抜いて、そのたびに落ちることまで見る
    （`docs/island-standards.md` 15章）。見るのは6つ:

      1. ふちの地が抜ける
      2. **中の白が残る**（コック帽・白い字。全体のしきい値にすると落ちる）
      3. **色の付いた明るい地は抜かない**（生成りの丸）
      4. **丸に接した写り込みが落ちる**（`cooking` の右半分。塊では分かれない）
      5. **白で切れている写り込みは、丸に1画素も触らない**（`georgia` のふちの影）
      6. **浮いた塵が落ちて、丸は残る**（いちばん大きい塊だけ残す）
      7. 切ったあとの四隅・不透明の割合・縁に白が残っていないこと

    4と5は**同じ足の表と裏**ではない。4を外すとにじみが残り、5を外すと
    丸ごと消える。どちらも当てる。

    **足を1本ずつ抜いて、そのたびに落ちることまで見た**（`BREAK=`）:

    | | 外れる対照 |
    | --- | --- |
    | `BREAK=thresh` ふちから広げず、全体のしきい値 | 3・10・15・17 |
    | `BREAK=nowash` 紙のふちの写り込みを広げない | 5・12・14・17 |
    | `BREAK=noblob` いちばん大きい塊を残さない | 7・9・10 |
    """
    ok = True

    def disc(px, cx, cy, r, color):
        for y in range(cy - r, cy + r + 1):
            for x in range(cx - r, cx + r + 1):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                    px[x, y] = color

    w = h = 60

    # --- 写し1（`georgia` の形）: 生成りの丸・中の白い字・**白で切れた**にじみ ---
    a = Image.new("RGB", (w, h), (253, 253, 253))
    pa = a.load()
    disc(pa, 26, 30, 18, (249, 227, 178))        # 生成りの地（明るいが色が付いている）
    for y in range(26, 35):
        for x in range(22, 31):
            pa[x, y] = (255, 255, 255)           # 丸の中の白い字
    for y in range(0, 8):
        for x in range(52, 60):
            pa[x, y] = (239, 178, 149)           # 紙のふちのにじみ（丸とは白で切れている）
    for y in range(48, 53):
        for x in range(4, 9):
            pa[x, y] = (40, 40, 40)              # 浮いた黒い塵（ふちにも丸にも触れていない）

    bg = flood_bg(a)
    if not bg[0]:
        print("対照1 外れ: ふちの地が抜けていない")
        ok = False
    if bg[16 * w + 26]:
        print("対照2 外れ: 生成りの丸まで地として抜けた（明るさだけで見ている）")
        ok = False
    if bg[30 * w + 24]:
        print("対照3 外れ: 丸の中の白い字が抜けた（帽子と服を失う）")
        ok = False
    if bg[4 * w + 54]:
        print("対照4 外れ: 色のにじみを地として抜いた（無彩色ではないのに）")
        ok = False

    wash = flood_wash(a, bg)
    if not wash[4 * w + 54]:
        print("対照5 外れ: 紙のふちのにじみが、写り込みとして落ちなかった")
        ok = False
    if wash[30 * w + 26]:
        print("対照6 外れ: 白で切れているのに、写り込みが丸の中まで入った")
        ok = False

    gone_a = bytearray(p | q for p, q in zip(bg, wash))
    keep_a = keep_largest(gone_a, w, h)
    if keep_a[50 * w + 6]:
        print("対照7 外れ: 浮いた塵が残った（いちばん大きい塊だけ残していない）")
        ok = False
    if not keep_a[16 * w + 26]:
        print("対照8 外れ: いちばん大きい塊（丸）が落ちた")
        ok = False

    got = cut(a)
    if not corners_clear(got):
        print("対照9 外れ: 切ったあとの四隅が抜けていない")
        ok = False
    rate = opaque_rate(got)
    if not 0.70 <= rate <= 0.85:
        print(f"対照10 外れ: 丸の不透明が {rate:.1%}（70〜85% のはず）")
        ok = False
    # 縁が白く縁取られていないか。丸の右ふちの1つ内側は生成りのまま
    edge = got.getpixel((got.width - 2, got.height // 2))
    if edge[3] > 40 and edge[0] - edge[2] < 30:
        print(f"対照11 外れ: 縁に白が残った {edge}")
        ok = False

    # --- 写し2（`cooking` の形）: 赤い丸に**べったり接した**にじみ -------------
    b = Image.new("RGB", (w, h), (253, 253, 253))
    pb = b.load()
    disc(pb, 26, 30, 18, (235, 27, 14))          # 赤い地
    for y in range(26, 35):
        for x in range(22, 31):
            pb[x, y] = (255, 255, 255)           # 丸の中の白い字（コック帽）
    for y in range(20, 40):
        for x in range(40, 60):
            if (x - 26) ** 2 + (y - 30) ** 2 > 18 ** 2:
                pb[x, y] = (239, 178, 149)       # 丸の右ふちに接したにじみ

    bg2 = flood_bg(b)
    wash2 = flood_wash(b, bg2)
    if not wash2[30 * w + 50]:
        print("対照12 外れ: 丸に接した写り込みが落ちなかった")
        ok = False
    if wash2[30 * w + 26]:
        print("対照13 外れ: 写り込みが赤い丸の中まで入った（濃い色で止まっていない）")
        ok = False
    gone = bytearray(p | q for p, q in zip(bg2, wash2))
    keep2 = keep_largest(gone, w, h)
    if keep2[30 * w + 50]:
        print("対照14 外れ: にじみが残った")
        ok = False
    if not keep2[30 * w + 26]:
        print("対照15 外れ: 赤い丸が落ちた")
        ok = False
    got2 = cut(b)
    if not corners_clear(got2):
        print("対照16 外れ: 切ったあとの四隅が抜けていない（にじみが残っている）")
        ok = False
    rate2 = opaque_rate(got2)
    if not 0.70 <= rate2 <= 0.85:
        print(f"対照17 外れ: 赤い丸の不透明が {rate2:.1%}（70〜85% のはず）")
        ok = False
    return ok


def bake(spec: Spec) -> int:
    src = SRC / f"{spec.id}.{spec.ext}"
    if not src.exists():
        print(f"  NG  元の絵が無い: {src.relative_to(REPO)}")
        return 1
    im = Image.open(src)
    out = cut(im) if spec.mode == "cut" else crop(im.convert("RGBA"))

    OUT.mkdir(parents=True, exist_ok=True)
    png = OUT / f"{spec.id}.png"
    out.save(png)

    long_side = max(out.size)
    art = out.resize(
        (max(1, round(out.width * ART_LONG / long_side)),
         max(1, round(out.height * ART_LONG / long_side))),
        Image.LANCZOS,
    )
    webp = OUT / f"{spec.id}.webp"
    art.save(webp, "WEBP", quality=86, method=6)

    rate = opaque_rate(out)
    bad = []
    if spec.corners and not corners_clear(out):
        bad.append("四隅が抜けていない")
    lo, hi = spec.opaque
    if not lo <= rate <= hi:
        bad.append(f"不透明 {rate:.1%}（{lo:.0%}〜{hi:.0%} のはず）")
    mark = "NG " if bad else "ok "
    print(
        f"  {mark} {spec.id:11s} {out.width}x{out.height} "
        f"({png.stat().st_size / 1024:6.1f}KB) → webp {art.width}x{art.height} "
        f"({webp.stat().st_size / 1024:5.1f}KB) 不透明 {rate:.1%}"
        + (f"  ※ {' / '.join(bad)}" if bad else "")
    )
    return 1 if bad else 0


def grey(dst: Path) -> int:
    """抜いた絵を**灰色の上に並べて**1枚にする。**人が見るため。**

    白い紙の上で見ると、**抜けていない白が見えない。** 数（四隅・割合）が
    通っていても、絵は自分の目で見る（`docs/island-standards.md` 1章）。
    """
    side, pad = 400, 16
    canvas = Image.new(
        "RGB",
        (side * len(SPECS) + pad * (len(SPECS) + 1), side + pad * 2),
        (122, 122, 128),
    )
    for k, spec in enumerate(SPECS):
        png = OUT / f"{spec.id}.png"
        if not png.exists():
            print(f"  まだ焼かれていない: {png.relative_to(REPO)}")
            return 2
        im = Image.open(png).convert("RGBA")
        r = side / max(im.size)
        im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
        canvas.paste(im, (pad + k * (side + pad), pad + (side - im.height) // 2), im)
    dst.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dst)
    print(f"灰色の上に並べた: {dst}（{len(SPECS)}枚）")
    return 0


def check() -> int:
    """焼かずに、置いてある絵を数えるだけ。"""
    bad = 0
    for spec in SPECS:
        png = OUT / f"{spec.id}.png"
        if not png.exists():
            print(f"  NG  {spec.id}: {png.relative_to(REPO)} が無い")
            bad += 1
            continue
        im = Image.open(png).convert("RGBA")
        rate = opaque_rate(im)
        lo, hi = spec.opaque
        why = []
        if spec.corners and not corners_clear(im):
            why.append("四隅が抜けていない")
        if not lo <= rate <= hi:
            why.append(f"不透明 {rate:.1%}")
        print(f"  {'NG ' if why else 'ok '} {spec.id:11s} {im.width}x{im.height} 不透明 {rate:.1%}"
              + (f"  ※ {' / '.join(why)}" if why else ""))
        bad += 1 if why else 0
    return 1 if bad else 0


def main(argv: list[str]) -> int:
    if not drill():
        print("対照が外れた。本物は1枚も抜かない")
        return 2
    print("# 対照17 通った（地・生成り・白い字・写り込み2通り・塊2通り・四隅・割合・白ふち）")
    if "--drill" in argv:
        return 0
    if "--check" in argv:
        return check()
    want = [a for a in argv if not a.startswith("--")]
    if "--grey" in argv:
        return grey(Path(want[0]) if want else Path("/tmp/stickers-grey.png"))
    specs = [s for s in SPECS if not want or s.id in want]
    if not specs:
        print(f"そんな名前は無い: {want}（在るのは {[s.id for s in SPECS]}）")
        return 2
    bad = 0
    for spec in specs:
        bad += bake(spec)
    print(f"\n焼いた {len(specs)} 枚 / 外れ {bad}")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
