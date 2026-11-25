"""貼った写真の日付を、あとから直す（あやと島カード）。

ARGS 例:
    {"from": "2026-11-18", "to": "2026-11-17", "note": "…", "expect": 18}
        … 下見。**1バイトも書かない。** 当たる写真の数だけ出す
    {"from": "2026-11-18", "to": "2026-11-17", "note": "…", "expect": 18, "apply": true}
        … 直す

## なぜ要るか

写真の日は、貼るときに手で選ぶ（`site/components/nordic/PhotoPost.tsx`）。
1日ずれて貼られると、カードの日付もその日に当たる人もずれる。
消して貼り直すと画像のIDが変わり、カードのIDも置き方も変わるので、
**日付だけを差し替える口**（`POST /streamevents/images/<id>` の `day`）を叩く。
カードの作り直し（ずれた日の人のぶんを消し、正しい日の人のぶんを足す）は
口の側が `resyncCardsOfImage` でやる。Firestore を直には書かない。

## 選びかた

公開の `GET /nordic/photos` から、`from` の日で `note` が一致する写真を拾う。
**`expect` と数が合わなければ1枚も触らない**（取り違えた写真の日付を動かさない）。
写真のIDも一言も公開の口に出ているものなので、ログに出してよい。
"""

import sys
import time

import requests

from _fs import args, db, log, need
from _owner import API_BASE, call, owner_token


def pick(day: str, note: str) -> list:
    """公開の一覧から、その日のその一言の写真のIDを、貼った順に返す。"""
    res = requests.get(
        f"{API_BASE}/nordic/photos", params={"t": int(time.time())}, timeout=60
    )
    res.raise_for_status()
    out = []
    for g in res.json().get("days") or []:
        for p in g.get("photos") or []:
            if p.get("day") == day and (p.get("note") or "") == note:
                out.append((p.get("at") or 0, p["id"]))
    return [i for _, i in sorted(out)]


def main() -> None:
    a = args()
    src, dst, note = need(a, "from", "to", "note")
    expect = a.get("expect")
    ids = pick(src, note)
    log.info("%s の「%s」: %d枚", src, note, len(ids))
    if not isinstance(expect, int) or expect != len(ids):
        log.error("expect（%s）と数が合いません。1枚も触りません", expect)
        sys.exit(1)
    if not a.get("apply"):
        log.info("下見なので書いていません（%s へ移すなら apply: true）", dst)
        return

    tok = owner_token(db())
    for i in ids:
        got = call("POST", f"/streamevents/images/{i}", tok, {"day": dst})
        day = (got.get("image") or {}).get("day")
        if day != dst:
            log.error("%s の日付が %s のままです", i, day)
            sys.exit(1)
    left = pick(src, note)
    moved = pick(dst, note)
    log.info("直したあと: %s に %d枚 / %s に %d枚", src, len(left), dst, len(moved))
    if left or len(moved) < len(ids):
        log.error("移りきっていません")
        sys.exit(1)


if __name__ == "__main__":
    main()
