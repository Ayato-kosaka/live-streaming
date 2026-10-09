"""スタンプの**候補のことばを引いて、Firestore に置く**（#716）。

    python python/admin/stamp_line_suggest.py

## 何をするか

1. `islandStampLine` に在る書類（＝あやとが選んだ人）の `channelId` を集める
2. BigQuery の `chat_messages` から、**島ぜんぶの「同じ字を、何回・何日に
   わたって言ったか」**を引く
3. 選び方は `python/stamp_line_pick.py`（**日常で使えるか**——
   日数 × √らしさ × 短さ）
4. 1人3本を `suggested` に、**元の字**を `suggestedFrom` に置く

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

触るのは `suggested` と `suggestedFrom` と `suggestedAt` の3つだけ。
`lines` を書くと、本人が決めたことばが流し直しで消える（人の字なので戻らない）。

**`suggestedFrom` は、同じ並びの「元の字」。** 機械が触ってよいのは末尾の
句読点だけだが、触ったかどうかが**あとから分からなくなると困る**——
あやとが表で「それは言わない」と言えるのは、元の字が並んでいるときだけ
（あやと 2026-10-09「元の字と、直した字の両方を表に出す」）。

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
    """島ぜんぶの「同じ字を、誰が・何回・何日にわたって言ったか」。

    **名前は SELECT しない**（`chatter_one.py` と同じ決め）。
    `event_type = 'TEXT'` に絞るのは、スパチャの本文をスタンプの候補に
    しないため——**金額の付いた1件を、口ぐせとして出したくない。**

    島ぜんぶを引くのは、**その字をみんなが言っているかを見る**ため。
    選ばれた人のぶんだけ引くと、「こんばんは」が全員の1位になる
    （`python/stamp_line_pick.py` の割合）。

    **日数は「配信の日」で切る。** 日本時間の 0 時で切ると、0時をまたいだ
    1回の配信が2日に数えられて、**その日かぎりの実況が「2日にわたって
    言った」に化ける**（`MIN_DAYS` の関所を素通りする）。6時間ずらすのは
    `docs/island-money.md` 5章「開始が 6:00 JST より前の続き枠は前日に
    寄せる」と同じ向き。

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
      COUNT(*) AS n,
      COUNT(DISTINCT DATE(
        TIMESTAMP_SUB(published_at, INTERVAL 6 HOUR), 'Asia/Tokyo')) AS d
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

    rows = [(r["ch"], r["t"], r["n"], r["d"]) for r in bq.query(sql).result()]
    log.info("数え上げ: %d 通り（島ぜんぶ）", len(rows))
    if not rows:
        log.error("コメントが1件も引けませんでした")
        return 2

    got = pick_all(rows, who.keys(), top=top)
    # **前の式でも1回選んで、人数だけ並べる。** 選び方を変えた晩に
    # 「誰も候補が出なくなった」を、貼ってからではなくここで見る。
    # 出すのは**人数だけ**（ことばは1文字も出さない）
    was = pick_all(rows, who.keys(), top=top, before=True)
    log.info("候補が出た人数: 前の式 %d 人 → いまの式 %d 人",
             len(was), len(got))
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
    # **日数の散らばり。** 今回いちばん強い軸なので、効いているかを数で見る。
    # 候補がぜんぶ2〜3日なら、関所を通っただけで「毎日の言葉」ではない
    ds = sorted(c["d"] for cs in got.values() for c in cs)
    if ds:
        log.info("候補の日数: いちばん少ない %d / 真ん中 %d / いちばん多い %d",
                 ds[0], ds[len(ds) // 2], ds[-1])
    # 機械が末尾の句読点を落とした本数。**言い方は変えていない**
    tidied = sum(1 for cs in got.values() for c in cs
                 if c["text"] != c["from"])
    log.info("末尾の句読点を落とした候補: %d 本 / %d 本", tidied, len(ds))
    # **押した人が口から読めるようにする**（上の `notice` と同じ理由）
    notice(
        f"候補{'（下見）' if not apply else ''}: 相手 {len(who)} 人 / "
        f"候補が出た {len(got)} 人（前の式なら {len(was)} 人）/ "
        f"1本も出なかった {len(none_of)} 人 / "
        + " ".join(f"{k}本:{v}人" for k, v in sorted(spread.items()))
        + f" / 句読点を落とした {tidied} 本")

    if not apply:
        log.info("下見なので**1バイトも書いていません**。"
                 '置くには {"apply": true} を付けてください')
        return 0

    lines = client.collection("islandStampLine")
    now = _now()
    n = 0
    for ch, cands in got.items():
        # **触るのは suggested と suggestedFrom と suggestedAt だけ。**
        # `lines`（本人が決めたことば）には1バイトも書かない。
        # 2つの並びは**同じ長さ・同じ順**で置く——表が1本ずつ突き合わせる
        lines.document(who[ch]).set(
            {
                "suggested": [c["text"] for c in cands],
                "suggestedFrom": [c["from"] for c in cands],
                "suggestedAt": now,
            },
            merge=True,
        )
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
