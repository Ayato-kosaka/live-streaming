"""**`docs/island-misses.md` の節番号を見張る。** 重複・前後・飛び番を名指しで出す。

    python3 python/misses_num_selftest.py              # 本物を見る（対照つき）
    python3 python/misses_num_selftest.py --only-drill # 対照だけ回して帰る
    python3 python/misses_num_selftest.py --file X.md  # 別の写しを見る（対照を作るとき）
    python3 python/misses_num_selftest.py --json       # 機械で読む形
    BREAK=dup python3 python/misses_num_selftest.py    # 判定の足を1本抜く（対照用）

終了コード **0=そろっている / 1=ずれている / 2=数えられなかった**
（`docs/island-standards.md` §15）。

## なぜ要るか（2026-09-18 に一日で4回）

`docs/island-misses.md` の番号は **「足す直前に `git fetch` して、最大の次」** を
人が採る運用になっている。枝を3〜4本並行で回した日に、こうなった。

1. 2本の担当が**同時に `#153` を採った**（昼。片方を #154 にずらして解決）
2. 2本の担当が**同時に `#158` を採った**（夜。片方を #159 にずらして解決）
3. 3本の枝が**同じ末尾に足した**ので、マージのたびに衝突（3回）
4. 衝突を解いた順に並んで、ファイルが **`159 → 161 → 160 → 162`** と前後した

**採る側の運用は、これでよい。** 自動で採る仕組みにすると、番号がマージのたびに
書き換わるので衝突が減らずに増える。足りていなかったのは**採り間違えたときに
鳴るもの**で、4回とも気づいたのは人が目で見たからだった。

だからこれは**採る道具ではなく、採り間違いを鳴らす見張り**。

## なぜ `_selftest.py` の名前なのか

**毎 PR で走らないと意味がないから。** 回し役（`python/selftest_runner.py`）は
`*_selftest.py` を**全部拾う**ので、この名前にしておけば繋ぎ忘れようがない
（表に書き足す形だと、書き足し忘れた日に赤くならない——#125）。
先例は `crosscall_selftest.py` と `watch_census_selftest.py`。どちらも
**本物のリポジトリを見る見張り**で、対照を自分の中に持っている。

## 節の見出しをどう見分けるか

`#78` までは `### #N …`、`#79` からは `## #N …`。**途中で深さが変わっている。**
過去は直さない決まり（`docs/island-db-notes.md` と同じ扱い）なので、
**切り替わったところを境に読む。**

- いちばん浅い番号つき見出し（いまは `##`）が**節**
- それより前に在る番号つき見出しは、**昔の書き方の節**（`### #1`〜`### #78`）
- 切り替わったあとに出てくる深い番号つき見出しは、**節の中の小見出し**
  （`### #104 #105 とどう違うか` のような、他の節への指し）

## 見るもの（4つ）と、崩れると誰が困るか

| 見るもの | 崩れると |
| --- | --- |
| **番号の重複** | `#155` が2か所を指す。他の節から `#155 の決めごと` と引いた先が決まらない |
| **番号が前に戻る** | 次の担当が採る「最大の次」がずれる。今日そのものの事故 |
| **飛び番** | 採り間違い（`#163` のつもりで `#173`）が、重複にも前後にもならずに通る |
| **小見出しの指し先が無い** | `### #163 …` と**深さを間違えて節を足す**と、この見張りも
  `grep '^## #'` で最大を採る人も、**その節が見えないまま黙る**（#142 と同じ形） |

**ここまで。** 番号以外の形は、測ってから落とした（2026-09-18 実測）。

- 見出しが `**…**` で始まるもの … 165本中 **21本**
- 見出しに日付 `（20xx-xx-xx` を持つもの … 165本中 **152本**
- 日付が前に戻っている節 … **16件**（#25〜#53 と #90）

つまり「見出しの形がそろっている」「日付が時系列」は**いまの文書の性質ではない。**
落とすようにすると、過去161節を書き直すことになる。**過去は直さない。**
未来の日付も見ていない——**日付を間違えて困る人が言えない**（番号と違って、
誰も日付で引いていない）。

## 飛び番を落とすと決めた理由と、`#37`

**飛び番は落とす。** 理由は表のとおりで、**採り間違いのうち重複にも前後にも
ならないもの**が、飛び番でしか出ないから。

ただし**いまの文書には `#37` が無い**（`#36` の次が `#38`）。2026-09-10 に
採られたまま、本文にも他の節からの指しにも**1度も出てこない**（`docs/` 全体で
`#37` の参照は 0件）。過去は直さないので、**その1つだけを名前で断る。**
断り書きを表に置いてあるのは、次に飛んだ番号を黙って足させないため——
**足すときは、なぜ飛んだかを書かないと足せない形**にしてある。

`BREAK=burned` を当てるとこの断りが外れ、**本物の文書が `#37` で落ちる。**
そこまで見て、はじめて「飛び番を見ている」と言える。

## 対照（`docs/island-standards.md` §15）

**本物を1行も見る前に、本物の写しを壊して自分を試す。**
1つでも外れたら、本物の数字を1つも出さずに 2 で落ちる。

| 写し | 欲しい答え | 外す足 |
| --- | --- | --- |
| 手を付けていない | **0** | — |
| 節を1つ足した（正しく採った）＋その中に指しの小見出し | **0** | — |
| 同じ番号が2つ | 1 | `BREAK=dup` で 0 |
| 番号が前に戻る | 1 | `BREAK=order` で 0 |
| 番号が1つ飛ぶ | 1 | `BREAK=gap` で 0 |
| 深さを間違えて節を足した（指し先が無い小見出し） | 1 | `BREAK=ref` で 0 |
| 番号つき見出しが1つも無い | **2** | — |
| ファイルが無い | **2** | — |

**足は1本ずつ折る。** 壊した写しは1つの足しか折らないように作ってある——
たとえば重複の写しは**同じ番号を並べて足す**（`162, 162`）ので、
「前に戻る」には当たらない。4通り壊して同じ足を折っているだけ、を避ける
（§15「対照は、足の数だけ用意する」）。

**先に「壊していない写しが通ること」を見る。** 写しを作る途中で壊れても
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

HERE = Path(__file__).resolve().parent          # python/
REPO = HERE.parent
DOC = REPO / "docs" / "island-misses.md"

# 番号つきの見出し。`## #162 **…**` も `### #104 #105 とどう違うか` もここに入る。
# 深さで節と小見出しを分けるのは `split()` の仕事
HEAD_RE = re.compile(r"^(#{2,6}) #(\d+)(.*)$")

# **採られたまま、どこにも残っていない番号。** ここに置いたものだけ、飛び番と
# 数えない。足すときは「いつ・なぜ飛んだか」を書くこと（書けないなら、
# それは飛ばしてよい番号ではない）
BURNED: dict[int, str] = {
    37: "2026-09-10 に採られたまま、本文にも他の節からの指しにも1度も出てこない",
}

# 判定の足。`BREAK=<足>` で1本ずつ抜ける。対照が落ちることを見るためだけに使う
LEGS = ("dup", "order", "gap", "ref", "burned")

TIMEOUT_SEC = 120


class Broken(Exception):
    """**数えかたのほうが壊れた。** 本物の数字は1つも出さずに 2 で落ちる。"""


def broken_legs() -> frozenset[str]:
    """`BREAK=` で抜いてある足。知らない名前が来たら、黙らずに落ちる。"""
    want = {x.strip() for x in os.environ.get("BREAK", "").split(",") if x.strip()}
    odd = want - set(LEGS)
    if odd:
        raise SystemExit(
            f"BREAK に知らない足があります: {' '.join(sorted(odd))}（{' '.join(LEGS)}）")
    return frozenset(want)


def split(text: str) -> tuple[list[tuple[int, int, str]], list[tuple[int, int]]]:
    """見出しを**節**と**節の中の小見出し**に分ける。

    返すのは（節 [(行, 番号, 見出しの字)]、小見出し [(行, 番号)]）。
    見分けかたは頭のドキュメントのとおり——いちばん浅い番号つき見出しが節で、
    **それが初めて出てくるより前**に在るものも、昔の書き方の節として数える。
    """
    heads: list[tuple[int, int, int, str]] = []
    for lineno, line in enumerate(text.splitlines(), 1):
        m = HEAD_RE.match(line)
        if m:
            heads.append((lineno, len(m.group(1)), int(m.group(2)), m.group(3)))
    if not heads:
        raise Broken("番号つきの見出し（`## #N …`）が1つも無い")

    top = min(h[1] for h in heads)
    first = next(i for i, h in enumerate(heads) if h[1] == top)

    sections = [(h[0], h[2], h[3]) for h in heads[:first]]
    subs: list[tuple[int, int]] = []
    for lineno, depth, num, tail in heads[first:]:
        if depth == top:
            sections.append((lineno, num, tail))
        else:
            subs.append((lineno, num))
    if not sections:
        raise Broken("節の見出しを1つも取れなかった")
    return sections, subs


def judge(sections: list[tuple[int, int, str]], subs: list[tuple[int, int]],
          ban: frozenset[str]) -> list[str]:
    """ずれているところを並べる。**判断はしない。番号の話だけを言う。**"""
    bad: list[str] = []
    nums = [n for _, n, _ in sections]

    # 1. 重複。同じ番号が2か所を指すと、他の節から引いた先が決まらない
    if "dup" not in ban:
        seen: dict[int, int] = {}
        for lineno, num, _ in sections:
            if num in seen:
                bad.append(f"{lineno}行目: #{num} が二重（{seen[num]}行目にもある）")
            else:
                seen[num] = lineno

    # 2. 前に戻る。次の担当が採る「最大の次」がずれる（今日そのものの事故）
    if "order" not in ban:
        for i in range(1, len(sections)):
            if nums[i] < nums[i - 1]:
                bad.append(f"{sections[i][0]}行目: #{nums[i]} が #{nums[i - 1]} の"
                           f"あとに来ている（番号が前に戻っている）")

    # 3. 飛び番。採り間違いのうち、重複にも前後にもならないもの
    if "gap" not in ban:
        have = set(nums)
        burned = {} if "burned" in ban else BURNED
        for n in range(min(nums), max(nums) + 1):
            if n not in have and n not in burned:
                bad.append(f"#{n} が無い（#{n - 1} の次が #{n + 1}）")

    # 4. 小見出しの指し先。深さを間違えて節を足すと、ここでしか出ない
    if "ref" not in ban:
        have = set(nums)
        for lineno, num in subs:
            if num not in have:
                bad.append(f"{lineno}行目: 小見出しが #{num} を指しているが、"
                           f"その節が無い（節を `###` の深さで足していないか）")

    return bad


def look(path: Path, ban: frozenset[str]) -> dict:
    """1つのファイルを見る。読めなければ `Broken`。"""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as e:
        raise Broken(f"読めなかった: {path}（{e}）") from e
    sections, subs = split(text)
    return {
        "file": str(path),
        "sections": len(sections),
        "subs": len(subs),
        "first": sections[0][1],
        "last": sections[-1][1],
        "max": max(n for _, n, _ in sections),
        "burned": sorted(BURNED) if "burned" not in ban else [],
        "bad": judge(sections, subs, ban),
    }


def report(c: dict) -> None:
    """人が読む形。**分母から出す**（`docs/island-standards.md` §15）。"""
    print(f"[節番号] {c['file']}")
    print(f"  節 {c['sections']}個（#{c['first']} 〜 #{c['last']}。いちばん大きい番号 "
          f"#{c['max']}）／節の中の小見出し {c['subs']}個")
    if c["burned"]:
        for n in c["burned"]:
            print(f"  — 飛び番と数えない #{n} … {BURNED[n]}")
    print()
    if c["bad"]:
        print(f"✕ ずれているところ {len(c['bad'])}件")
        for b in c["bad"]:
            print(f"  ✕ {b}")
        print()
        print(f"次に足す節の番号は **#{c['max'] + 1}**"
              "（`git fetch origin master` してから採り直す）")
    else:
        print(f"○ 重複も・前後も・飛び番も無い。次に足すのは #{c['max'] + 1}")


# ---------------------------------------------------------------- 対照

def renumber(text: str, was: int, now: int) -> str:
    """節の見出しの番号だけを付け替える。本文の `#N` は触らない。"""
    out, hit = [], 0
    for line in text.splitlines():
        m = HEAD_RE.match(line)
        if m and int(m.group(2)) == was:
            line = f"{m.group(1)} #{now}{m.group(3)}"
            hit += 1
        out.append(line)
    if hit != 1:
        raise Broken(f"写しを作れなかった: #{was} の節見出しが {hit}個")
    return "\n".join(out) + "\n"


def fixture(real: str, kind: str, top: int) -> str:
    """**本物の写し**を、1通りだけ壊して返す。

    作り物の数行ではなく本物を写すのは、**書き方が変わった日に対照のほうが
    先に古くなる**のを避けるため（`crosscall_selftest.py` と同じ考え）。
    """
    if kind == "clean":
        return real
    if kind == "green":
        # **壊していない足し方。** 正しく採った節と、その中の指しの小見出し。
        # これで落ちるようなら、本物の運用のほうを鳴らしてしまう
        return real + (f"\n## #{top + 1} **正しく採った節**（2026-09-18。対照）\n\n"
                       f"### #{top} と、同じ形\n\n本文。\n")
    if kind == "dup":
        # 同じ番号を並べて足す。**前に戻ってはいない**ので、折れる足は重複だけ
        return real + (f"\n## #{top} **同じ番号をもう1つ**（2026-09-18。対照）\n\n本文。\n")
    if kind == "order":
        # いちばん後ろの2つを入れ替える。集合は変わらないので飛び番も重複も出ない
        return renumber(renumber(renumber(real, top, 0), top - 1, top), 0, top - 1)
    if kind == "gap":
        # いちばん後ろを1つ先へずらす。昇順のままで、重複もしない
        return renumber(real, top, top + 1)
    if kind == "ref":
        # **深さを間違えて節を足した。** `grep '^## #'` にも、この見張りの
        # 節の数にも出てこない。出るのは「指し先の無い小見出し」としてだけ
        return real + (f"\n### #{top + 1} **深さを間違えた節**（2026-09-18。対照）\n\n本文。\n")
    if kind == "nonum":
        return "# 見出し\n\n番号つきの見出しが1つも無い写し。\n"
    raise Broken(f"知らない写し: {kind}")


def run_self(path: Path | None, leg: str | None) -> tuple[int, str]:
    """自分を子として起こして、終了コードを**実測する。**"""
    env = dict(os.environ)
    env.pop("BREAK", None)
    if leg:
        env["BREAK"] = leg
    cmd = [sys.executable, str(Path(__file__).resolve()), "--no-drill"]
    if path is not None:
        cmd += ["--file", str(path)]
    r = subprocess.run(cmd, capture_output=True, text=True, env=env,
                       timeout=TIMEOUT_SEC, check=False)
    return r.returncode, r.stdout + r.stderr


# 写し, 欲しい終了コード, その写しが折る足, 何を見ているか
CASES = [
    ("clean", 0, None, "手を付けていない写しは通る"),
    ("green", 0, None, "正しく採った節を足しても鳴らない（狼少年にしない）"),
    ("dup", 1, "dup", "同じ番号が2つ"),
    ("order", 1, "order", "番号が前に戻る"),
    ("gap", 1, "gap", "番号が1つ飛ぶ"),
    ("ref", 1, "ref", "深さを間違えて節を足した（指し先の無い小見出し）"),
    ("nonum", 2, None, "番号つきの見出しが1つも無ければ 2"),
]


def drill(real_path: Path) -> bool:
    """**本物を1行も判定する前に、壊した写しで自分を試す。**"""
    ok = True
    try:
        real = real_path.read_text(encoding="utf-8")
        sections, _ = split(real)
    except (OSError, Broken) as e:
        print(f"  ✕ 写しの元が読めない: {e}")
        return False
    top = max(n for _, n, _ in sections)

    def check(mark_ok: bool, msg: str) -> None:
        nonlocal ok
        if not mark_ok:
            ok = False
        print(f"  {'○' if mark_ok else '✕'} {msg}")

    with tempfile.TemporaryDirectory() as tmp:
        box = Path(tmp)
        for kind, want, leg, why in CASES:
            try:
                body = fixture(real, kind, top)
            except Broken as e:
                check(False, f"{kind} の写しを作れなかった: {e}")
                continue
            p = box / f"{kind}.md"
            p.write_text(body, encoding="utf-8")
            got, _ = run_self(p, None)
            check(got == want, f"{kind} → 終了コード {got}（欲しいのは {want}）… {why}")
            if leg is None:
                continue
            # **その足を抜くと、この写しが通ってしまう**ことまで見る。
            # 見ていないと、4通り壊して同じ足を折っているだけ、に気づけない
            got2, _ = run_self(p, leg)
            check(got2 == 0, f"   BREAK={leg} を当てると {kind} が通る"
                             f"（終了コード {got2}。欲しいのは 0）")
            # 逆に、**別の足を抜いても落ちたまま**であること。抜いた足だけが
            # 効いていたのか、全部が同じ1本だったのかは、ここでしか分からない
            other = next(x for x in ("dup", "order", "gap", "ref") if x != leg)
            got3, _ = run_self(p, other)
            check(got3 == 1, f"   BREAK={other} では {kind} は落ちたまま"
                             f"（終了コード {got3}。欲しいのは 1）")

        # ファイルが無ければ 2。「0件だから通りました」にしない（§15）
        got, _ = run_self(box / "no-such-file.md", None)
        check(got == 2, f"ファイルが無い → 終了コード {got}（欲しいのは 2）")

    # 知らない足を渡されたら、黙って全部の足を立てたまま通さない
    got, out = run_self(None, "shiranai-ashi")
    check(got != 0 and "BREAK に知らない足" in out,
          f"BREAK に知らない名前 → 終了コード {got}（0 以外で、理由を言う）")

    return ok


def main() -> int:
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--file", default=None, help="見るファイル（既定: docs/island-misses.md）")
    ap.add_argument("--json", action="store_true", help="機械で読む形で出す")
    ap.add_argument("--only-drill", action="store_true", help="対照だけ回して帰る")
    ap.add_argument("--no-drill", action="store_true", help="対照を飛ばす（対照の中から）")
    a = ap.parse_args()

    ban = broken_legs()
    path = Path(a.file).resolve() if a.file else DOC

    if not a.no_drill:
        print("[対照] 本物の写しを1通りずつ壊して、先に自分を試す")
        if not drill(DOC):
            print("\n✕ 対照が外れた。**本物の判定は1つも出していない**")
            return 2
        print("  ○ 見張りは落ちられる")
        if a.only_drill:
            return 0
        print()

    try:
        c = look(path, ban)
    except Broken as e:
        print(f"✕ 数えられなかった: {e}")
        print("**「番号はそろっています」とは言わない**")
        return 2

    if a.json:
        print(json.dumps(c, ensure_ascii=False, sort_keys=True))
    else:
        report(c)
    if ban:
        print(f"※ BREAK={','.join(sorted(ban))}。足を抜いているので、この判定は根拠になりません")
    return 1 if c["bad"] else 0


if __name__ == "__main__":
    sys.exit(main())
