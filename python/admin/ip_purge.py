"""付箋と企画に溜まった `ip` の欄を落とす。**書類そのものは消さない。**

GitHub #293 (A)。**一度きりの片づけ。** 流し終わったら、このファイルは
「昔こういうものが入っていた」という記録として残す（消さない）。

ARGS 例:
  {}                … 入れ物ごとに「全部で何件 / `ip` が入っているのが何件」
                      を数えるだけ。**1バイトも書かない**
  {"apply": true}   … `ip` の欄だけを落とす。落としたあと数え直して 0 を確かめる
  {"limit": 200000} … 1入れ物あたり数える上限（既定 100000）

## なぜ消すのか

`POST /island-api/notes` と `/nextplans` が、視聴者さんの書いた付箋・企画と
一緒に `x-forwarded-for` の先頭の IP を保存していた。

**読む仕組みがどこにも無かった。** 消す期限も決まっていなければ、`/privacy`
にも1行も書いていない。付箋も企画も**消さない設計**なので、置いておけば永久に
残る。視聴者さんは「付箋を貼る」つもりで書いていて、IP が一緒に残るとは
思っていない。**使う仕組みの無いものを持ち続ける理由が無く、持っているだけで
責任だけが増える。** 取るのは Functions 側でやめた（`functions/src/islandApi.ts`）。

## `ip: null` も落とす

`fwd()` はヘッダが無ければ `null` を返していたので、**欄はあるが中身が空**の
書類がある。数え直しを 0 にするために、値ではなく**欄があるかどうか**で拾う。

## ログに出すのは件数だけ

このリポジトリは公開で、Actions のログも誰でも読める。**IP の値も書類IDも
1文字も出さない。** 引くときも `select(["ip"])` にして、本文や名前を手元へ
持ってこない。出したものを実際に grep して確かめてあるのが
`ip_purge_selftest.py`。
"""

from _fs import args, db, log

# 片づける入れ物。**この2つだけ。**
#   islandNotes       … テーマに貼られた付箋（#160）
#   islandStreamEvent … 掲示板に出す企画（#161。旧 islandNextPlans）
#
# `islandIdeas` は入れていない。8件とも #162 で付箋へ移してあり、`ip` は
# 移した先（islandNotes）にコピーされている。**移し元は「取り違えたときに
# 戻す控え」として残してある**ので、ここで片方だけ落とすと控えにならない。
# 落とすなら入れ物ごと畳む話になるので、別に判断する（報告に書いた）。
COLLECTIONS = ("islandNotes", "islandStreamEvent")

FIELD = "ip"

# 1回のまとめ書きで触る数。Firestore の上限は 500
BATCH = 400


def delete_mark():
    """欄そのものを消す印（`firestore.DELETE_FIELD`）。

    読み込みを関数の中でやるのは `_fs.db()` と同じ理由。加えて、
    確かめ（`ip_purge_selftest.py`）がここを偽物に差し替えて動かすので、
    **google-cloud-firestore が入っていない箱でも振る舞いを再現できる。**
    """
    from google.cloud import firestore

    return firestore.DELETE_FIELD


def scan(client, col: str, cap: int) -> tuple[int, list]:
    """その入れ物の件数と、`ip` の欄を持っている書類の参照を集める。

    `select([FIELD])` で引くのは、**ほかの欄を1バイトも手元に持ってこない**ため。
    視聴者さんの書いた本文も名前も読まずに済む。欄が無い書類は `{}` が返るので、
    値の真偽ではなく `in` で見る（`ip: null` も「欄がある」ほうに数える）。

    @return (全部で何件, `ip` を持つ書類の参照)
    """
    total = 0
    hits = []
    for d in client.collection(col).select([FIELD]).limit(cap).stream():
        total += 1
        if FIELD in (d.to_dict() or {}):
            hits.append(d.reference)
    return total, hits


def strip(client, refs: list, mark) -> int:
    """まとめ書きで `ip` の欄だけを落とす。

    1件ずつ往復しない。`update` に欄を1つだけ渡すので、**ほかの欄は
    読みも書きもしない**（`set` と違って置き換えにならない）。
    """
    done = 0
    for i in range(0, len(refs), BATCH):
        chunk = refs[i:i + BATCH]
        batch = client.batch()
        for ref in chunk:
            batch.update(ref, {FIELD: mark})
        batch.commit()
        done += len(chunk)
        log.info("  %d / %d", done, len(refs))
    return done


def count(client, cap: int, head: str) -> tuple[dict, dict]:
    """入れ物ごとに数えて出す。**出すのは名前と件数だけ。**"""
    totals, hits = {}, {}
    for col in COLLECTIONS:
        total, refs = scan(client, col, cap)
        totals[col] = total
        hits[col] = refs
        log.info(
            "%s %-20s 全部で %6d 件 / %s が入っているのが %6d 件",
            head, col, total, FIELD, len(refs),
        )
    return totals, hits


def run(client, apply: bool, mark, cap: int) -> int:
    """空回しと本番を1本にしたもの。**既定は1バイトも書かない。**

    @return 落とした件数
    """
    before, hits = count(client, cap, "いま  ")
    n = sum(len(v) for v in hits.values())
    if n == 0:
        log.info("%s の入っている書類はありません", FIELD)
        return 0
    if not apply:
        log.info('dry-run。実際に落とすには {"apply": true} を渡す（%d 件）', n)
        return 0

    gone = 0
    for col in COLLECTIONS:
        if not hits[col]:
            continue
        log.info("%s の %s を落とします（%d 件）", col, FIELD, len(hits[col]))
        gone += strip(client, hits[col], mark)

    # **「消したつもり」を作らない。** 同じ実行の中でもう一度数える
    after, left = count(client, cap, "あと  ")
    bad = [c for c in COLLECTIONS if after[c] != before[c]]
    if bad:
        # 欄を落とすだけなので、書類の数は1件も動かないはず
        log.error("**書類の数が変わりました**: %s", ", ".join(bad))
        raise SystemExit(1)
    rest = sum(len(v) for v in left.values())
    if rest:
        log.error("**%s が %d 件 残っています。**", FIELD, rest)
        raise SystemExit(1)
    log.info("%d 件から %s の欄を落としました。残り 0 件", gone, FIELD)
    return gone


def main() -> None:
    """エントリポイント。**既定は dry-run。**"""
    a = args()
    cap = int(a.get("limit", 100000))
    apply = bool(a.get("apply", False))
    client = db()
    run(client, apply, delete_mark() if apply else None, cap)


if __name__ == "__main__":
    main()
