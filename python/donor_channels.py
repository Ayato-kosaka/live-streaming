"""YouTube の表示名から、チャンネルIDを引く。

種の取り込み（`python/admin/donors_import.py`）と、毎朝の取り込み
（`python/doneru_supporters.py`）の両方が使う。**同じ引き方を2か所に
書かない。** 片方だけ直すと、画面から入れた名前と種から入れた名前で
行き先が変わる。

**同じ名前が2つ以上のチャンネルに当たったら、引かない。**
これはあやとの打ち間違いを疑う話ではない。**打った名前が正しくても
行き先が2つある**ことがある（表示名は誰でも同じにできる）。
どちらか分からないまま渡すと、別の人にカードが行く。
"""

import logging

from config import BQ_DATASET, BQ_PROJECT_ID

logger = logging.getLogger(__name__)

SQL = f"""
SELECT author_name AS name,
       ARRAY_AGG(DISTINCT author_channel_id IGNORE NULLS) AS ids
FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.chat_messages`
WHERE author_name IN UNNEST(@names)
GROUP BY name
"""


def channels(names: list) -> dict:
    """表示名 -> チャンネルID。1つに定まったものだけ返す。

    Args:
        names: YouTube の表示名（`@ひめひめ-r9z` の形）

    Returns:
        表示名 -> チャンネルID。引けなかった名前は入らない
    """
    if not names:
        return {}
    from google.cloud import bigquery

    client = bigquery.Client(project=BQ_PROJECT_ID)
    cfg = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ArrayQueryParameter("names", "STRING", names)
        ]
    )
    out = {}
    for row in client.query(SQL, job_config=cfg).result():
        ids = list(row["ids"] or [])
        if len(ids) == 1:
            out[row["name"]] = ids[0]
        else:
            # 同じ名前が複数のチャンネルに付いている。誰か決められない
            logger.warning("  %s は %d 個のチャンネルに当たったので引きません",
                           row["name"], len(ids))
    client.close()
    return out
