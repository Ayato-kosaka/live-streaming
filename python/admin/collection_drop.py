"""もう使わないコレクションを、まるごと消す。**既定は数えるだけ。**

ARGS 例:
  {"collection": "islandPolls"}                  … 何件消えるかを出すだけ
  {"collection": "islandPolls", "apply": true}   … 退避を取ってから、実際に消す

## 戻せないので、三重に縛ってある

1. **既定は dry-run。** `apply` を明示で渡すまで1件も消さない
2. **`DEAD` に名前が無いものは消せない。** 消してよいと判断が済んだものだけを
   このファイルに書く。引数で任意のコレクション名を渡して消せる道具にすると、
   打ち間違いが本番の生きたデータに当たる
3. **消す前に、期限の無い退避を取る**（#1281）。毎晩の退避（`firestore_docs`）は
   90日で古い世代を落とすので、入れ物を消すと90日後には退避からも消える。
   `apply` のときは、まず BigQuery の `island_backup.retired_docs`（**期限なし**。
   毎晩の掃除 `sink.sweep` が触らない表）へ全件を写し、**写った指紋の並びが
   Firestore と一致したときだけ**消す。合わなければ1件も消さずに 2 で落ちる。
   戻しかたは `docs/island-backup.md` の「消した入れ物を戻す」

`DEAD` に足すときは、**足す理由（どこへ移したか）を一緒に書く。**
書いていないと、次に読んだ人が「なぜ消してよかったのか」を追えない。
"""

import datetime as dt
import hashlib
import json
import os
import sys
import tempfile

from _fs import args, db, log, need

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 消してよいと判断が済んだコレクション。値は「なぜ消してよいか」
DEAD = {
    # #171 で `POST /ideas/:id/vote` を畳んだので、**もう1件も増えない。**
    # 中身は `{at: <押した時刻>}` だけで、書類IDが `<企画のID>_<uid か端末ID>`。
    # **人の書いた字は1文字も入っていない**（1人1票を守るためだけの入れ物）。
    # 票の数そのものは islandIdeas.votes に残るので、消しても数は失われない。
    "islandVotes": "#171 で口を畳んだ。中身は押した時刻だけで、字は入っていない",
    # #409 でカードの候補を投げ銭した人に戻したので、**読む口が1つも無くなった。**
    # 中身は日付とチャンネルIDの並びだけで、**人の書いた字は1文字も入っていない。**
    # 元は BigQuery の `chat_messages` と Firestore の `streamChatMessages` なので、
    # また要るとなっても作り直せる（経緯は docs/island-incident-2026-09-14-cards.md）。
    "islandDayPeople": "#409 で読む口が無くなった。中身はチャンネルIDだけで字は入っていない。元から作り直せる",
    # 下の3つは #1281。視聴者さんが企画を出す道（提案・育てる・ハート）を畳んで、
    # **読む口も書く口も1つも無くなった。** 中身は人の字なので、上の 3 のとおり
    # 期限の無い退避を取ってから消す（字は退避に残る）。
    "islandIdeas": "#162 で付箋へ移し #171 で口を畳んだ旧い企画の種。全件 hidden。#1281 で退避を取って消す",
    "islandNextPlans": "#202 で islandStreamEvent へ改名した旧い入れ物。読む口も書く口も無い。#1281 で退避を取って消す",
    "islandDrafts": "#161 で企画へまとめ #171 で口を畳んだ旧い下書き。#1281 で退避を取って消す",
}
# `islandIdeas` は長く「書いた人の字なので消さない」としてここに入れずにいた。
# #1281 で、字は期限の無い退避（`retired_docs`）に残したうえで消すと決めた。
# **退避を取らずに消す道は、この道具には無い。**
#
# **`monthlyReview` もここに入れない。** コードから参照が0に見えるが、
# 月末配信の OBS 同期が生きている（`public/202608_monthly_review.html` と
# `.claude/skills/monthly-review/SKILL.md`）。**数えただけで判断しない。**
#
# `nordicPhotos` / `nordicDays` は #202 で移し先ができたが、
# **書く口をまだ両方動かしている**ので生きている。畳んでからにする。

# 1回のバッチで消す数。Firestore の上限は 500
BATCH = 400


def retire(col: str, docs: list) -> None:
    """期限の無い退避へ全件を写し、写ったことを指紋で確かめる。合わなければ落ちる。"""
    from google.cloud import bigquery

    from backup import codec, sink

    c = sink.client()
    sink.ensure_dataset(c)
    sink.ensure_table(c, "retired_docs", sink.FS_SCHEMA)
    table = f"{sink.PROJECT}.{sink.DATASET}.retired_docs"
    taken_at = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    want = sorted(codec.digest(d.id, d.to_dict()) for d in docs)
    with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as f:
        for d in docs:
            data = d.to_dict()
            row = {
                "taken_at": taken_at,
                "collection": col,
                "doc_id": d.id,
                "doc_json": codec.data_json(data),
                "digest": codec.digest(d.id, data),
            }
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
        path = f.name
    sink.load_ndjson(c, table, path, sink.FS_SCHEMA, truncate=False)
    rows = c.query(
        f"SELECT digest FROM `{table}` WHERE collection = @c AND taken_at = @t",
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("c", "STRING", col),
                bigquery.ScalarQueryParameter("t", "TIMESTAMP", taken_at),
            ]
        ),
        location=sink.LOCATION,
    ).result()
    got = sorted(r["digest"] for r in rows)

    def fp(xs: list) -> str:
        return hashlib.sha256("".join(xs).encode()).hexdigest()[:12]

    log.info(
        "退避 %s: Firestore %d件（指紋 %s）→ %s %d件（指紋 %s）・taken_at %s",
        col, len(want), fp(want), table, len(got), fp(got), taken_at,
    )
    if got != want:
        log.error("退避が Firestore と合いません。**1件も消しません**")
        raise SystemExit(2)


def main() -> None:
    a = args()
    (col,) = need(a, "collection")
    apply = bool(a.get("apply", False))

    if col not in DEAD:
        log.error(
            "%s は DEAD に入っていません。**消してよいと判断が済んだものだけ**"
            " python/admin/collection_drop.py の DEAD に、理由と一緒に足してください",
            col,
        )
        raise SystemExit(2)

    log.info("%s — %s", col, DEAD[col])
    client = db()
    ref = client.collection(col)

    docs = list(ref.limit(100000).stream())
    n = len(docs)
    log.info("いま %d 件", n)
    if n == 0:
        log.info("消すものはありません")
        return

    if not apply:
        log.info('--- {"apply": true} を渡すまで消しません（渡すと、先に退避を取ります） ---')
        return

    retire(col, docs)

    gone = 0
    while True:
        docs = list(ref.select([]).limit(BATCH).stream())
        if not docs:
            break
        batch = client.batch()
        for d in docs:
            batch.delete(d.reference)
        batch.commit()
        gone += len(docs)
        log.info("  %d / %d", gone, n)

    log.info("%s を %d 件 消しました", col, gone)


main()
