"""スパチャの控えの口を、**本番で1回通して確かめる**（#292 / #294）。

ARGS: なし（`{}`）

## なぜ要るか

`GET /island-api/fund/history` は**あやとだけが読める口**なので、
出したあと誰も本番で叩けていない。あやとは 9/27 までつながらないので、
**壊れていたら、旅から帰るまで誰も気づかない。**

オーナー以外に返らないことは焼いた口で確かめてある
（`tools/fund/ownercheck.cjs`。合言葉なし・Bearer でない・にせの合言葉・
本物だが admin でない、の4通りとも 403）。**確かめられていないのは、
あやと本人として叩いたときに本当に返るか**のほう。

Actions は `_owner.py` であやとと同じ札を作れる（#284 で通した道）ので、
ここから1回だけ叩いて、**返ることと、数が合うことだけ**を見る。

## 出さないもの

**このリポジトリは公開で、Actions のログも誰でも読める。**
控えの中身は**投げ銭してくれた人の名前と金額**で、あやとの持ち物ではない。
#289（公開バケットに113件置きっぱなし）と同じ性質のもの。

だから出すのは**件数と、欄の名前と、ステータスだけ。**
名前・金額・メッセージ・日付は1文字も出さない。
"""

from _fs import args, db, log
from _owner import call, owner_token


def main() -> None:
    args()  # 入力は取らない。取り違えて書く口ではないことを形で示す
    token = owner_token(db())
    got = call("GET", "/fund/history", token)

    # **欄の名前を推測しない。** 口が返す名前は `chats`（`islandApi.ts`）。
    # 最初は items / rows を当てにいって「0件」と出し、口が壊れていると
    # 読み違えるところだった。**当たらなかったら、何が返ったかを出す。**
    rows = got.get("chats")
    if rows is None:
        log.error("`chats` が無い。返ってきた欄: %s", sorted(got.keys()))
        raise SystemExit("口の返す形が変わっている")
    log.info("返ってきました。%d件", len(rows))
    if rows:
        # **欄の名前だけ。** 値は1つも出さない
        log.info("  欄: %s", sorted(rows[0].keys()))
    for k in ("count", "total", "more", "next", "nextCursor"):
        if k in got:
            # `next` は続きの栞。**中身が日付や書類IDなので、有無だけ**
            log.info("  %s: %s", k, "あり" if k in ("next", "nextCursor") else got[k])

    # 控えそのものを数えて、口の言う数と突き合わせる
    n = db().collection("islandFundSuperChats").count().get()[0][0].value
    log.info("置き場には %d件", n)
    if not rows:
        raise SystemExit("口は返ったが0件だった。置き場には %d件ある" % n)
    if len(rows) > n:
        raise SystemExit("口が置き場より多く返した（%d > %d）" % (len(rows), n))
    log.info("通りました（1バイトも書いていません）")


if __name__ == "__main__":
    main()
