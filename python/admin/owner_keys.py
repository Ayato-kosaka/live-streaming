"""あやとの `islandUsers` に、どの鍵が入っているかだけを見る。

**値は1文字も出さない。** このリポジトリは公開で、Actions のログも誰でも
読める（`CLAUDE.md`）。出すのは「入っているか」「何文字か」「末尾4文字」だけ。
末尾4文字は、入れ直したときに同じものか違うものかを見分けるためで、
それだけでは鍵にならない。

何のためにあるか:
  アラートボックス（#180）が「投げ銭のつなぎ先を取れませんでした」で
  止まったとき、原因が2つある。

    1. OBS の URL の `?k=` が古い（合言葉が合っていない）
    2. Doneru の鍵がまだ Firestore に入っていない（#179）

  口（`GET /alertbox/{id}/wss`）は**どちらも 404 を返す。** 書き分けると、
  合言葉が当たったことだけを外から確かめられてしまうため。
  そのぶん、こちら側でどちらなのかを見る道具が要る。

ARGS: 入力なし
"""

from _fs import db, log

FIELDS = ["doneruKey", "doneruGoalKey", "alertboxId", "rouletteId", "remoteId"]


def main() -> None:
    client = db()
    docs = list(client.collection("islandUsers").where("admin", "==", True).limit(2).stream())
    if not docs:
        log.error("admin の islandUsers が1件もありません")
        raise SystemExit(2)
    if len(docs) > 1:
        log.warning("admin が %d 人います。1人目だけ見ます", len(docs))

    d = docs[0]
    data = d.to_dict() or {}
    log.info("islandUsers/%s（admin）", d.id)
    for f in FIELDS:
        v = data.get(f)
        if not v:
            log.info("  %-14s 入っていない", f)
            continue
        s = str(v)
        log.info("  %-14s 入っている（%d文字・末尾 %s）", f, len(s), s[-4:])


if __name__ == "__main__":
    main()
