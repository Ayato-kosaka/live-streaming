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
    log.info("%-10s %-16s %5s  %-10s %-10s  %s",
             "どねID", "呼び名", "回数", "はじめ", "さいご", "いまの紐付け")
    for r in rows:
        k = known.get(str(r["pk"]))
        state = (k or {}).get("handle") or (k or {}).get("state") or "—"
        log.info("%-10s %-16s %5d  %-10s %-10s  %s",
                 r["pk"], r["name"] or "", r["n"], r["d0"], r["d1"], state)


main()
