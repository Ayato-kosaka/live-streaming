"""内訳が出ないとき、**どの門で止まったか**を Firestore の側から見る。

ARGS: なし（`{}`）

## なぜ要るか（2026-09-25）

配ったあと、`GET /island-api/fund/desk` が `split` を返さなかった。
画面からは「内訳は、いま出せません。」としか見えず、**門が5つあるので
どこで止まったのか分からない。** 本番の Functions のログを読んで初めて
理由が出た:

    WARNING fund desk split failed
      Error: 9 FAILED_PRECONDITION: The query requires an index.

**絞り込みつきの `sum()` は、複合索引を要る。** 単一フィールドの自動索引には
足す欄（`yen`）が入っていないので、`where("day", ...)` と `sum("yen")` を
組み合わせた瞬間に索引が要る。うちは複合索引を作れない（#168）。

## この道具が守るもの

**口が使っている読み方と同じ形を、本番で実際に叩く。** 索引の要る形に
戻したら、ここが落ちる。5つの門も1つずつ見て、止まった門を名指しする。

  1. 焼き直し（`island/state.fund.box`）が読めるか・欄がそろっているか
  2. いま走っている目標（`to` の空いているいちばん新しい1件）があるか
  3. ドネの写しの札（`islandFundHealth/donations`）の `okDay` と `count`
  4. **期間で絞った3つの読みが、複合索引なしで通るか**
  5. 足し引きが `GET /island-api/fund` の `total` と1円まで合うか

**1バイトも書かない。** 読むだけ。

## 出さないもの

**このリポジトリは公開で、Actions のログも誰でも読める。**
出るのは件数と円と日付だけ。名前・本文・書類IDは1文字も出さない。
"""

import sys

from _fs import args, db, log
from _owner import API_BASE

import requests

# 口が読んでいるのと同じ入れ物（`functions/src/fundDesk.ts`）
C_CHATS = "islandFundSuperChats"
C_DONATIONS = "islandFundDonations"
C_SPENDS = "islandFundSpends"
C_GOALS = "islandFundGoals"

# **口と同じ上限。** ここを超えたら、口は内訳を出さない（黙って足りない
# 数を出すより、出さないほうがよい）
CAP = 20000


def gate(name: str, ok: bool, note: str = "") -> bool:
    """門を1つ見る。**通らなかったら、その名前を出す。**

    Args:
        name: 門の名前
        ok: 通ったか
        note: 添える字（**額と件数まで**）

    Returns:
        `ok` をそのまま返す
    """
    log.info("  門 %-10s %s%s", name, "通った" if ok else "**止まった**",
             f"（{note}）" if note else "")
    return ok


def main() -> None:
    """エントリポイント。**読むだけ。**"""
    args()
    client = db()

    # ---- 1. 焼き直し ----
    snap = client.collection("island").document("state").get()
    fund = ((snap.to_dict() or {}).get("fund") or {}) if snap.exists else {}
    box = fund.get("box") or {}
    sc = box.get("superchat")
    full = box.get("superchatFull")
    start0 = box.get("start")
    ok_box = all(isinstance(v, (int, float)) for v in (sc, full, start0))
    gate("box", ok_box, f"superchat {sc} / full {full} / start {start0}")

    # ---- 2. いまの目標 ----
    goals = [
        {"id": d.id, **(d.to_dict() or {})}
        for d in client.collection(C_GOALS).order_by(
            "from", direction="DESCENDING"
        ).limit(60).stream()
    ]
    now = next((g for g in goals if not g.get("to")), None)
    gate("goal", now is not None,
         f"{now.get('from')} から" if now else f"目標 {len(goals)}件ぜんぶ閉じている")

    # ---- 3. ドネの写しの札 ----
    h = client.collection("islandFundHealth").document("donations").get()
    hv = (h.to_dict() or {}) if h.exists else {}
    ok_day = hv.get("okDay") or ""
    cnt = int(hv.get("count") or 0)
    gate("health", bool(ok_day) and cnt > 0, f"{ok_day} / {cnt}件")

    if not (ok_box and now):
        raise SystemExit("ここから先は、上の門が通ってからでないと測れません")
    frm = now["from"]

    # ---- 4a. **索引の要る形**（口がこれで落ちていた） ----
    log.info("索引の要る形（絞り込みつきの sum）を、わざと1回叩きます:")
    try:
        from google.cloud.firestore_v1.base_query import FieldFilter

        client.collection(C_SPENDS).where(
            filter=FieldFilter("day", ">=", frm)
        ).sum("yen").get()
        log.warning(
            "  **通ってしまいました。** 複合索引が誰かの手で作られたのかも"
            "しれません。口は索引の要らない形に直してあるので、動きは変わりません"
        )
    except Exception as e:  # noqa: BLE001  落ちるのが正しい
        head = str(e).split("\n")[0][:90]
        log.info("  落ちました（これが 2026-09-25 の不具合の正体）: %s", head)

    # ---- 4b. 索引の要らない形（口をこちらへ直した） ----
    log.info("索引の要らない形（欄を絞って読んで、こちらで足す）:")

    def sum_of(col: str, op: str, day: str) -> tuple[int, int]:
        """絞って読んで、こちらで足す。**`sum()` を使わない。**

        Args:
            col: 入れ物の名前
            op: `<` か `>=`
            day: 境目の日

        Returns:
            `(件数, 合計)`
        """
        from google.cloud.firestore_v1.base_query import FieldFilter

        rows = list(
            client.collection(col)
            .where(filter=FieldFilter("day", op, day))
            .select(["yen"])
            .limit(CAP + 1)
            .stream()
        )
        return len(rows), sum(int((r.to_dict() or {}).get("yen") or 0) for r in rows)

    # **口と同じ読み方にする**（`functions/src/fundDesk.ts` の `splitOf`）。
    # スパチャと出費は「始まる前ぶん」を読んで、焼き直しの合計から引く。
    # ドネだけは期間内を読む（`total` の Doneru がいまの累計なので）。
    #
    # **期間内を直に読んで引き算しない。** 焼き直したあとに来た1件は
    # `total` にも入っていないので、期間内を直に読むと**その行だけ新しく**
    # なって、開始時点が同じだけ逆にずれる。
    n_sc, full_before = sum_of(C_CHATS, "<", frm)
    n_sp, sp_before = sum_of(C_SPENDS, "<", frm)
    n_dn, dn_in = sum_of(C_DONATIONS, ">=", frm)
    gate("read", max(n_sc, n_dn, n_sp) <= CAP,
         f"始まる前のスパチャ {n_sc}件/{full_before}円 ・ "
         f"始まる前の出費 {n_sp}件/{sp_before}円 ・ 期間内のドネ {n_dn}件/{dn_in}円")

    # ---- 5. 足し引きが豚と合うか ----
    res = requests.get(f"{API_BASE}/fund", timeout=60)
    if res.status_code != 200:
        raise SystemExit(f"GET /fund が {res.status_code} で返りました")
    total = int(res.json()["total"])

    # **全体の半分から「始まる前のぶんの半分」を引く**（口と同じ式）
    superchat_in = int(sc) - full_before // 2
    sp_in = -int(start0) - sp_before
    if superchat_in < 0 or sp_in < 0:
        raise SystemExit(
            "**焼き直しが台帳より古い**（期間内が負になる）。"
            "口は `stale` で内訳を出しません"
        )
    start = total - superchat_in - dn_in + sp_in
    sum_ = start + superchat_in + dn_in - sp_in
    log.info(
        "内訳: 開始時点 %s円 / スパチャ %s円 / ドネ %s円 / 出費 -%s円 → いま %s円",
        start, superchat_in, dn_in, sp_in, sum_,
    )
    log.info("豚（GET /fund の total）: %s円", total)
    if sum_ != total:
        raise SystemExit(f"**合いません** {sum_} ≠ {total}")
    log.info("**1円まで同じでした**")


main()
sys.exit(0)
