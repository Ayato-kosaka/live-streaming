"""SUZURI の**卓上カレンダー**の試作を、3つの型 × 1枚 = 3枚焼く。

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
**カレンダーの姿（紙・リング・スタンド・暦）は3つとも1つの関数から描く。**
型ごとに違うと、何を選んだのか分からなくなる。差し替わるのは
**左の正方形の絵だけ**で、そこは `SOURCES` の表1つにまとめてある。

**1つの型につき1枚**（あやと 2026-10-10「またそれぞれの例は一つで良い」）。
2枚ずつ並べていたのを、1枚ずつにした。

いいねで反応を見る仕掛けは別の担当。ここは絵を焼くところまで。

## いちばん大事なこと — **枠は創作ではない。SUZURI の実物に寄せる**

1回目は 3:4 のタテ長の紙に、丸ゴシックで日曜を赤・土曜を青にした暦を
こちらで組んでいた。**実物はそうなっていない**（あやと 2026-10-10
「カレンダー例のやつ、もっとスズリに合わせないとイメージつかないよ。
正方形にもなってないし」）。

SUZURI の卓上カレンダーの面付けを実物で見て、こう直した。

| | 1回目（創作） | いま（実物に寄せた） |
| --- | --- | --- |
| 上げる絵 | 3:4 のタテ長 | **正方形** |
| 紙 | 絵が紙の全面 | **白い横長の紙**（178:127）の**左に正方形の絵** |
| 綴じ | 無し | **黒いリングが上に横一列**。下にスタンドの縁 |
| 字 | 丸ゴシック | **サンセリフ**（実物は普通のグロテスク） |
| 曜日 | 日＝赤 / 土＝青 | **平日＝黒 / 土日＝薄い灰**。赤も青も使わない |
| 曜日の頭 | 日月火水木金土 | **S M T W T F S** |

**上げる絵が正方形**なので、素材は3つとも正方形に切ってある
（`SOURCES` の `box`。どこで切ったかの理由もそこに書いた）。

遠近（斜め）は付けない。**正面から見た図にする**——歪ませると下手に見えるし、
歪んだぶんだけ「3枚で枠が同じ」が確かめにくくなる。

## 値段も寸法も、絵の中に書かない

`docs/island-standards.md` 16章。他所の値段を島の面に焼くと、向こうが
変えた日から嘘になる。SUZURI の用紙（**178mm × 127mm**）は、
**紙の形を決めるためだけ**に使う。`ayato app` の添え字も紙には入れない——
実物の紙に刷られるのは絵と暦だけで、言葉はそこに無い。

## 枠はブラウザで描かない

ブラウザを起こすと、**同じ枠を3回描くたびに1画素ずれる余地**ができる
（字詰め・端数・描画の版）。ここは PIL で1回だけ組んで、**同じ画素を3回貼る**
——そうすれば「枠が同じ」は確かめるまでもなく、作りから出てくる。

カレンダーの姿（影・スタンド・紙・リング）は **3倍で描いてから縮める。**
等倍で円弧を描くと、リングの16本が1本ずつ違う形にギザつく。

## 字は箱のサンセリフを読む

出すのは数字と `S M T W T F S` だけなので、**かなも漢字も要らない。**
リポジトリの丸ゴシック（`site/public/fonts/maru-*.woff2`）は使わない——
実物はグロテスクで、丸ゴシックにすると別物になる。

箱に入っているものを上から順に探して、1組も無ければ **2 で落ちる**
（黙って別の字で焼くと、焼き直した日に枠が変わる）。

## 置き場

| | どこ |
| --- | --- |
| 元の絵（**配らない**） | `tools/goods/cal-src/<型の素材>` |
| 焼いたもの（**配るのはこちら**） | `site/public/goods/calendar/<型>.webp` |

型の名前（`illust` / `scene` / `archive`）は**変えない**——別の担当が
この名前で面に並べる。

## 選ばなかったもの（もう一度探さなくていいように）

- **風景**: ストックホルムの展望台（`x5h4h6XlyjwJ78Ac4wJj`。2026-09-21）。
  1200×1600 を正方形にすると、どこで切っても**水面か空が4割以上**残って
  のっぺりする。タリンの屋根（採用）は切っても全面に密度がある
- **スクショ**: `M1RvClI7mDg`（ジョージア正教会のクリスマス。前の `archive-01`）。
  題の帯が**上**に、顔が**下**にあって、**正方形にすると必ずどちらかが切れる**
  （0〜50px まで当てた。帯を残すとあごが切れ、あごを残すと帯が切れる）。
  `XWy96VeQU2M`（海外マクド）は目標の字が入るが頭のてっぺんが切れる。
  `GYN5JQThlJU`（アリロ行列の告知）は告知の板が目標バーと重なっていて、
  板を入れると**金額も入る**。1月の配信から 108コマ見て、
  **題の帯と、切れていない顔が、同時に正方形へ入るコマは1つも無かった**

## 対照（`--drill`）

0＝通った / 1＝見つかった / 2＝数えるものが無い。

足は4本あって、**`BREAK=` で1本ずつ折れる**（折ると 1 で落ちる）。

| `BREAK=` | 何を壊すか | どの判定が拾うか |
| --- | --- | --- |
| `shift` | 曜日の表を1日ずらす | `grid_faults` が**日付から曜日を引き直して**突き合わせる |
| `size` | 出す絵の寸法を変える | `sheet_faults` が 890×760 を見る |
| `square` | 左の絵を正方形でなくする | `square_faults` が切り取りの縦横を比べる |
| `skip` | 型を1つ焼かずに済ませる | `sheet_faults` が3枚そろっているかを数える |

**判定は、作ったものを読み直して出す。** 曜日は `datetime` で1日ずつ
引き直すので、表を作った側の式が間違っていても気づける（表を作った式を
もう一度回すだけの対照は、何を壊しても通る）。

## 字の濃さは、焼いた画素から測る

宣言した色ではなく、**焼いた webp を読み直して**測る
（`CLAUDE.md`「文字の濃さ」）。同じ枠を**字あり／字なし**で2枚焼いて、
動いた画素を字の画素とみなす。地は字なしのほうの同じ画素なので、
**紙の粒で地が場所ごとに違っても、その字が乗っている地そのもの**で割れる。
合否は**中央値**で決める（下位10%はにじみの画素を測ることになる）。

**土日の薄い灰は、平日の黒と別に測る。** 同じ行にいるので帯では分けられず、
列で分けている。混ぜると、黒い5列が灰の2列を持ち上げて
「薄いほうが読めない」が中央値に出ない。
"""

from __future__ import annotations

import datetime
import io
import math
import os
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent          # tools/goods/
REPO = HERE.parent.parent

SRC = HERE / "cal-src"
OUT = REPO / "site" / "public" / "goods" / "calendar"

# --- 出す絵 ------------------------------------------------------------------
#: 配る絵の寸法。**変えない。** 別の担当がこの数で面に場所を取る。
SHOT_W, SHOT_H = 890, 760

#: 刷られる紙。SUZURI の卓上カレンダーの用紙は **178mm × 127mm**。
PAPER_MM_W, PAPER_MM_H = 178, 127
#: 絵の中での紙の幅。ここから下の寸法が全部決まる。
PAPER_W = 800
PAPER_H = round(PAPER_W * PAPER_MM_H / PAPER_MM_W)

#: 紙の置き場。リングが紙より上に出るぶんと、スタンドのぶんを上下に取って、
#: 残りを等分する。割合は実物（紙幅 457px で測った）から。
RING_RISE = round(PAPER_W * 0.0284)     # リングが紙より上に出る高さ
RING_DROP = round(PAPER_W * 0.0394)     # リングが紙に掛かる深さ
STAND_H = round(PAPER_W * 0.0547)       # スタンドの縁（紙の下）
PAPER_X = (SHOT_W - PAPER_W) // 2
PAPER_Y = (SHOT_H - (RING_RISE + PAPER_H + STAND_H)) // 2 + RING_RISE

#: 左の正方形の絵。**紙の左・上・下に白を残して置く**（実物と同じ）。
PHOTO = round(PAPER_W * 0.60)
PHOTO_X = PAPER_X + round(PAPER_W * 0.0438)
#: 上下の余白は、実物の比（上 44 : 下 13）で割る。上が広いのはリングのぶん。
PHOTO_Y = PAPER_Y + round((PAPER_H - PHOTO) * 44 / 57)

#: 焼くのは **2027年1月**。3つの型とも同じ月（月を変えると比べられない）。
YEAR, MONTH = 2027, 1

#: 1枚の上限（バイト）。配る絵なので、ここを越えたら質を下げるのではなく
#: **越えたことを言って落ちる**——黙って型ごとに質を変えると、枠の画素が揃わなくなる。
MAX_BYTES = 120_000
#: webp の質。**3枚とも同じ値で焼く。** 1枚ごとに変えると枠が画素で揃わない。
QUALITY = 84

#: 字と地の比。これを割ったら落ちる（`docs/island-standards.md` の出す前のチェック）。
MIN_CONTRAST = 4.5

# --- 色 ----------------------------------------------------------------------
#: 地。島の紙の面（`--ground-paper`）をそのまま写す。**ここを別の色にすると、
#: 3枚が `/goods` の紙の上で「貼った白い箱」に見える。**
GROUND_IN = (0xfb, 0xf7, 0xe3)
GROUND_MID = (0xf4, 0xef, 0xcf)      # --paper-out
GROUND_OUT = (0xef, 0xe9, 0xc6)
GRAIN = (0x7e, 0x6c, 0x2c)           # 紙の目（--ground-paper の点と同じ色）

#: 刷られる紙。実物は白（実測 #f6f6f6〜#fafafa）。島の地が生成りなので、
#: ほんのわずかだけ暖かい側に寄せて、切り抜きの白い穴に見えないようにする。
SHEET_TOP = (0xfd, 0xfd, 0xfa)
SHEET_BOTTOM = (0xf2, 0xf1, 0xec)
#: 紙の下の切り口と、スタンドの縁。
SHEET_EDGE = (0xd9, 0xd7, 0xcf)
STAND_TOP = (0xe4, 0xe2, 0xda)
STAND_BOTTOM = (0xfa, 0xfa, 0xf6)
#: 机に落ちる影。**地が生成りなので、灰ではなく紙の目と同じ暖かい側で落とす。**
CAST = (0x7e, 0x6c, 0x2c)

#: リング（黒いワイヤ）と、綴じ穴。
WIRE = (0x1a, 0x1a, 0x1a)
HOLE = (0xea, 0xe8, 0xe1)

#: 字。**実物は赤も青も使わない。** 平日が黒、土日が薄い灰。
#:
#: 実物の土日は #999 相当で、白に対して比 **2.85** しかない。そのまま写すと
#: `MIN_CONTRAST`（4.5）を割る——**薄くして読めなくなったら本末転倒**なので、
#: 「平日より明らかに薄いが、4.5 は越える」ところまで濃くした。
#: 当てた値（`archive` の焼いた画素・中央値。土日 ／ 曜日の頭）:
#:
#:     #6b 細字 10px  3.31 / 2.65      #6b 太字 10px  4.35 / 3.35
#:     #6b 太字 13px  4.33 / 4.31      #5f 太字 13px  5.17 / 4.99
#:     #5a 太字 13px  5.56 / 5.38  ← これ
#:
#: 平日の黒（#1c1c1c）は 14.2 なので、**薄い側だという見た目は残っている。**
MONTH_INK = (0x00, 0x00, 0x00)
YEAR_INK = (0x3a, 0x3a, 0x3a)
WEEKDAY_INK = (0x1c, 0x1c, 0x1c)
WEEKEND_INK = (0x5a, 0x5a, 0x5a)
HEAD_INK = (0x5a, 0x5a, 0x5a)

#: 薄い側（土日と曜日の頭）を太字で置くか。
#: **細字のままだと、描かれた濃さが宣言した色よりずっと下がる**——
#: 同じ #6b6b6b で、太字が中央値 4.35、細字が 3.31。細い字はにじみの画素の
#: 割合が高く、そこが中央値に来るため。実物の土日は細字だが、
#: **読めない字を実物に寄せても仕方がない**ので、ここは太字にする。
WEEKEND_BOLD = True
HEAD_BOLD = True

#: 日曜はじまり。実物と同じ頭文字。
WEEK = ("S", "M", "T", "W", "T", "F", "S")

# --- 暦の置き場（紙の中の割合。実物から測った） ------------------------------
#: 横。表は右の欄のまんなかに置く。実物は紙の 24.9% だが、**こちらは数字を
#: 実物より大きくしている**（下の `DAY_DIGIT`）ので、同じ幅だと 2桁が
#: くっつく（「14 15」「21 22」が実際にくっついた）。実物の
#: 「数字の高さ ÷ 列の幅」が 0.43 なので、そこへ合わせて広げた。
GRID_W = round(PAPER_W * 0.275)
GRID_CX = (PHOTO_X + PHOTO + PAPER_X + PAPER_W) // 2
GRID_X = GRID_CX - GRID_W // 2
COL_W = GRID_W / 7

#: 縦（紙の高さに対する割合）。実物の 329px の紙で測った値をそのまま使う。
MONTH_MID = 0.3055      # 月の数字のまんなか
MONTH_DIGIT = 0.1094    # 月の数字の高さ
YEAR_MID = 0.4103
YEAR_DIGIT = 0.0213
HEAD_MID = 0.5471
#: 曜日の頭文字。実物は 0.0182（10px）だが、そこだと描かれた濃さが 3.35 まで
#: 落ちる。**13px まで上げて 5.38**。実物と並べても大きさの違いは分からない
HEAD_CAP = 0.0228
ROW1_MID = 0.6018
ROW_PITCH = 0.0535
#: 日付の数字だけ、実物（0.0213）より **1.15倍** 大きい。実物の寸法そのままだと
#: 890px の絵の中で 12px になり、にじみの画素の割合が増えて濃さが落ちる
#: （丸ゴシックの頃、15px の字で中央値 3.98 が出た）。
DAY_DIGIT = 0.0245

#: 対照のときだけ立てる、壊しかた（`BREAK=shift|size|square|skip`）。
BREAK = os.environ.get("BREAK", "")


# --- 左の絵。**ここだけが型ごとに違う** --------------------------------------
#: `box` は元の絵から切り取るところ（左・上・右・下）。**正方形でなければ
#: `square_faults` が落とす。** `None` は「元の絵がもう正方形」の印。
SOURCES = {
    "illust": dict(
        file="illust-ayato-poster.png", box=None, url=None,
        note="あやとが指定した1枚（ストックホルム・2周年のポスター）。"
             "1254×1254 でもう正方形なので、1画素も切らない",
    ),
    "scene": dict(
        file="scene-01.jpg", box=(0, 260, 1200, 1460),
        url=("https://firebasestorage.googleapis.com/v0/b/live-streaming-d3cac.firebasestorage.app"
             "/o/nordic%2Fphotos%2F2026-09-18%2FWKoUtpuAzqR4zwwQ2hXj.jpeg"
             "?alt=media&token=b0053d1f-1b86-401c-b4ca-4176302ef6ce"),
        # 1200×1600 を正方形にすると **上下で 400px 落ちる**ので、どこで切るかで
        # 別の絵になる。0 / 160 / 200 / 260 / 320 / 400 を並べて 260 にした——
        # 上寄りは空が半分で のっぺりし、下寄りは聖オラフ教会の尖塔が切れる。
        # 260 だと尖塔が上から 1/3 に立って、赤い屋根が下半分を埋める。
        note="あやと島カードの写真 WKoUtpuAzqR4zwwQ2hXj（2026-09-18 タリン旧市街の屋根）。"
             "上から260px 落として 1200角。尖塔を上1/3 に置き、屋根で下を埋める",
    ),
    "archive": dict(
        file="archive-newyear.jpg", box=(438, 35, 843, 440),
        url="https://i.ytimg.com/vi/0yjsa9Rd7sY/maxres1.jpg",
        # 配信のコマは 1280×720 の中に 9:16 のタテ配信が入っていて、左右は同じ絵の
        # ぼかし。**ぼかしの帯は切り落とす**（刷ると帯にしか見えない）。
        # タテの中身は 720×9/16 = 405px ぶんで、左端は (1280-405)/2 = 437.5。
        #
        # **タテ 405 のうち上から 35px 下げて 405角。** 下げないと振っている手の
        # 付け根が切れ、これ以上下げると髪のてっぺんが切れる。
        # この配信は目標バーを出していないので、**枠にも絵のどこにも金額が無い**
        # （`docs/island-money.md`）。視聴者さんのコメントも名前も写っていない。
        note="2026-01-02『やっと正月ボケ抜けてきた』0yjsa9Rd7sY maxres1"
             "（1月の配信。手を振っているところ・頭もあごも手も切れていない・"
             "金額もコメントも写っていない）",
    ),
}

#: 焼く型。**この順で並べる。** 名前は面に出すので変えない。
KINDS = ("illust", "scene", "archive")


# --- 字 ----------------------------------------------------------------------
#: 箱にあるサンセリフ。**上から順に探す。** Liberation Sans は実物の
#: グロテスクにいちばん近い（Helvetica 系の字幅）。
FACE_PAIRS = (
    ("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
     "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
     "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ("/usr/share/fonts/truetype/freefont/FreeSans.ttf",
     "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"),
)


def faces() -> tuple[str, str]:
    """使うサンセリフ（細字・太字）。1組も無ければ投げる。"""
    for regular, bold in FACE_PAIRS:
        if Path(regular).exists() and Path(bold).exists():
            return regular, bold
    raise FileNotFoundError(
        "サンセリフが1組も見つからない。探したのは:\n  "
        + "\n  ".join(r for r, _ in FACE_PAIRS)
    )


#: 同じ大きさを何度も探さないための覚え書き。
_FITTED: dict[tuple[str, str, int], ImageFont.FreeTypeFont] = {}


def fit(path: str, sample: str, height: int) -> ImageFont.FreeTypeFont:
    """`sample` の描かれる高さが `height` になる字の大きさを探して返す。

    **宣言した大きさから逆算しない。** 字の大きさと、実際に描かれる数字の
    高さの比は書体ごとに違う。書体が替わった日に暦の背が変わらないように、
    **描いて測って決める。**
    """
    key = (path, sample, height)
    if key in _FITTED:
        return _FITTED[key]
    lo, hi = 4, height * 4
    best = ImageFont.truetype(path, lo)
    while lo <= hi:
        mid = (lo + hi) // 2
        f = ImageFont.truetype(path, mid)
        box = f.getbbox(sample)
        if box[3] - box[1] <= height:
            best, lo = f, mid + 1
        else:
            hi = mid - 1
    _FITTED[key] = best
    return best


def text(d: ImageDraw.ImageDraw, xy, s: str, f, fill, anchor="mm") -> None:
    d.text(xy, s, font=f, fill=fill, anchor=anchor)


# --- 曜日の表 ----------------------------------------------------------------

def days_in(year: int, month: int) -> int:
    """その月の日数。**表を作る式とは別に数える**（対照がここを使う）。"""
    nxt = datetime.date(year + (month == 12), month % 12 + 1, 1)
    return (nxt - datetime.date(year, month, 1)).days


def grid(year: int, month: int) -> list[list[int]]:
    """日曜はじまりの 6×7。空きは 0。

    6行で固定するのは、**月によって表の背が変わらないようにする**ため。
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
                    f"{year}年{month}月{day}日 は {WEEK[col]}（左から{col + 1}列目）"
                    f"なのに {c + 1}列目に置いてある"
                )
    want = list(range(1, days_in(year, month) + 1))
    if sorted(seen) != want:
        out.append(f"{month}月: 並んでいる日が {len(seen)}個（{len(want)}個のはず）")
    return out


# --- 左の絵 ------------------------------------------------------------------

def photo_box(im: Image.Image, box) -> tuple[int, int, int, int]:
    """使う切り取り枠。`BREAK=square` のときだけ横を詰める（対照）。"""
    box = tuple(box) if box else (0, 0, im.width, im.height)
    if BREAK == "square":
        left, top, right, bottom = box
        return (left, top, left + round((right - left) * 0.78), bottom)
    return box


def square_faults(name: str, im: Image.Image, box) -> list[str]:
    """切り取り枠が、**元の絵の中にあって、正方形か。**

    SUZURI に上げる絵は正方形の枠に入るので、ここが 1:1 でないと
    **刷ったときに絵が伸びる。**
    """
    left, top, right, bottom = box
    out: list[str] = []
    if left < 0 or top < 0 or right > im.width or bottom > im.height:
        out.append(
            f"{name}: 切り取り {left},{top},{right},{bottom} が "
            f"元の絵（{im.width}×{im.height}）からはみ出している"
        )
        return out
    w, h = right - left, bottom - top
    off = abs(w - h) / max(w, h)
    if off > 0.005:
        out.append(
            f"{name}: 切り取りが {w}×{h} で正方形から {off * 100:.1f}% ずれている"
            f"（SUZURI に上げる絵は正方形）"
        )
    return out


# --- カレンダーの姿 ----------------------------------------------------------
#: 影・スタンド・紙・リングを描くときの倍率。**等倍で円弧を描くと、
#: リング16本が1本ずつ違う形にギザつく。**
SS = 3


def ground(page: Image.Image) -> None:
    """地。島の紙の面（`--ground-paper`）をそのまま写す。

    楕円のグラデーション（中心 50% 22%・半径 150% 84%）＋ 紙の目の点2層。
    """
    px = page.load()
    cx, cy = SHOT_W * 0.5, SHOT_H * 0.22
    rx, ry = SHOT_W * 1.5, SHOT_H * 0.84
    for y in range(SHOT_H):
        dy = (y - cy) / ry
        for x in range(SHOT_W):
            t = min(1.0, math.hypot((x - cx) / rx, dy))
            if t <= 0.48:
                u, a, b = t / 0.48, GROUND_IN, GROUND_MID
            else:
                u, a, b = (t - 0.48) / 0.52, GROUND_MID, GROUND_OUT
            px[x, y] = tuple(round(p + (q - p) * u) for p, q in zip(a, b))

    dots = Image.new("RGBA", (SHOT_W, SHOT_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(dots)
    for step, off, radius, alpha in ((54, 0, 1.5, 14), (78, 21, 1.1, 11)):
        for y in range(off, SHOT_H, step):
            for x in range(off, SHOT_W, step):
                d.ellipse([x - radius, y - radius, x + radius, y + radius],
                          fill=GRAIN + (alpha,))
    page.paste(Image.alpha_composite(page.convert("RGBA"), dots).convert("RGB"), (0, 0))


def vgrad(d: ImageDraw.ImageDraw, box, top, bottom) -> None:
    """縦のグラデーションで塗る。**ベタ塗りにしない**（島の決まり 2章の5）。"""
    x0, y0, x1, y1 = box
    for y in range(y0, y1):
        t = (y - y0) / max(1, y1 - y0 - 1)
        d.line([(x0, y), (x1 - 1, y)],
               fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))


def body(layer: Image.Image) -> None:
    """3倍の板に、影・スタンド・紙・リング・綴じ穴を描く。"""
    d = ImageDraw.Draw(layer)
    px, py = PAPER_X * SS, PAPER_Y * SS
    pw, ph = PAPER_W * SS, PAPER_H * SS
    stand_h = STAND_H * SS
    radius = round(PAPER_W * 0.006) * SS

    # 影は2つ。**片方だけでは足りない。**
    #
    #   1. ふちの影 — 地（生成り）と紙（白）は明るさが近いので、影が無いと
    #      紙の輪郭が消えて「地に字を直接置いた」ように見える
    #   2. 机に落ちる影 — **物が地面から浮かないように**
    #      （`docs/island-design.md` 2章の3）
    edge = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    drop = round(PAPER_W * 0.005) * SS
    ImageDraw.Draw(edge).rounded_rectangle(
        [px - drop, py + drop, px + pw + drop, py + ph + stand_h + drop * 2],
        radius=radius * 2, fill=CAST + (66,))
    layer.alpha_composite(edge.filter(ImageFilter.GaussianBlur(round(PAPER_W * 0.009) * SS)))

    shade = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    spread = round(PAPER_W * 0.012) * SS
    ImageDraw.Draw(shade).rounded_rectangle(
        [px - spread, py + ph - spread, px + pw + spread, py + ph + stand_h + spread],
        radius=radius * 3, fill=CAST + (72,))
    layer.alpha_composite(
        shade.filter(ImageFilter.GaussianBlur(round(PAPER_W * 0.016) * SS)))

    # スタンドの縁。紙より少しだけ外へ出る（立っているものに見せる）
    lip = round(PAPER_W * 0.008) * SS
    vgrad(d, (px - lip, py + ph, px + pw + lip, py + ph + stand_h),
          STAND_TOP, STAND_BOTTOM)
    d.rounded_rectangle([px - lip, py + ph + stand_h - radius * 2,
                         px + pw + lip, py + ph + stand_h],
                        radius=radius, fill=STAND_BOTTOM)

    # 紙
    vgrad(d, (px, py, px + pw, py + ph), SHEET_TOP, SHEET_BOTTOM)
    # 紙とスタンドの境。**ぼかさない**（厚みではなく、紙の切り口）
    d.rectangle([px, py + ph - SS, px + pw, py + ph + SS - 1], fill=SHEET_EDGE)

    # リング。紙の上ふちをまたいで、左右に等間隔
    inset = round(PAPER_W * 0.0375) * SS
    # 実物（紙幅 457px）で測った値: 輪の幅 11px・ピッチ 21.8px・針金 2〜4px。
    # **本数は見た目で数えない。** 紙より上の高さで暗い画素のかたまりを
    # 数えると、8本ぶんでピッチ 21.8 が出て、端から端で 20本になる
    # （最初 16本と置いて、並べたら実物のほうが明らかに密だった）。
    half = max(SS, round(PAPER_W * SS * 0.0120))   # 輪の半分の幅
    wire = max(SS, round(PAPER_W * SS * 0.0040))
    rings = 20
    span = pw - inset * 2
    top = py - RING_RISE * SS
    bottom = py + RING_DROP * SS
    for i in range(rings):
        cx = px + inset + round(span * i / (rings - 1))
        # 綴じ穴（紙に空いている窓）。**針金の2本より広く、薄く**——
        # 狭いと足のあいだの「短い棒」に見えて、紙に穴が空いているように読めない
        hole_w = round(half * 1.3)
        d.rounded_rectangle(
            [cx - hole_w, bottom - round(PAPER_W * 0.004) * SS,
             cx + hole_w, bottom + round(PAPER_W * 0.008) * SS],
            radius=round(PAPER_W * 0.002) * SS, fill=HOLE)
        # 輪。上で半円に曲げて、両足を下ろす。**足もとは横棒で閉じない**
        # （閉じるとアーチ型の飾りに見えて、針金に見えなくなる）
        d.arc([cx - half, top, cx + half, top + half * 2], 180, 360,
              fill=WIRE, width=wire)
        for sx in (cx - half, cx + half):
            d.line([(sx, top + half), (sx, bottom)], fill=WIRE, width=wire)


def base(kind: str) -> Image.Image:
    """字を1文字も置いていない1枚。**濃さを測るとき、これが「地」になる。**"""
    page = Image.new("RGB", (SHOT_W, SHOT_H), GROUND_IN)
    ground(page)

    layer = Image.new("RGBA", (SHOT_W * SS, SHOT_H * SS), (0, 0, 0, 0))
    body(layer)
    page.paste(Image.alpha_composite(
        page.convert("RGBA"),
        layer.resize((SHOT_W, SHOT_H), Image.LANCZOS)).convert("RGB"), (0, 0))

    src = SOURCES[kind]
    im = Image.open(SRC / src["file"]).convert("RGB")
    box = photo_box(im, src["box"])
    page.paste(im.crop(box).resize((PHOTO, PHOTO), Image.LANCZOS), (PHOTO_X, PHOTO_Y))
    return page


def ink(page: Image.Image, g: list[list[int]]) -> None:
    """字を置く。**ここに絵は1つも描かない**（`base` との差が字の画素になる）。"""
    regular, bold = faces()
    d = ImageDraw.Draw(page)

    text(d, (GRID_CX, PAPER_Y + PAPER_H * MONTH_MID), str(MONTH),
         fit(regular, "8", round(PAPER_H * MONTH_DIGIT)), MONTH_INK)
    text(d, (GRID_CX, PAPER_Y + PAPER_H * YEAR_MID), str(YEAR),
         fit(regular, "8", round(PAPER_H * YEAR_DIGIT)), YEAR_INK)

    head = fit(bold if HEAD_BOLD else regular, "S", round(PAPER_H * HEAD_CAP))
    for i, name in enumerate(WEEK):
        text(d, (GRID_X + COL_W * (i + 0.5), PAPER_Y + PAPER_H * HEAD_MID),
             name, head, HEAD_INK)

    day_h = round(PAPER_H * DAY_DIGIT)
    weekday = fit(bold, "8", day_h)
    weekend = fit(bold if WEEKEND_BOLD else regular, "8", day_h)
    for r, row in enumerate(g):
        for c, n in enumerate(row):
            if not n:
                continue
            end = c in (0, 6)
            text(d, (GRID_X + COL_W * (c + 0.5),
                     PAPER_Y + PAPER_H * (ROW1_MID + ROW_PITCH * r)),
                 str(n), weekend if end else weekday,
                 WEEKEND_INK if end else WEEKDAY_INK)


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


def bands() -> tuple[tuple[str, int, int], ...]:
    """字の群れ `(名前, 上, 下)`。**色の違うものを混ぜない。**"""
    return (
        ("年と月", PAPER_Y, round(PAPER_Y + PAPER_H * 0.47)),
        ("曜日の頭", round(PAPER_Y + PAPER_H * 0.47), round(PAPER_Y + PAPER_H * 0.57)),
        ("日付", round(PAPER_Y + PAPER_H * 0.57), PAPER_Y + PAPER_H),
    )


def inkpx(ink_png: Image.Image, plain_png: Image.Image,
          ink_webp: bytes, plain_webp: bytes) -> dict[str, tuple[int, float]]:
    """**字の画素だけ**の、字と地の比。返すのは群れごとの `(測れた画素, 中央値)`。

    足を2つに分けてある。

    1. **どこが字の画素かは、組んだ絵（非可逆にする前）で決める。**
       webp は字を置いたことで**割り当てるビットが変わる**ので、字から遠い
       紙の上にも差が出る。その差は地と地の差（比 1.0 前後）なので、
       混ぜると中央値がそちらへ引っ張られる。
    2. **濃さそのものは、配る webp を読み直して測る。**
       宣言した色でも、組んだ絵でもない。**受け取る人が開くファイルの画素。**

    日付の行は、**平日の黒と土日の灰を列で分ける**——混ぜると、黒い5列が
    灰の2列を持ち上げて「薄いほうが読めない」が中央値に出なくなる。

    合否は**中央値**（下位10%はにじみを測ることになる。`CLAUDE.md`）。
    """
    pi, pp = ink_png.load(), plain_png.load()
    wi = Image.open(io.BytesIO(ink_webp)).convert("RGB").load()
    wp = Image.open(io.BytesIO(plain_webp)).convert("RGB").load()
    x0, x1 = PHOTO_X + PHOTO, PAPER_X + PAPER_W
    ends = [round(GRID_X + COL_W * c) for c in range(8)]

    out: dict[str, tuple[int, float]] = {}
    for name, top, bottom in bands():
        groups: dict[str, list[float]] = {}
        for y in range(top, bottom):
            for x in range(x0, x1):
                if sum(abs(i - j) for i, j in zip(pi[x, y], pp[x, y])) <= MOVED:
                    continue
                key = name
                if name == "日付":
                    col = next((c for c in range(7) if ends[c] <= x < ends[c + 1]), None)
                    key = "日付（土日の灰）" if col in (0, 6) else "日付（平日の黒）"
                groups.setdefault(key, []).append(contrast(wi[x, y], wp[x, y]))
        if not groups:
            out[name] = (0, 0.0)
        for key, vals in groups.items():
            vals.sort()
            out[key] = (len(vals), vals[len(vals) // 2])
    return out


# --- 焼く --------------------------------------------------------------------

def fetch() -> int:
    """元の絵のうち、**落とせるもの**を落とす。"""
    SRC.mkdir(parents=True, exist_ok=True)
    for kind, s in SOURCES.items():
        dst = SRC / s["file"]
        if dst.exists():
            print(f"在る: {dst.relative_to(REPO)}  {dst.stat().st_size:,}B")
            continue
        if not s["url"]:
            print(f"落とせない: {dst.relative_to(REPO)}（あやとから届いた絵。手で置く）")
            continue
        subprocess.run(["curl", "-fsS", "--retry", "3", "-o", str(dst), s["url"]], check=True)
        print(f"落とした: {dst.relative_to(REPO)}  {dst.stat().st_size:,}B  {s['note']}")
    return 0


def sheet_faults(sheets: dict[str, bytes]) -> list[str]:
    """3枚そろっているか・寸法と重さ。**何枚見たかを一緒に出す**（§15）。"""
    out: list[str] = []
    for kind in KINDS:
        if kind not in sheets:
            out.append(f"{kind}: 焼かれていない")
            continue
        im = Image.open(io.BytesIO(sheets[kind]))
        if abs(im.width - SHOT_W) > 1 or abs(im.height - SHOT_H) > 1:
            out.append(f"{kind}: {im.width}×{im.height}（{SHOT_W}×{SHOT_H} のはず）")
        if len(sheets[kind]) > MAX_BYTES:
            out.append(f"{kind}: {len(sheets[kind]):,}B（上限 {MAX_BYTES:,}B）")
    if len(sheets) != len(KINDS):
        out.append(f"焼けたのは {len(sheets)}枚（{len(KINDS)}枚のはず）")
    return out


#: 配る webp の枠で、目をつぶる差（1チャンネルあたり）と、その割合。
#:
#: **組んだ絵では3つの型の枠は1バイトも違わない**（同じ関数で描いて貼っている）。
#: けれど webp は非可逆なので、**隣の絵がビットの割り当てを変える。**
#: 「画素レベルで同じ」と言うのに、この幅まで測ってから言う。
PANEL_SLACK, PANEL_SLACK_RATE = 16, 0.001


def mask_photo(im: Image.Image) -> bytes:
    """**左の正方形だけを塗りつぶした**画。枠を突き合わせる相手になる。

    右の欄だけを見るのではなく、**正方形いがいの絵ぜんぶ**を見る——
    地も影もスタンドもリングも、3枚で同じでなければいけない。
    """
    got = im.copy()
    ImageDraw.Draw(got).rectangle(
        [PHOTO_X, PHOTO_Y, PHOTO_X + PHOTO - 1, PHOTO_Y + PHOTO - 1], fill=(0, 0, 0))
    return got.tobytes()


def frame_faults(canvas: dict[str, Image.Image],
                 sheets: dict[str, bytes]) -> list[str]:
    """**3つの型で、左の正方形の絵いがいが同じ画素か。**"""
    out: list[str] = []
    ref = ref_kind = ref_webp = None
    for kind in KINDS:
        if kind not in canvas:
            continue
        got = mask_photo(canvas[kind])
        shot = mask_photo(Image.open(io.BytesIO(sheets[kind])).convert("RGB"))
        if ref is None:
            ref, ref_kind, ref_webp = got, kind, shot
            continue
        if got != ref:
            diff = sum(1 for i, j in zip(got, ref) if i != j)
            out.append(f"{kind} の枠が {ref_kind} と違う（組んだ絵で {diff:,} バイト）")
        over = sum(1 for i, j in zip(ref_webp, shot) if abs(i - j) > PANEL_SLACK)
        if over > len(ref_webp) * PANEL_SLACK_RATE:
            out.append(
                f"{kind} の枠が {ref_kind} と違う"
                f"（配る webp で差 {PANEL_SLACK} 超が {over:,} / {len(ref_webp):,}）"
            )
    return out


def bake(write: bool) -> tuple[int, list[str]]:
    """3枚を組む。`write` が偽なら書き出さずに判定だけ返す（`--drill`）。"""
    faults: list[str] = []
    sheets: dict[str, bytes] = {}
    canvas: dict[str, Image.Image] = {}
    lines: list[str] = []

    g = grid(YEAR, MONTH)
    faults += grid_faults(YEAR, MONTH, g)

    for kind in KINDS:
        if BREAK == "skip" and kind == KINDS[-1]:
            continue                            # 対照: 型を1つ焼かずに済ませる
        src = SOURCES[kind]
        path = SRC / src["file"]
        if not path.exists():
            faults.append(f"{kind}: 元の絵が無い（{path.relative_to(REPO)}）")
            continue
        im = Image.open(path).convert("RGB")
        faults += square_faults(kind, im, photo_box(im, src["box"]))

        plain_png = base(kind)
        page = plain_png.copy()
        ink(page, g)
        if BREAK == "size":                     # 対照: 出す絵の寸法を変える
            plain_png = plain_png.resize((SHOT_W - 24, SHOT_H), Image.LANCZOS)
            page = page.resize((SHOT_W - 24, SHOT_H), Image.LANCZOS)
        plain = webp(plain_png)
        shot = webp(page)
        sheets[kind] = shot
        canvas[kind] = page

        got = inkpx(page, plain_png, shot, plain) if page.size == (SHOT_W, SHOT_H) else {}
        if got:
            worst = min((v[1] for v in got.values() if v[0]), default=0.0)
            if worst < MIN_CONTRAST:
                faults.append(f"{kind}: 字と地の比がいちばん低いところで {worst:.2f}")
            thin = [n for n, v in got.items() if v[0] == 0]
            if thin:
                faults.append(f"{kind}: 字が1画素も拾えなかった群れ {'・'.join(thin)}")
            lines.append(
                f"{kind}  {MONTH}月  {len(shot):,}B  "
                + "  ".join(f"{n} {v[1]:.2f}（{v[0]:,}px）" for n, v in sorted(got.items()))
            )
        else:
            lines.append(f"{kind}  {page.width}×{page.height}  {len(shot):,}B")

    faults += sheet_faults(sheets)
    faults += frame_faults(canvas, sheets)

    if write and not faults:
        OUT.mkdir(parents=True, exist_ok=True)
        for kind, data in sheets.items():
            (OUT / f"{kind}.webp").write_bytes(data)
    for line in lines:
        print(line)
    return len(sheets), faults


def main() -> int:
    if "--fetch" in sys.argv:
        return fetch()
    try:
        regular, bold = faces()
    except FileNotFoundError as e:
        print(e)
        return 2
    print(f"字: {Path(regular).name} / {Path(bold).name}")
    drill = "--drill" in sys.argv
    if BREAK:
        print(f"対照: BREAK={BREAK} を当てている（通ったら、その足は何も見ていない）")

    made, faults = bake(write=not drill)
    for f in faults:
        print(f)
    print(f"見た: {made}枚 / {len(KINDS)}枚  違反 {len(faults)}件"
          f"（{SHOT_W}×{SHOT_H}・字と地の比は {MIN_CONTRAST} 以上・"
          f"1枚 {MAX_BYTES:,}B 以下・左の正方形いがいは3枚で同じ画素）")
    if faults:
        return 1
    if made == 0:
        return 2
    if not drill:
        for kind in KINDS:
            p = OUT / f"{kind}.webp"
            print(f"焼いた: {p.relative_to(REPO)}  {p.stat().st_size:,}B")
    return 0


if __name__ == "__main__":
    sys.exit(main())
