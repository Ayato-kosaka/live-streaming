"""**`site/content/*.ts` を、字のまま読むための1本。** 判定も計算もしない。

    from ts_read import read_chapters
    got = read_chapters(Path("site/content/chapters.ts").read_text(encoding="utf-8"))
    got.rows      # 章ぜんぶ（読めたもの）
    got.declared  # ファイルが名乗っている章の数
    got.missed    # 読み落とした数。**0 でなければ、呼ぶ側が止める**

## なぜ1本に寄せたか

`site/content/chapters.ts` を読む道具が、同じリポジトリに**3つ**あった。
3つとも正規表現で、**3つとも別の読み方**をしていた。

| どこ | 読み方 | どうなっていたか |
| --- | --- | --- |
| `build_chapter_stats.py` | `slug → name → from → to` が**改行だけを挟んで続く**ことを求める | **北欧（nordic）を黙って落としていた** |
| `build_shorts.py` | `^\\s*\\{\\s*$` で塊に割って、塊ごとに `key: "…"` を拾う | 読めていた（読み落としに落ちる足つき） |
| `stale_content_watch.py` | 歩きながら文字列とコメントを飛ばす | 読めていた |

落ちたのは1つ目。`chapters.ts` の北欧は `slug:` と `name:` のあいだに**9行の
コメント**が挟まっている（なぜ 9/12 始まりなのか、なぜ 9/27 で閉じるのか）。
正規表現は改行しか跨げないので、そこで切れた。**例外も警告も出ない。**
その結果、`chapterStats.ts` にも `chapterStreams.ts` にも**北欧の行が1つも無く**、
9/12〜9/27 の配信が島の数字に入っていなかった。

**読み方が3つあると、3つぶん別々に腐る。** コメントを1行足しただけで片方だけが
落ちるのは、誰にも気づけない。だからここ1本にした。

## ここがやること・やらないこと

**やる**のは「字をそのまま構造にする」ところまで。

- コメント（`//` `/* */`）を落とす。**文字列の中の `//` は落とさない**
  （アイコンの URL が `https://…` なので、落とすと以降が丸ごと消える）
- `export const NAME … = [ … ]` の中身を、いちばん外側の `{…}` ごとに切る
- その `{…}` の**いちばん外側の欄だけ**を「鍵 → 字」にする

**やらない**のは、意味づけと判定。

- 「この旅はもう終わったか」は `stale_content_watch.chapter_spans()`
- 「数えるのはどの章か」は `build_chapter_stats.read_chapters()`
- 「どのショートがどの章か」は `build_shorts.spans()`

**JavaScript を読んでいるのではない。** 読めるのは、このリポジトリの
`site/content/*.ts` が実際に書かれている形（素直なオブジェクトの配列）だけ。
計算式や展開（`...spread`）は読めない。読めない形を書くほうが間違いなので、
**読み落としたら黙らずに数で出す**（`ChapterRead.missed`）。

## 読み落としは、数で捕まえる

正規表現にせよ歩きにせよ、**TS を字で読む以上、書き方が変われば落ちる。**
落ちること自体は避けられないので、**落ちたことが分かる**ようにする。

`declared`（ファイルが名乗っている章の数＝配列の中の `slug: "` の数）と
`len(rows)`（読めた数）を突き合わせる。1つでも合わなければ `missed` が立つ。
**呼ぶ側はこれを見て止める。** 止めないと、北欧が消えたときと同じことになる。

**`declared` が 0 と、`missed` が 0 でないのは、別の顔。** 前者は「数えるものが
無い」（置き場が違う・ファイルが空）、後者は「数えたのに取りこぼした」。
同じ顔で出すと、どちらを直せばいいか分からない（`docs/island-standards.md` §15）。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# 鍵の形（`slug: "…"` の `slug:`）。**語の途中を鍵と読まない**ように、
# 呼ぶ側で前の1字を見てから当てる（`plannedDays` の `l` から読み始めない）
_KEY_RE = re.compile(r"([A-Za-z_]\w*)\s*:\s*")
_PAIRS = {"[": "]", "{": "}", "(": ")"}

# 「章を名乗っている」ところ。**型の宣言（`slug: string;`）は引用符が無い**ので当たらない
SLUG_RE = re.compile(r'\bslug\s*:\s*"')


def skip_string(src: str, i: int) -> int:
    """`src[i]` の引用符から、閉じる引用符の位置まで。閉じていなければ末尾。"""
    q = src[i]
    j = i + 1
    n = len(src)
    while j < n:
        if src[j] == "\\":
            j += 2
            continue
        if src[j] == q:
            return j
        j += 1
    return n - 1


def close_at(src: str, i: int) -> int:
    """`src[i]` の開き括弧に対応する閉じ括弧の位置。**文字列の中は数えない。**"""
    stack = [_PAIRS[src[i]]]
    j, n = i + 1, len(src)
    while j < n and stack:
        c = src[j]
        if c in "\"'`":
            j = skip_string(src, j)
        elif c in _PAIRS:
            stack.append(_PAIRS[c])
        elif c == stack[-1]:
            stack.pop()
        j += 1
    return j - 1 if not stack else n - 1


def code_only(src: str) -> str:
    """コメントを空白に置き換えた字。**文字列の中は1字も触らない。**

    `//` はアイコンの URL の中にも出るので、「いま文字列の中か」を見ながら進む。
    **改行は残し、長さも変えない**——位置がずれると、どこを読み違えたのかを
    追えなくなる。
    """
    out = list(src)
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c in "\"'`":
            i = skip_string(src, i) + 1
            continue
        if c == "/" and i + 1 < n and src[i + 1] == "/":
            j = src.find("\n", i)
            j = n if j < 0 else j
            out[i:j] = " " * (j - i)
            i = j
            continue
        if c == "/" and i + 1 < n and src[i + 1] == "*":
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            for k in range(i, j):
                if out[k] != "\n":
                    out[k] = " "
            i = j
            continue
        i += 1
    return "".join(out)


def array_body(src: str, name: str) -> str:
    """`export const NAME … = [ … ]` の中身。見つからなければ空。

    **先にコメントを落としてから渡すこと**（`code_only`）。
    """
    # 名前と `=` のあいだに型が入る（`CHAPTERS: Chapter[] =`）。`=` と `;` だけ
    # 跨がせない——跨がせると、別の宣言の `= [` を掴む
    m = re.search(rf"\b{re.escape(name)}\b[^=;]*=\s*\[", src)
    if not m:
        return ""
    i = m.end() - 1
    return src[i + 1 : close_at(src, i)]


def objects(body: str) -> list[str]:
    """配列の中の `{…}` を、いちばん外側だけ1つずつ。"""
    out = []
    i, n = 0, len(body)
    while i < n:
        c = body[i]
        if c == "{":
            e = close_at(body, i)
            out.append(body[i + 1 : e])
            i = e + 1
            continue
        if c in "\"'`":
            i = skip_string(body, i) + 1
            continue
        i += 1
    return out


def fields(obj: str) -> dict[str, str]:
    """`{…}` の**いちばん外側の欄だけ**を「鍵 → 字」で返す。

    **正規表現1本で済ませない。** `note:` の本文に `to: "…"` のような字が
    入っていると、欄として拾ってしまう。入れ子（`countries: [...]`）と
    文字列の中は、歩きながら飛ばす。
    """
    out: dict[str, str] = {}
    key = ""
    i, n = 0, len(obj)
    while i < n:
        c = obj[i]
        if c in "\"'`":
            e = skip_string(obj, i)
            if key:
                out[key] = obj[i + 1 : e]
                key = ""
            i = e + 1
            continue
        if c in _PAIRS:
            i = close_at(obj, i) + 1
            key = ""
            continue
        if c == ",":
            key = ""
            i += 1
            continue
        # 鍵の頭か。語の途中（`plannedDays` の `l`）を鍵と読まないよう境目を見る
        if (i == 0 or not (obj[i - 1].isalnum() or obj[i - 1] == "_")) and (
            m := _KEY_RE.match(obj, i)
        ):
            key = m.group(1)
            i = m.end()
            continue
        if key and not c.isspace():
            # 引用符の付かない値（数・真偽）
            j = i
            while j < n and obj[j] not in ",\n":
                j += 1
            out[key] = obj[i:j].strip()
            key = ""
            i = j
            continue
        i += 1
    return out


def list_field(obj: str, key: str) -> list[str]:
    """`{…}` の中の `key: ["a", "b"]` を、**中の字の並び**として返す。

    `fields()` は入れ子（`[...]` `{...}`）をわざと欄にしない——`note:` の本文に
    `to: "…"` のような字が入っていると欄として拾ってしまうので、歩きながら飛ばす
    作りになっている。**そこは変えない**（変えると、どの呼ぶ側も「欄が1つ増えた」
    ことに気づかないまま挙動が変わる）。

    欄を1つだけ、名指しで取りに来るための口をここに足した。
    取れるのは**文字列の並びだけ**（`countries: ["poland", …]`）。
    入れ子の中の入れ子や、計算式は読まない——読めない形を書くほうが間違いなので、
    **空で返す**（呼ぶ側は「空」と「書いていない」を区別しない。どちらも
    「まだ埋まっていない」として扱ってよい欄にしか使わない）。

    Args:
        obj: `objects()` が切り出した `{…}` の中身
        key: 取りたい欄の名（`"countries"`）

    Returns:
        中の字の並び。欄が無い／並びでなければ空
    """
    want = ""
    i, n = 0, len(obj)
    while i < n:
        c = obj[i]
        if c in "\"'`":
            i = skip_string(obj, i) + 1
            want = ""
            continue
        if c in _PAIRS:
            if want == key and c == "[":
                return _strings_in(obj[i + 1 : close_at(obj, i)])
            i = close_at(obj, i) + 1
            want = ""
            continue
        if c == ",":
            want = ""
            i += 1
            continue
        # 鍵の頭か。`fields()` と同じ見かた（語の途中から読み始めない）
        if (i == 0 or not (obj[i - 1].isalnum() or obj[i - 1] == "_")) and (
            m := _KEY_RE.match(obj, i)
        ):
            want = m.group(1)
            i = m.end()
            continue
        i += 1
    return []


def _strings_in(src: str) -> list[str]:
    """`[…]` の中の文字列リテラルを、並んでいる順に。"""
    out = []
    i, n = 0, len(src)
    while i < n:
        if src[i] in "\"'`":
            e = skip_string(src, i)
            out.append(src[i + 1 : e])
            i = e + 1
            continue
        i += 1
    return out


# ---------------------------------------------------------------- 章（chapters.ts）

# 章1つぶんで、読む側がみんな使う欄。**ここに無い欄は落ちる**ので、
# 増やしたくなったらここに足す（`chapters.ts` の `Chapter` 型と見比べる）
CHAPTER_KEYS = ("slug", "name", "from", "to", "opensAt", "branchOf")


@dataclass(frozen=True)
class ChapterRead:
    """`chapters.ts` を読んだ結果。**判定はしない。数だけ添える。**"""

    rows: list[dict] = field(default_factory=list)
    # ファイルが名乗っている章の数（配列の中の `slug: "` の数）。
    # **読めた数ではない。** これと `len(rows)` の差が読み落とし
    declared: int = 0

    @property
    def missed(self) -> int:
        """名乗っているのに読めなかった数。**0 でなければ呼ぶ側が止める。**"""
        return self.declared - len(self.rows)


def read_chapters(src: str) -> ChapterRead:
    """`chapters.ts` の字から、章を1つずつ。**並びはファイルのまま。**

    返す欄は `CHAPTER_KEYS` と `plannedDays`（数。無ければ 0）と
    `countries`（字の並び。無ければ空）。
    無い欄は空の字で埋める——**呼ぶ側に `.get()` を書かせない**（書かせると、
    綴り違いが「欄が無い」に化けて黙って通る）。

    Args:
        src: `site/content/chapters.ts` の中身そのもの

    Returns:
        `ChapterRead`。**`missed` を見ずに `rows` だけ使わないこと**
    """
    body = array_body(code_only(src), "CHAPTERS")
    rows = []
    for obj in objects(body):
        f = fields(obj)
        if not f.get("slug"):
            continue
        row = {k: f.get(k, "") for k in CHAPTER_KEYS}
        days = f.get("plannedDays", "")
        row["plannedDays"] = int(days) if days.isdigit() else 0
        # **並びの欄は `fields()` からは出てこない**（入れ子は飛ばす作り）ので、
        # 名指しで取りに行く。`countries` は「その章で歩いた国」で、
        # 終わった章なら埋まっているはずの欄（`python/upkeep_watch.py` が見ている）
        row["countries"] = list_field(obj, "countries")
        rows.append(row)
    return ChapterRead(rows=rows, declared=len(SLUG_RE.findall(body)))


# ---------------------------------------------------------------- 旅程（nordic.ts）

# 旅程1日ぶんで、読む側がみんな使う欄。**ここに無い欄は落ちる**
TRIP_DAY_KEYS = ("id", "date", "city", "stay")

# 区間（`ROUTE`）の欄。街の名はここと `DAYS` にしか無い
TRIP_LEG_KEYS = ("id", "from", "to", "stay")

# 添え書きを落とす。`site/content/nordic.ts` の `cityName` と同じ決め
# （「ストックホルム（友だちの家に7泊）」→「ストックホルム」）。
# **両方に同じ式を書いているのは、片方が TypeScript で読めないから。**
# 向こうを変えたらここも変える、と `nordic.ts` 側にも書いてある
_CITY_TAIL = re.compile(r"（.*$")


def city_name(s: str) -> str:
    """街の名から添え書きを落とす。`nordic.ts` の `cityName` と同じ。"""
    return _CITY_TAIL.sub("", s).strip()


@dataclass(frozen=True)
class TripDay:
    """旅程の1日。**判定はしない。字をそのまま持つ。**"""

    id: str
    date: str
    # その日の朝いる街。**着く先ではない**（`site/app/nordic/day/[n]/page.tsx` の
    # `sunCity()` と同じ決め——区間があれば1本目の `from`、無ければ `city`）。
    # 取れなければ空
    wakes_in: str = ""


@dataclass(frozen=True)
class TripRead:
    """旅程を読んだ結果。**判定はしない。数だけ添える。**"""

    days: list[TripDay] = field(default_factory=list)
    # 旅のあいだに足をつける街。**並びは通る順**（`VISIT_CITIES` と同じ作り）
    cities: list[str] = field(default_factory=list)
    # ファイルが名乗っている日の数（`DAYS` の中の、いちばん外側の `{…}` の数）。
    # **読めた数ではない。** これと `len(days)` の差が読み落とし。
    #
    # **`id: "` を数えない。** 日の中には分かれ道の選択肢
    # （`fork.options` の `{ id: "trakai", … }`）が入れ子で在るので、
    # 字で数えると 17日のファイルが 19 を名乗る。
    # **日付を持たない行も読み落としに数える**——この表を読むのは
    # 日の出を焼くほうと見張りで、どちらも日付の無い日は扱えない
    declared: int = 0

    @property
    def missed(self) -> int:
        """名乗っているのに読めなかった数。**0 でなければ呼ぶ側が止める。**"""
        return self.declared - len(self.days)


def read_trip(src: str) -> TripRead:
    """旅程（`site/content/nordic.ts`）から、日と街を読む。

    **出どころを2つにしない。** 日の出の表を焼くほうも、焼き込みが古く
    なっていないかを見る見張りも、ここ1本から引く。別々に字を読むと、
    `chapters.ts` を3通りに読んで北欧だけが落ちたのと同じことが起きる
    （このファイルの頭）。

    街の並びは `nordic.ts` の `VISIT_CITIES` と同じ作り——`ROUTE` の
    `from` / `to` / `stay` と `DAYS` の `city` / `stay` を、出てくる順に。
    **`maybe`（寄るかもしれない街）は入れない。** 寄ると決まっていない街の
    ぶんまで焼くと、行かない街の日の出が表に並ぶ。

    Args:
        src: `site/content/nordic.ts` の中身そのもの

    Returns:
        `TripRead`。**`missed` を見ずに `days` だけ使わないこと**
    """
    code = code_only(src)
    route_body = array_body(code, "ROUTE")
    days_body = array_body(code, "DAYS")

    legs: dict[str, dict[str, str]] = {}
    cities: list[str] = []

    def add(name: str) -> None:
        c = city_name(name)
        if c and c not in cities:
            cities.append(c)

    for obj in objects(route_body):
        f = fields(obj)
        if not f.get("id"):
            continue
        legs[f["id"]] = {k: f.get(k, "") for k in TRIP_LEG_KEYS}
        for k in ("from", "to", "stay"):
            if f.get(k):
                add(f[k])

    days: list[TripDay] = []
    for obj in objects(days_body):
        f = fields(obj)
        if not f.get("id") or not f.get("date"):
            continue
        # その日の区間。`legs: [leg("katowice-warszawa")]` と書いてあるので、
        # **関数の呼び出しの中の字**を拾って `ROUTE` から引き直す
        ids = list_field(obj, "legs") or _strings_in(_field_span(obj, "legs"))
        first = next((legs[i] for i in ids if i in legs), None)
        wakes = city_name(first["from"]) if first else city_name(f.get("city", ""))
        days.append(TripDay(id=f["id"], date=f["date"], wakes_in=wakes))
        for k in ("city", "stay"):
            if f.get(k):
                add(f[k])

    return TripRead(days=days, cities=cities,
                    declared=len(objects(days_body)))


def _field_span(obj: str, key: str) -> str:
    """`{…}` の中の `key: [...]` の、角括弧の中身そのまま。無ければ空。

    `list_field()` は**文字列の並び**しか返さない。旅程の `legs` は
    `[leg("id"), leg("id")]` という**関数の呼び出しの並び**なので、
    あちらでは空になる。括弧の中を字のまま取って、`_strings_in()` に渡す。
    """
    i, n = 0, len(obj)
    want = ""
    while i < n:
        c = obj[i]
        if c in "\"'`":
            i = skip_string(obj, i) + 1
            want = ""
            continue
        if c in _PAIRS:
            if want == key and c == "[":
                return obj[i + 1 : close_at(obj, i)]
            i = close_at(obj, i) + 1
            want = ""
            continue
        if c == ",":
            want = ""
            i += 1
            continue
        if (i == 0 or not (obj[i - 1].isalnum() or obj[i - 1] == "_")) and (
            m := _KEY_RE.match(obj, i)
        ):
            want = m.group(1)
            i = m.end()
            continue
        i += 1
    return ""
