"""**LINEスタンプの面に出る絵は、透かしを焼いたものだけ**を守る。

    python3 python/goods_stamp_selftest.py
    # 0=通った / 1=透かしの無い絵が面に出る / 2=数えるものが無い

## 何を守っているのか

あやとの言葉（2026-10-08）:

> ダウンロードできないように透かし（「LINEスタンプ」みたいな）

**「ダウンロードできない」は作れない。** 作れるのは「取ったものがそのまま
使えない」ほうだけで、そちらは `tools/goods/stampbake.py` が焼いている。

焼くところが正しくても、**焼いていない絵を面に書いてしまう道**が残る。
`site/content/goods.ts` の `art` は字なので、置き場に直に置いた1枚を
指せてしまう。そこを閉じる。

見るのは3つ。

| | 外れると |
| --- | --- |
| `art` が指す先が、焼いたものの帳面（`stamped.json`）に載っている | 1 |
| 載っていて、**指紋（sha256）も合う** | 1 |
| `site/public/goods/line/` に、帳面に無いファイルが落ちていない | 1 |

3つ目まで見るのは、**面に出ていない絵も配られる**から。置き場に置いた
瞬間に URL で取れるので、「面に書いていないから大丈夫」は通らない。

## 対照（`docs/island-standards.md` §15）

本物を見る前に、**自分が落ちられるか**を実測する。

  1. 焼くところの対照を、**子として起こして**通す
     （`stampbake.py --drill`。あちらが壊れていれば、ここは数えない）
  2. 偽の置き場をこしらえて、**合うぶんは 0、指紋を1文字変えたら 1、
     帳面に無い1枚を置いたら 1、絵が1枚も無ければ 2** が出るのを見る

1つでも外れたら、本物の数字を1つも出さずに 2 で帰る。
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(HERE))

from ts_read import code_only, const_string, read_array   # noqa: E402

BOOK = REPO / "tools" / "goods" / "stamped.json"
BAKER = REPO / "tools" / "goods" / "stampbake.py"
SERVED = REPO / "site" / "public" / "goods" / "line"
GOODS = REPO / "site" / "content" / "goods.ts"

#: 面が指してよい置き場。ここ以外を `art` に書いたら、それは焼いていない絵
PREFIX = "/goods/line/"


def wanted(src: str) -> list[str]:
    """面に出る絵の道、ぜんぶ。**枠に出す板（`LINE_PENDING`）も数える。**"""
    code = code_only(src)
    out = [const_string(code, "LINE_PENDING")]
    got = read_array(src, "LINE_STAMPS", keys=("id", "art"), id_key="id")
    if got.missed:
        raise ValueError(f"LINE_STAMPS を {got.missed}件 読み落とした")
    out += [r["art"] for r in got.rows if r["art"]]
    return [p for p in out if p]


def check(paths: list[str], book: dict[str, str], served: Path) -> list[str]:
    """合わないものを並べる。**空なら通った。**"""
    bad: list[str] = []
    for p in paths:
        if not p.startswith(PREFIX):
            bad.append(f"{p} … 焼いた絵の置き場（{PREFIX}）の外を指している")
            continue
        name = p[len(PREFIX):]
        f = served / name
        if not f.is_file():
            bad.append(f"{p} … ファイルが無い")
            continue
        if name not in book:
            bad.append(f"{p} … 焼いたものの帳面に無い（透かしが入っていない）")
            continue
        got = hashlib.sha256(f.read_bytes()).hexdigest()
        if got != book[name]:
            bad.append(f"{p} … 指紋が合わない（焼いたあとで差し替わっている）")
    for f in sorted(served.glob("*")):
        if f.is_file() and f.name not in book:
            bad.append(f"{PREFIX}{f.name} … 帳面に無いのに配られている")
    return bad


def drill() -> bool:
    """対照。**本物を1枚も見る前に回す。**"""
    ok = True

    # (1) 焼くところの対照。子として起こす。あちらが壊れていたら、ここは数えない
    r = subprocess.run(
        [sys.executable, str(BAKER), "--drill"],
        capture_output=True, text=True, cwd=str(REPO),
    )
    if r.returncode != 0:
        print("対照1 外れ: 焼くところの対照が通らない")
        print((r.stdout + r.stderr).strip()[:800])
        ok = False

    # (2) 偽の置き場で、4とおり
    with tempfile.TemporaryDirectory() as box:
        d = Path(box)
        (d / "a.webp").write_bytes(b"AAA")
        (d / "b.webp").write_bytes(b"BBB")
        good = {
            "a.webp": hashlib.sha256(b"AAA").hexdigest(),
            "b.webp": hashlib.sha256(b"BBB").hexdigest(),
        }
        want = [f"{PREFIX}a.webp", f"{PREFIX}b.webp"]
        if check(want, good, d):
            print("対照2 外れ: 合っているのに落ちた")
            ok = False
        tweak = dict(good, **{"a.webp": "0" * 64})
        if not check(want, tweak, d):
            print("対照3 外れ: 指紋が違うのに通った")
            ok = False
        if not check(want, {"a.webp": good["a.webp"]}, d):
            print("対照4 外れ: 帳面に無い1枚が通った")
            ok = False
        (d / "c.webp").write_bytes(b"CCC")
        if not check(want, good, d):
            print("対照5 外れ: 帳面に無いのに配られている1枚を見逃した")
            ok = False

    return ok


def main() -> int:
    if not drill():
        print("対照が外れた。本物は1つも見ていない")
        return 2
    for p in (BOOK, GOODS):
        if not p.is_file():
            print(f"{p.relative_to(REPO)} が無い")
            return 2
    if not SERVED.is_dir():
        print(f"{SERVED.relative_to(REPO)} が無い")
        return 2

    book = json.loads(BOOK.read_text(encoding="utf-8"))
    try:
        paths = wanted(GOODS.read_text(encoding="utf-8"))
    except ValueError as e:
        print(f"goods.ts が読めなかった: {e}")
        return 2
    if not paths:
        print("面に出る絵が1つも読めなかった")
        return 2

    bad = check(paths, book, SERVED)
    n = len(list(SERVED.glob("*")))
    print(f"見た {len(paths)}枚（置き場に {n}枚 / 帳面に {len(book)}枚）")
    if bad:
        for b in bad:
            print(f"  × {b}")
        return 1
    print("○ 面に出る絵は、ぜんぶ透かしを焼いたもの")
    return 0


if __name__ == "__main__":
    sys.exit(main())
