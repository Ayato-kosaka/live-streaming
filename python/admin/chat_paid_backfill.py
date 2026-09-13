"""取り逃した**本文の無い投げ銭**を、BigQuery から Firestore へ埋め戻す。

**既定では1行も書かない。** 書くには `{"apply": true}`。

ARGS 例:
  {}                          下見。配信ごとに「BigQuery に何件 / Firestore に
                              何件 / 足りない何件」を数えるだけ
  {"apply": true}             足りないぶんを書く。**書類が既にあれば触らない**
  {"video": "Mzf_LgF6Cxc"}    1本だけ見る
  {"days": 60}                さかのぼる日数（既定 30。BigQuery の分割列を
                              切るのに要る）

## なぜ埋め戻せるのか

`collectLiveChat` が `streamChatMessages` に溜めるとき、**本文の無い
イベントを捨てていた**（`functions/src/chatCapture.ts` の
`if (!messageId || !text) continue;`）。投げ銭は言葉を添えなくても
投げられるので、**金額だけ投げてくれた人が1件も残らなかった。**

同じ配信のチャットは、翌日に yt-dlp で BigQuery
（`youtube_chat.chat_messages`）へ入っている。あちらは
`event_type='PAID'` として**本文が空でも残している**ので、そこから
書類を起こせる。書類IDは `{videoId}_{messageId}` で、BigQuery の
`event_id` は YouTube のライブチャットの messageId と同じもの。
**だから二重にならないし、`collectLiveChat` が後から同じ回を読んでも
同じ書類に重なる。**

## 埋め戻すのは、Firestore が捕まえた配信だけ

`streamChatRuns` に栞のある配信（＝`collectLiveChat` が動いていた回）に
限る。それ以外の配信に投げ銭だけを1件置くと、**その配信は「Firestore に
コメントがある」ことになって、切り抜き（`clip_cuts`）が BigQuery では
なく Firestore を見に行く。** 1件しか無いところから区間を選ぼうとする。
穴を埋めるつもりで、別の嘘を作ることになる。

捕まえていない配信ぶんは、**件数だけ出して書かない**（BigQuery に残って
いるので、翌日以降の集計はどれも取りこぼしていない）。

## ログに出すもの

このリポジトリは公開で、Actions のログも誰でも読める。
**名前も本文も書類IDも出さない。** 出すのは件数と、公開されている動画ID
まで。金額も1件ずつは出さない（誰がいくら、が読めてしまう）。
"""

from _fs import args, db, log

# 1回のまとめ書きで触る数。Firestore の上限は 500
BATCH = 400
# 書類の存在を一度に確かめる数
CHUNK = 300

# 埋め戻す種別。**BigQuery の `PAID` は `liveChatPaidMessageRenderer` だけ**
# （`python/youtube_chat/normalizer.py` の振り分け）なので、Data API の
# `snippet.type` に直すと `superChatEvent` の1つに決まる。
# スーパーステッカーは BigQuery では `UNKNOWN` に落ちていて種別が分からない
# ので、ここでは扱わない（#-- 参照。あちらは正規化の側の話）。
KIND = "superChatEvent"


def runs(client, video: str | None) -> list[str]:
    """`collectLiveChat` が栞を持っている配信（＝捕まえていた回）。"""
    ids = sorted(d.id for d in client.collection("streamChatRuns").stream())
    if video:
        return [v for v in ids if v == video]
    return ids


def paid_rows(videos: list[str], days: int) -> dict[str, list[dict]]:
    """BigQuery の投げ銭を、配信ごとに集める。

    `published_at` で切ってからでないとテーブル全体を舐める（分割列がそれ）。
    """
    import os
    import sys

    from google.cloud import bigquery

    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402

    ds = f"{BQ_PROJECT_ID}.{BQ_DATASET}"
    client = bigquery.Client(project=BQ_PROJECT_ID)
    sql = f"""
    SELECT video_id, event_id, published_at, author_name, author_channel_id,
           IFNULL(message_text, '') AS message_text, purchase_amount_text
    FROM `{ds}.chat_messages`
    WHERE event_type = 'PAID'
      AND published_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(),
                                        INTERVAL @days DAY)
      AND video_id IN UNNEST(@videos)
    ORDER BY published_at
    """
    job = client.query(
        sql,
        job_config=bigquery.QueryJobConfig(query_parameters=[
            bigquery.ScalarQueryParameter("days", "INT64", days),
            bigquery.ArrayQueryParameter("videos", "STRING", videos),
        ]),
    )
    out: dict[str, list[dict]] = {v: [] for v in videos}
    for r in job.result():
        out[r["video_id"]].append(dict(r))
    return out


def outside(videos: list[str], days: int) -> tuple[int, int]:
    """捕まえていない配信の投げ銭は何件か。**数えるだけ。**"""
    import os
    import sys

    from google.cloud import bigquery

    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402

    ds = f"{BQ_PROJECT_ID}.{BQ_DATASET}"
    client = bigquery.Client(project=BQ_PROJECT_ID)
    sql = f"""
    SELECT COUNT(*) AS n,
           COUNTIF(IFNULL(message_text, '') = '') AS empty
    FROM `{ds}.chat_messages`
    WHERE event_type = 'PAID'
      AND published_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(),
                                        INTERVAL @days DAY)
      AND video_id NOT IN UNNEST(@videos)
    """
    job = client.query(
        sql,
        job_config=bigquery.QueryJobConfig(query_parameters=[
            bigquery.ScalarQueryParameter("days", "INT64", days),
            bigquery.ArrayQueryParameter("videos", "STRING", videos),
        ]),
    )
    r = list(job.result())[0]
    return int(r["n"]), int(r["empty"])


def here(client, video: str) -> tuple[int, int]:
    """その配信で Firestore に溜まっている数（全部 / 投げ銭）。

    `select(["kind"])` で引くのは、**本文も名前も手元へ持ってこない**ため。
    """
    q = client.collection("streamChatMessages").where("videoId", "==", video)
    total = 0
    paid = 0
    for d in q.select(["kind"]).stream():
        total += 1
        if (d.to_dict() or {}).get("kind") == KIND:
            paid += 1
    return total, paid


def missing(client, rows: list[dict]) -> list[dict]:
    """まだ Firestore に無い行だけ。**あるものには触らない。**"""
    col = client.collection("streamChatMessages")
    out = []
    for i in range(0, len(rows), CHUNK):
        part = rows[i:i + CHUNK]
        refs = [col.document(f"{r['video_id']}_{r['event_id']}") for r in part]
        found = {s.id for s in client.get_all(refs) if s.exists}
        out += [r for r, ref in zip(part, refs) if ref.id not in found]
    return out


def row_of(r: dict) -> dict:
    """`collectLiveChat` が書くのと同じ形にする。

    `amountMicros` と `currency` は入れない。BigQuery が持っているのは
    `¥500` のような**字だけ**で、数と通貨は分からない。
    **分からないものを、それらしく作らない**（`docs/island-misses.md` #15）。
    """
    v = {
        "videoId": r["video_id"],
        "messageId": r["event_id"],
        "at": int(r["published_at"].timestamp() * 1000),
        "text": r["message_text"] or "",
        "channelId": r["author_channel_id"] or "",
        "name": r["author_name"] or "",
        "kind": KIND,
        # **どこから来た書類かを残す。** 配信中に溜めたものと、あとから
        # BigQuery で起こしたものは、取れている欄が違う
        "source": "bigquery",
    }
    amount = r.get("purchase_amount_text")
    if amount:
        v["amount"] = str(amount)
    return v


def main() -> None:
    a = args()
    apply = bool(a.get("apply"))
    days = int(a.get("days", 30))
    client = db()

    videos = runs(client, a.get("video"))
    if not videos:
        log.info("streamChatRuns に栞が1本も無い。埋め戻す先が無い")
        return
    log.info("── 捕まえていた配信 %d本 / さかのぼり %d日", len(videos), days)

    rows = paid_rows(videos, days)
    todo: list[dict] = []
    for v in videos:
        rs = rows.get(v) or []
        empty = sum(1 for r in rs if not (r["message_text"] or ""))
        total, paid = here(client, v)
        lack = missing(client, rs) if rs else []
        todo += lack
        log.info(
            "  %s  BigQuery: 投げ銭 %d件（本文なし %d件）"
            " / Firestore: %d件（うち投げ銭 %d件）→ 足りない %d件",
            v, len(rs), empty, total, paid, len(lack),
        )

    n, empty = outside(videos, days)
    log.info("── 捕まえていない配信の投げ銭 %d件（本文なし %d件）"
             "。**書かない**（BigQuery に残っている）", n, empty)

    if not todo:
        log.info("── 足りないものは無い")
        return
    if not apply:
        log.info("── 下見なのでここまで。書くのは {\"apply\": true}（%d件）",
                 len(todo))
        return

    for i in range(0, len(todo), BATCH):
        batch = client.batch()
        for r in todo[i:i + BATCH]:
            ref = client.collection("streamChatMessages").document(
                f"{r['video_id']}_{r['event_id']}")
            # **`create` で書く。** 既にある書類は例外になるので、
            # 取り違えても人の書いたものを上書きしない
            batch.create(ref, row_of(r))
        batch.commit()
    log.info("── %d件 書いた", len(todo))

    # **書いたあと数え直す。** 「書いた」と言うのと、入っているのは別の話
    left = 0
    for v in videos:
        left += len(missing(client, rows.get(v) or []))
    log.info("── 数え直し: 足りない %d件", left)


main()
