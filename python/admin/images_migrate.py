"""`nordicPhotos` を `islandStreamEventImage` へ移す。#202

**既定では1行も書かない。** 何が起きるかを出すだけ。書くときは
`{"apply": true}` を付ける。

## 書類IDを変えない

`nordicPhotos/{id}` → `islandStreamEventImage/{id}`。**同じIDで移す。**

カードのIDが `<画像のID>__<チャンネルID>` なので、IDを変えると
**すでに動かしてあるカードの置き方が全部はぐれる。** 置き場（Storage）の
道も変えない。写真を焼き直さずに済む。

## どの企画のものかは、日付から当てる。ただし1本に決まらない

**1日に企画は何本でも立つ。** 9月11日は4本ある。写真は1枚につき企画
1つに付くので、そこは選ぶしかない。

- `{"assign": {"2026-09-11": "georgia-bye"}}` で日ごとに決められる
- 決めなければ**その日のいちばん古い企画**に付ける
- **どちらでも、割れている日はログに並べる。** 黙って1本に畳まない

付け替えは、あとから `/me` の画面（`POST /streamevents/images/{id}`）でも
できる。付け替えるとカードも作り直される。

## 元は消さない

`nordicPhotos` はそのまま残す。`/nordic` の画面がまだ読んでいて、
Functions と Hosting は別々に手で起動する（`CLAUDE.md`）ので、
どちらかが先に出た日に写真がまるごと消えないようにする。

ARGS 例:
  {}                                              … 出すだけ
  {"apply": true}                                 … 移す
  {"apply": true, "assign": {"2026-09-11": "nordic"}}
"""

from _fs import args, db, log

OLD = "nordicPhotos"
NEW = "islandStreamEventImage"
EVENTS = "islandStreamEvent"


def events_by_day(client) -> dict:
    """日付 -> その日の企画（古い順）。

    運営側の企画（`source` か `planId` を持つもの）を先に見る。
    **まだ誰も採っていない提案に写真を付けない。** 掲示板には日付だけ
    入った提案が並ぶので、そこへ黙って付くと提案が企画に化けて見える。

    Args:
        client: Firestore クライアント

    Returns:
        日付 -> [(企画ID, 題), ...]
    """
    rows = []
    for d in client.collection(EVENTS).stream():
        v = d.to_dict() or {}
        if v.get("hidden") is True or not isinstance(v.get("date"), str):
            continue
        rows.append(
            {
                "id": d.id,
                "date": v["date"],
                "title": v.get("title") or "",
                "real": bool(v.get("source") or v.get("planId"))
                or v.get("status") in ("next", "done"),
                "at": int(v.get("createdAt") or 0),
            }
        )
    out = {}
    for r in sorted(rows, key=lambda x: (not x["real"], x["at"])):
        out.setdefault(r["date"], []).append((r["id"], r["title"]))
    return out


def main() -> None:
    a = args()
    apply = a.get("apply") is True
    assign = a.get("assign") or {}
    client = db()
    if not apply:
        log.info("*** 出すだけです。書くには {\"apply\": true} を付けてください ***")

    by_day = events_by_day(client)
    old = {d.id: (d.to_dict() or {}) for d in client.collection(OLD).stream()}
    new = {d.id for d in client.collection(NEW).stream()}
    log.info("%s: %d枚 / %s: %d枚", OLD, len(old), NEW, len(new))

    todo, orphan, split = [], [], {}
    for pid, v in sorted(old.items(), key=lambda kv: kv[1].get("at") or 0):
        if pid in new:
            continue
        day = v.get("day")
        cands = by_day.get(day, [])
        if len(cands) > 1:
            split[day] = cands
        want = assign.get(day) or (cands[0][0] if cands else "")
        if not want:
            orphan.append((pid, day))
        todo.append((pid, v, day, want))

    log.info("移すもの: %d枚（もう向こうにある %d枚は触らない）",
             len(todo), len(old) - len(todo))
    for pid, _v, day, want in todo:
        log.info("  %s  %s  → %s", pid, day, want or "（企画なし）")

    if split:
        log.info("")
        log.info("**企画が複数立っている日**（1枚は1企画にしか付かない）:")
        for day, cands in sorted(split.items()):
            log.info("  %s", day)
            for cid, title in cands:
                mark = " ←使う" if assign.get(day, cands[0][0]) == cid else ""
                log.info("      %s  %s%s", cid, title, mark)
        log.info("  変えるには {\"assign\": {\"YYYY-MM-DD\": \"企画ID\"}}")

    if orphan:
        log.info("")
        log.info("**企画の無い日の写真** %d枚。移すが、カードは作られない:", len(orphan))
        for pid, day in orphan:
            log.info("  %s  %s", pid, day)
        log.info("  企画を立ててから /streamevents/images/{id} で付け替える")

    if not apply or not todo:
        return

    from datetime import datetime, timezone

    stamp = datetime.now(timezone.utc).isoformat()
    col = client.collection(NEW)
    batch = client.batch()
    n = 0
    for pid, v, day, want in todo:
        batch.set(
            col.document(pid),
            {
                "streamEventId": want,
                # 旧来の写真はぜんぶ「その日の1枚」＝カードになる絵
                "role": "card",
                "day": day,
                "storagePath": v.get("path") or "",
                "url": v.get("url") or "",
                "w": v.get("w") or 0,
                "h": v.get("h") or 0,
                "note": v.get("note") or "",
                "takenAt": day,
                "sortOrder": 0,
                "uid": v.get("uid"),
                "at": v.get("at") or 0,
                "createdAt": v.get("at") or 0,
                "updatedAt": stamp,
            },
        )
        n += 1
        if n >= 400:
            batch.commit()
            batch = client.batch()
            n = 0
    if n:
        batch.commit()
    log.info("%d枚 移しました。カードは python/island_cards.py が作ります", len(todo))


main()
