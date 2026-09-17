"""**`python/text_expires_watch.py` が、本当に拾うか・本当に黙るかを両側から見る。**

    python3 python/text_expires_watch_selftest.py

終了コード 0=ぜんぶ通った / 1=外したものがある / **2=対照が0件**。

## なぜ「仕込んで拾えた」だけでは対照にならないか

`docs/island-misses.md` #128 の決めごと1。仕込んだ字を拾えることだけ見ても、
**「日付があれば全部拾う」道具でも通ってしまう。** その道具は本番で60件出して、
誰も読まなくなる。だから対照は両側から当てる。

| | 何を当てるか |
| --- | --- |
| 仕込み（`PLANT`） | **その日に嘘になる字**。6通り。拾えなければ寝ている |
| 通す（`GREEN`） | **いつ読んでも本当な字**。6通り。拾ったら狼少年 |

さらに**判定の足を1本ずつ折る**（`BREAK=`）。折ったときに、その足が支えていた
対照が落ちることまで見る。折っても全部通るなら、その足は何も支えていない。

## 先に「手をつけていない写しが、本番と同じ判定になること」を見る

写しを作る途中で壊れても終了コードは同じなので、そこを見ないと対照にならない
（`docs/island-standards.md` §15 の最後）。

## 終了コードは口から実測する

判定だけ見て「2 を返すはず」と書かない。3通りの置き場を作って
`text_expires_watch.py` を**そのまま呼び、返ってきた数を見る**。

## 印字に入れないもの

仕込む字は**こちらで書いたもの**だけ。本番の `site/content/` から字を写して
並べない（引用の本には視聴者さんの書き込みが入っている）。
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from text_expires_watch import (  # noqa: E402
    BREAKS,
    MIRAI,
    SUGITA,
    judge,
    scan_all,
)

REPO = Path(__file__).resolve().parent.parent
SITE = REPO / "site"
TODAY = date(2026, 9, 17)

# **仕込み。** どれも「その日が来ると嘘になる字」。
# (名前, 字, その字を置く形, ほしい日, ほしい見かた, その足)
#   足 … この1件が落ちたら、どの `BREAK=` が効いていたことになるか
PLANT = [
    ("年月日・これから", '"2026年12月1日、島を出る予定。"', "str", date(2026, 12, 1), MIRAI, ""),
    ("年月日・もう過ぎた", '"2026年8月1日にストックホルムへ向かう。"', "str", date(2026, 8, 1), SUGITA, "past"),
    ("月日だけ", '"12月24日に着く。"', "str", date(2026, 12, 24), MIRAI, "wayaku"),
    ("月を持ち回る", '"12月1日に出発して、5日に着く。"', "str", date(2026, 12, 5), MIRAI, "carry"),
    ("月の無い日", '"27日に発ちます。"', "str", date(2026, 9, 27), MIRAI, "carry"),
    ("JSX の地の文", "2027年1月3日まで、ここにいる予定。", "jsx", date(2027, 1, 3), MIRAI, "jsx"),
]

# **通す。** どれも「いつ読んでも本当な字」。拾ったら狼少年
GREEN = [
    ("過去の事実", '"2023年8月1日に出会った友だちが、スウェーデンにいる。"', "str", "forward"),
    ("生まれた日", '"1998年12月6日生まれ。大学からITの学科だった。"', "str", "forward"),
    ("あと何日", '"あと3日で終わる予定。"', "str", ""),
    ("丸1日", '"丸1日いられる、最後の日。泊まるのもこの晩まで。"', "str", ""),
    ("日間", '"12日間で380km 歩いた。"', "str", ""),
    ("注釈の中", "", "comment", ""),
]

# 引用の本に、仕込みと同じ字を置く。**拾ったら、引用を判定していることになる**
QUOTE_LINE = '"2026年12月1日、島を出る予定。"'

# 企画の本に置く仕込み。**字には日付が無く、すぐ上の欄にだけある。**
# `CARRY_FROM` が効いていないと1件も拾えない（`BREAK=carryblock` で落ちる足）
PLAN_PLANT = '''
export const _PLANT_PLAN = [
  {
    id: "plant",
    date: "2026-12-01",
    note: "島を出る予定。",
  },
];
'''
PLAN_DAY = date(2026, 12, 1)


def _plant_src() -> str:
    """仕込みを1枚の面にする。**注釈の中にも同じ字を置く**（拾ってはいけない）。"""
    strs = "\n".join(f"  {t}," for _, t, kind, *_ in PLANT + [(a, b, c, "") for a, b, c, _ in GREEN] if kind == "str")
    jsx = "\n".join(f"      <p>{t}</p>" for _, t, kind, *_ in PLANT if kind == "jsx")
    return (
        "/* 注釈の中の字は拾ってはいけない。2026年12月1日、島を出る予定。 */\n"
        "// これも注釈。2026年12月1日に出発する予定\n"
        "export const PLANTED = [\n" + strs + "\n];\n\n"
        "export default function Planted() {\n"
        "  return (\n    <div>\n" + jsx + "\n    </div>\n  );\n}\n"
    )


def _copy(dst: Path) -> None:
    """`site/` の見る3つを写す。**.ts / .tsx だけ。**"""
    for d in ("app", "content", "components"):
        for p in (SITE / d).rglob("*"):
            if p.is_file() and p.suffix in (".ts", ".tsx"):
                out = dst / p.relative_to(SITE)
                out.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(p, out)


def _run(root: Path, leg: str = "") -> tuple[list, list]:
    """写しを読んで判定する。返すのは (赤, 見送り)。"""
    env = os.environ.get("BREAK")
    if leg:
        os.environ["BREAK"] = leg
    else:
        os.environ.pop("BREAK", None)
    try:
        v = judge(scan_all(root, TODAY), TODAY)
    finally:
        if env is None:
            os.environ.pop("BREAK", None)
        else:
            os.environ["BREAK"] = env
    return v.hits, v.passed


def main() -> int:
    ok: list[str] = []
    ng: list[str] = []

    def check(label: str, got, want) -> None:
        (ok if got == want else ng).append(f"{label}: 出た={got} ほしい={want}")

    base = Path(tempfile.mkdtemp(prefix="textexp-"))

    # ---- 0. 手をつけていない写しが、本番と同じ判定になる ----
    plain = base / "plain"
    _copy(plain)
    real_hits, real_pass = _run(SITE)
    copy_hits, copy_pass = _run(plain)
    check("写しが本番と同じ赤の数", len(copy_hits), len(real_hits))
    check("写しが本番と同じ見送りの数", len(copy_pass), len(real_pass))
    check("手をつけていない写しは赤 0件", len(copy_hits), 0)

    # ---- 1 / 2. 仕込むと拾える・仕込まないと出ない ----
    planted = base / "planted"
    _copy(planted)
    page = planted / "app" / "_plant" / "page.tsx"
    page.parent.mkdir(parents=True, exist_ok=True)
    page.write_text(_plant_src(), encoding="utf-8")
    # 引用の本にも同じ字を置く（拾ってはいけない）
    quote = planted / "content" / "onThisDay.ts"
    quote.write_text(quote.read_text(encoding="utf-8") + f"\nexport const _PLANT = [{QUOTE_LINE}];\n", encoding="utf-8")
    # 企画の本にも仕込む（字ではなく、すぐ上の欄から日を取る足）
    plans = planted / "content" / "plans.ts"
    plans.write_text(plans.read_text(encoding="utf-8") + PLAN_PLANT, encoding="utf-8")

    hits, _ = _run(planted)
    mine = [h for h in hits if "_plant" in h.path]
    plan_hit = [h for h in hits if h.path.endswith("plans.ts") and h.text.startswith("島を出る")]
    check("仕込みを置いた面から拾った数", len(mine), len(PLANT))
    check("企画の本の仕込みを、上の欄の日で拾った", [h.expires for h in plan_hit], [PLAN_DAY])
    check("仕込み以外から新しく拾っていない", len(hits) - len(mine) - len(plan_hit), 0)
    for name, text, kind, want_day, want_rule, _leg in PLANT:
        got = [h for h in mine if h.expires == want_day and h.rule == want_rule]
        check(f"仕込み「{name}」を拾った", len(got) >= 1, True)
    for name, text, kind, _leg in GREEN:
        body = text.strip('"')
        got = [h for h in mine if body and body[:12] in h.text]
        check(f"通す「{name}」を拾っていない", len(got), 0)
    check("引用の本から拾っていない", len([h for h in hits if h.path.endswith("onThisDay.ts")]), 0)

    # ---- 3. 足を1本ずつ折ると、そのたび対照が落ちる ----
    for leg in BREAKS:
        broke, _ = _run(planted, leg)
        b_mine = [h for h in broke if "_plant" in h.path]
        if leg == "forward":
            # 「これから起きる言い方」を見ないと、過去の事実まで拾う
            check("BREAK=forward で過去の事実まで拾う", len(b_mine) > len(PLANT), True)
        elif leg == "carryblock":
            got = [h for h in broke if h.path.endswith("plans.ts") and h.text.startswith("島を出る")]
            check("BREAK=carryblock で、上の欄から取る仕込みが落ちる", len(got), 0)
        elif leg == "quotes":
            got = [h for h in broke if h.path.endswith("onThisDay.ts")]
            check("BREAK=quotes で引用まで拾う", len(got) >= 1, True)
        else:
            want = [p for p in PLANT if p[5] == leg]
            lost = [p for p in want if not [h for h in b_mine if h.expires == p[3]]]
            check(f"BREAK={leg} で仕込み {len(want)}件が落ちる", len(lost), len(want))

    # ---- 4. 終了コードを、口から実測する ----
    empty = base / "empty"
    (empty / "app").mkdir(parents=True)
    got = subprocess.run(
        [sys.executable, str(REPO / "python" / "text_expires_watch.py"), "--dir", str(plain), "--today", str(TODAY)],
        capture_output=True, text=True,
    )
    check("手つかずの写しは 0 で終わる", got.returncode, 0)
    got = subprocess.run(
        [sys.executable, str(REPO / "python" / "text_expires_watch.py"), "--dir", str(planted), "--today", str(TODAY)],
        capture_output=True, text=True,
    )
    check("仕込んだ写しは 1 で終わる", got.returncode, 1)
    got = subprocess.run(
        [sys.executable, str(REPO / "python" / "text_expires_watch.py"), "--dir", str(empty), "--today", str(TODAY)],
        capture_output=True, text=True,
    )
    check("数えるものが無ければ 2 で終わる", got.returncode, 2)

    shutil.rmtree(base, ignore_errors=True)

    print(f"対照 {len(ok) + len(ng)}件中 {len(ok)}件通った")
    for line in ng:
        print(f"::error::{line}")
    if not ok:
        print("::error::対照が0件です")
        return 2
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
