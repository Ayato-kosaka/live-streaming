"""Firestore のドキュメントを消す。消す前に中身をログに出す。

ARGS 例:
  {"collection": "islandIdeas", "doc": "abc123"}
"""

from _fs import args, db, log, need, show


def main() -> None:
    a = args()
    col, doc = need(a, "collection", "doc")
    ref = db().collection(col).document(doc)
    snap = ref.get()
    if not snap.exists:
        log.info("%s/%s は既にありません", col, doc)
        return
    log.info("消す前の中身: %s", show(snap.to_dict()))
    ref.delete()
    log.info("%s/%s を削除しました", col, doc)


main()
