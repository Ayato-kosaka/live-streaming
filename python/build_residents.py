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

## 島を歩く候補は、**名簿（Firestore の `islandCharacter`）が決める**

`site/content/residents.ts` が持っているのは**キャラクターの絵**（視聴者さんが
作ってくれたもの。書類ID＝もとのドライブの画像 id）で、YouTube のチャンネル
ではない。だから「誰がどの絵か」を結ぶ道が要る。

**前はここが `python/residents_map.json`（手書きの22行）だった。**
#284 でキャラクターを Firestore に移したとき、**島だけが取り残されていた。**
名簿は102人まで増えていたのに、島を歩けるのは古い写しに載っている22人だけで、
**あやとが絵を描いた80人が一度も島に立てなかった**（2026-09-15）。

いまは名簿がそのまま候補になる。結び方は**カードの絵を引くのと同じ道**
（`functions/src/cards.ts` の `iconsOf` → `characterKeys`）:

1. 名簿の `lookupKeys` / `channelKeys`（保存のときに `keysOf` が焼いた鍵）で
   「鍵 → 書類ID」を作る。**同じ鍵が2人に付いていたら、その2人は候補にしない**
   （どちらの絵か決められないまま立たせると、別人の絵が島を歩く）
2. チャットの名乗り（`author_name`）を同じ規則で鍵にして引く
3. `islandCharacter.channelId` が入っている人は、そちらが正。
   **ただし本番で埋まっているのは102人中2人だけ**なので、これだけでは引けない

**`channelId` を持たない人も候補に入る。** 名乗りが当たらなければ `days` が 0 に
なるだけで、絵は島に立つ。結べないことと、絵が無いことは別のもの。

**名簿が読めなかったら、焼かずに終わる。** 空の `residents.ts` を焼くと、
島から人が消える——それは「今日は誰も来ていない」と同じ絵になる
（`docs/island-standards.md` 10）。

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
import sys
import unicodedata
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

sys.path.insert(0, str(Path(__file__).resolve().parent))

from logsafe import mask  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT_TS = ROOT / "site" / "content" / "residents.ts"

PROJECT = os.environ.get("BQ_PROJECT_ID", "live-streaming-d3cac")
DATASET = "youtube_chat"

# キャラクターの名簿。**ここが島を歩く候補の唯一の出どころ。**
CHARACTERS = "islandCharacter"

# 1回に読む人数。`functions/src/islandCharacter.ts` の MAX_CHARACTERS と同じ
MAX_CHARACTERS = 500

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


# 目に見えない字。`functions/src/islandCharacter.ts` の INVISIBLE と同じ中身
INVISIBLE = dict.fromkeys(
    [0x200B, 0x200C, 0x200D, 0xFEFF, 0x2060, 0x180E, 0x00AD, 0x034F, 0x061C]
)
# 異体字セレクタ
VARIATION = dict.fromkeys([0xFE0E, 0xFE0F])


def norm_key(v) -> str:
    """`functions/src/islandCharacter.ts` の `normKey` と同じ落とし方。

    **片方だけ変えると、島とカードで別の人の絵が出る。**
    向こうは NFKC → 異体字 → 見えない字 → trim → 空白を1つに → 小文字。
    """
    if not isinstance(v, str):
        return ""
    s = unicodedata.normalize("NFKC", v)
    s = s.translate(VARIATION).translate(INVISIBLE)
    return " ".join(s.split()).lower()


def keys_of(names) -> list:
    """`keysOf` と同じ。**`@` を落とした形も足す。**"""
    out = []
    for n in names:
        if not isinstance(n, str):
            continue
        for v in (norm_key(n), norm_key(n.lstrip("@"))):
            if v and v not in out:
                out.append(v)
    return out


def char_keys(c: dict) -> list:
    """その人を引ける鍵。

    **焼いてある `lookupKeys` / `channelKeys` を使う。** 引く道を口
    （`cards.ts` の `characterKeys`）と揃えておかないと、島では当たるのに
    カードでは当たらない人ができる。

    両方とも空の書類だけ、名前から作り直す。移行のときに鍵を焼き損ねた人が
    居ても、名前が入っていれば引けるようにしておくため
    （`python/admin/alertbox_names.py` が数えている食い違い）。
    """
    out = []
    for k in list(c.get("lookupKeys") or []) + list(c.get("channelKeys") or []):
        if isinstance(k, str) and k and k not in out:
            out.append(k)
    if out:
        return out
    names = [c.get("channelName") or ""] + list(c.get("aliases") or [])
    return keys_of([n for n in names if n])


def fetch_characters() -> list:
    """キャラクターの名簿（`islandCharacter`）を読む。**読むだけ。**

    Returns:
        1人1辞書。書類ID・絵文字・名前・焼いてある鍵・（あれば）チャンネルID
    """
    from google.cloud import firestore  # Firestore を使うときだけ要る

    sys.path.insert(0, str(Path(__file__).resolve().parent / "admin"))
    from _fs import readonly  # noqa: PLC0415

    # **下見の口を通す。** ここは焼くだけの道具なので、1バイトも書かない
    client = readonly(firestore.Client(project=PROJECT))
    out = []
    for d in client.collection(CHARACTERS).limit(MAX_CHARACTERS).get():
        v = d.to_dict() or {}
        out.append(
            {
                "id": d.id,
                "emoji": v.get("emoji") or "",
                "channelName": v.get("channelName") or "",
                "aliases": list(v.get("aliases") or []),
                "lookupKeys": list(v.get("lookupKeys") or []),
                "channelKeys": list(v.get("channelKeys") or []),
                "channelId": v.get("channelId") or "",
            }
        )
    return out


def link(chars: list, people: list) -> tuple:
    """名簿と、チャットの名乗りを突き合わせる。

    **当てずっぽうで結ばない。** 決められないものは結ばないほうに倒す。
    別人の絵が島に立つほうが、日数が0に見えるよりずっと悪い。

    Args:
        chars: `fetch_characters()` が返す名簿
        people: `{"cid": ..., "name": ...}` の一覧（BigQuery の行でよい）

    Returns:
        (候補の一覧, 数えたもの)。候補は `{"icon", "emoji", "channel"}`。
        `channel` は結べなかったとき None
    """
    # 鍵 → その鍵を持つ人。**同じ鍵が2人に付いていたら、その2人ごと外す。**
    owners: dict = {}
    for c in chars:
        for k in char_keys(c):
            owners.setdefault(k, set()).add(c["id"])
    twice = {k for k, ids in owners.items() if len(ids) > 1}
    blurred = {i for k in twice for i in owners[k]}
    key_to_id = {k: next(iter(ids)) for k, ids in owners.items() if k not in twice}

    # 1. `channelId` が入っているなら、それが正（名乗りより強い）。
    #    **本番で埋まっているのは102人中2人だけ**なので、これだけでは足りない
    #    **同じチャンネルIDが2人に入っていたら、その2人も外す**（鍵と同じ扱い）
    same = {}
    for c in chars:
        if c.get("channelId"):
            same.setdefault(c["channelId"], []).append(c["id"])
    blurred |= {i for ids in same.values() if len(ids) > 1 for i in ids}

    channel_of: dict = {}
    claimed: dict = {}
    for c in chars:
        cid = c.get("channelId")
        if c["id"] in blurred or not cid:
            continue
        channel_of[c["id"]] = cid
        claimed[cid] = c["id"]

    # 2. 名乗りで引く（カードの絵と同じ道）
    hits: dict = {}
    for p in people:
        cid, name = p.get("cid"), p.get("name")
        if not cid or not name or cid in claimed:
            continue
        for k in keys_of([name]):
            who = key_to_id.get(k)
            if who:
                hits.setdefault(who, set()).add(cid)
                break

    # 3. **1つの絵に2つのチャンネルが当たったら、どちらにも決めない。**
    #    同じ名前で別のチャンネルから来ている2人の、どちらの日数かが読めない
    for who, cids in hits.items():
        if who in channel_of:
            continue
        if len(cids) == 1:
            channel_of[who] = next(iter(cids))
        else:
            blurred.add(who)

    out = [
        {"icon": c["id"], "emoji": c.get("emoji") or "", "channel": channel_of.get(c["id"])}
        for c in chars
        if c["id"] not in blurred
    ]
    return out, {
        "characters": len(chars),
        "blurred": sorted(blurred),
        "twice": len(twice),
        "linked": sum(1 for r in out if r["channel"]),
    }


def write_ts(rows: list, active: int, denom: int, lost_days: int) -> None:
    body = "\n".join(
        f'  {{ icon: "{r["icon"]}"'
        + (f', emoji: "{r["emoji"]}"' if r.get("emoji") else "")
        + f', days: {r["days"]}'
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
 *  **並んでいるのは、キャラクターの名簿（Firestore の `islandCharacter`）
 *  そのもの。** 島を歩く候補はここが決める。前は python 側の手書きの表（22行）が
 *  決めていて、名簿に絵があるのに一度も島に立てない人がそのぶん居た。
 *
 *  `channel` は YouTube のチャンネル id。名簿の `lookupKeys` に、チャットの
 *  名乗りを当てて結んである（カードの絵と同じ引き方）。**決められないもの
 *  （同じ鍵が2人に付いている・1つの絵に2つのチャンネルが当たる）は結ばない。**
 *  結べなかった人は `channel` が無く、`days` は 0。絵は島に立つ。
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

    # **名簿が読めなかったら、焼かない。** 空の residents.ts を焼くと島から
    # 人が消える。それは「今日は誰も来ていない」と同じ絵になる
    try:
        chars = fetch_characters()
    except Exception as e:  # noqa: BLE001
        logger.error("名簿（%s）を読めなかった: %s。焼かずに終わる", CHARACTERS, e)
        return 1
    if not chars:
        logger.error(
            "名簿（%s）が1人も返らなかった。島から人が消えるので、焼かずに終わる",
            CHARACTERS,
        )
        return 1

    out, how = link(chars, rows)
    if not out:
        logger.error("候補が1人も残らなかった。焼かずに終わる")
        return 1

    logger.info("名簿 %d 人", how["characters"])
    if how["twice"]:
        logger.warning(
            "同じ鍵が2人に付いている: 鍵 %d 個 / %d 人。"
            "どちらの絵か決められないので、候補に入れていない",
            how["twice"], len(how["blurred"]),
        )
    # **誰が外れたかは指紋で出す。** 名前もチャンネルIDも1文字も出さない
    for who in how["blurred"]:
        logger.warning("  候補に入れなかった: %s", mask(who))
    logger.info("チャンネルと結べた人 %d / 候補 %d 人", how["linked"], len(out))

    by_cid = {r["cid"]: int(r["attend"]) for r in rows}
    for r in out:
        r["days"] = by_cid.get(r["channel"], 0) if r["channel"] else 0

    # 日数の同じ人（結べなかった人は全員 0）が並ぶので、**絵の id で並びを固定する。**
    # 順番が晩ごとに揺れると、中身が変わっていないのに毎晩 commit が立つ
    out.sort(key=lambda r: (-r["days"], r["icon"]))
    write_ts(out, active, denom, lost_days)
    logger.info("焼いた: %s（%d人）", OUT_TS, len(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
