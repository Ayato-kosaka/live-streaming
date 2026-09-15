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

## 対照を、道具の中に入れてある

**1回目は「機械で固められる 0人」と答えて、外していた。**
`iconsOf` は保存済みの `channelKeys` で引いているのに、こちらは
`channelName` と `aliases` から**その場で組み直して**いたため。
組み直したものが保存済みと違えば、当然どこにも当たらない。

数えるものが1つも見つからないのが「本当に0」なのか「見ていない」のかは、
**当たるはずのものに当ててみないと分からない**（`island-standards.md` 15）。
`CONTROL` に、本番の `/nordic/photos` が実際に絵を返している書類IDを
置いてある。**この15人が当たらなければ、数字を出さずに落ちる。**

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
from alertbox_names import norm_key  # noqa: E402

# **対照。** 本番の `GET /nordic/photos` が実際に絵を返している書類ID
# （2026-09-15 実測。絵が引けている＝`iconsOf` が当てられている人）。
# ここが当たらなければ、この道具は何も見ていない
CONTROL = [
    "02e7cc3109ef45e2bc56aaf7f520ef7c0", "0c8468a6411842cdb144f70eefee5b7b0",
    "18okO58dwMaci-9R1go0Rj1dTqliSWlz3", "1NLsB-D-jeUxQ3viqwhJu2GkRRXsYXAaQ",
    "1XUYZEts8lz9SFqQmKuBd4G8KMRfBmPL-", "1b0Xiz4G4ITGoNeTsNFkzUTXO_xNQd-LU",
    "1ekFUI08fLxau-_-f3YOlizDLLYpYi21x", "1kzs_Lm8VmHXkfcW3_7LfssXu2P6sDA47",
    "1qWjhGcv3Y--7hTEnrzOZk_rzud3qdzqb", "1qXh-o-wpSd_lHP6CjiUgsW56QDK9TbDp",
    "1wQzpWPNZKnty7DIiEkrSyib145QIWy4K", "1y17p0D56itwNXWWEzo94jF4ThNETczQg",
    "5cc99a90acad4e7997d92b27c5207c6c0", "c3cca678865a4021a048e617fab35db30",
    "f203e9529b7941c89940a568e03b83b00",
]


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
        # **保存済みの `channelKeys` で引く。** `iconsOf` がそうしている。
        # `channelName` から組み直すと、移行のときに入った鍵を見落として
        # 「どこにも当たらない」と答える（1回目がそれだった）。
        hit = set()
        for k in (v.get("channelKeys") or []):
            if isinstance(k, str):
                hit |= owners.get(norm_key(k), set())
        if len(hit) == 1:
            freezable.append(d.id)
        elif len(hit) > 1:
            ambiguous.append(d.id)
        else:
            orphan.append(d.id)

    # **対照を先に読む。** ここが割れていたら、下の数字は何も意味しない
    seen = set(freezable) | set(ambiguous)
    miss = [w for w in CONTROL if w in orphan]
    if miss:
        log.error(
            "**対照が %d/%d 当たらない。この道具は何も見ていない。**"
            " 本番で絵が引けている人を、ここは「どこにも当たらない」と答えた",
            len(miss), len(CONTROL),
        )
        for w in miss[:5]:
            log.error("  当たらなかった対照: %s", mask(w))
        raise SystemExit(2)
    log.info("対照 %d 人、ぜんぶ当たった（数えたものは見えている）",
             len([w for w in CONTROL if w in seen or w not in orphan]))
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
