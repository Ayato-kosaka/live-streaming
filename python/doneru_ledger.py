"""Doneru の投げ銭を、**1件ずつ**島の置き場へ写す。

## なぜ要るか（2026-09-25。あやとの言葉）

> スパチャ・ドネの履歴が見れたい。…メッセージが見れたり

スパチャは1件ずつ台帳（`islandFundSuperChats`）に在る。**Doneru は無い。**
Doneru から取っているのは**ウィジェットの累計1つだけ**（`doneruNow()`）で、
「誰が・いつ・いくら・何と書いて」は1文字も持っていない。

1件ずつは **BigQuery（`doneru_donations`）に在る**（2026-09-25 実測で1,027行、
2024-12-20 から。うち本文つき 888行）。ところが **Functions から BigQuery は
引けない**——クライアントを足していないし、島を開くたびに BigQuery を叩く形は
そもそも置けない。

だから `python/doneru_health.py` と**同じ形**にする。毎晩の取り込みのあとに、
こちらが Firestore へ写す。読むのは Functions だけ。

## 額の正は、ここではない

**豚に出る Doneru のぶんは、いまも向こうのウィジェットの累計。**
ここは「履歴」と「期間で切った内訳」のために持つ**写し**で、
合計の計算には1バイトも使わない。

内訳の「開始時点」は残差で出している（`functions/src/fundDesk.ts` の
`splitOf`）ので、**この写しがずれても豚の額は1円も動かない。**
ずれたときに動くのは内訳の内わけだけで、そこは下の札で止める。

## いつまで入っているかは、**取り込みが決める**

この道具が今晩うまく回っても、**Doneru の取り込み（cookie）が3日前に
切れていれば、写しも3日前まで**しか無い。だから札の `okDay` は
`islandDoneruHealth/last.okDay`（＝取り込みが最後に入った日）をそのまま写す。
**自分が走ったことを「新しい」と言わない。**

札が無い／`count` が 0 のときは、画面が内訳を1行も出さない
（`docs/island-standards.md` 10章。**読めていないことを、値0と同じ絵にしない**）。

## 書くのは、変わったものだけ

毎晩1,027件を書き直さない。**同じ中身なら1バイトも書かない**——
書き直すと `updatedAt` だけが毎晩新しくなって、「最後に何か起きた日」が
読めなくなる。既定は直近30日ぶんだけ見る（steady state で書き込み0〜3件）。

    python python/doneru_ledger.py              # 直近30日
    python python/doneru_ledger.py --all        # ぜんぶ（移行のとき1回）
    python python/doneru_ledger.py --dry-run    # 書かずに数える
"""

import argparse
import logging
import sys
from datetime import datetime, timezone

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from config import (  # noqa: E402
    BQ_DATASET,
    BQ_PROJECT_ID,
    BQ_TABLE_DONERU_DONATIONS,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# 写し先。**画面からは読めない**（`firestore.rules` が閉じている）。
# 読むのは Functions（`GET /island-api/fund/feed`。あやとだけ）。
COLLECTION = "islandFundDonations"
# 「いつまで入っているか」の札。内訳を出してよいかを、画面はここで決める。
HEALTH = ("islandFundHealth", "donations")
# 取り込みの札。**`okDay` はここから写す**（自分の走った日を使わない）。
INGEST = ("islandDoneruHealth", "last")

# 既定でさかのぼる日数。steady state はこれで足りる（1晩に0〜3件）。
LOOKBACK_DAYS = 30

# 1回に読み合わせる書類の数。`get_all` の上限に余裕を見た数
CHUNK = 300

# 本文の長さ。**`functions/src/fundDesk.ts` の `MAX_FUND_TEXT` と同じ。**
# 置き場に際限のない字を入れない、というだけの線。
MAX_TEXT = 300
# 名前の長さ。スパチャの `who` と同じ扱い。
MAX_WHO = 31

SQL = """
SELECT
  donation_id,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%S%Ez', donated_at, 'Asia/Tokyo') AS at_iso,
  FORMAT_TIMESTAMP('%Y-%m-%d', donated_at, 'Asia/Tokyo') AS jst_day,
  donor_name AS who,
  CAST(amount AS INT64) AS yen,
  message_text AS text,
  status,
  viewer_pk
FROM `{p}.{d}.{t}`
WHERE donated_at IS NOT NULL
  {window}
"""

# **窓を付けるかどうかだけを差し替える。** SQL を2本持つと、片方だけ直す日が来る
WINDOW = "AND donated_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)"


def rows_of(project: str, dataset: str, days: int | None) -> list[tuple[str, dict]]:
    """BigQuery から、写す形で1件ずつ返す。

    **円の行だけ拾う。** `amount` が読めない行と 0円以下は落とす——
    履歴に「0円もらった」と並ぶほうが、1行足りないより害が大きい。

    Args:
        project: BigQuery のプロジェクトID
        dataset: データセット名
        days: 何日ぶん見るか。`None` ならぜんぶ

    Returns:
        `(書類ID, 中身)` の配列
    """
    from google.cloud import bigquery

    client = bigquery.Client(project=project)
    cfg = bigquery.QueryJobConfig(
        query_parameters=(
            [bigquery.ScalarQueryParameter("days", "INT64", days)] if days else []
        )
    )
    sql = SQL.format(
        p=project,
        d=dataset,
        t=BQ_TABLE_DONERU_DONATIONS,
        window=WINDOW if days else "",
    )
    got = list(client.query(sql, cfg).result())
    client.close()

    out: list[tuple[str, dict]] = []
    for r in got:
        doc = str(r["donation_id"] or "").strip()
        # **`/` を含む字は書類IDにできない。** Firestore が投げる前に落とす
        if not doc or "/" in doc:
            continue
        yen = int(r["yen"] or 0)
        if yen <= 0:
            continue
        out.append(
            (
                doc,
                {
                    "yen": yen,
                    "at": r["at_iso"],
                    "day": r["jst_day"],
                    "who": str(r["who"] or "")[:MAX_WHO],
                    # **名前と同じ扱い。** 読めるのはあやとだけ
                    "text": str(r["text"] or "")[:MAX_TEXT],
                    "status": str(r["status"] or "")[:40],
                    "viewerPk": str(r["viewer_pk"] or "")[:64],
                    "src": "doneru",
                },
            )
        )
    return out


def same(had: dict | None, want: dict) -> bool:
    """既に入っているものと、写したいものが同じか。

    Args:
        had: いま入っているもの。無ければ None
        want: 写したいもの

    Returns:
        同じなら True（**1バイトも書かない**）
    """
    if not had:
        return False
    return all(had.get(k) == v for k, v in want.items())


def run(days: int | None, dry: bool) -> dict:
    """写しの本体。

    Args:
        days: 何日ぶん見るか。`None` ならぜんぶ
        dry: True なら1バイトも書かない

    Returns:
        札に残す数字
    """
    from google.cloud import firestore

    rows = rows_of(BQ_PROJECT_ID, BQ_DATASET, days)
    logger.info("BigQuery から %d件（%s）", len(rows), "ぜんぶ" if not days else f"直近{days}日")

    db = firestore.Client(project=BQ_PROJECT_ID)
    col = db.collection(COLLECTION)

    # **読み合わせてから書く。** 同じ中身を毎晩書き直さない
    wrote = 0
    for i in range(0, len(rows), CHUNK):
        part = rows[i : i + CHUNK]
        refs = [col.document(doc) for doc, _ in part]
        have = {s.id: (s.to_dict() or {}) if s.exists else None for s in db.get_all(refs)}
        batch = db.batch()
        n = 0
        for doc, want in part:
            if same(have.get(doc), want):
                continue
            batch.set(col.document(doc), want, merge=True)
            n += 1
        if n and not dry:
            batch.commit()
        wrote += n

    # 置き場ぜんぶを数える。**BigQuery の数ではなく、写し先の数を札に書く**
    # （画面が見ているのは写しのほうなので、そちらの数でないと嘘になる）
    agg = col.count().get()[0][0].value
    total = 0
    for f in col.sum("yen").get()[0]:
        total = int(f.value or 0)

    # 「いつまで入っているか」は、**取り込みが決める**
    ing = db.collection(INGEST[0]).document(INGEST[1]).get()
    ok_day = str((ing.to_dict() or {}).get("okDay") or "") if ing.exists else ""

    note = {
        "at": datetime.now(timezone.utc).isoformat(),
        # **画面が内訳を出してよいかは、この2つで決まる**
        "okDay": ok_day,
        "count": agg,
        "yen": total,
        "wrote": wrote,
        "days": days or 0,
    }
    logger.info(
        "書いたもの %d件 ／ 置き場に %d件・%s円 ／ いつまで入っているか %s",
        wrote,
        agg,
        total,
        ok_day or "（取り込みの札が無い）",
    )
    if not ok_day:
        logger.warning(
            "取り込みの札（%s/%s）が読めません。**画面は内訳を出しません**"
            "（読めていないことを 0 と書かないため）",
            *INGEST,
        )
    if dry:
        logger.info("DONERU_LEDGER dry-run（札も書いていません）")
        return note
    db.collection(HEALTH[0]).document(HEALTH[1]).set(note)
    logger.info("DONERU_LEDGER ok")
    return note


def main() -> int:
    """エントリポイント。

    Returns:
        0 なら写せた。1 なら落ちた（**前の写しはそのまま残る**）
    """
    p = argparse.ArgumentParser()
    p.add_argument("--days", type=int, default=LOOKBACK_DAYS, help="何日ぶん見るか")
    p.add_argument("--all", action="store_true", help="ぜんぶ見る（移行のとき）")
    p.add_argument("--dry-run", action="store_true", help="書かずに数える")
    a = p.parse_args()
    try:
        run(None if a.all else a.days, a.dry_run)
    except Exception as e:  # noqa: BLE001  何で落ちても、前の写しは消さない
        logger.error("写せませんでした: %s: %s", type(e).__name__, e)
        logger.error("**前に写したものはそのまま残ります**")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
