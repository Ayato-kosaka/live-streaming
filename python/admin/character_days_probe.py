"""図鑑の札に「いっしょにいた日数」を出せる人が何人いるかを数える。

ARGS: なし（`{}`）。**読むだけ。1バイトも書かない。**

## なぜ要るか

`/friends` の札は、数が分からない人には欄を出さない（#115）。本番102人のうち
**50人が欄なし**で、内訳は「`channelId` は結べているが `/state` の上位60人に
入らない 32人」と「そもそも結べていない 18人」だった。

前者は口の都合で消えているだけなので、口を直せば数が出る。**直す前に、
本当に数があるのかを数える。** 無いなら直しても1人も増えない。

ここが出すのは、口を直す前と後で**札に数が出る人が何人になるか**。

## 引き方は `functions/src/cards.ts` の `characterBook` と同じ

`islandCharacter.channelId` → `islandChannels.days`。
**同じ `channelId` が2人に付いていたら、どちらも使わない。**
どちらの人の日数か決められないものを、当てずっぽうに片方へ出さない。

**名乗りでは引かない。** カードの絵は名乗りを受け皿に使っているが、
あちらは「この名乗りの人は誰か」を引くのに対して、こちらは
「このキャラクターの人はどのチャンネルか」を引く向きで、
名簿の側から名乗りへは戻れない（戻るには辞書 2,251人を総なめする）。
名乗りでしか結べていない人は、焼き込み（`site/content/residents.ts`）の
受け皿がそのまま残る。

## 対照（`docs/island-standards.md` 15）

**数えるものが1件も無いのに「0人」と答えるのがいちばん危ない。**
`select` の渡し方ひとつで名簿が空のまま通る（`characters_freeze.py` が
本番で2回外した）。

対照は**焼き込みの `site/content/residents.ts`**。あれは
`python/build_residents.py` が同じ順（`channelId` が先）で結んだ結果なので、
ここで結べた人とは**同じチャンネルを指すはず**。1件でも食い違ったら、
数字を出さずに終了コード 2 で落ちる。

## 出さないもの

このリポジトリは公開で、Actions のログも誰でも読める。
**チャンネルIDも名前も書類IDも出さない。** 出すのは人数と、指紋だけ。
"""

import re
import sys

from _fs import ReadOnly, args, db, log, readonly

sys.path.insert(0, __file__.rsplit("/", 2)[0])

from logsafe import mask  # noqa: E402

CHARACTERS = "islandCharacter"
CHANNELS = "islandChannels"

# Functions 側の MAX_CHARACTERS と同じ
MAX_CHARACTERS = 500
# `characters_freeze.py` と同じ上限
MAX_CHANNELS = 10000

# 前の口が返していた件数（`orderBy("days","desc").limit(60)`）
OLD_LIMIT = 60

# 対照が最低これだけ一致しないと、何も見ていないと判断する。
# 焼き込みは 84人ぶん結んであって、うち `channelId` 由来が大半。
CONTROL_MIN = 60

ROOT = __file__.rsplit("/", 3)[0]
RESIDENTS_TS = ROOT + "/site/content/residents.ts"

# `{ icon: "...", emoji: "...", days: 12, score: 0.5, channel: "UC..." },`
ROW = re.compile(
    r'\{\s*icon:\s*"([^"]+)"'
    r'(?:,\s*emoji:\s*"[^"]*")?'
    r",\s*days:\s*(\d+)"
    r",\s*score:\s*[\d.]+"
    r'(?:,\s*channel:\s*"([^"]+)")?\s*\}'
)


def baked() -> dict:
    """焼き込みの名簿。書類ID -> (直近90日の日数, 結べたチャンネル or None)。

    Returns:
        書類ID -> `(days, channel)`
    """
    with open(RESIDENTS_TS, encoding="utf-8") as f:
        src = f.read()
    return {m[0]: (int(m[1]), m[2] or None) for m in ROW.findall(src)}


def main() -> None:
    """エントリポイント。"""
    args()
    client = readonly(db())

    # 1. 名簿。**`channelId` が2人に付いていたら、どちらも使わない**
    #    （`cards.ts` の `characterBook` と同じ決め方）
    chars = 0
    owners: dict = {}
    for d in client.collection(CHARACTERS).limit(MAX_CHARACTERS).get():
        chars += 1
        cid = (d.to_dict() or {}).get("channelId")
        if isinstance(cid, str) and cid.strip():
            owners.setdefault(cid.strip(), set()).add(d.id)
    twice = {c for c, ids in owners.items() if len(ids) > 1}
    by_channel = {
        c: next(iter(ids)) for c, ids in owners.items() if c not in twice
    }
    # 書類ID -> チャンネル。対照と札の数えで向きを逆に引く
    chan_of = {i: c for c, i in by_channel.items()}

    # 2. 辞書。**`days` だけ貰う。** 一覧で渡す（字で渡すと1件も返らない）
    days_of: dict = {}
    channels = 0
    for d in client.collection(CHANNELS).select(["days"]).limit(MAX_CHANNELS).get():
        channels += 1
        n = (d.to_dict() or {}).get("days")
        if isinstance(n, (int, float)) and n > 0:
            days_of[d.id] = int(n)

    # 3. 対照。焼き込みと同じチャンネルを指すか
    bake = baked()
    agree = 0
    clash = []
    for icon, (_, ch) in bake.items():
        mine = chan_of.get(icon)
        if ch and mine:
            if ch == mine:
                agree += 1
            else:
                clash.append(icon)

    log.info("見たもの: 名簿 %d人 / 辞書 %d人 / 焼き込み %d人",
             chars, channels, len(bake))
    if clash or agree < CONTROL_MIN:
        log.error(
            "対照が合いません（一致 %d件・食い違い %d件・最低 %d件）。"
            "数字は出しません",
            agree, len(clash), CONTROL_MIN,
        )
        for icon in clash[:10]:
            log.error("  食い違い: %s", mask(icon))
        sys.exit(2)
    log.info("対照: 焼き込みと同じチャンネルを指したのが %d人・食い違い 0件", agree)

    # 4. 前の口が返していたもの（上位60人）
    top = sorted(days_of.items(), key=lambda kv: -kv[1])[:OLD_LIMIT]
    top_set = {c for c, _ in top}
    log.info("前の口が返していた件数: %d件（いちばん少ない人で %d日）",
             len(top), top[-1][1] if top else 0)

    # 5. 新しい口が返すもの（図鑑の人ぶん）
    new_map = {i: days_of[c] for c, i in by_channel.items() if c in days_of}
    log.info("新しい口が返す件数: %d件", len(new_map))

    # 6. 札に数が出る人。**焼き込みの受け皿も入れる**（画面と同じ式）
    before = after = 0
    gain = 0
    no_link = 0
    linked_no_days = 0
    for icon, (bdays, ch) in bake.items():
        if not ch:
            no_link += 1
        had = (ch in top_set if ch else False) or bdays > 0
        now = icon in new_map or bdays > 0
        before += 1 if had else 0
        after += 1 if now else 0
        if not had and now:
            gain += 1
        if ch and not now:
            linked_no_days += 1

    log.info("札に数が出る人: %d人 → %d人（増える %d人）", before, after, gain)
    log.info("  チャンネルが結べていない（欄なしのまま）: %d人", no_link)
    log.info("  結べているのに数が無い（欄なしのまま）: %d人", linked_no_days)
    log.info("名簿の `channelId` が2人に付いていて外したの: %d件", len(twice))


if __name__ == "__main__":
    try:
        main()
    except ReadOnly as e:
        log.error("書きに行きました: %s", e)
        sys.exit(1)
