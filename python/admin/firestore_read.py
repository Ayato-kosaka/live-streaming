"""Firestore を読む。

ARGS 例:
  {"list": true}                                    トップレベルのコレクション名だけ
  {"collection": "islandIdeas", "limit": 20}
  {"collection": "island", "doc": "state"}
  {"collection": "islandIdeas", "order_by": "createdAt", "desc": true, "limit": 5}
  {"collection": "doneruViewers", "keys_only": true} 件数とフィールド名だけ

**このリポジトリは public で、Actions のログは誰でも読める。**
だから Actions から回したときは、**どの入れ物でも、値と書類IDは1文字も出ない。**
出るのは入れ物の名前・件数・欄の名前・欄の型と長さ・`mask()` の指紋だけ
（落としているのは `logsafe.sketch()` と `logsafe.mask()`）。
書類IDまで落とすのは、IDが人を指していることがあるから
（`<videoId>_<messageId>`、どねID をIDにしている入れ物もある）。

**`keys_only` は「安全のための入力」ではない。** 入力で安全を選ぶ形にすると、
選び間違えた1回で漏れる（`streamChatMessages` を order_by で読んで、
視聴者さん120人ぶんの本文と表示名が公開のログに並んだ）。
いまは `keys_only` かどうかに関わらず値は出ないので、これは
「1件ずつ並べずに、入れ物ぜんぶの欄をまとめて見たい」ときの入り口でしかない。

**値そのものが要るときは、ここでは取れない。** 手元で回すか、
出すものを自分で決めた専用のスクリプトを書く
（`doneru_audit.py` が手本。数字しか出さない）。
"""

from _fs import args, db, log, need, show
from logsafe import mask


def main() -> None:
    a = args()
    client = db()

    if a.get("list"):
        # どこに何があるか分からないときの入口。名前しか出さないので安全
        names = sorted(c.id for c in client.collections())
        log.info("トップレベルのコレクション %d 件: %s", len(names), names)
        return

    (col,) = need(a, "collection")

    if a.get("doc"):
        snap = client.collection(col).document(a["doc"]).get()
        # 書類IDも指紋にする。どの書類の話かは指紋で追える（同じIDは同じ字）
        log.info("%s/%s exists=%s", col, mask(a["doc"]), snap.exists)
        if snap.exists:
            log.info("%s", show(snap.to_dict()))
        return

    if a.get("keys_only"):
        # 入れ物ぜんぶの欄を、1件ずつ並べずにまとめて見る
        docs = list(client.collection(col).stream())
        keys = sorted({k for d in docs for k in (d.to_dict() or {})})
        log.info("%s: %d 件 / フィールド: %s", col, len(docs), keys)
        return

    q = client.collection(col)
    if a.get("order_by"):
        direction = "DESCENDING" if a.get("desc") else "ASCENDING"
        q = q.order_by(a["order_by"], direction=direction)
    q = q.limit(int(a.get("limit", 20)))
    docs = list(q.stream())
    log.info("%s: %d 件", col, len(docs))
    for d in docs:
        log.info("  %s  %s", mask(d.id), show(d.to_dict()))


main()
