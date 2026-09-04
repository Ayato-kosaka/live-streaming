"""Firestore に書く（merge）。

ARGS 例:
  {"collection": "islandIdeas", "doc": "abc123", "data": {"hidden": true}}
  {"collection": "island", "doc": "state", "data": {"current": {"place": "北欧"}}}
  {"collection": "islandIdeas", "doc": "abc123", "data": {...}, "merge": false}
"""

from _fs import args, db, log, need, show


def main() -> None:
    a = args()
    col, doc, data = need(a, "collection", "doc", "data")
    if not isinstance(data, dict):
        log.error("data はオブジェクト（{...}）で渡してください")
        raise SystemExit(1)
    merge = a.get("merge", True)
    ref = db().collection(col).document(doc)
    before = ref.get()
    log.info("変更前: exists=%s %s", before.exists, show(before.to_dict()) if before.exists else "")
    ref.set(data, merge=bool(merge))
    log.info("変更後: %s", show(ref.get().to_dict()))


main()
