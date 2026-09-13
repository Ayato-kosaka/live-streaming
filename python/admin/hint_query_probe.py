"""候補（`hints`）を引く**あの範囲引きが、本番で通るか**だけを確かめる。

ARGS 例:
  {}                      … 辞書から実際に在る名前を3つ拾って、それで引く
  {"labels": ["ゆずたつ"]} … 呼び名を指して引く（`@` は付けても付けなくてもよい）

## なぜ `donor_hints_probe.py` では足りないか

あちらは `GET /island-api/donors` を叩いて、**紐付け待ち（`state: "new"`）の
行に候補が付くか**を見る。ところが本番の対応表に `new` の行は1行も無く、
あちらは毎回「候補の出番はいま無い状態です」で**引かずに終わっていた。**

つまり `hintsFor` の範囲引きは、**本番で一度も通っていない。**
`hintsFor` は失敗すると `logger.warn` を出して `hints: []` に落ちる作りなので、
索引で落ちていても画面は静かに「候補なし」になる。**壊れているのと、
本当に候補が0件なのが見分けられない**まま、あやとが 9/27 に繋がるのを待つことになる。

`new` の行を作って確かめる手もあるが、**`islandDonors` は投げ銭してくれた人の
対応表**で、偽の行を足すと消す手立てが無い（`firestore_delete.py` の
`DELETABLE` に載っていないし、載せるべきでもない）。**確かめたいのは
範囲引きそのものなので、そこだけ同じ形で引く。**

## 同じ形で引く、とは

`functions/src/donors.ts` の `hintPrefixes` と `hintsFor` と、
**同じ2本・同じ番兵・同じ上限・`orderBy` なし**で引く。
ここを似せずに書くと、通ったのは別の引きかたということになる。

## 出さないもの

**このリポジトリは公開で、Actions のログも誰でも読める。**
`islandChannels` は視聴者さんのチャンネルIDと名乗っている名前の対応表。
出すのは**引けたかどうかと件数だけ。** 名前もチャンネルIDも出さない
（引く文字列も名前の一部なので出さない。何本目か、で数える）。
"""

from _fs import args, db, log

# `functions/src/donors.ts` と同じ値。**片方だけ動かすと、ここで通っても
# 本番で落ちる。** 変えるときは両方
HINT_HIGH = ""
HINT_SCAN = 5
HINT_MAX = 3


def prefixes(label: str) -> list:
    """`hintPrefixes` と同じ。`@` あり・なしの2本。"""
    base = label.strip().lstrip("@")
    if not base:
        return []
    return ["@" + base, base]


def sample_labels(client, n: int) -> list:
    """辞書から、実際に在る名前を n 個借りてくる。

    引く文字列を手で決めると、**当たらない字で引いて「0件」を
    「引けた」と読む**ことになる。1件以上返るはずの字で引くために、
    名乗っている名前そのものを種にする。
    """
    out = []
    for d in client.collection("islandChannels").limit(200).stream():
        name = (d.to_dict() or {}).get("name")
        if isinstance(name, str) and len(name.lstrip("@")) >= 2:
            out.append(name)
        if len(out) >= n:
            break
    return out


def main() -> None:
    a = args()
    client = db()
    col = client.collection("islandChannels")

    labels = a.get("labels")
    if not labels:
        labels = sample_labels(client, 3)
        log.info("辞書から %d件 借りて引きます", len(labels))
    if not labels:
        log.error("辞書が空です。引く種がありません")
        raise SystemExit(1)

    ok = 0
    for i, label in enumerate(labels, 1):
        hit = {}
        for j, p in enumerate(prefixes(label), 1):
            try:
                docs = list(
                    col.where("name", ">=", p)
                    .where("name", "<", p + HINT_HIGH)
                    .limit(HINT_SCAN)
                    .stream()
                )
            except Exception as e:  # noqa: BLE001
                # **型と先頭だけ。** 例外の本文に引いた字が入ることがある
                log.error("%d本目の %d 本目で落ちました: %s",
                          i, j, type(e).__name__)
                log.error("  %s", str(e)[:120])
                raise SystemExit(1) from None
            log.info("  %d本目 / 前方一致 %d本目 → %d件", i, j, len(docs))
            for d in docs:
                hit[d.id] = (d.to_dict() or {}).get("days") or 0
        n = min(len(hit), HINT_MAX)
        log.info("  %d本目 → 畳んで %d件、画面に出るのは %d件", i, len(hit), n)
        if n:
            ok += 1

    log.info("")
    if ok == 0:
        # **「0件」と「引けなかった」は違う。** ここは在る名前で引いているので、
        # 0件はおかしい
        log.error("%d本ぜんぶで候補が0件でした。", len(labels))
        log.error("辞書に在る名前で引いているので、**引けていない**ほうを疑ってください")
        raise SystemExit(1)
    log.info("%d本のうち %d本で候補が返りました。", len(labels), ok)
    log.info("前方一致は本番で通ります（複合索引は要りませんでした）")


main()
