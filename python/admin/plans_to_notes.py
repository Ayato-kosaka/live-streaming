"""企画として出されたものを、付箋（islandNotes）へ移す。

## なぜ移すのか

本番の企画（`islandStreamEvent`）は5件。そのうち**あやとが自分で出した2件を除く
3件は、企画ではなかった**（2026-09-30 に数えた）。

| 何が出ていたか | 本当は |
| --- | --- |
| ベラトとギロカストラを見てほしい | アルバニアへの注文＝付箋 |
| テス国立公園とブルーアイを観たい | 同上 |
| イラン旅から見てます（長く見ている人の便り） | 注文ですらない。あやとへのひとこと |

**視聴者さんが企画の欄に正しく出したものは、1件も無い。** 欄の問題であって、
書いた人の問題ではない（`/board` の名前が「企画をだす」で、付箋はその中のタブ
だった）。入口そのものは別に直す。ここでやるのは、すでに入っている3件を
本来の場所へ移すこと。

## 何をするか

`notes_migrate.py`（#162 で islandIdeas を移したときの道具）と同じ形にしてある。

| | |
| --- | --- |
| 付箋を作る | `islandNotes/<企画と同じID>`。題を本文に、ハートはそのまま引き継ぐ |
| もとの企画 | **消さない。** `movedTo` を書いて `hidden: true` で一覧から下ろす |

**書類IDを企画とそろえる。** 取り違えたときに1対1で戻せるし、`movedTo` の
書き込みだけが失敗しても、二度流せば同じ場所に同じものが書かれる。

## ハートの書類（islandHearts）は移さない

移すのは数（`hearts`）だけ。1人1回を守る書類は作り直さない。押した人が
もう一度押せることになるが、**押すと外れる**作りなので増え続けはしない。
`notes_migrate.py` と同じ決まり。

## 本文は1文字も直さない

人の字なので、題をそのまま付箋の本文にする。企画の `note`（説明欄）が
入っているものは、題のあとに改行して足す。3件とも `note` は空。

ARGS 例:
  {}                何をどこへ動かすかを出すだけ（**既定は dry-run**）
  {"apply": true}   実際に書く
"""

import time

from _fs import args, db, log, show

# 移す先。**書類IDで引く。** 本文で引くと、1文字直されただけで当たらなくなる。
#
#   theme  宛先。`site/content/themes.ts` にある id と同じもの
#   why    なぜそこへ移すか。ログに出る（あとから読む人のため）
MOVES: dict[str, dict] = {
    # さおりさんの2件。どちらもアルバニアで見てほしい場所の注文
    "lOKrcsOkf3luKyjv4vBH": {"theme": "albania", "why": "アルバニアで見る場所の注文"},
    "wwhFNUaiCOBTKBUzNGse": {"theme": "albania", "why": "アルバニアで見る場所の注文"},
    # 長く見てくれている人からの便り。注文ではないので、ひとことの宛先へ
    "3GFPWWdCiAHgNm51h0uE": {"theme": "hello", "why": "注文ではなく、あやとへのひとこと"},
}


def hearts(v: dict) -> int:
    """ハートの数。壊れた値でも 0 以上の整数に丸める。"""
    try:
        return max(0, int(v.get("hearts") or 0))
    except (TypeError, ValueError):
        return 0


def body(v: dict) -> str:
    """付箋の本文。**題をそのまま使う。**

    企画は「題ひとつで出して、あとから育てる」作りなので、視聴者さんが出した
    ものは題に全部入っている。説明欄（`note`）が育っていれば、そのあとに足す。
    """
    title = str(v.get("title") or "").strip()
    note = str(v.get("note") or "").strip()
    return f"{title}\n\n{note}" if note else title


def plan(plans: dict[str, dict]) -> list[dict]:
    """何をどこへ動かすかを、書く前に全部作る。

    表にある企画が1つでも見つからなければ、**1件も書かずに止める。**
    途中まで書いてから落ちると、どこまで進んだかが分からなくなる。

    `notes_migrate.py` と違って「表に無い企画があれば止める」はしない。
    あちらは8件ぜんぶを移す移行だったが、こちらは**残す企画がある**
    （あやとが出した2件）ので、表に無いものが在るのがふつう。
    """
    missing = [i for i in MOVES if i not in plans]
    if missing:
        log.error("表にある企画が見つかりません: %s", missing)
        raise SystemExit(1)

    out: list[dict] = []
    for pid, rule in MOVES.items():
        v = plans[pid]
        if v.get("movedTo"):
            log.info("済み %s → %s（飛ばす）", pid, v["movedTo"])
            continue
        text = body(v)
        if not text:
            log.error("%s の題が空です。移す字がありません", pid)
            raise SystemExit(1)
        out.append(
            {
                "id": pid,
                "theme": rule["theme"],
                "why": rule["why"],
                "text": text,
                "by": v.get("by") or None,
                "icon": v.get("icon") or None,
                "hearts": hearts(v),
                "cid": v.get("cid"),
                "uid": v.get("uid"),
                "createdAt": v.get("createdAt"),
                "status": v.get("status"),
            },
        )
    return out


def preview(rows: list[dict]) -> None:
    """何をどこへ動かすかを、1件ずつ出す。

    **公開のログなので、字は `show` で短くする。** 本文そのものは島に出ている
    ものだが、ここで全文を流す理由が無い（`docs/island-audit.md`）。
    """
    for r in rows:
        log.info("%s", "─" * 60)
        log.info("islandStreamEvent/%s  →  islandNotes/%s", r["id"], r["id"])
        log.info("  宛先     %s（%s）", r["theme"], r["why"])
        log.info("  いまの段 %s", r["status"])
        log.info("  本文     %s", show(r["text"]))
        log.info("  ハート   %d（そのまま引き継ぐ）", r["hearts"])
        log.info("  もとの企画は消さない。movedTo を書いて hidden: true にする")


def write(client, rows: list[dict]) -> None:
    """実際に書く。1件ずつ、付箋 → 印、の順で。

    先に付箋を作るのは、途中で落ちたときに「印だけ付いて中身が無い」を
    作らないため。逆の順で落ちると、二度流しても飛ばされて字が消えたままになる。
    """
    now = int(time.time() * 1000)
    for r in rows:
        client.collection("islandNotes").document(r["id"]).set(
            {
                "theme": r["theme"],
                "text": r["text"],
                "by": r["by"],
                "icon": r["icon"],
                "hearts": r["hearts"],
                "byOwner": False,
                "hidden": False,
                "archived": False,
                "cid": r["cid"],
                "uid": r["uid"],
                "createdAt": r["createdAt"],
                # どこから来たか。取り違えていたときに戻せるように残す
                "movedFrom": r["id"],
                "movedAt": now,
            },
        )
        client.collection("islandStreamEvent").document(r["id"]).set(
            {"movedTo": r["id"], "movedAt": now, "hidden": True},
            merge=True,
        )
        log.info("移した %s → islandNotes/%s（%s）", r["id"], r["id"], r["theme"])


def main() -> None:
    """エントリポイント。**既定は dry-run。**"""
    a = args()
    client = db()
    plans = {d.id: (d.to_dict() or {}) for d in client.collection("islandStreamEvent").stream()}
    log.info("islandStreamEvent: %d 件 / 移す表: %d 件", len(plans), len(MOVES))
    rows = plan(plans)
    if not rows:
        log.info("移すものはありません（全部済んでいます）")
        return
    preview(rows)
    log.info("%s", "─" * 60)
    if not a.get("apply"):
        log.info('dry-run。実際に書くには {"apply": true} を渡す（%d 件）', len(rows))
        return
    write(client, rows)
    log.info("%d 件を移しました", len(rows))


main()
