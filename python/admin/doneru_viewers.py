"""Doneru で出してくれた人の一覧を、寄付履歴から組み立てる。

## なぜ

対応表の鍵が合わなかった（`python/donors_seed.json` の頭を読むこと）。
あやとが持っている表は21桁の どねID だが、寄付履歴が持っているのは
6桁の `viewerPk` だけ。**こちらが持っている鍵で一覧を作れば、
あやとは「この6桁の人は誰か」を埋めるだけで済む。**

Doneru の別の口を叩きにいくより、いま在るデータから作るほうが早いし、
あやとのセッションも使わない。

## 出すもの

どねID（6桁）・呼び名・何回・いつからいつまで。**金額は出さない**
（このリポジトリは公開で、Actions のログも誰でも読める。
`docs/island-db.md` の決めに合わせる）。

    script: doneru_viewers
    args:   {}            … 全期間
    args:   {"days": 400} … 直近400日ぶん
"""

import os
import sys

from _fs import args, log

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402
from logsafe import detail_lines  # noqa: E402


def log_viewers(rows, known) -> None:
    """1人ずつの一覧を出す。**公開の場では1行も出さない。**

    `run_admin_script.yml` から回せるので、この出力も誰でも読める。
    どねID・呼び名・紐付いたハンドルが1人ずつ並ぶ＝
    「誰が、いつ、何回出したか」そのものになる（`python/logsafe.py`）。

    Args:
        rows: BigQuery から引いた1人1行
        known: どねID -> `islandDonors` の書類
    """
    log.info("%-10s %-16s %5s  %-10s %-10s  %s",
             "どねID", "呼び名", "回数", "はじめ", "さいご", "いまの紐付け")
    lines = detail_lines([
        (f"{r['pk']:<10}",
         f"{(r['name'] or ''):<16}",
         f"{r['n']:>5}",
         f"{r['d0']:<10}",
         f"{r['d1']:<10}",
         (known.get(str(r["pk"])) or {}).get("handle")
         or (known.get(str(r["pk"])) or {}).get("state") or "—")
        for r in rows
    ])
    for line in lines:
        log.info("%s", line)
    if not lines and rows:
        # 明細を落としたことが分かるようにする。黙って空にすると
        # 「0人だった」と読み違える
        log.info("（公開の場なので1人ずつは出しません。手元で回すと出ます）")


def main() -> None:
    from google.cloud import bigquery, firestore

    a = args()
    days = a.get("days")
    where = "viewer_pk IS NOT NULL"
    if days:
        where += (
            " AND DATE(TIMESTAMP_SUB(donated_at, INTERVAL 9 HOUR))"
            f" >= DATE_SUB(CURRENT_DATE(), INTERVAL {int(days)} DAY)"
        )

    sql = f"""
    SELECT
      viewer_pk AS pk,
      ANY_VALUE(donor_name) AS name,
      COUNT(*) AS n,
      FORMAT_DATE('%Y-%m-%d', MIN(DATE(TIMESTAMP_SUB(donated_at, INTERVAL 9 HOUR)))) AS d0,
      FORMAT_DATE('%Y-%m-%d', MAX(DATE(TIMESTAMP_SUB(donated_at, INTERVAL 9 HOUR)))) AS d1
    FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.doneru_donations`
    WHERE {where}
    GROUP BY pk
    ORDER BY d1 DESC, n DESC
    """
    client = bigquery.Client(project=BQ_PROJECT_ID)
    rows = list(client.query(sql).result())
    client.close()

    db = firestore.Client(project=BQ_PROJECT_ID)
    known = {d.id: (d.to_dict() or {}) for d in db.collection("islandDonors").stream()}

    log.info("Doneru で出してくれた人: %d人", len(rows))
    log_viewers(rows, known)


# 取り込んだだけでは走らせない。`python/logsafe_selftest.py` が
# log_viewers() だけを偽データで呼べるようにするため。
# `run_admin_script.yml` は `python doneru_viewers.py` で回すので動きは変わらない
if __name__ == "__main__":
    main()
