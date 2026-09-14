"""「その日いた人」の名簿（`islandDayPeople`）を、1日1枚の書類として作る。

## なぜ要るか

あやと島カードの「だれを入れますか」の候補は、`functions/src/streamEvents.ts` の
`channelsOfDay()` が返す。**説明には「その日いた人のチャンネルID」と書いてあるのに、
中で見ているのは `islandTips`（投げ銭の台帳）だけ**だった。
つまり、**お金を出した人しか、その日の写真に入れない。**

実測（2026-09-13）: **68回**コメントしてくれて、キャラクターの絵もある視聴者さんが、
その日投げ銭していないという一点だけで候補から外れていた。

候補を「その日いた人」に広げる。ただし、候補を引くたびに1日1,400件のコメントを
数え直すと口が重くなる。**数え終わったものを、1日1枚の書類に持つ。**

## 書類の形

    islandDayPeople/{YYYY-MM-DD}
      day:       "2026-09-13"        書類IDと同じ。引きやすさのため欄にも持つ
      channels:  ["UC…", "UC…", …]   その日いた人のチャンネルID。重複なし
      updatedAt: 1789…（ミリ秒）

**名前も本文も金額も入れない。** チャンネルIDだけ。
入れ物は `firestore.rules` の末尾（それ以外は禁止）で閉じているので、
クライアントからは読めない。読むのは Functions（管理者の資格で動く）だけ。

## 日の境目は日本時間の0時

`islandTips` と同じ。18時境をやめた経緯は `functions/src/islandApi.ts` の
`listPhotoDays` に書いてある（#201）。**同じ日の切り方でないと、台帳と名簿で
別の日を見比べることになる**（`python/admin/card_why.py` の `jst_range` も同じ）。

## 元は2つ。**前日までと、今日のぶん**

| 出どころ | 何が入っているか | いつのぶんか |
| --- | --- | --- |
| BigQuery `chat_messages` | コメントもスパチャも全部 | 前の晩まで |
| Firestore `streamChatMessages` | `collectLiveChat` が5分おきに溜めるぶん | **今日のぶん** |

2つ目が要るのは、BigQuery が前の晩までしか無いから。取り込みは実際には
1〜3時間半遅れて走るので、その日はじめて来てくれた人は翌朝までどこにも出てこない。
足す書き方は `python/admin/characters_gap.py` と同じ。

## 足す方向だけ。**既にある名簿を消さない**

毎晩の取り込みが BigQuery に追いつくまでのあいだ、当日ぶんは Firestore にしか
無い。`streamChatMessages` は溜めっぱなしではないので、**BigQuery で引き直した
結果で上書きすると、その晩しか居なかった人が名簿から消える。**
だから、書くのは「いま入っているもの ＋ 新しく見えた人」だけ。減らさない。

## 並びは「先に見た順」

早く来てくれた人が先。読む側（カードの候補）はこの順でそのまま出すので、
**回すたびに入れ替わってはいけない。** 既にある並びはそのまま残し、
新しい人だけを**その日いちばん早かった時刻の順**でうしろに足す。
時刻が同じなら書類IDの順にして、毎回同じ答えになるようにしてある。

## 1,000件の歯止め

書類1枚は 1MiB まで。チャンネルIDは24文字なので余裕はあるが、
**上限を持たない配列を Firestore の1書類に置かない。** ふだんは40人前後。
超えたら、それ以上は足さずに件数だけ知らせる（既にあるぶんは消さない）。

## BigQuery は1GB を超えない

日付で絞ったうえで、**ジョブそのものに 1GiB の上限を付ける**
（`maximum_bytes_billed`）。絞りを書き間違えたときに、走ってから気づくのではなく
**走る前に落とす**ため。引くのは3列だけなので、実際はその何十分の一で済む。

## ログ

**チャンネルIDも名前も本文も1文字も出さない。** 出すのは日ごとの人数と、
増えた件数だけ。読めなかった値だけは `python/logsafe.py` の `mask()` を通した
指紋（`#a3f9`）で知らせる（下の `log_dropped` に理由）。

実行:
  BQ_PROJECT_ID=live-streaming-d3cac python python/island_day_people.py
  python python/island_day_people.py --days 30
  python python/island_day_people.py --day 2026-09-13 --apply
  python python/island_day_people.py --all --apply
"""

import argparse
import logging
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402
from logsafe import mask  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# 日本は夏時間を持たないので、ずらすだけでよい
JST = timezone(timedelta(hours=9))

# 名簿の置き場
COLLECTION = "islandDayPeople"

# 溜めてあるチャットの置き場（`functions/src/chatCapture.ts`）
CHAT = "streamChatMessages"

# 集計用の bot。本人の配信通知なので人ではない（`island_tips.py` と同じ）
BOT_NAME = "@あやとグルメアプリ"

# 何日ぶんさかのぼるか（`--day` も `--all` も指定しないとき）。
# 取り込みが1日こけても翌日に埋まる幅（`island_tips.py` と同じ7日）
DEFAULT_DAYS = 7

# 1枚の書類に入れるチャンネルIDの上限。**ふだんは40人前後。**
# 書類の上限（1MiB）を割らないための歯止めで、届くことは想定していない
MAX_CHANNELS = 1000

# Firestore の1回のまとめ書きに入る上限。超えると弾かれるので手前で切る
BATCH = 400

# 当日ぶん（`streamChatMessages`）を見に行く日数。**窓の新しい端だけ。**
#
# あそこは消されずに溜まり続ける入れ物で、1日1,400件ある。窓と同じ7日を
# 毎晩なぞると、**それだけで1万件の読みになる。** BigQuery に入ったあとの日を
# もう一度読んでも、同じ人がもう一度出てくるだけで名簿は1人も増えない。
#
# 3日にしてあるのは、当日ぶんが Firestore にしか無い時間が
# 「今日」＋「取り込みが来るまでの昨日」の2日で、**毎晩のジョブが一晩
# こけても間に合う**ように1日ぶん余らせたもの。
#
# これより古い日を埋め直すとき（`--all` や過去の `--day`）は BigQuery だけを
# 見る。**名簿は足す方向にしか動かないので、そのとき拾ったぶんは消えない。**
FS_DAYS = 3

# BigQuery のジョブに付ける上限。**絞りを書き間違えたら、走る前に落とす**
MAX_BYTES_BILLED = 1024 * 1024 * 1024

# --- その日いた人（BigQuery） ---------------------------------------------
#
# **`event_type` で絞らない。** 見たいのは「その日そこに居たか」であって、
# お金を出したかではない。それが元の外し方そのものだった。
#
# 引くのは3列だけ（日・チャンネルID・その日の最初の時刻）。BigQuery は列ごとに
# 読むので、本文や名前を持ち帰らなければ読む量はこれで決まる。
#
# `author_name` が空の行を落とさない。**名前を持たない行の人も、その日は居る。**
# `author_name != @bot` だけだと NULL の行が消える（NULL の比較は NULL）。
SQL_CHAT = f"""
SELECT
  FORMAT_DATE('%Y-%m-%d', DATE(published_at, 'Asia/Tokyo')) AS day,
  author_channel_id AS channel_id,
  MIN(UNIX_MILLIS(published_at)) AS first_ms
FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.chat_messages`
WHERE author_channel_id IS NOT NULL
  AND (author_name IS NULL OR author_name != @bot)
  AND published_at >= TIMESTAMP(@d0, 'Asia/Tokyo')
  AND published_at < TIMESTAMP(DATE_ADD(@d1, INTERVAL 1 DAY), 'Asia/Tokyo')
GROUP BY day, channel_id
"""


def clean(v) -> str:
    """`functions/src/streamEvents.ts` の `clean(v, 64)` と同じ落とし方。

    **読む側と同じ手で揃える。** あちらが `trim().slice(0, 64)` で作る字と
    違うものを名簿に入れると、候補に出ているのに当たらない人ができる。

    Args:
        v: 生の値

    Returns:
        整えた字。使えなければ空文字
    """
    return v.strip()[:64] if isinstance(v, str) else ""


def jst_range(day: str) -> tuple:
    """その日の日本時間 0時から翌0時までを、ミリ秒で返す。

    `streamChatMessages` は時刻（`at`。ミリ秒）しか持っていないので、
    日で引くにはここを通す。**終わりは含まない**ので、23:59 はその日に入り、
    翌 00:01 は入らない。

    Args:
        day: YYYY-MM-DD

    Returns:
        (始まり, 終わり)。終わりは含まない
    """
    d0 = datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=JST)
    return int(d0.timestamp() * 1000), int((d0 + timedelta(days=1)).timestamp() * 1000)


def jst_day(ms: int) -> str:
    """ミリ秒を日本時間の日付に切る。**ここが名簿の境目。**

    Args:
        ms: ミリ秒

    Returns:
        YYYY-MM-DD
    """
    return datetime.fromtimestamp(ms / 1000, JST).strftime("%Y-%m-%d")


def log_dropped(values: list) -> None:
    """読めなかったチャンネルIDを、**指紋だけ**で知らせる。

    ここは名簿そのものが識別子の集まりなので、**手元でも素の値は出さない**
    （`mask(..., public=True)` を固定で通す）。`logsafe` のふだんの分け方
    （公開の場では伏せ、手元では出す）に乗せないのは、この入れ物では
    素の値がログに出てよい場面が1つも無いから。

    値の代わりに指紋を出すのは、**10件が1人ぶんの繰り返しなのか10人ぶんなのか**を
    Actions のログだけで見分けるため。指紋は元に戻せない。

    Args:
        values: 落とした生の値
    """
    if not values:
        return
    marks = sorted({mask(v, public=True) for v in values})
    logger.info(
        "読めなかったチャンネルID: %d件（別々の値で %d種）%s",
        len(values),
        len(marks),
        " ".join(marks[:10]),
    )


def fetch_bigquery(d0: str, d1: str) -> list:
    """前日までの確定ぶん（BigQuery の `chat_messages`）。

    Args:
        d0: 始まりの日（YYYY-MM-DD）
        d1: 終わりの日（この日を含む）

    Returns:
        (日, チャンネルID, その日いちばん早い時刻) の一覧
    """
    # 取り込みを1度もしないとき（selftest・手元で形だけ見るとき）に、
    # ライブラリごと要る形にしない。`admin/_fs.py` の `db()` と同じ考え
    from google.cloud import bigquery

    client = bigquery.Client(project=BQ_PROJECT_ID)
    cfg = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("bot", "STRING", BOT_NAME),
            bigquery.ScalarQueryParameter("d0", "DATE", d0),
            bigquery.ScalarQueryParameter("d1", "DATE", d1),
        ],
        # 絞りを書き間違えたら、**走る前に落とす**
        maximum_bytes_billed=MAX_BYTES_BILLED,
    )
    out, dropped = [], []
    for r in client.query(SQL_CHAT, job_config=cfg).result():
        c = clean(r["channel_id"])
        if not c:
            dropped.append(r["channel_id"])
            continue
        out.append((r["day"], c, int(r["first_ms"])))
    client.close()
    log_dropped(dropped)
    return out


def fetch_firestore(db, d0: str, d1: str) -> list:
    """当日ぶん（Firestore の `streamChatMessages`）。

    **同じ欄への範囲2つなので、単一フィールドの索引で足りる**
    （複合索引は作れない。#168）。ここに2つ目の欄を足さないこと。
    `at` を持たない行は落ちる。どの日のものか決めようがない。

    Args:
        db: Firestore クライアント
        d0: 始まりの日（YYYY-MM-DD）
        d1: 終わりの日（この日を含む）

    Returns:
        (日, チャンネルID, その行の時刻) の一覧
    """
    t0, _ = jst_range(d0)
    _, t1 = jst_range(d1)
    out, dropped = [], []
    q = db.collection(CHAT).where("at", ">=", t0).where("at", "<", t1)
    # 要るのは「いつ・誰が」だけ。本文も名前も持ち帰らない
    for d in q.select(["at", "channelId"]).stream():
        v = d.to_dict() or {}
        at = int(v.get("at") or 0)
        if not at:
            continue
        c = clean(v.get("channelId"))
        if not c:
            dropped.append(v.get("channelId"))
            continue
        out.append((jst_day(at), c, at))
    log_dropped(dropped)
    return out


def merge_day(existing: list, seen: list, cap: int = MAX_CHANNELS) -> dict:
    """1日ぶんの名簿を決める。**足す方向だけ。並びは先に見た順。**

    既にある並びはそのまま先頭に残す。**BigQuery で引き直した結果で
    上書きすると、その晩 Firestore にしか居なかった人が消える。**

    新しい人は、その日いちばん早かった時刻の順でうしろに足す。時刻が同じ
    ときはチャンネルIDの順。**2回流しても同じ答えになる**ようにするため
    （並びが回すたびに変わると、読む側の出す順も変わる）。

    Args:
        existing: いま入っている `channels`
        seen: (チャンネルID, 時刻) の一覧。同じ人が何度出てきてもよい
        cap: 1枚に入れる上限

    Returns:
        after（書いたあとの並び）・before・added・capped
    """
    out, known = [], set()
    for c in existing:
        c = clean(c)
        if c and c not in known:
            known.add(c)
            out.append(c)
    before = len(out)

    # 同じ人の**いちばん早い時刻**に寄せてから並べる。2つの出どころに
    # 同じ人が出てくるので、ここで寄せないと並びが出どころの順に引きずられる
    first: dict = {}
    for c, at in seen:
        if c not in known and (c not in first or at < first[c]):
            first[c] = at

    capped = 0
    for c, _ in sorted(first.items(), key=lambda kv: (kv[1], kv[0])):
        if len(out) >= cap:
            capped += 1
            continue
        known.add(c)
        out.append(c)

    return {"after": out, "before": before, "added": len(out) - before, "capped": capped}


def plan(seen: list, had: dict, cap: int = MAX_CHANNELS) -> dict:
    """日ごとに、書いたあとの名簿を決める。**Firestore には触らない。**

    Args:
        seen: (日, チャンネルID, 時刻) の一覧
        had: 日 -> いま入っている `channels`
        cap: 1枚に入れる上限

    Returns:
        日 -> merge_day の結果（並びは日付の順）
    """
    by_day: dict = {}
    for day, c, at in seen:
        by_day.setdefault(day, []).append((c, at))
    # いま入っているだけで今回1件も見えなかった日は触らない（消さないため）
    return {
        day: merge_day(had.get(day, []), by_day[day], cap)
        for day in sorted(by_day)
    }


def fs_window(d0: str, d1: str, today: str) -> tuple:
    """Firestore を見る期間（窓の新しい端の `FS_DAYS` 日ぶん）。

    Args:
        d0: 窓の始まり（YYYY-MM-DD）
        d1: 窓の終わり（この日を含む）
        today: 日本時間の今日

    Returns:
        (始まり, 終わり)。見に行く日が1日も無ければ None
    """
    edge = (
        datetime.strptime(today, "%Y-%m-%d") - timedelta(days=FS_DAYS - 1)
    ).strftime("%Y-%m-%d")
    lo = max(d0, edge)
    hi = min(d1, today)
    return (lo, hi) if lo <= hi else None


def window(a) -> tuple:
    """引数から、見る期間を決める。

    Args:
        a: 解析済みの引数

    Returns:
        (始まりの日, 終わりの日)。どちらも含む
    """
    if a.all:
        # 配信の始まる前から。上限は BigQuery のジョブ側で押さえてある
        return "2000-01-01", "2100-01-01"
    if a.day:
        # 形をここで見る。**そのまま流すと BigQuery か `jst_range` で落ちて、
        # 打ち間違いなのか本番が壊れたのか、ログから見分けがつかない**
        try:
            datetime.strptime(a.day, "%Y-%m-%d")
        except ValueError:
            raise SystemExit(f"--day は YYYY-MM-DD で渡してください: {a.day}")
        return a.day, a.day
    # 日本時間で数える。境目を JST に揃えたので、窓の切り方も揃える
    today = datetime.now(JST).date()
    return (today - timedelta(days=max(1, a.days) - 1)).isoformat(), today.isoformat()


def main() -> int:
    """エントリポイント。"""
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", help="この日だけ（YYYY-MM-DD）")
    ap.add_argument("--days", type=int, default=DEFAULT_DAYS, help="直近この日数ぶん")
    ap.add_argument("--all", action="store_true", help="ぜんぶ入れ直す（最初の1回）")
    # **既定は書かない。** `island_tips.py` は `--dry-run`（既定は書く）だが、
    # あちらは毎晩の取り込みから走るもので、こちらは名簿を**足す**もの。
    # 付け忘れて流れるより、付け忘れて出るだけのほうが安い
    ap.add_argument("--apply", action="store_true", help="**これを付けたときだけ書く**")
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="書かない（既定と同じ。`island_tips.py` の書き方で打っても驚かないように）",
    )
    a = ap.parse_args()

    d0, d1 = window(a)
    logger.info("%s 〜 %s（日本時間の0時が境目）", d0, d1)

    from google.cloud import firestore

    db = firestore.Client(project=BQ_PROJECT_ID)

    bq = fetch_bigquery(d0, d1)
    logger.info("BigQuery（前日までの確定ぶん）: のべ %d件", len(bq))

    fsw = fs_window(d0, d1, datetime.now(JST).date().isoformat())
    if fsw:
        fs = fetch_firestore(db, *fsw)
        logger.info("Firestore（当日ぶん %s 〜 %s）: のべ %d件", fsw[0], fsw[1], len(fs))
    else:
        fs = []
        logger.info("Firestore は見ません（窓が %d日より古い日だけなので）", FS_DAYS)

    seen = bq + fs
    if not seen:
        logger.info("その期間に居た人は見つかりませんでした")
        return 0

    days = sorted({d for d, _, _ in seen})
    col = db.collection(COLLECTION)
    # いま入っているぶんを読んでから決める。**消さないための読み**
    had: dict = {}
    for i in range(0, len(days), 300):
        part = [col.document(x) for x in days[i : i + 300]]
        for snap in db.get_all(part):
            if snap.exists:
                v = snap.to_dict() or {}
                had[snap.id] = [c for c in (v.get("channels") or []) if isinstance(c, str)]
    logger.info("名簿にいま入っている日: %d日", len(had))

    rows = plan(seen, had)

    logger.info("")
    logger.info("日ごと（前 → 後）:")
    for day, r in rows.items():
        line = "  %s  %d人 → %d人（%+d）" % (day, r["before"], len(r["after"]), r["added"])
        if r["capped"]:
            line += "  ※ %d件は %d件の歯止めで入れていません" % (r["capped"], MAX_CHANNELS)
        logger.info("%s", line)

    write = {d: r for d, r in rows.items() if r["added"]}
    logger.info("")
    logger.info("書く日: %d日 / 触らない日: %d日", len(write), len(rows) - len(write))

    if not a.apply or a.dry_run:
        why = "--dry-run が付いている" if a.dry_run else "--apply が付いていない"
        logger.info("%sので、**1バイトも書いていません**", why)
        return 0

    now = int(datetime.now(timezone.utc).timestamp() * 1000)
    wrote = n = 0
    batch = db.batch()
    for day, r in write.items():
        batch.set(
            col.document(day),
            {"day": day, "channels": r["after"], "updatedAt": now},
            merge=True,
        )
        n += 1
        wrote += 1
        if n >= BATCH:
            batch.commit()
            batch = db.batch()
            n = 0
    if n:
        batch.commit()

    logger.info("%s を %d日ぶん 更新しました", COLLECTION, wrote)
    return 0


if __name__ == "__main__":
    sys.exit(main())
