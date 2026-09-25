"""**内訳が止まる門の名前が、口と道具で揃っているか。**

0＝揃っている / 1＝食い違っている / 2＝数えるものが無い

## なぜ要るか（2026-09-25）

配ったあと `GET /island-api/fund/desk` が内訳を返さなくなった。画面からは
「内訳は、いま出せません。」としか見えず、**本番の Functions のログを読んで
理由（絞り込みつきの `sum()` が複合索引を要る）にたどり着くまで13分**かかった。

直したのは2つ。口が**止まった門の名前**（`SplitWhy`）を返すようにしたのと、
本番で1回通す道具（`python/admin/fund_desk_probe.py`）がその名前を
日本語にして出すようにしたこと。

**この2つは別のファイルにある。** 門を1つ足した日に道具のほうを書き足す
のを忘れると、次に止まったときまた「知らない門」としか出ず、
**同じ13分をもう一度払う。** それを止めるのがここ。

## 見るもの

  1. `functions/src/fundDesk.ts` の `SplitWhy` の値をぜんぶ拾う
  2. `python/admin/fund_desk_probe.py` の `WHY` の鍵をぜんぶ拾う
  3. **どちらにしか無いものが1つでもあれば落とす**

**片側だけ見ない。** 口に足して道具に無いのも、道具に在って口に無いのも、
どちらも「名前が当てにならない」という同じ困り方になる。

## 対照

```bash
python3 python/fund_gate_names_selftest.py
BREAK=missing python3 python/fund_gate_names_selftest.py   # 道具から1つ抜く
BREAK=extra   python3 python/fund_gate_names_selftest.py   # 道具に1つ増やす
BREAK=none    python3 python/fund_gate_names_selftest.py   # 口から拾えなくする
```

**`BREAK=` を当てると落ちる**ところまで見て、初めて「揃っている」に意味が出る。
"""

import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
TS = REPO / "functions" / "src" / "fundDesk.ts"
PY = REPO / "python" / "admin" / "fund_desk_probe.py"

BREAK = os.environ.get("BREAK", "")


def nothing(why: str) -> None:
    """**数えるものが無い。** 0 でも 1 でもなく 2 で落ちる。

    Args:
        why: 何が見つからなかったか
    """
    print(f"✕ 数えるものが無い: {why}")
    sys.exit(2)


def gates_of_ts(src: str) -> set[str]:
    """口（`fundDesk.ts`）の `SplitWhy` から、門の名前を拾う。

    Args:
        src: `fundDesk.ts` の中身

    Returns:
        門の名前
    """
    m = re.search(r"type SplitWhy\s*=(.*?);", src, re.S)
    if not m:
        return set()
    return set(re.findall(r'\|\s*"([a-z]+)"', m.group(1)))


def gates_of_py(src: str) -> set[str]:
    """道具（`fund_desk_probe.py`）の `WHY` から、門の名前を拾う。

    Args:
        src: `fund_desk_probe.py` の中身

    Returns:
        門の名前
    """
    m = re.search(r"WHY = \{(.*?)\n    \}", src, re.S)
    if not m:
        return set()
    return set(re.findall(r'^\s+"([a-z]+)":', m.group(1), re.M))


def main() -> int:
    """エントリポイント。

    Returns:
        0＝揃っている / 1＝食い違っている
    """
    if not TS.exists() or not PY.exists():
        nothing(f"{TS} か {PY} が無い")
    ts_src = TS.read_text(encoding="utf-8")
    py_src = PY.read_text(encoding="utf-8")

    # **拾えなかったら、0件を「揃っている」と読まない**（`island-standards` §15）
    if BREAK == "none":
        ts_src = ts_src.replace("type SplitWhy", "type SplitWhyX")
    ts = gates_of_ts(ts_src)
    py = gates_of_py(py_src)
    if BREAK == "missing" and py:
        py = py - {sorted(py)[0]}
    if BREAK == "extra":
        py = py | {"zzz"}

    if not ts:
        nothing("口（fundDesk.ts）から門の名前を1つも拾えなかった")
    if not py:
        nothing("道具（fund_desk_probe.py）から門の名前を1つも拾えなかった")

    print(f"口の門   {len(ts)}個: {', '.join(sorted(ts))}")
    print(f"道具の表 {len(py)}個: {', '.join(sorted(py))}")

    only_ts = sorted(ts - py)
    only_py = sorted(py - ts)
    if only_ts:
        print(f"✕ 口にだけ在る（道具が「知らない門」と出す）: {', '.join(only_ts)}")
    if only_py:
        print(f"✕ 道具にだけ在る（もう返らない名前）: {', '.join(only_py)}")
    if only_ts or only_py:
        return 1
    print("○ 門の名前は、口と道具でそろっている")
    return 0


if __name__ == "__main__":
    sys.exit(main())
