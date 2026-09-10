"""貼った写真を1枚消す。置き場の実体と、旧来の書類と、カードもまとめて。

ARGS 例:
  {"id": "zNJQHRKMYBnu9JydChYw"}                  … 何が消えるかを出すだけ
  {"id": "zNJQHRKMYBnu9JydChYw", "apply": true}   … 実際に消す

## なぜ画面ではなくここにあるか

`DELETE /island-api/streamevents/{eventId}/images/{id}` は既にあるが、
**呼ぶには写真がどの企画に付いているかが要る。** 企画に付いていない写真
（その日の投げ銭が0で、カードが1枚もできなかったもの）はどこからも
辿り着けない。**そういう1枚を落とすための逃げ道。**

## 消す順は Functions の `dropEventImage` と同じにする

`functions/src/islandApi.ts` の `dropEventImage`。**先に置き場の実体、
次にカード、最後に書類。**

逆にすると、Firestore だけ消えて実体が残る隙ができる。そうなると
**もう誰からも見えないのに、URL を知っている人には見え続ける。**
写真には視聴者さんが写るので、その隙を作らない。
だから**実体に触れなかったときは、書類も消さずに止める。**

## カードは平置きなので、写真を消しても勝手には消えない

`islandCards` は `streamEventImageId` で写真を指しているだけ。残すと
`/cards` が実体の無い URL を返し続ける。**何枚ぶら下がっているかを
消す前に出す**（消したあとに気づいても戻せない）。
"""

import os

from _fs import args, db, log, need, show

# 正の入れ物。#202 でこちらに移った
IMAGES = "islandStreamEventImage"
# 旧来の写し。`/nordic` がまだ読んでいるので、同じIDで両方消す
NPHOTOS = "nordicPhotos"
# 写真からできたカード。`streamEventImageId` で写真を指している
CARDS = "islandCards"

# 置き場。Functions の BUCKET と同じ決め方にそろえる
# (functions/src/islandApi.ts)。**片方だけ変えると実体が消し残る。**
BUCKET = os.getenv("NORDIC_BUCKET") or (
    f"{os.getenv('BQ_PROJECT_ID') or 'live-streaming-d3cac'}.firebasestorage.app"
)


def blob_of(path: str):
    """置き場の1ファイル。触れなければ None。

    **読み込みは呼ばれたときに行う**（`_fs.db()` と同じ理由）。
    google-cloud-storage が入っていない環境でも、他の admin は動く。

    Args:
        path: 置き場での道（`storagePath` か旧来の `path`）

    Returns:
        google.cloud.storage.Blob | None: 触れなければ None
    """
    from google.cloud import storage

    return storage.Client(project=os.getenv("BQ_PROJECT_ID") or None).bucket(
        BUCKET
    ).blob(path)


def main() -> None:
    a = args()
    (image_id,) = need(a, "id")
    apply = a.get("apply") is True
    if not apply:
        log.info('*** 出すだけです。消すには {"apply": true} を付けてください ***')

    client = db()
    now = client.collection(IMAGES).document(image_id).get()
    old = client.collection(NPHOTOS).document(image_id).get()
    if not now.exists and not old.exists:
        log.info("%s という写真は、どちらの入れ物にもありません", image_id)
        return

    new_v = (now.to_dict() or {}) if now.exists else {}
    old_v = (old.to_dict() or {}) if old.exists else {}
    v = new_v or old_v
    # 新しいほうは `storagePath`、旧来は `path`。名前が違うだけで同じ道
    stored = new_v.get("storagePath") or old_v.get("path") or ""

    log.info("写真 %s", image_id)
    log.info("  %s: %s", IMAGES, "あり" if now.exists else "なし")
    log.info("  %s: %s", NPHOTOS, "あり" if old.exists else "なし")
    log.info(
        "  日付: %s / 企画: %s",
        v.get("day") or "（なし）",
        v.get("streamEventId") or "（付いていない）",
    )
    log.info("  ひとこと: %s", show(v.get("note") or ""))
    log.info("  置き場: %s", stored or "（道が入っていない）")

    # 実体があるか。**Firestore に道が書いてあっても、実体が無いことはある**
    blob = None
    if stored:
        try:
            blob = blob_of(stored)
            if blob.exists():
                blob.reload()
                log.info("  実体: あり（%s bytes）", blob.size or 0)
            else:
                log.info("  実体: 見あたりません")
        except Exception as e:  # noqa: BLE001 見にいけない理由はログに出して判断する
            blob = None
            log.warning("  実体を見にいけませんでした: %s", e)

    cards = list(
        client.collection(CARDS)
        .where("streamEventImageId", "==", image_id)
        .limit(1000)
        .stream()
    )
    log.info("  ぶら下がっているカード: %d枚", len(cards))
    for d in cards:
        c = d.to_dict() or {}
        log.info("    %s  %s", d.id, c.get("day") or "")

    if not apply:
        log.info("--- ここまで。1件も消していません ---")
        return

    # 1. 置き場の実体。**Firestore より先**（消し残ると URL で見え続ける）
    if stored:
        if blob is None:
            log.error(
                "置き場に触れないので、ここで止めます。**書類は消していません。**"
                " 先に実体を消さないと、URL を知っている人には見え続けます"
            )
            raise SystemExit(2)
        try:
            blob.delete()
            log.info("実体を消しました: %s", stored)
        except Exception as e:  # noqa: BLE001 既に無いときもここに来る
            log.warning("実体を消せませんでした（既に無い可能性）: %s", e)

    # 2. カード。写真を消しても勝手には消えない
    if cards:
        batch = client.batch()
        n = 0
        for d in cards:
            batch.delete(d.reference)
            n += 1
            if n % 400 == 0:
                batch.commit()
                batch = client.batch()
        if n % 400 != 0:
            batch.commit()
        log.info("カードを %d枚 消しました", len(cards))

    # 3. 書類。新旧どちらも同じIDで持っている
    if now.exists:
        client.collection(IMAGES).document(image_id).delete()
        log.info("%s/%s を消しました", IMAGES, image_id)
    if old.exists:
        client.collection(NPHOTOS).document(image_id).delete()
        log.info("%s/%s を消しました", NPHOTOS, image_id)

    log.info("写真 %s を消しました。戻せません", image_id)


main()
