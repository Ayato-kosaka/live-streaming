"""**見張りが「落ちるときに落ちる」かを、守っている実物を壊して確かめる。**

    python3 python/mutation_drill.py                 # 当てられるもの全部
    python3 python/mutation_drill.py --list          # 何に当てるかだけ出す
    python3 python/mutation_drill.py --only py       # 当てかたを選ぶ（py / mjs / repo）
    python3 python/mutation_drill.py python/x_selftest.py …   # 名指し
    python3 python/mutation_drill.py --self-drill    # この道具自身の対照だけ

終了コード 0=当てたものは全部赤くなった / **1=緑のままのものが在った** /
**2=1本も当てられなかった・ほかの試験と混んでいた**（`docs/island-standards.md` §15）。

## なぜ要るか（2026-10-13）

このリポジトリには見張りが120本あって、**どれも緑**だった。
緑は2通りに読める——「守れている」と「**何も見ていない**」。
見分けるには、**守っている実物をわざと壊して、赤くなるかを見る**しかない
（`docs/island-standards.md` §15「いつも緑の CI は、何も守っていないのに
守っている気にさせる」）。

ところが、それを機械で当てる道具が**1本も無かった。**
在ったのは `selftest_runner.py --only-drill`——**回し役そのもの**が落ちられるか
だけで、**個々の見張りが落ちられるか**は誰も測っていなかった。
いちど手で当てて「対照を持っていない見張りは0本」と出したが、
**手で当てたものは、次の人の手元に残らない。**

## 当てかたは3つ。**当てられないものは「当てられない」と出す**

| | どれに | 何を壊すか |
| --- | --- | --- |
| `py` | `X_selftest.py` の隣に `X.py` が在るもの | `X.py` の比較演算子を**全部ひっくり返す**（`==`↔`!=`、`<`↔`>=` …） |
| `mjs` | `X_selftest.mjs` が `readFileSync` で名指ししている実物 | その実物の `===`↔`!==` を全部ひっくり返す |
| `repo` | リポジトリそのものを読む見張り | 下の `REPO_CASES`（何をどう壊すかを1件ずつ書いてある） |

**「当てられなかった」を 0 に混ぜない。** 当てた本数・赤くなった本数・
当てられなかった本数と**その理由**を、毎回ぜんぶ出す（§15）。

## 壊したものは、必ず戻る

戻しかたは**退避の写しではなく `git checkout --`**。
写しを置く形だと、道具が途中で死んだとき（`kill -9` は捕まえられない）
写しだけが残って実物が壊れたままになる。git なら、**次に誰が何をしても
HEAD の字に戻せる。**

そのために、**手元で直しかけのファイルには当てない。**
`git status` で汚れているものは「直しかけ」として飛ばす。
**他人の作業を踏んで戻す、が起きないようにするため。**

## 並べて回さない

2026-10-13 に、この当てかたを手で回しながら見張り120本も同時に回して、
**関係のない見張り（`ts_readers`）が1本、嘘の赤を出した。**
当てているあいだ実物が別の字になっているので、同じものを読む見張りが
巻き添えになる（`docs/island-standards.md` §13「測るために作った仕掛けが、
測る対象を変えてしまっている」）。

だから、

  1. **鍵を1つ取る**（`flock`）。2本目は走らずに 2 で帰る
  2. **ほかの見張りが走っていたら、当てずに 2 で帰る**（`pgrep`）

## 毎 PR には載せない

実物を壊すので、**同じ置き場でほかの job が走っていると巻き添えになる。**
1本あたり数秒 × 当てられる本数ぶんかかるのもある。
手で押す口（`.github/workflows/mutation_drill.yml`）に置いてある。
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# 1本にかける上限。止まったものは「当てられなかった」であって「赤」ではない
TIMEOUT_SEC = 600

# ほかの試験が走っていないかを見るときの、名前の手がかり
BUSY_HINTS = ("_selftest.py", "_selftest.mjs", "selftest_runner.py")

LOCK = Path(tempfile.gettempdir()) / "island-mutation-drill.lock"
JOURNAL = Path(tempfile.gettempdir()) / "island-mutation-drill.journal"

FLIP = {ast.Eq: ast.NotEq, ast.NotEq: ast.Eq, ast.Lt: ast.GtE, ast.GtE: ast.Lt,
        ast.Gt: ast.LtE, ast.LtE: ast.Gt, ast.In: ast.NotIn, ast.NotIn: ast.In,
        ast.Is: ast.IsNot, ast.IsNot: ast.Is}


# ---- `repo`: リポジトリそのものを読む見張り --------------------------
#
# **ここに書くのは「どこを壊すと、この見張りが気づかないといけないか」。**
# 当てずっぽうの壊しかたを書かない——`bake_order` に繋ぎ先の `name:` を
# 当てて「緑のまま」と出したことがある。**壊した先が、その見張りの
# 持ち場でなかっただけ**で、対照が無いわけではなかった。
REPO_CASES: list[dict] = [
    {"watch": "python/workflow_link_selftest.py",
     "file": ".github/workflows/rebake.yml",
     "old": "name: 島の数字を焼き直す", "new": "name: 島の数字をヤキナオス",
     "why": "繋ぎ先の `name:` を書き換える（繋ぎが黙って切れる形）"},
    {"watch": "python/bake_order_selftest.py",
     "file": ".github/workflows/rebake.yml",
     "old": "- name: 凍っていないか", "new": "- name: コオッテイナイカ",
     "why": "凍結の関所の step 名を変える（切り出せなくなる）"},
    {"watch": "python/rebake_summary_selftest.py",
     "file": ".github/workflows/rebake.yml",
     "old": "master には入れていません", "new": "master にはイレテイマセン",
     "all": True,
     "why": "落ちた回の要約の字を変える（入れたかどうかを言い違える）"},
    {"watch": "python/logsafe_wiring_selftest.py",
     "file": ".github/workflows/schedule_fetch_chat.yml",
     "old": "python3 python/logsafe_selftest.py",
     "new": "python3 -c pass  # 素性の見張りを外した",
     "why": "毎晩の取り込みから、素性の見張りの step を外す"},
    {"watch": "python/watch_census_selftest.py",
     "file": "python/watch_excuses.py",
     "old": "EXCUSES: dict[str, str] = {",
     "new": "EXCUSES: dict[str, str] = {}\nEXCUSES_OLD = {",
     "why": "走らせないと決めたものの表を空にする（断りが黙って0に畳む形）"},
    {"watch": "python/channel_alias_nightly_selftest.py",
     "file": ".github/workflows/channel_alias_nightly.yml",
     "old": 'workflows: ["Fetch Doneru Donations"]',
     "new": 'workflows: ["Fetch Doneru Donationz"]',
     "why": "繋ぎ先の綴りを1文字変える"},
    {"watch": "python/failed_reentry_nightly_selftest.py",
     "file": ".github/workflows/failed_reentry_nightly.yml",
     "old": 'workflows: ["Fetch Doneru Donations"]',
     "new": 'workflows: ["Fetch Doneru Donationz"]',
     "why": "繋ぎ先の綴りを1文字変える"},
    {"watch": "python/cron_lag_selftest.py",
     "file": "python/cron_lag.py",
     "old": "d = (t - p).total_seconds() / 3600",
     "new": "d = (t - p).total_seconds() / 60",
     "why": "遅れの単位を時間から分にする（数が60倍になる）"},
]


# ---- git で戻す ------------------------------------------------------

def git(*a: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(REPO), *a],
                          capture_output=True, text=True, check=False)


def dirty() -> set[str]:
    """手元で直しかけのファイル。**ここには当てない。**"""
    r = git("status", "--porcelain")
    out = set()
    for ln in r.stdout.splitlines():
        if len(ln) > 3:
            out.add(ln[3:].split(" -> ")[-1].strip())
    return out


def restore(rel: str) -> bool:
    """HEAD の字に戻す。戻ったかどうかを返す。"""
    git("checkout", "--", rel)
    return not git("diff", "--quiet", "--", rel).returncode


def journal_write(rel: str | None) -> None:
    try:
        JOURNAL.write_text(json.dumps({"path": rel, "at": time.time()}),
                           encoding="utf-8")
    except OSError:
        pass


def journal_recover() -> str | None:
    """前の回が死んで、壊したまま残っていたら戻す。"""
    try:
        if not JOURNAL.is_file():
            return None
        rel = json.loads(JOURNAL.read_text(encoding="utf-8")).get("path")
    except (OSError, ValueError):
        return None
    journal_write(None)
    if rel and git("diff", "--quiet", "--", rel).returncode:
        restore(rel)
        return rel
    return None


# ---- 壊しかた --------------------------------------------------------

class Flipper(ast.NodeTransformer):
    def __init__(self) -> None:
        self.n = 0

    def visit_Compare(self, node: ast.Compare) -> ast.Compare:
        self.generic_visit(node)
        ops = []
        for op in node.ops:
            t = FLIP.get(type(op))
            if t:
                self.n += 1
                ops.append(t())
            else:
                ops.append(op)
        node.ops = ops
        return node


def mutate_py(src: str) -> tuple[str, int] | None:
    """比較演算子を全部ひっくり返す。1つも無ければ None。"""
    tree = ast.parse(src)
    f = Flipper()
    tree = f.visit(tree)
    ast.fix_missing_locations(tree)
    if f.n == 0:
        return None
    return ast.unparse(tree), f.n


# **`<` と `>` はひっくり返さない。** TS の総称（`Array<T>`）や JSX の札と
# 見分けが付かず、字が壊れて「読めないから赤」になる。それは対照ではない。
JS_EQ = {"===": "!==", "!==": "===", "==": "!=", "!=": "=="}
JS_BOOL = {"&&": "||", "||": "&&"}


def mutate_js(src: str) -> tuple[str, int] | None:
    """等しさを見るところをひっくり返す。無ければ、かつ／または を入れ替える。

    等しさのほうを先に使うのは、**字が通るまま意味だけ変わる**から。
    かつ／または は型が変わって `tsc` が落ちることがあり、そうなると
    「読めないから赤」になって、**見張りが中身を見ている証拠にならない。**
    """
    n = len(re.findall(r"===|!==|(?<![=!<>])==(?!=)|(?<![=!<>])!=(?!=)", src))
    if n:
        return re.sub(r"===|!==|(?<![=!<>])==(?!=)|(?<![=!<>])!=(?!=)",
                      lambda m: JS_EQ[m.group(0)], src), n
    n = len(re.findall(r"&&|\|\|", src))
    if n:
        return re.sub(r"&&|\|\|", lambda m: JS_BOOL[m.group(0)], src), n
    # 定数の表（比べるところが1つも無い字）。**数を1つだけ動かす。**
    # 丸ごと壊すと「読めないから赤」になって、見張りが中身を見ている
    # 証拠にならないので、**1か所だけ**
    m = re.search(r"(?<![\w.])(\d+)(?![\w.])", src)
    if m:
        return src[:m.start()] + str(int(m.group(1)) + 1) + src[m.end():], 1
    return None


# `functions/selftest/*.mjs` は、**`tsc` が書き出した `functions/lib/*.js`** を
# 読む。あれを壊しても意味がない——見張りが自分で `tsc` を回し直すので、
# 読む前に元の字へ戻ってしまう。**壊すのは元の TypeScript。**
BUILT = {"functions/lib": "functions/src", "site/.next": None}


def _consts(text: str, here: Path) -> dict[str, Path]:
    """`const X = join(…)` の形を、道に直しておく。

    **素直に `join(here, …)` と書いてあるものばかりではない。**
    `const LIB = join(FUNCTIONS, "lib")` のように**前に出た名前**を
    踏み台にしているほうが多いので、上から順に解いていく。
    """
    out: dict[str, Path] = {}
    for m in re.finditer(r"^\s*const\s+(\w+)\s*=\s*([^;\n]+)", text, re.M):
        name, expr = m.group(1), m.group(2)
        if "import.meta.url" in expr:
            out[name] = here
            continue
        mm = re.match(r"(?:join|resolve)\(\s*([^)]*)\)", expr.strip())
        if not mm:
            continue
        base: Path | None = None
        parts: list[str] = []
        for a in [x.strip() for x in mm.group(1).split(",") if x.strip()]:
            if a.startswith(('"', "'")):
                parts.append(a.strip("\"'"))
            elif a in out:
                if parts:
                    break
                base = out[a]
            elif "import.meta.url" in a or a in ("here", "HERE"):
                base = here
            else:
                base = None
                break
        if base is not None:
            out[name] = base.joinpath(*parts)
    return out


def _as_source(p: Path) -> Path | None:
    """道を、**壊してよい元の字**に直す。書き出したものは元へ遡る。"""
    try:
        rel = p.resolve().relative_to(REPO).as_posix()
    except ValueError:
        return None
    if "node_modules" in rel.split("/"):
        return None
    for built, src in BUILT.items():
        if rel.startswith(built + "/"):
            if src is None:
                return None
            cand = REPO / src / (Path(rel).stem + ".ts")
            return cand if cand.is_file() else None
    q = REPO / rel
    if q.is_file() and q.suffix in (".ts", ".tsx", ".js", ".mjs"):
        return q
    return None


def mjs_subject(path: Path) -> Path | None:
    """`X_selftest.mjs` が読んでいる実物を、字から当てる。"""
    text = path.read_text(encoding="utf-8", errors="replace")
    here = path.parent
    consts = _consts(text, here)
    cands: list[Path] = []

    def add(p: Path) -> None:
        s = _as_source(p)
        if s and s != path and s not in cands:
            cands.append(s)

    # `join(X, "a", "b.js")` / `join(here, "..", "lib", "x.ts")`
    for m in re.finditer(r"(?:join|resolve)\(\s*([^()]*?)\s*\)", text):
        args = [x.strip() for x in m.group(1).split(",") if x.strip()]
        if not args:
            continue
        head, rest = args[0], args[1:]
        if not all(a.startswith(('"', "'")) for a in rest):
            continue
        base = consts.get(head) or (here if head in ("here", "HERE") else None)
        if base is None:
            continue
        add(base.joinpath(*[a.strip("\"'") for a in rest]))

    # `readFileSync(CONST, …)` — 定数そのものがファイルを指している形
    for m in re.finditer(r"readFileSync\(\s*(\w+)\s*[,)]", text):
        if m.group(1) in consts:
            add(consts[m.group(1)])

    if not cands:
        return None
    # いちばん「守っていそう」なもの——`src` か `lib` の下を先に採る
    cands.sort(key=lambda p: (0 if "/src/" in p.as_posix()
                              or "/lib/" in p.as_posix() else 1,
                              len(p.as_posix())))
    return cands[0]


# ---- 当てる ----------------------------------------------------------

def run_watch(rel: str) -> int:
    head = ["node"] if rel.endswith(".mjs") else [sys.executable]
    env = dict(os.environ)
    env.setdefault("BQ_PROJECT_ID", "mutation-drill-no-such-project")
    try:
        r = subprocess.run([*head, rel], cwd=REPO, env=env, capture_output=True,
                           text=True, timeout=TIMEOUT_SEC, check=False)
        return r.returncode
    except subprocess.TimeoutExpired:
        return -1
    except OSError:
        return -2


def reads_it(rel: str, target: Path) -> bool | None:
    """**この見張りは、本当にこのファイルを読んでいるか。**

    `py` と `mjs` の当て先は字から推したものなので、**当て違いがある。**
    当て違いのまま「緑のまま＝対照が無い」と出すと、**無実の見張りを
    名指しする**（2026-10-13 に `bake_order` で1回やった）。

    だから、緑のままだったものだけ、**そのファイルを読めない字に潰して**
    もう一度回す。それでも緑なら、**読んでいない**＝当て先が違う。
    """
    tgt = target.relative_to(REPO).as_posix()
    src = target.read_text(encoding="utf-8")
    journal_write(tgt)
    try:
        target.write_text("/*(((壊した)))*/ (((\n" * 3, encoding="utf-8")
        rc = run_watch(rel)
    finally:
        back = restore(tgt)
        journal_write(None)
    if not back:
        return None
    return rc != 0


def attempt(rel: str, target: Path, make, why: str) -> dict:
    """1本当てる。**壊したものは、何があっても戻す。**"""
    tgt = target.relative_to(REPO).as_posix()
    src = target.read_text(encoding="utf-8")
    try:
        out = make(src)
    except SyntaxError as e:
        return {"watch": rel, "skip": f"{tgt} が読めない（{e}）"}
    if out is None:
        return {"watch": rel, "skip": f"{tgt} に壊すところが無い"}
    new, n = out

    base = run_watch(rel)
    if base != 0:
        # **1回で決めない。** 当てているあいだ箱は混んでいて、子を何本も
        # 起こす見張り（`python/admin/characters_*`）は、素で回せば通るのに
        # ここだけ落ちることがある（2026-10-13 に3本で実際に起きた）。
        # **混んでいて落ちたものを「壊れている」と書かない**（§13）
        time.sleep(2)
        base2 = run_watch(rel)
        if base2 != 0:
            return {"watch": rel,
                    "skip": f"壊す前から緑ではない（終了コード {base}→{base2}。"
                            "2回とも落ちたので、混んでいたせいではない）"}
        print(f"     （{rel} は1回目だけ落ちた。混んでいたとみて、やり直した）")

    journal_write(tgt)
    try:
        target.write_text(new, encoding="utf-8")
        rc = run_watch(rel)
    finally:
        back = restore(tgt)
        journal_write(None)
    if not back:
        return {"watch": rel, "skip": f"**{tgt} を戻せなかった。手で直す**",
                "fatal": True}
    return {"watch": rel, "target": tgt, "n": n, "rc": rc, "why": why,
            "red": rc != 0}


# ---- 並べて回さない --------------------------------------------------

def busy() -> list[str]:
    """**この置き場で**ほかの見張りが走っていないか。走っていたら帰る。

    見るのは「同じファイルを読む相手」だけ。**worktree を切って並行で
    作業するのがこのリポジトリのふつう**なので、`ps` の字だけで判じると
    別の置き場の相手にまで止められる（実際に止められた）。
    `/proc/<pid>/cwd` を見て、**この置き場の中にいる相手だけ**を数える。
    """
    try:
        r = subprocess.run(["ps", "-eo", "pid,args"], capture_output=True,
                           text=True, timeout=30, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return []
    mine = {str(os.getpid()), str(os.getppid())}
    root = REPO.resolve()
    out = []
    for ln in r.stdout.splitlines()[1:]:
        pid, _, args = ln.strip().partition(" ")
        if pid in mine or "mutation_drill" not in args and not any(
                h in args for h in BUSY_HINTS):
            continue
        if "mutation_drill" in args:
            continue
        # 包んでいるシェルは数えない（中の `python` / `node` のほうで出る）
        if args.startswith(("/bin/bash", "/bin/sh", "bash ", "sh ")) \
                or "shell-snapshots" in args:
            continue
        try:
            cwd = Path(os.readlink(f"/proc/{pid}/cwd")).resolve()
        except OSError:
            continue
        if cwd == root or root in cwd.parents:
            out.append(f"pid {pid}  {args.strip()[:80]}")
    return out


def take_lock():
    """鍵を取る。取れなければ None（2本目は走らない）。"""
    try:
        import fcntl
        fh = open(LOCK, "w", encoding="utf-8")
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        return fh
    except (OSError, ImportError):
        return None


# ---- 何に当てるかを並べる --------------------------------------------

def plan(only: str | None, names: list[str]) -> list[dict]:
    try:
        r = subprocess.run([sys.executable, "python/selftest_runner.py",
                            "--list", "--json"], cwd=REPO, capture_output=True,
                           text=True, timeout=300, check=False)
        picked = json.loads(r.stdout.strip().splitlines()[-1])["picked"]
    except (OSError, ValueError, IndexError, KeyError,
            subprocess.TimeoutExpired):
        picked = []
    if names:
        picked = [p for p in picked if p in names] or names

    by_watch = {c["watch"]: c for c in REPO_CASES}
    out = []
    for rel in picked:
        p = REPO / rel
        if not p.is_file():
            continue
        if rel in by_watch and only in (None, "repo"):
            c = by_watch[rel]
            out.append({"kind": "repo", "watch": rel,
                        "target": REPO / c["file"], "case": c})
            continue
        if rel.endswith("_selftest.py") and only in (None, "py"):
            sib = REPO / rel.replace("_selftest.py", ".py")
            if sib.is_file():
                out.append({"kind": "py", "watch": rel, "target": sib})
            else:
                out.append({"kind": "-", "watch": rel,
                            "skip": "隣に守る本体（同じ名前の `.py`）が無い"})
        elif rel.endswith("_selftest.mjs") and only in (None, "mjs"):
            sub = mjs_subject(p)
            if sub:
                out.append({"kind": "mjs", "watch": rel, "target": sub})
            else:
                out.append({"kind": "-", "watch": rel,
                            "skip": "守る実物を `join(…)` から特定できない"})
    return out


# ---- この道具自身の対照 ----------------------------------------------

def self_drill() -> bool:
    """**当てる前に、この道具が「緑のまま」を見つけられるかを見る。**

    作り物の見張りを2本こしらえる——本体を壊すと落ちるものと、
    本体を1文字も読まないもの。後者を「緑のまま」と言えなければ、
    この道具は何も見つけられない。
    """
    ok = True
    with tempfile.TemporaryDirectory() as tmp:
        box = Path(tmp)
        (box / "good.py").write_text("def f(x):\n    return x == 1\n",
                                     encoding="utf-8")
        (box / "good_selftest.py").write_text(
            "import sys\nsys.path.insert(0, __file__.rsplit('/', 1)[0])\n"
            "from good import f\nsys.exit(0 if f(1) and not f(2) else 1)\n",
            encoding="utf-8")
        (box / "blind.py").write_text("def g(x):\n    return x == 1\n",
                                      encoding="utf-8")
        (box / "blind_selftest.py").write_text("import sys\nsys.exit(0)\n",
                                               encoding="utf-8")

        def once(stem: str) -> int:
            src = (box / f"{stem}.py").read_text(encoding="utf-8")
            new, _ = mutate_py(src)
            (box / f"{stem}.py").write_text(new, encoding="utf-8")
            try:
                r = subprocess.run([sys.executable, str(box / f"{stem}_selftest.py")],
                                   capture_output=True, text=True, timeout=60,
                                   check=False)
                return r.returncode
            finally:
                (box / f"{stem}.py").write_text(src, encoding="utf-8")

        for stem, want_red, what in (("good", True, "本体を見ている見張り"),
                                     ("blind", False, "本体を1文字も読まない見張り")):
            rc = once(stem)
            hit = (rc != 0) if want_red else (rc == 0)
            print(f"  {'○' if hit else '✕'} {what} → 壊すと終了コード {rc}"
                  f"（{'赤くなるはず' if want_red else '緑のままのはず'}）")
            ok = ok and hit

        # 戻るか
        src = (box / "good.py").read_text(encoding="utf-8")
        hit = "== 1" in src
        print(f"  {'○' if hit else '✕'} 当てたあと、本体が元の字に戻っている")
        ok = ok and hit

        # 比較が1つも無いものは「当てられない」と言えるか
        (box / "nocmp.py").write_text("X = 1\n", encoding="utf-8")
        hit = mutate_py((box / "nocmp.py").read_text(encoding="utf-8")) is None
        print(f"  {'○' if hit else '✕'} 壊すところが無いものは「当てられない」と言う")
        ok = ok and hit
    print("  " + ("○ この道具は、緑のままのものを見つけられる"
                  if ok else "✕ この道具の対照が外れた"))
    return ok


# ---- 本体 ------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("paths", nargs="*", help="当てるものを名指しする")
    ap.add_argument("--only", choices=["py", "mjs", "repo"], default=None)
    ap.add_argument("--list", action="store_true", help="当てずに、並べるだけ")
    ap.add_argument("--self-drill", action="store_true",
                    help="この道具自身の対照だけ回して帰る")
    a = ap.parse_args()

    print("[対照] この道具が、緑のままのものを見つけられるか")
    if not self_drill():
        print("\n✕ 対照が外れた。**本物の見張りには1本も当てていない**")
        return 2
    if a.self_drill:
        return 0
    print()

    rows = plan(a.only, a.paths)
    if not rows:
        print("✕ 当てるものを1本も並べられなかった。**「ぜんぶ対照がある」とは言わない**")
        return 2

    if a.list:
        print(f"[当てる先] {len(rows)}本")
        for r in rows:
            if r.get("skip"):
                print(f"  — {r['watch']} … {r['skip']}")
            else:
                print(f"  {r['kind']:<4} {r['watch']}"
                      f"  ← {Path(r['target']).relative_to(REPO)}")
        return 0

    # 並べて回さない
    fh = take_lock()
    if fh is None:
        print("✕ もう1本が走っている（鍵が取れない）。**数字は1つも出さない**")
        return 2
    b = busy()
    if b:
        print("✕ ほかの見張りが走っている。当てると**嘘の赤**が出るので帰る:")
        for x in b[:5]:
            print(f"   {x}")
        print("**数字は1つも出さない**")
        return 2

    back = journal_recover()
    if back:
        print(f"※ 前の回が壊したまま終わっていた `{back}` を戻した")

    skipped = dirty()
    # 途中で止められても戻す
    stop = {"hit": False}

    def bye(signum, frame):
        stop["hit"] = True
        journal_recover()
        print(f"\n✕ 止められた（signal {signum}）。壊したものは戻した")
        sys.exit(2)

    for s in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        try:
            signal.signal(s, bye)
        except (OSError, ValueError):
            pass

    print(f"[対照を当てる] {len(rows)}本")
    red, green, cant, fatal, unsure = [], [], [], [], []
    for r in rows:
        rel = r["watch"]
        if r.get("skip"):
            cant.append((rel, r["skip"]))
            continue
        tgt = Path(r["target"]).relative_to(REPO).as_posix()
        if tgt in skipped:
            cant.append((rel, f"{tgt} が手元で直しかけ。他人の作業を踏まない"))
            continue
        if r["kind"] == "py":
            res = attempt(rel, r["target"], mutate_py, "比較演算子を全部ひっくり返す")
        elif r["kind"] == "mjs":
            res = attempt(rel, r["target"], mutate_js, "`===`／`!==` を全部ひっくり返す")
        else:
            c = r["case"]
            cnt = -1 if c.get("all") else 1

            def make(src, c=c, cnt=cnt):
                if c["old"] not in src:
                    return None
                out = src.replace(c["old"], c["new"]) if cnt < 0 \
                    else src.replace(c["old"], c["new"], cnt)
                return out, (src.count(c["old"]) if cnt < 0 else 1)
            res = attempt(rel, r["target"], make, c["why"])

        if res.get("fatal"):
            fatal.append((rel, res["skip"]))
            print(f"  ✕✕ {rel}  {res['skip']}")
            break
        if res.get("skip"):
            cant.append((rel, res["skip"]))
            print(f"  —  {rel}  …  {res['skip']}")
            continue
        if not res["red"]:
            # **緑のままだった。** そのまま「対照が無い」と書く前に、
            # **当て先がこの見張りの持ち場なのか**を見る
            if r["kind"] in ("py", "mjs"):
                yes = reads_it(rel, r["target"])
                if yes is None:
                    fatal.append((rel, f"{tgt} を戻せなかった"))
                    break
                if not yes:
                    cant.append((rel, f"{tgt} を読んでいない（当て先の推しが外れた。"
                                      "**対照が無いという意味ではない**）"))
                    print(f"  —  {rel}  …  {tgt} を読んでいない（当て先の推し違い）")
                    continue
            if r["kind"] == "mjs":
                # **`mjs` の当て先は字から推したもので、言い切れない。**
                # 潰すと赤くなる＝「`tsc` に通している」だけのことがある
                # （`cardplace` が実際にそれだった。`functions/src` の
                #  関係のない字を掴んでいた）。**名指ししない。**
                unsure.append(res)
                print(f"  ?  {rel}")
                print(f"      {res['why']}（{res['n']}か所）→ 緑のまま。"
                      f"ただし **当て先（{tgt}）がこの見張りの持ち場か"
                      f"言い切れない**ので、名指ししない")
                continue
        mark = "○" if res["red"] else "✕"
        (red if res["red"] else green).append(res)
        print(f"  {mark} {rel}")
        print(f"      {res['why']}（{res['n']}か所）→ 終了コード {res['rc']}"
              f"  {'赤くなった' if res['red'] else '**緑のまま**'}")

    print()
    print(f"当てた {len(red) + len(green) + len(unsure)}本 / "
          f"赤くなった {len(red)}本 / **緑のまま {len(green)}本** / "
          f"要確認 {len(unsure)}本 / 当てられなかった {len(cant)}本")

    if unsure:
        print("\n[要確認]（緑のままだったが、**当て先がその見張りの持ち場か"
              "言い切れない**。対照が無いという意味ではない）")
        for r in unsure:
            print(f"  ? {r['watch']}  ← {r['target']}")

    if cant:
        print("\n[当てられなかったもの]（0 に混ぜない。§15）")
        for rel, why in cant:
            print(f"  — {rel} … {why}")

    if fatal:
        print("\n✕✕ **戻せなかったものが在る。先に手で直す**")
        for rel, why in fatal:
            print(f"  {rel}: {why}")
        return 2

    if green:
        print("\n✕ **対照を持っていない見張り**（本体を壊しても緑のまま）:")
        for r in green:
            print(f"  {r['watch']}  ← {r['target']}")
        return 1

    if not red:
        print("\n✕ 1本も当てられなかった。**「ぜんぶ対照がある」とは言わない**")
        return 2

    if unsure:
        print("\n○ 当て先が確かなものは、ぜんぶ赤くなった"
              f"（要確認が {len(unsure)}本。当て先を `REPO_CASES` に"
              "書けば言い切れるようになる）")
        return 0

    print("\n○ 当てたものは、ぜんぶ赤くなった")
    return 0


if __name__ == "__main__":
    sys.exit(main())
