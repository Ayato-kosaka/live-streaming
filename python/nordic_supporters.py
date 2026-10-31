"""北欧旅の「その日、配信でスパチャしてくれた人」を Firestore に置く。

`docs/nordic-photos.md` の4章。その日の写真に埋め込めるキャラクターは、
**その日の配信でスパチャしてくれた人**に限る。ここはその名簿を作る。

## 持つのは「その日いた」までにする

**金額を持たない。順位も持たない。回数も持たない。**
持つと、そこから並べたくなる。旅の足代でも同じ判断をしていて
（`docs/nordic-fund.md`）、出す人は60人しかいないので、
上位は常連で固定され、320円が1万円の隣に並ぶ。

## この名簿は読まれていない。**だから、もう書かない**（2026-10-13）

**カードの元は `islandTips` に移った**（`python/island_tips.py`）。
`nordicDays` を読んでいたのは `functions/src/cards.ts` と
`listPhotoDays` の2か所で、どちらも台帳を見るようになった。

**それでも毎晩2本が書き続けていた**（ここと `python/doneru_supporters.py`。
どちらも `schedule_fetch_chat.yml` から走る）。読み手0・`firestore.rules` は
deny・退避の `SKIP` に入っている入れ物へ、毎晩書いていたことになる。

消す前に数えた（2026-10-13）。`nordicDays` という字は、コメントと
字の中を落とすと **11行**しか残らない:

| 何 | 何本 |
| --- | ---: |
| 書く（ここ・`doneru_supporters.py`・`admin/nordic_pull.py`・`admin/nordic_supporter.py`） | 6 |
| ルールと、その対照（`firestore.rules` / `tools/rules/here.test.mjs`） | 2 |
| 退避の分類表と、偽のデータ（`backup/plan.py` / `donors_import_selftest.py`） | 2 |
| ログの字 | 1 |

**読む行は1本も無い。** `functions/src` にも `site/` にも0件。

**数えるのは残した。** 毎晩のログに出る「その日、何人が投げてくれたか」は、
取り込みが通ったかの目印として読める。Firestore に書くのをやめただけ。

**この step そのものを外すには `schedule_fetch_chat.yml` を触る必要がある**
（このファイルの持ち主は別）。外せば BigQuery の1クエリぶん軽くなる。

## 配信日の切り方（**古い決め。台帳とは違う**）

**published_at から9時間引いて UTC の日付を取る。** 境目は日本時間の
**18時**。22時に始まって0時をまたいだ続きが1日の中に収まる。

（前はここに「朝9時が境目」と書いてあった。**18時の誤り**。動きは
正しかったので実害は無いが、読んだ人が間違える。#201 で見つけた）

**新しい台帳は日本時間の0時で切る。** 旅で時差が9回変わると、
9時間引く決めは国ごとにずれるため（#201）。ここを合わせに行かないのは、
どうせ消す入れ物の境目を動かすと、**すでに配ったカードが別の日に移る**から。

## キャラクターとの結びつけはここでやらない

返すのは YouTube のチャンネルIDだけ。どの絵の人かは
`site/content/residents.ts`（あやとの表から焼いたもの）を見て、
画面の側が突き合わせる。ここで絵まで決めると、絵の割り当てが
2か所に散る（`python/build_residents.py` の頭に同じ話がある）。

名前も持たせるが、**画面に出るのは「島に名前を出してよい」と本人が
言った人のぶんだけ**（`functions/src/islandApi.ts` が絞る）。

実行:
  BQ_PROJECT_ID=live-streaming-d3cac python python/nordic_supporters.py
  python python/nordic_supporters.py --days 3        # 直近3日ぶん
  python python/nordic_supporters.py --day 2026-09-12
  python python/nordic_supporters.py --day 2026-09-12 --dry-run
"""

import argparse
import logging
import sys
from datetime import datetime, timedelta, timezone
from typing import Dict, List

from google.cloud import bigquery

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402
from logsafe import detail_lines  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# 集計用の bot。本人の配信通知なので人ではない。
BOT_NAME = "@あやとグルメアプリ"

# 何日ぶんさかのぼるか（--day を指定しないとき）。旅は9日ぐらいの見立て。
DEFAULT_DAYS = 14

SQL = f"""
SELECT
  FORMAT_DATE(
    '%Y-%m-%d',
    DATE(TIMESTAMP_SUB(published_at, INTERVAL 9 HOUR))
  ) AS day,
  author_channel_id AS channel,
  ANY_VALUE(author_name) AS name
FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.chat_messages`
WHERE event_type = 'PAID'
  AND author_channel_id IS NOT NULL
  AND author_name != @bot
  AND DATE(TIMESTAMP_SUB(published_at, INTERVAL 9 HOUR))
      BETWEEN @d0 AND @d1
GROUP BY day, channel
ORDER BY day, name
"""


def fetch(d0: str, d1: str) -> Dict[str, List[dict]]:
    """その期間の、日ごとのスパチャした人を取る。

    Args:
        d0: 始まりの日（YYYY-MM-DD）
        d1: 終わりの日（YYYY-MM-DD、この日を含む）

    Returns:
        日付 -> [{"channelId": ..., "name": ...}, ...]
    """
    client = bigquery.Client(project=BQ_PROJECT_ID)
    job = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("bot", "STRING", BOT_NAME),
            bigquery.ScalarQueryParameter("d0", "DATE", d0),
            bigquery.ScalarQueryParameter("d1", "DATE", d1),
        ]
    )
    out: Dict[str, List[dict]] = {}
    for row in client.query(SQL, job_config=job).result():
        out.setdefault(row["day"], []).append(
            {"channelId": row["channel"], "name": row["name"] or ""}
        )
    client.close()
    return out


def main() -> int:
    """エントリポイント。"""
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", help="この日だけ（YYYY-MM-DD）")
    ap.add_argument("--days", type=int, default=DEFAULT_DAYS, help="直近この日数ぶん")
    ap.add_argument("--dry-run", action="store_true", help="書かずに出すだけ")
    a = ap.parse_args()

    if a.day:
        d0 = d1 = a.day
    else:
        today = datetime.now(timezone.utc).date()
        d1 = today.isoformat()
        d0 = (today - timedelta(days=max(1, a.days) - 1)).isoformat()

    found = fetch(d0, d1)
    if not found:
        logger.info("%s〜%s にスパチャはありませんでした", d0, d1)
        return 0

    # **Firestore には1行も書かない**（2026-10-13。この file の頭）。
    # 数えるのは残す——毎晩のログに「その日、何人が投げてくれたか」が
    # 出ているのは、取り込みが通ったかの目印として読める。
    for day, people in sorted(found.items()):
        logger.info("%s: %d人", day, len(people))
        # 1人ずつの明細は、公開の場では1行も出さない（`python/logsafe.py`）。
        # このリポジトリは公開で Actions のログも誰でも読めるので、
        # チャンネルIDとハンドルが並ぶと「その日スパチャした人の一覧」になる
        for line in detail_lines([(p["channelId"], p["name"]) for p in people]):
            logger.info("%s", line)
    logger.info(
        "数えただけ。**`nordicDays` には書いていない**"
        "（読む側が0なので。台帳＝`islandTips` が正）"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
