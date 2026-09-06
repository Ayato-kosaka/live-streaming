"""islandIdeas に貼られた8件を、テーマ付きの付箋（islandNotes）へ移す。

GitHub #162（親 #159）。

## なぜ移すのか

入力欄に宛先が無かったので、書いた人が `【ポーランド】` を自分で発明していた。
こちらはその `【】` を正規表現で読んで棚に仕分けていた（回避策の上に建っていた）。
#160 で付箋に宛先の欄（`islandNotes.theme`）ができたので、本文の頭の札を
正式な欄へ移す。移し終われば、本文から推測して仕分けるところが1つも無くなる。

**急ぎの理由**: #160 で国のページの旧・投稿欄（`CountryIdeas`）を外したので、
いま `/nordic` と国のページから視聴者さんの投稿7件が見えていない。これを流すと戻る。

## 何をするか

| | |
| --- | --- |
| 付箋を作る | `islandNotes/<企画提案と同じID>`。本文の `【】` を外し、票を `hearts` に移す |
| 二重投稿 | **消さずにしまう**（`archived: true`）。ハートは残るほうへ足す |
| もとの提案 | **消さない。** `movedTo` を書いて印を付け、`hidden: true` で一覧から下ろす |

**書類IDは、もとの提案とそろえてある。** 取り違えたときに1対1で戻せるし、
`movedTo` の書き込みだけが失敗しても、二度流せば同じ場所に同じものが書かれる。

`hidden: true` を一緒に付けるのは、付けないと同じ字が2か所に出るため。
企画の一覧（`/board` の「企画をだす」）と付箋の棚に、同じ7件が並ぶ。
**消してはいない**ので、`movedTo` を消して `hidden` を戻せば元に戻る。

## 票（islandVotes）の書類は移さない

移すのは数（`hearts`）だけ。1人1回を守る書類（`islandHearts`）は作らない。
票を入れた人がもう一度ハートを押せることになるが、**押すと外れる**作りなので
増え続けはしない。書類まで移すと、この移行が触るコレクションが2つ増える。

ARGS 例:
  {}                何をどこへ動かすかを出すだけ（**既定は dry-run**）
  {"apply": true}   実際に書く
"""

import time

from _fs import args, db, log

# 移す先。**書類IDで引く。** 本文で引くと、1文字直されただけで当たらなくなる。
#
#   theme    宛先。`site/content/themes.ts` にある id と同じもの
#   strip    本文の頭から外す札。**その札で始まっていなければ止める**
#   tail     本文の末尾から外す字（名乗りを名前欄へ移すぶん）
#   by       名前欄。無ければもとの名前のまま
#   archive  しまう（消さない）
#   plus     ここに挙げた提案の票を、自分のハートに足す（しまうほうを引き取る）
MOVES: dict[str, dict] = {
    # サイトへの要望。旅の話ではないので「あやと島へ」に置く
    "2QeTx7MLSN1ClEDhldxv": {"theme": "island", "strip": "【北欧旅】"},
    "CJeTa3oBEO7qtPpMhUVR": {"theme": "nordic", "strip": "【北欧旅】"},
    # 同じ人が絵文字だけ変えて2回出したうちの、あとに出したほう。こちらを残す
    "M5GhsFZOUF13tAau3y3k": {
        "theme": "poland",
        "strip": "【ポーランド】",
        "plus": ["LNLdEZEJqgQ46WmHj1tU"],
    },
    # 先に出したほう。**しまうだけで、字は消さない**（あやとの指示）
    "LNLdEZEJqgQ46WmHj1tU": {
        "theme": "poland",
        "strip": "【ポーランド】",
        "archive": True,
    },
    "JFWAy0TbQid83G8xjFiM": {"theme": "lithuania", "strip": "【リトアニア】"},
    "oNthqBzpcpmYz4PQj51U": {
        "theme": "leg-kutaisi-katowice",
        "strip": "【区間:kutaisi-katowice】",
    },
    # 「by まこも」は、あやと本人が名乗ったもの（#162 のコメント）。
    # 本文に名前を書かせない欄ができたので、そちらへ移す
    "RjOICXwjFjO1CNG2Vvtx": {
        "theme": "poland",
        "strip": "【ポーランド】",
        "tail": " by まこも",
        "by": "あやとグルメアプリ",
    },
    # 札を付けずに貼られたぶん。本文はそのまま
    "upbiwGJRWLC3KmQllUYo": {"theme": "nordic"},
}


def votes(v: dict) -> int:
    """票の数。壊れた値でも 0 以上の整数に丸める。"""
    try:
        return max(0, int(v.get("votes") or 0))
    except (TypeError, ValueError):
        return 0


def kept_by(idea_id: str) -> str | None:
    """しまうほうの票を、どの付箋が引き取るか。"""
    return next((k for k, v in MOVES.items() if idea_id in v.get("plus", [])), None)


def plan(ideas: dict[str, dict]) -> list[dict]:
    """何をどこへ動かすかを、書く前に全部作る。

    足りないもの・食い違うものがあれば、**1件も書かずに止める。**
    途中まで書いてから落ちると、どこまで進んだかが分からなくなる。
    """
    missing = [i for i in MOVES if i not in ideas]
    if missing:
        log.error("表にある提案が見つかりません: %s", missing)
        raise SystemExit(1)
    unknown = [i for i in ideas if i not in MOVES]
    if unknown:
        # 8件ぜんぶを移す前提の移行なので、知らないものが増えていたら止める。
        # 「移したつもりで1件置き去り」を、あとから気づく形にしない
        log.error("表に無い提案があります（あとから増えた？）: %s", unknown)
        raise SystemExit(1)

    out: list[dict] = []
    for idea_id, rule in MOVES.items():
        v = ideas[idea_id]
        if v.get("movedTo"):
            log.info("済み %s → %s（飛ばす）", idea_id, v["movedTo"])
            continue

        text = str(v.get("text") or "")
        head = rule.get("strip", "")
        if head and not text.startswith(head):
            log.error("%s の本文が %s で始まっていません: %s", idea_id, head, text)
            raise SystemExit(1)
        body = text[len(head):] if head else text
        tail = rule.get("tail", "")
        if tail and not body.endswith(tail):
            log.error("%s の本文が %s で終わっていません: %s", idea_id, tail, body)
            raise SystemExit(1)
        if tail:
            body = body[: -len(tail)]
        body = body.strip()

        plus = rule.get("plus", [])
        hearts = votes(v) + sum(votes(ideas[p]) for p in plus)
        if rule.get("archive"):
            # しまうほうの票は、残るほうへ足してある。両方に置くと二重に数える
            hearts = 0

        out.append(
            {
                "id": idea_id,
                "theme": rule["theme"],
                "before": text,
                "text": body,
                "by": rule.get("by") or v.get("name") or None,
                "was_by": v.get("name"),
                "hearts": hearts,
                "from_votes": votes(v),
                "plus": plus,
                "archive": bool(rule.get("archive")),
                "cid": v.get("cid"),
                "uid": v.get("uid"),
                "ip": v.get("ip"),
                "createdAt": v.get("createdAt"),
            },
        )
    return out


def show(rows: list[dict]) -> None:
    """何をどこへ動かすかを、1件ずつ出す。**しまう1件も出す。**"""
    for r in rows:
        log.info("%s", "─" * 60)
        log.info("islandIdeas/%s  →  islandNotes/%s", r["id"], r["id"])
        log.info("  テーマ   %s%s", r["theme"], "  ★しまう（消さない）" if r["archive"] else "")
        log.info("  いまの字 %s", r["before"])
        log.info("  移す字   %s", r["text"])
        log.info("  名前     %s → %s", r["was_by"], r["by"])
        if r["plus"]:
            log.info("  ハート   %d ＋ %s のぶん → %d", r["from_votes"], r["plus"], r["hearts"])
        elif r["archive"]:
            log.info("  ハート   %d → %d（%s へ渡す）", r["from_votes"], r["hearts"], kept_by(r["id"]))
        else:
            log.info("  ハート   %d → %d", r["from_votes"], r["hearts"])
        log.info("  もとの提案は消さない。movedTo を書いて hidden: true にする")


def write(client, rows: list[dict]) -> None:
    """実際に書く。1件ずつ、付箋 → 印、の順で。

    先に付箋を作るのは、途中で落ちたときに「印だけ付いて中身が無い」を
    作らないため。逆の順で落ちると、二度流しても飛ばされて字が消えたままになる。
    """
    now = int(time.time() * 1000)
    for r in rows:
        note = {
            "theme": r["theme"],
            "text": r["text"],
            "by": r["by"],
            "hearts": r["hearts"],
            "byOwner": False,
            "hidden": False,
            "archived": r["archive"],
            "cid": r["cid"],
            "uid": r["uid"],
            "ip": r["ip"],
            "createdAt": r["createdAt"],
            # どこから来たか。取り違えていたときに戻せるように残す
            "movedFrom": r["id"],
            "movedAt": now,
        }
        if r["archive"]:
            note["archivedAt"] = now
            note["heartsMovedTo"] = kept_by(r["id"])
        client.collection("islandNotes").document(r["id"]).set(note)
        client.collection("islandIdeas").document(r["id"]).set(
            {"movedTo": r["id"], "movedAt": now, "hidden": True},
            merge=True,
        )
        log.info("移した islandIdeas/%s → islandNotes/%s（%s）", r["id"], r["id"], r["theme"])


def main() -> None:
    """エントリポイント。**既定は dry-run。**"""
    a = args()
    client = db()
    ideas = {d.id: (d.to_dict() or {}) for d in client.collection("islandIdeas").stream()}
    log.info("islandIdeas: %d 件 / 移す表: %d 件", len(ideas), len(MOVES))
    rows = plan(ideas)
    if not rows:
        log.info("移すものはありません（全部済んでいます）")
        return
    show(rows)
    log.info("%s", "─" * 60)
    if not a.get("apply"):
        log.info('dry-run。実際に書くには {"apply": true} を渡す（%d 件）', len(rows))
        return
    write(client, rows)
    log.info("%d 件を移しました", len(rows))


main()
