"""Doneru の どねID と YouTube のアカウントの対応表を、Firestore に入れる。

## なぜ表が要るのか

Doneru の投げ銭は BigQuery の `doneru_donations` に入るが、**YouTube の
チャンネルIDを持っていない**（あるのは `donor_name` と `viewer_pk` だけ）。
名前で突き合わせると、別の人にカードを渡す事故が起きる。

そこで **どねID（`viewer_pk`）→ YouTube のアカウント** の対応表を持つ。
元は `python/donors_seed.json`（あやとが手で作ったもの）。ここが正で、
Firestore の `islandDonors` はその写し。

## 3つの状態

| state | 意味 | カードを渡せるか |
| --- | --- | --- |
| `linked`   | チャンネルIDまで分かっている | **渡せる** |
| `unlinked` | 表にはあるが、YouTube のアカウントが分からない | 渡せない |
| `new`      | **表に無い どねID が投げ銭してきた** | 渡せない。**あやとの紐付け待ち** |

`new` を見つけるのがこの仕組みの目的。`python/nordic_supporters.py` が
その日の投げ銭を見て、表に無い どねID を `new` として置く。

## チャンネルIDの引き方

表が持っているのは `@ひめひめ-r9z` のような**表示名**なので、そこから
`chat_messages.author_channel_id` を引く。**同じ名前が2つのチャンネルに
付いていたら、引かない**（どちらか分からないまま渡すほうが悪い）。

名前は変わる。だから表の鍵は どねID で、名前は引くための手がかりでしかない。

## 使いかた

ワークフロー「管理スクリプトを実行」から:

    script: donors_import
    args:   {}                … 何が入るか出すだけ（既定）
    args:   {"apply": true}   … Firestore に書く

**既定は書かない。** `apply` を付けたときだけ流れる。
何度流しても同じ結果になる（どねID が鍵）。
"""

import io
import json
import os
import sys
from datetime import datetime, timezone

from _fs import args, db, log

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402

SEED = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "donors_seed.json",
)

# 表示名からチャンネルIDを引く。**2つ以上に当たったものは返さない。**
SQL = f"""
SELECT author_name AS name,
       ARRAY_AGG(DISTINCT author_channel_id IGNORE NULLS) AS ids
FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.chat_messages`
WHERE author_name IN UNNEST(@names)
GROUP BY name
"""


def channels(names: list) -> dict:
    """表示名 -> チャンネルID。1つに定まったものだけ返す。"""
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
            log.warning("  %s は %d 個のチャンネルに当たったので引きません",
                        row["name"], len(ids))
    client.close()
    return out


def main() -> None:
    a = args()
    apply = bool(a.get("apply", False))

    seed = json.load(io.open(SEED, encoding="utf-8"))["donors"]
    log.info("表: %d行", len(seed))

    names = sorted({d["handle"] for d in seed if d.get("handle")})
    found = channels(names)
    log.info("表示名 %d件のうち、チャンネルIDが引けたのは %d件",
             len(names), len(found))

    now = datetime.now(timezone.utc).isoformat()
    client = db() if apply else None
    tally = {"linked": 0, "unlinked": 0}

    for d in seed:
        handle = d.get("handle")
        cid = found.get(handle) if handle else None
        state = "linked" if cid else "unlinked"
        tally[state] += 1
        row = {
            "viewerPk": d["viewerPk"],
            "handle": handle,
            "label": d.get("label"),
            "channelId": cid,
            # あやと本人。表には載せるが、カードは渡さない
            "isOwner": bool(d.get("isOwner")),
            "state": state,
            "updatedAt": now,
        }
        log.info("  %-22s %-8s %s", d["viewerPk"], state,
                 handle or f"（{d.get('label')}）")
        if client is None:
            continue
        # 元は seed なので、ここは丸ごと置き換えでよい。ただし
        # firstSeenAt（新規で見つけた日）は消さない
        ref = client.collection("islandDonors").document(d["viewerPk"])
        cur = ref.get()
        if cur.exists and (cur.to_dict() or {}).get("firstSeenAt"):
            row["firstSeenAt"] = cur.to_dict()["firstSeenAt"]
        ref.set(row, merge=True)

    log.info("紐付いた %d人 / まだの %d人", tally["linked"], tally["unlinked"])
    if client is None:
        log.info('書いていません。流すなら args に {"apply": true} を入れてください')
    else:
        log.info("Firestore islandDonors を更新しました")


main()
