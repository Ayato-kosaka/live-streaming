"""その日の出来事の箱（`islandStreamEvent`）と、旧い企画の箱を数える。**読むだけ。**

なぜ要るか（#1281）。視聴者さんが企画を出す道（提案・ハート・段）を畳むと、
箱に残る行のうち「出来事として結ばれているもの」と「誰かの提案のまま
残っているもの」を、読む側（写真を貼る先・カード）がどう扱うかが変わる。
欄の名前だけでは分からないので、**欄の組み合わせごとの件数**を出す。

旧い3つの箱（`islandNextPlans` `islandIdeas` `islandDrafts`）は、消す前に
本番の件数を数え直す。

ARGS: {}（入力なし）

**出すのは件数だけ。** 題・本文・書類ID・書いた人は1つも出さない（ログは公開）。
"""

from collections import Counter

from _fs import db, log

OLD = ["islandNextPlans", "islandIdeas", "islandDrafts"]


def main() -> None:
    client = db()
    combos: Counter = Counter()
    total = 0
    for d in client.collection("islandStreamEvent").stream():
        v = d.to_dict() or {}
        total += 1
        combos[
            (
                str(v.get("status") or "—"),
                "source" if v.get("source") else "—",
                "planId" if v.get("planId") else "—",
                "board=false" if v.get("board") is False else "—",
                "hidden" if v.get("hidden") is True else "—",
                "archived" if v.get("archived") is True else "—",
                "uid/cid" if (v.get("uid") or v.get("cid")) else "—",
                "hearts>0" if (v.get("hearts") or 0) > 0 else "—",
                "videoIds" if v.get("videoIds") else "—",
                "date" if v.get("date") else "—",
            )
        ] += 1
    log.info("islandStreamEvent: %d件", total)
    log.info("  status / source / planId / board / hidden / archived / 書いた人 / ハート / 動画 / 日付 : 件数")
    for k, n in combos.most_common():
        log.info("  %s : %d", " / ".join(k), n)

    for col in OLD:
        n = 0
        hidden = 0
        for d in client.collection(col).stream():
            n += 1
            if (d.to_dict() or {}).get("hidden") is True:
                hidden += 1
        log.info("%s: %d件（うち hidden %d件）", col, n, hidden)


main()
