"""月末配信の投げ銭ランキングを、本番の値で作る。

    script: monthly_tips_run
    args:   {"from": "2026-08-31", "to": "2026-09-24"}

**1バイトも書かない。** BigQuery と Firestore を読んで、数えて、出すだけ。

## 出す額は貢献額（スパチャ ÷ 2 + Doneru）

式は `python/fund_box.py` の `viewer_yen()` ひとつ。**ここで割り算を
書かない。** 決め方は `python/monthly_tips.py` の冒頭。

## 名寄せは図鑑（islandCharacter）

スパチャは `channelId` → `islandCharacter.channelId`、
Doneru は**名乗り → `lookupKeys`**。どちらもちょうど1人のときだけ寄せる。

Doneru を どねID（`islandDonors`）から引かないのは、あやとの指示
（2026-09-25）:

> Ayato arigato って人は匿名でわざとわからない名前使ってるので、
> 無理やりドネIDで突合するのではなく、名前で突合して合わないなら無視で良い

寄らなかった人は**消さない。その人ひとりで1行。**

## ログに何を出すか（**公開のログ**）

出すのは**授賞式の画面にそのまま出るもの**だけ——順位・呼び名・貢献額・
図鑑のID（絵のURLに入っている値）。このページは今日、誰でも読める場所に
出る。**出していないもの:**

- **実額**（スパチャの生の円、Doneru の生の円）。あやと 2026-09-26
  「実額は視聴者には一切見せない」
- **呼び名（`lookupKeys`）と、寄った人の Doneru の名乗り。**
  図鑑の口は絵と絵文字しか返さない決め（`functions/src/islandCharacter.ts`）
- **チャンネルID・どねID**

寄らなかった Doneru の名乗りは、**画面にその字で出る**ので出す。
"""

import json
import os
import sys

from _fs import args, db, log, need, readonly

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402
from monthly_tips import Roster, merge, rank, total  # noqa: E402

# **円の行だけ拾う。** 外貨が数件混ざっていて、豚も GAS も円しか
# 足していない（`python/fund_box.py` の `bq_superchats`）。ここで拾うと
# ランキングの合計と貯金箱がずれる
SQL_SC = """
SELECT
  author_channel_id AS cid,
  ANY_VALUE(author_name) AS handle,
  SUM(SAFE_CAST(REGEXP_REPLACE(purchase_amount_text, r'[^0-9]', '') AS INT64)) AS yen,
  COUNT(*) AS n
FROM `{p}.{d}.chat_messages`
WHERE event_type = 'PAID'
  AND author_channel_id IS NOT NULL
  AND STARTS_WITH(purchase_amount_text, '¥')
  AND DATE(published_at, 'Asia/Tokyo') BETWEEN @d0 AND @d1
GROUP BY cid
"""

# 同じ寄付が2行入っていることがあるので `donation_id` で1つにしてから足す
SQL_DN = """
SELECT donor_name AS name, SUM(yen) AS yen, COUNT(*) AS n
FROM (
  SELECT donation_id,
         ANY_VALUE(donor_name) AS donor_name,
         ANY_VALUE(CAST(amount AS INT64)) AS yen
  FROM `{p}.{d}.doneru_donations`
  WHERE donated_at IS NOT NULL
    AND DATE(donated_at, 'Asia/Tokyo') BETWEEN @d0 AND @d1
  GROUP BY donation_id
)
GROUP BY name
"""

# 外貨のスパチャが何件あったか。**数えて出す。** 黙って落とすと
# 「合計が合わない」が理由の分からないまま残る
SQL_FX = """
SELECT COUNT(*) AS n
FROM `{p}.{d}.chat_messages`
WHERE event_type = 'PAID'
  AND NOT STARTS_WITH(purchase_amount_text, '¥')
  AND DATE(published_at, 'Asia/Tokyo') BETWEEN @d0 AND @d1
"""


def bq(sql: str, d0: str, d1: str) -> list:
    """BigQuery を1本引く。"""
    from google.cloud import bigquery

    client = bigquery.Client(project=BQ_PROJECT_ID)
    cfg = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("d0", "DATE", d0),
        bigquery.ScalarQueryParameter("d1", "DATE", d1),
    ])
    rows = [dict(r) for r in client.query(
        sql.format(p=BQ_PROJECT_ID, d=BQ_DATASET), cfg).result()]
    client.close()
    return rows


def roster(client) -> Roster:
    """図鑑を1回だけ全件読む。**索引を作らない**（#168）。"""
    out = []
    for doc in client.collection("islandCharacter").stream():
        v = doc.to_dict() or {}
        out.append({
            "id": doc.id,
            "channelId": v.get("channelId") or "",
            "channelName": v.get("channelName") or "",
            "lookupKeys": v.get("lookupKeys") or [],
        })
    return Roster(out)


def main() -> None:
    a = args()
    d0, d1 = need(a, "from", "to")
    log.info("期間: %s 〜 %s（日本時間）", d0, d1)

    sc = [{"channelId": r["cid"], "handle": r["handle"] or "",
           "yen": int(r["yen"] or 0)} for r in bq(SQL_SC, d0, d1)]
    dn = [{"name": r["name"] or "", "yen": int(r["yen"] or 0)}
          for r in bq(SQL_DN, d0, d1)]
    fx = bq(SQL_FX, d0, d1)[0]["n"]
    log.info("スパチャ %d 人 / Doneru の名乗り %d 通り / 外貨で落としたスパチャ %d 件",
             len(sc), len(dn), fx)

    r = roster(readonly(db()))
    log.info("図鑑 %d 人（チャンネルIDの入っている人 %d）",
             len(r.by_id), sum(1 for c in r.by_id.values() if c["channelId"]))

    rows = rank(merge(sc, dn, r))
    hit = sum(1 for x in rows if x["char"])
    log.info("ランキング %d 行（図鑑に当たった %d / 当たらなかった %d）",
             len(rows), hit, len(rows) - hit)

    # **ここから下が画面に出るもの。** 実額は1つも出さない
    log.info("--- 貢献額（スパチャ ÷ 2 + Doneru。実額ではない） ---")
    for x in rows:
        log.info("%2d位 %-28s %7d円  %s",
                 x["rank"], x["display"], x["yen"], x["char"] or "（図鑑なし）")
    log.info("合計 %d円 / %d人", total(rows), len(rows))

    # 焼き込みに貼る形。**`data.js` にそのまま入れる**
    print("JSON=" + json.dumps(
        {"period": f"{d0}〜{d1}", "total": total(rows),
         "rows": [{"handle": x["handle"] or None, "display": x["display"],
                   "yen": x["yen"], "rank": x["rank"], "icon": x["char"]}
                  for x in rows]},
        ensure_ascii=False))


main()
