"""Firestore を読む。

ARGS 例:
  {"list": true}                                    トップレベルのコレクション名だけ
  {"collection": "islandIdeas", "limit": 20}
  {"collection": "island", "doc": "state"}
  {"collection": "islandIdeas", "order_by": "createdAt", "desc": true, "limit": 5}
  {"collection": "doneruViewers", "keys_only": true} 件数とフィールド名だけ（値を出さない）

**このリポジトリは public で、Actions のログは誰でも読める。**
人に結びつくものが入っているコレクション（どねID とチャンネル名の対応表など）を
そのまま読むと、公開の場に出てしまう。中身を見ずに形だけ確かめたいときは
`keys_only` を使う。ドキュメントIDも出さない（IDが人を指していることがある）。
"""

from _fs import args, db, log, need, show


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
        log.info("%s/%s exists=%s", col, a["doc"], snap.exists)
        if snap.exists:
            log.info("%s", show(snap.to_dict()))
        return

    if a.get("keys_only"):
        # 値もドキュメントIDも出さない。件数とフィールド名だけ
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
        log.info("  %s  %s", d.id, show(d.to_dict()))


main()
