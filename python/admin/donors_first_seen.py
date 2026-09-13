"""`islandDonors.firstSeenAt` を、**その人が初めて投げ銭した時刻**に直す。

## 何がずれていたか

毎晩の取り込み（`python/doneru_supporters.py`）は、表に無い どねID を
見つけたとき `firstSeenAt` に **`now`（ジョブが走った時刻）** を入れていた。
ジョブは 22:41 UTC ＝ **翌朝 07:41 JST** に走るので、9月10日に投げ銭して
くれた人の札は必ず「9月11日に来た」になる。
**その人が来た日ではなく、こちらが見つけた日**を `/me` に出していた。

毎晩のほうは直したが、**すでに入っている行はそのまま**なので、ここで直す。
一度きりの用事。

## 直せないものは直さない

**`doneru_donations` に1行も無い どねID は触らない。** 種
（`python/donors_seed.json`）から入った人や、表が作り直されて（#186）
消えた人がいる。引けない相手に「たぶんこの日」を入れると、
**嘘が1つ増えるだけで、しかも直った顔をする。**

## 全期間の最初を引く

窓の中の最小値ではなく `MIN(donated_at)`（全期間）。引くところは
毎晩のほうと同じ関数（`doneru_supporters.fetch_first`）を呼ぶ。
**「初めて」の決めを2か所に書かない。**

## ログに どねID を出さない

**このリポジトリは公開で、Actions のログも誰でも読める。**
出すのは件数と、ずれた日数の内訳だけ。どねID も名前も1文字も出さない。

## 使いかた

ワークフロー「管理スクリプトを実行」から:

    script: donors_first_seen
    args:   {}                … 空回し。**1バイトも書かない**（既定）
    args:   {"apply": true}   … Firestore に書く

ずれの日数は**日本時間の日付**で数える。札に出るのが日本時間の日付だから
（台帳も日本時間の0時で切っている。#201・#202）。
"""

import os
import sys

from _fs import args, db, log

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 「全期間のいちばん古い1回」を引くところは、毎晩の取り込みと共通。
# **引き方を2か所に書かない。**
from doneru_supporters import earliest_by_pk, fetch_first, jst_date  # noqa: E402

# 何日ずれているか、の入れ物。0日は「札の字は変わらないが、
# 入っている時刻そのものは違う」ぶん
BUCKETS = ("0日", "1日", "2日以上")


def bucket(days: int) -> str:
    """ずれた日数を、報告に出す3つに畳む。"""
    if days <= 0:
        return "0日"
    if days == 1:
        return "1日"
    return "2日以上"


def days_between(a: str, b: str) -> int:
    """日本時間の日付にしてから、何日離れているかを数える。

    Args:
        a: ISO 文字列
        b: ISO 文字列

    Returns:
        日数（絶対値）
    """
    from datetime import date

    def d(iso: str) -> date:
        y, m, dd = jst_date(iso).split("-")
        return date(int(y), int(m), int(dd))

    return abs((d(a) - d(b)).days)


def plan_fix(table: dict, donations: list) -> dict:
    """**何を直すか**を決める。Firestore も BigQuery も要らない素の関数。

    Args:
        table: いまの `islandDonors`（どねID -> 書類）
        donations: `fetch_first()` が返したもの（全期間ぶん）

    Returns:
        {
          "fix":     {どねID: 入れる時刻},   直すもの
          "ok":      すでに合っている件数,
          "missing": 空いていたので入れる件数,
          "off":     ずれていたので直す件数,
          "unknown": 元データに1行も無くて触らない件数,
          "days":    {"0日": n, "1日": n, "2日以上": n},
        }
    """
    firsts = earliest_by_pk(donations)
    out = {
        "fix": {},
        "ok": 0,
        "missing": 0,
        "off": 0,
        "unknown": 0,
        "days": {k: 0 for k in BUCKETS},
    }
    for pk, row in table.items():
        true_at = firsts.get(pk)
        if not true_at:
            # **元データに1行も無い。** 直せないものを直したことにしない
            out["unknown"] += 1
            continue
        stored = (row or {}).get("firstSeenAt")
        if not stored:
            out["missing"] += 1
            out["fix"][pk] = true_at
            continue
        if stored == true_at:
            out["ok"] += 1
            continue
        out["off"] += 1
        out["days"][bucket(days_between(stored, true_at))] += 1
        out["fix"][pk] = true_at
    return out


def main() -> None:
    a = args()
    apply = bool(a.get("apply", False))

    client = db()
    table = {d.id: (d.to_dict() or {}) for d in client.collection("islandDonors").stream()}
    log.info("対応表: %d件", len(table))
    if not table:
        log.info("1件も無いので、何もしません")
        return

    # **表にある どねID ぶんだけ引く。** 全件なめる必要はない
    donations = fetch_first(sorted(table))
    log.info("元データ（doneru_donations）に行があったのは %d件", len(donations))

    plan = plan_fix(table, donations)
    log.info("すでに合っている %d件 / 空いていた %d件 / ずれていた %d件 / "
             "元データに無くて触らない %d件",
             plan["ok"], plan["missing"], plan["off"], plan["unknown"])
    log.info("ずれの内訳: %s",
             " / ".join(f"{k} {plan['days'][k]}件" for k in BUCKETS))
    log.info("直す行: %d件", len(plan["fix"]))

    if not apply:
        log.info('1バイトも書いていません。直すなら args に {"apply": true} を'
                 "入れてください")
        return

    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    n = 0
    for pk, at in plan["fix"].items():
        # **`firstSeenAt` だけ書き替える。** 紐付け（`channelId` / `handle`）や
        # `editedAt` には触らない。画面から直したぶんを踏まない
        client.collection("islandDonors").document(pk).set(
            {"firstSeenAt": at, "updatedAt": now}, merge=True
        )
        n += 1
    log.info("Firestore islandDonors を %d件 直しました", n)


# **`main()` を裸で呼ばない。** 偽のデータで動かす確かめ
# （`python/doneru_supporters_selftest.py`）が、この中の `plan_fix` を
# 読み込めるようにしておく。ワークフローは `python donors_first_seen.py` で
# 呼ぶので、いままでどおり走る
if __name__ == "__main__":
    main()
