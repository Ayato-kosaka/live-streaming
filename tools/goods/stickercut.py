"""あやとステッカーの元絵から、**地を抜いて、配る2枚を焼く。**

    python3 tools/goods/stickercut.py            # 9枚ぜんぶ焼く
    python3 tools/goods/stickercut.py cooking    # 名前を渡せば、その1枚だけ
    python3 tools/goods/stickercut.py --drill    # 対照だけ回して帰る
    python3 tools/goods/stickercut.py --check    # 焼かずに、置いてある絵を数える
    python3 tools/goods/stickercut.py --audit    # 焼いた絵に**格子と写り込みが残っていないか**
    python3 tools/goods/stickercut.py --grey /tmp/x.png   # 灰色の上に並べて、目で見る

`--audit` は見張り（`site/selftest/sticker_selftest.mjs`）から呼ばれる。
置き場は `STK_OUT` で差し替えられる——**壊した写しで落ちることを見るため。**

焼くのは2枚。**落とすほう**（`site/public/goods/<id>.png`。原寸・透過）と、
**面に並べるほう**（`<id>.webp`。長辺480）。置き場といまの2枚
（`ayato-walk`）の作法を合わせてある。

## 地とみなすもの

**「無彩色（RGB の最大−最小 ≤ 8）で、かつ明るい（最小チャンネル ≥ 225）」画素だけ。**
それを**ふちからの塗りつぶしで広げる。**

明るさだけで抜かない。はじめの5枚は、**ステッカーの地そのものが明るい**:

| | まわりの地 | ステッカーの地 |
| --- | --- | --- |
| `cooking` | (255,255,255)〜(245,245,245) | 赤 (235,27,14) |
| `georgia` / `stockholm` | (253,253,253) | **生成り (249,227,178)** |

生成りは明るいが**無彩色ではない**（青みが 70 低い）ので、色の条件で残る。
そして全体のしきい値では抜かない。コック帽・コック服・丸の中の白い字が
**ぜんぶ白**なので、しきい値だと中が穴だらけになる。ふちから広げれば、
赤い丸・生成りの丸が壁になって中へ入れない。

## 市松（透明をあらわす格子）は、**絵ではない**

`plane.jpg` には、**「ここは透明です」をあらわす灰色の格子が絵として
焼き込まれている。** 元の絵を透過のまま配れなかった人が、画面で見えていた
格子ごと写して送ってくるとこうなる。あやとの言葉（2026-10-11）:

> 背景透明が漏れてるかもなのでそれも対応してあげて

格子の濃いほうは **136 前後**で、`BRIGHT`（225）に遠く届かない。
明るさの条件では1画素も抜けない。

**探しかたは「色」ではなく「並び」。** 外周1画素の環を読んで、

1. ほぼ全部が無彩色か（`GRAY` 以下）
2. 明るさが**2つの山**に割れていて、山と山が `CHECK_GAP` 以上離れているか
3. 環に沿って見たとき、**同じ帯が続く長さ（マスの辺）がそろっている**か

の3つがそろったときだけ「格子が写っている」とみなす。
`plane.jpg` の実測は **lo=135 / hi=191 / マスの辺 8px（周期 16px）**。
白い紙に置いただけの5枚は、環が1つの山にしかならないので**素通りする**
（＝前からある絵は1バイトも変わらない）。

見つけたら、2つの帯の**あいだも含めて**地とみなす（帯から帯へ渡る
にじみが、格子の継ぎ目に出るため）。

### 格子と絵のあいだの**にじみ**も落とす

jpeg なので、格子（194）と白いふち（255）のあいだに 200〜245 の灰色が
1〜3画素のこる。帯の外なので上の条件では抜けない。**格子が見つかった絵に
かぎって**、地に接した無彩色で `ALIAS`（246）より暗い画素を、
`ALIAS_ROUNDS` 回ぶん地へ繰り込む。白いふち（250〜255）は残る。

**格子の見つからない絵では1画素も動かさない。** 動かすと、白地に置いた
黒い線のきわ（灰色）まで削れて、前からある5枚の形が変わる。

## 画面を撮ったときの**ボタン**は、絵ではないので消す

`sign.jpg` の右下に、共有ボタン（淡い丸地に、上向きの矢印）が焼き込まれて
いる。**場所は座標で持たない**——次に別の絵で、別の隅に写り込んでも効かない。

探すのは**かたち**:

- 絵の中にいて、地にも紙のふちにも**接していない**
- **淡い**（いちばん暗いチャンネルが `SHARE_PALE` 以上。黄色い板は 5、
  赤い三角は 10、黒い字は 0。丸地だけが 115）
- **丸い**（縦横の差が `SHARE_SQUARE` 以下、埋めた面積が外接円の
  `SHARE_ROUND` 以上）
- **中に印がある**（穴が開いている＝矢印。ただの淡い塊と見分ける足）

消したあとは、**まわりの色で引き伸ばして埋める**（縦と横の両方から
境目の色を補間して平均する）。板は平らな黄色なので継ぎ目が出ない。

**限界**: 白い雲のような「淡いが丸くない」ものは残る（それでよい）。
逆に、**まん丸で中に印のある絵**を描いた日には、この手が絵を消す。
だから spec ごとの `share` で**明示的に頼んだ絵にしか当てない。**

## 色で分かれない板は、**かたち**で切る（`mode="card"`）

`noreturn.jpg` は、生成りの板（247〜248）が白い紙（253〜255）に乗って
いる。**差は6階調しかなく、しかも紙のほうが場所によって 240 まで沈む**
（撮ったときの光）。しきい値でも、ふちからの塗りつぶしでも分かれない。

使えるのは**中の黒い枠**。あれは板と同じ角丸四角で、板はその外側に
ぐるりと同じ幅だけ出ている。だから:

1. 黒い線（`CARD_DARK` より暗い）を拾い、**紙のほうから塗りつぶして**
   枠の外を決める。残りが「枠と、枠の中身」
2. 枠から**外へ歩いて、明るさの谷**（板のふち。`CARD_DIP` 以上沈む）を
   探す。4辺それぞれで何本も測って、**中央値**を余白とする
   （`noreturn.jpg` の実測は 左28 / 右29 / 上30 / 下30 画素・100本。中央値 30）
3. 枠と中身を、その余白ぶん**ふくらませる**（chamfer(3,4) の距離。
   真円から 2% ほどずれるので、余白 30px で 0.6px の誤差）

**限界**は3つ。**(1) 枠が閉じていないと使えない**——どこか1画素でも
切れていると、塗りつぶしが中へ入って板が消える（そのときは「中身が
1画素も残らなかった」で落ちる）。**(2) 板の余白が四辺で違うと、
中央値のぶんだけ片側が余るか足りない。** `noreturn.jpg` は左が中央値より
2px 狭いので、左ふちに紙が 2px ほど残る。下は逆に、板のすぐ外の影（224）に
1〜2px かかる。どちらも、灰色の上に置いて等倍で見て分からなかった。**(3) 角丸の半径は枠から受け継ぐ**ので、枠と板で
角の丸さが違う絵には当たらない。

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
OUT = Path(os.environ.get("STK_OUT") or (REPO / "site" / "public" / "goods"))

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
#:   nocheck 市松を見つけない（灰色の格子が地のまま残る）
#:   noshare 写り込んだボタンを消さない（丸いボタンが絵の中に残る）
#:   nocard  板をかたちで切らず、明るさのしきい値で取る（紙ごと取るか、板が消える）
#:
#: `+` でつなげば**まとめて抜ける**。足を1本ずつ抜くのが基本だが、
#: **1本抜いただけでは別の足が代わりに持ってしまう**ことがある——
#: `plane.jpg` の格子は、市松・写り込み・いちばん大きい塊の**3つの手が
#: それぞれ落としにかかる**ので、`BREAK=nocheck+nowash+noblob` の3本を
#: 抜いてはじめて「格子の残った絵」が作れる（`sticker_selftest.mjs` の表）
BREAK = os.environ.get("BREAK", "")
#: 抜いた足の一覧。**判定は必ずこちらを見る**
BROKE = {v for v in BREAK.split("+") if v}

#: 写り込みを広げるときの壁。これより暗ければ絵の線（赤い丸の黒い縁は 0〜40）
INK_DARK = 60
#: 同じく壁。これより鮮やかなら絵の色（赤い丸は 221、にじみは 110 まで）
INK_CHROMA = 130


#: 市松の帯の幅（中心からこれだけ離れても、同じ帯とみなす）
CHECK_TOL = 16
#: 2つの帯が離れているべき明るさ。これ未満なら「2色」ではない
CHECK_GAP = 30
#: 格子1マスの辺の長さ（画素）。外れたら格子ではない
CHECK_RUN = (3, 80)
#: 格子と絵のあいだの、にじんだ灰色をどこまで地に数えるか
ALIAS = 246
#: 同じく、何画素ぶん繰り込むか
ALIAS_ROUNDS = 3

#: 共有ボタンの丸地とみなす淡さ（いちばん暗いチャンネルがこれ以上）
SHARE_PALE = 90
#: 丸さ。埋めた面積 ÷ 外接円の面積
SHARE_ROUND = 0.88
#: 縦横の違い。|w-h| / max がこれ以下
SHARE_SQUARE = 0.12
#: 小さすぎる塵は見ない（外接箱の短いほう）
SHARE_MIN = 20
#: 消したあと、まわりへ何画素ふくらませて塗るか。
#:
#: **jpeg のにじみ（リンギング）は、濃い境目から 8画素ほど届く。** 3画素で
#: 止めると、埋める色をそのにじみから拾ってしまい、**青みの残った薄い黄色**で
#: 塗ることになって、等倍で丸い跡が見えた（板 B=2 に対して埋めたところ B=11）。
#: 丸と板の枠のあいだは実測 22画素あるので、12 なら枠を食わない
SHARE_GROW = 12

#: 板の枠の線とみなす暗さ
CARD_DARK = 110
#: 枠から外へ、板のふちを探しに行く距離
CARD_REACH = 90
#: 枠そのもののにじみを踏まないように、何画素離れてから探すか
CARD_SKIP = 6
#: 板のふちとみなす谷の深さ。これ以上沈めば、そこが板のふち
CARD_DIP = 5


def _lum(r: int, g: int, b: int) -> int:
    return (r + g + b) // 3


class Checker:
    """見つけた市松。**2つの帯の明るさと、マスの辺。**"""

    def __init__(self, lo: int, hi: int, cell: int):
        self.lo = lo
        self.hi = hi
        self.cell = cell

    def __repr__(self) -> str:
        return f"Checker(lo={self.lo} hi={self.hi} cell={self.cell}px 周期{self.cell * 2}px)"


def find_checker(im: Image.Image) -> "Checker | None":
    """**外周の環**を読んで、市松が写り込んでいれば返す。無ければ None。

    色では決めない。**(1) 無彩色か (2) 明るさが2つの山に割れるか
    (3) 同じ帯が続く長さがそろっているか** の3つで決める。
    白い紙に置いただけの絵は (2) で落ちるので、**素通りする。**
    """
    if "nocheck" in BROKE:
        return None
    rgb = im.convert("RGB")
    w, h = rgb.size
    d = rgb.tobytes()

    def px(x: int, y: int) -> tuple[int, int, int]:
        i = 3 * (y * w + x)
        return d[i], d[i + 1], d[i + 2]

    lines = [
        [px(x, 0) for x in range(w)],
        [px(x, h - 1) for x in range(w)],
        [px(0, y) for y in range(h)],
        [px(w - 1, y) for y in range(h)],
    ]
    ring = [p for line in lines for p in line]
    if not ring:
        return None
    # (1) 無彩色か
    flat = sum(1 for r, g, b in ring if max(r, g, b) - min(r, g, b) <= GRAY)
    if flat < 0.95 * len(ring):
        return None
    # (2) 2つの山に割れるか
    lums = sorted(_lum(*p) for p in ring)
    mid = (lums[0] + lums[-1]) // 2
    low = [v for v in lums if v <= mid]
    high = [v for v in lums if v > mid]
    if min(len(low), len(high)) < 0.2 * len(lums):
        return None
    lo, hi = low[len(low) // 2], high[len(high) // 2]
    if hi - lo < CHECK_GAP:
        return None
    inband = sum(1 for v in lums if abs(v - lo) <= CHECK_TOL or abs(v - hi) <= CHECK_TOL)
    if inband < 0.90 * len(lums):
        return None
    # (3) マスの辺がそろっているか。**端の切れた run は数えない**
    runs: list[int] = []
    for line in lines:
        band = []
        for p in line:
            v = _lum(*p)
            band.append(0 if abs(v - lo) <= CHECK_TOL else (1 if abs(v - hi) <= CHECK_TOL else -1))
        cur, n = band[0], 0
        seq: list[tuple[int, int]] = []
        for v in band:
            if v == cur:
                n += 1
            else:
                seq.append((cur, n))
                cur, n = v, 1
        seq.append((cur, n))
        runs += [n for v, n in seq[1:-1] if v >= 0]
    if len(runs) < 8:
        return None
    runs.sort()
    cell = runs[len(runs) // 2]
    if not CHECK_RUN[0] <= cell <= CHECK_RUN[1]:
        return None
    near = sum(1 for v in runs if abs(v - cell) <= max(1, cell * 0.35))
    if near < 0.7 * len(runs):
        return None
    return Checker(lo, hi, cell)


def creep(im: Image.Image, bg: bytearray) -> None:
    """地に接した**にじんだ灰色**を、地へ繰り込む（`bg` を直に書き換える）。

    市松が見つかった絵でだけ呼ぶ。**白いふち（250〜255）は残す。**
    """
    rgb = im.convert("RGB")
    w, h = rgb.size
    d = rgb.tobytes()
    front = [i for i in range(w * h) if bg[i]]
    for _ in range(ALIAS_ROUNDS):
        nxt: list[int] = []
        for i in front:
            x, y = i % w, i // w
            for j, ok in ((i + 1, x + 1 < w), (i - 1, x > 0), (i + w, y + 1 < h), (i - w, y > 0)):
                if not ok or bg[j]:
                    continue
                r, g, b = d[3 * j], d[3 * j + 1], d[3 * j + 2]
                if max(r, g, b) - min(r, g, b) <= GRAY and _lum(r, g, b) < ALIAS:
                    bg[j] = 1
                    nxt.append(j)
        front = nxt
        if not front:
            break


def blobs(mask: bytearray, w: int, h: int) -> list[list[int]]:
    """`mask` が立っている画素を、つながりごとに分けて返す。"""
    seen = bytearray(w * h)
    out: list[list[int]] = []
    for s in range(w * h):
        if not mask[s] or seen[s]:
            continue
        seen[s] = 1
        q = deque([s])
        one = [s]
        while q:
            i = q.popleft()
            x, y = i % w, i // w
            for j, ok in ((i + 1, x + 1 < w), (i - 1, x > 0), (i + w, y + 1 < h), (i - w, y > 0)):
                if ok and mask[j] and not seen[j]:
                    seen[j] = 1
                    q.append(j)
                    one.append(j)
        out.append(one)
    return out


def _fill_holes(cells: list[int], w: int, h: int) -> set[int]:
    """塊の**外接箱の中の穴を埋めた**形を返す（矢印のような中の印を含める）。"""
    xs = [i % w for i in cells]
    ys = [i // w for i in cells]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    bw, bh = x1 - x0 + 1, y1 - y0 + 1
    inside = set(cells)

    def at(k: int) -> int:
        return (y0 + k // bw) * w + x0 + k % bw

    out = bytearray(bw * bh)
    q: deque[int] = deque()
    for bx in range(bw):
        for by in (0, bh - 1):
            k = by * bw + bx
            if not out[k] and at(k) not in inside:
                out[k] = 1
                q.append(k)
    for by in range(bh):
        for bx in (0, bw - 1):
            k = by * bw + bx
            if not out[k] and at(k) not in inside:
                out[k] = 1
                q.append(k)
    while q:
        k = q.popleft()
        bx, by = k % bw, k // bw
        for m, ok in ((k + 1, bx + 1 < bw), (k - 1, bx > 0), (k + bw, by + 1 < bh), (k - bw, by > 0)):
            if ok and not out[m] and at(m) not in inside:
                out[m] = 1
                q.append(m)
    return {at(k) for k in range(bw * bh) if not out[k]}


def find_share(im: Image.Image, keep: bytearray) -> bytearray:
    """絵の中にぽつんと在る**淡い丸**（画面を撮ったときのボタン）を返す。

    座標は1つも持たない。**かたち**で見つける——地に接していない・淡い・
    丸い・中に印がある、の4つ。見つからなければ空の板を返す。
    """
    w, h = im.size
    if "noshare" in BROKE:
        return bytearray(w * h)
    d = im.convert("RGB").tobytes()
    pale = bytearray(w * h)
    for i in range(w * h):
        if keep[i] and min(d[3 * i], d[3 * i + 1], d[3 * i + 2]) >= SHARE_PALE:
            pale[i] = 1
    found = bytearray(w * h)
    for one in blobs(pale, w, h):
        xs = [i % w for i in one]
        ys = [i // w for i in one]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        bw, bh = x1 - x0 + 1, y1 - y0 + 1
        if min(bw, bh) < SHARE_MIN:
            continue
        # 画のふちに接していたら、写り込みではなく絵の一部
        if x0 == 0 or y0 == 0 or x1 == w - 1 or y1 == h - 1:
            continue
        # 地に接していても同じ（ステッカーの白いふちなど）
        touches = False
        for i in one:
            x, y = i % w, i // w
            for j, ok in ((i + 1, x + 1 < w), (i - 1, x > 0), (i + w, y + 1 < h), (i - w, y > 0)):
                if ok and not keep[j]:
                    touches = True
                    break
            if touches:
                break
        if touches:
            continue
        if abs(bw - bh) / max(bw, bh) > SHARE_SQUARE:
            continue
        filled = _fill_holes(one, w, h)
        if len(filled) <= len(one):
            continue                      # 穴が無い＝中に印がない。ただの淡い塊
        r = max(bw, bh) / 2
        if len(filled) / (3.14159265 * r * r) < SHARE_ROUND:
            continue
        for i in filled:
            found[i] = 1
    if not any(found):
        return found
    # jpeg のにじみごと消したいので、ふくらませる
    return dilate(found, w, h, SHARE_GROW)


def patch(im: Image.Image, mask: bytearray) -> Image.Image:
    """`mask` のところを、**まわりの色で引き伸ばして**埋めた絵を返す。

    行と列の両方で、境目の色を端から端へ補間して平均する。
    平らな地なら継ぎ目が出ない（板は一色の黄色）。

    **粒（jpeg のざらつき）は足さない。** まわりと同じ強さの揺れを乗せる手を
    書いて当ててみたが、**足したほうが目立った**——板のまっさらなところは
    実測で R が ±2 しか揺れておらず、そこへ揺れを乗せると、等倍の2倍で見て
    砂（画素ごと）か モザイク（8x8の枡ごと）に見える。足さないのがいちばん
    見えない。**跡が見えたのは粒のせいではなく色のせい**で、そちらは
    `SHARE_GROW` を 3 → 12 にして（jpeg のにじみの外から色を拾って）直した。
    """
    w, h = im.size
    d = bytearray(im.convert("RGB").tobytes())
    if not any(mask):
        return Image.frombytes("RGB", (w, h), bytes(d))
    got: list[list[float | None]] = [[None, None, None] for _ in range(w * h)]

    def sweep(length: int, count: int, idx) -> None:
        for a in range(count):
            b = 0
            while b < length:
                if not mask[idx(a, b)]:
                    b += 1
                    continue
                s = b
                while b < length and mask[idx(a, b)]:
                    b += 1
                e = b - 1
                left = idx(a, s - 1) if s > 0 else None
                right = idx(a, e + 1) if e + 1 < length else None
                for k in range(s, e + 1):
                    i = idx(a, k)
                    t = 0.5 if left is None or right is None else (k - s + 1) / (e - s + 2)
                    for c in range(3):
                        lv = d[3 * left + c] if left is not None else None
                        rv = d[3 * right + c] if right is not None else None
                        if lv is None and rv is None:
                            continue
                        v = rv if lv is None else (lv if rv is None else lv + (rv - lv) * t)
                        prev = got[i][c]
                        got[i][c] = v if prev is None else (prev + v) / 2

    sweep(w, h, lambda y, x: y * w + x)
    sweep(h, w, lambda x, y: y * w + x)
    for i in range(w * h):
        if mask[i]:
            for c in range(3):
                if got[i][c] is not None:
                    d[3 * i + c] = max(0, min(255, round(got[i][c])))
    return Image.frombytes("RGB", (w, h), bytes(d))


def dilate(mask: bytearray, w: int, h: int, r: float) -> bytearray:
    """`mask` を半径 `r` ぶんふくらませる。

    chamfer(3,4) の距離なので、真円から 2% ほどずれる（r=30 で 0.6px）。
    """
    inf = 1 << 28
    dist = [0 if mask[i] else inf for i in range(w * h)]
    for y in range(h):
        base = y * w
        for x in range(w):
            i = base + x
            v = dist[i]
            if not v:
                continue
            if x:
                v = min(v, dist[i - 1] + 3)
            if y:
                v = min(v, dist[i - w] + 3)
                if x:
                    v = min(v, dist[i - w - 1] + 4)
                if x + 1 < w:
                    v = min(v, dist[i - w + 1] + 4)
            dist[i] = v
    for y in range(h - 1, -1, -1):
        base = y * w
        for x in range(w - 1, -1, -1):
            i = base + x
            v = dist[i]
            if not v:
                continue
            if x + 1 < w:
                v = min(v, dist[i + 1] + 3)
            if y + 1 < h:
                v = min(v, dist[i + w] + 3)
                if x + 1 < w:
                    v = min(v, dist[i + w + 1] + 4)
                if x:
                    v = min(v, dist[i + w - 1] + 4)
            dist[i] = v
    lim = round(r * 3)
    return bytearray(1 if dist[i] <= lim else 0 for i in range(w * h))


def card_margin(im: Image.Image, inside: bytearray, talk: bool = True) -> int:
    """枠から**外へ歩いて、板のふちまで何画素あるか**を測る。

    4辺それぞれで何本も走らせて、**ぜんぶの中央値**を返す。
    谷が8本に足りなければ投げる（しきいが合っていない）。
    """
    rgb = im.convert("RGB")
    w, h = rgb.size
    d = rgb.tobytes()

    def lum_at(x: int, y: int) -> int:
        i = 3 * (y * w + x)
        return _lum(d[i], d[i + 1], d[i + 2])

    got: list[int] = []
    per_side: list[list[int]] = []
    for side in range(4):
        here: list[int] = []
        horiz = side < 2
        span = h if horiz else w
        step = max(1, span // 40)
        for a in range(span // 5, span * 4 // 5, step):
            line = [(x, a) for x in range(w)] if horiz else [(a, y) for y in range(h)]
            if side in (1, 3):
                line = line[::-1]
            edge = next((k for k, (x, y) in enumerate(line) if inside[y * w + x]), None)
            if edge is None:
                continue
            lo = max(0, edge - CARD_REACH)
            win = line[lo:max(0, edge - CARD_SKIP)]
            if len(win) < 8:
                continue
            vals = [lum_at(x, y) for x, y in win]
            k = min(range(len(vals)), key=lambda t: vals[t])
            if max(vals) - vals[k] < CARD_DIP:
                continue
            here.append(edge - (lo + k))
        per_side.append(here)
        got += here
    if len(got) < 8:
        raise SystemExit("板のふち（明るさの谷）が見つからない。CARD_DIP が強すぎる")
    got.sort()
    med = got[len(got) // 2]
    if talk:
        tell = " / ".join(
            f"{n}{sorted(v)[len(v) // 2] if v else '-'}" for n, v in zip("左右上下", per_side)
        )
        print(f"       板の余白 {tell}（中央値 {med}px・{len(got)}本）")
    return med


def frame_inside(im: Image.Image) -> bytearray:
    """**中の黒い枠と、その中身**に 1 を立てた板を返す。

    枠は閉じた線なので、紙のほうから塗りつぶせば外と中が分かれる。
    """
    rgb = im.convert("RGB")
    w, h = rgb.size
    d = rgb.tobytes()
    dark = bytearray(
        1 if _lum(d[3 * i], d[3 * i + 1], d[3 * i + 2]) < CARD_DARK else 0 for i in range(w * h)
    )
    # 枠の外を、紙のほうから塗りつぶす
    out = bytearray(w * h)
    q: deque[int] = deque()
    for x in range(w):
        for y in (0, h - 1):
            i = y * w + x
            if not out[i] and not dark[i]:
                out[i] = 1
                q.append(i)
    for y in range(h):
        for x in (0, w - 1):
            i = y * w + x
            if not out[i] and not dark[i]:
                out[i] = 1
                q.append(i)
    while q:
        i = q.popleft()
        x, y = i % w, i // w
        for j, ok in ((i + 1, x + 1 < w), (i - 1, x > 0), (i + w, y + 1 < h), (i - w, y > 0)):
            if ok and not out[j] and not dark[j]:
                out[j] = 1
                q.append(j)
    inside = bytearray(0 if v else 1 for v in out)
    rate = sum(inside) / (w * h)
    if not 0.25 <= rate <= 0.97:
        raise SystemExit(f"枠の中が画の {rate:.0%}。枠が閉じていないか、枠が見つかっていない")
    return inside


def card_keep(im: Image.Image, talk: bool = True) -> bytearray:
    """**色では分かれない板**を、かたちで切って返す。"""
    w, h = im.size
    if "nocard" in BROKE:
        # **直す前の姿。** 枠を見ずに、明るさのしきい値で板を取ろうとする
        d = im.convert("RGB").tobytes()
        return bytearray(
            1 if _lum(d[3 * i], d[3 * i + 1], d[3 * i + 2]) < 251 else 0 for i in range(w * h)
        )
    inside = frame_inside(im)
    return dilate(inside, w, h, card_margin(im, inside, talk))


def grid_pixels(im: Image.Image) -> tuple[int, int]:
    """**焼いたあとの絵に、市松が残っていないか。**`(格子の画素, 見た画素)`。

    見るのは**不透明なところだけ**。1行の中で、無彩色の帯が

      * **2つの明るさを行ったり来たり**し（`CHECK_GAP` 以上離れている）
      * **同じ長さ**で（median の ±35%、`CHECK_RUN` の範囲）
      * **5つ以上**続く

    ところを探す。そのうえで、**1マスぶん上と下の両方の行で、
    同じ場所の明暗が入れ替わっているか**を見る。

    最後の縦の確かめが要る。**横だけ**で見ると、髪や服の明暗が
    「格子」に化ける（実測で、抜き終わった `plane.png` に 204件。
    縦を足すと 0件）。**縞と市松は、縦を見ないと分かれない。**
    片側だけの確かめでも足りない——`sign-mono.png` のワッペンの縁が
    17画素ぶん残った。**上と下の両方**で入れ替わるのが市松。
    """
    rgba = im.convert("RGBA")
    w, h = rgba.size
    d = rgba.tobytes()
    band: list[list[int]] = []
    for y in range(h):
        row = []
        for x in range(w):
            i = y * w + x
            r, g, b, a = d[4 * i], d[4 * i + 1], d[4 * i + 2], d[4 * i + 3]
            row.append(-1 if (a < 128 or max(r, g, b) - min(r, g, b) > GRAY) else _lum(r, g, b))
        band.append(row)

    hit = 0
    for y in range(h):
        row = band[y]
        runs: list[tuple[int, int, int]] = []
        x = 0
        while x < w:
            if row[x] < 0:
                x += 1
                continue
            s, v = x, row[x]
            while x < w and row[x] >= 0 and abs(row[x] - v) <= CHECK_TOL:
                x += 1
            runs.append((s, x - s, v))
        t = 0
        while t + 3 < len(runs):
            va, vb = runs[t][2], runs[t + 1][2]
            ref = runs[t][1]
            if (abs(va - vb) < CHECK_GAP or not CHECK_RUN[0] <= ref <= CHECK_RUN[1]
                    or runs[t + 1][0] != runs[t][0] + runs[t][1]):
                t += 1
                continue
            end = t
            for k in range(t + 1, len(runs)):
                want = va if (k - t) % 2 == 0 else vb
                if runs[k][0] != runs[k - 1][0] + runs[k - 1][1]:
                    break
                if abs(runs[k][2] - want) > CHECK_TOL:
                    break
                if not ref * 0.65 <= runs[k][1] <= ref * 1.35:
                    break
                end = k
            n = end - t + 1
            if n < 5:
                t += 1
                continue
            cell = sorted(runs[k][1] for k in range(t, end + 1))[n // 2]
            # **縦の確かめ。** 1マスぶん離れた行で、明暗が入れ替わっているか
            agree = True
            seen = 0
            for y2 in (y + cell, y - cell):
                if not 0 <= y2 < h:
                    continue
                ok = 0
                for k in range(t, end + 1):
                    cx = runs[k][0] + runs[k][1] // 2
                    other = vb if (k - t) % 2 == 0 else va
                    if band[y2][cx] >= 0 and abs(band[y2][cx] - other) <= CHECK_TOL:
                        ok += 1
                seen += 1
                agree = agree and ok >= 0.8 * n
            if seen and agree:
                hit += sum(runs[k][1] for k in range(t, end + 1))
            t = end + 1
    return hit, w * h


class Spec:
    """1枚ぶんの決め。

    `cut` は地を抜くもの、`keep` はもう透過を持っていて切るだけのもの、
    `card` は**色では分かれない板**をかたちで切るもの。
    `opaque` は**抜けたことを数で確かめる**ための幅（不透明の割合）。
    丸なら四角の中の 70〜85%、四角なら 95% 以上。
    """

    def __init__(self, ident: str, ext: str, mode: str, opaque: tuple[float, float],
                 corners: bool = True, share: bool = False):
        self.id = ident
        self.ext = ext
        self.mode = mode
        self.opaque = opaque
        #: 四隅が抜けているはずか。**四角い絵だけ False**
        self.corners = corners
        #: 画面を撮ったときのボタンが写り込んでいるか。**頼んだ絵にしか当てない**
        self.share = share


SPECS = [
    # 丸い絵は、正方形の枠に対して π/4 ＝ 78.5% ぶんしか埋まらない
    Spec("cooking", "jpg", "cut", (0.70, 0.85)),
    Spec("georgia", "jpg", "cut", (0.70, 0.85)),
    Spec("stockholm", "jpg", "cut", (0.70, 0.85)),
    # 青い四角ごと配るので、切ったあとはほぼ全面が不透明。**四隅も抜けない**
    Spec("sign-color", "png", "keep", (0.95, 1.0), corners=False),
    # 黒い丸のワッペン。もう透過なので切るだけだが、形は丸
    Spec("sign-mono", "png", "keep", (0.70, 0.85)),
    # --- ここから4枚（あやと 2026-10-11「ステッカーに昇格して」）-------------
    # 生成りの角丸四角。**地と色が同じ**なので、かたちで切る（`card`）
    Spec("noreturn", "jpg", "card", (0.90, 1.0), corners=True),
    # 黄色い標識。枠いっぱいの角丸四角で、**右下に共有ボタンが写り込んでいる**
    Spec("sign", "jpg", "cut", (0.90, 1.0), corners=True, share=True),
    # ミッキー形のふうせん。白地なので、前からの抜きかたで通る
    Spec("balloon", "jpg", "cut", (0.55, 0.80)),
    # 黄色い飛行機。**地が市松**（「背景透明が漏れてる」の本体）
    Spec("plane", "jpg", "cut", (0.45, 0.75)),
]


def flood_bg(im: Image.Image, chk: "Checker | None" = None) -> bytearray:
    """**ふちから繋がっている地**に 1 を立てた板を返す。

    `chk` を渡すと、**市松の2つの帯（とそのあいだ）も地**として歩く。

    1枚 1.4M 画素を1画素ずつ見るので、`getpixel` ではなく生のバイト列で回す
    （`getpixel` だと1枚20秒かかる）。
    """
    rgb = im.convert("RGB")
    w, h = rgb.size
    data = rgb.tobytes()

    def is_bg(i: int) -> bool:
        r, g, b = data[3 * i], data[3 * i + 1], data[3 * i + 2]
        if max(r, g, b) - min(r, g, b) > GRAY:
            return False
        if chk is None:
            return min(r, g, b) >= BRIGHT
        # **市松の写っている絵では、白は地ではない。**
        # 切り抜きステッカーは白いふちを持っている（`plane.jpg` は 15px ある）。
        # 「明るい無彩色は地」のままだと、そのふちごと抜けて
        # 絵が痩せる（1度やった）。地は格子の2つの帯だけ
        return chk.lo - CHECK_TOL <= _lum(r, g, b) <= chk.hi + CHECK_TOL

    if "thresh" in BROKE:
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
    if chk is not None:
        # 格子と絵のあいだの、にじんだ灰色も地へ繰り込む
        creep(im, seen)
    return seen


def flood_wash(im: Image.Image, bg: bytearray) -> bytearray:
    """**紙のふちに届いている写り込み**に 1 を立てた板を返す。

    種は「紙のふちにいて、地ではない画素」。そこから**白を渡らずに**、
    濃い色・鮮やかな色（絵の線と、絵の地の色）にぶつかるまで広げる。

    白を渡らないので、**丸との間が白で切れていれば1画素も動かない。**
    `georgia` / `stockholm` のふちの影がそれ。
    """
    w, h = im.size
    if "nowash" in BROKE:
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
    if "noblob" in BROKE:
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


def cut(im: Image.Image, spec: "Spec | None" = None, talk: bool = False) -> Image.Image:
    """地を抜いて、中身で切った RGBA を返す。

    `spec` を渡すと、その1枚の事情（`card` で切る／写り込んだボタンを消す）も効く。
    渡さなければ、前からの抜きかたそのまま——**対照がこの形で呼ぶ。**
    """
    w, h = im.size
    if spec is not None and spec.mode == "card":
        keep = card_keep(im, talk)
    else:
        chk = find_checker(im)
        if talk and chk is not None:
            print(f"       {chk}")
        bg = flood_bg(im, chk)
        # **市松の絵では、紙のふちからの写り込みを広げない。**
        # あれは「白い紙に置いて撮った」絵のための手で、種は
        # 「紙のふちにいて、地ではない画素」。市松の絵には紙が無く、
        # 代わりに**ステッカー自身の白いふち**が白く広い。実測で、
        # 広げると `plane.jpg` の白いふち 41,052画素が丸ごと落ちた
        wash = bytearray(len(bg)) if chk is not None else flood_wash(im, bg)
        gone = bytearray(a | b for a, b in zip(bg, wash))
        keep = keep_largest(gone, w, h)
    if spec is not None and spec.share:
        mask = find_share(im, keep)
        n = sum(mask)
        if talk:
            print(f"       写り込んだボタン {n}画素を塗りつぶした" if n
                  else "       写り込んだボタンは見つからなかった")
        if n:
            im = patch(im, mask)
        elif not BROKE:
            raise SystemExit("写り込んだボタンを頼まれたのに、1つも見つからなかった")
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
      8. **市松が見つかり、地として抜ける**（写し3）
      9. **白い紙の絵は「市松」と読まない**（＝前からある5枚が1バイトも変わらない）
     10. **ステッカーの白いふちが残る**（市松の絵では、白は地ではない）
     11. **抜いたあとの絵に格子が1画素も残らない**（見張りと同じ目で見る）
     12. **写り込んだ丸いボタンが見つかり、板の色で埋まる**（写し4）
     13. **丸くない淡い塊（雲）と、中に印のない淡い丸は消さない**
     14. **色で分かれない板が、かたちで切れる**（写し5。**板より暗い紙**も取らない）

    4と5は**同じ足の表と裏**ではない。4を外すとにじみが残り、5を外すと
    丸ごと消える。どちらも当てる。9も同じで、**「見つかる」だけでは足りない。
    見つけてはいけない絵で見つけないこと**まで見る。

    **足を1本ずつ抜いて、そのたびに落ちることまで見た**（`BREAK=`）:

    | | 外れる対照 |
    | --- | --- |
    | `BREAK=thresh` ふちから広げず、全体のしきい値 | 3・10・15・17 |
    | `BREAK=nowash` 紙のふちの写り込みを広げない | 5・12・14・17 |
    | `BREAK=noblob` いちばん大きい塊を残さない | 7・9・10 |
    | `BREAK=nocheck` 市松を見つけない | 18・21 |
    | `BREAK=nocheck+nowash` きのうまでの作り | 5・12・14・17・18・21・24・25 |
    | `BREAK=noshare` 写り込んだボタンを消さない | 27・30 |
    | `BREAK=nocard` 板をしきい値で取る | 37 |
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

    # --- 写し3（`plane` の形）: 市松の地・黄色い丸・**白いふち** ---------------
    cw = ch = 96
    c = Image.new("RGB", (cw, ch))
    pc = c.load()
    for y in range(ch):
        for x in range(cw):
            v = 194 if ((x // 8) + (y // 8)) % 2 == 0 else 136
            pc[x, y] = (v, v, v)
    disc(pc, 48, 48, 30, (252, 252, 252))         # 切り抜きステッカーの白いふち
    disc(pc, 48, 48, 24, (250, 210, 30))          # 中の絵（黄色）

    chk = find_checker(c)
    if chk is None:
        print("対照18 外れ: 市松を見つけられなかった")
        ok = False
    elif not (abs(chk.lo - 136) <= 4 and abs(chk.hi - 194) <= 4 and chk.cell == 8):
        print(f"対照19 外れ: 市松の読みが {chk}（lo=136 hi=194 cell=8 のはず）")
        ok = False
    if find_checker(a) is not None:
        print("対照20 外れ: 白い紙に置いただけの絵を「市松」と読んだ（前からの5枚が変わる）")
        ok = False

    bgc = flood_bg(c, chk)
    if not bgc[0]:
        print("対照21 外れ: 市松の地が抜けていない")
        ok = False
    if bgc[48 * cw + 48]:
        print("対照22 外れ: 中の絵まで抜けた")
        ok = False
    if bgc[48 * cw + 20]:
        print("対照23 外れ: **白いふちが抜けた**（市松の絵では、白は地ではない）")
        ok = False
    got3 = cut(c, SPECS[-1])
    if not corners_clear(got3):
        print("対照24 外れ: 切ったあとの四隅が抜けていない")
        ok = False
    left, total = grid_pixels(got3)
    if left:
        print(f"対照25 外れ: 抜いたあとの絵に格子が {left}画素のこった（{total}画素中）")
        ok = False
    raw, _ = grid_pixels(c.convert("RGBA"))
    if raw < 1000:
        print(f"対照26 外れ: 元の絵の格子を {raw}画素しか見つけられない（見張りが効かない）")
        ok = False

    # --- 写し4（`sign` の形）: 黄色い板に、**写り込んだ丸いボタン** -----------
    sw = sh = 160
    e = Image.new("RGB", (sw, sh), (245, 221, 5))
    pe = e.load()
    disc(pe, 100, 100, 30, (255, 248, 115))       # ボタンの丸地
    for y in range(86, 115):                      # 中の矢印（穴）
        for x in range(96, 105):
            pe[x, y] = (20, 16, 5)
    for y in range(28, 53):                       # 雲（淡いが**丸くない**）
        for x in range(20, 61):
            if ((x - 40) / 20) ** 2 + ((y - 40) / 12) ** 2 <= 1:
                pe[x, y] = (255, 255, 250)
    for y in range(38, 43):
        for x in range(38, 43):
            pe[x, y] = (30, 30, 30)               # 雲の中にも穴を開ける
    disc(pe, 40, 130, 16, (255, 252, 240))        # 淡い丸だが、**中に印がない**

    keep_e = bytearray(b"\x01" * (sw * sh))
    share = find_share(e, keep_e)
    if not share[100 * sw + 100]:
        print("対照27 外れ: 写り込んだボタンを見つけられなかった")
        ok = False
    if share[40 * sw + 40]:
        print("対照28 外れ: 雲まで消した（丸くないのに）")
        ok = False
    if share[130 * sw + 40]:
        print("対照29 外れ: 中に印のない淡い丸まで消した")
        ok = False
    done = patch(e, share)
    px = done.getpixel((100, 100))
    if abs(px[0] - 245) > 12 or abs(px[1] - 221) > 12 or abs(px[2] - 5) > 12:
        print(f"対照30 外れ: 消したあとが板の色になっていない {px}")
        ok = False
    if min(done.getpixel((40, 32))) < 200:
        print("対照31 外れ: 雲が消えた")
        ok = False

    # --- 写し5（`noreturn` の形）: 色で分かれない板を、かたちで切る -----------
    kw = kh = 160
    k = Image.new("RGB", (kw, kh), (252, 252, 252))
    pk = k.load()
    # **紙のほうが場所で沈む**（撮ったときの光）。`noreturn.jpg` の実測で、
    # 右上の紙は 240 まで落ちていて、板（247）より暗い。
    # しきい値で切ると、暗いほうの紙が板として残る
    for y in range(kh):
        for x in range(kw):
            if x >= 144 or y >= 144:
                pk[x, y] = (243, 243, 243)
    for y in range(16, 144):                      # 生成りの板（紙との差は 5階調）
        for x in range(16, 144):
            pk[x, y] = (247, 247, 247)
    for y in range(16, 144):                      # 板のふち（淡い影）
        for x in (16, 143):
            pk[x, y] = (241, 241, 241)
            pk[y, x] = (241, 241, 241)
    for y in range(30, 130):                      # 中の黒い枠
        for x in range(30, 130):
            if not (32 < x < 127 and 32 < y < 127):
                pk[x, y] = (20, 20, 20)

    m = card_margin(k, frame_inside(k), talk=False)
    if abs(m - 14) > 3:
        print(f"対照32 外れ: 板の余白を {m}px と読んだ（14px のはず）")
        ok = False
    keep_k = card_keep(k, talk=False)
    if not keep_k[80 * kw + 80]:
        print("対照33 外れ: 板の中が落ちた")
        ok = False
    if not keep_k[80 * kw + 20]:
        print("対照34 外れ: 枠の外の板（生成りの余白）が落ちた")
        ok = False
    if keep_k[80 * kw + 4]:
        print("対照35 外れ: 板の外の紙まで取った（色では分かれないのに取れた＝しきい値で見ている）")
        ok = False
    if keep_k[2 * kw + 2]:
        print("対照36 外れ: 紙の隅まで取った")
        ok = False
    if keep_k[80 * kw + 155] or keep_k[155 * kw + 80]:
        print("対照37 外れ: **沈んだ紙**まで取った（板より暗い紙を、板と読んでいる）")
        ok = False

    return ok


def bake(spec: Spec) -> int:
    src = SRC / f"{spec.id}.{spec.ext}"
    if not src.exists():
        print(f"  NG  元の絵が無い: {src.relative_to(REPO)}")
        return 1
    im = Image.open(src)
    out = crop(im.convert("RGBA")) if spec.mode == "keep" else cut(im, spec, talk=True)

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


def grey(dst: Path, want: list[str] | None = None, side: int = 400) -> int:
    """抜いた絵を**灰色の上に並べて**1枚にする。**人が見るため。**

    白い紙の上で見ると、**抜けていない白が見えない。** 数（四隅・割合）が
    通っていても、絵は自分の目で見る（`docs/island-standards.md` 1章）。

    枚数が増えたので**5枚で折り返す。** 1枚だけ渡せば等倍に近い大きさで出る。
    """
    specs = [s for s in SPECS if not want or s.id in want]
    if not specs:
        print(f"そんな名前は無い: {want}")
        return 2
    pad = 16
    cols = min(5, len(specs))
    rows = (len(specs) + cols - 1) // cols
    canvas = Image.new(
        "RGB",
        (side * cols + pad * (cols + 1), (side + pad) * rows + pad),
        (122, 122, 128),
    )
    for k, spec in enumerate(specs):
        png = OUT / f"{spec.id}.png"
        if not png.exists():
            print(f"  まだ焼かれていない: {png}")
            return 2
        im = Image.open(png).convert("RGBA")
        r = side / max(im.size)
        im = im.resize((max(1, round(im.width * r)), max(1, round(im.height * r))), Image.LANCZOS)
        cx, cy = k % cols, k // cols
        canvas.paste(
            im,
            (pad + cx * (side + pad) + (side - im.width) // 2,
             pad + cy * (side + pad) + (side - im.height) // 2),
            im,
        )
    dst.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dst)
    print(f"灰色の上に並べた: {dst}（{len(specs)}枚）")
    return 0


def audit() -> int:
    """**焼いた絵に、市松と写り込みが残っていないか。**

    見張り（`site/selftest/sticker_selftest.mjs`）から呼ばれる。
    0＝残っていない / 1＝残っていた / 2＝数えるものが無い。
    """
    miss, bad, seen = [], 0, 0
    for spec in SPECS:
        for ext in ("png", "webp"):
            f = OUT / f"{spec.id}.{ext}"
            if not f.exists():
                miss.append(str(f))
                continue
            im = Image.open(f)
            hit, total = grid_pixels(im)
            seen += 1
            why = []
            if hit:
                why.append(f"市松が {hit}画素")
            if spec.share:
                rgba = im.convert("RGBA")
                w, h = rgba.size
                a = rgba.getchannel("A").tobytes()
                keep = bytearray(1 if v >= 128 else 0 for v in a)
                left = sum(find_share(rgba.convert("RGB"), keep))
                if left:
                    why.append(f"写り込んだ丸が {left}画素")
            bad += 1 if why else 0
            print(f"  {'NG ' if why else 'ok '} {spec.id}.{ext:4s} 見た {total}画素"
                  + (f"  ※ {' / '.join(why)}" if why else ""))
    if miss:
        print(f"焼かれていない絵が {len(miss)}枚: {', '.join(miss[:4])}")
        return 2
    if not seen:
        print("数えるものが無い")
        return 2
    print(f"\n見た {seen}枚 / 残っていた {bad}枚")
    return 1 if bad else 0


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
    print("# 対照37 通った（地・生成り・白い字・写り込み2通り・塊2通り・四隅・割合・白ふち"
          " / 市松・白いふち・ボタン3通り・板のかたち）")
    if "--drill" in argv:
        return 0
    if "--check" in argv:
        return check()
    if "--audit" in argv:
        return audit()
    want = [a for a in argv if not a.startswith("--")]
    if "--grey" in argv:
        dst = Path(want[0]) if want else Path("/tmp/stickers-grey.png")
        ids = want[1:]
        return grey(dst, ids, 900 if len(ids) == 1 else 400)
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
