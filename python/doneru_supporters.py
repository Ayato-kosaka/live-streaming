"""その日 Doneru で投げ銭してくれた人を、名簿に足す。

`python/nordic_supporters.py` の Doneru 版。あちらは YouTube のスパチャを
BigQuery から取るが、**Doneru はチャンネルIDを持っていない**（あるのは
名前と どねID＝`viewer_pk` だけ）。名前で突き合わせると別の人にカードを
渡す事故が起きるので、`islandDonors` の対応表を通す。

## 表に無い どねID が来たら、赤くして知らせる

**それが新規の人。** その人にカードを渡すには、あやとが YouTube の
アカウントを紐付けないといけない。黙って落とすと、投げ銭してくれたのに
何ももらえない人が静かに増える。

- 見つけたら `islandDonors/{どねID}` に `state: "new"` で置く（**取りこぼさない**）
- そのうえで**終了コード 1 で終わる**。Actions の失敗通知メールで気づく

**紐付いていないだけ（`unlinked`）では落とさない。** あれは
「表にはあるが YouTube のアカウントが分からない」人で、あやとはもう
知っている。落とすと、直しようのないもので毎日赤くなる。

`new` が1人でも残っているあいだは、毎日赤いままにする。1回のメールを
見逃すと、そのまま忘れるので（#168 と同じ考え方）。

## 直しかた

`/me` の「投げ銭を、YouTube につなぐ」で、その人の YouTube の名前を打つ。
翌日の取り込みで緑に戻る（#190）。**スマホから直せる**ようにしてあるのは、
これが赤くなるのが旅の途中だから。

種（`python/donors_seed.json` → `donors_import`）からも入れられるが、
あちらは最初の1回と、Firestore が飛んだときの戻し先。

## 入金の段階では絞らない

`status` は「振込完了」「振込待ち」で、**あやとへの入金がどこまで進んだか**
であって、投げ銭が成立したかどうかではない。待ちのぶんを外すと、
その日出してくれた人が数日あとから現れることになる。

## 終了コード

| | 意味 |
| --- | --- |
| 0 | ぜんぶ紐付いている |
| 1 | **表に無い どねID がいる。** あやとに紐付けてほしい |
| 2 | **元データ（doneru_donations）が読めない。** 対応表の問題ではない |

1 と 2 を分けているのは、2 のときに対応表を直しにいっても直すものが
無いから。寄付の表は作り直されることがあり（#186）、その途中は消えている。

実行:
  python python/doneru_supporters.py --days 3
  python python/doneru_supporters.py --day 2026-09-06 --dry-run
"""

import argparse
import logging
import sys
from datetime import datetime, timedelta, timezone

from google.cloud import bigquery, firestore

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402
from nordic_supporters import merge  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# 配信日の切り方は YouTube 側（nordic_supporters.py）と揃える。
# **9時間引く＝日本時間の18時が境目**。ここを変えると、同じ日の投げ銭が
# 2日に割れる。
#
# **これは古い決め。台帳（islandTips）は日本時間の0時で切る**（#201・#202）。
# ここを合わせに行かないのは、nordicDays がもう読まれていないから
# （nordic_supporters.py の頭に理由がある）。このファイルに残っている
# 用事は「表に無い どねID を見つけて赤くする」ほうだけ。
SQL = f"""
SELECT
  FORMAT_DATE(
    '%Y-%m-%d',
    DATE(TIMESTAMP_SUB(donated_at, INTERVAL 9 HOUR))
  ) AS day,
  viewer_pk AS pk,
  ANY_VALUE(donor_name) AS name
FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.doneru_donations`
WHERE viewer_pk IS NOT NULL
  AND DATE(TIMESTAMP_SUB(donated_at, INTERVAL 9 HOUR))
      BETWEEN @d0 AND @d1
GROUP BY day, pk
ORDER BY day
"""


def fetch(d0: str, d1: str) -> dict:
    """その期間の、日ごとの「投げ銭してくれた どねID」。

    Args:
        d0: 始まりの日（YYYY-MM-DD）
        d1: 終わりの日（YYYY-MM-DD、この日を含む）

    Returns:
        日付 -> [{"pk": ..., "name": ...}, ...]
    """
    client = bigquery.Client(project=BQ_PROJECT_ID)
    cfg = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("d0", "DATE", d0),
            bigquery.ScalarQueryParameter("d1", "DATE", d1),
        ]
    )
    out: dict = {}
    for row in client.query(SQL, job_config=cfg).result():
        out.setdefault(row["day"], []).append(
            {"pk": str(row["pk"]), "name": row["name"] or ""}
        )
    client.close()
    return out


def main() -> int:
    """エントリポイント。新規の人がいたら 1 を返す。"""
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", help="この日だけ（YYYY-MM-DD）")
    ap.add_argument("--days", type=int, default=3, help="直近この日数ぶん")
    ap.add_argument("--dry-run", action="store_true", help="書かずに出すだけ")
    a = ap.parse_args()

    if a.day:
        d0 = d1 = a.day
    else:
        today = datetime.now(timezone.utc).date()
        d1 = today.isoformat()
        d0 = (today - timedelta(days=max(1, a.days) - 1)).isoformat()

    db = firestore.Client(project=BQ_PROJECT_ID)
    table = {d.id: (d.to_dict() or {}) for d in db.collection("islandDonors").stream()}
    logger.info("対応表: %d件", len(table))

    try:
        found = fetch(d0, d1)
    except Exception as e:
        # **「取れなかった」を「新規の人がいる」と言わない。**
        # 寄付の表は作り直されることがあり（#186）、その途中は消えている。
        # そこで「紐付け待ちが3件あります」と出すと、あやとは
        # 対応表を直しにいって、直すものが無くて困る。
        #
        # 終了コードを分ける。1 は「紐付けてほしい」、2 は「元データが読めない」。
        # Actions の失敗通知メールで、どちらの用事か分かるようにする。
        logger.error("寄付の表が読めませんでした: %s", str(e)[:200])
        logger.error("")
        logger.error("doneru_donations が作り直しの途中か、権限が変わったかです。")
        logger.error("対応表（islandDonors）の問題ではないので、そちらは触らないこと。")
        return 2

    now = datetime.now(timezone.utc).isoformat()
    fresh = []

    for day, rows in sorted(found.items()):
        people, skipped = [], 0
        for r in rows:
            known = table.get(r["pk"])
            if known is None:
                logger.error("表に無い どねID: %s（%s、%s）", r["pk"], r["name"], day)
                fresh.append(r)
                if not a.dry_run:
                    db.collection("islandDonors").document(r["pk"]).set(
                        {
                            "viewerPk": r["pk"],
                            "handle": None,
                            "label": r["name"],
                            "channelId": None,
                            "state": "new",
                            "firstSeenAt": now,
                            "updatedAt": now,
                        },
                        merge=True,
                    )
                continue
            if known.get("isOwner"):
                # あやと本人。自分のカードを自分に配らない
                continue
            cid = known.get("channelId")
            if not cid:
                skipped += 1
                continue
            people.append({"channelId": cid, "name": known.get("handle") or r["name"]})

        新規 = len([x for x in rows if x["pk"] not in table])
        logger.info("%s: Doneru %d人（渡せる %d / 紐付け待ち %d / 新規 %d）",
                    day, len(rows), len(people), skipped, 新規)
        for p in people:
            logger.info("    %s  %s", p["channelId"], p["name"])
        if a.dry_run or not people:
            continue
        ref = db.collection("nordicDays").document(day)
        cur = ref.get()
        old = (cur.to_dict() or {}).get("people", []) if cur.exists else []
        after = merge(old, people)
        ref.set({"day": day, "people": after, "updatedAt": now}, merge=True)
        logger.info("  → 名簿は %d人になりました", len(after))

    # 過去に見つけて、まだ紐付いていない人も数える。1回の通知を見逃すと
    # そのまま忘れるので、残っているあいだは毎日赤くする
    waiting = [k for k, v in table.items() if v.get("state") == "new"]
    for r in fresh:
        if r["pk"] not in waiting:
            waiting.append(r["pk"])

    if a.dry_run:
        logger.info("--dry-run なので書いていません")

    if waiting:
        logger.error("")
        logger.error("紐付け待ちの どねID が %d件あります:", len(waiting))
        for pk in waiting:
            label = (table.get(pk) or {}).get("label")
            if label is None:
                label = next((r["name"] for r in fresh if r["pk"] == pk), "")
            logger.error("    %s  %s", pk, label)
        logger.error("")
        logger.error("/me の「投げ銭を、YouTube につなぐ」から紐付けてください。")
        return 1

    logger.info("紐付け待ちはありません")
    return 0


if __name__ == "__main__":
    sys.exit(main())
