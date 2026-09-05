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

1. 書き出した HTML から、ページごとに出てくる字を拾う
2. 走ってから出る字（島のおしゃべりなど）は HTML に無いので、元のソースからも拾って
   置き場所（app/nordic なら nordic）で振り分ける
3. 「どの区画で使われるか」が同じ字どうしをまとめ、**まとめると損する組を最後まで
   残す**ように貪欲に併合して、6束にする
4. 束ごと・太さごとに woff2 を焼き、unicode-range 付きの @font-face を書く

これで、たとえばトップは「かな・英数の束」と「島じゅうで使う漢字の束」だけを取り、
北欧の 800 字は取りにいかない。

## 落ちる字はどうするか

掲示板と付箋は視聴者さんがその場で書くので、ここでは集められない。
そのぶんは **next/font が置いていく Google の切り分け**に落ちる。
`app/css/tokens.css` の font-family を

    "Maru Island", var(--font-maru), ui-rounded, ...

の順にしてあるので、焼いた字は1本目で出て、無い字だけ2本目（Google の切り分け）を
その字が入っているぶんだけ取りにいく。

**つまり、ここでの数え方が外れても字は化けない。**外れたぶんだけ余分に1本落ちる。
振り分け（手順2）が雑でよいのも同じ理由で、間違えても値段が少し上がるだけで壊れない。

## 使い方

    pip install fonttools brotli
    cd site && npx next build            # 書き出した HTML から字を数えるので先に必要
    python3 tools/fonts/subset.py --export site/.next

焼いたものは `site/public/fonts/` と `site/app/css/fonts.css`（どちらも自動生成）。
文章を増やしたら回し直して、出てきた差分をコミットする。回し忘れても壊れない。
"""

from __future__ import annotations

import argparse
import collections
import itertools
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
CACHE = Path("/tmp/zenmaru-src")

# 太さは3つ。1本ずつ抜いて撮り比べた結果がこれ（app/layout.tsx に経緯）。
WEIGHTS = {"400": "Regular", "700": "Bold", "900": "Black"}
SRC_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/zenmarugothic/ZenMaruGothic-{}.ttf"
FAMILY = "Maru Island"

# 束の数。増やすと1面あたりは軽くなるが、焼くファイルと @font-face が増える。
# 4〜20 で試した。10 から先は主要8面の合計がほとんど動かないので、そこで止める。
BUCKETS = 10

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


def plan(fams: dict[str, set[str]]) -> list[tuple[set[str], set[str]]]:
    """
    「どのページで使われるか」が同じ字をまとめ、そこから貪欲に併合して BUCKETS 束にする。

    併合の値段は「その束を取りにいくページの数 × 束の大きさ」の増えぶんで測る。
    北欧の国のページにしか出ない 600 字を全面に配る束へ混ぜると、この値段が跳ね上がるので
    最後まで残る。逆に、どのページでも使う漢字は早いうちに1つへまとまる。
    """
    names = sorted(fams)
    sig: dict[frozenset, set[str]] = collections.defaultdict(set)
    for c in set().union(*fams.values()):
        sig[frozenset(f for f in names if c in fams[f])].add(c)
    size = lambda n: 3000 + 175 * n  # 実測 175B/字 + テーブルぶん
    # 全ページを同じ重さで数えると、料理20枚・国18枚のほうが多数決で勝ってしまい、
    # 入口のトップが重くなる。人が最初に踏む面を重く見る。
    W = {"index": 20}
    for f in ("nordic", "map", "kitchen", "streams", "next", "board", "friends", "about", "now"):
        W[f] = 5
    weight = lambda mask: sum(W.get(f, 1) for f in mask)

    buckets = [[set(m), set(cs)] for m, cs in sig.items()]
    # ページ1枚ごとに数えると組み合わせが数百通りになり、総当たりの併合が終わらない。
    # 字数の少ない組は、先に「重なりのいちばん多い大きな組」へ寄せてから総当たりに入る。
    buckets.sort(key=lambda b: -len(b[1]))
    print(f"  切り分けの種類 {len(buckets)}")
    if len(buckets) > 200:
        keep, rest = buckets[:200], buckets[200:]
        for mask, cs in rest:
            # ここも総当たりと同じ物差しで寄せる。重なりの多さで寄せると、
            # 北欧だけの大きな組にトップの数字が吸い込まれて全面が重くなる（実測 655→1076KB）
            near = min(
                keep,
                key=lambda g: weight(g[0] | mask) * (size(len(g[1])) + size(len(cs)))
                - weight(g[0]) * size(len(g[1])),
            )
            near[0] |= mask
            near[1] |= cs
        buckets = keep
    while len(buckets) > BUCKETS:
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
    buckets.sort(key=lambda b: -len(b[1]))
    return [(m, cs) for m, cs in buckets]


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


def bake(index: int, chars: set[str]) -> list[tuple[str, int]]:
    txt = CACHE / f"chars-{index}.txt"
    txt.write_text("".join(sorted(chars)), encoding="utf8")
    made = []
    for weight, style in WEIGHTS.items():
        dst = OUT_FONTS / f"maru-{weight}-{index}.woff2"
        subprocess.run(
            [
                sys.executable, "-m", "fontTools.subset", str(fetch(style)),
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
        made.append((weight, dst.stat().st_size))
    return made


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--export", default=str(SITE / ".next"), help="書き出した HTML の場所")
    args = ap.parse_args()

    fams: dict[str, set[str]] = collections.defaultdict(set)
    exp = Path(args.export)
    if not exp.is_absolute():
        exp = ROOT / exp
    if exp.exists():
        for k, v in from_export(exp).items():
            fams[k] |= v
    else:
        print(f"※ 書き出しが無いのでソースだけで数える: {exp}")
    pages = sorted(fams) or ["index"]
    for k, v in from_source(pages).items():
        fams[k] |= v

    # 下敷きは全区画に。北欧の綴りは使う区画だけに。
    core = ranges(CORE_RANGES) | set(CORE_EXTRA)
    for f in fams:
        fams[f] |= core
    for f in list(fams):
        if any(f == x or f.startswith(x + "/") for x in LATIN_FAMS):
            fams[f] |= ranges(LATIN_EXT)
    # 数え物に使えない字は落とす
    for f in list(fams):
        fams[f] = {c for c in fams[f] if c.isprintable() and ord(c) > 0x1F}

    print(f"集まった字 {len(set().union(*fams.values()))} / 区画 {len(fams)}")
    buckets = plan(fams)

    OUT_FONTS.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    for old in OUT_FONTS.glob("maru-*.woff2"):
        old.unlink()

    faces, report, total = [], [], 0
    baked = []
    for i, (mask, chars) in enumerate(buckets):
        made = bake(i, chars)
        baked.append((mask, chars, sum(s for _, s in made)))
        total += sum(s for _, s in made)
        kb = sum(s for _, s in made) // 1024
        print(f"  束{i}  {len(chars):5}字  3本で {kb:4}KB  <- {', '.join(sorted(mask))}")
        report.append(f"束{i}\t{len(chars)}字\t{kb}KB\t{','.join(sorted(mask))}")
        ur = unicode_range(chars)
        for weight, _ in made:
            faces.append(
                f'@font-face {{\n'
                f'  font-family: "{FAMILY}";\n'
                f'  font-style: normal;\n'
                f'  font-weight: {weight};\n'
                f'  font-display: swap;\n'
                f'  src: url("/fonts/maru-{weight}-{i}.woff2") format("woff2");\n'
                f'  unicode-range: {ur};\n'
                f'}}'
            )

    OUT_CSS.write_text(
        "/*\n"
        " * 島で使う字だけを焼いた丸ゴシック。**自動生成。手で直さない。**\n"
        " *   python3 tools/fonts/subset.py --export site/.next\n"
        " *\n"
        " * 束の切り分けは「どのページで使われるか」で決めている（tools/fonts/buckets.txt）。\n"
        " * ここに無い字（掲示板や付箋に視聴者さんが書いた字）は、tokens.css の\n"
        " * font-family の2本目 var(--font-maru) — next/font が置いていく Google の\n"
        " * 切り分け — に落ちる。その字が入っている1本だけを取りにいく。\n"
        " */\n" + "\n".join(faces) + "\n",
        encoding="utf8",
    )
    REPORT.write_text("\n".join(report) + "\n", encoding="utf8")
    print("■ 面ごとに落ちる書体（焼いた実寸。ここに無い字は Google の切り分けに落ちる）")
    main = ["index", "nordic", "map", "kitchen", "streams", "next", "board", "friends", "nordic/sweden"]
    for f in main + [x for x in sorted(fams) if x not in main]:
        if f not in fams:
            continue
        n = sum(sz for mask, chars, sz in baked if fams[f] & chars)
        print(f"  {f:16} {n // 1024:5}KB")
    print(f"全部で {total // 1024}KB / {len(buckets) * 3} 本")
    print(f"書いた: {OUT_CSS.relative_to(ROOT)}, {REPORT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
