"""もう使わないコレクションを、まるごと消す。**既定は数えるだけ。**

ARGS 例:
  {"collection": "islandPolls"}                  … 何件消えるかを出すだけ
  {"collection": "islandPolls", "apply": true}   … 実際に消す

## 戻せないので、二重に縛ってある

1. **既定は dry-run。** `apply` を明示で渡すまで1件も消さない
2. **`DEAD` に名前が無いものは消せない。** 消してよいと判断が済んだものだけを
   このファイルに書く。引数で任意のコレクション名を渡して消せる道具にすると、
   打ち間違いが本番の生きたデータに当たる

`DEAD` に足すときは、**足す理由（どこへ移したか）を一緒に書く。**
書いていないと、次に読んだ人が「なぜ消してよかったのか」を追えない。
"""

from _fs import args, db, log, need

# 消してよいと判断が済んだコレクション。値は「なぜ消してよいか」
DEAD = {
    # 例:
    # "nordicPhotos": "#202 で islandStreamEventImage へ移した（images_migrate.py）",
}

# 1回のバッチで消す数。Firestore の上限は 500
BATCH = 400


def main() -> None:
    a = args()
    (col,) = need(a, "collection")
    apply = bool(a.get("apply", False))

    if col not in DEAD:
        log.error(
            "%s は DEAD に入っていません。**消してよいと判断が済んだものだけ**"
            " python/admin/collection_drop.py の DEAD に、理由と一緒に足してください",
            col,
        )
        raise SystemExit(2)

    log.info("%s — %s", col, DEAD[col])
    client = db()
    ref = client.collection(col)

    n = sum(1 for _ in ref.select([]).limit(100000).stream())
    log.info("いま %d 件", n)
    if n == 0:
        log.info("消すものはありません")
        return

    if not apply:
        log.info('--- {"apply": true} を渡すまで消しません ---')
        return

    gone = 0
    while True:
        docs = list(ref.select([]).limit(BATCH).stream())
        if not docs:
            break
        batch = client.batch()
        for d in docs:
            batch.delete(d.reference)
        batch.commit()
        gone += len(docs)
        log.info("  %d / %d", gone, n)

    log.info("%s を %d 件 消しました", col, gone)


main()
