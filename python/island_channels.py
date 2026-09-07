"""チャンネルIDと、その人がいま名乗っている名前の辞書を作る。

## なぜ辞書が要るのか

Doneru の投げ銭は `viewer_pk`（どねID）と `donor_name` しか持っていない。
カードを渡すには YouTube のチャンネルIDが要るので、あやとが `/me` の画面で
**名前を打って紐付ける**（`functions/src/donors.ts`）。

そのとき「@ひめひめ-r9z」からチャンネルIDを引くのに、**Functions からは
BigQuery を叩けない**（権限も、待ち時間も、課金の口も別）。だから
BigQuery 側で先に引けるものを Firestore へ写しておいて、画面はそれを引く。

引けなかったときだけ YouTube API に聞きにいく。**辞書に載っているのは
配信に来たことがある人だけ**なので、来たことのない人はそこで拾う。

## いちばん新しい名前だけを持つ

`islandChannels/{チャンネルID} = { name, lastAt, updatedAt }`

`name` は**そのチャンネルの、いちばん新しいメッセージの `author_name`**。
名前は変わるが、古い名前は持たない（あやとの指示・2026-09-07
「古い方はいらない」）。打つのはいま見えている名前なので、いま名乗って
いる名前が引ければ足りる。

## 名前が変わった人だけ書く

2,243人いる。毎日ぜんぶ書き直すと、変わっていない 2,240 件ぶんの書き込みを
毎日払うことになる。**いま入っているものを読んで、違うものだけ書く。**
読みは書きよりずっと安いし、この辞書は他の誰も書かない（ここが唯一の
書き手）ので、読んだ内容が古くなることもない。

## 同じ名前の人が2人いることがある

表示名は誰でも同じにできる。**ここでは畳まない。** チャンネルIDが鍵なので
両方そのまま入る。どちらか決められないのは引く側の話で、引く側
（`donors.ts`）が「2人に使われています」と言って止まる。

実行:
  python python/island_channels.py
  python python/island_channels.py --dry-run
"""

import argparse
import logging
import sys
from datetime import datetime, timezone

from google.cloud import bigquery, firestore

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Firestore の1回のまとめ書きに入る上限。超えると弾かれるので手前で切る。
BATCH = 400

# **いちばん新しいメッセージの名前を取る。** ARRAY_AGG に LIMIT 1 を付けると
# BigQuery が全部を並べずに1件だけ持つので、人数ぶんの並べ替えが要らない。
SQL = f"""
SELECT
  author_channel_id AS id,
  ARRAY_AGG(author_name ORDER BY published_at DESC LIMIT 1)[OFFSET(0)] AS name,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', MAX(published_at)) AS last_at
FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.chat_messages`
WHERE author_channel_id IS NOT NULL
  AND author_name IS NOT NULL
  AND author_name != ''
GROUP BY id
"""


def fetch() -> dict:
    """チャンネルID -> {name, lastAt}。いま名乗っている名前。

    Returns:
        チャンネルID -> {"name": 表示名, "lastAt": 最後に喋った時刻}
    """
    client = bigquery.Client(project=BQ_PROJECT_ID)
    out = {}
    for row in client.query(SQL).result():
        out[str(row["id"])] = {"name": row["name"], "lastAt": row["last_at"]}
    client.close()
    return out


def main() -> int:
    """エントリポイント。"""
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="書かずに出すだけ")
    a = ap.parse_args()

    now = fetch()
    logger.info("BigQuery: %d人", len(now))

    db = firestore.Client(project=BQ_PROJECT_ID)
    col = db.collection("islandChannels")
    # 全部読んでから比べる。**書きを減らすための読み**なので、
    # ここをけちると意味が無くなる
    had = {d.id: (d.to_dict() or {}) for d in col.stream()}
    logger.info("辞書にいま入っているの: %d人", len(had))

    stamp = datetime.now(timezone.utc).isoformat()
    changed = []
    for cid, v in now.items():
        was = had.get(cid)
        if was is not None and was.get("name") == v["name"]:
            continue
        changed.append((cid, v, was.get("name") if was else None))

    logger.info("名前が変わった / 新しく入る: %d人", len(changed))
    for cid, v, before in changed[:50]:
        logger.info("  %s  %s -> %s", cid, before or "（新規）", v["name"])
    if len(changed) > 50:
        logger.info("  …ほか %d人", len(changed) - 50)

    if a.dry_run:
        logger.info("--dry-run なので書いていません")
        return 0

    wrote = 0
    batch = db.batch()
    n = 0
    for cid, v, _ in changed:
        batch.set(
            col.document(cid),
            {"name": v["name"], "lastAt": v["lastAt"], "updatedAt": stamp},
            merge=True,
        )
        n += 1
        wrote += 1
        if n >= BATCH:
            batch.commit()
            batch = db.batch()
            n = 0
    if n:
        batch.commit()

    logger.info("islandChannels を %d件 更新しました", wrote)
    return 0


if __name__ == "__main__":
    sys.exit(main())
