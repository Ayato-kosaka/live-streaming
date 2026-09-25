"""スパチャに添えられた**本文**を、あとから台帳へ足す。

## なぜ別に要るか（2026-09-25）

本文を残しはじめたのは、配信の OBS が叩く口
（`POST /island-api/alertbox/{合言葉}/superchat` → `fundChatOf`）だけ。
**それより前の516件には1文字も入っていない**し、これから先も
**OBS を起動し忘れた晩のぶん**は毎晩の掃除（`python/fund_daily.py`）が
BigQuery から拾うので、そちらにも本文が付かない。

本文は BigQuery（`chat_messages.message_text`）に在る。ここはそれを
**既にある書類へ足すだけ**の道具。

## 書類を新しく作らない

**`merge: true` で、既に在る書類にだけ足す。** ここで作ると、
毎晩の掃除が拾う条件（`python/fund_box.py` の `bq_superchats`。円だけ・
ほどける item id だけ）と食い違ったときに、**どちらの決めにも従わない行**が
台帳に残る。額が動く置き場なので、入れる係は1つに保つ。

## 同じ書類IDに着く

アラートボックスの `LCC.…` と BigQuery の `event_id` は、ほどくと
**同じ26文字の item id** になる（`python/fund_box.py` の頭に実測がある）。
だから書類IDでまっすぐ当たる。

## 上書きしない

**既に本文の入っている書類は触らない。** 口から入った本文のほうが、
その瞬間に受け取ったものなので正しい。BigQuery のほうが後から
形を変えて返してきても、入っているものを塗り替えない。

    python python/superchat_text.py              # 直近30日
    python python/superchat_text.py --days 400   # 遡る
    python python/superchat_text.py --dry-run    # 数えるだけ
"""

import argparse
import logging
import sys
from datetime import datetime, timezone

sys.path.insert(0, __file__.rsplit("/", 1)[0])

import fund_box as fb  # noqa: E402
from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# 札の置き場。**`doneru_ledger.py` の隣**に並べる
HEALTH = ("islandFundHealth", "superchatText")

# 本文の長さ。**`functions/src/fundDesk.ts` の `MAX_FUND_TEXT` と同じ。**
MAX_TEXT = 300
# 1回に読み合わせる書類の数
CHUNK = 300
# 既定でさかのぼる日数
LOOKBACK_DAYS = 30

# **`at` を列の名前にしない**（BigQuery の予約語。`python/fund_box.py` の実測）
SQL = """
SELECT event_id, message_text AS text
FROM `{p}.{d}.chat_messages`
WHERE event_type = 'PAID'
  AND message_text IS NOT NULL
  AND message_text != ''
  AND published_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
"""


def rows_of(project: str, dataset: str, days: int) -> dict:
    """BigQuery から「26文字の item id → 本文」を引く。

    Args:
        project: BigQuery のプロジェクトID
        dataset: データセット名
        days: 何日ぶん遡るか

    Returns:
        書類ID → 本文。ほどけない `event_id` は落とす
    """
    from google.cloud import bigquery

    client = bigquery.Client(project=project)
    cfg = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("days", "INT64", days)]
    )
    got = list(client.query(SQL.format(p=project, d=dataset), cfg).result())
    client.close()
    out = {}
    for r in got:
        doc = fb.item_id_from_event(str(r["event_id"]))
        if not doc:
            continue
        text = str(r["text"] or "")[:MAX_TEXT]
        if text:
            out[doc] = text
    return out


def run(days: int, dry: bool) -> dict:
    """本体。

    Args:
        days: 何日ぶん遡るか
        dry: True なら1バイトも書かない

    Returns:
        札に残す数字
    """
    from google.cloud import firestore

    want = rows_of(BQ_PROJECT_ID, BQ_DATASET, days)
    logger.info("BigQuery に本文つき %d件（直近%d日）", len(want), days)

    db = firestore.Client(project=BQ_PROJECT_ID)
    col = db.collection(fb.C_SUPERCHAT)

    ids = list(want)
    wrote = 0
    missing = 0
    had = 0
    for i in range(0, len(ids), CHUNK):
        part = ids[i : i + CHUNK]
        snaps = db.get_all([col.document(x) for x in part])
        batch = db.batch()
        n = 0
        for s in snaps:
            if not s.exists:
                # 台帳にまだ無い。**ここでは作らない**（入れる係は掃除のほう）
                missing += 1
                continue
            v = s.to_dict() or {}
            if str(v.get("text") or ""):
                # 既に入っている。**塗り替えない**
                had += 1
                continue
            batch.set(col.document(s.id), {"text": want[s.id]}, merge=True)
            n += 1
        if n and not dry:
            batch.commit()
        wrote += n

    note = {
        "at": datetime.now(timezone.utc).isoformat(),
        "wrote": wrote,
        "had": had,
        "missing": missing,
        "days": days,
    }
    logger.info(
        "足したもの %d件 ／ もう入っていた %d件 ／ 台帳にまだ無い %d件",
        wrote,
        had,
        missing,
    )
    if dry:
        logger.info("SUPERCHAT_TEXT dry-run（札も書いていません）")
        return note
    db.collection(HEALTH[0]).document(HEALTH[1]).set(note)
    logger.info("SUPERCHAT_TEXT ok")
    return note


def main() -> int:
    """エントリポイント。

    Returns:
        0 なら通った。1 なら落ちた（**入っている本文は消えない**）
    """
    p = argparse.ArgumentParser()
    p.add_argument("--days", type=int, default=LOOKBACK_DAYS, help="何日ぶん遡るか")
    p.add_argument("--dry-run", action="store_true", help="書かずに数える")
    a = p.parse_args()
    try:
        run(a.days, a.dry_run)
    except Exception as e:  # noqa: BLE001  何で落ちても、入っているものは消さない
        logger.error("足せませんでした: %s: %s", type(e).__name__, e)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
