#!/usr/bin/env python3
"""
島で実際に出てくる字だけの丸ゴシックを焼く。

## なぜ

Zen Maru Gothic は Google Fonts が unicode-range で 120 本前後に切り分けて配っている。
切れ目は「島で何を書くか」ではなく Google の都合で決まっているので、
1本 75 字のうち島で使うのは 5 字、ということが普通に起きる。

実測（スマホ 390px・brotli 後）では **8面中6面でいちばん重いのが書体**だった。
トップは 890KB / 72本。ところがトップが画面に出している字は **317 字**しかない。
woff2 はもう縮んでいるので brotli でも減らない。太さを削る方向でも直らない
（400/700/900 は3つとも実ファイルとして効いている。app/layout.tsx に経緯）。

そこで、**島のページごとに要る字を数えて、島の都合で切り分け直す。**

## 切り分けかた

1. 書き出した面をブラウザで1枚ずつ開いて、**どの字をどの太さで描いているか**を数える
   （`tools/sprites/fontweigh.mjs` → `tools/fonts/weights.json`）
2. 画面に出ないまま残る字（押してから出る部品の文章）は、HTML と元のソースからも拾って
   足すが、**どの面の持ち物にもしない。** 太さごとに1つ「冷たい束」を焼いて、
   出たときにだけ取りに行かせる（main() の「冷たい束」）
3. **太さごとに**「どの区画で使われるか」が同じ字どうしをまとめ、**まとめると損する
   組を最後まで残す**ように貪欲に併合して、太さ1つにつき BUCKETS 束にする
4. 束ごとに woff2 を焼き、unicode-range 付きの @font-face を書く

これで、たとえばトップは「かな・英数の束」と「島じゅうで使う漢字の束」だけを取り、
北欧の 800 字は取りにいかない。

## 太さごとに切る（#692）

2026-10-13 まで、3つの太さは**同じ切り分けを共有していた。** ところが1枚の面が
どの太さで何字描いているかは、まるで違う。`/nordic/finland` の実測:

    400 で描いている字  37
    700 で描いている字  1,057
    900 で描いている字  409

同じ切り分けを共有すると、**37字しか描かない 400 が、700 の切り分け（島じゅうの
漢字）をそのまま背負う。** 実測でこの面は書体だけで 955.7KB / 24本、うち 400 が
214KB。37字のために 214KB 払っていた（#692）。

太さごとに数えて、太さごとに束を組めば、400 は「かな・英数＋その37字」で済む。
**見た目は1画素も変わらない**（同じ字を同じ太さで出している。束の切れ目が違うだけ）。

数えるのはブラウザ。`font-weight: 600` が実ファイルの 700 に落ちる、といった
**CSS の規則どおりの丸め**を手で書き写すと、外した日に字が端末の書体へ落ちる。
丸めの対照は `tools/sprites/fontbudget_selftest.mjs`。そこは**太さごとに切るのを
やめると落ちる**ようになっていて、戻したときに赤くなる。

## 落ちる字はどうするか

掲示板と付箋は視聴者さんがその場で書くので、ここでは集められない。
そのぶんは **端末が持っている丸ゴシック**に落ちる。
`app/css/tokens.css` の font-family を

    "Maru Island", ui-rounded, -apple-system, "Hiragino Maru Gothic ProN", ...

の順にしてあるので、焼いた字は1本目で出て、無い字だけ端末のものになる。
iPhone と Mac は2本目・4本目がどちらも丸ゴシックなので、丸いまま落ちる。

以前はここに **next/font が置いていく Google の切り分け**を挟んでいた。
同じ書体なので落ちても見た目が変わらない、という置き方だったが、
**挟むだけで @font-face が 367 本増えて、最初の Layout が
203ms → 1,543ms になっていた**（390×844・交互に4往復の中央値）。
Chrome は字を並べるたびに「その字はどの1本か」を 367 本ぜんぶに当てにいく。
1秒を払う受け皿は高すぎるので外した。経緯は `site/app/layout.tsx`。

**つまり、ここでの数え方が外れても字は化けない。**外れたぶんが端末の書体で出る。
振り分け（手順2）が雑でよいのも同じ理由で、間違えても壊れない。
ただし**漏れた字は丸ゴシックでなくなる端末がある**（Android）ので、
文章を増やしたら回し直す価値は前より上がっている。

## 使い方

    pip install fonttools brotli
    tools/build.sh 3250                                     # 面を書き出す
    python3 -m http.server 4250 --directory site/.next-3250 &
    DIST=site/.next-3250 SPORT=4250 node tools/sprites/fontweigh.mjs   # 太さごとに数える
    python3 tools/fonts/subset.py --export site/.next-3250

焼いたものは `site/public/fonts/` と `site/app/css/fonts.css`（どちらも自動生成）。
文章を増やしたら回し直して、出てきた差分をコミットする。回し忘れても壊れない
（足した字が端末の書体で出るだけ）。**太らせたまま気づかない**ほうは
`tools/sprites/fontbudget_selftest.mjs` が見張っている。
"""

from __future__ import annotations

import argparse
import collections
import itertools
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "site"
OUT_FONTS = SITE / "public" / "fonts"
OUT_CSS = SITE / "app" / "css" / "fonts.css"
REPORT = Path(__file__).resolve().parent / "buckets.txt"
# 面ごと・太さごとに「画面に出る字」。`tools/sprites/fontweigh.mjs` が書く
SEEN = Path(__file__).resolve().parent / "weights.json"
CACHE = Path("/tmp/zenmaru-src")

# 太さは3つ。1本ずつ抜いて撮り比べた結果がこれ（app/layout.tsx に経緯）。
WEIGHTS = {"400": "Regular", "700": "Bold", "900": "Black"}
SRC_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/zenmarugothic/ZenMaruGothic-{}.ttf"
FAMILY = "Maru Island"

# **太さ1つあたりの**束の数。増やすと1面あたりは軽くなるが、焼くファイルと
# @font-face が増える。3太さ共通で切っていた頃に 4〜20 で試して 10 で止めた。
#
# 太さごとに切るようになってから、**焼いて実寸で**測り直した（141面。同じ
# `weights.json` に対して、焼いたファイルの実際の大きさで数えた。道具は
# `tools/sprites/fontbudget_selftest.mjs` と同じ式）:
#
#   束/太さ  ファイル  中央      いちばん重い面  141面の合計  /nordic/finland
#      6       18本   440.7KB      788.5KB       60.88MB      666.6KB
#      8       24本   391.2KB      805.2KB       56.85MB      664.6KB
#     10       30本   361.3KB      817.2KB       53.07MB      670.4KB
#   > 12       36本   345.8KB      832.3KB       49.39MB      680.5KB  ← これ
#     14       42本   324.1KB      842.4KB       47.51MB      689.2KB
#     16       48本   305.7KB      850.7KB       45.83MB      695.6KB
#     18       54本   293.3KB      858.3KB       44.48MB      698.1KB
#
# **増やすほど中央と合計は下がり、いちばん重い面は上がる**（束ごとの表のぶんを
# 全部取りに行く面があるので）。12 にした理由は3つ:
#
#   1. 12 までは合計の下がりが大きい（60.9 → 49.4MB）。そこから先は緩い
#      （18 まで行っても 44.5MB。ファイルは 36 → 54本に増える）
#   2. **`@font-face` を増やしたときに最初の Layout が伸びるぶんを測っていない。**
#      手元にある実測は「367本で 203ms → 1,543ms」の1点だけ（`site/app/layout.tsx`）。
#      測っていないものを賭けないので、いままで（30本）に近いところで止める
#   3. #692 の面（`/nordic/finland`）は束の数でほとんど動かない（664〜698KB）。
#      **あの面のために増やす意味が無い**
#
# 2 を測ったら、16 まで上げて合計をもう 3.5MB 落とせる。
#
# `COLD_CHUNK` で冷たい束を割ると、焼けるファイルはこれより増える
# （**どの面も先には取りに行かない**ぶん）。いまは割っていない。
BUCKETS = 12

# 冷たい束（どの面も先に取りに行かない束）を、何字ずつに割るか。**0 なら割らない。**
#
# 「1本にまとめると、1字当たっただけで全部払う」（400 の冷たい束は 1,045字 /
# 201KB）ので、200字ずつに割って測った。**割る / 割らないを、同じ書き出しに
# 対して焼き比べた実測**（2026-10-13。141面のうち動いた面）:
#
#   面                   割らない    割る(200字)
#   /nordic/photos        341.6KB   →  220.6KB   当たりが1〜2字の面は**安くなる**
#   /streams/monthly      390.1KB   →  221.0KB
#   /island/caucasus      802.5KB   →  774.7KB
#   /island/europe        475.7KB   →  **720.1KB**  **全部の塊を引く面は高くなる**
#   /island/iran-walk     684.7KB   →  698.9KB
#
# **冷たい束を広く引く面では、割ると表のぶんだけ損をする。** 島の章の面
# （`/island/*`）がそれで、**DOM から数えられない 400 の字**を持っている
# （#692 のコメント参照。別の仕事として切り出し）。原因が分かるまでは、
# 当たる面が「1〜2字」なのか「ほぼ全部」なのかを決められないので、
# **割らないほうに倒してある。** 原因が分かって、当たりが数字だと分かったら 200 にする。
COLD_CHUNK = 0

# ── 行の高さのためだけに引かれる1本（strut） ─────────────────────────
#
# ブラウザは、**字を1つも描かない段でも**行の高さを決めるためにその段の書体を
# 要る。Chrome はその代表として **U+0020（空白）**を引く。つまり
#
#   「太さ 400 の段があって、そこに 400 で描く字が1つも無い」面でも、
#   U+0020 を持つ 400 の束が必ず1本引かれる。**止められない。**
#
# `/island/iran-walk` の実測（2026-10-15。絵を出した状態・141面の書き出し）が
# それで、`weights.json` 上は「400 で描く字 0」なのに `maru-400-0` を
# **26.6KB** 引いていた。引き金の字は**1字ずつ別の URL に割って**確かめて
# **U+0020 だけ**（#848）。
#
# 止められないので、**安くする。** この字だけの束を太さごとに1本焼いて、
# ほかの束からは抜く。引かれる1本が 26.6KB から 0.8KB に落ちる。
# 見た目は変わらない（同じ書体の同じ字を、別のファイルから出すだけ）。
#
# **U+2026（…）も入れる。** `text-overflow: ellipsis` の「…」も DOM に無く、
# ブラウザが**その段の代表の書体**で足す。代表がこの束になるので、ここに
# 「…」が無いと**切り詰めの三点だけ端末の書体**になる。
#
# ここを空にすると元に戻る。戻したことは
# `tools/sprites/fontstrut_selftest.mjs` が赤くする。
STRUT = {" ", "…"}

# **空白だけで焼くと、ブラウザがその woff2 を蹴る。**
#
# `.notdef` と `space` しか無い font は、どちらも輪郭を持たない＝ `glyf` が空で、
# Chrome の検査（OTS）が通さない。実測（2026-10-15）:
#
#   空白1字で焼いた maru-400-12（612B） … `document.fonts` が **status=error**。
#     `document.fonts.check("16px …", " ")` も false。空白は端末の書体に落ちて、
#     送り幅が **4.4844px → 4.4531px**（16px のとき）に変わる。わずかだが、
#     **行の折れ方が変わる**（`/kitchen/karaage` の背が 2px 縮んだ）
#   空白＋「0」で焼いたもの（692B） … status=loaded、送り幅は 4.4844px で**元と同じ**
#
# なので**焼くときだけ**詰め物を1字入れる。`unicode-range` は `STRUT` から作るので、
# ブラウザがこの束から取るのは空白と「…」だけ——詰め物は誰にも使われない（80B の重し）。
# 詰め物を抜くと、**見た目が変わったまま赤くならない。**
STRUT_FILL = {"0"}

# データの置き場所が1枚のページに対応するもの。読み込む側（[slug] のページ）からは
# 「7か国ぶん全部」に見えてしまうので、ここだけは置き場所で1枚に結びつける。
PER_PAGE = {"site/content/nordic": "nordic", "site/content/atlas/c": "map"}

SOURCE_EXTS = (".ts", ".tsx", ".json")
CSS_DIR = "site/app/css"
# 書き出した HTML のほかに、ソースから字を足す置き場所。
#
# **部品は足す。データは足さない。**
#   部品 … 掲示板や住人の壁のように、開いてから組み立てる画面の文字。HTML に無い。
#          全部で数百字しかないので、持っても安い（実測 /board の落ち 461→40KB）
#   データ … 今日は何の日（365件）、おしゃべり、7か国の紹介文。**1回に1件しか出ない**
#          のに字だけ全件ぶんあるので、持つと全ページが太る（実測 主要8面 2641→4043KB）。
#          出なかった字は Google の切り分けに落ちる。落ちたぶんも数えたうえで、
#          足さないほうが半分近く安い
EXTRA_DIRS = ["site/components"]

# どの区画にも属さない字の下敷き。
# 日付・人数・単位は画面が出てから組み立てるので、元の文章には並びとして出てこない。
# かなと英数は数百字で1本 16KB ほどにしかならないので、全部持って全面に配る。
CORE_RANGES = [
    (0x0020, 0x007E),  # 英数と記号
    (0x2010, 0x201F),  # ダッシュと引用符
    (0x3000, 0x303F),  # 、。「」【】〜 など
    (0x3041, 0x309F),  # ひらがな
    (0x30A0, 0x30FF),  # カタカナ
]
CORE_EXTRA = "○●△▲□■◇◆☆★♪♡←↑→↓⇒※℃±×÷…‥"
# 北欧の地名で要る字。全面に配ると無駄なので、区画を絞って束に混ぜる。
LATIN_EXT = [(0x00A0, 0x00FF), (0x0100, 0x017F)]
LATIN_FAMS = ["nordic", "map", "index", "about"]

RE_LINE_COMMENT = re.compile(r"(?<!:)//[^\n]*")
RE_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
RE_TAG = re.compile(r"<script.*?</script>|<style.*?</style>|<[^>]+>", re.S)
RE_ENTITY = re.compile(r"&#x([0-9a-fA-F]+);|&#(\d+);")


def ranges(pairs) -> set[str]:
    out: set[str] = set()
    for lo, hi in pairs:
        out |= {chr(c) for c in range(lo, hi + 1)}
    return out


def from_export(exp: Path) -> dict[str, set[str]]:
    """書き出した HTML から、ページごとに画面に出る字を拾う。"""
    fam: dict[str, set[str]] = collections.defaultdict(set)
    n = 0
    for p in sorted(exp.rglob("*.html")):
        # ページ1枚ごとに数える。/nordic と /nordic/sweden をまとめると、
        # 短い一覧のほうが長い国のページぶんまで背負ってしまう（実測 849→1086KB）。
        key = str(p.relative_to(exp))[: -len(".html")]
        body = RE_TAG.sub(" ", p.read_text(encoding="utf8", errors="ignore"))
        body = RE_ENTITY.sub(
            lambda m: chr(int(m.group(1), 16)) if m.group(1) else chr(int(m.group(2))), body
        )
        fam[key] |= {c for c in body if c.isprintable()}
        n += 1
    print(f"書き出し {n} 面")
    return fam


# 焼く前に値段を見積もるための目安。かなと英数は 47B/字、漢字は 175B/字（実測）。
def guess(chars: set[str]) -> int:
    kana = sum(1 for c in chars if ord(c) < 0x3100 or 0xFF01 <= ord(c) <= 0xFF5E)
    return 2500 + 47 * kana + 175 * (len(chars) - kana)


RE_IMPORT = re.compile(r"""(?:from|import)\s+["']([^"']+)["']""")


def resolve(spec: str, here: Path) -> Path | None:
    """import の行き先を実ファイルにする。@/ は site/ の下。"""
    if spec.startswith("@/"):
        base = SITE / spec[2:]
    elif spec.startswith("."):
        base = (here.parent / spec).resolve()
    else:
        return None  # node_modules は島の文章を持っていない
    for cand in (base, *(base.with_suffix(e) for e in SOURCE_EXTS), *(base / f"index{e}" for e in SOURCE_EXTS)):
        if cand.is_file() and cand.suffix in SOURCE_EXTS:
            return cand
    return None


def text_of(p: Path) -> set[str]:
    """そのファイルが持っている字。コメントは落とす。

    コメントを落としそこねても、拾いすぎても字は化けない（上の「落ちる字はどうするか」）。
    実測では IslandStage.tsx の漢字 354 字が 17 字まで落ちる。
    """
    t = p.read_text(encoding="utf8", errors="ignore")
    if p.suffix != ".json":
        t = RE_BLOCK_COMMENT.sub(" ", t)
        t = RE_LINE_COMMENT.sub(" ", t)
    return {c for c in t if c.isprintable() and ord(c) > 0x1F}


def reachable(entry: Path, cache: dict[Path, set[Path]]) -> set[Path]:
    """entry から import でたどり着く .ts/.tsx/.json を全部集める。"""
    if entry in cache:
        return cache[entry]
    cache[entry] = seen = {entry}
    stack = [entry]
    while stack:
        cur = stack.pop()
        for spec in RE_IMPORT.findall(cur.read_text(encoding="utf8", errors="ignore")):
            got = resolve(spec, cur)
            if got and got not in seen:
                seen.add(got)
                stack.append(got)
    return seen


def route_of(page_tsx: Path) -> str:
    """app/nordic/page.tsx -> nordic、app/page.tsx -> index、[slug] は * にする。"""
    rel = page_tsx.parent.relative_to(SITE / "app").as_posix()
    if rel == ".":
        return "index"
    return "/".join("*" if s.startswith("[") else s for s in rel.split("/"))


def from_source(pages: list[str]) -> dict[str, set[str]]:
    """
    ページごとに、そのページが読み込んでいるファイルの字を集める。

    **どのページに何が出るかは、読み込みの流れがいちばん正しい。**
    手で「この部品はこのページ」と書いた表は、部品が使い回されたとたんに嘘になる
    （実測: 掲示板の部品を島のものと数えていて、/board が 386KB ぶん落ちる字を持てずにいた）。
    """
    cache: dict[Path, set[Path]] = {}
    fams: dict[str, set[str]] = collections.defaultdict(set)
    # layout.tsx はその下のページ全部に効く
    layouts = sorted((SITE / "app").rglob("layout.tsx"))
    for page in sorted((SITE / "app").rglob("page.tsx")):
        route = route_of(page)
        hit = [p for p in pages if p == route or ("*" in route and _match(route, p))]
        if not hit:
            hit = [route.replace("/*", "")]
        files = reachable(page, cache)
        for lay in layouts:
            if page.is_relative_to(lay.parent):
                files |= reachable(lay, cache)
        for f in files:
            rel = f.relative_to(ROOT).as_posix()
            if not any(rel.startswith(d + "/") for d in EXTRA_DIRS):
                continue
            # 国ごとのデータは、それを出す1枚だけのもの
            per = next((f"{r}/{f.stem}" for d, r in PER_PAGE.items() if rel.startswith(d + "/")), None)
            here = [p for p in hit if per is None or p == per] if per is None else [p for p in pages if p == per]
            for p in here or hit:
                fams[p] |= text_of(f)
    # CSS の content: "…" も画面に出る。どのページに出るか分からないので全面に配る。
    for css in sorted((ROOT / CSS_DIR).glob("*.css")):
        for p in pages:
            fams[p] |= {c for c in RE_BLOCK_COMMENT.sub(" ", css.read_text(encoding="utf8")) if c.isprintable() and ord(c) > 0x1F}
    print(f"読み込みの流れから {len(fams)} 枚ぶん")
    return fams


def _match(route: str, page: str) -> bool:
    r = route.split("/")
    q = page.split("/")
    return len(r) == len(q) and all(a == "*" or a == b for a, b in zip(r, q))


def plan(
    fams: dict[str, set[str]],
    n_buckets: int = BUCKETS,
    cold: set[str] | None = None,
) -> list[tuple[set[str], set[str]]]:
    """
    「どのページで使われるか」が同じ字をまとめ、そこから貪欲に併合して n_buckets 束にする。

    併合の値段は「その束を取りにいくページの数 × 束の大きさ」の増えぶんで測る。
    北欧の国のページにしか出ない 600 字を全面に配る束へ混ぜると、この値段が跳ね上がるので
    最後まで残る。逆に、どのページでも使う漢字は早いうちに1つへまとまる。

    `cold` は**どの面も最初は取りに行かない字**（下の「冷たい束」）。1束にまとめて
    最後に足す。誰の mask にも入らないので、出たときだけ取りに行く。

    面の組はビットで持つ。文字列の集合で持っていると、併合の値踏み（毎回 C(k,2) 通り）
    で集合の和を取り直すのに時間がかかって、太さ3本ぶん回すと十数分かかる。

    ## **この貪欲法は、入力が1字変わると答えが大きく動く**（2026-10-13 の実測）

    同じ書き出しに対しては1バイトも違わない（上の「並べてから回す」）。
    ところが**書き出しを取り直すと、入っている字が1字変わるだけで**併合の順番が
    変わり、束の中身がまるごと入れ替わる。実測で、画面に出す字が1字も変わって
    いないのに面ごとの払う量がこれだけ動いた:

        /island/caucasus    475.1KB → 802.5KB
        /island/middle-east 455.0KB → 564.2KB
        /island/iran-walk   665.1KB → 684.7KB

    書き出しに日付が焼き込まれている（`output: "export"`）ので、**ビルドし直すと
    字が変わりうる**。つまり「焼き直したら別の面が太る」が普通に起きる。

    **焼き直したら、出す前に `tools/sprites/fontbudget_selftest.mjs` を見ること。**
    合計と、いちばん重い面を数えてある。ここが赤くなければ、入れ替わっても害は無い。
    """
    names = sorted(fams)
    bit = {f: 1 << i for i, f in enumerate(names)}
    sig: dict[int, set[str]] = collections.defaultdict(set)
    # **集合のまま回さない。** Python の set は字の並びが走るたびに変わる
    # （文字列のハッシュに種がある）ので、同じ入力で焼いても束の中身が入れ替わって、
    # **毎回 woff2 の差分が出る。** 並べてから回す
    for c in sorted(set().union(*fams.values())):
        m = 0
        for f in names:
            if c in fams[f]:
                m |= bit[f]
        sig[m].add(c)
    size = lambda n: 3000 + 175 * n  # 実測 175B/字 + テーブルぶん
    # 全ページを同じ重さで数えると、料理20枚・国18枚のほうが多数決で勝ってしまい、
    # 入口のトップが重くなる。人が最初に踏む面を重く見る。
    W = {"index": 20}
    for f in ("nordic", "map", "kitchen", "streams", "next", "board", "friends", "about", "now"):
        W[f] = 5
    wt = [W.get(f, 1) for f in names]
    seen_w: dict[int, int] = {0: 0}

    def weight(m: int) -> int:
        v = seen_w.get(m)
        if v is None:
            v = 0
            mm = m
            while mm:
                low = mm & -mm
                v += wt[low.bit_length() - 1]
                mm ^= low
            seen_w[m] = v
        return v

    room = n_buckets - (1 if cold else 0)
    buckets = [[m, cs] for m, cs in sorted(sig.items())]
    # ページ1枚ごとに数えると組み合わせが数百通りになり、総当たりの併合が終わらない。
    # 字数の少ない組は、先に「重なりのいちばん多い大きな組」へ寄せてから総当たりに入る。
    # 並べ替えの鍵に mask も入れる。字数が同じ組の前後が走るたびに変わると、
    # そこから先の併合が全部ずれる
    buckets.sort(key=lambda b: (-len(b[1]), b[0]))
    print(f"  切り分けの種類 {len(buckets)}")
    if len(buckets) > 200:
        keep, rest = buckets[:200], buckets[200:]
        for mask, cs in rest:
            # ここも総当たりと同じ物差しで寄せる。重なりの多さで寄せると、
            # 北欧だけの大きな組にトップの数字が吸い込まれて全面が重くなる（実測 655→1076KB）
            near = min(
                keep,
                key=lambda g: (
                    weight(g[0] | mask) * (size(len(g[1])) + size(len(cs)))
                    - weight(g[0]) * size(len(g[1])),
                    g[0],  # 同点のときの前後も決めておく（走るたびに変わらないように）
                ),
            )
            near[0] |= mask
            near[1] |= cs
        buckets = keep
    while len(buckets) > room:
        best = None
        for i, j in itertools.combinations(range(len(buckets)), 2):
            mi, ci = buckets[i]
            mj, cj = buckets[j]
            before = weight(mi) * size(len(ci)) + weight(mj) * size(len(cj))
            after = weight(mi | mj) * (size(len(ci)) + size(len(cj)))
            if best is None or after - before < best[0]:
                best = (after - before, i, j)
        _, i, j = best
        buckets[i][0] |= buckets[j][0]
        buckets[i][1] |= buckets[j][1]
        buckets.pop(j)
    buckets.sort(key=lambda b: (-len(b[1]), b[0]))
    out = [({names[k] for k in range(len(names)) if m >> k & 1}, cs) for m, cs in buckets]
    if cold:
        # 冷たい束は `COLD_CHUNK` 字ずつに割る（0 なら1本のまま。上の表）。
        # 並べてから切るので、焼き直しても同じところで切れる。
        rest = sorted(cold, key=ord)
        step = COLD_CHUNK or len(rest)
        for i in range(0, len(rest), step):
            out.append((set(), set(rest[i : i + step])))
    # 行の高さのための1本を、いちばん後ろに切り出す（上の `STRUT`）。
    # **併合が終わってから抜く。** 先に抜くと貪欲法の入力が1字変わって、
    # 束の中身がまるごと入れ替わる（この関数の見出しの実測）。
    if STRUT:
        for mask, cs in out:
            cs -= STRUT
        # 空になった束は焼かない（fontTools が落ちる）
        out = [(mask, cs) for mask, cs in out if cs]
        out.append((set(fams), set(STRUT)))
    return out


def unicode_range(chars: set[str]) -> str:
    cps = sorted(ord(c) for c in chars)
    out, i = [], 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
            j += 1
        out.append(f"U+{cps[i]:X}" if i == j else f"U+{cps[i]:X}-{cps[j]:X}")
        i = j + 1
    return ",".join(out)


def fetch(style: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    dst = CACHE / f"ZenMaruGothic-{style}.ttf"
    if not dst.exists():
        print(f"落とす: {dst.name}")
        urllib.request.urlretrieve(SRC_URL.format(style), dst)
    return dst


def bake(weight: str, index: int, chars: set[str]) -> int:
    """束1つ・太さ1つを焼いて、焼けた大きさを返す。"""
    txt = CACHE / f"chars-{weight}-{index}.txt"
    txt.write_text("".join(sorted(chars)), encoding="utf8")
    dst = OUT_FONTS / f"maru-{weight}-{index}.woff2"
    subprocess.run(
        [
            sys.executable, "-m", "fontTools.subset", str(fetch(WEIGHTS[weight])),
            f"--text-file={txt}",
            "--flavor=woff2",
            f"--output-file={dst}",
            # ヒントは Windows の小さい字を整えるためのもので、CJK ではファイルの
            # 1〜2割を食う。丸ゴシックは線が太いので落としても崩れない。
            "--no-hinting",
            "--desubroutinize",
            # 縦書きはしないので縦組み用の字形も要らない
            "--layout-features-=vert,vrt2,vkna",
        ],
        check=True,
    )
    return dst.stat().st_size


def seen_by_weight(path: Path) -> dict[str, dict[str, set[str]]]:
    """`weights.json` を読む。{太さ: {面: 字}}。"""
    raw = json.loads(path.read_text(encoding="utf8"))
    out: dict[str, dict[str, set[str]]] = {w: {} for w in WEIGHTS}
    for page, rec in raw.items():
        for w in WEIGHTS:
            out[w][page] = set(rec.get(w, ""))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--export", default=str(SITE / ".next"), help="書き出した HTML の場所")
    ap.add_argument("--weights", default=str(SEEN), help="太さごとの字（fontweigh.mjs が書く）")
    ap.add_argument("--buckets", type=int, default=BUCKETS, help="太さ1つあたりの束の数")
    ap.add_argument("--dry", action="store_true",
                    help="焼かずに見積もりだけ出す（束の数を決めるとき。実寸ではなく guess()）")
    args = ap.parse_args()

    seen_path = Path(args.weights)
    if not seen_path.is_absolute():
        seen_path = ROOT / seen_path
    if not seen_path.exists():
        # **黙って古い切り方に落ちない。** 落ちると「焼き直したのに太ったまま」に
        # なって、理由が誰にも分からない
        print(
            f"✕ {seen_path} が無い。太さごとの字が分からないので焼かない。\n"
            "  tools/build.sh 3250\n"
            "  python3 -m http.server 4250 --directory site/.next-3250 &\n"
            "  DIST=site/.next-3250 SPORT=4250 node tools/sprites/fontweigh.mjs",
            file=sys.stderr,
        )
        sys.exit(2)

    per = seen_by_weight(seen_path)
    # 画面に出る字そのもの（下敷きを足す前）。見積もりのときに使う。
    # ブラウザは**実際に描く字**でしか取りに行かないので、400 を1字も描かない面は
    # 400 の束を1本も取らない（141面のうち93面がそれ）
    shown = {w: {p: set(cs) for p, cs in per[w].items()} for w in WEIGHTS}
    pages = sorted(per["400"])
    print(f"数えた面 {len(pages)} 枚")

    # ── 冷たい束（押してから出る字） ──────────────────────────────
    #
    # 部品の中には、開いた直後の画面に出ないまま残る文章がある（押して開く札・
    # 差し替わる見出し）。ブラウザでは拾えないので、元のソースと HTML から足す。
    #
    # **ただし「その面が最初に取りに行く字」には入れない。** `unicode-range` は
    # 後出しが効く——あとからその字が画面に出れば、ブラウザはそのとき取りに行く
    # （`font-display: swap` なので、その一瞬だけ端末の書体）。先に全部持たせると、
    # 押されなかったぶんまで毎回払うことになる。3太さに配ると 1,500KB 太った。
    #
    # なので「焼いてはあるが、どの面の mask にも入っていない束」を太さごとに1つ置く。
    # 誰も先には取りに行かず、その字が出た面だけが取りに行く。
    rest: dict[str, set[str]] = collections.defaultdict(set)
    exp = Path(args.export)
    if not exp.is_absolute():
        exp = ROOT / exp
    if exp.exists():
        for k, v in from_export(exp).items():
            rest[k] |= v
    for k, v in from_source(pages).items():
        rest[k] |= v
    everything = set().union(*rest.values()) if rest else set()
    everything = {c for c in everything if c.isprintable() and ord(c) > 0x1F}

    # 下敷きは全区画に。北欧の綴りは使う区画だけに。
    core = ranges(CORE_RANGES) | set(CORE_EXTRA)
    latin = ranges(LATIN_EXT)
    for w in WEIGHTS:
        for f in per[w]:
            per[w][f] |= core
            if any(f == x or f.startswith(x + "/") for x in LATIN_FAMS):
                per[w][f] |= latin
            per[w][f] = {c for c in per[w][f] if c.isprintable() and ord(c) > 0x1F}
    cold = {w: everything - set().union(*per[w].values()) for w in WEIGHTS}
    print(f"  冷たい束に回した字 400:{len(cold['400'])} 700:{len(cold['700'])} 900:{len(cold['900'])}")

    OUT_FONTS.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    if not args.dry:
        for old in OUT_FONTS.glob("maru-*.woff2"):
            old.unlink()

    faces, report, total = [], [], 0
    # 面ごとの合計を出すための控え。{太さ: [(使う面, 字, 大きさ)]}
    baked: dict[str, list[tuple[set[str], set[str], int]]] = {}
    for w in WEIGHTS:
        print(f"● 太さ {w}（{len(set().union(*per[w].values()))} 字）")
        buckets = plan(per[w], args.buckets, cold[w])
        baked[w] = []
        for i, (mask, chars) in enumerate(buckets):
            # 行の高さのための束だけ、**焼くときに**詰め物を足す（上の `STRUT_FILL`）。
            # `unicode-range` は下で `chars` から作るので、詰め物は表に出ない
            baking = chars | STRUT_FILL if STRUT and chars == STRUT else chars
            size = guess(baking) if args.dry else bake(w, i, baking)
            baked[w].append((mask, chars, size))
            total += size
            print(f"  束{i}  {len(chars):5}字  {size // 1024:4}KB  <- {len(mask)}面"
                  + ("（冷たい束。出たときだけ取りに行く）" if not mask else ""))
            report.append(f"{w}\t束{i}\t{len(chars)}字\t{size // 1024}KB\t{','.join(sorted(mask))}")
            faces.append(
                f'@font-face {{\n'
                f'  font-family: "{FAMILY}";\n'
                f'  font-style: normal;\n'
                f'  font-weight: {w};\n'
                f'  font-display: swap;\n'
                f'  src: url("/fonts/maru-{w}-{i}.woff2") format("woff2");\n'
                f'  unicode-range: {unicode_range(chars)};\n'
                f'}}'
            )

    if args.dry:
        cost = {
            f: sum(sz for w in WEIGHTS for mask, chars, sz in baked[w]
                   if shown[w].get(f) and (shown[w][f] | core) & chars)
            for f in pages
        }
        v = sorted(cost.values())
        top = sorted(cost, key=cost.get, reverse=True)[:3]
        print(f"[見積もり] 束{args.buckets}  中央 {v[len(v)//2]//1024}KB  "
              f"最大 {v[-1]//1024}KB  合計 {sum(v)//1024//1024}MB  焼く量 {total//1024}KB  "
              f"finland {cost['nordic/finland']//1024}KB  index {cost['index']//1024}KB  "
              f"board {cost['board']//1024}KB  重い順 {[(t, cost[t]//1024) for t in top]}")
        return
    OUT_CSS.write_text(
        "/*\n"
        " * 島で使う字だけを焼いた丸ゴシック。**自動生成。手で直さない。**\n"
        " *   DIST=site/.next-3250 SPORT=4250 node tools/sprites/fontweigh.mjs\n"
        " *   python3 tools/fonts/subset.py --export site/.next-3250\n"
        " *\n"
        " * 束の切り分けは**太さごとに**「どのページで使われるか」で決めている\n"
        " *（tools/fonts/buckets.txt）。400 で37字しか描かない面が、700 の\n"
        " * 切り分け（島じゅうの漢字）を背負っていたのを切り離してある（#692）。\n"
        " *\n"
        " * ここに無い字（掲示板や付箋に視聴者さんが書いた字）は、tokens.css の\n"
        " * font-family の次 — 端末の丸ゴシック（iPhone・Mac は Hiragino Maru\n"
        " * Gothic ProN）— に落ちる。Google の切り分けを2本目に置くのはやめた。\n"
        " * @font-face が 367 本増えて、最初の Layout が 203ms → 1,543ms になっていた。\n"
        " */\n" + "\n".join(faces) + "\n",
        encoding="utf8",
    )
    REPORT.write_text("\n".join(report) + "\n", encoding="utf8")
    print("■ 面ごとに落ちる書体（焼いた実寸。ここに無い字は端末の書体に落ちる）")
    big = ["index", "nordic", "map", "kitchen", "streams", "next", "board", "friends", "nordic/finland"]
    for f in big + [x for x in pages if x not in big]:
        if f not in per["400"]:
            continue
        n = sum(sz for w in WEIGHTS for mask, chars, sz in baked[w]
                if shown[w].get(f) and (shown[w][f] | core) & chars)
        print(f"  {f:16} {n // 1024:5}KB")
    print(f"全部で {total // 1024}KB / {sum(len(v) for v in baked.values())} 本"
          f"（うち冷たい束 {sum(1 for v in baked.values() for mask, _, _ in v if not mask)} 本。先には取りに行かれない）")
    print(f"書いた: {OUT_CSS.relative_to(ROOT)}, {REPORT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
