"""**どの判定器が、どこから走るか**を数える。走らないものを名指しで出す。

    python3 python/watch_census_selftest.py            # 棚卸しして出す
    python3 python/watch_census_selftest.py --json     # 機械で読む形
    python3 python/watch_census_selftest.py --only-drill   # 対照だけ回して帰る
    BREAK=name python3 python/watch_census_selftest.py     # 2026-09-19 前の見分けを再現

終了コード **0=数えられていない判定器は無い / 1=在った /
2=数えられなかった**（`docs/island-standards.md` §15）。

## 何を「見張り（判定器）」と呼ぶか——**名前では決めない**

2026-09-19 まで、ここは名前だけで見分けていた（`*_selftest.py` / `*_selftest.mjs`）。
その日、**表紙が「23カ国」と「22カ国」を同時に出していた**のを人が目で見つけた。
数えるはずの `tools/sprites/walkedcount.mjs` は在ったのに、**名前が
`_selftest` でないので、この棚卸しから丸ごと見えていなかった**（#165 #171）。

名前で決めるかぎり、`*_selftest` と名付けなかった判定器は永久に見えない。
だから**中身**で見分ける。次のどれかに当たれば判定器とみなす。

| 足 | 見るもの | 外す印 |
| --- | --- | --- |
| 名前 | `*_selftest.py` / `*_selftest.mjs` | `BREAK=name` |
| 宣言 | 頭の説明に**終了コードの表**（`0=…` `1=…` が2つ以上） | `BREAK=decl` |
| 三値 | 中身が **1 と 2 の両方**を意図して返す（§15 の三値） | `BREAK=codes` |
| 合否 | `process.exitCode = <0でない>` を立てる（部品もここで出る） | `BREAK=codes` |

**足は足し算で、引き算にしない。** どれか1つでも当たれば候補に入れる。
見のがすより、要らないものが1本出るほうがいい（#126 の決めごと1と同じ向き）。

## 走る道は4つ。**全部足して、重複を除く**

| 道 | どう取るか |
| --- | --- |
| 回し役が拾うぶん | `selftest_runner.py --list --json` を**呼んで**取る |
| `run:` が直に呼ぶぶん | `.github/workflows/*.yml` を YAML として読み、`run:` の**コマンドの位置**だけを見る |
| そこから import されるぶん | 走るファイルが `import` している判定器（`dead_stream_watch.py` がこれ） |
| そこから子として起こされるぶん | 走るファイルが `subprocess` / `spawn` で名指ししている判定器 |

**拾いかたを写経しない。** 回し役の glob をこちらに書き写すと、あちらが
変わった日に黙ってずれる（2026-09-18 に実際にずれた）。だから口を呼ぶ。

**`run:` は「コマンドの位置」でしか拾わない**（`BREAK=cmd` で外せる）。
`echo "（python/build_shorts.py。…）"` のような**お知らせの中の名前**を
呼び出しと読むと、走っていないものが「走っている」に化ける。#141 で
踏んだのはコメントだったが、`echo` は**コメントではないので YAML を
正しく読んでも残る**。同じ形の穴がもう1つある、ということ。

**コメントは2層ある。**

- YAML のコメント（`  # python3 …`）… YAML として読めば、パーサが落とす
- `run: |` の中のシェルのコメント（`# python3 …`）… **こちらは中身なので残る。**
  しかも YAML はブロックの字下げを剥がすので、**`#` が1列目に来る**（#141）

## 走らせないものは、**理由を書かないと足せない**

判定器を「載せる／断る」で仕分けたとき、断りを**黙って0に畳まない**ための表が
`python/watch_excuses.py`。ここに名前が無い判定器が1本でも走らなければ、
この道具は 1 で落ちる。**「0本」と言えるのは、全部が走るか、
全部に理由が書いてあるときだけ。**

理由は次を満たさないと受け取らない（`BREAK=excuse` で外せる）。

1. 空でない
2. 12文字以上（「重い」だけを弾く）
3. **いつ時点の話かの日付**（`2026-09-19` の形）が入っている
   （#141 の決めごと6「繋がない理由は、測ってから書く。数字と、いつ測ったか」）

表そのものが腐るのも見る（`BREAK=rot` で外せる）。

- 表に在るのに、そのファイルが無い → **2**（数えかたが壊れている）
- 表に在るのに、実は走っている → **2**（断りが古い。走る道が増えたのに残っている）
- 表に在るのに、判定器として拾えていない → **2**（見分けが変わったのに表が残っている）

## なぜ `_selftest.py` の名前なのか

**この道具自身が、毎 PR で走らないと意味がないから。**
回し役（`python/selftest_runner.py`）は `*_selftest.py` を**全部拾う**ので、
この名前にしておけば繋ぎ忘れようがない（表に書き足す形にすると、
書き足し忘れた日に赤くならない——`docs/island-misses.md` #125）。
自分で自分を数えることになるが、それでよい。

## 無限に回らないようにしてあること

この道具は回し役に拾われ、その中から回し役を呼ぶ。止まるのは2つの理由。

1. **呼ぶのは `--list` だけ。** あちらは見張りを1本も起こさずに一覧を出して帰る
2. 念のための輪止め。回し役を呼ぶときに `ISLAND_WATCH_CENSUS=1` を置いていく。
   その印を持ったまま起こされたら、この道具は**何も数えずに 0 で帰る**

## 対照（`docs/island-standards.md` §15）

**本物を1本も数える前に、答えの分かっている仕込みで自分を試す。**
1つでも外れたら、本物の数字を1つも出さずに 2 で落ちる。
**足の数だけ別々に落ちる**こと（同じ足を2通りに折るのは1通り）。

| 見るもの | 外す印 |
| --- | --- |
| コメントに名前だけ（行頭 `#`）を「走っている」に数えない | `BREAK=head` |
| コメントに名前だけ（行の途中 `#`）を「走っている」に数えない | `BREAK=inline` |
| `echo` の中の名前を呼び出しと読まない | `BREAK=cmd` |
| `python "python/$s.py"` の `$s` を、同じブロックの代入で埋める | `BREAK=var` |
| どこからも呼ばれていない判定器を拾える | `BREAK=orphan` |
| `run:` に在るのにファイルが無い名前を拾える | `BREAK=ghost` |
| 回し役の口が壊れた／1本も返さない → **0 ではなく 2** | `BREAK=runner` |
| 名前で見分ける足 | `BREAK=name` |
| 頭の説明の終了コード表で見分ける足 | `BREAK=decl` |
| 中身の終了コードで見分ける足 | `BREAK=codes` |
| 走るものから import／子として起こされる道を辿る | `BREAK=child` |
| 断りに理由を求める | `BREAK=excuse` |
| 断りの表が腐っていないか | `BREAK=rot` |

**逆側も当てる**——ぜんぶ繋がっている仕込みで **0** が出ること。
これが無いと、「何でも走っていない」と言う道具が対照を通ってしまう。
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent          # python/
REPO = HERE.parent

# 降りていかない場所。**書き出したものは `.js` になるので、ここは短くてよい**
SKIP_DIRS = {"node_modules", "__pycache__"}

# 見に行く拡張子。`.js` は書き出しに山ほど在るので入れない
# （このリポジトリの道具は `.py` か `.mjs`）
LOOK_AT = (".py", ".mjs")

# 輪止め。**回し役 → この道具 → 回し役** の2周目を止める印
GUARD = "ISLAND_WATCH_CENSUS"

# 断りの表
EXCUSE_FILE = "python/watch_excuses.py"

# 1本にかける上限（回し役の `--list` は 0.2 秒で帰る）
TIMEOUT_SEC = 120

# ---- 見分け（中身で決める） ------------------------------------------

# 頭の説明にある「終了コードの表」。`0=通った / 1=見つかった` でも
# `0＝撮れた / 2＝撮るものが無い` でも拾う。**2つ以上の数に意味が
# 割り当ててあること**が条件（1つだけなら、ただの言及かもしれない）
BIND_RE = re.compile(r"(?<![\w.＝=])([0-3])\s*[=＝](?![=＝])")

PY_EXIT_RE = re.compile(r"(?:sys\.)?exit\(\s*(\d+)\s*\)")
PY_CALL_RE = re.compile(r"(?:sys\.exit|raise SystemExit)\(\s*(?:await\s+)?\w[\w.]*\(")
JS_EXIT_RE = re.compile(r"process\.exit\(\s*(\d+)\s*\)|process\.exitCode\s*=\s*(\d+)")
JS_CALL_RE = re.compile(r"process\.exit\(\s*(?!\d)")
# `sys.exit(main())` / `process.exit(main())` の形。main が返す数を拾う
RET_RE = re.compile(r"^[ \t]+return\s+(\d+)\s*;?\s*$", re.M)
# 0 でない合否を立てる。部品（`served.mjs`）はここでしか出ない
JS_SET_RE = re.compile(r"process\.exitCode\s*=\s*(?!0\b)")

# ---- 呼び出しを探す ----------------------------------------------------

# **コマンドの位置**にある名前だけ。`echo "… python/x.py …"` は拾わない。
# 名前に `$s` が入っていてもいったん拾う（下の `expand` で埋める）
CMD_RE = re.compile(
    r"(?:^|[|&;(]|\$\(|\bexec\s+|\b(?:python3?|node|bash|sh)\s+(?:-\S+\s+)*)"
    r"\s*[\"']?([\w./${}-]*[\w}-]+\.(?:py|mjs|js))\b",
    re.M)
# どこに在っても拾う（`BREAK=cmd` のときの、2026-09-19 前の読み方）
ANY_RE = re.compile(r"[\w./-]*[\w-]+\.(?:py|mjs|js)")
# `ALL="build_shorts build_residents …"` のような、同じ `run:` の中の代入
ASSIGN_RE = re.compile(r"^\s*(\w+)=(?:\"([^\"]*)\"|'([^']*)'|(\S+))", re.M)
VAR_RE = re.compile(r"\$\{?(\w+)\}?")

PY_IMPORT_RE = re.compile(r"^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))", re.M)
SPAWN_RE = re.compile(r"subprocess|spawn\(|spawnSync|execFile|child_process|fork\(")


class Broken(Exception):
    """**数えかたのほうが壊れた。** 本物の数字は1つも出さずに 2 で落ちる。"""


def breaks() -> frozenset[str]:
    """`BREAK=` で外す足。対照が落ちることを確かめるためだけに使う。"""
    return frozenset(x for x in os.environ.get("BREAK", "").split(",") if x)


# ---------------------------------------------------------------- 中身を読む

def head_block(text: str, suffix: str) -> str:
    """**頭の説明**だけを取り出す。本文の途中に出る「終了コード」は見ない。

    Python は先頭の docstring、mjs は先頭の `/* */` と、それに続く `//` の連なり。
    """
    if suffix == ".py":
        m = re.match(r'\s*(?:#[^\n]*\n)*\s*("""|\'\'\')', text)
        if not m:
            return ""
        quote = m.group(1)
        end = text.find(quote, m.end())
        return text[m.end():end if end >= 0 else len(text)]
    lines = text.splitlines()
    out: list[str] = []
    i = 0
    while i < len(lines) and not lines[i].strip():
        i += 1
    if i < len(lines) and lines[i].lstrip().startswith("/*"):
        while i < len(lines):
            out.append(lines[i])
            if "*/" in lines[i]:
                i += 1
                break
            i += 1
    while i < len(lines) and lines[i].lstrip().startswith("//"):
        out.append(lines[i])
        i += 1
    return "\n".join(out)


def exit_codes(text: str, suffix: str) -> set[int]:
    """**意図して返す終了コード**を集める。例外で落ちるぶんは数えない。"""
    got: set[int] = set()
    if suffix == ".py":
        got |= {int(m.group(1)) for m in PY_EXIT_RE.finditer(text)}
        if PY_CALL_RE.search(text):       # `sys.exit(main())` の形
            got |= {int(m.group(1)) for m in RET_RE.finditer(text)}
    else:
        for m in JS_EXIT_RE.finditer(text):
            got.add(int(next(g for g in m.groups() if g is not None)))
        if JS_CALL_RE.search(text):       # `process.exit(main())` の形
            got |= {int(m.group(1)) for m in RET_RE.finditer(text)}
    return got


def strip_prose(text: str, suffix: str) -> str:
    """コメントと docstring を落とす。**残るのはコードの中の字だけ。**

    このリポジトリは説明の中で道具の名前を山ほど挙げるので、落とさずに
    探すと「誰かが名前を書いた」だけで「走っている」に化ける。

    Python は**字面ではなく token で**落とす。三重引用符を正規表現で対に
    すると、中に三重引用符を含む1行の字（この道具の仕込みがそれ）で対が
    ずれて、落とすつもりの説明が残る。実際にこの道具が自分の説明を読んで
    「`build_shorts.py` を起こしている」と言った。
    残すのは**1行の字**だけ——`subprocess.run(["python3", "python/x.py"])` の
    パスはそこに在り、説明は三重引用符の側に在る。
    """
    if suffix == ".py":
        import io
        import tokenize
        try:
            out = []
            for tok in tokenize.generate_tokens(io.StringIO(text).readline):
                if tok.type == tokenize.COMMENT:
                    continue
                if tok.type == tokenize.STRING and (
                        "\n" in tok.string or '"""' in tok.string
                        or "'''" in tok.string):
                    continue
                out.append(tok.string)
            return "\n".join(out)
        except (tokenize.TokenError, IndentationError, SyntaxError):
            # 読めない書きかたなら、字面で落とす側に倒す
            text = re.sub(r'"""[\s\S]*?"""|\'\'\'[\s\S]*?\'\'\'', "", text)
            return re.sub(r"(?m)#.*$", "", text)
    text = re.sub(r"/\*[\s\S]*?\*/", "", text)
    return re.sub(r"(?m)(?<!:)//.*$", "", text)


def judges(root: Path, ban: frozenset[str]) -> dict[str, list[str]]:
    """リポジトリに**在る**判定器を、中身で拾う。→ {パス: 当たった足}"""
    out: dict[str, list[str]] = {}
    for p in sorted(root.rglob("*")):
        if not p.is_file() or p.suffix not in LOOK_AT:
            continue
        rel = p.relative_to(root)
        if any(part in SKIP_DIRS or part.startswith(".") for part in rel.parts[:-1]):
            continue
        try:
            text = p.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        why: list[str] = []
        if "name" not in ban and p.name.endswith(("_selftest.py", "_selftest.mjs")):
            why.append("名前")
        if "decl" not in ban:
            head = head_block(text, p.suffix)
            if len({m.group(1) for m in BIND_RE.finditer(head)}) >= 2:
                why.append("宣言")
        if "codes" not in ban:
            if {1, 2} <= exit_codes(text, p.suffix):
                why.append("三値")
            elif p.suffix != ".py" and JS_SET_RE.search(text):
                why.append("合否")
        if why:
            out[rel.as_posix()] = why
    return out


def all_scripts(root: Path) -> dict[str, list[str]]:
    """リポジトリに在る `.py` / `.mjs` を、ファイル名で引けるようにする。"""
    by_name: dict[str, list[str]] = {}
    for p in sorted(root.rglob("*")):
        if not p.is_file() or p.suffix not in LOOK_AT:
            continue
        rel = p.relative_to(root)
        if any(part in SKIP_DIRS or part.startswith(".") for part in rel.parts[:-1]):
            continue
        by_name.setdefault(p.name, []).append(rel.as_posix())
    return by_name


# ---------------------------------------------------------------- 走る道

def ask_runner(root: Path, runner: Path) -> tuple[list[str], dict[str, str]]:
    """**回し役に聞く。** 拾いかたを写経しない（写経すると黙ってずれる）。"""
    if not runner.is_file():
        raise Broken(f"回し役が居ない: {runner}")
    env = dict(os.environ)
    env[GUARD] = "1"        # 輪止め。詳しくは頭のドキュメント
    cmd = [sys.executable, str(runner), "--list", "--json", "--no-drill"]
    try:
        r = subprocess.run(cmd, cwd=root, env=env, capture_output=True,
                           text=True, timeout=TIMEOUT_SEC, check=False)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise Broken(f"回し役の口を叩けなかった: {e}") from e
    if r.returncode != 0:
        tail = (r.stdout + r.stderr).strip().splitlines()
        raise Broken(f"回し役の口が終了コード {r.returncode} で帰ってきた: "
                     + (tail[-1] if tail else "（何も言わない）"))
    try:
        data = json.loads(r.stdout)
        picked = [str(x) for x in data["picked"]]
        skipped = {str(k): str(v) for k, v in data.get("skipped", {}).items()}
    except (ValueError, KeyError, TypeError) as e:
        raise Broken(f"回し役の口が読めない形で帰ってきた: {e}") from e
    if not picked:
        # ここを素通りさせると「ぜんぶ走っています」の嘘になる（§15）
        raise Broken("回し役が1本も返さなかった")
    return picked, skipped


def strip_comments(text: str, ban: frozenset[str]) -> str:
    """シェルのコメントを落とす。**行頭の `#` も、行の途中の `#` も。**"""
    out = []
    for line in text.splitlines():
        if "inline" not in ban:
            line = re.sub(r"\s#.*$", "", line)
        if "head" not in ban:
            line = re.sub(r"^\s*#.*$", "", line)
        out.append(line)
    return "\n".join(out)


def scripts(node) -> list[str]:
    """YAML の木から `run:` の中身だけを集める。

    `name:` や `if:` に出る名前は拾わない——**あれは呼び出しではない。**
    """
    out: list[str] = []
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "run" and isinstance(v, str):
                out.append(v)
            else:
                out += scripts(v)
    elif isinstance(node, list):
        for v in node:
            out += scripts(v)
    return out


def run_names(root: Path,
              ban: frozenset[str]) -> tuple[dict[str, set[str]], set[str]]:
    """`.github/workflows/*.yml` の `run:` が**呼んでいる**名前 → ワークフロー。

    2つめに返すのは「変数を埋めて作った名前」。**当たらなくても幽霊にしない**
    （埋めかたの当てずっぽうを、綴り間違いとして鳴らさない）。
    """
    try:
        import yaml
    except ImportError as e:      # 無い箱で「0本」と言わない
        raise Broken(f"YAML が読めない（`pip install PyYAML`）: {e}") from e

    wf = root / ".github" / "workflows"
    if not wf.is_dir():
        raise Broken(f"ワークフローの置き場が無い: {wf}")
    files = sorted(list(wf.glob("*.yml")) + list(wf.glob("*.yaml")))
    if not files:
        raise Broken(f"ワークフローが1本も無い: {wf}")

    finder = ANY_RE if "cmd" in ban else CMD_RE
    found: dict[str, set[str]] = {}
    soft: set[str] = set()
    for f in files:
        try:
            doc = yaml.safe_load(f.read_text(encoding="utf-8"))
        except yaml.YAMLError as e:
            raise Broken(f"{f.name} が YAML として読めない: {e}") from e
        bodies = [strip_comments(s, ban) for s in scripts(doc)]
        words = assigned(bodies)
        for body in bodies:
            for m in finder.finditer(body):
                token = m.group(m.re.groups)
                names = [token] if "var" in ban else expand(token, words)
                for name in names:
                    if "$" in name:     # 埋まらなかった。当てずに捨てる
                        continue
                    if name != token:
                        soft.add(name)
                    found.setdefault(name, set()).add(f.name)
    return found, soft


def assigned(scripts_in_file: list[str]) -> set[str]:
    """そのワークフローの `run:` の中で、**変数に入れてある語**を集める。"""
    words: set[str] = set()
    for s in scripts_in_file:
        for m in ASSIGN_RE.finditer(s):
            val = m.group(2) or m.group(3) or m.group(4) or ""
            words.update(w for w in val.split() if re.fullmatch(r"[\w.-]+", w))
    return words


def expand(token: str, words: set[str]) -> list[str]:
    """`python "python/$s.py"` の `$s` を、**そのワークフローの代入で埋める。**

    `rebake.yml` は焼くものを `ALL="build_chapter_stats … build_shorts …"` と
    並べておいて、別の step で `for s in $sel; do python "python/$s.py"; done`
    と回す。**名前が字として出てこない**ので、`run:` をそのまま読むと
    8本まるごと「走っていない」に出る（`python/build_shorts.py` がそれだった）。

    当てずっぽうにならないのは、埋めた先が**実在するファイルに当たったときだけ**
    走る道に数えるから（当たらなければ捨てる。幽霊にもしない）。
    外から来る値（`${{ inputs.script }}`）は語の形にならないので埋まらない
    ——**当たらないものを勝手に当てない**のが、ここの決め。
    """
    if "$" not in token:
        return [token]
    return [VAR_RE.sub(w, token) for w in sorted(words)]


def resolve(token: str, root: Path, by_name: dict[str, list[str]]) -> str | None:
    """`run:` に書いてある名前を、リポジトリの中の1本に当てる。

    当たらなければ `None`（＝呼んでいる先が無い）。
    `rebake.yml` は `working-directory: site` で `node selftest/x.mjs` と
    書くので、**書いてあるままでは当たらない。** 末尾の名前で引き直す。
    """
    if token.startswith("/"):
        # `/tmp/frozen.py` のような、リポジトリの外の置き場。ここでは数えない
        return None
    p = root / token
    if p.is_file():
        return p.resolve().relative_to(root.resolve()).as_posix()
    cands = by_name.get(token.rsplit("/", 1)[-1], [])
    if len(cands) == 1:
        return cands[0]
    if len(cands) > 1:
        # 同じ名前が2か所に在ると、どちらを呼んでいるのか決められない。
        # **勝手に決めない**（片方だけ走っているのを両方走っていると読む）
        raise Broken(f"同じ名前の判定器が2か所にある: {token} → {cands}")
    return None


def children(root: Path, seeds: set[str],
             by_name: dict[str, list[str]]) -> dict[str, str]:
    """走るものから、**import／子として起こされる**ぶんを辿る。→ {子: 親}

    `python/dead_stream_watch.py` がこれ。毎晩 `rebake.yml` が
    `python/build_dead_streams.py` を回し、あちらが `import dead_stream_watch`
    して**その目をそのまま借りている**。`run:` を見るだけでは出てこない。

    **コメントと docstring は先に落とす**（名前を挙げただけで「走る」に
    化けるのを止める）。
    """
    # **順番を決めておく。** 辿る順で「親」が入れ替わると、同じリポジトリを
    # 2回数えて違う答えが出る（出るものは同じでも、読む人には別物に見える）
    found: dict[str, str] = {}
    seen: set[str] = set()
    queue = sorted(seeds)
    while queue:
        rel = queue.pop(0)
        if rel in seen:
            continue
        seen.add(rel)
        p = root / rel
        if not p.is_file() or p.suffix not in LOOK_AT:
            continue
        try:
            text = strip_prose(p.read_text(encoding="utf-8"), p.suffix)
        except (OSError, UnicodeDecodeError):
            continue
        kids: set[str] = set()
        # import（Python だけ。同じ置き場のモジュールとして引く）
        for m in PY_IMPORT_RE.finditer(text):
            mod = (m.group(1) or m.group(2) or "").split(".")[0]
            for cand in by_name.get(f"{mod}.py", []):
                kids.add(cand)
        # 子として起こす（`subprocess` / `spawn` を持つファイルだけ見る）
        if SPAWN_RE.search(text):
            for m in ANY_RE.finditer(text):
                hit = resolve(m.group(0), root, by_name)
                if hit:
                    kids.add(hit)
        for k in sorted(kids - seen):
            found.setdefault(k, rel)
            queue.append(k)
    return found


# ---------------------------------------------------------------- 断りの表

def load_excuses(root: Path) -> dict[str, str]:
    """`python/watch_excuses.py` の `EXCUSES` を読む。**動かさずに読む。**"""
    p = root / EXCUSE_FILE
    if not p.is_file():
        raise Broken(f"断りの表が無い: {p}")
    try:
        tree = ast.parse(p.read_text(encoding="utf-8"))
    except (OSError, SyntaxError) as e:
        raise Broken(f"断りの表が読めない: {e}") from e
    for node in tree.body:
        targets = (node.targets if isinstance(node, ast.Assign)
                   else [node.target] if isinstance(node, ast.AnnAssign) else [])
        for t in targets:
            if isinstance(t, ast.Name) and t.id == "EXCUSES" and node.value is not None:
                try:
                    got = ast.literal_eval(node.value)
                except ValueError as e:
                    raise Broken(f"断りの表が字の並びとして読めない: {e}") from e
                if not isinstance(got, dict):
                    raise Broken("断りの表が dict ではない")
                return {str(k): str(v) for k, v in got.items()}
    raise Broken(f"断りの表に `EXCUSES` が無い: {p}")


DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")


def bad_reason(why: str) -> str | None:
    """理由として受け取れない形なら、その訳を返す。**書かないと足せない。**"""
    s = why.strip()
    if not s:
        return "理由が空"
    if len(s) < 12:
        return f"理由が短すぎる（{len(s)}文字。「重い」だけで断らない）"
    if not DATE_RE.search(s):
        return "いつ時点の話かの日付（2026-09-19 の形）が無い"
    return None


# ---------------------------------------------------------------- 棚卸し

def census(root: Path, runner: Path, ban: frozenset[str]) -> dict:
    """棚卸しする。数えられなければ `Broken`。"""
    have = judges(root, ban)
    if not have:
        raise Broken(f"判定器を1本も見つけられなかった（見に行った先: {root}）")
    by_name = all_scripts(root)

    try:
        picked, skipped = ask_runner(root, runner)
    except Broken:
        if "runner" not in ban:
            raise
        # BREAK=runner: 口が壊れた晩に「拾えたもの0本」で先へ進む＝いちばん悪い嘘
        picked, skipped = [], {}

    named, soft = run_names(root, ban)
    called: dict[str, set[str]] = {}
    ghosts: dict[str, set[str]] = {}
    for token, where in sorted(named.items()):
        hit = resolve(token, root, by_name)
        if hit is None and token in soft:
            continue                    # 変数を埋めて作った名前。外れて当然
        if hit is None:
            # 幽霊とみなすのは「このリポジトリの中を指しているつもりの名前」だけ。
            # 外の道具の名前で騒がない
            head = token.split("/", 1)[0]
            # `node_modules` の中は git に無いので、無くて当たり前
            in_skip = any(part in SKIP_DIRS for part in token.split("/"))
            looks_inside = not token.startswith("/") and not in_skip and (
                "_selftest." in token
                or ("/" in token and head and (root / head).is_dir()))
            if looks_inside and "ghost" not in ban:
                ghosts.setdefault(token, set()).update(where)
        else:
            called.setdefault(hit, set()).update(where)

    seeds = set(picked) | set(called)
    kids = {} if "child" in ban else children(root, seeds, by_name)
    covered = seeds | set(kids)

    excuses = load_excuses(root)
    rot: list[str] = []
    if "rot" not in ban:
        for n in sorted(excuses):
            if not (root / n).is_file():
                rot.append(f"{n} … 表に在るのに、そのファイルが無い")
            elif n in covered:
                rot.append(f"{n} … 断ってあるのに、実は走っている（断りが古い）")
            elif n not in have:
                rot.append(f"{n} … 判定器として拾えていない（見分けが変わった）")
    if "excuse" not in ban:
        for n in sorted(excuses):
            why = bad_reason(excuses[n])
            if why:
                rot.append(f"{n} … {why}")
    if rot:
        raise Broken("断りの表が腐っている:\n  ✕ " + "\n  ✕ ".join(rot))

    orphans = [w for w in sorted(have) if w not in covered and w not in excuses]
    if "orphan" in ban:
        orphans = []
    return {
        "all": sorted(have),
        "why": dict(sorted(have.items())),
        "picked": sorted(set(picked) & set(have)),
        "called": {k: sorted(v) for k, v in sorted(called.items()) if k in have},
        "kids": {k: v for k, v in sorted(kids.items()) if k in have},
        "skipped": skipped,
        "excused": {k: excuses[k] for k in sorted(excuses)},
        "orphans": orphans,
        "both": sorted(set(picked) & set(called)),
        "ghosts": {k: sorted(v) for k, v in sorted(ghosts.items())},
    }


def report(c: dict) -> None:
    """人が読む形。**分母から出す**（`docs/island-standards.md` §15）。"""
    legs: dict[str, int] = {}
    for why in c["why"].values():
        for w in why:
            legs[w] = legs.get(w, 0) + 1
    runs = set(c["picked"]) | set(c["called"]) | set(c["kids"])
    print(f"[見張りの棚卸し] 在る判定器 {len(c['all'])}本"
          "（名前ではなく中身で見分けた）")
    print("  見分けの足            " + " / ".join(
        f"{k} {v}本" for k, v in sorted(legs.items(), key=lambda x: -x[1])))
    print(f"  回し役が拾う          {len(c['picked'])}本"
          "（python/selftest_runner.py --list）")
    print(f"  ワークフローの run:   {len(c['called'])}本")
    print(f"  そこから起こされる    {len(c['kids'])}本")
    for n, parent in c["kids"].items():
        print(f"    ・{n} ← {parent}")
    print(f"  どれかの道で走る      {len(runs)}本")
    print(f"  走らせないと決めた    {len(c['excused'])}本（理由つき）")
    print(f"  数えた合計            {len(runs) + len(c['excused'])}"
          f" / {len(c['all'])}本")
    if c["skipped"]:
        print(f"  回し役が理由つきで外している {len(c['skipped'])}本")
        for n, why in sorted(c["skipped"].items()):
            print(f"    — {n} … {why}")

    print()
    print(f"走らせないと決めたもの（断り）: {len(c['excused'])}本")
    for n, why in c["excused"].items():
        print(f"  — {n}")
        print(f"      {why}")

    print()
    print(f"どこからも走らず、断りも無い判定器: {len(c['orphans'])}本")
    for n in c["orphans"]:
        print(f"  ✕ {n}（見分けの足: {' / '.join(c['why'][n])}）")
    print()
    print(f"回し役と run: の両方から走るもの: {len(c['both'])}本")
    for n in c["both"]:
        print(f"  ・{n}（回し役 ＋ {' / '.join(c['called'][n])}）")
    print()
    print(f"run: に名前が出ているのに、そのファイルが無いもの: {len(c['ghosts'])}本")
    for n, where in c["ghosts"].items():
        print(f"  ✕ {n}（{' / '.join(where)}）")


# ---------------------------------------------------------------- 対照

# 仕込みの判定器。**足ごとに、当たる印を1つだけ持たせる**
BODY = {
    # 名前でしか当たらない（宣言も三値も持たない）
    "名前": "print('ok')\n",
    # 宣言でしか当たらない
    "宣言": '"""仕込み。\n\n終了コード 0=通った / 1=見つかった\n"""\nprint("ok")\n',
    # 三値でしか当たらない（頭に説明を置かない）
    "三値": "import sys\nif False:\n    sys.exit(1)\nsys.exit(2)\n",
}


def fixture(box: Path, kind: str) -> Path:
    """答えの分かっている、偽のリポジトリを作る。"""
    root = box / kind
    (root / ".github" / "workflows").mkdir(parents=True)
    (root / "python").mkdir(parents=True)
    (root / "fake").mkdir(parents=True)

    def put(rel: str, leg: str = "名前") -> None:
        (root / rel).write_text(BODY[leg], encoding="utf-8")

    excuses: dict[str, str] = {}

    if kind in ("clean", "noreason", "stale", "badrunner", "emptyrunner", "nowatch"):
        # ぜんぶ繋がっている。**ここで 0 が出ないと、対照になっていない**
        put("python/called_selftest.py")
        put("python/picked_selftest.py")
        put("python/decl_tool.py", "宣言")
        put("python/codes_tool.py", "三値")
        put("python/kid_tool.py", "宣言")          # 親から起こされる
        put("python/echoed_tool.py", "宣言")       # echo に名前が出るだけ
        put("python/excused_tool.py", "三値")      # 断ってある
        put("python/var_tool.py", "宣言")          # 名前が変数で渡る
        # 親。`run:` から走り、子を起こす
        (root / "python" / "parent.py").write_text(
            "import subprocess\n"
            "subprocess.run(['python3', 'python/kid_tool.py'], check=False)\n",
            encoding="utf-8")
        wf = """
name: fake
on: push
jobs:
  a:
    steps:
      - run: python3 python/called_selftest.py
      - run: python3 python/decl_tool.py
      - run: python3 python/codes_tool.py
      - run: python3 python/parent.py
      - run: echo "（python/echoed_tool.py を回すと分かる）"
      - run: |
          ALL="var_tool"
          for s in $ALL; do python "python/$s.py"; done
"""
        picks = ["python/picked_selftest.py", "python/called_selftest.py"]
        excuses = {
            "python/echoed_tool.py":
                "お知らせに名前が出るだけで、誰も呼んでいない（2026-09-19 に確かめた）",
            "python/excused_tool.py":
                "人が絵を見るための道具なので繋がない（2026-09-19 に決めた）",
        }
        if kind == "noreason":
            # **理由を消す。** ここが通ると「黙って0に畳む」に戻る
            excuses["python/excused_tool.py"] = ""
        if kind == "stale":
            # 走っているのに断りが残っている
            excuses["python/decl_tool.py"] = "もう走らせていない（2026-09-19 に確かめた）"
    else:
        # 穴だらけ。名前がコメントにしか出ない4通り・迷子3種・幽霊・二重
        put("python/called_selftest.py")
        put("python/picked_selftest.py")
        put("python/both_selftest.py")
        put("python/lonely_selftest.py", "名前")       # 名前でしか当たらない
        put("python/lonelydecl_tool.py", "宣言")       # 宣言でしか当たらない
        put("python/lonelycodes_tool.py", "三値")      # 三値でしか当たらない
        put("python/yamlhead_selftest.py")
        put("python/yamlinline_selftest.py")
        put("python/shellhead_selftest.py")
        put("python/shellinline_selftest.py")
        # `python/ghost_selftest.py` は**わざと置かない**
        wf = """
name: fake
on: push
jobs:
# python3 python/yamlhead_selftest.py   ← YAML のコメント（行頭）
  a:
    steps:
      - run: python3 python/called_selftest.py
      - run: python3 python/both_selftest.py
      - name: これは呼び出しではない
        run: echo hi   # python3 python/yamlinline_selftest.py
      - run: |
          # python3 python/shellhead_selftest.py
          echo ok   # python3 python/shellinline_selftest.py
          python3 python/ghost_selftest.py
"""
        picks = ["python/picked_selftest.py", "python/both_selftest.py"]

    if kind == "nowatch":
        for p in (root / "python").glob("*.py"):
            if p.name != "watch_excuses.py":
                p.unlink()
        excuses = {}

    (root / ".github" / "workflows" / "fake.yml").write_text(wf, encoding="utf-8")
    (root / EXCUSE_FILE).write_text(
        '"""仕込みの断り。"""\nEXCUSES = '
        + json.dumps(excuses, ensure_ascii=False, indent=4) + "\n",
        encoding="utf-8")

    # 偽の回し役。**本物は呼ばない**（対照は答えが分かっていないと対照でない）
    body = {
        "badrunner": "import sys\nprint('壊れた')\nsys.exit(2)\n",
        "emptyrunner": "import json\nprint(json.dumps({'picked': [], 'skipped': {}}))\n",
    }.get(kind, "import json\nprint(json.dumps("
           + json.dumps({"picked": picks, "skipped": {}}) + "))\n")
    runner = root / "fake" / "runner.py"
    runner.write_text(body, encoding="utf-8")
    return root


def drill() -> bool:
    """**本物を1本も数える前に、自分が落ちられるかを実測する。**"""
    ok = True
    me = Path(__file__).resolve()

    # 穴だらけの仕込みで、出てほしい答え
    want_orphans = sorted([
        "python/lonely_selftest.py",
        "python/lonelycodes_tool.py",
        "python/lonelydecl_tool.py",
        "python/shellhead_selftest.py",
        "python/shellinline_selftest.py",
        "python/yamlhead_selftest.py",
        "python/yamlinline_selftest.py",
    ])
    want_ghosts = ["python/ghost_selftest.py"]

    cases = [
        # 仕込み, 欲しい終了コード, 欲しい中身, 何を見ているか
        # `called` は回し役にも `run:` にも出す。**「二重に走っている」を数え
        # られること**まで、通る側の仕込みで見る
        ("clean", 0, {"orphans": [], "ghosts": [],
                      "both": ["python/called_selftest.py"],
                      "kids": ["python/kid_tool.py"],
                      "excused": ["python/echoed_tool.py",
                                  "python/excused_tool.py"]},
         "ぜんぶ繋がっていれば 0（子・断り・二重の1本も出る）"),
        ("dirty", 1, {"orphans": want_orphans, "ghosts": want_ghosts,
                      "both": ["python/both_selftest.py"]},
         "コメントだけの4本と迷子3種を拾い、幽霊も出す"),
        ("noreason", 2, None, "断りに理由が無ければ 2"),
        ("stale", 2, None, "走っているのに断りが残っていたら 2"),
        ("nowatch", 2, None, "判定器が1本も無ければ 2"),
        ("badrunner", 2, None, "回し役の口が壊れたら 2"),
        ("emptyrunner", 2, None, "回し役が0本を返したら 2"),
    ]

    with tempfile.TemporaryDirectory() as tmp:
        box = Path(tmp)
        for kind, want, need, why in cases:
            root = fixture(box, kind)
            r = subprocess.run(
                [sys.executable, str(me), "--root", str(root),
                 "--runner", str(root / "fake" / "runner.py"),
                 "--no-drill", "--json"],
                capture_output=True, text=True, timeout=TIMEOUT_SEC, check=False)
            got = r.returncode
            hit = True
            detail = ""
            if need is not None:
                try:
                    c = json.loads(r.stdout)
                except ValueError:
                    hit, detail = False, "（JSON が出ない）"
                else:
                    for key, val in need.items():
                        mine = list(c[key]) if isinstance(c[key], list) \
                            else sorted(c[key])
                        if mine != val:
                            hit = False
                            detail += f"\n      {key}: {mine}\n      欲しいのは {val}"
            mark = "○" if (got == want and hit) else "✕"
            if mark == "✕":
                ok = False
            print(f"  {mark} {kind} → 終了コード {got}（欲しいのは {want}）… {why}"
                  + detail)

    ban = breaks()
    print("  " + ("○ 数えかたは落ちられる" if ok else "✕ 対照が外れた")
          + (f"（BREAK={','.join(sorted(ban))} を当てている）" if ban else ""))
    return ok


def main() -> int:
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--root", default=None, help="数える先（既定: このリポジトリ）")
    ap.add_argument("--runner", default=None,
                    help="回し役（既定: <root>/python/selftest_runner.py）")
    ap.add_argument("--json", action="store_true", help="機械で読む形で出す")
    ap.add_argument("--only-drill", action="store_true", help="対照だけ回して帰る")
    ap.add_argument("--no-drill", action="store_true", help="対照を飛ばす（対照の中から）")
    a = ap.parse_args()

    if os.environ.get(GUARD):
        # 輪止め。**回し役の中の回し役**から起こされた。ここで数えると輪になる
        print("[見張りの棚卸し] 回し役の中から起こされたので、何も数えない")
        return 0

    if not a.no_drill:
        print("[対照] 答えの分かっている仕込みで、先に自分を試す")
        if not drill():
            print("\n✕ 対照が外れた。**本物の数字は1つも出していない**")
            return 2
        if a.only_drill:
            return 0
        print()

    root = Path(a.root).resolve() if a.root else REPO
    runner = (Path(a.runner).resolve() if a.runner
              else root / "python" / "selftest_runner.py")

    try:
        c = census(root, runner, breaks())
    except Broken as e:
        print(f"✕ 数えられなかった: {e}")
        print("**「数えられていない判定器は無い」とは言わない**")
        return 2

    if a.json:
        print(json.dumps(c, ensure_ascii=False, sort_keys=True, default=sorted))
    else:
        report(c)

    if c["orphans"] or c["ghosts"]:
        if not a.json:
            print()
            if c["orphans"]:
                print(f"✕ {len(c['orphans'])}本が、どこからも走らず、断りも書いていない")
                print("  走らせる道を足すか、`python/watch_excuses.py` に"
                      "**理由つきで**断りを書く")
            if c["ghosts"]:
                # ここが鳴らないと、綴り間違いはワークフローが落ちるまで出ない
                print(f"✕ {len(c['ghosts'])}本、呼んでいる先のファイルが無い")
        return 1

    if not a.json:
        print()
        print("○ 在る判定器は、どれかの道から走るか、理由つきで断ってある")
    return 0


if __name__ == "__main__":
    sys.exit(main())
