"""期間を指定して、投げ銭ランキングを**実額つきで**作り、**封をして**出す。

    script: tips_sealed
    args:   {"from": "2025-10-11", "to": "2026-10-10", "pubkey": "<SPKI DER の base64>"}

**1バイトも書かない。** BigQuery と Firestore を読んで、数えて、封をして出すだけ。

## なぜ封をするのか

オーナーが見る表には**実額と名前**が要る（`docs/island-money.md` 2章で
「実額はアドミンから見れて良い」）。ところが値を作れるのは Actions だけで、
**Actions のログは公開**。`monthly_tips_run` は画面に出る貢献額しか出さない
ので、実額の表は作れない。

だから、手元で作った鍵の**公開鍵だけ**を渡して、結果をそれで包んで出す。
ログに載るのは暗号文だけで、ほどける秘密鍵はこの実行のどこにも来ない。
鍵は使い捨て（1回作って、ほどいたら捨てる）。

包み方は openssl の CLI（ランナーに最初から入っている）:
AES-256-CBC（pbkdf2）で中身を包み、その合言葉を RSA-OAEP で包む。

## 出すもの（封の中）

1人1行。名寄せは月末と同じ `monthly_tips.merge()`（図鑑が正）。

| 欄 | 中身 |
| --- | --- |
| `sc` | スパチャの実額（円だけ） |
| `dn` | Doneru の実額（こちらに届いた額） |
| `got` | 受け取り側 = `viewer_yen(sc, dn)`（豚の貯金箱と同じ式） |
| `paid` | 払った側 = `sc + dn × 1.2`（Doneru は送る人が手数料を上乗せして払う） |

**ログに出すのは件数と暗号文だけ。** 名前も額も平文では1つも出ない。

## ほどくとき

ログの `SEALED=` の行は、**先頭の `{` と末尾の `}` が `***` に伏せられて**
出てくる（どこかの伏せ字に1文字の `{` `}` が混ざっている。2026-10-11 に実測）。
`***` を戻してから JSON として読む。中の base64 は伏せられていない。
"""

import base64
import json
import os
import subprocess
import sys
import tempfile

from _fs import args, db, log, need, readonly

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402
from doneru.dedup import dedup_sql  # noqa: E402
from fund_box import viewer_yen  # noqa: E402
from monthly_tips import Roster, merge  # noqa: E402

# 問い合わせは `monthly_tips_run.py` と同じもの。あちらは import すると
# main() が走るので写してある。**片方を直したらもう片方も直す。**
SQL_SC = """
SELECT
  author_channel_id AS cid,
  ANY_VALUE(author_name) AS handle,
  SUM(SAFE_CAST(REGEXP_REPLACE(purchase_amount_text, r'[^0-9]', '') AS INT64)) AS yen
FROM `{p}.{d}.chat_messages`
WHERE event_type = 'PAID'
  AND author_channel_id IS NOT NULL
  AND STARTS_WITH(purchase_amount_text, '¥')
  AND DATE(published_at, 'Asia/Tokyo') BETWEEN @d0 AND @d1
GROUP BY cid
"""

# **寄せる口を通してから足す。** `donation_id` だけでは1件に寄らない——
# 主キーに精算状態が入っているので、振り込まれた寄付は**別の鍵で生え直して
# 2行になる**（`python/doneru/dedup.py`。#1067）
_DN_ROWS = dedup_sql(
    "{p}", "{d}",
    columns=["donation_id", "donor_name", "CAST(amount AS INT64) AS yen"],
    where="donated_at IS NOT NULL\n"
          "    AND DATE(donated_at, 'Asia/Tokyo') BETWEEN @d0 AND @d1",
)

SQL_DN = f"""
SELECT donor_name AS name, SUM(yen) AS yen
FROM (
  SELECT donation_id,
         ANY_VALUE(donor_name) AS donor_name,
         ANY_VALUE(yen) AS yen
  FROM (
{_DN_ROWS}
  )
  GROUP BY donation_id
)
GROUP BY name
"""

# 払った側で Doneru に掛ける率。整数で持つ（12/10）。浮動小数点を入れない
PAYER_NUM, PAYER_DEN = 12, 10


def bq(sql: str, d0: str, d1: str) -> list:
    """BigQuery を1本引く。"""
    from google.cloud import bigquery

    client = bigquery.Client(project=BQ_PROJECT_ID)
    cfg = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("d0", "DATE", d0),
        bigquery.ScalarQueryParameter("d1", "DATE", d1),
    ])
    rows = [dict(r) for r in client.query(
        sql.format(p=BQ_PROJECT_ID, d=BQ_DATASET), cfg).result()]
    client.close()
    return rows


def load_roster(client):
    """図鑑を1回だけ全件読む。絵文字は表に添えるので一緒に持つ。"""
    out, emoji = [], {}
    for doc in client.collection("islandCharacter").stream():
        v = doc.to_dict() or {}
        out.append({
            "id": doc.id,
            "channelId": v.get("channelId") or "",
            "channelName": v.get("channelName") or "",
            "lookupKeys": v.get("lookupKeys") or [],
        })
        emoji[doc.id] = v.get("emoji") or ""
    return Roster(out), emoji


def seal(plain: bytes, pubkey_b64: str) -> dict:
    """公開鍵で包む。**秘密鍵はここに無い。**"""
    with tempfile.TemporaryDirectory() as t:
        pub = os.path.join(t, "pub.der")
        with open(pub, "wb") as f:
            f.write(base64.b64decode(pubkey_b64))
        secret = os.urandom(32).hex().encode()
        pw = os.path.join(t, "pw")
        with open(pw, "wb") as f:
            f.write(secret)
        body = subprocess.run(
            ["openssl", "enc", "-aes-256-cbc", "-pbkdf2", "-salt",
             "-pass", "file:" + pw],
            input=plain, capture_output=True, check=True,
        ).stdout
        key = subprocess.run(
            ["openssl", "pkeyutl", "-encrypt", "-pubin", "-keyform", "DER",
             "-inkey", pub, "-pkeyopt", "rsa_padding_mode:oaep",
             "-pkeyopt", "rsa_oaep_md:sha256"],
            input=secret, capture_output=True, check=True,
        ).stdout
    return {"key": base64.b64encode(key).decode(),
            "body": base64.b64encode(body).decode()}


def main() -> None:
    a = args()
    d0, d1, pubkey = need(a, "from", "to", "pubkey")
    log.info("期間: %s 〜 %s（日本時間）", d0, d1)

    sc = [{"channelId": r["cid"], "handle": r["handle"] or "",
           "yen": int(r["yen"] or 0)} for r in bq(SQL_SC, d0, d1)]
    dn = [{"name": r["name"] or "", "yen": int(r["yen"] or 0)}
          for r in bq(SQL_DN, d0, d1)]
    roster, emoji = load_roster(readonly(db()))

    rows = []
    for r in merge(sc, dn, roster):
        s, d = int(r["sc"]), int(r["dn"])
        if s + d <= 0:
            continue
        rows.append({
            "display": r["display"], "handle": r["handle"] or "",
            "emoji": emoji.get(r["char"], "") if r["char"] else "",
            "sc": s, "dn": d,
            "got": viewer_yen(s, d),
            "paid": s + d * PAYER_NUM // PAYER_DEN,
        })
    log.info("スパチャ %d 人 / Doneru の名乗り %d 通り → %d 行",
             len(sc), len(dn), len(rows))

    plain = json.dumps({"from": d0, "to": d1, "rows": rows},
                       ensure_ascii=False).encode()
    # **平文はここまで。** ログに出るのは暗号文だけ
    print("SEALED=" + json.dumps(seal(plain, pubkey)))


main()
