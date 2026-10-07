"""**`python/stale_content_watch.py` が、本当に鳴るか・本当に黙るかを両側から見る。**

    python3 python/stale_content_watch_selftest.py

    BREAK=round python3 python/stale_content_watch_selftest.py   # 足を1本抜く

終了コード 0=ぜんぶ通った / 1=外したものがある / 2=`BREAK` の名前が違う。

## 境目は、すぐ両隣で別々に当てる

割合で見る本（`chatter.ts`）の境目は、`stale_content_watch.over_share()` の
1か所で決まっている。**ちょうどしきい値のときは鳴らさない。**

足は4本あって、2本ずつ向きが違う:

| 足 | 作りかた | ほしい答え |
| --- | --- | --- |
| 境目の内側 | いまの名簿から `share*N//100` 人 | 通った |
| 境目の外側 | その次の1人 | 赤 |
| ちょうど `share`% | **200人の名簿を組んで** 100人 | 通った |
| `share`% のすぐ上 | 同じ名簿で 101人 | 赤 |

下の2本を別に持っているのは、**いまの名簿（99人）ではちょうど 50% を
作れない**から（50% は 49.5人）。2026-09-24 まではここが1本しかなく、
`round(99 * 50 / 100)` ＝ 50人 を「ちょうど 50%」だと思っていた。
実際は 50.505% で、**判定は正しいのに対照だけが落ちた**（`island-misses.md` #187）。

## なぜ「落ちるまで古くする」だけでは対照にならないか

`island-misses.md` #125 の決めごと1。はじめに書きかけたのは
「その本が赤くなるまで、日付を1日ずつ古くする」だけだった。**それだと
しきい値をゆるめても素通りする**——`recipes.ts` を 60日から 9999日にしても、
9999日古くすれば赤くなるので「効いている」と出る。

だからここは、**しきい値の値そのものから作らない数**を2つずつ持っている。

| | どこから来た数か |
| --- | --- |
| `green` | **実測した、正常な空き**（`recipes.ts` なら直近1年の2番目に長い空き44日） |
| `red` | **実際に止まっていた長さ**（`shorts.ts` なら #119 の127日より上の130日） |

`green` で鳴ったら狼少年、`red` で黙ったら寝ている。**どちらも落とす。**
しきい値を書き換えた人は、この表も一緒に見ることになる。

## 種は本番の `site/content/`

形を自分で書き起こすと、**読むほうの正規表現が本物に当たっているか**を
見ないまま通る。`kitchenTalk.ts` の鍵は `"slug": {`、`recipes.ts` の鍵は
`slug: "…"` で形が違うので、そこは本物で当てないと意味がない。

**先に「手をつけていない写しが、本番と同じ判定になること」を見る**（§15）。
写しを作る途中で壊れても終了コードは同じなので、そこを見ないと対照にならない。

## 終了コードは、口から実測する

判定だけ見て「2 を返すはず」と書かない。3通りの置き場を作って
`stale_content_watch.py` を**そのまま呼び、返ってきた数を見る**。
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import replace
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import stale_content_watch  # noqa: E402
import ts_read  # noqa: E402
from stale_content_watch import (  # noqa: E402
    BOOKS,
    CHAPTERS_TS,
    CONTENT,
    COVERS,
    ENDLESS,
    KEY_RE,
    KEYS,
    LATEST,
    SHARE,
    SKIP,
    SNAP,
    Facts,
    Span,
    chapter_spans,
    iter_string_dates,
    judge,
    scan_dir,
)

REPO = Path(__file__).resolve().parent.parent
TODAY = date(2026, 9, 17)

# **境目の足を、1本ずつ抜く**（`island-standards.md` §15 の決めごと「対照は、
# 足の数だけ用意する」）。当てるとその足だけが落ちるのが正しい。
#
# | `BREAK` | 何を元に戻すか | 落ちる足 |
# | --- | --- | --- |
# | `round` | 割合を**丸めてから**比べる（2026-09-24 まではこれだった） | `50% のすぐ上（101/200人）` |
# | `ge` | ちょうどしきい値でも鳴らす（`>` を `>=` に） | `ちょうど50%（100/200人）` |
# | `covers-today` | 先ぶんの表に**いつでも今日まで**を求める（2026-10-03 まではこれだった） | `終わった旅 × 表が最終日まで在る` |
# | `covers-free` | 先ぶんの表に**旅の始まりまで**しか求めない（「終わった旅は見ない」の行きすぎ） | `進んでいる旅 × 表が古い` ほか |
#
# **2本を1本にまとめない。** `round` は「境目がぼやける」、`ge` は「境目を
# どちらへ倒すか」で、別のこと。片方だけ当てて通すと、もう片方が寝ていても出る。
#
# 先ぶんの表の2本も同じで、**向きが逆。** `covers-today` は「直っているものを
# 鳴らす」側（毎晩の焼き直しが9/29から赤かったのがこれ）、`covers-free` は
# 「壊れていても黙る」側（次の旅が始まった晩に、古い表のまま緑になる）。
#
# | `BREAK` | 何を元に戻すか | 落ちる足 |
# | --- | --- | --- |
# | `snap-days` | 写しを**日だけ**で見る（2026-10-06 までの `nordicShops.ts`） | `終わった旅 × 旅のうちに取れている` |
# | `snap-free` | 写しに**何も求めない**（「終わった旅は見ない」の行きすぎ） | `進んでいる旅 × 取った日が古い` ほか |
# | `endless-chapter` | 章を持たない表を**章の表と同じに**読む（`ENDLESS` を見ない） | `plans.ts` の「数えられない」 |
#
# `snap-days` が、2026-10-14 に立つはずだった**消しようのない赤**そのもの。
# 日だけで見ると、終わった旅の店の表が31日目から赤くなり、持ち主が人待ちなので
# 整備の札に永久に居座る。`snap-free` はその逆で、次の旅が始まっても黙る側。
BREAK = os.environ.get("BREAK", "")
LEGS = ("round", "ge", "covers-today", "covers-free",
        "snap-days", "snap-free", "endless-chapter")


def _hobble() -> None:
    """`BREAK` の足を、本物のモジュールから抜く。抜いていなければ何もしない。"""
    if BREAK == "round":
        stale_content_watch.over_share = (
            lambda missing, total, share: round(100 * missing / total) > share
        )
    elif BREAK == "ge":
        stale_content_watch.over_share = (
            lambda missing, total, share: missing * 100 >= share * total
        )
    elif BREAK == "covers-today":
        # 旅が終わっていても今日を求める（直っているものを鳴らす側）
        stale_content_watch.covers_until = (
            lambda span, today, days: today + timedelta(days=days)
        )
    elif BREAK == "covers-free":
        # 旅の始まりまでしか求めない（壊れていても黙る側）
        stale_content_watch.covers_until = lambda span, today, days: span.start
    elif BREAK == "snap-days":
        # 旅が終わっていても「今日から days 日」で見る（2026-10-06 まではこれ）。
        # **これが 2026-10-14 に立つはずだった、消しようのない赤**
        stale_content_watch.snap_window = (
            lambda span, today, days: (today - timedelta(days=days), today)
        )
    elif BREAK == "snap-free":
        # 何も求めない（終わった旅も進んでいる旅も素通り）
        stale_content_watch.snap_window = (
            lambda span, today, days: (date(1970, 1, 1), date(2999, 12, 31))
        )
    elif BREAK == "endless-chapter":
        # 章を持たない表（`ENDLESS`）を、ふつうの章の名と同じに読む。
        # `chapters.ts` に「終わらない」という章は無いので、`plans.ts` が
        # 毎晩「数えられない」になる——**見張りが1本、黙って消える**
        real_span_of = stale_content_watch.span_of
        stale_content_watch.span_of = (
            lambda book, seen: (None, "章が読めません")
            if book.chapter == ENDLESS else real_span_of(book, seen)
        )


# **しきい値から作らない2つの数。** 上の docstring を読んでから触る。
#   green … これだけ古くても「正常な空き」。鳴ったら狼少年
#   red   … これだけ古ければ「止まっている」。黙ったら寝ている
# 出どころは `site/content/*.ts` の日付の間隔を実測したもの（2026-09-17）。
TWO_SIDES: dict[str, tuple[int, int]] = {
    "recipes.ts": (44, 130),  # 実測の空き 44 / 58 / 68 / 102 / 127日
    "voices.ts": (48, 130),  # 48 / 57 / 94 / 106 / 180日
    "site.ts": (14, 60),  # 人が手で書く updatedAt。2週間は普通、2ヶ月は放置
    "streamTypes.ts": (28, 130),  # 直近1年の最大は28日
    "countries.ts": (120, 200),  # 最大120日（旅のあいだは増えない）
    "apps.ts": (102, 200),  # 2026-02-26 → 06-08 の102日
    "chapters.ts": (126, 400),  # 章の間隔の中央値126日
    "legends.ts": (222, 400),  # 2025-05-07 → 12-15 の222日
    "shorts.ts": (45, 130),  # 130 は #119 の127日のすぐ上
    "chapterStreams.ts": (130, 400),  # 章が閉じる間隔は3〜6ヶ月
    # **`COVERS` の3本（`nordic.ts` `nordicSun.ts` `plans.ts`）と
    # `SNAP` の1本（`nordicShops.ts`）はここに居ない。**
    # あちらは「今日から何日前か」ではなく「**旅が終わっているか**」で境目が
    # 変わるので、日数1本では両側を作れない。4通りを下の「3c」「3f」で当てる
}

# `SNAP` で見る本の、**しきい値から作らない2つの数**（旅の最中に測る側）。
#   green 18 … いまの旅は17日（`chapters.ts` の `plannedDays`）。
#              旅の前日に取って最終日まで使うと18日古くなる。これは正常
#   red  126 … **旅と旅のあいだの実測。** ひとつ前の章（イランまで歩く）が
#              終わった 2026-05-08 から、北欧が始まる 2026-09-11 まで126日。
#              前の旅の表を持ち越すと、それだけ古い表を配ることになる
# どちらも「OSM の店がどれくらいの速さで入れ替わるか」ではない。
# それはこちらからは測れない（`BOOKS` の why に書いた）
TWO_SNAPS: dict[str, tuple[int, int]] = {
    "nordicShops.ts": (18, 126),
}

# `SHARE` で見る本の、**しきい値から作らない2つの割合**（%）。
#   green … 実際に「書き切った」あとの値。鳴ったら狼少年
#   red   … 実際に**あやとに言われた朝**の値。黙ったら寝ている
# どちらも git から実測した（2026-09-16 の `chatter.ts` の commit を前後で数えた）。
TWO_SHARES: dict[str, tuple[int, int]] = {
    # 80/102人＝78% の朝に「台詞が普通すぎる」と言われ、その日に 27/102人＝26% まで書いた
    "chatter.ts": (26, 78),
}


def _rewrite_dates(src: str, when: date) -> str:
    """文字列リテラルの中の日付を、全部 `when` にする。**コメントは触らない。**

    読むほうと**同じ `iter_string_dates` を使う**。別の正規表現で書き換えると、
    「書き換えたつもりのところを読むほうが見ていない」がそのまま通る。
    """
    out = []
    at = 0
    for a, b, _ in iter_string_dates(src):
        out.append(src[at:a])
        out.append(when.isoformat())
        at = b
    out.append(src[at:])
    return "".join(out)


def _drop_key(src: str, name: str, key: str) -> str:
    """その本から鍵を1つ消す（行ごと）。`KEYS` の赤い側を作るのに使う。"""
    rx = KEY_RE[name]
    lines = [ln for ln in src.splitlines(keepends=True)
             if not (m := rx.match(ln)) or m.group(1) != key]
    return "".join(lines)


def _voiceless(src: str, name: str, roster: list[str], want: int) -> str:
    """名簿のうち**セリフの無い人が `want` 人**になるまで、`icon` の行を落とす。

    割合を数字で渡さず、**本物の `chatter.ts` から人を抜いて作る。**
    数字で渡すと、読むほうの正規表現が本物に当たっていなくても通ってしまう。
    """
    voiced = [k for k in KEY_RE[name].findall(src) if k in set(roster)]
    have = len(roster) - len(voiced)
    for k in sorted(voiced)[: max(0, want - have)]:
        src = _drop_key(src, name, k)
    return src


def _facts(name: str, src: str) -> Facts:
    """書き換えた字から `Facts` を作る。**読むほうの関数をそのまま通す。**"""
    f = Facts(name=name, found=True)
    seen = set()
    for _, _, s in iter_string_dates(src):
        try:
            seen.add(date(*map(int, s.split("-"))))
        except ValueError:
            pass
    f.dates = sorted(seen)
    if name in KEY_RE:
        f.keys = KEY_RE[name].findall(src)
    if name == CHAPTERS_TS:
        f.chapters = chapter_spans(src)
        f.chapters_missed = ts_read.read_chapters(src).missed
    return f


def _status(seen: dict[str, Facts], name: str, today: date = TODAY) -> str:
    """その本の判定。**きょうを選べる**——`COVERS` の本は、旅の最中と旅のあとで
    求めるものが変わるので、同じ写しを別の日に当てないと片側しか見られない。"""
    v = judge(seen, today)
    for r in v.results:
        if r.name == name:
            return r.status
    return "（表に無い）"


def main() -> int:
    if BREAK:
        if BREAK not in LEGS:
            print(f"::error::BREAK={BREAK} は足の名前ではありません。"
                  f"使えるのは {', '.join(LEGS)}")
            return 2
        print(f"** BREAK={BREAK} —— 足を1本抜いてある。ここは落ちるのが正しい **")
        _hobble()

    src_of = {p.name: p.read_text(encoding="utf-8") for p in sorted(CONTENT.glob("*.ts"))}
    base = {n: _facts(n, s) for n, s in src_of.items()}

    ok: list[str] = []
    ng: list[str] = []

    def check(label: str, got, want) -> None:
        (ok if got == want else ng).append(f"{label}: 出た={got} ほしい={want}")

    # --- 0. 手をつけていない写しが、本番と同じ判定になるか（先に見る）---------
    real = judge(scan_dir(CONTENT), TODAY)
    copy = judge(base, TODAY)
    check("素の写しの赤が本番と同じ", copy.red, real.red)
    check("素の写しの数えられないが本番と同じ", copy.blind, real.blind)
    check("素の写しで見た本の数", len(copy.results), len(BOOKS))

    # --- 1. 判定する本が、表と食い違っていないか -----------------------------
    # **分母をここで固定する**（§15）。判定する本が増えたのに対照を足し忘れると、
    # その1本だけ誰も当てないまま毎晩通る
    judged = {n for n, b in BOOKS.items() if b.rule != SKIP}
    dated = {n for n in judged if BOOKS[n].rule in (LATEST, COVERS, SNAP)}
    latest_books = {n for n in judged if BOOKS[n].rule == LATEST}
    snap_books = {n for n in judged if BOOKS[n].rule == SNAP}
    covers_books = {n for n in judged if BOOKS[n].rule == COVERS}
    # 章に属する先ぶんの表と、**どの旅にも属さない表**（`ENDLESS`）は別に当てる。
    # 片方の足でもう片方を測ると、章を持たない表が「終わった旅」の枝を通る
    chapter_covers = {n for n in covers_books if BOOKS[n].chapter != ENDLESS}
    endless_covers = {n for n in covers_books if BOOKS[n].chapter == ENDLESS}
    check("両側の数を持っている本の数", sorted(TWO_SIDES), sorted(latest_books))
    check("写しの両側の数を持っている本の数", sorted(TWO_SNAPS), sorted(snap_books))
    # `COVERS` / `SNAP` の本は、章（旅）を名指ししていないと「終わったか」が決まらない。
    # **`ENDLESS` もここでは「名指しした」側**（空と区別が付く字が書いてある）
    for name in sorted(covers_books | snap_books):
        check(f"{name} が章を名指ししている", bool(BOOKS[name].chapter), True)
    # 章を持たない表は `COVERS` だけ。`SNAP` は旅ごとに取り直す写しなので、
    # 「終わらない」と言った瞬間に、旅が終わっても取り直しを求め続けることになる
    check("章を持たない表が SNAP に紛れていない",
          sorted(n for n in snap_books if BOOKS[n].chapter == ENDLESS), [])
    check("章を持たない表が1本は在る（分母が0ではない）", len(endless_covers) > 0, True)

    # --- 2. しきい値そのものが動いていないか ---------------------------------
    # **`green` で鳴らず `red` で鳴る**、を日数の側からも押さえる。
    # ここが無いと、しきい値を1日にしても green の写しを作る側が一緒にずれる。
    for name, (green, red) in list(TWO_SIDES.items()) + list(TWO_SNAPS.items()):
        b = BOOKS[name]
        check(f"{name} のしきい値が実測の正常な空き({green}日)より広い", b.days >= green, True)
        check(f"{name} のしきい値が止まった長さ({red}日)より狭い", b.days < red, True)

    # --- 3. 本ごとに、正常な側と古い側の両方を当てる -------------------------
    # **`TWO_SIDES` は `LATEST` の本だけ**（上の check 1 がそれを縛っている）。
    # `COVERS` は日数1本では両側を作れないので、下の 3c で別に当てる
    for name, (green, red) in TWO_SIDES.items():
        for side, offset, want in (("正常", green, "通った"), ("古い", red, "赤")):
            seen = dict(base)
            seen[name] = _facts(name, _rewrite_dates(src_of[name], TODAY - timedelta(days=offset)))
            check(f"{name} を{side}側({offset}日)にしたとき", _status(seen, name), want)

        # ちょうどしきい値の日は鳴らさない（境界で1日ずれていないか）
        b = BOOKS[name]
        seen = dict(base)
        seen[name] = _facts(name, _rewrite_dates(src_of[name], TODAY - timedelta(days=b.days)))
        check(f"{name} がちょうど{b.days}日前のとき", _status(seen, name), "通った")

    # --- 3b. コメントの中の日付を、中身と読んでいないか -----------------------
    # **ここが抜けると、いちばん静かに壊れる。** `chapterStats.ts` は冒頭に
    # 「数えた日: 今日」を書くし、どの本にも「あやと（2026-09-10）」のような
    # 注釈が入っている。拾ってしまうと、**中の数字が半年止まっていても
    # 「きのう誰かがコメントを直した」だけで新しく見える。**
    # 読み飛ばしを外しても上の対照は1件も落ちなかったので、名指しで足した。
    noise = TODAY.isoformat()
    for name in sorted(n for n in TWO_SIDES if BOOKS[n].rule == LATEST):
        red = TODAY - timedelta(days=TWO_SIDES[name][1])
        aged = _rewrite_dates(src_of[name], red)
        # **コメントの中の日付を、引用符ごと置く。** 引用符の無い注釈
        # （`数えた日: 2026-09-17`）は、そもそも文字列の外なので拾いようがない。
        # 危ないのは注釈の中に `"…"` が出てくるときで、コメントを読み飛ばさないと
        # そこが文字列に見える。実際に読み飛ばしを外して、ここだけが落ちる
        for label, comment in (
            ("行コメント", f'\n// 直した日は "{noise}"\n'),
            ("ブロックコメント", f'\n/* 前は date: "{noise}" と書いてあった */\n'),
            ("引用符のずれるコメント", f'\n/* don\'t 直した日は "{noise}" */\n'),
        ):
            seen = dict(base)
            seen[name] = _facts(name, comment + aged)
            check(f"{name} の{label}に今日の日付を足しても赤のまま", _status(seen, name), "赤")

    # 文字列の中の `//`（アイコンの URL）を、コメントの始まりと読まないか。
    # 読むと、そこから先の日付が丸ごと落ちて「日付0件」になる
    url = '[{ icon: "https://yt4.ggpht.com/x=s64", date: "2026-09-16" }]'
    check("文字列の中の URL の後ろの日付", [d.isoformat() for d in _facts("x.ts", url).dates], ["2026-09-16"])

    # --- 3c. 先ぶんの表を、**旅の最中と旅のあとで別々に**当てる --------------
    #
    # ここが1通りしか無かったので、2026-09-29 から毎晩2本が赤かった。
    # 「いつでも今日まで」を求めていて、**終わった旅の旅程が今日まで
    # 伸びていないことを不具合として鳴らしていた。**
    #
    # 直すときに危ないのは**行きすぎ**のほう——「終わった旅は見ない」に
    # すると、次の旅が始まった晩から古い表のまま緑になる。だから4通りを
    # 並べて当てる。**2通りだけ（終わった旅の緑と赤）にしない。**
    #
    # | 旅 | 表 | ほしい答え | 抜けると何が起きるか |
    # | --- | --- | --- | --- |
    # | 進んでいる | 今日まで在る | 通った | 旅のあいだじゅう狼少年 |
    # | 進んでいる | 古い | **赤** | **次の旅で黙る**（いちばん悪い） |
    # | 終わった | 最終日まで在る | 通った | 直っているものを毎晩鳴らす |
    # | 終わった | 最終日の手前で切れている | **赤** | 旅程の焼き損ねを見のがす |
    #
    # 4通りは**作った章**で当てる。本番の章がいま進んでいるか終わっているかに
    # よらず、次の旅が来ても同じ4通りが回る。本番の章と本番の表の組み合わせは、
    # そのすぐ下で別に当てる（こちらが「いまの本番で緑か」）。
    for name in sorted(chapter_covers):
        b = BOOKS[name]

        start, last = date(2026, 3, 1), date(2026, 3, 20)
        during, after = date(2026, 3, 10), date(2026, 4, 1)
        closed = Span(b.chapter, start, last)   # 終わりの決まっている章
        openep = Span(b.chapter, start, None)   # 終わりがまだ決まっていない章

        def _with(span: Span, table_last: date) -> dict[str, Facts]:
            seen = dict(base)
            seen[CHAPTERS_TS] = Facts(name=CHAPTERS_TS, found=True,
                                      dates=base[CHAPTERS_TS].dates, chapters=[span])
            seen[name] = _facts(name, _rewrite_dates(src_of[name], table_last))
            return seen

        for label, span, table_last, clock, want in (
            ("進んでいる旅 × 表が今日まで在る", closed, during, during, "通った"),
            ("進んでいる旅 × 表が古い", closed, during - timedelta(days=1), during, "赤"),
            ("終わった旅 × 表が最終日まで在る", closed, last, after, "通った"),
            ("終わった旅 × 表が最終日の手前で切れている", closed, last - timedelta(days=1),
             after, "赤"),
            # 終わりがまだ決まっていない章（`to` が空で、次の章もまだ無い）は
            # **終わっていない側。** ここを「終わった」に倒すと、旅のあいだずっと黙る
            ("終わりが未定の旅 × 表が今日まで在る", openep, during, during, "通った"),
            ("終わりが未定の旅 × 表が古い", openep, during - timedelta(days=1), during, "赤"),
        ):
            check(f"{name}：{label}", _status(_with(span, table_last), name, clock), want)

        # --- 章が読めないときは、**通ったと言わない** -----------------------
        # ここが「読めなければ見ない」だと、`chapters.ts` の章の名前を
        # 変えた日から、この本は二度と鳴らなくなる（§15 の「いつでも通る見張り」）
        seen = dict(base)
        seen[CHAPTERS_TS] = Facts(name=CHAPTERS_TS, found=True,
                                  dates=base[CHAPTERS_TS].dates,
                                  chapters=[Span("よその章", start, last)])
        seen[name] = _facts(name, _rewrite_dates(src_of[name], last))
        check(f"{name}：章 {b.chapter} が {CHAPTERS_TS} に無いとき",
              _status(seen, name, after), "数えられない")

        # 表に章を書き忘れた本も同じ。**既定で通さない**
        books = dict(BOOKS)
        books[name] = replace(b, chapter="")
        v = judge(dict(base), after, books)
        check(f"{name}：どの章の表なのかを書き忘れたとき",
              [r.status for r in v.results if r.name == name], ["数えられない"])

        # 章を読み落としていたら、**先ぶんの表は通ったと言わない。**
        # 落ちた章がこの本の持ち主だったら、旅が終わったかどうかが分からない
        seen = dict(base)
        seen[CHAPTERS_TS] = Facts(name=CHAPTERS_TS, found=True,
                                  dates=base[CHAPTERS_TS].dates,
                                  chapters=base[CHAPTERS_TS].chapters,
                                  chapters_missed=1)
        v = judge(seen, after)
        check(f"{CHAPTERS_TS} を1章読み落としたとき（{name} 側から）",
              any("読めていません" in line for line in v.blind), True)

        # --- 本番の章 × 本番の表。**ここが「いまの本番で緑か」** -------------
        sp = {x.slug: x for x in base[CHAPTERS_TS].chapters}.get(b.chapter)
        check(f"{name} の章 {b.chapter} が本番の {CHAPTERS_TS} から読める",
              sp is not None and sp.start is not None, True)
        if sp is None or sp.start is None:
            continue
        check(f"{name}：本番の表を、旅のとちゅう（{sp.start + timedelta(days=1)}）に当てて",
              _status(dict(base), name, sp.start + timedelta(days=1)), "通った")
        if sp.end is None:
            # 終わりが決まっていない章なら、旅のあとは当てられない。
            # **黙って飛ばさず、飛ばしたことを印字する**（分母。§15）
            print(f"  {name}: 章 {b.chapter} はまだ終わりが決まっていないので、"
                  f"「旅のあと」は当てていない")
            continue
        check(f"{name}：本番の表を、旅のあと（{sp.end + timedelta(days=5)}）に当てて",
              _status(dict(base), name, sp.end + timedelta(days=5)), "通った")
        print(f"  {name}: 章 {b.chapter} {sp.start}〜{sp.end} / "
              f"表のいちばん先 {base[name].dates[-1]}")
        check(f"{name} の表が、章の最終日まで届いている",
              base[name].dates[-1] >= sp.end, True)

    # --- 3e. 章を持たない先ぶんの表（`ENDLESS`）-----------------------------
    #
    # 企画の表は旅ごとのものではない。**いつ読んでも「これから」が1件は在る**のが
    # 正しいので、章が終わっても緩まない。ここが `LATEST` だったあいだ、
    # 企画4件が全部終わったまま25日ぶん、表紙が「行ってきた」北欧旅を
    # 「いま、いちばん近い企画」として出していて、見張りは毎晩緑だった。
    #
    # | 表 | ほしい答え | 抜けると何が起きるか |
    # | --- | --- | --- |
    # | 先の予定が1件でもある | 通った | 企画を足しても鳴り続ける |
    # | 先の予定が0件（きょうが最後） | **赤** | **いまの本番がこれ。25日黙った** |
    # | 章が終わっても、先の予定が在れば | 通った | 章に引きずられている |
    for name in sorted(endless_covers):
        for label, table_last, clock, want in (
            ("先の予定が1件ある（あすの日付）", TODAY + timedelta(days=1), TODAY, "通った"),
            ("先の予定がきょうの日付だけ", TODAY, TODAY, "通った"),
            ("先の予定が0件（いちばん先がきのう）", TODAY - timedelta(days=1), TODAY, "赤"),
            ("ずっと先の予定（1年先）", TODAY + timedelta(days=365), TODAY, "通った"),
        ):
            seen = dict(base)
            seen[name] = _facts(name, _rewrite_dates(src_of[name], table_last))
            check(f"{name}：{label}", _status(seen, name, clock), want)

        # **章が終わっても緩まない。** `chapters.ts` を丸ごと「終わった章1つ」に
        # しても、先の予定が0件なら赤のまま。ここが緩むと、旅が終わった日から
        # 企画が1件も無くても毎晩緑になる
        seen = dict(base)
        seen[CHAPTERS_TS] = Facts(name=CHAPTERS_TS, found=True,
                                  dates=base[CHAPTERS_TS].dates,
                                  chapters=[Span("nordic", date(2026, 1, 1),
                                                 date(2026, 1, 10))])
        seen[name] = _facts(name, _rewrite_dates(src_of[name], TODAY - timedelta(days=1)))
        check(f"{name}：章が全部終わっていても、先が0件なら赤",
              _status(seen, name, TODAY), "赤")

        # `chapters.ts` が1行も読めなくても、章を持たない表は判定できる。
        # **ここで「数えられない」に落ちると、他の本の都合でこの見張りが消える**
        seen = dict(base)
        seen[CHAPTERS_TS] = Facts(name=CHAPTERS_TS, found=True,
                                  dates=base[CHAPTERS_TS].dates, chapters=[])
        seen[name] = _facts(name, _rewrite_dates(src_of[name], TODAY - timedelta(days=1)))
        check(f"{name}：章が1つも読めなくても判定できる", _status(seen, name, TODAY), "赤")

        # --- 本番の表。**ここが「いまの本番で赤か」** -----------------------
        ahead = [d for d in base[name].dates if d >= date.today()]
        print(f"  {name}: 本番の日付 {len(base[name].dates)}件 / "
              f"いちばん先 {base[name].dates[-1]} / "
              f"きょう（{date.today()}）以降 {len(ahead)}件")

    # --- 3f. 旅ごとに取り直す写し（`SNAP`）---------------------------------
    #
    # `nordicShops.ts` を日だけで見ていたので、**2026-10-14 に消しようのない
    # 赤が立つ**ところだった（旅の最終日 09-27 ＋ 取った日 09-13 から31日）。
    # 終わった旅の店の表は、そこで止まっているのが正しい。
    #
    # **「終わった旅は見ない」にしない。** 無条件に外すと、前の旅の表を
    # 持ち越したまま次の旅が始まっても黙る（旅と旅のあいだは実測で最大126日）。
    #
    # | 旅 | 取った日 | ほしい答え | 抜けると何が起きるか |
    # | --- | --- | --- | --- |
    # | 進んでいる | 新しい | 通った | 旅のあいだじゅう狼少年 |
    # | 進んでいる | 古い | **赤** | 古い店の表で旅の面を配る |
    # | 終わった | 旅のうちに取れている | 通った | **消しようのない赤**（2026-10-14） |
    # | 終わった | 前の旅から持ち越している | **赤** | 旅が変わっても黙る |
    # | 終わった | 旅のあとに取り直している | **赤** | 章の `to` と食い違っている |
    for name in sorted(snap_books):
        b = BOOKS[name]
        green, red = TWO_SNAPS[name]

        start, last = date(2026, 3, 1), date(2026, 3, 20)
        during, after = date(2026, 3, 10), date(2026, 4, 1)
        closed = Span(b.chapter, start, last)
        openep = Span(b.chapter, start, None)

        def _snap(span: Span, took: date) -> dict[str, Facts]:
            seen = dict(base)
            seen[CHAPTERS_TS] = Facts(name=CHAPTERS_TS, found=True,
                                      dates=base[CHAPTERS_TS].dates, chapters=[span])
            seen[name] = _facts(name, _rewrite_dates(src_of[name], took))
            return seen

        for label, span, took, clock, want in (
            # 旅の最中。**しきい値から作らない2つの数**（`TWO_SNAPS`）で当てる
            (f"進んでいる旅 × 正常な空き({green}日前)", closed,
             during - timedelta(days=green), during, "通った"),
            (f"進んでいる旅 × 前の旅の持ち越し({red}日前)", closed,
             during - timedelta(days=red), during, "赤"),
            # 終わりが未定の章も「終わっていない」側
            (f"終わりが未定の旅 × 前の旅の持ち越し({red}日前)", openep,
             during - timedelta(days=red), during, "赤"),
            # 旅のあと。**日ではなく、旅のうちに取れているか**
            ("終わった旅 × 旅のうちに取れている（最終日）", closed, last, after, "通った"),
            ("終わった旅 × 旅のうちに取れている（出発の前日）", closed,
             start - timedelta(days=1), after, "通った"),
            ("終わった旅 × 旅の始まりちょうど", closed, start, after, "通った"),
            (f"終わった旅 × 旅の {b.days}日前ちょうど（境目の内側）", closed,
             start - timedelta(days=b.days), after, "通った"),
            (f"終わった旅 × 旅の {b.days + 1}日前（前の旅の表）", closed,
             start - timedelta(days=b.days + 1), after, "赤"),
            ("終わった旅 × 旅のあとに取り直している", closed,
             last + timedelta(days=1), after, "赤"),
        ):
            check(f"{name}：{label}", _status(_snap(span, took), name, clock), want)

        # 章が読めないときは、**通ったと言わない**（§15）
        seen = dict(base)
        seen[CHAPTERS_TS] = Facts(name=CHAPTERS_TS, found=True,
                                  dates=base[CHAPTERS_TS].dates,
                                  chapters=[Span("よその章", start, last)])
        seen[name] = _facts(name, _rewrite_dates(src_of[name], last))
        check(f"{name}：章 {b.chapter} が {CHAPTERS_TS} に無いとき",
              _status(seen, name, after), "数えられない")

        # 表に章を書き忘れた本も同じ。**既定で通さない**
        books = dict(BOOKS)
        books[name] = replace(b, chapter="")
        v = judge(dict(base), after, books)
        check(f"{name}：どの章の表なのかを書き忘れたとき",
              [r.status for r in v.results if r.name == name], ["数えられない"])

        # --- 本番の章 × 本番の表。**ここが「いまの本番で緑か」** -------------
        sp = {x.slug: x for x in base[CHAPTERS_TS].chapters}.get(b.chapter)
        check(f"{name} の章 {b.chapter} が本番の {CHAPTERS_TS} から読める",
              sp is not None and sp.start is not None, True)
        if sp is None or sp.start is None:
            continue
        print(f"  {name}: 章 {b.chapter} {sp.start}〜{sp.end} / "
              f"取った日 {base[name].dates[-1]}")
        check(f"{name}：本番の写しを、旅のとちゅう（{sp.start + timedelta(days=1)}）に当てて",
              _status(dict(base), name, sp.start + timedelta(days=1)), "通った")
        if sp.end is None:
            print(f"  {name}: 章 {b.chapter} はまだ終わりが決まっていないので、"
                  f"「旅のあと」は当てていない")
            continue
        # **日だけで見ていたら赤が立っていた日**を、名指しで当てる。
        # ここが「31日目」。`BREAK=snap-days` を当てるとこの行が落ちる
        boom = sp.end + timedelta(days=b.days + 1)
        check(f"{name}：旅が終わって {b.days + 1}日たった日（{boom}）も緑",
              _status(dict(base), name, boom), "通った")
        check(f"{name}：旅が終わって1年たった日も緑",
              _status(dict(base), name, sp.end + timedelta(days=365)), "通った")

    # --- 3d. 章の読み取りが、コメントと入れ子に騙されないか ------------------
    #
    # `chapters.ts` はコメントだらけで、本文のほうにも日付が山ほど書いてある
    # （「あやと 2026-09-06『ストックホルム出るまでが北欧旅です』」など）。
    # **コメントの中の `to: "…"` を欄として拾うと、旅の終わりが別の日になる。**
    # そうなると先ぶんの表の判定が丸ごとずれるので、ここで押さえる。
    #
    # 本番の `chapters.ts` では **`to` の入っている章しか通らない。**
    # `plannedDays` で閉じる道と、次の章の前日で閉じる道は、本番では
    # どこも通らないまま残る（通らない枝は、壊れても誰も気づかない）。
    # だから字を自分で組んで、3通りの閉じかたを別々に当てる。
    made = """
export type Chapter = { slug: string };
export const CHAPTERS: Chapter[] = [
  {
    slug: "alpha",
    from: "2026-01-01",
    to: "2026-01-10",
    countries: ["a", "b"],
    icon: "https://example.com/a//b.png",
    note: "to: \\"2026-12-31\\" と本文に書いてあっても、欄ではない",
  },
  {
    // ここに to: "2026-12-31" と書いてもコメント
    /* from: "2020-01-01" も同じ */
    slug: "beta",
    from: "2026-01-11",
    to: "",
    plannedDays: 5,
    countries: [],
  },
  {
    slug: "delta",
    branchOf: "alpha",
    from: "2026-01-12",
    to: "",
    countries: [],
  },
  {
    slug: "gamma",
    from: "",
    opensAt: "2026-02-01T00:00:00+09:00",
    countries: [],
  },
];
"""
    got = {sp.slug: (sp.start, sp.end) for sp in chapter_spans(made)}
    check("章を4つとも読む", sorted(got), ["alpha", "beta", "delta", "gamma"])
    check("`to` が入っていればそれが終わり（本文の to: に釣られない）",
          got.get("alpha"), (date(2026, 1, 1), date(2026, 1, 10)))
    # beta は `plannedDays` 5日ぶん（1/11〜1/15）。次の**本線**は gamma の 2/1 なので
    # 1/31 のほうが遅い。**枝（delta の 1/12）を次の章に数えると 1/11 になる**
    check("`to` が空なら plannedDays ぶん（枝は次の章に数えない）",
          got.get("beta"), (date(2026, 1, 11), date(2026, 1, 15)))
    check("plannedDays も無ければ、次の本線の前日", got.get("delta"),
          (date(2026, 1, 12), date(2026, 1, 31)))
    check("`from` が空なら opensAt の日。あとが無ければ終わりは未定",
          got.get("gamma"), (date(2026, 2, 1), None))

    # コメントの中の章を、章として数えない（丸ごとコメントアウトされた章）
    check("コメントの中の章を数えない",
          len(chapter_spans(made.replace('    slug: "gamma",', '    // slug: "gamma",'))), 3)

    # --- 4. 鍵で見る本（①b）も両側から ---------------------------------------
    for name, b in BOOKS.items():
        if b.rule != KEYS:
            continue
        up = b.upstream
        # 正常な側: 上流から「下流に無い鍵」を消すと、欠けが0になる
        missing = [k for k in base[up].keys if k not in set(base[name].keys)]
        clean = src_of[up]
        for k in missing:
            clean = _drop_key(clean, up, k)
        seen = dict(base)
        seen[up] = _facts(up, clean)
        check(f"{name} の上流をそろえたとき", _status(seen, name), "通った")

        # 古い側: 下流から鍵を1つ落とすと赤
        seen = dict(base)
        seen[up] = _facts(up, clean)
        seen[name] = _facts(name, _drop_key(src_of[name], name, base[name].keys[0]))
        check(f"{name} から鍵を1つ落としたとき", _status(seen, name), "赤")

        # 上流が空なら「数えられない」（0件を通ったと読ませない。§15）
        seen = dict(base)
        seen[up] = Facts(name=up, found=True, dates=base[up].dates, keys=[])
        check(f"{name} の上流の鍵が0件のとき", _status(seen, name), "数えられない")

    # --- 4c. 「測れない人」の逃がしが、効いているか ---------------------------
    # `characterBox.ts` は**絵の無い人を焼けない。** 焼くほうがその人を
    # `noArt` に名指しで置くので、そこは赤にしない。**逃がす側だけを対照にすると、
    # 逃がしが効きすぎて何も鳴らなくなっても気づけない**ので、
    # 「箱を落とすと赤」と「その人を noArt に置くと通る」を並べて当てる。
    if BOOKS.get("characterBox.ts") and BOOKS["characterBox.ts"].rule == KEYS:
        name = "characterBox.ts"
        up = BOOKS[name].upstream
        clean = src_of[up]
        for k in [k for k in base[up].keys if k not in set(base[name].keys)]:
            clean = _drop_key(clean, up, k)
        gone = base[name].keys[0]
        dropped = _drop_key(src_of[name], name, gone)
        seen = dict(base)
        seen[up] = _facts(up, clean)
        seen[name] = _facts(name, dropped)
        check("箱を1人ぶん落としたとき", _status(seen, name), "赤")
        stamp = (
            '\n\nexport const CHARACTER_BOX_BAKED = {\n'
            f'  at: "{TODAY.isoformat()}",\n  people: 1,\n  boxes: 0,\n  noArt: [\n'
            f'    "{gone}",\n  ],\n}} as const;\n'
        )
        seen[name] = _facts(name, dropped + stamp)
        check("落とした人を noArt に置いたとき", _status(seen, name), "通った")
        # 逃がしは**名指しのときだけ。** 数だけ書いても通してはいけない
        seen[name] = _facts(name, dropped + stamp.replace(f'    "{gone}",\n', ""))
        check("noArt を空にしたとき", _status(seen, name), "赤")

    # --- 4b. 割合で見る本（セリフ）も両側から ---------------------------------
    # **`KEYS` と同じ形にしない。** あちらは1件でも欠けたら赤だが、こちらは
    # 欠けていて当たり前の本。両側の値は実測から取ってある（`TWO_SHARES`）
    for name, (green, red) in TWO_SHARES.items():
        b = BOOKS[name]
        check(f"{name} が SHARE で見られている", b.rule, SHARE)
        check(f"{name} のしきい値が書き切った値({green}%)より上", b.share >= green, True)
        check(f"{name} のしきい値が言われた朝の値({red}%)より下", b.share < red, True)

        roster = base[b.upstream].keys
        for label, pct, want in (("書き切った側", green, "通った"), ("言われた朝の側", red, "赤")):
            n = round(len(roster) * pct / 100)
            seen = dict(base)
            seen[name] = _facts(name, _voiceless(src_of[name], name, roster, n))
            check(f"{name} を{label}({pct}%＝{n}人)にしたとき", _status(seen, name), want)

        # --- 境目を、**すぐ両隣で別々に**当てる -----------------------------
        # 前はここが1本しかなく、しかも `round(len(roster) * share / 100)` 人を
        # 「ちょうど share%」だと思っていた。**名簿が 99人のとき、50% に
        # あたるのは 49.5人で、整数では作れない。** `round` は 50人を返すので、
        # 作っていたのは 50.505%（＝しきい値を超えている側）だった。
        # 名簿が 102人だったあいだは 51人＝ちょうど 50% で当たっていたので、
        # **名簿が1人減った晩に、判定は正しいまま対照だけが落ちた**（#187）。
        #
        # いまは境目の**両側**を、割り算ではなく整数から作る:
        #   n_ok  … しきい値を超えない**いちばん大きい**人数（= share*N//100）
        #   n_red … その次の1人（ここから先は超えている）
        # 割り切れる名簿（102人・50%）なら n_ok がちょうど 50% そのものになる。
        n_ok = b.share * len(roster) // 100
        n_red = n_ok + 1
        for label, n, want in ((f"境目の内側({n_ok}人)", n_ok, "通った"),
                               (f"境目の外側({n_red}人)", n_red, "赤")):
            seen = dict(base)
            seen[name] = _facts(name, _voiceless(src_of[name], name, roster, n))
            check(f"{name} を{label}にしたとき", _status(seen, name), want)
        # 作ったものが本当に境目の両隣かを、印字して残す（分母を出す。§15）
        print(f"  {name}: 名簿 {len(roster)}人 / しきい値 {b.share}% → "
              f"内側 {n_ok}人={100 * n_ok / len(roster):.2f}% / "
              f"外側 {n_red}人={100 * n_red / len(roster):.2f}%")

        # 上流（名簿）が空なら「数えられない」。0件を通ったと読ませない（§15）
        seen = dict(base)
        seen[b.upstream] = Facts(name=b.upstream, found=True, dates=base[b.upstream].dates, keys=[])
        check(f"{name} の上流の鍵が0件のとき", _status(seen, name), "数えられない")

    # --- 4d. ちょうどしきい値そのものと、そのすぐ上（名簿を作って当てる）------
    # 上の足は**いまの名簿の人数**に縛られる。99人では 50% ちょうどを作れないし、
    # 丸めの穴（`round(50.5)` が偶数側の 50 に寄る）も踏めない。
    # ここだけは名簿を自分で組んで、**ちょうど** と **そのすぐ上** を別々に当てる。
    for name, b in BOOKS.items():
        if b.rule != SHARE:
            continue
        up = b.upstream
        total = 200  # 100 で割り切れる人数。50% ちょうどが整数で作れる
        keys = [f"UC{i:04d}" for i in range(total)]
        exact = b.share * total // 100          # ちょうどしきい値
        for label, gone, want in ((f"ちょうど{b.share}%（{exact}/{total}人）", exact, "通った"),
                                  (f"{b.share}% のすぐ上（{exact + 1}/{total}人）", exact + 1, "赤")):
            seen = dict(base)
            seen[up] = Facts(name=up, found=True, dates=base[up].dates, keys=list(keys))
            seen[name] = Facts(name=name, found=True, dates=base[name].dates,
                               keys=keys[gone:])
            check(f"{name} が{label}のとき", _status(seen, name), want)

    # --- 5. 数えられない側 ---------------------------------------------------
    for name in sorted(dated):
        seen = dict(base)
        seen[name] = Facts(name=name, found=True, dates=[], keys=base[name].keys)
        check(f"{name} の日付が0件のとき", _status(seen, name), "数えられない")

    seen = dict(base)
    seen["newThing.ts"] = Facts(name="newThing.ts", found=True)
    check("表に無い本が置き場に増えたとき", bool(judge(seen, TODAY).blind), True)

    seen = {n: f for n, f in base.items() if n != "recipes.ts"}
    check("表に在る本が置き場から消えたとき", bool(judge(seen, TODAY).blind), True)

    # --- 6. 終了コードを、口から実測する -------------------------------------
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        green_dir = root / "green"
        shutil.copytree(CONTENT, green_dir)
        # 判定する本を全部「通る」側に寄せる。
        # **日付を先に、鍵をあとに書く。** `recipes.ts` は片方の本の上流で、
        # もう片方では日付で見る本。順を混ぜると、あとから書いたほうが
        # 先に直したところを元に戻す（実際に踏んだ）。
        for name, b in BOOKS.items():
            # `SNAP` は旅の最中なら日で見る側。`TODAY`（2026-09-17）は北欧の
            # 旅のまっただ中なので、きのう取ったことにすれば通る
            if b.rule in (LATEST, SNAP):
                (green_dir / name).write_text(
                    _rewrite_dates(src_of[name], TODAY - timedelta(days=1)), encoding="utf-8"
                )
            elif b.rule == COVERS:
                (green_dir / name).write_text(
                    _rewrite_dates(src_of[name], TODAY + timedelta(days=5)), encoding="utf-8"
                )
        for name, b in BOOKS.items():
            if b.rule != KEYS:
                continue
            up = b.upstream
            clean = (green_dir / up).read_text(encoding="utf-8")
            for k in [k for k in base[up].keys if k not in set(base[name].keys)]:
                clean = _drop_key(clean, up, k)
            (green_dir / up).write_text(clean, encoding="utf-8")

        red_dir = root / "red"
        shutil.copytree(green_dir, red_dir)
        (red_dir / "recipes.ts").write_text(
            _rewrite_dates(src_of["recipes.ts"], TODAY - timedelta(days=200)), encoding="utf-8"
        )

        blind_dir = root / "blind"
        shutil.copytree(green_dir, blind_dir)
        (blind_dir / "newThing.ts").write_text("export const X = 1;\n", encoding="utf-8")

        for label, d, want in (("通る", green_dir, 0), ("古い", red_dir, 1), ("数えられない", blind_dir, 2)):
            r = subprocess.run(
                [sys.executable, str(REPO / "python" / "stale_content_watch.py"),
                 "--dir", str(d), "--today", TODAY.isoformat()],
                capture_output=True, text=True,
            )
            check(f"口を叩いたときの終了コード（{label}）", r.returncode, want)

        # 置き場が空なら 2（数えるものが無い）
        empty = root / "empty"
        empty.mkdir()
        r = subprocess.run(
            [sys.executable, str(REPO / "python" / "stale_content_watch.py"), "--dir", str(empty)],
            capture_output=True, text=True,
        )
        check("置き場が空のときの終了コード", r.returncode, 2)

    # --- 出す ----------------------------------------------------------------
    print(f"対照 {len(ok) + len(ng)}件中 {len(ok)}件通った")
    for line in ng:
        print(f"::error::{line}")
    if not ok:
        print("::error::対照が0件です。種（site/content）が読めていません")
        return 1
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
