"""**住人グッズの関所（`python/suzuri_residents.gate`）が、本当に止めるか・
本当に通すかを両側から見る。**

    python3 python/suzuri_gate_selftest.py

    BREAK=zero python3 python/suzuri_gate_selftest.py   # 足を1本抜く

終了コード 0=ぜんぶ通った / 1=外したものがある / 2=`BREAK` の名前が違う
（`docs/island-standards.md` §15）。

**ネットも鍵も要らない。** 売り場と島は差し込みで塞いであるので、
`python/selftest_runner.py` から毎 PR 回る。

## なぜ要るか

`python/suzuri_residents.py` の関所は、**鍵が無いときの出どころ（公開の
検索の面）が変わった晩に、島じゅうの「グッズを買う」札がいっぺんに
消えるのを止めるもの**。札は「無ければ出さない」作りなので、
消えても画面は壊れない——**誰も赤くならないまま、札だけが無くなる。**

`rebake.yml` の「中の数が縮んでいないか」とは**層が違う**（`suzuri_residents.py`
の頭の表）。あちらは `commit` を止めるので、空の表を焼いてしまうと
**同じ晩に焼けた他の9本まで master に入らない**（`docs/island-misses.md` #105）。
ここが止めるのは**書くこと**で、書かなければ表は前のまま・他の9本は配られる。

`python/shrink_guard_selftest.py` が `rebake.yml` の関所にやっているのと
同じことを、こちらの関所にやる。

## 何を見るか

| | 見るもの | 落ちる条件 |
| --- | --- | --- |
| 0 | **本番の焼き込みから鍵が読める**（分母） | 読めない関所は、何件減っても「前は0件」で通す |
| 1 | **何も壊していない写しが通る** | 何にでも止める関所になっている |
| 2 | **検索の面が変わった（0件）と、1ページ落ち（24件）で止まる** | 寝ている |
| 3 | **あやとが1件下げたときは通る** | 狼少年。毎晩止まって、誰も読まなくなる |
| 4 | **境目のすぐ両隣**（`KEEP`% ちょうど / その次の1人） | 境目が1人ずれている |
| 5 | **島から人がまとめて抜けた晩は通る** | 正しい縮みを止めている（`characterBox.ts` が踏んだ形） |
| 6 | **抜けた人と引けなかった人が混ざっても、引けなかったほうで決める** | 片方が片方を薄めている |
| 7 | **口を叩いた終了コード**（通る＝0 / 止まる＝2）と、**止めた回は1文字も書かない** | 判定は正しいのに、書いてしまっている |

1 と 2 は**対**で見る。片方だけだと、何にでも止める関所でも通る。

**焼いた形（`render()` が書く字）は、ここでは見ない。** `rebake.yml` の `match` が
`suzuriGoods.ts` を字で数える（グッズの行と `NO_GOODS` の行）ので、書き方を変えると
あちらが黙って0件を読むか、帳尻が合わずに毎晩止まる。**それを見ているのは
`python/shrink_guard_selftest.py`**——2章が「ルールの正規表現がいまの焼き込みに
当たるか」、3章が「何も壊していない写しが通るか」を、本番の焼き込みを種に当てる。
**同じ正規表現の写しをここにも置かない**（`python/ts_read.py` の頭と同じ決め。
写しが2つあると、片方だけ直した日に見ているものが違う）。

## 足を1本ずつ抜く（`BREAK`）

「壊し方を3通り当てた」が同じ足を折っているだけ、では対照にならない
（`docs/island-misses.md` #128 の決めごと1）。

| `BREAK` | 何を元に戻すか | 真っ先に落ちる足（実測 2026-10-13） |
| --- | --- | --- |
| `zero` | **0件を特別扱いしない**（割合だけで見る） | `はじめて焼く晩に0件`（21件中1件） |
| `roster` | **島から抜けた人を分母の外に出さない**（減った鍵を全部数える） | `島から N人まとめて抜けた` 3本（21件中4件） |
| `round` | **割合を丸めてから**比べる | `境目の外側`（21件中2件） |

`roster` と `round` は `抜けた人で薄めても…` も一緒に落とす。あの足は
**2つの決め（分母の外に出す／丸めない）の両方**に乗っているので、
どちらを抜いても答えが変わる。**だから「それ1本で足3本ぶん」とは数えない**
——上の表の「真っ先に落ちる足」が別々であることのほうを見る。

`zero` を別に持っているのは、**前が0件のときだけ効く足**だから。
前が99件なら、0件を特別扱いしなくても割合のほうが先に止める——
つまり**ふだんの晩には現れない。** はじめて焼く晩（`DEST` がまだ無い）に
売り場が0件を返すと、`0 * 100 < KEEP * 0` は偽なので**空のまま書かれる。**

`round` は `stale_content_watch.over_share()` と同じ穴。いまの99件だと
5% は 4.95件なので、**引けなかったのが5件のときに答えが割れる**
（丸めると 95% ちょうどに見えて通る）。
"""

from __future__ import annotations

import json
import os
import pathlib
import subprocess
import sys
import tempfile

REPO = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "python"))

import suzuri_residents as S  # noqa: E402
import ts_read  # noqa: E402

CONTENT = REPO / "site" / "content"

# 検索の面の1ページぶん。**2026-10-13 に実際に引いて数えた**
# （`https://suzuri.jp/search?q=カサ・アヤトの住人` の `data-name` が24件）。
# `from_search()` は途中で切れてもそこまでを返すので、1ページ落ちは起こりうる
PAGE = 24

LEGS = ("zero", "roster", "round")
BREAK = os.environ.get("BREAK", "")


def _hobble(leg: str) -> None:
    """足を1本抜いた関所に差し替える。**当てた足だけが落ちるのが正しい。**"""
    real = S.gate

    def zero(pairs, baked, roster):
        # 0件の早がえりを外す。前が0件のときだけ答えが変わる
        if not pairs and baked:
            return real(pairs, baked, roster)
        if not pairs and not baked:
            return S.Gate(True, 0, 0)
        return real(pairs, baked, roster)

    def no_roster(pairs, baked, roster):
        # 島から抜けた人を分母の外に出さない（減った鍵を全部「引けなかった」に数える）
        return real(pairs, baked, set(baked) | set(pairs))

    def rounded(pairs, baked, roster):
        g = real(pairs, baked, roster)
        if not g.ok and g.now and g.before:
            kept = g.before - len(g.lost)
            if round(100 * kept / g.before) >= S.KEEP:
                return S.Gate(True, g.before, g.now, g.left, g.lost)
        return g

    S.gate = {"zero": zero, "roster": no_roster, "round": rounded}[leg]


def roster_of() -> list[str]:
    """名簿の印。**焼くほうと同じ `norm` を通す**（揺れを落とす式を2つ持たない）。"""
    src = (CONTENT / "residents.ts").read_text(encoding="utf-8")
    body = ts_read.array_body(ts_read.code_only(src), "RESIDENTS")
    out = []
    for o in ts_read.objects(body):
        e = ts_read.fields(o).get("emoji", "")
        if e:
            out.append(S.norm(e))
    return out


def main() -> int:
    if BREAK:
        if BREAK not in LEGS:
            print(f"::error::BREAK={BREAK} は足の名前ではありません。"
                  f"使えるのは {', '.join(LEGS)}")
            return 2
        print(f"** BREAK={BREAK} —— 足を1本抜いてある。ここは落ちるのが正しい **")
        _hobble(BREAK)

    ok: list[str] = []
    ng: list[str] = []

    def check(label: str, got, want) -> None:
        (ok if got == want else ng).append(f"{label}: 出た={got} ほしい={want}")

    # --- 0. 分母 -----------------------------------------------------------
    # **本番の焼き込みから読む。** 自分で書き起こした字から読み返すと、
    # `render()` が書く形に当たっていなくても対照が通る
    baked_src = (CONTENT / "suzuriGoods.ts").read_text(encoding="utf-8")
    baked = S.baked_keys(baked_src)
    roster = roster_of()
    check("焼き込みから鍵が読める（分母が0ではない）", len(baked) > 0, True)
    check("名簿が読める（分母が0ではない）", len(roster) > 0, True)
    # 鍵が名簿の印として引けること。引けなければ「島に居るのに引けなかった」の
    # 判定そのものが意味を持たない（全部「抜けた人」に落ちて、何があっても通る）
    inside = [k for k in baked if k in set(roster)]
    check("焼いてある鍵が名簿の印として引ける", len(inside), len(baked))
    print(f"  焼き込み {len(baked)}件 / 名簿 {len(roster)}人 / "
          f"しきい値 {S.KEEP}% / 1ページ {PAGE}件")

    full = {k: "1" for k in baked}
    rost = set(roster)

    # --- 1〜3. 何も壊していない / 壊した / 正常な縮み -----------------------
    check("何も変わっていない晩", S.gate(full, baked, rost).ok, True)

    gone_all: dict[str, str] = {}
    check("検索の面の組み方が変わった（0件）", S.gate(gone_all, baked, rost).ok, False)
    # **はじめて焼く晩**（`DEST` がまだ無い＝前が0件）に0件。割合だけで見ていると
    # `0 * 100 < KEEP * 0` が偽になって、**空のまま書かれる**
    check("はじめて焼く晩に0件", S.gate(gone_all, [], rost).ok, False)
    check("はじめて焼く晩に引けた", S.gate(full, [], rost).ok, True)

    page = {k: v for k, v in list(full.items())[PAGE:]}
    check(f"検索の面を1ページ取りこぼした（{PAGE}件）", S.gate(page, baked, rost).ok, False)

    one = {k: v for k, v in list(full.items())[1:]}
    check("あやとがデザインを1つ下げた（1件）", S.gate(one, baked, rost).ok, True)

    # --- 4. 境目のすぐ両隣 -------------------------------------------------
    # **割り算ではなく整数から作る**（`stale_content_watch` の #187 と同じ形）。
    # 残ってよい最小の件数は「`kept * 100 >= KEEP * before`」を満たすいちばん小さい kept
    before = len(baked)
    kept_ok = -(-S.KEEP * before // 100)       # 切り上げ。これ以上なら通る
    n_ok = before - kept_ok                    # 引けなくてよい、いちばん多い件数
    n_red = n_ok + 1
    for label, n, want in ((f"境目の内側（引けなかった {n_ok}件）", n_ok, True),
                           (f"境目の外側（引けなかった {n_red}件）", n_red, False)):
        shrunk = {k: v for k, v in list(full.items())[n:]}
        check(label, S.gate(shrunk, baked, rost).ok, want)
    print(f"  境目: 前 {before}件 → 残り {kept_ok}件 なら通る"
          f"（内側 {n_ok}件={100 * n_ok / before:.2f}% / "
          f"外側 {n_red}件={100 * n_red / before:.2f}%）")

    # --- 5. 正しい縮みは通す -----------------------------------------------
    # 名簿から人がまとめて抜けた晩。**売り場も名簿も同じだけ減る。**
    # ここを止める関所は「自分では二度と緑にならない」（`characterBox.ts` が
    # 踏んだ形。`rebake.yml` の注）
    for n in (1, PAGE, before // 2):
        away = set(list(full)[:n])
        shrunk = {k: v for k, v in full.items() if k not in away}
        g = S.gate(shrunk, baked, rost - away)
        check(f"島から {n}人まとめて抜けた晩", (g.ok, len(g.left), len(g.lost)), (True, n, 0))

    # --- 6. 混ざったとき ---------------------------------------------------
    # 抜けた人がたくさん居ても、**引けなかったほうの数で決める。**
    # 「減った鍵の割合」で見ていると、抜けた人が引けなかった人を薄めて素通りする
    away = set(list(full)[:before // 2])
    shrunk = {k: v for k, v in full.items() if k not in away}
    for k in list(shrunk)[:n_red]:
        del shrunk[k]
    g = S.gate(shrunk, baked, rost - away)
    check("抜けた人で薄めても、引けなかった側で止まる", (g.ok, len(g.lost)), (False, n_red))

    # --- 7. 口を叩いた終了コードと、止めた回に書いていないこと ---------------
    # 判定だけ見て「2 を返すはず」と書かない。**`main()` をそのまま呼ぶ。**
    # 売り場と島は差し込みで塞ぐので、ネットには出ない
    for label, pairs, want, changed in (
        ("通る", full, 0, True),
        ("0件で止まる", gone_all, S.STOPPED, False),
        ("1ページ落ちで止まる", page, S.STOPPED, False),
    ):
        code, after = _run(pairs, roster, baked_src)
        check(f"口を叩いたときの終了コード（{label}）", code, want)
        check(f"口を叩いたあと焼き込みが変わったか（{label}）", after != baked_src, changed)

    # --- 出す -------------------------------------------------------------
    for line in ok:
        print(f"  ○ {line}")
    print(f"対照 {len(ok) + len(ng)}件中 {len(ok)}件通った")
    if not ok and not ng:
        print("::error::数えるものがありません")
        return 2
    for line in ng:
        print(f"::error::{line}")
    return 1 if ng else 0


def _run(pairs: dict[str, str], roster: list[str], seed: str) -> tuple[int, str]:
    """`main()` を**そのまま**呼んで、終了コードと焼き込みの中身を持ち帰る。

    売り場（`from_search`）と島（`island`）だけを差し込みで塞ぐ。
    **関所も `render()` も本物のまま**通る。
    """
    with tempfile.TemporaryDirectory() as tmp:
        d = pathlib.Path(tmp)
        dest = d / "suzuriGoods.ts"
        dest.write_text(seed, encoding="utf-8")
        (d / "in.json").write_text(
            json.dumps({"pairs": pairs, "roster": roster}), encoding="utf-8"
        )
        stub = (
            "import json, os, pathlib, sys\n"
            f"sys.path.insert(0, {str(REPO / 'python')!r})\n"
            "import suzuri_residents as S\n"
            "d = pathlib.Path(os.environ['GATE_DIR'])\n"
            "S.DEST = d / 'suzuriGoods.ts'\n"
            "data = json.loads((d / 'in.json').read_text())\n"
            "S.from_search = lambda: data['pairs']\n"
            "S.island = lambda: [{'emoji': e} for e in data['roster']]\n"
            "sys.argv = ['suzuri_residents.py']\n"
            "raise SystemExit(S.main())\n"
        )
        env = {k: v for k, v in os.environ.items() if k != "SUZURI_API_KEY"}
        env["GATE_DIR"] = str(d)
        r = subprocess.run([sys.executable, "-c", stub], capture_output=True,
                           text=True, env=env)
        return r.returncode, dest.read_text(encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
