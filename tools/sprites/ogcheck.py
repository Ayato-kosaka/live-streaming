"""共有画像（`site/public/og.png`）が、**ちゃんと島に見えるか**を画素で言う。

撮る道具（`tools/sprites/og.mjs`）は「撮れた／撮れない」しか言えない。
本番に配られた og.png は、撮れてはいたが**島の12人が全員おなじ顔**で、
**1年前に居た街の名前**が焼いてあった。撮れたことは、出せることではない。

ここで見るのは、**目で見なくても嘘と分かるところ**だけ。

  1. 1200×630 か（共有カードの枠）
  2. 水が写っているか（青とはかぎらない。内陸の島は湖の翡翠）
  3. 陸が写っているか（緑）。しかも**枠のまん中を通る大きさ**で
  4. 1色で塗りつぶされていないか（真っ白・真っ青で落ちる）
  5. 色の種類（描かれていない絵は数種類しか持たない）
  6. **1枚に割れ目が無いか** — 上から下までまっすぐ色が変わる縦の線。
     1〜5 はどれも**割合**なので、「同じ割合のまま、絵が2枚に割れている」を
     1つも拾えない。実際それで、右 8% がページの地のまま何週間も配られていた
     （`docs/island-misses.md` #226）

**板（島の名前・帯）がそこに在るかは、ここでは見ない。** 浜の砂と紙は
ほとんど同じ色で、画素では分けられない（砂だけの絵が「板 3.2%」と出た）。
在るかどうかは撮るときにしか確かめられないので、`og.mjs` が要素の箱で見る。

**顔が本物かどうかはここでは見ない。** あれは撮るときにしか分からないので、
`og.mjs` が `route.mjs` の数え（本物/頼み）で止める。

  python3 tools/sprites/ogcheck.py /tmp/og-new.png

**終了コード**: 0＝通った / 1＝見つかった / 2＝数えるものが無い（対照が落ちた・
絵が開けない）。`| tail` を挟むと終了コードが消える。

## 対照

本物の絵を測る前に、**こちらで作った14枚**を当てる。落ちる側（真っ白・真っ青・
真っ緑・のっぺりした2色・小さすぎる陸・水の無い草原・**縦のつなぎ目**）と、
通る側（島のかたちをした1枚と、**水が翡翠の1枚**）の**両方**を持つ。片側だけだと、判定が
ゆるみすぎても締まりすぎても気づけない（`docs/island-standards.md` §15）。
`BREAK=` で判定の足を1本ずつ折れる。

**通る側を1枚しか持っていなかったのが 2026-10-11 の穴だった。** その1枚は
青い海の島で、島の色が翡翠に持ち替わった晩に本番だけが落ちた。
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

# 左右のふちと呼ぶ幅。島は上下を切って撮るので、水が必ず残るのはここ
RIM = 24

# つなぎ目を探すときに縮める大きさ。**縮めてから見る**のは、画素の散らばりを
# 均して「まっすぐな線」だけを残すため（対照の絵は3px升で色を散らしてあるので、
# 原寸で隣の列と比べると、どの列でも6〜7割の行が動いてしまう）
SEAM_W, SEAM_H = 300, 158
# その線を「色が変わった」と呼ぶ差（L1）
SEAM_STEP = 60

# --- 合格の線。**どれも「1枚の絵として見たときに当たり前のこと」だけ** ---
#
# ## 線の根拠（2026-10-03 に、git に残る og.png 14枚を測り直した）
#
# | 撮った日 | 海 | 陸 |
# | --- | --- | --- |
# | 2026-09-04（作り直す前の下絵） | 72.4% | 9.0% |
# | 2026-09-17〜09-26（毎晩10枚。北欧の章） | **50.3〜50.4%** | **24.3〜24.9%** |
# | 2026-10-03（アルバニアの章。置き方を直したあと） | 53.1% | 23.6% |
# | 2026-10-12（北マケドニアの章。水を数え直したあと） | 49.2% | 25.0% |
#
# **いちばん下の行は、線を動かして入れたものではない。** 水が翡翠になった晩に
# 9.1% / 62.3% と出ていたのは `kind()` が水を陸と読んでいたからで、
# 読み分けを直したら同じ絵が 49.2% / 25.0%＝**上の帯のまんなか**に戻った。
#
# その読み分けを入れたあとで、git に残る og.png を測り直した（2026-10-12）。
# 北欧の10枚は 50.3 → **51.1%**、アルバニアの1枚は 48.6 → **56.7%**
# （浜ぎわの水色が「それ以外」から水に移ったぶん。アルバニアの水は
# ターコイズで、浜ぎわがとくに広い）。**どれも 12〜68% の内側に居る。**
# 上の線（68%）までは 11ポイントあり、そちらへ寄るのは島が小さく写ったとき
# だけで、それは撮る前に `ogframe.mjs` が止める。
#
# **10枚が 0.1ポイントの幅に収まっている。** 線はその帯からも、落ちる側
# （72.4% / 9.0%）からも離れている。**満たしようのない線ではない**——
# 9/29 から5日赤かったのは置き方のほうで、直したら 53.1% / 23.6% で通った
# （`docs/island-misses.md` #196）。**線を動かして通したのではない。**
SEA_MIN = 0.12      # 海がこれ未満なら、島が海に浮いて見えない
SEA_MAX = 0.68      # 海がこれを超えたら、**島より海を配っている**（直す前の下絵が 72%）
LAND_MIN = 0.16     # 陸がこれ未満なら、島が写っていない
ONE_COLOR_MAX = 0.55  # 1色がこれを超えたら、のっぺり（真っ白・真っ青）
BINS_MIN = 40       # 色の種類（16段に丸めた粗さで）
LAND_W_MIN = 0.22   # 陸の横幅（枠の幅に対して）
LAND_H_MIN = 0.55   # 陸の縦幅。上下を切って撮るので、枠の半分以上は埋まる

# **上から下までまっすぐ色が変わる線**（つなぎ目）。これを超えたら落ちる。
#
# ## なぜ要るか（2026-10-12）
#
# 上の線はどれも**割合**しか見ていない。割合は、**同じ割合のまま壊れている形**を
# 拾えない。実際、撮った絵の右 8% が島の水ではなくページの地（濃い青）で、
# そこに上から下まで1本のまっすぐな切り口が入っていた。青もまた「海」なので、
# 海の割合は 49.2% と健全に見え、**見張りは素通りした。**
# 見えるようになったのは島の水が翡翠に変わった日で、**傷そのものはそれ以前から
# ずっとあった**（1つ前の絵も右はしは同じ青。画素を突き合わせた）。
#
# ## 線の根拠（git に残る og.png 8枚＋対照13枚を測った）
#
# | | いちばんまっすぐな線 |
# | --- | --- |
# | つなぎ目のある絵（2026-10-12 に配っていた1枚） | **100%** |
# | 直したあとの同じ絵 | 33% |
# | それ以前の og.png 7枚（北欧・アルバニア） | 38〜49% |
# | 対照13枚（島のかたち・真っ白・のっぺり…） | 0〜52% |
#
# **つなぎ目だけが 100% で、残りは全部 52% 以下。** 線はそのまんなかに置く。
# 島の浜は曲がっているので、どれだけ長くても全部の行では切り替わらない。
SEAM_MAX = 0.80


def kind(r: int, g: int, b: int) -> str:
    """その画素が、海・陸・紙・それ以外のどれか。**色相ではなく差で見る。**

    ここで言う「海」は**島をかこむ水**のこと。内陸の島では湖なので、
    青いともかぎらない（下）。札の名前だけは、しきい値（`SEA_MIN`）や
    落ちたときの字とそろえて `sea` のままにしてある。

    島の色は時間帯で沈むので、絶対値で切ると夜の絵が全部「それ以外」になる。

    ## 水は青とはかぎらない（2026-10-12）

    ここは長いあいだ「**青い**（b が g より上）」だけを水として数えていた。
    2026-10-11 15:00 UTC に表紙の章が北マケドニアへ移って、島の色が
    `lakeland` になった晩から、**水がまるごと「陸」に化けた**。
    あの国は海に出ないので、島をかこむ水は青ではなく湖の翡翠で置いてある
    （`app/css/tokens.css` の `[data-theme="lakeland"]`。
    `--sea-deep: #0f9068` ＝ 15,144,104 は g のほうが b より上）。
    実測で **海 9.1% / 陸 62.3%**——ふだんの 50% / 25% がそっくり入れ替わり、
    毎晩の撮り直しが「海が 12% 未満」で落ち続けた。
    **絵は正しくて、数えかたが片方の色しか知らなかった。**

    だから水は2本で見る。

    1. **青い水** — b が g より上（外洋。ここは1文字も変えていない）
    2. **翡翠の水** — g のほうが上だが、b が r から大きく離れていて、
       黄へ寄っていないもの

    草と分かれるのは **b と r の開き**。草は黄へ回してあるので b が r より
    **下**（湖の島の草は 74,127,42 で -32、いちばん水に近い nordic の日陰の草
    88,155,116 でも +28）。翡翠の水は +53〜+100 ある（浜に近い
    `--sea-shelf` が +53、沖の `--sea-deep` が +89）。だから境は +48 に置く。
    `g < b + 60` は黄への寄りの止め——これが無いと、青みがかった草まで
    水になる。
    """
    if b > r + 24 and b > g + 6:
        return "sea"
    if b > r + 48 and g < b + 60:
        return "sea"
    if g > r + 10 and g > b + 14:
        return "land"
    if r > 190 and g > 170 and b > 120 and r > b + 28:
        return "paper"
    return "other"


# 画面に出すときの呼びかた。`kind()` の返す札を日本語にするだけ。
# **落ちたときの字（「海が 9.1%」）と同じ言葉を使う**——ここだけ「水」と
# 呼ぶと、読む人が2つの数を結びつけられない
NAME = {"sea": "海", "land": "陸", "paper": "紙", "other": "それ以外"}


def seam_scan(im: Image.Image) -> dict:
    """**上から下までまっすぐ色が変わる縦の線**を1本だけ探して、その強さを返す。

    返すのは「いちばんまっすぐな線で、何割の行が切り替わったか」（`seam`）と、
    その場所（`seam_x`、原寸の x）と、その左右の色（`seam_lr`）。

    ## なぜ割合ではなくこれを見るのか

    海の割合も陸の割合も健全なまま、**絵が2枚に割れている**ことがある。
    撮るとき島の層を左右にずらすので、ずらしたぶんだけ枠のへりに島の外が
    出る（`og.mjs` の注）。出たところはページの地で、**そこも「海」に
    数えられる**ので、割合では1つも動かない。動くのは**形**のほうだけ。

    ## なぜ縮めてから見るのか

    原寸で隣の列と比べると、対照の絵（3px升で色を散らしてある）や本物の
    草むらで、どの列でも6〜7割の行が動く＝つなぎ目と見分けがつかない。
    面で平均してから（`Image.BOX`）見ると、散らばりは均されて、
    **段になっているところだけが残る。**
    """
    s = im.convert("RGB").resize((SEAM_W, SEAM_H), Image.BOX)
    px = s.load()
    best = (0.0, None, None, None)
    for x in range(SEAM_W - 1):
        hit = 0
        for y in range(SEAM_H):
            a = px[x, y]
            b = px[x + 1, y]
            if abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2]) > SEAM_STEP:
                hit += 1
        f = hit / SEAM_H
        if f > best[0]:
            best = (f, x, px[x, SEAM_H // 2], px[x + 1, SEAM_H // 2])
    f, x, left, right = best
    return {
        "seam": f,
        # 原寸での場所。縮めた1列が原寸の何pxにあたるかを戻す
        "seam_x": None if x is None else round((x + 1) * im.size[0] / SEAM_W),
        "seam_lr": None if left is None else (left, right),
    }


def measure(im: Image.Image) -> dict:
    """1枚ぶんの数。**割合だけでなく、何点見たかも返す。**"""
    px = im.convert("RGB").load()
    w, h = im.size
    seen = 0
    tally = {"sea": 0, "land": 0, "paper": 0, "other": 0}
    bins: dict[tuple, int] = {}
    xs: list[int] = []
    ys: list[int] = []
    # **左右のふち（外から RIM px）だけ、別に数えておく。**
    # 島は枠のまんなかに置き、上下は切って撮るので、**水が必ず残るのは左右。**
    # 「海が足りない」で落ちたとき、**島が大きすぎるのか、水の色を
    # 読めていないのか**は数字だけでは分かれない。ふちでいちばん多い色と、
    # それを何と読んだかを出せば、1行で分かれる（2026-10-12）
    rim: dict[tuple, int] = {}
    rim_tally = {"sea": 0, "land": 0, "paper": 0, "other": 0}
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
            if x < RIM or x >= w - RIM:
                rim[(r, g, b)] = rim.get((r, g, b), 0) + 1
                rim_tally[k] += 1
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
    rim_seen = sum(rim_tally.values()) or 1
    rim_top = max(rim.items(), key=lambda kv: kv[1]) if rim else None
    seam = seam_scan(im)
    return {
        "seen": seen,
        "size": (w, h),
        "sea": tally["sea"] / seen,
        "land": tally["land"] / seen,
        "paper": tally["paper"] / seen,
        "bins": len(bins),
        "one": top,
        "box": box,
        "rim": rim_top[0] if rim_top else None,
        "rim_share": (rim_top[1] / rim_seen) if rim_top else 0.0,
        "rim_kind": kind(*rim_top[0]) if rim_top else "",
        **seam,
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
    if m["seam"] > SEAM_MAX and "seam" not in breaks:
        lr = m["seam_lr"]
        where = f"x={m['seam_x']}"
        colors = ""
        if lr:
            colors = (
                f"。左 #{lr[0][0]:02x}{lr[0][1]:02x}{lr[0][2]:02x} /"
                f" 右 #{lr[1][0]:02x}{lr[1][1]:02x}{lr[1][2]:02x}"
            )
        bad.append(
            f"{where} に、上から下まで色が変わるまっすぐな線があります"
            f"（{m['seam']:.0%} の行で切り替わり。{SEAM_MAX:.0%} 超）{colors}"
        )
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
    # **3×3 の升ごとに1色**（`x // 3` と `y // 3` でしか変わらない）なので、
    # 升のぶんだけ塗って最後に3倍に伸ばす。画素は1つも変わらないが、
    # 回す数が9分の1になる（対照13枚を当てるのに 15.9秒 → 3.2秒。
    # 2枚足す前の11枚でも 9.9秒かかっていたので、足しても速くなっている）
    bw, bh = (w + 2) // 3, (h + 2) // 3
    small = Image.new("RGB", (bw, bh))
    sp = small.load()
    for by in range(bh):
        for bx in range(bw):
            i = bx * 7 + by * 11
            sp[bx, by] = (
                min(255, max(0, base[0] + (i * 13) % 56 - 24)),
                min(255, max(0, base[1] + (i * 29) % 72 - 30)),
                min(255, max(0, base[2] + (i * 37) % 64 - 28)),
            )
    return small.resize((bw * 3, bh * 3), Image.NEAREST).crop((0, 0, w, h))


def fake_flat(color) -> Image.Image:
    return Image.new("RGB", (W, H), color)


def plates(d: ImageDraw.ImageDraw) -> None:
    """島の名前の板と、旅のしるべの板。"""
    d.rounded_rectangle([24, 24, 372, 190], 18, fill=(246, 231, 186), outline=(120, 80, 40), width=4)
    d.rounded_rectangle([860, 500, 1176, 600], 16, fill=(246, 231, 186), outline=(120, 80, 40), width=4)


def fake_island(
    *,
    land_w=470,
    cx=W // 2,
    with_plates=True,
    sea=(30, 130, 190),
    sand=(232, 216, 150),
    grass=(96, 186, 92),
) -> Image.Image:
    """島のかたちをした1枚。**通る側の対照。**

    実物ではないので、判定が「本物の写真でしか通らない」ほど締まっていたら、
    ここが落ちて気づける。

    **水と草の色を渡せるようにしてある。** 島の色は章で持ち替わるので
    （`app/css/tokens.css` の `[data-theme]`）、青い海の1枚だけを当てていると
    「青くない水の島」を1枚も見ないまま通る。実際それで5晩落ちた。
    """
    # 水は**すみずみまで**散らす。点を散らすだけだと隙間の地の色がいちばん多い色に
    # なり、のっぺりの足が別の対照まで捕まえてしまう（実測 56.8%）
    im = wash((W, H), sea)
    d = ImageDraw.Draw(im)
    d.ellipse([cx - land_w // 2, -40, cx + land_w // 2, 660], fill=sand)
    d.ellipse([cx - land_w // 2 + 18, -20, cx + land_w // 2 - 18, 630], fill=grass)
    noise(d, (cx - land_w // 2 + 30, 10, cx + land_w // 2 - 30, 600),
          tuple(max(0, c - 6) for c in grass), 500)
    if with_plates:
        plates(d)
    return im


def fake_jade_island() -> Image.Image:
    """**水が青ではなく翡翠の島。通る側の対照。**

    色は本物から取ってある——水は `lakeland` の `--sea-deep`（#0f9068）、
    草は同じ島の `--grass`（#4a7f2a）、浜はテラロッサ（#c79a86）。
    いまの判定でこの1枚を当てると **海 2.3%** で落ちる。
    2026-10-11 の晩に本物が落ちたのと同じ落ち方で、
    **この対照を持っていれば、本番の前に気づけた。**
    """
    return fake_island(sea=(15, 144, 104), grass=(74, 127, 42), sand=(199, 154, 134))


def fake_seam_island() -> Image.Image:
    """**島は写っているが、右はしに縦のつなぎ目がある。** つなぎ目の足だけが捕まえる。

    2026-10-12 に本番で配っていた1枚と同じ壊れ方——島の層が左へずれたぶん
    （101px）だけ、枠の右がページの地（`--ground-board` の濃い青）になる。
    **海の割合は増えこそすれ減らない**ので、割合を見る足は1つも反応しない。
    """
    im = fake_jade_island()
    d = ImageDraw.Draw(im)
    # ページの地は上から下へ明るくなる縦のグラデーション。1枚の帯で写し取る
    for y in range(H):
        t = y / H
        d.line(
            [(W - 101, y), (W, y)],
            fill=(11 + round(23 * t), 126 + round(27 * t), 211 + round(19 * t)),
        )
    return im


def fake_lake_grass_only() -> Image.Image:
    """**翡翠の島の草だけ**で、水が1画素も写っていない。水の足だけが捕まえる。

    `fake_no_sea` の相棒。あちらは明るい黄緑なので、水の読み分けを
    ゆるめても落ちたままになる。**翡翠の水といちばん紛らわしい緑**
    （湖の島の草 #4a7f2a）で、もう一度おなじことを聞く。
    """
    im = wash((W, H), (74, 127, 42))
    plates(ImageDraw.Draw(im))
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
        ("翡翠の島の草だけ（水が無い）", fake_lake_grass_only(), False),
        ("右はしに縦のつなぎ目", fake_seam_island(), False),
        ("島のかたち", fake_island(), True),
        ("島のかたち（水が翡翠）", fake_jade_island(), True),
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
    if m["rim"]:
        r, g, b = m["rim"]
        # **「海が足りない」で落ちた晩に、まずここを読む。**
        # ふちが水の色なのに「陸」と出ていたら、島が大きすぎるのではなく
        # `kind()` がその色を知らない（2026-10-11 の晩がそれだった）。
        # 本当に島が大きすぎる晩は、ここに草の色が「陸」と出る
        print(
            f"  左右のふちの色 #{r:02x}{g:02x}{b:02x}（外から {RIM}px のうち {m['rim_share']:.0%}）"
            f" → 「{NAME.get(m['rim_kind'], m['rim_kind'])}」と読みました"
        )
    if m["seam_lr"]:
        lr = m["seam_lr"]
        # **ここは落ちていなくても出す。** つなぎ目は「在る / 無い」ではなく
        # 「どれだけまっすぐか」で、ふだんの絵がいくつなのかを知らないと、
        # 次にこの行が 100% になった晩に大きい数なのか分からない
        print(
            f"  いちばんまっすぐな縦の線 {m['seam']:.0%}（x={m['seam_x']} / "
            f"左 #{lr[0][0]:02x}{lr[0][1]:02x}{lr[0][2]:02x} 右 #{lr[1][0]:02x}{lr[1][1]:02x}{lr[1][2]:02x}）"
        )
    bad = judge(m, breaks)
    for line in bad:
        print(f"::error::{line}")
    print("島が写っています" if not bad else f"{len(bad)}件 見つかりました")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
