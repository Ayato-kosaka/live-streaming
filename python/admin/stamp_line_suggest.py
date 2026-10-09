"""スタンプの**候補のことばを引いて、Firestore に置く**（#716）。

    python python/admin/stamp_line_suggest.py

## 何をするか

1. `islandStampLine` に在る書類（＝あやとが選んだ人）の `channelId` を集める
2. BigQuery の `chat_messages` から、**島ぜんぶの「同じ字を何回言ったか」**を引く
3. 選び方は `python/stamp_line_pick.py`（**その人が何度も言っていて、
   かつ島のみんなが言っているのではない言い回し**）
4. 1人3本を `suggested` に置く

**名簿は要らない。** 入れ物に在る書類がそのまま相手なので、この口に
名簿を渡す必要がない（渡さないほうが安全）。だから `workflow_dispatch`
からも押せる（`.github/workflows/stamp_line.yml`）。

## 出すもの・出さないもの

**出すのは件数と、`logsafe.mask()` の指紋だけ。**

出さないもの:

- チャンネルID・図鑑の書類ID・名前・ハンドル
- **候補のことばそのもの**。本人のコメントから取った字なので、
  並べれば「誰が何を言っているか」になる。本人が `/me` で読む

ここは公開のリポジトリで、Actions のログも誰でも読める。

## 本人が決めたことばは、絶対に触らない

触るのは `suggested` と `suggestedAt` の2つだけ。`lines` を書くと、
本人が決めたことばが流し直しで消える（人の字なので戻らない）。

## 流す前に見積もる

島ぜんぶのコメントを1回歩くので、**dry-run で測ってから流す。**
上限（1GiB）を超えたら引かずに止める（あやと「1GB超えるSQLは控えてくださいね」）。

入力:
  {}                  … 下見（**1バイトも書かない**）
  {"apply": true}     … 置く
  {"days": 365}       … さかのぼる日数（既定は全期間）
  {"top": 3}          … 1人あたりの本数
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _fs import args, db, log, notice, readonly  # noqa: E402

sys.path.insert(
    0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from logsafe import mask  # noqa: E402
from stamp_line_pick import pick_all  # noqa: E402

PROJECT = os.environ.get("BQ_PROJECT_ID", "live-streaming-d3cac")
DATASET = os.environ.get("BQ_DATASET", "youtube_chat")

# 流してよい量の上限。`chatter_one.py` と同じ
MAX_BYTES = 1 << 30  # 1GiB

# 出す本数。**1本だと押しつけ、多すぎると選べない**（#716 で決めた）
TOP = 3


def sql_of(days: int) -> str:
    """島ぜんぶの「同じ字を、誰が何回言ったか」。

    **名前は SELECT しない**（`chatter_one.py` と同じ決め）。
    `event_type = 'TEXT'` に絞るのは、スパチャの本文をスタンプの候補に
    しないため——**金額の付いた1件を、口ぐせとして出したくない。**

    島ぜんぶを引くのは、**その字をみんなが言っているかを見る**ため。
    選ばれた人のぶんだけ引くと、「こんばんは」が全員の1位になる
    （`python/stamp_line_pick.py` の割合）。

    Args:
        days: さかのぼる日数。0 なら全期間

    Returns:
        SQL
    """
    window = ""
    if days > 0:
        window = (
            "AND published_at >= "
            f"TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days} DAY)"
        )
    return f"""
    SELECT
      author_channel_id AS ch,
      message_text AS t,
      COUNT(*) AS n
    FROM `{PROJECT}.{DATASET}.chat_messages`
    WHERE event_type = 'TEXT'
      AND message_text IS NOT NULL
      AND author_channel_id IS NOT NULL
      {window}
    GROUP BY ch, t
    """


def targets(client) -> dict:
    """候補を出す相手。**入れ物に在る書類から集める。**

    Args:
        client: Firestore クライアント

    Returns:
        `{channelId: 書類ID}`。`channelId` の無い書類は入らない
    """
    out = {}
    blank = 0
    for d in client.collection("islandStampLine").list_documents():
        snap = d.get()
        if not snap.exists:
            continue
        ch = (snap.to_dict() or {}).get("channelId") or ""
        ch = ch.strip() if isinstance(ch, str) else ""
        if not ch:
            blank += 1
            continue
        out[ch] = d.id
    if blank:
        # **黙って通さない。** この人たちには候補を出せない
        log.warning(
            "channelId の無い書類が %d 件。**候補を出せない**"
            "（図鑑に channelId を入れるまで）", blank)
    return out


def main() -> int:
    """エントリポイント。

    Returns:
        0=通った / 1=上限を超えた / 2=相手が1人もいない
    """
    a = args()
    apply = bool(a.get("apply"))
    days = int(a.get("days") or 0)
    top = int(a.get("top") or TOP)

    client = db()
    who = targets(readonly(client))
    if not who:
        # **0人と「読めなかった」を同じ顔で返さない**（island-standards 10）。
        # ここは読めたうえで0人なので、そう言って 2 で終わる
        log.error(
            "候補を出す相手が1人もいません。"
            "先に stamp_line_seed を流してください")
        return 2
    log.info("候補を出す相手: %d 人", len(who))

    from google.cloud import bigquery  # BQ を使うときだけ要る

    bq = bigquery.Client(project=PROJECT)
    sql = sql_of(days)
    # **流す前に見積もる。** 超えたら引かずに止める
    dry = bq.query(sql, job_config=bigquery.QueryJobConfig(
        dry_run=True, use_query_cache=False))
    mb = dry.total_bytes_processed / (1 << 20)
    log.info("見積もり: %.1f MB（上限 %.0f MB）", mb, MAX_BYTES / (1 << 20))
    if dry.total_bytes_processed > MAX_BYTES:
        log.error("上限を超えるので**引きません**。days を小さくしてください")
        return 1

    rows = [(r["ch"], r["t"], r["n"]) for r in bq.query(sql).result()]
    log.info("数え上げ: %d 通り（島ぜんぶ）", len(rows))
    if not rows:
        log.error("コメントが1件も引けませんでした")
        return 2

    got = pick_all(rows, who.keys(), top=top)
    # **1本も出なかった人を、黙って落とさない。**
    # 「候補が出た人数」だけ出すと、出なかった人が0件に化ける
    none_of = [doc for ch, doc in who.items() if ch not in got]
    log.info("候補が出た %d 人 / 1本も出なかった %d 人", len(got), len(none_of))
    if none_of:
        log.warning(
            "1本も出なかった %d 人（指紋: %s）。**この人には提案を置かない**"
            "——空の提案を置くと、画面が「提案が無い」と「読めなかった」を"
            "見分けられなくなる",
            len(none_of), " ".join(mask(x, public=True) for x in none_of))
    # 何本出たかの散らばり。**中身は出さない**
    spread = {}
    for ch in got:
        spread[len(got[ch])] = spread.get(len(got[ch]), 0) + 1
    log.info("本数の散らばり: %s",
             " / ".join(f"{k}本 {v}人" for k, v in sorted(spread.items())))
    # **押した人が口から読めるようにする**（上の `notice` と同じ理由）
    notice(
        f"候補{'（下見）' if not apply else ''}: 相手 {len(who)} 人 / "
        f"候補が出た {len(got)} 人 / 1本も出なかった {len(none_of)} 人 / "
        + " ".join(f"{k}本:{v}人" for k, v in sorted(spread.items())))

    if not apply:
        log.info("下見なので**1バイトも書いていません**。"
                 '置くには {"apply": true} を付けてください')
        return 0

    lines = client.collection("islandStampLine")
    now = _now()
    n = 0
    for ch, texts in got.items():
        # **触るのは suggested と suggestedAt だけ。**
        # `lines`（本人が決めたことば）には1バイトも書かない
        lines.document(who[ch]).set(
            {"suggested": texts, "suggestedAt": now}, merge=True)
        n += 1
    log.info("置きました: %d 人ぶん", n)
    notice(f"候補: 置いた {n} 人ぶん")
    return 0


def _now() -> int:
    """いまの時刻（ミリ秒）。口（`stampLine.ts`）と同じ単位。

    Returns:
        エポックからのミリ秒
    """
    import time

    return int(time.time() * 1000)


# **自己点検から読み込まれたときは走らない。**
if __name__ == "__main__":
    sys.exit(main())
