"""**`#NNN` の指し先が、本当にその節を指しているか**を見張る。切れていたら名指しで出す。

    python3 python/misses_link_selftest.py              # 本物を見る（対照つき）
    python3 python/misses_link_selftest.py --only-drill # 対照だけ回して帰る
    python3 python/misses_link_selftest.py --root DIR   # 別の木を見る（対照を作るとき）
    python3 python/misses_link_selftest.py --json       # 機械で読む形
    BREAK=link python3 python/misses_link_selftest.py   # 判定の足を1本抜く（対照用）

終了コード **0=ぜんぶ生きている / 1=切れている指し先がある / 2=数えられなかった**
（`docs/island-standards.md` §15）。

## なぜ要るか（2026-09-19。一日で4回ぶつかった番号の、外向きの側）

いきさつは `docs/island-misses.md` #173。ここは要点だけ。

`docs/island-misses.md` の節番号は、**コードとワークフローから名指しされている。**
`island-misses` の字と `#NNN` が同じ行に在る指しだけで **484か所**
（2026-09-19 実測。`docs/` の外が 375行）。

ところが**その指し先が生きているかを見るものが、1本も無かった。**

節番号は「足す直前に `git fetch` して最大の次」を人が採る運用で、
並行で枝を回すと**ぶつかる**（`docs/island-misses.md` #163。一日で4回）。ぶつかると節をずらすのだが、
**ずらすとコード側の指し先が古くなる。**

- 2026-09-19 に手で2か所（`site/app/css/streams.css`、`tools/sprites/fitmeasure.mjs`）
- 別の回には1つの枝で10か所
- **どれも人が目で見つけた。番号がずれたまま指しても、赤くならない**

指し先が無い番号を指すのは、**指していないより悪い。** 読んだ人が別の節に飛ぶ。

`docs/island-misses.md` #163 は**文書の中の番号**（重複・前後・飛び番）を見る。
こちらは**文書の外から文書へ向かう指し**を見る。ずれ方が違うので、片方では出ない。

## なぜ `misses_num_selftest.py` に足さず、別に立てたか

**分母が別だから。** あちらは1つのファイル（`docs/island-misses.md`）を見て、
対照もそのファイルの写しで作る。こちらは**リポジトリの木を全部歩く**
（追跡されている 1,484ファイル）ので、対照には**偽のリポジトリ**が要る。
1本にまとめると、文書1つを見るだけの見張りが `git init` を持つことになるし、
「対照が落ちた」ときにどちらの話か分からなくなる。

**節の見分けだけは共有する。** `split()` を `misses_num_selftest` から import して
いるので、見出しの書き方が変わった日に**両方が同時に動く。**
（`#78` までが `### #N`、`#79` からが `## #N` という切り替わりが在る。
ここを二重に書くと、片方だけ古くなる）

## 何を見て、何を見ないか（**先に測ってから決めた**）

**`#165` のような字は、島の外し方の番号とはかぎらない。** 実物が在る——
`python/admin/firestore_delete.py:73` の `#165` は**島の遠隔操作の issue 番号**で、
外し方の #165（歩いた国）とは無関係。2026-09-19 に別の担当がここを
「ずらし忘れ」と読んで直しかけた。

だから**見るのは、外し方だと言い切れる書きかただけ。**

    同じ行に `island-misses` の字が在り、その字より**後ろ**に在る `#NNN`。
    ただし **節の最大番号 +1 を超える数は見ない。**

3つとも、測ってから決めた（**この道具を足す前の master** で実測。2026-09-19）。

| 決め | 測った値 | なぜ |
| --- | --- | --- |
| 同じ行に `island-misses` | 484か所が該当 | 裸の `（#34）` は 外し方と issue が**同じ形**で、字面では分けられない |
| その字より後ろ | 前に在るものは **1か所** | `kdfit.mjs:51` の `#167`。本物の指しを1つ取りこぼす。将来「issue の番号 → 外し方の番号」と1行に書かれた日に、issue のほうを鳴らさないための代金 |
| 節の最大+1 まで | それを超える数は **0か所** | issue 番号はいま 580 台。同じ行に混ざった日でも、節としてはありえない数を鳴らさない |

（この説明に例として書いた番号そのものが、「前に在る」「範囲の外」に数えられて
出てくる。**見ないと決めたものは分母に出るので、隠れない。**）

**見ないと決めたぶんは、毎回数えて出す**（§15。分母の無い「0件」は何も言っていない）。
裸の `（#99）` のような指しは、たしかに外し方を指しているものが多い。
**それでも見ない。** 誤って鳴らす見張りは、そのうち誰も読まなくなる。

## 判定の足（4本）と、`BREAK=`

| 足 | 何をしているか | 抜くと |
| --- | --- | --- |
| `link` | 指し先の節が在るかを見る | 何も鳴らない |
| `ignore-far` | 同じ行に `island-misses` が無いものを見ない | **裸の issue 番号で鳴る**（`firestore_delete.py` の形） |
| `ignore-high` | 節の最大+1 を超える数を見ない | **同じ行に混ざった issue 番号で鳴る** |
| `ignore-before` | `island-misses` より前に在る数を見ない | **前に置かれた issue 番号で鳴る** |

**「見ない」側にも足が要る。** 守りを外したら落ちることを見ていないと、
その守りが効いているのか、もともと当たっていないのか分からない
（§15「対照は、足の数だけ用意する」）。

## 対照（`docs/island-standards.md` §15）

**本物を1行も見る前に、偽のリポジトリを7通り作って自分を試す。**
1つでも外れたら、本物の数字を1つも出さずに 2 で落ちる。

| 偽のリポジトリ | 欲しい答え | 外す足 |
| --- | --- | --- |
| 生きた指しが1つ | **0** | — |
| 指しが1つも無い | **2** | — |
| `docs/island-misses.md` が無い | **2** | — |
| 切れた指し（`#{最大+1}` を指す） | 1 | `BREAK=link` で 0 |
| 裸の issue 番号（`（#165）`。同じ行に名前なし） | **0** | `BREAK=ignore-far` で 1 |
| 同じ行の後ろに issue 番号（`island-misses.md` #99 と #575） | **0** | `BREAK=ignore-high` で 1 |
| 同じ行の前に issue 番号（#575 … `island-misses.md` #99） | **0** | `BREAK=ignore-before` で 1 |

**「見ない」側の対照は、向きが逆。** 壊した写しで落ちるのではなく、
**出してよいものを植えて落ちないこと**を見る。片側だけは対照ではない（§15）。

**先に「生きた指しが通ること」を見る。** 偽のリポジトリを作る途中で壊れても
終了コードは同じなので、そこを見ないと対照にならない（#99）。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# **節の見分けは1か所にしか書かない。** 見出しの書き方が変わった日に、
# 片方だけ古くなるのを避ける（`#78` までが `###`、`#79` からが `##`）
from misses_num_selftest import Broken, split  # noqa: E402

HERE = Path(__file__).resolve().parent          # python/
REPO = HERE.parent
DOCREL = "docs/island-misses.md"

# 文書の名前。`docs/island-misses.md` でも `` `island-misses.md` `` でも拾う
NAME = "island-misses"

# `#` のあとの16進っぽい並び。英字が混じっていれば色やハッシュで、節番号ではない
HASH_RE = re.compile(r"#([0-9a-fA-F]+)")

# 判定の足。`BREAK=<足>` で1本ずつ抜ける。対照が落ちることを見るためだけに使う
LEGS = ("link", "ignore-far", "ignore-high", "ignore-before")

# 見ないと決めたものの呼び名。**毎回そろえて出す**（§15。分母を出させる）
WHY = {
    "before": "`island-misses` より前に在る",
    "high": "節の範囲の外（最大+1 を超える数）",
    "hexish": "16進に英字が混じる（色・ハッシュ）",
    "wide": "5桁以上の数（`#000000` のような色。節番号ではありえない）",
    "near": "同じ行に名前が無い（ファイルの別の行には在る）",
    "far": "同じ行にも、そのファイルのどこにも名前が無い",
}

TIMEOUT_SEC = 180


def broken_legs() -> frozenset[str]:
    """`BREAK=` で抜いてある足。知らない名前が来たら、黙らずに落ちる。"""
    want = {x.strip() for x in os.environ.get("BREAK", "").split(",") if x.strip()}
    odd = want - set(LEGS)
    if odd:
        raise SystemExit(
            f"BREAK に知らない足があります: {' '.join(sorted(odd))}（{' '.join(LEGS)}）")
    return frozenset(want)


def tracked(root: Path) -> list[str]:
    """git が追いかけているファイルだけ歩く。

    木を素で歩くと `node_modules` と `.next` を数えることになるし、
    **手元にだけ在るファイルを見て「切れている」と言う**ことにもなる。
    git が無い／答えないなら、数を出さずに落ちる。
    """
    try:
        r = subprocess.run(["git", "-C", str(root), "ls-files", "-z"],
                           capture_output=True, text=True, timeout=TIMEOUT_SEC,
                           check=False)
    except (OSError, subprocess.SubprocessError) as e:
        raise Broken(f"git ls-files が回らなかった: {e}") from e
    if r.returncode != 0:
        raise Broken(f"git ls-files が {r.returncode} で落ちた: {r.stderr.strip()[:200]}")
    names = [x for x in r.stdout.split("\0") if x]
    if not names:
        raise Broken(f"追跡されているファイルが1つも無い: {root}")
    return names


def classify(line: str, tok: str, start: int, named_line: bool,
             named_file: bool, top: int) -> str:
    """その `#NNN` を見るか、見ないか。**見ない理由まで名前で返す。**"""
    if not tok.isdigit():
        return "hexish"
    if len(tok) >= 5:
        return "wide"
    if not named_line:
        return "near" if named_file else "far"
    if start < line.index(NAME):
        return "before"
    if int(tok) > top + 1:
        return "high"
    return "look"


def scan(root: Path, top: int, ban: frozenset[str]) -> dict:
    """木を歩いて `#NNN` を全部拾い、種類ごとに分ける。

    返すのは件数の内訳と、**見ると決めたものの一覧**（ファイル・行・番号・その行）。
    """
    counts = {k: 0 for k in list(WHY) + ["look"]}
    looks: list[tuple[str, int, int, str]] = []
    lines_with = 0
    files_with = 0
    read = 0

    # `BREAK=` で「見ない」を1つ外すと、その種類が `look` に落ちてくる
    unignore = {"ignore-far": ("near", "far", "hexish", "wide"),
                "ignore-high": ("high",),
                "ignore-before": ("before",)}
    promote: set[str] = set()
    for leg, kinds in unignore.items():
        if leg in ban:
            promote.update(kinds)

    for rel in tracked(root):
        p = root / rel
        try:
            text = p.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue          # 絵や取り置き。字として読めないものは数えない
        read += 1
        if "#" not in text:
            continue
        named_file = NAME in text
        hit_file = False
        for lineno, line in enumerate(text.splitlines(), 1):
            if "#" not in line:
                continue
            named_line = NAME in line
            hit_line = False
            for m in HASH_RE.finditer(line):
                kind = classify(line, m.group(1), m.start(), named_line,
                                named_file, top)
                if kind in promote:
                    kind = "look"
                counts[kind] += 1
                hit_line = hit_file = True
                if kind == "look":
                    looks.append((rel, lineno, int(m.group(1)), line.strip()))
            if hit_line:
                lines_with += 1
        if hit_file:
            files_with += 1

    return {"counts": counts, "looks": looks, "files": len(tracked(root)),
            "read": read, "files_with": files_with, "lines_with": lines_with}


def nearest(num: int, have: set[int]) -> str:
    """切れている番号の近くに在る節。**直す人が探さなくていいように。**"""
    lo = max((n for n in have if n < num), default=None)
    hi = min((n for n in have if n > num), default=None)
    both = [f"#{n}" for n in (lo, hi) if n is not None]
    return "／".join(both) if both else "（節が1つも無い）"


def look(root: Path, ban: frozenset[str]) -> dict:
    """1つの木を見る。読めない・数えるものが無いなら `Broken`。"""
    doc = root / DOCREL
    try:
        text = doc.read_text(encoding="utf-8")
    except OSError as e:
        raise Broken(f"{DOCREL} が読めなかった（{e}）") from e
    sections, _ = split(text)
    have = {n for _, n, _ in sections}
    titles = {n: t.strip() for _, n, t in sections}
    top = max(have)

    c = scan(root, top, ban)
    if not c["looks"]:
        raise Broken("外し方を指していると言い切れる `#NNN` が1つも無い"
                     f"（歩いた {c['read']}ファイル中、`#` を持つのは {c['files_with']}）")

    bad: list[str] = []
    if "link" not in ban:
        for rel, lineno, num, line in c["looks"]:
            if num not in have:
                bad.append(f"{rel}:{lineno} が #{num} を指しているが、"
                           f"その節が無い（いま在るのは {nearest(num, have)}）\n"
                           f"      → {line[:120]}")

    return {
        "root": str(root),
        "doc": DOCREL,
        "sections": len(have),
        "top": top,
        "titles": titles,
        "files": c["files"],
        "read": c["read"],
        "files_with": c["files_with"],
        "lines_with": c["lines_with"],
        "counts": c["counts"],
        "look": len(c["looks"]),
        "bad": bad,
    }


def report(c: dict) -> None:
    """人が読む形。**分母から出す**（`docs/island-standards.md` §15）。"""
    n = c["counts"]
    skipped = sum(v for k, v in n.items() if k != "look")
    print(f"[指し先] {c['root']}")
    print(f"  節 {c['sections']}個（いちばん大きい番号 #{c['top']}）")
    print(f"  歩いた {c['files']}ファイル（字として読めた {c['read']}）／"
          f"`#` を持つ {c['files_with']}ファイル・{c['lines_with']}行")
    print(f"  拾った `#…` {c['look'] + skipped}か所")
    print(f"    ○ 見る  {c['look']}か所"
          "（`island-misses` と同じ行・その字より後ろ・節の範囲内）")
    print(f"    － 見ない {skipped}か所")
    for k in WHY:
        if n[k]:
            print(f"        {n[k]:5d}  {WHY[k]}")
    print()
    if c["bad"]:
        print(f"✕ 指し先が切れている {len(c['bad'])}件")
        for b in c["bad"]:
            print(f"  ✕ {b}")
        print()
        print("番号をずらしたなら、**ずらした側が指し先も直す。**"
              "（`docs/island-misses.md` の節は1文字も触らずに、指している行を直す）")
    else:
        print(f"○ 切れている指し先は無い（{c['look']}か所ぜんぶ、節に当たった）")


# ---------------------------------------------------------------- 対照

# 偽のリポジトリに植えるもの。`{top}` `{gap}` はその場で埋める
PLANT_LIVE = (
    "tools/fake_live.mjs",
    "/** 生きた指し（`docs/island-misses.md` #{live}）。対照。 */\n"
    "export const x = 1;\n",
)
PLANT_BROKEN = (
    "tools/fake_broken.mjs",
    "/** 切れた指し（`docs/island-misses.md` #{gap}）。対照。 */\n"
    "export const y = 2;\n",
)
# `python/admin/firestore_delete.py:73` の実物と同じ形。**同じ行に名前が無い**
PLANT_ISSUE = (
    "python/fake_issue.py",
    "# 島の遠隔操作のつなぎ（#{gap}）。配信1回ぶんの一時状態。\n"
    "# 決めごとは `docs/island-misses.md` #{live} に書いてある。\n"
    "ISLAND_REMOTE = 1\n",
)
PLANT_HIGH = (
    "python/fake_high.py",
    "# 直し方は `docs/island-misses.md` #{live}。issue は #{issue}。\n"
    "HIGH = 1\n",
)
PLANT_BEFORE = (
    "python/fake_before.py",
    "# issue #{issue} → `docs/island-misses.md` #{live} と同じ形。\n"
    "BEFORE = 1\n",
)


def build(box: Path, real_doc: str, plants: list[tuple[str, str]],
          live: int, gap: int, issue: int, with_doc: bool = True,
          strip_refs: bool = False) -> Path:
    """**偽のリポジトリ**を1つ作る。本物の文書を写して、指しを植える。

    作り物の数行ではなく本物の文書を写すのは、**見出しの書き方が変わった日に
    対照のほうが先に古くなる**のを避けるため（`misses_num_selftest.py` と同じ）。

    `strip_refs` は**文書から自分への指しを落とす。** 本物の文書は自分の中で
    4か所、自分を名指しで指しているので、そのまま写すと「指しが1つも無い木」を
    作れない（節の見出しには `island-misses` の字が入らないので、節は残る）。
    """
    root = box
    if with_doc:
        body = real_doc
        if strip_refs:
            body = "\n".join(x for x in body.splitlines() if NAME not in x) + "\n"
        (root / "docs").mkdir(parents=True, exist_ok=True)
        (root / DOCREL).write_text(body, encoding="utf-8")
    for rel, body in plants:
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(body.format(live=live, gap=gap, issue=issue), encoding="utf-8")
    for cmd in (["git", "-C", str(root), "init", "-q"],
                ["git", "-C", str(root), "add", "-A"]):
        r = subprocess.run(cmd, capture_output=True, text=True,
                           timeout=TIMEOUT_SEC, check=False)
        if r.returncode != 0:
            raise Broken(f"偽のリポジトリを作れなかった: {' '.join(cmd[:4])} → "
                         f"{r.stderr.strip()[:200]}")
    return root


def run_self(root: Path, leg: str | None) -> tuple[int, str]:
    """自分を子として起こして、終了コードを**実測する。**"""
    env = dict(os.environ)
    env.pop("BREAK", None)
    if leg:
        env["BREAK"] = leg
    r = subprocess.run(
        [sys.executable, str(Path(__file__).resolve()), "--no-drill",
         "--root", str(root)],
        capture_output=True, text=True, env=env, timeout=TIMEOUT_SEC, check=False)
    return r.returncode, r.stdout + r.stderr


# 名前, 植えるもの, 文書を置くか, 自分への指しを落とすか,
# 欲しい終了コード, 抜くと答えが変わる足, 抜いたときの答え, 何を見ているか
CASES = [
    ("live", [PLANT_LIVE], True, False, 0, None, None,
     "生きた指しだけなら通る"),
    ("nolink", [], True, True, 2, None, None,
     "指しが1つも無ければ 2（「0件なので合格」にしない）"),
    ("nodoc", [PLANT_LIVE], False, False, 2, None, None,
     "文書が無ければ 2"),
    ("broken", [PLANT_LIVE, PLANT_BROKEN], True, False, 1, "link", 0,
     "切れた指しで落ちる"),
    ("issue", [PLANT_LIVE, PLANT_ISSUE], True, False, 0, "ignore-far", 1,
     "裸の issue 番号では鳴らない（`firestore_delete.py` の形）"),
    ("high", [PLANT_LIVE, PLANT_HIGH], True, False, 0, "ignore-high", 1,
     "同じ行の後ろに来た issue 番号では鳴らない"),
    ("before", [PLANT_LIVE, PLANT_BEFORE], True, False, 0, "ignore-before", 1,
     "同じ行の前に来た issue 番号では鳴らない"),
]


def drill(doc: Path) -> bool:
    """**本物を1行も判定する前に、偽のリポジトリで自分を試す。**"""
    ok = True
    try:
        real = doc.read_text(encoding="utf-8")
        sections, _ = split(real)
    except (OSError, Broken) as e:
        print(f"  ✕ 写しの元が読めない: {e}")
        return False
    have = {n for _, n, _ in sections}
    top = max(have)
    live = top                # 在る節
    gap = top + 1             # **作り方から、必ず無い節**（最大の次）
    issue = top + 500         # 節としてはありえない数。issue 番号の側

    def check(mark_ok: bool, msg: str) -> None:
        nonlocal ok
        if not mark_ok:
            ok = False
        print(f"  {'○' if mark_ok else '✕'} {msg}")

    with tempfile.TemporaryDirectory() as tmp:
        for name, plants, with_doc, strip, want, leg, want2, why in CASES:
            box = Path(tmp) / name
            box.mkdir()
            try:
                root = build(box, real, list(plants), live, gap, issue, with_doc,
                             strip)
            except Broken as e:
                check(False, f"{name} の偽リポジトリを作れなかった: {e}")
                continue
            got, _ = run_self(root, None)
            check(got == want, f"{name} → 終了コード {got}（欲しいのは {want}）… {why}")
            if leg is None:
                continue
            # **その足を抜くと答えが変わる**ことまで見る。見ていないと、
            # 守りが効いているのか、もともと当たっていないのかが分からない
            got2, _ = run_self(root, leg)
            check(got2 == want2, f"   BREAK={leg} を当てると {name} が {want2} になる"
                                 f"（終了コード {got2}）")
            # 逆に、**別の足を抜いても答えは変わらない**こと。4通り植えて
            # 同じ1本を折っているだけ、をここで落とす
            other = next(x for x in LEGS if x != leg)
            got3, _ = run_self(root, other)
            check(got3 == want, f"   BREAK={other} では {name} は {want} のまま"
                                f"（終了コード {got3}）")

    # 知らない足を渡されたら、黙って全部の足を立てたまま通さない
    got, out = run_self(REPO, "shiranai-ashi")
    check(got != 0 and "BREAK に知らない足" in out,
          f"BREAK に知らない名前 → 終了コード {got}（0 以外で、理由を言う）")

    return ok


def main() -> int:
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--root", default=None, help="見る木の根（既定: このリポジトリ）")
    ap.add_argument("--json", action="store_true", help="機械で読む形で出す")
    ap.add_argument("--only-drill", action="store_true", help="対照だけ回して帰る")
    ap.add_argument("--no-drill", action="store_true", help="対照を飛ばす（対照の中から）")
    a = ap.parse_args()

    ban = broken_legs()
    root = Path(a.root).resolve() if a.root else REPO

    if not a.no_drill:
        print("[対照] 偽のリポジトリを7通り作って、先に自分を試す")
        if not drill(REPO / DOCREL):
            print("\n✕ 対照が外れた。**本物の判定は1つも出していない**")
            return 2
        print("  ○ 見張りは落ちられるし、見ないと決めたもので鳴らない")
        if a.only_drill:
            return 0
        print()

    try:
        c = look(root, ban)
    except Broken as e:
        print(f"✕ 数えられなかった: {e}")
        print("**「指し先はぜんぶ生きています」とは言わない**")
        return 2

    if a.json:
        c.pop("titles", None)
        print(json.dumps(c, ensure_ascii=False, sort_keys=True))
    else:
        report(c)
    if ban:
        print(f"※ BREAK={','.join(sorted(ban))}。足を抜いているので、この判定は根拠になりません")
    return 1 if c["bad"] else 0


if __name__ == "__main__":
    sys.exit(main())
