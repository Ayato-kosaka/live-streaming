"""豚の貯金箱を、毎晩そろえ直す。

## 何をするか

1. **漏れを埋める。** BigQuery の直近N日ぶんのスパチャを控えに足す。
   OBS のアラートボックスを起動し忘れた晩は、あちらが1件も記録していない。
   その晩ぶんは BigQuery にしか無いので、こちらから拾う
2. **重複を潰す。** 拾ったものは26文字の item id を書類IDにする。
   アラートボックスが既に入れていれば**同じ書類に上書きされる**ので、
   同じスパチャが2件になることがない（`python/fund_box.py`）
3. **合計を焼き直す。** 控えと支出を全部数えて、`island/state.fund.box`
   に置く。411件を毎回読ませないため

## 遡らない

既定は**直近3日ぶんだけ**。全期間を引くと、これまで貯金箱に入っていなかった
ぶん（BigQuery にしか無い古いスパチャ）が一度に入って、**貯金箱の額が跳ねる。**
2026-09-11 の実測で、GAS の411件と BigQuery の385件は**どちらにも相手に無い
行がある**（BigQuery 側にだけ67件の2025年ぶんがある）。

古いぶんを入れるかどうかは**あやとが決めること**であって、毎晩の掃除が
勝手にやることではない。入れると決めたら `{"days": 400}` で1回流す。

## 移行前は何もしない（止め金）

控えが1件も無いうちは、**BigQuery から入れずに黙って終わる。**
`fund_migrate` を流す前にここが走ると、直近3日ぶんだけが入った控えが
できて、そこから焼いた合計が本物の貯金箱とまるで違う額になる。

## `island/state.fund` の既にある欄は触らない

`fund.superchat` `fund.people` `fund.days` は `island_daily_stats.py` の
持ちもので、`GET /island-api/fund` がいまも読んでいる。**同じ欄を2人が書くと、
額がステップの順番で決まる。** こちらは `fund.box` の下だけに書く。

読む側（`functions/src/islandApi.ts`）を `fund.box` に切り替えるのは、
**両方の額が1円まで一致しているのを見てから。** 切り替えるまで、画面に出る
額はいままでどおり GAS 由来のまま動かない。

実行:
  BQ_PROJECT_ID=live-streaming-d3cac python python/fund_daily.py
  python python/fund_daily.py --days 3
  python python/fund_daily.py --dry-run
"""

import argparse
import logging
import sys
from datetime import datetime, timezone

from google.cloud import firestore

sys.path.insert(0, __file__.rsplit("/", 1)[0])

import fund_box as fb  # noqa: E402
from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def main() -> int:
    """エントリポイント。**落ちたときに札を1枚置いてから落ちる。**

    毎晩ひとりでに走るものなので、**壊れても誰も気づかない。**
    `functions/src/chatCapture.ts` の `streamChatHealth` と同じ手を使う。
    Actions のログを開かなくても `firestore_read` で理由まで読める。

        管理スクリプトを実行  script: firestore_read
        args: {"collection":"islandFundHealth","limit":1}

    Returns:
        0 なら通った。1 なら落ちた（**ワークフローも赤くする**）
    """
    started = datetime.now(timezone.utc).isoformat()
    try:
        note = run()
        ok, err = True, ""
    except Exception as e:  # noqa: BLE001  何で落ちても札は置く
        logger.exception("貯金箱の掃除が落ちました")
        note, ok, err = {}, False, f"{type(e).__name__}: {e}"

    # 見るだけのときは札を書き替えない。**本物の掃除の跡を消さない**
    if note.get("dryRun"):
        logger.info("FUND_DAILY dry-run")
        return 0

    # 札を置く。**Firestore まで落ちていたら置けない**ので、そこは黙って諦める
    try:
        firestore.Client(project=BQ_PROJECT_ID).collection(
            "islandFundHealth"
        ).document("last").set({"at": started, "ok": ok, "error": err, **note})
    except Exception as e:  # noqa: BLE001
        logger.error("札も置けませんでした: %s", type(e).__name__)

    # ログの字でも見分けられるようにする（札が置けなかったとき用）
    logger.info("FUND_DAILY %s", "ok" if ok else "NG " + err)
    return 0 if ok else 1


def run() -> dict:
    """掃除の本体。

    Returns:
        札に残す数字。落ちたときは例外を投げる
    """
    p = argparse.ArgumentParser()
    p.add_argument("--days", type=int, default=3, help="BigQuery を何日ぶん見るか")
    p.add_argument("--dry-run", action="store_true", help="書かずに出すだけ")
    p.add_argument(
        "--sweep",
        action="store_true",
        help="31日より前まで遡ることを承知している（貯金箱の額が動く）",
    )
    a = p.parse_args()

    # 遡ると貯金箱の額が動く。**押し間違いで動かない**ようにする
    if a.days > 30 and not a.sweep and not a.dry_run:
        logger.error(
            "%d日ぶんは掃除ではなく遡りです。**貯金箱の額が動きます。**"
            "先に見るだけで流して差を読み、それから --sweep を付けてください",
            a.days,
        )
        raise SystemExit(1)

    db = firestore.Client(project=BQ_PROJECT_ID)

    # ---- 止め金。移行前は何もしない ----
    have = list(db.collection(fb.C_SUPERCHAT).limit(1).stream())
    if not have:
        logger.info(
            "控え（%s）が空です。移行前なので何もしません"
            "（先に python/admin/fund_migrate.py を apply で流す）",
            fb.C_SUPERCHAT,
        )
        return {"skipped": "移行前（控えが空）"}

    # ---- 漏れを埋める ----
    rows = fb.bq_superchats(BQ_PROJECT_ID, BQ_DATASET, a.days)
    logger.info("BigQuery の直近%d日: スパチャ %d件", a.days, len(rows))

    # 既にあるものを引く。**引いた件数ぶんしか読まない**（3日ぶんなら数件）
    added = []
    claimed = []
    for doc, v in rows:
        snap = db.collection(fb.C_SUPERCHAT).document(doc).get()
        if snap.exists:
            continue
        # 書類IDでは重ならないが、**手で入れた同じもの**が既にあるかもしれない。
        # 日付と額の札で拾う（単一フィールドの一致なので索引は要らない）。
        key = fb.claim_key(v["day"], v["yen"])
        hit = None
        if key:
            for c in db.collection(fb.C_SUPERCHAT).where("claim", "==", key).stream():
                if not (c.to_dict() or {}).get("claimedBy"):
                    hit = c.id
                    break
        if hit:
            claimed.append((hit, doc))
            continue
        added.append((doc, v))

    if claimed:
        logger.info(
            "手で入れてあったぶんと同じもの: %d件（足さずに札だけ付けます）",
            len(claimed),
        )

    if added:
        logger.info(
            "控えに無かったぶん: %d件 / %s円（アラートボックスが取りこぼした晩）",
            len(added),
            sum(v["yen"] for _, v in added),
        )
    else:
        logger.info("控えに無かったぶん: 0件")

    if a.dry_run:
        logger.info("見るだけなので書きません")
    elif added or claimed:
        batch = db.batch()
        for doc, v in added:
            batch.set(db.collection(fb.C_SUPERCHAT).document(doc), v, merge=True)
        for manual_doc, item in claimed:
            # 札を使い切る。**同じ日に同じ額のスパチャが2つあっても、
            # 2つめはこの札に引っかからずにちゃんと足される**
            batch.set(
                db.collection(fb.C_SUPERCHAT).document(manual_doc),
                {"claimedBy": item},
                merge=True,
            )
        batch.commit()
        logger.info("%d件 足しました（札を使ったのが %d件）", len(added), len(claimed))

    # 日付の無い手入力（GAS から移した13件、あわせて3,000円）は札が付かない。
    # 遡るときだけ二重になりうるので、そのときは数えて知らせる
    if a.days > 30:
        blind = [
            d.id
            for d in db.collection(fb.C_SUPERCHAT).where("claim", "==", "").stream()
        ]
        if blind:
            logger.warning(
                "日付の無い手入力が %d件あります。**遡ると二重になりうる**"
                "（日付が分からないので札が付けられない）。"
                "気になるなら先に fund_add で日付を入れてください",
                len(blind),
            )

    # ---- 合計を焼き直す ----
    s = fb.read_sums(db)
    goal = fb.read_goal(db)
    boxed = fb.box(s["superchatFull"], 0, s["spend"])
    logger.info(
        "控え %d件 / スパチャ %s円（半分 %s円） / 支出 %s円（%d件） / "
        "Doneru を除いた貯金箱 %s円",
        s["count"],
        s["superchatFull"],
        s["superchat"],
        s["spend"],
        s["spendCount"],
        boxed,
    )
    if goal:
        logger.info("いまの目標: %s %s円", goal.get("label"), goal.get("yen"))

    if a.dry_run:
        return {"dryRun": True}

    db.collection("island").document("state").set(
        {
            "fund": {
                "box": {
                    # 貯金箱に入るぶん（÷2 済み）。**画面に出すのはこれ**
                    "superchat": s["superchat"],
                    # 人が出した額（÷2 する前）。月末の集計用
                    "superchatFull": s["superchatFull"],
                    "count": s["count"],
                    "spend": s["spend"],
                    "spendCount": s["spendCount"],
                    # 豚の `startAmount` にあたる負の数。突き合わせ用に残す
                    "start": fb.start_amount(s["spend"]),
                    "goal": goal or None,
                    "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                }
            }
        },
        merge=True,
    )
    logger.info("island/state.fund.box を更新しました")
    return {
        "added": len(added),
        "claimed": len(claimed),
        "count": s["count"],
        "superchat": s["superchat"],
        "spend": s["spend"],
        "box": boxed,
        "days": a.days,
    }


if __name__ == "__main__":
    sys.exit(main())
