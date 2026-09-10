"""#249 より前に書かれた `next_retry_at` を、いまの決まりに揃える。

## なぜ要るのか

`WAITING` の行の `next_retry_at` は、もともと `first_seen_at + 24時間`
ちょうどだった。ところが定時実行（`0 20 * * *`）は毎晩ぶれる。実測(UTC)は
09-07 22:26 / 09-08 22:15 / 09-09 22:09 で、**前の晩より早く走ることがある。**
きっかり24時間後に置くと、7分早いだけでその晩は拾われず、まる1日待つ。

#249 で `first_seen_at + 24時間 - 3時間` に置き直したが、直したのは
**これから書く行だけ**。すでに `WAITING` で止まっている行は古い値のままなので、
同じ理由でまた拾われない。ここを揃えるのがこのスクリプト。

## 何をするか

`status = 'WAITING'` の行のうち、`next_retry_at` が
`first_seen_at + RETRY_DELAY_SECONDS - CRON_JITTER_SECONDS` より**後ろ**の
ものだけを、その値に書き直す。

- 触るのは `WAITING` だけ。`SUCCEEDED` / `SKIPPED` / `FAILED` は1行も触らない
- 書き直すのは `next_retry_at` の列だけ。状態も試行回数も動かさない
- **同じ判定で選んで同じ値を書く**ので、二度流しても2回目は0件になる

## 拾い直せるのは7日以内のぶんだけ

拾い直すクエリ（`python/bq/queries.py`）は
`first_seen_at >= CURRENT_TIMESTAMP() - 7日` で古い行を対象から外す。
7日より古い `WAITING` は、`next_retry_at` を直しても**もう拾われない。**
出力ではそれを「拾い直せる」の列で分けて出す。直しても効かないものを
「直した」と数えないため。

実行:
  Actions > 管理スクリプトを実行 > script = fix_stale_retry
  ARGS  {}                何行がどう変わるかを出すだけ（**既定は dry-run**）
        {"apply": true}   実際に書く
"""

import os
import sys

from google.cloud import bigquery

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import (  # noqa: E402
    BQ_DATASET,
    BQ_PROJECT_ID,
    BQ_TABLE_VIDEOS,
    CRON_JITTER_SECONDS,
    MAX_RETRY_PERIOD_SECONDS,
    RETRY_DELAY_SECONDS,
)
from _fs import args, log  # noqa: E402

TABLE = f"{BQ_PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE_VIDEOS}"

# あるべき `next_retry_at` の、`first_seen_at` からの秒数。
# `calculate_next_retry_at()` と同じ式。**片方だけ直さないように、
# 定数は向こうと同じものを読む**（数字を書き写さない）。
SHIFT_SECONDS = int(RETRY_DELAY_SECONDS - CRON_JITTER_SECONDS)

# 拾い直すクエリが対象にする期間。ここも `QUERY_SELECT_TARGET_VIDEOS` と同じ定数
WINDOW_SECONDS = int(MAX_RETRY_PERIOD_SECONDS)

# あるべき値。SELECT と UPDATE で同じ式を使う（片方だけ直ると噛み合わなくなる）
WANT = f"TIMESTAMP_ADD(first_seen_at, INTERVAL {SHIFT_SECONDS} SECOND)"

# 直す相手。**あるべき値より後ろにいる WAITING だけ。**
# 手前にいるもの（もう拾われる側）は触らない
WHERE = f"status = 'WAITING' AND next_retry_at > {WANT}"

SELECT_SQL = f"""
SELECT
  video_id,
  title,
  first_seen_at,
  next_retry_at AS now_at,
  {WANT} AS want_at,
  first_seen_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {WINDOW_SECONDS} SECOND)
    AS pickable
FROM `{TABLE}`
WHERE {WHERE}
ORDER BY first_seen_at DESC
"""

UPDATE_SQL = f"""
UPDATE `{TABLE}`
SET next_retry_at = {WANT}
WHERE {WHERE}
"""


def fmt(ts) -> str:
    """UTC の分まで。秒はぶれの話には要らない。"""
    return ts.strftime("%Y-%m-%d %H:%M UTC") if ts else "（無し）"


def show(rows: list[dict]) -> None:
    """1行ずつ、どの値からどの値に変わるかを出す。"""
    for r in rows:
        mark = "拾い直せる" if r["pickable"] else "7日超・拾われない"
        log.info("%s", "─" * 68)
        log.info("%s  %s", r["video_id"], r["title"])
        log.info("  初回確認  %s", fmt(r["first_seen_at"]))
        log.info("  次回      %s  →  %s", fmt(r["now_at"]), fmt(r["want_at"]))
        log.info("  %s", mark)


def main() -> None:
    """エントリポイント。**既定は dry-run。**"""
    a = args()
    client = bigquery.Client(project=BQ_PROJECT_ID)

    rows = [dict(r) for r in client.query(SELECT_SQL).result()]
    if not rows:
        log.info("直すものはありません（WAITING の next_retry_at は全部いまの決まりです）")
        return

    show(rows)
    pickable = sum(1 for r in rows if r["pickable"])
    log.info("%s", "─" * 68)
    log.info(
        "対象 %d 行（うち今夜からまた拾い直せるのは %d 行。残り %d 行は7日を過ぎている）",
        len(rows),
        pickable,
        len(rows) - pickable,
    )

    if not a.get("apply"):
        log.info('dry-run。実際に書くには {"apply": true} を渡す')
        return

    job = client.query(UPDATE_SQL)
    job.result()
    log.info("%d 行を書き直しました", job.num_dml_affected_rows)

    # 書いたあとに同じ判定でもう一度数える。0 でなければ噛み合っていない
    left = [dict(r) for r in client.query(SELECT_SQL).result()]
    if left:
        log.error("まだ %d 行のこっています。判定と書き込みが噛み合っていません", len(left))
        raise SystemExit(1)
    log.info("残り 0 行。WAITING の next_retry_at はいまの決まりに揃いました")


main()
