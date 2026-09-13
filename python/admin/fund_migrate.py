"""豚の貯金箱を、スプレッドシート（GAS）から Firestore へ移す。

## 何を移すのか

| 何を | どこから | どこへ | 件数 |
| --- | --- | --- | --- |
| スパチャの控え | GAS の `SuperChats` | `islandFundSuperChats` | 411 |
| 支出 | `python/fund_seed.py` の `SPENDS` | `islandFundSpends` | 7 |
| 目標 | `python/fund_seed.py` の `GOALS` | `islandFundGoals` | 1 |

支出と目標は、いままで**どこにも表として無かった。** GAS の `Goals` は
`startAmount = -249646` という**合計ひとつ**しか持っていない。
その内訳（何にいくら使ったか）はあやとの手元にしかなかったので、
ここに書き起こして移す。移したあとは Firestore が正で、ここはただの種。

## 移して狂わないこと

**貯金箱の額が1円でも動いたら移行しない。** それだけを見る。

    移行前 = GAS の startAmount + superChatAmount + Doneru
    移行後 = スパチャ合計 ÷ 2 + Doneru － 支出合計

`--dry-run`（既定）は、この2つを並べて出す。**合わなければ 1 で落ちる。**
合っていることを読んでから `{"apply": true}` を付ける。

## 使いかた

ワークフロー「管理スクリプトを実行」から:

    script: fund_migrate
    args:   {}                … 何が入るか出すだけ（**既定。1行も書かない**）
    args:   {"apply": true}   … Firestore に書く

**何度流しても同じ結果になる。** 書類IDが中身から決まるので、2回目は
同じ書類を上書きするだけで件数も合計も増えない（`python/fund_box.py`）。

## ログに出さないもの

このリポジトリは公開で、Actions のログも誰でも読める。
**出すのは件数と合計だけ。** 誰がいくら出したかは1行も出さない。
"""

import json
import os
import sys
import urllib.error
import urllib.request

from _fs import args, db, log

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import fund_box as fb  # noqa: E402
from fund_seed import GOALS, SPENDS  # noqa: E402

# 本番が実際に返している額。**ここと1円まで合うことを見る。**
# 鍵は要らない（誰でも読める口）。Doneru のぶんはここからしか分からない。
PROD_FUND = "https://live-streaming-d3cac.web.app/island-api/fund"


def gas_goal() -> dict:
    """移行前の豚の値を、豚が読んでいるのと同じところから取る。

    Returns:
        `start` `superchat` `target` `label` の辞書
    """
    rows = fb.gas_table("Goals")
    row = {}
    for r in rows:
        if str(r.get("id") or "") == "2025-10-24":
            row = r
    if not row and rows:
        row = rows[0]
    return {
        "start": fb.to_yen(row.get("startAmount")),
        "superchat": fb.to_yen(row.get("superChatAmount")),
        "target": fb.to_yen(row.get("targetAmount")),
        "label": str(row.get("label") or ""),
    }


def prod_fund() -> dict:
    """本番の `GET /island-api/fund` が返している額。

    Returns:
        返り値の辞書。読めなければ空の辞書
    """
    try:
        with urllib.request.urlopen(PROD_FUND, timeout=20) as r:
            return json.loads(r.read().decode("utf-8"))
    except (urllib.error.URLError, ValueError, TimeoutError) as e:
        log.warning("本番の /island-api/fund が読めませんでした: %s", e)
        return {}


def main() -> int:
    """エントリポイント。

    Returns:
        0 なら合っている。1 なら移行前と移行後がずれている
    """
    a = args()
    apply = bool(a.get("apply", False))

    # ---- 1. 移行前。豚が見ているのと同じ数字 ----
    before = gas_goal()
    log.info(
        "移行前（GAS の Goals）: startAmount=%s superChatAmount=%s targetAmount=%s",
        before["start"],
        before["superchat"],
        before["target"],
    )

    # ---- 2. 移す中身を組む ----
    sc = fb.gas_superchats()
    sc_full = sum(v["yen"] for _, v in sc)
    sc_half = sc_full // fb.SUPERCHAT_RATE
    ids = {k for k, _ in sc}
    log.info(
        "スパチャの控え: %d件 / 書類ID %d通り / 合計 %s円 / 半分 %s円",
        len(sc),
        len(ids),
        sc_full,
        sc_half,
    )
    by_src = {}
    for _, v in sc:
        by_src[v["src"]] = by_src.get(v["src"], 0) + 1
    log.info("  出どころの内訳: %s", by_src)
    if len(ids) != len(sc):
        log.error("書類IDが重なっています。移行しません")
        return 1

    spend_total = sum(y for _, _, y in SPENDS)
    log.info("支出: %d件 / 合計 %s円", len(SPENDS), spend_total)
    for d, t, y in SPENDS:
        log.info("  %s  %s  %s円", d, t, y)

    log.info("目標: %d件", len(GOALS))
    for f, t, label, y in GOALS:
        log.info("  %s〜%s  %s  %s円", f, t or "（いまも走っている）", label, y)

    # ---- 3. 1円でも動かないか ----
    # Doneru は両側で同じ額を足すので、比べるときは外してよい。
    # 外したほうが、Doneru の API が落ちていても確かめられる。
    ok = True
    if sc_half != before["superchat"]:
        log.error(
            "スパチャが合いません: 移行後 %s円 / 豚 %s円（差 %s円）",
            sc_half,
            before["superchat"],
            sc_half - before["superchat"],
        )
        ok = False
    if fb.start_amount(spend_total) != before["start"]:
        log.error(
            "支出が合いません: 移行後の起点 %s円 / 豚 %s円（差 %s円）",
            fb.start_amount(spend_total),
            before["start"],
            fb.start_amount(spend_total) - before["start"],
        )
        ok = False

    box_before = before["start"] + before["superchat"]
    box_after = fb.box(sc_full, 0, spend_total)
    log.info(
        "貯金箱（Doneru を除いた側）: 移行前 %s円 / 移行後 %s円 / 差 %s円",
        box_before,
        box_after,
        box_after - box_before,
    )
    if box_before != box_after:
        ok = False

    # ---- 3.5 本番が実際に出している額とも突き合わせる ----
    # ここまでは GAS の表どうしの比べっこ。**画面に出ている額**まで
    # 遡って合わせないと、「狂っていない」と言い切れない。
    prod = prod_fund()
    if prod:
        total = fb.to_yen(prod.get("total"))
        # Doneru のぶんは本番の返り値からしか分からない。
        # 本番は startAmount + superChatAmount + doneru を返しているので、引く
        doneru = total - (before["start"] + before["superchat"])
        after = fb.box(sc_full, doneru, spend_total)
        log.info(
            "本番の /island-api/fund: total=%s円（うち Doneru %s円）/ "
            "移行後の式で出すと %s円 / 差 %s円",
            total,
            doneru,
            after,
            after - total,
        )
        if after != total:
            log.error("本番の額と合いません")
            ok = False
    else:
        log.warning("本番と突き合わせられませんでした。**この状態で apply しない**")
        ok = False

    if not ok:
        log.error("**1円でも動くので移行しません。** 差の出どころを直してから流す")
        return 1
    log.info("移行前と移行後が1円まで一致しました")

    # ---- 4. 書く ----
    if not apply:
        log.info(
            "見るだけで終わりました（%d件 + 支出%d件 + 目標%d件は書いていません）。"
            "書くには {\"apply\": true}",
            len(sc),
            len(SPENDS),
            len(GOALS),
        )
        return 0

    client = db()
    wrote = 0
    batch = client.batch()
    n = 0
    for doc, v in sc:
        batch.set(client.collection(fb.C_SUPERCHAT).document(doc), v, merge=True)
        n += 1
        wrote += 1
        if n >= 400:
            batch.commit()
            batch = client.batch()
            n = 0
    for d, t, y in SPENDS:
        batch.set(
            client.collection(fb.C_SPEND).document(fb.spend_id(d, t, y)),
            {"day": d, "title": t, "yen": y, "from": "seed"},
            merge=True,
        )
        n += 1
    for f, t, label, y in GOALS:
        batch.set(
            client.collection(fb.C_GOAL).document(f),
            {"from": f, "to": t, "label": label, "yen": y},
            merge=True,
        )
        n += 1
    if n:
        batch.commit()
    log.info("書きました: スパチャ %d件 / 支出 %d件 / 目標 %d件",
             wrote, len(SPENDS), len(GOALS))

    # ---- 5. 書いたものを読み直して、もう一度突き合わせる ----
    got = fb.read_sums(client)
    log.info(
        "読み直し: スパチャ %d件 / 合計 %s円 / 半分 %s円 / 支出 %s円",
        got["count"],
        got["superchatFull"],
        got["superchat"],
        got["spend"],
    )
    if got["superchat"] != before["superchat"] or got["spend"] != spend_total:
        log.error("書いたあとの合計が合いません。**このまま画面に出さないこと**")
        return 1
    log.info("書いたあとも1円まで一致しています")
    return 0


sys.exit(main())
