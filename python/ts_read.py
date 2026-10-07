"""**`site/content/*.ts` を、字のまま読むための1本。** 判定も計算もしない。

    from ts_read import read_chapters
    got = read_chapters(Path("site/content/chapters.ts").read_text(encoding="utf-8"))
    got.rows      # 章ぜんぶ（読めたもの）
    got.declared  # ファイルが名乗っている章の数
    got.missed    # 読み落とした数。**0 でなければ、呼ぶ側が止める**

本の名前を知らない口もある。章と国だけは意味が重いので名前つきで置いてあるが、
残り（料理・伝説・名簿・セリフ・旅程・山・箱）はこちらを通す。

    got = read_array(src, "RECIPES", keys=("slug",), nested={"streams": ("videoId",)})
    keys = [k for k, _ in read_map(src, "KITCHEN_TALK")]   # `Record<string, X>` の表

## 高さが3つある

| 高さ | 何を返すか | 使うところ |
| --- | --- | --- |
| 字 | `spans` `string_spans` `code_only` | どこが字で、どこが注釈か（日付の掃き寄せ） |
| 構造 | `array_body` `object_body` `objects` `fields` `entries` `nested_body` | 1件ずつ・欄ごと |
| 記録 | `read_chapters` `read_countries` `read_array` `read_map` | **数の止め金つき** |

**字の高さを各所に書き写さない。** `//` を見る前に「いま文字列の中か」を
見る歩きが3通りあって、片方だけ直した日に見ているものが違っていた。

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

**そして4日後、自前の読み手が23か所あった**（2026-10-07。`docs/island-misses.md` #204）。
寄せたのは `chapters.ts` を読む3本だけで、**他の本を数えていなかった。**
国の滞在・旅程・料理・伝説・山・名簿・セリフ・鍵、どれも同じ形の危うさを
持っていた（欄が隣り合っていること、または字下げの深さを当てにしていた）。
23か所ともここに寄せて、**生えたら赤くなる見張り**を足した
（`python/ts_readers_selftest.py`。`python/` と `tools/` の中の「TS の欄を字で
読んでいそうな正規表現」を数えて、表に書いた数と1つでも違えば赤）。
文で「増やすな」と書いても、セッションが変わると守られない。

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
# 素の鍵（`at:` `people:`）。**`:` は食べない**——`entries()` は `:` を見て
# 値の始まりを決めるので、ここで食べると値が1つ飛ぶ
_BAREKEY_RE = re.compile(r"([A-Za-z_]\w*)\s*(?=:)")
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


def spans(src: str) -> list[tuple[str, int, int]]:
    """字の在りか。`("str" | "code", 始まり, 終わり)` を、前から順に。

    **注釈は返さない。** `//` `/* */` を落として、引用符の中を `"str"`、
    それ以外を `"code"` で返す。`"str"` の範囲は**引用符の中身だけ**
    （引用符そのものは入らない）。

    JSX の地の文は `"code"` のほうに残る——あれは字でありながら引用符を
    持たないので、ここでは分けない（分けるのは呼ぶ側の仕事）。

    **これが「どこが字で、どこが注釈か」の唯一の実装。** 同じ歩きを
    各所で書き写していたので、`//` の扱いが場所ごとに違っていた
    （URL の `//` を注釈と読むと、以降が丸ごと消える）。
    """
    out: list[tuple[str, int, int]] = []
    i, n, code_from = 0, len(src), 0
    while i < n:
        c = src[i]
        if c in "\"'`":
            out.append(("code", code_from, i))
            e = skip_string(src, i)
            out.append(("str", i + 1, min(e, n)))
            i = e + 1
            code_from = i
            continue
        if c == "/" and i + 1 < n and src[i + 1] == "/":
            out.append(("code", code_from, i))
            j = src.find("\n", i)
            i = n if j < 0 else j + 1
            code_from = i
            continue
        if c == "/" and i + 1 < n and src[i + 1] == "*":
            out.append(("code", code_from, i))
            j = src.find("*/", i + 2)
            i = n if j < 0 else j + 2
            code_from = i
            continue
        i += 1
    out.append(("code", code_from, n))
    return out


def string_spans(src: str) -> list[tuple[int, int]]:
    """引用符の**中身**の在りか。**注釈の中は入らない。**"""
    return [(a, b) for kind, a, b in spans(src) if kind == "str"]


def _assign_at(src: str, name: str, opener: str) -> int:
    """`… NAME … = <opener>` の `<opener>` の位置。見つからなければ -1。

    名前と `=` のあいだには型が入る（`CHAPTERS: Chapter[] =`、
    `AHEAD_COUNTRIES: { slug: string; name: string }[] =`）。前は
    `[^=;]*` で跨いでいたが、**型の中の `;` で切れていた**ので
    `AHEAD_COUNTRIES` が読めず、呼ぶ側が自前の読み方を1本持つことになっていた。

    だから字を数えるのではなく歩く。括弧の深さが 0 のところに在る `=` だけを
    代入と見て、**深さ 0 で `;` に当たったらその名前はあきらめて次を探す**
    （跨がせないのは「別の宣言の `= [` を掴まない」ため。理由ごと残す）。
    `=>` `==` `>=` `<=` `!=` は代入ではないので、前後の1字を見て外す。
    """
    for m in re.finditer(rf"\b{re.escape(name)}\b", src):
        i, n, depth = m.end(), len(src), 0
        while i < n:
            c = src[i]
            if c in "\"'`":
                i = skip_string(src, i) + 1
                continue
            if c in _PAIRS:
                depth += 1
                i += 1
                continue
            if c in ")]}":
                depth -= 1
                if depth < 0:
                    break  # 自分を囲んでいる括弧の外に出た。この名前ではない
                i += 1
                continue
            if depth == 0 and c == ";":
                break  # 宣言が終わった。この名前ではない
            if (
                depth == 0
                and c == "="
                and src[i - 1] not in "=!<>"
                and (i + 1 >= n or src[i + 1] not in "=>")
            ):
                j = i + 1
                while j < n and src[j].isspace():
                    j += 1
                return j if j < n and src[j] == opener else -1
            i += 1
    return -1


def array_span(src: str, name: str) -> tuple[int, int]:
    """`… NAME … = [ … ]` の `[` と `]` の位置。見つからなければ `(-1, -1)`。

    **位置で返すのは、字を書き換える側が元の字のどこを触るかを知るため。**
    `code_only()` は長さを変えないので、注釈を落とした字で測った位置は
    元の字にそのまま当たる。
    """
    i = _assign_at(src, name, "[")
    return (-1, -1) if i < 0 else (i, close_at(src, i))


def array_body(src: str, name: str) -> str:
    """`export const NAME … = [ … ]` の中身。見つからなければ空。

    **先にコメントを落としてから渡すこと**（`code_only`）。
    """
    i, e = array_span(src, name)
    return "" if i < 0 else src[i + 1 : e]


def object_span(src: str, name: str) -> tuple[int, int]:
    """`… NAME … = { … }` の `{` と `}` の位置。見つからなければ `(-1, -1)`。"""
    i = _assign_at(src, name, "{")
    return (-1, -1) if i < 0 else (i, close_at(src, i))


def object_body(src: str, name: str) -> str:
    """`… NAME … = { … }` の中身。見つからなければ空。

    `Record<string, X>` の表（`streamPeaks.ts` の `PEAKS`、
    `kitchenTalk.ts` の `KITCHEN_TALK`）はこちら。
    """
    i, e = object_span(src, name)
    return "" if i < 0 else src[i + 1 : e]


def object_spans(body: str) -> list[tuple[int, int]]:
    """配列の中の `{…}` の在りか（`{` と `}` の位置）を、いちばん外側だけ。

    **位置で返す口を別に置いてあるのは、1件だけを書き換えたい側のため**
    （`python/nordic_depart.py` が章1つの `to: ""` を埋める）。
    字を切るだけなら `objects()` を使う。
    """
    out: list[tuple[int, int]] = []
    i, n = 0, len(body)
    while i < n:
        c = body[i]
        if c == "{":
            e = close_at(body, i)
            out.append((i, e))
            i = e + 1
            continue
        if c in "\"'`":
            i = skip_string(body, i) + 1
            continue
        i += 1
    return out


def objects(body: str) -> list[str]:
    """配列の中の `{…}` を、いちばん外側だけ1つずつ。"""
    return [body[a + 1 : b] for a, b in object_spans(body)]


def nested_body(obj: str, key: str) -> str:
    """`{…}` の中の `key: [ … ]` / `key: { … }` の**中身**。無ければ空。

    `fields()` は入れ子をわざと飛ばす（`note:` の本文に `to: "…"` と書いて
    あるのを欄と読まないため）。入れ子をまるごと欲しいときはこちら。

    **前はここを `re.search(r"\bstays\s*:\s*\[")` で探していた。**
    注釈はあらかじめ落ちている前提だったが、落とし忘れると注の中の
    `stays: [` を掴む。歩いて探せばその心配が無い。
    """
    i, n, want = 0, len(obj), ""
    while i < n:
        c = obj[i]
        if c in "\"'`":
            i = skip_string(obj, i) + 1
            want = ""
            continue
        if c in _PAIRS:
            e = close_at(obj, i)
            if want == key:
                return obj[i + 1 : e]
            i = e + 1
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


def entries(body: str) -> list[tuple[str, str]]:
    """`{ "鍵": 値, … }` の中身を「鍵 → 値の字」で、書いてある順に。

    `Record<string, X>` の表を1行ずつにするところ（`streamPeaks.ts` の
    `PEAKS`、`kitchenTalk.ts` の `KITCHEN_TALK`、`characterBox.ts` の `BOX`）。
    鍵は引用符つきでも素の名前（`at:` `people:`）でもよい。

    値は**字のまま**返す。入れ子なら `{…}` / `[…]` の中身、引用符つきなら
    中身、それ以外（数・真偽）は前後の空白を落としただけ。
    **意味づけはしない**（ここの決めごと）。
    """
    out: list[tuple[str, str]] = []
    i, n, key = 0, len(body), ""
    while i < n:
        c = body[i]
        if c in "\"'`":
            e = skip_string(body, i)
            if not key:
                key = body[i + 1 : e]  # 引用符つきの鍵
            i = e + 1
            continue
        if c == ":" and key:
            j = i + 1
            while j < n and body[j].isspace():
                j += 1
            if j >= n:
                break
            if body[j] in _PAIRS:
                e = close_at(body, j)
                out.append((key, body[j + 1 : e]))
                i = e + 1
            elif body[j] in "\"'`":
                e = skip_string(body, j)
                out.append((key, body[j + 1 : e]))
                i = e + 1
            else:
                e = j
                while e < n and body[e] not in ",\n":
                    e += 1
                out.append((key, body[j:e].strip()))
                i = e
            key = ""
            continue
        if c == ",":
            key = ""
            i += 1
            continue
        if (i == 0 or not (body[i - 1].isalnum() or body[i - 1] == "_")) and (
            m := _BAREKEY_RE.match(body, i)
        ):
            key = m.group(1)
            i = m.end()
            continue
        i += 1
    return out


def count_keys(body: str, key: str) -> int:
    """配列の中身で、**いちばん外側の `{…}` が持っている** `key:` の数。

    読み落としを数で捕まえるための、**欄を読むのとは別の数えかた**
    （`ChapterRead.missed` の考えを、章以外にも使えるようにしたもの）。
    `objects()` も `fields()` も通らない道で数えるので、あちらが1件
    取りこぼしても、ここの数は減らない。

    深さを見るのは、**入れ子の同じ名前を数えないため。**
    `nordic.ts` の `ROUTE` は区間ごとに `id:` を持つが、`fork.options` も
    `id:` を持っている。深さを見ずに数えると、名乗っている数のほうが
    膨らんで、読めているのに「読み落とした」と言い出す。
    """
    want = re.compile(rf"\b{re.escape(key)}\s*:")
    got, i, n, depth = 0, 0, len(body), 0
    while i < n:
        c = body[i]
        if c in "\"'`":
            i = skip_string(body, i) + 1
            continue
        if c in _PAIRS:
            depth += 1
            i += 1
            continue
        if c in ")]}":
            depth -= 1
            i += 1
            continue
        if depth == 1 and (i == 0 or not (body[i - 1].isalnum() or body[i - 1] == "_")):
            if m := want.match(body, i):
                got += 1
                i = m.end()
                continue
        i += 1
    return got


def count_objects(body: str) -> int:
    """配列の中の、**いちばん外側の `{…}` の数**。

    `len(objects(body))` と同じ数を返すが、**通る道が別。** 括弧の深さを
    数えるだけで、`close_at()` も `objects()` も通らない。

    読み落としを捕まえる数は、**欄を読むのとは別の道で出す**のが決まり
    （`docs/island-misses.md` #204 の決めごと3）。`len(objects(…))` を
    名乗りに使うと、`objects()` が1件落とした日に名乗りも1つ減って、
    **読み落としが永久に 0 になる。**
    """
    got, i, n, depth = 0, 0, len(body), 0
    while i < n:
        c = body[i]
        if c in "\"'`":
            i = skip_string(body, i) + 1
            continue
        if c in _PAIRS:
            depth += 1
            if c == "{" and depth == 1:
                got += 1
            i += 1
            continue
        if c in ")]}":
            depth -= 1
            i += 1
            continue
        i += 1
    return got


def const_string(src: str, name: str) -> str:
    """`const NAME = "…";` の字。無ければ空。**注釈は先に落とすこと。**"""
    m = re.search(rf"\b{re.escape(name)}\b[^=\n]*=\s*[\"'`]", src)
    if not m:
        return ""
    i = m.end() - 1
    return src[i + 1 : skip_string(src, i)]


def string_consts(src: str) -> dict[str, str]:
    """`const NAME = "…";` を、名前 → 字で。**入れ子の中は見ない。**

    同じ日を2か所に書かないために `until: NORDIC_UNTIL` と名前で置いてある
    欄があるので、名前から字を引けるようにしてある（`site/content/plans.ts`）。

    拾うのは**大文字と `_` だけの名前**。小文字で始まるものは関数や式で、
    字ではない（`const md = (d: string) => …`）。
    """
    out: dict[str, str] = {}
    for m in re.finditer(r'^(?:export\s+)?const\s+([A-Z_][A-Z0-9_]*)\s*=\s*"', src, re.M):
        i = m.end() - 1
        out[m.group(1)] = src[i + 1 : skip_string(src, i)]
    return out


def const_int(src: str, name: str, default: int = 0) -> int:
    """`const NAME = 12;`（型つきでもよい）の数。無ければ `default`。"""
    m = re.search(rf"\b{re.escape(name)}\s*(?::\s*number\s*)?=\s*(-?\d+)", src)
    return int(m.group(1)) if m else default


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


# ---------------------------------------------------------------- 並びぜんぶ（配列の本）


@dataclass(frozen=True)
class ArrayRead:
    """`export const NAME = [ {…}, … ]` を読んだ結果。**判定はしない。数だけ添える。**"""

    rows: list[dict] = field(default_factory=list)
    # ファイルが名乗っている件数（いちばん外側の `{…}` が持つ合言葉の欄の数）。
    # **読めた数ではない。** これと `len(rows)` の差が読み落とし
    declared: int = 0

    @property
    def missed(self) -> int:
        """名乗っているのに読めなかった数。**0 でなければ呼ぶ側が止める。**"""
        return self.declared - len(self.rows)


def read_array(
    src: str,
    name: str,
    keys: tuple[str, ...] = (),
    lists: tuple[str, ...] = (),
    nested: dict[str, tuple[str, ...]] | None = None,
    id_key: str = "slug",
) -> ArrayRead:
    """`export const NAME = [ {…}, … ]` を「鍵 → 字」の並びにする。

    **読み手を1本に寄せるための、名前を知らない口。** 章（`read_chapters`）と
    国（`read_countries`）だけは意味が重いので別に置いてあるが、残りの本
    （料理・伝説・名簿・セリフ・旅程）はここを通す。呼ぶ側は**欄の名前を
    並べるだけ**で、字の読み方には触らない。

    Args:
        src: ファイルの中身そのもの（注釈はここで落とす）
        name: 並びの名前（`"RECIPES"`）
        keys: 取りたい欄。**無い欄は空の字**で埋める（呼ぶ側に `.get()` を
            書かせない——書かせると、綴り違いが「欄が無い」に化けて黙って通る）
        lists: `["a", "b"]` の形で取りたい欄。無ければ空の並び
        nested: `{"streams": ("date", "videoId")}` のように、入れ子の
            `[{…}, …]` から取りたい欄。並びはファイルのまま
        id_key: 「1件を名乗っている」欄。**これが空の `{…}` は数えない**
            （型の宣言や、別物の塊を拾わないため）

    Returns:
        `ArrayRead`。**`missed` を見ずに `rows` だけ使わないこと**
    """
    body = array_body(code_only(src), name)
    rows = []
    for obj in objects(body):
        f = fields(obj)
        if not f.get(id_key):
            continue
        row: dict = {k: f.get(k, "") for k in keys}
        for k in lists:
            row[k] = list_field(obj, k)
        for k, sub in (nested or {}).items():
            row[k] = [
                {c: g.get(c, "") for c in sub}
                for g in (fields(o) for o in objects(nested_body(obj, k)))
            ]
        rows.append(row)
    return ArrayRead(rows=rows, declared=count_keys(body, id_key))


def read_map(src: str, name: str) -> list[tuple[str, str]]:
    """`const NAME: Record<string, X> = { "鍵": 値, … }` を、書いてある順に。

    返すのは `entries()` そのまま（値は字のまま）。**鍵だけ欲しい**ことが
    多いので、呼ぶ側は `[k for k, _ in read_map(...)]` と書く。
    """
    return entries(object_body(code_only(src), name))


# ---------------------------------------------------------------- 国（countries.ts）


@dataclass(frozen=True)
class CountryRead:
    """`countries.ts` を読んだ結果。**判定はしない。数だけ添える。**"""

    rows: list[dict] = field(default_factory=list)
    declared: int = 0  # ファイルが名乗っている国の数（`slug: "` の数）
    # 名乗っている滞在の数（国ぜんぶの `stays` の中の `from:` の数）。
    # **国が読めても、滞在が1つ落ちれば配信の行き先が変わる**ので別に数える
    stays_declared: int = 0

    @property
    def missed(self) -> int:
        """名乗っているのに読めなかった国の数。**0 でなければ呼ぶ側が止める。**"""
        return self.declared - len(self.rows)

    @property
    def stays_got(self) -> int:
        """読めた滞在の数。"""
        return sum(len(c["stays"]) for c in self.rows)

    @property
    def stays_missed(self) -> int:
        """名乗っているのに読めなかった滞在の数。**0 でなければ呼ぶ側が止める。**"""
        return self.stays_declared - self.stays_got


def read_countries(src: str) -> CountryRead:
    """`countries.ts` の `COUNTRIES` から「国 → 滞在（期間と街）」を読む。

    **ここは2人が同じものを読みに来る**（`python/stays.py` が配信を国に
    振り分けるため、`python/upkeep_watch.py` が閉じ忘れを見つけるため）。
    前は**別々の読み方**を持っていて、片方は正規表現で
    `from → to → cities` が隣り合っていることを求めていた。注釈が1行
    挟まるだけでその国が丸ごと落ちるので、1本にした。

    Args:
        src: `site/content/countries.ts` の中身そのもの

    Returns:
        `CountryRead`。**`missed` と `stays_missed` を見ずに `rows` だけ
        使わないこと**
    """
    body = array_body(code_only(src), "COUNTRIES")
    rows, want = [], 0
    for obj in objects(body):
        f = fields(obj)
        if not f.get("slug"):
            continue
        sb = nested_body(obj, "stays")
        want += count_keys(sb, "from")
        stays = []
        for one, inner in zip(objects(sb), object_spans(sb)):
            g = fields(one)
            stays.append({
                "from": g.get("from", ""),
                "to": g.get("to", ""),
                "cities": list_field(sb[inner[0] + 1 : inner[1]], "cities"),
            })
        rows.append({"slug": f["slug"], "name": f.get("name", ""), "stays": stays})
    return CountryRead(
        rows=rows, declared=len(SLUG_RE.findall(body)), stays_declared=want
    )


def read_ahead_countries(src: str) -> ArrayRead:
    """`countries.ts` の `AHEAD_COUNTRIES`（これから歩く国）。

    **`COUNTRIES` にまだ無い国の置き場。** 街も滞在も歩き終わってから書く
    決まりなので、ここが持っているのは名前と旗の鍵と「着いた日」だけ。
    """
    return read_array(src, "AHEAD_COUNTRIES", keys=("slug", "name", "entered"))
# ---------------------------------------------------------------- 旅程（nordic.ts）

# 旅程1日ぶんで、読む側がみんな使う欄。**ここに無い欄は落ちる**
TRIP_DAY_KEYS = ("id", "date", "city", "stay")

# 区間（`ROUTE`）で、読む側がみんな使う欄。**ここに無い欄は落ちる。**
# 街の名はここと `DAYS` にしか無く、`date` と `enters`（この区間でどの国に
# 入るか）は `python/stays.py` が「その日どの国にいたか」を出すのに使う
TRIP_LEG_KEYS = ("id", "from", "to", "stay", "date", "enters")

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
    # 取れなければ空。**ここだけ添え書きを落としてある**（`city_name`）
    wakes_in: str = ""
    # 泊まる先と、その日の `city`。**字のまま**（「ストックホルム（友だちの家）」の
    # 括弧も付いたまま）。落としたい側は `city_name()` を通す——
    # `python/stays.py` は括弧の付いた字から自分で落とす決まりを持っているので、
    # ここで先に落とすと、あちらの決まりが二重にかかる
    stay: str = ""
    city: str = ""
    # その日に通る区間の id。**書いてある順**（`legs: [leg("a-b"), leg("b-c")]`）
    legs: tuple[str, ...] = ()


@dataclass(frozen=True)
class TripRead:
    """旅程を読んだ結果。**判定はしない。数だけ添える。**"""

    days: list[TripDay] = field(default_factory=list)
    # 旅のあいだに足をつける街。**並びは通る順**（`VISIT_CITIES` と同じ作り）
    cities: list[str] = field(default_factory=list)
    # 寄るかもしれない街（`maybe`）。**`cities` からは引いていない。**
    # 引くかどうかは呼ぶ側が決める——地図を焼くほうは引く（行くと決まって
    # いない街の地図を焼いて一度叱られている。`docs/island-misses.md` #4）が、
    # 「旅程に出てくる街」として数える側は引かない
    maybe: list[str] = field(default_factory=list)
    # ファイルが名乗っている日の数（`DAYS` の中の、いちばん外側の `{…}` の数）。
    # **読めた数ではない。** これと `len(days)` の差が読み落とし。
    #
    # **`id: "` を数えない。** 日の中には分かれ道の選択肢
    # （`fork.options` の `{ id: "trakai", … }`）が入れ子で在るので、
    # 字で数えると 17日のファイルが 19 を名乗る。
    # 数えるのは `count_objects()`——**`objects()` を通らない道**で深さを数える。
    # `len(objects(…))` で数えると、`objects()` が1件落とした日に名乗りも
    # 1つ減って、**読み落としが永久に 0 になる**（#204 の決めごと3）。
    # **日付を持たない行も読み落としに数える**——この表を読むのは
    # 日の出を焼くほうと見張りで、どちらも日付の無い日は扱えない
    declared: int = 0
    # 区間（`ROUTE`）。`id` → `TRIP_LEG_KEYS` の欄。**並びは書いてある順。**
    # 日の出を焼くほうは `days` しか見ないが、「その日どの国にいたか」を出す側は
    # `enters`（この区間でどの国に入るか）と `date` が要る（`python/stays.py`）
    legs: dict[str, dict[str, str]] = field(default_factory=dict)
    # ファイルが名乗っている区間の数（`ROUTE` の中の、いちばん外側の `{…}` の数）。
    # **日と同じ理由で `{}` を数える**（入れ子の `fork.options` も `id:` を持つ）
    legs_declared: int = 0

    @property
    def missed(self) -> int:
        """名乗っているのに読めなかった日の数。**0 でなければ呼ぶ側が止める。**"""
        return self.declared - len(self.days)

    @property
    def legs_missed(self) -> int:
        """名乗っているのに読めなかった区間の数。**0 でなければ呼ぶ側が止める。**

        日が全部読めていても、区間が1本落ちればその日に入った国が消える
        （`python/stays.py`）。**日と別に数える。**
        """
        return self.legs_declared - len(self.legs)


def read_trip(src: str) -> TripRead:
    """旅程（`site/content/nordic.ts`）から、日と街を読む。

    **出どころを2つにしない。** 日の出の表を焼くほうも、焼き込みが古く
    なっていないかを見る見張りも、ここ1本から引く。別々に字を読むと、
    `chapters.ts` を3通りに読んで北欧だけが落ちたのと同じことが起きる
    （このファイルの頭）。

    街の並びは `nordic.ts` の `VISIT_CITIES` と同じ作り——`ROUTE` の
    `from` / `to` / `stay` と `DAYS` の `city` / `stay` を、出てくる順に。
    **`maybe`（寄るかもしれない街）は `cities` に入れない。** 寄ると決まって
    いない街のぶんまで焼くと、行かない街の日の出が表に並ぶ。
    `maybe` そのものは別の欄で返す——地図を焼くほう（`tools/nordic/geocode.py`）は
    「`cities` に出てきたが `maybe` にも在る街」を落とす決まりを持っている。

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
    maybe: list[str] = []

    def add(name: str) -> None:
        c = city_name(name)
        if c and c not in cities:
            cities.append(c)

    def add_maybe(obj: str) -> None:
        for name in list_field(obj, "maybe"):
            c = city_name(name)
            if c and c not in maybe:
                maybe.append(c)

    for obj in objects(route_body):
        f = fields(obj)
        if not f.get("id"):
            continue
        legs[f["id"]] = {k: f.get(k, "") for k in TRIP_LEG_KEYS}
        for k in ("from", "to", "stay"):
            if f.get(k):
                add(f[k])
        add_maybe(obj)

    days: list[TripDay] = []
    for obj in objects(days_body):
        f = fields(obj)
        if not f.get("id") or not f.get("date"):
            continue
        # その日の区間。`legs: [leg("katowice-warszawa")]` と書いてあるが、
        # `list_field()` は角括弧の中の**文字列リテラルを並んでいる順に**返すので、
        # 関数の呼び出しごしでも id が取れる（`leg(` のほうは字ではないので出ない）
        ids = list_field(obj, "legs")
        first = next((legs[i] for i in ids if i in legs), None)
        wakes = city_name(first["from"]) if first else city_name(f.get("city", ""))
        days.append(TripDay(
            id=f["id"], date=f["date"], wakes_in=wakes,
            stay=f.get("stay", ""), city=f.get("city", ""), legs=tuple(ids),
        ))
        for k in ("city", "stay"):
            if f.get(k):
                add(f[k])
        add_maybe(obj)

    return TripRead(days=days, cities=cities, maybe=maybe,
                    declared=count_objects(days_body),
                    legs=legs, legs_declared=count_objects(route_body))
