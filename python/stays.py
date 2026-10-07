"""その日どの国にいたか、を1か所で持つ。

## なぜ足したか

「歩いた国」は `site/content/countries.ts` が持っている。あれは**旅から帰った
本人が手で書く表**で、滞在も見どころも本人しか知らない。だから正しい。

**正しいが、旅のあいだは書かれない。** 北欧へ発った2026-09-11 から、表の
いちばん新しい滞在はジョージアの `to: "2026-09-11"` で閉じたまま、
ポーランドもリトアニアも1行も増えなかった。表を読むだけの焼き込みは、
そこで揃って止まる。

- `onThisDay.ts` の 09-12〜09-14 は、場所も国も空で焼かれた（板が3日ぶん無言）
- `countryStats.ts` は 17カ国のまま。歩いた国が2つ増えても数が動かない

**旅程は、もうリポジトリの中にある。** `site/content/nordic.ts` の `ROUTE` は
区間ごとに日付と `enters`（この区間でどの国に入るか）を持っていて、
これは出発の2日前に確定している。**人が旅先で書き足すのを待つ必要は無い。**

だから「その日どの国にいたか」は、2つを足して答える。

  歩き終わった国 … `countries.ts` の `stays`（本人が帰ってから書く）
  歩いている旅   … `nordic.ts` の `ROUTE` の `enters` と `DAYS`（出る前に確定している）

**countries.ts を上書きしない。** 帰ってきた本人が滞在を書いたら、そちらが正。
ここが出すのは「まだ書かれていない、いまの旅」のぶんだけ。

## 旅程ファイルの無い章（2026-10-06 に足した）

上の2つでは足りない。`nordic.ts` のような旅程ファイルは**北欧にしか無い。**
行き先だけ決めて発った章——アルバニアがそれ——は、滞在の出どころがどこにも無い。

無いとどうなるかは本番で出た。スウェーデンの滞在が `to: ""`（開いたまま）
だったので、読む側（`hi = stay["to"] or "9999-12-31"`）から見ると以後がぜんぶ
スウェーデンで、**アルバニアの配信11本が「スウェーデン・ストックホルム」として
焼かれていた。** そこを閉じるだけでは嘘が無言に変わるだけで、11本は行き場を失う。

だから3つ目を足した。

  旅程ファイルの無い章 … `chapters.ts` の章の `from`〜`to` と
                         `countries.ts` の `AHEAD_COUNTRIES` の `entered`

出せるのは「章ぜんぶで1カ国」までの粗さだが、**無言よりは粗いほうがいい。**
旅程ファイルの在る章には手を出さない（`ITINERARY_CHAPTERS`）——あちらのほうが
国の切れ目も街も細かいので、両方が出すと細かいほうが潰れる。

## 境目の日をどちらの国に入れるか

国をまたぐ日は、朝と晩で国が違う。**両方に入れると、その日の配信が2カ国で
二重に数えられる。** 入れないと、その日の板が無言になる。

だから **1日はどこか1カ国** に決める。決め方は3つ。

1. 区間の `enters` の日から、その国が始まる
2. 同じ日に2カ国へ入る日（09-19 のタリン→ヘルシンキ→ストックホルム）は、
   **先に入った国がその日を取り、次の国は翌日から。** 船が着くのは翌朝なので、
   フィンランドは 09-19 の1日、スウェーデンは 09-20 から
3. `countries.ts` の滞在が閉じている日までは、**あちらのもの。**
   クタイシ発の便は 09-11 23:30 に出て 09-12 01:05 に着く。`enters` の日付は
   09-11（出た日）だが、ジョージアの滞在が 09-11 で閉じているので、
   ポーランドは 09-12 から

## 街の名前

題名から街を当てるのに使う。**旅のしおりに並んでいる観光地の一覧
（`nordic/index.json` の `cities`）ではなく、旅程に出てくる街だけ**を使う。
しおりのほうは「行くかもしれない街」なので、そこから当てると
行っていない街の名前が板に出る。
"""

import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# **`site/content/*.ts` を字で読むのは、このリポジトリで1本だけ**（`python/ts_read.py`）。
# **自前の正規表現を増やさない。** 2026-10-03 に3つあった読み方を1本に寄せたのに、
# このファイルが4本目を生やしていた（国の滞在と旅程を、ここだけ別の読み方で
# 読んでいた）。読み方が増えれば、その数だけ別々に腐る（`ts_read.py` の頭）
from ts_read import read_ahead_countries, read_array, read_chapters  # noqa: E402
from ts_read import read_countries as read_countries_ts  # noqa: E402

# 日付はぜんぶ JST で数える。配信の日付（`videos.actual_start_time`）が JST なので、
# ここだけ UTC にすると、朝10時（01:00 UTC）に焼く晩に1日ずれる
JST = timezone(timedelta(hours=9))

ROOT = Path(__file__).resolve().parent.parent
COUNTRIES_TS = ROOT / "site" / "content" / "countries.ts"
NORDIC_TS = ROOT / "site" / "content" / "nordic.ts"
NORDIC_JSON = ROOT / "site" / "content" / "nordic" / "index.json"
CHAPTERS_TS = ROOT / "site" / "content" / "chapters.ts"

# 旅程ファイルを持っている章。**ここに在る章には、受け皿が手を出さない。**
#
# 旅程（`content/nordic.ts` の ROUTE）は「何日にどの国へ入るか」まで持っているので、
# 国の切れ目も街も、そちらのほうが細かい。受け皿が出せるのは「章ぜんぶで1カ国」
# までなので、**両方が出すと細かいほうが潰れる。**
# 旅程ファイルを足した章は、ここにも足す。
ITINERARY_CHAPTERS = {"nordic"}

# 泊まる先が街でない日。**場所ではないので街として扱わない。**
# 題名に「船」が入った配信を街の欄に入れると、地図に無い点が立つ。
NOT_A_CITY = {"船の中", "飛行機の中"}


def read_countries() -> list:
    """countries.ts から「国 → 滞在（期間と街）」を読み出す。

    **読むのは `ts_read.read_countries()` の1本。** ここは前、自前の正規表現で
    こう書いてあった:

        re.search(r"stays: \\[((?:.|\\n)*?)\\],\\n    summary", block)

    `stays` と `summary` のあいだに注釈のある国では当たらず、`continue` で
    **その国がまるごと落ちる**。2026-09-10 の時点でジョージアがそれで、
    読めた国は18ではなく17だった。onThisDay.ts の 618件のうち **378件**が
    ジョージアなので、次に焼いた瞬間その378件から場所が消える。

    そこを括弧を数える形に直したが、**読み方そのものはここに残っていた**
    （`countries.ts` を読む2本目）。片方だけ腐るのを避けるため、字を読むのは
    `python/ts_read.py` に寄せた。ここに残すのは「読み落ちたら止める」ところだけ。

    `exact` は「日どりが日単位で確かか」。人が帰ってから書いた滞在は
    9ヶ月の塊になっていることがあるので、日単位では確かでない。
    （`docs/island-misses.md` #45）
    """
    got = read_countries_ts(COUNTRIES_TS.read_text(encoding="utf-8"))
    # **止め金。** 読み落としは例外を出さず、国と街が黙って減るだけだった
    if got.declared == 0:
        raise ValueError("countries.ts に国が1つも無い（置き場が変わった？）")
    if got.missed:
        raise ValueError(f"countries.ts の国 {got.declared} 件のうち {got.missed} 件を読み落とした")
    if got.stays_missed:
        raise ValueError(
            f"countries.ts の滞在 {got.stays_declared} 件のうち {got.stays_got} 件しか読めていない"
        )
    return [
        {
            "slug": c["slug"],
            "name": c["name"],
            "stays": [{**s, "exact": False} for s in c["stays"]],
        }
        for c in got.rows
    ]


def _next_day(d: str) -> str:
    return (date.fromisoformat(d) + timedelta(days=1)).isoformat()


def _prev_day(d: str) -> str:
    return (date.fromisoformat(d) - timedelta(days=1)).isoformat()


def read_nordic(after: str = "") -> list:
    """いま歩いている旅（`nordic.ts`）を、countries.ts と同じ形の滞在にする。

    `after` は「ここまでは前の国のもの」という日。ふつうは countries.ts の
    いちばん新しい滞在の終わり（ジョージアの 2026-09-11）を渡す。
    """
    src = NORDIC_TS.read_text(encoding="utf-8")
    guide = json.loads(NORDIC_JSON.read_text(encoding="utf-8"))["countries"]
    names = {c["slug"]: c["name"] for c in guide}
    # 街がどの国のものか。**旅程の区間は国をまたぐ**（タリン→ヘルシンキ）ので、
    # 区間に出てくる街をそのまま国の街にすると、隣の国の街が混ざる。
    # しおりの一覧は「行くかもしれない街」だが、**どの国の街か**は正しいので、
    # そこだけ借りて振り分けに使う（一覧をそのまま街にはしない）。
    where = {city: c["slug"] for c in guide for city in c["cities"]}

    # 区間。`enters` を持つものが国境で、その日付が入国の日。
    # **字を読むのは `ts_read`。** ここは前、`\n    date: "…"` のように
    # 字下げを当てにした正規表現で読んでいた。欄の順を入れ替えたり注釈を
    # 1行挟んだだけで、その区間が黙って落ちる形（`ts_read.py` の頭と同じ轍）
    route = read_array(
        src, "ROUTE", keys=("id", "from", "to", "date", "enters"), id_key="id"
    )
    if route.missed:
        raise ValueError(
            f"nordic.ts の ROUTE の {route.declared} 件のうち {route.missed} 件を読み落とした"
        )
    legs, enters = {}, []
    for r in route.rows:
        if not r["date"]:
            continue
        # 区間の起点と終点。**並びは「から → へ」のまま**（街を振り分けるとき、
        # 先に出てきたほうを隣の国の街として落とす側がこの順を見る）
        legs[r["id"]] = {
            "date": r["date"],
            "cities": [c for c in (r["from"], r["to"]) if c],
        }
        if r["enters"]:
            enters.append((r["date"], r["enters"], r["id"]))

    # 日ごとの泊まる先。区間の無い日（休息日）の街はここからしか取れない
    day_read = read_array(
        src, "DAYS", keys=("id", "date", "stay"), lists=("legs",), id_key="id"
    )
    if day_read.missed:
        raise ValueError(
            f"nordic.ts の DAYS の {day_read.declared} 件のうち {day_read.missed} 件を読み落とした"
        )
    days = [
        {"date": d["date"], "stay": d["stay"], "legs": d["legs"]}
        for d in day_read.rows
        if d["date"]
    ]
    if not enters or not days:
        raise ValueError("nordic.ts から旅程を読めていない（ROUTE の enters / DAYS が空）")

    last = max(d["date"] for d in days)

    # 入国の日を順に見て、国ごとの期間を決める。**重ならないようにする**
    # （境目の日を2カ国に入れると、その日の配信が二重に数えられる）
    enters.sort()
    spans = []
    for i, (day, slug, _lid) in enumerate(enters):
        start = day
        if after and start <= after:
            start = _next_day(after)
        if spans and start <= spans[-1]["from"]:
            start = _next_day(spans[-1]["from"])
        if spans:
            spans[-1]["to"] = _prev_day(start)
        spans.append({"slug": slug, "from": start, "to": last})
    # **まだ来ていない日は滞在ではない。** 旅程は予定なので、そのまま使うと
    # 「9日後にストックホルムにいる」ことになる。街の欄が先に立って
    # 「配信はのこっていない」と言い出すし、表紙の国の数も歩く前に増える
    # （`content/countries.ts` の `AHEAD_COUNTRIES` の注と同じ理由）。
    today = datetime.now(JST).date().isoformat()
    for sp in spans:
        sp["to"] = min(sp["to"], today)
    # 開始が終わりを追い越した国（同じ日に入って同じ日に出た国、まだ来ていない国）は落とす
    spans = [s for s in spans if s["from"] <= s["to"]]

    out = []
    for s in spans:
        cities, seen = [], set()
        for d in days:
            if not (s["from"] <= d["date"] <= s["to"]):
                continue
            # 泊まる先。「ストックホルム（友だちの家）」の括弧は当て字なので落とす
            for c in [d["stay"].split("（")[0]] + [
                c for lid in d["legs"] for c in legs.get(lid, {}).get("cities", [])
            ]:
                if not c or c in NOT_A_CITY or c in seen:
                    continue
                if where.get(c) != s["slug"]:
                    continue  # 隣の国の街（区間の起点・終点）
                seen.add(c)
                cities.append(c)
        out.append({
            "slug": s["slug"],
            "name": names.get(s["slug"], s["slug"]),
            # **旅程から出した滞在は日単位で確か。** どの日にどの国へ入るかが
            # 区間ごとに書いてあるので、題名を見なくても日付だけで国が決まる
            # （`build_city_streams.py` の `pick()` がこの印を見る）
            "stays": [{"from": s["from"], "to": s["to"], "cities": cities, "exact": True}],
        })
    return out


def read_ahead() -> list:
    """`countries.ts` の `AHEAD_COUNTRIES` を、`{slug, name, entered}` の並びで。

    **`COUNTRIES` にまだ無い国の置き場。** 街も滞在も歩き終わってから書く決まり
    なので、ここが持っているのは名前と旗の鍵と「着いた日」だけ。

    読むのは `ts_read.read_ahead_countries()`。ここが前、自前の `_array_of()` で
    在りかを探していたのは、`ts_read.array_body()` が `=` までに `;` を
    跨がせない作りだったから（別の宣言の `= [` を掴まないため）。
    ここの型注釈は `{ slug: string; … }[]` と `;` を含むので当たらなかった。
    **緩めるのではなく、歩いて探す形に直した**（`ts_read._assign_at`）ので、
    跨がせない理由は残したまま、自前の在りか探しが要らなくなった。
    """
    got = read_ahead_countries(COUNTRIES_TS.read_text(encoding="utf-8"))
    # **止め金。** 読み落としは例外を出さず、国が黙って減るだけ
    # （`read_countries()` と同じ理由）。減ると、その国の配信は行き場を失って
    # 板に `p:""` の無言の行として並ぶ
    if got.missed:
        raise ValueError(
            f"AHEAD_COUNTRIES の {got.declared} 件のうち {len(got.rows)} 件しか読めていない"
        )
    return [
        {"slug": r["slug"], "name": r["name"] or r["slug"], "entered": r["entered"]}
        for r in got.rows
        if r["entered"]
    ]


def read_chapters_ts() -> list:
    """`chapters.ts` の章。**読み落としがあれば止める。**"""
    got = read_chapters(CHAPTERS_TS.read_text(encoding="utf-8"))
    if got.declared == 0:
        raise ValueError("chapters.ts に章が1つも無い（置き場が変わった？）")
    if got.missed:
        raise ValueError(f"chapters.ts の章 {got.declared} 件のうち {got.missed} 件を読み落とした")
    return got.rows


def chapter_stays(chapters: list, ahead: list, after: str = "", today: str = "") -> list:
    """**旅程ファイルの無い章**の滞在を、章の期間と `AHEAD_COUNTRIES` から組む。

    ## なぜ要るか

    「いま歩いている旅」の滞在を出せるのは `read_nordic()` だけで、あれが読むのは
    `content/nordic.ts` **1本の直書き**。だから旅程ファイルを持たない章——
    行き先だけ決めて発った章——は、**滞在の出どころがどこにも無い。**

    無いとどうなるかは、2026-09-28 からのアルバニアで出た。スウェーデンの滞在が
    `to: ""`（開いたまま）だったので、開いた滞在が以後の配信を飲み込んで、
    アルバニアの配信11本が「スウェーデン・ストックホルム」として焼かれていた。
    **そこを閉じるだけでは、嘘が無言に変わるだけ**——11本は `p:""` の行き場なしになる
    （`docs/island-misses.md` #12「配信はのこっていない」と同じ形）。

    ## 何から組むか

    **日付をコードに書かない。** 章が変わるたびに嘘になる。使うのは2つだけ。

    - `chapters.ts` の章の `from`〜`to` … 章の切れ目。**`to` が入れば滞在も閉じる**
    - `AHEAD_COUNTRIES` の `entered` … その国に着いた日

    `entered` がどの章の期間に入るかで、国と章を結ぶ。章の `countries` は見ない
    ——歩いた国を `COUNTRIES` に書き入れるまで、あそこは空のままだから。

    街は分からないので、**国の名前を1つだけ置く。** 推測で街を書かない決まりは
    `build_on_this_day.place_of()` と同じで、あちらも街が当たらなければ
    国の名前を見せる場所にする。街が1つの滞在は `build_city_streams.pick()` が
    「その期間の配信ぜんぶ」として扱うので、本数も落ちない。

    Args:
        chapters: `read_chapters_ts()` の行
        ahead: `read_ahead()` の行
        after: ここまでは前の国のもの、という日（`countries.ts` のいちばん新しい終わり）
        today: 今日（JST）。**まだ着いていない国は滞在ではない**ので落とす

    Returns:
        `read_countries()` と同じ形（`slug` / `name` / `stays`）
    """
    today = today or datetime.now(JST).date().isoformat()
    # 章1つに国が2つ以上来ることがある（旅程ファイルを持たない章で国境を越えた）。
    # そのときは**入った順に区切る**——重ねると、その日の配信が2カ国で二重に数えられる
    by_chapter: dict[str, list] = {}
    for a in sorted(ahead, key=lambda x: x["entered"]):
        ch = next(
            (
                c
                for c in chapters
                if c["from"]
                and c["from"] <= a["entered"]
                and (not c["to"] or a["entered"] <= c["to"])
            ),
            None,
        )
        if ch is None or ch["slug"] in ITINERARY_CHAPTERS:
            continue
        by_chapter.setdefault(ch["slug"], []).append((ch, a))

    out = []
    for rows in by_chapter.values():
        for i, (ch, a) in enumerate(rows):
            lo = max(a["entered"], ch["from"])
            if after and lo <= after:
                lo = _next_day(after)
            # 次の国に入る前日まで。最後の国は章の終わりまで（章が開いていれば開いたまま）
            hi = _prev_day(rows[i + 1][1]["entered"]) if i + 1 < len(rows) else ch["to"]
            # **まだ来ていない日は滞在ではない**（`read_nordic()` と同じ決まり）。
            # 着く前の国の札が先に立つと、街の欄が「配信はのこっていない」と言い出す
            if lo > today:
                continue
            if hi and lo > hi:
                continue
            out.append({
                "slug": a["slug"],
                "name": a["name"],
                # **日単位で確か。** 着いた日と章の切れ目から出しているので、
                # 題名を見て国を当て直す必要がない（`build_city_streams.pick()` が見る印）
                "stays": [{"from": lo, "to": hi, "cities": [a["name"]], "exact": True}],
            })
    return out


def read_ahead_chapters(after: str = "") -> list:
    """旅程ファイルの無い章の滞在。本番のファイルを読んで `chapter_stays()` に渡すだけ。"""
    return chapter_stays(read_chapters_ts(), read_ahead(), after=after)


def is_country(slug: str) -> bool:
    """「歩いた国」に数えてよい slug か。

    **`iran-border` は国ではない。** 「イラン（国境まで）」という区間で、
    国境までは歩いたが入国はしていない。表紙の「◯カ国を歩いた」に混ぜると、
    行っていない国を1つ足すことになる。
    `countries.ts` は区間も国と同じ形で持っているので、ここで分ける。
    """
    return not slug.endswith("-border")


def read_all() -> list:
    """歩き終わった国（countries.ts）＋いま歩いている旅（nordic.ts）。

    **並びは「歩き終わった国」が先。** 境目の日を引くとき、先に当たったほうを
    採る呼び出し側（`place_of`）があるので、人が書いた表を優先する。
    """
    done = read_countries()
    last = max((s["to"] for c in done for s in c["stays"] if s["to"]), default="")
    known = {c["slug"] for c in done}
    # 歩き終わって countries.ts に移された国は、旅程側から足さない（二重になる）
    out = done + [c for c in read_nordic(after=last) if c["slug"] not in known]
    known |= {c["slug"] for c in out}
    # 旅程ファイルの無い章。**旅程の在る章はこちらが手を出さない**（`ITINERARY_CHAPTERS`）ので、
    # 上の2つで出た国と重ならない。それでも `known` で止めておく——
    # 出どころが3つになったので、重なったときに黙って二重に数えさせない
    return out + [c for c in read_ahead_chapters(after=last) if c["slug"] not in known]


if __name__ == "__main__":
    for c in read_all():
        for s in c["stays"]:
            print(f'{c["slug"]:12} {s["from"]} → {s["to"] or "（開いたまま）":10} {"・".join(s["cities"])}')
