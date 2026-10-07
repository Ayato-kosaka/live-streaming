"""**その日どの国にいたか（`python/stays.py`）が、国を取りこぼさないか。**

    python3 python/stays_selftest.py

    BREAK=nochapter python3 python/stays_selftest.py  # 旅程ファイルの無い章の受け皿を外す
    BREAK=noclose   python3 python/stays_selftest.py  # 章が終わっても滞在を閉じない
    BREAK=eatall    python3 python/stays_selftest.py  # 受け皿が旅程の在る章にも手を出す

終了コード 0=ぜんぶ通った / 1=外したものがある / 2=`BREAK` の名前が違う。

## なぜ要るか

2026-10-06 の本番で、**アルバニアの配信11本が「スウェーデン・ストックホルム」
として焼かれていた。** `/map/sweden` の街の札に「ストックホルム 18本の配信」と
出て、その中に「アルバニアつきましたー」「アルバニアでピザ食べる！」が並ぶ。

根っこは2つで、**どちらか片方だけ直すと別の嘘になる。**

| | 何が起きていたか | 直すだけだとどうなるか |
| --- | --- | --- |
| `countries.ts` のスウェーデンが `to: ""` | 読む側が `to or "9999-12-31"` と読むので、**開いた滞在が以後をぜんぶ飲み込む** | 閉じると、09-28 以降の配信が**どの国にも入らない**（`p:""` の無言の行） |
| 旅程ファイル（`nordic.ts`）が北欧にしか無い | アルバニアは滞在の出どころがどこにも無い | 受け皿だけ足しても、開いた滞在が先に当たるので何も変わらない |

**嘘が無言に変わるだけ**なのがいちばん悪い。赤くならず、画面は
「配信はのこっていない」と言い切る（`docs/island-misses.md` #12）。
だからここは「国が当たること」ではなく、**どの日も行き場があること**を見る。

## 対照は、本番の字で当てる

仕込んだ字だけで当てると、**本番の書き方が変わった日に対照のほうが先に
易しくなる。** 本番の `countries.ts` と `chapters.ts` をそのまま食わせて、
`sweden 2026-09-20 → 2026-09-27` と `albania 2026-09-28 →（開いたまま）` が
出ることと、**いまいる章の初日から今日まで、1日も行き場を失っていない**ことを
印字する（`docs/island-standards.md` §15）。

仕込んだ字のほうは、本番には1つしか無い形——**同じ章に2カ国／章が閉じたとき／
まだ着いていない国**——を当てるのに使う。本番の1例では足が足りない。
"""

from __future__ import annotations

import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import stays  # noqa: E402
from stays import chapter_stays, read_all, read_nordic  # noqa: E402

# **足を1本ずつ抜く**（`docs/island-standards.md` §15「対照は、足の数だけ用意する」）。
#
# | `BREAK` | 何に戻すか | 落ちる足 |
# | --- | --- | --- |
# | `nochapter` | 旅程ファイルの無い章から滞在を出さない（2026-10-06 より前） | アルバニアが出る／本番で albania が立つ／日に穴が無い |
# | `noclose` | 章の `to` を見ない。終わった章の滞在が開いたまま残る | 章が終わったら滞在も閉じる |
# | `eatall` | 旅程ファイルの在る章にも受け皿が手を出す | 北欧の答えが1文字も変わらない |
#
# **3本を1本にまとめない。** `nochapter` は「出ない」、`noclose` は
# 「閉じない」、`eatall` は「細かいほうを潰す」で、別のこと。
# 今回の不具合は1つめと、`countries.ts` の開いた滞在が**揃って**起きた。
BREAK = os.environ.get("BREAK", "")
LEGS = ("nochapter", "noclose", "eatall")

# 旅程ファイル（`content/nordic.ts`）から出る滞在。**1文字も変わってはいけない。**
#
# `after` に 2026-09-11（ジョージアの最後の滞在の終わり）を渡したときの答えを
# そのまま凍らせてある。`read_all()` 越しだと `countries.ts` に移された国が
# 先に当たって消えるので、**旅程の側だけを名指しで呼ぶ。**
NORDIC_GOLDEN = [
    {"slug": "poland", "name": "ポーランド", "from": "2026-09-12", "to": "2026-09-13",
     "cities": ["ワルシャワ", "カトヴィツェ", "ビャウィストク"]},
    {"slug": "lithuania", "name": "リトアニア", "from": "2026-09-14", "to": "2026-09-15",
     "cities": ["ヴィリニュス"]},
    {"slug": "latvia", "name": "ラトビア", "from": "2026-09-16", "to": "2026-09-17",
     "cities": ["リガ"]},
    {"slug": "estonia", "name": "エストニア", "from": "2026-09-18", "to": "2026-09-18",
     "cities": ["タリン"]},
    {"slug": "finland", "name": "フィンランド", "from": "2026-09-19", "to": "2026-09-19",
     "cities": ["ヘルシンキ"]},
    {"slug": "sweden", "name": "スウェーデン", "from": "2026-09-20", "to": "2026-09-27",
     "cities": ["ストックホルム"]},
]

ok: list[str] = []
ng: list[str] = []


def check(name: str, got, want) -> None:
    if got == want:
        ok.append(name)
        print(f"  OK   {name}")
        return
    ng.append(f"{name}: {got!r} ≠ {want!r}")
    print(f"  NG   {name}\n         出た: {got!r}\n         ほしい: {want!r}")


def flat(rows: list) -> list:
    """`read_*` の返りを、1滞在1行の読みやすい形に潰す。"""
    return [
        {"slug": c["slug"], "name": c["name"], "from": s["from"], "to": s["to"],
         "cities": s["cities"]}
        for c in rows
        for s in c["stays"]
    ]


# ---------------------------------------------------------------- 足を抜く


def apply_break() -> None:
    """`BREAK` の名前のとおりに、`stays` の足を1本抜く。"""
    if BREAK == "nochapter":
        stays.read_ahead_chapters = lambda after="": []
    elif BREAK == "noclose":
        real = stays.chapter_stays

        def noclose(chapters, ahead, after="", today=""):
            # 章が終わっていても `to` を空のまま渡す＝滞在が閉じない
            opened = [dict(c, to="") for c in chapters]
            return real(opened, ahead, after=after, today=today)

        stays.chapter_stays = noclose
        stays.read_ahead_chapters = lambda after="": noclose(
            stays.read_chapters_ts(), stays.read_ahead(), after=after
        )
    elif BREAK == "eatall":
        stays.ITINERARY_CHAPTERS = set()


def now_chapter_stays(chapters, ahead, after="", today=""):
    """いまの（抜かれているかもしれない）`chapter_stays` を呼ぶ。"""
    return stays.chapter_stays(chapters, ahead, after=after, today=today)


# ---------------------------------------------------------------- 1. 北欧


def check_nordic() -> None:
    print("\n1. 旅程ファイルの在る章（北欧）の答えが、1文字も変わらない")
    got = flat(read_nordic(after="2026-09-11"))
    check("nordic.ts から出る滞在が凍らせたものと同じ", got, NORDIC_GOLDEN)

    # **受け皿は旅程の在る章に手を出さない。** 本番の AHEAD_COUNTRIES には
    # 北欧の期間に入る国が無いので、本番だけ見ていると**この足は当たらない。**
    # 仕込んだ字で当てる
    chapters = [
        {"slug": "nordic", "from": "2026-09-12", "to": "2026-09-27"},
        {"slug": "sonota", "from": "2026-09-28", "to": ""},
    ]
    ahead = [{"slug": "estonia", "name": "エストニア", "entered": "2026-09-18"}]
    got = flat(now_chapter_stays(chapters, ahead, today="2026-10-06"))
    check("旅程の在る章（nordic）には受け皿が1件も出さない", got, [])


# ---------------------------------------------------------------- 2. 受け皿


def check_receptacle() -> None:
    print("\n2. 旅程ファイルの無い章で、章の from〜to から滞在が出る")
    # **本番の日付を使わない。** 使うと、本番が動いた日に対照のほうが先に壊れる
    chapters = [{"slug": "aru", "from": "2030-03-01", "to": ""}]
    ahead = [{"slug": "zz", "name": "ゼット国", "entered": "2030-03-01"}]
    got = now_chapter_stays(chapters, ahead, after="2030-02-28", today="2030-03-20")
    check(
        "開いている章 → 滞在も開いたまま",
        flat(got),
        [{"slug": "zz", "name": "ゼット国", "from": "2030-03-01", "to": "",
          "cities": ["ゼット国"]}],
    )
    # 題名を見ずに国が決まる印。`build_city_streams.pick()` がこれを見て
    # 「その期間の配信ぜんぶ」にする（見ないと、題名が行き先を名乗る日に0本になる）
    check("日単位で確か（exact）の印が立つ", [s["exact"] for c in got for s in c["stays"]], [True])

    print("\n3. 章が終わって to が入ったら、その章の滞在も閉じる")
    closed = [{"slug": "aru", "from": "2030-03-01", "to": "2030-03-11"}]
    check(
        "閉じた章 → 滞在も同じ日で閉じる",
        flat(now_chapter_stays(closed, ahead, today="2030-03-20")),
        [{"slug": "zz", "name": "ゼット国", "from": "2030-03-01", "to": "2030-03-11",
          "cities": ["ゼット国"]}],
    )

    print("\n4. 本番に1つしか無い形（仕込んだ字でしか当てられない）")
    # 同じ章で国境を越えた。**重ねない**——重ねるとその日の配信が2カ国で二重に数えられる
    two = [
        {"slug": "zz", "name": "ゼット国", "entered": "2030-03-01"},
        {"slug": "yy", "name": "ワイ国", "entered": "2030-03-06"},
    ]
    check(
        "章1つに国2つ → 入った順に区切って重ならない",
        flat(now_chapter_stays(chapters, two, today="2030-03-20")),
        [
            {"slug": "zz", "name": "ゼット国", "from": "2030-03-01", "to": "2030-03-05",
             "cities": ["ゼット国"]},
            {"slug": "yy", "name": "ワイ国", "from": "2030-03-06", "to": "",
             "cities": ["ワイ国"]},
        ],
    )
    # まだ着いていない国の札が先に立つと、街の欄が「配信はのこっていない」と言い出す
    check(
        "まだ着いていない国は滞在にしない",
        flat(now_chapter_stays(chapters, two, today="2030-03-03")),
        [{"slug": "zz", "name": "ゼット国", "from": "2030-03-01", "to": "2030-03-05",
          "cities": ["ゼット国"]}],
    )
    # 前の国の終わりに食い込まない（`countries.ts` に書かれた滞在のほうが正）
    check(
        "after より後ろから始まる",
        [s["from"] for s in flat(now_chapter_stays(chapters, ahead, after="2030-03-04",
                                                   today="2030-03-20"))],
        ["2030-03-05"],
    )


# ---------------------------------------------------------------- 5. 本番の字


def check_production() -> None:
    print("\n5. 本番の countries.ts と chapters.ts を食わせる")
    rows = flat(read_all())
    for slug, want_from, want_to in (
        ("sweden", "2026-09-20", "2026-09-27"),
        ("albania", "2026-09-28", ""),
    ):
        got = [r for r in rows if r["slug"] == slug]
        shown = [f'{r["from"]} → {r["to"] or "（開いたまま）"}' for r in got]
        print(f"       {slug:8} {' / '.join(shown) or '（滞在が1件も無い）'}")
        check(f"{slug} の滞在が1件", len(got), 1)
        if len(got) == 1:
            check(f"{slug} {want_from} → {want_to or '（開いたまま）'}",
                  (got[0]["from"], got[0]["to"]), (want_from, want_to))

    # **いちばん大事な足。** 国が当たるかではなく、**どの日も行き場があるか。**
    # 行き場を失った日の配信は `p:""` の無言の行になって、赤くならないまま
    # 画面が「配信はのこっていない」と言い切る
    chapters = [c for c in stays.read_chapters_ts() if c["from"]]
    start = max(c["from"] for c in chapters)
    today = date.today().isoformat()
    spans = [(r["from"], r["to"] or "9999-12-31") for r in rows]
    d = date.fromisoformat(start)
    holes = []
    while d.isoformat() <= today:
        s = d.isoformat()
        if not any(lo <= s <= hi for lo, hi in spans):
            holes.append(s)
        d += timedelta(days=1)
    print(f"       いまいる章の初日 {start} から今日 {today} まで {len(holes)}日が行き場なし")
    check("いまいる章の初日から今日まで、行き場の無い日が0日", holes, [])


def main() -> int:
    if BREAK and BREAK not in LEGS:
        print(f"::error::BREAK の名前が違う（{', '.join(LEGS)} のどれか）: {BREAK}")
        return 2
    if BREAK:
        print(f"（足を1本抜いて回す: BREAK={BREAK}）")
        apply_break()

    check_nordic()
    check_receptacle()
    check_production()

    print(f"\n対照 {len(ok) + len(ng)}件中 {len(ok)}件通った")
    for line in ng:
        print(f"::error::{line}")
    if not ok:
        print("::error::対照が0件です（site/content/countries.ts が読めていません）")
        return 1
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
