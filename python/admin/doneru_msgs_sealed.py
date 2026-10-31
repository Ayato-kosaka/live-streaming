"""期間を指定して、Doneru の投げ銭を**1件ずつ・本文つきで**出す。**封をして。**

    script: doneru_msgs_sealed
    args:   {"from": "2026-09-26", "to": "2026-10-30", "pubkey": "<SPKI DER の base64>"}

**1バイトも書かない。** BigQuery と Firestore を読んで、封をして出すだけ。

## なぜ要るか

スパチャの本文はチャットのログ（`streams/*.chat.txt`）に残るので手元で読める。
**Doneru の本文はそこに無い。** チャットに流れるのは読み上げの札だけで、
本文が1文字も入らない。1件ずつは BigQuery の `doneru_donations` にしか無く、
**BigQuery を引けるのは Actions だけ**（この箱に Google の既定の身分が無い）。

`tips_sealed` は人ごとの合計までしか出さないので、本文は取れない。
ここはその1件ずつ版で、**名寄せのしかたは月末と同じ**（図鑑が正）。

## なぜ封をするのか

本文も名乗りも額も、**視聴者さんの素性と実額**。Actions のログも注記も
誰でも読める。だから手元で作った使い捨ての鍵の**公開鍵だけ**を渡して、
返りはそれで包んでもらう。ほどける秘密鍵はこの実行のどこにも来ない。
包み方と返し方は `_seal` に置いてある（`owner_handoff` と同じ）。

## 出すもの（封の中）

1件1行。

| 欄 | 中身 |
| --- | --- |
| `day` | 日本時間の日付 |
| `yen` | どね金額（**視聴者さんが払った額**） |
| `net` | 実際精算金額（**手数料を引いて振り込まれる額**）。無ければ null |
| `text` | 本文。無ければ空 |
| `display` | 図鑑に当たればその呼び名、当たらなければ名乗りそのまま |
| `char` | 図鑑のID。当たらなければ空 |

**`yen` と `net` の両方を出す。** 島の貢献額は `yen` のほうを足しているが
（`fund_box.viewer_yen()`）、あやとの口座に入るのは `net`。
どちらか片方だけを「届いた額」と呼ぶと、**どちらの意味でも間違う。**

## 読み上げの札は本文ではない

`doneru_donations` の本文は Doneru の画面が持っているものなので、
チャットの読み上げとは別物。**ここに本文が無い行は、本当に
本文なしで投げられたもの**で、取りこぼしではない。
"""

import gzip
import json
import os
import sys

from _fs import args, db, log, need, notice, readonly
from _seal import chunks, pack, seal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402
from doneru.dedup import dedup_sql  # noqa: E402
from monthly_tips import Roster  # noqa: E402

# **寄せる口を通す。** `donation_id` だけでは1件に寄らない——主キーに
# 精算状態が入っているので、振り込まれた寄付は**別の鍵で生え直して2行になる**
# （`python/doneru/dedup.py`。#1067）。1件ずつ出す口なので、ここは
# 本文が2回並ぶ形で見えていた。
# `GROUP BY donation_id` は残す。寄せたあとでも同じ鍵が2行ありうる
_ROWS = dedup_sql(
    "{p}", "{d}",
    columns=[
        "donation_id",
        "FORMAT_DATE('%Y-%m-%d', DATE(donated_at, 'Asia/Tokyo')) AS day",
        "donor_name AS name",
        "CAST(amount AS INT64) AS yen",
        "CAST(settlement_amount AS INT64) AS net",
        "message_text AS text",
        "status",
        "platform",
    ],
    where="donated_at IS NOT NULL\n"
          "    AND DATE(donated_at, 'Asia/Tokyo') BETWEEN @d0 AND @d1",
)

SQL = f"""
SELECT
  donation_id,
  ANY_VALUE(day) AS day,
  ANY_VALUE(name) AS name,
  ANY_VALUE(yen) AS yen,
  ANY_VALUE(net) AS net,
  ANY_VALUE(text) AS text,
  ANY_VALUE(status) AS status,
  ANY_VALUE(platform) AS platform
FROM (
{_ROWS}
)
GROUP BY donation_id
ORDER BY day, donation_id
"""

#: 本文の上限。長い本文で注記が溢れると、封が10行で打ち切られて
#: **ほどけなくなる**（`_seal` の冒頭）。切ったことは `cut` で分かるようにする
MAX_TEXT = 300


def bq(d0: str, d1: str) -> list:
    """BigQuery を1本引く。"""
    from google.cloud import bigquery

    client = bigquery.Client(project=BQ_PROJECT_ID)
    cfg = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("d0", "DATE", d0),
        bigquery.ScalarQueryParameter("d1", "DATE", d1),
    ])
    rows = [dict(r) for r in client.query(
        SQL.format(p=BQ_PROJECT_ID, d=BQ_DATASET), cfg).result()]
    client.close()
    return rows


def load_roster(client) -> Roster:
    """図鑑を1回だけ全件読む。**名寄せは月末と同じものを通す。**"""
    out = []
    for doc in client.collection("islandCharacter").stream():
        v = doc.to_dict() or {}
        out.append({
            "id": doc.id,
            "channelId": v.get("channelId") or "",
            "channelName": v.get("channelName") or "",
            "lookupKeys": v.get("lookupKeys") or [],
        })
    return Roster(out)


def main() -> None:
    a = args()
    d0, d1, pubkey = need(a, "from", "to", "pubkey")
    log.info("期間: %s 〜 %s（日本時間）", d0, d1)

    roster = load_roster(readonly(db()))

    rows, cut = [], 0
    for r in bq(d0, d1):
        name = str(r["name"] or "")
        char = roster.by_alias(name)
        text = str(r["text"] or "")
        if len(text) > MAX_TEXT:
            text, cut = text[:MAX_TEXT], cut + 1
        rows.append({
            "day": r["day"],
            "yen": int(r["yen"] or 0),
            "net": None if r["net"] is None else int(r["net"]),
            "text": text,
            "status": str(r["status"] or ""),
            "platform": str(r["platform"] or ""),
            "char": char or "",
            "display": roster.by_id.get(char, {}).get("channelName") or name,
        })

    # **件数と、本文の在る件数だけログに出す。** 名前も本文も額も出さない
    log.info("%d 件（本文つき %d 件・図鑑に当たった %d 件・長すぎて切った %d 件）",
             len(rows), sum(1 for r in rows if r["text"]),
             sum(1 for r in rows if r["char"]), cut)

    plain = gzip.compress(json.dumps(
        {"from": d0, "to": d1, "rows": rows}, ensure_ascii=False).encode())
    # **平文はここまで。** 以降、ログにも注記にも暗号文しか出ない
    blob = pack(seal(plain, pubkey))
    lines = chunks(blob)
    log.info("封を %d 行で出します（封 %d 字）", len(lines), len(blob))
    if len(lines) > 10:
        # 注記は1つの step で10件までしか見せない。**足りないまま返さない**
        log.error("注記は10行までしか読めません。期間を分けて押してください")
    for line in lines:
        notice(line)


main()
