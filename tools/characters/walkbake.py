"""島を歩くあやとの「歩きのコマ」（横・正面・背中 × 4コマ）を、配る1枚のシートに焼く。

    python3 tools/characters/walkbake.py                  # 焼く
    python3 tools/characters/walkbake.py --drill          # 対照だけ回して帰る
    python3 tools/characters/walkbake.py --preview <dir>  # 焼いて、確かめ用の絵も書く

## なぜスクリプトにしてあるか

止まっている1枚（`charbake.py`）と同じ理由。**描き直した日に、前と同じ切り方・
同じ倍率で焼けるようにするため。** 元の絵（`isle-src/ayato-walk-*.png`）を
git に置いてあるのもそのため。ChatGPT に描いてもらった横長の1枚（4コマ）を、
方向ごとにそのまま置いてある。

## 焼き上がりの形

| 段 | 元の絵 | 中身 |
| --- | --- | --- |
| 1段目 | `ayato-walk-side.png` | 横（左向き）。右へ歩くときは島が左右を反転する |
| 2段目 | `ayato-walk-front.png` | 正面（こちらへ＝下へ歩く） |
| 3段目 | `ayato-walk-back.png` | 背中（向こうへ＝上へ歩く） |

どの段も、左から 1コマ目＝右足が前／2コマ目＝両足がそろって体が少し上がる／
3コマ目＝左足が前／4コマ目＝2コマ目と同じ形。**止まったときは、その向きの
2コマ目で立つ**ので、2コマ目は立ち姿としても通るように描かせてある。
枠は12コマとも同じ寸法（幅は全コマで要る最大、背 192）。

## やっていること

1. **塵を落とす**（alpha < 8 を 0 に）。`charbake.py` と同じ。ChatGPT の絵は
   透明なはずのところに見えない点が散っていて、残すと外接矩形がそこまで伸びる。
   コマの切り分けも中身で切るのも、全部この外接矩形で決まる
2. **4コマに切り分ける。** まず等間隔で切ってみて、切れ目の縦の列に中身が
   1画素でも掛かっていたら、等間隔はあきらめて**透明な縦の帯**で切る
   （ChatGPT は「等間隔に」と頼んでも、きっちり等間隔には並べない）。
   帯で切って4つより多く割れたら（腕と体のあいだが空いている、など）、
   いちばん狭い帯から順に埋めて4つにする
3. **縮める。倍率は、1つの方向の4コマで共通。コマごとに背を合わせない。**
   2コマ目と4コマ目は「体が少し上がる」コマで、そのぶん背が高く描かれている。
   コマごとに背を 192 にそろえると、その上下が消えて、代わりに体が伸び縮みする。
   倍率は「その方向でいちばん高いコマの背」が 192px になる値1つ。
   **3方向とも同じ式なので、どの向きでもいちばん高いコマの背は 192 で、
   向きを変えても背は変わらない。** 3方向で画素の倍率そのものを1つにしないのは、
   3枚が別々に描かれた絵で、人の描かれた大きさ（画素）が絵ごとに違うから。
   画素の倍率を1つにすると、絵の大きい向きだけ大きいあやとになる
4. **足の下端をそろえる。** どのコマも、いちばん下の画素が段の最下行に来る。
   島はコマの足もとを地面に置くので、ここがずれると歩くたびに沈んだり浮いたりする
5. **横は体の重心で中央にそろえる**（alpha の重みを付けた x の平均）。外接矩形の
   中央でそろえると、前に出した足やタブレットの角でコマごとに中心が動き、
   ぱらぱらめくったときに体が前後に揺れる
6. 同じ寸法の枠を 4×3 に並べた1枚を書く（webp・質 82）

## なぜ背 192 なのか

止まっている1枚（`ayato.webp`）は中身で切ってあるので、**ファイルの背＝絵の中の人の背**。
島はその背を世界座標 60（`AYATO_H`）で描き、dpr3 でも 180px で足りる
（`charbake.py` の表）。歩きのコマも「いちばん高いコマの背＝枠の背」にしておけば、
止まった絵と同じ比で置ける（枠の背を `AYATO_H` に合わせればよい）。192 は 180 を
ちょうど超える大きさ。止まった絵のほうが 640 あるのはカードに貼るためで、
歩きのコマはカードに貼らない。

## なぜ枠の幅が「コマの最大幅」より広いか

重心を枠の中央に置くので、重心から左右の遠いほうの端までの距離の2倍が要る。
前に出した手やタブレットで片側だけ長いコマは、外接矩形の幅より広い枠でないと
はみ出して切れる。**切れるよりは、少し広いほうを取る。** 左右に 1px ずつ透明を残す
（端に触れているのか切れているのかを、対照で見分けられるように）。

## 何を見れば焼けたと言えるか

`--preview <dir>` で7枚書く。

| 絵 | 見るところ |
| --- | --- |
| `contact.png` | 3段×4コマと、1段目の右に `ayato.webp` を同じ背で（地は #6c6）。同じ人・同じ服・同じ持ち物か、足が交互に出ているか、向きで背が変わらないか |
| `onion-<向き>.png` | その向きの4コマを半透明で重ねる。足の下端が1行（赤い横線）、体の中心が1本（赤い点線）にそろっているか |
| `walk-<向き>.gif` | 0.125秒ずつで回す。跳ねたり、顔が変わったりしないか |
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent          # tools/characters/
REPO = HERE.parent.parent

#: 段の順（上から）。島の側はこの順で段を引く
ROWS = ("side", "front", "back")
SRCS = {d: HERE / "isle-src" / f"ayato-walk-{d}.png" for d in ROWS}
OUT = REPO / "site" / "public" / "characters" / "ayato-walk.webp"
STILL = REPO / "site" / "public" / "characters" / "ayato.webp"

#: 1段のコマの数
FRAMES = 4
#: 透明とみなす alpha。**これ未満は 0 に倒す**（`charbake.py` と同じ値）
DUST = 8
#: 枠の背（px）。根拠は頭の「なぜ背 192 なのか」
TALL = 192
#: webp の質（`charbake.py` と同じ）
QUALITY = 82
#: 確かめ用の地の色（#6c6）
GREEN = (0x66, 0xCC, 0x66, 255)


def dedust(im: Image.Image) -> Image.Image:
    """alpha が DUST 未満の画素を 0 にする。**元の絵は書き換えない。**"""
    im = im.convert("RGBA")
    im.putalpha(im.getchannel("A").point(lambda v: 0 if v < DUST else v))
    return im


def _filled_columns(im: Image.Image) -> list[bool]:
    """縦の列ごとに、中身が1画素でもあるか。"""
    w = im.width
    data = im.getchannel("A").tobytes()
    return [any(data[x::w]) for x in range(w)]


def split(im: Image.Image, n: int = FRAMES) -> list[Image.Image]:
    """塵を落とした絵を n コマに切る。返すのは**中身で切った**コマ。

    等間隔の切れ目に中身が掛かっていなければ等間隔、掛かっていれば透明な縦の帯。
    """
    filled = _filled_columns(im)
    w = im.width
    cuts = [round(w * k / n) for k in range(1, n)]
    if not any(filled[min(c, w - 1)] for c in cuts):
        spans = [(round(w * k / n), round(w * (k + 1) / n)) for k in range(n)]
    else:
        # 中身のある列のかたまり（左端, 右端の次）を拾う
        runs: list[list[int]] = []
        for x, f in enumerate(filled):
            if f:
                if runs and runs[-1][1] == x:
                    runs[-1][1] = x + 1
                else:
                    runs.append([x, x + 1])
        if len(runs) < n:
            raise ValueError(
                f"透明な縦の帯で {len(runs)} つにしか割れない（{n} コマのはず）。コマが重なっている"
            )
        # 多すぎるぶんは、いちばん狭い帯から埋める
        while len(runs) > n:
            gaps = [runs[i + 1][0] - runs[i][1] for i in range(len(runs) - 1)]
            i = gaps.index(min(gaps))
            runs[i] = [runs[i][0], runs[i + 1][1]]
            del runs[i + 1]
        spans = [(a, b) for a, b in runs]
    frames = []
    for k, (a, b) in enumerate(spans):
        piece = im.crop((a, 0, b, im.height))
        box = piece.getchannel("A").getbbox()
        if box is None:
            raise ValueError(f"{k + 1}コマ目に中身が1画素も無い")
        frames.append(piece.crop(box))
    return frames


def centroid_x(im: Image.Image) -> float:
    """alpha の重みを付けた x の平均（画素の中心で測る）。"""
    w = im.width
    data = im.getchannel("A").tobytes()
    cols = [sum(data[x::w]) for x in range(w)]
    tot = sum(cols)
    if tot == 0:
        raise ValueError("中身が1画素も無い")
    return sum(c * x for x, c in enumerate(cols)) / tot + 0.5


def shrink(frames: list[Image.Image], tall: int) -> list[Image.Image]:
    """1方向の4コマを、**共通の倍率1つ**で縮める（いちばん高いコマが tall）。

    縮めると、頭のてっぺんと靴の底の1行が薄まって塵（alpha < 8）になり、
    落とすと背が 1px 縮む（正面の段で 192 のはずが 191 になった）。
    なので、いちばん高いコマが tall に届くまで倍率をほんの少しずつ上げ直す。
    上げるのは4コマ一緒なので、コマ同士の背の比は変わらない。
    """
    top = max(f.height for f in frames)
    scale = tall / top
    for _ in range(8):
        out = []
        for f in frames:
            size = (max(1, round(f.width * scale)), max(1, round(f.height * scale)))
            g = dedust(f.resize(size, Image.LANCZOS))
            g = g.crop(g.getchannel("A").getbbox())
            if g.height > tall:                         # 丸めで1行はみ出したとき
                g = g.crop((0, g.height - tall, g.width, g.height))
            out.append(g)
        if max(g.height for g in out) >= tall:
            break
        scale += 0.5 / top                              # 元の絵の半画素ぶん
    return out


def bake(srcs: list[Image.Image], n: int = FRAMES, tall: int = TALL) -> tuple[Image.Image, int]:
    """方向ごとの元の絵（段の順）から、シート1枚と枠1つの幅を返す。**保存はしない。**"""
    rows = [shrink(split(dedust(s), n), tall) for s in srcs]
    cxs = [[centroid_x(g) for g in row] for row in rows]
    half = max(max(cx, g.width - cx) for row, cr in zip(rows, cxs) for g, cx in zip(row, cr))
    cell = int(-(-2 * half // 1)) + 2                   # 切り上げ＋左右 1px
    cell += cell % 2                                    # 偶数にして中央を整数に
    sheet = Image.new("RGBA", (cell * n, tall * len(rows)), (0, 0, 0, 0))
    for r, (row, cr) in enumerate(zip(rows, cxs)):
        for k, (g, cx) in enumerate(zip(row, cr)):
            x = k * cell + round(cell / 2 - cx)
            sheet.alpha_composite(g, (x, r * tall + tall - g.height))  # 足の下端を段の最下行へ
    return sheet, cell


def cells(sheet: Image.Image, n: int = FRAMES, tall: int = TALL) -> list[list[Image.Image]]:
    """シートを段ごとのコマに戻す。"""
    w = sheet.width // n
    return [
        [sheet.crop((k * w, r * tall, (k + 1) * w, (r + 1) * tall)) for k in range(n)]
        for r in range(sheet.height // tall)
    ]


def _box(c: Image.Image):
    return dedust(c).getchannel("A").getbbox()


def drill(real: bool = True) -> bool:
    """対照。**本物を1枚も焼く前に回す。**

    見るのは7つ（real で、焼いたシートがあれば8つ）。どれが外れても、島のあやとが
    沈む・跳ねる・伸び縮みする・向きで背が変わる。
    """
    ok = True

    def person(sheet: Image.Image, x: int, w: int, top: int, bottom: int) -> None:
        sheet.paste((20, 30, 40, 255), (x, top, x + w, bottom))

    # 等間隔の4コマ（400×200）。2・4コマ目は背が高い（体が上がる）。
    # まわり一面に alpha 3 の塵を敷く
    side = Image.new("RGBA", (400, 200), (0, 0, 0, 3))
    for k, (top, bottom) in enumerate([(60, 180), (40, 180), (60, 180), (40, 180)]):
        person(side, k * 100 + 30, 40, top, bottom)
    # 同じ形を半分の大きさで描いた向き（別々に描かれた絵は、人の画素の大きさが違う）
    front = Image.new("RGBA", (200, 100), (0, 0, 0, 0))
    for k, (top, bottom) in enumerate([(30, 90), (20, 90), (30, 90), (20, 90)]):
        person(front, k * 50 + 15, 20, top, bottom)
    sheet, cell = bake([side, front], tall=140)
    rows = cells(sheet, tall=140)

    # 1. 塵で外接矩形が伸びていない（伸びると倍率が小さくなり、背が 140 に届かない）
    tallest = max(_box(c)[3] - _box(c)[1] for c in rows[0])
    if tallest != 140:
        print(f"対照1 外れ: 塵ごと測っている（いちばん高いコマの背 {tallest}。140 のはず）")
        ok = False

    # 2. 全コマの足の下端が同じ行（段の最下行）
    bottoms = [_box(c)[3] for row in rows for c in row]
    if set(bottoms) != {140}:
        print(f"対照2 外れ: 足の下端がそろっていない（{bottoms}。全部 140 のはず）")
        ok = False

    # 3. 倍率は1方向の4コマで共通。背 120 のコマは 120 のまま、140 には伸ばさない
    heights = [_box(c)[3] - _box(c)[1] for c in rows[0]]
    if heights != [120, 140, 120, 140]:
        print(f"対照3 外れ: コマごとに背を合わせている（{heights}。[120, 140, 120, 140] のはず）")
        ok = False

    # 4. 半分の大きさで描かれた向きも、同じ背で焼ける（向きを変えても背が変わらない）
    heights = [_box(c)[3] - _box(c)[1] for c in rows[1]]
    if heights != [120, 140, 120, 140]:
        print(f"対照4 外れ: 向きで背が変わる（正面 {heights}。横と同じ [120, 140, 120, 140] のはず）")
        ok = False

    # 5. 重心が枠の中央で、片側に長い出っ張りがあっても枠の端で切れない
    lop = Image.new("RGBA", (400, 200), (0, 0, 0, 0))
    for k in range(4):
        person(lop, k * 100 + 30, 30, 40, 180)
        if k % 2:
            person(lop, k * 100 + 60, 30, 170, 180)     # 前に出した足（右へ長い）
    sheet, cell = bake([lop], tall=140)
    for k, c in enumerate(cells(sheet, tall=140)[0]):
        off = centroid_x(c) - cell / 2
        if abs(off) > 1:
            print(f"対照5 外れ: {k + 1}コマ目の重心が中央から {off:+.1f}px ずれている")
            ok = False
        if _box(c)[0] == 0 or _box(c)[2] == cell:
            print(f"対照5 外れ: {k + 1}コマ目が枠の端で切れている")
            ok = False

    # 6. 等間隔に並んでいない絵は、透明な帯で切る（等間隔の切れ目に中身が掛かる形）
    skew = Image.new("RGBA", (400, 200), (0, 0, 0, 0))
    for x, w in [(5, 90), (110, 40), (190, 100), (330, 40)]:
        person(skew, x, w, 40, 180)
    got = split(dedust(skew))
    if [g.width for g in got] != [90, 40, 100, 40]:
        print(f"対照6 外れ: 透明な帯で切れていない（幅 {[g.width for g in got]}。[90, 40, 100, 40] のはず）")
        ok = False

    # 7. 縁が薄い絵を縮めても、いちばん高いコマが背に届く（縮めると頭と靴の1行が
    #    塵になって 1px 縮む。正面の段で 191 になったのがこれ）
    #    上下の6行を alpha 8→18 でぼかす（直しを外すと 190 になるのを確かめてある）
    soft = Image.new("RGBA", (400, 715), (0, 0, 0, 0))
    for k in range(4):
        x = k * 100 + 20
        person(soft, x, 60, 6, 709)
        for i in range(6):
            soft.paste((20, 30, 40, 8 + i * 2), (x, i, x + 60, i + 1))              # 頭のてっぺん
            soft.paste((20, 30, 40, 8 + i * 2), (x, 714 - i, x + 60, 715 - i))      # 靴の底
    sheet, cell = bake([soft], tall=192)
    top = max(_box(c)[3] - _box(c)[1] for c in cells(sheet)[0])
    if top != 192:
        print(f"対照7 外れ: 縮めたら背が縮んだ（いちばん高いコマ {top}。192 のはず）")
        ok = False

    if real and OUT.is_file():
        ok = check_out() and ok
    return ok


def check_out() -> bool:
    """焼いたシートそのものを見る（3段・4つの枠・どのコマも足が段の最下行・
    どの向きもいちばん高いコマが 192）。webp に書いたあとの絵で見る。"""
    ok = True
    with Image.open(OUT) as raw:
        real = raw.convert("RGBA")
    if real.height != TALL * len(ROWS) or real.width % FRAMES:
        print(f"対照8 外れ: {OUT.name} が {real.size}（背 {TALL}×{len(ROWS)}段・幅が {FRAMES} で割り切れるはず）")
        return False
    for name, row in zip(ROWS, cells(real)):
        bad = [k + 1 for k, c in enumerate(row) if _box(c)[3] != TALL]
        if bad:
            print(f"対照8 外れ: {OUT.name} の {name} の {bad} コマ目の足が段の最下行に無い")
            ok = False
        top = max(_box(c)[3] - _box(c)[1] for c in row)
        if top != TALL:
            print(f"対照8 外れ: {OUT.name} の {name} のいちばん高いコマが {top}（{TALL} のはず）")
            ok = False
    return ok


def preview(sheet: Image.Image, out: Path) -> list[str]:
    """確かめ用の絵（頭の表）を out に書く。書いた名前を返す。"""
    out.mkdir(parents=True, exist_ok=True)
    rows = cells(sheet)
    cell = rows[0][0].width
    pad = 16
    names = []

    with Image.open(STILL) as raw:
        still = raw.convert("RGBA")
    still = still.resize((round(still.width * TALL / still.height), TALL), Image.LANCZOS)
    wide = (cell + pad) * FRAMES + still.width + pad * 2
    contact = Image.new("RGBA", (wide, (TALL + pad) * len(rows) + pad), GREEN)
    for r, row in enumerate(rows):
        y = pad + r * (TALL + pad)
        for k, c in enumerate(row):
            contact.alpha_composite(c, (pad + k * (cell + pad), y))
    contact.alpha_composite(still, (pad + FRAMES * (cell + pad) + pad, pad))
    contact.convert("RGB").save(out / "contact.png")
    names.append("contact.png")

    for name, row in zip(ROWS, rows):
        onion = Image.new("RGBA", (cell, TALL), GREEN)
        for c in row:
            ghost = c.copy()
            ghost.putalpha(ghost.getchannel("A").point(lambda v: v * 2 // 5))
            onion.alpha_composite(ghost)
        px = onion.load()                               # 足の下端と中心の目印（赤）
        for xx in range(cell):
            px[xx, TALL - 1] = (220, 30, 30, 255)
        for yy in range(0, TALL, 4):
            px[cell // 2, yy] = (220, 30, 30, 255)
        onion.convert("RGB").save(out / f"onion-{name}.png")

        gif = []
        for c in row:
            g = Image.new("RGBA", (cell, TALL), GREEN)
            g.alpha_composite(c)
            gif.append(g.convert("RGB"))
        gif[0].save(out / f"walk-{name}.gif", save_all=True, append_images=gif[1:], duration=125, loop=0)
        names += [f"onion-{name}.png", f"walk-{name}.gif"]
    return names


def main(argv: list[str]) -> int:
    if "--drill" in argv:
        if not drill():
            print("対照が外れた")
            return 2
        print("対照8つ 通った" if OUT.is_file() else "対照7つ 通った（焼いたシートがまだ無いので8は見ていない）")
        return 0
    # 焼く前は、作り物の対照だけ（いま置いてあるシートは、これから焼き直すので見ない）
    if not drill(real=False):
        print("対照が外れた。本物は焼いていない")
        return 2
    missing = [str(p.relative_to(REPO)) for p in SRCS.values() if not p.is_file()]
    if missing:
        print(f"{' '.join(missing)} が無い")
        return 2
    srcs = []
    for d in ROWS:
        with Image.open(SRCS[d]) as raw:
            srcs.append(raw.convert("RGBA"))
    sheet, cell = bake(srcs)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT, "WEBP", quality=QUALITY, method=6)
    print(
        f"{' '.join(f'{d}{s.size}' for d, s in zip(ROWS, srcs))} → {OUT.relative_to(REPO)} {sheet.size}"
        f"（コマ {cell}×{TALL} / {len(ROWS)}段×{FRAMES}コマ / {OUT.stat().st_size:,} バイト）"
    )
    if not check_out():
        print("焼いたシートが対照に外れた")
        return 2
    if "--preview" in argv:
        i = argv.index("--preview")
        if i + 1 >= len(argv):
            print("--preview の後に書き出す先が要る")
            return 2
        names = preview(sheet, Path(argv[i + 1]))
        print(f"確かめ用の絵（{argv[i + 1]}）: {' '.join(names)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
