"""公開バケットの片づけを、**Functions に頼んで**やる（#289）。

ARGS 例:
  {}                                   … 下見。いま何ができるかと一覧（1バイトも書かない）
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
