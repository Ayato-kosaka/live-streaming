"""投げ銭の台帳（`islandTips`）を作る。#202

YouTube のスパチャ（`chat_messages` の `event_type='PAID'`）と、Doneru の寄付
（`doneru_donations`）を**1本にまとめて** Firestore に置く。あやと島カードは
ここから組み上がる（`python/island_cards.py`）。

## なぜ名簿ではなく台帳にするのか

旧 `nordicDays/{YYYY-MM-DD}.people` は「その日いた人」しか持っていなかった。
日付が鍵で、旅の名前がついていて、企画から辿れない。**章＝島 ⊃ 企画 ⊃ 配信**
という決めに合っていない（#202）。

台帳にすると、**どの配信のものか（`videoId`）**が1件ずつに付く。企画と配信は
N:N（1本の配信に企画が何本も乗る）なので、配信から逆に引けないと、
9月11日のように3企画が乗る日を扱えない。

## 配信日の境目は日本時間の0時

旧来は `published_at` / `donated_at` から**9時間引いていた**（＝日本時間の
18時が境目）。旅で時差が9回変わると、そのたびに「その日いた人」が2日に
割れる（#201）。境目は `DATE(..., "Asia/Tokyo")` に固定して、**またいだぶんは
人が決める**（`islandStreamEvent.videoIds` に後半の動画IDを足す）。

実際にまたいでいる配信がある。`MoxSgyW_12k` は 8/30 と 8/31 の両方に
スパチャが入っている。境目をどこに置いても、機械には割れる。

## 流し直しても増えない

書類IDは `sourceEventId` から決まる（SHA-1 の頭32文字）。同じ寄付を何度
取り込んでも同じ書類に上書きされる。**変わっていないものは書かない。**

## 金額は持つ。ただし外に出さない

`amount` を持つのは、いままで意図的に避けていたことの反転（#202 で承認）。
Doneru と突き合わせるのに要る。**代わりに2つ守る。**

1. **島の画面で、金額で並べない・出さない。** 決めは生きている
2. **`islandTips` はクライアントから読めない**（`firestore.rules` で閉じてある）

## Doneru はチャンネルIDを持っていない

`viewer_pk`（どねID）しか無いので、`islandDonors` の対応表を通す。
紐付いていない人は `channelId: null` で入れる。**台帳には残す**
（金額の突き合わせは紐付けと関係ない）。カードは渡らない。

赤くするのは `python/doneru_supporters.py` の役目なので、ここでは数えて
知らせるだけで、終了コードは 0 のまま。**2か所で赤くしない。**

実行:
  BQ_PROJECT_ID=live-streaming-d3cac python python/island_tips.py
  python python/island_tips.py --days 7
  python python/island_tips.py --all --dry-run
"""

import argparse
import hashlib
import logging
import re
import sys
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from google.cloud import bigquery, firestore

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# 集計用の bot。本人の配信通知なので人ではない。
BOT_NAME = "@あやとグルメアプリ"

# 何日ぶんさかのぼるか（--day も --all も指定しないとき）。
# 取り込みが1日こけても翌日に埋まる幅にしておく。
DEFAULT_DAYS = 7

# Firestore の1回のまとめ書きに入る上限。超えると弾かれるので手前で切る。
BATCH = 400

# スパチャの金額表記から通貨を読む。**円だけを前提にしない。**
# 本番の380件に ₪6.00（イスラエル）と CA$2.79（カナダ）が混ざっていた。
# 円に直さない。為替の日付をどこに置くかを決めていないので、
# 直すと「いくらだったか」が分からなくなる。
CURRENCY_MARKS = [
    ("¥", "JPY"),
    ("￥", "JPY"),
    ("CA$", "CAD"),
    ("A$", "AUD"),
    ("NZ$", "NZD"),
    ("HK$", "HKD"),
    ("NT$", "TWD"),
    ("US$", "USD"),
    ("$", "USD"),
    ("€", "EUR"),
    ("£", "GBP"),
    ("₩", "KRW"),
    ("₪", "ILS"),
    ("₱", "PHP"),
    ("₹", "INR"),
    ("R$", "BRL"),
]

# --- YouTube のスパチャ ---------------------------------------------------
# 配信の開始時刻も持つ。0時をまたいだ配信を人が拾うとき、画面に
# 「この配信は何時に始まったか」が出ていないと、どれを足すか決められない。
SQL_YOUTUBE = f"""
SELECT
  m.video_id AS video_id,
  m.event_id AS event_id,
  FORMAT_DATE('%Y-%m-%d', DATE(m.published_at, 'Asia/Tokyo')) AS day,
  UNIX_MILLIS(m.published_at) AS donated_ms,
  UNIX_MILLIS(v.actual_start_time) AS started_ms,
  m.author_channel_id AS channel_id,
  m.author_name AS name,
  m.purchase_amount_text AS amount_text
FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.chat_messages` m
LEFT JOIN `{BQ_PROJECT_ID}.{BQ_DATASET}.videos` v USING (video_id)
WHERE m.event_type = 'PAID'
  AND m.author_channel_id IS NOT NULL
  AND m.author_name != @bot
  AND DATE(m.published_at, 'Asia/Tokyo') BETWEEN @d0 AND @d1
"""

# --- Doneru ---------------------------------------------------------------
# 入金の段階（`status`）では絞らない。「振込待ち」は**あやとへの入金が
# どこまで進んだか**であって、投げ銭が成立したかどうかではない。
SQL_DONERU = f"""
SELECT
  donation_id,
  FORMAT_DATE('%Y-%m-%d', DATE(donated_at, 'Asia/Tokyo')) AS day,
  UNIX_MILLIS(donated_at) AS donated_ms,
  viewer_pk,
  donor_name,
  amount,
  settlement_amount,
  currency
FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.doneru_donations`
WHERE donated_at IS NOT NULL
  AND DATE(donated_at, 'Asia/Tokyo') BETWEEN @d0 AND @d1
"""


def parse_amount(text: Optional[str]) -> tuple:
    """スパチャの金額表記を、数と通貨に割る。

    Args:
        text: `¥1,000` `CA$2.79` のような表記

    Returns:
        (金額, 通貨)。読めなければ (None, None)
    """
    if not text:
        return None, None
    s = str(text).strip()
    cur = None
    for mark, code in CURRENCY_MARKS:
        if mark in s:
            cur = code
            break
    num = re.sub(r"[^0-9.]", "", s.replace(",", ""))
    if not num or num.count(".") > 1:
        return None, cur
    try:
        v = float(num)
    except ValueError:
        return None, cur
    # 円は小数を持たない。整数で入れておくと、あとで足すときに誤差が出ない
    return (int(v) if cur == "JPY" and v == int(v) else v), cur


def jst_day(ms: int) -> str:
    """ミリ秒を日本時間の日付に切る。**ここが配信日の境目**（#201・#202）。

    日本は夏時間を持たないので、足し算でよい。

    Args:
        ms: ミリ秒

    Returns:
        YYYY-MM-DD
    """
    return (
        datetime.fromtimestamp(ms / 1000, timezone.utc) + timedelta(hours=9)
    ).strftime("%Y-%m-%d")


def doc_id(source_event_id: str) -> str:
    """`sourceEventId` から書類IDを作る。

    生の値をそのまま書類IDにしない。YouTube の `event_id` は Base64 風で、
    `/` が入りうる。Firestore の書類IDに `/` は使えないので、ハッシュにする。
    **同じ寄付なら毎回同じIDになる**ので、流し直しても増えない。

    Args:
        source_event_id: 元のイベントID

    Returns:
        32文字の16進
    """
    return hashlib.sha1(source_event_id.encode("utf-8")).hexdigest()[:32]


def fetch_youtube(d0: str, d1: str) -> List[dict]:
    """その期間の YouTube スパチャ。

    Args:
        d0: 始まりの日（YYYY-MM-DD）
        d1: 終わりの日（この日を含む）

    Returns:
        台帳に入れる形の一覧
    """
    client = bigquery.Client(project=BQ_PROJECT_ID)
    cfg = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("bot", "STRING", BOT_NAME),
            bigquery.ScalarQueryParameter("d0", "DATE", d0),
            bigquery.ScalarQueryParameter("d1", "DATE", d1),
        ]
    )
    out = []
    for r in client.query(SQL_YOUTUBE, job_config=cfg).result():
        amount, cur = parse_amount(r["amount_text"])
        src = f"yt:{r['video_id']}:{r['event_id']}"
        out.append(
            {
                "id": doc_id(src),
                "sourceEventId": src,
                "source": "youtube_superchat",
                "channelId": r["channel_id"],
                "day": r["day"],
                "donatedAt": int(r["donated_ms"]),
                "videoId": r["video_id"],
                "videoStartedAt": int(r["started_ms"]) if r["started_ms"] else None,
                "amount": amount,
                "currency": cur,
                "settlementAmount": None,
                "displayNameSnapshot": r["name"] or None,
            }
        )
    client.close()
    return out


def fetch_doneru(d0: str, d1: str, donors: Dict[str, dict]) -> List[dict]:
    """その期間の Doneru の寄付。

    Args:
        d0: 始まりの日（YYYY-MM-DD）
        d1: 終わりの日（この日を含む）
        donors: どねID -> `islandDonors` の中身

    Returns:
        台帳に入れる形の一覧
    """
    client = bigquery.Client(project=BQ_PROJECT_ID)
    cfg = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("d0", "DATE", d0),
            bigquery.ScalarQueryParameter("d1", "DATE", d1),
        ]
    )
    out = []
    for r in client.query(SQL_DONERU, job_config=cfg).result():
        pk = str(r["viewer_pk"]) if r["viewer_pk"] else None
        known = donors.get(pk) if pk else None
        # あやと本人の寄付。台帳には残すが、カードは自分に配らない
        owner = bool(known and known.get("isOwner"))
        src = f"doneru:{r['donation_id']}"
        out.append(
            {
                "id": doc_id(src),
                "sourceEventId": src,
                "source": "doneru",
                "channelId": None if owner else (known or {}).get("channelId"),
                "day": r["day"],
                "donatedAt": int(r["donated_ms"]),
                # Doneru はどの配信のものか持っていない。**日付でしか当たらない。**
                "videoId": None,
                "videoStartedAt": None,
                "amount": float(r["amount"]) if r["amount"] is not None else None,
                # 本番データは全件 NULL（＝円）。NULL のときは JPY と読む
                "currency": r["currency"] or "JPY",
                "settlementAmount": (
                    float(r["settlement_amount"])
                    if r["settlement_amount"] is not None
                    else None
                ),
                "displayNameSnapshot": r["donor_name"] or None,
                "viewerPk": pk,
            }
        )
    client.close()
    return out


def same(had: dict, want: dict) -> bool:
    """すでに入っているものと同じか。**同じなら書かない。**

    毎日7日ぶんを引き直すので、ほとんどの行は変わらない。読みは書きより
    ずっと安いし、この台帳を書くのはここだけなので、読んだ内容が
    古くなることもない（`island_channels.py` と同じ判断）。

    Args:
        had: いま入っているもの
        want: 入れたいもの

    Returns:
        同じなら True
    """
    keys = (
        "sourceEventId",
        "source",
        "channelId",
        "day",
        "donatedAt",
        "videoId",
        "videoStartedAt",
        "amount",
        "currency",
        "settlementAmount",
        "displayNameSnapshot",
    )
    return all(had.get(k) == want.get(k) for k in keys)


def main() -> int:
    """エントリポイント。"""
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", help="この日だけ（YYYY-MM-DD）")
    ap.add_argument("--days", type=int, default=DEFAULT_DAYS, help="直近この日数ぶん")
    ap.add_argument("--all", action="store_true", help="ぜんぶ入れ直す（最初の1回）")
    ap.add_argument("--dry-run", action="store_true", help="書かずに出すだけ")
    a = ap.parse_args()

    if a.all:
        d0, d1 = "2000-01-01", "2100-01-01"
    elif a.day:
        d0 = d1 = a.day
    else:
        # 日本時間で数える。境目を JST に揃えたので、窓の切り方も揃える
        today = (datetime.now(timezone.utc) + timedelta(hours=9)).date()
        d1 = (today + timedelta(days=1)).isoformat()
        d0 = (today - timedelta(days=max(1, a.days) - 1)).isoformat()
    logger.info("%s 〜 %s", d0, d1)

    db = firestore.Client(project=BQ_PROJECT_ID)
    donors = {d.id: (d.to_dict() or {}) for d in db.collection("islandDonors").stream()}
    logger.info("どねID の対応表: %d件", len(donors))

    rows = fetch_youtube(d0, d1) + fetch_doneru(d0, d1, donors)
    logger.info("BigQuery: %d件", len(rows))
    if not rows:
        logger.info("入れるものはありません")
        return 0

    col = db.collection("islandTips")
    # いま入っているぶんを読んでから比べる。**書きを減らすための読み**
    had = {}
    for i in range(0, len(rows), 300):
        part = [col.document(r["id"]) for r in rows[i : i + 300]]
        for snap in db.get_all(part):
            if snap.exists:
                had[snap.id] = snap.to_dict() or {}
    logger.info("台帳にいま入っているの（この期間ぶん）: %d件", len(had))

    now = datetime.now(timezone.utc).isoformat()
    changed = [r for r in rows if not same(had.get(r["id"], {}), r)]
    logger.info("入れる / 直すもの: %d件", len(changed))

    # **0時をまたいだ配信を名指しで出す。** 境目を日本時間の0時にしたので、
    # 配信の始まった日と投げ銭の日がずれる行が出る（本番の380件のうち33件、
    # 8.7%）。その人たちのカードは、始まった日の企画ではなく**翌日の企画**に
    # 付く。直すには後半の動画IDを islandStreamEvent.videoIds に足す。
    #
    # 機械で寄せない。**時差を追いかけないと決めた**のがこの設計なので
    # （#201）、どれを足すかは人が決める。ここは「足す候補はこれ」を出すだけ。
    crossed = {}
    for r in rows:
        if not r.get("videoStartedAt"):
            continue
        started = jst_day(r["videoStartedAt"])
        if started != r["day"]:
            crossed.setdefault((r["videoId"], started), set()).add(r["day"])
    if crossed:
        logger.info("")
        logger.info("**0時をまたいだ配信**（始まった日と投げ銭の日が違う）:")
        for (vid, started), days in sorted(crossed.items()):
            logger.info("  %s  開始 %s → 投げ銭 %s", vid, started, ", ".join(sorted(days)))
        logger.info("  %s の企画に videoIds を足すと、後半のぶんもカードになります", started)

    nameless = [r for r in rows if r["source"] == "doneru" and not r["channelId"]]
    if nameless:
        # ここでは赤くしない。**赤くするのは doneru_supporters.py の役目**
        logger.info(
            "Doneru で紐付いていないぶん: %d件（カードは渡りません）", len(nameless)
        )

    if a.dry_run:
        for r in changed[:30]:
            logger.info("  %s %s %s %s", r["day"], r["source"], r["channelId"], r["amount"])
        logger.info("--dry-run なので書いていません")
        return 0

    wrote = 0
    batch = db.batch()
    n = 0
    for r in changed:
        doc = dict(r)
        key = doc.pop("id")
        doc["updatedAt"] = now
        if key not in had:
            doc["createdAt"] = now
        batch.set(col.document(key), doc, merge=True)
        n += 1
        wrote += 1
        if n >= BATCH:
            batch.commit()
            batch = db.batch()
            n = 0
    if n:
        batch.commit()

    logger.info("islandTips を %d件 更新しました", wrote)
    return 0


if __name__ == "__main__":
    sys.exit(main())
