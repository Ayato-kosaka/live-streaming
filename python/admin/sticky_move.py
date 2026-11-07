"""付箋の宛先（theme）を、別の宛先へ付け替える。

    script: sticky_move
    args:   {"from": "north-macedonia", "to": "bulgaria", "match": "ブルガリア|ソフィア"}
    args:   {..., "apply": true}        … 実際に書く

**既定は書かない。** 本番のデータなので、何件当たるかを先に見てから流す。

## なぜ要るのか

あやと（2026-11-07）:

> 北マケドニアでやってほしいの付箋に1件来てたんですけど、
> それブルガリアの話だったんでちょっと付け替えといてください。

掲示板の宛先は貼るときに決まる（`POST /stickies` の `theme`）。
貼った人は**行き先が増える前に**書いているので、中身と宛先がずれることがある。
画面から直す口は無い——**貼った人の文は1文字も触らずに、宛先だけ動かす。**

## 素性をログに出さない

Actions のログは**誰でも読める。** 本文も名乗りも、`_fs.show()`（`logsafe.sketch()`）を
通してしか出さない。**当たった件数と書類のIDだけ**を素で出す
（IDは人に結びつかない）。誰の付箋かを確かめたくなっても、ここでは出さない。

## 当てかた

`match` は本文（`text`）に当てる正規表現。**人の名前では選ばない**
——名前で選ぶと、同じ人の別の話まで動く。

## 元の宛先を控える

`themeWas` に前の宛先を残す。**戻せるようにしておく**——
掲示板は `theme` しか見ないので、戻すときはここを読めばいい。
"""

import re

from _fs import args, db, log, need, show


def main() -> None:
    a = args()
    src, dst = need(a, "from", "to")
    pat = re.compile(str(a.get("match") or "."))
    apply = bool(a.get("apply", False))
    client = db()

    # 索引を作る権限が無い（#168）ので `where` は使わず、引いてから選り分ける
    docs = list(client.collection("islandNotes").limit(1000).stream())
    here = [d for d in docs if (d.to_dict() or {}).get("theme") == src]
    hit = [d for d in here if pat.search(str((d.to_dict() or {}).get("text") or ""))]

    log.info("islandNotes %d 件 / 宛先 %s に %d 件 / そのうち当たったもの %d 件",
             len(docs), src, len(here), len(hit))
    for d in hit:
        # **素で出してよいのは ID だけ。** 中身は塞いだ写しを通す
        log.info("  %s  %s", d.id, show(d.to_dict()))

    if not hit:
        log.info("当たるものがありません。`match` を見直してください")
        return
    if not apply:
        log.info('書いていません。流すなら args に {"apply": true} を入れてください')
        return

    for d in hit:
        v = d.to_dict() or {}
        client.collection("islandNotes").document(d.id).set(
            {"theme": dst, "themeWas": v.get("theme") or src}, merge=True)
    log.info("%d 件の宛先を %s → %s にしました", len(hit), src, dst)

    # 書けたことを、引き直して確かめる
    for d in hit:
        after = client.collection("islandNotes").document(d.id).get().to_dict() or {}
        log.info("  後: %s theme=%s themeWas=%s",
                 d.id, after.get("theme"), after.get("themeWas"))


main()
