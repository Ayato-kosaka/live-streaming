#!/usr/bin/env python3
"""**ショートの棚が、いまの章立てで焼き直せるかを見る。**

    python3 python/build_shorts_selftest.py
    BREAK=open-end python3 python/build_shorts_selftest.py   # 足を1本抜く

終了コード 0=ぜんぶ通った / 1=外したものがある /
**2=数えるものが無い**（`docs/island-standards.md` §15）/ 3=`BREAK` の名前が違う。

**外に出ない。** YouTube も BigQuery も叩かない。種は3つとも置き場の中——
`python/data/shorts.json`（控え）・`site/content/chapters.ts`（章立て）・
`site/content/shorts.ts`（焼いてある棚）。

## なぜ要るか

2026-10-17 から5晩、毎晩の焼き直しが赤かった。落ちていたのは
`chapter_of()` の `e + EDGE_DAYS * DAY` で、**いま歩いている章には終わりが
無い**ので `e` が `FAR`（9999-12-31）になり、そこへ7日足して
`OverflowError`。`docs/island-misses.md` #289。

この落ちかたには、見張りにとって厄介な性質が3つある。

1. **章が変わった日には落ちない。** `b - 7日 <= その日` が偽のあいだ、
   Python は右側を見ない。落ちるのは**その章の窓に入るショートが
   1本でも一覧に出た晩**で、バルカンの章（9/28〜）に移ってから
   **19日**黙っていた
2. **控えの中身に左右される。** 棚のいちばん新しい1本が古いうちは、
   何度回しても緑。だから「今日の棚で通る」だけでは足りない
3. **注記に1行も出なかった。** traceback は `::error::` ではないので、
   5晩ぶんの赤は「棚を取り直せませんでした。上の『焼く』を見てください」
   としか言わなかった

1 と 2 のせいで、**本物の章立てだけを当てても足りない。** そこで1章は
「本物の章立て」と「**終わりの無い章を1つだけ持つ作りもの**」の両方に当てる。
作りもののほうは、いま歩いている章に終わりが付いた日（旅から帰った日）でも
この足が効き続けるため——**対照が、章立ての都合で黙る形にしない。**

## 何を見るか

| | 見るもの | 落ちると何が起きるか |
| --- | --- | --- |
| 1 | **どの日を渡しても、置き場決めが落ちない**（本物＋作りもの） | 毎晩の焼き直しが赤くなる。棚は何週間も止まる |
| 2 | **焼いてある棚が、控えから焼き直したものと1バイトも違わない** | 控えと棚がずれる。**同じ本が晩ごとに出たり消えたりする** |
| 3 | **焼いてある id が、全部ちゃんと控えに在る** | 2 の片側。控えを commit し忘れた形がここで出る |
| 4 | **どの章にも入らないショートが0本** | 出したショートが、島のどこにも出ない（黙って） |

2 と 3 は**対**で見る。3 だけだと「棚が空っぽ」でも通る。

## 足（`BREAK=<足>` で1本ずつ抜く）

| `BREAK` | 何を抜くか | 落ちる章 |
| --- | --- | --- |
| `open-end` | `shift()` の端止めを外す（＝直す前の素の足し算に戻す） | 1 |
| `drop-open` | `spans()` が、終わりの無い章を落とす | 1（4 も、その章に本が在れば） |
| `stale-shelf` | **比べる相手**（焼いてある棚）から、いちばん新しい1本を抜く | 2 |
| `ghost-shelf` | **比べる相手**に、控えに無い id を1本足す | 2・3 |

`stale-shelf` と `ghost-shelf` は実物ではなく**こちらの種**を腐らせる足
（`build_site_stats_selftest.py` の `frozen-probe` と同じ置きかた）。
2 と 3 が見ているのは「棚と控えが合っているか」で、
**どちらがずれても落ちる**ことを、両向きから当てる。
"""

from __future__ import annotations

import os
import re
import sys
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

import build_shorts as b  # noqa: E402

LEDGER = b.SRC
SHELF = b.OUT_TS
CHAPTERS = b.CHAPTERS_TS

# 足の名前。**知らない名前が来たら黙らずに落ちる**（`BREAK=typo` で素通りさせない）
LEGS = ("open-end", "drop-open", "stale-shelf", "ghost-shelf")
BREAK = os.environ.get("BREAK", "")

DAY = timedelta(days=1)

ok: list[str] = []
ng: list[str] = []


def check(label: str, got, want) -> None:
    (ok if got == want else ng).append(f"{label}: 出た={got} ほしい={want}")
    print(("  OK   " if got == want else "  NG   ") + f"{label}（出た={got} ほしい={want}）")


def pull_leg() -> None:
    """`BREAK` の足を、本物のモジュールから抜く。種を腐らせる足はここでは何もしない。"""
    if BREAK == "open-end":
        # **直す前の形に戻す。** 端で止めずに素で足す
        b.shift = lambda d, days: d + days * DAY
    elif BREAK == "drop-open":
        real = b.spans

        def narrow(chs: list[dict]) -> dict[str, tuple[date, date, bool]]:
            return {k: v for k, v in real(chs).items() if v[1] != b.FAR}

        b.spans = narrow


def probe_days(sp: dict[str, tuple[date, date, bool]], today: date) -> list[date]:
    """当てる日。**章の境目と、きょうと、1年先。**

    境目をなぞるのは、`chapter_of()` が窓の端で比べているから。
    きょうと1年先を入れるのは、**終わりの無い章の右端**がそこでしか踏めないため
    （控えのいちばん新しい1本が古いと、本物の棚だけでは踏めない）。
    """
    out = {today, today + 365 * DAY}
    for beg, end, _ in sp.values():
        for d, n in ((beg, -b.EDGE_DAYS - 1), (beg, -b.EDGE_DAYS), (beg, 0), (beg, 1),
                     (end, -1), (end, 0), (end, b.EDGE_DAYS), (end, b.EDGE_DAYS + 1)):
            try:
                out.add(d + n * DAY)
            except OverflowError:
                # 端の章（`FAR`）は、ここで作れない日がある。
                # **1年先**のほうでその右端を踏むので、これは飛ばしてよい
                pass
    return sorted(out)


def made_up() -> dict[str, tuple[date, date, bool]]:
    """**終わりの無い章を1つだけ持つ、作りものの章立て。**

    本物の章立てに終わりの無い章が1つも無い日（旅から帰って、次が決まるまで）
    でも、1章の足が効き続けるようにするため。

    **`spans()` を通して作る。** 手で辞書を組むと、`spans()` を壊す足
    （`drop-open`）がここを素通りして、**抜いても落ちない足**になる。
    """
    today = date.today()

    def row(slug: str, frm: date, to: date | None) -> dict:
        return {"slug": slug, "name": slug, "from": frm.isoformat(),
                "to": to.isoformat() if to else "", "opensAt": "", "branchOf": "",
                "plannedDays": 0, "countries": []}

    return b.spans([
        row("owari-aru", today - 200 * DAY, today - 100 * DAY),
        row("owari-nai", today - 20 * DAY, None),
    ])


def baked_ids(text: str) -> list[str]:
    return re.findall(r'\{ id: "([^"]+)"', text)


def main() -> int:
    if BREAK:
        if BREAK not in LEGS:
            print(f"::error::BREAK={BREAK} は足の名前ではありません。"
                  f"使えるのは {', '.join(LEGS)}")
            return 3
        print(f"** BREAK={BREAK} —— 足を1本抜いてある。ここは落ちるのが正しい **")
        pull_leg()

    for p in (LEDGER, SHELF, CHAPTERS):
        if not p.is_file():
            print(f"::error::種（{p}）がありません")
            return 2

    src = b.load()
    if not src.get("shorts"):
        print(f"::error::控え（{LEDGER.relative_to(ROOT)}）が0本です")
        return 2
    sp = b.spans(b.read_chapters())
    if not sp:
        print("::error::章が1つも読めませんでした")
        return 2
    today = date.today()
    opens = sorted(s for s, (_, e, _) in sp.items() if e == b.FAR)
    print(f"種: 控え {len(src['shorts'])}本 / 章 {len(sp)}つ"
          f"（終わりの無い章 {', '.join(opens) or 'なし'}）/ きょう {today}")

    # --- 1. どの日を渡しても、置き場決めが落ちない ---------------------------
    print("\n1. どの日を渡しても、置き場決めが落ちない")
    for name, table in (("本物の章立て", sp), ("作りもの（終わりの無い章あり）", made_up())):
        days = probe_days(table, today)
        blew: list[str] = []
        for d in days:
            try:
                b.chapter_of(d.isoformat(), table)
            except Exception as exc:  # noqa: BLE001 —— 種類を問わず落ちてはいけない
                blew.append(f"{d} {type(exc).__name__}: {exc}")
        check(f"{name}: {len(days)}日ぜんぶで落ちない", blew[:3], [])
    # **きょうのショートは、終わりの無い章に入る。** 落ちないだけでは足りない
    # （何も返さない作りでも落ちはしない）
    mu = made_up()

    def land(d: date) -> str | None:
        """落ちたら、落ちたことを**値として**返す。ここで traceback を出して
        死ぬと、残りの章を1つも見ずに終わる（＝足を抜いたとき何が落ちたのか
        分からない）"""
        try:
            return b.chapter_of(d.isoformat(), mu)
        except Exception as exc:  # noqa: BLE001
            return f"落ちた: {type(exc).__name__}"

    check("作りもの: きょうは、終わりの無い章に入る", land(today), "owari-nai")
    check("作りもの: 1年先も、終わりの無い章に入る", land(today + 365 * DAY), "owari-nai")

    # --- 2・3. 棚と控えが合っているか ----------------------------------------
    print("\n2. 焼いてある棚が、控えから焼き直したものと1バイトも違わない")
    text, groups, undated, orphan = b.render(src, sp)
    shelf = SHELF.read_text(encoding="utf-8")
    if BREAK == "stale-shelf":
        # いちばん新しい1本を、焼いてある側から抜く（＝棚が置いていかれた形）
        lines = shelf.split("\n")
        last = max(i for i, s in enumerate(lines) if s.lstrip().startswith("{ id: "))
        shelf = "\n".join(lines[:last] + lines[last + 1:])
    if BREAK == "ghost-shelf":
        # 控えに無い id を1本、焼いてある側に足す（＝控えを commit し忘れた形）
        shelf = shelf.replace(
            "export const SHORTS: Record<string, Short[]> = {\n",
            'export const SHORTS: Record<string, Short[]> = {\n  "yurei": [\n'
            '    { id: "zzzzzzzzzzz", date: "2024-01-01", title: "控えに無い1本" },\n  ],\n',
            1,
        )
    n = sum(len(v) for v in groups.values())
    print(f"  控え {len(src['shorts'])}本 → 棚 {n}本 / {len(groups)}か所"
          f"（公開日の取れていないもの {len(undated)}本）")
    check("焼き直したものと、焼いてあるものが同じ", text == shelf, True)
    if text != shelf:
        a, c = text.split("\n"), shelf.split("\n")
        diff = [i for i in range(max(len(a), len(c)))
                if (a[i] if i < len(a) else None) != (c[i] if i < len(c) else None)]
        for i in diff[:5]:
            print(f"::error::  {i + 1}行目 焼き直し={a[i] if i < len(a) else '（無い）'}")
            print(f"::error::  {i + 1}行目 焼いてある={c[i] if i < len(c) else '（無い）'}")
        print("::error::`python3 python/build_shorts.py --build` で焼き直してください")

    print("\n3. 焼いてある id が、全部ちゃんと控えに在る")
    have = {v["id"] for v in src["shorts"]}
    gone = {g["id"] for g in src.get("_gone", [])}
    on_shelf = baked_ids(shelf)
    check("棚に id が並んでいる", len(on_shelf) > 0, True)
    check("控えに無い id が棚に出ていない", sorted(set(on_shelf) - have)[:3], [])
    check("`_gone` に書いた id が棚に出ていない", sorted(set(on_shelf) & gone)[:3], [])

    # --- 4. どの章にも入らないショートが0本 ---------------------------------
    print("\n4. どの章にも入らないショートが0本")
    check("置き場の決まらないショートが無い",
          [f"{v['id']} {v['date']}" for v in orphan][:5], [])
    if orphan:
        print("::error::この本は島のどこにも出ません。"
              "`site/content/chapters.ts` の章の期間を伸ばすか、新しい章を足してください")

    # ---------------------------------------------------------------- まとめ
    print(f"\n対照 {len(ok) + len(ng)}件中 {len(ok)}件通った"
          f"（棚 {n}本 / 章 {len(sp)}つ / 当てた日 {len(probe_days(sp, today))}日）")
    if not ok and not ng:
        print("::error::対照が0件です。種が読めていません")
        return 2
    if ng:
        for line in ng:
            print(f"::error::{line}")
        return 1
    print("○ ぜんぶ通りました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
