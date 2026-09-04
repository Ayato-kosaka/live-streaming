"""Firestore を読む。

ARGS 例:
  {"collection": "islandIdeas", "limit": 20}
  {"collection": "island", "doc": "state"}
  {"collection": "islandIdeas", "order_by": "createdAt", "desc": true, "limit": 5}
"""

from _fs import args, db, log, need, show


def main() -> None:
    a = args()
    (col,) = need(a, "collection")
    client = db()

    if a.get("doc"):
        snap = client.collection(col).document(a["doc"]).get()
        log.info("%s/%s exists=%s", col, a["doc"], snap.exists)
        if snap.exists:
            log.info("%s", show(snap.to_dict()))
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
