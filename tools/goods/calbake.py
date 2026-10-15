"""SUZURI の**卓上カレンダー**（2027年1月はじまり・12ページ）を、月ごとに1枚ずつ焼く。

    python3 tools/goods/calbake.py           # 対照 → cal-src にある元絵を全部焼く
    python3 tools/goods/calbake.py --drill   # 対照だけ回して帰る（何も書かない）
    python3 tools/goods/calbake.py --print <置き場>
        # SUZURI に上げる正方形の絵（一言つき・元絵の画素数のまま）を <MM>-<x>.png で書く。
        # リポジトリには入れない

## 新しい絵が届いたら（2つだけ）

1. 元絵（**正方形**）を `tools/goods/cal-src/<MM>-<a|b|c>.png` に置く。
   `MM` は暦の月＝思い出の月の2桁（2026年5月の思い出 → `05-a.png`、
   2025年11月の思い出 → `11-a.png`）。候補が2〜3枚ある月は `-b` `-c` を足す。
   jpg / webp でもよい
2. `python3 tools/goods/calbake.py` を回す
   → `site/public/goods/calendar/<MM>-<a|b|c>.webp` が焼ける

候補が1枚に決まったら、外す側の元絵を消して回し直す（焼いたほうも消える）。
本物の絵に差し替えるときも同じ（同じ名前で置き直して回すだけ）。

**焼いた絵を面に並べる表は、もう無い。** 2026 は `/goods` に「カレンダー」の欄を
作って月ごとに並べ、レビューに使った（`content/goods.ts` の `CAL_MONTHS`）。
SUZURI に出した 2026-10-15 に欄ごと畳んで、入口は SUZURI の升目の1マスになった
（`docs/goods-calendar.md`）。来年もう一度並べてレビューするなら、欄を作るところから。

## 何を焼く道具か

あやとの言葉（2026-10-12、#759）: イラストで行く。コンセプトは
「あの時の思い出が蘇る」。**暦の N月のページに、思い出の月の正方形の
イラストが1枚載る**（暦1月＝2026年1月の思い出 … 10月＝2026年10月、
11月＝2025年11月、12月＝2025年12月）。

焼くのは**暦の N月（2027年）のページ**に、その月のイラストを貼った1枚。
**紙・リング・スタンドは全部の月で1つの関数から描く**——月ごとに枠が
違うと、並べたときに別の商品に見える。月ごとに違うのは
**左の正方形の絵と、右の暦**だけ（`frame_faults` が確かめる）。

イラスト・風景・スクショの3つを比べてもらっていたころ（2026-10-10〜12）の
元絵と焼いた3枚は消した。git の履歴には残っている。

## 絵の右下の一言（あやと 2026-10-13、#786）

絵の右下に、**その月にしたことを1行**。**画家が絵の隅に入れるサインのように**、
細い筆ペンの字で小さく置く。**名前（ayato）も年月も入れない。**

最初は太い丸文字・こげ茶の太いふち・下に年月、で重ねていた。あやと
「文字が悪目立ちしてますね」「絵画にサインしてる感じ。文字も絵になると
邪魔にならない」「日付はいらないかな」——それで、ふちを外して細く小さくし、年月の行を消した。
次に2行を1行にした（あやと「フォントは良い感じ。1行にしたい。4月だけ『トビリシにさよなら、
アルメニアへ』と『、』を入れる。それ以外いれない」）。2行をそのままつないで、間に何も入れない。

- 一言の表は `SIGNS` の1本だけ。**1か月1本の文字列**（タプルや改行で2行に戻したら落とす）
- **読点・句点・空白は入れない。** 入れてよいのは `SIGN_PAUSE` の月の、その字だけ（2027年版は4月の「、」）
- 字は **Zen Kurenaido**（`tools/goods/fonts/`、OFL。利用許諾は同じ置き場の `OFL.txt`）。
  Klee One / Zen Kurenaido / Yomogi / Yuji Syuku を同じ3か月に重ねて並べて選んだ。
  細い筆ペンの崩しで「サイン」に見えたのはこれだけだった（Klee One は鉛筆の楷書で
  教科書に、Yomogi は丸いペンでメモに、Yuji Syuku は筆が太くて題字に見えた）
- 字は生成りの白。**ふちは付けない。** 地から浮かせるのは、字の形を少しだけ太らせて
  ぼかした影ひとつ（`SIGN_SPREAD` `SIGN_BLUR`）。濃さが足りない月があっても、
  ふちに戻さず、影の濃さか置き場で直す
- 寸法は全部**絵の幅に対する割合**（字 0.026・右下から 2.2% 内側・2.5度だけ右上がり）。
  見本の絵（あやとが持ってきた、右下に細い白の筆記体）のサインと同じくらい
- 住人がいて字が体を横切る月だけ、置き場をずらす（`SIGN_NUDGE`。2027年版は4月を左へ、9・10月を下へ）。
  **絵や一言が替わったら、右下を1枚ずつ等倍で目で見る**（住人に字が掛かっていないか）。
  1行は長いので、角から離れた住人の足もとにも届く（2行から1行にした日に、9・10月が新しく掛かった）
- **読めるかは画素で測る**（`sign_ink`）。影だけの絵と字ありの絵を作り、
  字の画素どうしの比の**中央値**が `MIN_CONTRAST` を割ったら落とす。
  1行にした 2026-10-14 の12枚でいちばん低いのは7月（提灯の光の上）で、刷る絵で 8.3・`/goods` の webp で 5.6
- **表の字が字体に無かったら落とす**（`sign_glyph_faults`。豆腐の箱を刷らない）。
  字体は削らずに丸ごと置いてあるので来年の一言もたいてい通るが、珍しい漢字は無いことがある
- **重ねるのは元絵を読んだあと、`compose` に入る前。元絵のファイルは書き換えない。**
  元絵の画素数のまま重ねてから縮めるので、紙に貼った絵と `--print` の絵が同じ字になる
- 表に無い月は重ねない。そのうえで**違反に出す**（12枚のうち1枚だけ字が無い、を黙って刷らない）

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

**元絵は切らない。** 正方形でなければ焼かずに落とす（どこで切るかは
絵を見て人が決めることで、道具が勝手に決めると顔や字が欠ける）。

遠近（斜め）は付けない。**正面から見た図にする**——歪ませると下手に見えるし、
歪んだぶんだけ「月をまたいで枠が同じ」が確かめにくくなる。

## 値段も寸法も、絵の中に書かない

`docs/island-standards.md` 16章。他所の値段を島の面に焼くと、向こうが
変えた日から嘘になる。SUZURI の用紙（**178mm × 127mm**）は、
**紙の形を決めるためだけ**に使う。「◯年◯月の思い出」も紙には刷らない——
実物の紙に刷られるのは絵と暦だけ（「◯月の思い出」の見出しは、2026 は `/goods` の欄の字が持っていた）。

## 枠はブラウザで描かない

ブラウザを起こすと、**同じ枠を描くたびに1画素ずれる余地**ができる
（字詰め・端数・描画の版）。ここは PIL で1回だけ組んで（`frame`）、
**全部の月に同じ画素を貼る**——「枠が同じ」は作りから出てくる。

カレンダーの姿（影・スタンド・紙・リング）は **3倍で描いてから縮める。**
等倍で円弧を描くと、リングの20本が1本ずつ違う形にギザつく。

## 字は箱のサンセリフを読む

出すのは数字と `S M T W T F S` だけなので、**かなも漢字も要らない。**
リポジトリの丸ゴシック（`site/public/fonts/maru-*.woff2`）は使わない——
実物はグロテスクで、丸ゴシックにすると別物になる。

箱に入っているものを上から順に探して、1組も無ければ **2 で落ちる**
（黙って別の字で焼くと、焼き直した日に枠が変わる）。

## 置き場

| | どこ |
| --- | --- |
| 元の絵（**配らない**） | `tools/goods/cal-src/<MM>-<a|b|c>.<png|jpg|jpeg|webp>` |
| 焼いたもの（**配るのはこちら**） | `site/public/goods/calendar/<MM>-<a|b|c>.webp` |

`cal-src/` に**名前の決まりに合わないファイルがあったら落とす**（`05.png`
`5月.png` のような置きかたを、黙って焼かずに済ませない）。
焼いた置き場にある `<MM>-<x>.webp` のうち、元絵の無いものは**消す**
（外した候補が配られ続けないように）。

## 対照（いつも先に回る。`--drill` はそこで帰る）

0＝通った / 1＝見つかった / 2＝数えるものが無い（対照そのものが外れた・元絵が無い）。

**毎 PR で回っている**——`site/selftest/calendar_selftest.mjs` が `--drill` を
起こし、通ること・`BREAK=shift` で 1 になることを見る（面の表を見る足は、
欄を畳んだ 2026-10-15 に外した。残っているのはこの道具の対照だけ）。

**元絵が1枚も無くても回る。** こちらで描いた正方形の絵（`toy`）を2つの月に
貼って、**本物と同じ道**（`compose`）を通す。対照だけ別の道で組むと、
対照が通っても本物の道が壊れていることがある。

いつも当てるもの（両側から。外れたら本物を焼かずに 2）:

- **答えを知っている曜日**（`ANCHORS`）。2027-01-01 は金曜、など12か月ぶん。
  `grid_faults` は `datetime` に1日ずつ聞き直すが、それは**表を作る式と
  同じ道具**なので、暦の外で決まっている答えを別に持つ
- 名前の決まり: 通るもの4つ（`05-a.png` `12-c.jpg` …）と、
  落ちるもの8つ（`5-a.png` `13-a.png` `05-d.png` `05.png` `illust.png` …）
- 思い出の年月: 暦1・5・10月は 2026年、11・12月は 2025年
- 正方形の判定: 1024×1024 と 943×943 は通り、1024×768 と 200×200（小さすぎる）は落ちる
- 大きさの違う元絵（1024 と 943）を2つの月に貼って、**焼いた物が同じ寸法に揃う**
  こと（元絵の寸法は月ごとに違ってよい。見張りが見るのは焼いた物の寸法）

足を `BREAK=` で1本ずつ折れる（折って 1 が返れば拾えている。
**拾えなかったら 2**——その足は何も見ていない）。

| `BREAK=` | 何を壊すか | どの判定が拾うか |
| --- | --- | --- |
| `shift` | 曜日の表を1日ずらす | `grid_faults`（`datetime`）と `anchor_faults`（答えを知っている曜日） |
| `size` | 出す絵の寸法を変える | `sheet_faults` が 890×760 を見る |
| `square` | 対照の絵を正方形でなくする | `square_faults` |
| `frame` | 2つめの月だけ紙の色を変える | `frame_faults`（左の正方形いがいが、月をまたいで同じ画素か） |
| `sign` | 一言を重ねたことにして重ねない | `sign_faults`（右下の画素が重ねる前と違うか・字の比）と、紙に貼った絵の右下 |
| `signdim` | 影を消し、字を地にほぼ溶かす | `sign_faults`（字の画素の比の中央値） |
| `signrows` | 12月の一言を改行で2行に戻す | `sign_table_faults`（1行）と `signed`（1行でない月は重ねずに違反） |
| `signmiss` | 12月の一言を表から抜く | `sign_table_faults`（12か月そろう）と `signed`（表に無い月） |

一言の表の見張りは、`BREAK=` とは別に**いつも**壊した表11（12月が無い・改行で2行・
タプルで2行・ayato 入り・空・9月に読点／句点／空白／全角の空白・4月の読点を句点に・13月）と、
字体に無い字を混ぜた表を当てて、それぞれの理由で落ちることを見る。2行に戻った月を
本物と同じ道（`signed`）に通して、**重ねずに違反に出る**ことも見る。

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
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent          # tools/goods/
REPO = HERE.parent.parent

SRC = HERE / "cal-src"
OUT = REPO / "site" / "public" / "goods" / "calendar"

# --- 出す絵 ------------------------------------------------------------------
#: 配る絵の寸法。2026 は `/goods` の欄（`content/goods.ts` の `CAL_SHOT_W/H`。
#: 欄ごと畳んだ）がこの数で場所を取っていた。いまこの数を読む面は無い。
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

#: 暦の年。**2027年1月はじまりの12ページ**（#759）。
YEAR = 2027

#: 1枚の上限（バイト）。配る絵なので、ここを越えたら質を下げるのではなく
#: **越えたことを言って落ちる**——黙って月ごとに質を変えると、枠の画素が揃わなくなる。
#: （2026-10-12、ポスターのイラストを貼った1枚で 9万バイト前後）
MAX_BYTES = 120_000
#: webp の質。**全部の月で同じ値で焼く。** 1枚ごとに変えると枠が画素で揃わない。
QUALITY = 84

#: 字と地の比。これを割ったら落ちる（`docs/island-standards.md` の出す前のチェック）。
MIN_CONTRAST = 4.5

# --- 色 ----------------------------------------------------------------------
#: 地。島の紙の面（`--ground-paper`）をそのまま写す。**ここを別の色にすると、
#: `/goods` の紙の上で「貼った白い箱」に見える。**
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
#: 当てた値（2026-10-10、スクショの型の焼いた画素・中央値。土日 ／ 曜日の頭）:
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

#: 対照のときだけ立てる、壊しかた（`BREAK=shift|size|square|frame|sign|signdim|signrows|signmiss`）。
BREAK = os.environ.get("BREAK", "")


# --- 元絵の名前 --------------------------------------------------------------
#: `<MM>-<a|b|c>.<拡張子>`。**MM は暦の月＝思い出の月**（月の数は同じで、
#: 年だけが違う。暦11月・12月の思い出は 2025年）。候補は3枚まで。
NAME = re.compile(r"^(0[1-9]|1[0-2])-([abc])\.(png|jpe?g|webp)$")


def parse_name(name: str) -> tuple[int, str] | None:
    """元絵の名前から `(暦の月, 候補の字)`。決まりに合わなければ None。"""
    m = NAME.match(name)
    if not m:
        return None
    return int(m.group(1)), m.group(2)


def out_name(month: int, pick: str) -> str:
    """焼いた1枚の名前（`site/public/goods/calendar/` の中）。"""
    return f"{month:02d}-{pick}.webp"


def memory_of(month: int) -> tuple[int, int]:
    """暦の N月のページに載る、思い出の年月（あやと 2026-10-12）。

    暦1〜10月 → 2026年の同じ月、暦11・12月 → 2025年の同じ月。
    ここでは焼いたときに端末へ出す行にだけ使う（絵には刷らない。あやと 2026-10-13「日付はいらない」）。
    """
    return (2026 if month <= 10 else 2025), month


# --- 右下の一言 ---------------------------------------------------------------
#: 絵の右下に、**その月にしたことを手書きサイン風に1行で**（あやと 2026-10-13、#786）。
#: 暦の月 → 1行。11・12月は 2025年の思い出、ほかは 2026年（`memory_of`）。
#: **この表が一言の置き場の1本。** 面の alt は持たない（絵の中の字なので）。
#:
#: 最初は2行（「バトゥミで／アリロの行列を追いかけた」）に割っていた。あやと
#: 「フォントは良い感じ。1行にしたい」——サインは1本の線で書くもので、2行だと
#: 字の塊が角に積もって「添え書き」に見える。2行をそのままつないで、間に何も入れない。
SIGNS: dict[int, str] = {
    1: "バトゥミでアリロの行列を追いかけた",
    2: "半年住んだバトゥミとケバブでお別れ会",
    3: "トビリシの春にメレンゲクロワッサン",
    4: "トビリシにさよなら、アルメニアへ",
    5: "イランの国境まで380km歩いた",
    6: "トビリシの空をロープウェイで散歩",
    7: "ジョージアでイワシ祭り",
    8: "カズベキの山ごもりからトビリシに帰ってきた",
    9: "スウェーデンまで北欧ヒッチハイク旅",
    10: "北欧からバルカン半島へ",
    11: "黒海の夕日を見ながらアプリ作り",
    12: "大雨のバトゥミでW年越しジャンプ",
}
#: 区切りの記号と空白。**入れてよいのは下の `SIGN_PAUSE` の月の、その字だけ。**
#: 1行にすると切れ目が無くなるので、つい読点や空白を足したくなる。あやと
#: 「4月だけ『、』を入れる。それ以外いれない」——足していいかは、こちらが決めない。
SIGN_PUNCT = "、。，．,.､｡・"
#: 区切りを入れてよい月と、その字。4月は「さよなら」と「アルメニアへ」で
#: 気持ちが切り替わるので、そこだけ息つぎを入れる（あやと 2026-10-13）。
SIGN_PAUSE: dict[int, str] = {4: "、"}
#: 名前は入れない（あやと 2026-10-13）。試作に入っていたので、戻ってきたら落とす。
SIGN_NG = ("ayato",)

#: 字。**細い筆ペンの崩し字**（Zen Kurenaido、Google Fonts の OFL。利用許諾は
#: 同じ置き場の `OFL.txt`）。画家が絵の隅に入れるサインに見えるように（あやと
#: 2026-10-13「絵画にサインしてる感じ」）。候補4つを同じ3か月に重ねて選んだ。
SIGN_FONT = HERE / "fonts" / "ZenKurenaido-Regular.ttf"
#: 寸法は全部**絵の幅に対する割合**。元絵の大きさが違っても同じ見た目になる。
#: 0.026 は、見本の絵（右下に細い白の筆記体）のサインと同じくらいの背。
#: 前の丸文字は 0.046 で、絵の右下を半分近く占めて悪目立ちした。
SIGN_SIZE = 0.026          # 字の大きさ
SIGN_PAD = 0.02            # 字のまわりに取る余白（影が切れないように）
SIGN_INSET = 0.022         # 右下の角からどれだけ内側に置くか
SIGN_TILT = 2.5            # 傾き（度。右上がり）。サインらしさのぶんだけ、ほんの少し
#: 月ごとの置き場のずらし（絵の幅に対する割合。左へは負・下へは正）。**住人の顔や体に字が掛かる月だけ。**
#: 1行にすると字が左へ長く伸びるので、角から離れた住人の足もとにも届く（2026-10-14、12枚を等倍で見て決めた）。
#:
#: - 4月: 右下の角にハリネズミの住人が座っていて、角に寄せると字が体を横切る。
#:   左へずらして、住人の手前（椅子と敷物の上）に置く。1行でも住人の左に（元絵 1254px で）30px あまり空く
#: - 9月: 字の頭（「ス」）が柴犬の住人の前足に掛かる。左へは逃げられない（住人が左にいる）ので、
#:   少し下げて岸壁の石の上に置く
#: - 10月: 字の頭（「北欧から」）が、石段に座る女の子の住人の草履に掛かる。右へは寄せきっているので、
#:   下げて石垣の上に置く
#:
#: 下げても絵からははみ出さない（いちばん下の10月で、置き場の下端が絵の幅の 0.995）。
SIGN_NUDGE: dict[int, tuple[float, float]] = {
    4: (-0.11, 0.0),
    9: (0.0, 0.012),
    10: (0.0, 0.018),
}
#: 字は生成りの白。**ふちは付けない**（太いふちが「貼った字」に見えた）。
SIGN_INK = (250, 246, 236)
#: 地から浮かせる影。字の形を `SIGN_SPREAD` だけ太らせてから `SIGN_BLUR` でぼかす。
#: ぼかしだけだと細い線の影は薄すぎて、提灯の光（7月）の上で字が消える。
#: 太らせる幅は線の太さと同じくらいまで——それより広げると、ふちに見えてくる。
#: 濃さが足りない月が出たら、`SIGN_SHADOW_ALPHA` か置き場で直す（ふちに戻さない）。
SIGN_SHADOW = (24, 14, 6)
SIGN_SPREAD = 0.0025
SIGN_BLUR = 0.007
SIGN_SHADOW_ALPHA = 1.3    # ぼかした影の濃さに掛ける数（1.0 だと /goods の webp で7月が 3.8。1.6 で影が煤けて見えた）
#: 重ねた置き場のうち、これだけは画素が動いているはず（字と影。`sign_faults`）。
SIGN_MOVED_MIN = 0.10
#: 字体に無い字を見分ける物差し。**どの字体にも字形の無い私用領域**の2文字。
#: 無い字は、これと同じ「字形の無い印」（.notdef）で描かれる。
NO_GLYPH = ("\ue000", "\U000f0000")


def line_faults(m: int, line) -> list[str]:
    """1か月ぶんの一言が**1行で描ける1本の文字列か。** 違えば理由を返す。

    表の決まり（`sign_table_faults`）と、描く手前（`signed`）の両方がこれを読む。
    タプルや改行のまま描く道へ入れると、2行に戻るか PIL が投げるかのどちらかになる。
    """
    if not isinstance(line, str):
        n = len(line) if isinstance(line, (tuple, list)) else "?"
        return [f"暦{m}月の一言が1本の文字列でない（{type(line).__name__} で {n}行。1行で書く）"]
    if "\n" in line or "\r" in line:
        return [f"暦{m}月の一言に改行がある（{len(line.splitlines())}行。1行で書く）"]
    return []


def sign_table_faults(table: dict[int, str] = SIGNS) -> list[str]:
    """一言の表そのものの決まり。**12か月そろって、1か月1行、区切りは4月の「、」だけ、名前が無い。**"""
    out: list[str] = []
    for m in range(1, 13):
        if m not in table:
            out.append(f"一言の表に暦{m}月が無い")
    for m, line in table.items():
        if m not in range(1, 13):
            out.append(f"一言の表に暦{m}月という月がある")
            continue
        bad = line_faults(m, line)
        if bad:
            out += bad
            continue
        if not line.strip():
            out.append(f"暦{m}月の一言が空")
            continue
        allowed = SIGN_PAUSE.get(m, "")
        if any(ch.isspace() for ch in line):
            out.append(f"暦{m}月の一言に空白が入っている（「{line}」。間に何も入れない）")
        stray = sorted({ch for ch in line if ch in SIGN_PUNCT and ch not in allowed})
        if stray:
            out.append(f"暦{m}月の一言に読点・句点 {' '.join(stray)} が入っている"
                       f"（「{line}」。入れてよいのは SIGN_PAUSE の月だけ）")
        for ng in SIGN_NG:
            if ng in line.lower():
                out.append(f"暦{m}月の一言に {ng} が入っている（名前は入れない）")
    for m in SIGN_NUDGE:
        if m not in range(1, 13):
            out.append(f"一言のずらし（SIGN_NUDGE）に暦{m}月という月がある")
    for m in SIGN_PAUSE:
        if m not in range(1, 13):
            out.append(f"区切りを許す月（SIGN_PAUSE）に暦{m}月という月がある")
    return out


def missing_glyphs(text: str, path: Path = SIGN_FONT) -> list[str]:
    """`text` のうち、字体に字形が無い字（刷ると豆腐の箱か空白になる）。

    PIL には「この字はあるか」を聞く口が無いので、**描いて比べる。**
    無い字は、字形の無い印（`NO_GLYPH`）と同じ画素で描かれる。
    物差しの2文字どうしが違う形で描かれたら、物差しそのものが外れている（投げる）。
    """
    f = ImageFont.truetype(str(path), 48)

    def shape(ch: str):
        m = f.getmask(ch)
        return m.size, bytes(m)

    blanks = {shape(ch) for ch in NO_GLYPH}
    if len(blanks) != 1:
        raise ValueError(f"{path.name} が私用領域に字形を持っている（字体に無い字を見分けられない）")
    return sorted({ch for ch in text if ch.strip() and shape(ch) in blanks})


def sign_glyph_faults(table: dict[int, str], path: Path = SIGN_FONT) -> list[str]:
    """表の字が、全部**一言の字体にあるか。**"""
    out: list[str] = []
    for m, line in sorted(table.items()):
        lost = missing_glyphs(line if isinstance(line, str) else "".join(line), path)
        if lost:
            out.append(f"暦{m}月の一言の {' '.join(lost)} が字体 {path.name} に無い"
                       "（刷ると箱になる。言い換えるか、字のある字体にする）")
    return out


def signs() -> dict[int, str]:
    """焼くときに使う表。**対照のときだけ、ここで壊す**（`BREAK=signrows|signmiss`）。"""
    table = dict(SIGNS)
    if BREAK == "signrows":
        table[12] = "大雨のバトゥミで\nW年越しジャンプ"   # 対照: 12月だけ2行に戻す
    if BREAK == "signmiss":
        table.pop(12)                            # 対照: 12月の一言を抜く
    return table


def sign(im: Image.Image, line: str, ink: bool = True,
         nudge: tuple[float, float] = (0.0, 0.0)):
    """絵の右下に一言を**1行で**重ねた**新しい絵**、重ねた場所 `(x0, y0, x1, y1)`、字の覆い（絵の座標）。

    **元の絵は書き換えない。** `ink=False` なら影だけを重ねる——字の濃さを測るとき、
    これが「その字が乗っている地そのもの」になる（`sign_ink`）。
    1行かどうかは呼ぶ側（`signed`）が先に見る。
    """
    out = im.convert("RGBA")
    W = out.width
    font = ImageFont.truetype(str(SIGN_FONT), round(W * SIGN_SIZE))
    width = ImageDraw.Draw(out).textlength(line, font=font)
    pad = round(W * SIGN_PAD)
    bw = math.ceil(width) + pad * 2
    bh = round(font.size * 1.3) + pad * 2

    # 字の形だけの覆い。1行を右寄せで
    mask = Image.new("L", (bw, bh), 0)
    ImageDraw.Draw(mask).text((bw - pad - width, pad), line, font=font, fill=255)

    reach = max(1, round(W * SIGN_SPREAD))
    shade = mask.filter(ImageFilter.MaxFilter(reach * 2 + 1)).filter(
        ImageFilter.GaussianBlur(W * SIGN_BLUR)).point(
        lambda a: min(255, round(a * SIGN_SHADOW_ALPHA)))
    letters = mask
    if BREAK == "signdim":                       # 対照: 影を消し、字を地にほぼ溶かす
        shade = Image.new("L", mask.size, 0)
        letters = mask.point(lambda a: a // 12)
    piece = Image.new("RGBA", (bw, bh), SIGN_SHADOW + (0,))
    piece.putalpha(shade)
    if ink:
        layer = Image.new("RGBA", (bw, bh), SIGN_INK + (0,))
        layer.putalpha(letters)
        piece.alpha_composite(layer)
    piece = piece.rotate(SIGN_TILT, resample=Image.BICUBIC, expand=True)
    mask = mask.rotate(SIGN_TILT, resample=Image.BICUBIC, expand=True)

    x0 = int(W - piece.width - W * SIGN_INSET + W * nudge[0])
    y0 = int(out.height - piece.height - W * SIGN_INSET + W * nudge[1])
    box = (x0, y0, x0 + piece.width, y0 + piece.height)
    cover = Image.new("L", out.size, 0)
    if BREAK != "sign":                          # 対照: 重ねたことにして重ねない
        # 外にはみ出す置きかたは `sign_faults` が落とすので、ここでは切らずに投げる
        out.alpha_composite(piece, (max(0, x0), max(0, y0)))
    cover.paste(mask, (x0, y0))
    return out.convert("RGB"), box, cover


#: 字の画素とみなす、字の覆いの濃さ（0〜255）。線の芯だけを数える。
#: 下げると線のふちのにじみを数えて、比が地の側に引っ張られる。
SIGN_CORE = 160


def sign_ink(after: Image.Image, ground: Image.Image, cover: Image.Image) -> tuple[int, float]:
    """一言の**字の画素だけ**の、字と地の比。返すのは `(測れた画素, 中央値)`。

    地は**影だけ重ねた絵の同じ画素**（`CLAUDE.md`「文字の濃さ」の2枚撮り）。
    字の色は宣言した値ではなく、重ねたあとの画素から読む。合否は中央値。
    """
    box = cover.getbbox()
    if box is None:
        return 0, 0.0
    a, g, m = after.load(), ground.load(), cover.load()
    vals = sorted(contrast(a[x, y], g[x, y])
                  for y in range(box[1], box[3]) for x in range(box[0], box[2])
                  if m[x, y] >= SIGN_CORE)
    return len(vals), (vals[len(vals) // 2] if vals else 0.0)


def sign_faults(name: str, before: Image.Image, after: Image.Image, box,
                ink: tuple[int, float] | None = None) -> list[str]:
    """重ねた一言が、**右下に、欠けずに、確かに、読める濃さで描かれたか**を画素で見る。"""
    out: list[str] = []
    W, H = before.size
    x0, y0, x1, y1 = box
    if x0 < 0 or y0 < 0 or x1 > W or y1 > H:
        out.append(f"{name}: 一言が絵からはみ出す（置き場 {box}、絵 {W}×{H}）")
        return out
    if x0 < W * 0.35 or y0 < H * 0.55:
        out.append(f"{name}: 一言が右下に収まっていない（置き場 {box}、絵 {W}×{H}）")
    a = before.convert("RGB").crop(box).tobytes()
    b = after.convert("RGB").crop(box).tobytes()
    moved = sum(1 for i in range(0, len(a), 3)
                if abs(a[i] - b[i]) + abs(a[i + 1] - b[i + 1]) + abs(a[i + 2] - b[i + 2]) > MOVED)
    area = (x1 - x0) * (y1 - y0)
    # 細い字でも、影ごとなら置き場の1割は塗り替わる（本物の12枚で 30〜52%。2026-10-13）
    if moved < area * SIGN_MOVED_MIN:
        out.append(f"{name}: 右下の画素が、重ねる前とほとんど同じ（動いた {moved:,} / {area:,}px）")
    if ink is not None:
        n, med = ink
        if n == 0:
            out.append(f"{name}: 一言の字の画素が1つも拾えなかった")
        elif med < MIN_CONTRAST:
            out.append(f"{name}: 一言の字と地の比が中央値で {med:.2f}（{MIN_CONTRAST} を割った。"
                       "ふちには戻さず、影の濃さか置き場で直す）")
    # 置き場の外は1画素も変えない（左上に何か漏れたら、それは一言ではない）
    outside = before.convert("RGB").copy()
    outside.paste((0, 0, 0), box)
    rest = after.convert("RGB").copy()
    rest.paste((0, 0, 0), box)
    if outside.tobytes() != rest.tobytes():
        out.append(f"{name}: 一言の置き場の外の画素が変わった")
    return out


def signed(name: str, month: int, im: Image.Image,
           table: dict[int, str] | None = None):
    """元絵に一言を重ねた絵、違反、字の比 `(画素, 中央値)`。
    **本物も対照も `--print` も、この1本を通る。**

    表に無い月は**重ねずに返す**——そのうえで違反に出す（黙って一言の無い月を
    焼くと、12枚のうち1枚だけ字の無いページが刷られる）。1行でない月も同じ
    （2行に戻ったものを、黙って1行に繋いだり割ったりして刷らない）。
    """
    table = signs() if table is None else table
    line = table.get(month)
    if not line:
        return im.convert("RGB"), [f"{name}: 暦{month}月の一言が表に無い（重ねずに焼いた）"], (0, 0.0)
    bad = line_faults(month, line)
    if bad:
        return im.convert("RGB"), [f"{name}: {b}（重ねずに焼いた）" for b in bad], (0, 0.0)
    nudge = SIGN_NUDGE.get(month, (0.0, 0.0))
    after, box, cover = sign(im, line, nudge=nudge)
    ground, _, _ = sign(im, line, ink=False, nudge=nudge)
    ink = sign_ink(after, ground, cover)
    return after, sign_faults(name, im, after, box, ink), ink


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

#: **暦の外で決まっている答え。** 2027年の各月の1日が、日曜はじまりの何列目か
#: （0=S 1=M 2=T 3=W 4=T 5=F 6=S）。2027-01-01 が金曜であることから
#: 月の日数を足して手で数えた（2026-10-12）。
#: `grid_faults` は `datetime` に聞き直すので、**表を作る式と同じ道具を使っている。**
#: こちらは道具に聞かない答えなので、`datetime` の使いかたを間違えても外れる。
ANCHORS = {1: 5, 2: 1, 3: 1, 4: 4, 5: 6, 6: 2, 7: 4, 8: 0, 9: 3, 10: 5, 11: 1, 12: 3}


def days_in(year: int, month: int) -> int:
    """その月の日数。**表を作る式とは別に数える**（対照がここを使う）。"""
    nxt = datetime.date(year + (month == 12), month % 12 + 1, 1)
    return (nxt - datetime.date(year, month, 1)).days


def grid(year: int, month: int) -> list[list[int]]:
    """日曜はじまりの 6×7。空きは 0。

    6行で固定するのは、**月によって表の背が変わらないようにする**ため
    （2027年1月は金曜はじまりの31日で、6行目まで使う）。
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
    if len(g) != 6:
        out.append(f"{month}月: 表が {len(g)}行（6行のはず）")
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


def anchor_faults(year: int, month: int, g: list[list[int]]) -> list[str]:
    """1日が、**答えを知っている列**に置いてあるか（`ANCHORS`）。"""
    if year != 2027:
        return [f"答えを知っているのは 2027年だけ（{year}年を焼こうとした）"]
    want = ANCHORS[month]
    got = next((c for c, day in enumerate(g[0]) if day == 1), None) if g else None
    if got != want:
        where = "1行目に無い" if got is None else f"{got + 1}列目にある"
        return [f"2027年{month}月1日 は {WEEK[want]}（左から{want + 1}列目）のはずが、{where}"]
    return []


# --- 左の絵 ------------------------------------------------------------------

def square_faults(name: str, im: Image.Image) -> list[str]:
    """元絵が**正方形で、貼る大きさより小さくないか。**

    SUZURI に上げる絵は正方形の枠に入るので、ここが 1:1 でないと
    **刷ったときに絵が伸びる。** 切って合わせることはしない（頭に書いた理由）。
    **元絵の大きさは月ごとに違ってよい**（943〜1024px が届いている）。
    焼くときに `PHOTO` 角へ揃えるので、配るものの寸法は `sheet_faults` が見る。
    """
    out: list[str] = []
    w, h = im.size
    off = abs(w - h) / max(w, h)
    if off > 0.005:
        out.append(f"{name}: 元絵が {w}×{h} で正方形から {off * 100:.1f}% ずれている"
                   f"（SUZURI に上げる絵は正方形。切りかたを決めてから置き直す）")
    if min(w, h) < PHOTO:
        out.append(f"{name}: 元絵が {w}×{h} で小さすぎる"
                   f"（貼る大きさ {PHOTO}px より小さいと、引き伸ばして眠くなる）")
    return out


# --- カレンダーの姿 ----------------------------------------------------------
#: 影・スタンド・紙・リングを描くときの倍率。**等倍で円弧を描くと、
#: リング20本が1本ずつ違う形にギザつく。**
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


def body(layer: Image.Image, sheet_top=SHEET_TOP) -> None:
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
    vgrad(d, (px, py, px + pw, py + ph), sheet_top, SHEET_BOTTOM)
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


#: 枠（地・影・スタンド・紙・リング）は全部の月で同じなので、1回だけ描いて使い回す
#: （地を1画素ずつ塗るので、1回に数秒かかる）。
_FRAMES: dict[tuple, Image.Image] = {}


def frame(sheet_top=SHEET_TOP) -> Image.Image:
    """字も絵も置いていない枠。"""
    key = tuple(sheet_top)
    if key not in _FRAMES:
        page = Image.new("RGB", (SHOT_W, SHOT_H), GROUND_IN)
        ground(page)
        layer = Image.new("RGBA", (SHOT_W * SS, SHOT_H * SS), (0, 0, 0, 0))
        body(layer, sheet_top)
        page.paste(Image.alpha_composite(
            page.convert("RGBA"),
            layer.resize((SHOT_W, SHOT_H), Image.LANCZOS)).convert("RGB"), (0, 0))
        _FRAMES[key] = page
    return _FRAMES[key].copy()


def base(im: Image.Image, sheet_top=SHEET_TOP) -> Image.Image:
    """字を1文字も置いていない1枚。**濃さを測るとき、これが「地」になる。**

    元絵の大きさは月ごとに違う（943〜1024px）。ここで `PHOTO` 角に揃える。
    """
    page = frame(sheet_top)
    page.paste(im.convert("RGB").resize((PHOTO, PHOTO), Image.LANCZOS), (PHOTO_X, PHOTO_Y))
    return page


def ink(page: Image.Image, month: int, g: list[list[int]]) -> None:
    """字を置く。**ここに絵は1つも描かない**（`base` との差が字の画素になる）。"""
    regular, bold = faces()
    d = ImageDraw.Draw(page)

    text(d, (GRID_CX, PAPER_Y + PAPER_H * MONTH_MID), str(month),
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

def sheet_faults(name: str, shot: bytes) -> list[str]:
    """配る1枚の寸法と重さ。**見るのは焼いた物**（元絵の寸法は月ごとに違ってよい）。"""
    out: list[str] = []
    im = Image.open(io.BytesIO(shot))
    if abs(im.width - SHOT_W) > 1 or abs(im.height - SHOT_H) > 1:
        out.append(f"{name}: {im.width}×{im.height}（{SHOT_W}×{SHOT_H} のはず）")
    if len(shot) > MAX_BYTES:
        out.append(f"{name}: {len(shot):,}B（上限 {MAX_BYTES:,}B）")
    return out


#: 配る webp の枠で、目をつぶる差（1チャンネルあたり）と、その割合。
#:
#: **組んだ絵では月どうしの枠は1バイトも違わない**（同じ `frame` を貼っている）。
#: けれど webp は非可逆なので、**隣の絵がビットの割り当てを変える。**
#: 「画素レベルで同じ」と言うのに、この幅まで測ってから言う。
PANEL_SLACK, PANEL_SLACK_RATE = 16, 0.001


def mask_photo(im: Image.Image) -> bytes:
    """**左の正方形だけを塗りつぶした**画。枠を突き合わせる相手になる。

    突き合わせるのは**字を置く前の絵**（`base`）どうし——右の暦は月ごとに
    違って当然なので、字の無い絵で**正方形いがいの絵ぜんぶ**
    （地・影・スタンド・紙・リング）を見る。
    """
    got = im.copy()
    ImageDraw.Draw(got).rectangle(
        [PHOTO_X, PHOTO_Y, PHOTO_X + PHOTO - 1, PHOTO_Y + PHOTO - 1], fill=(0, 0, 0))
    return got.tobytes()


def frame_faults(plains: dict[str, tuple[Image.Image, bytes]]) -> list[str]:
    """**月をまたいで、左の正方形の絵いがいが同じ画素か。**"""
    out: list[str] = []
    ref = ref_name = ref_webp = None
    for name, (canvas, shot) in plains.items():
        got = mask_photo(canvas)
        sent = mask_photo(Image.open(io.BytesIO(shot)).convert("RGB"))
        if ref is None:
            ref, ref_name, ref_webp = got, name, sent
            continue
        if got != ref:
            diff = sum(1 for i, j in zip(got, ref) if i != j)
            out.append(f"{name} の枠が {ref_name} と違う（組んだ絵で {diff:,} バイト）")
        over = sum(1 for i, j in zip(ref_webp, sent) if abs(i - j) > PANEL_SLACK)
        if over > len(ref_webp) * PANEL_SLACK_RATE:
            out.append(f"{name} の枠が {ref_name} と違う"
                       f"（配る webp で差 {PANEL_SLACK} 超が {over:,} / {len(ref_webp):,}）")
    return out


def compose(name: str, month: int, im: Image.Image, sheet_top=SHEET_TOP):
    """1枚を組んで、判定を当てる。

    返すのは `(配る webp, 字なしの組み, 字なしの webp, 違反, 印字する1行)`。
    **本物も対照も、この1本を通る。**
    """
    faults: list[str] = []
    g = grid(YEAR, month)
    faults += grid_faults(YEAR, month, g)
    faults += anchor_faults(YEAR, month, g)
    faults += square_faults(name, im)

    plain_png = base(im, sheet_top)
    page = plain_png.copy()
    ink(page, month, g)
    if BREAK == "size":                         # 対照: 出す絵の寸法を変える
        plain_png = plain_png.resize((SHOT_W - 24, SHOT_H), Image.LANCZOS)
        page = page.resize((SHOT_W - 24, SHOT_H), Image.LANCZOS)
    plain = webp(plain_png)
    shot = webp(page)
    faults += sheet_faults(name, shot)

    line = f"{name}  {len(shot):,}B"
    if page.size == (SHOT_W, SHOT_H):
        got = inkpx(page, plain_png, shot, plain)
        worst = min((v[1] for v in got.values() if v[0]), default=0.0)
        if worst < MIN_CONTRAST:
            faults.append(f"{name}: 字と地の比がいちばん低いところで {worst:.2f}")
        thin = [n for n, v in got.items() if v[0] == 0]
        if thin:
            faults.append(f"{name}: 字が1画素も拾えなかった群れ {'・'.join(thin)}")
        line += "  " + "  ".join(f"{n} {v[1]:.2f}（{v[0]:,}px）" for n, v in sorted(got.items()))
    return shot, plain_png, plain, faults, line


def sources() -> tuple[list[tuple[int, str, Path]], list[str]]:
    """`cal-src/` の元絵。`(暦の月, 候補の字, 道)` の並びと、名前の違反。"""
    found: list[tuple[int, str, Path]] = []
    faults: list[str] = []
    seen: dict[tuple[int, str], Path] = {}
    if not SRC.exists():
        return found, faults
    for p in sorted(SRC.iterdir()):
        if p.name.startswith(".") or not p.is_file():
            continue
        key = parse_name(p.name)
        if key is None:
            faults.append(f"{p.relative_to(REPO)}: 名前が決まり（<MM>-<a|b|c>.png）に合わない")
            continue
        if key in seen:
            faults.append(f"{p.relative_to(REPO)}: {seen[key].name} と同じ月・同じ候補")
            continue
        seen[key] = p
        found.append((key[0], key[1], p))
    return found, faults


# --- 対照 --------------------------------------------------------------------

def toy(size=(1024, 1024), hue=0) -> Image.Image:
    """対照に貼る絵。**こちらで描いた正方形**（本物の元絵が1枚も無くても回るように）。

    のっぺりした1色だと webp が軽すぎて重さの判定に何も当たらないので、
    イラストらしく色の塊と線を散らす。乱数は使わない（毎回同じ絵）。
    """
    w, h = size
    im = Image.new("RGB", size, (250, 240, 214))
    d = ImageDraw.Draw(im)
    palette = [(233, 96, 70), (246, 196, 64), (60, 140, 90), (40, 80, 160), (240, 150, 170)]
    for i in range(36):
        c = palette[(i + hue) % len(palette)]
        x = (i * 173) % w
        y = (i * 97 + hue * 31) % h
        r = 30 + (i * 37) % 90
        d.ellipse([x - r, y - r, x + r, y + r], fill=c)
    for i in range(0, w, 64):
        d.line([(i, 0), (w - i, h)], fill=(30, 30, 30), width=3)
    return im


def drill() -> list[str]:
    """**本物を1枚も焼く前に**回す対照。外れた中身を返す（空なら通った）。"""
    bad: list[str] = []

    # (1) 名前の決まり。**両側から当てる**
    for ok_name, want in (("05-a.png", (5, "a")), ("12-c.jpg", (12, "c")),
                          ("01-b.jpeg", (1, "b")), ("10-a.webp", (10, "a"))):
        if parse_name(ok_name) != want:
            bad.append(f"名前 {ok_name} を {parse_name(ok_name)} と読んだ（{want} のはず）")
    for ng_name in ("5-a.png", "13-a.png", "00-a.png", "05-d.png", "05.png",
                    "illust.png", "05-a.gif", "05-A.png"):
        if parse_name(ng_name) is not None:
            bad.append(f"決まりに合わない名前 {ng_name} を通した")
    if out_name(5, "a") != "05-a.webp" or out_name(12, "c") != "12-c.webp":
        bad.append("焼いた1枚の名前が <MM>-<x>.webp になっていない")

    # (2) 思い出の年月（あやと 2026-10-12 の対応）
    for m, mem in {1: (2026, 1), 5: (2026, 5), 10: (2026, 10),
                   11: (2025, 11), 12: (2025, 12)}.items():
        if memory_of(m) != mem:
            bad.append(f"暦{m}月の思い出を {memory_of(m)} と読んだ（{mem} のはず）")

    # (3) 正方形の判定。通るものと落ちるもの
    if square_faults("toy", Image.new("RGB", (1024, 1024))):
        bad.append("1024×1024 を正方形でないと言った")
    if square_faults("toy", Image.new("RGB", (943, 943))):
        bad.append("943×943（届いた8月の元絵の大きさ）を通さなかった")
    if not square_faults("toy", Image.new("RGB", (1024, 768))):
        bad.append("1024×768 を正方形だと言った")
    if not square_faults("toy", Image.new("RGB", (200, 200))):
        bad.append(f"200×200（貼る大きさ {PHOTO}px より小さい）を通した")

    # (3b) 一言の表。**本物の表が通り、壊した表がそれぞれの理由で落ちる**
    bad += sign_table_faults(signs())
    for why, broken, mark in (
        ("12月を抜いた表", {m: r for m, r in SIGNS.items() if m != 12}, "暦12月が無い"),
        ("9月に改行を入れて2行にした表", {**SIGNS, 9: "スウェーデンまで\n北欧ヒッチハイク旅"}, "改行"),
        ("9月を2行のタプルに戻した表", {**SIGNS, 9: ("スウェーデンまで", "北欧ヒッチハイク旅")},
         "1本の文字列でない"),
        ("ayato を入れた表", {**SIGNS, 9: SIGNS[9] + "ayato"}, "ayato"),
        ("9月が空の表", {**SIGNS, 9: ""}, "空"),
        ("9月に読点を入れた表", {**SIGNS, 9: "スウェーデンまで、北欧ヒッチハイク旅"}, "、"),
        ("9月に句点を入れた表", {**SIGNS, 9: "スウェーデンまで北欧ヒッチハイク旅。"}, "。"),
        ("9月に空白を入れた表", {**SIGNS, 9: "スウェーデンまで 北欧ヒッチハイク旅"}, "空白"),
        ("9月に全角の空白を入れた表", {**SIGNS, 9: "スウェーデンまで　北欧ヒッチハイク旅"}, "空白"),
        ("4月の読点を句点にした表", {**SIGNS, 4: "トビリシにさよなら。アルメニアへ"}, "。"),
        ("13月がある表", {**SIGNS, 13: "どこか"}, "暦13月"),
    ):
        got = sign_table_faults(broken)
        if not any(mark in g for g in got):
            bad.append(f"一言の表の見張りが「{why}」を拾わなかった（{got or '0件'}）")
    if not SIGN_FONT.exists():
        bad.append(f"一言の字 {SIGN_FONT.relative_to(REPO)} が無い")
        return bad
    # (3b') 表の字が字体にあるか。**本物の表が通り、字体に無い字を混ぜた表が落ちる**。
    #       物差し（無い字の見分け）も両側から: 私用領域の字は無い、「あ祭」はある
    try:
        bad += sign_glyph_faults(signs())
        if missing_glyphs("あ祭") or missing_glyphs("\ue001") != ["\ue001"]:
            bad.append("字体に無い字の見分けが外れた（「あ祭」を無いと言った、か私用領域の字をあると言った）")
        got = sign_glyph_faults({**SIGNS, 9: SIGNS[9] + "\ue001"})
        if not any("暦9月" in g and "無い" in g for g in got):
            bad.append(f"字体に無い字を混ぜた表を拾わなかった（{got or '0件'}）")
    except ValueError as e:
        bad.append(str(e))

    # (3c) 表に無い月は重ねない。重ねずに返したうえで、**違反に出す**
    plain_toy = toy()
    kept, f, _ = signed("toy 表に無い月", 9, plain_toy, {m: r for m, r in SIGNS.items() if m != 9})
    if kept.tobytes() != plain_toy.tobytes():
        bad.append("表に無い月の絵に、何か重ねた")
    if not any("表に無い" in x for x in f):
        bad.append("表に無い月を焼いたのに、違反に出なかった")
    # (3c'') 2行に戻った月も、黙って描かない（改行のまま PIL に渡すと投げる。タプルなら2行に描く道が無い）
    for why, two in (("改行", "スウェーデンまで\n北欧ヒッチハイク旅"),
                     ("タプル", ("スウェーデンまで", "北欧ヒッチハイク旅"))):
        kept, f, _ = signed(f"toy 2行（{why}）", 9, plain_toy, {**SIGNS, 9: two})
        if kept.tobytes() != plain_toy.tobytes():
            bad.append(f"2行（{why}）の一言を、そのまま絵に重ねた")
        if not f:
            bad.append(f"2行（{why}）の一言を焼いたのに、違反に出なかった")
    # (3c') 字の濃さの判定を、落ちる側から。字の画素を**字ありの絵どうし**で測ると
    #       比はちょうど 1 になる。それを渡したら、**字と地の比で**落ちること
    #       （置き場や動いた画素で落ちたのを、拾えたと読まない）。
    #       影ごと地に溶けた回は `BREAK=signdim` が本物の道で当てる
    art, box, cover = sign(plain_toy, SIGNS[9])
    flat = sign_ink(art, art, cover)
    if flat[0] == 0 or abs(flat[1] - 1.0) > 1e-9:
        bad.append(f"同じ絵どうしの字の比を {flat} と測った（1.00 のはず）")
    if not any("字と地の比" in x for x in sign_faults("toy", plain_toy, art, box, flat)):
        bad.append("字と地の比 1.00 の一言を、字の濃さの判定が拾わなかった")
    # (3d) 重ねた置き場の判定そのもの。**右下にない・はみ出す・何も描かない**を落とす
    W = plain_toy.width
    if not sign_faults("toy", plain_toy, plain_toy, (W - 400, W - 300, W - 20, W - 20)):
        bad.append("何も描いていない右下を「重ねた」と通した")
    if not any("はみ出す" in x for x in
               sign_faults("toy", plain_toy, plain_toy, (W - 300, W - 200, W + 40, W - 20))):
        bad.append("絵からはみ出す置き場を通した")
    if not any("右下" in x for x in
               sign_faults("toy", plain_toy, plain_toy, (20, 20, 400, 300))):
        bad.append("左上の置き場を「右下」と通した")

    # (4) 12か月ぶんの表を、答えを知っている曜日と datetime の両方で
    for m in range(1, 13):
        g = grid(YEAR, m)
        bad += grid_faults(YEAR, m, g)
        bad += anchor_faults(YEAR, m, g)
    # 2027-01-01 は金曜（左から6列目）。**表から直に読む**
    if grid(YEAR, 1)[0][5] != 1:
        bad.append("2027年1月1日が、1行目の金曜（左から6列目）に無い")

    # (5) 本物と同じ道で、こちらの絵を2つの月に貼って組む。
    #     大きさの違う元絵（1024 と 943）を混ぜて、焼いた物が揃うことも見る
    plains: dict[str, tuple[Image.Image, bytes]] = {}
    for name, month, hue, side in (("toy 01-a", 1, 0, 1024), ("toy 12-a", 12, 2, 943)):
        size = (side, round(side * 0.78)) if BREAK == "square" and month == 12 else (side, side)
        top = (0xe0, 0xf0, 0xff) if BREAK == "frame" and month == 12 else SHEET_TOP
        raw = toy(size, hue)
        art, faults, _ = signed(name, month, raw)
        _, plain_png, plain, f, line = compose(name, month, art, top)
        faults += f
        # 縮めて貼ったあとも、**紙の上の絵の右下**に一言が残っているか
        if raw.size[0] == raw.size[1]:
            corner = (PHOTO_X + PHOTO // 2, PHOTO_Y + PHOTO * 2 // 3,
                      PHOTO_X + PHOTO, PHOTO_Y + PHOTO)
            a = base(raw, top).crop(corner).tobytes()
            b = plain_png.crop(corner).tobytes()
            moved = sum(1 for i in range(0, len(a), 3)
                        if sum(abs(a[i + k] - b[i + k]) for k in range(3)) > MOVED)
            if moved < len(a) // 3 * 0.05:
                faults.append(f"{name}: 紙に貼った絵の右下に一言が見えない（動いた {moved:,}px）")
        bad += faults
        plains[name] = (plain_png, plain)
        print(f"  {line}")
    bad += frame_faults(plains)
    return bad


def bake() -> tuple[int, int, list[str]]:
    """`cal-src/` の元絵を全部焼く。返すのは `(見た元絵, 焼けた枚数, 違反)`。

    **違反が1件でもあったら、1枚も書かない**（半分だけ新しい置き場を作らない）。
    """
    found, faults = sources()
    faults += sign_table_faults(signs())
    faults += sign_glyph_faults(signs())
    made: dict[str, bytes] = {}
    plains: dict[str, tuple[Image.Image, bytes]] = {}

    for month, pick, path in found:
        name = out_name(month, pick)
        y, m = memory_of(month)
        im = Image.open(path)
        im.load()
        # 一言は元絵の画素数のまま重ねてから縮める（SUZURI に上げる絵と同じ字になる）。
        # **元絵のファイルは書き換えない**——重ねるのは読んだ絵の写し
        art, f, (n, med) = signed(name, month, im)
        faults += f
        shot, plain_png, plain, f, line = compose(name, month, art)
        faults += f
        made[name] = shot
        plains[name] = (plain_png, plain)
        print(f"{line}  ← {path.name} {im.width}×{im.height}（暦{month}月 / {y}年{m}月の思い出）"
              f"  「{signs().get(month, '')}」 一言の比 {med:.2f}（{n:,}px）")
    faults += frame_faults(plains)

    if not faults:
        OUT.mkdir(parents=True, exist_ok=True)
        for name, data in made.items():
            (OUT / name).write_bytes(data)
            print(f"焼いた: {(OUT / name).relative_to(REPO)}  {len(data):,}B")
        # 元絵の無い焼いたものは消す。**名前の決まりに合うものだけ**——
        # 決まりの外のファイルを、この道具が黙って消すことはしない
        for p in sorted(OUT.glob("*.webp")) if OUT.exists() else []:
            if parse_name(p.stem + ".png") and p.name not in made:
                p.unlink()
                print(f"消した: {p.relative_to(REPO)}（元絵が cal-src に無い）")
    return len(found), len(made), faults


def print_squares(dest: Path) -> tuple[int, list[str]]:
    """SUZURI に上げる**正方形の絵**（一言を重ねたもの・元絵の画素数のまま）を書き出す。

    名前は `<MM>-<a|b|c>.png`。**リポジトリには入れない**（元絵と表から、いつでも作り直せる）。
    違反が1件でもあったら、1枚も書かない。
    """
    found, faults = sources()
    faults += sign_table_faults(signs())
    faults += sign_glyph_faults(signs())
    made: dict[str, Image.Image] = {}
    for month, pick, path in found:
        name = f"{month:02d}-{pick}.png"
        im = Image.open(path)
        im.load()
        faults += square_faults(name, im)
        art, f, (n, med) = signed(name, month, im)
        faults += f
        print(f"{name}  一言の比 {med:.2f}（{n:,}px）")
        if art.size != im.size:
            faults.append(f"{name}: 書き出す絵が {art.size}（元絵は {im.size}）")
        made[name] = art
    if not faults:
        dest.mkdir(parents=True, exist_ok=True)
        for name, art in made.items():
            art.save(dest / name, "PNG")
            print(f"書いた: {dest / name}  {art.width}×{art.height}  "
                  f"{(dest / name).stat().st_size:,}B")
    return len(made), faults


def main() -> int:
    try:
        regular, bold = faces()
    except FileNotFoundError as e:
        print(e)
        return 2
    print(f"字: {Path(regular).name} / {Path(bold).name}")
    if not SIGN_FONT.exists():
        print(f"一言の字 {SIGN_FONT.relative_to(REPO)} が無い（黙って別の字で焼かない）")
        return 2
    print(f"一言の字: {SIGN_FONT.relative_to(REPO)}")
    dest = None
    if "--print" in sys.argv:
        i = sys.argv.index("--print")
        if i + 1 >= len(sys.argv) or sys.argv[i + 1].startswith("--"):
            print("--print の次に、書き出す置き場を1つ渡す")
            return 2
        dest = Path(sys.argv[i + 1]).resolve()
    if BREAK:
        print(f"対照: BREAK={BREAK} を当てている（拾えなければ、その足は何も見ていない）")

    print("# 対照（こちらで描いた絵を、本物と同じ道で組む）")
    bad = drill()
    for b in bad:
        print(f"  {b}")
    if BREAK:
        if bad:
            print(f"BREAK={BREAK} を拾えた（{len(bad)}件）。本物は焼いていない")
            return 1
        print(f"BREAK={BREAK} を当てたのに、対照が1件も拾わなかった")
        return 2
    if bad:
        print("対照が外れた。本物は1枚も焼いていない")
        return 2
    print("# 対照 通った（名前 12通り / 思い出の年月 5か月 / 正方形 4通り / "
          "一言の表 本物1つと壊した11・字体に無い字・表に無い月・2行に戻った月・置き場3通り・字の濃さ / "
          "2027年の12か月を答えと datetime の両方で / 大きさの違う絵を2つの月に貼って組む）")
    if "--drill" in sys.argv:
        return 0

    if dest is not None:
        print(f"\n# SUZURI に上げる正方形の絵（一言つき）→ {dest}")
        made, faults = print_squares(dest)
        for f in faults:
            print(f)
        print(f"書き出す絵: {made}枚  違反 {len(faults)}件")
        if faults:
            print("違反があるので、1枚も書いていない")
            return 1
        return 0 if made else 2

    print("\n# 焼く")
    seen, made, faults = bake()
    for f in faults:
        print(f)
    print(f"見た元絵: {seen}枚 / 焼けた: {made}枚  違反 {len(faults)}件"
          f"（{SHOT_W}×{SHOT_H}・字と地の比は {MIN_CONTRAST} 以上・"
          f"1枚 {MAX_BYTES:,}B 以下・左の正方形いがいは全部の月で同じ画素）")
    if faults:
        print("違反があるので、1枚も書いていない")
        return 1
    if seen == 0:
        print(f"{SRC.relative_to(REPO)} に元絵が1枚も無い（焼くものが無い）")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
