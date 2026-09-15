"""キャラクターの表を**チャンネルIDで固められるか**、人数だけ数える。

ARGS: なし（`{}`）。**読むだけ。1バイトも書かない。**

## なぜ要るか

あやとの決めごと（`docs/island-db.md` 2章ほか3か所）:

> キャラクターの割り当てはあやとが決めたもので、**YouTube を更新しても
> 変わらないのが正しい。**

ところが `functions/src/cards.ts` の `iconsOf` は、
**チャンネルID → いま名乗っている表示名 → キャラクター**と引いている。
本来は `islandCharacter.channelId` で直に引くべきだが、そこが埋まっていない。

埋めれば名前を見なくなって、あやとの決めごとに戻る。**ただし
「名前を書き換えてキャラクターを付け替える」使い方をしていると、
固めた瞬間にその手が使えなくなる。** だから決めるのはあやと。

**その判断に要るのは「何人ぶんの話か」。** ここはそれだけを数える。

- 既に `channelId` を持っている人（固める必要が無い）
- 持っていないが、**いまの名前がちょうど1つのチャンネルに当たる**人
  （機械で固められる）
- 2つ以上に当たる／1つも当たらない人（**あやとが決めるしかない**）

## 出さないもの

このリポジトリは公開で、Actions のログも誰でも読める。
**名前も呼び名も1文字も出さない。** 出すのは人数と、書類IDの指紋だけ。
"""

import sys

from _fs import args, db, log, readonly

sys.path.insert(0, __file__.rsplit("/", 2)[0])

from logsafe import mask  # noqa: E402

CHARACTERS = "islandCharacter"
CHANNELS = "islandChannels"

# Functions 側の MAX_CHARACTERS と同じ
MAX_CHARACTERS = 500
# `iconsOf` の `sharedNames` と同じ上限
MAX_CHANNELS = 10000

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from alertbox_names import keys_of, norm_key  # noqa: E402


def main() -> None:
    args()
    client = readonly(db())

    # 鍵 → そう名乗っているチャンネルの数（`sharedNames` と同じ数え方）
    owners: dict = {}
    ch_total = 0
    for d in client.collection(CHANNELS).select("name").limit(MAX_CHANNELS).get():
        ch_total += 1
        name = norm_key((d.to_dict() or {}).get("name"))
        if not name:
            continue
        owners.setdefault(name, set()).add(d.id)

    have = 0          # 既に channelId を持っている
    freezable = []    # 名前がちょうど1つのチャンネルに当たる
    ambiguous = []    # 2つ以上に当たる
    orphan = []       # 1つも当たらない
    total = 0

    for d in client.collection(CHARACTERS).limit(MAX_CHARACTERS).get():
        total += 1
        v = d.to_dict() or {}
        if isinstance(v.get("channelId"), str) and v["channelId"]:
            have += 1
            continue
        raw = [v.get("channelName") or ""] + list(v.get("aliases") or [])
        hit = set()
        for k in keys_of([x for x in raw if isinstance(x, str) and x]):
            hit |= owners.get(k, set())
        if len(hit) == 1:
            freezable.append(d.id)
        elif len(hit) > 1:
            ambiguous.append(d.id)
        else:
            orphan.append(d.id)

    log.info("チャンネル %d 件を見た（上限 %d）", ch_total, MAX_CHANNELS)
    log.info("キャラクター %d 人", total)
    log.info("  既に channelId を持っている: %d 人", have)
    log.info("  **機械で固められる**（名前がちょうど1つに当たる）: %d 人",
             len(freezable))
    log.info("  2つ以上に当たる（あやとが決めるしかない）: %d 人", len(ambiguous))
    log.info("  1つも当たらない（そのチャンネルが名簿に無い）: %d 人", len(orphan))
    for who in ambiguous[:20]:
        log.info("    2つ以上に当たる: %s", mask(who))
    if ch_total >= MAX_CHANNELS:
        log.info("**上限で切れている。この数字は当てにしない**")


if __name__ == "__main__":
    main()
