"""自己テストの台。**足**（確かめること1つ）と、**守りを1つずつ外す対照**。

`watch_selftest.py`・`ledger_selftest.py`・`tools/shorts/script/lint_selftest.py` が使う。形は
`tools/shorts/post/posted_selftest.py` と同じで、`docs/island-standards.md` §15「対照は、足の数だけ用意する」に従う。

- 足: `name → fn(ctx) -> [(何を見たか, 通ったか)]`
- 対照: `name → (ファイル, 本物の字, 書き換えた字, 落ちるはずの足, 何を外すか)`。`BREAK=<name>` で自分を
  起こし直し、その守りを外した道具で足を全部回す。**落ちた足が、落ちるはずの足とぴったり同じ**なら通る
  （ほかの足まで落ちたら、足どうしが同じところを見ている＝足の数ほど守れていない）

**写しを置かない。** 書き換えた字をその場で読み込む（`__file__` は本物のまま）。道具は自分の置き場から
リポジトリの根を引くので、別の置き場へ写すと、その引きかたごと変わってしまう。
外す字が本物に1か所だけ無ければ 2 で落ちる（字を直したのに、対照を直し忘れた）。
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import traceback
import types
from pathlib import Path


def load(path: Path, name: str, cut: tuple | None = None):
    """`path` の道具を、`cut`（本物の字, 書き換えた字）を当てて読み込む。`sys.modules[name]` にも置く。"""
    path = Path(path)
    text = path.read_text(encoding="utf-8")
    if cut is not None:
        old, new = cut
        n = text.count(old)
        if n != 1:
            print(f"✕ 外す字が {path.name} に {n} か所（1か所のはず）。字を直したら対照（CUTS）も直す")
            sys.exit(2)
        text = text.replace(old, new)
    mod = types.ModuleType(name)
    mod.__file__ = str(path)
    sys.modules[name] = mod
    exec(compile(text, str(path), "exec"), mod.__dict__)
    return mod


def run_legs(legs: dict, ctx, quiet: bool) -> tuple:
    failed, checked = [], 0
    for name, fn in legs.items():
        try:
            res = fn(ctx)
        except Exception:
            res = [("例外で止まった: " + traceback.format_exc(limit=4).strip().splitlines()[-1], False)]
        checked += len(res)
        bad = [what for what, ok in res if not ok]
        if bad:
            failed.append(name)
        if not quiet:
            print(f"[{name}]")
            for what, ok in res:
                print(f"  {'○' if ok else '✕'} {what}")
    return failed, checked


def drill(script: Path, cuts: dict) -> list:
    print("[対照] 守りを1つずつ外すと、その足だけが落ちるか")
    bad = []
    for name, (fname, _, _, want, why) in cuts.items():
        env = dict(os.environ, BREAK=name)
        r = subprocess.run([sys.executable, str(script)], capture_output=True, text=True, env=env,
                           timeout=300, check=False)
        line = [ln for ln in r.stdout.splitlines() if ln.startswith("LEGS_FAILED ")]
        got = set(json.loads(line[-1][len("LEGS_FAILED "):])) if line else None
        hit = got == set(want) and r.returncode == 1
        shown = sorted(got) if got is not None else "（読めない: " + (r.stdout + r.stderr).strip()[-300:] + "）"
        print(f"  {'○' if hit else '✕'} BREAK={name}（{fname}: {why}）→ 落ちた足 {shown}（欲しいのは {sorted(want)}）")
        if not hit:
            bad.append(name)
    return bad


def main(script: Path, legs: dict, cuts: dict, setup) -> int:
    """`setup(対照の名前か None)` が、足に渡すもの（読み込んだ道具など）を返す。

    終了コード 0=足が全部通り、対照も全部その足だけを落とした / 1=どちらかが外れた / 2=数えるものが無い。
    """
    brk = os.environ.get("BREAK", "")
    if brk:
        if brk not in cuts:
            print(f"✕ BREAK={brk} という対照は無い（{' / '.join(cuts)}）")
            return 2
        failed, checked = run_legs(legs, setup(brk), quiet=True)
        print("LEGS_FAILED " + json.dumps(sorted(failed)))
        return 2 if checked == 0 else (1 if failed else 0)
    failed, checked = run_legs(legs, setup(None), quiet=False)
    print()
    bad = drill(script, cuts)
    print()
    if checked == 0:
        print("✕ 1つも数えなかった。**「通りました」とは言わない**")
        return 2
    if failed or bad:
        if failed:
            print(f"✕ 落ちた足: {' / '.join(failed)}")
        if bad:
            print(f"✕ 対照が外れた: {' / '.join(bad)}（外しても、その足だけが落ちる形になっていない）")
        return 1
    print(f"○ {len(legs)}本の足（{checked}件）が通り、守り {len(cuts)}個を1つずつ外すと、その足だけが落ちた")
    return 0
