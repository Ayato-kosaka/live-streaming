"""配信中に取り逃した**投げ銭**を、BigQuery から Firestore へ埋め戻す。

**既定では1行も書かない。** 書くには `{"apply": true}`。

ARGS 例:
  {}                          下見。配信ごとに「BigQuery に何件 / Firestore に
                              何件 / 足りない何件」を数えるだけ
  {"apply": true}             足りないぶんを書く。**書類が既にあれば触らない**
  {"video": "Mzf_LgF6Cxc"}    1本だけ見る
  {"days": 60}                さかのぼる日数（既定 30。BigQuery の分割列を
                              切るのに要る）

## 何が足りなくなるのか

`collectLiveChat` は5分おきに起きるので、**鍵やトークンで数回転んだ晩は、
その間の投げ銭がまるごと入らない**（`kyzCpe5Znyk` が実際にそうで、
BigQuery の投げ銭4件のうち Firestore にあるのは1件だった）。
配信中の取りこぼしは、翌日の取り込みで BigQuery には入るが、
**Firestore のほうは誰も埋めない。**

同じ配信のチャットは、翌日に yt-dlp で BigQuery
（`youtube_chat.chat_messages`）へ入っている。あちらは
`event_type='PAID'` として**本文が空でも残している**ので、そこから
書類を起こせる。

## 二重に書かないための突き合わせ

**BigQuery の `event_id` と、Data API の messageId は別物。**
前者は yt-dlp が拾う renderer の id（`ChwKGk…`）、後者は Data API の
`LCC.…`。同じ1件でも字が違うので、**書類IDだけで見ると「無い」と出て、
もう入っている投げ銭をもう1件書いてしまう。**

だから書類IDと「同じ人が・ほぼ同じ時刻に」の**両方**で見て、片方でも
当たれば書かない（`NEAR_MS`）。

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
# スーパーステッカー（`liveChatPaidStickerRenderer`。15件）は BigQuery では
# `UNKNOWN` に落ちていて、額も名前も正規化されていない。**あれは正規化の側の
# 話**なので、ここでは扱わない。
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


def here(client, video: str) -> tuple[int, list[dict]]:
    """その配信で Firestore に溜まっているもの（全部の数 / 投げ銭の中身）。

    引くのは `kind` `at` `channelId` の3つだけ。**本文も名前も手元へ
    持ってこない**（このリポジトリは公開で、ログも誰でも読める）。
    """
    q = client.collection("streamChatMessages").where("videoId", "==", video)
    total = 0
    paid = []
    for d in q.select(["kind", "at", "channelId", "text"]).stream():
        total += 1
        v = d.to_dict() or {}
        if v.get("kind") == KIND:
            paid.append({
                "at": int(v.get("at") or 0),
                "channelId": str(v.get("channelId") or ""),
                # **本文そのものは持ち歩かない。** 空かどうかと、長さだけ
                "empty": not str(v.get("text") or ""),
                "len": len(str(v.get("text") or "")),
                "text": str(v.get("text") or ""),
            })
    return total, paid


# 同じ投げ銭かどうかを、時刻の近さで見るときの幅。
#
# **BigQuery の `event_id` と、YouTube Data API の messageId は別物。**
# 前者は yt-dlp が拾う renderer の id（`ChwKGk…`）で、後者は Data API が
# 返す `LCC.…` 形式。同じ1件でも字が違うので、**書類IDだけで突き合わせると
# 「Firestore に無い」と出て、二重に書いてしまう。**
# 実際、下見の1回目が `kyzCpe5Znyk` で「Firestore に投げ銭1件」「足りない4件」
# と出した（4件のうち1件は、もう入っているものだった）。
#
# 代わりに「同じ人が・ほぼ同じ時刻に」で見る。投げ銭は1人が数秒のうちに
# 2回投げるものではないので、これで足りる。
NEAR_MS = 5000


def already(row: dict, paid: list[dict]) -> tuple[bool, int]:
    """その行が、もう Firestore に入っているか。

    @return (入っているか, いちばん近かった時刻の差[ms]。無ければ -1)
    """
    at = int(row["published_at"].timestamp() * 1000)
    chan = row["author_channel_id"] or ""
    best = -1
    for d in paid:
        if chan and d["channelId"] and d["channelId"] != chan:
            continue
        gap = abs(d["at"] - at)
        if best < 0 or gap < best:
            best = gap
    return (0 <= best <= NEAR_MS), best


def missing(client, video: str, rows: list[dict],
            paid: list[dict]) -> list[dict]:
    """まだ Firestore に無い行だけ。**あるものには触らない。**

    書類ID（`{videoId}_{event_id}`）と、人と時刻の**両方**で見る。
    片方でも当たれば「もうある」に倒す。**二重に書くほうが、書き損ねる
    より悪い**（誰がいくら応援したかを数える土台なので）。
    """
    col = client.collection("streamChatMessages")
    out = []
    for i in range(0, len(rows), CHUNK):
        part = rows[i:i + CHUNK]
        refs = [col.document(f"{video}_{r['event_id']}") for r in part]
        found = {s.id for s in client.get_all(refs) if s.exists}
        for r, ref in zip(part, refs):
            if ref.id in found:
                continue
            hit, _ = already(r, paid)
            if not hit:
                out.append(r)
    return out


def row_of(r: dict) -> dict:
    """`collectLiveChat` が書くのと同じ形にする。

    `amountMicros` と `currency` は入れない。BigQuery が持っているのは
    `¥500` のような**字だけ**で、数と通貨は分からない。
    **分からないものを、それらしく作らない**（`docs/island-misses.md` #15）。

    `text` に入るのは**その人が書いた言葉**（BigQuery の `message_text`）。
    配信中に溜めたぶんも 2026-09-13 から同じ扱いにしてある
    （それより前の書類には、YouTube が組み立てた金額入りの1文が入っている）。
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
        lack = missing(client, v, rs, paid) if rs else []
        todo += lack
        # 突き合わせが効いているかを、時刻の差で見せる。**書かずに読める。**
        gaps = [g for r in rs for ok, g in [already(r, paid)] if ok]
        # **本文の長さだけ**を両側から出す。中身は出さない。
        # 「BigQuery は 0文字なのに Firestore は 12文字」のように割れていたら、
        # 同じ1件を別の字で持っているということ（どちらが本当かを見に行く）
        if rs:
            log.info("    本文の長さ BigQuery=%s / Firestore(投げ銭)=%s",
                     sorted(len(r["message_text"] or "") for r in rs),
                     sorted(d["len"] for d in paid))
            # **Firestore のほうが長いのは、YouTube が組み立てた字だからか、
            # それとも視聴者さんの言葉が BigQuery 側で落ちているからか。**
            # 中身は出さない。「後ろが一致するか」「前に何文字ついているか」
            # 「その前置きに金額が入っているか」だけ出せば、どちらか分かる
            for r in rs:
                hit, gap = already(r, paid)
                if not hit:
                    continue
                at = int(r["published_at"].timestamp() * 1000)
                d = min(paid, key=lambda x: abs(x["at"] - at))
                bq = r["message_text"] or ""
                amount = str(r.get("purchase_amount_text") or "")
                head = d["text"][:len(d["text"]) - len(bq)] if bq else d["text"]
                log.info(
                    "      後ろが一致=%s / 前置き %d文字 / 前置きに金額=%s",
                    d["text"].endswith(bq) if bq else "(本文なし)",
                    len(head), bool(amount) and amount in head,
                )
        log.info(
            "  %s  BigQuery: 投げ銭 %d件（本文なし %d件）"
            " / Firestore: %d件（うち投げ銭 %d件・本文が空 %d件）"
            "→ もう入っている %d件（時刻の差 %s）/ 足りない %d件",
            v, len(rs), empty, total, len(paid),
            sum(1 for d in paid if d["empty"]), len(gaps),
            f"{min(gaps)}〜{max(gaps)}ms" if gaps else "-", len(lack),
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

    # **書いたあと数え直す。** 「書いた」と言うのと、入っているのは別の話。
    # Firestore も引き直す（書いたものが本当に読めるか）
    left = 0
    for v in videos:
        rs = rows.get(v) or []
        if not rs:
            continue
        _, paid = here(client, v)
        left += len(missing(client, v, rs, paid))
    log.info("── 数え直し: 足りない %d件", left)


main()
