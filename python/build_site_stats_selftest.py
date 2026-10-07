#!/usr/bin/env python3
"""**受け皿の数字を焼くほうが、焼いてはいけない晩に焼かないかを見る。**

    python3 python/build_site_stats_selftest.py
    BREAK=down-bakes python3 python/build_site_stats_selftest.py   # 足を1本抜く

終了コード 0=ぜんぶ通った / 1=外したものがある /
**2=数えるものが無い**（`docs/island-standards.md` §15）/ 3=`BREAK` の名前が違う。

本番も口も叩かない。**この箱で回る**（種は `site/content/site.ts` そのもの）。

## なぜ要るか

`python/build_site_stats.py` は毎晩ひとりでに走って、`site.ts` の
`STATS_FALLBACK` を master に押し込む。**読む人はいない。**

ここが壊れたときに起きるのは「赤くなる」ではない。

| 壊れかた | 画面でどう見えるか |
| --- | --- |
| 口が落ちた晩に 0 を焼く | **口が落ちた日の表紙に「0本の配信」が出る** |
| 口の欄が欠けたまま焼く | 同じ |
| 塊の外まで当てる | **あやとが書いた文（`PROFILE.body`）が機械に書き換えられる** |
| 先の日付を焼く | 見張り（`stale_content_watch.py`）が**永久に緑**になる |

受け皿が出るのは**まさに口が落ちた日**なので、
いちばん上の形は「落ちた日に備えて置いてある数字を、落ちた日に壊す」。
赤くならず、その日の表紙だけが嘘になる。だから対照を付ける。

## 何を見るか

| | 見るもの | 落ちる条件 |
| --- | --- | --- |
| 1 | **本番の口の形を食わせたら、焼いた結果が口と一致する** | 焼いても数が合っていない（＝受け皿の意味がない） |
| 2 | **口が落ちている晩は焼かない**（終了コード 3・1バイトも書かない） | **0 が表紙に出る**（本丸） |
| 3 | **欄が欠けた・0・整数でない返事では焼かない** | 同上 |
| 4 | **縮んだら焼かない** | 口がおかしな数を返した晩に、表紙が巻き戻る |
| 5 | **`updatedAt` が巻き戻る／先の日付では焼かない** | 見張りが永久に緑になる |
| 6 | **`SITE` と `PROFILE` に1バイトも触らない** | 本人から聞いた事実を機械が書き換える |
| 7 | **`recipes` と `since` に触らない** | 手で書かないと決めた欄を手で書いた形に戻す |
| 8 | **焼いた `site.ts` を、焼くほうがもう一度読める**（往復する） | 次の晩から「前の値」が読めず、縮みが見えなくなる |

2 と 3 は**対**で見る。「焼かない」だけを並べても、
**何も焼かない道具**でも通ってしまう。1 がその裏側。

## 足（`BREAK=<足>` で1本ずつ抜く）

**抜くと落ちるところまで見て、初めて「効いている」に意味が出る**（§15）。

| `BREAK` | 何を抜くか | 落ちる章 |
| --- | --- | --- |
| `down-bakes` | 口が落ちても、空の値で焼きに行く | 2 |
| `zero-ok` | 0 や欠けた欄をそのまま通す | 3 |
| `shrink-ok` | 縮みを見ない | 4 |
| `future-ok` | 先の日付を通す | 5 |
| `wide-patch` | 塊の外（`PROFILE`）まで当てる | 6・7 |
"""

from __future__ import annotations

import os
import re
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

import build_site_stats as b  # noqa: E402

SEED = ROOT / "site" / "content" / "site.ts"

# 足の名前。**知らない名前が来たら黙らずに落ちる**（`BREAK=typo` で素通りさせない）
LEGS = ("down-bakes", "zero-ok", "shrink-ok", "future-ok", "wide-patch")
BREAK = os.environ.get("BREAK", "")


def pull_leg() -> None:
    """`BREAK` の足を、本物のモジュールから抜く。抜いていなければ何もしない。"""
    if BREAK == "down-bakes":
        # 届かなかったときに「0 の stats」をこしらえて返す。
        # **これが本丸の壊れかた**——口が落ちた晩に表紙が 0 になる
        real = b.fetch_stats

        def soft(url: str = "") -> dict:
            try:
                return real(url)
            except b.Unreachable:
                return {k: 0 for k in b.NUMBERS} | {b.STAMP: date.today().isoformat()}

        b.fetch_stats = soft
        real_read = b.read_from

        def soft_read(path: Path) -> dict:
            try:
                return real_read(path)
            except b.Unreachable:
                return {k: 0 for k in b.NUMBERS} | {b.STAMP: date.today().isoformat()}

        b.read_from = soft_read
    elif BREAK == "zero-ok":
        # 欠けた欄を 0 で埋め、0 以下を断らない
        def loose(stats: dict, today: date) -> dict:
            out = {k: int(stats.get(k) or 0) for k in b.NUMBERS}
            out[b.STAMP] = str(stats.get(b.STAMP) or today.isoformat())
            return out

        b.pick = loose
    elif BREAK == "shrink-ok":
        b.judge = lambda old, new: None
    elif BREAK == "future-ok":
        real = b.pick
        b.pick = lambda stats, today: real(stats, date(2999, 1, 1))
    elif BREAK == "wide-patch":
        # 塊の外まで当てる。`PROFILE.born` を書き換える形にしてある
        real = b.patch

        def wide(src: str, values: dict) -> str:
            out = real(src, values)
            return out.replace('born: "1998-12-06"', 'born: "1998-12-07"')

        b.patch = wide


ok: list[str] = []
ng: list[str] = []


def check(label: str, got, want) -> None:
    (ok if got == want else ng).append(f"{label}: 出た={got} ほしい={want}")
    print(("  OK   " if got == want else "  NG   ") + f"{label}（出た={got} ほしい={want}）")


# ---------------------------------------------------------------- 仕込み

# **本番の口が返している形そのまま**（2026-10-06 の実測。`GET /island-api/state`）。
# `latest` や `activeFriends` も残してあるのは、**焼く欄だけを拾っている**ことを
# ここで見るため。余りの欄が混ざって焼かれたら 6・7 が落ちる。
PROD = {
    "since": "2024-10-28",
    "updatedAt": "2026-10-06",
    "activeFriends": 71,
    "comments": 148399,
    "streamDays": 649,
    "streams": 800,
    "people": 2333,
    "recentPeople": 343,
    "latest": [{"title": "暗殺者のパスタ", "date": "2026-10-06", "video_id": "GRd0d7d7Ngg"}],
}

TODAY = date(2026, 10, 7)


def run(stats: dict | None, seed: str) -> tuple[int, str]:
    """焼くほうを1回回す。(終了コード, 焼いたあとの字面)

    `stats` が `None` なら「口に届かない」晩。**本物の道（`--from`）を通す**ので、
    届かなかったときの枝もここで当たる。
    """
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / "site.ts"
        out.write_text(seed, encoding="utf-8")
        argv = ["--out", str(out)]
        src = Path(td) / "state.json"
        if stats is None:
            src.write_text('{"stats": null}', encoding="utf-8")
        else:
            import json
            src.write_text(json.dumps({"stats": stats}), encoding="utf-8")
        argv += ["--from", str(src)]
        code = b.main(argv)
        return code, out.read_text(encoding="utf-8")


def outside(src: str) -> str:
    """`STATS_FALLBACK` の塊**より外**の字面。ここが動いたら 6・7 が落ちる。"""
    lo, hi = b.block_span(src)
    return src[:lo] + src[hi:]


def main() -> int:
    if BREAK:
        if BREAK not in LEGS:
            print(f"::error::BREAK={BREAK} は足の名前ではありません。"
                  f"使えるのは {', '.join(LEGS)}")
            return 3
        print(f"** BREAK={BREAK} —— 足を1本抜いてある。ここは落ちるのが正しい **")
        pull_leg()

    if not SEED.is_file():
        print(f"::error::種（{SEED}）がありません")
        return 2
    seed = SEED.read_text(encoding="utf-8")
    # **種が読めることを先に見る。** 読めないまま先へ進むと、
    # 「焼かなかった」ばかりが並んで全部通ってしまう
    try:
        seeded = b.baked(seed)
    except b.Unusable as e:
        print(f"::error::種の STATS_FALLBACK が読めません: {e}")
        return 2
    if set(seeded) != {*b.NUMBERS, b.STAMP}:
        print(f"::error::種から読めた欄が足りません（{sorted(seeded)}）")
        return 2
    print(f"種: {SEED.relative_to(ROOT)}（{', '.join(f'{k} {seeded[k]}' for k in b.NUMBERS)}）")

    # --- 1. 本番の口の形を食わせたら、焼いた結果が口と一致する ----------------
    print("\n1. 本番の口の形を食わせたら、焼いた結果が口と一致する")
    code, out = run(PROD, seed)
    check("終了コード 0", code, 0)
    got = b.baked(out)
    for k in b.NUMBERS:
        check(f"{k} が口と同じ", got.get(k), PROD[k])
    check(f"{b.STAMP} が口と同じ", got.get(b.STAMP), PROD[b.STAMP])
    baked_out = out

    # --- 2. 口が落ちている晩は焼かない ---------------------------------------
    print("\n2. 口が落ちている晩は焼かない（本丸。0 が表紙に出ないこと）")
    code, out = run(None, seed)
    check("終了コード 3（届かなかった）", code, 3)
    check("1バイトも書いていない", out == seed, True)

    # --- 3. 欄が欠けた・0・整数でない返事では焼かない -------------------------
    print("\n3. 欄が欠けた・0・整数でない返事では焼かない")
    for label, stats in (
        ("streams が無い", {k: v for k, v in PROD.items() if k != "streams"}),
        ("comments が無い", {k: v for k, v in PROD.items() if k != "comments"}),
        (f"{b.STAMP} が無い", {k: v for k, v in PROD.items() if k != b.STAMP}),
        ("streams が 0", PROD | {"streams": 0}),
        ("people が 0", PROD | {"people": 0}),
        ("comments が負", PROD | {"comments": -1}),
        ("streams が文字", PROD | {"streams": "800"}),
        ("streams が真偽値", PROD | {"streams": True}),
        ("streams が小数", PROD | {"streams": 800.5}),
        (f"{b.STAMP} が日付でない", PROD | {b.STAMP: "きのう"}),
    ):
        code, out = run(stats, seed)
        check(f"{label} → 終了コード 1", code, 1)
        check(f"{label} → 1バイトも書いていない", out == seed, True)

    # --- 4. 縮んだら焼かない -------------------------------------------------
    print("\n4. 縮んだら焼かない")
    # 種はいま焼いてある値。**そこから1つ減らした返事**を食わせる
    for k in b.NUMBERS:
        stats = PROD | {k: seeded[k] - 1}
        code, out = run(stats, seed)
        check(f"{k} が1つ減った → 終了コード 1", code, 1)
        check(f"{k} が1つ減った → 1バイトも書いていない", out == seed, True)
    # **据え置きは焼いてよい。** 増えない晩はふつうにある（配信が1本も無い日）
    code, out = run(PROD | {k: seeded[k] for k in b.NUMBERS}, seed)
    check("どれも増えていない晩は焼ける（据え置きは縮みではない）", code, 0)

    # --- 5. updatedAt が巻き戻る／先の日付では焼かない ------------------------
    print(f"\n5. {b.STAMP} が巻き戻る／先の日付では焼かない")
    code, out = run(PROD | {b.STAMP: "2026-01-01"}, seed)
    check("巻き戻った → 終了コード 1", code, 1)
    check("巻き戻った → 1バイトも書いていない", out == seed, True)
    # 先の日付は `pick` が今日を物差しに断る。**きょうを渡して当てる**ので、
    # この箱の日付が変わっても結果が変わらない
    far = (TODAY + timedelta(days=400)).isoformat()
    try:
        b.pick(PROD | {b.STAMP: far}, TODAY)
        check(f"400日先（{far}）を断る", "通してしまった", "断った")
    except b.Unusable:
        check(f"400日先（{far}）を断る", "断った", "断った")
    # **あすまでは通す**（口は UTC の日付を書くので、1日先に見える晩がある）
    tomorrow = (TODAY + timedelta(days=1)).isoformat()
    try:
        b.pick(PROD | {b.STAMP: tomorrow}, TODAY)
        check(f"あす（{tomorrow}）は通す", "通した", "通した")
    except b.Unusable:
        check(f"あす（{tomorrow}）は通す", "断ってしまった", "通した")

    # --- 6. SITE と PROFILE に1バイトも触らない ------------------------------
    print("\n6. SITE と PROFILE に1バイトも触らない")
    check("塊の外が1バイトも動いていない", outside(baked_out) == outside(seed), True)
    for name in ("export const SITE = {", "export const PROFILE = {",
                 "export const NOW_FALLBACK = {", "export const LINKS:"):
        at_a, at_b = seed.find(name), baked_out.find(name)
        check(f"`{name}` の位置が動いていない", at_a == at_b and at_a > 0, True)
    # 塊の中で動いた行は、焼く5行だけ
    moved = [a for a, c in zip(seed.split("\n"), baked_out.split("\n")) if a != c]
    check("動いた行は5本だけ", len(moved), 5)
    allowed = re.compile(rf'^\s+(?:{"|".join(b.NUMBERS)}|{b.STAMP}): ')
    check("動いた行が焼く欄だけ", [m for m in moved if not allowed.match(m)], [])

    # --- 7. recipes と since に触らない --------------------------------------
    print("\n7. recipes と since に触らない")
    for line in ("  recipes: RECIPES.length,", '  since: "2024-10-28",'):
        check(f"`{line.strip()}` がそのまま残っている",
              line in seed and line in baked_out, True)
    check("`RECIPES.length` が数字に置き換わっていない",
          "recipes: RECIPES.length," in baked_out, True)

    # --- 8. 焼いたものを、焼くほうがもう一度読める ---------------------------
    print("\n8. 焼いたものを、焼くほうがもう一度読める（往復する）")
    # ここが抜けると、**次の晩から「前の値」が読めない**。
    # 読めなければ `judge()` が比べる相手を失って、縮みを素通りさせる
    again = b.baked(baked_out)
    check("読み直した値が、焼いた値と同じ",
          {k: again.get(k) for k in (*b.NUMBERS, b.STAMP)},
          {k: PROD[k] for k in (*b.NUMBERS, b.STAMP)})
    code, out2 = run(PROD, baked_out)
    check("同じ返事をもう一度食わせたら、書かずに終わる", (code, out2 == baked_out), (0, True))

    # ---------------------------------------------------------------- まとめ
    print(f"\n対照 {len(ok) + len(ng)}件中 {len(ok)}件通った")
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
