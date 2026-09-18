"""**どの見張りが、どこから走るか**を数える。走らないものを名指しで出す。

    python3 python/watch_census_selftest.py            # 棚卸しして出す
    python3 python/watch_census_selftest.py --json     # 機械で読む形
    python3 python/watch_census_selftest.py --only-drill   # 対照だけ回して帰る
    BREAK=head python3 python/watch_census_selftest.py     # 直す前の数え方を再現

終了コード **0=どこからも走らない見張りは無い / 1=在った /
2=数えられなかった**（`docs/island-standards.md` §15）。

## なぜ `_selftest.py` の名前なのか

**この道具自身が、毎 PR で走らないと意味がないから。**
回し役（`python/selftest_runner.py`）は `*_selftest.py` を**全部拾う**ので、
この名前にしておけば繋ぎ忘れようがない（表に書き足す形にすると、
書き足し忘れた日に赤くならない——`docs/island-misses.md` #125）。
自分で自分を数えることになるが、それでよい。
先例は `crosscall_selftest.py`（本物のリポジトリを数える見張り）。

## なぜ要るか（2026-09-18。一晩で3回、数え方のほうが腐っていた）

1. #125 に置いた数え方 `sed 's/[[:space:]]#.*//'` が **行頭の `#` を落とさない。**
   `run_admin_script.yml` のコメントに名前が出ているだけの1本を「走っている」と
   数えていた。**11本と報告したものが、実は12本だった**
2. `pull_request` が追い足しの push で走るかを見たとき、**`cancelled` を
   「走らなかった」に数えて**いた。止められただけで、走っていた
3. `.github/workflows/selftest.yml` と `python/selftest_runner.py` が入った日から、
   **`run:` の名前で数える方法は半分しか当たらない。** 回し役が glob で拾う
   見張りは `run:` に1度も名前が出ないので、全部「走っていない」と出る

**いまの数え方を信じると、逆の答えが出る。** 走っている30本が「走っていない」に、
走っていない1本が「走っている」に。だから書き置きではなく、回せるものにした。

## 数え方

走る道は2つある。**両方を足して、重複を除く。**

| 道 | どう取るか |
| --- | --- |
| 回し役が拾うぶん | `selftest_runner.py --list --json` を**呼んで**取る |
| `run:` が名前で直に呼ぶぶん | `.github/workflows/*.yml` を YAML として読んで、`run:` の中身だけを見る |

**拾いかたを写経しない。** 回し役の glob をこちらに書き写すと、あちらが
変わった日に黙ってずれる（今夜それで外した）。だから口を呼ぶ。

**コメントは2層ある。**

- YAML のコメント（`  # python3 …`）… YAML として読めば、パーサが落とす
- `run: |` の中のシェルのコメント（`# python3 …`）… **こちらは中身なので残る。**
  しかも YAML はブロックの字下げを剥がすので、**`#` が1列目に来る**。
  #141 で踏んだのはここ

## 無限に回らないようにしてあること

この道具は回し役に拾われ、その中から回し役を呼ぶ。止まるのは2つの理由。

1. **呼ぶのは `--list` だけ。** あちらは見張りを1本も起こさずに一覧を出して帰る
2. 念のための輪止め。回し役を呼ぶときに `ISLAND_WATCH_CENSUS=1` を置いていく。
   その印を持ったまま起こされたら、この道具は**何も数えずに 0 で帰る**。
   将来この道具が `--list` 以外で回し役を呼ぶように書き換えられても、
   輪にはならない（そのとき数えないのは「回し役の中の回し役の中」だけ）

## 対照（`docs/island-standards.md` §15）

**本物を1本も数える前に、答えの分かっている仕込みで自分を試す。**
1つでも外れたら、本物の数字を1つも出さずに 2 で落ちる。

| 見るもの | 外す印 |
| --- | --- |
| コメントに名前だけ（行頭 `#`）を「走っている」に数えない | `BREAK=head` |
| コメントに名前だけ（行の途中 `#`）を「走っている」に数えない | `BREAK=inline` |
| どこからも呼ばれていない見張りを拾える | `BREAK=orphan` |
| `run:` に在るのにファイルが無い名前を拾える | `BREAK=ghost` |
| 回し役の口が壊れた／1本も返さない → **0 ではなく 2** | `BREAK=runner` |

**逆側も当てる**——ぜんぶ繋がっている仕込みで **0** が出ること。
これが無いと、「何でも走っていない」と言う道具が対照を通ってしまう。
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

# 見張りの見分けは**名前**で決める。中身では決めない
WATCH_SUFFIX = ("_selftest.py", "_selftest.mjs")
# 降りていかない場所。**書き出したものは `.js` になるので、ここは短くてよい**
# （`lib` や `dist` を足すと、`python/lib/…_selftest.py` を黙って飛ばす側に倒れる。
#   見のがすより、要らないものが1本出るほうがいい）
SKIP_DIRS = {"node_modules", "__pycache__"}

# 輪止め。**回し役 → この道具 → 回し役** の2周目を止める印
GUARD = "ISLAND_WATCH_CENSUS"

# `run:` の中から名前を拾う形。`python3 python/x_selftest.py` でも
# `node selftest/x_selftest.mjs` でも、パスの部分ごと取る
NAME_RE = re.compile(r"[\w./-]*[\w-]+_selftest\.(?:py|mjs)")

# 1本にかける上限（回し役の `--list` は 0.2 秒で帰る）
TIMEOUT_SEC = 120


class Broken(Exception):
    """**数えかたのほうが壊れた。** 本物の数字は1つも出さずに 2 で落ちる。"""


def breaks() -> frozenset[str]:
    """`BREAK=` で外す足。対照が落ちることを確かめるためだけに使う。"""
    return frozenset(x for x in os.environ.get("BREAK", "").split(",") if x)


def watchers(root: Path) -> list[str]:
    """リポジトリに**在る**見張りを全部拾う（走るかどうかは見ない）。"""
    out: list[str] = []
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        if any(part in SKIP_DIRS or part.startswith(".") for part in
               p.relative_to(root).parts[:-1]):
            continue
        if p.name.endswith(WATCH_SUFFIX):
            out.append(p.relative_to(root).as_posix())
    return sorted(out)


def ask_runner(root: Path, runner: Path) -> tuple[list[str], dict[str, str]]:
    """**回し役に聞く。** 拾いかたを写経しない（写経すると黙ってずれる）。

    返すのは（回すもの, 外してあるもの→理由）。
    """
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
    """シェルのコメントを落とす。**行頭の `#` も、行の途中の `#` も。**

    `run: |` の中身は YAML から見れば「ただの字」なので、パーサは落とさない。
    しかもブロックの字下げは剥がされるので、**`#` が1列目に来る**（#141）。
    """
    out = []
    for line in text.splitlines():
        if "inline" not in ban:
            line = re.sub(r"\s#.*$", "", line)
        if "head" not in ban:
            line = re.sub(r"^\s*#.*$", "", line)
        out.append(line)
    return "\n".join(out)


def run_names(root: Path, ban: frozenset[str]) -> dict[str, set[str]]:
    """`.github/workflows/*.yml` の `run:` に出る名前 → 出てくるワークフロー。"""
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

    found: dict[str, set[str]] = {}
    for f in files:
        try:
            doc = yaml.safe_load(f.read_text(encoding="utf-8"))
        except yaml.YAMLError as e:
            raise Broken(f"{f.name} が YAML として読めない: {e}") from e
        for script in scripts(doc):
            for m in NAME_RE.finditer(strip_comments(script, ban)):
                found.setdefault(m.group(0), set()).add(f.name)
    return found


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


def resolve(token: str, root: Path, by_name: dict[str, list[str]]) -> str | None:
    """`run:` に書いてある名前を、リポジトリの中の1本に当てる。

    当たらなければ `None`（＝呼んでいる先が無い）。
    `rebake.yml` は `working-directory: site` で `node selftest/x.mjs` と
    書くので、**書いてあるままでは当たらない。** 末尾の名前で引き直す。
    """
    p = root / token
    if p.is_file():
        return p.resolve().relative_to(root.resolve()).as_posix()
    cands = by_name.get(token.rsplit("/", 1)[-1], [])
    if len(cands) == 1:
        return cands[0]
    if len(cands) > 1:
        # 同じ名前が2か所に在ると、どちらを呼んでいるのか決められない。
        # **勝手に決めない**（片方だけ走っているのを両方走っていると読む）
        raise Broken(f"同じ名前の見張りが2か所にある: {token} → {cands}")
    return None


def census(root: Path, runner: Path, ban: frozenset[str]) -> dict:
    """棚卸しする。数えられなければ `Broken`。"""
    have = watchers(root)
    if not have:
        raise Broken(f"見張りを1本も見つけられなかった（見に行った先: {root}）")
    by_name: dict[str, list[str]] = {}
    for w in have:
        by_name.setdefault(w.rsplit("/", 1)[-1], []).append(w)

    try:
        picked, skipped = ask_runner(root, runner)
    except Broken:
        if "runner" not in ban:
            raise
        # BREAK=runner: 口が壊れた晩に「拾えたもの0本」で先へ進む＝いちばん悪い嘘
        picked, skipped = [], {}

    named = run_names(root, ban)
    called: dict[str, set[str]] = {}
    ghosts: dict[str, set[str]] = {}
    for token, where in sorted(named.items()):
        hit = resolve(token, root, by_name)
        if hit is None:
            if "ghost" not in ban:
                ghosts.setdefault(token, set()).update(where)
        else:
            called.setdefault(hit, set()).update(where)

    covered = set(picked) | set(called)
    orphans = [w for w in have if w not in covered]
    if "orphan" in ban:
        orphans = []
    return {
        "all": have,
        "picked": sorted(picked),
        "called": {k: sorted(v) for k, v in sorted(called.items())},
        "skipped": skipped,
        "orphans": orphans,
        "both": sorted(set(picked) & set(called)),
        "ghosts": {k: sorted(v) for k, v in sorted(ghosts.items())},
    }


def report(c: dict) -> None:
    """人が読む形。**分母から出す**（`docs/island-standards.md` §15）。"""
    print(f"[見張りの棚卸し] 在る見張り {len(c['all'])}本")
    print(f"  回し役が拾う          {len(c['picked'])}本"
          "（python/selftest_runner.py --list）")
    print(f"  ワークフローの run:   {len(c['called'])}本")
    print(f"  どちらかで走る        {len(set(c['picked']) | set(c['called']))}本")
    if c["skipped"]:
        print(f"  回し役が理由つきで外している {len(c['skipped'])}本")
        for n, why in sorted(c["skipped"].items()):
            print(f"    — {n} … {why}")

    print()
    print(f"どこからも走らない見張り: {len(c['orphans'])}本")
    for n in c["orphans"]:
        print(f"  ✕ {n}")
    print()
    print(f"回し役と run: の両方から走るもの: {len(c['both'])}本")
    for n in c["both"]:
        print(f"  ・{n}（回し役 ＋ {' / '.join(c['called'][n])}）")
    print()
    print(f"run: に名前が出ているのに、そのファイルが無いもの: {len(c['ghosts'])}本")
    for n, where in c["ghosts"].items():
        print(f"  ✕ {n}（{' / '.join(where)}）")


# ---------------------------------------------------------------- 対照

# 仕込みの見張り。中身は要らない（回さないので）
BODY = "print('ok')\n"


def fixture(box: Path, kind: str) -> Path:
    """答えの分かっている、偽のリポジトリを作る。"""
    root = box / kind
    (root / ".github" / "workflows").mkdir(parents=True)
    (root / "python").mkdir(parents=True)
    (root / "fake").mkdir(parents=True)

    def put(rel: str) -> None:
        (root / rel).write_text(BODY, encoding="utf-8")

    if kind == "clean":
        # ぜんぶ繋がっている。**ここで 0 が出ないと、対照になっていない**
        put("python/called_selftest.py")
        put("python/picked_selftest.py")
        wf = """
name: fake
on: push
jobs:
  a:
    steps:
      - run: python3 python/called_selftest.py
"""
        picks = ["python/picked_selftest.py", "python/called_selftest.py"]
    else:
        # 穴だらけ。名前がコメントにしか出ない4通り・迷子・幽霊・二重
        put("python/called_selftest.py")
        put("python/picked_selftest.py")
        put("python/both_selftest.py")
        put("python/lonely_selftest.py")
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
        for p in (root / "python").glob("*_selftest.py"):
            p.unlink()

    (root / ".github" / "workflows" / "fake.yml").write_text(wf, encoding="utf-8")

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
                      "both": ["python/called_selftest.py"]},
         "ぜんぶ繋がっていれば 0（二重の1本も出る）"),
        ("dirty", 1, {"orphans": want_orphans, "ghosts": want_ghosts,
                      "both": ["python/both_selftest.py"]},
         "コメントだけの4本と迷子を拾い、幽霊も出す"),
        ("nowatch", 2, None, "見張りが1本も無ければ 2"),
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
                        mine = [k for k in c[key]] if isinstance(c[key], list) \
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
    runner = Path(a.runner).resolve() if a.runner else root / "python" / "selftest_runner.py"

    try:
        c = census(root, runner, breaks())
    except Broken as e:
        print(f"✕ 数えられなかった: {e}")
        print("**「どこからも走らない見張りは無い」とは言わない**")
        return 2

    if a.json:
        print(json.dumps(c, ensure_ascii=False, sort_keys=True, default=sorted))
    else:
        report(c)

    if c["orphans"] or c["ghosts"]:
        if not a.json:
            print()
            if c["orphans"]:
                print(f"✕ {len(c['orphans'])}本が、どこからも走らない")
            if c["ghosts"]:
                # ここが鳴らないと、綴り間違いはワークフローが落ちるまで出ない
                print(f"✕ {len(c['ghosts'])}本、呼んでいる先のファイルが無い")
        return 1

    if not a.json:
        print()
        print("○ 在る見張りは、どれかの道から走る")
    return 0


if __name__ == "__main__":
    sys.exit(main())
