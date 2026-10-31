#!/usr/bin/env python3
"""`python/buzzwords.py` の対照。**作り物のチャットを置いて、決めかたを1つずつ当てる。**

    python3 python/buzzwords_selftest.py        # 0=通った / 1=外した

ネットにも本番にも出ない。読むのはこのリポジトリの中だけ。

## なぜこの形か

流行語を数える道具がいちばん悪い壊れかたをするのは、**それらしい表が出るのに
中身が違う**こと。回数で並べば挨拶が上に来るし、名前を落とし忘れれば
視聴者さんの名前が配信の画面に出る。どちらも**表を見ただけでは気づけない。**

だから本番のチャットでは当てない。**何が何回入っているか分かっている作り物**を
置いて、件数・順番・落ちるものを1件まで突き合わせる。

置く作り物（`fake()` が作る）:

| 語 | その月 | それ以前 | 何を当てるか |
| --- | --- | --- | --- |
| `ニューワード` | 10件・10人 | 0件 | 伸びた語が上に来る |
| `アサガオ` | 12件・12人 | 500件 | 回数が多くても、伸びていなければ下 |
| `レンコレンコ` | 10件・**1人** | 0件 | 1人だけの連呼は落ちる（閾値どおり） |
| `カモメ堂` | 5件・5人 | 0件 | 名簿にある表示名は落ちる |
| `@ホシノヤド` | 6件・6人 | 0件 | `@` のあとの字は数えない |
| `:sparkles:` | 6件・6人 | 0件 | 絵文字の名前は数えない |
| URL の `kirakira` | 6件・6人 | 0件 | URL の中の字は数えない |
| `コンソメス` | 6件・6人 | 0件 | 同数なら長いほうを採る（`コンソメ` は落ちる） |
| `ねー` | 10件・10人 | 0件 | ひらがなだけ2〜3文字は落ちる |
| `ヨナカゴト` | 深夜1:30 の行 | — | 6時区切り（前の日に入る） |
| `ゴウリキコ` / `ハクリキコ` | 5件ずつ | 0件 | 単独で立たない尻尾（`リキコ`）は落ちる |
| `ヒミツノタレ` | 6件（`ヒミツ` 単独も3件） | 0件 | 言い回しまで伸ばす（`ヒミツ` では止めない） |
| `ヨクアルゴ` | 15件・12人 | 1000件 | 伸び率の下限（回数は多いが 8倍に届かない） |
| `ブロブロ` | 20件・**3人** | 300件・150人 | 人数では広がっていない語は落ちる |
"""

from __future__ import annotations

import datetime as dt
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_monthly  # noqa: E402
import buzzwords as bz  # noqa: E402

FROM, TO = "2026-10-02", "2026-10-31"
TAIL = "きょうもげんきです"       # どの行にも付ける埋め草。その月と前で同じ割合なので伸びない

# 作り物の中身。あとで1件まで突き合わせるので、**数はここだけに書く**
A_WORD, A_N = "ニューワード", 10
B_WORD, B_N, B_PRIOR = "アサガオ", 12, 500
SOLO_WORD, SOLO_N = "レンコレンコ", 10
NAME_WORD, NAME_N = "カモメ堂", 5
MENTION_WORD, MENTION_N = "ホシノヤド", 6
EMOJI_N, URL_N = 6, 6
LONG_WORD, LONG_N = "コンソメス", 6
HIRA_WORD, HIRA_N = "ねー", 10
NIGHT_WORD, NIGHT_N = "ヨナカゴト", 4
# 単独で立たない尻尾（`リキコ`）を作る2語。どちらの前にしか出ないので語ではない
SPLIT_WORDS, SPLIT_N, SPLIT_TAIL = ("ゴウリキコ", "ハクリキコ"), 5, "リキコ"
# 伸ばさないと届かない言い回し。`ヒミツ` 単独もあるので、短いほうも単独で立っている
PHRASE_WORD, PHRASE_N = "ヒミツノタレ", 6
PHRASE_HEAD, PHRASE_HEAD_N = "ヒミツ", 3
# 回数は多いが伸び率が 8倍に届かない語
DULL_WORD, DULL_N, DULL_PRIOR, DULL_PRIOR_PEOPLE = "ヨクアルゴ", 15, 1000, 100
# 件数では伸びているが、言ったのは3人だけ（それ以前は150人が言っていた）
NARROW_WORD, NARROW_N, NARROW_PEOPLE = "ブロブロ", 20, 3
NARROW_PRIOR, NARROW_PRIOR_PEOPLE = 300, 150
FILLER_N = 20
PRIOR_FILES = 5
PRIOR_PER_FILE = 10000
PRIOR_PEOPLE = 200
B_PRIOR_PEOPLE = 30
B_PRIOR_DAY = "2026-09-02"
DULL_PRIOR_DAY = "2026-09-03"

MONTH_PEOPLE = [f"@つき{i:02d}" for i in range(1, 13)]
SOLO_PERSON = "@ひとりだけ"


def _line(body: str, who: str) -> str:
    return f"[0:00:01] {who}: {body}"


def _write(root: Path, name: str, title: str, lines: list[str]) -> None:
    path = root / name[:4] / name[5:7]
    path.mkdir(parents=True, exist_ok=True)
    (path / f"{name}.chat.txt").write_text(
        f"# {title}\n# 開始\n\n" + "\n".join(lines) + "\n", encoding="utf-8")


def fake(root: Path) -> dict:
    """作り物のチャットを置いて、置いた数を返す。"""
    # ---- それ以前（5本 × 10,000件）。語を入れる本は決め打ち（初出の日を当てるため）
    prior_days = ["2026-09-01", B_PRIOR_DAY, DULL_PRIOR_DAY, "2026-09-04", "2026-09-05"]
    assert len(prior_days) == PRIOR_FILES
    for n, day in enumerate(prior_days):
        lines = []
        for i in range(PRIOR_PER_FILE):
            who = f"@ひと{i % PRIOR_PEOPLE + 1:03d}"
            body = TAIL
            if day == B_PRIOR_DAY and i < B_PRIOR:
                who = f"@ひと{i % B_PRIOR_PEOPLE + 1:03d}"
                body = f"{B_WORD}、{TAIL}"
            elif day == DULL_PRIOR_DAY and i < DULL_PRIOR:
                who = f"@ひと{i % DULL_PRIOR_PEOPLE + 1:03d}"
                body = f"{DULL_WORD}、{TAIL}"
            elif day == DULL_PRIOR_DAY and i < DULL_PRIOR + NARROW_PRIOR:
                who = f"@ひと{i % NARROW_PRIOR_PEOPLE + 1:03d}"
                body = f"{NARROW_WORD}、{TAIL}"
            lines.append(_line(body, who))
        _write(root, f"{day}_2200_prior{n}", f"まえの回{n}", lines)

    # ---- 深夜 1:30 に始まった回。**6時区切りなので配信日は前の日（10-01）= それ以前**
    _write(root, "2026-10-02_0130_night", "ふかよる",
           [_line(f"{NIGHT_WORD}、{TAIL}", f"@よる{i + 1}") for i in range(NIGHT_N)])

    # ---- その月
    rows: list[tuple[str, str]] = []
    for i in range(A_N):
        rows.append((f"{A_WORD}、{TAIL}", MONTH_PEOPLE[i % 12]))
    for i in range(B_N):
        rows.append((f"{B_WORD}、{TAIL}", MONTH_PEOPLE[i % 12]))
    for _ in range(SOLO_N):
        rows.append((f"{SOLO_WORD}、{TAIL}", SOLO_PERSON))
    for i in range(NAME_N):
        rows.append((f"{NAME_WORD}、{TAIL}", MONTH_PEOPLE[i]))
    for i in range(MENTION_N):
        rows.append((f"@{MENTION_WORD} {TAIL}", MONTH_PEOPLE[i]))
    for i in range(EMOJI_N):
        rows.append((f":sparkles: {TAIL}", MONTH_PEOPLE[i]))
    for i in range(URL_N):
        rows.append((f"https://example.com/kirakira {TAIL}", MONTH_PEOPLE[i]))
    for i in range(LONG_N):
        rows.append((f"{LONG_WORD}、{TAIL}", MONTH_PEOPLE[i]))
    for i in range(HIRA_N):
        rows.append((f"{HIRA_WORD}、{TAIL}", MONTH_PEOPLE[i]))
    for word in SPLIT_WORDS:
        for i in range(SPLIT_N):
            rows.append((f"{word}、{TAIL}", MONTH_PEOPLE[i]))
    for i in range(PHRASE_N):
        rows.append((f"{PHRASE_WORD}、{TAIL}", MONTH_PEOPLE[i]))
    for i in range(PHRASE_HEAD_N):
        rows.append((f"{PHRASE_HEAD}、{TAIL}", MONTH_PEOPLE[i]))
    for i in range(DULL_N):
        rows.append((f"{DULL_WORD}、{TAIL}", MONTH_PEOPLE[i % 12]))
    for i in range(NARROW_N):
        rows.append((f"{NARROW_WORD}、{TAIL}", MONTH_PEOPLE[i % NARROW_PEOPLE]))
    # `カモメ堂` を名簿に載せるための埋め草（表示名は、書いた人からしか分からない）
    for i in range(FILLER_N):
        who = f"@{NAME_WORD}" if i == 0 else MONTH_PEOPLE[i % 12]
        rows.append((TAIL, who))
    _write(root, "2026-10-05_2200_month", "こんげつの回",
           [_line(body, who) for body, who in rows])

    return {
        "month_msgs": len(rows),
        "prior_msgs": PRIOR_FILES * PRIOR_PER_FILE + NIGHT_N,
        "month_people": len({who for _b, who in rows}),
    }


def main() -> int:
    ok: list[str] = []
    ng: list[str] = []

    def check(name: str, cond: bool) -> None:
        (ok if cond else ng).append(name)

    # ---- 6時区切りは、数えなくても当てられる足が2本ある
    check("深夜1:30 の行は前の日に入る",
          bz.cut_day(dt.datetime(2026, 10, 2, 1, 30)) == "2026-10-01")
    check("朝6:00 からは その日に入る",
          bz.cut_day(dt.datetime(2026, 10, 2, 6, 0)) == "2026-10-02")
    # **境目を2か所に書かない**（`build_monthly` の SQL と同じ値であること）
    check("境目は焼くほうと同じ1本",
          bz.DAY_CUTOFF_HOUR == build_monthly.DAY_CUTOFF_HOUR
          and f"INTERVAL {bz.DAY_CUTOFF_HOUR} HOUR" in build_monthly.sql())

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp) / "streams"
        put = fake(root)
        saved = bz.STREAMS
        bz.STREAMS = root
        try:
            corpus = bz.Corpus(FROM, TO)
            rows = bz.tally(corpus, 3, 3)
            solo1 = bz.tally(corpus, 3, 1)
            nogate = bz.tally(corpus, 3, 3, min_lift=0)
        finally:
            bz.STREAMS = saved

        by = {r["word"]: r for r in rows}
        order = [r["word"] for r in rows]
        words = set(by)

        # ---- 件数と合計が、作り物の中身と1件まで合う
        check("その月の件数が作り物と合う", corpus.month_msgs == put["month_msgs"])
        check("それ以前の件数が作り物と合う", corpus.prior_msgs == put["prior_msgs"])
        check("その月の人数が作り物と合う", corpus.month_people == put["month_people"])
        check("伸びた語の回数と人数が合う",
              A_WORD in by and by[A_WORD]["count"] == A_N
              and by[A_WORD]["speakers"] == A_N and by[A_WORD]["prior_count"] == 0)
        check("回数の多い語の、それ以前の件数が合う",
              B_WORD in by and by[B_WORD]["count"] == B_N
              and by[B_WORD]["prior_count"] == B_PRIOR)

        # ---- 伸びた語が上に来る（今月10件・前0件 が、今月12件・前500件 より上）
        check("伸びた語が、回数の多い語より上",
              A_WORD in order and B_WORD in order
              and order.index(A_WORD) < order.index(B_WORD))

        # ---- 1人だけの連呼
        check("1人だけの連呼は落ちる", SOLO_WORD not in words)
        check("閾値を1人にすれば出る",
              any(r["word"] == SOLO_WORD and r["count"] == SOLO_N for r in solo1))

        # ---- 名前・絵文字の名前・URL
        check("名簿にある表示名は落ちる", NAME_WORD not in words)
        check("`@` のあとの字は数えない",
              not any(MENTION_WORD[:3] in w for w in words))
        check("絵文字の名前は数えない", not any("sparkl" in w for w in words))
        check("URL の中の字は数えない",
              not any("kirakira" in w or "example" in w for w in words))
        # **出すものに視聴者さんの名前が1件も混ざらない**（これが出たら配信の画面に出る）
        names = bz.known_names(corpus.names)
        check("出すものに視聴者さんの名前が0件", not (words & names))

        # ---- 同数なら長いほうを採る
        check("同数なら長いほうを採る",
              LONG_WORD in words and "コンソメ" not in words)

        # ---- ひらがなだけ2〜3文字
        check("ひらがなだけ2〜3文字は落ちる", HIRA_WORD not in words)

        # ---- 6時区切りが、仕分けにも効いている
        check("深夜1:30 の語は、その月ではなくそれ以前に入る",
              not any(NIGHT_WORD in text for _d, _t, _w, text in corpus.month)
              and any(NIGHT_WORD in blob for _t, _r, blob in corpus.prior))

        # ---- 初出は、それ以前に出ていればそちらの日
        check("初出は、それ以前に出た日を出す",
              B_WORD in by and by[B_WORD]["first_day"] == B_PRIOR_DAY)
        check("前に無い語の初出は、その月の日",
              A_WORD in by and by[A_WORD]["first_day"] == "2026-10-05")

        # ---- 単独で立たない尻尾は落ちる（「強力粉」と「薄力粉」の「力粉」）
        check("2語に挟まれただけの尻尾は落ちる",
              SPLIT_TAIL not in words and set(SPLIT_WORDS) <= words)

        # ---- 言い回しまで伸ばす。短いほうで止めない
        check("言い回しまで伸ばす",
              PHRASE_WORD in words and PHRASE_HEAD not in words)

        # ---- 伸び率の下限。回数が多くても 8倍に届かなければ出さない
        check("伸び率が足りない語は出ない", DULL_WORD not in words)
        check("下限を外せば出る（落としたのは伸び率の下限）",
              any(r["word"] == DULL_WORD for r in nogate))

        # ---- 人数の軸。件数では伸びているが、言ったのは3人だけ
        check("人数では広がっていない語は出ない", NARROW_WORD not in words)
        check("その語は件数の軸だけなら通ってしまう",
              bz.keyness(NARROW_N, corpus.month_msgs,
                         NARROW_PRIOR, corpus.prior_msgs) > 0
              and bz.lift(NARROW_N, corpus.month_msgs,
                          NARROW_PRIOR, corpus.prior_msgs) >= bz.MIN_LIFT
              and bz.keyness(NARROW_PEOPLE, corpus.month_people,
                             NARROW_PRIOR_PEOPLE, corpus.prior_people) <= 0)

        # ---- 挨拶のような、その月も前も同じ割合の語は上がらない
        check("その月も前も同じ割合の語は出ない", TAIL not in words)

    # ---- 置き場が動いたら「流行語なし」と答えない
    saved = bz.STREAMS
    bz.STREAMS = Path("/no/such/place")
    try:
        bz.chat_files()
        blew = False
    except ValueError:
        blew = True
    finally:
        bz.STREAMS = saved
    check("置き場が消えたら、数えずに投げる", blew)

    for name in ok:
        print(f"  ○ {name}")
    print(f"対照 {len(ok) + len(ng)}件中 {len(ok)}件通った")
    for name in ng:
        print(f"::error::{name} が外れました")
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
