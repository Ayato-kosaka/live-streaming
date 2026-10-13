"""**まだ返していない付箋を、本番の値で数える。1バイトも書かない。**

    script: notes_unanswered   args: {}

机（`/me/desk`）の付箋の札に出る数と、**同じ物差しで数える。** 正本は
口のほう（`functions/src/islandApi.ts` の `waitingNote`）で、ここはその
**写し**——だから外すものを1つでも足し引きしたら、両方を直す。
食い違いは、数が合わないという形で出る
（口の答えは `GET /island-api/stickies/unanswered`。あやとだけ）。

## 何に使うか

- 札に出ている数が、本番の付箋と合っているかを**人が確かめる**とき
- 「見た」で片づける前に、**いま何枚あるか**を知りたいとき
- 溜まり具合（いちばん古いのが何日前か）を見るとき

## ログに出るもの

**件数と日数だけ。** このリポジトリは公開で、Actions のログも誰でも読める。
付箋の本文・名乗り・書類ID・uid・cid は1文字も出さない。

Actions から回したときは、**同じ数を `::notice::` でも出す。**
生のログは外の置き場から配られていて、手元の道具では読めないことがある
（`gh` が別ホストへの転送を追わない）。注記は run に残るので、
**押した人も、あとから数えに来た人も、同じ数を読める。**
"""

import os
import time

from _fs import args, db, log


def notice(line: str) -> None:
    """Actions の run に残す注記。**数と日数しか渡さない。**"""
    log.info("%s", line)
    if os.getenv("GITHUB_ACTIONS") == "true":
        print(f"::notice::{line}", flush=True)


# 口と同じ蓋（`islandApi.ts` の `NOTES_SCAN_CAP`）。当たったら数が小さく出る
SCAN_CAP = 3000


def main() -> None:
    a = args()
    client = db()

    # 誰があやとか。**uid を打ち込まない**（`islandUsers/{uid}.admin` が正本で、
    # 口の `ownerUid()` が見ているのと同じ1か所）
    owners = {
        d.id for d in client.collection("islandUsers").where("admin", "==", True).stream()
    }
    if not owners:
        log.error("admin の立っている islandUsers が1人もいない。数えずに止めます")
        raise SystemExit(2)

    rows = list(client.collection("islandNotes").limit(SCAN_CAP + 1).stream())
    if len(rows) > SCAN_CAP:
        log.error("蓋(%d枚)に当たりました。数が小さく出ています", SCAN_CAP)
        raise SystemExit(2)

    now = time.time() * 1000
    # 数えないもの6種。**1種ずつ数える**——どれが効いているかが見えないと、
    # 「0件」が「外し忘れ」なのか「本当に無い」のか読めない
    out = {
        "ぜんぶ": 0,
        "企画あて(旧)": 0,
        "しまった": 0,
        "隠した": 0,
        "立て札(byOwner)": 0,
        "あやと自身": 0,
        "返事ずみ": 0,
        "見たことにした": 0,
        "まだ返していない": 0,
    }
    oldest = None
    for d in rows:
        v = d.to_dict() or {}
        out["ぜんぶ"] += 1
        if not v.get("theme"):
            out["企画あて(旧)"] += 1
            continue
        if v.get("hidden") is True:
            out["隠した"] += 1
            continue
        if v.get("archived") is True:
            out["しまった"] += 1
            continue
        if v.get("byOwner") is True:
            out["立て札(byOwner)"] += 1
            continue
        if v.get("uid") in owners:
            out["あやと自身"] += 1
            continue
        if str(v.get("reply") or "").strip():
            out["返事ずみ"] += 1
            continue
        if v.get("seen") is True:
            out["見たことにした"] += 1
            continue
        out["まだ返していない"] += 1
        at = v.get("createdAt")
        if isinstance(at, (int, float)) and (oldest is None or at < oldest):
            oldest = at

    notice(" / ".join(f"{k} {n}" for k, n in out.items()))
    if oldest:
        notice(f"まだ返していない1枚でいちばん古いのは {(now - oldest) / 86400000:.0f} 日前")
    if a.get("quiet") is not True:
        log.info(
            "口の答えと突き合わせる: GET /island-api/stickies/unanswered?n=1（あやとだけ）",
        )


if __name__ == "__main__":
    main()
