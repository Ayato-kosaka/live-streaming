"""直近90日の「一緒にいた日数」を BigQuery から数えて、site/content/residents.ts を焼く。

**数え方は `.claude/skills/monthly-review/SKILL.md` の3章と同じにする。**
月末配信の表彰と島の日数が食い違っていると、同じ人が別々の数字で2回出ることになる。

数え方は4つの決まりでできている。

1. **日ごとに数える。** 同じ日に2本配信していても1日。その日どれかに1コメントでも
   あれば出席。本数で数えると、2本ある日に両方来た人だけが伸びる。
2. **配信日は UTC で切る。** 日本時間の朝9時で日が変わるので、22時から始まって
   0時をまたぐ配信が1日の中に収まる。日本時間で切ると、日付をまたいだ配信が
   2日に割れて、出席が実際より多く出る。
3. **コメントが取れなかった日は、当時すでに来ていた人を出席扱いにする。**
   YouTube 側の不具合や取り込みの失敗で、配信はあったのにコメントが1件も
   残っていない日がある。そこを「来なかった日」として数えると、
   **その日に実際いた人が、いなかったことにされる。**
   初コメントがその日以前の人を、全員その日は出席として数える。
4. **分母は、期間内に配信があった日数。** コメントの取れなかった日も配信は
   あったので、分母には入れる。

## キャラクターと人を結ぶ表

`site/content/residents.ts` が持っているのは**キャラクターの絵**（視聴者さんが
作ってくれたもの、Google ドライブの id）で、YouTube のチャンネルではない。
両者を結ぶ表が要る。置き場は `python/residents_map.json`:

    { "<Google ドライブの画像 id>": "<YouTube の channel_id>", ... }

**この表が無いと日数は焼けない。** 無いまま動かすと、数えた結果だけを
`--report` に書き出して、`residents.ts` には触らずに終わる。
推測で結ぶと、実在する人の並び順を間違えて出すことになる（一度やっている）。

島でログインが有効になれば `islandUsers` に本人が選んだキャラクターが入るので、
そちらから作れるようになる（issue #90 / #113）。

実行:
  BQ_PROJECT_ID=live-streaming-d3cac python python/build_residents.py
  python python/build_residents.py --report /tmp/attend.json   # 数えるだけ
"""

import argparse
import json
import logging
import os
import re
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
OUT_TS = ROOT / "site" / "content" / "residents.ts"
MAP_JSON = Path(__file__).resolve().parent / "residents_map.json"

PROJECT = os.environ.get("BQ_PROJECT_ID", "live-streaming-d3cac")
DATASET = "youtube_chat"

# 何日ぶんを「直近」とするか。residents.ts の文言（直近90日）と揃える。
WINDOW_DAYS = 90

# 島に出す最低ライン。これ未満の人は、たまたま1回来た人と区別がつかない。
MIN_DAYS = 5

# 集計用の bot。本人の配信通知なので人ではない。
BOT_NAME = "@あやとグルメアプリ"

SQL = f"""
WITH win AS (
  SELECT DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL {WINDOW_DAYS} DAY) AS d0,
         DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL 1 DAY) AS d1
),
-- 配信日は UTC で切る（日本時間の朝9時が境目）。
-- published_at から9時間引いて UTC の日付を取ると、22時開始の枠と
-- 0時をまたいだ続きが同じ日に入る。
msg AS (
  SELECT author_channel_id AS cid,
         author_name,
         published_at,
         DATE(TIMESTAMP_SUB(published_at, INTERVAL 9 HOUR)) AS d
  FROM `{PROJECT}.{DATASET}.chat_messages`, win
  WHERE published_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {WINDOW_DAYS + 5} DAY)
    AND event_type = 'TEXT'
    AND author_name != '{BOT_NAME}'
    AND DATE(TIMESTAMP_SUB(published_at, INTERVAL 9 HOUR)) BETWEEN win.d0 AND win.d1
),
vid AS (
  SELECT DISTINCT DATE(TIMESTAMP_SUB(actual_start_time, INTERVAL 9 HOUR)) AS d
  FROM `{PROJECT}.{DATASET}.videos`, win
  WHERE actual_start_time IS NOT NULL
    AND DATE(TIMESTAMP_SUB(actual_start_time, INTERVAL 9 HOUR)) BETWEEN win.d0 AND win.d1
),
have AS (SELECT DISTINCT d FROM msg),
-- 配信はあったのにコメントが1件も残っていない日
lost AS (SELECT d FROM vid WHERE d NOT IN (SELECT d FROM have)),
alldays AS (SELECT d FROM vid UNION DISTINCT SELECT d FROM have),
per AS (
  SELECT cid,
         ARRAY_AGG(author_name ORDER BY published_at DESC LIMIT 1)[OFFSET(0)] AS name,
         COUNT(DISTINCT d) AS seen_days,
         MIN(d) AS first_day
  FROM msg GROUP BY cid
),
-- 初コメントがその日以前なら、コメントの残っていない日も出席として数える
bonus AS (
  SELECT p.cid, COUNT(l.d) AS lost_credit
  FROM per p LEFT JOIN lost l ON l.d >= p.first_day
  GROUP BY p.cid
)
SELECT p.cid,
       p.name,
       p.seen_days,
       b.lost_credit,
       p.seen_days + b.lost_credit AS attend,
       (SELECT COUNT(*) FROM alldays) AS denom,
       (SELECT COUNT(*) FROM lost) AS lost_days,
       CAST(p.first_day AS STRING) AS first_day
FROM per p JOIN bonus b USING (cid)
ORDER BY attend DESC, p.seen_days DESC
"""


def fetch() -> list:
    """BigQuery から出席を1発で取る。

    ローカルにダンプしてから数え直すと行が落ちることがあるので
    （SKILL.md 2章）、数えるところまで BigQuery にやらせる。
    """
    from google.cloud import bigquery  # BQ を使うときだけ要る

    client = bigquery.Client(project=PROJECT)
    return [dict(r) for r in client.query(SQL).result()]


def read_map() -> dict:
    """キャラクターの絵 → YouTube チャンネルの表。無ければ空。"""
    if not MAP_JSON.exists():
        return {}
    return json.loads(MAP_JSON.read_text(encoding="utf-8"))


def read_icons() -> list:
    """いまの residents.ts に並んでいるキャラクター（絵の id と絵文字）。

    **人と絵の対応はここが唯一の出どころ**なので、焼き直すときも
    並んでいる顔ぶれは変えない。変えるのは日数だけ。
    """
    src = OUT_TS.read_text(encoding="utf-8")
    out = []
    for m in re.finditer(r'\{\s*icon:\s*"([^"]+)",\s*emoji:\s*"([^"]+)",\s*days:\s*(\d+)\s*\}', src):
        out.append({"icon": m.group(1), "emoji": m.group(2), "days": int(m.group(3))})
    return out


def write_ts(rows: list, active: int, denom: int, lost_days: int) -> None:
    body = "\n".join(
        f'  {{ icon: "{r["icon"]}", emoji: "{r["emoji"]}", days: {r["days"]} }},' for r in rows
    )
    OUT_TS.write_text(
        f'''/** 直近{WINDOW_DAYS}日で島に来てくれている仲間のうち、キャラクター登録済みの人。
 *  名前は出さない方針なので、アイコン/絵文字と「一緒にいた日数」だけを持つ。
 *
 *  **手で直さない。** `python/build_residents.py` が BigQuery から焼く。
 *  数え方は `.claude/skills/monthly-review/SKILL.md` 3章と同じで、
 *  日ごとに数え、コメントの残っていない日は当時すでに来ていた人を出席として扱う。
 *
 *  **`days` は、島に出ている人を日替わりで選ぶ重みにもなっている**
 *  （`components/island/villagers.ts` の rosterOf）。よく来てくれている人ほど
 *  島にいる日が多い、という形にするため。 */
export type Resident = {{ icon?: string; emoji?: string; days: number }};

export const RESIDENTS: Resident[] = [
{body}
];

/** 直近{WINDOW_DAYS}日で{MIN_DAYS}日以上コメントしてくれた人の総数(キャラ未登録も含む) */
export const ACTIVE_FRIENDS = {active};

/** 出席の分母。期間内に配信があった日数（コメントの残っていない{lost_days}日を含む） */
export const STREAM_DAYS = {denom};
''',
        encoding="utf-8",
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", help="BigQuery の代わりに読む JSON")
    ap.add_argument("--report", help="数えた結果をここに書き出して、residents.ts は触らない")
    args = ap.parse_args()

    rows = json.loads(Path(args.rows).read_text(encoding="utf-8")) if args.rows else fetch()
    if not rows:
        logger.error("1行も取れなかった。焼かずに終わる")
        return 1

    denom = int(rows[0]["denom"])
    lost_days = int(rows[0]["lost_days"])
    active = sum(1 for r in rows if int(r["attend"]) >= MIN_DAYS)
    logger.info("配信のあった日 %d（うちコメントの残っていない日 %d）", denom, lost_days)
    logger.info("%d日以上いた人 %d 人", MIN_DAYS, active)

    if args.report:
        Path(args.report).write_text(
            json.dumps(rows, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
        )
        logger.info("書き出した: %s", args.report)
        return 0

    mapping = read_map()
    if not mapping:
        logger.error(
            "%s が無い。キャラクターと YouTube のチャンネルを結ぶ表が要る。"
            "推測で結ぶと実在する人の順番を間違えて出すことになるので、焼かずに終わる",
            MAP_JSON,
        )
        return 1

    by_cid = {r["cid"]: int(r["attend"]) for r in rows}
    out = []
    for cur in read_icons():
        cid = mapping.get(cur["icon"])
        if not cid:
            logger.warning("表に無いキャラクター: %s（前の値のまま残す）", cur["icon"])
            out.append(cur)
            continue
        out.append({"icon": cur["icon"], "emoji": cur["emoji"], "days": by_cid.get(cid, 0)})

    out.sort(key=lambda r: -r["days"])
    write_ts(out, active, denom, lost_days)
    logger.info("焼いた: %s（%d人）", OUT_TS, len(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
