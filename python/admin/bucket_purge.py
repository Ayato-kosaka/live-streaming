"""公開バケットに置きっぱなしのものを、数えて・見て・消す。

ARGS 例:
  {}                                  … 一覧と、消す権限があるかだけを見る（1バイトも消さない）
  {"names": ["credits_notifications.json"]}          … 消す対象を決めて、まだ消さない
  {"names": ["credits_notifications.json"], "apply": true}  … 消す

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
消せなかった。**消せるかどうかは走らせてみないと分からない**ので、
まず空回しで `storage.objects.delete` を試して、落ちた理由をそのまま出す。
（権限が無いときは 403 が返る。**何が足りないかを人が読める形で残す**）
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

    bucket = client().bucket(BUCKET)
    blobs = list(bucket.list_blobs())
    log.info("%s に %d件", BUCKET, len(blobs))
    # **中身は出さない。** このリポジトリは公開で、Actions のログも誰でも読める。
    # 出すのは名前と大きさと日付だけ（名前は #289 に既に書いてある）
    for b in blobs:
        log.info("  %-44s %9d バイト  %s", b.name, b.size or 0, b.updated)

    if not want:
        log.info("消すものが指定されていません（{\"names\": [...]}）")
        return

    miss = [n for n in want if n not in {b.name for b in blobs}]
    if miss:
        # **もう無いものを消せと言われたら、黙って成功にしない。**
        # 「消えた」のか「名前が違う」のか分からなくなる
        log.error("バケットにありません: %s", miss)
        sys.exit(1)

    if not apply:
        log.info("空回しです（1バイトも消していません）。消すには {\"apply\": true}")
        for n in want:
            log.info("  消す予定: %s", n)
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
