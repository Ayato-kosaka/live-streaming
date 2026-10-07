"""**焼き込みを読む口が、黙って1件落としていないか。読み手が増えていないか。**

    python3 python/ts_readers_selftest.py

    BREAK=drop    python3 python/ts_readers_selftest.py  # 1件落とす読み手にする
    BREAK=nogap   python3 python/ts_readers_selftest.py  # 注釈を跨げない読み手にする
    BREAK=nocount python3 python/ts_readers_selftest.py  # 名乗りの数えを外す

終了コード 0=ぜんぶ通った / 1=外したものがある / 2=`BREAK` の名前が違う。

## なぜ要るか

`python/ts_read_selftest.py` は**章だけ**を見ている。だが黙って落ちたのは
章に限らない。2026-10-07 に数えたら、`site/content/*.ts` を**自前の正規表現で
読んでいる場所が 14 本**あった。どれも同じ形の危うさを持っていた。

| どこ | 何を当てにしていたか |
| --- | --- |
| `stays.py` | `slug: "…",` の次の行が `name:` であること |
| `build_kitchen_talk.py` | `{ label: …, date: …, videoId: … }` がこの順で隣り合うこと |
| `build_legend_days.py` | `range: \\["…", "…"\\]` が1行に収まっていること |
| `character_days_probe.py` | `icon → emoji → days → score → channel` がこの順であること |
| `stale_content_watch.py` | 鍵の行の**字下げの深さ** |

**どれも、注釈を1行挟むだけで、その1件が例外も警告も出さずに消える。**
`chapters.ts` の北欧がそうなって、島の数字から 9/12〜9/27 が丸ごと消えていた
（`python/ts_read.py` の頭）。

だから見るのは3つ。

| 何を | なぜ |
| --- | --- |
| 本番の焼き込みを**ぜんぶの口で読んで、名乗りと読めた数が合う** | いま落ちていないこと |
| **注釈を挟んだ写し**でも、同じものが同じ数だけ読める | 次に注釈が増えても落ちないこと |
| その写しを**昔の読み方に食わせると落ちる** | この対照が易しくなっていないこと |

3つめが無いと、**対照が無言で易しくなる**（`docs/island-standards.md` §15）。

## 読み手が増えたら赤くなる

同じことを3回やられたので（`chapters.ts` が3通り → 1本 → `stays.py` に4本目）、
**数を見張る。** `python/` の中で「TS の欄を字で読んでいそうな正規表現」を数えて、
`ALLOW` に書いた数と1つでも違えば赤。**増やすなら理由を書かせる。**
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import stale_content_watch as stale  # noqa: E402
import ts_read  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
PY = REPO / "python"
CONTENT = REPO / "site" / "content"

BREAK = os.environ.get("BREAK", "")
LEGS = ("drop", "nogap", "nocount")


# ---------------------------------------------------------------- 足を抜く
#
# **3本を1本にまとめない。** `drop` は「読めない」、`nogap` は「注釈で切れる」、
# `nocount` は「読めなかったことに気づけない」で、別のこと。北欧が消えたのは
# `nogap` と `nocount` が揃ったからで、片方だけ直しても次でまた黙る。


def _hobble() -> None:
    if BREAK == "drop":
        real = ts_read.objects

        def one_short(body: str) -> list[str]:
            got = real(body)
            return got[:-1] if len(got) > 1 else got

        ts_read.objects = one_short
    elif BREAK == "nogap":
        ts_read.code_only = lambda src: src
    elif BREAK == "nocount":
        # **名乗りを「読めた数」で数える。** こうすると読み落としが永久に 0 になる
        ts_read.count_keys = lambda body, key: len(
            [o for o in ts_read.objects(body) if ts_read.fields(o).get(key)]
        )
        ts_read.SLUG_RE = re.compile(r"(?!)")


# ---------------------------------------------------------------- 読む口の一覧
#
# **`ts_read` の口を名指しで並べる。** ここに無い焼き込みは、誰も読んでいない
# （＝落ちても誰も困らない）ということ。読み手を足したらここにも足す。

# 並びの本。`(ファイル, 並びの名前, 1件を名乗る欄)`
ARRAYS = (
    ("chapters.ts", "CHAPTERS", "slug"),
    ("countries.ts", "COUNTRIES", "slug"),
    ("countries.ts", "AHEAD_COUNTRIES", "slug"),
    ("recipes.ts", "RECIPES", "slug"),
    ("legends.ts", "LEGENDS", "slug"),
    ("residents.ts", "RESIDENTS", "icon"),
    ("chatter.ts", "VOICES", "icon"),
    ("nordic.ts", "ROUTE", "id"),
    ("nordic.ts", "DAYS", "id"),
)

# 表の本（`Record<string, X>`）。鍵の数だけ見る
MAPS = (
    ("kitchenTalk.ts", "KITCHEN_TALK"),
    ("legendDays.ts", "LEGEND_DAYS"),
    ("streamPeaks.ts", "PEAKS"),
    ("characterBox.ts", "BOX"),
)

# 2026-10-07 まで、それぞれの本をこう読んでいた。**この対照が易しくなって
# いないことを見るためだけに置いてある。** 本物はもう1本も使っていない。
#
# 崩し方は2つ。**昔の読み方の弱点が2種類あるので、同じ崩し方では両方出ない。**
#
# | 崩し方 | 昔の読み方のどこが弱いか |
# | --- | --- |
# | `gap` | 欄が**隣り合っていること**を当てにしている。注釈が1行入ると落ちる |
# | `nest` | **深さを見ていない**。入れ子に同じ名前の欄があると、余分に数える |
LEGACY = {
    ("chapters.ts", "CHAPTERS"): (
        re.compile(r'slug: "([a-z-]+)",\n\s*name: "([^"]+)",\n\s*from: "([\d-]*)",'),
        "gap",
    ),
    ("countries.ts", "COUNTRIES"): (
        re.compile(r'slug: "([a-z-]+)",\s*\n\s*name: "([^"]+)",'), "gap",
    ),
    ("recipes.ts", "RECIPES"): (
        re.compile(r'\{ label: "([^"]+)", date: "([^"]+)", videoId: "([^"]+)"'), "gap",
    ),
    ("legends.ts", "LEGENDS"): (
        re.compile(r'range: \["([\d-]+)", "([\d-]+)"\]'), "gap",
    ),
    ("residents.ts", "RESIDENTS"): (
        re.compile(
            r'\{\s*icon:\s*"([^"]+)"(?:,\s*emoji:\s*"[^"]*")?,\s*days:\s*(\d+)'
        ),
        "gap",
    ),
    ("nordic.ts", "ROUTE"): (re.compile(r'id: "([^"]+)",\n    from: "'), "gap"),
    ("nordic.ts", "DAYS"): (
        re.compile(r'\n    date: "([\d-]+)",\n    wake: "'), "gap",
    ),
    # 行の頭を当てる読み方は、注釈では壊れない。**深さを見ていないほうで出す**
    ("chatter.ts", "VOICES"): (re.compile(r'^\s+icon: "([^"]+)"', re.M), "nest"),
    ("kitchenTalk.ts", "KITCHEN_TALK"): (
        re.compile(r'^\s+"([a-z0-9-]+)": \{', re.M), "nest",
    ),
    ("legendDays.ts", "LEGEND_DAYS"): (
        re.compile(r'^\s+"([a-z0-9-]+)": \{', re.M), "nest",
    ),
    ("characterBox.ts", "BOX"): (re.compile(r'^\s+"([^"]+)": \[', re.M), "nest"),
}

# `nest` の崩し方で足す字。**いちばん外側ではないところに、同じ名前の欄を置く。**
# `ts_read` はいちばん外側しか欄にしないので1件も増えないが、深さを見ない
# 読み方はここを1件と数える
NEST = {
    ("chatter.ts", "VOICES"): '\n    sub: {\n      icon: "ghost",\n    },',
    ("kitchenTalk.ts", "KITCHEN_TALK"): '\n    sub: {\n      "ghost": {},\n    },',
    ("legendDays.ts", "LEGEND_DAYS"): '\n    sub: {\n      "ghost": {},\n    },',
    ("characterBox.ts", "BOX"): None,  # 値が `[数, …]` なので入れ子に欄を置けない
}

# **注釈を挟めない本。** 1件が `{…}` ではないので、挟む場所そのものが無い
# （`characterBox.ts` の `BOX` は `"鍵": [数, 数, …]`）。
# ここに無い本が挟めなかったら、それは挟み方のほうが壊れている
NO_GAP = {("characterBox.ts", "BOX")}

# 合言葉の欄を名乗っているのに、中身が空な1件。**名乗りは2つ、読めるのは1つ。**
# ここで `missed` が立たないと、**名乗りを「読めた数」で数えている**ということ
# ——読み落としが永久に 0 になって、次に落ちたとき黙る（北欧がそれだった）
NO_ID = """
export const CHAPTERS: Chapter[] = [
  { slug: "alpha", name: "ひとつめ" },
  { slug: "", name: "ふたつめ" },
];
"""

# 挟む注釈。**本番の北欧と同じ9行**で、中に欄のように見える字を入れてある
# （注釈を落とさない読み手は、ここの `to:` を欄と読む）
GAP = """
    /* ここに注釈が9行入る、というのが本番の北欧の形。
       なぜこの日から始まるのか、なぜこの日で閉じるのか、
       という経緯を書くので、どうしても長くなる。
       to: "2026-12-31" と書いてあっても欄ではない。
       slug: "ghost" と書いてあっても1件ではない。
       https://example.com/a//b.png のような URL も入る。
       字下げも揃っていない。
         ここは深い。
       ここは浅い。 */
"""


def _span_of(src: str, name: str) -> tuple[int, int]:
    """その並び／表の `[`…`]`（または `{`…`}`）の在りか。無ければ `(-1, -1)`。"""
    code = ts_read.code_only(src)
    at, end = ts_read.array_span(code, name)
    if at < 0:
        at, end = ts_read.object_span(code, name)
    return at, end


def _commas(inner: str) -> list[int]:
    """`{…}` の中の `,` の位置を、**深さを問わず**全部。文字列の中は数えない。"""
    out, i, n = [], 0, len(inner)
    while i < n:
        c = inner[i]
        if c in "\"'`":
            i = ts_read.skip_string(inner, i) + 1
            continue
        if c == ",":
            out.append(i)
        i += 1
    return out


def _inject_gap(src: str, name: str) -> str:
    """**1件ごとに、欄と欄のあいだぜんぶへ注釈を挟んだ写し。**

    挟むのは「`{` のすぐうしろ」と「`,` のうしろ」ぜんぶ（入れ子の中も）。
    本番の北欧は `slug:` と `name:` のあいだだけだったが、**次に注釈が
    付く場所はそこだとは限らない。** 付きうるところ全部に付けて確かめる。

    **うしろから挟む**——前から挟むと、2件目以降の在りかがずれる。
    """
    at, end = _span_of(src, name)
    if at < 0:
        return src
    body = ts_read.code_only(src)[at + 1 : end]
    cuts: list[int] = []
    for i, e in ts_read.object_spans(body):
        base = at + 1 + i + 1  # `{` の直後
        cuts.append(base)
        cuts += [base + j + 1 for j in _commas(body[i + 1 : e])]
    out = src
    for c in sorted(cuts, reverse=True):
        out = out[:c] + GAP + out[c:]
    return out


def _inject_nest(src: str, name: str, snippet: str) -> str:
    """**1件めの中に、入れ子で同じ名前の欄を足した写し。**

    いちばん外側しか欄にしない読み手は1件も増えないが、深さを見ない
    読み方はここを1件と数える。
    """
    at, end = _span_of(src, name)
    if at < 0:
        return src
    body = ts_read.code_only(src)[at + 1 : end]
    spans = ts_read.object_spans(body)
    if not spans:
        return src
    i, _e = spans[0]
    cut = at + 1 + i + 1
    return src[:cut] + snippet + src[cut:]


def main() -> int:
    if BREAK and BREAK not in LEGS:
        print(f"::error::BREAK={BREAK} は足の名前ではありません。使えるのは {', '.join(LEGS)}")
        return 2
    _hobble()
    if BREAK:
        print(f"** BREAK={BREAK} —— 足を1本抜いてある。ここは落ちるのが正しい **")

    ok: list[str] = []
    ng: list[str] = []

    def check(label: str, got, want) -> None:
        (ok if got == want else ng).append(f"{label}: 出た={got} ほしい={want}")

    src_of = {p.name: p.read_text(encoding="utf-8") for p in sorted(CONTENT.glob("*.ts"))}

    # --- 1. 本番の焼き込みで、名乗りと読めた数が合うか -------------------------
    for fname, name, idk in ARRAYS:
        src = src_of.get(fname, "")
        got = ts_read.read_array(src, name, keys=(idk,), id_key=idk)
        print(f"  {fname} の {name}: 名乗り {got.declared} / 読めた {len(got.rows)}")
        check(f"{fname} の {name} が1件も名乗っていない、ということは無い",
              got.declared > 0, True)
        check(f"{fname} の {name} を1件も読み落としていない", got.missed, 0)
        check(f"{fname} の {name} の鍵に空が無い",
              all(r[idk] for r in got.rows), True)

    for fname, name in MAPS:
        keys = [k for k, _ in ts_read.read_map(src_of.get(fname, ""), name)]
        print(f"  {fname} の {name}: 鍵 {len(keys)}件")
        check(f"{fname} の {name} の鍵が1件も取れない、ということは無い", len(keys) > 0, True)
        check(f"{fname} の {name} の鍵に空が無い", all(keys), True)
        check(f"{fname} の {name} の鍵が重なっていない", len(set(keys)), len(keys))

    # 名乗りの数えが、読めた数とは**別の道**で出ているか。
    # 同じ道で数えると「読めたぶんだけ名乗っていた」ことになって、
    # 読み落としが永久に 0 になる（北欧が消えたとき、まさにそれだった）
    half = ts_read.read_array(NO_ID, "CHAPTERS", keys=("slug",))
    print(f"  合言葉が空な1件を混ぜた字: 名乗り {half.declared} / 読めた {len(half.rows)}"
          f" / 読み落とし {half.missed}")
    check("読めなかった1件は、読み落としとして立つ", half.missed, 1)
    check("読めたぶんはそのまま返る", [r["slug"] for r in half.rows], ["alpha"])

    # 国の滞在は、国が読めても別に落ちる（配信の行き先が変わる）
    cs = ts_read.read_countries(src_of.get("countries.ts", ""))
    check("countries.ts が1国も名乗っていない、ということは無い（read_countries）",
          cs.declared > 0, True)
    check("countries.ts の国を1件も読み落としていない（read_countries）", cs.missed, 0)
    print(f"  countries.ts の滞在: 名乗り {cs.stays_declared} / 読めた {cs.stays_got}")
    check("countries.ts の滞在が1件も名乗っていない、ということは無い",
          cs.stays_declared > 0, True)
    check("countries.ts の滞在を1件も読み落としていない", cs.stays_missed, 0)

    # 見張りが鍵を数える本も、ここを通る
    for fname in stale.KEY_OF:
        keys = stale.keys_of(fname, src_of.get(fname, ""))
        check(f"{fname} の鍵が取れる（stale_content_watch）", len(keys) > 0, True)

    # --- 2. 注釈を挟んだ写しでも、同じものが同じ数だけ読めるか -----------------
    #
    # **本番の字をそのまま使う。** 作り物の2行で試すと、本番の書き方が変わった
    # 日に対照のほうが先に易しくなる（`stale_content_watch_selftest.py` と同じ決め）
    def _keys(src: str, fname: str, name: str, idk: str | None) -> list[str]:
        if idk is None:
            return [k for k, _ in ts_read.read_map(src, name)]
        return [r[idk] for r in ts_read.read_array(src, name, keys=(idk,), id_key=idk).rows]

    books = [(f, n, i) for f, n, i in ARRAYS] + [(f, n, None) for f, n in MAPS]
    no_gap = []
    for fname, name, idk in books:
        src = src_of.get(fname, "")
        base = _keys(src, fname, name, idk)
        with_gap = _inject_gap(src, name)
        if with_gap == src:
            no_gap.append((fname, name))
        check(f"{fname}/{name} に注釈を挟んでも、同じ鍵が同じ順で出る",
              _keys(with_gap, fname, name, idk), base)
        if idk is not None:
            got = ts_read.read_array(with_gap, name, keys=(idk,), id_key=idk)
            check(f"{fname}/{name} に注釈を挟んでも読み落とし0", got.missed, 0)

        # **昔の読み方なら落ちる（または余分に数える）、を見る。**
        # そうでないなら、この対照は「壊れないところ」を触っているだけ
        leg = LEGACY.get((fname, name))
        if leg is None:
            continue
        rx, kind = leg
        before = len(rx.findall(src))
        check(f"{fname}/{name} は昔の読み方でも、いまは読めている（対照の土台）",
              before > 0, True)
        if kind == "gap":
            after = len(rx.findall(with_gap))
            print(f"  {fname}/{name}: 昔の読み方 {before}件 → 注釈を挟むと {after}件")
            check(f"{fname}/{name} は、注釈を挟むと昔の読み方で落ちる", after < before, True)
        else:
            snippet = NEST.get((fname, name))
            if snippet is None:
                continue
            nested = _inject_nest(src, name, snippet)
            after = len(rx.findall(nested))
            print(f"  {fname}/{name}: 昔の読み方 {before}件 → 入れ子を足すと {after}件")
            check(f"{fname}/{name} は、入れ子を足すと昔の読み方が余分に数える",
                  after > before, True)
            check(f"{fname}/{name} は、入れ子を足しても ts_read は増えない",
                  _keys(nested, fname, name, idk), base)

    # **挟めなかった本は、名指しのものだけ。** 黙って増えたら、挟み方が壊れている
    check("注釈を挟めなかった本は、挟む場所の無いものだけ", set(no_gap), NO_GAP)

    # --- 3. 読み手が増えていないか -------------------------------------------
    counted, extra = census()
    for rel, n in sorted(counted.items()):
        want = ALLOW.get(rel)
        if want is None:
            continue
        check(f"{rel} の自前の読み方が {want[0]} 本のまま", n, want[0])
    check("表に無いところで、TS を字で読む正規表現が生えていない", sorted(extra), [])
    for rel in ALLOW:
        if rel not in counted:
            check(f"{rel} の自前の読み方が消えたら表からも外す", f"{rel} は 0 本", "表に在る")
    print(f"  自前の読み方: {sum(counted.values())}本 / 表に書いた {sum(v[0] for v in ALLOW.values())}本")

    # --- 出す ----------------------------------------------------------------
    print(f"対照 {len(ok) + len(ng)}件中 {len(ok)}件通った")
    for line in ng:
        print(f"::error::{line}")
    if not ok:
        print("::error::対照が0件です（site/content が読めていません）")
        return 1
    return 1 if ng else 0


# ---------------------------------------------------------------- 読み手の数え

# 「TS の欄を字で読んでいそうな正規表現」の見つけかた。**生の文字列だけ見る**
# （このリポジトリの TS 読みは全部 `r"…"` / `rf"…"` で書いてある）
_RAW = re.compile(
    r'''(?:rf|fr|r)(?P<q>"""|\'\'\'|"|\')(?P<body>(?:\\.|(?!(?P=q)).)*?)(?P=q)''', re.S
)
# 「鍵のうしろに値が続く」形。`slug: "` `"鍵": \{` `days: (\d+)` など
_FRAGS = (
    ': "', ':\\s*"', '":\\s', '": \\',
    ': \\{', ':\\s*\\{', ': \\[', ':\\s*\\[',
    ': (\\d', ':\\s*(\\d', ': ([0-9', ':\\s*([0-9', ': (?:"', ': \\d', ':\\s*\\d',
)

# **ここに在るものは、寄せずに残したもの。** 数と理由を書く。
# 数が変わったら赤になるので、**足すときは理由を書かざるを得ない。**
ALLOW: dict[str, tuple[int, str]] = {
    "ts_read.py": (1, "ここが唯一の読み手。`slug: \"` の数は、読み落としを数えるためのもの"),
    # --- 自分が書いた字を、1行だけ当てて書き直すところ（読み手ではない）---
    # どれも「動かしてよい行」を1種類に決めて、**他が1行でも動いたら書かずに落ちる**。
    # 落ちたことに気づけない形ではないので、構造で読み直す意味が無い
    "build_chapter_stats.py": (2, "`chapterStats.ts` の本数と住人の行だけを当てる（字面の手術）"),
    "build_site_stats.py": (4, "`siteStats.ts` の5行だけを当てる（字面の手術）"),
    "nordic_depart.py": (1, "`chapters.ts` の `to: \"\"` を1か所だけ埋める（読むほうは ts_read）"),
    # --- 構造ではなく「字の並び」を数えるところ ---
    "dead_stream_watch.py": (
        3,
        "焼き込みの**どんな形の中にでも**居る配信IDを拾う。構造を読む道具では"
        "見つからない（`[\"日付\", \"ID\"]` も `\"ID\": {…}` も）",
    ),
    "text_expires_watch.py": (
        1,
        "企画1つの中の日付を**深さを問わず**掃き寄せる。入れ子の `when:` も要るので、"
        "いちばん外側の欄だけ返す読み手に替えると日付が減る（`plans.ts` の "
        "`reached.when` が実際にそれ）",
    ),
    # --- 対照（仕込みを作る／別の読み方で突き合わせる）---
    # **本物と同じ読み方で仕込むと、その読み方が本物に当たっていなくても通る。**
    # ここは「わざと別の読み方」にしてある
    "ts_read_selftest.py": (2, "昔の読み方と、仕込みの在りか（対照）"),
    "stale_content_watch_selftest.py": (7, "鍵の行を1本落として赤い側を作る（仕込み）"),
    "shrink_guard_selftest.py": (4, "名簿と箱から人を抜いて縮んだ側を作る（仕込み）"),
    "bake_order_selftest.py": (5, "焼いた本から数を抜き出して、焼き直しの順を当てる（対照）"),
    "build_residents_selftest.py": (1, "焼いた1行の score を読み返す（対照）"),
    "dead_stream_watch_selftest.py": (4, "本物と別の読み方で配信IDを数える（対照）"),
    "viewable_streams_selftest.py": (2, "2つの焼き込みの数を突き合わせる（対照）"),
    # --- TS ではないもの ---
    "channel_alias_nightly_selftest.py": (1, "ワークフローの YAML を読む（TS ではない）"),
    "failed_reentry_nightly_selftest.py": (2, "ワークフローの YAML を読む（TS ではない）"),
}


def _code(src: str) -> str:
    """説明書き（`\"\"\"…\"\"\"`）と `#` の行を落とした字。"""
    src = re.sub(r'(?s)"""(?:\\.|[^\\])*?"""', '""', src)
    return "\n".join(re.sub(r'(?<!["\'])#.*$', "", ln) for ln in src.split("\n"))


def census() -> tuple[dict[str, int], list[str]]:
    """`python/` の中で、TS の欄を字で読んでいそうな正規表現を数える。

    Returns:
        `({相対パス: 本数}, 表に無かった相対パス)`
    """
    counted: dict[str, int] = {}
    for p in sorted(PY.rglob("*.py")):
        if p.name == "ts_readers_selftest.py":
            continue  # ここ（`_FRAGS` と `LEGACY` を持っている）は数えない
        code = _code(p.read_text(encoding="utf-8"))
        n = sum(
            1 for m in _RAW.finditer(code)
            if any(f in m.group("body") for f in _FRAGS)
        )
        if n:
            counted[str(p.relative_to(PY))] = n
    return counted, [k for k in counted if k not in ALLOW]


if __name__ == "__main__":
    sys.exit(main())
