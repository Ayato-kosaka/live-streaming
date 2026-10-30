"""月末配信の投げ銭ランキングを、本番の値で作る。

    script: monthly_tips_run
    args:   {"from": "2026-08-31", "to": "2026-09-24"}

**1バイトも書かない。** BigQuery と Firestore を読んで、数えて、出すだけ。

## 出す額は貢献額（スパチャ ÷ 2 + Doneru）

式は `python/fund_box.py` の `viewer_yen()` ひとつ。**ここで割り算を
書かない。** 決め方は `python/monthly_tips.py` の冒頭。

## 名寄せは図鑑（islandCharacter）

スパチャは `channelId` → `islandCharacter.channelId`、
Doneru は**名乗り → `lookupKeys`**。どちらもちょうど1人のときだけ寄せる。

Doneru を どねID（`islandDonors`）から引かないのは、あやとの指示
（2026-09-25）:

> Ayato arigato って人は匿名でわざとわからない名前使ってるので、
> 無理やりドネIDで突合するのではなく、名前で突合して合わないなら無視で良い

寄らなかった人は**消さない。その人ひとりで1行。**

## ログに何を出すか（**公開のログ**）

出すのは**授賞式の画面にそのまま出るもの**だけ——順位・呼び名・貢献額・
図鑑のID（絵のURLに入っている値）。このページは今日、誰でも読める場所に
出る。**出していないもの:**

- **実額**（スパチャの生の円、Doneru の生の円）。あやと 2026-09-26
  「実額は視聴者には一切見せない」
- **呼び名（`lookupKeys`）と、寄った人の Doneru の名乗り。**
  図鑑の口は絵と絵文字しか返さない決め（`functions/src/islandCharacter.ts`）
- **チャンネルID・どねID**

寄らなかった Doneru の名乗りは、**画面にその字で出る**ので出す。

## 円以外のスパチャは、**円に直した額で足す**（#951）

あやとが 2026-10-18 に決めた——「レートの取得が無料でできるなら、
Firestore に入れるときにレートを取って日本の金額を入れる。
その金額に ÷2 すれば整合性が取れる」。

**直すのは取り込みのとき1回きり**（`python/island_tips.py` の `yen_of`）。
ここは台帳（`islandTips`）に入っている `amountJpy` を読むだけで、
**集計のたびに引き直さない。** 引き直すと、同じ投げ銭が焼いた日によって
別の額になり、図鑑（`python/build_residents.py`）と順位が割れる。
取り出しは `fx_rate.row_yen()` 1本で、**図鑑も同じ1本を通す。**

`÷2` は `rank()` の `viewer_yen()` が**円に直したあとの合計**にかける。

## 直っていない行は、足さずに名指しする

対応していない通貨（TWD）・口が落ちた日・まだ埋め直していない日は
`amountJpy` が入っていない。**0 にしない。** そのぶんはランキングに入って
いないので、**誰が抜けているのかを1件ずつ出す。**

**出すもの**: 日付・通貨コード・チャンネルIDの**指紋**（`mask`）・理由・
その人が同じ期間に**円のスパチャも出しているか**。
**出さないもの**: 元の表記（`CA$2.79`）。あれは実額なので、
公開の場には1文字も出さない（`detail_lines` が手元でだけ出す）。
"""

import json
import os
import sys

from _fs import args, db, log, need, readonly
from _seal import chunks

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import fx_rate  # noqa: E402
from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402
from logsafe import detail_lines, mask  # noqa: E402
from monthly_tips import (  # noqa: E402
    Roster, fx_detail, fx_stuck, fx_superchats, merge, rank, total,
)

# 台帳。**円に直した額（`amountJpy`）が入っているのはここだけ**
TIPS = "islandTips"

# **円の行だけ拾う。** 外貨が数件混ざっていて、豚も GAS も円しか
# 足していない（`python/fund_box.py` の `bq_superchats`）。ここで拾うと
# ランキングの合計と貯金箱がずれる
SQL_SC = """
SELECT
  author_channel_id AS cid,
  ANY_VALUE(author_name) AS handle,
  SUM(SAFE_CAST(REGEXP_REPLACE(purchase_amount_text, r'[^0-9]', '') AS INT64)) AS yen,
  COUNT(*) AS n
FROM `{p}.{d}.chat_messages`
WHERE event_type = 'PAID'
  AND author_channel_id IS NOT NULL
  AND STARTS_WITH(purchase_amount_text, '¥')
  AND DATE(published_at, 'Asia/Tokyo') BETWEEN @d0 AND @d1
GROUP BY cid
"""

# 同じ寄付が2行入っていることがあるので `donation_id` で1つにしてから足す
SQL_DN = """
SELECT donor_name AS name, SUM(yen) AS yen, COUNT(*) AS n
FROM (
  SELECT donation_id,
         ANY_VALUE(donor_name) AS donor_name,
         ANY_VALUE(CAST(amount AS INT64)) AS yen
  FROM `{p}.{d}.doneru_donations`
  WHERE donated_at IS NOT NULL
    AND DATE(donated_at, 'Asia/Tokyo') BETWEEN @d0 AND @d1
  GROUP BY donation_id
)
GROUP BY name
"""

# 円で始まらないスパチャを**1件ずつ**引く（`SQL_SC` は円しか拾わない）。
# **円に直した額は台帳のほうから当てる**ので、ここで引くのは
# 「誰が・いつ・どの表記で」と、**台帳に当てるための鍵**だけ。
#
# 鍵は `video_id` と `event_id`。台帳の `sourceEventId`（`yt:{動画}:{イベント}`）
# がこの2つから決まる（`python/monthly_tips.py` の `ledger_key()`）。
# **日付とチャンネルIDで当てない**——同じ人が同じ日に2回投げた回に、
# どちらが当たるか決まらない。
#
# **`author_channel_id IS NOT NULL` で絞らない。** 絞ると、誰だか読めない
# 行が件数からも消えて、「外貨は無かった」に化ける（§15）。
SQL_FX = """
SELECT
  author_channel_id AS cid,
  author_name AS handle,
  video_id,
  event_id,
  FORMAT_DATE('%Y-%m-%d', DATE(published_at, 'Asia/Tokyo')) AS day,
  purchase_amount_text AS amt
FROM `{p}.{d}.chat_messages`
WHERE event_type = 'PAID'
  AND NOT STARTS_WITH(purchase_amount_text, '¥')
  AND DATE(published_at, 'Asia/Tokyo') BETWEEN @d0 AND @d1
"""


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


def ledger(client, d0: str, d1: str) -> list:
    """その期間の台帳（`islandTips`）を読む。**読むだけ。**

    **範囲の下だけ Firestore に投げる**（`day` 1本の並べ替えなので、
    自動でできる索引だけで引ける）。上は手元で切る——`build_residents.py` の
    `fetch_tips` と同じ引き方。

    Args:
        client: 読み専用のクライアント
        d0: 始まりの日（この日を含む）
        d1: 終わりの日（この日を含む）

    Returns:
        1行ずつの辞書。**円に直した額（`amountJpy`）はここにしか無い**
    """
    out = []
    for doc in client.collection(TIPS).where("day", ">=", d0).stream():
        v = doc.to_dict() or {}
        if d0 <= str(v.get("day") or "") <= d1:
            out.append(v)
    return out


def roster(client) -> Roster:
    """図鑑を1回だけ全件読む。**索引を作らない**（#168）。"""
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
    d0, d1 = need(a, "from", "to")
    log.info("期間: %s 〜 %s（日本時間）", d0, d1)

    sc = [{"channelId": r["cid"], "handle": r["handle"] or "",
           "yen": int(r["yen"] or 0)} for r in bq(SQL_SC, d0, d1)]
    dn = [{"name": r["name"] or "", "yen": int(r["yen"] or 0)}
          for r in bq(SQL_DN, d0, d1)]

    # **Firestore は1回だけ開く。** 台帳（円に直した額）と図鑑（名寄せ）を
    # 同じ読み専用のクライアントから引く
    ro = readonly(db())
    fx = fx_detail(bq(SQL_FX, d0, d1), sc, ledger(ro, d0, d1))
    stuck = fx_stuck(fx)
    add = fx_superchats(fx)
    # **円に直せたぶんを、円のスパチャと同じ土俵に足す。**
    # ÷2 は `rank()` の `viewer_yen()` が合計にかける（1件ずつ半分にしない）
    sc += add
    log.info("スパチャ %d 人 / Doneru の名乗り %d 通り / 円以外 %d件"
             "（円に直して足した %d件 / 直っていない %d件）",
             len(sc) - len(add), len(dn), len(fx), len(add), len(stuck))

    # **直っていないぶんを、名指しで出す。** 件数だけだと、月末に
    # ページを作る人が「誰が抜けているか」を自力で探すことになる（#951）。
    #
    # 出すのは**日付・通貨・指紋・理由・円のスパチャも在るか**まで。
    # チャンネルIDは公開の場では指紋になり（`python/logsafe.py` の `mask`）、
    # **元の表記（実額）は公開の場に1文字も出さない**
    # （`docs/island-money.md` 2章。`detail_lines` が手元でだけ出す）。
    if stuck:
        log.warning("--- 円に直せていないスパチャ "
                    "（**ランキングに入っていない**。足りないぶんがある） ---")
        for r in stuck:
            log.warning("  %s  %-4s  %s  %s  %s", r["day"], r["currency"],
                        mask(r["cid"]), fx_rate.WHY.get(r["why"], r["why"]),
                        "円のスパチャもある（順位には載る。外貨のぶんが足りない）"
                        if r["yen_too"] else
                        "**この期間は外貨だけ**（順位に1行も無い）")
        log.warning("  直すには python/admin/fx_backfill.py を "
                    "{\"apply\": true} で流してから、ここをもう一度回す")
        for line in detail_lines([(r["day"], r["cid"], r["amt"]) for r in stuck]):
            log.info("%s", line)

    r = roster(ro)
    log.info("図鑑 %d 人（チャンネルIDの入っている人 %d）",
             len(r.by_id), sum(1 for c in r.by_id.values() if c["channelId"]))

    rows = rank(merge(sc, dn, r))
    hit = sum(1 for x in rows if x["char"])
    log.info("ランキング %d 行（図鑑に当たった %d / 当たらなかった %d）",
             len(rows), hit, len(rows) - hit)

    # **ここから下が画面に出るもの。** 実額は1つも出さない
    log.info("--- 貢献額（スパチャ ÷ 2 + Doneru。実額ではない） ---")
    for x in rows:
        log.info("%2d位 %-28s %7d円  %s",
                 x["rank"], x["display"], x["yen"], x["char"] or "（図鑑なし）")
    log.info("合計 %d円 / %d人", total(rows), len(rows))

    # 焼き込みに貼る形。**`data.js` にそのまま入れる**
    out = json.dumps(
        {"period": f"{d0}〜{d1}", "total": total(rows),
         "rows": [{"handle": x["handle"] or None, "display": x["display"],
                   "yen": x["yen"], "rank": x["rank"], "icon": x["char"]}
                  for x in rows]},
        ensure_ascii=False)
    print("JSON=" + out)

    # **注記にも同じものを出す。** ログの本体は Azure Blob から配られるので、
    # 作業箱の gh では読めない（`refusing a redirect to results-receiver…`）。
    # 注記だけは `check-runs/{id}/annotations` から読めるので、月末に
    # ページを作る担当が、ここを押して結果を持ち帰れる。
    #
    # **封はしない。** ここに出るのは授賞式の画面にそのまま出るもの
    # （順位・呼び名・貢献額・図鑑のID）だけで、実額もチャンネルIDも
    # 入っていない（上の「ログに何を出すか」）。封が要るのは
    # オーナーの表の実額のほうで、それは `tips_sealed` の役。
    for line in chunks(out):
        print("::notice::" + line)


main()
