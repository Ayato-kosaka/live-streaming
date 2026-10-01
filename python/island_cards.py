"""あやと島カード（`islandCards`）を作る。#202

台帳（`islandTips`）と、カード画像（`islandStreamEventImage` の
`role: "card"`）を掛け合わせて、`islandCards` に置く。

    カード = その日のカード画像 × その日投げてくれた人

## 「引くときに組み立てる」から「置いてある」へ変えた

前は `functions/src/cards.ts` が読むたびに組み立てていた。名簿
（`nordicDays`）が翌朝にしか入らず、「写真を貼ったら配る」が成り立た
なかったから。**台帳は投げ銭のその日に入る**ので、その理由が消えた。

置いてあると、`orderBy("earnedAt")` と `where("channelId","==",…)` で
引ける。**どちらも単一フィールドなので索引が要らない**（#168）。
サブコレクションにしないのも同じ理由で、あちらはコレクショングループ
索引が要る。

## 軸は企画ではなく**日付**（2026-10-01・案C）

前は「企画 → その企画の画像 → その企画に当たる投げ銭」で当てていた。
**企画が無い日は、写真を貼ってもカードが1枚もできない。** 企画の表は
手書き（`python/stream_events_seed.json`）で 2026-09-20 までしか無く、
**9/21 から 10/01 まで11日間、カードが0枚のまま誰も気づかなかった**
（毎晩のジョブは「あるべき617枚／新しく作る0枚」と出して緑だった。
`docs/island-card-rfc.md` 0章）。

いまは**画像の日**が軸で、企画は「その日に付く札」に降りた。

    画像の日 = image.day ||（その画像の企画の date）|| jst_day(image.at)
    投げ銭の日 = jst_day(videoStartedAt) || tip.day || jst_day(donatedAt)

当たりは「日が同じ」か「`videoId` が画像の `videoIds`（無ければその画像の
企画の `videoIds`）に入っている」のどちらか。**企画が無くても作る**ので、
`streamEventId` は空文字のままカードになる。

**1本の配信に企画が何本も乗る**（9月11日は3本が同じ配信）という形は
変わっていないが、**カードの枚数には効かなくなった。** 画像1枚につき
1人1枚で、同じ日の画像が何枚あってもそのぶんだけ出る。
カードIDは画像のIDを含むのでぶつからない。

## 2か所から作る

| いつ | 誰が |
| --- | --- |
| 画像を貼ったとき | `functions/src/streamEvents.ts` の `mintForImage` |
| 毎日 | ここ |

貼った側だけだと、**画像が先で投げ銭が後**の日が埋まらない。ここだけ
だと、貼った夜のぶんが翌朝まで出ない。**両側から埋めて、どちらが先でも
同じ結果になるようにする。**

## 絵は「投げたときに名乗っていた名前」で決まる

カードの書類に `nameSnapshot`（台帳の `displayNameSnapshot`）を焼き込む。
`functions/src/cards.ts` の `iconsOf` はこれだけを見て絵を引く。

前はチャンネルIDから**いま名乗っている名前**を引き直していたので、
**Doneru に別名で投げた人の本体が、公開の `/cards` に絵で出ていた**
（名前と channelId は落としてあったが、絵は図鑑と照らせば誰か分かる）。

焼き込みなので、あとから YouTube の名前を変えても Doneru の名前を
変えても**カードの絵は動かない**（`docs/island-db.md` 2章の決めごと）。
**写しを持たない古い書類には、ここで足す。** 足さないと絵の元が無くなる。

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
# 日本時間の日付に切るところは台帳と同じものを使う。**2か所に書かない。**
# ずれると、台帳とカードで「どの日の配信か」が食い違う
from island_tips import jst_day  # noqa: E402
from logsafe import detail_lines  # noqa: E402

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


def image_day(im: dict, events: Dict[str, dict]) -> str:
    """その画像が「何日の写真か」。**カードの日付はこれ。**

    貼ったときに `day` が入っている（`functions/src/islandApi.ts` の
    `saveEventImage`）ので、ふつうはそれで決まる。**企画は見ない。**
    企画の日付を見るのは、`day` を持っていない古い画像のためだけ。

    Args:
        im: 画像1件
        events: 企画ID -> 企画（`date` と `videoIds` だけ）

    Returns:
        YYYY-MM-DD。どれも分からなければ空文字
    """
    if im.get("day"):
        return im["day"]
    ev = events.get(im.get("streamEventId") or "")
    if ev and ev.get("date"):
        return ev["date"]
    if im.get("at"):
        return jst_day(int(im["at"]))
    return ""


def tip_day(tip: dict) -> str:
    """その投げ銭が「何日の配信のものか」。

    **配信の日は、投げ銭の日ではなく「その配信が始まった日」。**

    2026-09-06 の配信で踏んだ。22時に始まった `q30MlzefQ8c` に、
    たぃさん（22:27）と aoi さん（翌 00:23）が投げてくれた。**同じ配信**
    なのに、台帳の `day` で当てていたので aoi さんだけ翌日に落ちて、
    その日の写真にカードが付かなかった。

    配信が「どの日のものか」を決めるのは配信の始まりで、視聴者が
    いつ押したかではない。`videoStartedAt` が分かっているならそちらを使う。

    Args:
        tip: 投げ銭1件

    Returns:
        YYYY-MM-DD。どれも分からなければ空文字
    """
    if tip.get("videoStartedAt"):
        return jst_day(int(tip["videoStartedAt"]))
    if tip.get("day"):
        return tip["day"]
    if tip.get("donatedAt"):
        return jst_day(int(tip["donatedAt"]))
    return ""


def video_ids(im: dict, events: Dict[str, dict]) -> List[str]:
    """その画像が名乗っている配信。**画像を先に見て、無ければ企画に落ちる。**

    0時をまたいだ後半を人が手で拾うための道で、**本番でこれを持っているのは
    企画が1件だけ**（`food-wine-fest` の2本）。画像の側に移し替えると
    本番のデータを動かすことになるので、**移さずに、画像 → 企画の順で見る。**
    これから貼るものには画像に付けられる。

    Args:
        im: 画像1件
        events: 企画ID -> 企画

    Returns:
        配信ID の一覧
    """
    if im.get("videoIds"):
        return im["videoIds"]
    ev = events.get(im.get("streamEventId") or "")
    return (ev or {}).get("videoIds") or []


def hits(tip: dict, im: dict, events: Dict[str, dict]) -> bool:
    """その投げ銭が、その画像に当たるか。**当たり方はここ1か所だけ。**

    1. 日が同じ（画像の日 == 投げ銭の日）
    2. `videoId` が画像の名乗る配信に入っている

    **日が空のものどうしを当てない。** `day` も `at` も無い画像と、
    `day` も `donatedAt` も無い投げ銭は、どちらも空文字になる。
    そこを素通しにすると、素性の分からないもの全部が総当たりで繋がる。

    Args:
        tip: 投げ銭1件
        im: 画像1件
        events: 企画ID -> 企画

    Returns:
        当たるなら True
    """
    day = image_day(im, events)
    if day and day == tip_day(tip):
        return True
    vid = tip.get("videoId")
    return bool(vid) and vid in video_ids(im, events)


def load(db: firestore.Client) -> tuple:
    """企画・カード画像・台帳を読む。

    Args:
        db: Firestore クライアント

    Returns:
        (企画ID -> 企画, カード画像ぜんぶ, 台帳)
    """
    # 企画はもう軸ではない。**`videoIds` と、`day` を持たない古い画像の
    # 日付の落ち先**としてしか使わないので、ID で引ける形にして持つ
    events: Dict[str, dict] = {}
    for d in db.collection("islandStreamEvent").stream():
        v = d.to_dict() or {}
        if v.get("hidden") is True:
            continue
        vids = [x for x in (v.get("videoIds") or []) if isinstance(x, str)]
        date = v.get("date") if isinstance(v.get("date"), str) else ""
        events[d.id] = {"id": d.id, "date": date, "videoIds": vids}

    images: List[dict] = []
    for d in db.collection("islandStreamEventImage").stream():
        v = d.to_dict() or {}
        if (v.get("role") or "card") != "card" or not v.get("url"):
            continue
        # **`streamEventId` が空でも読む。** ここで飛ばしていたせいで、
        # 企画の無い日（2026-09-21 以降）のカードが11日間0枚だった。
        # 企画はもう必須ではなく、日付が軸（`image_day`）
        images.append(
            {
                "id": d.id,
                "streamEventId": v.get("streamEventId") or "",
                "at": int(v.get("at") or 0),
                # 貼ったときから入っている日付。**これがカードの日付になる**
                "day": v.get("day") if isinstance(v.get("day"), str) else "",
                # 0時またぎを人が手で拾う道。いまは企画が持っているが、
                # これから貼るものは画像に付けられる（`video_ids`）
                "videoIds": [
                    x for x in (v.get("videoIds") or []) if isinstance(x, str)
                ],
            }
        )
    n_img = len(images)

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
                # **配信の始まった時刻。落とすと日付の補正が効かない。**
                # `tip_day` はこれを見て「投げ銭の日」ではなく
                # 「配信の始まった日」を返す。ここに入れ忘れていたので
                # 補正がまるごと死んでいた（本番で aoi さんが翌日に
                # 落ちていた。ホワイトリストで救われていただけ）
                "videoStartedAt": v.get("videoStartedAt"),
                "donatedAt": int(v.get("donatedAt") or 0),
                # **投げてくれたときに名乗っていた名前。**
                # カードに乗る絵はこれで決まる（`functions/src/cards.ts` の
                # `iconsOf`）。チャンネルIDからいまの名前を引き直していた
                # ころは、Doneru に別名で投げた人の本体が公開の `/cards` に
                # 出ていた。80字で切るのは `islandCharacter` の鍵と同じ長さ
                "nameSnapshot": (v.get("displayNameSnapshot") or "").strip()[:80]
                or None,
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
        for im in images:
            if not hits(tip, im, events):
                continue
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
        # **投げ銭の日ではなく、画像の日**（2026-10-01・案C）。
        #
        # 台帳の day は投げてくれた瞬間の日本時間なので、0時をまたいだ
        # 配信では後半の人が翌日になる。そのまま入れると同じ1枚の写真から
        # 出たカードが2つの日付に割れて、画面（day で企画名を引く）で
        # 片方だけ企画名が消える。**1枚の写真から出たカードは全部同じ日付。**
        #
        # 前は「企画の日付 || 台帳の day」だった。企画を軸から降ろしたので、
        # **企画の無い日でもカードが日付を持てる**形に変えた。企画の日付は
        # `image_day` の中で、`day` を持たない古い画像の落ち先として残っている。
        day = image_day(w["image"], events)
        who = {
            "channelId": w["tip"]["channelId"],
            "streamEventId": w["image"]["streamEventId"],
            "streamEventImageId": w["image"]["id"],
            "day": day,
            "earnedAt": w["tip"]["donatedAt"] or w["image"]["at"] or now_ms,
            # **名乗りを焼き込む。** ここに入れておくと、あとから YouTube の
            # 名前を変えても Doneru の名前を変えても、カードの絵は動かない
            # （`docs/island-db.md` 2章の決めごと）
            "nameSnapshot": w["tip"]["nameSnapshot"],
        }
        cur = have.get(key)
        if cur is None:
            make.append((key, {**who, **default_place(key),
                               "createdAt": now_ms, "updatedAt": now_ms}))
        elif not cur.get("streamEventImageId"):
            # 旧来の「動かしたぶんだけ」の書類。**置き方には触らない**
            fix.append((key, {**who, "updatedAt": now_ms}))
        else:
            # 素性はそろっているが、欄が台帳と食い違っている書類。
            # **名乗りの写しを持たない既存のカードは、ここで埋まる。**
            # 埋めないと `iconsOf` が引く元が無く、いま絵が出ている人が
            # 全員消える。**置き方には触らない**ので、動かしたカードは動かない
            patch = {}
            if day and cur.get("day") != day:
                patch["day"] = day
            if cur.get("nameSnapshot") != who["nameSnapshot"]:
                patch["nameSnapshot"] = who["nameSnapshot"]
            if patch:
                fix.append((key, {**patch, "updatedAt": now_ms}))

    logger.info("新しく作る %d枚 / 素性を足す %d枚 / そのまま %d枚",
                len(make), len(fix), len(have) - len(fix))
    # **カードの鍵にはチャンネルIDが入っている。** 公開の場では1枚も出さない
    # （`python/logsafe.py`）。日付ごとの枚数だけなら誰も指さない
    for line in detail_lines([(key, v["day"], v["channelId"]) for key, v in make[:20]]):
        logger.info("%s", line)
    if len(make) > 20:
        # 数だけなので、公開の場でもそのまま出してよい
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
