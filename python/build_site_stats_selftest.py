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

## 仕込みに「絶対の数」を書かない（2026-10-08 に腐らせた）

**ここには 2026-10-06 の口の返事が、数ごと写してあった。**
10-07 の晩の焼き直しが通って `site.ts` が 801 / 650 / 10-07 になった瞬間、
仕込みの 800 / 649 / 10-06 が**「縮んでいる」側に回って**、焼くほうの
縮み関所に正しく断られた。**対照が、自分の成功で自分を壊した。**
数字は毎晩増えるので、放っておくと差が開くだけで二度と通らない。
しかもここは `rebake.yml` の**焼く前の関所**なので、
**毎晩の焼き直しがまるごと止まった**（`docs/island-misses.md` #209）。

だから仕込みは **`site.ts` に焼いてある値から作る**（`probe()`）。
数は現在値＋1、日付は現在値の翌日。**いつ走っても必ず「増えている」側**になる。
縮みを当てる側も、現在値から引いて作る。

**物差しの「きょう」も、箱の日付ではなく種の日付に合わせる**（`_Clock`）。
種が先まで焼き進んでいても、「増えている返事」が作れるようにするため。

## 2周する（「明日もう一度走らせても通る」を、毎晩ここで当てる）

| 周 | 種 | 何のため |
| --- | --- | --- |
| 1周目 | いまの `site.ts` | 本番の値そのもので当てる |
| 2周目 | **数を＋50・日付を31日進めた写し** | **明日も・来月も通ることを、今晩のうちに当てる** |

2周目が無いと、腐りは**腐った翌朝まで見えない。**
今回それで止まったので、腐りそのものを対照にした。

## 何を見るか（各周で）

| | 見るもの | 落ちる条件 |
| --- | --- | --- |
| 1 | **口の形を食わせたら、焼いた結果が口と一致する** | 焼いても数が合っていない（＝受け皿の意味がない） |
| 2 | **口が落ちている晩は焼かない**（終了コード 3・1バイトも書かない） | **0 が表紙に出る**（本丸） |
| 3 | **欄が欠けた・0・整数でない返事では焼かない**（通しの終了コードと、`pick` 単体の両方で当てる） | 同上 |
| 4 | **縮んだら焼かない** | 口がおかしな数を返した晩に、表紙が巻き戻る |
| 5 | **`updatedAt` が巻き戻る／先の日付では焼かない** | 見張りが永久に緑になる |
| 6 | **`SITE` と `PROFILE` に1バイトも触らない** | 本人から聞いた事実を機械が書き換える |
| 7 | **`recipes` と `since` に触らない** | 手で書かないと決めた欄を手で書いた形に戻す |
| 8 | **焼いた `site.ts` を、焼くほうがもう一度読める**（往復する） | 次の晩から「前の値」が読めず、縮みが見えなくなる |

2 と 3 は**対**で見る。「焼かない」だけを並べても、
**何も焼かない道具**でも通ってしまう。1 がその裏側。

3 は**通しの終了コードだけでは足りない。** 欠けた欄を 0 で埋めるような返事は、
`pick` が通しても次の `judge` が「縮んだ」で断るので、終了コードは 1 のまま。
**`pick` の関所を1本抜いても赤くならない。** だから `pick` 単体にも当てる
（`refuses()`）。

## 足（`BREAK=<足>` で1本ずつ抜く）

**抜くと落ちるところまで見て、初めて「効いている」に意味が出る**（§15）。

| `BREAK` | 何を抜くか | 落ちる章 |
| --- | --- | --- |
| `down-bakes` | 口が落ちても、空の値で焼きに行く | 2 |
| `zero-ok` | 0 や欠けた欄をそのまま通す | 3 |
| `shrink-ok` | 縮みを見ない | 4 |
| `future-ok` | 先の日付を通す | 5 |
| `rollback-ok` | `updatedAt` の巻き戻りだけを見ない（縮みは見る） | 5 |
| `wide-patch` | 塊の外（`PROFILE`）まで当てる | 6・7 |
| `frozen-probe` | **仕込みを「2026-10-06 の実測」の絶対の数に戻す** | 0・1（＝腐りそのもの） |

`patch()` の中の「当てたあとに塊の外を突き合わせる」1行だけは、**抜いても
ここは赤くならない。** あの行は `patch()` 自身が誤って外へ当てたときにしか
立たないので、`patch()` が正しいうちは結果が変わらない。
ここが見ているのは**結果のほう**（6章「塊の外が1バイトも動いていない」）で、
そちらが効いていることは `BREAK=wide-patch` で当たっている
（突き合わせを外した上で `wide-patch` を当てても、6章が落ちる）。
**層が違うので、両方置いておく。**
"""

from __future__ import annotations

import os
import re
import sys
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

import build_site_stats as b  # noqa: E402

SEED = ROOT / "site" / "content" / "site.ts"

# **足を抜く前の、本物の当て役。** 2周目の種（先へ焼き進めた写し）は、これで作る。
# `b.patch` を直に呼ぶと `BREAK=wide-patch` のとき**写しのほうも一緒に壊れて**、
# 落ちるはずの章が落ちなくなる。ここで掴んでおけば、足を抜いても写しは素のまま。
# 自前の正規表現で当てないのは、**TS を字で読む場所を増やさない**ため
# （`python/ts_readers_selftest.py` が増えたのを数えている）
PATCH = b.patch

# 足の名前。**知らない名前が来たら黙らずに落ちる**（`BREAK=typo` で素通りさせない）
LEGS = ("down-bakes", "zero-ok", "shrink-ok", "rollback-ok", "future-ok",
        "wide-patch", "frozen-probe")
BREAK = os.environ.get("BREAK", "")

# 2周目の写しを、どれだけ先へ進めるか。
# 日付は**1ヶ月**（31日）。数は**＋50**（1ヶ月ぶんの配信より多い）
AHEAD_DAYS = 31
AHEAD_STEP = 50


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
    elif BREAK == "rollback-ok":
        # `judge` の**日付の巻き戻りだけ**を抜く。数の縮みは生きたまま。
        # 本物をそのまま呼ぶので、抜いた足のぶんだけが効く（判定が写しに逸れない）
        real = b.judge

        def half(old: dict, new: dict) -> None:
            real(old, new | {b.STAMP: old.get(b.STAMP, new[b.STAMP])})

        b.judge = half
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
    # `frozen-probe` は本物のモジュールではなく、こちらの仕込みを腐らせる足。
    # 抜きかたは `probe()` の中にある


ok: list[str] = []
ng: list[str] = []


def check(label: str, got, want) -> None:
    (ok if got == want else ng).append(f"{label}: 出た={got} ほしい={want}")
    print(("  OK   " if got == want else "  NG   ") + f"{label}（出た={got} ほしい={want}）")


# ---------------------------------------------------------------- 仕込み

# 口が返す**欄立て**（2026-10-06 の `GET /island-api/state` から写した形）。
# **焼く欄の値はここに置かない。**`probe()` が種から作る。
# `latest` や `activeFriends` を残してあるのは、**焼く欄だけを拾っている**ことを
# ここで見るため。余りの欄が混ざって焼かれたら 6・7 が落ちる
SHAPE = {
    "since": "2024-10-28",
    "activeFriends": 71,
    "recentPeople": 343,
    "latest": [{"title": "暗殺者のパスタ", "date": "2026-10-06", "video_id": "GRd0d7d7Ngg"}],
}

# **腐った仕込みそのもの。`BREAK=frozen-probe` のときだけ使う。**
# 2026-10-06 の実測を絶対の数として写してあった、まさにその形
FROZEN = SHAPE | {
    "updatedAt": "2026-10-06",
    "comments": 148399,
    "streamDays": 649,
    "streams": 800,
    "people": 2333,
}

# この周の物差しの「きょう」。周ごとに種の日付へ合わせる（`battery()` が書く）
NOW: date = date.today()


class _Clock(date):
    """焼くほう（`b.main`）が見る「きょう」を、**種の日付に合わせる**ための時計。

    `pick()` は先の日付を「きょう＋1日」で断る。種が先まで焼き進んでいる写し
    （2周目）に対しては、箱の日付を物差しにすると**どんな返事も先の日付**になって
    しまうので、周ごとに物差しを動かす。**断る働きそのものは触っていない**
    （5章が、その周の「きょう」から400日先を断ることを毎周当てている）。
    """

    @classmethod
    def today(cls) -> date:
        return NOW


b.date = _Clock


def stamp_of(values: dict) -> date:
    """`updatedAt` を日付にする。"""
    return datetime.strptime(values[b.STAMP], "%Y-%m-%d").date()


def probe(seeded: dict) -> dict:
    """口の返事の**仕込み**を、いま種に焼いてある値から作る。

    数は現在値＋1、日付は現在値の翌日。**いつ走っても必ず「増えている」側**。
    絶対の数を書くと、焼き直しが1回通った翌朝に腐る（docstring の「仕込みに
    『絶対の数』を書かない」）。
    """
    if BREAK == "frozen-probe":
        return dict(FROZEN)
    out = dict(SHAPE)
    for k in b.NUMBERS:
        out[k] = seeded[k] + 1
    out[b.STAMP] = (stamp_of(seeded) + timedelta(days=1)).isoformat()
    return out


def advance(seed: str, seeded: dict, days: int, step: int) -> str:
    """種を**先へ焼き進めた写し**にする（2周目の種）。

    当てるのは**足を抜く前に掴んである本物の当て役**（`PATCH`）。
    写しを作る道具が「焼くほうと同じ」なので、写しだけ別の形になることがない。
    """
    stamp = (stamp_of(seeded) + timedelta(days=days)).isoformat()
    return PATCH(seed, {k: seeded[k] + step for k in b.NUMBERS} | {b.STAMP: stamp})


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


def refuses(stats: dict) -> str:
    """`pick` 単体が、その返事を断るか。

    **`judge` の縮みに助けられていないか**を見るため。欠けた欄を 0 で埋める
    ような返事は、`pick` が通しても次の `judge` が「縮んだ」で断る。
    通しで終了コードだけ見ていると、**`pick` の関所を1本抜いても赤くならない**
    （§15「対照は、足の数だけ用意する」）。だから1本ずつここで当てる。

    落ちた（`KeyError` などの例外）は「断った」に数えない。**断るのと落ちるのは別**で、
    落ちかたに頼ると、関所を外した日に例外の形が変わって黙って通る。
    """
    try:
        b.pick(stats, NOW)
    except b.Unusable:
        return "断った"
    except Exception as e:
        return f"例外（{type(e).__name__}）"
    return "通してしまった"


def outside(src: str) -> str:
    """`STATS_FALLBACK` の塊**より外**の字面。ここが動いたら 6・7 が落ちる。"""
    lo, hi = b.block_span(src)
    return src[:lo] + src[hi:]


def read_seed(seed: str, what: str) -> dict | None:
    """種から、焼いてある5つを読む。読めなければ `None`（＝数えるものが無い）。"""
    try:
        seeded = b.baked(seed)
    except b.Unusable as e:
        print(f"::error::{what}の STATS_FALLBACK が読めません: {e}")
        return None
    if set(seeded) != {*b.NUMBERS, b.STAMP}:
        print(f"::error::{what}から読めた欄が足りません（{sorted(seeded)}）")
        return None
    if not b.DATE_RE.match(seeded[b.STAMP]):
        print(f"::error::{what}の {b.STAMP} が日付ではありません（{seeded[b.STAMP]!r}）")
        return None
    return seeded


def battery(seed: str, what: str) -> bool:
    """1周ぶん。種を1つ渡して、1〜8章を当てる。種が読めなければ `False`。"""
    global NOW

    seeded = read_seed(seed, what)
    if seeded is None:
        return False
    # **この周の物差し。** 種が先まで焼き進んでいたら、そこを「きょう」にする
    NOW = max(date.today(), stamp_of(seeded))
    got = probe(seeded)

    print(f"\n{'=' * 68}\n■ {what}"
          f"（{', '.join(f'{k} {seeded[k]:,}' for k in b.NUMBERS)}"
          f", {b.STAMP} {seeded[b.STAMP]}）\n  きょう＝{NOW}"
          f" / 仕込み＝{', '.join(f'{k} {got[k]:,}' for k in b.NUMBERS)}"
          f", {b.STAMP} {got[b.STAMP]}\n{'=' * 68}")

    # --- 0. 仕込みが、種より5欄とも進んでいる ---------------------------------
    # **ここが前提。** 1欄でも進んでいなければ、下の「動いた行は5本」も
    # 「口と一致」も、何を見ているか分からなくなる。
    # **腐った仕込み（`BREAK=frozen-probe`）はここで真っ先に落ちる**
    print("\n0. 仕込みが、いま焼いてある値より5欄とも進んでいる（腐っていない）")
    behind = [f"{k} {seeded[k]} → {got[k]}" for k in b.NUMBERS if got[k] <= seeded[k]]
    check("数4つが、焼いてある値より大きい", behind, [])
    check(f"{b.STAMP} が、焼いてある日より新しい",
          got[b.STAMP] > seeded[b.STAMP], True)

    # --- 1. 口の形を食わせたら、焼いた結果が口と一致する ----------------------
    print("\n1. 口の形を食わせたら、焼いた結果が口と一致する")
    code, out = run(got, seed)
    check("終了コード 0", code, 0)
    baked_out = out
    read_back = b.baked(out)
    for k in b.NUMBERS:
        check(f"{k} が口と同じ", read_back.get(k), got[k])
    check(f"{b.STAMP} が口と同じ", read_back.get(b.STAMP), got[b.STAMP])

    # --- 2. 口が落ちている晩は焼かない ---------------------------------------
    print("\n2. 口が落ちている晩は焼かない（本丸。0 が表紙に出ないこと）")
    code, out = run(None, seed)
    check("終了コード 3（届かなかった）", code, 3)
    check("1バイトも書いていない", out == seed, True)

    # --- 3. 欄が欠けた・0・整数でない返事では焼かない -------------------------
    print("\n3. 欄が欠けた・0・整数でない返事では焼かない")
    for label, stats in (
        ("streams が無い", {k: v for k, v in got.items() if k != "streams"}),
        ("comments が無い", {k: v for k, v in got.items() if k != "comments"}),
        (f"{b.STAMP} が無い", {k: v for k, v in got.items() if k != b.STAMP}),
        ("streams が 0", got | {"streams": 0}),
        ("people が 0", got | {"people": 0}),
        ("comments が負", got | {"comments": -1}),
        ("streams が文字", got | {"streams": str(got["streams"])}),
        ("streams が真偽値", got | {"streams": True}),
        ("streams が小数", got | {"streams": got["streams"] + 0.5}),
        (f"{b.STAMP} が日付でない", got | {b.STAMP: "きのう"}),
    ):
        code, out = run(stats, seed)
        check(f"{label} → 終了コード 1", code, 1)
        check(f"{label} → 1バイトも書いていない", out == seed, True)
        check(f"{label} → pick 単体が断る", refuses(stats), "断った")

    # --- 4. 縮んだら焼かない -------------------------------------------------
    print("\n4. 縮んだら焼かない")
    # 種はいま焼いてある値。**そこから1つ減らした返事**を食わせる。
    # 減らすのは1欄だけで、ほかは増えている側のまま——
    # **断る理由が「その欄が縮んだこと」1つに絞られる**
    for k in b.NUMBERS:
        stats = got | {k: seeded[k] - 1}
        code, out = run(stats, seed)
        check(f"{k} が1つ減った → 終了コード 1", code, 1)
        check(f"{k} が1つ減った → 1バイトも書いていない", out == seed, True)
    # **据え置きは焼いてよい。** 増えない晩はふつうにある（配信が1本も無い日）
    code, out = run(got | {k: seeded[k] for k in (*b.NUMBERS, b.STAMP)}, seed)
    check("どれも増えていない晩は焼ける（据え置きは縮みではない）", code, 0)

    # --- 5. updatedAt が巻き戻る／先の日付では焼かない ------------------------
    print(f"\n5. {b.STAMP} が巻き戻る／先の日付では焼かない")
    # **数は増えている側のまま、日付だけ1日巻き戻す。**
    # ここを絶対の日付にすると、数のほうが縮んで断られて、
    # 「巻き戻りを断った」のか「縮みを断った」のか見分けられなくなる
    back = (stamp_of(seeded) - timedelta(days=1)).isoformat()
    code, out = run(got | {b.STAMP: back}, seed)
    check(f"巻き戻った（{seeded[b.STAMP]} → {back}） → 終了コード 1", code, 1)
    check("巻き戻った → 1バイトも書いていない", out == seed, True)
    # 先の日付は `pick` が今日を物差しに断る。**この周の「きょう」を渡して当てる**ので、
    # この箱の日付が変わっても結果が変わらない
    far = (NOW + timedelta(days=400)).isoformat()
    try:
        b.pick(got | {b.STAMP: far}, NOW)
        check(f"400日先（{far}）を断る", "通してしまった", "断った")
    except b.Unusable:
        check(f"400日先（{far}）を断る", "断った", "断った")
    # **あすまでは通す**（口は UTC の日付を書くので、1日先に見える晩がある）
    tomorrow = (NOW + timedelta(days=1)).isoformat()
    try:
        b.pick(got | {b.STAMP: tomorrow}, NOW)
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
    # 塊の中で動いた行は、焼く5行だけ（0章で5欄とも進んでいることを見てある）
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
          {k: got[k] for k in (*b.NUMBERS, b.STAMP)})
    code, out2 = run(got, baked_out)
    check("同じ返事をもう一度食わせたら、書かずに終わる", (code, out2 == baked_out), (0, True))
    return True


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
    seeded = read_seed(seed, f"種（{SEED.relative_to(ROOT)}）")
    if seeded is None:
        return 2
    print(f"種: {SEED.relative_to(ROOT)}"
          f"（{', '.join(f'{k} {seeded[k]:,}' for k in b.NUMBERS)}"
          f", {b.STAMP} {seeded[b.STAMP]} / 箱のきょう {date.today()}）")

    # --- 1周目: いまの種 -----------------------------------------------------
    if not battery(seed, f"1周目: いまの {SEED.relative_to(ROOT)}"):
        return 2

    # --- 2周目: 先へ焼き進めた写し -------------------------------------------
    # **「明日もう一度走らせても通る」を、今晩のうちに当てる。**
    # 仕込みを絶対の数で持っていると、ここで必ず落ちる
    later = advance(seed, seeded, AHEAD_DAYS, AHEAD_STEP)
    moved = read_seed(later, "先へ進めた写し")
    if moved is None:
        return 2
    print(f"\n写しを作った: 数＋{AHEAD_STEP} / {b.STAMP} を{AHEAD_DAYS}日先へ"
          f"（{seeded[b.STAMP]} → {moved[b.STAMP]}）")
    check("写しが、いまの種より先へ進んでいる",
          all(moved[k] == seeded[k] + AHEAD_STEP for k in b.NUMBERS)
          and moved[b.STAMP] > seeded[b.STAMP], True)
    check("写しの塊の外が、いまの種と1バイトも違わない",
          outside(later) == outside(seed), True)
    if not battery(later, f"2周目: {AHEAD_DAYS}日先まで焼き進んだ写し"):
        return 2

    # ---------------------------------------------------------------- まとめ
    print(f"\n対照 {len(ok) + len(ng)}件中 {len(ok)}件通った（2周 × 1〜8章）")
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
