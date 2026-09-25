"""貯金箱の出し入れを、**本番で1回通して確かめる**（GitHub #643）。

ARGS: なし（`{}`）

## なぜ要るか

口（`functions/src/fundDesk.ts`）は偽の Firestore で 134件ぶん確かめてある。
確かめられていないのは、**本物の Firestore で本当に「2回入れても増えない」か**
のほう。`set(..., {merge: true})` の振る舞いは偽物では写しきれない。

そして **配るまでは1度も叩けない**。だから配ったその日に1回通す。

## 何をするか

1. `GET /island-api/fund` の `total` と `given` を控える。
   **見るのは `total − given`**（＝起点。支出の合計の符号を反転したもの）。
   `total` そのものは Doneru の累計が生きているので、触らなくても動く
2. **1円**の出費を1件入れる。`box.spendCount` と `box.spend` を控える
3. **同じものをもう一度**入れる。`already` が立ち、件数も合計も**動かない**
4. 入れた1件を消す。件数と合計が1に戻る
5. `GET /island-api/fund` の `total − given` が、はじめと同じ

**入れるのは1円。** 万一この道具が途中で落ちても、豚の額は1円しか動かない
（そして次の晩の掃除が正しい額に戻す）。

## 出さないもの

**このリポジトリは公開で、Actions のログも誰でも読める。**
出すのは**件数と円と日付**だけ。書類ID・名前・本文は1文字も出さない。
"""

import sys

from _fs import args, db, log
from _owner import API_BASE, call, owner_token

import requests

# 入れて消す1件。**額は1円**（落ちても動く幅を最小にする）
DAY = "2000-01-01"
TITLE = "うごきの確かめ"
YEN = 1


def fund() -> dict:
    """誰でも読める合計を引く。**札は付けない**（公開の口なので）。

    Returns:
        `total` `given` ほか
    """
    res = requests.get(f"{API_BASE}/fund", timeout=60)
    if res.status_code != 200:
        raise SystemExit(f"GET /fund が {res.status_code} で返りました")
    return res.json()


def box_of(desk: dict) -> tuple[int, int]:
    """机の返事から、出費の件数と合計を取り出す。

    Args:
        desk: `GET /fund/desk` の返事

    Returns:
        `(件数, 合計)`
    """
    b = desk.get("box") or {}
    return int(b.get("spendCount") or 0), int(b.get("spend") or 0)


def main() -> None:
    """エントリポイント。**落ちたら 1 で終わる**（入れた1件は下で必ず消す）。"""
    args()  # 入力は取らない。取り違えて別の額を入れる口にしない
    client = db()
    token = owner_token(client)

    # ---- 1. はじめの額 ----
    a = fund()
    start0 = int(a["total"]) - int(a["given"])
    log.info(
        "はじめ: total %s円 / given %s円 / 起点 %s円",
        a["total"], a["given"], start0,
    )

    # ---- 札なしで叩けないこと ----
    no = requests.get(f"{API_BASE}/fund/desk", timeout=60)
    log.info("合言葉なしの GET /fund/desk: %d", no.status_code)
    if no.status_code != 403:
        raise SystemExit("**合言葉なしで通ってしまいました**")

    desk0 = call("GET", "/fund/desk", token)
    n0, y0 = box_of(desk0)
    log.info("いまの出費: %d件 / %s円", n0, y0)

    # ---- 内訳が、豚に出ている額とぴったり合うか ----
    #
    # **ここが、この道具のいちばん大事なところ。** 机は5行の内訳を出すが、
    # 「足して頭の額に戻る」ことは**本番の数でしか確かめられない**
    # （作りとしては合わない形を作れないが、それは「作りがそう」までしか
    #  言っていない。`docs/island-misses.md` #1 と同じ筋で、本番の値で見る）。
    #
    # **読めない日は内訳をまるごと出さない**のが正しい姿なので、
    # 無いこと自体は赤にしない。**在るのに合わないときだけ**落とす。
    sp = desk0.get("split")
    if not sp:
        log.warning(
            "内訳が出ていません（ドネの写しがまだ無い日はこうなる。"
            "`doneru_ledger_run` を `{\"all\": true}` で1回押すと入ります）"
        )
    else:
        base = int(sp.get("base") or 0)
        chat = int(sp.get("chat") or 0)
        doneru = int(sp.get("doneru") or 0)
        spend = int(sp.get("spend") or 0)
        got = int(sp.get("total") or 0)
        log.info(
            "内訳: 開始時点 %s円 / スパチャ %s円 / ドネ %s円 / 出費 %s円",
            base, chat, doneru, spend,
        )
        # 足し引きが内訳の中で閉じているか（画面が5行目に出す額）
        if base + chat + doneru + spend != got:
            raise SystemExit(
                f"**内訳の足し引きが合いません**: "
                f"{base}+{chat}+{doneru}+{spend} != {got}"
            )
        # そして、それが公開の口の額と同じか（豚に出ている額）
        if got != int(a["total"]):
            raise SystemExit(
                f"**内訳の合計が豚と違います**: 内訳 {got}円 / 豚 {a['total']}円"
            )
        log.info(
            "**内訳の合計 %s円 は、豚に出ている額と1円まで同じです**", got,
        )

    doc = ""
    try:
        # ---- 2. 1件入れる ----
        one = {"day": DAY, "title": TITLE, "yen": YEN}
        r1 = call("POST", "/fund/spends", token, one)
        doc = str((r1.get("spend") or {}).get("id") or "")
        n1, y1 = box_of(r1)
        log.info(
            "1回目: 既にあった=%s / 出費 %d件・%s円",
            r1.get("already"), n1, y1,
        )
        if r1.get("already") is not False:
            raise SystemExit("1回目なのに「既にある」と返りました")
        if n1 != n0 + 1 or y1 != y0 + YEN:
            raise SystemExit(f"1件入ったはずが {n0}→{n1}件 / {y0}→{y1}円")

        # ---- 3. もう一度入れる ----
        r2 = call("POST", "/fund/spends", token, one)
        n2, y2 = box_of(r2)
        log.info(
            "2回目: 既にあった=%s / 出費 %d件・%s円",
            r2.get("already"), n2, y2,
        )
        if r2.get("already") is not True:
            raise SystemExit("2回目なのに「新しく1件」と返りました")
        if n2 != n1 or y2 != y1:
            raise SystemExit(f"**2回目で増えました** {n1}→{n2}件 / {y1}→{y2}円")
        log.info("**2回入れても増えませんでした**（件数も合計も同じ）")
    finally:
        # ---- 4. 消す。**落ちても必ず通る** ----
        if doc:
            r3 = call("DELETE", f"/fund/spends/{doc}", token)
            n3, y3 = box_of(r3)
            log.info("消したあと: 出費 %d件・%s円", n3, y3)
            if n3 != n0 or y3 != y0:
                log.error(
                    "**戻っていません** %d件・%s円 → %d件・%s円",
                    n0, y0, n3, y3,
                )

    # ---- 5. 額が戻ったか ----
    z = fund()
    start1 = int(z["total"]) - int(z["given"])
    log.info(
        "おわり: total %s円 / given %s円 / 起点 %s円",
        z["total"], z["given"], start1,
    )
    if start1 != start0:
        raise SystemExit(f"**起点が動きました** {start0} → {start1}")
    log.info(
        "起点は %s円 のまま（total が動いた %s円 は Doneru のぶん）",
        start1, int(z["total"]) - int(a["total"]),
    )
    log.info("通りました")


main()
sys.exit(0)
