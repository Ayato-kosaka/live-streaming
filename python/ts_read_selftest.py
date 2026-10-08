"""**`python/ts_read.py` が、本当に章を読めているか・読み落としたら落ちるか。**

    python3 python/ts_read_selftest.py

    BREAK=legacy  python3 python/ts_read_selftest.py   # 2026-10-03 までの読み方に戻す
    BREAK=nocount python3 python/ts_read_selftest.py   # 読み落としの数えを外す

終了コード 0=ぜんぶ通った / 1=外したものがある / 2=`BREAK` の名前が違う。

## なぜ要るか

`site/content/chapters.ts` を読む道具が3つあって、**そのうち1つだけが北欧の章を
黙って落としていた**（`python/ts_read.py` の頭に経緯）。落ちた理由は、
北欧の `slug:` と `name:` のあいだに**9行のコメント**が挟まっていること。

- 例外は出ない
- ログにも出ない
- `chapterStats.ts` と `chapterStreams.ts` から 9/12〜9/27 が消えるだけ

**見た目は毎晩ちゃんと焼けている。** だから5日以上、誰も気づかなかった。

## 対照は「読めること」だけでは足りない

「本番を読んで6章出た」だけだと、**本番の書き方が変わった日に、
対照のほうが先に易しくなる。** コメントが消えたら、どんな読み方でも通る。

だからここは3つを並べて当てる。

| 何を | なぜ |
| --- | --- |
| 本番の `chapters.ts` で、名乗っている章が**全部**読める | いま落ちていないこと |
| その本番に、**`slug:` と `name:` のあいだにコメントの挟まった章が在る** | この対照が易しくなっていないこと |
| 仕込んだ字で、**読み落としたら `missed` が立つ** | 次に落ちたとき、気づけること |

2つめが無いと、**対照が無言で易しくなる**（`docs/island-standards.md` §15）。

## 読む側だけでなく、**呼ぶ側が止まるか**も当てる

`missed` を返しても、呼ぶ側が見なければ同じこと。
`build_chapter_stats.read_chapters()` と `build_shorts.read_chapters()` に、
読み落とす字と、1章も名乗っていない字を食わせて、**両方とも止まる**ことと、
**止まるときの字が別**であることを見る（直す相手が違うので）。
"""

from __future__ import annotations

import os
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# `build_chapter_stats` は `config.py` を通るので、`BQ_PROJECT_ID` が無いと
# import だけで落ちる。ここは BigQuery を1度も叩かないので、名前だけ置く
os.environ.setdefault("BQ_PROJECT_ID", "ts-read-selftest")

import ts_read  # noqa: E402
from ts_read import ChapterRead, code_only, read_chapters  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
CHAPTERS_TS = REPO / "site" / "content" / "chapters.ts"
# 旅程。**日の出の表を焼くほうと見張りが、どちらもここから読む**
TRIP_TS = REPO / "site" / "content" / "nordic.ts"

# **足を1本ずつ抜く**（`island-standards.md` §15「対照は、足の数だけ用意する」）。
#
# | `BREAK` | 何に戻すか | 落ちる足 |
# | --- | --- | --- |
# | `legacy` | `slug → name → from → to` が改行だけを挟んで続くことを求める読み方 | 本番の章が全部読める／nordic が居る／呼ぶ側が通る |
# | `nocount` | 名乗っている数を数えず、読めた数をそのまま名乗りと言う | 読み落としたら `missed` が立つ／呼ぶ側が止まる |
#
# **2本を1本にまとめない。** `legacy` は「読めない」、`nocount` は
# 「読めなかったことに気づけない」で、別のこと。北欧が消えたのは**両方**が
# 揃ったから——片方だけ直しても、次の読み落としでまた黙る。
BREAK = os.environ.get("BREAK", "")
LEGS = ("legacy", "nocount")

# 2026-10-03 まで `build_chapter_stats.py` に在った読み方。**北欧がここで落ちる**
_LEGACY_RE = re.compile(
    r'slug: "([a-z-]+)",\n\s*name: "([^"]+)",\n\s*from: "([\d-]*)",\n\s*to: "([\d-]*)",'
)


def _legacy(src: str) -> ChapterRead:
    rows = [
        {"slug": m.group(1), "name": m.group(2), "from": m.group(3), "to": m.group(4),
         "opensAt": "", "branchOf": "", "plannedDays": 0}
        for m in _LEGACY_RE.finditer(src)
    ]
    return ChapterRead(rows=rows, declared=read_chapters(src).declared)


def _nocount(src: str) -> ChapterRead:
    rows = read_chapters(src).rows
    return ChapterRead(rows=rows, declared=len(rows))


def _hobble(mods: list) -> None:
    """`BREAK` の足を抜く。**呼ぶ側が持っている名前も差し替える**
    （`from ts_read import read_chapters as …` で値ごと持っていくので、
    モジュールの属性だけ差し替えても効かない）。"""
    if not BREAK:
        return
    fn = {"legacy": _legacy, "nocount": _nocount}[BREAK]
    ts_read.read_chapters = fn
    for m in mods:
        m.read_chapters_ts = fn


def _read(src: str) -> ChapterRead:
    """いま効いている読み方（`BREAK` を当てていればそちら）。"""
    return ts_read.read_chapters(src)


# 仕込みの字。**コメントを、落ちやすいところ全部に置いてある。**
MADE = """
export type Chapter = { slug: string; name: string };
export const CHAPTERS: Chapter[] = [
  {
    slug: "alpha",
    /* 名前の前に9行ぶんのコメントが入る、というのが本番の北欧の形。
       ここで切れる読み方だと、この章が丸ごと落ちる。
       to: "2026-12-31" と書いてあっても欄ではない。 */
    name: "ひとつめ",
    from: "2026-01-01",
    to: "2026-01-10",
    countries: ["a", "b"],   // 入れ子。中の字を欄と読まない
    icon: "https://example.com/a//b.png",
    note: "to: \\"2026-12-31\\" と本文に書いてあっても、欄ではない",
  },
  // ここに slug: "ghost" と書いてもコメント
  {
    slug: "beta",
    name: "ふたつめ",
    from: "2026-01-11",
    to: "",
    plannedDays: 5,
    countries: [],
  },
  {
    slug: "gamma",
    name: "みっつめ",
    from: "",
    opensAt: "2026-02-01T00:00:00+09:00",
    branchOf: "alpha",
    countries: [],
  },
];
"""

# 章を**いちばん外側ではないところ**に書いてしまった字。
# 名乗りは2つ、読めるのは1つ。ここで `missed` が立たないと、次に落ちたとき黙る
NESTED = """
export const CHAPTERS: Chapter[] = [
  {
    slug: "alpha",
    name: "ひとつめ",
    from: "2026-01-01",
    to: "2026-01-10",
    sub: { slug: "beta", name: "ふたつめ", from: "2026-02-01", to: "2026-02-10" },
  },
];
"""

EMPTY = "export const CHAPTERS: Chapter[] = [\n];\n"


def main() -> int:
    if BREAK and BREAK not in LEGS:
        print(f"::error::BREAK={BREAK} は足の名前ではありません。使えるのは {', '.join(LEGS)}")
        return 2

    import build_chapter_stats as bcs
    import build_shorts as bs

    _hobble([bcs, bs])
    if BREAK:
        print(f"** BREAK={BREAK} —— 足を1本抜いてある。ここは落ちるのが正しい **")

    ok: list[str] = []
    ng: list[str] = []

    def check(label: str, got, want) -> None:
        (ok if got == want else ng).append(f"{label}: 出た={got} ほしい={want}")

    # --- 1. 本番の chapters.ts -----------------------------------------------
    src = CHAPTERS_TS.read_text(encoding="utf-8")
    got = _read(src)
    slugs = [c["slug"] for c in got.rows]
    print(f"  本番の chapters.ts: 名乗り {got.declared}章 / 読めた {len(got.rows)}章"
          f" → {', '.join(slugs) or 'なし'}")
    check("本番が1章も名乗っていない、ということは無い", got.declared > 0, True)
    check("本番の章を1つも読み落としていない", got.missed, 0)
    check("本番から nordic が読める", "nordic" in slugs, True)

    # **この対照が易しくなっていないか。** 本番から「`slug:` と `name:` のあいだに
    # コメントが挟まった章」が消えたら、どんな読み方でも通ってしまう
    gap = re.compile(r'slug: "[a-z-]+",\s*\n\s*(?://|/\*)')
    hard = len(gap.findall(src))
    print(f"  うち、slug と name のあいだにコメントの挟まった章: {hard}個")
    check("本番に、読みにくい形の章がまだ在る（対照が易しくなっていない）", hard > 0, True)

    # --- 2. 仕込みの字 -------------------------------------------------------
    made = _read(MADE)
    rows = {c["slug"]: c for c in made.rows}
    check("仕込みの章を3つとも読む", sorted(rows), ["alpha", "beta", "gamma"])
    check("仕込みも読み落とし0", made.missed, 0)
    check("名前の前のコメントを跨いで name を読む", rows.get("alpha", {}).get("name"), "ひとつめ")
    check("本文の to: に釣られない", rows.get("alpha", {}).get("to"), "2026-01-10")
    check("コメントの中の章を数えない", "ghost" in rows, False)
    check("数の欄は数で返す", rows.get("beta", {}).get("plannedDays"), 5)
    check("空の欄は空の字で返す（`.get` を呼ぶ側に書かせない）",
          rows.get("beta", {}).get("opensAt"), "")
    check("opensAt と branchOf も読む",
          (rows.get("gamma", {}).get("opensAt"), rows.get("gamma", {}).get("branchOf")),
          ("2026-02-01T00:00:00+09:00", "alpha"))
    # 欄そのものの読み方も、1つ下の高さで当てる（`read_chapters` は章の欄しか
    # 返さないので、ここを通さないと「文字列の中の `//`」を踏めない）
    first = ts_read.objects(ts_read.array_body(code_only(MADE), "CHAPTERS"))[0]
    f = ts_read.fields(first)
    check("文字列の中の URL の `//` をコメントと読まない（後ろの欄が残る）",
          f.get("note", "")[:3], "to:")
    check("入れ子（`countries: [...]`）を欄にしない", "countries" in f, False)

    # --- 3. 読み落としたら、数で立つか ---------------------------------------
    nested = _read(NESTED)
    print(f"  入れ子に章を書いた字: 名乗り {nested.declared} / 読めた {len(nested.rows)}"
          f" / 読み落とし {nested.missed}")
    check("いちばん外側でない章は、読み落としとして立つ", nested.missed, 1)
    check("読めたぶんはそのまま返る", [c["slug"] for c in nested.rows], ["alpha"])

    # **「1章も名乗っていない」と「読み落とした」は別の顔**（§15）
    empty = _read(EMPTY)
    check("空の配列は、名乗り0・読み落とし0", (empty.declared, empty.missed), (0, 0))

    # --- 4. 呼ぶ側が止まるか -------------------------------------------------
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        files = {"miss": NESTED, "empty": EMPTY, "real": src}
        for k, text in files.items():
            (d / f"{k}.ts").write_text(text, encoding="utf-8")

        for mod, who in ((bcs, "build_chapter_stats"), (bs, "build_shorts")):
            keep = mod.CHAPTERS_TS
            try:
                for k, want in (("miss", "読み落とし"), ("empty", "名乗っていません")):
                    mod.CHAPTERS_TS = d / f"{k}.ts"
                    try:
                        mod.read_chapters()
                        check(f"{who} が {k} の字で止まる", "止まらなかった", f"{want} で止まる")
                    except SystemExit as e:
                        check(f"{who} が {k} の字で止まる",
                              want in str(e), True)

                # 本番の字では止まらず、**nordic が入っている**
                mod.CHAPTERS_TS = d / "real.ts"
                try:
                    out = mod.read_chapters()
                    check(f"{who} が本番の字から nordic を返す",
                          "nordic" in [c["slug"] for c in out], True)
                except SystemExit as e:
                    check(f"{who} が本番の字から nordic を返す", f"止まった: {e}", True)
            finally:
                mod.CHAPTERS_TS = keep

    # --- 5. 旅程（`read_trip`）------------------------------------------------
    #
    # 旅の日の出・日の入り（`site/content/nordicSun.ts`）を焼くほうと、
    # 焼き込みが古くなっていないかを見る見張りが、**どちらもここから引く。**
    # 片方が自分で正規表現を書くと、`chapters.ts` を3通りに読んで北欧だけが
    # 落ちたのと同じことが起きる（このファイルの頭）。
    #
    # **本番で当てるところと、仕込みで当てるところを分ける。**
    # 本番は「いま落ちていないこと」、仕込みは「落ちたときに気づけること」。
    trip_src = TRIP_TS.read_text(encoding="utf-8")
    trip = ts_read.read_trip(trip_src)
    print(f"  本番の {TRIP_TS.name}: 名乗り {trip.declared}日 / 読めた {len(trip.days)}日"
          f" / 街 {len(trip.cities)}件")
    check("本番の旅程が1日も名乗っていない、ということは無い", trip.declared > 0, True)
    check("本番の旅程を1日も読み落としていない", trip.missed, 0)
    check("本番の旅程の街が0件ではない", len(trip.cities) > 0, True)
    # **区間（`ROUTE`）を引き直せているか。** その日の朝いる街は
    # `legs: [leg("katowice-warszawa")]` の先の `from` にしか無い。
    # 引き直しが壊れると、朝の街が全部「その日の `city`」に落ちて、
    # **出発の日に着く先の日の出**が出る（画面側で一度やっている）
    wakes = [d.wakes_in for d in trip.days if d.wakes_in]
    print(f"  うち、朝いる街が読めた日: {len(wakes)}/{len(trip.days)}日")
    check("朝いる街が読めている日が在る（分母）", len(wakes) > 0, True)
    check("本番の旅程ぜんぶで、朝いる街が読める", len(wakes), len(trip.days))

    # **この対照が易しくなっていないか。** 本番の旅程から
    # 「入れ子で `id:` を持つ日」（分かれ道の選択肢）が消えたら、
    # 名乗りの数え方が壊れても通ってしまう
    nested = len(re.findall(r'\{ id: "[a-z-]+", label:', trip_src))
    print(f"  うち、入れ子で id を持つ行（分かれ道の選択肢）: {nested}個")
    check("本番の旅程に、入れ子の id がまだ在る（対照が易しくなっていない）",
          nested > 0, True)

    made_trip = """
export const ROUTE: Leg[] = [
  {
    id: "a-b",
    from: "あの街（空港のまわり）",
    to: "この街",
    note: "本文に date: \\"2099-01-01\\" と書いてあっても、欄ではない",
  },
];
export const DAYS: Day[] = [
  {
    id: "day-1",
    // ここに date: "2099-01-01" と書いてもコメント
    date: "2026-03-01",
    legs: [leg("a-b")],
    fork: { options: [{ id: "yoru", label: "寄る" }] },
  },
  {
    id: "day-2",
    date: "2026-03-02",
    city: "その街",
    maybe: ["よその街"],
  },
];
export const WANTS: Want[] = [
  { city: "まぎれこむ街" },
];
"""
    mt = ts_read.read_trip(made_trip)
    check("仕込みの旅程を2日とも読む", [d.id for d in mt.days], ["day-1", "day-2"])
    check("仕込みも読み落とし0（入れ子の id を名乗りに数えない）", mt.missed, 0)
    check("区間の `leg(...)` から朝の街を引く", mt.days[0].wakes_in, "あの街")
    check("区間が無い日は `city` が朝の街", mt.days[1].wakes_in, "その街")
    check("街は通る順に並ぶ。添え書きは落とす",
          mt.cities, ["あの街", "この街", "その街"])
    check("`maybe`（寄るかもしれない街）を街に入れない", "よその街" in mt.cities, False)
    check("`WANTS`（視聴者さんの提案）の街を混ぜない", "まぎれこむ街" in mt.cities, False)
    check("本文の date: に釣られない", [d.date for d in mt.days],
          ["2026-03-01", "2026-03-02"])

    # 日付を持たない行は**読み落としに数える。** 黙って飛ばすと、
    # 日の出を焼くほうがその日を飛ばしたことに誰も気づけない
    nodate = made_trip.replace('    date: "2026-03-02",\n', "")
    md = ts_read.read_trip(nodate)
    check("日付の無い日は、読み落としとして立つ", md.missed, 1)
    check("読めたぶんはそのまま返る", [d.id for d in md.days], ["day-1"])

    # 空の旅程は、名乗り0・読み落とし0（**別の顔にする**）
    empty_trip = ts_read.read_trip("export const DAYS: Day[] = [\n];\n")
    check("空の旅程は、名乗り0・読み落とし0",
          (empty_trip.declared, empty_trip.missed), (0, 0))

    # --- 出す ----------------------------------------------------------------
    print(f"対照 {len(ok) + len(ng)}件中 {len(ok)}件通った")
    for line in ng:
        print(f"::error::{line}")
    if not ok:
        print("::error::対照が0件です（site/content/chapters.ts が読めていません）")
        return 1
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
