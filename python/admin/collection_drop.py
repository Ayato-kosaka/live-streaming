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
    # #171 で `POST /ideas/:id/vote` を畳んだので、**もう1件も増えない。**
    # 中身は `{at: <押した時刻>}` だけで、書類IDが `<企画のID>_<uid か端末ID>`。
    # **人の書いた字は1文字も入っていない**（1人1票を守るためだけの入れ物）。
    # 票の数そのものは islandIdeas.votes に残るので、消しても数は失われない。
    "islandVotes": "#171 で口を畳んだ。中身は押した時刻だけで、字は入っていない",
}
# **`islandIdeas` はここに入れない。** 8件とも視聴者さんの書いた字で、
# #162 で付箋へ移したあとも `movedTo` の印を付けて残してある。
# **書いた人の字は消さない。**
#
# **`monthlyReview` もここに入れない。** コードから参照が0に見えるが、
# 月末配信の OBS 同期が生きている（`public/202608_monthly_review.html` と
# `.claude/skills/monthly-review/SKILL.md`）。**数えただけで判断しない。**
#
# `islandDrafts` は本番に1件も無く、コレクションそのものが存在しない。
# `nordicPhotos` / `nordicDays` は #202 で移し先ができたが、
# **書く口をまだ両方動かしている**ので生きている。畳んでからにする。

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
