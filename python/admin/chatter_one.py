"""**視聴者さん1人ぶんのコメントを、全期間ぶん読む。** 読むだけ。

    ARGS='{"name":"@ここに名前"}' python python/admin/chatter_one.py

## なぜ要るか

初スパチャをくれた人のキャラクターを作るとき、`.claude/skills/viewer-keywords`
は「**コメントは全部読む**」と言っている。絞って読むと外すから——
@ゆずたつ-q3n で一人称や「好き」で釣って130件だけ読んだとき、
**謎解きも冷えピタも1件も入っていなかった**（1,521件のうち1割を見て
「候補が出そろった」と思っていた）。

ところがその読み方には道具が無かった。`chatter_voices.py` は名簿
（`site/content/residents.ts`）に載っている人しか拾わないので、
**今日はじめて投げてくれた人は1件も引けない。** そこで1人ぶんの口を作る。

| 置き場 | いつのぶん |
| --- | --- |
| BigQuery `chat_messages` | **前の晩まで**（ここが読む先） |
| Firestore `streamChatMessages` | 今日のぶん（`chat_day.py` が読む） |

**今日のぶんはここに入っていない。** 初スパチャの当日は `chat_day.py` と
両方を見る。

## 出すもの・出さないもの

出すのは **`日付  本文`** の2つだけ。

**出さない**:

- **名前**（`author_name`）・**チャンネルID**。1人ぶんを引く口なので、
  名前を出さなくても「誰のぶんか」は押した人が分かっている。
  公開の Actions ログに置く理由が無い
- 金額。投げ銭かどうかも出さない

名前は ARGS に入るが、ワークフローの「入力の中の、個人を指しそうな値を
伏せる」step が `@…` を伏せ字にする（`run_admin_script.yml`）。
**こちらからも出さない**ので、ログに名前が残る道が無い。

## 1バイトも書かない

BigQuery を読むだけ。Firestore には触らない。

## 流す前に見積もる

`chatter_voices.py` と同じで、**dry-run で測ってから流す。**
上限を超えたら引かずに止める（あやと「1GB超えるSQLは控えてくださいね」）。

ARGS:
  {"name":"@ここに名前"}            … 全期間
  {"name":"@…","days":180}          … さかのぼる日数（既定は全期間）
  {"name":"@…","limit":400}         … 出す行数（既定 400）
  {"name":"@…","offset":400}        … 続きから（400件を超える人用）
  {"name":"@…","raw":true}          … 短い相槌と絵文字だけの行も出す
"""

import os
import re
import sys
from collections import Counter

from _fs import args, log  # noqa: E402

PROJECT = os.environ.get("BQ_PROJECT_ID", "live-streaming-d3cac")
DATASET = os.environ.get("BQ_DATASET", "youtube_chat")

# 流してよい量の上限。`chatter_voices.py` と同じ。超えたら引かない
MAX_BYTES = 1 << 30  # 1GiB

# 既定で落とす行の長さ。**絵文字だけの行と短い相槌を落とす。**
# `viewer-keywords` の手順どおり（1,521件 → 1,323件に減る目安）
MIN_LEN = 8

# 「:emoji_name:」だけで出来ている行。YouTube のチャットはこの形で入る
ONLY_EMOJI = re.compile(r"^(?::[a-z0-9_+-]+:|\s)+$")


def drop(text: str) -> bool:
    """この行は落とすか。**落とすのは「読んでも何も分からない行」だけ。**

    短い相槌（「おお」「w」）と絵文字だけの行を落とす。意味のある短文を
    巻き込まないように、長さの線は `viewer-keywords` の 8 文字に合わせる。

    Args:
        text: コメント本文

    Returns:
        落とすなら True
    """
    t = (text or "").strip()
    if not t:
        return True
    if ONLY_EMOJI.match(t):
        return True
    return len(t) < MIN_LEN


def sql_of(days: int) -> str:
    """その人のコメントを古い順に。**名前は SELECT しない。**

    出さないものは**はじめから持って帰らない**（`chatter_voices.py` と
    同じ決め）。日付は日本時間で切る。

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
      FORMAT_TIMESTAMP('%Y-%m-%d', published_at, 'Asia/Tokyo') AS d,
      message_text AS t
    FROM `{PROJECT}.{DATASET}.chat_messages`
    WHERE author_name = @name
      AND message_text IS NOT NULL
      {window}
    ORDER BY published_at
    """


def stats_sql(days: int) -> str:
    """件数・初コメ日・最終コメ日・配信数。**1行だけ返す。**

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
      COUNT(*) AS n,
      FORMAT_TIMESTAMP('%Y-%m-%d', MIN(published_at), 'Asia/Tokyo') AS first_day,
      FORMAT_TIMESTAMP('%Y-%m-%d', MAX(published_at), 'Asia/Tokyo') AS last_day,
      COUNT(DISTINCT video_id) AS videos
    FROM `{PROJECT}.{DATASET}.chat_messages`
    WHERE author_name = @name
      {window}
    """


def habits(rows: list, top: int = 20) -> list:
    """口ぐせ。**同じ本文が何回出たか。**

    キーワードにはならないが、その人の声が分かる（`viewer-keywords`）。
    1回しか出ていないものは口ぐせではないので落とす。

    Args:
        rows: (日付, 本文) の一覧
        top: 出す数

    Returns:
        (本文, 回数) の一覧。多い順
    """
    c = Counter((t or "").strip() for _, t in rows if (t or "").strip())
    return [(t, n) for t, n in c.most_common(top) if n >= 2]


def main() -> int:
    """エントリポイント。

    Returns:
        0=読めた / 1=上限を超えた / 2=入力が足りない・1件も無い
    """
    a = args()
    name = str(a.get("name") or "").strip()
    if not name:
        log.error('name がありません。ARGS に {"name":"@…"} を渡してください')
        return 2
    days = int(a.get("days") or 0)
    limit = int(a.get("limit") or 400)
    offset = int(a.get("offset") or 0)
    raw = bool(a.get("raw"))

    from google.cloud import bigquery  # BQ を使うときだけ要る

    client = bigquery.Client(project=PROJECT)
    cfg = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("name", "STRING", name)]
    )

    sql = sql_of(days)
    # **流す前に見積もる。** 超えたら引かずに止める
    dry = client.query(sql, job_config=bigquery.QueryJobConfig(
        dry_run=True, use_query_cache=False,
        query_parameters=cfg.query_parameters))
    mb = dry.total_bytes_processed / (1 << 20)
    log.info("見積もり: %.1f MB（上限 %.0f MB）", mb, MAX_BYTES / (1 << 20))
    if dry.total_bytes_processed > MAX_BYTES:
        log.error("上限を超えるので**引きません**。days を小さくしてください")
        return 1

    st = list(client.query(stats_sql(days), job_config=cfg).result())
    if st and st[0]["n"]:
        r = st[0]
        log.info("コメント %d 件 / 初 %s / 最新 %s / 配信 %d 本",
                 r["n"], r["first_day"], r["last_day"], r["videos"])
    else:
        # **0件と「読めなかった」を同じ顔で返さない**（island-standards 10）。
        # ここは読めたうえで0件なので、そう言って 2 で終わる
        log.info("この名前のコメントは BigQuery に1件もありません")
        log.info("**今日のぶんはここに入っていません。** `chat_day` を見てください")
        return 2

    rows = [(r["d"], r["t"]) for r in client.query(sql, job_config=cfg).result()]
    keep = rows if raw else [(d, t) for d, t in rows if not drop(t)]
    log.info("引けた %d 件 / 読む %d 件（短い相槌と絵文字だけの行を落とした）",
             len(rows), len(keep))

    hb = habits(rows)
    if hb:
        print("\n## 口ぐせ（同じ本文が2回以上）")
        for t, n in hb:
            print(f"   {n:3d}  {t}")

    part = keep[offset:offset + limit]
    print(f"\n## コメント {offset + 1}〜{offset + len(part)} 件目 / 全 {len(keep)} 件")
    for d, t in part:
        print(f"   {d}  {t}")
    if offset + len(part) < len(keep):
        nxt = offset + limit
        print(f"\n   …まだ {len(keep) - nxt} 件あります。offset={nxt} で続きを引く")
    return 0


# **自己点検から読み込まれたときは走らない。** `chat_day` と同じ理由
if __name__ == "__main__":
    sys.exit(main())
