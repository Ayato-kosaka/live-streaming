"""**モジュールをまたいだ呼び出しの、引数の数が合っているかを見る。**

    python3 python/crosscall_selftest.py

## なぜ要るか

2026-09-16、`build_residents.fetch_characters()` に `client` を足したとき、
**呼んでいる `build_chapter_stats.py` を直し忘れた。** その晩の焼き直しが
`TypeError: fetch_characters() missing 1 required positional argument`
で落ちて、島の数字が1日ぶん止まった（`docs/island-misses.md` #105）。

**そのとき回した確かめは全部素通りした。**

- `py_compile` は通る（実行時の TypeError なので）
- `build_residents_selftest.py` も通る（あちらを**単体で**しか見ていない）
- `npx tsc` も巡回も通る（TypeScript 側の話ではない）

Python には型の番人がいないので、**署名がずれたことは走らせるまで分からない。**
走らせるには本番の BigQuery と Firestore が要る＝手元では確かめられない。
だから**走らせずに、書いてあるものだけで**見る。

## どうやって見るか

**import しない。** 焼くスクリプトは import しただけで走るものが混じっている
（`__main__` の番をしていないものが1本ある）ので、読むだけにする。

1. `python/*.py` を AST で読む
2. `from <このリポジトリのモジュール> import f, g` を集める
3. その `f(...)` の呼び出しを見つけて、渡している数を数える
4. 呼ばれる側の `def f(...)` を**あちらの AST から**引いて、受け取れる数と突き合わせる

足りない・多すぎるものだけを出す。**判断はしない。数が合わないことだけを言う。**
"""

import ast
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def defs_of(path: Path) -> dict:
    """そのファイルが定義している関数の、受け取れる引数の形。"""
    out = {}
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        a = node.args
        pos = [p.arg for p in a.posonlyargs + a.args]
        ndef = len(a.defaults)
        out[node.name] = {
            "least": len(pos) - ndef,            # 省略できない数
            "most": None if a.vararg else len(pos),  # *args があれば上限なし
            "kwonly": {p.arg for p in a.kwonlyargs},
            "kwargs": a.kwarg is not None,
            "line": node.lineno,
        }
    return out


def main() -> int:
    mods = {p.stem: p for p in HERE.glob("*.py")}
    cache = {}
    bad = []
    seen = 0

    for path in sorted(HERE.glob("*.py")):
        if path.stem.endswith("selftest"):
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))

        # どの名前を、どのモジュールから借りているか
        borrowed = {}
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module in mods and node.level == 0:
                for al in node.names:
                    if al.name != "*":
                        borrowed[al.asname or al.name] = (node.module, al.name)
        if not borrowed:
            continue

        for node in ast.walk(tree):
            if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)):
                continue
            if node.func.id not in borrowed:
                continue
            mod, real = borrowed[node.func.id]
            if mod not in cache:
                cache[mod] = defs_of(mods[mod])
            sig = cache[mod].get(real)
            if not sig:
                continue  # 関数ではない（定数など）
            seen += 1

            # **`*x` を渡していたら数えない。** 中身の数は読めば分かるものではない
            if any(isinstance(a, ast.Starred) for a in node.args):
                continue
            pos = len(node.args)
            named = {k.arg for k in node.keywords if k.arg}
            filled = pos + len(named)

            if filled < sig["least"]:
                bad.append(
                    f"{path.name}:{node.lineno} {real}() に {filled} 個しか渡していない"
                    f"（{mod}.py:{sig['line']} は最低 {sig['least']} 個）"
                )
            elif sig["most"] is not None and pos > sig["most"]:
                bad.append(
                    f"{path.name}:{node.lineno} {real}() に位置引数を {pos} 個渡している"
                    f"（{mod}.py:{sig['line']} は最大 {sig['most']} 個）"
                )
            else:
                unknown = named - sig["kwonly"]
                known_pos = set()
                d = ast.parse(mods[mod].read_text(encoding="utf-8"))
                for n2 in ast.walk(d):
                    if isinstance(n2, (ast.FunctionDef, ast.AsyncFunctionDef)) and n2.name == real:
                        known_pos = {p.arg for p in n2.args.posonlyargs + n2.args.args}
                if not sig["kwargs"] and (unknown - known_pos):
                    bad.append(
                        f"{path.name}:{node.lineno} {real}() に受け取らない名前で渡している: "
                        f"{sorted(unknown - known_pos)}"
                    )

    print(f"またいだ呼び出しを {seen} か所見た。")
    for b in bad:
        print("  NG " + b)
    if bad:
        print(f"\n{len(bad)} 件、引数の数が合っていません。")
        return 1
    print("引数の数が合わないものはありませんでした。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
