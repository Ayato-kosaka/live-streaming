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
import re
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COUNTRIES_TS = ROOT / "site" / "content" / "countries.ts"
NORDIC_TS = ROOT / "site" / "content" / "nordic.ts"
NORDIC_JSON = ROOT / "site" / "content" / "nordic" / "index.json"

# 泊まる先が街でない日。**場所ではないので街として扱わない。**
# 題名に「船」が入った配信を街の欄に入れると、地図に無い点が立つ。
NOT_A_CITY = {"船の中", "飛行機の中"}


def _bracket(src: str, start: int) -> str:
    """`src[start]` の `[` から対応する `]` までを返す。"""
    depth = 0
    for i in range(start, len(src)):
        if src[i] == "[":
            depth += 1
        elif src[i] == "]":
            depth -= 1
            if depth == 0:
                return src[start : i + 1]
    raise ValueError("閉じていない [")


def _objects(arr: str) -> list:
    """`[ {...}, {...} ]` を、いちばん外側の `{...}` ごとに切る。"""
    out, depth, cur = [], 0, ""
    for ch in arr[1:-1]:
        if ch == "{":
            depth += 1
        if depth > 0:
            cur += ch
        if ch == "}":
            depth -= 1
            if depth == 0:
                out.append(cur)
                cur = ""
    return out


def _array_of(src: str, name: str) -> str:
    """`export const <name>: X[] = [ ... ]` の中身を返す。

    `X[]` の `[` を掴まないように、`= [` から探す。
    """
    head = src.index(f"export const {name}")
    return _bracket(src, src.index("= [", head) + 2)


def read_countries() -> list:
    """countries.ts から「国 → 滞在（期間と街）」を読み出す。

    **正規表現ひと息で国の塊を取らない。** ここは前、こう書いてあった:

        re.search(r"stays: \\[((?:.|\\n)*?)\\],\\n    summary", block)

    `stays` と `summary` のあいだに注釈のある国では当たらず、`continue` で
    **その国がまるごと落ちる**。2026-09-10 の時点でジョージアがそれで、
    読めた国は18ではなく17だった。onThisDay.ts の 618件のうち **378件**が
    ジョージアなので、次に焼いた瞬間その378件から場所が消える。

    落ちても例外は出ない。件数が減るだけなので、緑のまま master に入る。
    括弧を数えて切り出し、**滞在の数が合わなければ落とす**。
    （`docs/island-misses.md` #45）
    """
    src = COUNTRIES_TS.read_text(encoding="utf-8")
    src = src[src.index("export const COUNTRIES") :]
    out = []
    for m in re.finditer(r'slug: "([a-z-]+)",\s*\n\s*name: "([^"]+)",', src):
        tail = src[m.end() :]
        head = tail.find("stays:")
        if head < 0:
            continue
        arr = _bracket(tail, tail.index("[", head))
        stays = []
        for sm in re.finditer(
            r'from:\s*"([\d-]*)",\s*to:\s*"([\d-]*)",\s*cities:\s*\[([^\]]*)\]', arr, re.S
        ):
            cities = [c.strip().strip('"') for c in sm.group(3).split(",") if c.strip()]
            stays.append({"from": sm.group(1), "to": sm.group(2), "cities": cities})
        out.append({"slug": m.group(1), "name": m.group(2), "stays": stays})

    # **止め金。** 読み落としは例外を出さず、国と街が黙って減るだけだった。
    want = len(re.findall(r"cities:\s*\[", src))
    got = sum(len(c["stays"]) for c in out)
    if want != got:
        raise ValueError(f"countries.ts の滞在 {want} 件のうち {got} 件しか読めていない")
    return out


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

    # 区間。`enters` を持つものが国境で、その日付が入国の日
    legs, enters = {}, []
    for o in _objects(_array_of(src, "ROUTE")):
        lid = re.search(r'id: "([^"]+)"', o)
        day = re.search(r'\n    date: "([\d-]+)"', o)
        if not lid or not day:
            continue
        legs[lid.group(1)] = {
            "date": day.group(1),
            "cities": [m.group(1) for m in re.finditer(r'\n    (?:from|to): "([^"]+)"', o)],
        }
        ent = re.search(r'enters: "([a-z-]+)"', o)
        if ent:
            enters.append((day.group(1), ent.group(1), lid.group(1)))

    # 日ごとの泊まる先。区間の無い日（休息日）の街はここからしか取れない
    days = []
    for o in _objects(_array_of(src, "DAYS")):
        day = re.search(r'\n    date: "([\d-]+)"', o)
        if not day:
            continue
        stay = re.search(r'\n    stay: "([^"]+)"', o)
        days.append({
            "date": day.group(1),
            "stay": stay.group(1) if stay else "",
            "legs": re.findall(r'leg\("([a-z0-9-]+)"\)', o),
        })
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
    # 開始が終わりを追い越した国（同じ日に入って同じ日に出た国）は落とす
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
            "stays": [{"from": s["from"], "to": s["to"], "cities": cities}],
        })
    return out


def read_all() -> list:
    """歩き終わった国（countries.ts）＋いま歩いている旅（nordic.ts）。

    **並びは「歩き終わった国」が先。** 境目の日を引くとき、先に当たったほうを
    採る呼び出し側（`place_of`）があるので、人が書いた表を優先する。
    """
    done = read_countries()
    last = max((s["to"] for c in done for s in c["stays"] if s["to"]), default="")
    known = {c["slug"] for c in done}
    # 歩き終わって countries.ts に移された国は、旅程側から足さない（二重になる）
    return done + [c for c in read_nordic(after=last) if c["slug"] not in known]


if __name__ == "__main__":
    for c in read_all():
        for s in c["stays"]:
            print(f'{c["slug"]:12} {s["from"]} → {s["to"] or "（開いたまま）":10} {"・".join(s["cities"])}')
