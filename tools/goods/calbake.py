"""SUZURI の**卓上カレンダー**の試作を、3つの型 × 2枚 = 6枚焼く。

    python3 tools/goods/calbake.py --fetch   # 元の絵を落とす（網が要る）
    python3 tools/goods/calbake.py --drill   # 対照だけ回して帰る
    python3 tools/goods/calbake.py           # 対照 → 焼く

## 何を比べてもらう道具か

あやとの言葉（2026-10-10）:

> カレンダー、何パターンか試作してみて みんなの反応見てみようか
> ・添付画像みたいなイラストが良いのか
> ・あやと島カードしてるみたいな海外の風景が良いのか
> ・配信のアーカイブのスクショが良いのか

選んでもらうのは「**イラストか、風景か、スクショか**」の1点だけ。だから
**枠（日付の置き方・字の大きさ・余白・色）は3つとも1つの関数から描く。**
型ごとに枠が違うと、何を選んだのか分からなくなる。
差し替わるのは**左の絵だけ**で、そこは `SOURCES` の表1つにまとめてある。

いいねで反応を見る仕掛けは別の担当。ここは絵を焼くところまで。

## 値段も寸法も、絵の中に書かない

`docs/island-standards.md` 16章。他所の値段を島の面に焼くと、向こうが
変えた日から嘘になる。SUZURI の用紙（**178mm × 127mm**）は、
**絵の形（890×635px＝5px/mm）を決めるためだけ**に使う。

## 枠はブラウザで描かない

字は丸ゴシック（`site/public/fonts/maru-*.woff2`。Zen Maru Gothic）で、
PIL がそのまま読める。ブラウザを起こすと、**同じ枠を3回描くたびに
1画素ずれる余地**ができる（字詰め・端数・描画の版）。ここは PIL で
1回だけ組んで、**同じ画素を3回貼る**——そうすれば「枠が同じ」は
確かめるまでもなく、作りから出てくる。

ブラウザが要るのは島を撮るときだけで、そちらは `tools/goods/calisle.mjs`
に分けてある。撮った絵は `cal-src/` に残るので、焼き直しは網もブラウザも
要らない。

## 置き場

| | どこ |
| --- | --- |
| 元の絵（**配らない**） | `tools/goods/cal-src/<型>-<01|02>.(png/jpg)` |
| 焼いたもの（**配るのはこちら**） | `site/public/goods/calendar/<型>-<01|02>.webp` |

`-01` が **2027年1月**、`-02` が **2027年7月**。型の名前（`illust` /
`scene` / `archive`）は**変えない**——別の担当がこの名前で面に並べる。

## 対照（`--drill`）

0＝通った / 1＝見つかった / 2＝数えるものが無い。

足は3本あって、**`BREAK=` で1本ずつ折れる**（折ると 1 で落ちる）。

| `BREAK=` | 何を壊すか | どの判定が拾うか |
| --- | --- | --- |
| `shift` | 曜日の表を1日ずらす | `grid_faults` が**日付から曜日を引き直して**突き合わせる |
| `aspect` | 出す絵の縦横比を変える | `box_faults` が縦と横の縮尺を比べる |
| `skip` | 型を1つ焼かずに済ませる | `sheet_faults` が6枚そろっているかを数える |

**判定は、作ったものを読み直して出す。** 曜日は `datetime` で1日ずつ
引き直すので、表を作った側の式が間違っていても気づける（表を作った式を
もう一度回すだけの対照は、何を壊しても通る）。

## 字の濃さは、焼いた画素から測る

宣言した色ではなく、**焼いた webp を読み直して**測る
（`CLAUDE.md`「文字の濃さ」）。同じ枠を**字あり／字なし**で2枚焼いて、
動いた画素を字の画素とみなす。地は字なしのほうの同じ画素なので、
**紙の粒で地が場所ごとに違っても、その字が乗っている地そのもの**で割れる。
合否は**中央値**で決める（下位10%はにじみの画素を測ることになる）。
"""

from __future__ import annotations

import datetime
import io
import os
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent          # tools/goods/
REPO = HERE.parent.parent

SRC = HERE / "cal-src"
OUT = REPO / "site" / "public" / "goods" / "calendar"
FONTS = REPO / "site" / "public" / "fonts"

#: 刷られる1ページ。SUZURI の卓上カレンダーの用紙は 178mm × 127mm なので、
#: **5px/mm** で置いた。横長。ここを変えたら `calisle.mjs` の `ASPECT` も変える。
PAGE_W, PAGE_H = 890, 635
#: 左の欄（タテの絵）。素材がどれもタテ長なので、断ち切りで高さいっぱいに置く。
PHOTO_W, PHOTO_H = 476, 635
#: 右の欄（日付の表）の左端と幅。
PANEL_X, PANEL_W = PHOTO_W, PAGE_W - PHOTO_W

#: 焼くのは2027年。**表紙なし・1月はじまりの12ページ**のうちの2枚ぶん。
YEAR = 2027
#: 面の番号 → 月。**3つの型とも同じ2つの月**（月を変えると比べられない）。
PAGES = {"01": 1, "02": 7}

#: 1枚の上限（バイト）。配る絵なので、ここを越えたら質を下げるのではなく
#: **越えたことを言って落ちる**——黙って型ごとに質を変えると、枠の画素が揃わなくなる。
MAX_BYTES = 120_000
#: webp の質。**6枚とも同じ値で焼く。** 1枚ごとに変えると枠が画素で揃わない。
#:
#: 82 から 94 まで当てて決めた（いちばん重い `scene-02` の重さ ／
#: 7月の枠で差が 16 を超えた画素）:
#:
#:     82 → 92,222B / 5,897画素    86 → 106,128B / 41画素
#:     90 → 126,330B / 3画素       94 → 158,134B / 0画素
#:
#: 90 以上は 1枚 120,000B を越える。**枠が揃うほうと、重さの上限の、
#: 両方が立つのは 86 だけ。**
QUALITY = 86

#: 字と地の比。これを割ったら落ちる（`docs/island-standards.md` の出す前のチェック）。
MIN_CONTRAST = 4.5

# --- 色。島のもの（`site/app/css/tokens.css`）---------------------------------
INK = (0x5b, 0x3f, 0x15)        # --ink
INK_2 = (0x72, 0x52, 0x1b)      # --ink-2
SUN_INK = (0xa8, 0x11, 0x39)    # --accent-ink（日曜）
SEA_INK = (0x00, 0x5f, 0x80)    # --accent-2（土曜）
PAPER_TOP = (0xfb, 0xf7, 0xe3)  # --ground-paper のいちばん明るいところ
PAPER_BOTTOM = (0xef, 0xe9, 0xc6)
RULE = (0xd8, 0xc9, 0x8f)
FRAME = (0xf2, 0xb0, 0x54)      # --frame
FRAME_DARK = (0xce, 0x83, 0x27)  # --frame-dark
MOTTLE = (0x7e, 0x6c, 0x2c)     # 紙の粒（--ground-paper の点と同じ色）

#: 日曜はじまり。SUZURI の卓上カレンダーは日本向けなので、日曜を左に置く。
WEEK = ("日", "月", "火", "水", "木", "金", "土")
WEEK_INK = (SUN_INK, INK, INK, INK, INK, INK, SEA_INK)

# --- 左の絵。**ここだけが型ごとに違う** --------------------------------------
#: `box` は元の絵から切り取るところ（左・上・右・下）。`None` なら中央で
#: 枠の縦横比に合わせて切る。**縦と横の縮尺が揃っていないと対照が落ちる。**
SOURCES = {
    # 島の背景は `calisle.mjs` が撮る（看板も帯も住人も、島のあやとも外してある）。
    # 主役は `over` で**ここで**大きく立てる。
    ("illust", "01"): dict(
        file="illust-01.png", box=None, url=None,
        over=dict(art="characters/ayato.webp", h=0.44, cx=0.62, feet=0.70),
        note="あやと島の浜と海。桟橋へ下りる道にあやとが立つ",
    ),
    ("illust", "02"): dict(
        file="illust-02.png", box=None, url=None,
        over=dict(art="characters/ayato.webp", h=0.54, cx=0.44, feet=0.88),
        note="あやと島の建物の並び。広場にあやとが立つ",
    ),
    ("scene", "01"): dict(
        file="scene-01.jpg", box=None,
        url=("https://firebasestorage.googleapis.com/v0/b/live-streaming-d3cac.firebasestorage.app"
             "/o/nordic%2Fphotos%2F2026-09-18%2FWKoUtpuAzqR4zwwQ2hXj.jpeg"
             "?alt=media&token=b0053d1f-1b86-401c-b4ca-4176302ef6ce"),
        note="あやと島カードの写真 WKoUtpuAzqR4zwwQ2hXj（2026-09-18 タリン旧市街の屋根）",
    ),
    ("scene", "02"): dict(
        file="scene-02.jpg", box=None,
        url=("https://firebasestorage.googleapis.com/v0/b/live-streaming-d3cac.firebasestorage.app"
             "/o/nordic%2Fphotos%2F2026-09-21%2Fx5h4h6XlyjwJ78Ac4wJj.jpeg"
             "?alt=media&token=e068980c-f7c8-46b7-ae29-7d5a5a68a35c"),
        note="あやと島カードの写真 x5h4h6XlyjwJ78Ac4wJj（2026-09-21 ストックホルムの展望台）",
    ),
    # 配信のコマは 1280×720 の中に 9:16 のタテ配信が入っていて、左右は同じ絵の
    # ぼかし。**ぼかしの帯は切り落とす**（刷ると帯にしか見えない）。
    # タテの中身は 720×9/16 = 405px ぶんで、左端は (1280-405)/2 = 437.5。
    #
    # **縦は上から 540px を取る**（2026-10-10）。PRISM Live の題の帯は**上**に、
    # 「なに食べよの広告費」の目標バーは**下**に出るので、下を落とすと
    # **金額だけが消えて、題は残る**（`docs/island-money.md`。実額を面に出さない）。
    # 1回目は帯ごと落として、ただの顔写真になっていた——あやとが見本に出したのは
    # 帯も題も入ったスクショそのものなので、落とすのは金額のところだけにする。
    ("archive", "01"): dict(
        file="archive-01.jpg", box=(438, 0, 843, 540),
        url="https://i.ytimg.com/vi/M1RvClI7mDg/maxres1.jpg",
        note="2026-01-07『アリロ。ジョージア正教会のクリスマス！！』M1RvClI7mDg"
             "（1月の配信。題の帯つき・金額は枠の外）",
    ),
    ("archive", "02"): dict(
        file="archive-02.jpg", box=(438, 0, 843, 540),
        url="https://i.ytimg.com/vi/SQXQOF1_Qhg/maxres2.jpg",
        note="2026-07-23『ジョージアでイワシの塩焼き作ります！』SQXQOF1_Qhg"
             "（7月の配信。題の帯つき・この枠に金額は無い）",
    ),
}

#: 焼く型。**この順で並べる。** 名前は面に出すので変えない。
KINDS = ("illust", "scene", "archive")

#: 対照のときだけ立てる、壊しかた（`BREAK=shift|aspect|skip`）。
BREAK = os.environ.get("BREAK", "")


# --- 字 ----------------------------------------------------------------------

def font(weight: int, size: int) -> ImageFont.FreeTypeFont:
    """丸ゴシックを1つ。**配っている woff2 をそのまま読む。**

    `maru-<太さ>-0.woff2` は Unicode の先頭の塊で、数字・かな・
    「年月日」と曜日の漢字・ラテン字がぜんぶ入っている（確かめ済み）。
    別の塊を読みに行く必要は無い。
    """
    return ImageFont.truetype(str(FONTS / f"maru-{weight}-0.woff2"), size)


def text(d: ImageDraw.ImageDraw, xy, s: str, f, fill, anchor="la") -> None:
    d.text(xy, s, font=f, fill=fill, anchor=anchor)


# --- 曜日の表 ----------------------------------------------------------------

def days_in(year: int, month: int) -> int:
    """その月の日数。**表を作る式とは別に数える**（対照がここを使う）。"""
    nxt = datetime.date(year + (month == 12), month % 12 + 1, 1)
    return (nxt - datetime.date(year, month, 1)).days


def grid(year: int, month: int) -> list[list[int]]:
    """日曜はじまりの 6×7。空きは 0。

    6行で固定するのは、**月によって表の背が変わらないようにする**ため。
    5行で済む月（2027年7月）は最後の行が空のまま。
    """
    first = datetime.date(year, month, 1)
    lead = (first.weekday() + 1) % 7            # 月曜=0 → 日曜はじまりの列
    if BREAK == "shift":
        lead += 1                               # 対照: 表を1日ずらす
    cells = [0] * lead + list(range(1, days_in(year, month) + 1))
    cells += [0] * (42 - len(cells))
    return [cells[r * 7:(r + 1) * 7] for r in range(6)]


def grid_faults(year: int, month: int, g: list[list[int]]) -> list[str]:
    """表を**読み直して**突き合わせる。

    表を作った式をもう一度回すのではなく、**1日ずつ `datetime` に曜日を聞く。**
    そうしないと、式が間違っていても対照が同じだけ間違って通る。
    """
    out: list[str] = []
    seen: list[int] = []
    for r, row in enumerate(g):
        if len(row) != 7:
            out.append(f"{month}月: {r + 1}行目が {len(row)}列（7列のはず）")
            continue
        for c, day in enumerate(row):
            if not day:
                continue
            seen.append(day)
            col = (datetime.date(year, month, day).weekday() + 1) % 7
            if col != c:
                out.append(
                    f"{year}年{month}月{day}日 は {WEEK[col]}曜なのに "
                    f"{WEEK[c]}曜の列に置いてある"
                )
    want = list(range(1, days_in(year, month) + 1))
    if sorted(seen) != want:
        out.append(f"{month}月: 並んでいる日が {len(seen)}個（{len(want)}個のはず）")
    return out


# --- 左の絵 ------------------------------------------------------------------

def center_box(im: Image.Image) -> tuple[int, int, int, int]:
    """枠の縦横比で、まんなかを切る。"""
    want = PHOTO_W / PHOTO_H
    if im.width / im.height > want:             # 元が横に余っている
        w = round(im.height * want)
        x = (im.width - w) // 2
        return (x, 0, x + w, im.height)
    h = round(im.width / want)
    y = (im.height - h) // 2
    return (0, y, im.width, y + h)


def photo_box(im: Image.Image, box) -> tuple[int, int, int, int]:
    """使う切り取り枠。`BREAK=aspect` のときだけ横に伸ばす（対照）。"""
    box = tuple(box) if box else center_box(im)
    if BREAK == "aspect":
        left, top, right, bottom = box
        return (left, top, left + round((right - left) * 1.3), bottom)
    return box


def box_faults(name: str, im: Image.Image, box) -> list[str]:
    """切り取り枠が、**絵を伸ばさずに**枠へ収まるか。"""
    left, top, right, bottom = box
    out: list[str] = []
    if left < 0 or top < 0 or right > im.width or bottom > im.height:
        out.append(
            f"{name}: 切り取り {left},{top},{right},{bottom} が "
            f"元の絵（{im.width}×{im.height}）からはみ出している"
        )
        return out
    sx = (right - left) / PHOTO_W
    sy = (bottom - top) / PHOTO_H
    off = abs(sx - sy) / max(sx, sy)
    if off > 0.005:
        out.append(
            f"{name}: 縦と横の縮尺が {sx:.4f} と {sy:.4f} で {off * 100:.1f}% ちがう"
            f"（絵が伸びる。切り取りは {PHOTO_W}:{PHOTO_H} に合わせる）"
        )
    return out


# --- 1枚を組む ---------------------------------------------------------------

def paper(page: Image.Image) -> None:
    """右の欄の地。**生成りの紙**（`--ground-paper` を平らに写したもの）。"""
    d = ImageDraw.Draw(page)
    for i in range(PAGE_H):
        t = i / (PAGE_H - 1)
        c = tuple(round(a + (b - a) * t) for a, b in zip(PAPER_TOP, PAPER_BOTTOM))
        d.line([(PANEL_X, i), (PAGE_W, i)], fill=c)
    # 紙の目。**白い粒だと明るい地に消える**ので、地より暗い側で打つ
    grain = Image.new("RGBA", (PANEL_W, PAGE_H), (0, 0, 0, 0))
    g = ImageDraw.Draw(grain)
    for step, alpha, r in ((54, 14, 1.5), (78, 11, 1.1)):
        off = 0 if step == 54 else 21
        for y in range(off, PAGE_H, step):
            for x in range(off, PANEL_W, step):
                g.ellipse([x - r, y - r, x + r, y + r], fill=MOTTLE + (alpha,))
    page.paste(Image.alpha_composite(page.crop((PANEL_X, 0, PAGE_W, PAGE_H)).convert("RGBA"), grain)
               .convert("RGB"), (PANEL_X, 0))


def seam(page: Image.Image) -> None:
    """絵と紙のあいだの帯。**押せるものではない**ので厚みは付けない（島の決まり）。"""
    d = ImageDraw.Draw(page)
    d.rectangle([PANEL_X - 6, 0, PANEL_X + 1, PAGE_H], fill=FRAME)
    d.rectangle([PANEL_X + 2, 0, PANEL_X + 3, PAGE_H], fill=FRAME_DARK)


def rules(page: Image.Image) -> None:
    """表の罫。**字ではなく枠の一部**なので、字を置く前に引く。

    ここを `ink()` の側で引くと、濃さを測るときに**罫の画素が字に混ざる**。
    罫は読ませるものではないので 1.5 前後しか無く、字の中央値をそこまで
    引き下げて「読めない」と出る（最初そうなった）。
    """
    d = ImageDraw.Draw(page)
    d.line([(COL_X, 128), (PAGE_W - PAD, 128)], fill=RULE, width=2)
    d.line([(COL_X, 172), (PAGE_W - PAD, 172)], fill=RULE, width=1)


#: 主役を立てるときに敷く、足もとの影。島の影と同じ色・同じ濃さ
#: （`IsleStage.tsx` の `fill="#134a2c" opacity=0.22`）。
#: **これが無いと、人が地面から浮く**（`docs/island-design.md` 2章の3）。
SHADE = (0x13, 0x4a, 0x2c)
SHADE_A = 56


def stand(page: Image.Image, over: dict) -> None:
    """左の欄に、主役を1人立てる。

    **島のほうからは同じ人を取り除いてある**（`calisle.mjs`）ので、
    2人に見えることはない。引きの島のあやとは 20px の点にしかならず、
    カレンダーの絵の主役にはならない——だからここで大きく置く。

    `h` は絵の高さ（枠の高さに対する割合）、`cx` は左右のまんなか、
    `feet` は**足の裏**の高さ。頭は上から測らない——立つものは
    足もとで位置が決まる（上で合わせると、背の違う絵で宙に浮く）。
    """
    art = Image.open(REPO / "site" / "public" / over["art"]).convert("RGBA")
    h = round(PHOTO_H * over["h"])
    w = round(art.width * h / art.height)
    art = art.resize((w, h), Image.LANCZOS)
    cx = round(PHOTO_W * over["cx"])
    bottom = round(PHOTO_H * over["feet"])

    shade = Image.new("RGBA", (PHOTO_W, PHOTO_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(shade)
    rx, ry = w * 0.30, w * 0.085
    d.ellipse([cx - rx, bottom - ry, cx + rx, bottom + ry], fill=SHADE + (SHADE_A,))
    shade = shade.filter(ImageFilter.GaussianBlur(w * 0.03))
    shade.alpha_composite(art, (cx - w // 2, bottom - h))

    page.paste(Image.alpha_composite(
        page.crop((0, 0, PHOTO_W, PHOTO_H)).convert("RGBA"), shade).convert("RGB"), (0, 0))


def base(kind: str, no: str) -> Image.Image:
    """字を1文字も置いていない1枚。**濃さを測るとき、これが「地」になる。**"""
    page = Image.new("RGB", (PAGE_W, PAGE_H), PAPER_TOP)
    src = SOURCES[(kind, no)]
    im = Image.open(SRC / src["file"]).convert("RGB")
    box = photo_box(im, src["box"])
    page.paste(im.crop(box).resize((PHOTO_W, PHOTO_H), Image.LANCZOS), (0, 0))
    if src.get("over"):
        stand(page, src["over"])
    paper(page)
    seam(page)
    rules(page)
    return page


#: 日付の表の置き場（右の欄の中の座標）。**3つの型で1つの値を使う。**
PAD = 30
COL_X = PANEL_X + PAD
COL_W = (PANEL_W - PAD * 2) / 7
HEAD_Y = 152                 # 曜日の行のまんなか
ROW_TOP = 182                # 1行目の上
ROW_H = 68


def ink(page: Image.Image, month: int, g: list[list[int]]) -> None:
    """字を置く。**ここに絵は1つも描かない**（`base` との差が字の画素になる）。"""
    d = ImageDraw.Draw(page)
    text(d, (COL_X, 34), str(YEAR), font(700, 19), INK_2)
    # **大きい数字と「月」は、同じベースラインに乗せる**（`ls`）。
    # 上そろえ（`la`）で置くと「月」が肩に乗って、添え字に見える
    big = font(900, 58)
    text(d, (COL_X - 3, 112), str(month), big, INK, anchor="ls")
    w = d.textlength(str(month), font=big)
    text(d, (COL_X - 3 + w + 5, 112), "月", font(700, 27), INK, anchor="ls")

    head = font(700, 17)
    for i, name in enumerate(WEEK):
        text(d, (COL_X + COL_W * (i + 0.5), HEAD_Y), name, head, WEEK_INK[i], anchor="mm")

    day = font(700, 25)
    for r, row in enumerate(g):
        for c, n in enumerate(row):
            if not n:
                continue
            text(d, (COL_X + COL_W * (c + 0.5), ROW_TOP + ROW_H * r + ROW_H / 2),
                 str(n), day, WEEK_INK[c], anchor="mm")

    # 小さい字ほど、にじみの画素の割合が増えて**描かれた濃さが下がる。**
    # 同じ色でも 13px 細字で中央値 2.77、15px 太字で 3.98。**計算値は 6.16 ある**
    # ので、色を見ているかぎり気づけない。16px の太字 ＋ いちばん濃い字の色にした
    text(d, (PAGE_W - PAD, 602), "ayato app", font(700, 16), INK, anchor="ra")


def webp(page: Image.Image) -> bytes:
    buf = io.BytesIO()
    page.save(buf, "WEBP", quality=QUALITY, method=6)
    return buf.getvalue()


# --- 字の濃さ ----------------------------------------------------------------

def luminance(rgb) -> float:
    out = []
    for v in rgb[:3]:
        v /= 255
        out.append(v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4)
    return 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2]


def contrast(a, b) -> float:
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


#: 字の画素とみなす、1画素あたりの差（RGB の差の合計）。**下げない。**
#: 下げると webp のにじみを字として数えて、濃さが地の側に引っ張られる。
MOVED = 30

#: 字の群れ。`(名前, 上, 下)`。帯で分けるのは、群れごとに色が違うから。
BANDS = (("年と月", 0, 128), ("曜日", 128, 178), ("日付", 178, 596), ("添え字", 596, PAGE_H))


def inkpx(ink_png: Image.Image, plain_png: Image.Image,
          ink_webp: bytes, plain_webp: bytes) -> dict[str, tuple[int, float, float]]:
    """**字の画素だけ**の、字と地の比。返すのは帯ごとの `(測れた画素, 中央値, 下位10%)`。

    足を2つに分けてある。

    1. **どこが字の画素かは、組んだ絵（非可逆にする前）で決める。**
       webp は字を置いたことで**割り当てるビットが変わる**ので、字から遠い
       紙の上にも差が出る。その差は地と地の差（比 1.0 前後）なので、
       混ぜると中央値がそちらへ引っ張られる。実測で、同じ枠なのに
       `archive-02` だけ日付の画素が 6,100 → 6,839 に増えて 6.0 → 5.1 に落ちた。
    2. **濃さそのものは、配る webp を読み直して測る。**
       宣言した色でも、組んだ絵でもない。**受け取る人が開くファイルの画素。**

    合否は**中央値**（下位10%はにじみを測ることになる。`CLAUDE.md`）。
    """
    pi, pp = ink_png.load(), plain_png.load()
    wi = Image.open(io.BytesIO(ink_webp)).convert("RGB").load()
    wp = Image.open(io.BytesIO(plain_webp)).convert("RGB").load()
    out: dict[str, tuple[int, float, float]] = {}
    for name, top, bottom in BANDS:
        vals: list[float] = []
        for y in range(top, bottom):
            for x in range(PANEL_X, PAGE_W):
                if sum(abs(i - j) for i, j in zip(pi[x, y], pp[x, y])) <= MOVED:
                    continue
                vals.append(contrast(wi[x, y], wp[x, y]))
        if not vals:
            out[name] = (0, 0.0, 0.0)
            continue
        vals.sort()
        out[name] = (len(vals), vals[len(vals) // 2], vals[max(0, len(vals) // 10)])
    return out


# --- 焼く --------------------------------------------------------------------

def fetch() -> int:
    """元の絵のうち、**落とせるもの**を落とす。島の絵は `calisle.mjs` の仕事。"""
    SRC.mkdir(parents=True, exist_ok=True)
    for (kind, no), s in SOURCES.items():
        dst = SRC / s["file"]
        if dst.exists():
            print(f"在る: {dst.relative_to(REPO)}  {dst.stat().st_size:,}B")
            continue
        if not s["url"]:
            print(f"落とせない: {dst.relative_to(REPO)}（`node tools/goods/calisle.mjs` で撮る）")
            continue
        subprocess.run(["curl", "-fsS", "--retry", "3", "-o", str(dst), s["url"]], check=True)
        print(f"落とした: {dst.relative_to(REPO)}  {dst.stat().st_size:,}B  {s['note']}")
    return 0


def sheet_faults(sheets: dict[tuple[str, str], bytes]) -> list[str]:
    """6枚そろっているか・寸法と重さ。**何枚見たかを一緒に出す**（§15）。"""
    out: list[str] = []
    want = [(k, n) for k in KINDS for n in PAGES]
    for key in want:
        if key not in sheets:
            out.append(f"{key[0]}-{key[1]}: 焼かれていない")
            continue
        im = Image.open(io.BytesIO(sheets[key]))
        if abs(im.width - PAGE_W) > 1 or abs(im.height - PAGE_H) > 1:
            out.append(f"{key[0]}-{key[1]}: {im.width}×{im.height}（{PAGE_W}×{PAGE_H} のはず）")
        if len(sheets[key]) > MAX_BYTES:
            out.append(f"{key[0]}-{key[1]}: {len(sheets[key]):,}B（上限 {MAX_BYTES:,}B）")
    if len(sheets) != len(want):
        out.append(f"焼けたのは {len(sheets)}枚（{len(want)}枚のはず）")
    return out


#: 配る webp の枠で、目をつぶる差（1チャンネルあたり）と、その割合。
#:
#: **組んだ絵では3つの型の枠は1バイトも違わない**（同じ関数で描いて貼っている）。
#: けれど webp は非可逆なので、**隣の絵がビットの割り当てを変える。**
#: 実測（1月・`illust` と `scene`）では、枠 262,890画素のうち差が 20 を超えるのは
#: **38画素**（字のふちに散らばる）で、残りは 5 以下。
#: 「画素レベルで同じ」と言うのに、この幅まで測ってから言う。
PANEL_SLACK, PANEL_SLACK_RATE = 16, 0.001


def frame_faults(canvas: dict[tuple[str, str], Image.Image],
                 sheets: dict[tuple[str, str], bytes]) -> list[str]:
    """**3つの型で、右の欄が同じか。** 違ってよいのは左の絵だけ。

    組んだ絵は**1バイトも違わない**ことを見る。配る webp のほうは、
    非可逆の割り当てぶんだけ `PANEL_SLACK` まで許して、割合で判じる。
    """
    out: list[str] = []
    panel = (PANEL_X, 0, PAGE_W, PAGE_H)
    for no in PAGES:
        ref = ref_kind = ref_webp = None
        for kind in KINDS:
            if (kind, no) not in canvas:
                continue
            got = canvas[(kind, no)].crop(panel)
            shot = Image.open(io.BytesIO(sheets[(kind, no)])).convert("RGB").crop(panel)
            if ref is None:
                ref, ref_kind, ref_webp = got, kind, shot
                continue
            if got.tobytes() != ref.tobytes():
                diff = sum(1 for i, j in zip(got.tobytes(), ref.tobytes()) if i != j)
                out.append(f"{no}: {kind} の枠が {ref_kind} と違う（組んだ絵で {diff:,} バイト）")
            a, b = ref_webp.tobytes(), shot.tobytes()
            over = sum(1 for i, j in zip(a, b) if abs(i - j) > PANEL_SLACK)
            if over > len(a) * PANEL_SLACK_RATE:
                out.append(
                    f"{no}: {kind} の枠が {ref_kind} と違う"
                    f"（配る webp で差 {PANEL_SLACK} 超が {over:,} / {len(a):,}）"
                )
    return out


def bake(write: bool) -> tuple[int, list[str]]:
    """6枚を組む。`write` が偽なら書き出さずに判定だけ返す（`--drill`）。"""
    faults: list[str] = []
    sheets: dict[tuple[str, str], bytes] = {}
    canvas: dict[tuple[str, str], Image.Image] = {}
    lines: list[str] = []

    for kind in KINDS:
        if BREAK == "skip" and kind == KINDS[-1]:
            continue                            # 対照: 型を1つ焼かずに済ませる
        for no, month in PAGES.items():
            src = SOURCES[(kind, no)]
            path = SRC / src["file"]
            if not path.exists():
                faults.append(f"{kind}-{no}: 元の絵が無い（{path.relative_to(REPO)}）")
                continue
            im = Image.open(path).convert("RGB")
            box = photo_box(im, src["box"])
            faults += box_faults(f"{kind}-{no}", im, box)

            g = grid(YEAR, month)
            faults += grid_faults(YEAR, month, g)

            plain_png = base(kind, no)
            plain = webp(plain_png)
            page = plain_png.copy()
            ink(page, month, g)
            body = webp(page)
            sheets[(kind, no)] = body
            canvas[(kind, no)] = page

            got = inkpx(page, plain_png, body, plain)
            worst = min((v[1] for v in got.values() if v[0]), default=0.0)
            if worst < MIN_CONTRAST:
                faults.append(f"{kind}-{no}: 字と地の比がいちばん低いところで {worst:.2f}")
            thin = [n for n, v in got.items() if v[0] == 0]
            if thin:
                faults.append(f"{kind}-{no}: 字が1画素も拾えなかった帯 {'・'.join(thin)}")
            lines.append(
                f"{kind}-{no}  {month}月  {len(body):,}B  "
                + "  ".join(f"{n} {v[1]:.2f}（{v[0]:,}px）" for n, v in got.items())
            )

    faults += sheet_faults(sheets)
    faults += frame_faults(canvas, sheets)

    if write and not faults:
        OUT.mkdir(parents=True, exist_ok=True)
        for (kind, no), body in sheets.items():
            (OUT / f"{kind}-{no}.webp").write_bytes(body)
    for line in lines:
        print(line)
    return len(sheets), faults


def main() -> int:
    if "--fetch" in sys.argv:
        return fetch()
    if not FONTS.exists():
        print(f"丸ゴシックが無い: {FONTS.relative_to(REPO)}")
        return 2
    drill = "--drill" in sys.argv
    if BREAK:
        print(f"対照: BREAK={BREAK} を当てている（通ったら、その足は何も見ていない）")

    made, faults = bake(write=not drill)
    for f in faults:
        print(f)
    print(f"見た: {made}枚 / {len(KINDS) * len(PAGES)}枚  違反 {len(faults)}件"
          f"（字と地の比は {MIN_CONTRAST} 以上・1枚 {MAX_BYTES:,}B 以下・"
          f"枠は3つの型で同じ画素）")
    if faults:
        return 1
    if made == 0:
        return 2
    if not drill:
        for kind in KINDS:
            for no in PAGES:
                p = OUT / f"{kind}-{no}.webp"
                print(f"焼いた: {p.relative_to(REPO)}  {p.stat().st_size:,}B")
    return 0


if __name__ == "__main__":
    sys.exit(main())
