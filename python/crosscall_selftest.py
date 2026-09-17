"""**モジュールをまたいだ呼び出しの、引数の数が合っているかを見る。**

    python3 python/crosscall_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（`docs/island-standards.md` §15）。

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

## 「食い違い 0件」を、そのまま読まない（§15）

**ここは 2026-09-17 まで「30か所見た」としか言っていなかった。**
その30がどこから来た30なのかは誰も知らず、**借り手の集め方が壊れて
0か所になっても、出る字は「食い違いはありませんでした」のまま**だった。
鳴れるが、効くことを一度も証明していない見張りだった。

そこで2つ足した。

- **分母を割って出す。** 何本読んで、何本が名前を借りていて、どのモジュールから
  何個借りて、そのうち何か所を**実際に突き合わせたか**。
  突き合わせが0か所なら、合否を出さずに終了コード 2 で止まる
- **対照を毎回回す**（`control()`）。`python/*.py` を丸ごと写して、
  **本物の関数1つに必須の引数を1つ足し**、その写しを同じ目で見る。
  **写しが捕まらなければ、本物で「0件」と言う資格がない。**
  先に「何も壊していない写しが通ること」も見る（`island-misses.md` #99）

対照が本物のファイルを写して作るのは、**作り物の2行で試すと、本物の書き方が
変わったときに気づけない**から。写しは常にいまのリポジトリそのもの。
"""

import ast
import shutil
import sys
import tempfile
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
            "pos": set(pos),                     # 名前で渡してもよい位置引数
            "kwonly": {p.arg for p in a.kwonlyargs},
            "kwargs": a.kwarg is not None,
            "line": node.lineno,
        }
    return out


def scan(where: Path) -> tuple[list[str], dict, list[tuple]]:
    """`where` の `*.py` を読んで、またいだ呼び出しを突き合わせる。

    返すのは (食い違い, 分母, 突き合わせた組)。**本物にも写しにも、この同じ目を
    当てる。** 対照のほうに別の実装を書くと、片方だけ直して食い違ったときに
    「対照は通ったのに本物が見ていない」が起こる。
    """
    mods = {p.stem: p for p in where.glob("*.py")}
    cache: dict[str, dict] = {}
    bad: list[str] = []
    pairs: list[tuple] = []
    stat = {
        "files": 0,          # 読んだファイル
        "importers": 0,      # よそから名前を借りているファイル
        "borrowed": 0,       # 借りている名前（のべ）
        "from": set(),       # 借り先のモジュール
        "checked": 0,        # **実際に数を突き合わせた呼び出し**
        "starred": 0,        # `*x` 渡しで数えられなかった呼び出し
        "notfunc": 0,        # 借りた名前が関数ではなかった（定数など）
    }

    for path in sorted(mods.values()):
        if path.stem.endswith("selftest"):
            continue
        stat["files"] += 1
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
        stat["importers"] += 1
        stat["borrowed"] += len(borrowed)
        stat["from"] |= {m for m, _ in borrowed.values()}

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
                stat["notfunc"] += 1
                continue  # 関数ではない（定数など）

            # **`*x` を渡していたら数えない。** 中身の数は読めば分かるものではない。
            # 数えなかったぶんを黙って落とさず、分母の隣に出す
            if any(isinstance(a, ast.Starred) for a in node.args):
                stat["starred"] += 1
                continue
            stat["checked"] += 1
            pos = len(node.args)
            named = {k.arg for k in node.keywords if k.arg}
            filled = pos + len(named)
            pairs.append({
                "file": path.name, "line": node.lineno, "mod": mod, "func": real,
                "sig": sig, "pos": pos, "filled": filled,
                # `(` を探す起点。**ast の桁は UTF-8 のバイト数**なので、
                # 日本語の混じった行でも狂わないように、使うときもバイトで数える
                "end_col": node.func.end_col_offset,
            })

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
                unknown = named - sig["kwonly"] - sig["pos"]
                if not sig["kwargs"] and unknown:
                    bad.append(
                        f"{path.name}:{node.lineno} {real}() に受け取らない名前で渡している: "
                        f"{sorted(unknown)}"
                    )

    return bad, stat, pairs


# ---------------------------------------------------------------- 対照


def copy_tree(dst: Path) -> None:
    """`python/*.py` を丸ごと写す。**作り物ではなく、いまのリポジトリそのもの。**"""
    dst.mkdir(parents=True, exist_ok=True)
    for p in HERE.glob("*.py"):
        shutil.copyfile(p, dst / p.name)


def shift_one(dst: Path, mod: str, func: str) -> str:
    """写しの `def func(...)` に**必須の引数を1つ足す**（＝呼び手が1個足りなくなる）。

    足すのは先頭で、既定値を付けない。だから**呼んでいる側は全部「1個足りない」**
    になる。本番のファイルは1バイトも触らない（触るのは写しだけ）。
    """
    path = dst / f"{mod}.py"
    src = path.read_text(encoding="utf-8")
    tree = ast.parse(src)
    node = next(n for n in ast.walk(tree)
                if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == func)
    lines = src.split("\n")
    i = node.lineno - 1
    head = lines[i]
    at = head.index("(", head.index(func))
    rest = head[at + 1:]
    # 引数が1つも無い `def f():` と、在る `def f(a, b):` の両方に足せる形
    lines[i] = head[:at + 1] + "_crosscall_probe" + ("" if rest.startswith(")") else ", ") + rest
    path.write_text("\n".join(lines), encoding="utf-8")
    return lines[i].strip()


def pad_call(dst: Path, call: dict) -> str:
    """写しの**呼び出しのほう**に、位置引数を1つ足す（＝渡しすぎになる）。

    `def` を触る (b) と向きが逆。本番で起きるのは両方で、
    **片側だけ試すと、もう片側の判定が死んでいても気づけない。**
    """
    path = dst / call["file"]
    lines = path.read_text(encoding="utf-8").split("\n")
    raw = lines[call["line"] - 1].encode("utf-8")
    at = raw.index(b"(", call["end_col"])
    rest = raw[at + 1:]
    # 引数が続いているなら区切りが要る。`f()` なら要らない
    extra = b"None" if rest.lstrip().startswith(b")") else b"None, "
    lines[call["line"] - 1] = (raw[:at + 1] + extra + rest).decode("utf-8")
    path.write_text("\n".join(lines), encoding="utf-8")
    return lines[call["line"] - 1].strip()


def control(pairs: list[dict]) -> list[str]:
    """写しで**落ちるところ**を見せる。落ちなければ、本物の「0件」は読めない。

    ずらすのは**両方の向き**。

    - (b) 呼ばれる側に必須の引数を1つ足す → 呼び手が「足りない」
    - (c) 呼ぶ側に位置引数を1つ足す → 「多すぎ」

    (b) で選ぶのは、**いちばん少ない渡し方をしている呼び手がいる関数。**
    既定値のある引数まで渡している呼び手しかいない関数だと、必須が1つ増えても
    数は足りたままで、**捕まらないのが正しい**（2026-09-17、`find_issue` で
    実際にこれを踏んだ）。対照に使う相手は、そこまで見て選ぶ。
    """
    fails = []
    print("\n## 対照（写しで、落ちるところを見せる）")

    # (b) の相手: `filled == least`（＝省略できるものを1つも渡していない）呼び手がいる関数
    short = {}
    for c in pairs:
        if c["filled"] == c["sig"]["least"]:
            short.setdefault((c["mod"], c["func"]), []).append(c)
    # (c) の相手: 位置引数を上限いっぱいまで渡している呼び出し
    full = [c for c in pairs
            if c["sig"]["most"] is not None and c["pos"] == c["sig"]["most"] and c["pos"] > 0]

    with tempfile.TemporaryDirectory() as td:
        copy = Path(td) / "python"

        # (a) **何も壊していない写しが、先に通ること**（`island-misses.md` #99）。
        #     写しを作りそこねても食い違いは出るので、ここを見ないと対照にならない
        copy_tree(copy)
        cbad, cstat, _ = scan(copy)
        ok = not cbad and cstat["checked"] == len(pairs)
        print(f"  {'OK  ' if ok else 'NG  '} 壊していない写し: "
              f"{cstat['checked']} か所を見て 食い違い {len(cbad)} 件"
              f"（本物と同じ {len(pairs)} か所）")
        if not ok:
            fails.append("壊していない写しが、本物と同じに読めていない")
            for b in cbad:
                print("        " + b)

        # (b) 呼ばれる側の引数を1つ増やす
        if not short:
            print("  NG   `def` をずらせる相手がいない（対照を回せていない）")
            fails.append("(b) に使える呼び出しが無い")
        else:
            (mod, func), callers = sorted(short.items())[0]
            copy_tree(copy)                      # 前の細工を捨ててから
            head = shift_one(copy, mod, func)
            dbad, dstat, _ = scan(copy)
            hit = [b for b in dbad if f"{func}()" in b and "しか渡していない" in b]
            ok = len(hit) == len(callers)
            print(f"  {'OK  ' if ok else 'NG  '} (b) 呼ばれる側を1つずらす: "
                  f"{mod}.py の `{head}`")
            print(f"        いちばん少ない渡し方をしている呼び手は {len(callers)} か所"
                  "（" + ", ".join(f"{c['file']}:{c['line']}" for c in callers) + "）")
            print(f"        {dstat['checked']} か所を見て 食い違い {len(dbad)} 件 / "
                  f"うち「足りない」 {len(hit)} 件")
            for b in hit:
                print("        → " + b)
            if not ok:
                fails.append(f"(b) 呼ばれる側を1つずらしても、{len(callers)} か所とも捕まえられない")

        # (c) 呼ぶ側の引数を1つ増やす
        if not full:
            print("  NG   呼び出しをずらせる相手がいない（対照を回せていない）")
            fails.append("(c) に使える呼び出しが無い")
        else:
            call = full[0]
            copy_tree(copy)                      # ここでも細工を捨ててから
            line = pad_call(copy, call)
            ebad, estat, _ = scan(copy)
            hit = [b for b in ebad if "位置引数を" in b]
            ok = len(hit) == 1
            print(f"  {'OK  ' if ok else 'NG  '} (c) 呼ぶ側を1つずらす: "
                  f"{call['file']}:{call['line']} `{line}`")
            print(f"        {estat['checked']} か所を見て 食い違い {len(ebad)} 件 / "
                  f"うち「多すぎ」 {len(hit)} 件")
            for b in hit:
                print("        → " + b)
            if not ok:
                fails.append("(c) 呼ぶ側を1つずらしても、そこ1か所として捕まえられない")

    return fails


def main() -> int:
    bad, stat, pairs = scan(HERE)

    # **分母を割って出す。**「30か所見た」だけでは、その30が正しい数か誰も知らない
    print("## 何を見たか（分母）")
    print(f"  読んだファイル          : {stat['files']} 本")
    print(f"  よそから名前を借りている: {stat['importers']} 本")
    print(f"  借りている名前          : {stat['borrowed']} 個 "
          f"（借り先 {len(stat['from'])} モジュール: {', '.join(sorted(stat['from']))}）")
    print(f"  **突き合わせた呼び出し**: {stat['checked']} か所")
    print(f"  数えなかったもの        : `*x` 渡し {stat['starred']} か所 / "
          f"関数ではない名前 {stat['notfunc']} 個")

    if stat["checked"] == 0:
        # 「0件」を「違反なし」と読ませない。**数えるものが無かったのは別の話**（§15）
        print("\n::error::またいだ呼び出しを1か所も突き合わせていません。"
              "借り手の集め方が壊れている可能性があります（合否は出していません）")
        return 2

    fails = control(pairs)

    print("\n## 本物")
    for b in bad:
        print("  NG " + b)
    if bad:
        print(f"  {stat['checked']} か所見て、{len(bad)} 件、引数の数が合っていません。")
    else:
        print(f"  {stat['checked']} か所見て、引数の数が合わないものはありませんでした。")

    if fails or bad:
        print()
        for f in fails:
            print("  NG（対照） " + f)
        return 1
    print("\n通った")
    return 0


if __name__ == "__main__":
    sys.exit(main())
