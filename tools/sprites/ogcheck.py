"""共有画像（`site/public/og.png`）が、**ちゃんと島に見えるか**を画素で言う。

撮る道具（`tools/sprites/og.mjs`）は「撮れた／撮れない」しか言えない。
本番に配られた og.png は、撮れてはいたが**島の12人が全員おなじ顔**で、
**1年前に居た街の名前**が焼いてあった。撮れたことは、出せることではない。

ここで見るのは、**目で見なくても嘘と分かるところ**だけ。

  1. 1200×630 か（共有カードの枠）
  2. 海が写っているか（青）
  3. 陸が写っているか（緑）。しかも**枠のまん中を通る大きさ**で
  4. 1色で塗りつぶされていないか（真っ白・真っ青で落ちる）
  5. 色の種類（描かれていない絵は数種類しか持たない）

**板（島の名前・帯）がそこに在るかは、ここでは見ない。** 浜の砂と紙は
ほとんど同じ色で、画素では分けられない（砂だけの絵が「板 3.2%」と出た）。
在るかどうかは撮るときにしか確かめられないので、`og.mjs` が要素の箱で見る。

**顔が本物かどうかはここでは見ない。** あれは撮るときにしか分からないので、
`og.mjs` が `route.mjs` の数え（本物/頼み）で止める。

  python3 tools/sprites/ogcheck.py /tmp/og-new.png

**終了コード**: 0＝通った / 1＝見つかった / 2＝数えるものが無い（対照が落ちた・
絵が開けない）。`| tail` を挟むと終了コードが消える。

## 対照

本物の絵を測る前に、**こちらで作った6枚**を当てる。落ちる側（真っ白・真っ青・
真っ緑・のっぺりした2色・小さすぎる陸）と、通る側（島のかたちをした1枚）の
**両方**を持つ。片側だけだと、判定がゆるみすぎても締まりすぎても気づけない
（`docs/island-standards.md` §15）。`BREAK=` で判定の足を1本ずつ折れる。
"""

import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from repo import repo_path  # noqa: E402

W, H = 1200, 630

# 測るときは間引く。1200×630 を2pxおきで 189,000点。数え方は変わらない
STEP = 2

# --- 合格の線。**どれも「1枚の絵として見たときに当たり前のこと」だけ** ---
SEA_MIN = 0.12      # 海がこれ未満なら、島が海に浮いて見えない
SEA_MAX = 0.68      # 海がこれを超えたら、**島より海を配っている**（直す前の下絵が 72%）
LAND_MIN = 0.16     # 陸がこれ未満なら、島が写っていない
ONE_COLOR_MAX = 0.55  # 1色がこれを超えたら、のっぺり（真っ白・真っ青）
BINS_MIN = 40       # 色の種類（16段に丸めた粗さで）
LAND_W_MIN = 0.22   # 陸の横幅（枠の幅に対して）
LAND_H_MIN = 0.55   # 陸の縦幅。上下を切って撮るので、枠の半分以上は埋まる


def kind(r: int, g: int, b: int) -> str:
    """その画素が、海・陸・紙・それ以外のどれか。**色相ではなく差で見る。**

    島の色は時間帯で沈むので、絶対値で切ると夜の絵が全部「それ以外」になる。
    """
    if b > r + 24 and b > g + 6:
        return "sea"
    if g > r + 10 and g > b + 14:
        return "land"
    if r > 190 and g > 170 and b > 120 and r > b + 28:
        return "paper"
    return "other"


def measure(im: Image.Image) -> dict:
    """1枚ぶんの数。**割合だけでなく、何点見たかも返す。**"""
    px = im.convert("RGB").load()
    w, h = im.size
    seen = 0
    tally = {"sea": 0, "land": 0, "paper": 0, "other": 0}
    bins: dict[tuple, int] = {}
    xs: list[int] = []
    ys: list[int] = []
    for y in range(0, h, STEP):
        for x in range(0, w, STEP):
            r, g, b = px[x, y]
            seen += 1
            k = kind(r, g, b)
            tally[k] += 1
            key = (r >> 4, g >> 4, b >> 4)
            bins[key] = bins.get(key, 0) + 1
            if k == "land":
                xs.append(x)
                ys.append(y)
    top = max(bins.values()) / seen if bins else 1.0
    # **外接矩形を、はしっこの1点で決めない。** 島の名前の板にも緑の字が
    # あるので、いちばん端の緑まで数えると陸が枠いっぱいに見える（実測で
    # 左端が x=24＝看板の「島」の字だった）。上下2%を落として本体だけを見る。
    box = None
    if len(xs) > 200:
        xs.sort()
        ys.sort()
        cut = len(xs) // 50
        box = (xs[cut], ys[cut], xs[-1 - cut], ys[-1 - cut])
    return {
        "seen": seen,
        "size": (w, h),
        "sea": tally["sea"] / seen,
        "land": tally["land"] / seen,
        "paper": tally["paper"] / seen,
        "bins": len(bins),
        "one": top,
        "box": box,
    }


def judge(m: dict, breaks: set[str]) -> list[str]:
    """外していることを並べる。**通ったら空の一覧。**"""
    bad = []
    if m["size"] != (W, H) and "size" not in breaks:
        bad.append(f"枠が {m['size'][0]}x{m['size'][1]}（{W}x{H} でない）")
    if m["sea"] < SEA_MIN and "sea" not in breaks:
        bad.append(f"海が {m['sea']:.1%}（{SEA_MIN:.0%} 未満）")
    if m["sea"] > SEA_MAX and "sea" not in breaks:
        bad.append(f"海が {m['sea']:.1%}（{SEA_MAX:.0%} 超。島より海のほうが広い）")
    if m["land"] < LAND_MIN and "land" not in breaks:
        bad.append(f"陸が {m['land']:.1%}（{LAND_MIN:.0%} 未満）")
    if m["one"] > ONE_COLOR_MAX and "one" not in breaks:
        bad.append(f"1色が {m['one']:.1%}（{ONE_COLOR_MAX:.0%} 超。のっぺり）")
    if m["bins"] < BINS_MIN and "bins" not in breaks:
        bad.append(f"色の種類が {m['bins']}（{BINS_MIN} 未満）")
    if "box" not in breaks:
        if not m["box"]:
            bad.append("陸が1点も無い")
        else:
            x0, y0, x1, y1 = m["box"]
            bw, bh = (x1 - x0) / m["size"][0], (y1 - y0) / m["size"][1]
            if bw < LAND_W_MIN or bh < LAND_H_MIN:
                bad.append(f"陸の広がりが {bw:.0%}x{bh:.0%}（{LAND_W_MIN:.0%}x{LAND_H_MIN:.0%} 未満）")
            cx = (x0 + x1) / 2 / m["size"][0]
            if not 0.3 < cx < 0.7:
                bad.append(f"陸が枠の端に寄っている（中心 {cx:.0%}）")
    return bad


# ------------------------------------------------------------------ 対照 --
# **判定の足の数だけ、対照を持つ。**
# 「壊し方を4通り当てた」は、その4通りが同じ足を折っているなら1通り。
# だから**足ごとに、その足だけが捕まえる1枚**を作って、`BREAK=<足>` で
# 外したときにその1枚が通ってしまうことまで見る
# （`docs/island-standards.md` §15 / `island-misses.md` #128 の決めごと1）。


def noise(d: ImageDraw.ImageDraw, box, base, n=900) -> None:
    """その範囲を、色を散らして塗る。**のっぺりさせないため。**"""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    for i in range(n):
        x = x0 + (i * 137) % max(1, w)
        y = y0 + (i * 71) % max(1, h)
        # **3色をばらばらに散らす。** 同じだけ動かすと明るさしか変わらず、
        # 16段に丸めた色の種類がほとんど増えない（実測15種）
        off = ((i * 13) % 56 - 24, (i * 29) % 72 - 30, (i * 37) % 64 - 28)
        d.ellipse([x, y, x + 14 + (i % 9), y + 6 + (i % 7)],
                  fill=tuple(min(255, max(0, c + o)) for c, o in zip(base, off)))


def wash(size, base) -> Image.Image:
    """その色を、**すみずみまで散らして**塗った1枚。

    点を散らすだけだと隙間に地の色が残り、そこが「いちばん多い色」になる。
    のっぺりの足を当てたくない対照は、ここで塗る。
    """
    w, h = size
    im = Image.new("RGB", (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            i = (x // 3) * 7 + (y // 3) * 11
            px[x, y] = (
                min(255, max(0, base[0] + (i * 13) % 56 - 24)),
                min(255, max(0, base[1] + (i * 29) % 72 - 30)),
                min(255, max(0, base[2] + (i * 37) % 64 - 28)),
            )
    return im


def fake_flat(color) -> Image.Image:
    return Image.new("RGB", (W, H), color)


def plates(d: ImageDraw.ImageDraw) -> None:
    """島の名前の板と、旅のしるべの板。"""
    d.rounded_rectangle([24, 24, 372, 190], 18, fill=(246, 231, 186), outline=(120, 80, 40), width=4)
    d.rounded_rectangle([860, 500, 1176, 600], 16, fill=(246, 231, 186), outline=(120, 80, 40), width=4)


def fake_island(*, land_w=470, cx=W // 2, with_plates=True) -> Image.Image:
    """島のかたちをした1枚。**通る側の対照。**

    実物ではないので、判定が「本物の写真でしか通らない」ほど締まっていたら、
    ここが落ちて気づける。
    """
    # 海は**すみずみまで**散らす。点を散らすだけだと隙間の地の色がいちばん多い色に
    # なり、のっぺりの足が別の対照まで捕まえてしまう（実測 56.8%）
    im = wash((W, H), (30, 130, 190))
    d = ImageDraw.Draw(im)
    d.ellipse([cx - land_w // 2, -40, cx + land_w // 2, 660], fill=(232, 216, 150))
    d.ellipse([cx - land_w // 2 + 18, -20, cx + land_w // 2 - 18, 630], fill=(96, 186, 92))
    noise(d, (cx - land_w // 2 + 30, 10, cx + land_w // 2 - 30, 600), (90, 180, 90), 500)
    if with_plates:
        plates(d)
    return im


def fake_sea_heavy() -> Image.Image:
    """陸はあるが、**海のほうが広い**（直す前の下絵がこれ）。海の足だけが捕まえる。"""
    return fake_island(land_w=340, with_plates=False)


def fake_no_sea() -> Image.Image:
    """陸だけで、海が写っていない。海の足だけが捕まえる。"""
    im = wash((W, H), (96, 186, 92))
    plates(ImageDraw.Draw(im))
    return im


def fake_thin_land() -> Image.Image:
    """緑は散っているが、**陸と呼べる量が無い**。陸の足だけが捕まえる。"""
    im = Image.new("RGB", (W, H), (26, 116, 186))
    d = ImageDraw.Draw(im)
    noise(d, (0, 0, W, H), (30, 130, 190), 1400)
    for i in range(300):
        x = 180 + (i * 53) % 840
        y = 30 + (i * 97) % 560
        d.ellipse([x, y, x + 7, y + 7], fill=(90 + i % 30, 180 + i % 40, 80 + i % 30))
    d.rounded_rectangle([24, 24, 560, 300], 18, fill=(246, 231, 186), outline=(120, 80, 40), width=4)
    d.rounded_rectangle([640, 340, 1176, 600], 16, fill=(246, 231, 186), outline=(120, 80, 40), width=4)
    return im


def fake_flat_sea() -> Image.Image:
    """海が1色でのっぺり。のっぺりの足だけが捕まえる。"""
    im = Image.new("RGB", (W, H), (26, 116, 186))
    d = ImageDraw.Draw(im)
    d.ellipse([W // 2 - 190, -40, W // 2 + 190, 660], fill=(232, 216, 150))
    d.ellipse([W // 2 - 172, -20, W // 2 + 172, 630], fill=(96, 186, 92))
    noise(d, (W // 2 - 150, 10, W // 2 + 150, 600), (90, 180, 90), 900)
    plates(d)
    return im


def fake_few_colors() -> Image.Image:
    """色が数種類しかない（描かれていない絵）。色の種類の足だけが捕まえる。"""
    im = Image.new("RGB", (W, H), (26, 116, 186))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 250], fill=(30, 120, 190))
    d.ellipse([W // 2 - 250, -40, W // 2 + 250, 660], fill=(96, 186, 92))
    d.rectangle([24, 24, 372, 190], fill=(246, 231, 186))
    d.rectangle([860, 500, 1176, 600], fill=(244, 229, 184))
    return im


def fake_off_center() -> Image.Image:
    """島が枠の端に寄っている。ひろがりの足だけが捕まえる。"""
    return fake_island(cx=150)


def controls() -> list[tuple[str, Image.Image, bool]]:
    """（名前, 絵, 通ってほしいか）。**落ちる側と通る側の両方を持つ。**"""
    return [
        ("真っ白", fake_flat((255, 255, 255)), False),
        ("真っ青（海だけ）", fake_flat((26, 116, 186)), False),
        ("真っ緑（陸だけ）", fake_flat((96, 186, 92)), False),
        ("寸法ちがい", fake_island().resize((600, 315)), False),
        ("海のほうが広い", fake_sea_heavy(), False),
        ("海が写っていない", fake_no_sea(), False),
        ("陸と呼べる量が無い", fake_thin_land(), False),
        ("海がのっぺり", fake_flat_sea(), False),
        ("色が数種類しかない", fake_few_colors(), False),
        ("島が端に寄っている", fake_off_center(), False),
        ("島のかたち", fake_island(), True),
    ]


def run_controls(breaks: set[str]) -> tuple[int, int, list[str]]:
    ok, ng = 0, []
    for name, im, want in controls():
        bad = judge(measure(im), breaks)
        got = not bad
        if got == want:
            ok += 1
        else:
            ng.append(f"{name}: {'通ってほしいのに落ちた' if want else '落ちてほしいのに通った'}"
                      f"{'（' + ' / '.join(bad) + '）' if bad else ''}")
    return ok, len(controls()), ng


def main() -> int:
    breaks = {s for s in (os.environ.get("BREAK") or "").split(",") if s}
    if breaks:
        print(f"BREAK={','.join(sorted(breaks))}（判定の足を折っています）")
    ok, total, ng = run_controls(breaks)
    print(f"対照 {total}件中 {ok}件通った")
    for line in ng:
        print(f"::error::{line}")
    if ng:
        # **対照が1件でも外れたら、本物の数字を1つも出さない**（`island-standards.md` §15）
        return 2

    src = sys.argv[1] if len(sys.argv) > 1 else str(repo_path("site/public/og.png"))
    if not os.path.exists(src):
        print(f"::error::絵がありません: {src}")
        return 2
    m = measure(Image.open(src))
    print(
        f"{src}  {m['size'][0]}x{m['size'][1]}  見た画素 {m['seen']:,}  "
        f"海 {m['sea']:.1%} / 陸 {m['land']:.1%} / "
        f"色の種類 {m['bins']} / いちばん多い色 {m['one']:.1%}"
    )
    if m["box"]:
        x0, y0, x1, y1 = m["box"]
        print(f"  陸のひろがり {x1 - x0}x{y1 - y0}px（枠の {(x1 - x0) / m['size'][0]:.0%}x{(y1 - y0) / m['size'][1]:.0%}）")
    bad = judge(m, breaks)
    for line in bad:
        print(f"::error::{line}")
    print("島が写っています" if not bad else f"{len(bad)}件 見つかりました")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
