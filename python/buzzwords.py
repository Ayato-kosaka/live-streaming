#!/usr/bin/env python3
"""チャットの全文から、その月の**流行語の候補**を件数つきで出す。

    python3 python/buzzwords.py --from 2026-09-26 --to 2026-10-30
    python3 python/buzzwords.py --from 2026-09-26 --to 2026-10-30 --json /tmp/x.json

月末配信の「流行語大賞」は、ここまで人が手で選んでいた。数える道具は1本も無く、
`public/202610_monthly_review.html` に手書きの JSON が埋まっているだけで、
**件数の欄すら無かった**（画面に出ている「◯◯から」は初出の日付）。
**流行語大賞はガッツリ集計させる**（あやと 2026-10-31）ための道具がこれ。

## ただ多い語は流行語ではない

件数で並べると、毎月「ありがとう」「おはよう」が1位になる。
見るのは**その月に伸びたか**で、材料は2つ——**その月の件数**と、
**それ以前の全期間（`streams/` にあるぶん全部）の件数**。

**件数は「その語が出たコメントの数」**で、1件の中で何回言っても1件と数える。
素の出現回数で数えると、**繰り返しの言い回しが自分で自分を薄める**——
「コネコネ」は1件で「コネ」を2回作るので、「コネ」24回・「コネコ」11回になって、
下の伸ばし方（`canonical`）が「コネコネ」まで届かず「コネ」で止まっていた。
連投で1人が数を作ってしまうのも、同じ数えかたで防げる。

## 並べかた（`score_of`）

**伸び率そのものでは並べない。** 伸び率は件数を見ないので、前に0件の語は
件数が7でも無限に近い値になり、「3人が7件書いた新語」が
「みんなが何十件も書いた語」を必ず越えてしまう。実測すると、伸び率だけの並びは
**30件が上から下まで「今月7〜18件・前0件」で埋まり、今月31件の「銅像」も
24件の「LINEスタンプ」も入らなかった。**

並べるのは、**2つの軸の相乗平均**（`score_of`）。

1. **件数の軸** — その月の件数と、それ以前の件数。強さ（対数尤度比 `keyness`）と
   伸び率（`lift`）の相乗平均
2. **人数の軸** — その月に書いた人のうち何人が使ったかと、それ以前に書いた人の
   うち何人が使ったか。同じ measure を人数で取る

人数の軸を足すのは、**件数だけだと「少ない人が何度も言った語」が上に来る**から。
実測で1位になったのが「bro」——162件もあるが、言ったのは4人（それ以前も146件
あって、伸び率は 10.9倍）。「1人だけの連呼は落とす」の線（`--min-speakers`）は
3人なので、**4人は通ってしまう。** 流行語は**人に移る**ものなので、
人数の軸でも伸びているかを見る。

落ちる線は3本——件数の伸び率が `--min-lift`（既定8倍）未満、
件数で薄い、**人数で広がっていない**。`--by keyness` / `--by lift` で
片方の軸だけの並びも見られる（見比べる用）。

## 語の切りかた

形態素解析の道具はこの箱に入っていないし、入れない。流行語は辞書に無い語なので、
辞書で切ると「暗殺者のパスタ」が「暗殺」「者」「の」「パスタ」に割れて消える。
代わりに **2〜8文字の連続する部分文字列**を全部数える。

ただし部分文字列は**短いほうが必ず多い**ので、件数で見るといちばん短い断片が
上に来る（実測で「北マケ」38件・「カッチャ」30件・「暗殺者」17件）。
そこで、**次の1文字がいまの出方の `GROW` 以上を占めているあいだ、語を前後に伸ばす**
（`chain`）。「暗殺者の」のあとは9割が「パ」なので伸び、「銅像」のあとは
「に」「も」「の」に散るので止まる——**散るところが語の切れ目**。
これで「北マケ」も「マケドニア」も「北マケドニア」に寄り、
「カッチャ」は「フォカッチャ」になる。

**同じ件数なら長いほうを採る**（`コンソメ` と `コンソメス` が同数なら後者）のは、
この伸ばし方の特別な場合（占める割合が 1.0）。

伸ばしても「暗殺者のパスタ」と「クラムチャウダー」のように字が重なる親戚が
残ることがあるので、出すときは**上位から見て、すでに採った語と字が重なるものを飛ばす**
（`pick`）。これが無いと30件が数個の言い回しの変種で埋まる。

## 落とすもの（なぜ落とすか）

- 視聴者さんの名前（`@` のあとの字と、名簿にある表示名そのもの）。
  **人の名前は流行語ではない**し、**出してよいものでもない**
- YouTube の絵文字の名前（`:sparkles:`）。字としては本文に居るが、読む人には絵
- ひらがなだけ2〜3文字（「そう」「ねー」）。相槌が上位を埋める
- URL の中の字
- **1人だけが連呼している語。** 何人が言ったかを数えて、`--min-speakers`（既定3）未満は落とす
- その月のほうが**薄い**語（前のほうがよく言われていた語）。伸びていないので流行語ではない
- **単独で立っていない断片**（`standing`）。隣が2種類以下で、しかもその語の出方が
  隣で全部埋まっているもの。「力粉」は31件のうち20件が「強力粉」・15件が「薄力粉」で、
  単独で出たことが1度も無い

## 出すもの

上位30語の、語・その月の件数・何人が言ったか・初出の日・初出の配信の題・
それ以前の件数・伸び率・点。`--json` なら同じものと、数えた分母も。
**視聴者さんの名前は1文字も出さない**（人数だけ出す）。
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 配信日の境目（6:00 JST）と、人ではない bot の名前は `build_monthly` が持っている。
# 同じ決めを2か所に書かない——あちらは同じ引き算を BigQuery 側でやっている
from build_monthly import BOT_NAME, DAY_CUTOFF_HOUR  # noqa: E402

# 行の形（`[h:mm:ss] @名前: 本文` と、額つきの `[h:mm:ss] ¥500 @名前: 本文`）を
# 見分ける正規表現は `stream_notes` が持っている。**書き写さずに借りる**
from stream_notes import LINE_TIME_RE, PAID_RE, sec  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
STREAMS = ROOT / "streams"

MIN_LEN, MAX_LEN = 2, 8
# 数えるのは1文字ぶん長く（9文字）。候補に出すのは8文字までだが、
# **語の切れ目は「次の1文字」を見て決める**ので、8文字の語の隣が見えないと
# 端の断片を落とせない（実測で「クストレベルニキ」が残った。
# 本当は「ネクストレベルニキ」の尻尾で、左の隣は「ネ」しか無い）
SCAN_LEN = MAX_LEN + 1
# 語を伸ばすかどうかの線。次の1文字が、いまの出方のこの割合以上を占めていれば伸ばす。
# 1.0 だと「同じ件数なら長いほうを採る」だけになって「暗殺者」が
# 「暗殺者のパスタ」まで届かない（17 → 11 → 8 と減るので）。
# 0.6 は、その3段をちょうど通って、「銅像」（次が 0.18 で散る）では止まる線
GROW = 0.6
# 語の切れ目の見分け。**どちらかの隣が2種類以下で、しかも全部埋まっている**なら、
# その語は単独で立っていない断片なので落とす（`standing`）。
# 実測で「力粉」がこれ——31件のうち 20件が「強力粉」・15件が「薄力粉」で、
# 単独で出たことが1度も無い。逆に「発酵」は隣が10種類以上に散るので、
# 全部埋まっていても語として立っている
EDGE_VARIETY = 2
# 伸ばした先の端に残る助詞。語の端がこれなら落とす。
# 「鉄板」は 12件のうち 10件が「鉄板に」なので伸ばす側に倒れるが、
# 読み上げるのは「鉄板」。**終わりの「か」「ね」「よ」は入れない**——
# 「てるんか」のような言い回しは、その字まで含めて流行語だから
EDGE_PARTICLES = "にをがはもでとへの"
# 伸び率の下駄。無いと「今月3件・前0件」が 0 割りになる
SMOOTH = 5
# 伸び率の下限。**流行語は「前よりこれだけ濃く言われた語」**という線。
# 強さ（件数と伸びの両方）だけで並べると、ここが無いと
# 「こんばんは」1.7倍・「美味し」2.1倍・「パン」2.5倍が上位を埋める（実測）
MIN_LIFT = 8.0
TOP = 30
MIN_COUNT = 3
MIN_SPEAKERS = 3

URL_RE = re.compile(r"(?:https?://|www\.)\S+")
# YouTube の絵文字は本文に `:sparkles:` の字で入っている
EMOJI_NAME_RE = re.compile(r":[A-Za-z0-9_+-]{2,}:")
# 呼びかけの `@名前`。半角と全角の両方が来る
MENTION_RE = re.compile(r"[@＠]\S+")
# 語に使ってよい字。これ以外（句読点・記号・絵文字・空白）は語の切れ目にする。
# `ー`(30FC) と `々`(3005) は語の中に入るが、`・`(30FB) は切れ目なので外す
WORD_RE = re.compile(
    "[0-9A-Za-z"                      # 半角の英数
    "\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A"  # 全角の英数（０-９Ａ-Ｚａ-ｚ）
    "\u3005"                          # 々
    "\u3041-\u3096\u309D\u309E"        # ひらがな（ぁ-ゖ）と ゝゞ
    "\u30A0-\u30FA\u30FC-\u30FF"      # カタカナ（ァ-ヺ）と ー ヽヾヿ。`・`(30FB) は入れない
    "\uFF66-\uFF9F"                   # 半角カタカナ
    "\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF"  # 漢字
    "]+"
)
# ひらがなだけの語（伸ばし棒と繰り返し記号は、ひらがな扱い）
HIRA_RE = re.compile("^[\u3041-\u3096\u309D\u309E\u30FC]+$")
# chat.txt の名前の頭。`2026-10-01_2159_H5Ox41m1LE0.chat.txt`
FNAME_RE = re.compile(r"^(\d{4})-(\d\d)-(\d\d)_(\d\d)(\d\d)_")
DAY_RE = re.compile(r"^\d{4}-\d\d-\d\d$")


# ---------------------------------------------------------------- 材料を読む

def chat_files() -> list[Path]:
    """`streams/YYYY/MM/*.chat.txt` を古い順に。名前の頭が日時なので名前順でよい。"""
    files = sorted(STREAMS.glob("20??/??/*.chat.txt"), key=lambda p: p.name)
    if not files:
        # 置き場が動いた日に「流行語なし」と答えないため（`docs/island-standards.md` §15）
        raise ValueError(f"チャットが1本も無い: {STREAMS}")
    return files


def start_of(path: Path) -> dt.datetime:
    """配信の始まり（JST）。名前の頭の `YYYY-MM-DD_HHMM` から。"""
    m = FNAME_RE.match(path.name)
    if not m:
        raise ValueError(f"配信の日時が読めない名前: {path.name}")
    y, mo, d, hh, mm = (int(x) for x in m.groups())
    return dt.datetime(y, mo, d, hh, mm)


def cut_day(when: dt.datetime) -> str:
    """6時区切りの配信日（JST）。**深夜1時の行は前の日に入る。**

    0時をまたいだ続き枠を前日に寄せる決め（`docs/island-money.md` 5章）。
    境目の時間は `build_monthly.DAY_CUTOFF_HOUR` ひとつで、
    あちらは同じ引き算を BigQuery の `TIMESTAMP_SUB(…, INTERVAL n HOUR)` でやっている。
    """
    return (when - dt.timedelta(hours=DAY_CUTOFF_HOUR)).date().isoformat()


def read_chat(path: Path) -> tuple[str, list[tuple[str, str, str]]]:
    """1本ぶんを (配信の題, [(配信日, 名前, 本文)]) にする。

    名前も本文も取れない行（「名前ごと伏せた」の注記など）は落とす。
    """
    start = start_of(path)
    title = ""
    rows: list[tuple[str, str, str]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("#"):
            if not title:
                title = line.lstrip("#").strip()
            continue
        m = LINE_TIME_RE.match(line)
        if not m:
            continue
        rest = line[m.end():].lstrip()
        if PAID_RE.match(line):
            # 額つきの行は `¥500 @名前: 本文`。額を落として名前から始める
            rest = rest.partition(" ")[2]
        who, sep, body = rest.partition(": ")
        if not sep:
            who, sep, body = rest.partition(":")
        if not sep:
            continue
        at = start + dt.timedelta(seconds=sec(*m.groups()))
        rows.append((cut_day(at), who, body))
    return title, rows


def chunks(body: str) -> list[str]:
    """本文を、語になりうる字のかたまりに割る。

    先に URL・絵文字の名前・`@`呼びかけ を落とす。かたまりをまたぐ部分文字列は
    作らない（「、」や空白をまたいだ字の並びは語ではない）。
    """
    body = URL_RE.sub(" ", body)
    body = EMOJI_NAME_RE.sub(" ", body)
    body = MENTION_RE.sub(" ", body)
    return WORD_RE.findall(body)


def grams(chunk: str, lo: int = MIN_LEN, hi: int = SCAN_LEN):
    """かたまりの中の、長さ lo〜hi の連続する部分文字列を全部。"""
    n = len(chunk)
    for size in range(lo, min(hi, n) + 1):
        for i in range(n - size + 1):
            yield chunk[i:i + size]


class Corpus:
    """`streams/` を1回だけ読んで、その月のぶんと、それ以前のぶんに仕分けたもの。

    `month` は1件1行（古い順）。`prior` は配信1本ぶんずつ（古い順）で、
    それ以前の件数を数えるために全文も持つ。
    """

    def __init__(self, from_day: str, to_day: str, with_host: bool = False):
        self.month: list[tuple[str, str, str, str]] = []   # (日, 題, 名前, 本文)
        self.prior: list[tuple[str, list[tuple[str, str, str]], str]] = []  # (題, [(日, 名前, 本文)], 全文)
        self.names: set[str] = set()
        for path in chat_files():
            if path.name[:10] > to_day:
                # 期間より後の配信は、その月にも「それ以前」にも入らない
                continue
            title, rows = read_chat(path)
            older: list[tuple[str, str, str]] = []
            for day, who, body in rows:
                self.names.add(who)
                if not with_host and who == BOT_NAME:
                    continue
                if day > to_day:
                    continue
                text = "\n".join(chunks(body))
                if not text:
                    continue
                if day >= from_day:
                    self.month.append((day, title, who, text))
                else:
                    older.append((day, who, text))
            if older:
                self.prior.append((title, older, "\n".join(t for _d, _w, t in older)))

    @property
    def month_msgs(self) -> int:
        return len(self.month)

    @property
    def prior_msgs(self) -> int:
        return sum(len(rows) for _t, rows, _b in self.prior)

    @property
    def month_people(self) -> int:
        return len({who for _d, _t, who, _x in self.month})

    @property
    def prior_people(self) -> int:
        return len({w for _t, rows, _b in self.prior for _d, w, _x in rows})


# ---------------------------------------------------------------- 語を決める

def month_counts(corpus: Corpus) -> Counter:
    """その月の、長さ2〜8の部分文字列ぜんぶの件数（＝その語が出たコメントの数）。

    1件の中で同じ語を何回言っても1件。理由は docstring の「ただ多い語は…」。
    """
    cnt: Counter = Counter()
    for _day, _title, _who, text in corpus.month:
        here = set()
        for chunk in text.split("\n"):
            here.update(grams(chunk))
        cnt.update(here)
    if not cnt:
        raise ValueError("その期間にチャットが1件も無い")
    return cnt


def trim(word: str) -> str:
    """伸ばした語の端に残った助詞を落とす（`鉄板に` → `鉄板`）。"""
    while len(word) > MIN_LEN and word[-1] in EDGE_PARTICLES:
        word = word[:-1]
    while len(word) > MIN_LEN and word[0] in EDGE_PARTICLES:
        word = word[1:]
    return word


def extensions(cnt: Counter) -> tuple[dict, dict]:
    """語ごとの、1文字伸ばした先の様子。(後ろへ, 前へ) の2枚。

    1枚は `{語: (いちばん多い伸ばし先の件数, その語, 隣の種類, 隣で埋まった件数)}`。
    **種類と埋まった件数は `standing` が使う**（語の切れ目の見分け）。
    """
    right: dict[str, list] = {}
    left: dict[str, list] = {}
    for word, c in cnt.items():
        if len(word) <= MIN_LEN:
            continue
        for part, box in ((word[:-1], right), (word[1:], left)):
            cur = box.get(part)
            if cur is None:
                box[part] = [c, word, 1, c]
            else:
                if (c, word) > (cur[0], cur[1]):
                    cur[0], cur[1] = c, word
                cur[2] += 1
                cur[3] += c
    return right, left


def standing(word: str, cnt: Counter, right: dict, left: dict) -> bool:
    """その語が、**単独で立っているか**（断片ではないか）。

    どちらかの隣の種類が `EDGE_VARIETY` 以下で、しかも**その語の出方が隣で
    全部埋まっている**（単独で出たことが1度も無い）なら、語ではなく断片。

    実測で落ちるのが「力粉」——31件のうち 20件が「強力粉」・15件が「薄力粉」で、
    単独で出たことが1度も無い。「クストレベルニキ」も（左の隣が「ネ」しか無い）。
    **種類で見るのが肝。** 埋まっているかだけで見ると「発酵」まで落ちる——
    いつも「させる」「したい」が続くが、続く字は10種類以上に散っている。
    """
    c = cnt[word]
    for box in (right, left):
        e = box.get(word)
        if e and e[2] <= EDGE_VARIETY and e[3] >= c:
            return False
    return True


def chain(word: str, cnt: Counter, right: dict, left: dict, floor: int) -> list[str]:
    """その語を伸ばしていく途中の形を、短いほうから順に。

    伸ばす向きは前後の両方。**次の1文字がいまの出方の `GROW` 以上を占めているあいだ**
    伸ばして、散ったところで止める（散るところが語の切れ目）。
    `floor` より少なくなる伸ばしはしない。

    **両方に伸びるときは、助詞でないほうを先に採る。** 「マケドニア」は
    右に「マケドニアは」、左に「北マケドニア」と伸びる。助詞のほうへ倒すと
    あとの `trim` で元に戻ってしまい、「北マケドニア」に届かない（実際に外した）。
    """
    out = [word]
    while len(word) < MAX_LEN:
        need = max(GROW * cnt[word], floor)
        here = []
        for box, edge in ((right, -1), (left, 0)):
            e = box.get(word)
            if e and e[0] >= need:
                here.append((e[1][edge] not in EDGE_PARTICLES, e[0], e[1]))
        if not here:
            break
        word = max(here)[2]
        out.append(word)
    return out


def canonical(seed: str, cnt: Counter, right: dict, left: dict, floor: int) -> str | None:
    """断片の `seed` を、**読み上げられる形**に直す。直せなければ None。

    やることは3つの繰り返し——伸ばして、**単独で立っている形のうちいちばん長いもの**を
    採って、端の助詞を落とす。形が動かなくなったら、それが答え。

    1回で済まないのは、落とした助詞のぶんだけ**また伸びる先が変わる**から。
    実測:「マケドニアで」→（伸びない）→ 助詞を落として「マケドニア」→
    そこから「北マケドニア」へ伸びる。1回で止めると「マケドニア」で終わっていた。

    `None` になるのは、伸ばした道のどこにも単独で立つ形が無いとき（「力粉」）。
    """
    word = seed
    for _ in range(MAX_LEN):
        best = None
        for step in chain(word, cnt, right, left, floor):
            if standing(step, cnt, right, left):
                best = step
        if best is None:
            return None
        nxt = trim(best)
        if cnt.get(nxt, 0) < floor:
            nxt = best                    # 助詞を落としたら数えるに足りない。落とさない
        if nxt == word:
            return word
        word = nxt
    return word


def known_names(names: set[str]) -> set[str]:
    """名簿にある表示名そのもの。`@` の有る無しの両方で持つ。"""
    out = set()
    for n in names:
        n = n.strip()
        if n:
            out.add(n)
            out.add(n.lstrip("@＠"))
    return out


def keep_word(word: str, names: set[str]) -> bool:
    """この語を候補に残すか。落とす理由は docstring の「落とすもの」のとおり。"""
    if word in names:
        return False                      # 名簿にある表示名そのもの
    if HIRA_RE.match(word) and len(word) <= 3:
        return False                      # 「そう」「ねー」のような相槌
    return True


def lift(mc: int, mn: int, pc: int, pn: int) -> float:
    """伸び率。その月の1件あたりの出方 ÷ それ以前の1件あたりの出方。

    1件あたりにするのは、期間の長さが違うから（その月は1ヶ月、それ以前は2年）。
    両側に同じ下駄（`SMOOTH`）を履かせるのは、下駄が無いと
    「今月3件・前0件」が 0 割りになるから。**並べる軸はこれではない**（docstring）。
    """
    if not mn or not pn:
        raise ValueError("数える分母が 0")
    return ((mc + SMOOTH) / mn) / ((pc + SMOOTH) / pn)


def keyness(mc: int, mn: int, pc: int, pn: int) -> float:
    """強さ（対数尤度比 G²）。**件数と伸びの両方**を見る。

    その月とそれ以前で出方が同じだったら何件になるはず（`e1` `e2`）を出して、
    実際との開きを測る。件数が多いほど、伸びが大きいほど大きくなるので、
    「みんなが何十件も書いた語」が「3人が7件書いた新語」の下に埋もれない。
    その月のほうが薄い語は 0（伸びていないので流行語ではない）。
    """
    if not mn or not pn:
        raise ValueError("数える分母が 0")
    if not mc or mc / mn <= pc / pn:
        return 0.0
    tot = mc + pc
    e1 = mn * tot / (mn + pn)
    e2 = pn * tot / (mn + pn)
    return 2 * (mc * math.log(mc / e1) + (pc * math.log(pc / e2) if pc else 0.0))


def axis(mc: int, mn: int, pc: int, pn: int) -> float:
    """1つの軸ぶんの点。**強さと伸び率の相乗平均**（√(G² × 伸び率)）。

    片方だけでは並ばない。実測（2026-09-26〜10-30）で:

    - **強さだけ**だと件数が勝つので、上位30件のうち13件が
      「こんばんは」「美味し」「パン」「かわいい」のような挨拶と常用語になった
    - **伸び率だけ**だと件数を見ないので、30件ぜんぶが「今月7〜18件・前0件」で埋まり、
      今月31件の「銅像」も、24件の「LINEスタンプ」も入らなかった
    """
    return math.sqrt(keyness(mc, mn, pc, pn) * lift(mc, mn, pc, pn))


def score_of(mc: int, mn: int, pc: int, pn: int,
             ms: int, mp: int, ps: int, pp: int) -> float:
    """並べる点。**件数の軸と人数の軸の相乗平均。**

    件数だけで測ると、**少ない人が何度も言った語**が上に来る。実測で1位になったのが
    「bro」——162件もあるが、言ったのは4人（それ以前も146件あって、伸び率は 10.9倍）。
    「1人だけの連呼は落とす」の線（`--min-speakers`）は3人なので、4人は通ってしまう。

    そこで**同じ measure を人数でも取る**——その月に書いた人のうち何人が使ったかを、
    それ以前に書いた人のうち何人が使ったかと比べる。流行語は**人に移る**ので、
    人数の軸でも伸びる。「bro」は人数では伸びていないので下がり、
    「1900人」（8件を8人が1回ずつ）は上がる。
    """
    return math.sqrt(axis(mc, mn, pc, pn) * axis(ms, mp, ps, pp))


def tally(corpus: Corpus, min_count: int, min_speakers: int,
          min_lift: float = MIN_LIFT) -> list[dict]:
    """その月の候補を作って、それ以前と比べる。並びは点（`score_of`）の降り順。"""
    cnt = month_counts(corpus)
    right, left = extensions(cnt)
    names = known_names(corpus.names)

    # 断片を読み上げられる形に直してから候補にする。直った先が同じものは1つになる
    cand = set()
    for word, c in cnt.items():
        if c < min_count or len(word) > MAX_LEN:
            continue
        w = canonical(word, cnt, right, left, min_count)
        if w and cnt[w] >= min_count and keep_word(w, names):
            cand.add(w)

    # 何人が言ったか・その月の初出。月のぶんは古い順に並んでいる
    speakers: dict[str, set[str]] = {}
    first: dict[str, tuple[str, str]] = {}
    for day, title, who, text in corpus.month:
        for chunk in text.split("\n"):
            for g in grams(chunk):
                if g not in cand:
                    continue
                speakers.setdefault(g, set()).add(who)
                first.setdefault(g, (day, title))
    cand = {w for w in cand if len(speakers.get(w, ())) >= min_speakers}

    # それ以前の全期間。古い順に見て、初めて出たところを初出にする。
    # 配信1本ぶんの全文に無ければ、その本の1件1件は見ない（ここで桁が変わる）
    prior = dict.fromkeys(cand, 0)
    prior_who: dict[str, set[str]] = {w: set() for w in cand}
    seen: dict[str, tuple[str, str]] = {}
    for title, rows, blob in corpus.prior:
        hits = [w for w in cand if w in blob]
        if not hits:
            continue
        for day, who, text in rows:
            for w in hits:
                if w in text:
                    prior[w] += 1
                    prior_who[w].add(who)
                    seen.setdefault(w, (day, title))

    mn, pn = corpus.month_msgs, corpus.prior_msgs
    mp, pp = corpus.month_people, corpus.prior_people
    out = []
    for w in cand:
        ms, ps = len(speakers[w]), len(prior_who[w])
        strength = keyness(cnt[w], mn, prior[w], pn)
        grew = lift(cnt[w], mn, prior[w], pn)
        if strength <= 0 or grew < min_lift:
            continue                      # 伸びていない語は、何件あっても流行語ではない
        if keyness(ms, mp, ps, pp) <= 0:
            continue                      # 人数では広がっていない語（身内の口癖）も落とす
        day, title = seen.get(w, first[w])
        out.append({
            "word": w,
            "count": cnt[w],
            "speakers": ms,
            "first_day": day,
            "first_title": title,
            "prior_count": prior[w],
            "prior_speakers": ps,
            "lift": grew,
            "keyness": strength,
            "score": score_of(cnt[w], mn, prior[w], pn, ms, mp, ps, pp),
        })
    out.sort(key=lambda r: (-r["score"], -r["count"], r["word"]))
    return out


def pick(rows: list[dict], top: int) -> list[dict]:
    """上位から、**すでに採った語と字が重なるものを飛ばして**並べる。

    「クラムチャウダー」と「ラムチャウダー」は同じ言い回しなので、
    両方出すと30件が数個の言い回しの変種で埋まる。
    """
    out: list[dict] = []
    for r in rows:
        w = r["word"]
        if any(w in k["word"] or k["word"] in w for k in out):
            continue
        out.append(r)
        if len(out) >= top:
            break
    return out


# ---------------------------------------------------------------- 出す

def width(s: str) -> int:
    """見た目の桁数。全角を2つ分で数える。"""
    return sum(2 if unicodedata.east_asian_width(c) in "WF" else 1 for c in s)


def pad(s: str, n: int) -> str:
    return s + " " * max(0, n - width(s))


def clip(s: str, n: int) -> str:
    out = ""
    for c in s:
        if width(out + c) > n:
            return out + "…"
        out += c
    return out


def table(rows: list[dict]) -> str:
    head = ["順", "語", "今月", "人数", "初出", "それ以前", "伸び率", "点", "初出の配信"]
    body = [[str(i + 1), r["word"], str(r["count"]), str(r["speakers"]), r["first_day"],
             str(r["prior_count"]) if r["prior_count"] else "—",
             f"{r['lift']:.1f}", f"{r['score']:.0f}", clip(r["first_title"], 32)]
            for i, r in enumerate(rows)]
    if not body:
        return "（候補なし）"
    w = [max(width(c) for c in col) for col in zip(head, *body)]
    out = ["  ".join(pad(c, n) for c, n in zip(head, w)).rstrip()]
    out += ["  ".join(pad(c, n) for c, n in zip(r, w)).rstrip() for r in body]
    return "\n".join(out)


def day_arg(s: str) -> str:
    if not DAY_RE.match(s):
        raise argparse.ArgumentTypeError(f"YYYY-MM-DD で: {s}")
    return s


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="チャットから、その月に伸びた語を数える")
    ap.add_argument("--from", dest="from_day", type=day_arg, required=True,
                    help="期間の初日（前回の月末配信の日）")
    ap.add_argument("--to", dest="to_day", type=day_arg, required=True,
                    help="期間の末日（今回の月末配信の前日）")
    ap.add_argument("--top", type=int, default=TOP, help=f"出す語の数（既定 {TOP}）")
    ap.add_argument("--min-count", type=int, default=MIN_COUNT,
                    help=f"その月の件数の下限（既定 {MIN_COUNT}）")
    ap.add_argument("--min-speakers", type=int, default=MIN_SPEAKERS,
                    help=f"何人が言ったかの下限（既定 {MIN_SPEAKERS}）。1人の連呼を落とす")
    ap.add_argument("--min-lift", type=float, default=MIN_LIFT,
                    help=f"伸び率の下限（既定 {MIN_LIFT}倍）。挨拶や常用語を落とす")
    ap.add_argument("--by", choices=("score", "keyness", "lift"), default="score",
                    help="並べる軸（既定 score＝強さと伸び率の相乗平均。"
                         "keyness は件数寄り・lift は伸び寄りで、見比べる用）")
    ap.add_argument("--with-host", action="store_true",
                    help=f"{BOT_NAME.lstrip('@')} の書き込みも数える（既定は数えない）")
    ap.add_argument("--json", dest="out_json", help="同じものを JSON で書き出す先")
    a = ap.parse_args(argv)
    if a.from_day > a.to_day:
        ap.error("--from が --to より後")

    corpus = Corpus(a.from_day, a.to_day, a.with_host)
    rows = tally(corpus, a.min_count, a.min_speakers, a.min_lift)
    if a.by != "score":
        rows.sort(key=lambda r: (-r[a.by], -r["count"], r["word"]))
    rows = pick(rows, a.top)

    print(f"# 期間 {a.from_day} 〜 {a.to_day}"
          f"（その月 {corpus.month_msgs:,}件 {corpus.month_people}人"
          f" / それ以前 {corpus.prior_msgs:,}件 {corpus.prior_people}人"
          f" / {a.min_speakers}人以上・{a.min_count}件以上・{a.min_lift:g}倍以上・{a.by} 順）")
    print(table(rows))

    if a.out_json:
        out = {
            "from": a.from_day, "to": a.to_day, "by": a.by,
            "month_msgs": corpus.month_msgs, "prior_msgs": corpus.prior_msgs,
            "month_people": corpus.month_people, "prior_people": corpus.prior_people,
            "min_count": a.min_count, "min_speakers": a.min_speakers,
            "min_lift": a.min_lift,
            "words": rows,
        }
        Path(a.out_json).write_text(
            json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{a.out_json} … {len(rows)}語")
    return 0


if __name__ == "__main__":
    sys.exit(main())
