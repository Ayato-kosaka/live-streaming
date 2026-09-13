"""その日 Doneru で投げ銭してくれた人を、名簿に足す。

`python/nordic_supporters.py` の Doneru 版。あちらは YouTube のスパチャを
BigQuery から取るが、**Doneru はチャンネルIDを持っていない**（あるのは
名前と どねID＝`viewer_pk` だけ）。名前で突き合わせると別の人にカードを
渡す事故が起きるので、`islandDonors` の対応表を通す。

## 表に無い どねID が来たら、赤くして知らせる

**それが新規の人。** その人にカードを渡すには、あやとが YouTube の
アカウントを紐付けないといけない。黙って落とすと、投げ銭してくれたのに
何ももらえない人が静かに増える。

- 見つけたら `islandDonors/{どねID}` に `state: "new"` で置く（**取りこぼさない**）
- そのうえで**終了コード 1 で終わる**。Actions の失敗通知メールで気づく

**紐付いていないだけ（`unlinked`）では落とさない。** あれは
「表にはあるが YouTube のアカウントが分からない」人で、あやとはもう
知っている。落とすと、直しようのないもので毎日赤くなる。

`new` が1人でも残っているあいだは、毎日赤いままにする。1回のメールを
見逃すと、そのまま忘れるので（#168 と同じ考え方）。

## 「初めて来た日」は、**こちらが見つけた日ではない**

`firstSeenAt` には、前は `now`（ジョブが走った時刻）を入れていた。
毎晩 22:41 UTC ＝ **翌朝 07:41 JST** に走るので、9月10日に投げ銭して
くれた人の札が、必ず「9月11日に来た」になっていた。
**その人が来た日ではなく、こちらが見つけた日を出していた。**

いまは `doneru_donations` から**全期間の `MIN(donated_at)`** を引いて入れる。
窓（`--days 3`）の中の最小値では足りない。表が作り直されたあと（#186）に
走ると、窓の中に「その人の2回目」しか無いことがあるため。

**引くのは、表に無い どねID が見つかった晩だけ。** 新規はめったに出ないので、
ふだんの晩は BigQuery が1本も増えない。

## 入金の段階では絞らない

`status` は「振込完了」「振込待ち」で、**あやとへの入金がどこまで進んだか**
であって、投げ銭が成立したかどうかではない。待ちのぶんを外すと、
その日出してくれた人が数日あとから現れることになる。

## ログに名前を出さない

**このリポジトリは公開で、Actions のログも誰でも読める。**
1人ずつの明細（チャンネルID・ハンドル・どねID・表示名）は
`python/logsafe.py` を通して、公開の場では出さない。
残すのは件数と日付と、あやとが次にどこを触ればよいかだけ。

## 終了コード

| | 意味 |
| --- | --- |
| 0 | ぜんぶ紐付いている |
| 1 | **表に無い どねID がいる。** あやとに紐付けてほしい |
| 2 | **元データ（doneru_donations）が読めない。** 対応表の問題ではない |

1 と 2 を分けているのは、2 のときに対応表を直しにいっても直すものが
無いから。寄付の表は作り直されることがあり（#186）、その途中は消えている。

実行:
  python python/doneru_supporters.py --days 3
  python python/doneru_supporters.py --day 2026-09-06 --dry-run
"""

import argparse
import logging
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402
from logsafe import detail_lines  # noqa: E402

# **google-cloud を import 文で読まない。** 下の素の関数
# （`earliest_by_pk` / `plan_first_seen` / `jst_date`）は BigQuery も
# Firestore も要らないので、偽のデータで動かす確かめ
# （`doneru_supporters_selftest.py`）が資格情報も依存も無しに回せるように
# しておく。`python/admin/_fs.py` の `db()` と同じ考え方。

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# 配信日の切り方は YouTube 側（nordic_supporters.py）と揃える。
# **9時間引く＝日本時間の18時が境目**。ここを変えると、同じ日の投げ銭が
# 2日に割れる。
#
# **これは古い決め。台帳（islandTips）は日本時間の0時で切る**（#201・#202）。
# ここを合わせに行かないのは、nordicDays がもう読まれていないから
# （nordic_supporters.py の頭に理由がある）。このファイルに残っている
# 用事は「表に無い どねID を見つけて赤くする」ほうだけ。
#
# **`firstSeenAt` はこの切り方に合わせない。** あちらは時刻そのもの（ISO）を
# 入れて、日付にするのは画面の仕事（`site/components/me/DonorLinks.tsx`）。
# 18時を境目にした日付を入れると、夕方の投げ銭が翌日の札になる。
SQL = f"""
SELECT
  FORMAT_DATE(
    '%Y-%m-%d',
    DATE(TIMESTAMP_SUB(donated_at, INTERVAL 9 HOUR))
  ) AS day,
  viewer_pk AS pk,
  ANY_VALUE(donor_name) AS name
FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.doneru_donations`
WHERE viewer_pk IS NOT NULL
  AND DATE(TIMESTAMP_SUB(donated_at, INTERVAL 9 HOUR))
      BETWEEN @d0 AND @d1
GROUP BY day, pk
ORDER BY day
"""

# **日付で絞らない。** 窓の中の最小値ではなく、全期間のいちばん古い1回が
# 要る。絞ると、表が作り直されたあと（#186）に走ったとき「その人の2回目」を
# 初回として焼き付けてしまう。
FIRST_SQL = f"""
SELECT
  viewer_pk       AS pk,
  MIN(donated_at) AS first_at
FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.doneru_donations`
WHERE viewer_pk IN UNNEST(@pks)
GROUP BY pk
"""


def fetch(d0: str, d1: str) -> dict:
    """その期間の、日ごとの「投げ銭してくれた どねID」。

    Args:
        d0: 始まりの日（YYYY-MM-DD）
        d1: 終わりの日（YYYY-MM-DD、この日を含む）

    Returns:
        日付 -> [{"pk": ..., "name": ...}, ...]
    """
    from google.cloud import bigquery

    client = bigquery.Client(project=BQ_PROJECT_ID)
    cfg = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("d0", "DATE", d0),
            bigquery.ScalarQueryParameter("d1", "DATE", d1),
        ]
    )
    out: dict = {}
    for row in client.query(SQL, job_config=cfg).result():
        out.setdefault(row["day"], []).append(
            {"pk": str(row["pk"]), "name": row["name"] or ""}
        )
    client.close()
    return out


def fetch_first(pks: list) -> list:
    """その どねID たちの、**全期間でいちばん古い投げ銭**。

    **新規の どねID が見つかった晩しか呼ばない。** 新規はめったに出ないので、
    ふだんの晩は BigQuery を1本も増やさない。

    Args:
        pks: 引きたい どねID

    Returns:
        [{"pk": ..., "at": ISO文字列}, ...]。
        `doneru_donations` に1行も無い どねID は**そもそも返ってこない**
    """
    from google.cloud import bigquery

    client = bigquery.Client(project=BQ_PROJECT_ID)
    cfg = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ArrayQueryParameter("pks", "STRING", list(pks)),
        ]
    )
    out = []
    for row in client.query(FIRST_SQL, job_config=cfg).result():
        at = row["first_at"]
        if at is None:
            continue
        out.append({"pk": str(row["pk"]), "at": at.isoformat()})
    client.close()
    return out


def earliest_by_pk(donations: list) -> dict:
    """どねID ごとの、いちばん古い投げ銭の時刻。

    SQL の側でも `MIN` を取っているが、**「全期間のいちばん古い1回」という
    決めをこの関数1つで言い切れるようにする**ためにここでも最小を取る。
    引き方（SQL）を差し替えても、決めは動かない。

    時刻は BigQuery の TIMESTAMP から起こした ISO 文字列で、どれも UTC。
    桁がそろっているので、文字のまま比べて大小が合う。

    Args:
        donations: [{"pk": ..., "at": ISO文字列}, ...]

    Returns:
        どねID -> いちばん古い時刻（ISO 文字列）
    """
    out: dict = {}
    for d in donations:
        pk, at = d.get("pk"), d.get("at")
        if not pk or not at:
            continue
        if pk not in out or at < out[pk]:
            out[pk] = at
    return out


def plan_first_seen(pks: list, donations: list, table: dict) -> dict:
    """**どの どねID に、どの時刻を `firstSeenAt` として入れるか**を決める。

    ここが毎晩の決め。3つとも「入れない」側に倒してある。
    **分からないものに、こちらが見つけた時刻を入れない**（それが元の不具合）。

    - `doneru_donations` に1行も無い どねID は**触らない。**
      種（`python/donors_seed.json`）から入った人や、表が作り直されて
      消えた人がいる。直せないものを「直した」ことにしない
    - すでに `firstSeenAt` を持っている行は**上書きしない。**
      入っているのは画面や前の晩が置いた値で、こちらが新しいわけではない
    - 引けなかった どねID は、その欄を**空けたまま**置く。
      `now` に落とすと、消えた不具合がそのまま戻る

    Args:
        pks: 今回見つけた、表に無い どねID
        donations: `fetch_first()` が返したもの（全期間ぶん）
        table: いまの `islandDonors`（どねID -> 書類）

    Returns:
        どねID -> 入れる時刻（ISO 文字列）。**入れないものは入っていない**
    """
    firsts = earliest_by_pk(donations)
    out: dict = {}
    for pk in pks:
        if (table.get(pk) or {}).get("firstSeenAt"):
            continue
        at = firsts.get(pk)
        if not at:
            continue
        out[pk] = at
    return out


def jst_date(iso: str) -> str:
    """ISO の時刻を、**日本時間の日付**に切る。

    台帳（`islandTips`）と画面の札はどちらも日本時間の0時で切る
    （#201・#202）。このファイルの上にある `SQL` の「9時間引く」は
    `nordicDays` 用の古い決めなので、ここは合わせない。

    日本は夏時間を持たないので、足し算でよい。

    Args:
        iso: 「2026-09-10T13:05:00+00:00」のような文字列

    Returns:
        YYYY-MM-DD（日本時間）
    """
    t = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return (t.astimezone(timezone.utc) + timedelta(hours=9)).strftime("%Y-%m-%d")


def main() -> int:
    """エントリポイント。新規の人がいたら 1 を返す。"""
    from google.cloud import firestore

    from nordic_supporters import merge

    ap = argparse.ArgumentParser()
    ap.add_argument("--day", help="この日だけ（YYYY-MM-DD）")
    ap.add_argument("--days", type=int, default=3, help="直近この日数ぶん")
    ap.add_argument("--dry-run", action="store_true", help="書かずに出すだけ")
    a = ap.parse_args()

    if a.day:
        d0 = d1 = a.day
    else:
        today = datetime.now(timezone.utc).date()
        d1 = today.isoformat()
        d0 = (today - timedelta(days=max(1, a.days) - 1)).isoformat()

    db = firestore.Client(project=BQ_PROJECT_ID)
    table = {d.id: (d.to_dict() or {}) for d in db.collection("islandDonors").stream()}
    logger.info("対応表: %d件", len(table))

    try:
        found = fetch(d0, d1)
    except Exception as e:
        # **「取れなかった」を「新規の人がいる」と言わない。**
        # 寄付の表は作り直されることがあり（#186）、その途中は消えている。
        # そこで「紐付け待ちが3件あります」と出すと、あやとは
        # 対応表を直しにいって、直すものが無くて困る。
        #
        # 終了コードを分ける。1 は「紐付けてほしい」、2 は「元データが読めない」。
        # Actions の失敗通知メールで、どちらの用事か分かるようにする。
        logger.error("寄付の表が読めませんでした: %s", str(e)[:200])
        logger.error("")
        logger.error("doneru_donations が作り直しの途中か、権限が変わったかです。")
        logger.error("対応表（islandDonors）の問題ではないので、そちらは触らないこと。")
        return 2

    now = datetime.now(timezone.utc).isoformat()

    # **書く前に、新規の どねID をぜんぶ洗い出す。** 1人見つけるたびに
    # BigQuery を叩くと、新規が5人出た晩に5本走る。まとめて1本にする。
    unknown = []
    for _day, rows in sorted(found.items()):
        for r in rows:
            if r["pk"] not in table and r["pk"] not in unknown:
                unknown.append(r["pk"])

    first_at: dict = {}
    if unknown:
        try:
            first_at = plan_first_seen(unknown, fetch_first(unknown), table)
        except Exception as e:
            # 引けなくても取り込みは止めない。**欄を空けたまま置く。**
            # `now` に落とすと「こちらが見つけた日」がまた焼き付く。
            # あとから `python/admin/donors_first_seen.py` で埋められる。
            logger.error("最初の投げ銭の時刻が引けませんでした: %s", str(e)[:200])
        logger.info("新規 %d件のうち、最初の投げ銭が引けたのは %d件",
                    len(unknown), len(first_at))

    fresh = []

    for day, rows in sorted(found.items()):
        people, skipped = [], 0
        for r in rows:
            known = table.get(r["pk"])
            if known is None:
                fresh.append(r)
                if not a.dry_run:
                    doc = {
                        "viewerPk": r["pk"],
                        "handle": None,
                        "label": r["name"],
                        "channelId": None,
                        "state": "new",
                        "updatedAt": now,
                    }
                    # **引けたときだけ入れる。** 空けておけば、あとから
                    # 正しい時刻を入れられる。嘘の日付は上書きされない
                    if r["pk"] in first_at:
                        doc["firstSeenAt"] = first_at[r["pk"]]
                    db.collection("islandDonors").document(r["pk"]).set(
                        doc, merge=True
                    )
                continue
            if known.get("isOwner"):
                # あやと本人。自分のカードを自分に配らない
                continue
            cid = known.get("channelId")
            if not cid:
                skipped += 1
                continue
            people.append({"channelId": cid, "name": known.get("handle") or r["name"]})

        新規 = len([x for x in rows if x["pk"] not in table])
        logger.info("%s: Doneru %d人（渡せる %d / 紐付け待ち %d / 新規 %d）",
                    day, len(rows), len(people), skipped, 新規)
        # 1人ずつの明細は、公開の場では1行も出さない（`python/logsafe.py`）
        for line in detail_lines([(p["channelId"], p["name"]) for p in people]):
            logger.info("%s", line)
        if a.dry_run or not people:
            continue
        ref = db.collection("nordicDays").document(day)
        cur = ref.get()
        old = (cur.to_dict() or {}).get("people", []) if cur.exists else []
        after = merge(old, people)
        ref.set({"day": day, "people": after, "updatedAt": now}, merge=True)
        logger.info("  → 名簿は %d人になりました", len(after))

    # 過去に見つけて、まだ紐付いていない人も数える。1回の通知を見逃すと
    # そのまま忘れるので、残っているあいだは毎日赤くする
    waiting = [k for k, v in table.items() if v.get("state") == "new"]
    for r in fresh:
        if r["pk"] not in waiting:
            waiting.append(r["pk"])

    if a.dry_run:
        logger.info("--dry-run なので書いていません")

    if waiting:
        # **誰なのかは出さない。** 出すのは件数と、次にどこを触るか。
        # 誰かは `/me` の画面に出ているので、ログに要らない
        logger.error("")
        logger.error("紐付け待ちの どねID が %d件あります:", len(waiting))
        pairs = []
        for pk in waiting:
            label = (table.get(pk) or {}).get("label")
            if label is None:
                label = next((r["name"] for r in fresh if r["pk"] == pk), "")
            pairs.append((pk, label))
        for line in detail_lines(pairs):
            logger.error("%s", line)
        logger.error("")
        logger.error("/me の「投げ銭を、YouTube につなぐ」から紐付けてください。")
        return 1

    logger.info("紐付け待ちはありません")
    return 0


if __name__ == "__main__":
    sys.exit(main())
