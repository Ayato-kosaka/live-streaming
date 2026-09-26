"""月末配信の投げ銭ランキングを組む。**外に出ない。数えるだけ。**

BigQuery も Firestore も触らない。行を渡されて、名寄せして、
`fund_box.viewer_yen()` で貢献額にして、順位を付けて返すだけ。
本番の値を作るのは `python/admin/monthly_tips_run.py`。

## ランキングに出る額は「貢献額」

あやとの言葉（2026-09-26）:

> ランキングの仕様 = 豚の貯金箱の仕様 = いくら配信の企画や
> 私の夢への応援に貢献してくれたか。……で、今回の投げ銭目標は
> 「北欧周りたい」で、ランキングの表彰はそれに貢献してくれた人を
> 表彰します。なので当然スパチャは÷２です。
> **実額は視聴者には一切見せない仕様整理です。**

だから式は `fund_box.viewer_yen()` ひとつ。**ここで割り算を書かない。**
2026-09 の授賞式は実額のまま出して、1位が入れ替わっていた
（`docs/island-misses.md` #191）。

## 名寄せは図鑑（islandCharacter）が正

**名前の似ている度合いでは当てない。** 当てるのは2つだけ。

| 出どころ | 引く鍵 | 当てる欄 |
| --- | --- | --- |
| スパチャ | `author_channel_id` | `islandCharacter.channelId` |
| Doneru | 名乗り（`normKey` 済み） | `islandCharacter.lookupKeys` |

Doneru 側が `lookupKeys` なのは、**アラートボックスと配信中のカードが
同じ欄で引いているから**（`functions/src/cards.ts` の `iconsOf`、
`islandCharacter.ts` の `findBy`）。あだ名を図鑑に入れた人は、
そこで同じキャラクターに落ちる。別の突き合わせ方をここだけ自作すると、
**画面に出ている絵と、ランキングの並びが食い違う。**
2026-09 は自作して、「ひー」が @スカイライン と1人にならなかった。

**ちょうど1人に当たったときだけ寄せる。** 0人でも2人以上でも寄せない
（`findBy` の `limit(2)` と同じ決め方）。呼び名は誰でも同じにできるので、
当てずっぽうで1人選ぶと**別人が公開の面で表彰される。**

寄らなかった人は消さない。**その人ひとりで1行**として残す
（あやと 2026-09-25「名前で突合して合わないなら無視で良い」——
無視するのは突き合わせであって、出してくれた人ではない）。
"""

import os
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fund_box import viewer_yen  # noqa: E402

# 見えない字と異体字セレクタ。**口の `normKey` の写し**
# （`functions/src/islandCharacter.ts`）。向こうを直したらこちらも直す。
_INVISIBLE = "".join(chr(c) for c in (
    0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0x2060, 0xFEFF,
))
_VARIATION = "".join(chr(c) for c in range(0xFE00, 0xFE10))


def norm_key(v) -> str:
    """引くための鍵の形に直す。**口の `normKey` と同じ順番で。**

    NFKC → 異体字を落とす → 見えない字を落とす → 前後の空白を落とす
    → 続く空白を1つに → 小文字。

    **空白は残す**（潰さない）。潰しているのは OBS の Collator だけで、
    Doneru が通る道には無い（`functions/src/islandCharacter.ts` の
    `channel_alias` の項）。

    Args:
        v: 打たれた名前

    Returns:
        鍵。空なら空文字
    """
    if not isinstance(v, str):
        return ""
    s = unicodedata.normalize("NFKC", v)
    for ch in _VARIATION + _INVISIBLE:
        s = s.replace(ch, "")
    return " ".join(s.split()).lower()


class Roster:
    """図鑑（`islandCharacter`）の写し。**引くだけ。**

    `channelId` と `lookupKeys` の2つの引き方を持つ。どちらも
    **ちょうど1人のときしか答えない**（`findBy` の `limit(2)` と同じ）。
    """

    def __init__(self, chars):
        """図鑑の書類から引き表を作る。

        Args:
            chars: `{"id", "channelId", "channelName", "lookupKeys"}` の並び
        """
        self.by_id = {}
        self._ch = {}       # channelId -> [id, …]
        self._key = {}      # lookupKeys の鍵 -> [id, …]
        for c in chars:
            cid = str(c.get("id") or "")
            if not cid:
                continue
            self.by_id[cid] = c
            ch = str(c.get("channelId") or "")
            if ch:
                self._ch.setdefault(ch, []).append(cid)
            for k in (c.get("lookupKeys") or []):
                if isinstance(k, str) and k:
                    self._key.setdefault(k, []).append(cid)

    def by_channel(self, channel_id):
        """チャンネルIDで引く。ちょうど1人のときだけ返す。"""
        got = self._ch.get(str(channel_id or ""), [])
        return got[0] if len(got) == 1 else None

    def by_alias(self, name):
        """名乗りで引く。**`lookupKeys` に完全一致。** 1人のときだけ返す。"""
        k = norm_key(name)
        if not k:
            return None
        got = self._key.get(k, [])
        return got[0] if len(got) == 1 else None


def merge(superchats, doneru, roster):
    """スパチャと Doneru を、同じ人ごとに1行へまとめる。

    Args:
        superchats: `{"channelId", "handle", "yen"}` の並び
        doneru: `{"name", "yen"}` の並び（どねIDは見ない。名前で引く）
        roster: `Roster`

    Returns:
        `{"char", "handle", "display", "sc", "dn"}` の並び（順位はまだ無い）
    """
    rows = {}

    def slot(key, handle, display, char):
        r = rows.get(key)
        if r is None:
            r = rows[key] = {
                "char": char, "handle": handle, "display": display,
                "sc": 0, "dn": 0,
            }
        # 図鑑に当たった行が後から来たら、そちらの名前とキャラクターを採る
        if char and not r["char"]:
            r["char"], r["display"] = char, display
        if handle and not r["handle"]:
            r["handle"] = handle
        return r

    for s in superchats:
        handle = str(s.get("handle") or "")
        char = roster.by_channel(s.get("channelId"))
        key = ("c", char) if char else ("s", str(s.get("channelId") or handle))
        name = (roster.by_id.get(char, {}).get("channelName") or handle
                if char else handle)
        slot(key, handle, name, char)["sc"] += int(s.get("yen") or 0)

    for d in doneru:
        name = str(d.get("name") or "")
        char = roster.by_alias(name)
        # 当たらなければ、その人ひとりで1行。**別の当て方に逃げない**
        key = ("c", char) if char else ("d", norm_key(name) or name)
        shown = roster.by_id.get(char, {}).get("channelName") or name
        slot(key, "", shown, char)["dn"] += int(d.get("yen") or 0)

    return list(rows.values())


def rank(rows):
    """貢献額を出して、多い順に並べて、同額は同じ順位にする。

    **額は `fund_box.viewer_yen()` を通す。** ここで割り算をしない。

    Args:
        rows: `merge()` が返した並び

    Returns:
        `yen` と `rank` の付いた並び（貢献額 0 の人は落とす）
    """
    out = []
    for r in rows:
        yen = viewer_yen(int(r["sc"]), int(r["dn"]))
        if yen <= 0:
            continue
        out.append({**r, "yen": yen})
    # 同額の中の並びは名前で決める。**実行するたびに入れ替わらないように**
    out.sort(key=lambda r: (-r["yen"], r["display"]))
    for i, r in enumerate(out):
        r["rank"] = out[i - 1]["rank"] if i and out[i - 1]["yen"] == r["yen"] \
            else i + 1
    return out


def total(rows) -> int:
    """画面に出す合計。**貢献額の足し算。実額の合計ではない。**"""
    return sum(int(r["yen"]) for r in rows)
