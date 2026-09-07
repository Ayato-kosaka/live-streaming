"""あやと島カード（`islandCards`）を作る。#202

台帳（`islandTips`）と、企画に付く画像（`islandStreamEventImage` の
`role: "card"`）を掛け合わせて、`islandCards` に置く。

    カード = その企画のカード画像 × その企画に当たる投げ銭

## 「引くときに組み立てる」から「置いてある」へ変えた

前は `functions/src/cards.ts` が読むたびに組み立てていた。名簿
（`nordicDays`）が翌朝にしか入らず、「写真を貼ったら配る」が成り立た
なかったから。**台帳は投げ銭のその日に入る**ので、その理由が消えた。

置いてあると、`orderBy("earnedAt")` と `where("channelId","==",…)` で
引ける。**どちらも単一フィールドなので索引が要らない**（#168）。
サブコレクションにしないのも同じ理由で、あちらはコレクショングループ
索引が要る。

## 企画と配信は N:N

**1本の配信に企画が何本も乗る。** 9月11日は「北欧旅の出発日」
「海外出発二周年」「ジョージアバイバイ」の3本が同じ配信。

だから**1つ見つけたところで止めない。** 当たった企画すべてについて、
その企画のカード画像ぶんカードを作る。9/11 に投げてくれた人は、
3企画それぞれのカード写真ぶんもらう。カードIDは画像のIDを含むので
ぶつからない。

## 2か所から作る

| いつ | 誰が |
| --- | --- |
| 画像を貼ったとき | `functions/src/streamEvents.ts` の `mintForImage` |
| 毎日 | ここ |

貼った側だけだと、**画像が先で投げ銭が後**の日が埋まらない。ここだけ
だと、貼った夜のぶんが翌朝まで出ない。**両側から埋めて、どちらが先でも
同じ結果になるようにする。**

## 置き方は上書きしない

`x/y/rot/scale` に触らない。触ると**本人が動かしたカードが元に戻る。**
素性の欄（`streamEventImageId` など）が欠けている旧来の書類にだけ、
そこを足す。足さないと `/cards` の `orderBy("earnedAt")` に載らず、
**動かしたカードだけが一覧から消える。**

実行:
  BQ_PROJECT_ID=live-streaming-d3cac python python/island_cards.py
  python python/island_cards.py --dry-run
"""

import argparse
import logging
import sys
from datetime import datetime, timezone
from typing import Dict, List

from google.cloud import firestore

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from config import BQ_PROJECT_ID  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Firestore の1回のまとめ書きに入る上限。
BATCH = 400


def spread(card_id: str) -> List[float]:
    """id から 0〜1 の数を4つ出す。**同じ id なら毎回同じ数。**

    `functions/src/streamEvents.ts` の `spread` と**同じ式**。
    片方だけ変えると、貼った日に作られたカードと翌朝のカードで
    置き方が変わる。FNV-1a（暗号の用ではないので、短くて散ればよい）。

    Args:
        card_id: カードのID

    Returns:
        0〜1 の数を4つ
    """
    out = []
    for k in range(4):
        h = (0x811C9DC5 ^ ((k * 0x9E3779B9) & 0xFFFFFFFF)) & 0xFFFFFFFF
        for ch in card_id:
            h ^= ord(ch) & 0xFFFFFFFF
            h = (h * 0x01000193) & 0xFFFFFFFF
        out.append((h % 100000) / 100000)
    return out


def default_place(card_id: str) -> dict:
    """何も動かしていないカードの置き方。

    **芯は見本の右下**（`docs/nordic-photos.md` 5章）。そこから id で
    少しだけ散らす。同じ画像に何人も乗るので、全員が寸分たがわず同じ
    場所に立つと、並べたときに「同じ絵が人数ぶん」に見える。

    Args:
        card_id: カードのID

    Returns:
        x / y / rot / scale
    """
    a, b, c, d = spread(card_id)
    return {
        "x": round(0.62 + a * 0.26, 3),
        "y": round(0.88 + b * 0.08, 3),
        "rot": round(-4 + c * 8, 1),
        "scale": round(0.92 + d * 0.16, 3),
    }


def events_for_tip(events: List[dict], tip: dict) -> List[dict]:
    """その投げ銭が、どの企画のものか。**当たったものを全部返す。**

    当たり方は2つあって、**両方を足す**（片方で打ち切らない）。

    1. その企画が `videoIds` でこの配信を名乗っている（0時をまたいだ
       後半を、人が手で拾うための道）
    2. 企画の日付と、投げ銭の日（日本時間）が同じ

    **1で当たったら2を見ない、にしない。** 9月11日の配信には企画が3本
    乗っていて、あやとが `videoIds` を足すのはたいてい1本だけ。そこで
    打ち切ると、残り2本のカードが黙って消える。

    Args:
        events: 企画ぜんぶ
        tip: 投げ銭1件

    Returns:
        当たった企画。0本のこともある
    """
    out = []
    for e in events:
        by_video = bool(tip.get("videoId")) and tip["videoId"] in e["videoIds"]
        by_date = bool(e["date"]) and e["date"] == tip.get("day")
        if by_video or by_date:
            out.append(e)
    return out


def load(db: firestore.Client) -> tuple:
    """企画・カード画像・台帳を読む。

    Args:
        db: Firestore クライアント

    Returns:
        (企画, 企画ID -> カード画像, 台帳)
    """
    events = []
    for d in db.collection("islandStreamEvent").stream():
        v = d.to_dict() or {}
        if v.get("hidden") is True:
            continue
        vids = [x for x in (v.get("videoIds") or []) if isinstance(x, str)]
        date = v.get("date") if isinstance(v.get("date"), str) else ""
        events.append({"id": d.id, "date": date, "videoIds": vids})

    images: Dict[str, List[dict]] = {}
    n_img = 0
    for d in db.collection("islandStreamEventImage").stream():
        v = d.to_dict() or {}
        if (v.get("role") or "card") != "card" or not v.get("url"):
            continue
        ev = v.get("streamEventId")
        if not ev:
            # まだどの企画のものか決まっていない画像。カードは作れない
            continue
        images.setdefault(ev, []).append(
            {"id": d.id, "streamEventId": ev, "at": int(v.get("at") or 0)}
        )
        n_img += 1

    tips = []
    for d in db.collection("islandTips").stream():
        v = d.to_dict() or {}
        if not v.get("channelId"):
            # 誰のものか分からない投げ銭。**勝手に誰かのものにしない**
            continue
        tips.append(
            {
                "id": d.id,
                "channelId": v["channelId"],
                "day": v.get("day") or "",
                "videoId": v.get("videoId"),
                "donatedAt": int(v.get("donatedAt") or 0),
            }
        )
    logger.info("企画 %d件 / カード画像 %d枚 / 台帳 %d件", len(events), n_img, len(tips))
    return events, images, tips


def main() -> int:
    """エントリポイント。"""
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="書かずに出すだけ")
    a = ap.parse_args()

    db = firestore.Client(project=BQ_PROJECT_ID)
    events, images, tips = load(db)

    # (画像, 人) -> いちばん早い投げ銭。同じ人が同じ日に何度投げても1枚
    want: Dict[str, dict] = {}
    for tip in tips:
        for ev in events_for_tip(events, tip):
            for im in images.get(ev["id"], []):
                key = f"{im['id']}__{tip['channelId']}"
                had = want.get(key)
                if had and had["tip"]["donatedAt"] <= tip["donatedAt"]:
                    continue
                want[key] = {"image": im, "tip": tip}
    logger.info("あるべきカード: %d枚", len(want))
    if not want:
        return 0

    keys = list(want)
    col = db.collection("islandCards")
    have = {}
    for i in range(0, len(keys), 300):
        for snap in db.get_all([col.document(k) for k in keys[i : i + 300]]):
            if snap.exists:
                have[snap.id] = snap.to_dict() or {}

    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    make, fix = [], []
    for key in keys:
        w = want[key]
        who = {
            "channelId": w["tip"]["channelId"],
            "streamEventId": w["image"]["streamEventId"],
            "streamEventImageId": w["image"]["id"],
            "day": w["tip"]["day"],
            "earnedAt": w["tip"]["donatedAt"] or w["image"]["at"] or now_ms,
        }
        cur = have.get(key)
        if cur is None:
            make.append((key, {**who, **default_place(key),
                               "createdAt": now_ms, "updatedAt": now_ms}))
        elif not cur.get("streamEventImageId"):
            # 旧来の「動かしたぶんだけ」の書類。**置き方には触らない**
            fix.append((key, {**who, "updatedAt": now_ms}))

    logger.info("新しく作る %d枚 / 素性を足す %d枚 / そのまま %d枚",
                len(make), len(fix), len(have) - len(fix))
    for key, v in make[:20]:
        logger.info("  %s  %s  %s", key, v["day"], v["channelId"])
    if len(make) > 20:
        logger.info("  …ほか %d枚", len(make) - 20)

    if a.dry_run:
        logger.info("--dry-run なので書いていません")
        return 0

    batch = db.batch()
    n = 0
    for key, v in make + fix:
        batch.set(col.document(key), v, merge=True)
        n += 1
        if n >= BATCH:
            batch.commit()
            batch = db.batch()
            n = 0
    if n:
        batch.commit()

    logger.info("islandCards を %d枚 更新しました", len(make) + len(fix))
    return 0


if __name__ == "__main__":
    sys.exit(main())
