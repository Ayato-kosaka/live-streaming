"""本番の Firestore にいまある複合索引を並べる。**読むだけ。**

ARGS 例:
  {}

## なぜ要るか

Hosting のデプロイで索引の step が落ちた（2026-09-09）:

    there are 2 indexes defined in your project that are not present in
    your firestore indexes file. To delete them, run with --force

`--force` は**消すための旗**なので、何が消えるのかを見ずに付けない。
`firestore.indexes.json` に無いものが本当に要らないのかを、ここで確かめる。
"""

from google.cloud import firestore_admin_v1

from _fs import args, log
import os

PROJECT = os.environ["BQ_PROJECT_ID"]


def main() -> None:
    args()
    cli = firestore_admin_v1.FirestoreAdminClient()
    parent = f"projects/{PROJECT}/databases/(default)/collectionGroups/-"

    n = 0
    for ix in cli.list_indexes(parent=parent):
        n += 1
        # `projects/…/collectionGroups/islandNotes/indexes/CICAgJj…`
        col = ix.name.split("/collectionGroups/")[1].split("/indexes/")[0]
        fields = " , ".join(
            f"{f.field_path} {firestore_admin_v1.Index.IndexField.Order(f.order).name}"
            if f.order
            else f"{f.field_path} ARRAY"
            for f in ix.fields
        )
        log.info("%-18s %-10s %s", col, ix.state.name, fields)
    log.info("複合索引 %d 本", n)


main()
