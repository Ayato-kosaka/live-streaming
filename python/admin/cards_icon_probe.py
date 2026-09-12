"""あやと島カードに絵が乗らない件。**つなぎ先が在るかだけを測る。読むだけ。**

ARGS: なし（`{}`）

## なぜ要るか

`functions/src/cards.ts` は `icon` を **null と直接書いている**。
#202 / #204 の作り替えで、絵を引くところごと消えたまま、新しい
キャラクターの名簿（`islandCharacter`・#284）につなぎ直していない。

つなぎ直す先として、`islandCharacter` の書類には `channelId` という欄が
**形だけ在る**（`shapeFull` が返している）。**ただし、それを書いている
ところがリポジトリのどこにも無い。** 口（`POST /characters`）も、移行の
道具（`characters_migrate.py`）も、この欄を書かない。

**つなぎ先が空なら、`cards.ts` を直しても絵は1枚も増えない。**
だから先に測る。ついでに、**空だったときに使える道が在るか**も同じ1回で
測る。3回流さないため。

| 道 | 何から引くか | 索引 |
| --- | --- | --- |
| ア | `islandCharacter.channelId` が、そのままカードの `channelId` | 要らない |
| イ | `islandChannels/{cid}.name` → `channelKeys`（スパチャと同じ引き方） | 単一 |
| ウ | 同じ名前 → `lookupKeys`（Doneru と同じ引き方） | 単一 |
| エ | `python/residents_map.json`（手の表・22人）の書類IDが在るか | — |

**どれも `array-contains` か書類IDの1発で、複合索引は要らない**（#168）。

## 出さないもの

**このリポジトリは公開で、Actions のログも誰でも読める。**
出すのは**人数・枚数と、当たったかどうかだけ。**
チャンネルID・名前・呼び名・キャラクターの書類IDは1文字も出さない
（`python/admin/doneru_viewers.py` の冒頭と `docs/island-db.md` の決め）。

日付は出す。カードの日は `/cards` にもう出ているので、隠すものではない。
"""

import json
import os
import re
import unicodedata
from collections import Counter

from _fs import args, db, log

#: 手で持っている絵とチャンネルの対応表（22人）。画面（`residents.ts`）が
#: いま使っている唯一の対応で、**サーバーは持っていない。**
RESIDENTS_MAP = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "residents_map.json",
)

#: 目に見えない文字と異体字セレクタ。`functions/src/islandCharacter.ts` の
#: `normKey` と `characters_migrate.py` の `norm` と**同じ決まり**。
#: 片方だけ変えると、配信中のアラートだけが人違いを始める。
INVISIBLE = re.compile("[​-‍﻿⁠᠎­͏؜︎️]")


def norm(s) -> str:
    """名前を引く形にそろえる（`normKey` と同じ）。"""
    s = unicodedata.normalize("NFKC", str(s or ""))
    s = INVISIBLE.sub("", s)
    return re.sub(r"\s+", " ", s.strip()).lower()


def main() -> None:
    args()  # 入力は取らない。取り違えて書く口ではないことを形で示す
    c = db()

    # ---- 1. キャラクターの名簿。**つなぎ先の欄が埋まっているか** ----
    ids = set()
    by_channel_id = {}
    by_channel_key = {}
    by_lookup_key = {}
    n_chars = n_name = n_ck = n_lk = 0
    for d in c.collection("islandCharacter").limit(500).stream():
        v = d.to_dict() or {}
        ids.add(d.id)
        n_chars += 1
        cid = v.get("channelId")
        if isinstance(cid, str) and cid:
            by_channel_id[cid] = d.id
        if v.get("channelName"):
            n_name += 1
        ck = v.get("channelKeys") or []
        lk = v.get("lookupKeys") or []
        n_ck += 1 if ck else 0
        n_lk += 1 if lk else 0
        for k in ck:
            by_channel_key.setdefault(k, d.id)
        for k in lk:
            by_lookup_key.setdefault(k, d.id)
    log.info("キャラクター %d人", n_chars)
    log.info("  ア channelId が入っている人 … %d人", len(by_channel_id))
    log.info("  イ channelKeys がある人（チャンネル名から引ける） … %d人", n_ck)
    log.info("  ウ lookupKeys がある人（呼び名からも引ける） … %d人", n_lk)
    log.info("  （チャンネル名が入っている人 %d人）", n_name)

    # ---- 2. 手の表（22人）が、名簿にちゃんと居るか ----
    with open(RESIDENTS_MAP, encoding="utf-8") as f:
        hand = json.load(f)
    hand_ok = sum(1 for icon in hand if icon in ids)
    log.info("エ 手の表 %d人 のうち、名簿に居る %d人", len(hand), hand_ok)
    by_hand = {cid: icon for icon, cid in hand.items() if icon in ids}

    # ---- 3. 配られたカード。**どの道で何枚当たるか** ----
    cards = list(c.collection("islandCards").limit(600).stream())
    rows = []
    for d in cards:
        v = d.to_dict() or {}
        cid = v.get("channelId")
        rows.append({"day": str(v.get("day") or "?"),
                     "cid": cid if isinstance(cid, str) else ""})
    log.info("カード %d枚（channelId が入っているもの %d枚）",
             len(rows), sum(1 for r in rows if r["cid"]))

    # チャンネルの名前は、書類IDで1発（`islandChannels/{channelId}`）。
    # **カードの枚数ぶん引かない。** 同じ人が何枚も持っているので、
    # 重複を落としてから `get_all` で1往復にする。
    cids = sorted({r["cid"] for r in rows if r["cid"]})
    name_of = {}
    if cids:
        refs = [c.collection("islandChannels").document(x) for x in cids]
        for d in c.get_all(refs):
            if d.exists:
                name_of[d.id] = str((d.to_dict() or {}).get("name") or "")
    log.info("  そのうち islandChannels に名前が在る人 … %d人 / %d人",
             sum(1 for x in cids if name_of.get(x)), len(cids))

    def hit(cid: str) -> dict:
        """1枚ぶん、4つの道それぞれで当たるか。**当たった書類IDは返さない。**"""
        k = norm(name_of.get(cid, ""))
        # `keysOf` は「@ を落としたもの」も鍵に入れてある。引く側は
        # 打たれた名前をそのまま norm するだけでよい（口と同じ形）。
        k2 = norm(name_of.get(cid, "").lstrip("@"))
        return {
            "ア": cid in by_channel_id,
            "イ": bool(k and (k in by_channel_key or k2 in by_channel_key)),
            "ウ": bool(k and (k in by_lookup_key or k2 in by_lookup_key)),
            "エ": cid in by_hand,
        }

    ways = ("ア", "イ", "ウ", "エ")
    per_day = {}
    total = Counter()
    for r in rows:
        h = hit(r["cid"]) if r["cid"] else {w: False for w in ways}
        d = per_day.setdefault(r["day"], Counter())
        d["枚"] += 1
        for w in ways:
            if h[w]:
                d[w] += 1
                total[w] += 1
        # どれか1つでも当たれば、絵は出せる
        if any(h.values()):
            d["どれか"] += 1
            total["どれか"] += 1

    for day in sorted(per_day, reverse=True):
        d = per_day[day]
        log.info("%s  カード %d枚 … ア %d / イ %d / ウ %d / エ %d / どれか %d",
                 day, d["枚"], d["ア"], d["イ"], d["ウ"], d["エ"], d["どれか"])
    log.info("ぜんぶで %d枚 … ア %d / イ %d / ウ %d / エ %d / どれか %d",
             len(rows), total["ア"], total["イ"], total["ウ"], total["エ"],
             total["どれか"])

    if not total["どれか"]:
        log.warning("どの道でも1枚も当たらない。**cards.ts を直しても絵は出ない。**")
    log.info("読むだけで終わりました（1バイトも書いていません）")


if __name__ == "__main__":
    main()
