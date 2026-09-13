"""公開バケットに置きっぱなしのものを、数えて・見て・消す。

ARGS 例:
  {}                                  … 一覧と、いま何ができるかを見る（1バイトも消さない）
  {"names": ["credits_notifications.json"]}          … 消す対象を決めて、まだ消さない
  {"names": ["credits_notifications.json"], "apply": true}  … 消す
  {"names": [...], "blank": true, "apply": true}     … 消せないときの次善（中身を空にする）

## なぜ要るか

あやとの言葉（2026-09-11）:

> #289 公開バケットに、寄付者113件の名前と金額が置きっぱなし。
> →消して

`live-streaming-d3cac-public` は**ログイン無しで一覧まで引ける。** 中身は
エンドロール（`/credits`、#286 で畳んだ）と授賞式が読んでいた JSON で、
**他人の表示名・金額・メッセージ**が入っている。読む人はもう1人もいない。

**これは あやとの持ち物ではない。** 投げ銭してくれた人のもの。

## 消すものを、こちらで勝手に増やさない

一覧に出たもののうち**名前で指定されたものだけ**消す。
「同じ性質に見えるから」で巻き込むと、視聴者さんが作った動画のような
**取り返しのつかないもの**まで消えうる。

## 権限が無かったら

`#283` の時点で、Actions のサービスアカウントは置き場のオブジェクトを
消せなかった。2026-09-12 に改めて試して、**いまも消せない**ことを確かめた
（`storage.objects.delete` が 403）。

そこで、空回しのときに `testIamPermissions` で**いま何ができるか**を出す。
落ちてから理由を読むのではなく、走らせる前に分かるようにする。

### 中身を空にする（`blank`）

消せなくても上書きはできるのではないか、と思って足した道。
**Actions からは使えない。** 2026-09-12 に測ったら、この置き場に対して
できるのは `list` と `get` だけで、`create` も `update` も `delete` も
`setIamPolicy` も無かった。**読む専用。**

残してあるのは、**#289 の (2)（権限を1つ付ける）が済んだときに要るから。**
そのときは `storage.objects.delete` だけでなく `objectAdmin` 相当を付けてもらう
（delete だけだと、この道は使えないまま）。

**上書きも取り返しがつかない。** だから `names` で名指ししたものだけ。
"""

import sys

from _fs import args, log

BUCKET = "live-streaming-d3cac-public"


def client():
    """Storage クライアント。**呼ばれたときに読み込む**（`_fs.db` と同じ理由）。"""
    from google.cloud import storage

    return storage.Client()


def main() -> None:
    a = args()
    want = a.get("names") or []
    apply = bool(a.get("apply"))

    blank = bool(a.get("blank"))

    bucket = client().bucket(BUCKET)
    blobs = list(bucket.list_blobs())
    log.info("%s に %d件", BUCKET, len(blobs))
    # **中身は出さない。** このリポジトリは公開で、Actions のログも誰でも読める。
    # 出すのは名前と大きさと日付だけ（名前は #289 に既に書いてある）
    for b in blobs:
        log.info("  %-44s %9d バイト  %s", b.name, b.size or 0, b.updated)

    if not want:
        # **落ちてから理由を読むのではなく、走らせる前に分かるようにする。**
        # 消せない置き場に対して apply を投げると、1件目で 403 になって
        # 「2件目はどうだったのか」が残らない。
        try:
            have = set(
                bucket.test_iam_permissions([
                    "storage.objects.list",
                    "storage.objects.get",
                    "storage.objects.create",
                    "storage.objects.delete",
                    "storage.objects.update",
                    "storage.buckets.setIamPolicy",
                ])
            )
            for name in (
                "storage.objects.list",
                "storage.objects.get",
                "storage.objects.create",
                "storage.objects.delete",
                "storage.objects.update",
                "storage.buckets.setIamPolicy",
            ):
                log.info("  %-32s %s", name, "できる" if name in have else "できない")
        except Exception as e:  # noqa: BLE001 — 権限を見に行くところで落ちても続ける
            log.warning("何ができるかを見に行けませんでした: %s", type(e).__name__)
        log.info("消すものが指定されていません（{\"names\": [...]}）")
        return

    miss = [n for n in want if n not in {b.name for b in blobs}]
    if miss:
        # **もう無いものを消せと言われたら、黙って成功にしない。**
        # 「消えた」のか「名前が違う」のか分からなくなる
        log.error("バケットにありません: %s", miss)
        sys.exit(1)

    what = "中身を空にする" if blank else "消す"
    if not apply:
        log.info("空回しです（1バイトも触っていません）。やるには {\"apply\": true}")
        for n in want:
            log.info("  %s予定: %s", what, n)
        return

    if blank:
        # 名前は残る。**中身だけを落とす。** 消せないときの次善。
        for n in want:
            bucket.blob(n).upload_from_string("{}", content_type="application/json")
            log.info("空にしました: %s", n)
        # **空になったことを、書いた本人の言葉ではなく置き場から確かめる。**
        bad = []
        for n in want:
            b = client().bucket(BUCKET).blob(n)
            b.reload()
            log.info("  %-44s いま %d バイト", n, b.size or 0)
            if (b.size or 0) > 8:
                bad.append(n)
        if bad:
            log.error("空になっていません: %s", bad)
            sys.exit(1)
        log.info("確かめました。%d件とも中身が残っていません", len(want))
        log.info("**殻は残っています。** あやとが戻ったらコンソールから消すこと（#289）")
        return

    for n in want:
        bucket.blob(n).delete()
        log.info("消しました: %s", n)

    # **消えたことを、消した本人の言葉ではなく置き場から確かめる。**
    left = {b.name for b in client().bucket(BUCKET).list_blobs()}
    still = [n for n in want if n in left]
    if still:
        log.error("消したはずなのに残っています: %s", still)
        sys.exit(1)
    log.info("確かめました。%d件とも置き場から消えています", len(want))
    log.info("のこり %d件", len(left))


if __name__ == "__main__":
    main()
