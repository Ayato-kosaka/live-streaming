"""直近90日の「一緒にいた日数」を BigQuery から数えて、site/content/residents.ts を焼く。

**数え方は `.claude/skills/monthly-review/SKILL.md` の3章と同じにする。**
月末配信の表彰と島の日数が食い違っていると、同じ人が別々の数字で2回出ることになる。

**いまは食い違っている。** 下の3で「読めなかった日は数えない」に変えたが、
SKILL.md 3章にはまだ「コメント消失日は当時すでに来ていた人を出席扱いにする」と
書いてある。**月末の表彰も同じ直しが要る**（分母＝チャットの残っている日数、
出席＝実際にコメントのあった日数）。あちらは皆勤賞の分母にもなるので、
直すと「皆勤」の顔ぶれが変わる。

数え方は3つの決まりでできている。

1. **日ごとに数える。** 同じ日に2本配信していても1日。その日どれかに1コメントでも
   あれば出席。本数で数えると、2本ある日に両方来た人だけが伸びる。
2. **配信日は UTC で切る。** 日本時間の朝9時で日が変わるので、22時から始まって
   0時をまたぐ配信が1日の中に収まる。日本時間で切ると、日付をまたいだ配信が
   2日に割れて、出席が実際より多く出る。
3. **チャットの取り込めなかった日は、出席にも分母にも入れない。**
   配信はあったのにコメントが1件も残っていない日がある（取り込みが
   WAITING や FAILED のまま止まっている日）。そこは**誰が居たかが読めていない**
   のであって、誰が居たか分かっている日ではない。

## なぜ「読めなかった日」を出席にしないのか

前はここを「初コメントがその日以前の人を、全員その日は出席として数える」に
していた。**読めていないものを「居た」と言い切っている**ので、
`docs/island-standards.md` 10（読めていないことを、値0と同じ絵にしない）の
裏返しになる。

**そして実際に嘘になっていた。** 2026-09-10 に本番で数えた値:

| | 人数 |
| --- | --- |
| 直近90日にコメントした人 | 318人 |
| 本当に5日以上いた人 | 59人 |
| 読めなかった日を全員に足したときの人数 | 174人 |
| **1日しか来ていないのに常連に数えられた人** | **72人** |

読めなかった日が6日あるので、1日＋6日＝7日 で `MIN_DAYS`(5) を超える。
**1回来ただけの人が「ここ3ヶ月の常連」になる。** 3倍に水増しされた 174 を
`/friends` に出すと、画面が嘘をつく。

「読めなかった日に来ていた人を、来なかったことにしてしまう」という心配は
その通りだが、埋め合わせが「1回の人を常連にする」のは行き過ぎ。
**読めていない日は、出席にも分母にも数えない**（黙って落とすのではなく、
`lost_days` としてログに出す）。

元を断つほうは `python/bq/queries.py` の再取得クエリにある。
7日を過ぎた WAITING が SKIPPED にも FAILED にも落ちないので、取り込めない
配信が WAITING のまま永久に残り、そのぶん「読めない日」が増え続ける。

## キャラクターと人を結ぶ表

`site/content/residents.ts` が持っているのは**キャラクターの絵**（視聴者さんが
作ってくれたもの、Google ドライブの id）で、YouTube のチャンネルではない。
両者を結ぶ表が要る。置き場は `python/residents_map.json`:

    { "<Google ドライブの画像 id>": "<YouTube の channel_id>", ... }

**この表が無いと日数は焼けない。** 無いまま動かすと、数えた結果だけを
`--report` に書き出して、`residents.ts` には触らずに終わる。
推測で結ぶと、実在する人の並び順を間違えて出すことになる（一度やっている）。

**ログインで本人にキャラクターを選ばせない。** 他人の絵を自分のものにできてしまう。
ログインは「認可されたことをする」のと「書いたものに名前を刻む」ためのもので、
島の住人の割り当てはその外にある（issue #113）。

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
  SELECT DATE(TIMESTAMP_SUB(actual_start_time, INTERVAL 9 HOUR)) AS d, status
  FROM `{PROJECT}.{DATASET}.videos`, win
  WHERE actual_start_time IS NOT NULL
    AND DATE(TIMESTAMP_SUB(actual_start_time, INTERVAL 9 HOUR)) BETWEEN win.d0 AND win.d1
),
have AS (SELECT DISTINCT d FROM msg),
-- **読めた日。** チャットが残っている日と、取り込みは通ったのに
-- コメントが1件も無かった日（SUCCEEDED）。後者は本物の0なので分母に入れる。
-- 「読めていない」と「0だった」を同じ扱いにしないのは、こちら向きも同じ。
seen AS (
  SELECT d FROM have
  UNION DISTINCT
  SELECT DISTINCT d FROM vid WHERE status = 'SUCCEEDED'
),
-- 配信はあったのに、取り込めていない日（WAITING / FAILED / SKIPPED のまま）。
-- **「誰も来なかった日」ではなく「誰が居たか読めていない日」。**
-- 出席にも分母にも入れない。
lost AS (SELECT DISTINCT d FROM vid WHERE d NOT IN (SELECT d FROM seen)),
per AS (
  SELECT cid,
         ARRAY_AGG(author_name ORDER BY published_at DESC LIMIT 1)[OFFSET(0)] AS name,
         COUNT(DISTINCT d) AS seen_days,
         MIN(d) AS first_day
  FROM msg GROUP BY cid
)
-- **分母は seen（読めた日）にそろえる。**
-- vid（配信のあった日）にすると、読めていない日のぶんだけ全員が減って見える。
-- seen には「チャットはあるのに videos に開始時刻が無い日」も入るので、
-- vid で数えると attend が denom を超える人が出る（本番で2日ある）。
SELECT p.cid,
       p.name,
       p.seen_days AS attend,
       (SELECT COUNT(*) FROM seen) AS denom,
       (SELECT COUNT(*) FROM lost) AS lost_days,
       CAST(p.first_day AS STRING) AS first_day
FROM per p
ORDER BY attend DESC, p.cid
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
    for m in re.finditer(r'\{\s*icon:\s*"([^"]+)",\s*emoji:\s*"([^"]+)",\s*days:\s*(\d+)', src):
        out.append({"icon": m.group(1), "emoji": m.group(2), "days": int(m.group(3))})
    return out


def write_ts(rows: list, active: int, denom: int, lost_days: int) -> None:
    body = "\n".join(
        f'  {{ icon: "{r["icon"]}", emoji: "{r["emoji"]}", days: {r["days"]}'
        + (f', channel: "{r["channel"]}"' if r.get("channel") else "")
        + " },"
        for r in rows
    )
    OUT_TS.write_text(
        f'''/** 直近{WINDOW_DAYS}日で島に来てくれている仲間のうち、キャラクター登録済みの人。
 *  名前は出さない方針なので、アイコン/絵文字と「一緒にいた日数」だけを持つ。
 *
 *  **手で直さない。** `python/build_residents.py` が BigQuery から焼く。
 *  日ごとに数える。**チャットが取り込めていない日は、出席にも分母にも入れない**
 *  （読めていない日を「居た」ことにすると、1回来ただけの人が常連になる）。
 *
 *  **`days` は、島に出ている人を日替わりで選ぶ重みにもなっている**
 *  （`components/island/villagers.ts` の rosterOf）。よく来てくれている人ほど
 *  島にいる日が多い、という形にするため。
 *
 *  **画面に出る日数は、ここの値ではない（#91）。** `/friends` の図鑑は
 *  `/state` の `residentDays` を出す。あちらは毎晩 `islandChannels` に
 *  入り直すので、旅の途中でも古くならない。**ここの値は、それが読めなかった
 *  ときの受け皿**と、上の抽選の重み（書き出し時に1回決まる）。
 *  数え方が2つあるのは承知のうえ。ここは直近{WINDOW_DAYS}日、あちらは全期間。
 *
 *  `channel` は YouTube のチャンネル id。**どの絵が誰のものかは、あやとが表で
 *  持っている割り当てだけが決める**（`python/residents_map.json`）。
 *  本人にログイン画面で選ばせない。他人の絵を自分のものにできてしまうため。
 */
export type Resident = {{ icon?: string; emoji?: string; days: number; channel?: string }};

export const RESIDENTS: Resident[] = [
{body}
];

/** 直近{WINDOW_DAYS}日で{MIN_DAYS}日以上コメントしてくれた人の総数(キャラ未登録も含む) */
export const ACTIVE_FRIENDS = {active};

/** 出席の分母。期間内に**読めた**配信日の数
 *  （配信はあったのに取り込めていない{lost_days}日は、出席にも分母にも入れていない） */
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
    logger.info("読めた日 %d（出席の分母）", denom)
    # **黙って落とさない。** 読めていない日が増えたら、それは取り込みが
    # 止まっている合図（`python/bq/queries.py` の7日ルール）。数だけは必ず出す。
    if lost_days:
        logger.warning(
            "配信はあったのにチャットの取り込めていない日が %d 日ある。"
            "この日は出席にも分母にも入れていない",
            lost_days,
        )
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
        out.append(
            {
                "icon": cur["icon"],
                "emoji": cur["emoji"],
                "days": by_cid.get(cid, 0),
                "channel": cid,
            }
        )

    out.sort(key=lambda r: -r["days"])
    write_ts(out, active, denom, lost_days)
    logger.info("焼いた: %s（%d人）", OUT_TS, len(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
