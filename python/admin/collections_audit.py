"""本番の Firestore に、いまどのコレクションが何件あるかを数える。**読むだけ。**

ARGS 例:
  {}                       … 全部のルートコレクションを数える
  {"limit": 5000}          … 1コレクションあたり数える上限（既定 5000）

## なぜ要るか

#202 で入れ物を作り直したとき、**新しい名前へ移したのに古い名前が残った。**
コードを grep しても「もう誰も読んでいない」ことしか分からず、
**本番にデータが残っているかどうかは分からない。** 消す前にここで数える。

件数は `select([])`（フィールドを1つも取らない）で数えるので、
中身は読まない。名前と件数しか出さない（このリポジトリは公開）。
"""

from _fs import args, db, log


def main() -> None:
    a = args()
    cap = int(a.get("limit", 5000))
    client = db()

    rows = []
    for col in client.collections():
        # フィールドを取らずに数える。中身を読まないので安い
        n = sum(1 for _ in col.select([]).limit(cap).stream())
        rows.append((col.id, n, n >= cap))

    rows.sort(key=lambda r: (-r[1], r[0]))
    log.info("ルートコレクション %d 本", len(rows))
    for name, n, capped in rows:
        log.info("  %-28s %6d%s", name, n, " 以上（上限で打ち切り）" if capped else "")

    empty = [r[0] for r in rows if r[1] == 0]
    if empty:
        log.info("")
        log.info("**0件のもの**（消しても失うものが無い）: %s", ", ".join(empty))


main()
