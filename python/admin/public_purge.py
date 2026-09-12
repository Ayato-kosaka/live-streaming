"""公開バケットの片づけを、**Functions に頼んで**やる（#289）。
**ついでに、旅の写真の入っている置き場で何ができるかを測る（#296）。**

ARGS 例:
  {}                                   … 下見。2つの置き場で何ができるか（1バイトも書かない）
  {"names": ["credits_notifications.json"]}            … 空回し（まだ消さない）
  {"names": ["credits_notifications.json"], "apply": true}  … 写してから消す

## なぜ `bucket_purge.py` ではだめなのか

`live-streaming-d3cac-public` は**ログイン無しで一覧まで引ける**置き場で、
中身は投げ銭してくれた113人の名前と金額。読む画面はもう無い（`/credits` は
#286 で畳んだ）のに、誰でも読める。**あやとの持ち物ではない。**

消す道が、Actions 側は塞がっている。2026-09-12 に測って、Actions の
サービスアカウントがこの置き場に対して持っているのは `list` と `get` だけ
だった（`create`・`update`・`delete`・`setIamPolicy` は無し。
`bucket_purge.py` の冒頭）。あやとは北欧を旅していてコンソールを開けない。

**まだ試していない道が1つある: Functions のサービスアカウント。**
`islandApi.ts` の `dropEventImage` と `characters_probe.py` が、
「Functions からなら置き場に書けるし消せる」を本番で通している。
ただしあれは Firebase の既定バケット（`…firebasestorage.app`）で、
**`live-streaming-d3cac-public` は別のバケット。そちらで何ができるかは
誰も測っていない。**

だからこのスクリプトは、**まず測る**ところから始まる。下見（`{}`）は
`testIamPermissions` の答えをそのまま出すだけで、1バイトも書かない。

## もう1つの用事: 旅の写真が退避に1本も入っていない（#296）

退避（#291）は Firestore も BigQuery も毎晩取れていて、エミュレータへ戻して
突き合わせるところまでやっている。**写真の実体（Storage）だけゼロ。**
いちばん取り返しのつかないものが、いちばん守られていない。

止まっていた理由は #289 と同じで、**Actions のサービスアカウントに
Storage の権限が1つも無い**（#296 で あやとに `roles/storage.objectViewer` を
付けてもらう依頼を出したまま、旅に出てしまっている）。

ところが #289 で、**Functions のサービスアカウントなら公開バケットに対して
全部できる**ことが本番で分かった。写真が入っているのは**別のバケット**
（`live-streaming-d3cac.firebasestorage.app`）で、**そちらは誰も測っていない。**
近い実績は `characters_probe.py` の create / get / delete だけで、
**退避に要る `list` は未測定。**

だから下見は**2つの置き場**を測って出す。既定バケットのほうは
`list` が立ったときに**件数と合計バイト数まで**しか見ない。
**ファイル名は1つも出ない**（口がそもそも返さない）。

`storage.objects.list` が「できる」と出たら、その道で退避が組める。
「できない」と出たら、#296 の依頼（あやとの1分の操作）を待つしかない。

## 消す道は、既定バケットには開いていない

片づけ（`{"apply": true}`）が触るのは**公開バケット決め打ち**で、
置き場は入力から選べない。既定バケットの名前を `names` に渡しても、
口が**置き場の名前として弾く**。

## 叩き方

口（`/island-api/public-purge`）は**あやとだけが叩ける。**
`_owner.py` であやとと同じ札を作って叩く（#284 で通した道）。

## 消せる名前

**口の側の決め打ちの表に載っている2つだけ**（`functions/src/publicPurge.ts`）。
ここから増やすことはできない。

    credits_notifications.json
    202601_donation_ceremony.json

`viewer-video/` 以下の mp4 4本は**視聴者さんが自分で作ったもの。**
何があっても消さない・触らない・写さない。名前で渡しても口が弾く。

## 出さないもの

**このリポジトリは公開で、Actions のログも誰でも読める。**
出すのは件数・バイト数・ファイル名・できることまで。
中の名前と金額は1文字も出さない（口もそれらを返さない）。
"""

import sys

from _fs import args, db, log
from _owner import call, owner_token

# 下見で聞く項目の並び。**できないことも1行として出す**
# （「出ていない＝聞いていない」と読み違えないため）
PERMISSIONS = [
    "storage.objects.list",
    "storage.objects.get",
    "storage.objects.create",
    "storage.objects.delete",
    "storage.objects.update",
    "storage.buckets.setIamPolicy",
]

# 既定バケット（旅の写真）に聞く項目（#296）。最後の1つだけ公開バケットと違う。
# あちらで見たいのは「公開を止められるか」、こちらは「退避の相手として掴めるか」
DEFAULT_PERMISSIONS = [
    "storage.objects.list",
    "storage.objects.get",
    "storage.objects.create",
    "storage.objects.delete",
    "storage.objects.update",
    "storage.buckets.get",
]

# 数えられなかったときの言い分。**「聞いていない」と「断られた」を混ぜない**
LISTED = {
    "ok": "数えられました",
    "skipped": "list が無いので、数えるのも試していません",
    "denied": "list はあると出たのに、数えようとしたら断られました",
}


def photos(got: dict) -> None:
    """旅の写真の置き場で、いま何ができるか（#296）。**読むだけ。**"""
    d = got.get("defaultBucket")
    if not d:
        # 口が古い（デプロイ前）。**黙って通さない**
        log.warning("旅の写真の置き場の結果が返っていません（口が古い可能性）")
        return

    log.info("")
    log.info("旅の写真の置き場: %s", d.get("bucket"))
    can = d.get("can")
    if can is None:
        # **聞けなかったことを、できないことと同じ絵にしない。**
        log.warning("  何ができるかを聞けませんでした（権限そのものが無い可能性）")
    else:
        log.info("  Functions のサービスアカウントができること:")
        for name in DEFAULT_PERMISSIONS:
            log.info("    %-32s %s", name, "できる" if can.get(name) else "できない")

    listed = d.get("listed")
    log.info("  %s", LISTED.get(listed, listed))
    if listed == "ok":
        # **件数と合計バイト数だけ。** 名前は口が返さないし、出さない
        log.info("  %d件（合計 %d バイト）", d.get("count") or 0, d.get("bytes") or 0)
        log.info("  → この道で写真の退避が組めます（#296 の依頼は待たなくてよい）")
    else:
        if d.get("why"):
            log.info("  止まった種類: %s", d.get("why"))
        log.info("  → この道では数えられません。#296 の依頼（あやとの操作）待ちです")


def look(token: str) -> dict:
    """下見。**1バイトも書かない。**"""
    got = call("GET", "/public-purge", token)
    log.info(
        "%s に %d件（合計 %d バイト）",
        got.get("bucket"),
        got.get("count", 0),
        got.get("bytes", 0),
    )
    for f in got.get("files") or []:
        log.info(
            "  %-40s %10d バイト  %s  消せる=%s 触らない=%s",
            f.get("name"),
            f.get("bytes") or 0,
            f.get("updatedAt"),
            f.get("purgeable"),
            f.get("keep"),
        )

    can = got.get("can")
    if can is None:
        # **聞けなかったことを、できないことと同じ絵にしない。**
        log.warning("何ができるかを聞けませんでした（権限そのものが無い可能性）")
    else:
        log.info("Functions のサービスアカウントが、この置き場に対してできること:")
        for name in PERMISSIONS:
            log.info("  %-32s %s", name, "できる" if can.get(name) else "できない")
    log.info("この口で消せる名前: %s", got.get("allowed"))
    log.info("写す先: %s", got.get("archiveTo"))
    photos(got)
    return got


def main() -> None:
    a = args()
    want = a.get("names") or []
    apply = bool(a.get("apply"))

    token = owner_token(db())
    look(token)

    if not want:
        log.info("消すものが指定されていません（{\"names\": [...]}）")
        return

    got = call("POST", "/public-purge", token, {"names": want, "apply": apply})

    if not got.get("apply"):
        log.info("空回しです（1バイトも触っていません）。やるには {\"apply\": true}")
        for p in got.get("plan") or []:
            log.info(
                "  %s予定: %-40s %10d バイト  置き場にある=%s",
                "片づけ",
                p.get("name"),
                p.get("bytes") or 0,
                p.get("exists"),
            )
        return

    for d in got.get("done") or []:
        log.info(
            "片づけました: %-40s %10d バイト → %s",
            d.get("name"),
            d.get("bytes") or 0,
            d.get("archived"),
        )
    failed = got.get("failed") or []
    for f in failed:
        # **どこで止まったかを出す。** `delete` まで来ていなければ消えていない
        log.error("止まりました: %s（%s で %s）", f.get("name"), f.get("step"), f.get("why"))

    # **消えたことを、消した本人の言葉ではなく置き場から確かめる。**
    # 口は消したあとに一覧を引き直して `still` に入れて返す。
    still = got.get("still")
    if still is None:
        log.warning("消したあとの数え直しができませんでした。下見をもう一度まわしてください")
    elif still:
        log.error("消したはずなのに残っています: %s", still)
        sys.exit(1)
    else:
        log.info("確かめました。%d件とも置き場から消えています", len(got.get("done") or []))
    log.info("のこり %s件", got.get("left"))

    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
